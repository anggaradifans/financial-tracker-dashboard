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
  if [[ "$migration" == *20261109100000_security_hardening.sql ]]; then
    # Exercise the historical shared-account schema before replacing it.
    run_sql -U postgres -d migrations_test -f "$test_dir/goals.sql"
    run_sql -U postgres -d migrations_test -f "$test_dir/transfers.sql"
    run_sql -U postgres -d migrations_test -f "$test_dir/staged_transfers.sql"
    bash "$test_dir/goals_concurrency.sh" "$cluster_dir"
    bash "$test_dir/transfers_commit.sh" "$cluster_dir"
    run_sql -U postgres -d migrations_test -f "$test_dir/security_fixture.sql"
    # No outer transaction: exercise the same statement-by-statement execution
    # as the hosted runner. Fail immediately before the migration's own COMMIT.
    failing_migration="$cluster_dir/security_failure.sql"
    awk '/^COMMIT;$/ { print "SELECT 1/0;" } { print }' "$migration" > "$failing_migration"
    if run_sql -U postgres -d migrations_test -f "$failing_migration" > "$cluster_dir/rollback.log" 2>&1; then
      echo 'Expected migration rollback test to fail' >&2
      exit 1
    fi
    run_sql -U postgres -d migrations_test -c "DO \$\$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'user_id')
         OR EXISTS (SELECT row FROM public.security_before_accounts EXCEPT SELECT to_jsonb(a) FROM public.accounts a)
         OR EXISTS (SELECT row FROM public.security_before_transactions EXCEPT SELECT to_jsonb(t) FROM public.transactions t)
         OR EXISTS (SELECT row FROM public.security_before_staging EXCEPT SELECT to_jsonb(s) FROM public.transaction_staging s) THEN
        RAISE EXCEPTION 'Failed migration did not roll back';
      END IF;
    END \$\$;"
    run_sql -U postgres -d migrations_test -f "$migration"
  else
    run_sql -U postgres -d migrations_test --single-transaction -f "$migration"
  fi
done
run_sql -U postgres -d migrations_test -f "$test_dir/security.sql"

printf 'Local test logs: %s\n' "$cluster_dir"
