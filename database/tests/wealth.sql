\set ON_ERROR_STOP on
BEGIN;
SET LOCAL TIME ZONE 'Asia/Jakarta';
\ir support.sql
CREATE FUNCTION test_support.wealth_input(key text, label text, value numeric DEFAULT 100, entry_kind text DEFAULT 'asset') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('id', md5(key)::uuid, 'name', label, 'kind', entry_kind,
    'category', CASE WHEN entry_kind = 'asset' THEN 'property' ELSE 'mortgage' END,
    'classification', CASE WHEN entry_kind = 'asset' THEN 'primary_residence' ELSE 'other' END,
    'currency', 'IDR', 'account_id', NULL, 'goal_id', NULL, 'notes', NULL,
    'amount', value, 'valued_on', CASE WHEN value IS NULL THEN NULL ELSE CURRENT_DATE END,
    'expected_updated_at', NULL)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_support TO anon, authenticated, service_role;
INSERT INTO auth.users VALUES (md5('wealth-owner')::uuid), (md5('wealth-other')::uuid);
INSERT INTO public.accounts(id, user_id, name, currency) VALUES
  (md5('wealth-cash')::uuid, md5('wealth-owner')::uuid, 'Wealth checking', 'IDR'),
  (md5('wealth-cash-to')::uuid, md5('wealth-owner')::uuid, 'Wealth destination', 'IDR'),
  (md5('wealth-other-account')::uuid, md5('wealth-other')::uuid, 'Other checking', 'IDR');
INSERT INTO public.goals(id, user_id, name, kind, currency, target_amount) VALUES
  (md5('wealth-goal')::uuid, md5('wealth-owner')::uuid, 'Wealth retirement', 'custom', 'IDR', 5000),
  (md5('wealth-other-goal')::uuid, md5('wealth-other')::uuid, 'Other goal', 'custom', 'IDR', 5000),
  (md5('wealth-usd-goal')::uuid, md5('wealth-owner')::uuid, 'USD goal', 'custom', 'USD', 5000);

SET LOCAL ROLE anon;
SELECT test_support.assert_rejected('SELECT * FROM public.wealth_entries', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.wealth_valuations', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.wealth_snapshots', '42501');
SELECT test_support.assert_rejected('SELECT * FROM public.wealth_current', '42501');
SELECT test_support.assert_rejected($q$SELECT public.capture_wealth_snapshot(md5('anon')::uuid)$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry('{}', gen_random_uuid())$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.archive_wealth_entry(gen_random_uuid(), true)$q$, '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('wealth-owner')::uuid::text, true);

SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 1000), md5('r-home')::uuid);
SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 1000), md5('r-home')::uuid);
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.wealth_valuations), 'same save request is idempotent');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Changed', 1000), md5('r-home')::uuid)$q$, '22023');
SELECT public.save_wealth_entry(test_support.wealth_input('debt', 'Mortgage', 1400, 'liability'), md5('r-debt')::uuid);
SELECT public.save_wealth_entry(test_support.wealth_input('usd', 'US deposit', 20) || '{"currency":"USD","category":"deposit","classification":"investable"}', md5('r-usd')::uuid);
SELECT public.save_wealth_entry(test_support.wealth_input('unknown', 'Land awaiting valuation', NULL), md5('r-unknown')::uuid);
SELECT public.save_wealth_entry(test_support.wealth_input('stale', 'Old valuation', 10) || jsonb_build_object('valued_on', CURRENT_DATE - 100), md5('r-stale')::uuid);
SELECT test_support.assert_true((SELECT missing_value AND amount IS NULL FROM public.wealth_current WHERE name = 'Land awaiting valuation'), 'missing valuation stays unknown, not a zero');
SELECT test_support.assert_true((SELECT stale FROM public.wealth_current WHERE name = 'Old valuation'), 'old manual valuations are marked stale');

SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('dup', ' apartment ', 1000), gen_random_uuid())$q$, '23505');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Negative', -1), gen_random_uuid())$q$, '23514');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Precision', 1.001), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Future') || jsonb_build_object('valued_on', CURRENT_DATE + 1), gen_random_uuid())$q$, '23514');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Currency') || '{"currency":"idr"}', gen_random_uuid())$q$, '23514');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Wrong goal') || jsonb_build_object('goal_id', md5('wealth-other-goal')::uuid), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Wrong currency goal') || jsonb_build_object('goal_id', md5('wealth-usd-goal')::uuid), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Wrong account', NULL) || jsonb_build_object('account_id', md5('wealth-other-account')::uuid), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Wrong currency account', NULL) || jsonb_build_object('account_id', md5('wealth-cash')::uuid, 'currency', 'USD'), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('invalid', 'Manual plus linked') || jsonb_build_object('account_id', md5('wealth-cash')::uuid), gen_random_uuid())$q$, '22023');

SELECT public.capture_wealth_snapshot(md5('snapshot-one')::uuid);
SELECT test_support.assert_true((SELECT jsonb_array_length(totals) = 2 FROM public.wealth_snapshots), 'currencies have separate snapshot totals');
SELECT test_support.assert_true((SELECT (t->>'net_worth')::numeric = -390 AND (t->>'missing_count')::int = 1 AND (t->>'stale_count')::int = 1 FROM public.wealth_snapshots s, jsonb_array_elements(s.totals) t WHERE t->>'currency' = 'IDR'), 'negative net worth, missing and stale values preserved');
SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 2000) || jsonb_build_object('expected_updated_at', (SELECT updated_at FROM public.wealth_entries WHERE id = md5('home')::uuid)), md5('r-home-new')::uuid);
SELECT test_support.assert_true((SELECT count(*) = 2 FROM public.wealth_valuations WHERE entry_id = md5('home')::uuid), 'valuation updates append instead of overwrite');
SELECT test_support.assert_true((SELECT amount = 2000 FROM public.wealth_current WHERE name = 'Apartment'), 'current uses latest revision');
SELECT test_support.assert_true((SELECT (e->>'amount')::numeric = 1000 FROM public.wealth_snapshots s, jsonb_array_elements(s.entries) e WHERE e->>'name' = 'Apartment'), 'snapshot detail is frozen');
SELECT public.capture_wealth_snapshot(md5('snapshot-one')::uuid);
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.wealth_snapshots), 'snapshot retries do not append or overwrite');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 3000), gen_random_uuid())$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 2000) || jsonb_build_object('expected_updated_at', (SELECT updated_at FROM public.wealth_entries WHERE id = md5('home')::uuid), 'currency', 'USD'), gen_random_uuid())$q$, '22023');

INSERT INTO public.transactions(account_id, category_id, type, amount, currency, occurred_at, deleted_at) VALUES
 (md5('wealth-cash')::uuid, '21c00000-0000-0000-0000-000000000001', 'income', 100, 'IDR', now() - interval '1 day', NULL),
 (md5('wealth-cash')::uuid, '21c00000-0000-0000-0000-000000000001', 'outcome', 20, 'IDR', now() - interval '1 day', NULL),
 (md5('wealth-cash')::uuid, '21c00000-0000-0000-0000-000000000001', 'income', 1000, 'IDR', now() + interval '1 day', NULL),
 (md5('wealth-cash')::uuid, '21c00000-0000-0000-0000-000000000001', 'income', 5, 'IDR', now() - interval '1 day', now());
SELECT public.create_transfer(md5('wealth-cash')::uuid, md5('wealth-cash-to')::uuid, 10, 'IDR', now() - interval '1 day');
SELECT public.save_wealth_entry(test_support.wealth_input('cash', 'Tracked checking', NULL) || jsonb_build_object('account_id', md5('wealth-cash')::uuid, 'category', 'cash', 'classification', 'investable', 'goal_id', md5('wealth-goal')::uuid), md5('r-cash')::uuid);
INSERT INTO public.goal_contributions(goal_id, amount, contributed_on) VALUES (md5('wealth-goal')::uuid, 500, CURRENT_DATE);
SELECT test_support.assert_true((SELECT amount = 70 AND source = 'account' AND NOT stale AND NOT missing_value FROM public.wealth_current WHERE name = 'Tracked checking'), 'account uses all tracked legs except future/deleted rows; goal allocations do not increase the value');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('dup-account', 'Duplicate account', NULL) || jsonb_build_object('account_id', md5('wealth-cash')::uuid), gen_random_uuid())$q$, '23505');
INSERT INTO public.transactions(account_id, category_id, type, amount, currency, occurred_at) VALUES
 (md5('wealth-cash')::uuid, '21c00000-0000-0000-0000-000000000001', 'outcome', 100, 'IDR', now() - interval '1 day');
