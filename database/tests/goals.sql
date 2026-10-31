-- Goals schema (supabase/migrations/20261030120000_goals.sql), tested on the
-- production baseline in a disposable database. Runs as postgres and switches
-- roles the way PostgREST does. Everything rolls back at the end.
\set ON_ERROR_STOP on
BEGIN;
\ir support.sql

-- Month helpers: the calculation buckets by Asia/Jakarta calendar months, so the
-- fixture is built relative to "now" in that zone.
CREATE FUNCTION test_support.month_start(months_back integer) RETURNS timestamp LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') - make_interval(months => months_back)
$$;
CREATE FUNCTION test_support.at_local(local_ts timestamp) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT local_ts AT TIME ZONE 'Asia/Jakarta'
$$;
CREATE FUNCTION test_support.ids(names text[]) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT array_agg(id) FROM public.categories WHERE name = ANY (names)
$$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
-- u1: full history, u2: bystander, u3: history starts mid-window, u4: only two months.
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'), ('00000000-0000-0000-0000-000000000004');
INSERT INTO public.accounts (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'Main');
INSERT INTO public.categories (id, name, allowed_type, user_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Rent', 'outcome', NULL),
  ('20000000-0000-0000-0000-000000000002', 'Groceries', 'both', NULL),
  ('20000000-0000-0000-0000-000000000003', 'Dining', 'outcome', NULL),
  ('20000000-0000-0000-0000-000000000004', 'Salary', 'income', NULL),
  ('20000000-0000-0000-0000-000000000005', 'U2 Private', 'outcome', '00000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000006', 'Hobby', 'both', '00000000-0000-0000-0000-000000000001');

-- u1: Rent 5.0M + Groceries 2.0M + Dining 1.0M outcome and 30M salary in each of the
-- six completed months, plus an opening transaction before the window.
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description)
SELECT '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
       v.category_id, v.type::public.tx_type, v.amount, 'IDR',
       test_support.at_local(test_support.month_start(m) + interval '9 days 10 hours'), 'seed'
FROM generate_series(1, 6) AS m
CROSS JOIN (VALUES
  ('20000000-0000-0000-0000-000000000001'::uuid, 'outcome', 5000000::numeric),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'outcome', 2000000::numeric),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'outcome', 1000000::numeric),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'income', 30000000::numeric)
) AS v(category_id, type, amount);
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description, deleted_at)
VALUES
  -- history begins before the window, so no window month is "incomplete"
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'outcome', 1000, 'IDR', test_support.at_local(test_support.month_start(8) + interval '5 days'), 'opening', NULL),
  -- a refund lands three months back, in a category that accepts income
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'income', 300000, 'IDR', test_support.at_local(test_support.month_start(3) + interval '12 days'), 'refund', NULL),
  -- 0.10 + 0.20 must be exactly 0.30, not 0.30000000000000004
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'outcome', 0.10, 'IDR', test_support.at_local(test_support.month_start(2) + interval '12 days'), 'decimal', NULL),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'outcome', 0.20, 'IDR', test_support.at_local(test_support.month_start(2) + interval '13 days'), 'decimal', NULL),
  -- another currency is skipped and counted
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'outcome', 100, 'USD', test_support.at_local(test_support.month_start(2) + interval '14 days'), 'usd', NULL),
  -- a soft-deleted transaction is ignored
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'outcome', 9999999, 'IDR', test_support.at_local(test_support.month_start(1) + interval '14 days'), 'deleted', now()),
  -- 00:30 Jakarta on the 1st is still the previous month in UTC; it belongs to the Jakarta month
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'outcome', 1000, 'IDR', test_support.at_local(test_support.month_start(1) + interval '30 minutes'), 'boundary', NULL),
  -- the current month is still in progress and must stay out of the basis
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'outcome', 8000000, 'IDR', now(), 'current month', NULL);

INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description)
VALUES
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'outcome', 5000000, 'IDR', test_support.at_local(test_support.month_start(1) + interval '9 days'), 'u2 rent');
-- u3: first transaction on day 10 of month -4, so that month is incomplete history; months -6/-5 are empty.
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description)
SELECT '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000001', 'outcome', 3000000, 'IDR',
       test_support.at_local(test_support.month_start(m) + interval '9 days 10 hours'), 'u3 rent'
