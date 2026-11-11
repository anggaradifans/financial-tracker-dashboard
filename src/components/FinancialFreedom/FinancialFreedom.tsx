import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { format } from 'date-fns'
import { CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadCurrentWealth } from '../../hooks/useNetWorth'
import { supabaseRest } from '../../lib/supabaseRest'
import {
  freedomCapital, freedomHorizonYears, freedomNetReturn, freedomNumber, freedomScenarioFields, freedomSpendingBaseline, freedomSpendingMonths,
  freedomTarget, freedomTargetFields, freedomTrackedAssets, projectFreedom,
} from '../../utils/financialFreedom'
import type { FreedomPlan, FreedomScenario, FreedomScenarioField, FreedomTarget, FreedomTargetField } from '../../utils/financialFreedom'
import { loadSavingsHistory } from '../../utils/savingsHistory'
import { allocationMoney, goalField } from '../GoalsManager/MonthlySavingsPlanner'

type SavedPlan = FreedomPlan & { revision: string }
type Draft<Field extends string> = Record<Field, string>
type SpendingPreview = {
  start: string
  recordedMonths: number
  amount: number | null
}

const table = 'financial_freedom_plans'
const muted = 'text-sm text-gray-600 dark:text-gray-300'
const panel = 'min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5'
const button = 'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60'
const secondary = `${button} border border-gray-500 hover:bg-gray-100 active:bg-gray-200 dark:border-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600`
const link = 'inline-flex min-h-11 items-center font-semibold text-primary-700 underline underline-offset-4 dark:text-primary-300'
const errorText = 'text-sm text-red-700 dark:text-red-300'
const withdrawalHelp = {
  label: 'About the annual withdrawal rate',
  text: 'The share of your starting portfolio you plan to withdraw in your first year of financial independence. For example, entering 4 means 4% and sets a target of 25 times your annual spending. A lower rate raises the target. Consider how many years your portfolio needs to support you.',
}

function TrackedAssets({ userId, currency, onUse }: { userId: string; currency: string; onUse: (amount: number) => void }) {
  type BalanceSheet = ReturnType<typeof freedomTrackedAssets>
  const [data, setData] = useState<{ status: 'loading' | 'error' } | { status: 'ready'; balance: BalanceSheet }>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void loadCurrentWealth(userId, currency).then(entries => {
      if (active) setData({ status: 'ready', balance: freedomTrackedAssets(entries, currency) })
    }).catch(() => { if (active) setData({ status: 'error' }) })
    return () => { active = false }
  }, [userId, currency, attempt])

  const balance = data.status === 'ready' ? data.balance : null
  const money = (amount: number) => allocationMoney(amount, currency)
  return <section aria-labelledby="tracked-freedom-assets" className="mt-4 space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <h3 id="tracked-freedom-assets" className="text-sm font-semibold">Tracked balances · {currency}</h3>
      <Link className={`${link} text-sm`} to="/dashboard/net-worth" target="_blank" rel="noopener">Review Net worth (new tab)</Link>
    </div>
    {data.status === 'loading' && <p role="status" className={muted}>Loading tracked balances…</p>}
    {data.status === 'error' && <div className="space-y-2">
      <p role="alert" className={errorText}>Could not load tracked balances. You can still enter eligible assets manually.</p>
      <button type="button" className={secondary} onClick={() => {
        setData({ status: 'loading' })
        setAttempt(previous => previous + 1)
      }}>Retry tracked balances</button>
    </div>}
    {data.status === 'ready' && !balance && <p className={muted}>No active Net worth entries in {currency}. Enter your eligible assets manually or record them in Net worth.</p>}
    {balance && <>
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div className="min-w-0"><dt>Investable assets</dt><dd className="break-words font-semibold tabular-nums">{balance.hasInvestableValue ? money(balance.investable) : 'No valuation'}</dd></div>
        <div className="min-w-0"><dt>Emergency reserves</dt><dd className="break-words font-semibold tabular-nums">{money(balance.emergencyReserve)}</dd></div>
        <div className="min-w-0"><dt>Liabilities</dt><dd className="break-words font-semibold tabular-nums">{money(balance.liabilities)}</dd></div>
      </dl>
      <p className={muted}>Only assets classified as investable count toward the funding gap. Emergency reserves, your primary home, and other assets stay separate. Liabilities appear here for context.</p>
      {(balance.missingCount > 0 || balance.staleCount > 0 || balance.hasLinkedAccounts) && <ul className={`list-disc space-y-1 pl-4 ${muted}`}>
        {balance.missingCount > 0 && <li>{balance.missingCount} {balance.missingCount === 1 ? 'entry has' : 'entries have'} no valuation. Totals exclude missing values.</li>}
        {balance.staleCount > 0 && <li>{balance.staleCount} {balance.staleCount === 1 ? 'valuation is' : 'valuations are'} over 90 days old.</li>}
        {balance.hasLinkedAccounts && <li>Linked balances come from recorded transactions. Verify them against your account balances.</li>}
      </ul>}
      {balance.canUseInvestable
        ? <button type="button" className={secondary} onClick={() => onUse(balance.investable)}>Use tracked investable assets</button>
        : balance.hasInvestableValue && <p className={muted}>The investable total exceeds the supported input range. Enter the amount you want to allocate to this plan.</p>}
    </>}
  </section>
}

