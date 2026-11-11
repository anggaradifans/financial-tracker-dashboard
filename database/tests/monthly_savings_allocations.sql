\set ON_ERROR_STOP on
BEGIN;
\ir support.sql

INSERT INTO auth.users VALUES (md5('plan-owner')::uuid), (md5('plan-other')::uuid);
INSERT INTO public.goals (id, user_id, kind, name, currency, target_amount, planned_monthly_amount, status) VALUES
  (md5('plan-a')::uuid, md5('plan-owner')::uuid, 'custom', 'First goal', 'IDR', 1000, 10, 'active'),
  (md5('plan-b')::uuid, md5('plan-owner')::uuid, 'custom', 'Second goal', 'IDR', 1000, NULL, 'active'),
  (md5('plan-archived')::uuid, md5('plan-owner')::uuid, 'custom', 'Archived', 'IDR', 1000, 50, 'archived'),
  (md5('plan-usd')::uuid, md5('plan-owner')::uuid, 'custom', 'Dollars', 'USD', 1000, 30, 'active'),
  (md5('plan-foreign')::uuid, md5('plan-other')::uuid, 'custom', 'Foreign goal', 'IDR', 1000, NULL, 'active');
INSERT INTO public.categories (id, name, allowed_type)
  VALUES (md5('plan-income')::uuid, 'Plan income', 'income');
INSERT INTO public.transactions (id, user_id, category_id, type, amount, occurred_at, currency) VALUES
  (md5('plan-tx')::uuid, md5('plan-owner')::uuid, md5('plan-income')::uuid, 'income', 100, now(), 'IDR'),
  (md5('plan-foreign-tx')::uuid, md5('plan-other')::uuid, md5('plan-income')::uuid, 'income', 100, now(), 'IDR');
INSERT INTO public.accounts (id, user_id, name, currency) VALUES
  (md5('plan-from')::uuid, md5('plan-owner')::uuid, 'Plan source', 'IDR'),
  (md5('plan-to')::uuid, md5('plan-owner')::uuid, 'Plan destination', 'IDR');

CREATE FUNCTION test_support.plan_allocation(key text, amount numeric DEFAULT 80, priority int DEFAULT 1)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('goal_id', md5(key)::uuid, 'expected_updated_at',
    (SELECT updated_at FROM public.goals WHERE id = md5(key)::uuid), 'amount', amount, 'priority', priority)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated;

SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.monthly_savings_plans', '42501');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL, '[]')$q$, '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('plan-owner')::text, true);
SELECT test_support.assert_rejected($q$INSERT INTO public.monthly_savings_plans VALUES (md5('plan-owner')::uuid, 'IDR', gen_random_uuid(), 0, NULL)$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-foreign')))$q$, '40001');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-usd')))$q$, '40001');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-archived')))$q$, '40001');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-a')))$q$, '40001');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-b', 50, 4)))$q$, '23514');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.monthly_savings_plans), 'invalid plans roll back');

SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a', 80, 1), test_support.plan_allocation('plan-b', 50, 3)));
SELECT test_support.assert_true((SELECT sum(planned_monthly_amount) = 130 FROM public.goals WHERE currency = 'IDR' AND status = 'active'),
  'oversubscribed plans retain their requested amounts');
SELECT test_support.assert_true((SELECT planned_monthly_amount = 50 AND priority = 3 FROM public.goals WHERE id = md5('plan-b')::uuid),
  'priorities and allocations saved together');
SELECT test_support.assert_true((SELECT saved_amount = 0 FROM public.goal_progress WHERE goal_id = md5('plan-b')::uuid),
  'planned allocations do not become actual contributions');
SELECT public.save_monthly_savings_plan('USD', NULL, -20, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date,
  jsonb_build_array(test_support.plan_allocation('plan-usd')));
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.monthly_savings_plans), 'separate currency baselines');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 200, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-b')))$q$, '40001');
UPDATE public.goals SET status = 'completed' WHERE id = md5('plan-b')::uuid;
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR',
  (SELECT revision FROM public.monthly_savings_plans WHERE currency = 'IDR'), 200, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a'), test_support.plan_allocation('plan-b')))$q$, '40001');

INSERT INTO public.goal_contributions (goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-a')::uuid, md5('plan-tx')::uuid, 60, CURRENT_DATE);
SELECT test_support.assert_rejected_like($q$INSERT INTO public.goal_contributions (goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-b')::uuid, md5('plan-tx')::uuid, 41, CURRENT_DATE)$q$, '23514', '%exceed the transaction amount%');
INSERT INTO public.goal_contributions (goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-b')::uuid, md5('plan-tx')::uuid, 40, CURRENT_DATE);
SELECT test_support.assert_rejected_like($q$UPDATE public.transactions SET amount = 99 WHERE id = md5('plan-tx')::uuid$q$,
  '23514', 'Remove the linked goal contributions%');
SELECT test_support.assert_rejected_like($q$UPDATE public.transactions SET currency = 'USD' WHERE id = md5('plan-tx')::uuid$q$,
  '23514', 'Remove the linked goal contributions%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.goal_contributions (goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-usd')::uuid, md5('plan-tx')::uuid, 1, CURRENT_DATE)$q$, '23514', '%currency must match%');
SELECT test_support.assert_rejected_like($q$INSERT INTO public.goal_contributions (user_id, goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-other')::uuid, md5('plan-foreign')::uuid, md5('plan-foreign-tx')::uuid, 1, CURRENT_DATE)$q$, '23514', '%unavailable%');
SELECT public.create_transfer(md5('plan-from')::uuid, md5('plan-to')::uuid, 25, 'IDR', now(), NULL, md5('plan-transfer')::uuid);
SELECT test_support.assert_rejected_like($q$INSERT INTO public.goal_contributions (goal_id, transaction_id, amount, contributed_on)
  VALUES (md5('plan-a')::uuid, (SELECT id FROM public.transactions WHERE transfer_id = md5('plan-transfer')::uuid
    AND type = 'transfer_in'), 1, CURRENT_DATE)$q$, '23514', '%unavailable%');

SELECT set_config('request.jwt.claim.sub', md5('plan-other')::text, true);
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.monthly_savings_plans), 'another owner cannot read plans');
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.goal_contributions), 'another owner cannot read actual contributions');
SELECT test_support.assert_rejected($q$SELECT public.save_monthly_savings_plan('IDR', NULL, 200, NULL,
  jsonb_build_array(test_support.plan_allocation('plan-a')))$q$, '40001');
ROLLBACK;