FROM generate_series(1, 4) AS m;
-- u4: history starts exactly at the start of month -2, but that is only two months.
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, currency, occurred_at, description)
SELECT '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000001', 'outcome', 3000000, 'IDR',
       test_support.at_local(test_support.month_start(m)), 'u4 rent'
FROM generate_series(1, 2) AS m;

SELECT id AS rent_tx FROM public.transactions WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND category_id = '20000000-0000-0000-0000-000000000001' AND description = 'seed'
  AND occurred_at >= test_support.at_local(test_support.month_start(1)) AND occurred_at < test_support.at_local(test_support.month_start(0)) \gset
SELECT id AS groceries_m1_tx FROM public.transactions WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND category_id = '20000000-0000-0000-0000-000000000002' AND description = 'seed'
  AND occurred_at >= test_support.at_local(test_support.month_start(1)) AND occurred_at < test_support.at_local(test_support.month_start(0)) \gset
SELECT id AS groceries_m2_tx FROM public.transactions WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND category_id = '20000000-0000-0000-0000-000000000002' AND description = 'seed'
  AND occurred_at >= test_support.at_local(test_support.month_start(2)) AND occurred_at < test_support.at_local(test_support.month_start(1)) \gset
SELECT id AS usd_tx FROM public.transactions WHERE description = 'usd' \gset
SELECT id AS deleted_tx FROM public.transactions WHERE description = 'deleted' \gset
SELECT id AS u2_tx FROM public.transactions WHERE description = 'u2 rent' \gset

-- ---------------------------------------------------------------------------
-- Structure and grants
-- ---------------------------------------------------------------------------
SELECT test_support.assert_true((SELECT count(*) = 5 FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relrowsecurity
    AND relname IN ('goals', 'goal_contributions', 'goal_recommendations', 'goal_recommendation_months', 'goal_recommendation_categories')),
  'row-level security is enabled on every goal table');
SELECT test_support.assert_true((SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'public.goal_progress'::regclass),
  'goal_progress runs with the caller privileges');
