-- Issue #21. Explicit transaction for runners that execute statements individually.
-- Never use db reset on a hosted project.
-- No financial rows or original accounts are removed. Shared accounts get one copy
-- per evidenced owner. Unreferenced originals remain NULL-owned and hidden from browsers.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.accounts, public.transactions, public.transaction_staging IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE security_preserve_transactions ON COMMIT DROP AS SELECT to_jsonb(t) - 'account_id' AS row FROM public.transactions t;
CREATE TEMP TABLE security_preserve_staging ON COMMIT DROP AS SELECT to_jsonb(s) - 'account_id' - 'transfer_to_account_id' AS row FROM public.transaction_staging s;
CREATE TEMP TABLE security_preserve_accounts ON COMMIT DROP AS SELECT to_jsonb(a) AS row FROM public.accounts a;

ALTER TABLE public.accounts ADD COLUMN user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid();
-- ADD COLUMN's default must not assign historical accounts to the migration caller.
UPDATE public.accounts SET user_id = NULL;
ALTER TABLE public.accounts DROP CONSTRAINT accounts_name_key;
CREATE UNIQUE INDEX accounts_owner_name_key ON public.accounts (user_id, name);

CREATE TEMP TABLE account_owner_map ON COMMIT DROP AS
WITH references_by_owner AS (
  SELECT account_id, user_id FROM public.transactions WHERE account_id IS NOT NULL AND user_id IS NOT NULL
  UNION
  SELECT account_id, user_id FROM public.transaction_staging WHERE account_id IS NOT NULL AND user_id IS NOT NULL
  UNION
  SELECT transfer_to_account_id, user_id FROM public.transaction_staging
    WHERE transfer_to_account_id IS NOT NULL AND user_id IS NOT NULL
), owners AS (
  SELECT *, count(*) OVER (PARTITION BY account_id) AS owner_count FROM references_by_owner
)
SELECT account_id AS original_id, user_id,
       CASE WHEN owner_count = 1 THEN account_id ELSE gen_random_uuid() END AS owned_id
FROM owners;

UPDATE public.accounts a SET user_id = m.user_id
FROM account_owner_map m WHERE a.id = m.original_id AND m.owned_id = m.original_id;
INSERT INTO public.accounts (id, name, currency, created_at, user_id)
SELECT m.owned_id, a.name, a.currency, a.created_at, m.user_id
FROM account_owner_map m JOIN public.accounts a ON a.id = m.original_id
WHERE m.owned_id <> m.original_id;
UPDATE public.transactions t SET account_id = m.owned_id
FROM account_owner_map m
WHERE t.account_id = m.original_id AND t.user_id = m.user_id AND t.account_id <> m.owned_id;
-- Change both staging endpoints together so the source/destination CHECK stays valid.
UPDATE public.transaction_staging s SET
  account_id = coalesce((SELECT owned_id FROM account_owner_map WHERE original_id = s.account_id AND user_id = s.user_id), s.account_id),
  transfer_to_account_id = coalesce((SELECT owned_id FROM account_owner_map WHERE original_id = s.transfer_to_account_id AND user_id = s.user_id), s.transfer_to_account_id)
WHERE EXISTS (SELECT 1 FROM account_owner_map m WHERE m.user_id = s.user_id
  AND (m.original_id = s.account_id OR m.original_id = s.transfer_to_account_id) AND m.original_id <> m.owned_id);

-- Abort the entire migration if any trigger or schema drift changed financial
-- fields, removed an original row, or altered original account details.
DO $$
BEGIN
  IF EXISTS (SELECT row FROM security_preserve_transactions EXCEPT ALL SELECT to_jsonb(t) - 'account_id' FROM public.transactions t)
     OR EXISTS (SELECT to_jsonb(t) - 'account_id' FROM public.transactions t EXCEPT ALL SELECT row FROM security_preserve_transactions)
     OR EXISTS (SELECT row FROM security_preserve_staging EXCEPT ALL SELECT to_jsonb(s) - 'account_id' - 'transfer_to_account_id' FROM public.transaction_staging s)
     OR EXISTS (SELECT to_jsonb(s) - 'account_id' - 'transfer_to_account_id' FROM public.transaction_staging s EXCEPT ALL SELECT row FROM security_preserve_staging)
     OR EXISTS (SELECT row FROM security_preserve_accounts EXCEPT ALL SELECT to_jsonb(a) - 'user_id' FROM public.accounts a) THEN
    RAISE EXCEPTION 'Preservation check failed; roll back and investigate schema drift';
  END IF;
