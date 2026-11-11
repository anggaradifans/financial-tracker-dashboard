import { useState, type FormEvent } from 'react'
import type { FinancialGoal, GoalKind, ManualGoalFields } from '../../types/financial'
import { goalKindLabels, maxGoalAmount } from '../../utils/goalForecast'
import { goalField } from './MonthlySavingsPlanner'

type ManualKind = Exclude<GoalKind, 'emergency_fund'>
const manualKinds: ManualKind[] = ['custom', 'sinking_fund', 'investment', 'debt_payoff']
const amountField = { type: 'number', step: '0.01', min: 0, max: maxGoalAmount, className: goalField }

interface Props {
  goal?: FinancialGoal
  onSave: (fields: ManualGoalFields & { kind: ManualKind; currency: string }, expectedUpdatedAt?: string) => Promise<void>
  onCancel: () => void
}

export default function ManualGoalForm({ goal, onSave, onCancel }: Props) {
  const [kind, setKind] = useState<ManualKind>(goal && goal.kind !== 'emergency_fund' ? goal.kind : 'custom')
  const [currency, setCurrency] = useState(goal?.currency ?? 'IDR')
  const [expectedUpdatedAt] = useState(goal?.updated_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const debt = kind === 'debt_payoff'
  const investment = kind === 'investment'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name')).trim()
    if (!name) {
      setError('Enter a goal name.')
      return
    }

    const target = Number(values.get('target_amount'))
    const fields: ManualGoalFields = {
      name,
      description: String(values.get('description')).trim() || null,
      target_amount: target,
      target_date: String(values.get('target_date')) || null,
    }
    if (investment) {
      const value = values.get('investment_market_value')
      fields.investment_market_value = value === '' ? null : Number(value)
    }
    if (debt) {
      fields.debt_balance = goal ? Number(values.get('debt_balance')) : target
      fields.debt_apr = Number(values.get('debt_apr'))
      fields.debt_monthly_fee = Number(values.get('debt_monthly_fee'))
      fields.debt_monthly_payment = Number(values.get('debt_monthly_payment'))
    }

    setBusy(true)
    setError('')
    try {
      await onSave({ ...fields, kind, currency }, expectedUpdatedAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the goal.')
    } finally {
      setBusy(false)
    }
  }

  const targetLabel = debt ? 'Opening debt balance' : investment ? 'Contribution target' : 'Target amount'
  return <form aria-label={goal ? `Edit ${goal.name}` : 'Create a goal'} onSubmit={save}
    className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="mb-4 text-base font-semibold">{goal ? 'Edit goal' : 'Create a goal'}</legend>
      {!goal && <label className="text-sm font-medium">Goal type
        <select className={`${goalField} cursor-pointer`} value={kind} onChange={event => setKind(event.target.value as ManualKind)}>
          {manualKinds.map(value => <option key={value} value={value}>{goalKindLabels[value]}</option>)}
        </select>
      </label>}
      {!goal && <label className="text-sm font-medium">Currency
        <input className={goalField} required pattern="[A-Z]{3}" maxLength={3} value={currency}
          onChange={event => setCurrency(event.target.value.toUpperCase())} />
        <span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-300">Three-letter code, such as IDR or USD.</span>
      </label>}
      <label className="text-sm font-medium">Goal name
        <input className={goalField} name="name" required maxLength={80} defaultValue={goal?.name} />
      </label>
      <label key={kind} className="text-sm font-medium">{targetLabel} ({currency})
        <input {...amountField} name="target_amount" required min="0.01"
          max={kind === 'custom' ? undefined : maxGoalAmount} defaultValue={goal?.target_amount} />
      </label>
      <label className="text-sm font-medium">Target date (optional)
        <input className={goalField} name="target_date" type="date" defaultValue={goal?.target_date ?? ''} />
      </label>
      {investment && <label className="text-sm font-medium">Market value ({currency}, optional)
        <input {...amountField} name="investment_market_value" defaultValue={goal?.investment_market_value ?? ''} />
        <span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-300">Enter the latest value of the investments tracked by this goal.</span>
      </label>}
      {debt && <>
        {goal && <label className="text-sm font-medium">Latest lender balance ({currency})
          <input {...amountField} name="debt_balance" required defaultValue={goal.debt_balance ?? ''} />
        </label>}
        <label className="text-sm font-medium">Annual interest rate (%)
          <input {...amountField} name="debt_apr" required max="100" defaultValue={goal?.debt_apr ?? 0} />
        </label>
        <label className="text-sm font-medium">Scheduled monthly payment ({currency})
          <input {...amountField} name="debt_monthly_payment" required defaultValue={goal?.debt_monthly_payment ?? 0} />
        </label>
        <label className="text-sm font-medium">Recurring monthly fee ({currency})
          <input {...amountField} name="debt_monthly_fee" required defaultValue={goal?.debt_monthly_fee ?? 0} />
        </label>
        <p className="text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">
          Include any fees already owed in the lender balance. Update that balance from your statement as you repay the debt.
        </p>
      </>}
      <label className="text-sm font-medium sm:col-span-2">Description (optional)
        <input className={goalField} name="description" maxLength={500} defaultValue={goal?.description ?? ''} />
      </label>
      {error && <p role="alert" className="break-words text-sm text-red-700 dark:text-red-300 sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="min-h-11 cursor-pointer rounded-md bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:outline-primary-400">
          {busy ? 'Saving…' : goal ? 'Save changes' : 'Create goal'}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 cursor-pointer rounded-md border border-gray-500 px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 dark:border-gray-400 dark:hover:bg-gray-700 dark:focus-visible:outline-primary-400">
          Cancel
        </button>
      </div>
    </fieldset>
  </form>
}