SELECT test_support.assert_true(NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
), 'no unnecessary browser grants on any public relation');
SELECT test_support.assert_true(NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND grantee IN ('anon', 'PUBLIC')
    AND table_name IN ('goals', 'goal_contributions', 'goal_recommendations', 'goal_recommendation_months', 'goal_recommendation_categories', 'goal_progress')
), 'anon has no goal privileges');
SELECT test_support.assert_true(
  NOT has_function_privilege('anon', 'public.preview_emergency_fund_basis(integer, uuid[], numeric, text, date)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.preview_emergency_fund_basis(integer, uuid[], numeric, text, date)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.create_emergency_fund_goal(text, text, date, numeric, integer, uuid[], numeric, numeric, numeric, date)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.accept_emergency_fund_recommendation(uuid, integer, uuid[], numeric, numeric, numeric, date)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.goals_basis(uuid, text, integer, numeric, uuid[], date, timestamptz, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.goals_store_recommendation(uuid, uuid, jsonb, numeric)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.goals_accepted_target(jsonb, numeric, numeric)', 'EXECUTE'),
  'only the three RPCs are callable from the browser');

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.goals', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.goal_contributions', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.goal_recommendations', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.goal_recommendation_months', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.goal_recommendation_categories', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.goal_progress', '42501');
SELECT test_support.assert_rejected('SELECT public.preview_emergency_fund_basis()', '42501');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Preview (u1)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SELECT public.preview_emergency_fund_basis(6, test_support.ids('{Rent,Groceries}'), 6)::text AS preview \gset
SELECT test_support.assert_true((:'preview'::jsonb ->> 'included_month_count')::int = 6, 'six completed months are in the basis');
SELECT test_support.assert_true((:'preview'::jsonb ->> 'average_monthly_essential')::numeric = 6950000.05, 'average is exact to the cent');
SELECT test_support.assert_true((:'preview'::jsonb ->> 'suggested_target')::numeric = 41700000.30, '0.10 + 0.20 sums to 0.30 exactly');
SELECT test_support.assert_true((:'preview'::jsonb ->> 'skipped_other_currency_count')::int = 1, 'other-currency transactions are counted and skipped');
SELECT test_support.assert_true((:'preview'::jsonb ->> 'period_start')::date = test_support.month_start(6)::date, 'window starts six months back');
SELECT test_support.assert_true((:'preview'::jsonb ->> 'period_end')::date = test_support.month_start(0)::date - 1, 'window ends before the current month');
SELECT test_support.assert_true((:'preview'::jsonb #>> '{months,3,refunds}')::numeric = 300000
  AND (:'preview'::jsonb #>> '{months,3,basis_amount}')::numeric = 6700000, 'a refund lowers the month it lands in');
SELECT test_support.assert_true((:'preview'::jsonb #>> '{months,5,included_spend}')::numeric = 7000000, 'soft-deleted and current-month transactions are ignored');
SELECT test_support.assert_true((:'preview'::jsonb #>> '{months,5,excluded_spend}')::numeric = 1001000
  AND (:'preview'::jsonb #>> '{months,4,excluded_spend}')::numeric = 1000000, 'month boundaries follow Asia/Jakarta, not UTC');
SELECT test_support.assert_true(jsonb_array_length(:'preview'::jsonb -> 'categories') = 3
  AND (SELECT bool_and(c ->> 'category_name' IN ('Rent', 'Groceries', 'Dining')) FROM jsonb_array_elements(:'preview'::jsonb -> 'categories') c),
  'only outcome-capable categories the caller can see are offered');
SELECT test_support.assert_true((SELECT sum((c ->> 'avg_monthly_amount')::numeric) FROM jsonb_array_elements(:'preview'::jsonb -> 'categories') c WHERE (c ->> 'included')::boolean) = 6950000.05,
  'included category averages add up to the monthly average');
SELECT test_support.assert_true((SELECT (c ->> 'avg_monthly_amount')::numeric = 1000166.67 AND NOT (c ->> 'included')::boolean
  FROM jsonb_array_elements(:'preview'::jsonb -> 'categories') c WHERE c ->> 'category_name' = 'Dining'),
  'an excluded category still shows its own average');

SELECT public.preview_emergency_fund_basis(3, test_support.ids('{Rent,Groceries}'), 6)::text AS preview3 \gset
SELECT test_support.assert_true((:'preview3'::jsonb ->> 'average_monthly_essential')::numeric = 6900000.10
  AND (:'preview3'::jsonb ->> 'suggested_target')::numeric = 41400000.60, 'basis can be changed to three months');
SELECT test_support.assert_true((public.preview_emergency_fund_basis(6, test_support.ids('{Rent,Groceries}'), 6.25) ->> 'multiplier')::numeric = 6.3, 'multiplier is rounded to the stored precision');
SELECT test_support.assert_true((public.preview_emergency_fund_basis(6, NULL, 6) ->> 'suggested_target') IS NULL
  AND jsonb_array_length(public.preview_emergency_fund_basis(6, NULL, 6) -> 'categories') = 3,
  'with nothing selected there is no suggestion but categories are listed');
SELECT test_support.assert_true((public.preview_emergency_fund_basis(6, test_support.ids('{Rent,Groceries}'), 6, 'USD') ->> 'suggested_target') IS NULL
  AND (public.preview_emergency_fund_basis(6, test_support.ids('{Rent,Groceries}'), 6, 'USD') ->> 'skipped_other_currency_count')::int > 1,
  'a currency with too little data gets no suggestion');

SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(0)$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(13)$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(6, NULL, 0)$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(6, NULL, 6, 'idr')$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(6, test_support.ids('{Salary}'))$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis(6, test_support.ids('{U2 Private}'))$q$, '22023');
SELECT test_support.assert_rejected(format($q$SELECT public.preview_emergency_fund_basis(6, NULL, 6, 'IDR', %L)$q$, test_support.month_start(6)::date + 1), '22023');
SELECT test_support.assert_rejected(format($q$SELECT public.preview_emergency_fund_basis(6, NULL, 6, 'IDR', %L)$q$, test_support.month_start(5)::date), '22023');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT test_support.assert_rejected($q$SELECT public.preview_emergency_fund_basis()$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Creating the goal and its snapshot (u1)
-- ---------------------------------------------------------------------------
SELECT test_support.assert_rejected_like(
  $q$SELECT public.create_emergency_fund_goal('Emergency Fund', 'IDR', '2027-12-31', 3000000, 6, test_support.ids('{Rent,Groceries}'), 6, 7000000)$q$,
  '40001', '%changed since it was previewed%');
SELECT test_support.assert_rejected_like(
  $q$SELECT public.create_emergency_fund_goal('Emergency Fund', 'IDR', '2027-12-31', 3000000, 6, NULL, 6, NULL)$q$,
  '22023', '%Not enough history%');

SELECT public.create_emergency_fund_goal('Emergency Fund', 'IDR', '2027-12-31', 3000000, 6,
  test_support.ids('{Rent,Groceries,Hobby}'), 6, 6950000.05) AS goal \gset
SELECT test_support.assert_true((SELECT kind = 'emergency_fund' AND target_amount = 41700000.30 AND status = 'active'
  AND user_id = auth.uid() AND currency = 'IDR' AND target_date = '2027-12-31' AND planned_monthly_amount = 3000000
  FROM public.goals WHERE id = :'goal'), 'goal stores the accepted target');
SELECT test_support.assert_true((SELECT count(*) = 1 AND bool_and(superseded_at IS NULL) FROM public.goal_recommendations WHERE goal_id = :'goal'), 'one current snapshot');
SELECT test_support.assert_true((SELECT accepted_target = 41700000.30 AND suggested_target = 41700000.30 AND average_monthly_essential = 6950000.05
  AND basis_months = 6 AND multiplier = 6.0 AND included_month_count = 6 AND timezone = 'Asia/Jakarta' AND calc_version = 1
  AND period_start = test_support.month_start(6)::date AND skipped_other_currency_count = 1
  FROM public.goal_recommendations WHERE goal_id = :'goal'), 'snapshot stores inputs and result');
SELECT test_support.assert_true((SELECT count(*) = 6 AND sum(basis_amount) FILTER (WHERE included) = 41700000.30
  FROM public.goal_recommendation_months m JOIN public.goal_recommendations r ON r.id = m.recommendation_id WHERE r.goal_id = :'goal'), 'snapshot stores the monthly breakdown');
SELECT test_support.assert_true((SELECT count(*) = 4 AND count(*) FILTER (WHERE included) = 3
  FROM public.goal_recommendation_categories c JOIN public.goal_recommendations r ON r.id = c.recommendation_id WHERE r.goal_id = :'goal'), 'snapshot stores categories with their include flags');
SELECT test_support.assert_rejected_like(
  $q$SELECT public.create_emergency_fund_goal('Another', 'IDR', NULL, NULL, 6, test_support.ids('{Rent,Groceries}'), 6, 6950000.05)$q$,
  '23505', '%goals_one_active_emergency_fund%');

-- ---------------------------------------------------------------------------
-- Direct writes are limited to what the browser needs (u1)
-- ---------------------------------------------------------------------------
SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount) VALUES ('emergency_fund', 'Sneaky', 1000)$q$, '42501');
SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount, user_id) VALUES ('custom', 'Spoof', 1000, '00000000-0000-0000-0000-000000000002')$q$, '42501');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.goals (kind, name, target_amount, currency) VALUES ('custom', 'Bad', 1000, 'idr')$q$, '23514', '%goals_currency_check%');
SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount) VALUES ('custom', 'Zero', 0)$q$, '23514');
SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount) VALUES ('custom', '  ', 1000)$q$, '23514');
INSERT INTO public.goals (kind, name, description, target_amount, target_date, currency)
  VALUES ('custom', 'Japan Trip', 'Travel', 45000000, '2027-06-30', 'IDR') RETURNING id AS custom_goal \gset