END;
$$;

-- Flush deferred transfer-pair events before changing table constraints.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

-- Composite foreign keys enforce ownership for browser, RPC and service-role writes,
-- including changes to account owners. NULL-owner staging records remain preserved.
ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_owner_key UNIQUE (id, user_id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_account_owner_fkey
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id);
ALTER TABLE public.transaction_staging ADD CONSTRAINT staging_account_owner_fkey
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id),
  ADD CONSTRAINT staging_transfer_account_owner_fkey
  FOREIGN KEY (transfer_to_account_id, user_id) REFERENCES public.accounts(id, user_id);

CREATE FUNCTION public.require_account_owner() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Account owner required' USING ERRCODE = 'not_null_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_require_owner BEFORE INSERT OR UPDATE OF user_id ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.require_account_owner();

DROP POLICY accounts_add_shared ON public.accounts;
DROP POLICY accounts_delete_shared ON public.accounts;
DROP POLICY accounts_read_shared ON public.accounts;
CREATE POLICY accounts_read_own ON public.accounts FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY accounts_add_own ON public.accounts FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY accounts_delete_own ON public.accounts FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.accounts TO authenticated;

-- Remove the baseline's future browser grants, including PostgreSQL's built-in
-- PUBLIC EXECUTE default (which cannot be removed by a per-schema revoke).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_account_owner() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transfers_create(
  p_owner uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_currency text,
  p_occurred_at timestamptz,
  p_description text DEFAULT NULL,
  p_transfer_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_owner uuid := p_owner;
  v_id uuid := COALESCE(p_transfer_id, gen_random_uuid());
  v_description text := NULLIF(btrim(p_description), '');
  v_same boolean;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL OR p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'A transfer needs two different accounts' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Amount must be positive with at most two decimals' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Transfer date required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF char_length(v_description) > 500 THEN
    RAISE EXCEPTION 'Description is too long' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) FROM public.accounts
        WHERE id IN (p_from_account_id, p_to_account_id) AND currency = p_currency AND user_id = v_owner) <> 2 THEN
    RAISE EXCEPTION 'Both accounts must exist and use the transfer currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialise concurrent calls with the same key so a retry waits for the original.
  PERFORM pg_advisory_xact_lock(hashtextextended('transfer:' || v_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.transactions WHERE transfer_id = v_id) THEN
    SELECT count(*) = 2
       AND count(*) FILTER (WHERE type = 'transfer_out' AND account_id = p_from_account_id) = 1
       AND count(*) FILTER (WHERE type = 'transfer_in' AND account_id = p_to_account_id) = 1
       AND count(*) FILTER (WHERE user_id = v_owner AND amount = p_amount AND currency = p_currency
             AND occurred_at = p_occurred_at AND description IS NOT DISTINCT FROM v_description
             AND deleted_at IS NULL) = 2
      INTO v_same FROM public.transactions WHERE transfer_id = v_id;
    IF v_same THEN RETURN v_id; END IF;
    RAISE EXCEPTION 'Transfer id already used' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, description, occurred_at, transfer_id)
  VALUES
    (v_owner, p_from_account_id, NULL, 'transfer_out', p_amount, p_currency, v_description, p_occurred_at, v_id),
    (v_owner, p_to_account_id, NULL, 'transfer_in', p_amount, p_currency, v_description, p_occurred_at, v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_revise_staged_transaction(
  p_staging_id uuid, p_telegram_user_id bigint, p_action text,
  p_choice_id uuid DEFAULT NULL::uuid, p_page integer DEFAULT 0
) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  owner_id uuid;
  staged public.transaction_staging%ROWTYPE;
  choices jsonb := '[]'::jsonb;
  category_name text;
  account_name text;
  transfer_name text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('view', 'categories', 'accounts', 'category', 'account',
                                          'transfer_targets', 'transfer', 'clear_transfer') THEN
    RAISE EXCEPTION 'Invalid revision action';
  END IF;
  IF p_page IS NULL OR p_page < 0 OR p_page > 10000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
  SELECT supabase_user_id INTO owner_id FROM public.telegram_users
    WHERE telegram_user_id = p_telegram_user_id AND is_active = true FOR SHARE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Active Telegram link required'; END IF;
  -- Use the same row lock as confirmation so an edit cannot change a saved receipt.
  SELECT * INTO staged FROM public.transaction_staging
    WHERE id = p_staging_id AND user_id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction unavailable'; END IF;
  IF staged.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

  IF p_action = 'category' THEN
    PERFORM 1 FROM public.categories WHERE id = p_choice_id
      AND (user_id IS NULL OR user_id = owner_id)
      AND allowed_type::text IN ('both', staged.type) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Category unavailable for this transaction'; END IF;
    UPDATE public.transaction_staging SET category_id = p_choice_id
      WHERE id = staged.id RETURNING * INTO staged;
  ELSIF p_action = 'account' THEN
    PERFORM 1 FROM public.accounts WHERE id = p_choice_id AND user_id = owner_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
    IF p_choice_id = staged.transfer_to_account_id THEN
      RAISE EXCEPTION 'Choose a different account than the transfer destination';
    END IF;
    UPDATE public.transaction_staging SET account_id = p_choice_id
      WHERE id = staged.id RETURNING * INTO staged;
  ELSIF p_action IN ('transfer_targets', 'transfer') THEN
    IF staged.type <> 'outcome' OR staged.account_id IS NULL THEN
      RAISE EXCEPTION 'Only an outgoing receipt with a source account can be a transfer';
    END IF;
    IF p_action = 'transfer' THEN
      -- The destination must be another account in the receipt's currency.
      PERFORM 1 FROM public.accounts
        WHERE user_id = owner_id AND id = p_choice_id AND id <> staged.account_id AND currency = staged.currency FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable as a transfer destination'; END IF;
      UPDATE public.transaction_staging SET transfer_to_account_id = p_choice_id
        WHERE id = staged.id RETURNING * INTO staged;
    ELSE
      SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.name, a.id), '[]'::jsonb) INTO choices
      FROM (SELECT id, name FROM public.accounts
        WHERE user_id = owner_id AND id <> staged.account_id AND currency = staged.currency
        ORDER BY name, id LIMIT 9 OFFSET p_page * 8) a;
    END IF;
  ELSIF p_action = 'clear_transfer' THEN
    UPDATE public.transaction_staging SET transfer_to_account_id = NULL
      WHERE id = staged.id RETURNING * INTO staged;
  ELSIF p_action = 'categories' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.name, c.id), '[]'::jsonb) INTO choices
    FROM (SELECT id, name FROM public.categories
      WHERE (user_id IS NULL OR user_id = owner_id) AND allowed_type::text IN ('both', staged.type)
      ORDER BY name, id LIMIT 9 OFFSET p_page * 8) c;
  ELSIF p_action = 'accounts' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.name, a.id), '[]'::jsonb) INTO choices
    FROM (SELECT id, name FROM public.accounts WHERE user_id = owner_id ORDER BY name, id LIMIT 9 OFFSET p_page * 8) a;
  END IF;
  SELECT name INTO category_name FROM public.categories WHERE id = staged.category_id
    AND (user_id IS NULL OR user_id = owner_id);
  SELECT name INTO account_name FROM public.accounts WHERE id = staged.account_id AND user_id = owner_id;
  SELECT name INTO transfer_name FROM public.accounts WHERE id = staged.transfer_to_account_id AND user_id = owner_id;
  RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'categoryName', category_name,
    'accountName', account_name, 'transferAccountName', transfer_name,
    'choices', choices, 'page', p_page);
