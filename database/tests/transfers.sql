-- Linked transfers and account balances (supabase/migrations/20261031110000_linked_transfers.sql),
-- tested on the production baseline in a disposable database. Runs as postgres and
-- switches roles the way PostgREST does. Everything rolls back at the end.
--
-- The pair-integrity trigger is deferred to commit, and nothing here commits, so the
-- negative tests use SET CONSTRAINTS ALL IMMEDIATE to fire it at the end of the
-- statement. transfers_commit.sh proves the real commit path with two sessions.
\set ON_ERROR_STOP on
BEGIN;
\ir support.sql

CREATE FUNCTION test_support.month_start(months_back integer) RETURNS timestamp LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') - make_interval(months => months_back)
$$;
CREATE FUNCTION test_support.at_local(local_ts timestamp) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT local_ts AT TIME ZONE 'Asia/Jakarta'
$$;
-- Reads the view as the calling role, so row-level security applies.
CREATE FUNCTION test_support.balance(p_account uuid, p_currency text) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT balance FROM public.account_balances WHERE account_id IS NOT DISTINCT FROM p_account AND currency = p_currency
$$;
CREATE FUNCTION test_support.leg_count() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.transactions WHERE transfer_id IS NOT NULL
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
-- u1 owns the transfers, u2 is a bystander, u3 checks the goals calculation.
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');
INSERT INTO public.accounts (id, name, currency) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Checking', 'IDR'),
  ('a1000000-0000-0000-0000-000000000002', 'Savings', 'IDR'),
  ('a1000000-0000-0000-0000-000000000003', 'Wallet', 'IDR'),
  ('a1000000-0000-0000-0000-000000000004', 'USD Cash', 'USD'),
  ('a1000000-0000-0000-0000-000000000005', 'USD Bank', 'USD');
INSERT INTO public.categories (id, name, allowed_type, user_id) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Salary', 'income', NULL),
  ('c1000000-0000-0000-0000-000000000002', 'Rent', 'outcome', NULL),
  ('c1000000-0000-0000-0000-000000000003', 'Groceries', 'both', NULL),
  ('c1000000-0000-0000-0000-000000000004', 'U2 Private', 'outcome', '00000000-0000-0000-0000-000000000002');

INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description, deleted_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'income', 10000000, 'IDR', now() - interval '3 days', 'salary', NULL),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 3000000, 'IDR', now() - interval '2 days', 'rent', NULL),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'outcome', 250000.50, 'IDR', now() - interval '2 days', 'groceries', NULL),
  -- no account chosen: balances keep it as its own group
  ('00000000-0000-0000-0000-000000000001', NULL, 'c1000000-0000-0000-0000-000000000003', 'outcome', 100000, 'IDR', now() - interval '1 day', 'cash', NULL),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'income', 50, 'USD', now() - interval '1 day', 'usd', NULL),
  -- a soft-deleted transaction never counts
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 999999, 'IDR', now() - interval '1 day', 'deleted', now()),
  ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 1111, 'IDR', now() - interval '1 day', 'u2 rent', NULL);
SELECT id AS rent_tx FROM public.transactions WHERE description = 'rent' \gset

-- ---------------------------------------------------------------------------
-- Structure and grants
-- ---------------------------------------------------------------------------
SELECT test_support.assert_true((SELECT count(*) = 4 FROM information_schema.table_constraints
  WHERE table_schema = 'public' AND table_name = 'transactions'
    AND constraint_name IN ('transactions_transfer_id_check', 'transactions_transfer_category_check',
                            'transactions_transfer_account_check', 'transactions_transfer_amount_check')),
  'the four transfer-shape checks exist');
SELECT test_support.assert_true((SELECT count(*) = 3 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'transactions' AND permissive = 'RESTRICTIVE'
    AND policyname LIKE 'transactions_no_direct_transfer_%'),
  'three restrictive policies close direct browser writes to transfer legs');
SELECT test_support.assert_true((SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'public.account_balances'::regclass),
  'account_balances runs with the caller privileges');
