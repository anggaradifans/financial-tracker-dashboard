-- Linked account transfers and per-account balances (issue #17), part 2 of 2.
-- Requires 20261031100000_transfer_types.sql (the transfer_out / transfer_in values).
--
-- A transfer is two transactions that share a transfer_id: a debit (transfer_out)
-- on one account and a credit (transfer_in) on another, with the same owner,
-- amount, currency and time. Nothing here stores a balance; balances are derived.
--
-- Design notes
--   * Browser roles cannot write transfer legs directly. Restrictive RLS policies
--     leave only create_transfer and delete_transfer, both SECURITY DEFINER with the
--     owner taken from auth.uid(). create_transfer takes an optional idempotency key.
--     Both creation paths share transfers_create(owner, ...), which only the service
--     role may execute (the Telegram bot confirms staged transfers through it).
--   * Whatever the write path (RPC, service role, SQL editor), a deferred constraint
--     trigger refuses to commit a transfer that is not one matching debit and credit.
--   * A transfer leg has no category: category_id is nullable, and a CHECK keeps it
--     NULL exactly for transfer legs, so every other transaction still needs one.
--     backend_transaction_category_owner skips NULL categories for the same reason.
--   * Accounts have no owner (they are shared), so ownership is enforced on the
--     transaction legs and balances are per (user, account) from that user's own legs.
--   * Transfers need both accounts to use the transfer currency. Converting between
--     currencies belongs to issue #15.
--   * The balance is derived from tracked history only. It does not know about money
--     an account held before tracking began; an opening balance is a later addition.
--
-- Rollback (deletes every transfer):
--   DROP VIEW public.account_balances;
--   DROP FUNCTION public.create_transfer, public.transfers_create, public.delete_transfer;
--   DROP POLICY transactions_no_direct_transfer_insert ON public.transactions;
--   DROP POLICY transactions_no_direct_transfer_update ON public.transactions;
--   DROP POLICY transactions_no_direct_transfer_delete ON public.transactions;
--   DROP TRIGGER transactions_transfer_pair_insert ON public.transactions;
--   DROP TRIGGER transactions_transfer_pair_update ON public.transactions;
--   DROP TRIGGER transactions_transfer_pair_delete ON public.transactions;
--   DROP FUNCTION public.transactions_check_transfer_pair;
--   DELETE FROM public.transactions WHERE transfer_id IS NOT NULL;
--   ALTER TABLE public.transactions
--     DROP CONSTRAINT transactions_transfer_id_check, DROP CONSTRAINT transactions_transfer_category_check,
--     DROP CONSTRAINT transactions_transfer_account_check, DROP CONSTRAINT transactions_transfer_amount_check,
--     DROP COLUMN transfer_id, ALTER COLUMN category_id SET NOT NULL;
--   CREATE OR REPLACE TRIGGER backend_transaction_category_owner BEFORE INSERT OR UPDATE OF category_id, user_id
--     ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.backend_check_category_owner();

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.transactions
  ADD COLUMN transfer_id uuid,
  ALTER COLUMN category_id DROP NOT NULL;

COMMENT ON COLUMN public.transactions.transfer_id IS 'Shared by the debit and credit legs of one transfer; NULL for ordinary transactions';

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transfer_id_check
    CHECK ((type IN ('transfer_out', 'transfer_in')) = (transfer_id IS NOT NULL)),
  ADD CONSTRAINT transactions_transfer_category_check
    CHECK ((type IN ('transfer_out', 'transfer_in')) = (category_id IS NULL)),
  ADD CONSTRAINT transactions_transfer_account_check
    CHECK (type NOT IN ('transfer_out', 'transfer_in') OR account_id IS NOT NULL),
  ADD CONSTRAINT transactions_transfer_amount_check
    CHECK (type NOT IN ('transfer_out', 'transfer_in') OR amount > 0);

-- One debit and one credit per transfer; also serves the pair lookup below.
CREATE UNIQUE INDEX transactions_transfer_leg_key
  ON public.transactions (transfer_id, type) WHERE transfer_id IS NOT NULL;

-- A transfer leg has no category to check. The CHECKs above guarantee that only
-- transfer legs have a NULL category, so no ordinary transaction loses the check.
CREATE OR REPLACE TRIGGER backend_transaction_category_owner
  BEFORE INSERT OR UPDATE OF category_id, user_id ON public.transactions
  FOR EACH ROW WHEN (NEW.category_id IS NOT NULL)
  EXECUTE FUNCTION public.backend_check_category_owner();

-- ---------------------------------------------------------------------------
-- Pair integrity
-- ---------------------------------------------------------------------------

-- Runs at commit for every transfer a statement touched. SECURITY DEFINER so it
-- sees both legs whatever row-level security the writing role has; a pair split
-- across owners is then rejected by the owner count rather than hidden by RLS.
CREATE FUNCTION public.transactions_check_transfer_pair() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_legs integer;
  v_out integer;
  v_in integer;
  v_owners integer;
  v_amounts integer;
  v_currencies integer;
  v_times integer;
  v_accounts integer;
  v_deleted integer;
BEGIN
  -- An update can move a row from one transfer to another, so check both.
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.transfer_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.transfer_id];
  ELSE
    v_ids := ARRAY[OLD.transfer_id, NEW.transfer_id];
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    IF v_id IS NULL THEN CONTINUE; END IF;
    SELECT count(*),
           count(*) FILTER (WHERE type = 'transfer_out'),
           count(*) FILTER (WHERE type = 'transfer_in'),
           count(DISTINCT user_id), count(DISTINCT amount), count(DISTINCT currency),
           count(DISTINCT occurred_at), count(DISTINCT account_id), count(deleted_at)
      INTO v_legs, v_out, v_in, v_owners, v_amounts, v_currencies, v_times, v_accounts, v_deleted
      FROM public.transactions WHERE transfer_id = v_id;
    -- Both legs hard-deleted together leave nothing to check.
    IF v_legs = 0 THEN CONTINUE; END IF;
    IF NOT (v_legs = 2 AND v_out = 1 AND v_in = 1 AND v_owners = 1 AND v_amounts = 1
            AND v_currencies = 1 AND v_times = 1 AND v_accounts = 2 AND v_deleted IN (0, 2)) THEN
      RAISE EXCEPTION 'A transfer must be one matching debit and credit between two accounts'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- The WHEN clauses keep ordinary transactions out of the deferred queue.
