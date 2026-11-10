\set ON_ERROR_STOP on
BEGIN;
\ir support.sql
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated, service_role;

-- Every original row and field survives, except account references that now point
-- at the corresponding owner's copy. Include soft-deleted history and pending receipts.
SELECT test_support.assert_true(
 NOT EXISTS (SELECT row - 'account_id' FROM public.security_before_transactions
             EXCEPT SELECT to_jsonb(t) - 'account_id' FROM public.transactions t)
 AND (SELECT count(*) FROM public.security_before_transactions) = (SELECT count(*) FROM public.transactions),
 'all transaction IDs and non-account fields are preserved');
SELECT test_support.assert_true(
 NOT EXISTS (SELECT row - 'account_id' - 'transfer_to_account_id' FROM public.security_before_staging
             EXCEPT SELECT to_jsonb(s) - 'account_id' - 'transfer_to_account_id' FROM public.transaction_staging s)
 AND (SELECT count(*) FROM public.security_before_staging) = (SELECT count(*) FROM public.transaction_staging),
 'all staging rows including unresolved owners survive unchanged apart from account endpoints');
SELECT test_support.assert_true(NOT EXISTS (
 SELECT row FROM public.security_before_accounts EXCEPT SELECT to_jsonb(a) - 'user_id' FROM public.accounts a),
 'every original account survives with all its original fields');
SELECT test_support.assert_true(NOT EXISTS (
 SELECT 1 FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id WHERE a.user_id IS DISTINCT FROM t.user_id),
 'each historical transaction references its owner account');
SELECT test_support.assert_true((SELECT count(*) = 5 FROM public.accounts WHERE user_id IN ('21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002')), 'shared accounts are copied for each owner, sole-owner account kept');
SELECT test_support.assert_true((SELECT count(*) = 3 FROM public.accounts WHERE user_id IS NULL AND id IN ('21a00000-0000-0000-0000-000000000001', '21a00000-0000-0000-0000-000000000002', '21a00000-0000-0000-0000-000000000003')), 'unowned originals retained');

SELECT test_support.assert_true((SELECT user_id = '21000000-0000-0000-0000-000000000001' FROM public.accounts WHERE id = '21a00000-0000-0000-0000-000000000004'), 'sole-owner account retains its original ID');

CREATE TABLE public.security_future_table (id integer);
CREATE SEQUENCE public.security_future_sequence;
CREATE FUNCTION public.security_future_function() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
SELECT test_support.assert_true(
 NOT has_table_privilege('anon', 'public.security_future_table', 'SELECT')
 AND NOT has_table_privilege('authenticated', 'public.security_future_table', 'TRUNCATE')
 AND NOT has_sequence_privilege('authenticated', 'public.security_future_sequence', 'USAGE')
 AND NOT has_function_privilege('anon', 'public.security_future_function()', 'EXECUTE')
 AND NOT has_function_privilege('authenticated', 'public.security_future_function()', 'EXECUTE'),
 'future objects do not inherit browser privileges or PUBLIC function execution');
SELECT test_support.assert_true(NOT has_table_privilege('authenticated', 'public.accounts', 'TRUNCATE'), 'browser cannot truncate accounts');

SELECT id AS own_from FROM public.accounts WHERE name = 'Shared history' AND user_id = '21000000-0000-0000-0000-000000000001' \gset
SELECT id AS own_to FROM public.accounts WHERE name = 'Single owner' AND user_id = '21000000-0000-0000-0000-000000000001' \gset
SELECT id AS other_from FROM public.accounts WHERE name = 'Shared history' AND user_id = '21000000-0000-0000-0000-000000000002' \gset
SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.accounts', '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT test_support.assert_true((SELECT count(*) = 3 FROM public.accounts), 'user one sees only own accounts');
INSERT INTO public.accounts (name) VALUES ('Browser account');
SELECT test_support.assert_rejected($q$INSERT INTO public.accounts (name, user_id) VALUES ('spoof', '21000000-0000-0000-0000-000000000002')$q$, '42501');
SELECT test_support.assert_rejected($q$INSERT INTO public.accounts (name, user_id) VALUES ('null', NULL)$q$, '23502');
DELETE FROM public.accounts WHERE user_id = '21000000-0000-0000-0000-000000000002';
SELECT test_support.assert_rejected(format($q$INSERT INTO public.transactions (account_id, category_id, type, amount, occurred_at) VALUES (%L, '21c00000-0000-0000-0000-000000000001', 'income', 1, now())$q$, :'other_from'), '23503');
SELECT test_support.assert_rejected(format($q$SELECT public.create_transfer(%L, %L, 10, 'IDR', now())$q$, :'own_from', :'other_from'), '22023');
SELECT public.create_transfer(:'own_from', :'own_to', 10, 'IDR', now()) AS transfer_id \gset
SELECT public.delete_transfer(:'transfer_id');
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.accounts), 'user two accounts survive attempted deletion');
INSERT INTO public.accounts (name) VALUES ('Browser account');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT test_support.assert_rejected(format($q$UPDATE public.transactions SET account_id = %L WHERE user_id = '21000000-0000-0000-0000-000000000001'$q$, :'other_from'), '23503');
SELECT public.backend_save_telegram_transaction('21000000-0000-0000-0000-000000000001', 21001,
 '{"accountName":"Bank","categoryName":"Security fixture","type":"outcome","amount":1,"occurred_at":"2026-11-09T12:00:00Z"}');
SELECT public.backend_save_telegram_transaction('21000000-0000-0000-0000-000000000002', 21002,
 '{"accountName":"Bank","categoryName":"Security fixture","type":"outcome","amount":1,"occurred_at":"2026-11-09T12:00:00Z"}');
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.accounts WHERE name = 'Bank'), 'Telegram creates separate same-name accounts');
SELECT id AS staged_id FROM public.transaction_staging WHERE description = 'pending transfer' \gset
SELECT test_support.assert_rejected(format($q$SELECT public.backend_revise_staged_transaction(%L, 2102, 'account', %L)$q$, :'staged_id', :'own_from'), 'P0001');
SELECT test_support.assert_rejected(format($q$SELECT public.backend_revise_staged_transaction(%L, 2102, 'transfer', %L)$q$, :'staged_id', :'own_to'), 'P0001');
SELECT test_support.assert_true(jsonb_array_length(public.backend_revise_staged_transaction(:'staged_id', 2102, 'accounts')->'choices') = 4, 'Telegram picker only includes owner accounts');
SELECT public.backend_process_staged_transaction(:'staged_id', 2102, 'confirm');
SELECT public.backend_process_staged_transaction(:'staged_id', 2102, 'confirm');
INSERT INTO public.transaction_staging (user_id, amount, occurred_at) VALUES ('21000000-0000-0000-0000-000000000001', 5, now()) RETURNING id AS fallback_id \gset
SELECT public.backend_process_staged_transaction(:'fallback_id', 2101, 'confirm');
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
