import type { Transaction } from '../types/financial'
import type { CurrentWealthEntry } from '../types/wealth'
import { savingsTotals } from './savings'
import { wealthTotals } from './wealth'

export const freedomHorizonYears = 50
const maxAmount = 9_999_999_999_999.99

export const freedomTargetFields = {
  annual_spending: { label: 'Desired annual spending', min: 0.01, max: maxAmount },
  withdrawal_rate: { label: 'Annual withdrawal rate', min: 0.01, max: 100 },
  investable_assets: { label: 'Eligible investable assets', min: 0, max: maxAmount },
}

export const freedomScenarioFields = {
  monthly_contribution: { label: 'Monthly contribution', min: 0, max: maxAmount },
  investment_return: { label: 'Annual gross return', min: -100, max: 100 },
  inflation: { label: 'Annual inflation', min: -99.99, max: 100 },
  costs: { label: 'Annual fees and taxes drag', min: 0, max: 100 },
  contribution_growth: { label: 'Annual contribution growth', min: -99.99, max: 100 },
}

export type FreedomTargetField = keyof typeof freedomTargetFields
export type FreedomScenarioField = keyof typeof freedomScenarioFields
export type FreedomTarget = Record<FreedomTargetField, number>
export type FreedomScenario = Record<FreedomScenarioField, number>

export type FreedomPlan = FreedomTarget & {
  currency: string
  spending_period_start: string | null
  calculation_date: string
  scenarios: [FreedomScenario, FreedomScenario]
}

export function freedomNumber(value: string, { min, max }: { min: number; max: number }) {
  const number = Number(value)
  return /^-?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value) && number >= min && number <= max ? number : null
}

export function freedomCapital(annualSpending: number, withdrawalRate: number) {
  const spendingCents = Math.round(annualSpending * 100)
  const withdrawalBasisPoints = Math.round(withdrawalRate * 100)
  return spendingCents * 100 / withdrawalBasisPoints
}

export function freedomTarget({ annual_spending, withdrawal_rate, investable_assets }: FreedomTarget) {
  const capital = freedomCapital(annual_spending, withdrawal_rate)
  return { capital, gap: Math.max(0, capital - investable_assets), progress: Math.min(100, investable_assets / capital * 100) }
}

export function freedomNetReturn(scenario: FreedomScenario) {
  return Math.round((scenario.investment_return - scenario.costs) * 100) / 100
}

export function projectFreedom(target: number, assets: number, scenario: FreedomScenario) {
  if (assets >= target) return 0
  const monthlyInflation = (1 + scenario.inflation / 100) ** (1 / 12)
  const netReturn = freedomNetReturn(scenario) / 100
  const monthlyRealReturn = (1 + netReturn) ** (1 / 12) / monthlyInflation
  if (scenario.monthly_contribution === 0 && monthlyRealReturn <= 1) return null
  const tolerance = Math.min(target * 1e-12, 0.000001)
  let balance = assets
  for (let month = 1; month <= freedomHorizonYears * 12; month++) {
    const years = Math.floor((month - 1) / 12)
    const contribution = scenario.monthly_contribution * (1 + scenario.contribution_growth / 100) ** years
    balance = balance * monthlyRealReturn + contribution / monthlyInflation ** month
    // Allow for floating-point drift over repeated compounding at the boundary.
    if (balance >= target - tolerance) return month
  }
  return null
}

export function freedomSpendingMonths(now: Date) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = now.getMonth() - 12 + index
    return {
      start: new Date(now.getFullYear(), month, 1),
      end: new Date(now.getFullYear(), month + 1, 0, 23, 59, 59, 999),
    }
  })
}

export function freedomSpendingBaseline(rows: Transaction[], currency: string, months: ReturnType<typeof freedomSpendingMonths>) {
  const expenses = rows.filter(row => row.type === 'outcome')
  const totals = months.map(month => savingsTotals(expenses, currency, month))
  const recordedMonths = totals.filter(month => month.transactions.length > 0).length
  const cents = totals.reduce((sum, month) => sum + Math.round(month.expenses * 100), 0)
  const amount = cents / 100
  return { recordedMonths, amount: recordedMonths === 12 && amount >= 0.01 && amount <= maxAmount ? amount : null }
}

export function freedomTrackedAssets(entries: CurrentWealthEntry[], currency: string) {
  const current = entries.filter(entry => !entry.archived && entry.currency === currency)
  const [total] = wealthTotals(current)
  if (!total) return null

  const valued = current.filter(entry => !entry.missing_value && entry.amount !== null)
  const reserveCents = valued
    .filter(entry => entry.effective_kind === 'asset' && entry.classification === 'emergency_reserve')
    .reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0)
  const hasInvestableValue = valued.some(entry => entry.effective_kind === 'asset' && entry.classification === 'investable')

  return {
    investable: total.investable,
    emergencyReserve: reserveCents / 100,
    liabilities: total.liabilities,
    missingCount: total.missing_count,
    staleCount: total.stale_count,
    hasLinkedAccounts: current.some(entry => entry.source === 'account'),
    hasInvestableValue,
    canUseInvestable: hasInvestableValue && total.investable >= 0 && total.investable <= maxAmount,
  }
}