INSERT INTO public.goals (kind, name, target_amount) VALUES ('custom', 'Scratch', 5000) RETURNING id AS scratch_goal \gset
UPDATE public.goals SET name = 'Trip to Japan', target_amount = 50000000 WHERE id = :'custom_goal';
SELECT test_support.assert_true((SELECT name = 'Trip to Japan' AND target_amount = 50000000 AND updated_at >= created_at FROM public.goals WHERE id = :'custom_goal'), 'custom goal can be edited directly');
SELECT test_support.assert_rejected(format($q$UPDATE public.goals SET currency = 'USD' WHERE id = %L$q$, :'custom_goal'), '42501');
SELECT test_support.assert_rejected(format($q$UPDATE public.goals SET completed_at = now() WHERE id = %L$q$, :'custom_goal'), '42501');
SELECT test_support.assert_rejected_like(format($q$UPDATE public.goals SET target_amount = 1 WHERE id = %L$q$, :'goal'), '23514', '%follows its accepted recommendation%');
UPDATE public.goals SET name = 'Safety net', planned_monthly_amount = 3500000 WHERE id = :'goal';
SELECT test_support.assert_true((SELECT name = 'Safety net' AND target_amount = 41700000.30 FROM public.goals WHERE id = :'goal'), 'other emergency-fund fields stay editable');
UPDATE public.goals SET status = 'completed' WHERE id = :'custom_goal';
SELECT test_support.assert_true((SELECT completed_at IS NOT NULL FROM public.goals WHERE id = :'custom_goal'), 'completing a goal stamps completed_at');
UPDATE public.goals SET status = 'active' WHERE id = :'custom_goal';
SELECT test_support.assert_true((SELECT completed_at IS NULL FROM public.goals WHERE id = :'custom_goal'), 'reopening clears completed_at');

