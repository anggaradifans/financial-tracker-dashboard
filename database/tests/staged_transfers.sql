-- Staged own-account transfers (supabase/migrations/20261031120000_staged_transfers.sql),
-- tested on the production baseline in a disposable database. The Telegram bot is the
-- service role, so the RPCs run as service_role. Everything rolls back at the end.
\set ON_ERROR_STOP on
BEGIN;
\ir support.sql

CREATE FUNCTION test_support.revise(p_staging uuid, p_telegram bigint, p_action text, p_choice uuid DEFAULT NULL, p_page integer DEFAULT 0)
  RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.backend_revise_staged_transaction(p_staging, p_telegram, p_action, p_choice, p_page)
$$;
CREATE FUNCTION test_support.process(p_staging uuid, p_telegram bigint, p_action text)
  RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.backend_process_staged_transaction(p_staging, p_telegram, p_action)
$$;
-- Readable by the service role under test without leaking table privileges into assertions.
CREATE FUNCTION test_support.leg_count(p_transfer uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.transactions WHERE transfer_id = p_transfer
$$;
CREATE FUNCTION test_support.balance(p_user uuid, p_account uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT balance FROM public.account_balances WHERE user_id = p_user AND account_id = p_account
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
-- u1 owns the receipts (Telegram 101), u2 is another linked user (202), u3's link is inactive (303).
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
INSERT INTO public.telegram_users (telegram_user_id, supabase_user_id, is_active) VALUES
  (101, '00000000-0000-0000-0000-0000000000a1', true),
  (202, '00000000-0000-0000-0000-0000000000a2', true),
  (303, '00000000-0000-0000-0000-0000000000a3', false);
INSERT INTO public.accounts (id, name, currency) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'Mandiri', 'IDR'),
  ('a2000000-0000-0000-0000-000000000002', 'BCA', 'IDR'),
  ('a2000000-0000-0000-0000-000000000003', 'SeaBank', 'IDR'),
  ('a2000000-0000-0000-0000-000000000004', 'USD Cash', 'USD');
-- enough extra accounts to need a second picker page (source + USD excluded, 2 + 10 = 12 choices)
INSERT INTO public.accounts (name, currency) SELECT 'Extra ' || lpad(n::text, 2, '0'), 'IDR' FROM generate_series(1, 10) n;
INSERT INTO public.categories (id, name, allowed_type, user_id) VALUES
  ('c2000000-0000-0000-0000-000000000001', 'Food', 'outcome', NULL);
-- a destination that only the receipt rejected below will ever point at
SELECT id AS spare_account FROM public.accounts WHERE name = 'Extra 01' \gset

-- Pending receipts, all u1's unless noted.
INSERT INTO public.transaction_staging (id, user_id, type, amount, currency, occurred_at, description, category_id, account_id) VALUES
  ('b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'outcome', 250000, 'IDR', '2026-10-30 10:00+07', 'To my BCA', 'c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'income', 100000, 'IDR', '2026-10-30 11:00+07', 'Incoming', NULL, 'a2000000-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'outcome', 50000, 'IDR', '2026-10-30 12:00+07', 'No account yet', NULL, NULL),
  ('b2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', 'outcome', 75000, 'IDR', '2026-10-30 13:00+07', 'Plain lunch', 'c2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1', 'outcome', 30000, 'IDR', '2026-10-30 14:00+07', 'To reject', NULL, 'a2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', 'outcome', 20000, 'IDR', '2026-10-30 15:00+07', 'Source in another currency', NULL, 'a2000000-0000-0000-0000-000000000004'),
  ('b2000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a1', 'outcome', 10000, 'USD', '2026-10-30 16:00+07', 'Dollar receipt', NULL, 'a2000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- Structure and grants
-- ---------------------------------------------------------------------------
SELECT test_support.assert_true((SELECT count(*) = 2 FROM information_schema.table_constraints
  WHERE table_schema = 'public' AND table_name = 'transaction_staging'
    AND constraint_name IN ('transaction_staging_transfer_type_check', 'transaction_staging_transfer_account_check')),
  'the staging transfer checks exist');
SELECT test_support.assert_true(
  NOT has_function_privilege('anon', 'public.transfers_create(uuid, uuid, uuid, numeric, text, timestamptz, text, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.transfers_create(uuid, uuid, uuid, numeric, text, timestamptz, text, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.transfers_create(uuid, uuid, uuid, numeric, text, timestamptz, text, uuid)', 'EXECUTE'),
  'only the service role can run transfers_create, which takes the owner as an argument');
SELECT test_support.assert_true(
  NOT has_function_privilege('anon', 'public.backend_revise_staged_transaction(uuid, bigint, text, uuid, integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.backend_revise_staged_transaction(uuid, bigint, text, uuid, integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.backend_revise_staged_transaction(uuid, bigint, text, uuid, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.backend_process_staged_transaction(uuid, bigint, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.backend_process_staged_transaction(uuid, bigint, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.backend_process_staged_transaction(uuid, bigint, text)', 'EXECUTE'),
  'replacing the two backend functions kept them service-role only');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
SELECT test_support.assert_rejected($q$SELECT public.transfers_create('00000000-0000-0000-0000-0000000000a2', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 1, 'IDR', now())$q$, '42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT test_support.assert_rejected($q$SELECT public.transfers_create('00000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 1, 'IDR', now())$q$, '42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Choosing a destination
-- ---------------------------------------------------------------------------
SELECT count(*) AS categories_before FROM public.categories \gset
SET LOCAL ROLE service_role;

-- the picker offers other accounts in the receipt's currency only, eight to a page
SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer_targets')::text AS page0 \gset
SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer_targets', NULL, 1)::text AS page1 \gset
SELECT test_support.assert_true(jsonb_array_length(:'page0'::jsonb -> 'choices') = 9, 'the first picker page has eight choices plus one that signals a next page');
SELECT test_support.assert_true(jsonb_array_length(:'page1'::jsonb -> 'choices') = 4, 'the second page holds the rest (12 choices in total)');
SELECT test_support.assert_true(NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements((:'page0'::jsonb -> 'choices') || (:'page1'::jsonb -> 'choices')) c
  WHERE c ->> 'name' IN ('Mandiri', 'USD Cash')), 'the source account and other currencies are not offered');
SELECT test_support.assert_true((:'page0'::jsonb ->> 'transferAccountName') IS NULL, 'no destination yet');
SELECT test_support.assert_true(jsonb_array_length(test_support.revise('b2000000-0000-0000-0000-000000000007', 101, 'transfer_targets') -> 'choices') = 0,
  'a USD receipt has no other USD account to offer');

SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', 'a2000000-0000-0000-0000-000000000002')::text AS chosen \gset
SELECT test_support.assert_true((:'chosen'::jsonb ->> 'transferAccountName') = 'BCA', 'the review shows the chosen destination');
SELECT test_support.assert_true((:'chosen'::jsonb -> 'stagingData' ->> 'transfer_to_account_id') = 'a2000000-0000-0000-0000-000000000002', 'the destination is stored on the staging row');
SELECT test_support.assert_true((test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'view') ->> 'transferAccountName') = 'BCA', 'viewing keeps the destination');

-- rejected selections
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', 'a2000000-0000-0000-0000-000000000001')$q$, 'P0001', 'Account unavailable as a transfer destination');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', 'a2000000-0000-0000-0000-000000000004')$q$, 'P0001', 'Account unavailable as a transfer destination');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', gen_random_uuid())$q$, 'P0001', 'Account unavailable as a transfer destination');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', NULL)$q$, 'P0001', 'Account unavailable as a transfer destination');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000002', 101, 'transfer', 'a2000000-0000-0000-0000-000000000001')$q$, 'P0001', 'Only an outgoing receipt%');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000002', 101, 'transfer_targets')$q$, 'P0001', 'Only an outgoing receipt%');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000003', 101, 'transfer', 'a2000000-0000-0000-0000-000000000001')$q$, 'P0001', 'Only an outgoing receipt%');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 202, 'transfer', 'a2000000-0000-0000-0000-000000000003')$q$, 'P0001', 'Transaction unavailable');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 303, 'transfer', 'a2000000-0000-0000-0000-000000000003')$q$, 'P0001', 'Active Telegram link required');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 999, 'transfer', 'a2000000-0000-0000-0000-000000000003')$q$, 'P0001', 'Active Telegram link required');