function fieldsFrom<Field extends string>(fields: Record<Field, unknown>, values?: Record<Field, number>): Draft<Field> {
  return Object.fromEntries(Object.keys(fields).map(key => [key, values ? String(values[key as Field]) : ''])) as Draft<Field>
}

function parseFields<Field extends string>(fields: Record<Field, { min: number; max: number }>, draft: Draft<Field>) {
  const entries = (Object.keys(fields) as Field[]).map(key => [key, freedomNumber(draft[key], fields[key])] as const)
  return entries.some(([, value]) => value === null) ? null : Object.fromEntries(entries) as Record<Field, number>
}

function NumericField({ label, min, max, value, onChange, readOnly, help }: {
  label: string; min: number; max: number; value: string; onChange: (value: string) => void; readOnly?: boolean
  help?: { label: string; text: string }
}) {
  const id = useId()
  const helpId = `${id}-help`
  const field = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!helpOpen) return
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !field.current?.contains(event.target)) setHelpOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [helpOpen])

  return <div ref={field} className="min-w-0"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHelpOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape') setHelpOpen(false) }}>
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <div className="relative mt-1">
      <input id={id} className={`${goalField} !mt-0 ${help ? 'pr-12' : ''}`} type="number" inputMode="decimal"
        step="0.01" required min={min} max={max} value={value} onChange={event => onChange(event.target.value)}
        readOnly={readOnly} aria-describedby={help ? helpId : undefined} />
      {help && <>
        <button type="button" aria-label={help.label} aria-controls={helpId} aria-expanded={helpOpen}
          onClick={() => setHelpOpen(open => !open)}
          className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-md text-gray-600 hover:bg-gray-100 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-primary-300">
          <CircleHelp className="h-5 w-5" aria-hidden="true" />
        </button>
        <p id={helpId} hidden={!helpOpen}
          className="absolute inset-x-0 top-full z-10 mt-2 rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          {help.text}
        </p>
      </>}
    </div>
  </div>
}

const monthDate = (date: string, months: number) => {
  const [year, month] = date.split('-').map(Number)
  return format(new Date(year, month - 1 + months, 1), 'MMMM yyyy')
}

function Scenario({ index, currency, draft, values, target, date, onChange }: {
  index: number; currency: string; draft: Draft<FreedomScenarioField>; values: FreedomScenario | null
  target: FreedomTarget | null; date: string; onChange: (key: FreedomScenarioField, value: string) => void
}) {
  const invalidReturn = values !== null && freedomNetReturn(values) < -100
  const months = target && values && !invalidReturn
    ? projectFreedom(freedomTarget(target).capital, target.investable_assets, values)
    : null
  let estimate = 'Enter the target inputs and scenario assumptions to estimate a date.'
  if (invalidReturn) estimate = 'Return after fees and taxes must be at least −100%.'
  else if (target && values) {
    if (months === 0) estimate = 'Target already met on the calculation date'
    else if (months === null) estimate = `Target not reached within ${freedomHorizonYears} years`
    else estimate = `${monthDate(date, months)} · ${months} ${months === 1 ? 'month' : 'months'}`
  }
  return <fieldset className={`${panel} space-y-4`}>
    <legend className="px-1.5 text-base font-semibold">Scenario {index === 0 ? 'A' : 'B'}</legend>
    {(Object.keys(freedomScenarioFields) as FreedomScenarioField[]).map(key => <NumericField
      key={key}
      {...freedomScenarioFields[key]}
      label={`${freedomScenarioFields[key].label} (${key === 'monthly_contribution' ? currency : key === 'costs' ? 'percentage points' : '%'})`}
      value={draft[key]} onChange={value => onChange(key, value)}
    />)}
    <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
      <p className={muted}>Estimated target date</p>
      <p aria-live="polite" className={`mt-1 break-words font-semibold ${invalidReturn ? errorText : ''}`}>{estimate}</p>
    </div>
  </fieldset>
}

