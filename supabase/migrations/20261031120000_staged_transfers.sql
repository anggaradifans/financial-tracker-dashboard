-- Own-account transfers for staged Telegram receipts (issue #17, phase 1).
-- Requires 20261031110000_linked_transfers.sql (transfers_create, the transfer types).
--
-- A pending receipt (email or PDF import) is staged as an outgoing transaction.
-- The user can mark it, from the Telegram review message, as a transfer to one of
-- their own accounts. Confirming then creates both transfer legs instead of one
-- spending row.
--
-- Design notes
--   * The destination is a real column, not metadata. Writers of this table replace
--     metadata wholesale (the email worker does, after sending the message), and a
--     lost marker would silently turn a transfer back into spending. The column's
--     CHECKs also keep "outgoing receipts only" and "source <> destination" true
--     even when the user later edits the source account.
--   * The confirm branch runs before the category fallback, so confirming a transfer
--     never creates a category.
--   * The bot is the service role and has no auth.uid(), so confirmation calls
--     transfers_create(owner, ...) with the owner found from the verified Telegram link.
--   * Only the receipt's destination is chosen by hand; nothing decides on its own that
--     an account is the user's. Detecting that automatically is a later phase.
--
-- This replaces backend_revise_staged_transaction (first defined by the Telegram
-- backend's 20260917_staging_revision.sql) and backend_process_staged_transaction (first
-- defined by 20260915_backend_compatibility.sql). Re-running either of those files after
-- this migration restores the old functions, which ignore the marker and would save a
-- transfer as ordinary spending without any error. They carry a note saying so.
--
-- Rollback: restore the two functions from 20260917000000_production_baseline.sql, then
--   ALTER TABLE public.transaction_staging DROP CONSTRAINT transaction_staging_transfer_type_check,
--     DROP CONSTRAINT transaction_staging_transfer_account_check, DROP COLUMN transfer_to_account_id;
-- Pending transfer receipts would then confirm as spending, so confirm or reject them first.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.transaction_staging
  ADD COLUMN transfer_to_account_id uuid REFERENCES public.accounts(id),
  ADD CONSTRAINT transaction_staging_transfer_type_check
    CHECK (transfer_to_account_id IS NULL OR type = 'outcome'),
  ADD CONSTRAINT transaction_staging_transfer_account_check
    CHECK (transfer_to_account_id IS NULL OR (account_id IS NOT NULL AND account_id <> transfer_to_account_id));

COMMENT ON COLUMN public.transaction_staging.transfer_to_account_id IS 'Set when the receipt is a transfer to one of the owner''s accounts; confirming creates both legs';

-- ---------------------------------------------------------------------------
-- Revise: add the transfer picker, selection and clear actions
-- ---------------------------------------------------------------------------
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
    -- Accounts are shared in the existing application schema.
    PERFORM 1 FROM public.accounts WHERE id = p_choice_id FOR SHARE;
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
        WHERE id = p_choice_id AND id <> staged.account_id AND currency = staged.currency FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable as a transfer destination'; END IF;
      UPDATE public.transaction_staging SET transfer_to_account_id = p_choice_id
        WHERE id = staged.id RETURNING * INTO staged;
    ELSE
      SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.name, a.id), '[]'::jsonb) INTO choices
      FROM (SELECT id, name FROM public.accounts
        WHERE id <> staged.account_id AND currency = staged.currency
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
    FROM (SELECT id, name FROM public.accounts ORDER BY name, id LIMIT 9 OFFSET p_page * 8) a;
  END IF;
  SELECT name INTO category_name FROM public.categories WHERE id = staged.category_id
    AND (user_id IS NULL OR user_id = owner_id);
  SELECT name INTO account_name FROM public.accounts WHERE id = staged.account_id;
  SELECT name INTO transfer_name FROM public.accounts WHERE id = staged.transfer_to_account_id;
  RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'categoryName', category_name,
    'accountName', account_name, 'transferAccountName', transfer_name,
    'choices', choices, 'page', p_page);
END;
$$;

-- ---------------------------------------------------------------------------
-- Confirm: a receipt with a transfer destination creates both legs
-- ---------------------------------------------------------------------------
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
    INSERT INTO public.accounts (name) VALUES ('Bank')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO staged.account_id;
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
