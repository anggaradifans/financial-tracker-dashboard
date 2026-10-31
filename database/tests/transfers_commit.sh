#!/usr/bin/env bash
# What a single-session SQL script cannot show for transfers: the pair check really
# runs at COMMIT (not per statement), and concurrent retries and deletes of one
# transfer settle on a single outcome.
# Usage: transfers_commit.sh <cluster socket dir>. Leaves committed rows behind,
# so run it last in the throwaway database.
set -euo pipefail

cluster_dir="$1"
user='00000000-0000-0000-0000-0000000000d1'
checking='d0000000-0000-0000-0000-000000000001'
savings='d0000000-0000-0000-0000-000000000002'
lone='d1000000-0000-0000-0000-000000000001'
split='d1000000-0000-0000-0000-000000000002'
retried='d1000000-0000-0000-0000-000000000003'
doomed='d1000000-0000-0000-0000-000000000004'
scratch="$(mktemp -d "${TMPDIR:-/tmp}/transfers-race.XXXXXX")"
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

legs() {
  sql -c "SELECT count(*) FROM public.transactions WHERE transfer_id = '$1'"
}

sql <<SQL >/dev/null
INSERT INTO auth.users VALUES ('$user');
INSERT INTO public.accounts (id, name) VALUES ('$checking', 'Commit Checking'), ('$savings', 'Commit Savings');
SQL

leg() { # leg <transfer id> <out|in>
  local account="$checking" type=transfer_out
  if [ "$2" = in ]; then account="$savings"; type=transfer_in; fi
  printf "INSERT INTO public.transactions (user_id, account_id, type, amount, currency, occurred_at, transfer_id) VALUES ('%s', '%s', '%s', 10, 'IDR', '2026-01-01', '%s');" \
    "$user" "$account" "$type" "$1"
}

# 1. A lone leg is accepted by its own statement and refused when the transaction commits.
if sql > "$scratch/lone.log" 2>&1 <<SQL
BEGIN;
$(leg "$lone" out)
SELECT 'statement accepted';
COMMIT;
SQL
then fail 'a lone transfer leg committed'; fi
grep -q 'statement accepted' "$scratch/lone.log" || fail "the pair check ran before COMMIT: $(cat "$scratch/lone.log")"
grep -q 'A transfer must be one matching' "$scratch/lone.log" || fail "lone leg failed for the wrong reason: $(cat "$scratch/lone.log")"
[ "$(legs "$lone")" = 0 ] || fail 'a rolled-back lone leg is still in the table'

# 2. The same two legs inserted by separate statements commit, because the check waits for COMMIT.
sql <<SQL >/dev/null
BEGIN;
$(leg "$split" out)
$(leg "$split" in)
COMMIT;
SQL
[ "$(legs "$split")" = 2 ] || fail 'a pair inserted in two statements did not commit'

# race <first statement> <second statement>
# The first session runs its statement and holds the transaction open; the second
# starts while it is open. Sets first_status, second_status, second_error, second_seconds.
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

# 3. Two identical calls with one idempotency key: the retry waits, then returns the
#    same transfer instead of failing or creating a second one.
create="SELECT public.create_transfer('$checking', '$savings', 100, 'IDR', '2026-01-02T00:00:00Z', 'retried', '$retried');"
race "$create" "$create"
[ "$first_status" -eq 0 ] || fail "first create should commit: $(cat "$scratch/first.log")"
[ "$second_status" -eq 0 ] || fail "the retry should succeed: $second_error"
[ "$second_seconds" -ge 1 ] || fail 'the retry did not wait for the first transaction'
[ "$(legs "$retried")" = 2 ] || fail "the retried transfer has $(legs "$retried") legs, expected 2"

# 4. Two deletes of one transfer: one wins, the other finds nothing left to delete.
sql -c "$(as_user) SELECT public.create_transfer('$checking', '$savings', 50, 'IDR', '2026-01-03T00:00:00Z', NULL, '$doomed'); COMMIT;" >/dev/null
delete="SELECT public.delete_transfer('$doomed');"
race "$delete" "$delete"
[ "$first_status" -eq 0 ] || fail "first delete should commit: $(cat "$scratch/first.log")"
[ "$second_status" -ne 0 ] || fail 'second delete succeeded on an already deleted transfer'
[[ "$second_error" == *'Transfer unavailable'* ]] || fail "second delete failed for the wrong reason: $second_error"
[ "$second_seconds" -ge 1 ] || fail 'second delete did not wait for the first transaction'
deleted="$(sql -c "SELECT count(*) FROM public.transactions WHERE transfer_id = '$doomed' AND deleted_at IS NOT NULL")"
[ "$deleted" = 2 ] || fail "$deleted legs are deleted, expected 2"

