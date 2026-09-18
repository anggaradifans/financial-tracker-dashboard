# Remediation verification, September 17, 2026

The exposed Supabase credential has been revoked. The old council checklist and September 15 rollout notes no longer describe production accurately. The owner confirms the backup restore succeeded. Schema reproducibility and the initial CI/type-checking work were completed during this review.

This review inspected the current repository, the previous tasks “Assess public Supabase key exposure” and “Check Telegram webhook compatibility,” the latter's local session record, the sibling backend repository, and read-only production checks. It did not rotate credentials, deploy code, send messages, or change production data.

| Gate | Verified state | Remaining requirement |
| --- | --- | --- |
| 00: restored ledger off Supabase | September 16 schema and data dumps exist off Supabase. The owner confirms a successful restore; no restore transcript was retained. Supabase Free has no managed backups or PITR. | Automate future off-platform backups and retain restore evidence. |
| 01: credential exposure | Old service-role credential returns HTTP 401. Current public bundles contain a publishable key and no detected secret, legacy JWT, or Gemini-key pattern. The incident record and evidence limits are documented. | Owner-led ledger reconciliation remains. Remove the unused Gemini variable or rotate it if it was exposed elsewhere. |
| 02: database authorization | RLS/policies are live. A data-free production baseline is registered as migration `20260917000000`; local and remote ledgers match. Drifted root SQL is marked historical. The duplicate financial-data hook is consolidated. | A self-service Telegram linking flow is needed only before accepting new users. |
| 03: isolation and CI | TypeScript, build, lint, 10 security tests, disposable database isolation, and the public-demo Playwright flow pass. CI, the authenticated Playwright flow, and optional Sentry integration are present. | Configure GitHub E2E secrets and a Sentry DSN, then run the authenticated hosted E2E. Choose a secure backup destination before enabling automated data export. |
| 04: revenue | No decision established in this review; previous session says the dashboard is used only by its owner. | Keep this phase gated. Do not begin monetization or infrastructure migration as part of this review. |

## Evidence collected today

- A zero-row REST request using the old local service-role JWT returned **401**. No key value or transaction data was printed.
- Fetched the entry page and its JavaScript asset from both `https://finance.radifans.my.id` and `https://financial-tracker-dashboard.vercel.app`. Both contained a publishable key; neither contained a legacy JWT, `sb_secret_` credential, Google API-key pattern, or the exact old service-role key. This covers current entry bundles, not every old deployment, CDN object, or archived copy.
- Live table checks: RLS enabled on `accounts`, `categories`, `transactions`, `budgets`, `telegram_users`, `transaction_staging`, and `telegram_processed_updates`.
- Read actual production policy definitions: transactions and budgets are owner-scoped, custom categories are private, and shared defaults are readable. Accounts remain shared by the owner's explicit earlier choice, including account creation/deletion. This is not a fully private per-customer account model.
- No public table grants TRUNCATE to `anon` or `authenticated`. Anonymous callers cannot execute `backend_resolve_category`.
- Supabase reports active `telegram-webhook` version 35 and `receipt-email-worker` version 10. These are newer than the September 16 rollout versions. This check establishes deployment status, not a fresh end-to-end Telegram receipt test.
- `npm run test:security`: 10/10 pass.
- `bash database/tests/run.sh`: all database access checks pass. This uses a synthetic PostgreSQL fixture, a stub `auth.uid()`, and role switching. It does not exercise real Supabase login/JWT validation/PostgREST or reproduce every production trigger.
- `npm run build`: passes and now runs `tsc --noEmit` first. The previous 12 TypeScript diagnostics are fixed.
- `npm run lint`: passes without warnings.
- `npm run test:e2e`: the public demo test passes. The authenticated login/add-transaction test is skipped locally because no disposable E2E account is configured.
- Production dependency audit after targeted Supabase and React Router upgrades: zero vulnerabilities.
- Targeted scan of all reachable local Git history found no JWT, Supabase secret-key, or Google API-key pattern. `.env` and `dist/` have no tracked history. This was a pattern scan, not a complete Gitleaks scan of every provider's credential format.