SELECT test_support.assert_rejected(format($q$INSERT INTO public.goal_recommendations (goal_id, timezone, basis_months, multiplier, period_start, period_end, computed_at, included_month_count, average_monthly_essential, suggested_target, accepted_target) VALUES (%L, 'UTC', 6, 6, '2026-01-01', '2026-06-30', now(), 6, 1, 1, 1)$q$, :'goal'), '42501');
SELECT test_support.assert_rejected($q$UPDATE public.goal_recommendations SET accepted_target = 1$q$, '42501');
SELECT test_support.assert_rejected($q$DELETE FROM public.goal_recommendations$q$, '42501');
SELECT test_support.assert_rejected($q$UPDATE public.goal_recommendation_months SET basis_amount = 1$q$, '42501');
SELECT test_support.assert_rejected($q$DELETE FROM public.goal_recommendation_months$q$, '42501');
SELECT test_support.assert_rejected($q$UPDATE public.goal_recommendation_categories SET included = false$q$, '42501');
SELECT test_support.assert_rejected($q$DELETE FROM public.goal_recommendation_categories$q$, '42501');
SELECT test_support.assert_rejected($q$TRUNCATE public.goals$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.goals_basis('00000000-0000-0000-0000-000000000001', 'IDR', 6, 6, NULL)$q$, '42501');
SELECT test_support.assert_rejected(format($q$SELECT public.goals_store_recommendation(%L, '00000000-0000-0000-0000-000000000001', '{}', 1)$q$, :'goal'), '42501');

-- ---------------------------------------------------------------------------
-- Contributions and progress (u1)
-- ---------------------------------------------------------------------------
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, description) VALUES
  (:'goal', '2026-10-05', 10000000.50, 'Manual transfer'),
  (:'goal', '2026-10-25', 5000000.25, 'Freelance bonus'),
  (:'goal', '2026-10-26', -1200000.00, 'Withdrawal - car repair');
SELECT test_support.assert_true((SELECT saved_amount = 13800000.75 AND remaining_amount = 27899999.55 AND progress_percent = 33.1
  AND contribution_count = 3 AND months_of_coverage = 2.0 AND last_contributed_on = '2026-10-26' AND recommendation_id IS NOT NULL
  FROM public.goal_progress WHERE goal_id = :'goal'), 'progress is derived from contributions and the accepted average');
SELECT test_support.assert_true((SELECT saved_amount = 0 AND progress_percent = 0 AND months_of_coverage IS NULL AND recommendation_id IS NULL
  FROM public.goal_progress WHERE goal_id = :'custom_goal'), 'a goal with no contributions or snapshot has zero progress');
SELECT test_support.assert_rejected($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES ('00000000-0000-0000-0000-00000000dead', '2026-10-26', 1)$q$, '23503');
SELECT test_support.assert_rejected(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES (%L, '2026-10-26', 0)$q$, :'goal'), '23514');
SELECT test_support.assert_rejected(format($q$UPDATE public.goal_contributions SET amount = 1 WHERE goal_id = %L$q$, :'goal'), '42501');
UPDATE public.goal_contributions SET description = 'Renamed' WHERE description = 'Manual transfer';
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.goal_contributions WHERE description = 'Renamed'), 'description can be corrected');

-- A withdrawal can never exceed the saved amount, and neither can removing a deposit.
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES (%L, '2026-10-27', -99999999)$q$, :'goal'), '23514', '%balance cannot go below zero%');
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES (:'scratch_goal', '2026-10-01', 1000), (:'scratch_goal', '2026-10-02', -600);
SELECT test_support.assert_rejected_like(format($q$DELETE FROM public.goal_contributions WHERE goal_id = %L AND amount > 0$q$, :'scratch_goal'), '23514', '%balance cannot go below zero%');
DELETE FROM public.goal_contributions WHERE goal_id = :'scratch_goal' AND amount < 0;
DELETE FROM public.goal_contributions WHERE goal_id = :'scratch_goal' AND amount > 0;
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_contributions WHERE goal_id = :'scratch_goal'), 'a withdrawal can be removed, then the deposit');