-- editing the source to the destination is refused; a third account is fine and keeps the transfer
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'account', 'a2000000-0000-0000-0000-000000000002')$q$, 'P0001', 'Choose a different account%');
SELECT test_support.assert_true((test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'account', 'a2000000-0000-0000-0000-000000000003') ->> 'transferAccountName') = 'BCA', 'changing the source keeps the destination');
SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'account', 'a2000000-0000-0000-0000-000000000001');

-- clearing returns it to an ordinary receipt
SELECT test_support.assert_true((test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'clear_transfer') -> 'stagingData' ->> 'transfer_to_account_id') IS NULL, 'clearing removes the destination');
SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', 'a2000000-0000-0000-0000-000000000002');
RESET ROLE;

-- the column survives writers that replace metadata wholesale
UPDATE public.transaction_staging SET metadata = '{"telegram_chat_id": "101"}'::jsonb WHERE id = 'b2000000-0000-0000-0000-000000000001';
SELECT test_support.assert_true((SELECT transfer_to_account_id = 'a2000000-0000-0000-0000-000000000002' FROM public.transaction_staging WHERE id = 'b2000000-0000-0000-0000-000000000001'),
  'overwriting metadata does not drop the transfer destination');

-- the CHECKs hold even for writers that skip the RPC
SELECT test_support.assert_rejected_like($q$UPDATE public.transaction_staging SET account_id = transfer_to_account_id WHERE id = 'b2000000-0000-0000-0000-000000000001'$q$, '23514', '%transaction_staging_transfer_account_check%');
SELECT test_support.assert_rejected_like($q$UPDATE public.transaction_staging SET type = 'income' WHERE id = 'b2000000-0000-0000-0000-000000000001'$q$, '23514', '%transaction_staging_transfer_type_check%');
SELECT test_support.assert_rejected_like($q$UPDATE public.transaction_staging SET account_id = NULL WHERE id = 'b2000000-0000-0000-0000-000000000001'$q$, '23514', '%transaction_staging_transfer_account_check%');
SELECT test_support.assert_rejected_like($q$UPDATE public.transaction_staging SET transfer_to_account_id = 'a2000000-0000-0000-0000-000000000001' WHERE id = 'b2000000-0000-0000-0000-000000000002'$q$, '23514', '%transaction_staging_transfer%');
SELECT test_support.assert_rejected($q$DELETE FROM public.accounts WHERE id = 'a2000000-0000-0000-0000-000000000002'$q$, '23503');

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
-- another linked user cannot confirm it
SELECT test_support.assert_rejected_like($q$SELECT test_support.process('b2000000-0000-0000-0000-000000000001', 202, 'confirm')$q$, 'P0001', 'Transaction unavailable');
SELECT test_support.process('b2000000-0000-0000-0000-000000000001', 101, 'confirm')::text AS confirmed \gset
RESET ROLE;