SELECT test_support.assert_true((SELECT array_agg(privilege_type::text ORDER BY privilege_type) = ARRAY['SELECT']
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'account_balances' AND grantee = 'authenticated'),
  'authenticated can only read account_balances');
SELECT test_support.assert_true(NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'account_balances' AND grantee IN ('anon', 'PUBLIC')),
  'anon has no balance privileges');
SELECT test_support.assert_true(
  NOT has_function_privilege('anon', 'public.create_transfer(uuid, uuid, numeric, text, timestamptz, text, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.delete_transfer(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.create_transfer(uuid, uuid, numeric, text, timestamptz, text, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.delete_transfer(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.transactions_check_transfer_pair()', 'EXECUTE'),
  'only create_transfer and delete_transfer are callable from the browser');
SELECT test_support.assert_true((SELECT count(*) = 3 FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass AND tgname LIKE 'transactions_transfer_pair_%'
    AND tgdeferrable AND tginitdeferred),
  'the pair checks are deferred constraint triggers');

-- ---------------------------------------------------------------------------
-- Anonymous and signed-out access
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.account_balances', '42501');
SELECT test_support.assert_rejected($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 1, 'IDR', now())$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.delete_transfer('a1000000-0000-0000-0000-000000000001')$q$, '42501');
RESET ROLE;

-- A signed-in role with no user claim is refused by the function itself.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 1, 'IDR', now())$q$, '42501', 'Authentication required');
SELECT test_support.assert_rejected_like($q$SELECT public.delete_transfer('a1000000-0000-0000-0000-000000000001')$q$, '42501', 'Authentication required');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Creating transfers (u1)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000001', 'IDR') = 7000000, 'checking starts at 10.0M - 3.0M');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000002', 'IDR') IS NULL, 'an account without history has no balance row');

SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 2000000, 'IDR', now() - interval '1 hour', '  Move to savings  ') AS t1 \gset
SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 500000, 'IDR', now(), NULL, 'f1000000-0000-0000-0000-000000000002') AS t2 \gset
SELECT test_support.assert_true(:'t2' = 'f1000000-0000-0000-0000-000000000002', 'a client-chosen transfer id is kept');

RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.transactions WHERE transfer_id = :'t1'), 'a transfer is two legs');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.transactions
  WHERE transfer_id = :'t1' AND type = 'transfer_out' AND account_id = 'a1000000-0000-0000-0000-000000000001'),
  'the debit leg is on the source account');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.transactions
  WHERE transfer_id = :'t1' AND type = 'transfer_in' AND account_id = 'a1000000-0000-0000-0000-000000000002'),
  'the credit leg is on the destination account');
SELECT test_support.assert_true((SELECT count(DISTINCT (user_id, amount, currency, occurred_at, description)) = 1 FROM public.transactions WHERE transfer_id = :'t1'),
  'both legs share owner, amount, currency, time and description');
SELECT test_support.assert_true((SELECT bool_and(category_id IS NULL AND deleted_at IS NULL AND user_id = '00000000-0000-0000-0000-000000000001') FROM public.transactions WHERE transfer_id = :'t1'),
  'legs have no category and belong to the caller');
SELECT test_support.assert_true((SELECT description = 'Move to savings' FROM public.transactions WHERE transfer_id = :'t1' LIMIT 1),
  'the description is trimmed');
SELECT test_support.assert_true((SELECT description IS NULL FROM public.transactions WHERE transfer_id = :'t2' LIMIT 1),
  'no description stays null');

-- ---------------------------------------------------------------------------
-- Balances and exclusion from spending
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000001', 'IDR') = 5000000, 'source is debited');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000002', 'IDR') = 1500000, 'destination is credited, then debited by the second transfer');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000003', 'IDR') = 249999.50, 'wallet: groceries -250,000.50 plus 500,000 in, exact to the cent');
SELECT test_support.assert_true(test_support.balance(NULL, 'IDR') = -100000, 'transactions without an account stay in their own group');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000004', 'USD') = 50, 'balances are kept per currency');
SELECT test_support.assert_true((SELECT sum(balance) FROM public.account_balances WHERE currency = 'IDR')
  = (SELECT sum(CASE type WHEN 'income' THEN amount ELSE -amount END) FROM public.transactions
       WHERE currency = 'IDR' AND deleted_at IS NULL AND type IN ('income', 'outcome')),
  'balances add up to income minus outcome: transfers net to zero');
