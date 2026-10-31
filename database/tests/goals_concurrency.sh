#!/usr/bin/env bash
# Two real sessions racing for the same row lock. A single-session SQL script cannot
# show that the goal and transaction row locks matter, because without them both
# sessions pass their checks against committed data and both commit.
# Usage: goals_concurrency.sh <cluster socket dir>. Leaves committed rows behind,
# so run it last in the throwaway database.
set -euo pipefail

cluster_dir="$1"
user='00000000-0000-0000-0000-0000000000c1'
category='c0000000-0000-0000-0000-000000000001'
rent_tx='c0000000-0000-0000-0000-000000000002'
goal_link_a='c0000000-0000-0000-0000-0000000000a1'
goal_link_b='c0000000-0000-0000-0000-0000000000a2'
goal_balance='c0000000-0000-0000-0000-0000000000a3'
scratch="$(mktemp -d "${TMPDIR:-/tmp}/goals-race.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

sql() {
  psql -X -h "$cluster_dir" -p 55439 -U postgres -d migrations_test -v ON_ERROR_STOP=1 -Atq "$@"
}

as_user() {
  printf "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '%s', true);" "$user"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

sql <<SQL >/dev/null
INSERT INTO auth.users VALUES ('$user');
INSERT INTO public.categories (id, name, allowed_type) VALUES ('$category', 'Race', 'outcome');
INSERT INTO public.transactions (id, user_id, category_id, type, amount, occurred_at)
  VALUES ('$rent_tx', '$user', '$category', 'outcome', 5000000, now());
INSERT INTO public.goals (id, user_id, kind, name, target_amount) VALUES
  ('$goal_link_a', '$user', 'custom', 'Link A', 10000000),
  ('$goal_link_b', '$user', 'custom', 'Link B', 10000000),
  ('$goal_balance', '$user', 'custom', 'Balance', 10000000);
INSERT INTO public.goal_contributions (goal_id, user_id, contributed_on, amount)
  VALUES ('$goal_balance', '$user', current_date, 1000);
SQL

# race <first statement> <second statement>
# The first session writes, then holds its transaction open; the second starts
# while it is open. Sets first_status, second_status, second_error, second_seconds.
race() {
  sql -c "$(as_user) $1 SELECT pg_sleep(3); COMMIT;" > "$scratch/first.log" 2>&1 &
  local first_pid=$!
  sleep 1
  local started=$SECONDS
  if sql -c "$(as_user) $2 COMMIT;" > "$scratch/second.log" 2>&1; then second_status=0; else second_status=$?; fi
  second_seconds=$((SECONDS - started))
  second_error="$(cat "$scratch/second.log")"
  if wait "$first_pid"; then first_status=0; else first_status=$?; fi
}

# Two goals each link 3,000,000 of a 5,000,000 transaction: only one may fit.
race "INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES ('$goal_link_a', current_date, 3000000, '$rent_tx');" \
     "INSERT INTO public.goal_contributions (goal_id, contributed_on, amount, transaction_id) VALUES ('$goal_link_b', current_date, 3000000, '$rent_tx');"
[ "$first_status" -eq 0 ] || fail "first link should commit: $(cat "$scratch/first.log")"
[ "$second_status" -ne 0 ] || fail 'second link committed although it over-allocates the transaction'
[[ "$second_error" == *'exceed the transaction amount'* ]] || fail "second link failed for the wrong reason: $second_error"
[ "$second_seconds" -ge 1 ] || fail 'second link did not wait for the first transaction'
linked="$(sql -c "SELECT COALESCE(sum(abs(amount)), 0) FROM public.goal_contributions WHERE transaction_id = '$rent_tx'")"
[ "$linked" = '3000000.00' ] || fail "linked total is $linked, expected 3000000.00"

# Two withdrawals of 600 from a goal holding 1000: only one may fit.
race "INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES ('$goal_balance', current_date, -600);" \
     "INSERT INTO public.goal_contributions (goal_id, contributed_on, amount) VALUES ('$goal_balance', current_date, -600);"
[ "$first_status" -eq 0 ] || fail "first withdrawal should commit: $(cat "$scratch/first.log")"
[ "$second_status" -ne 0 ] || fail 'second withdrawal committed and overdrew the goal'
[[ "$second_error" == *'balance cannot go below zero'* ]] || fail "second withdrawal failed for the wrong reason: $second_error"
[ "$second_seconds" -ge 1 ] || fail 'second withdrawal did not wait for the first transaction'
saved="$(sql -c "SELECT COALESCE(sum(amount), 0) FROM public.goal_contributions WHERE goal_id = '$goal_balance'")"
[ "$saved" = '400.00' ] || fail "saved amount is $saved, expected 400.00"

printf 'All goals concurrency checks passed\n'
