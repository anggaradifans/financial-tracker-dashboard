import React, { useMemo, useState } from 'react'
import { Archive, Check, ChevronDown, Plus, RefreshCw, Target, Trash2 } from 'lucide-react'
import { useGoals } from '../../hooks/useGoals'
import { Category, EmergencyFundBasis, FinancialGoal } from '../../types/financial'
import { notifications } from '../../utils/notifications'

const money = (amount: number, currency: string) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(amount)

const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const monthlySavingsNeeded = (target: number, saved: number, targetDate: string | null) => {
  if (!targetDate) return null
  const deadline = new Date(`${targetDate}T00:00:00`)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (deadline < todayStart) return null
  const months = Math.max(1, (deadline.getFullYear() - today.getFullYear()) * 12 + deadline.getMonth() - today.getMonth())
  return Math.max(0, (target - saved) / months)
}

const recommendedCategoryNames = /rent|housing|grocer|food|utilit|bill|transport|health|medical|insurance/i

interface GoalsManagerProps {
  userId?: string
  categories: Category[]
}

interface RecommendationFormProps {
  categories: Category[]
  initialMonths?: number
  initialMultiplier?: number
  initialSelected?: string[]
  initialPeriodStart?: string | null
  targetDate?: string | null
  startingBalance?: number
  onPreview: (months: number, ids: string[], multiplier: number, periodStart?: string | null) => Promise<EmergencyFundBasis>
  onAccept: (preview: EmergencyFundBasis, override: number | null, ids: string[], months: number, multiplier: number) => Promise<void>
  actionLabel: string
}