-- Linking to a transaction is explicit and bounded by that transaction's amount.
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, description, transaction_id)
  VALUES (:'goal', '2026-10-28', 3000000, 'From rent transfer', :'rent_tx');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-28', 2500000, %L)$q$, :'custom_goal', :'rent_tx'),
  '23514', '%exceed the transaction amount%');
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (:'custom_goal', '2026-10-28', 2000000, :'rent_tx');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-28', 1, %L)$q$, :'scratch_goal', :'rent_tx'),
  '23514', '%exceed the transaction amount%');
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (:'goal', '2026-10-28', 500000, :'groceries_m1_tx');
SELECT test_support.assert_rejected(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-29', 100000, %L)$q$, :'goal', :'groceries_m1_tx'), '23505');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-29', 10, %L)$q$, :'goal', :'usd_tx'), '23514', '%currency must match%');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-29', 10, %L)$q$, :'goal', :'deleted_tx'), '23514', '%transaction unavailable%');
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-29', 10, %L)$q$, :'goal', :'u2_tx'), '23514', '%transaction unavailable%');
SELECT saved_amount AS saved_before FROM public.goal_progress WHERE goal_id = :'goal' \gset
SELECT test_support.assert_true(:saved_before = 17300000.75, 'linked contributions count toward the goal');

-- ---------------------------------------------------------------------------
-- Frozen snapshot, deliberate refresh (u1)
-- ---------------------------------------------------------------------------
SELECT id AS rec0 FROM public.goal_recommendations WHERE goal_id = :'goal' AND superseded_at IS NULL \gset
SELECT period_start AS frozen_start FROM public.goal_recommendations WHERE id = :'rec0' \gset
-- An edit to a past transaction does not move the accepted recommendation.
UPDATE public.transactions SET amount = amount + 1000000 WHERE id = :'groceries_m2_tx';
SELECT test_support.assert_true((SELECT accepted_target = 41700000.30 AND average_monthly_essential = 6950000.05 FROM public.goal_recommendations WHERE id = :'rec0'), 'accepted recommendation ignores later edits');
SELECT test_support.assert_true((SELECT target_amount = 41700000.30 FROM public.goals WHERE id = :'goal'), 'goal target ignores later edits');
SELECT test_support.assert_true((SELECT sum(basis_amount) = 41700000.30 FROM public.goal_recommendation_months WHERE recommendation_id = :'rec0' AND included), 'stored months ignore later edits');
-- The same frozen window, recalculated now, shows what changed.
SELECT public.preview_emergency_fund_basis(6, test_support.ids('{Rent,Groceries}'), 6, 'IDR', :'frozen_start')::text AS refreshed \gset
SELECT test_support.assert_true((:'refreshed'::jsonb ->> 'average_monthly_essential')::numeric = 7116666.72
  AND (:'refreshed'::jsonb ->> 'suggested_target')::numeric = 42700000.30
  AND (:'refreshed'::jsonb ->> 'period_start')::date = :'frozen_start'::date, 'refresh previews the frozen window with current data');
SELECT test_support.assert_rejected_like(format($q$SELECT public.accept_emergency_fund_recommendation(%L, 6, test_support.ids('{Rent,Groceries}'), 6, 6950000.05, NULL, %L)$q$, :'goal', :'frozen_start'),
  '40001', '%changed since it was previewed%');
SELECT public.accept_emergency_fund_recommendation(:'goal', 6, test_support.ids('{Rent,Groceries}'), 6, 7116666.72, NULL, :'frozen_start'::date) AS rec1 \gset
SELECT test_support.assert_true((SELECT superseded_at IS NOT NULL AND accepted_target = 41700000.30 FROM public.goal_recommendations WHERE id = :'rec0'), 'old snapshot is superseded, not rewritten');
SELECT test_support.assert_true((SELECT count(*) = 6 AND sum(basis_amount) FILTER (WHERE included) = 41700000.30 FROM public.goal_recommendation_months WHERE recommendation_id = :'rec0'), 'old monthly breakdown is preserved');
SELECT test_support.assert_true((SELECT count(*) = 2 AND count(*) FILTER (WHERE superseded_at IS NULL) = 1 FROM public.goal_recommendations WHERE goal_id = :'goal'), 'exactly one current snapshot');
SELECT test_support.assert_true((SELECT target_amount = 42700000.30 FROM public.goals WHERE id = :'goal'), 'refresh moves the goal target');
SELECT test_support.assert_true((SELECT recommendation_id = :'rec1' AND average_monthly_essential = 7116666.72 AND saved_amount = :saved_before
  AND months_of_coverage = round(:saved_before / 7116666.72, 1) FROM public.goal_progress WHERE goal_id = :'goal'),
  'coverage follows the new average while the saved amount stays');
