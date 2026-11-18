\set ON_ERROR_STOP on
BEGIN;
\ir support.sql
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated, service_role;
SELECT test_support.assert_true(NOT has_function_privilege('anon', 'public.admin_storage_status()', 'EXECUTE'), 'anonymous cannot read storage');
SELECT test_support.assert_true(NOT has_function_privilege('authenticated', 'public.collect_storage_sample()', 'EXECUTE'), 'browser cannot directly collect');
SELECT test_support.assert_true(NOT has_table_privilege('authenticated', 'public.storage_daily_samples', 'SELECT'), 'samples inaccessible directly');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT test_support.assert_rejected('SELECT public.admin_storage_status()', '42501');
SELECT test_support.assert_rejected('SELECT public.admin_export_financial_records()', '42501');
RESET ROLE;
UPDATE auth.users SET raw_app_meta_data = '{"role":"admin"}' WHERE id = '21000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT test_support.assert_true(public.is_storage_admin(), 'server-owned role grants access');
SELECT test_support.assert_true((public.admin_storage_status()->>'database_bytes')::bigint > 0, 'admin reads actual database size');
SELECT test_support.assert_true(jsonb_array_length(public.admin_storage_status()->'samples') = 1, 'refresh upserts one daily sample');
SELECT test_support.assert_true((public.admin_export_financial_records()::jsonb)->>'format_version' = '1', 'admin can export records');
RESET ROLE;
SELECT test_support.assert_true(public.storage_cluster_bytes() = (SELECT sum(pg_database_size(datname))::bigint FROM pg_database), 'combined metric includes every database');
SELECT test_support.assert_true(NOT has_function_privilege('authenticated', 'public.storage_cluster_bytes()', 'EXECUTE'), 'combined metric helper is private');
INSERT INTO public.storage_daily_samples(day, database_bytes, measurement_scope)
VALUES (current_date - 1, 123, 'current_database');
SET LOCAL ROLE authenticated;
SELECT test_support.assert_true((public.admin_storage_status()->>'measurement_scope') = 'all_databases', 'capacity declares combined scope');
SELECT test_support.assert_true((public.admin_storage_status()->>'database_bytes')::bigint > pg_database_size(current_database()), 'capacity includes other databases');
SELECT test_support.assert_true(jsonb_array_length(public.admin_storage_status()->'samples') = 1, 'old scope is excluded from growth history');
RESET ROLE;
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.storage_daily_samples), 'historical samples are preserved');
SELECT test_support.assert_true((SELECT measurement_scope = 'all_databases' FROM public.storage_daily_samples WHERE day = current_date), 'collector stores combined scope');

UPDATE auth.users SET raw_app_meta_data = '{}' WHERE id = '21000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT test_support.assert_rejected('SELECT public.admin_storage_status()', '42501');
SELECT test_support.assert_rejected('SELECT public.admin_export_financial_records()', '42501');
RESET ROLE;
ROLLBACK;