SELECT test_support.assert_true((SELECT sum(amount) = 10000000 FROM public.transactions WHERE type = 'income' AND currency = 'IDR' AND deleted_at IS NULL),
  'transfers are not income');
SELECT test_support.assert_true((SELECT sum(amount) = 3350000.50 FROM public.transactions WHERE type = 'outcome' AND currency = 'IDR' AND deleted_at IS NULL),
  'transfers are not spending');

-- The bystander sees none of it.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.account_balances), 'u2 only sees its own balance row');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000001', 'IDR') = -1111, 'u2 balance ignores u1 transfers');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.transactions WHERE transfer_id IS NOT NULL), 'u2 cannot read u1 transfer legs');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Rejected input leaves no leg behind
-- ---------------------------------------------------------------------------
SELECT test_support.leg_count() AS legs_before \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 100, 'IDR', now())$q$, '22023', 'A transfer needs two different accounts');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer(NULL, 'a1000000-0000-0000-0000-000000000002', 100, 'IDR', now())$q$, '22023', 'A transfer needs two different accounts');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', NULL, 100, 'IDR', now())$q$, '22023', 'A transfer needs two different accounts');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 0, 'IDR', now())$q$, '22023', 'Amount must be positive%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', -5, 'IDR', now())$q$, '22023', 'Amount must be positive%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', NULL, 'IDR', now())$q$, '22023', 'Amount must be positive%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 10.005, 'IDR', now())$q$, '22023', 'Amount must be positive%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 100, 'idr', now())$q$, '22023', 'Invalid currency');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 100, 'IDR', NULL)$q$, '22023', 'Transfer date required');
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 100, 'IDR', now(), %L)$q$, repeat('x', 501)), '22023', 'Description is too long');
-- currency must match both accounts: IDR accounts cannot move USD, USD cannot reach an IDR account
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 100, 'USD', now())$q$, '22023', 'Both accounts must exist%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 100, 'USD', now())$q$, '22023', 'Both accounts must exist%');
SELECT test_support.assert_rejected_like($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-0000000000ff', 100, 'IDR', now())$q$, '22023', 'Both accounts must exist%');
-- an insert that fails after validation (amount beyond numeric(18,2)) leaves neither leg
SELECT test_support.assert_rejected($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 100000000000000000, 'IDR', now())$q$, '22003');
RESET ROLE;
SELECT test_support.assert_true(test_support.leg_count() = :legs_before, 'rejected calls created no legs');

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------
SELECT occurred_at AS t2_time, amount AS t2_amount FROM public.transactions WHERE transfer_id = :'t2' LIMIT 1 \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', :t2_amount, 'IDR', :'t2_time', NULL, :'t2') AS replay \gset
SELECT test_support.assert_true(:'replay' = :'t2', 'repeating the identical call returns the same transfer');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000003', 'IDR') = 249999.50, 'the repeat did not move money twice');

SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 500001, 'IDR', %L, NULL, %L)$q$, :'t2_time', :'t2'), '23505', 'Transfer id already used');
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 500000, 'IDR', %L, NULL, %L)$q$, :'t2_time', :'t2'), '23505', 'Transfer id already used');
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 500000, 'IDR', %L, 'changed', %L)$q$, :'t2_time', :'t2'), '23505', 'Transfer id already used');
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 500000, 'IDR', %L, NULL, %L)$q$, :'t2_time'::timestamptz + interval '1 second', :'t2'), '23505', 'Transfer id already used');

-- Another user cannot claim or probe a taken id.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003', 500000, 'IDR', %L, NULL, %L)$q$, :'t2_time', :'t2'), '23505', 'Transfer id already used');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

