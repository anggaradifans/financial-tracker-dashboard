import type { FinancialGoal } from '../../types/financial'
import { forecastGoalTimeline, monthsUntilTarget, requiredGoalMonthly } from '../../utils/goalForecast'
import { allocationMoney } from './MonthlySavingsPlanner'

export default function GoalEstimate({ goal, remaining, funded, today }: {
  goal: FinancialGoal
  remaining: number
  funded: number | null
  today: Date
}) {
  const debt = goal.kind === 'debt_payoff'
  const payment = debt ? Number(goal.debt_monthly_payment) : funded
  const required = requiredGoalMonthly(goal, remaining, today)
  const money = (amount: number) => allocationMoney(amount, goal.currency)
  const timing = !goal.target_date ? 'Add a target date'
    : monthsUntilTarget(goal.target_date, today) <= 0 ? 'No monthly payment before deadline'
    : 'Target is beyond 50 years'

  return <section aria-label={`Planning estimate for ${goal.name}`} className="mt-4 rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-900">
    <h3 className="font-semibold">Planning estimate</h3>
    <dl className="mt-2 grid gap-3 sm:grid-cols-3">
      <div>
        <dt>{debt ? 'Monthly payment needed' : 'Monthly contribution needed'}</dt>
        <dd className="mt-1 break-words font-semibold">
          {required === null ? timing : money(required)}
        </dd>
      </div>
      <div>
        <dt>{debt ? 'Scheduled monthly payment' : 'Funded monthly in saved plan'}</dt>
        <dd className="mt-1 break-words font-semibold">{payment === null ? 'No saved plan' : money(payment)}</dd>
      </div>
      <div>
        <dt>Projected timeline</dt>
        <dd className="mt-1 break-words font-semibold">{forecastGoalTimeline(goal, remaining, payment, today)}</dd>
      </div>
    </dl>
    <p className="mt-3 text-gray-600 dark:text-gray-300">
      {debt
        ? `Uses the latest lender balance, ${Number(goal.debt_apr)}% annual interest divided by 12, and a ${money(Number(goal.debt_monthly_fee))} monthly fee. Interest rounds to cents before the fee and payment are applied. The estimate assumes no new borrowing and covers up to 50 years.`
        : 'Uses the same monthly contribution throughout and assumes no growth.'}
      {' Monthly amounts start next month and count through the target month.'}
    </p>
  </section>
}