-- The user may override the target; the computed suggestion is still recorded.
SELECT public.accept_emergency_fund_recommendation(:'goal', 6, test_support.ids('{Rent,Groceries,Hobby}'), 6, 7116666.72, 50000000, :'frozen_start'::date) AS rec2 \gset
SELECT test_support.assert_true((SELECT accepted_target = 50000000 AND suggested_target = 42700000.30 FROM public.goal_recommendations WHERE id = :'rec2'), 'override is kept next to the suggestion');
SELECT test_support.assert_true((SELECT target_amount = 50000000 FROM public.goals WHERE id = :'goal'), 'goal follows the overridden target');
SELECT test_support.assert_rejected($q$SELECT public.accept_emergency_fund_recommendation('00000000-0000-0000-0000-00000000dead', 6, NULL, 6, 1)$q$, 'P0002');
-- Deleting an unused category keeps the snapshot row and its name.
DELETE FROM public.categories WHERE name = 'Hobby';
SELECT test_support.assert_true((SELECT category_id IS NULL AND included FROM public.goal_recommendation_categories WHERE recommendation_id = :'rec2' AND category_name = 'Hobby'), 'snapshot keeps a deleted category by name');
-- A finished or archived goal cannot take a new recommendation.
UPDATE public.goals SET status = 'archived' WHERE id = :'goal';
SELECT test_support.assert_rejected(format($q$SELECT public.accept_emergency_fund_recommendation(%L, 6, test_support.ids('{Rent,Groceries}'), 6, 7116666.72, NULL, %L)$q$, :'goal', :'frozen_start'), 'P0002');
UPDATE public.goals SET status = 'active' WHERE id = :'goal';

-- Deleting a linked transaction never changes the goal: a soft delete keeps the
-- link, a hard delete clears it (done last because both fall inside the window).
UPDATE public.transactions SET deleted_at = now() WHERE id = :'groceries_m1_tx';
SELECT test_support.assert_true((SELECT transaction_id = :'groceries_m1_tx' FROM public.goal_contributions WHERE description IS NULL AND amount = 500000), 'soft-deleted transaction stays linked');
DELETE FROM public.transactions WHERE id = :'rent_tx';
SELECT test_support.assert_true((SELECT count(*) = 2 AND count(transaction_id) = 0 AND bool_and(user_id = auth.uid()) FROM public.goal_contributions WHERE amount IN (3000000, 2000000)), 'hard-deleted transaction clears only the link');
SELECT test_support.assert_true((SELECT saved_amount = :saved_before FROM public.goal_progress WHERE goal_id = :'goal'), 'saved amount is unchanged by transaction deletes');
-- The accepted target is also untouched by those deletions.
SELECT test_support.assert_true((SELECT target_amount = 50000000 FROM public.goals WHERE id = :'goal'), 'transaction deletes do not move the accepted target');