# The staged Telegram flow runs as the service role. A pending receipt can be marked as a
# transfer to one of the owner's accounts, and confirming then saves both legs.
tg=9101
confirm_stage='d2000000-0000-0000-0000-000000000001'
sql <<SQL >/dev/null
INSERT INTO public.telegram_users (telegram_user_id, supabase_user_id) VALUES ($tg, '$user');
SQL

stage() { # stage <staging id> <description>
  sql -c "INSERT INTO public.transaction_staging (id, user_id, type, amount, occurred_at, description, account_id)
    VALUES ('$1', '$user', 'outcome', 400, now(), '$2', '$checking')"
}

as_bot() {
  sql -c "SET ROLE service_role; $1"
}

# 5. Eight concurrent confirms of one staged transfer save exactly one transfer and all
#    return it (the row lock turns the losers into replays).
stage "$confirm_stage" 'concurrent confirm'
as_bot "SELECT public.backend_revise_staged_transaction('$confirm_stage', $tg, 'transfer', '$savings')" >/dev/null
for i in $(seq 1 8); do
  as_bot "SELECT public.backend_process_staged_transaction('$confirm_stage', $tg, 'confirm') -> 'txn' ->> 'id'" > "$scratch/confirm-$i.log" 2>&1 &
done
wait
[ "$(cat "$scratch"/confirm-*.log | sort -u | wc -l | tr -d ' ')" = 1 ] || fail "concurrent confirms did not agree: $(cat "$scratch"/confirm-*.log | sort -u)"
[ "$(sql -c "SELECT count(*) FROM public.transactions WHERE description = 'concurrent confirm'")" = 2 ] || fail 'concurrent confirms did not save exactly two legs'

# 6. Edits racing a confirm: whichever wins, the saved result is a transfer if and only if
#    the staging row carries the destination, and exactly one result is saved.
transfers_seen=0
plain_seen=0
for round in 1 2 3 4; do
  id="d3000000-0000-0000-0000-00000000000$round"
  description="race-edit-$round"
  stage "$id" "$description"
  for i in 1 2 3 4 5 6; do
    as_bot "SELECT public.backend_revise_staged_transaction('$id', $tg, 'transfer', '$savings')" > "$scratch/edit-$round-$i.log" 2>&1 &
    as_bot "SELECT public.backend_process_staged_transaction('$id', $tg, 'confirm')" > "$scratch/confirm-$round-$i.log" 2>&1 &
  done
  wait
  for i in 1 2 3 4 5 6; do
    ! grep -q ERROR "$scratch/confirm-$round-$i.log" || fail "a confirm failed in round $round: $(cat "$scratch/confirm-$round-$i.log")"
    ! grep ERROR "$scratch/edit-$round-$i.log" | grep -qv 'Already processed' || fail "an edit failed for the wrong reason in round $round: $(cat "$scratch/edit-$round-$i.log")"
  done
  [ "$(sql -c "SELECT status FROM public.transaction_staging WHERE id = '$id'")" = confirmed ] || fail "round $round was not confirmed"
  marker="$(sql -c "SELECT transfer_to_account_id IS NOT NULL FROM public.transaction_staging WHERE id = '$id'")"
  saved="$(sql -c "SELECT count(*) FROM public.transactions WHERE description = '$description'")"
  types="$(sql -c "SELECT string_agg(DISTINCT type::text, ',' ORDER BY type::text) FROM public.transactions WHERE description = '$description'")"
  if [ "$marker" = t ]; then
    [ "$saved" = 2 ] && [ "$types" = 'transfer_in,transfer_out' ] || fail "round $round: destination set but saved $saved row(s) of $types"
    transfers_seen=$((transfers_seen + 1))
  else
    [ "$saved" = 1 ] && [ "$types" = outcome ] || fail "round $round: no destination but saved $saved row(s) of $types"
    plain_seen=$((plain_seen + 1))
  fi
done
printf 'edit/confirm races: %s saved as transfers, %s as ordinary spending\n' "$transfers_seen" "$plain_seen"

printf 'All transfers commit checks passed\n'