END;
$$;

CREATE OR REPLACE FUNCTION public.backend_process_staged_transaction(
  p_staging_id uuid, p_telegram_user_id bigint, p_action text
) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  owner_id uuid;
  staged public.transaction_staging%ROWTYPE;
  txn public.transactions%ROWTYPE;
  category_owner uuid;
  new_transfer_id uuid;
  account_name text;
  transfer_name text;
BEGIN
  IF p_action NOT IN ('confirm', 'reject') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT supabase_user_id INTO owner_id FROM public.telegram_users
    WHERE telegram_user_id = p_telegram_user_id AND is_active = true FOR SHARE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Active Telegram link required'; END IF;
  SELECT * INTO staged FROM public.transaction_staging
    WHERE id = p_staging_id AND user_id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction unavailable'; END IF;
  IF staged.status = 'confirmed' AND p_action = 'confirm' THEN
    SELECT * INTO txn FROM public.transactions
      WHERE id = (staged.metadata->>'transaction_id')::uuid AND user_id = owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Previously confirmed row requires reconciliation'; END IF;
    RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'txn', to_jsonb(txn),
      'transferId', staged.metadata->>'transfer_id');
  END IF;
  IF staged.status = 'rejected' AND p_action = 'reject' THEN
    RETURN jsonb_build_object('stagingData', to_jsonb(staged));
  END IF;
  IF staged.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;
  IF p_action = 'reject' THEN
    -- Releasing the destination keeps a rejected receipt from pinning an account (the browser cannot
    -- see staging rows, so it could not explain why that account can no longer be deleted).
    UPDATE public.transaction_staging SET status = 'rejected', rejected_at = now(), transfer_to_account_id = NULL
      WHERE id = staged.id;
    RETURN jsonb_build_object('stagingData', to_jsonb(staged));
  END IF;

  -- A transfer has no category, so this branch comes before the category fallback.
  IF staged.transfer_to_account_id IS NOT NULL THEN
    new_transfer_id := public.transfers_create(owner_id, staged.account_id, staged.transfer_to_account_id,
      staged.amount, staged.currency, staged.occurred_at, staged.description, gen_random_uuid());
    SELECT * INTO txn FROM public.transactions
      WHERE transactions.transfer_id = new_transfer_id AND type = 'transfer_out';
    UPDATE public.transaction_staging SET status = 'confirmed', confirmed_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('transaction_id', txn.id, 'transfer_id', new_transfer_id)
      WHERE id = staged.id;
    SELECT name INTO account_name FROM public.accounts WHERE id = staged.account_id;
    SELECT name INTO transfer_name FROM public.accounts WHERE id = staged.transfer_to_account_id;
    RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'txn', to_jsonb(txn),
      'transferId', new_transfer_id, 'accountName', account_name, 'transferToAccountName', transfer_name);
  END IF;

  IF staged.category_id IS NULL THEN
    staged.category_id := public.backend_resolve_category(owner_id, 'Uncategorized');
  END IF;
  SELECT user_id INTO category_owner FROM public.categories WHERE id = staged.category_id FOR SHARE;
  IF NOT FOUND OR (category_owner IS NOT NULL AND category_owner <> owner_id) THEN
    RAISE EXCEPTION 'Category unavailable';
  END IF;
  IF staged.account_id IS NULL THEN
    INSERT INTO public.accounts (name, user_id) VALUES ('Bank', owner_id)
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO staged.account_id;
  END IF;
  -- Populate against the actual transaction enum/column types.
  SELECT * INTO txn FROM jsonb_populate_record(NULL::public.transactions,
    jsonb_build_object('type', staged.type, 'currency', staged.currency));
  INSERT INTO public.transactions (amount, description, occurred_at, type, category_id, account_id, user_id, currency)
    VALUES (staged.amount, staged.description, staged.occurred_at, txn.type,
      staged.category_id, staged.account_id, owner_id, txn.currency) RETURNING * INTO txn;
  UPDATE public.transaction_staging SET status = 'confirmed', confirmed_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('transaction_id', txn.id)
    WHERE id = staged.id;
  RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'txn', to_jsonb(txn));
