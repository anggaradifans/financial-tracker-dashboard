\set ON_ERROR_STOP on
BEGIN;
\ir support.sql
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated;

INSERT INTO auth.users VALUES (md5('freedom-owner')::uuid), (md5('freedom-other')::uuid);

SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.financial_freedom_plans', '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('freedom-owner'), true);
INSERT INTO public.financial_freedom_plans (
  revision, currency, annual_spending, withdrawal_rate, investable_assets, calculation_date, spending_period_start, scenarios
) VALUES (
  md5('freedom-rev')::uuid, 'IDR', 1200.12, 4, 150.23, '2026-11-11', '2025-11-01',
  '[
    {"monthly_contribution":10.25,"investment_return":-10.25,"inflation":0,"costs":1,"contribution_growth":-2},
    {"monthly_contribution":0,"investment_return":-99.99,"inflation":2,"costs":0.01,"contribution_growth":0}
  ]'
);

SELECT test_support.assert_true((
  SELECT count(*) = 1 FROM public.financial_freedom_plans
  WHERE currency = 'IDR' AND annual_spending = 1200.12 AND calculation_date = '2026-11-11'
), 'owner can save and read a dated plan');
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET annual_spending = 0, withdrawal_rate = 0', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET currency = ''idr''', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET spending_period_start = ''2026-01-01''', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET scenarios = ''[{}, {}]''', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET scenarios = jsonb_set(scenarios, ''{0,monthly_contribution}'', ''0.001'')', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET scenarios = jsonb_set(scenarios, ''{0,costs}'', ''"1"'')', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET scenarios = jsonb_set(scenarios, ''{1,costs}'', ''1'')', '23514'
);
SELECT test_support.assert_rejected(
  'UPDATE public.financial_freedom_plans SET user_id = md5(''freedom-other'')::uuid', '42501'
);

SELECT set_config('request.jwt.claim.sub', md5('freedom-other'), true);
SELECT test_support.assert_true(
  (SELECT count(*) = 0 FROM public.financial_freedom_plans), 'other owner cannot read the plan'
);
WITH changed AS (UPDATE public.financial_freedom_plans SET annual_spending = 10 RETURNING user_id)
SELECT test_support.assert_true((SELECT count(*) = 0 FROM changed), 'other owner cannot change the plan');
SELECT test_support.assert_rejected($sql$
  INSERT INTO public.financial_freedom_plans
    (user_id, revision, currency, annual_spending, withdrawal_rate, investable_assets, calculation_date, scenarios)
  VALUES (md5('freedom-owner')::uuid, gen_random_uuid(), 'USD', 100, 5, 0, '2026-11-11',
    '[
      {"monthly_contribution":1,"investment_return":0,"inflation":0,"costs":0,"contribution_growth":0},
      {"monthly_contribution":2,"investment_return":0,"inflation":0,"costs":0,"contribution_growth":0}
    ]')
$sql$, '42501');

ROLLBACK;
