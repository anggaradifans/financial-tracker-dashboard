import { useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { GoalData } from '../../hooks/useGoals'
import type { FinancialGoal, GoalPriority, Transaction } from '../../types/financial'
import { goalPriorityLabels, goalTimeline, maxPlanAmount, previewMonthlyPlan } from '../../utils/monthlySavingsPlan'
import { buildSavingsReport } from '../../utils/savings'

export type GoalHistory = { rows: Transaction[]; loading: boolean; error: string | null; loaded: boolean }

export const goalField = 'mt-1 min-h-11 w-full min-w-0 rounded-md border border-gray-500 bg-white px-3 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:opacity-60 dark:border-gray-400 dark:bg-gray-900 dark:text-gray-100 dark:focus-visible:outline-primary-400'
const selectField = `${goalField} cursor-pointer`
const button = 'min-h-11 cursor-pointer rounded-md px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:outline-primary-400'
const secondary = `${button} border border-gray-500 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600`
const muted = 'text-sm text-gray-600 dark:text-gray-300'

export const allocationMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)

interface Props {
  goals: FinancialGoal[]
  data: GoalData
  history: GoalHistory
  loadHistory: () => void
  onSaved: () => void
}

export default function MonthlySavingsPlanner(props: Props) {
  const currencies = [...new Set(props.goals.map(goal => goal.currency))].sort()
  const [selected, setSelected] = useState('')
  const currency = currencies.includes(selected) ? selected : currencies[0]

  return <section aria-labelledby="monthly-savings-plan" className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="monthly-savings-plan" className="text-lg font-semibold">Monthly savings plan</h2>
        <p className={muted}>Plan how much to set aside for each active goal. Record actual contributions below.</p>
      </div>
      {currencies.length > 1 && <label className="block text-sm font-medium">Plan currency
        <select className={selectField} value={currency} onChange={event => setSelected(event.target.value)}>
          {currencies.map(code => <option key={code}>{code}</option>)}
        </select>
      </label>}
    </div>
    {currencies.map(code => {
      const goals = props.goals.filter(goal => goal.currency === code)
      const revision = props.data.monthlyPlans[code]?.revision
      const snapshot = goals.map(goal => `${goal.id}:${goal.updated_at}`).sort().join('|')
      return <div key={code} hidden={code !== currency}>
        <CurrencyPlan key={`${revision}:${snapshot}`} {...props} currency={code} goals={goals} />
      </div>
    })}
  </section>
}