SELECT test_support.assert_true((SELECT amount = 30 AND effective_kind = 'liability' FROM public.wealth_current WHERE name = 'Tracked checking'), 'negative account balance becomes liability');
SELECT public.capture_wealth_snapshot(md5('snapshot-two')::uuid);
SELECT test_support.assert_true((SELECT (t->>'liabilities')::numeric = 1430 AND (t->>'investable')::numeric = 0 FROM public.wealth_snapshots s, jsonb_array_elements(s.totals) t WHERE s.id = md5('snapshot-two')::uuid AND t->>'currency' = 'IDR'), 'account overdraft adds to liabilities and is not investable');
SELECT public.save_wealth_entry(test_support.wealth_input('linked-debt', 'Tracked loan', NULL, 'liability') || jsonb_build_object('account_id', md5('wealth-cash-to')::uuid), md5('r-linked-debt')::uuid);
SELECT test_support.assert_true((SELECT amount = 10 AND effective_kind = 'liability' FROM public.wealth_current WHERE name = 'Tracked loan'), 'explicit liability account uses absolute tracked balance');
SELECT public.archive_wealth_entry(md5('cash')::uuid, true);
SELECT test_support.assert_true(NOT EXISTS (SELECT 1 FROM public.wealth_current WHERE id = md5('cash')::uuid), 'archived entries leave current totals');
SELECT public.archive_wealth_entry(md5('cash')::uuid, false);
SELECT test_support.assert_true((SELECT count(*) = 1 FROM public.wealth_current WHERE id = md5('cash')::uuid), 'restore retains the link and valuations');
SELECT test_support.assert_rejected('UPDATE public.wealth_valuations SET amount = 0', '42501');
SELECT test_support.assert_rejected('DELETE FROM public.wealth_valuations', '42501');
SELECT test_support.assert_rejected('UPDATE public.wealth_snapshots SET totals = ''[]''', '42501');
SELECT test_support.assert_rejected('DELETE FROM public.wealth_snapshots', '42501');
SELECT test_support.assert_rejected('DELETE FROM public.wealth_entries', '42501');
SELECT test_support.assert_rejected('INSERT INTO public.wealth_entries(id) VALUES (gen_random_uuid())', '42501');
SELECT test_support.assert_true(NOT has_table_privilege('authenticated', 'public.wealth_entries', 'TRUNCATE'), 'no browser truncate');

SELECT set_config('request.jwt.claim.sub', md5('wealth-other')::uuid::text, true);
SELECT test_support.assert_true((SELECT count(*) = 0 FROM public.wealth_entries) AND (SELECT count(*) = 0 FROM public.wealth_valuations) AND (SELECT count(*) = 0 FROM public.wealth_snapshots) AND (SELECT count(*) = 0 FROM public.wealth_current), 'second owner cannot read any balance sheet objects');
SELECT test_support.assert_rejected($q$SELECT public.archive_wealth_entry(md5('home')::uuid, true)$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 0), gen_random_uuid())$q$, '42501');
SELECT test_support.assert_rejected($q$SELECT public.save_wealth_entry(test_support.wealth_input('home', 'Apartment', 1000), md5('r-home')::uuid)$q$, '22023');
SELECT test_support.assert_rejected($q$SELECT public.capture_wealth_snapshot(md5('snapshot-one')::uuid)$q$, '42501');
SELECT public.capture_wealth_snapshot(md5('snapshot-other')::uuid);
SELECT test_support.assert_true((SELECT totals = '[]' AND entries = '[]' FROM public.wealth_snapshots), 'snapshot RPC does not leak other owner rows through its definer view');
SELECT public.save_wealth_entry(test_support.wealth_input('spoof', 'Owner ignored') || jsonb_build_object('user_id', md5('wealth-owner')::uuid), gen_random_uuid());
SELECT test_support.assert_true((SELECT user_id = auth.uid() FROM public.wealth_entries), 'payload cannot spoof ownership');
RESET ROLE;
ROLLBACK;
