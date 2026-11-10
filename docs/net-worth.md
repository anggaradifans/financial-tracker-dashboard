# Assets, liabilities and net worth (#25)

The **Net worth** section lives at `/dashboard/net-worth`. `/demo/net-worth`
shows clearly labeled sample property, investments and a mortgage.

## What counts

Record the full value of property, land, cash, deposito, stocks, funds and bonds.
Record outstanding mortgages, loans and credit card debt separately as positive
liability amounts. Net worth is assets minus liabilities and may be negative.
Amounts support two decimal places and must be less than 10 trillion per entry.

Asset classifications are editable: investable, emergency reserve, primary
residence and other. A rental apartment or boarding house can be investable;
an owner-occupied apartment can be a primary residence. This classification
does not estimate income, liquidity or a financial freedom target.

Currencies are kept separate in the current balance sheet and in snapshots.
This feature does not infer exchange rates or add unlike currencies. Exchange
rate support belongs to #15.

## Account and goal links

Only accounts explicitly registered in the balance sheet count toward net worth.
A linked account replaces a manual valuation and may appear in only one active
entry. Its value uses the owner's non-deleted transactions in the entry currency
up to the current instant, including both types of transfer legs. Future-dated
transactions are excluded. A negative account balance becomes a liability;
an account without recorded transactions has a tracked balance of zero. An
explicitly linked liability uses the absolute tracked balance as outstanding
debt, regardless of its ledger sign.

These are **tracked balances**, not verified bank balances. Existing account
tracking does not include opening holdings ([backlog #29](https://github.com/anggaradifans/financial-tracker-dashboard/issues/29)). The screen and link form
explain this limitation. To record an independently verified value, use a manual
entry instead of linking the account. Do not add the same holdings twice.

User testing confirmed that missing opening holdings can make a savings account
appear under liabilities even when its real bank balance is positive. This
tracked deficit does not establish actual debt. Opening balances and reconciliation,
including clearer treatment of unreconciled deficits, are deferred to #29.
For now, archive the linked entry and use a manual valuation of the actual
holdings when transaction history does not represent the account's balance.

An optional goal link is an earmark only. It does not change either the asset's
value or the goal contribution ledger, and goal balances are never added to net
worth. Accounts and goals must belong to the same owner and use the same
currency. Foreign keys retain these links, including on archived entries;
linked accounts/goals cannot be deleted until their references are resolved.

## Valuation history and snapshots

Manual values have an explicit valuation date. Missing values remain null and
are excluded from totals with a partial-total message. Values older than 90 days
are included but labeled stale. Valuation dates and staleness use the Jakarta
calendar date in both the form and database; account calculations use the current
database instant.

Each save appends a revision, preserving the submitted name, classification,
notes, links, amount and valuation date. The most recently recorded revision is
current, even if its valuation date is earlier. Editing metadata also records a
revision. Currency, kind and account source stay fixed after creation. Archive
and create a new entry to change those dimensions. Archiving removes an entry
from current totals; restoring brings it back with its history intact.

**Save snapshot** freezes per-currency totals, valuation-quality counts and the
supporting entry rows together in one SQL statement. No automatic backfilling
or historical recalculation occurs. Snapshots retain values from accounts at
capture time even if the ledger changes afterward. The screen shows the newest
50 snapshots; older snapshots remain in the database. Account-linked revision
history records source/metadata changes, not every ledger balance change.

## Database contract and rollout

Apply `supabase/migrations/20261110100000_net_worth.sql` after the existing
security-hardening migration and before deploying this frontend. It requires
owner-scoped accounts, the goals tables, and PostgreSQL security-invoker views.
The migration is additive and does not rewrite existing ledger rows. It has
been tested against a disposable local database; it is not automatically applied
to the hosted Supabase project by the frontend build.

- `wealth_entries`: owner-scoped metadata and archive state.
- `wealth_valuations`: append-only revisions, including the original save request.
- `wealth_current`: security-invoker view reconciling linked accounts or manual values.
- `wealth_snapshots`: frozen totals and their entry details.
- `save_wealth_entry(p_entry jsonb, p_revision_id uuid)`: atomic save; owner comes
  from `auth.uid()`, never the payload. Keep the revision ID and request identical
  for retries. An existing revision with different contents is rejected. Existing
  entries require `expected_updated_at` to reject stale edits.
- `archive_wealth_entry(p_entry_id uuid, p_archived boolean)`: archive/restore.
- `capture_wealth_snapshot(p_snapshot_id uuid)`: retry-safe capture; an existing
  ID returns its original snapshot without overwriting it.

Browsers have owner-filtered SELECT policies and no direct table writes or
truncate grants. Only the three RPCs can mutate this feature. RPCs explicitly
scope their queries even when running as the function owner. Same-owner writes
are serialized, and unique indexes enforce active name and account uniqueness.
Manual entries referring to the same real-world holdings under different names
cannot be detected automatically.

For rollback, first export the wealth tables. Roll back the frontend, then drop
the `wealth_current` view, the three RPCs, `wealth_snapshots`,
`wealth_valuations`, `wealth_entries`, and `wealth_entries_guard()`. Dropping
these objects destroys this feature's history; existing transactions and goals
are unaffected.

## Verification

- `npm run test:database`: replays migrations and exercises two-user access,
  anonymous denial, immutable revisions/snapshots, retry handling, stale edits,
  duplicate links/names, unknown/stale values, negative net worth, currencies,
  goal earmarks, transfers and account overdrafts.
- `npm run test:security`: calculation, currency separation, cents, pagination,
  owner-filtered loading, and the repository's existing checks.
- `npm run build` and `npm run lint`.
- `npx playwright test tests/e2e/net-worth.spec.ts`: mocked authenticated UI flow,
  save/load failures, source and goal controls, snapshots, history, archive and
  restore, keyboard dialog focus, and mobile layout in both themes.

## UI decisions

Reading this as a personal balance sheet in the existing dashboard language:
ENERGY 1 / RHYTHM 2 / MOTION 1. Net worth is the focal point, followed by the
register and dated history. The dashboard's existing primary blue identifies
actions; red identifies negative net worth. Neutral surfaces and existing
typography preserve continuity with the transaction and goal screens. Numeric
amounts use tabular figures for comparisons. Summary blocks separate currencies,
while divided register rows let people compare holdings without repetitive
decorative cards. The existing icon family supplies a balance-scale navigation
icon because this screen compares assets and debt. Spacing separates totals,
holdings and historical records. Native dialogs supply keyboard containment and
Escape handling. No added animations or visual assets are needed.
