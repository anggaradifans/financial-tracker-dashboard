# Next session: check Telegram webhook compatibility

## Update: review received

The compatibility session has returned its [backend review](telegram-backend-review-20260915.md).
Start with that report and the updated [rollout instructions](README.md).
Local fixes are prepared in the sibling `supabase` repository; production
rollout is still blocked on link verification, receipt routing/configuration,
and non-production deployment/transport validation. Do not repeat the original
audit without checking whether source or deployment state has changed.

The original handoff below is retained for context. Its statement that production
source had not been verified describes the earlier session; the returned review
reports that production verification was subsequently completed.

## Task

Check the actual Telegram webhook/backend against the prepared Supabase security
migration. Find category queries that depend on globally unique names, prepare
any necessary local fixes, and report whether the backend is ready for rollout.

Repository: `/Users/22070064/Documents/Tilaka/supabase-registration`

Read these files first:

- `database/migrations/20260915_browser_rls.sql`
- `database/README.md`
- `telegram-webhook-example.ts`

The webhook file in this repository is an example. Its relationship to the
deployed bot has not been verified. Locate the real webhook, bot handlers,
workers, and shared database helpers. If their source is unavailable, ask for
the repository/path or source export rather than treating the example as
production code.

## Decisions already made

- Accounts are shared across users. The eight existing accounts stay shared.
- All 21 existing categories become shared, read-only defaults for browser users.
- Newly created custom categories are private to their creator.
- Transactions and budgets belong to individual users.
- Registration must no longer create a Telegram profile. That frontend call
  has already been removed; do not restore it.

## Current state at handoff

The migration and matching frontend changes are prepared locally. They have
**not been applied to Supabase or deployed** in this session. Credential
revocation has not been performed. Recheck their status when starting.

The frontend REST client now uses the public API key plus the signed-in user's
access token. The rebuilt local bundle contains no service-role token. The old
deployed bundle/credential still needs removal and revocation during rollout.

Local database access tests, 10 frontend tests, and the production build passed.
TypeScript reports the same 12 errors as the original HEAD baseline. Local
database tests use synthetic records and do not reproduce the production
trigger bodies or exercise the live Telegram backend.

## What the live audit established

- RLS is enabled on all six public tables, but only `budgets` currently has policies.
- All 918 transactions and the one budget have owners.
- `accounts` and `categories` currently have no `user_id` column.
- `categories.name` currently has a global unique constraint, `categories_name_key`.
- The actual Telegram table uses `supabase_user_id`, not `user_id`, and requires
  `telegram_user_id`. The older Telegram setup SQL in this repository does not
  match the live schema.
- `create_telegram_user_record` is absent from the audited database. The only
  listed public functions are `ensure_category_type_alignment` and
  `update_updated_at_column`; both are invoker functions used by triggers.

## Required backend checks

1. **Category lookups:** find SQL, REST, SDK, caching, and classification code
   that searches categories by `name` alone or assumes `.single()` will succeed.
   After migration, the same name can exist for multiple users and as a shared
   default. Queries must limit results to shared defaults (`user_id IS NULL`)
   and/or the verified user's own categories. Define deterministic handling if
   that user has a custom category with the same name as a default; do not pick
   an arbitrary row or expose another user's private category.

2. **Category upserts:** find `ON CONFLICT (name)`, SDK `onConflict: 'name'`,
   and equivalent operations. The migration replaces the global constraint with
   two partial unique indexes: shared `(name) WHERE user_id IS NULL`, and private
   `(user_id, name) WHERE user_id IS NOT NULL`. Existing name-only upserts will
   fail. Use an appropriate SQL conflict target or a tested backend function/
   insert flow, including concurrent requests. Do not assume a REST
   `onConflict` column list alone can target these partial indexes.

3. **Identity and ownership:** resolve the verified Telegram sender through
   `telegram_users.supabase_user_id`. Write that ID explicitly on transactions,
   budgets, and private categories. The migration makes transaction and budget
   owners non-null. A backend service-role request without a user session does
   not obtain an owner from `auth.uid()`. Shared-default inserts should explicitly
   use a NULL category owner.

4. **Backend credentials and permissions:** privileged credentials must remain
   server-side and never enter `VITE_*` variables, responses, or logs. The
   migration removes direct browser access to Telegram/staging tables while
   preserving existing service-role table grants. Verify webhook authentication
   and sender mapping before privileged operations; service-role access bypasses
   RLS, so backend queries must enforce user/category boundaries themselves.

5. **Other dependencies:** inspect category caches, name-to-ID maps, transaction
   staging, scheduled jobs, and calls to old Telegram RPCs. Check the actual
   `ensure_category_type_alignment` trigger body if needed. Preserve shared
   account behavior; do not convert accounts into private rows.

## Verification and deliverable

- Test two distinct users with identically named private categories, shared
  defaults, and a private category matching a default's name.
- Check transaction/budget creation, category creation and lookup, retries,
  concurrent upserts, and rejection of another user's private category.
- Use mocks or a disposable database. Do not send real Telegram messages while
  testing unless the user explicitly requests it.
- Report findings with source file/line references, necessary local changes,
  test results, and any unavailable production code/configuration.
- Identify remaining rollout dependencies. Applying the production migration,
  deploying the webhook/frontend, and rotating credentials are separate live
  actions; this handoff requests compatibility checking and local preparation.

Do not paste credentials into the report or commit them to the repository.