-- ---------------------------------------------------------------------------
-- Another user sees and changes nothing (u2)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goals), 'u2 sees no goals');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_contributions), 'u2 sees no contributions');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_recommendations), 'u2 sees no snapshots');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_recommendation_months), 'u2 sees no snapshot months');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_recommendation_categories), 'u2 sees no snapshot categories');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_progress), 'u2 sees no progress');
WITH changed AS (UPDATE public.goals SET name = 'Hijacked' WHERE id = :'goal' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM changed), 'u2 cannot edit u1 goal');
WITH deleted AS (DELETE FROM public.goals WHERE id = :'goal' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'u2 cannot delete u1 goal');
WITH deleted AS (DELETE FROM public.goal_contributions WHERE goal_id = :'goal' RETURNING id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM deleted), 'u2 cannot delete u1 contributions');
SELECT test_support.assert_rejected(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES (%L, '2026-10-30', 1)$q$, :'goal'), '23503');
SELECT test_support.assert_rejected(format($q$INSERT INTO public.goal_contributions (goal_id, user_id, contributed_on, amount) VALUES (%L, '00000000-0000-0000-0000-000000000001', '2026-10-30', 1)$q$, :'goal'), '42501');
SELECT test_support.assert_rejected(format($q$SELECT public.accept_emergency_fund_recommendation(%L, 6, test_support.ids('{Rent}'), 6, 5000000)$q$, :'goal'), 'P0002');
INSERT INTO public.goals (kind, name, target_amount) VALUES ('custom', 'u2 goal', 1000) RETURNING id AS u2_goal \gset
SELECT test_support.assert_rejected_like(format($q$INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES (%L, '2026-10-30', 10, %L)$q$, :'u2_goal', :'groceries_m2_tx'), '23514', '%transaction unavailable%');
SELECT public.preview_emergency_fund_basis(6, test_support.ids('{Rent}'), 6)::text AS u2_preview \gset
SELECT test_support.assert_true((:'u2_preview'::jsonb #>> '{months,5,included_spend}')::numeric = 5000000
  AND (:'u2_preview'::jsonb #>> '{months,5,exclusion_reason}') = 'incomplete_history'
  AND (:'u2_preview'::jsonb #>> '{months,4,exclusion_reason}') = 'no_data', 'u2 preview only reads u2 transactions');

-- ---------------------------------------------------------------------------
-- Sparse history (u3, u4)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
SELECT public.preview_emergency_fund_basis(6, test_support.ids('{Rent}'), 6)::text AS sparse \gset
SELECT test_support.assert_true((SELECT array_agg(coalesce(m ->> 'exclusion_reason', 'included') ORDER BY m ->> 'month') = ARRAY['no_data', 'no_data', 'incomplete_history', 'included', 'included', 'included']
  FROM jsonb_array_elements(:'sparse'::jsonb -> 'months') m), 'empty and partial first months are left out and flagged');
SELECT test_support.assert_true((:'sparse'::jsonb ->> 'included_month_count')::int = 3
  AND (:'sparse'::jsonb ->> 'average_monthly_essential')::numeric = 3000000
  AND (:'sparse'::jsonb ->> 'suggested_target')::numeric = 18000000, 'average only uses the complete months');
SELECT public.create_emergency_fund_goal('Emergency Fund', 'IDR', NULL, NULL, 6, test_support.ids('{Rent}'), 6, 3000000) AS u3_goal \gset
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.goals WHERE id = :'u3_goal'), 'each user can have their own emergency fund');
INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES (:'u3_goal', '2026-10-01', 1000), (:'u3_goal', '2026-10-02', -400);
-- Deleting a goal removes everything under it, including a withdrawal.
DELETE FROM public.goals WHERE id = :'u3_goal';
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_contributions)
  AND (SELECT count(*) = 0 FROM public.goal_recommendations)
  AND (SELECT count(*) = 0 FROM public.goal_recommendation_months)
  AND (SELECT count(*) = 0 FROM public.goal_recommendation_categories), 'deleting a goal removes its contributions and snapshots');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
SELECT test_support.assert_true((public.preview_emergency_fund_basis(6, test_support.ids('{Rent}'), 6) ->> 'included_month_count')::int = 2
  AND (public.preview_emergency_fund_basis(6, test_support.ids('{Rent}'), 6) ->> 'suggested_target') IS NULL, 'two months are not enough for a suggestion');
SELECT test_support.assert_rejected_like($q$SELECT public.create_emergency_fund_goal('Emergency Fund', 'IDR', NULL, NULL, 6, test_support.ids('{Rent}'), 6, 3000000)$q$, '22023', '%Not enough history%');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Backend roles cannot bypass the invariants
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT test_support.assert_rejected_like(format($q$UPDATE public.goals SET currency = 'USD' WHERE id = %L$q$, :'goal'), '23514', '%cannot change%');
SELECT test_support.assert_rejected_like(format($q$UPDATE public.goals SET kind = 'custom' WHERE id = %L$q$, :'goal'), '23514', '%cannot change%');
SELECT test_support.assert_rejected_like(format($q$UPDATE public.goals SET user_id = '00000000-0000-0000-0000-000000000002' WHERE id = %L$q$, :'goal'), '23514', '%cannot change%');
SELECT test_support.assert_rejected_like(format($q$UPDATE public.goals SET target_amount = 1 WHERE id = %L$q$, :'goal'), '23514', '%follows its accepted recommendation%');
RESET ROLE;

ROLLBACK;
SELECT 'All goals database checks passed' AS result;
