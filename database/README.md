# Remove browser service-role access

Prepared from the supplied live schema and permission audit on September 15, 2026.
The migration has been tested locally with synthetic records. It has not been
applied to Supabase, and the frontend changes have not been deployed.

## Findings from the live audit

- RLS is enabled on all six public tables. Only `budgets` has policies.
- `accounts` and `categories` have no `user_id` column. Their missing ownership
  is intentional for the shared records, rather than a failed user backfill.
- All 918 transactions and the existing budget have owners.
- Browser roles have broad grants including `TRUNCATE`, which RLS does not govern.
- The database has no `create_telegram_user_record` function. Its Telegram table
  uses `supabase_user_id` and requires `telegram_user_id`. The older Telegram
  setup files in the repository do not describe this database.

## Resulting access

| Data | Signed-in browser access |
| --- | --- |
| Transactions and budgets | Read, insert, update, delete only the current user's rows |
| Eight existing accounts and future accounts | Shared read, create, delete; referenced accounts cannot be deleted |
| 21 existing categories | Shared read-only defaults |
| New custom categories | Read and manage only the creator's rows |
| Telegram users and transaction staging | No direct browser access; existing service-role backend access stays available |

Account creation and deletion remain shared operations available to every
signed-in user, preserving the existing dashboard controls. Account updates
are not granted because the dashboard does not use them. Sharing account names
does not share transaction details or balances: those calculations use the
current user's transactions.

The migration adds nullable `categories.user_id`. NULL identifies a shared
default; browser inserts must belong to the authenticated user. Separate unique
indexes allow different users to reuse a custom category name. Transactions and
budgets can reference shared categories or their owner's private categories.

The frontend now sends the public API key in `apikey` and the user's current
access token in `Authorization`. Signup no longer calls the Telegram RPC.
Shared defaults show a label instead of a delete control. Demo category
management still uses its local data.

## Backend review received

The separate [Telegram backend review](telegram-backend-review-20260915.md)
reports verified deployed sources and locally prepared fixes in the sibling
`/Users/22070064/Documents/Tilaka/supabase` repository. Its production checks are
point-in-time observations from that review, not live checks repeated here.
The review says the browser migration remains unapplied and the exposed key
was still accepted. Production is not ready for rollout.

The companion [backend SQL](/Users/22070064/Documents/Tilaka/supabase/database/20260915_backend_compatibility.sql)
was read alongside this repository's migration. Its category owner column and
partial-index conflict target match our schema changes. It must run second.
No change to the browser migration is required for those dependencies.

The prepared resolver chooses the user's private category before a shared
default and creates missing categories with explicit ownership. Shared accounts
keep their existing global name constraint. Backend ownership triggers also
check privileged transaction and budget writes. The backend review reports
passing combined database tests, concurrency tests, and mocked handler tests.

### Remaining release blockers

- Verify existing Telegram-to-Supabase mappings independently. The old UUID-only
  `/register` command did not prove account ownership. An active mapping alone
  is not proof. The prepared handler disables that command; new users need an
  authenticated linking flow or administrator verification process.
- Verify receipt/PDF owner configuration, the owner's private Telegram chat,
  and the Cloudflare receipt endpoint (`/functions/v1/receipt-email-worker`).
- Validate Deno deployment packaging and real REST/RPC calls in a non-production
  environment. Stubbed local tests do not establish deployed transport behavior.
- Reconcile any historical confirmed staging records without a saved transaction
  ID that are encountered. Do not assign fallback owners or guess whether a
  transaction was already saved.

Duplicate email/PDF deliveries can still create separate staging records, and
notification delivery has no durable outbox. The fixes deduplicate Telegram
updates and confirmation of a single staging record; they do not provide
exactly-once ingestion across independent receipt deliveries. The full backend
review records these limitations and other unchanged OCR behavior.

## Rollout

1. Resolve the release blockers above, retain a database backup/schema export,
   and coordinate a pause of Telegram, receipt, and PDF ingestion.
2. Run `migrations/20260915_browser_rls.sql` once in the Supabase SQL Editor.
   It is transactional: a failed statement aborts the migration. It preserves
   existing rows and category IDs. Do not run the older setup SQL files as part
   of this migration, or rerun this migration after it succeeds.
3. Run `/Users/22070064/Documents/Tilaka/supabase/database/20260915_backend_compatibility.sql`
   once. This is a separate transaction: if it fails, the browser migration
   remains applied. Keep ingestion paused until the backend migration succeeds.
   Do not blindly use `supabase db push` or replay historical category seeds;
   their name-only conflict targets no longer match the category indexes.
4. Deploy the edited `telegram-webhook` and `receipt-email-worker` functions,
   update the PDF importer used by operators, and deploy the matching frontend
   in the same controlled window. The new callers require the backend RPCs to
   exist first. Verify deployment-time webhook secret configuration; the
   prepared handler no longer repairs the webhook from a chat command.
   Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the latter may contain
   an anon key or the newer public publishable key. Remove
   `VITE_SUPABASE_SERVICE_ROLE_KEY` from frontend build/deployment settings.
   The ignored local `.env` has not been changed, but the build no longer reads
   its service-role variable.
5. Revoke the leaked credential through Supabase's key migration/rotation flow.
   Prefer a publishable key for the browser and a new secret key for backends,
   updating consumers before disabling legacy keys. Removing an environment
   variable or deploying a new bundle does not revoke an old key. If rotating
   the legacy JWT secret, account for changed anon keys and affected sessions.
6. Verify live signup/login/password recovery, transaction CRUD, budget CRUD,
   CSV export, shared accounts, and custom categories with two test users.
   Test the Telegram backend as well. Check the deployed bundle for privileged
   credentials and confirm that the old credential is rejected. Resume ingestion
   after the deployment and authorized live smoke checks succeed.

Until step 5 succeeds, downloaded copies of the old credential can still bypass
the new policies. If deployment needs to be rolled back, do not restore a browser
bundle containing that credential; fix forward or temporarily disable access.

## Local verification

Validation for this change: the database access checks passed, all 10 automated
frontend checks passed, and the production build passed. The generated bundle
contains no service-role JWT or secret-key marker. TypeScript reports the same
12 diagnostics as the unchanged HEAD baseline, in the demo code and notification
utility; this change introduces no new diagnostics. Live sign-in and Telegram
integration tests remain part of rollout.

`npm run test:security` tests the REST client's tokens, signed-out behavior,
request headers, date filters, denied writes, error handling, and category delete
controls. `npm run build`
builds the browser bundle.

`bash database/tests/run.sh` creates a disposable local PostgreSQL cluster,
loads a fixture based on the audited table constraints, applies the migration,
and exercises anonymous, two-user, and service-role access. It uses synthetic
rows and does not contact Supabase. PostgreSQL command-line tools are required.
This repository's fixture does not reproduce production trigger bodies. The
separate backend review reports additional combined tests using the audited
production category-alignment trigger.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [API keys](https://supabase.com/docs/guides/getting-started/api-keys).
