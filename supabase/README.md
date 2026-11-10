# Supabase schema workflow

`migrations/20260917000000_production_baseline.sql` is a data-free dump of the
production `public` schema captured on September 17, 2026 after the browser RLS
and backend compatibility rollout. It contains tables, functions, triggers,
policies, and grants. It contains no ledger rows or credentials.

The production project already had this schema before the migration ledger was
created, so version `20260917000000` is registered as applied in production.
Never run the baseline manually against that project.

For future schema changes:

1. Start the local stack with `supabase start`.
2. Create a timestamped migration with `supabase migration new <name>`.
3. Apply and test locally with `supabase db reset`.
4. Review drift with `supabase db diff`.
5. Back up production, then use `supabase db push` for the reviewed migration.

The SQL files in the repository root are historical references. They do not
describe the current database and must not be replayed.

For issue #21's account ownership migration, follow the coordinated rollout and
data preservation checks in [security-hardening-20261109.md](../database/security-hardening-20261109.md).
It changes account name uniqueness and requires the companion ingestion changes.
Unowned historical accounts are retained but hidden until explicitly assigned.
