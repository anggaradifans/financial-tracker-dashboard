import type { FinancialGoal, GoalKind } from '../types/financial'
import { goalTimeline, toCents } from './monthlySavingsPlan'

export const goalKindLabels = {
  emergency_fund: 'Emergency fund',
  custom: 'Custom goal',
  sinking_fund: 'Sinking fund',
  investment: 'Investment contribution',
  debt_payoff: 'Debt payoff',
} satisfies Record<GoalKind, string>

export const maxGoalAmount = 9_999_999_999_999.99
export const debtForecastMonths = 600

type DebtTerms = Pick<FinancialGoal, 'debt_apr' | 'debt_monthly_fee'>

export function monthsUntilTarget(targetDate: string, today: Date) {
  const [year, month] = targetDate.split('-').map(Number)
  return (year - today.getFullYear()) * 12 + month - 1 - today.getMonth()
}

function monthlyCharges(terms: DebtTerms) {
  const rate = BigInt(toCents(Number(terms.debt_apr)))
  const fee = BigInt(toCents(Number(terms.debt_monthly_fee)))
  // APR in basis points divided by 12 months. Round each month's interest to cents.
  return (balance: bigint) => (balance * rate + 60_000n) / 120_000n + fee
}

function payoffMonths(balance: bigint, payment: bigint, charges: (balance: bigint) => bigint, limit: number) {
  for (let month = 1; month <= limit; month++) {
    balance += charges(balance) - payment
    if (balance <= 0n) return month
  }
  return null
}

export function requiredGoalMonthly(goal: FinancialGoal, remaining: number, today: Date) {
  if (remaining <= 0) return 0
  if (!goal.target_date) return null
  const months = monthsUntilTarget(goal.target_date, today)
  if (months <= 0) return null
  const cents = toCents(remaining)
  if (goal.kind !== 'debt_payoff') return Math.ceil(cents / months) / 100
  if (months > debtForecastMonths) return null

  const balance = BigInt(cents)
  const charges = monthlyCharges(goal)
  // A single payment covering the balance and first month's charges is an upper bound.
  let low = charges(balance) + 1n
  let high = balance + charges(balance)
  while (low < high) {
    const payment = (low + high) / 2n
    if (payoffMonths(balance, payment, charges, months) === null) low = payment + 1n
    else high = payment
  }
  return Number(low) / 100
}

export function forecastGoalTimeline(goal: FinancialGoal, remaining: number, payment: number | null, today: Date) {
  if (goal.kind !== 'debt_payoff') return goalTimeline(remaining, payment, goal.target_date, today)
  if (remaining <= 0) return 'Target reached'

  const dueIn = goal.target_date ? monthsUntilTarget(goal.target_date, today) : null
  const deadlinePassed = goal.target_date && new Date(`${goal.target_date}T00:00:00`) <
    new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const overdue = deadlinePassed ? ' · Target date passed' : ''
  if (payment === null) return `Choose a savings baseline${overdue}`
  const balance = BigInt(toCents(remaining))
  const charges = monthlyCharges(goal)
  const paid = BigInt(toCents(payment))
  const firstCharges = charges(balance)
  if (paid < firstCharges) return `Payment falls short of interest and fees. Balance grows.${overdue}`
  if (paid === 0n) return `No monthly payment${overdue}`
  if (paid === firstCharges) return `Payment only covers interest and fees. Balance stays the same.${overdue}`

  const months = payoffMonths(balance, paid, charges, debtForecastMonths)
  if (months === null) return `Payoff exceeds 50 years${overdue}`
  const estimate = `${months} ${months === 1 ? 'month' : 'months'}`
  if (deadlinePassed || dueIn === null) return estimate + overdue
  return `${estimate} · ${months <= dueIn ? 'On track by target month' : 'After target month'}`
}
