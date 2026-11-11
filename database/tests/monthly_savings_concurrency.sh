#!/usr/bin/env bash
set -euo pipefail

cluster_dir="$1"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/monthly-plan-race.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
sql() {
  psql -X -h "$cluster_dir" -p 55439 -U postgres -d migrations_test -v ON_ERROR_STOP=1 -Atq "$@"
}

sql <<'SQL'
INSERT INTO auth.users VALUES (md5('plan-race')::uuid);
INSERT INTO public.goals (id, user_id, kind, name, target_amount) VALUES
  (md5('plan-race-a')::uuid, md5('plan-race')::uuid, 'custom', 'Race A', 1000),
  (md5('plan-race-b')::uuid, md5('plan-race')::uuid, 'custom', 'Race B', 1000);
INSERT INTO public.categories (id, name, allowed_type)
  VALUES (md5('plan-race-income')::uuid, 'Race income', 'income');
INSERT INTO public.transactions (id, user_id, category_id, type, amount, occurred_at)
  VALUES (md5('plan-race-tx')::uuid, md5('plan-race')::uuid, md5('plan-race-income')::uuid, 'income', 100, now());
SQL

as_user="SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', md5('plan-race')::text, true);"
race() {
  local first="$1" second="$2" expected="$3"
  sql -c "$first SELECT pg_sleep(2); COMMIT;" > "$scratch/first.log" 2>&1 &
  local first_pid=$!
  sleep 0.5
  local status=0
  sql -c "$second COMMIT;" > "$scratch/second.log" 2>&1 || status=$?
  if ! wait "$first_pid" || [ "$status" -eq 0 ] || ! rg -q "$expected" "$scratch/second.log"; then
    cat "$scratch/first.log" "$scratch/second.log" >&2
    return 1
  fi
}

allocations="(SELECT jsonb_agg(jsonb_build_object('goal_id', id, 'expected_updated_at', updated_at, 'amount', 80, 'priority', 2))
  FROM public.goals WHERE user_id = md5('plan-race')::uuid)"
race "BEGIN; $as_user SELECT public.save_monthly_savings_plan('IDR', NULL, 100, NULL, $allocations);" \
     "BEGIN; $as_user SELECT public.save_monthly_savings_plan('IDR', NULL, 200, NULL, $allocations);" \
     'The monthly plan changed'
test "$(sql -c "SELECT baseline_amount FROM public.monthly_savings_plans WHERE user_id = md5('plan-race')::uuid")" = '100.00'

link_a="INSERT INTO public.goal_contributions (goal_id, transaction_id, contributed_on, amount)
  VALUES (md5('plan-race-a')::uuid, md5('plan-race-tx')::uuid, CURRENT_DATE, 60);"
link_b="INSERT INTO public.goal_contributions (goal_id, transaction_id, contributed_on, amount)
  VALUES (md5('plan-race-b')::uuid, md5('plan-race-tx')::uuid, CURRENT_DATE, 60);"
race "BEGIN; $as_user $link_a" \
     "BEGIN ISOLATION LEVEL REPEATABLE READ; $as_user $link_b" \
     'could not serialize access due to concurrent update'
test "$(sql -c "SELECT sum(amount) FROM public.goal_contributions WHERE transaction_id = md5('plan-race-tx')::uuid")" = '60.00'

printf 'Monthly plan and linked-contribution concurrency checks passed\n'