-- No key: every call is a new transfer.
SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 10, 'IDR', now()) AS k1 \gset
SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 10, 'IDR', now()) AS k2 \gset
SELECT test_support.assert_true(:'k1' <> :'k2', 'without a key each call creates a new transfer');
SELECT public.delete_transfer(:'k1');
SELECT public.delete_transfer(:'k2');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Browser writes cannot touch transfer legs
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT test_support.assert_rejected($q$INSERT INTO public.transactions (account_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', now(), gen_random_uuid())$q$, '42501');
SELECT test_support.assert_rejected(format($q$UPDATE public.transactions SET type = 'transfer_out', transfer_id = gen_random_uuid(), category_id = NULL,
  account_id = 'a1000000-0000-0000-0000-000000000001' WHERE id = %L$q$, :'rent_tx'), '42501');
WITH u AS (UPDATE public.transactions SET description = 'edited' WHERE transfer_id = :'t1' RETURNING 1) SELECT count(*) AS n FROM u \gset
SELECT test_support.assert_true(:n = 0, 'a leg cannot be edited directly');
WITH u AS (UPDATE public.transactions SET deleted_at = now() WHERE transfer_id = :'t1' RETURNING 1) SELECT count(*) AS n FROM u \gset
SELECT test_support.assert_true(:n = 0, 'a leg cannot be soft-deleted directly');
WITH d AS (DELETE FROM public.transactions WHERE transfer_id = :'t1' RETURNING 1) SELECT count(*) AS n FROM d \gset
SELECT test_support.assert_true(:n = 0, 'a leg cannot be hard-deleted directly');
RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) = 2 AND bool_and(description = 'Move to savings' AND deleted_at IS NULL) FROM public.transactions WHERE transfer_id = :'t1'),
  'the transfer is untouched');

-- A goal contribution can link an ordinary transaction but not a transfer leg: the link
-- trigger locks the transaction row with SELECT ... FOR UPDATE as the caller, and the
-- restrictive update policy hides legs from that lock. (Linking a leg, the natural way
-- to record "moved money into savings", needs a follow-up that makes the trigger
-- SECURITY DEFINER.)
SELECT id AS t2_leg FROM public.transactions WHERE transfer_id = :'t2' AND type = 'transfer_in' \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
INSERT INTO public.goals (kind, name, target_amount) VALUES ('custom', 'Link test', 1000000) RETURNING id AS link_goal \gset
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (:'link_goal', current_date, 100, :'rent_tx');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.goal_contributions WHERE goal_id = :'link_goal' AND transaction_id = :'rent_tx'),
  'a contribution can link an ordinary transaction');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id)
  VALUES (%L, current_date, 100, %L)$q$, :'link_goal', :'t2_leg'), '23514', 'Linked transaction unavailable');
RESET ROLE;

-- Ordinary transactions keep working under the same policies.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
INSERT INTO public.transactions (account_id, category_id, type, amount, currency, occurred_at, description)
  VALUES ('a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 1, 'IDR', now(), 'plain');
UPDATE public.transactions SET description = 'plain edited' WHERE description = 'plain';
UPDATE public.transactions SET deleted_at = now() WHERE description = 'plain edited';
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.transactions WHERE description = 'plain edited' AND deleted_at IS NOT NULL),
  'an ordinary transaction can still be inserted, edited and soft-deleted');
-- ...and a category is still required for it, even if the browser tries to omit it.
SELECT test_support.assert_rejected($q$INSERT INTO public.transactions (account_id, type, amount, currency, occurred_at)
  VALUES ('a1000000-0000-0000-0000-000000000001', 'outcome', 1, 'IDR', now())$q$, '42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Shape checks (as the service role would see them: row-level security is bypassed)
-- ---------------------------------------------------------------------------
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'outcome', 1, 'IDR', now())$q$,
  '23514', '%transactions_transfer_category_check%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'transfer_out', 1, 'IDR', now(), gen_random_uuid())$q$,
  '23514', '%transactions_transfer_category_check%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 1, 'IDR', now())$q$,
  '23514', '%transactions_transfer_id_check%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 1, 'IDR', now(), gen_random_uuid())$q$,
  '23514', '%transactions_transfer_id_check%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'transfer_out', 1, 'IDR', now(), gen_random_uuid())$q$,
  '23514', '%transactions_transfer_account_check%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 0, 'IDR', now(), gen_random_uuid())$q$,
  '23514', '%transactions_transfer_amount_check%');
