# Issue #21: security hardening

The user reported successfully applying migration `20261109100000` to hosted
Supabase on November 10, 2026. This agent did not run the hosted migration, a
reset, or a seed. Application/function deployment and live verification remain
separate rollout steps.

## Account ownership and preservation

`supabase/migrations/20261109100000_security_hardening.sql` adds owner-scoped
accounts and replaces the shared browser policies. Composite foreign keys prevent
transactions and both staging endpoints from referencing another owner's account,
including writes through privileged functions and the service role.

Backfill uses all transactions (including soft-deleted rows) and all staging
statuses, including transfer destinations:

- An account referenced by one owner retains its original ID.
- An account referenced by several owners gets a copy for each owner; references
  move to that owner's copy. The original account remains intact and hidden.
- Accounts with no ownership evidence retain their original records and NULL
  owner. They are hidden from browsers until an administrator explicitly assigns
  an owner after verification. NULL-owner staging rows are also retained.
- Account names become unique per owner. Copies retain name, currency and creation
  time. Transaction IDs, financial fields, metadata, timestamps and transfer IDs
  stay unchanged. Only account references are remapped.

The migration locks the three affected tables, uses short lock/statement timeouts,
and compares complete before/after financial rows (excluding remapped endpoints)
and original account details. A preservation failure aborts the transaction.
The file includes explicit `BEGIN`/`COMMIT` so locks, temporary preservation tables
and all schema/data changes share one transaction even when the runner does not
provide an outer transaction. Run the complete file through the migration runner.
It contains no deletion, truncation, data seeding, or cascade on user deletion.
The baseline and historical setup SQL must never be replayed on production.

## Coordinated rollout

1. Verify a restorable production backup/PITR point and capture counts, per-user
   currency totals, and account references. Check schema drift against the reviewed
   migration, especially extra triggers or external account references.
2. Pause dashboard writes, receipt ingestion, Telegram confirmation and PDF imports.
3. Apply only the pending reviewed migration with `supabase db push` after reviewing
   its dry-run output. Never use `supabase db reset` against a hosted project.
4. Deploy the dashboard and the companion receipt worker; update the local PDF
   importer before using it. Their owner-aware account upserts must ship together
   with the change from global account-name uniqueness.
5. Compare counts/totals, inspect NULL-owner accounts, and smoke-test two-user
   account isolation, ordinary writes, transfers, receipt ingestion and confirmation.
   Check password recovery, CSV downloads and deployed response headers too. Resume
   ingestion once these pass.

The companion changes were applied locally in
`/Users/22070064/Documents/radifans/supabase`: `functions/receipt-email-worker/index.ts`,
`scripts/import-bank-pdf.mjs`, and their handler tests. A reviewable copy is included
at `companion-patches/20261109_receipt_account_ownership.patch`. Do not apply it
again if that checkout already contains the changes. Its deployment is separate.
Existing integrations that upsert accounts by name alone must use `(user_id, name)`
and pass an explicit verified owner. Stale external account IDs need to be refreshed
from the owner's account list after a shared account is split.

If rollout fails, keep ingestion paused and fix forward. Do not reverse the
ownership migration by deleting copied accounts or rebuilding tables. Restoring a
backup is a separate incident decision because it could lose writes made afterward.

## Other changes

- CSV cells with formula prefixes are quoted as text before normal CSV escaping.
- Password recovery uses the same success response for successful, rejected and
  failed requests; API error details are not displayed.
- Expired rate-limit keys are swept on request, at most once per window. This is
  still per-instance limiting. Before horizontal scaling needs a global limit,
  replace it with an atomic shared counter/TTL store such as Redis or Upstash.
- Vercel headers deny framing, MIME sniffing and unused device permissions. CSP
  allows same-origin scripts/workers, Supabase HTTPS/WebSockets, the existing Google
  fonts, Unsplash background and Sentry ingestion. Inline styles remain allowed
  for React/charts. Custom Supabase domains or a custom Sentry relay need an
  explicit CSP allowlist update. Production headers require a Vercel deployment.
- Storybook 7 was replaced with 10.6.6 and the docs addon; controls, actions,
  backgrounds and viewport are built in. Compatible dependency patches were also
  refreshed. The Storybook migration follows the
  [official guide](https://storybook.js.org/docs/releases/migration-guide).

The dependency follow-up on November 10, 2026 resolves the remaining 12 audit
findings. Verification reports zero vulnerabilities in both the full dependency
tree and production-only dependencies. Vite is updated to 8.3.7 and its React
plugin to 6.3.0; Storybook's compatible esbuild dependency is updated as well.

Two scoped overrides cover upstream version constraints:

- Storybook React/Vite uses `@joshwooding/vite-plugin-react-docgen-typescript`
  0.9.1 or later, replacing its vulnerable `glob` dependency with `tinyglobby`.
- TypeScript ESLint's `typescript-estree` uses `minimatch` 11.0.5 or later, which
  fixes the glob-parts denial of service. Node 24 satisfies its engine requirement.

These overrides are limited to the affected parent packages. Review and remove
one when the corresponding upstream package accepts a patched version itself.
Compatibility checks cover the type-aware ESLint parser's `allowDefaultProject`
matching, app and Storybook builds, security tests and demo browser flows. The
upgrade follows the [Vite migration guide](https://vite.dev/guide/migration).
No Supabase schema or data changes are involved.

## Verification

- `npm run test:security`: CSV download payloads, limiter eviction, headers and
  existing API/client security tests.
- `LC_ALL=en_US.UTF-8 npm run test:database`: disposable Unix-socket PostgreSQL,
  synthetic historical and pending data, two-user isolation, privileged write
  rejection, Telegram account selection/confirmation, future grants, and a forced
  migration failure immediately before its own COMMIT proving schema/data rollback,
  without a test-supplied outer transaction. It never contacts Supabase.
- Local Playwright suite: 12 passed across demo navigation, keyboard/mobile flows,
  password recovery and CSP. Recovery tests mock every recovery API call, including
  rejection and network failures. The CSP test attaches the production headers to
  the preview response and checks dashboard scripts and CSV export without policy
  violations.
- `npm run lint`, `npm run build`, `npm run build-storybook`.
- Companion mocked handler tests: 32 passed with `node --test
  database/tests/handlers.test.cjs` in the companion repository; no real ingestion
  occurred.

Live data preservation and deployed transports still need the coordinated rollout
checks above; local synthetic tests cannot establish the current hosted schema.
