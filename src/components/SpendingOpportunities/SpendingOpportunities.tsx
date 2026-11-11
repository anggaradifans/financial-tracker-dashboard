import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FinancialCharts from '../FinancialCharts'
import InsightsSection from '../InsightsSection'
import { buildCategoryBreakdown, buildTimeSeries } from '../../utils/transfers'
import type { DateRange, Transaction } from '../../types/financial'
import {
  buildSpendingBaseline, compareSpending, createSpendingDraft, estimateSpendingReduction,
} from '../../utils/spendingOpportunities'
import type { SpendingDraft, SpendingDrafts, SpendingReport } from '../../utils/spendingOpportunities'

const muted = 'text-sm text-gray-600 dark:text-gray-300'
const field = 'min-h-11 w-full min-w-0 rounded-md border border-gray-500 bg-white px-3 text-sm [color-scheme:light] dark:border-gray-400 dark:bg-gray-900 dark:[color-scheme:dark]'
const button = 'min-h-11 cursor-pointer rounded-md border border-gray-500 px-3 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-400 dark:hover:bg-gray-800'
const errorText = 'text-sm text-red-700 dark:text-red-300'
const day = (value: Date) => value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const dates = (range: DateRange) => `${day(range.start)} to ${day(range.end)}`

function money(cents: number, currency: string) {
  if (!Number.isSafeInteger(cents)) return 'Unavailable'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }
}

function transactionLabel(tx: Transaction) {
  return tx.description || tx.category?.name || 'Transaction'
}

function transactionOption(tx: Transaction) {
  return `${day(new Date(tx.occurred_at))} · ${transactionLabel(tx)} · ${tx.account?.name ?? 'No account'} · ${money(Math.round(Number(tx.amount) * 100), tx.currency)}`
}

function Disclosure({ label, children }: { label: ReactNode; children: () => ReactNode }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium text-primary-700 hover:underline dark:text-blue-300">{label}</summary>
    {open && children()}
  </details>
}

function TransactionList({ label, rows }: { label: string; rows: Transaction[] }) {
  return <div className="min-w-0">
    <p className="text-sm font-medium">{label}</p>
    {rows.length ? <ul className="mt-1 divide-y divide-gray-200 dark:divide-gray-700">
      {rows.map(tx => <li key={tx.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2 text-sm">
        <div className="min-w-0 break-words">
          <p>{transactionLabel(tx)}</p>
          <p className={muted}>{day(new Date(tx.occurred_at))} · {tx.account?.name ?? 'No account'}</p>
        </div>
        <span className="tabular-nums">{money(Math.round(Number(tx.amount) * 100), tx.currency)}</span>
      </li>)}
    </ul> : <p className={muted}>No recorded expenses.</p>}
  </div>
}

type CurrencyReport = SpendingReport['groups'][number]

function SpendingComparison({ report, group, draft, previewPath, onPreview }: {
  report: SpendingReport; group: CurrencyReport; draft: SpendingDraft; previewPath: string
  onPreview: (categoryId: string | null) => void
}) {
  const { categories, currentCovered, previousCovered } = useMemo(
    () => compareSpending(group, report), [group, report],
  )
  const unavailable = [
    !currentCovered && (report.future ? 'The selected period is in the future.' : 'The selected period has insufficient recorded history.'),
    !previousCovered && 'The previous period has insufficient recorded history.',
  ].filter(Boolean).join(' ')

  return <div className="space-y-3">
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">Selected period</dt><dd className={muted}>{dates(report.range)}{report.partial && ' (through today)'}</dd></div>
      <div><dt className="font-medium">Previous equivalent period</dt><dd className={muted}>{dates(report.previousRange)}</dd></div>
    </dl>
    {unavailable && <p className={muted}>{unavailable} Changes are unavailable.</p>}
    {categories.length ? <ul className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700">
      {categories.map(category => <li key={category.id ?? ''} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <h3 className="min-w-0 break-words font-medium">{category.name}</h3>
          {draft.essentialIds.includes(category.id) ? <p className={`${muted} py-3`}>Marked essential</p> :
            <Link
              className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary-700 hover:underline dark:text-blue-300"
              to={previewPath}
              aria-label={`Preview a reduction for ${category.name}`}
              onClick={event => {
                if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) onPreview(category.id)
              }}
            >Preview a reduction</Link>}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4">
          <div className="min-w-0"><dt className={muted}>Selected</dt><dd className="break-words">{money(category.currentAmount, group.currency)}</dd></div>
          <div className="min-w-0"><dt className={muted}>Previous</dt><dd className="break-words">{money(category.previousAmount, group.currency)}</dd></div>
          <div className="min-w-0"><dt className={muted}>Change</dt><dd className="break-words">{category.change === null ? 'Unavailable' : `${category.change > 0 ? '+' : ''}${money(category.change, group.currency)}`}</dd></div>
          <div className="min-w-0"><dt className={muted}>Change (%)</dt><dd>{category.percent === null ? 'Unavailable' : new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(category.percent / 100)}</dd></div>
        </dl>
        <Disclosure label={`Transactions for ${category.name}`}>
          {() => <div className="grid gap-3 pb-2 sm:grid-cols-2">
            <TransactionList label="Selected-period expenses" rows={category.currentRows} />
            <TransactionList label="Previous-period expenses" rows={category.previousRows} />
          </div>}
        </Disclosure>
      </li>)}
    </ul> : <p className={muted}>No recorded expenses in either period. Try a different Analytics date range.</p>}
    {group.current.transactions.length > 0 && <Disclosure label="Charts and insights">
      {() => {
        const breakdown = buildCategoryBreakdown(group.current.transactions)
        return <div className="space-y-4">
          <FinancialCharts timeSeriesData={buildTimeSeries(group.current.transactions)} categoryBreakdown={breakdown} currency={group.currency} />
          <InsightsSection transactions={group.current.transactions} categoryBreakdown={breakdown} dateRange={report.range} currency={group.currency} />
        </div>
      }}
    </Disclosure>}
  </div>
}