SELECT :'confirmed'::jsonb ->> 'transferId' AS transfer_id \gset
SELECT test_support.assert_true((:'confirmed'::jsonb -> 'txn' ->> 'type') = 'transfer_out', 'the result carries the debit leg as the saved transaction');
SELECT test_support.assert_true((:'confirmed'::jsonb ->> 'accountName') = 'Mandiri' AND (:'confirmed'::jsonb ->> 'transferToAccountName') = 'BCA',
  'the result names both accounts for the reply message');
SELECT test_support.assert_true(test_support.leg_count(:'transfer_id') = 2, 'confirming creates both legs');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.transactions
  WHERE transfer_id = :'transfer_id' AND type = 'transfer_out' AND account_id = 'a2000000-0000-0000-0000-000000000001' AND amount = 250000 AND currency = 'IDR'),
  'the debit leg is on the source account');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.transactions
  WHERE transfer_id = :'transfer_id' AND type = 'transfer_in' AND account_id = 'a2000000-0000-0000-0000-000000000002' AND amount = 250000 AND currency = 'IDR'),
  'the credit leg is on the destination account');
SELECT test_support.assert_true((SELECT bool_and(user_id = '00000000-0000-0000-0000-0000000000a1' AND category_id IS NULL AND description = 'To my BCA'
    AND occurred_at = '2026-10-30 10:00+07') FROM public.transactions WHERE transfer_id = :'transfer_id'),
  'both legs keep the receipt owner, time and description and have no category');
SELECT test_support.assert_true((SELECT status = 'confirmed' AND (metadata ->> 'transfer_id') = :'transfer_id'
    AND (metadata ->> 'transaction_id')::uuid = (:'confirmed'::jsonb -> 'txn' ->> 'id')::uuid
    FROM public.transaction_staging WHERE id = 'b2000000-0000-0000-0000-000000000001'),
  'the staging row records the transfer');
