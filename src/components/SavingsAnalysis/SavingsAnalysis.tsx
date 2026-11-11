import { memo, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DateRange, Transaction } from '../../types/financial'
import { buildSavingsReport, SavingsTotals } from '../../utils/savings'
import { loadSavingsHistory } from '../../utils/savingsHistory'
import type { SpendingDrafts } from '../../utils/spendingOpportunities'
import SpendingOpportunities from '../SpendingOpportunities/SpendingOpportunities'
import type { AnalyticsView } from '../AnalyticsNavigation/AnalyticsNavigation'
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'

const date = (value: Date) => value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const dates = (range: DateRange) => `${date(range.start)} – ${date(range.end)}`
const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value) }
  catch { return `${currency} ${value.toFixed(2)}` }
}
const rate = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(1)}%`

function Totals({ totals, currency }: { totals: SavingsTotals; currency: string }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
    {[
      ['Income', money(totals.income, currency)],
      ['Expenses', money(totals.expenses, currency)],
      ['Cash-flow savings', money(totals.savings, currency)],
      ['Savings rate', rate(totals.rate)],
    ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-gray-600 dark:text-gray-300">{label}</dt><dd className={`break-words font-semibold tabular-nums ${label === 'Cash-flow savings' && totals.savings < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{value}</dd></div>)}
  </dl>
}

