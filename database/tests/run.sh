#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cluster_dir="$(mktemp -d "${TMPDIR:-/tmp}/supabase-rls-test.XXXXXX")"

stop_cluster() {
  pg_ctl -D "$cluster_dir/data" -m fast stop >/dev/null 2>&1 || true
}
trap stop_cluster EXIT

initdb -D "$cluster_dir/data" -A trust --no-locale -E UTF8 > "$cluster_dir/init.log"
pg_ctl -D "$cluster_dir/data" -l "$cluster_dir/server.log" \
  -o "-k $cluster_dir -p 55439 -c listen_addresses=''" start
psql -X -h "$cluster_dir" -p 55439 -d postgres -v ON_ERROR_STOP=1 -Atq \
  -f "$test_dir/fixture.sql" \
  -f "$test_dir/../migrations/20260915_browser_rls.sql" \
  -f "$test_dir/access.sql"

printf 'Local test logs: %s\n' "$cluster_dir"