SELECT test_support.assert_true((SELECT count(*) FROM public.categories) = :categories_before, 'confirming a transfer creates no category');
SELECT test_support.assert_true(test_support.balance('00000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000001') = -250000
  AND test_support.balance('00000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-000000000002') = 250000,
  'balances move between the two accounts');

SET LOCAL ROLE service_role;
-- confirming twice (a Telegram retry) returns the same transfer without moving money again
SELECT test_support.process('b2000000-0000-0000-0000-000000000001', 101, 'confirm')::text AS replay \gset
SELECT test_support.assert_true((:'replay'::jsonb ->> 'transferId') = :'transfer_id'
  AND (:'replay'::jsonb -> 'txn' ->> 'id') = (:'confirmed'::jsonb -> 'txn' ->> 'id'), 'a repeated confirm returns the same transfer');
SELECT test_support.assert_true(test_support.leg_count(:'transfer_id') = 2, 'a repeated confirm adds no legs');
SELECT test_support.assert_rejected_like($q$SELECT test_support.process('b2000000-0000-0000-0000-000000000001', 101, 'reject')$q$, 'P0001', 'Already processed');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'clear_transfer')$q$, 'P0001', 'Already processed');
SELECT test_support.assert_rejected_like($q$SELECT test_support.revise('b2000000-0000-0000-0000-000000000001', 101, 'transfer', 'a2000000-0000-0000-0000-000000000003')$q$, 'P0001', 'Already processed');

-- rejecting a transfer receipt saves nothing
SELECT test_support.revise('b2000000-0000-0000-0000-000000000005', 101, 'transfer', :'spare_account');
SELECT count(*) AS legs_before FROM public.transactions WHERE transfer_id IS NOT NULL \gset
SELECT test_support.process('b2000000-0000-0000-0000-000000000005', 101, 'reject');
RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) FROM public.transactions WHERE transfer_id IS NOT NULL) = :legs_before
  AND (SELECT status FROM public.transaction_staging WHERE id = 'b2000000-0000-0000-0000-000000000005') = 'rejected',
  'rejecting a transfer receipt creates no legs');
SELECT test_support.assert_true((SELECT transfer_to_account_id IS NULL FROM public.transaction_staging WHERE id = 'b2000000-0000-0000-0000-000000000005'),
  'rejecting releases the destination account');
DELETE FROM public.accounts WHERE id = :'spare_account';
SELECT test_support.assert_true(NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = :'spare_account'),
  'an account that only a rejected receipt pointed at can still be deleted');

-- a failing confirm is all or nothing: a USD source account cannot send IDR
SET LOCAL ROLE service_role;
SELECT test_support.revise('b2000000-0000-0000-0000-000000000006', 101, 'transfer', 'a2000000-0000-0000-0000-000000000003');
SELECT test_support.assert_rejected_like($q$SELECT test_support.process('b2000000-0000-0000-0000-000000000006', 101, 'confirm')$q$, '22023', 'Both accounts must exist%');
RESET ROLE;
-- a pending receipt pins its destination: the foreign key refuses the delete
SELECT test_support.assert_rejected($q$DELETE FROM public.accounts WHERE id = 'a2000000-0000-0000-0000-000000000003'$q$, '23503');
SELECT test_support.assert_true((SELECT status = 'pending' FROM public.transaction_staging WHERE id = 'b2000000-0000-0000-0000-000000000006')
  AND (SELECT count(*) FROM public.transactions WHERE transfer_id IS NOT NULL) = :legs_before,
  'a failed transfer confirm leaves the receipt pending and creates nothing');

-- ---------------------------------------------------------------------------
-- Ordinary receipts are unchanged
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT test_support.process('b2000000-0000-0000-0000-000000000004', 101, 'confirm')::text AS plain \gset
RESET ROLE;
SELECT test_support.assert_true((:'plain'::jsonb -> 'txn' ->> 'type') = 'outcome' AND (:'plain'::jsonb ->> 'transferId') IS NULL,
  'a receipt without a destination still saves as spending');
SELECT test_support.assert_true((SELECT category_id = 'c2000000-0000-0000-0000-000000000001' AND transfer_id IS NULL AND account_id = 'a2000000-0000-0000-0000-000000000001'
    FROM public.transactions WHERE id = (:'plain'::jsonb -> 'txn' ->> 'id')::uuid),
  'the ordinary transaction keeps its category and account');

SELECT 'staged transfers: all assertions passed' AS result;
ROLLBACK;
