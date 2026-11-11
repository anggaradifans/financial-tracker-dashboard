# Spending opportunities technical analysis (#23)

Status: Implemented. [GitHub issue #23](https://github.com/anggaradifans/financial-tracker-dashboard/issues/23)

## Fit with the dashboard

Analytics opens to **Cash flow**, which shows recorded income, expenses, savings, and the monthly trend. **Spending** shows category changes, their transactions, and optional charts. The reporting date filter applies to both views. **Savings preview** has its own baseline months and recalculates as inputs change. A category’s **Preview a reduction** link adds that category to the current draft. Essential categories stay out of the preview. Purchase exclusions and refund matching are available under **Adjust baseline**.

Monthly savings already supplies owner-scoped, paginated transaction history, currency groups, local calendar dates, and equivalent comparison periods. `ConnectedSavingsAnalysis` loads that history for the authenticated dashboard, and `SavingsAnalysis` receives sample history in the demo. Reuse those inputs for both tasks. `useFinancialData` fetches a date-filtered ledger, so it cannot supply an independently selected baseline or reliably cover the previous period. [Monthly savings design](monthly-savings.md) · [GitHub issue #22](https://github.com/anggaradifans/financial-tracker-dashboard/issues/22)

The proposal uses React state and read-only calculations. It requires no migration, new endpoint, or service credentials. Recurring schedules can provide additional evidence in a later iteration once users can confirm them. [GitHub issue #13](https://github.com/anggaradifans/financial-tracker-dashboard/issues/13)

## Recorded category comparison

- Use the effective `range` and `previousRange` from `buildSavingsReport`. Compare full calendar months against the same number of preceding calendar months. For other ranges, compare the same number of local calendar days. Show both actual date ranges, mark a period clipped through today, and withhold changes for future-only ranges or an incomplete comparison period.
- Group non-deleted `outcome` rows by transaction currency and `category_id`. Use category names as labels. Exclude transfers and future dates using the monthly savings cutoff. Refunds recorded as `income` stay in the recorded cash-flow report. The comparison shows recorded expenses and reconciles to that report.
- Within each currency, include categories with expense rows in either period. Show current amount, prior amount, and signed change (`current − prior`). Calculate percentage change as `change ÷ prior × 100` when the prior amount is positive. A zero prior amount leaves the percentage unavailable. When coverage is insufficient, show available recorded subtotals with the affected dates and suppress both change fields. Require recorded cash flow before the period starts and at least one cash-flow transaction within it. An earlier transfer alone cannot establish coverage. A missing category in a period with recorded history contributes zero recorded expenses.
- Expand a category to show the exact contributing rows in each period with date, description, account, amount and currency. The visible row amounts must reconcile to the subtotal. Scenario exclusions and essential marks apply only to the preview.

## Scenario inputs and baseline

The proposed first release supports one editable draft per currency while the dashboard is open. Keep drafts in owner-keyed dashboard state so navigation, date filter changes, history refreshes and recoverable errors preserve the inputs. Sign-out or an owner change discards the old drafts. Reloading the browser starts a new draft. The demo uses independent sample state. Account-level saved scenarios and synced essential preferences would require a persistence design if requested.

Users select a range of calendar months, categories in one currency, and either a fixed monthly amount or a percentage applied to the selected categories' combined spending. Default to the last three completed months. Allow the user to mark a category essential by ID. Essential categories remain visible in the comparison and are removed from the preview selection while marked. Allow exclusions of individual purchases by transaction ID and of any baseline month by local `YYYY-MM` key. Show each excluded month and the reason.

For each currency, exclude the current and future months, the first recorded cash-flow month and months before it, months with no recorded cash-flow rows, and months the user marks incomplete. Determine coverage before applying category or purchase exclusions. A retained month with activity but no eligible spending contributes zero to the average. Require at least two retained months and a positive combined baseline before producing an estimate. These are proposed defaults. The ledger can establish that activity was recorded, so the UI should describe the calculation as based on recorded history and allow users to exclude known gaps.

### Refunds in a preview

The ledger stores nonnegative amounts and uses `income` and `outcome` to distinguish direction. It has no dedicated refund type or purchase link. The Goals emergency-fund calculation treats income in selected categories as refunds. Reusing that rule here could deduct unrelated income from spending, particularly for a category that allows both transaction types. [Transaction model](../src/types/financial.ts) · [Ledger schema](../supabase/migrations/20260917000000_production_baseline.sql) · [Goals basis](../supabase/migrations/20261030120000_goals.sql)

For the preview, let the user explicitly associate recorded income with an included purchase in the same currency. Both rows must be active and in retained baseline months. Subtract the confirmed refund in the month received, attributing it to the purchase category. Each credit can be applied once and combined refunds for a purchase cannot exceed its amount. Show the gross purchases and confirmed refunds behind the calculation. Removing a purchase or either month removes its refund from the calculation as well. For a refund whose purchase falls outside the baseline, the user can choose a baseline covering both months or exclude a month they consider atypical. Ordinary income and unconfirmed credits never lower the preview baseline. No matching based on descriptions, category names, or merchant frequency is needed.

## Calculation and validation

| Value | Calculation |
| --- | --- |
| Net baseline spending | Sum eligible purchases across the retained months and selected categories, less explicitly confirmed refunds |
| Monthly baseline | Net baseline spending ÷ retained month count, rounded to two decimal places |
| Proposed monthly reduction | Fixed monthly amount, or monthly baseline × percentage ÷ 100 rounded to two decimal places |
| Projected monthly spending | Monthly baseline − proposed monthly reduction |
| Estimated additional savings | Monthly reduction, and monthly reduction × 12 if repeated every month |

Use the ledger's two-decimal precision and integer hundredths for monetary arithmetic. Validate finite values, decimal precision and safe integer arithmetic before presenting an estimate. Accept fixed amounts from zero through the monthly baseline and percentages from 0 through 100. Reject larger or negative inputs with an inline message. Keep the entered value editable and hide the estimate until it becomes valid. Revalidate when changing categories, exclusions, refunds, dates or history reduces the baseline. An exact 100% reduction leaves zero projected spending.

For example, two retained months with IDR 1,300,000 in included purchases and IDR 100,000 in confirmed refunds give a monthly baseline of IDR 600,000. A 15% reduction gives IDR 510,000 in projected monthly spending, IDR 90,000 in estimated additional monthly savings, and IDR 1,080,000 over 12 months at the same reduction. Show the included month count and arithmetic with the result. The estimate assumes other cash flows stay the same and appears only in the preview.

## Implementation sequence

1. Add pure comparison and scenario calculations under `src/utils/`. Reuse the savings report's calendar ranges and cash-flow eligibility rules. Index rows by currency, month and category as needed, and retain row IDs or references for drill-down. Keep scenario input separate from derived output so reloading history recalculates from source rows.
2. Add a `SpendingOpportunities` component alongside `SavingsAnalysis`. Render comparison rows and expandable evidence first, then the scenario controls and estimate. Use labeled controls and keyboard-accessible disclosures. Show distinct states for a failed load, missing comparison history, insufficient baseline and invalid input.
3. Pass existing authenticated history and demo sample history into the new section. Preserve the existing all-pages-or-error behavior and discard stale owner or request results. Refresh after transaction adds, edits, deletions and imports. If an edit invalidates a selected category, purchase or refund, explain which input changed and recompute only from current eligible rows. Open transaction details on demand to avoid mounting the full ledger in the page.

## Verification before merge

| Area | Cases |
| --- | --- |
| Periods | Full months of different lengths, leap day, partial periods with equal local day counts, future ranges and DST boundaries. Check both date labels and transaction membership. |
| Comparison | New, increased, decreased and zero-baseline categories. Missing history suppresses changes. Supporting rows reconcile, including categories with the same label but different IDs. |
| Baseline | First month, current month, gaps, user-excluded months, a retained month with zero selected-category spend, fewer than two retained months and a zero baseline. |
| Refunds and exclusions | Ordinary income, unconfirmed refunds, cross-month partial refunds, duplicate and excessive credits, another currency, and an excluded or deleted purchase or credit. Confirm recorded cash-flow totals stay independent of preview inputs. |
| Reductions | Fixed and percentage modes, fractional amounts, zero and 100%, an amount above the baseline, invalid numbers, and a valid draft becoming invalid after a ledger edit. Check the displayed monthly and annual arithmetic. |
| Integration | Authenticated and demo Analytics, history spanning multiple pages, failed-page retry, imports and edits refreshing the preview, and owner changes clearing drafts. Verify currency isolation and that preview interactions send no transaction or budget write requests. |

Follow the existing `tests/savings.test.mjs` and `tests/e2e/savings.spec.ts` patterns. Run the calculation tests, the Analytics browser tests, type checking and lint. Exercise keyboard use and mobile layouts in both themes.