function CurrencyPlan({ currency, goals, data, history, loadHistory, onSaved }: Props & { currency: string }) {
  const plan = data.monthlyPlans[currency]
  const [source, setSource] = useState(plan?.baseline_month ? 'history' : 'manual')
  const [manual, setManual] = useState(plan && !plan.baseline_month ? String(plan.baseline_amount) : '')
  const [month, setMonth] = useState(plan?.baseline_month?.slice(0, 7) ?? '')
  const [draft, setDraft] = useState(() => Object.fromEntries(goals.map(goal => [goal.id, {
    amount: String(goal.planned_monthly_amount ?? 0), priority: goal.priority ?? 2,
  }])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const dayStart = new Date().setHours(0, 0, 0, 0)
  const today = new Date(dayStart)
  const money = (amount: number) => allocationMoney(amount, currency)

  const months = useMemo(() => buildSavingsReport(history.rows, null, new Date(dayStart)).groups
    .find(group => group.currency === currency)?.months
    .filter(item => !item.partial && item.totals.transactions.length).reverse() ?? [], [history.rows, currency, dayStart])
  const selectedMonth = months.find(item => item.key === month)
  const savedMonth = plan?.baseline_month?.slice(0, 7)
  // The saved baseline is a snapshot. Re-selecting the month takes a fresh one.
  const [useSavedBaseline, setUseSavedBaseline] = useState(Boolean(savedMonth))
  const baseline = source === 'manual'
    ? manual !== '' && Number(manual) >= 0 && Number(manual) <= maxPlanAmount ? Number(manual) : null
    : useSavedBaseline && month === savedMonth ? Number(plan?.baseline_amount) : selectedMonth?.totals.savings ?? null
  const rows = goals.map(goal => ({ goal, amount: Math.max(0, Number(draft[goal.id].amount) || 0), priority: draft[goal.id].priority }))
  const preview = previewMonthlyPlan(rows, baseline)
  const funding = new Map(preview.rows.map(row => [row.goal.id, row.funded]))
  const savedPreview = previewMonthlyPlan(goals.map(goal => ({
    goal, amount: Number(goal.planned_monthly_amount ?? 0), priority: goal.priority ?? 2,
  })), plan ? Number(plan.baseline_amount) : null)
  const valid = baseline !== null && Math.abs(baseline) <= maxPlanAmount && preview.planned <= maxPlanAmount
  const dirty = !plan || baseline !== Number(plan.baseline_amount) ||
    (source === 'history' ? `${month}-01` : null) !== plan.baseline_month ||
    rows.some(({ goal, amount, priority }) => amount !== Number(goal.planned_monthly_amount ?? 0) || priority !== (goal.priority ?? 2))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!valid || baseline === null || !dirty || saving) return
    setSaving(true)
    setError('')
    try {
      await data.saveMonthlyPlan({
        currency, expectedRevision: plan?.revision ?? null, baselineAmount: baseline,
        baselineMonth: source === 'history' ? `${month}-01` : null,
        allocations: rows.map(({ goal, amount, priority }) => ({
          goal_id: goal.id, expected_updated_at: goal.updated_at, amount, priority,
        })),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the monthly plan.')
    } finally {
      setSaving(false)
    }
  }

  return <form aria-label={`${currency} monthly savings plan`} onSubmit={save}>
    <fieldset disabled={saving} className="min-w-0 space-y-4">
      <legend className="sr-only">{currency} monthly allocations</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm font-medium">Savings baseline
          <select className={selectField} value={source} onChange={event => {
            setSource(event.target.value)
            if (event.target.value === 'history' && !history.loaded) loadHistory()
          }}>
            <option value="manual">Enter a monthly amount</option>
            <option value="history">Use a past cash-flow month</option>
          </select>
        </label>
        {source === 'manual' ? <label className="min-w-0 text-sm font-medium">Available per month ({currency})
          <input className={goalField} type="number" min="0" max={maxPlanAmount} step="0.01" required value={manual} onChange={event => setManual(event.target.value)} />
        </label> : <div className="min-w-0">
          <label className="block text-sm font-medium">Completed month ({currency})
            <select className={selectField} required value={month}
              onChange={event => { setMonth(event.target.value); setUseSavedBaseline(false) }}>
              <option value="">Choose a month</option>
              {savedMonth && useSavedBaseline && <option value={savedMonth}>{savedMonth} · Saved baseline</option>}
              {months.filter(item => !useSavedBaseline || item.key !== savedMonth).map(item => <option key={item.key} value={item.key}>
                {item.key} · {money(item.totals.savings)}{item.status === 'Incomplete history' ? ' · Incomplete' : ''}
              </option>)}
            </select>
          </label>
          {!history.loading && !history.loaded && !history.error && <button type="button" className={`mt-2 ${secondary}`} onClick={loadHistory}>Load cash-flow history</button>}
          {history.loading && <p role="status" className={muted}>Loading cash-flow history…</p>}
          {history.error && <p className={muted} role="alert">Could not load cash-flow history. <button type="button" className={secondary} onClick={loadHistory}>Retry</button></p>}
          {history.loaded && !months.length && <p className={muted}>No completed months with recorded cash flow in {currency}.</p>}
          {history.loaded && useSavedBaseline && selectedMonth && <button type="button" className={`mt-2 ${secondary}`} onClick={() => setUseSavedBaseline(false)}>Use current recorded amount</button>}
        </div>}
      </div>
      {source === 'history' && baseline !== null && <p className={muted}>
        {month} cash-flow savings {money(baseline)}.{baseline < 0 ? ' This month has no available savings to allocate.' : ''}
      </p>}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60" aria-live="polite">
        <dl className="grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2">
          <div className="min-w-0"><dt>Planned per month</dt><dd className="break-words font-semibold tabular-nums">{money(preview.planned)}</dd></div>
          <div className="min-w-0"><dt>{preview.balance !== null && preview.balance < 0 ? 'Funding shortfall' : 'Unallocated savings'}</dt>
            <dd className={`break-words font-semibold tabular-nums ${preview.balance !== null && preview.balance < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>
              {preview.balance === null ? 'Choose a baseline' : money(Math.abs(preview.balance))}
            </dd>
          </div>
        </dl>
      </div>

      <p id={id} className={muted}>Higher priorities are funded first when savings fall short. Within each priority, older goals are funded first. Timelines assume the funded amount stays the same each month.</p>
      <ul className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-700 dark:border-gray-700" aria-describedby={id}>
        {savedPreview.rows.map(({ goal, funded: savedFunding }) => {
          const funded = funding.get(goal.id) ?? null
          const remaining = Number(data.progress[goal.id]?.remaining_amount ?? goal.target_amount)
          const currentTimeline = goalTimeline(remaining, savedFunding, goal.target_date, today)
          const previewTimeline = goalTimeline(remaining, funded, goal.target_date, today)
          return <li key={goal.id} className="grid min-w-0 gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(7rem,0.65fr)_minmax(8rem,0.8fr)_minmax(0,1.25fr)] lg:items-start">
            <h3 className="min-w-0 break-words text-sm font-semibold lg:pt-2">{goal.name}</h3>
            <label className="min-w-0 text-sm font-medium">Priority
              <select aria-label={`Priority for ${goal.name}`} className={selectField} value={draft[goal.id].priority} onChange={event => {
                const priority = Number(event.target.value) as GoalPriority
                setDraft(current => ({ ...current, [goal.id]: { ...current[goal.id], priority } }))
              }}>
                {([1, 2, 3] as const).map(priority => <option key={priority} value={priority}>{goalPriorityLabels[priority]}</option>)}
              </select>
            </label>
            <label className="min-w-0 text-sm font-medium">Monthly amount
              <input aria-label={`Monthly amount for ${goal.name}`} className={goalField} type="number" min="0" max={maxPlanAmount} step="0.01"
                value={draft[goal.id].amount} onChange={event => {
                  const amount = event.target.value
                  setDraft(current => ({ ...current, [goal.id]: { ...current[goal.id], amount } }))
                }} />
            </label>
            <div className="min-w-0 break-words text-sm lg:pt-2">
              <p className="font-semibold">{previewTimeline}</p>
              {funded !== null && <p className={muted}>{money(funded)}/month funded</p>}
              {dirty && plan && currentTimeline !== previewTimeline && <p className={muted}>Saved timeline: {currentTimeline}</p>}
            </div>
          </li>
        })}
      </ul>
      {error && <div className="space-y-2 text-sm text-red-700 dark:text-red-300" role="alert">
        <p>{error}</p><button type="button" className={secondary} onClick={() => void data.refresh()}>Reload goals</button>
      </div>}
      <button type="submit" disabled={!valid || !dirty || saving}
        className={`${button} bg-primary-700 text-white hover:bg-blue-800 active:bg-primary-900`}>
        {saving ? 'Saving plan…' : 'Save monthly plan'}
      </button>
    </fieldset>
  </form>
}