-- the category-owner trigger still guards every transaction that has a category
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'outcome', 1, 'IDR', now())$q$,
  'P0001', 'Category unavailable%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-0000000000ff', 'outcome', 1, 'IDR', now())$q$,
  'P0001', 'Category unavailable%');

-- ---------------------------------------------------------------------------
-- Pair integrity on every write path (checked at the end of each statement here)
-- ---------------------------------------------------------------------------
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', now(), 'f2000000-0000-0000-0000-000000000001')$q$,
  '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'transfer_in', 11, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000002')$q$,
  '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_in', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000003')$q$,
  '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'transfer_in', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000004')$q$,
  '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000005'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'transfer_in', 10, 'IDR', '2026-01-02', 'f2000000-0000-0000-0000-000000000005')$q$,
  '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like($q$SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'transfer_out', 10, 'USD', '2026-01-01', 'f2000000-0000-0000-0000-000000000006'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'transfer_in', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000006')$q$,
  '23514', 'A transfer must be one matching%');
-- a second debit for the same transfer collides with the one-debit-one-credit index
SELECT test_support.assert_rejected($q$INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000007'),
  ('00000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'transfer_out', 10, 'IDR', '2026-01-01', 'f2000000-0000-0000-0000-000000000007')$q$, '23505');

-- Changing an existing transfer so that it no longer matches is refused too.
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.transactions SET amount = amount + 1 WHERE transfer_id = %L AND type = 'transfer_out'$q$, :'t1'), '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.transactions SET deleted_at = now() WHERE transfer_id = %L AND type = 'transfer_out'$q$, :'t1'), '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.transactions SET account_id = 'a1000000-0000-0000-0000-000000000002' WHERE transfer_id = %L AND type = 'transfer_out'$q$, :'t1'), '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.transactions SET transfer_id = gen_random_uuid() WHERE transfer_id = %L AND type = 'transfer_out'$q$, :'t1'), '23514', 'A transfer must be one matching%');
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  DELETE FROM public.transactions WHERE transfer_id = %L AND type = 'transfer_in'$q$, :'t1'), '23514', 'A transfer must be one matching%');
-- an ordinary transaction cannot be turned into half a transfer
SELECT test_support.assert_rejected_like(format($q$SET CONSTRAINTS ALL IMMEDIATE;
  UPDATE public.transactions SET type = 'transfer_out', transfer_id = gen_random_uuid(), category_id = NULL WHERE id = %L$q$, :'rent_tx'), '23514', 'A transfer must be one matching%');

-- Legitimate changes pass: a complete pair deleted or soft-deleted together.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT public.create_transfer('a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005', 20, 'USD', now()) AS t3 \gset
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000004', 'USD') = 30
  AND test_support.balance('a1000000-0000-0000-0000-000000000005', 'USD') = 20, 'a USD transfer moves USD only');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
DELETE FROM public.transactions WHERE transfer_id = :'t3';
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.transactions WHERE transfer_id = :'t3'), 'both legs of a transfer can be hard-deleted together');
SET CONSTRAINTS ALL DEFERRED;

-- ---------------------------------------------------------------------------
-- Deleting a transfer
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_rejected_like(format($q$SELECT public.delete_transfer(%L)$q$, :'t1'), 'P0002', 'Transfer unavailable');
SELECT test_support.assert_rejected_like($q$SELECT public.delete_transfer(gen_random_uuid())$q$, 'P0002', 'Transfer unavailable');
SELECT test_support.assert_rejected_like($q$SELECT public.delete_transfer(NULL)$q$, 'P0002', 'Transfer unavailable');
RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) = 2 AND bool_and(deleted_at IS NULL) FROM public.transactions WHERE transfer_id = :'t1'),
  'another user cannot delete the transfer');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT public.delete_transfer(:'t1');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000001', 'IDR') = 7000000, 'deleting restores the source balance');
