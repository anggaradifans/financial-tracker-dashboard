#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$test_dir/../../supabase/migrations"
cluster_dir="$(mktemp -d "${TMPDIR:-/tmp}/supabase-rls-test.XXXXXX")"

stop_cluster() {
  pg_ctl -D "$cluster_dir/data" -m fast stop >/dev/null 2>&1 || true
}
trap stop_cluster EXIT

initdb -D "$cluster_dir/data" -A trust --no-locale -E UTF8 > "$cluster_dir/init.log"
pg_ctl -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
  -o "-k $cluster_dir -p 55439 -c listen_addresses=''" start

run_sql() {
  psql -X -h "$cluster_dir" -p 55439 -v ON_ERROR_STOP=1 -Atq "$@"
}

# Stage 1: the September 15 browser-RLS migration against the audited fixture.
run_sql -d postgres \
  -f "$test_dir/fixture.sql" \
  -f "$test_dir/../migrations/20260915_browser_rls.sql" \
  -f "$test_dir/access.sql"

# Stage 2: replay every supabase/migrations file, the production baseline first,
# each in its own session and transaction, then test the feature migrations.
run_sql -d postgres -c 'CREATE DATABASE migrations_test'
run_sql -d migrations_test -f "$test_dir/baseline_fixture.sql"
for migration in "$migrations_dir"/*.sql; do
  run_sql -U postgres -d migrations_test --single-transaction -f "$migration"
done
run_sql -U postgres -d migrations_test -f "$test_dir/goals.sql"
bash "$test_dir/goals_concurrency.sh" "$cluster_dir"

printf 'Local test logs: %s\n' "$cluster_dir"