function DrillDown({ totals, currency, label }: { totals: SavingsTotals; currency: string; label: string }) {
  return <details className="mt-3">
    <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">{label} ({totals.transactions.length})</summary>
    {totals.transactions.length ? <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {totals.transactions.map(tx => <li key={tx.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
        <div className="min-w-0 break-words"><p>{tx.description || tx.category?.name || 'Transaction'}</p><p className="text-gray-600 dark:text-gray-300">{date(new Date(tx.occurred_at))} · {tx.category?.name || 'Uncategorized'} · {tx.account?.name || 'No account'}</p></div>
        <span className="tabular-nums">{tx.type === 'income' ? 'Income' : 'Expense'}: {money(Number(tx.amount), currency)}</span>
      </li>)}
    </ul> : <p className="py-3 text-sm text-gray-600 dark:text-gray-300">No cash-flow transactions in this period.</p>}
  </details>
}

export function SavingsAnalysis({ transactions, dateRange, basePath, spendingDrafts, view }: { transactions: Transaction[]; dateRange: DateRange | null; basePath: string; spendingDrafts: SpendingDrafts; view: AnalyticsView }) {
  const [currency, setCurrency] = useState('')
  const today = new Date().setHours(0, 0, 0, 0)
  const { report, now } = useMemo(() => {
    const now = new Date(today)
    return { report: buildSavingsReport(transactions, dateRange, now), now }
  }, [transactions, dateRange, today])
  if (!view) return <RecordedSavings report={report} basePath={basePath} />
  return <SpendingOpportunities
    report={report}
    now={now}
    view={view}
    previewPath={`${basePath}/analytics/savings-preview`}
    currency={currency}
    onCurrencyChange={setCurrency}
    {...spendingDrafts}
  />
}

const RecordedSavings = memo(function RecordedSavings({ report, basePath }: {
  report: ReturnType<typeof buildSavingsReport>; basePath: string
}) {
  return <section aria-labelledby="cash-flow-savings" className="space-y-6">
    <div><h2 id="cash-flow-savings" className="text-xl font-semibold">Cash-flow savings</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Recorded income minus expenses, reported separately by currency. <Link to={`${basePath}/goals`} className="font-medium text-primary-700 underline dark:text-blue-300">Goal contributions</Link> are tracked separately.</p>
      <details className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary-700 hover:underline dark:text-blue-300">How cash-flow savings are calculated</summary>
        <p>Transfers between your accounts are excluded. Refunds recorded as income count in the month received. Savings rate is unavailable when income is zero or negative. Dates follow your browser’s time zone. First recorded months and earlier periods are flagged as incomplete.</p>
      </details>
    </div>
    {!report.groups.length && <p className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">No recorded history yet. Add or import transactions to analyze savings.</p>}
    {report.groups.map(group => <section key={group.currency} aria-label={`${group.currency} savings`} className="min-w-0 space-y-5 border-t border-gray-200 pt-5 dark:border-gray-700">
      <h3 className="text-lg font-semibold">{group.currency}</h3>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
        <h4 className="mb-3 font-semibold">Selected period: {dates(report.range)}</h4>
        <p className="mb-3 text-sm">{report.partial ? 'Partial period (through today). ' : ''}{group.status}</p>
        {report.future && <p className="mb-3">This range has not started yet. Future-dated transactions are excluded.</p>}
        <Totals totals={group.current} currency={group.currency} />
        <DrillDown totals={group.current} currency={group.currency} label="Selected-period transactions" />
      </div>
      <div>
        <h4 className="mb-2 font-semibold">Previous equivalent period: {dates(report.previousRange)}</h4>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">{group.previousStatus}. Full months compare with preceding full months; partial and custom ranges compare the same number of days.</p>
        <Totals totals={group.previous} currency={group.currency} />
        <p className="mt-3 text-sm">Change in savings: <strong>{money(group.current.savings - group.previous.savings, group.currency)}</strong>. Savings-rate change: <strong>{group.current.rate !== null && group.previous.rate !== null ? `${(group.current.rate - group.previous.rate).toFixed(1)} percentage points` : 'Unavailable'}</strong>.</p>
        <DrillDown totals={group.previous} currency={group.currency} label="Previous-period transactions" />
      </div>
      <div><h4 className="font-semibold">Monthly savings trend</h4><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">All recorded months, including months without transactions.</p>
        {group.months.length > 0 && <div className="mt-4 h-48 text-gray-700 dark:text-gray-200" role="img" aria-label={`Monthly cash-flow savings in ${group.currency}; exact figures and transactions follow below`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={group.months.map(month => ({ month: month.key, savings: month.totals.savings }))} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
            <XAxis dataKey="month" stroke="currentColor" tick={{ fontSize: 12 }} minTickGap={40} /><YAxis stroke="currentColor" tick={{ fontSize: 12 }} width={55} tickFormatter={value => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Number(value))} />
            <Tooltip formatter={value => money(Number(value), group.currency)} contentStyle={{ backgroundColor: '#fff', color: '#111827', borderColor: '#6b7280' }} />
            <ReferenceLine y={0} stroke="#6b7280" /><Line type="linear" dataKey="savings" name="Cash-flow savings" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart></ResponsiveContainer>
        </div>}
        {group.months.length > 0 && <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary-700 hover:underline dark:text-blue-300">Monthly transaction history</summary>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {group.months.map(month => <details key={month.key} className="py-3">
              <summary className="min-h-11 cursor-pointer rounded-md py-2 font-medium hover:text-primary-700 dark:hover:text-primary-300"><span>{month.range.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><span className="ml-3 tabular-nums">{money(month.totals.savings, group.currency)}</span><span className="ml-3 text-sm text-gray-600 dark:text-gray-300">{month.partial ? 'Current partial month' : 'Completed month'} · {month.status}</span></summary>
              <div className="py-3"><Totals totals={month.totals} currency={group.currency} /><DrillDown totals={month.totals} currency={group.currency} label={`${month.key} transactions`} /></div>
            </details>)}
          </div>
        </details>}
      </div>
    </section>)}
  </section>
})

export default function ConnectedSavingsAnalysis({ userId, dateRange, revision, spendingDrafts, view }: { userId: string | undefined; dateRange: DateRange | null; revision: Transaction[]; spendingDrafts: SpendingDrafts; view: AnalyticsView }) {
  const [state, setState] = useState<{ rows: Transaction[]; loading: boolean; error: string | null }>({ rows: [], loading: true, error: null })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ rows: [], loading: true, error: null })
    if (!userId) { setState({ rows: [], loading: false, error: 'Sign in to analyze your savings.' }); return }
    void loadSavingsHistory(userId).then(rows => {
      if (!cancelled) setState({ rows, loading: false, error: null })
    }).catch(error => {
      if (!cancelled) setState({ rows: [], loading: false, error: error instanceof Error ? error.message : 'Could not load savings history.' })
    })
    return () => { cancelled = true }
  }, [userId, revision, retry])
  if (state.loading) return <p role="status" className="min-h-48 py-6">Loading savings history across all reporting periods…</p>
  if (state.error) return <div role="alert"><p>Could not load savings history: {state.error}</p><button className="mt-3 min-h-11 rounded-md bg-primary-600 px-4 text-white hover:bg-primary-700" onClick={() => setRetry(value => value + 1)}>Retry savings history</button></div>
  return <SavingsAnalysis transactions={state.rows} dateRange={dateRange} basePath="/dashboard" spendingDrafts={spendingDrafts} view={view} />
}