SELECT test_support.assert_true(test_support.balance('a1000000-0000-0000-0000-000000000002', 'IDR') = -500000, 'deleting removes the credit from the destination');
SELECT test_support.assert_rejected_like(format($q$SELECT public.delete_transfer(%L)$q$, :'t1'), 'P0002', 'Transfer unavailable');
-- an identical retry of a deleted transfer is a conflict, not a silent resurrection
SELECT test_support.assert_rejected_like(format($q$SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 2000000, 'IDR', %L, 'Move to savings', %L)$q$,
  (SELECT occurred_at FROM public.transactions WHERE transfer_id = :'t1' LIMIT 1), :'t1'), '23505', 'Transfer id already used');
RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) = 2 AND bool_and(deleted_at IS NOT NULL) AND count(DISTINCT deleted_at) = 1 FROM public.transactions WHERE transfer_id = :'t1'),
  'both legs are soft-deleted together');

-- ---------------------------------------------------------------------------
-- Cross-feature: goals calculation never counts transfers
-- ---------------------------------------------------------------------------
-- u3 pays 2.0M rent in each of the last three completed months and also moves 9.0M
-- between accounts in each of them; the basis must see only the rent.
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description) VALUES
  ('00000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 1000, 'IDR', test_support.at_local(test_support.month_start(8)), 'opening');
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description)
SELECT '00000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'outcome', 2000000, 'IDR',
       test_support.at_local(test_support.month_start(m) + interval '9 days 10 hours'), 'u3 rent'
FROM generate_series(1, 3) AS m;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT public.create_transfer('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 9000000, 'IDR',
  test_support.at_local(test_support.month_start(m) + interval '9 days 11 hours'))
FROM generate_series(1, 3) AS m;
RESET ROLE;
SELECT public.goals_basis('00000000-0000-0000-0000-000000000003', 'IDR', 3, 6,
  ARRAY['c1000000-0000-0000-0000-000000000002']::uuid[])::text AS basis \gset
SELECT test_support.assert_true((:'basis'::jsonb ->> 'included_month_count')::int = 3, 'three months are in the basis');
SELECT test_support.assert_true((:'basis'::jsonb ->> 'average_monthly_essential')::numeric = 2000000, 'transfers do not raise the emergency-fund average');
SELECT test_support.assert_true((:'basis'::jsonb ->> 'skipped_other_currency_count')::int = 0, 'transfer legs are not skipped as another currency');

-- ---------------------------------------------------------------------------
-- Account removal and cleanup
-- ---------------------------------------------------------------------------
-- A referenced account cannot be deleted from under a transfer.
SELECT test_support.assert_rejected($q$DELETE FROM public.accounts WHERE id = 'a1000000-0000-0000-0000-000000000002'$q$, '23503');
-- Deleting a user removes both legs together without tripping the pair check.
SET CONSTRAINTS ALL IMMEDIATE;
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.transactions WHERE user_id = '00000000-0000-0000-0000-000000000003'),
  'deleting a user removes its transfer legs');

-- The baseline insert policy already refuses a row with no category, which is why a leg
-- cannot be inserted directly today. The restrictive policy must hold on its own, so
-- relax the permissive one (rolled back with everything else) and try again.
DROP POLICY transactions_insert_own ON public.transactions;
CREATE POLICY transactions_insert_own ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT test_support.assert_rejected($q$INSERT INTO public.transactions (account_id, type, amount, currency, occurred_at, transfer_id)
  VALUES ('a1000000-0000-0000-0000-000000000001', 'transfer_out', 10, 'IDR', now(), gen_random_uuid())$q$, '42501');
RESET ROLE;

-- Everything the RPCs wrote while the checks were deferred must also be consistent.
SET CONSTRAINTS ALL IMMEDIATE;

SELECT 'transfers: all assertions passed' AS result;
ROLLBACK;
