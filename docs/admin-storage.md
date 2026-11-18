# Admin storage setup

The `/admin/storage` page extends the existing dashboard. Admin navigation appears for users whose server-owned `app_metadata.role` is `admin`. Every privileged database function independently checks the current `auth.users.raw_app_meta_data` record, so hiding the link is not the security boundary and revoked privileges do not depend on token expiry.

## Enable live metrics

Apply `supabase/migrations/20261118100000_admin_storage.sql`, followed by `supabase/migrations/20261118110000_admin_storage_cluster_size.sql`, using the normal migration process. If the first migration is already installed, run only the second migration. Assign an administrator through Supabase's trusted Admin API (`auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })`) or, as the database owner, update the intended user's record in SQL Editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = 'REPLACE_WITH_YOUR_USER_UUID'::uuid;
```

Use a verified UUID. Refresh the session after changing roles to update dashboard navigation. Never put a service-role key in Vite variables or grant admin from editable user metadata. The migration is supplied, not automatically applied to a hosted database.

## Daily history

Opening the page or pressing Refresh records today's database size. The collector retains 90 daily samples; it does not delete financial data. To collect while the dashboard is closed, enable Supabase Cron / `pg_cron`, then schedule as the database owner:

```sql
select cron.schedule(
  'daily-storage-sample',
  '0 1 * * *',
  'select public.collect_storage_sample();'
);
```

This is 01:00 UTC / 08:00 Asia/Jakarta. Run the schedule once; inspect `cron.job` before re-running. The page describes refresh-based collection rather than claiming cron is configured. Only the database owner can invoke the private collector directly. Snapshot estimates use daily samples, not row counts. Bytes use decimal MB and the 500,000,000-byte planning allowance. Capacity and daily samples use `sum(pg_database_size(datname)) from pg_database`: all databases in this project’s PostgreSQL instance, matching Supabase’s documented database-report query. This does not include other projects. Table statistics still describe the current database. Supabase reporting delays and rounding can differ from this live measurement; this is not an authoritative billing API or total physical disk measurement. The follow-up migration tags the measurement scope, preserves older current-database samples, and excludes them from combined-size forecasts. New combined-size samples start the growth history again.

Capacity alerts are displayed on this page at 350 / 400 / 450 MB, with early action also suggested when estimated time remaining is 30 days or less. Email, push, external delivery, and background alert dispatch are not implemented. Sampling alone does not send notifications.

## Financial-record downloads

The privileged export reads transactions, accounts and categories across users in one SQL statement and includes soft-deleted rows and original IDs, timestamps, metadata and transfer links. Postgres serializes its JSON into a text payload so the browser does not reserialize exact numeric values. The downloaded envelope contains `payload` (the original JSON text) and `sha256` (SHA-256 of UTF-8 payload). Validate the checksum before parsing for restoration.

This is a financial-record export, not a complete database backup: goals, budgets, authentication, schema and other tables are excluded. For full recovery use a PostgreSQL dump through trusted administrative tooling. The browser export rejects more than 10,000 transactions or a payload over 20 MB. No deletion, relocation or automated archival occurs. The page reports download requested, not file saved or restore verified; no durable backup success is claimed.

The archive destination remains a user-controlled download. Store it securely, back it up separately, and test restoring in an isolated database before considering retention. Download status is per visit; there is no persistent backup history. Any future deletion must first preserve account opening balances, historical analytics and complete transfer pairs.

## Verification

Run `npm run build`, `npm run test:security`, and `npx playwright test tests/e2e/admin-storage.spec.ts`. Browser tests use synthetic project data and check desktop/mobile rendering, ordinary-user denial, export interaction, error recovery and empty history. Database migration review/runtime verification is separate; apply it in a local/staging Supabase project before production.