END;
$$;


CREATE OR REPLACE FUNCTION "public"."backend_save_telegram_transaction"("p_user_id" "uuid", "p_update_id" bigint, "p_transaction" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  txn public.transactions%ROWTYPE;
  category_id uuid;
  account_id uuid;
  transaction_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_update_id IS NULL OR p_update_id < 0 THEN RAISE EXCEPTION 'Owner and update required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram-update:' || p_update_id::text, 0));
  SELECT u.transaction_id INTO transaction_id FROM public.telegram_processed_updates u
    WHERE u.update_id = p_update_id AND u.user_id = p_user_id;
  IF FOUND THEN
    IF transaction_id IS NULL THEN RAISE EXCEPTION 'Previously processed transaction was deleted'; END IF;
    RETURN transaction_id;
  END IF;
  category_id := public.backend_resolve_category(p_user_id, p_transaction->>'categoryName');
  IF nullif(btrim(p_transaction->>'accountName'), '') IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
  INSERT INTO public.accounts (name, user_id) VALUES (btrim(p_transaction->>'accountName'), p_user_id)
    ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO account_id;
  SELECT * INTO txn FROM jsonb_populate_record(NULL::public.transactions, p_transaction);
  INSERT INTO public.transactions (user_id, category_id, account_id, type, amount, occurred_at, description, currency, metadata)
    VALUES (p_user_id, category_id, account_id, txn.type, txn.amount, txn.occurred_at, txn.description, 'IDR',
      jsonb_build_object('telegram_update_id', p_update_id::text)) RETURNING id INTO transaction_id;
  INSERT INTO public.telegram_processed_updates (update_id, user_id, transaction_id)
    VALUES (p_update_id, p_user_id, transaction_id);
  RETURN transaction_id;
END;
$$;

COMMIT;
