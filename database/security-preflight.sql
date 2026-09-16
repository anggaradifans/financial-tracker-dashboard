-- Run this single read-only statement in the Supabase SQL Editor.
-- One JSON result includes every section, even when the editor shows only the last result.
-- Account usage includes user IDs and counts, without emails or transaction details.
WITH columns_info AS (

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('transactions', 'accounts', 'categories', 'budgets', 'telegram_users')
ORDER BY table_name, ordinal_position
), rls_info AS (

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname
), policies_info AS (

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname
), grants_info AS (

SELECT table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type
), constraints_info AS (

SELECT c.relname AS table_name, k.conname AS constraint_name,
       pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k
JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('transactions', 'accounts', 'categories', 'budgets', 'telegram_users')
ORDER BY c.relname, k.conname
), triggers_info AS (

SELECT c.relname AS table_name, t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND ((n.nspname = 'public'
        AND c.relname IN ('transactions', 'accounts', 'categories', 'budgets', 'telegram_users'))
       OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY c.relname, t.tgname
), functions_info AS (

SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       p.proconfig AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname, arguments
), ownership_counts AS (

-- JSON field access also works when a table has no user_id column yet.
-- Missing ownership must be resolved from known owners before enforcing RLS.
SELECT 'transactions' AS table_name, count(*) AS total_rows,
       count(*) FILTER (WHERE to_jsonb(t)->>'user_id' IS NULL) AS rows_without_owner
FROM public.transactions t
UNION ALL
SELECT 'accounts', count(*), count(*) FILTER (WHERE to_jsonb(t)->>'user_id' IS NULL)
FROM public.accounts t
UNION ALL
SELECT 'categories', count(*), count(*) FILTER (WHERE to_jsonb(t)->>'user_id' IS NULL)
FROM public.categories t
UNION ALL
SELECT 'budgets', count(*), count(*) FILTER (WHERE to_jsonb(t)->>'user_id' IS NULL)
FROM public.budgets t
), account_user_usage AS (
SELECT account_id, user_id, count(*) AS transaction_count
FROM public.transactions
WHERE account_id IS NOT NULL
GROUP BY account_id, user_id
), account_usage AS (
SELECT a.id AS account_id, a.name AS account_name,
       to_jsonb(a)->>'user_id' AS current_owner,
       (SELECT count(DISTINCT u.user_id)
        FROM account_user_usage u WHERE u.account_id = a.id) AS distinct_transaction_users,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'user_id', u.user_id, 'transaction_count', u.transaction_count
       ) ORDER BY u.user_id)
       FROM account_user_usage u WHERE u.account_id = a.id), '[]'::jsonb) AS usage_by_user
FROM public.accounts a
ORDER BY a.name, a.id
)
SELECT jsonb_pretty(jsonb_build_object(
    'columns', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM columns_info r), '[]'::jsonb),
    'rls', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM rls_info r), '[]'::jsonb),
    'policies', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM policies_info r), '[]'::jsonb),
    'grants', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM grants_info r), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM constraints_info r), '[]'::jsonb),
    'triggers', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM triggers_info r), '[]'::jsonb),
    'functions', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM functions_info r), '[]'::jsonb),
    'ownership_counts', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM ownership_counts r), '[]'::jsonb),
    'account_usage', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM account_usage r), '[]'::jsonb)
)) AS security_audit;