const RecommendationForm: React.FC<RecommendationFormProps> = ({
  categories, initialMonths = 6, initialMultiplier = 6, initialSelected,
  initialPeriodStart = null, targetDate = null, startingBalance = 0, onPreview, onAccept, actionLabel,
}) => {
  const selectable = categories.filter(category => category.allowed_type !== 'income')
  const [months, setMonths] = useState(initialMonths)
  const [multiplier, setMultiplier] = useState(initialMultiplier)
  const [selected, setSelected] = useState<string[]>(() => initialSelected || selectable.filter(category => recommendedCategoryNames.test(category.name)).map(category => category.id))
  const [preview, setPreview] = useState<EmergencyFundBasis | null>(null)
  const [override, setOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const monthlyEstimate = preview?.suggested_target
    ? monthlySavingsNeeded(override ? Number(override) : preview.suggested_target, startingBalance, targetDate)
    : null

  const toggleCategory = (id: string) => {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
    setPreview(null)
  }

  const runPreview = async () => {
    setBusy(true)
    setFormError(null)
    try {
      const result = await onPreview(months, selected, multiplier, initialPeriodStart)
      setPreview(result)
      setOverride('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not calculate a recommendation.')
    } finally {
      setBusy(false)
    }
  }

  const accept = async () => {
    if (!preview?.average_monthly_essential || !preview.suggested_target) return
    setBusy(true)
    setFormError(null)
    try {
      await onAccept(preview, override ? Number(override) : null, selected, months, multiplier)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this recommendation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <h3 className="text-base font-semibold">{actionLabel}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Choose essential categories and review the calculation before saving.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Look-back period
          <select value={months} onChange={event => { setMonths(Number(event.target.value)); setPreview(null) }} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-800 dark:text-white">
            {[3, 6, 9].map(value => <option key={value} value={value}>{value} completed months</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Months of coverage
          <input type="number" min="1" max="24" step="0.5" value={multiplier} onChange={event => { setMultiplier(Number(event.target.value)); setPreview(null) }} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Essential spending categories</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {selectable.map(category => <label key={category.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800">
            <input type="checkbox" checked={selected.includes(category.id)} onChange={() => toggleCategory(category.id)} className="h-4 w-4 rounded border-gray-400 text-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600" />
            <span>{category.name}</span>
          </label>)}
        </div>
        {selectable.length === 0 && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">No eligible spending categories are available.</p>}
      </fieldset>
      <button type="button" onClick={runPreview} disabled={busy || selectable.length === 0} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-100 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
        {busy ? 'Calculating…' : 'Preview calculation'}
      </button>
      {formError && <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">{formError}</p>}
      {preview && <div className="mt-4 rounded-lg border border-primary-200 bg-white p-4 dark:border-primary-800 dark:bg-gray-800" aria-live="polite">
        {preview.suggested_target && preview.average_monthly_essential ? <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-gray-600 dark:text-gray-400">Suggested target · {preview.included_month_count} of {preview.basis_months} months included</p><p className="mt-1 text-2xl font-semibold">{money(preview.suggested_target, preview.currency)}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Based on average essential spend of {money(preview.average_monthly_essential, preview.currency)} per month.</p></div>
            <label className="block min-w-48 text-sm font-medium">Your target (optional)
              <input type="number" min="1" step="0.01" value={override} onChange={event => setOverride(event.target.value)} placeholder={String(preview.suggested_target)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
            </label>
          </div>
          {targetDate && <p className="mt-3 rounded-md bg-primary-50 p-3 text-sm text-primary-900 dark:bg-primary-900/30 dark:text-primary-100">{monthlyEstimate === null ? 'Your target date has passed. Choose a future date to estimate a monthly saving amount.' : `To reach this target by ${targetDate}, save about ${money(monthlyEstimate, preview.currency)} per month. Current balance: ${money(startingBalance, preview.currency)}.`}</p>}
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Window: {preview.period_start} through {preview.period_end} · {preview.skipped_other_currency_count} transactions in other currencies skipped.</p>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary-700 dark:text-primary-300">See monthly calculation and excluded categories</summary>
            <div className="mt-2 space-y-2">
              {preview.months.map(month => <div key={month.month} className="border-b border-gray-100 py-3 text-sm dark:border-gray-700">
                <div className="mb-2 flex flex-wrap justify-between gap-2 font-semibold"><span>{month.month.slice(0, 7)}</span><span>{month.included ? 'Included in average' : month.exclusion_reason === 'no_data' ? 'No outcome data' : 'History starts later'}</span></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400 sm:grid-cols-4">
                  <span>Essential spend: {money(month.included_spend, preview.currency)}</span>
                  <span>Other spend: {money(month.excluded_spend, preview.currency)}</span>
                  <span>Refunds: −{money(month.refunds, preview.currency)}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">Counted: {money(month.basis_amount, preview.currency)}</span>
                </div>
              </div>)}
              {preview.categories.filter(category => !category.included).map(category => <div key={category.category_id || category.category_name} className="flex justify-between gap-4 py-1 text-sm text-gray-600 dark:text-gray-400"><span>Excluded: {category.category_name}</span><span>{money(category.avg_monthly_amount, preview.currency)}/mo</span></div>)}
            </div>
          </details>
          <button type="button" onClick={accept} disabled={busy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">{busy ? 'Saving…' : 'Accept recommendation'}</button>
        </> : <div className="text-sm text-gray-700 dark:text-gray-200">
          {preview.included_month_count < preview.min_months_required
            ? <p>Only {preview.included_month_count} complete spending {preview.included_month_count === 1 ? 'month is' : 'months are'} available in this window. At least {preview.min_months_required} are needed for a recommendation.</p>
            : selected.length === 0
              ? <p>Select at least one spending category to calculate a recommendation.</p>
                : <>
                  <p>There are {preview.included_month_count} complete months, but the selected categories have no positive net spending in them. Check that those payments are recorded as outcomes in an outcome-capable category. Income categories such as Salary are excluded from spending.</p>
                  <div className="mt-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
                    <p className="font-semibold">Selected category average per month</p>
                    {preview.categories.filter(category => category.included).map(category => <div key={category.category_id || category.category_name} className="flex justify-between gap-3 py-1"><span>{category.category_name}</span><span>{money(category.avg_monthly_amount, preview.currency)}</span></div>)}
                    <p className="mt-2 font-semibold">Selected spending by month</p>
                    {preview.months.map(month => <div key={month.month} className="flex flex-wrap justify-between gap-2 py-1"><span>{month.month.slice(0, 7)}{month.included ? '' : ' · excluded from average'}</span><span>Spent {money(month.included_spend, preview.currency)} · refunds {money(month.refunds, preview.currency)} · net {money(month.basis_amount, preview.currency)}</span></div>)}
                  </div>
                </>}
          <p className="mt-1">You can still create a custom goal instead.</p>
        </div>}
      </div>}
    </div>
  )
}

const GoalsManager: React.FC<GoalsManagerProps> = ({ userId, categories }) => {
  const data = useGoals(userId)
  const [showEmergencyForm, setShowEmergencyForm] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [refreshingGoalId, setRefreshingGoalId] = useState<string | null>(null)
  const [busyGoalId, setBusyGoalId] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [customDate, setCustomDate] = useState('')
  const [customMonthly, setCustomMonthly] = useState('')
  const [emergencyName, setEmergencyName] = useState('Emergency Fund')
  const [emergencyDate, setEmergencyDate] = useState('')
  const [emergencyMonthly, setEmergencyMonthly] = useState('')
  const [emergencyBalance, setEmergencyBalance] = useState('0')
  const [contributionInputs, setContributionInputs] = useState<Record<string, { amount: string; date: string; description: string }>>({})

  const activeGoals = useMemo(() => data.goals.filter(goal => goal.status === 'active'), [data.goals])
  const completeGoals = useMemo(() => data.goals.filter(goal => goal.status !== 'active'), [data.goals])

  const addCustom = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await data.addCustomGoal({ name: customName.trim(), description: customDescription.trim() || null, currency: 'IDR', targetAmount: Number(customTarget), targetDate: customDate || null, plannedMonthlyAmount: customMonthly ? Number(customMonthly) : null })
      setCustomName(''); setCustomDescription(''); setCustomTarget(''); setCustomDate(''); setCustomMonthly(''); setShowCustomForm(false)
      notifications.success('Goal created.')
    } catch (error) { notifications.error(error instanceof Error ? error.message : 'Could not create goal.') }
  }

  const addContribution = async (goalId: string, event: React.FormEvent) => {
    event.preventDefault()
    const input = contributionInputs[goalId] || { amount: '', date: localDate(), description: '' }
    try {
      await data.addContribution({ goalId, amount: Number(input.amount), contributedOn: input.date || localDate(), description: input.description.trim() || null })
      setContributionInputs(current => ({ ...current, [goalId]: { amount: '', date: localDate(), description: '' } }))
      notifications.success('Contribution recorded.')
    } catch (error) { notifications.error(error instanceof Error ? error.message : 'Could not record contribution.') }
  }

  const setStatus = async (goal: FinancialGoal, status: 'completed' | 'archived') => {
    setBusyGoalId(goal.id)
    try {
      await data.updateGoal(goal.id, { status })
      notifications.success(status === 'completed' ? 'Goal marked complete.' : 'Goal archived.')
    } catch (error) { notifications.error(error instanceof Error ? error.message : 'Could not update goal.') }
    finally { setBusyGoalId(null) }
  }

  if (data.loading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" role="status">Loading goals…</div>
  if (data.error) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert"><p>{data.error}</p><p className="mt-2">Apply the goals migration in Supabase, then reload this page.</p><button type="button" onClick={() => void data.refresh()} className="mt-3 min-h-11 rounded-md border border-red-400 px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:hover:bg-red-900/50">Retry</button></div>

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><h2 className="text-lg font-semibold">Save toward what matters</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Track your targets and record deposits or withdrawals as they happen.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setShowEmergencyForm(open => !open); setShowCustomForm(false) }} disabled={activeGoals.some(goal => goal.kind === 'emergency_fund')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"><Target className="h-4 w-4" aria-hidden="true" />{activeGoals.some(goal => goal.kind === 'emergency_fund') ? 'Emergency fund active' : 'Set up emergency fund'}</button>
          <button type="button" onClick={() => { setShowCustomForm(open => !open); setShowEmergencyForm(false) }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-100 active:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"><Plus className="h-4 w-4" aria-hidden="true" />Custom goal</button>
        </div>
      </section>

      {showCustomForm && <form onSubmit={addCustom} className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-2 sm:p-5">
        <h2 className="text-lg font-semibold sm:col-span-2">Create a custom goal</h2>
        <label className="text-sm font-medium">Goal name<input required maxLength={80} value={customName} onChange={event => setCustomName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
        <label className="text-sm font-medium">Target amount (IDR)<input required type="number" min="0.01" step="0.01" value={customTarget} onChange={event => setCustomTarget(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
        <label className="text-sm font-medium">Target date (optional)<input type="date" value={customDate} onChange={event => setCustomDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
        <label className="text-sm font-medium">Planned monthly contribution (IDR)<input type="number" min="0" step="0.01" value={customMonthly} onChange={event => setCustomMonthly(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
        <label className="text-sm font-medium sm:col-span-2">Description (optional)<input maxLength={500} value={customDescription} onChange={event => setCustomDescription(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className="min-h-11 rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">Create goal</button><button type="button" onClick={() => setShowCustomForm(false)} className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:hover:bg-gray-700">Cancel</button></div>
      </form>}

      {showEmergencyForm && <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Goal name<input required maxLength={80} value={emergencyName} onChange={event => setEmergencyName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
          <label className="text-sm font-medium">Target date (optional)<input type="date" value={emergencyDate} onChange={event => setEmergencyDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
          <label className="text-sm font-medium">Current emergency savings (IDR)<input type="number" min="0" step="0.01" value={emergencyBalance} onChange={event => setEmergencyBalance(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /><span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-400">Added as the opening contribution.</span></label>
          <label className="text-sm font-medium">Planned monthly contribution (optional)<input type="number" min="0" step="0.01" value={emergencyMonthly} onChange={event => setEmergencyMonthly(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /><span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-400">Used if no target date is set.</span></label>
        </div>
        <RecommendationForm categories={categories} targetDate={emergencyDate || null} startingBalance={Number(emergencyBalance) || 0} onPreview={(months, ids, multiplier) => data.previewEmergencyFund(months, ids, multiplier)} actionLabel="Calculate an emergency fund target" onAccept={async (preview, override, ids, months, multiplier) => {
          const target = override ?? preview.suggested_target!
          const monthlyNeeded = monthlySavingsNeeded(target, Number(emergencyBalance) || 0, emergencyDate || null)
          const openingBalanceSaved = await data.createEmergencyFund({ name: emergencyName.trim(), currency: 'IDR', targetDate: emergencyDate || null, plannedMonthlyAmount: monthlyNeeded ?? (emergencyMonthly ? Number(emergencyMonthly) : null), basisMonths: months, categoryIds: ids, multiplier, expectedAverage: preview.average_monthly_essential!, targetOverride: override, periodStart: preview.period_start, initialBalance: Number(emergencyBalance) || 0 })
          setShowEmergencyForm(false)
          if (openingBalanceSaved) notifications.success('Emergency fund created with its starting balance.')
          else notifications.warning('Emergency fund created, but the starting balance was not recorded. Add it as a contribution.')
        }} />
      </div>}

      {activeGoals.length === 0 && !showEmergencyForm && !showCustomForm && <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-800"><Target className="mx-auto h-8 w-8 text-gray-500" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">No active goals yet</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Set an emergency fund target from your spending history or create a custom goal.</p></div>}

      {activeGoals.map(goal => {
        const stats = data.progress[goal.id]
        const rec = data.recommendations[goal.id]
        const goalContributions = data.contributions.filter(item => item.goal_id === goal.id)
        const input = contributionInputs[goal.id] || { amount: '', date: localDate(), description: '' }
        const monthlySaving = monthlySavingsNeeded(goal.target_amount, Number(stats?.saved_amount || 0), goal.target_date)
        return <article key={goal.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{goal.name}</h2><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-700 dark:bg-gray-700 dark:text-gray-200">{goal.kind === 'emergency_fund' ? 'Emergency fund' : 'Custom goal'}</span></div>{goal.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{goal.description}</p>}</div><div className="flex flex-wrap gap-2">
            {goal.kind === 'emergency_fund' && <button type="button" onClick={() => setRefreshingGoalId(current => current === goal.id ? null : goal.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:hover:bg-gray-700"><RefreshCw className="h-4 w-4" aria-hidden="true" />Review target</button>}
            <button type="button" disabled={busyGoalId === goal.id} onClick={() => void setStatus(goal, 'completed')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:hover:bg-gray-700"><Check className="h-4 w-4" aria-hidden="true" />Mark complete</button>
            <button type="button" disabled={busyGoalId === goal.id} onClick={() => void setStatus(goal, 'archived')} aria-label={`Archive ${goal.name}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:hover:bg-gray-700"><Archive className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Archive</span></button>
          </div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div><p className="text-sm text-gray-600 dark:text-gray-400">Saved</p><p className="mt-1 text-lg font-semibold">{money(Number(stats?.saved_amount || 0), goal.currency)}</p></div>
            <div><p className="text-sm text-gray-600 dark:text-gray-400">Target</p><p className="mt-1 text-lg font-semibold">{money(goal.target_amount, goal.currency)}</p></div>
            <div><p className="text-sm text-gray-600 dark:text-gray-400">Remaining</p><p className="mt-1 text-lg font-semibold">{money(Number(stats?.remaining_amount ?? goal.target_amount), goal.currency)}</p></div>
            <div><p className="text-sm text-gray-600 dark:text-gray-400">{stats?.months_of_coverage != null ? 'Months of essential coverage' : 'Target date'}</p><p className="mt-1 text-lg font-semibold">{stats?.months_of_coverage != null ? `${stats.months_of_coverage} months` : goal.target_date || 'Not set'}</p></div>
            {goal.kind === 'emergency_fund' && <div><p className="text-sm text-gray-600 dark:text-gray-400">Save monthly to reach target</p><p className="mt-1 text-lg font-semibold">{goal.target_date ? (monthlySaving === null ? 'Choose a future date' : money(monthlySaving, goal.currency)) : 'Add a target date'}</p></div>}
          </div>
          <div className="mt-4" aria-label={`${stats?.progress_percent || 0}% of target saved`}><div className="mb-1 flex justify-between text-sm"><span>Progress</span><span>{Number(stats?.progress_percent || 0).toFixed(1)}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-primary-600 dark:bg-primary-400" style={{ width: `${Math.min(100, Math.max(0, Number(stats?.progress_percent || 0)))}%` }} /></div></div>
          {goal.kind === 'emergency_fund' && rec && <div className="mt-3 text-sm text-gray-600 dark:text-gray-400"><p>Recommendation based on {rec.included_month_count} of {rec.basis_months} months · {money(rec.average_monthly_essential, goal.currency)} average essential spend/month · saved {rec.period_start}–{rec.period_end}.</p><details className="mt-2"><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-primary-700 dark:text-primary-300">Saved category basis <ChevronDown className="h-4 w-4" aria-hidden="true" /></summary><ul className="mt-1 grid gap-x-6 sm:grid-cols-2">{(data.recommendationCategories[goal.id] || []).map(category => <li key={category.category_id || category.category_name} className="flex justify-between gap-3 py-1"><span>{category.included ? 'Included' : 'Excluded'} · {category.category_name}</span><span>{money(category.avg_monthly_amount, goal.currency)}/mo</span></li>)}</ul></details></div>}
          {refreshingGoalId === goal.id && goal.kind === 'emergency_fund' && rec && <RecommendationForm key={`${goal.id}-${rec.id}`} categories={categories} initialMonths={rec.basis_months} initialMultiplier={rec.multiplier} initialSelected={(data.recommendationCategories[goal.id] || []).filter(item => item.included && item.category_id).map(item => item.category_id!)} initialPeriodStart={rec.period_start} targetDate={goal.target_date} startingBalance={Number(stats?.saved_amount || 0)} onPreview={(months, ids, multiplier, periodStart) => data.previewEmergencyFund(months, ids, multiplier, goal.currency, periodStart)} actionLabel="Review recommendation for the same saved period" onAccept={async (preview, override, ids, months, multiplier) => {
            await data.acceptRecommendation(goal.id, { basisMonths: months, categoryIds: ids, multiplier, expectedAverage: preview.average_monthly_essential!, targetOverride: override, periodStart: preview.period_start })
            setRefreshingGoalId(null); notifications.success('Recommendation snapshot updated.')
          }} />}
          <details className="mt-4 rounded-lg border border-gray-200 px-4 dark:border-gray-700">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-sm font-semibold"><span>Record contribution</span><ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
            <form onSubmit={event => void addContribution(goal.id, event)} className="grid gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-medium">Amount ({goal.currency})<input required type="number" step="0.01" value={input.amount} onChange={event => setContributionInputs(current => ({ ...current, [goal.id]: { ...input, amount: event.target.value } }))} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /><span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-400">Use a negative amount for a withdrawal.</span></label>
              <label className="text-sm font-medium">Date<input required type="date" value={input.date} onChange={event => setContributionInputs(current => ({ ...current, [goal.id]: { ...input, date: event.target.value } }))} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
              <label className="text-sm font-medium">Note<input maxLength={200} value={input.description} onChange={event => setContributionInputs(current => ({ ...current, [goal.id]: { ...input, description: event.target.value } }))} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900" /></label>
              <button type="submit" className="min-h-11 self-end rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">Add deposit</button>
            </form>
            <button type="button" onClick={() => setContributionInputs(current => ({ ...current, [goal.id]: { ...input, amount: input.amount.startsWith('-') ? input.amount.slice(1) : `-${input.amount}` } }))} className="mb-4 min-h-11 text-sm font-semibold text-primary-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:text-primary-300">Enter a negative amount for a withdrawal</button>
          </details>
          {goalContributions.length > 0 && <details className="mt-3 rounded-lg border border-gray-200 px-4 dark:border-gray-700"><summary className="flex min-h-12 cursor-pointer items-center justify-between text-sm font-semibold">Recent activity ({goalContributions.length})<ChevronDown className="h-4 w-4" aria-hidden="true" /></summary><div className="pb-3">{goalContributions.slice(0, 5).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2 text-sm dark:border-gray-700"><span>{item.contributed_on}{item.description ? ` · ${item.description}` : ''}</span><span className="flex items-center gap-2"><span className={item.amount < 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}>{item.amount < 0 ? '−' : '+'}{money(Math.abs(Number(item.amount)), goal.currency)}</span><button type="button" onClick={() => { if (window.confirm('Remove this contribution from the goal?')) void data.deleteContribution(item.id).then(() => notifications.success('Contribution removed.')).catch(error => notifications.error(error instanceof Error ? error.message : 'Could not remove contribution.')) }} aria-label="Remove contribution" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></span></div>)}</div></details>}
        </article>
      })}

      {completeGoals.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Completed and archived</h2><div className="space-y-2">{completeGoals.map(goal => <article key={goal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"><div><h3 className="font-semibold">{goal.name}</h3><p className="text-sm text-gray-600 dark:text-gray-400">{goal.status === 'completed' ? 'Completed' : 'Archived'} · {money(goal.target_amount, goal.currency)}</p></div><div className="flex gap-2"><button type="button" onClick={() => void data.updateGoal(goal.id, { status: 'active' }).then(() => notifications.success('Goal reopened.')).catch(error => notifications.error(error instanceof Error ? error.message : 'Could not reopen goal.'))} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-gray-600 dark:hover:bg-gray-700">Reopen</button><button type="button" onClick={() => { if (window.confirm(`Delete “${goal.name}” and its contribution history?`)) void data.deleteGoal(goal.id).then(() => notifications.success('Goal deleted.')).catch(error => notifications.error(error instanceof Error ? error.message : 'Could not delete goal.')) }} aria-label={`Delete ${goal.name}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-gray-600 dark:text-red-300 dark:hover:bg-red-950/40"><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Delete</span></button></div></article>)}</div></section>}
    </div>
  )
}

export default GoalsManager
