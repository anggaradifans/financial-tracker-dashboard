-- Run after fixture.sql and the migration in a disposable database.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA test_support;
GRANT USAGE ON SCHEMA test_support TO anon, authenticated, service_role;
CREATE FUNCTION test_support.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END $$;
CREATE FUNCTION test_support.assert_rejected(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected rejection: %', statement;
END $$;

SELECT test_support.assert_true((SELECT count(*) = 918 FROM public.transactions), 'transactions preserved');
SELECT test_support.assert_true((SELECT count(*) = 8 FROM public.accounts), 'accounts preserved');
SELECT test_support.assert_true((SELECT count(*) = 21 AND count(user_id) = 0 FROM public.categories), 'all existing categories stay shared');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.budgets), 'budget preserved');
SELECT test_support.assert_true(NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')
    AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')
), 'no unnecessary browser grants');

SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.transactions', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.accounts', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.categories', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.budgets', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.telegram_users', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.transaction_staging', '42501');
SELECT test_support.assert_rejected('TRUNCATE public.budgets', '42501');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT test_support.assert_true((SELECT count(*) = 900 FROM public.transactions), 'user A sees own transactions');
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.budgets), 'user A sees own budget');
SELECT test_support.assert_true((SELECT count(*) = 8 FROM public.accounts), 'shared accounts visible');
SELECT test_support.assert_true((SELECT count(*) = 21 FROM public.categories), 'shared defaults visible');
SELECT test_support.assert_rejected('TRUNCATE public.budgets', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.telegram_users', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.transaction_staging', '42501');

INSERT INTO public.accounts (name) VALUES ('New shared account');
DELETE FROM public.accounts WHERE name = 'New shared account';
SELECT test_support.assert_rejected($q$DELETE FROM public.accounts WHERE name = 'Account 1'$q$, '23503');
WITH deleted AS (DELETE FROM public.categories WHERE user_id IS NULL RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'shared defaults cannot be deleted');
WITH changed AS (UPDATE public.categories SET name = 'Changed' WHERE name = 'Default 1' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM changed), 'shared defaults cannot be changed');
SELECT test_support.assert_rejected($q$INSERT INTO public.categories(name,user_id) VALUES ('Illegal shared',NULL)$q$, '42501');
SELECT test_support.assert_rejected($q$INSERT INTO public.categories(name,user_id) VALUES ('Spoof owner','00000000-0000-0000-0000-000000000002')$q$, '42501');
INSERT INTO public.categories (id, name) VALUES ('30000000-0000-0000-0000-000000000001', 'Custom');
SELECT test_support.assert_true((SELECT user_id = auth.uid() FROM public.categories WHERE name = 'Custom'), 'custom category defaults to caller');
SELECT test_support.assert_rejected($q$INSERT INTO public.categories(name) VALUES ('Custom')$q$, '23505');
SELECT test_support.assert_rejected($q$UPDATE public.categories SET user_id = NULL WHERE name = 'Custom'$q$, '42501');
SELECT test_support.assert_rejected($q$UPDATE public.categories SET user_id = '00000000-0000-0000-0000-000000000002' WHERE name = 'Custom'$q$, '42501');

INSERT INTO public.transactions (id, category_id, type, amount, occurred_at)
VALUES ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'outcome', 10, now());
UPDATE public.transactions SET amount = 20, deleted_at = now() WHERE id = '40000000-0000-0000-0000-000000000001';
SELECT test_support.assert_true((SELECT amount = 20 AND deleted_at IS NOT NULL FROM public.transactions WHERE id = '40000000-0000-0000-0000-000000000001'), 'own transaction edit and soft delete');
SELECT test_support.assert_rejected($q$UPDATE public.transactions SET user_id = '00000000-0000-0000-0000-000000000002' WHERE id = '40000000-0000-0000-0000-000000000001'$q$, '42501');
INSERT INTO public.budgets (id, category_id, amount, period, start_date)
VALUES ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 100, 'monthly', now());
UPDATE public.budgets SET amount = 200 WHERE id = '50000000-0000-0000-0000-000000000001';
SELECT test_support.assert_true((SELECT amount = 200 FROM public.budgets WHERE id = '50000000-0000-0000-0000-000000000001'), 'own budget update');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_true((SELECT count(*) = 18 FROM public.transactions), 'user B cannot read user A transactions');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.budgets), 'user B cannot read user A budgets');
SELECT test_support.assert_true((SELECT count(*) = 21 FROM public.categories), 'user B cannot see user A custom category');
INSERT INTO public.categories(name) VALUES ('Custom');
SELECT test_support.assert_true((SELECT user_id = auth.uid() FROM public.categories WHERE name = 'Custom'), 'different users may reuse category names');
WITH changed AS (UPDATE public.transactions SET amount = 999 WHERE id = '40000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM changed), 'cannot update another user transaction');
WITH deleted AS (DELETE FROM public.transactions WHERE id = '40000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'cannot delete another user transaction');
WITH deleted AS (DELETE FROM public.budgets WHERE id = '50000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'cannot delete another user budget');
WITH deleted AS (DELETE FROM public.categories WHERE id = '30000000-0000-0000-0000-000000000001' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'cannot delete another user category');
SELECT test_support.assert_rejected($q$INSERT INTO public.transactions(category_id,type,amount,occurred_at) VALUES ('30000000-0000-0000-0000-000000000001','outcome',10,now())$q$, '42501');
SELECT test_support.assert_rejected($q$INSERT INTO public.transactions(category_id,type,amount,occurred_at,user_id) VALUES ('20000000-0000-0000-0000-000000000001','outcome',10,now(),'00000000-0000-0000-0000-000000000001')$q$, '42501');
SELECT test_support.assert_rejected($q$INSERT INTO public.budgets(category_id,amount,period,start_date) VALUES ('30000000-0000-0000-0000-000000000001',10,'monthly',now())$q$, '42501');
SELECT test_support.assert_rejected($q$UPDATE public.transactions SET category_id = '30000000-0000-0000-0000-000000000001' WHERE user_id = auth.uid()$q$, '42501');
DELETE FROM public.categories WHERE name = 'Custom';
SELECT test_support.assert_true((SELECT count(*) = 21 FROM public.categories), 'own unused category can be deleted');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
DELETE FROM public.transactions WHERE id = '40000000-0000-0000-0000-000000000001';
DELETE FROM public.budgets WHERE id = '50000000-0000-0000-0000-000000000001';
DELETE FROM public.categories WHERE id = '30000000-0000-0000-0000-000000000001';

SET LOCAL ROLE service_role;
SELECT test_support.assert_true((SELECT count(*) = 918 FROM public.transactions), 'backend access preserved');
INSERT INTO public.telegram_users (telegram_user_id, supabase_user_id)
VALUES (12345, '00000000-0000-0000-0000-000000000001');
INSERT INTO public.transaction_staging DEFAULT VALUES;
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.telegram_users), 'backend Telegram access preserved');
ROLLBACK;
SELECT 'All database access checks passed' AS result;
