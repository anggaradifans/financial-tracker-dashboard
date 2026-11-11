\set ON_ERROR_STOP on
BEGIN;
\ir support.sql
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated;

SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.goal_progress', '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('goal-types-owner')::text, true);
SELECT test_support.assert_true((
  SELECT count(*) = 2 FROM public.goals WHERE debt_balance IS NULL AND investment_market_value IS NULL
    AND id IN (md5('legacy-custom')::uuid, md5('legacy-emergency')::uuid)
), 'migration retains legacy goal rows');
SELECT test_support.assert_true((
  SELECT count(*) = 2 FROM public.goal_contributions
  WHERE (id = md5('legacy-custom-activity')::uuid AND amount = 10.02 AND contributed_on = '2026-10-01')
     OR (id = md5('legacy-emergency-activity')::uuid AND amount = 20.03 AND contributed_on = '2026-10-02')
), 'migration preserves legacy contribution rows');
SELECT test_support.assert_true((
  SELECT remaining_amount = 190.03 AND saved_amount = 10.02 FROM public.goal_progress WHERE goal_id = md5('legacy-custom')::uuid
), 'custom progress is preserved');
SELECT test_support.assert_true((
  SELECT remaining_amount = 980.02 AND saved_amount = 20.03 FROM public.goal_progress WHERE goal_id = md5('legacy-emergency')::uuid
), 'emergency fund progress is preserved');

INSERT INTO public.goals (id, kind, name, target_amount) VALUES
  (md5('sink')::uuid, 'sinking_fund', 'Annual insurance', 100.05);
INSERT INTO public.goals (id, kind, name, target_amount, investment_market_value) VALUES
  (md5('invest')::uuid, 'investment', 'Invest monthly', 100.05, 110.03);
INSERT INTO public.goals (id, kind, name, target_amount, debt_balance, debt_apr, debt_monthly_fee, debt_monthly_payment)
  VALUES (md5('debt')::uuid, 'debt_payoff', 'Pay off loan', 100.05, 100.05, 12.25, 1.01, 15.02);
INSERT INTO public.goal_contributions (goal_id, amount, contributed_on) VALUES
  (md5('sink')::uuid, 30.02, CURRENT_DATE),
  (md5('sink')::uuid, -0.01, CURRENT_DATE),
  (md5('invest')::uuid, 50.02, CURRENT_DATE),
  (md5('invest')::uuid, -0.01, CURRENT_DATE),
  (md5('debt')::uuid, 20.01, CURRENT_DATE);

SELECT test_support.assert_true((
  SELECT saved_amount = 30.01 AND remaining_amount = 70.04
  FROM public.goal_progress WHERE goal_id = md5('sink')::uuid
), 'sinking fund tracks net deposits to the cent');
UPDATE public.goals SET investment_market_value = 200.04 WHERE id = md5('invest')::uuid;
SELECT test_support.assert_true((
  SELECT saved_amount = 50.01 AND remaining_amount = 50.04
  FROM public.goal_progress WHERE goal_id = md5('invest')::uuid
), 'valuation changes never enter contribution progress');
SELECT test_support.assert_true((
  SELECT repayment_amount = 20.01 AND remaining_amount = 100.05 AND saved_amount = 0
  FROM public.goal_progress WHERE goal_id = md5('debt')::uuid
), 'recorded repayments do not reduce the lender balance a second time');
UPDATE public.goals SET debt_balance = 81.03, target_date = '2027-01-01' WHERE id = md5('debt')::uuid;
SELECT test_support.assert_true((
  SELECT repayment_amount = 20.01 AND remaining_amount = 81.03 AND saved_amount = 19.02 AND progress_percent = 19.0
  FROM public.goal_progress WHERE goal_id = md5('debt')::uuid
), 'latest lender balance drives principal reduction and debt progress');
UPDATE public.goals SET debt_balance = 102.06 WHERE id = md5('debt')::uuid;
SELECT test_support.assert_true((
  SELECT remaining_amount = 102.06 AND progress_percent = 0 FROM public.goal_progress WHERE goal_id = md5('debt')::uuid
), 'debt can grow above the opening balance');
UPDATE public.goals SET debt_balance = 0, status = 'completed' WHERE id = md5('debt')::uuid;
SELECT test_support.assert_true((
  SELECT completed_at IS NOT NULL FROM public.goals WHERE id = md5('debt')::uuid
), 'debt can be completed');
SELECT test_support.assert_true((
  SELECT repayment_amount = 20.01 AND remaining_amount = 0 AND progress_percent = 100
  FROM public.goal_progress WHERE goal_id = md5('debt')::uuid
), 'payoff is complete at zero balance and repayments are retained');
UPDATE public.goals SET status = 'active' WHERE id = md5('debt')::uuid;
SELECT test_support.assert_true((
  SELECT completed_at IS NULL FROM public.goals WHERE id = md5('debt')::uuid
), 'new goal type can be reopened');

SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount) VALUES ('debt_payoff', 'No terms', 100)$q$, '23514');
SELECT test_support.assert_rejected($q$UPDATE public.goals SET debt_apr = -0.01 WHERE id = md5('debt')::uuid$q$, '23514');
SELECT test_support.assert_rejected($q$UPDATE public.goals SET investment_market_value = 1 WHERE id = md5('sink')::uuid$q$, '23514');
SELECT test_support.assert_rejected($q$INSERT INTO public.goal_contributions (goal_id, amount, contributed_on)
  VALUES (md5('debt')::uuid, -1, CURRENT_DATE)$q$, '23514');
SELECT test_support.assert_rejected($q$INSERT INTO public.goal_contributions (goal_id, amount, contributed_on)
  VALUES (md5('invest')::uuid, 'NaN', CURRENT_DATE)$q$, '23514');
SELECT test_support.assert_rejected($q$INSERT INTO public.goals (kind, name, target_amount)
  VALUES ('emergency_fund', 'Bypass recommendation', 100)$q$, '42501');

SELECT set_config('request.jwt.claim.sub', md5('goal-types-other')::text, true);
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goals), 'other owners cannot read settings');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_progress), 'other owners cannot read actuals');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_contributions), 'other owners cannot read activity');
WITH changed AS (UPDATE public.goals SET debt_balance = 1 WHERE id = md5('debt')::uuid RETURNING id)
  SELECT test_support.assert_true((SELECT count(*) = 0 FROM changed), 'other owners cannot edit the lender balance');
SELECT test_support.assert_rejected($q$INSERT INTO public.goal_contributions (goal_id, amount, contributed_on)
  VALUES (md5('debt')::uuid, 1, CURRENT_DATE)$q$, '23503');

ROLLBACK;
SELECT 'All goal type database checks passed' AS result;