async function readPlan(userId: string) {
  const [plan] = await supabaseRest.select<SavedPlan>(table, { eq: { user_id: userId }, limit: 1 })
  return plan ?? null
}

function PlanEditor({ userId, currencies, initial, reload }: {
  userId: string; currencies: string[]; initial: SavedPlan | null; reload: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [currency, setCurrency] = useState(initial?.currency ?? 'IDR')
  const [targetDraft, setTargetDraft] = useState(() => fieldsFrom<FreedomTargetField>(freedomTargetFields, initial ?? undefined))
  const [drafts, setDrafts] = useState<[Draft<FreedomScenarioField>, Draft<FreedomScenarioField>]>(() => [
    fieldsFrom(freedomScenarioFields, initial?.scenarios[0]), fieldsFrom(freedomScenarioFields, initial?.scenarios[1]),
  ])
  const [periodStart, setPeriodStart] = useState(initial?.spending_period_start ?? null)
  const [preview, setPreview] = useState<SpendingPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [reloadNeeded, setReloadNeeded] = useState(false)
  const [notice, setNotice] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')
  const date = dirty ? today : saved?.calculation_date ?? today
  const annualSpending = freedomNumber(targetDraft.annual_spending, freedomTargetFields.annual_spending)
  const withdrawalRate = freedomNumber(targetDraft.withdrawal_rate, freedomTargetFields.withdrawal_rate)
  const assets = freedomNumber(targetDraft.investable_assets, freedomTargetFields.investable_assets)
  const capital = annualSpending === null || withdrawalRate === null ? null : freedomCapital(annualSpending, withdrawalRate)
  const target = annualSpending === null || withdrawalRate === null || assets === null ? null
    : { annual_spending: annualSpending, withdrawal_rate: withdrawalRate, investable_assets: assets }
  const metrics = target && freedomTarget(target)
  const scenarioA = parseFields(freedomScenarioFields, drafts[0])
  const scenarioB = parseFields(freedomScenarioFields, drafts[1])
  const previewAmount = preview?.amount ?? null
  const money = (amount: number) => allocationMoney(amount, currency)
  const edited = () => {
    setDirty(true)
    setNotice('')
    if (!reloadNeeded) setSaveError('')
  }

  const changeCurrency = (next: string) => {
    setCurrency(next)
    setTargetDraft(draft => ({ ...draft, annual_spending: '', investable_assets: '' }))
    setDrafts(([a, b]) => [{ ...a, monthly_contribution: '' }, { ...b, monthly_contribution: '' }])
    setPeriodStart(null)
    setPreview(null)
    setPreviewError(false)
    edited()
  }

  const previewSpending = async () => {
    const months = freedomSpendingMonths(new Date())
    setPreview(null)
    setPreviewError(false)
    setPreviewLoading(true)
    try {
      const rows = await loadSavingsHistory(userId, {
        currency, start: months[0].start, end: months[months.length - 1].end,
      })
      setPreview({ start: format(months[0].start, 'yyyy-MM-dd'), ...freedomSpendingBaseline(rows, currency, months) })
    } catch {
      setPreviewError(true)
    } finally {
      setPreviewLoading(false)
    }
  }

  const acceptSpending = (start: string, amount: number) => {
    setTargetDraft(draft => ({ ...draft, annual_spending: String(amount) }))
    setPeriodStart(start)
    setPreview(null)
    edited()
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || reloadNeeded || (saved && !dirty)) return
    if (!target || !scenarioA || !scenarioB) {
      setSaveError('Complete every amount and rate with up to two decimal places.')
      return
    }
    if ([scenarioA, scenarioB].some(item => freedomNetReturn(item) < -100)) {
      setSaveError('Check the return after fees and taxes in each scenario.')
      return
    }
    const request: SavedPlan = {
      ...target, currency, spending_period_start: periodStart, calculation_date: today,
      scenarios: [scenarioA, scenarioB], revision: crypto.randomUUID(),
    }
    setSaving(true)
    setSaveError('')
    setNotice('')
    try {
      let confirmed: SavedPlan
      try {
        const rows = saved
          ? await supabaseRest.update<SavedPlan[]>(table, request, { user_id: userId, revision: saved.revision })
          : await supabaseRest.insert<SavedPlan[]>(table, request)
        if (!rows?.[0]) throw new Error('Save response did not include the plan.')
        confirmed = rows[0]
      } catch {
        // A lost response can hide a successful write. Check the saved revision before retrying.
        const current = await readPlan(userId).catch(() => undefined)
        if (current?.revision === request.revision) confirmed = current
        else {
          if (current !== undefined && (current?.revision ?? null) !== (saved?.revision ?? null)) {
            setReloadNeeded(true)
            setSaveError('The saved plan changed in another session. Reload it to continue editing.')
          } else {
            setSaveError('Could not confirm the save. Try again or reload the saved plan.')
          }
          return
        }
      }
      setSaved(confirmed)
      setDirty(false)
      setNotice('Financial freedom plan saved.')
    } finally {
      setSaving(false)
    }
  }

  const currenciesForPlan = [...new Set(['IDR', 'USD', 'EUR', ...currencies, currency])].sort()
  return <form aria-label="Financial freedom plan" onSubmit={save}>
    <fieldset disabled={saving} className="min-w-0 space-y-6">
      <legend className="sr-only">Financial freedom assumptions</legend>
      <section aria-labelledby="freedom-target" className={panel}>
        <h2 id="freedom-target" className="text-lg font-semibold">Capital target</h2>
        <p className={`mt-1 ${muted}`}>Enter all amounts in the plan currency. Changing currency clears amounts and the accepted spending baseline.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block min-w-0 text-sm font-medium">Plan currency
            <select className={`${goalField} cursor-pointer`} value={currency} disabled={previewLoading} onChange={event => changeCurrency(event.target.value)}>
              {currenciesForPlan.map(code => <option key={code}>{code}</option>)}
            </select>
          </label>
          {(Object.keys(freedomTargetFields) as FreedomTargetField[]).map(key => <NumericField key={key}
            {...freedomTargetFields[key]} label={`${freedomTargetFields[key].label} (${key === 'withdrawal_rate' ? '%' : currency})`}
            help={key === 'withdrawal_rate' ? withdrawalHelp : undefined}
            value={targetDraft[key]} readOnly={key === 'annual_spending' && periodStart !== null}
            onChange={value => { setTargetDraft(draft => ({ ...draft, [key]: value })); edited() }}
          />)}
        </div>
        <TrackedAssets key={currency} userId={userId} currency={currency} onUse={amount => {
          setTargetDraft(draft => ({ ...draft, investable_assets: String(amount) }))
          edited()
        }} />
        <div className="mt-4 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className={muted}>{periodStart
            ? `Accepted spending: ${money(Number(targetDraft.annual_spending))} from ${monthDate(periodStart, 0)} through ${monthDate(periodStart, 11)}.`
            : 'Spending baseline: manual entry.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={previewLoading} onClick={() => void previewSpending()}>
              {previewLoading ? 'Loading expenses…' : 'Preview recorded spending'}
            </button>
            {periodStart && <button type="button" className={secondary} onClick={() => { setPeriodStart(null); setPreview(null); edited() }}>Switch to manual spending</button>}
          </div>
          {previewLoading && <p className={muted} role="status">Loading the last 12 completed months in {currency}.</p>}
          {previewError && <p role="alert" className={errorText}>Could not load recorded spending. Try the preview again or enter annual spending manually.</p>}
          {preview && <div className="space-y-2 rounded-md bg-gray-50 p-3 dark:bg-gray-900">
            <p role="status" className={muted}>
              {monthDate(preview.start, 0)} through {monthDate(preview.start, 11)} · {preview.recordedMonths} of 12 months with recorded expenses.
              {preview.amount === null
                ? preview.recordedMonths < 12 ? ' Enter annual spending manually when history is incomplete.' : ' Recorded spending is outside the supported range.'
                : ` Recorded expenses: ${money(preview.amount)}. Review whether they reflect your intended lifestyle before using them.`}
            </p>
            {previewAmount !== null && <button type="button" className={secondary} onClick={() => acceptSpending(preview.start, previewAmount)}>
              Use this spending baseline
            </button>}
          </div>}
        </div>
        <div className="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-900 dark:bg-primary-900/30">
          <p className={muted}>{annualSpending !== null && withdrawalRate !== null
            ? `${money(annualSpending)} ÷ ${withdrawalRate}% = capital target`
            : 'Annual spending ÷ withdrawal rate = capital target'}</p>
          {capital !== null ? <>
            <dl className="mt-3 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt>Target capital</dt><dd className="break-words text-2xl font-semibold tabular-nums">{money(capital)}</dd></div>
              {metrics && <div><dt>Remaining gap</dt><dd className="break-words text-lg font-semibold tabular-nums">{money(metrics.gap)}</dd></div>}
            </dl>
            {metrics ? <label className="mt-3 block text-sm font-medium">
              Investable assets progress · {new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Math.floor(metrics.progress * 100) / 100)}%
              <progress className="mt-1 block h-2 w-full accent-primary-700 dark:accent-primary-400" max={100} value={metrics.progress} />
            </label> : <p className="mt-3 text-sm">Enter eligible assets or use the tracked total to see the gap and progress.</p>}
          </> : <p className="mt-2 text-sm font-medium">Enter annual spending and a withdrawal rate to see your target.</p>}
        </div>
      </section>

      <section aria-labelledby="freedom-scenarios" className="space-y-3">
        <h2 id="freedom-scenarios" className="text-lg font-semibold">Compare what-if scenarios</h2>
        <p className={muted}>Calculation date {date}. Amounts use that date’s purchasing power. Each estimate applies the same assumptions for up to {freedomHorizonYears} years.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {([scenarioA, scenarioB] as const).map((values, index) => <Scenario
            key={index} index={index} currency={currency} target={target} draft={drafts[index]} values={values} date={date}
            onChange={(key, value) => {
              setDrafts(([a, b]) => index === 0 ? [{ ...a, [key]: value }, b] : [a, { ...b, [key]: value }])
              edited()
            }}
          />)}
        </div>
        <p className={muted}>Return compounds monthly after subtracting the annual fees and taxes drag. Contributions arrive at month end and adjust after each year. Inflation adjusts future amounts to the calculation date.</p>
        <p className={muted}>Returns, costs, and dates are uncertain. These estimates are for planning. Your recorded savings, goals, and valuations are tracked separately.</p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={reloadNeeded || Boolean(saved && !dirty)} className={`${button} bg-primary-700 text-white hover:bg-primary-900 active:bg-primary-900`}>
          {saving ? 'Saving…' : 'Save plan'}
        </button>
        {saved && <p className={muted}>Last saved calculation date {saved.calculation_date}</p>}
        {notice && <p role="status" className="text-sm font-medium">{notice}</p>}
      </div>
      {saveError && <p role="alert" className={errorText}>{saveError}</p>}
      {(reloadNeeded || saveError.startsWith('Could not confirm')) && <button type="button" className={secondary} onClick={reload}>Discard edits and reload saved plan</button>}
    </fieldset>
  </form>
}

export default function FinancialFreedom({ userId, currencies }: { userId: string; currencies: string[] }) {
  const [initial, setInitial] = useState<SavedPlan | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const reload = () => { setState('loading'); setAttempt(value => value + 1) }

  useEffect(() => {
    let active = true
    void readPlan(userId).then(plan => {
      if (!active) return
      setInitial(plan)
      setState('ready')
    }).catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [userId, attempt])

  if (state === 'loading') return <p role="status" className={muted}>Loading your financial freedom plan…</p>
  if (state === 'error') return <div className="space-y-3">
    <p role="alert" className={errorText}>Could not load your financial freedom plan.</p>
    <button type="button" className={secondary} onClick={reload}>Retry loading plan</button>
  </div>
  return <PlanEditor userId={userId} currencies={currencies} initial={initial} reload={reload} />
}