function toggle<T>(items: T[], item: T, enabled: boolean) {
  return enabled ? [...items, item] : items.filter(value => value !== item)
}

function Check({ checked, disabled, onChange, children }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: ReactNode
}) {
  return <label className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm has-[:disabled]:cursor-default cursor-pointer">
    <input type="checkbox" className="h-4 w-4 !min-h-0 shrink-0 accent-primary-700 dark:accent-primary-400" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span className="min-w-0 break-words">{children}</span>
  </label>
}

type Baseline = ReturnType<typeof buildSpendingBaseline>

function RefundEditor({ baseline, draft, update, validate }: {
  baseline: Baseline; draft: SpendingDraft; update: (patch: Partial<SpendingDraft>) => void
  validate: (link: SpendingDraft['refunds'][number]) => string | null
}) {
  const [purchaseId, setPurchaseId] = useState('')
  const [creditId, setCreditId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const usedCredits = new Set(draft.refunds.map(refund => refund.creditId))
  const availableCredits = baseline.credits.filter(credit => !usedCredits.has(credit.id))
  const purchase = baseline.includedPurchases.find(row => row.id === purchaseId)
  const credit = availableCredits.find(row => row.id === creditId)

  return <div className="space-y-3 pb-2">
    <p className={muted}>Choose an income transaction you recognize as a refund and link it to its purchase. Both must be in included baseline months.</p>
    {baseline.refunds.length > 0 && <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {baseline.refunds.map((refund, index) => <li key={refund.creditId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div className="min-w-0 break-words">
          <p>{refund.credit ? transactionOption(refund.credit) : 'Unavailable credit'} → {refund.purchase ? transactionLabel(refund.purchase) : 'Unavailable purchase'}</p>
          {refund.error && <p className={errorText}>{refund.error}</p>}
        </div>
        <button type="button" className={button} onClick={() => update({ refunds: draft.refunds.filter((_, position) => position !== index) })}>Remove refund</button>
      </li>)}
    </ul>}
    {baseline.includedPurchases.length && availableCredits.length ? <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 space-y-1 text-sm font-medium">Refund credit
          <select className={field} value={credit?.id ?? ''} onChange={event => { setCreditId(event.target.value); setError(null) }}>
            <option value="">Choose an income transaction</option>
            {availableCredits.map(tx => <option key={tx.id} value={tx.id}>{transactionOption(tx)}</option>)}
          </select>
        </label>
        <label className="min-w-0 space-y-1 text-sm font-medium">Original purchase
          <select className={field} value={purchase?.id ?? ''} onChange={event => { setPurchaseId(event.target.value); setError(null) }}>
            <option value="">Choose a purchase</option>
            {baseline.includedPurchases.map(tx => <option key={tx.id} value={tx.id}>{transactionOption(tx)}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className={button} disabled={!purchase || !credit} onClick={() => {
        const link = { creditId, purchaseId }
        const problem = validate(link)
        setError(problem)
        if (problem) return
        update({ refunds: [...draft.refunds, link] })
        setPurchaseId('')
        setCreditId('')
      }}>Apply refund</button>
      {error && <p className={errorText} role="alert">{error}</p>}
    </> : <p className={muted}>There are no eligible purchase and credit pairs to add.</p>}
  </div>
}

function Scenario({ group, now, draft, setDraft }: {
  group: CurrencyReport; now: Date; draft: SpendingDraft; setDraft: (draft: SpendingDraft) => void
}) {
  const baseline = useMemo(() => buildSpendingBaseline(group, draft, now), [group, draft, now])
  const { estimate, error } = estimateSpendingReduction(baseline.monthly, draft)
  const hasSelectedCategories = baseline.categories.some(category => draft.categoryIds.includes(category.id) && !draft.essentialIds.includes(category.id))
  const reductionErrorId = useId()
  const format = (value: number) => money(value, group.currency)
  const update = (patch: Partial<SpendingDraft>) => setDraft({ ...draft, ...patch })

  return <div className="space-y-4">
    <p className={muted}>Choose the months to average, check the categories you want to spend less on, then enter a percentage or monthly amount. Your draft resets when you reload or sign out.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="min-w-0 space-y-1 text-sm font-medium">Baseline start month
        <input type="month" placeholder="YYYY-MM" className={field} value={draft.startMonth} onChange={event => update({ startMonth: event.target.value })} />
      </label>
      <label className="min-w-0 space-y-1 text-sm font-medium">Baseline end month
        <input type="month" placeholder="YYYY-MM" className={field} value={draft.endMonth} onChange={event => update({ endMonth: event.target.value })} />
      </label>
    </div>
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold">Categories to reduce</legend>
      <p className={muted}>Mark a category essential to keep it out of the reduction.</p>
      {baseline.categories.length ? <ul className="mt-1 divide-y divide-gray-200 dark:divide-gray-700">
        {baseline.categories.map(category => {
          const essential = draft.essentialIds.includes(category.id)
          return <li key={category.id ?? ''} className="flex flex-wrap items-center justify-between gap-x-3">
            <Check checked={!essential && draft.categoryIds.includes(category.id)} disabled={essential} onChange={checked => update({ categoryIds: toggle(draft.categoryIds, category.id, checked) })}>Include {category.name}</Check>
            <Check checked={essential} onChange={checked => update({
              essentialIds: toggle(draft.essentialIds, category.id, checked),
              categoryIds: checked ? toggle(draft.categoryIds, category.id, false) : draft.categoryIds,
            })}>Mark {category.name} essential</Check>
          </li>
        })}
      </ul> : <p className={muted}>No expense categories are recorded in this currency.</p>}
      {baseline.unavailableCategories > 0 && <p className={muted}>Some selected categories are no longer in the recorded history and have been omitted from this calculation.</p>}
    </fieldset>
    <Disclosure label={`Baseline months (${baseline.count} included)`}>
      {() => baseline.months.length ? <>
        {!hasSelectedCategories && <p className={muted}>Check at least one category to see its spending in each included month.</p>}
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {baseline.months.map(month => <li key={month.key} className="flex flex-wrap items-center justify-between gap-x-3 border-gray-200 py-1 dark:border-gray-700">
            <div className="min-w-0 break-words text-sm">
              <p>{month.key} · {month.reason ?? 'Included'}</p>
              {!month.reason && hasSelectedCategories && <p className={muted}>{format(month.gross)} in selected purchases · {format(month.refunded)} confirmed refunds</p>}
            </div>
            {(!month.reason || month.reason === 'Marked incomplete') && <Check checked={draft.excludedMonths.includes(month.key)} onChange={checked => update({ excludedMonths: toggle(draft.excludedMonths, month.key, checked) })}>Mark {month.key} incomplete</Check>}
          </li>)}
        </ul>
      </> : <p className={muted}>Choose a valid baseline range.</p>}
    </Disclosure>
    <Disclosure label="Adjust baseline">
      {() => <div className="space-y-2 pl-3">
        <Disclosure label="Exclude unusual purchases">
          {() => baseline.purchases.length ? <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {baseline.purchases.map(tx => <li key={tx.id}>
              <Check checked={draft.excludedPurchases.includes(tx.id)} onChange={checked => update({ excludedPurchases: toggle(draft.excludedPurchases, tx.id, checked) })}>Exclude {transactionOption(tx)}</Check>
            </li>)}
          </ul> : <p className={muted}>No purchases from the selected categories in the included months.</p>}
        </Disclosure>
        <Disclosure label={`Confirm refunds (${baseline.refunds.filter(refund => !refund.error).length} applied)`}>
          {() => <RefundEditor baseline={baseline} draft={draft} update={update} validate={link => {
            const next = buildSpendingBaseline(group, { ...draft, refunds: [...draft.refunds, link] }, now)
            return next.refunds[next.refunds.length - 1].error
          }} />}
        </Disclosure>
      </div>}
    </Disclosure>
    {baseline.unavailableExclusions > 0 && <p className={muted}>Some excluded purchases are no longer in the recorded history.</p>}
    {baseline.refunds.some(refund => refund.error) && <p className={muted}>Some refund links no longer apply. Open Adjust baseline to review them.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="min-w-0 space-y-1 text-sm font-medium">Reduction type
        <select className={field} value={draft.mode} onChange={event => update({ mode: event.target.value === 'amount' ? 'amount' : 'percent', reduction: '' })}>
          <option value="percent">Percentage</option>
          <option value="amount">Fixed monthly amount</option>
        </select>
      </label>
      <label className="min-w-0 space-y-1 text-sm font-medium">{draft.mode === 'percent' ? 'Reduction (%)' : `Monthly reduction (${group.currency})`}
        <input className={field} type="text" inputMode="decimal" value={draft.reduction} onChange={event => update({ reduction: event.target.value })} aria-invalid={Boolean(error)} aria-describedby={error ? reductionErrorId : undefined} />
      </label>
    </div>
    {error && <p className={errorText} id={reductionErrorId} role="alert">{error}</p>}
    <div aria-live="polite" className="space-y-2">
      {baseline.message && <p className={muted}>{baseline.message}</p>}
      {baseline.monthly !== null && <>
        <p className="break-words text-sm tabular-nums">Monthly baseline: ({format(baseline.gross)} purchases − {format(baseline.refunded)} refunds) ÷ {baseline.count} months = <strong>{format(baseline.monthly)}</strong></p>
        {!draft.reduction.trim() && <p className={muted}>Enter a reduction above to see estimated monthly and annual savings.</p>}
        {estimate && <div className="space-y-2 rounded-lg bg-primary-50 p-4 text-sm dark:bg-blue-950">
          <h3 className="font-semibold">Estimated additional savings</h3>
          <p className="break-words tabular-nums">Additional savings per month: {draft.mode === 'percent' && `${format(baseline.monthly)} × ${draft.reduction.trim()}% = `}<strong>{format(estimate.reduction)}</strong></p>
          <p className="break-words tabular-nums">Additional savings per year: {format(estimate.reduction)} × 12 = <strong>{format(estimate.annual)}</strong></p>
          <p className="break-words tabular-nums">Monthly spending target: {format(baseline.monthly)} − {format(estimate.reduction)} = <strong>{format(estimate.projected)}</strong></p>
          <p className={muted}>Assumes the same reduction each month and other cash flows stay the same.</p>
        </div>}
      </>}
    </div>
  </div>
}

export default function SpendingOpportunities({
  report, now, drafts, setDraft, view, previewPath, currency, onCurrencyChange,
}: SpendingDrafts & {
  report: SpendingReport; now: Date; view: '/spending' | '/savings-preview'; previewPath: string
  currency: string; onCurrencyChange: (currency: string) => void
}) {
  const heading = useId()
  const group = report.groups.find(group => group.currency === currency) ?? report.groups[0]
  const draft = group && (drafts[group.currency] ?? createSpendingDraft(now))
  const isPreview = view === '/savings-preview'
  const title = isPreview ? 'Savings preview' : 'Spending by category'

  return <section aria-labelledby={heading} className="min-w-0 space-y-5">
    <h2 className="text-xl font-semibold" id={heading}>{title}</h2>
    {group && draft ? <>
      {report.groups.length > 1 && <label className="block max-w-xs space-y-1 text-sm font-medium">Spending currency
        <select className={field} value={group.currency} onChange={event => onCurrencyChange(event.target.value)}>
          {report.groups.map(item => <option key={item.currency}>{item.currency}</option>)}
        </select>
      </label>}
      {isPreview
        ? <Scenario key={group.currency} group={group} now={now} draft={draft} setDraft={draft => setDraft(group.currency, draft)} />
        : <SpendingComparison
            key={group.currency}
            report={report}
            group={group}
            draft={draft}
            previewPath={previewPath}
            onPreview={categoryId => {
              if (!draft.categoryIds.includes(categoryId)) {
                setDraft(group.currency, { ...draft, categoryIds: [...draft.categoryIds, categoryId] })
              }
            }}
          />}
    </> : <p className={muted}>{isPreview ? 'Add or import transactions to preview a reduction.' : 'Add or import transactions to compare spending.'}</p>}
  </section>
}
