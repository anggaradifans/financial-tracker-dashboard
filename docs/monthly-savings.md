# Monthly cash-flow savings

Issue: https://github.com/anggaradifans/financial-tracker-dashboard/issues/22

Open **Analytics** in the authenticated dashboard or public demo. The selected reporting period controls the period totals and category charts. The monthly savings trend covers all recorded months, including empty months and the current partial month. Expand a month or either comparison period to inspect the transactions behind its totals.

## Calculation rules

- Each transaction currency has its own report. There is no combined total or implicit exchange rate.
- Income and expenses follow the stored `income` and `outcome` types. Both owned-account transfer legs and soft-deleted transactions are excluded.
- Refunds recorded as income increase income and cash-flow savings in the month received. Descriptions and category names do not change transaction classification. This follows the existing transaction model; refunds are not subtracted a second time from expenses.
- Cash-flow savings = income minus expenses. Savings rate = savings / income × 100; it is unavailable for nonpositive income. Negative savings and rates remain negative.
- Monetary sums use integer cents, matching the database's two-decimal amounts.
- Goal contributions are separate allocation records. The report reads only transactions, so allocating an existing balance or linking a contribution to a transaction cannot create another expense or another saving. Cash flow is not an account balance.
- Dates follow the browser's local time zone. Day boundaries are inclusive. Future days are excluded from current reporting periods; future reporting ranges are labeled and exclude scheduled transactions.
- Full calendar months compare with preceding calendar months, including different month lengths. Other ranges compare with the immediately preceding equal number of calendar days. Current periods stop at today before choosing the comparison range.
- The first recorded month and periods before the first recorded transaction in each currency are marked **Incomplete history**. Other periods say **Recorded history only**: transaction records cannot prove that imports or manual entries cover every event. A zero in an empty month means no recorded cash flow.

## Data loading and updates

The authenticated report loads owner-scoped, non-deleted history in ordered pages of 500 transactions. It uses the explicit account-owner relationship when joining account information. A failed page shows an error and retry action rather than a partial total. Results from obsolete component requests are ignored. A transaction refresh, addition, edit, or deletion reloads reporting history. The public demo uses its existing labeled sample history.

## Verification and delivery gate

- Hard Gate PASS: production build and lint pass; browser tests exercise report retry, custom dates, period and monthly disclosures, goal navigation, edits and deletions. Keyboard Enter opens transaction details. At 320px, both themes fit without page overflow. Native disclosures reuse the dashboard focus outline. No assets, navigation items, or fabricated claims were added.
- Purpose Gate PASS: the existing blue accent identifies the selected period and savings series; red identifies negative savings. Existing dashboard typography and spacing preserve the financial application's number-reading hierarchy. The monthly chart answers how savings change across months; exact values are available in the disclosures. No decorative motion or imagery was introduced.
- Liveliness PASS: ENERGY 1 / RHYTHM 1 / MOTION 1. The selected period is the focal point, followed by the comparison and chronological monthly ledger. Currency headings and tabular numbers repeat the dashboard's existing financial reporting pattern.
- Craftsmanship PASS: calculation tests cover currencies, transfers, refunds, negative cash flow, nonpositive income, decimal precision, inclusive month boundaries, leap years, DST calendar arithmetic, empty months, partial/future periods, pagination, edits and deletions. Chromium tests cover the authenticated report with mocked network data and the public demo. Mobile and desktop screenshots were visually inspected. The monthly line does not animate; no media or additional third-party scripts were added.

The existing production bundle-size warning remains. No database migration is required.