CREATE CONSTRAINT TRIGGER transactions_transfer_pair_insert AFTER INSERT ON public.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.transfer_id IS NOT NULL)
  EXECUTE FUNCTION public.transactions_check_transfer_pair();
CREATE CONSTRAINT TRIGGER transactions_transfer_pair_update AFTER UPDATE ON public.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.transfer_id IS NOT NULL OR NEW.transfer_id IS NOT NULL)
  EXECUTE FUNCTION public.transactions_check_transfer_pair();
CREATE CONSTRAINT TRIGGER transactions_transfer_pair_delete AFTER DELETE ON public.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.transfer_id IS NOT NULL)
  EXECUTE FUNCTION public.transactions_check_transfer_pair();

-- ---------------------------------------------------------------------------
-- Browser-callable RPCs
-- ---------------------------------------------------------------------------

-- Internal: creates both legs for an owner the caller has already established
-- (auth.uid() for the browser, the linked Telegram user for the bot). It takes the
-- owner as an argument, so browser roles must never be able to execute it.
-- p_transfer_id is an optional client-chosen idempotency key: repeating the
-- identical call returns the same transfer, while reusing the id for anything else
-- (or another user's transfer) is a conflict.
CREATE FUNCTION public.transfers_create(
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
        WHERE id IN (p_from_account_id, p_to_account_id) AND currency = p_currency) <> 2 THEN
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

-- Browser-callable: the owner is always the signed-in user.
CREATE FUNCTION public.create_transfer(
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.transfers_create(auth.uid(), p_from_account_id, p_to_account_id, p_amount,
    p_currency, p_occurred_at, p_description, p_transfer_id);
END;
$$;

-- Soft-deletes both legs together. Missing, not yours and already deleted are
-- deliberately indistinguishable.
CREATE FUNCTION public.delete_transfer(p_transfer_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.transactions SET deleted_at = now()
    WHERE transfer_id = p_transfer_id AND user_id = v_owner AND deleted_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION 'Transfer unavailable' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-account balances
-- ---------------------------------------------------------------------------

-- Credits minus debits per user, account and currency over non-deleted history.
-- A transaction without an account forms its own group (account_id NULL), so the
-- balances always add up to total income minus total outcome. A type this view does
-- not know contributes nothing instead of being guessed at.
CREATE VIEW public.account_balances WITH (security_invoker = true) AS
SELECT
  t.user_id,
  t.account_id,
  t.currency,
  sum(CASE t.type
        WHEN 'income' THEN t.amount
        WHEN 'transfer_in' THEN t.amount
        WHEN 'outcome' THEN -t.amount
        WHEN 'transfer_out' THEN -t.amount
      END) AS balance,
  count(*) AS transaction_count,
  max(t.occurred_at) AS last_activity_at
FROM public.transactions t
WHERE t.deleted_at IS NULL
GROUP BY t.user_id, t.account_id, t.currency;

COMMENT ON VIEW public.account_balances IS 'Tracked balance per user and account: credits minus debits of non-deleted transactions; excludes anything held before tracking began';

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

-- Restrictive policies are ANDed with the permissive ones from the baseline, so
-- an authenticated browser session never reads-then-writes a transfer leg directly,
-- whatever the permissive policies allow. Updates and deletes of a leg simply
-- match no rows.
CREATE POLICY "transactions_no_direct_transfer_insert" ON public.transactions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (transfer_id IS NULL);
CREATE POLICY "transactions_no_direct_transfer_update" ON public.transactions
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (transfer_id IS NULL) WITH CHECK (transfer_id IS NULL);
CREATE POLICY "transactions_no_direct_transfer_delete" ON public.transactions
  AS RESTRICTIVE FOR DELETE TO authenticated USING (transfer_id IS NULL);

-- Default privileges give anon and authenticated ALL on new relations and functions,
-- so revoke first and grant narrowly.
REVOKE ALL ON TABLE public.account_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_balances TO authenticated;

REVOKE ALL ON FUNCTION public.transactions_check_transfer_pair(),
  public.transfers_create(uuid, uuid, uuid, numeric, text, timestamptz, text, uuid),
  public.create_transfer(uuid, uuid, numeric, text, timestamptz, text, uuid),
  public.delete_transfer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.create_transfer(uuid, uuid, numeric, text, timestamptz, text, uuid),
  public.delete_transfer(uuid)
  TO authenticated;