## Work still needed, in gate order

### Gate 00: recovery status

The existing files are in the sibling backend's ignored `database/backups/` directory:

- `production-pre-rollout-20260916.sql`, approximately 16 KB.
- `production-pre-rollout-20260916.data.sql`, approximately 434 KB.

The data file contains application, Auth, and Storage metadata inserts; it is not just a schema dump. The owner confirms it was restored successfully. That closes the original exit criterion by owner attestation. Preserve the September 16 recovery point and retain logs/counts from future restore drills.

Supabase dashboard verification: the project is on Free, which has no managed scheduled backups. PITR is a paid add-on and is not enabled. The available log picker permits 24 hours; 7, 14, and 28-day ranges are locked. The March-to-September investigation window is unavailable.

### Gate 01: finish incident follow-up

Supabase revocation does not need to be repeated. The prior rollout records replacement publishable/secret keys, legacy-key disabling, backend redeployment, and successful importer access with the new credential. Today's old-key rejection and clean current bundles corroborate the main containment result.

Remaining items:

1. Reconcile ledger balances and questionable writes against bank records or Telegram history. Current aggregates cannot distinguish legitimate owner activity from an unauthorized write.
2. Remove the unused Gemini variables from Vercel/local configuration. No source consumer or published key was found, so this is cleanup rather than incident containment. Rotate only if the key was exposed through another channel.
3. Update the local frontend `.env`: despite production using a publishable key under the legacy `VITE_SUPABASE_ANON_KEY` name, the ignored local file still contains a legacy anon JWT. It is not privileged, but local builds differ from production.
4. Run a provider-aware secret scanner if broader history assurance is required; retain the targeted scan result above as limited evidence.

### Gate 02: preserve the authorization work

The council's proposed SECURITY DEFINER signup fix is superseded. Registration now calls Supabase Auth only and creates no Telegram profile. The audited production database had no `create_telegram_user_record` function. Do not restore that privileged signup path just to match the old checklist.

The REST helper still exists, but its behavior changed: `src/lib/supabaseRest.ts` requires a current user session, sends the public key in `apikey`, and the user's access token in `Authorization`. Its authorization cannot be overridden by caller headers. Its continued existence is not evidence that the service-role bypass remains.

Completed: the session-scoped implementation is now the canonical `useFinancialData.ts`; the stale duplicate hook and `useFinancialDataRest.ts` name are gone. The authenticated REST helper remains as its transport layer.

Prior session evidence records the owner's independent Telegram/account confirmation, verified private receipt chat/routing, disabling UUID-only `/register`, and backend ownership checks. A self-service one-time linking flow is still required if unverified new users are allowed to link; it is not needed to redo the already verified single-owner mapping.

Completed: `supabase/migrations/20260917000000_production_baseline.sql` captures the current public schema without ledger data. The version is registered as applied in production and local/remote migration history matches. Supabase CLI configuration and workflow documentation are in `supabase/`. Five drifted root SQL files are marked historical.

### Gate 03: make validation repeatable

- Configure the four `E2E_*` repository secrets against a disposable Supabase branch and run the prepared login/add-transaction Playwright flow. It intentionally skips when credentials are absent.
- Add a Sentry DSN to activate the prepared error tracking integration. Authentication bootstrap failures now surface to the user and are captured when Sentry is configured.
- Choose an off-platform encrypted backup destination before enabling automation, then schedule a monthly restore drill with retained evidence.
- Consolidate budget calculations after the incident gates. This review did not establish equivalent frontend/backend budget semantics.

The existing `database/README.md`, handoff, and backend review contain useful historical evidence but still say changes were not deployed and the old key was accepted. Read those as September 15 observations. This verification records the later rollout and today's checks; do not rerun already applied migrations based on their stale status text.
