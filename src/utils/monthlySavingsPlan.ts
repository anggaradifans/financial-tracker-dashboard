import type { FinancialGoal, GoalPriority } from '../types/financial'

export const goalPriorityLabels = { 1: 'High', 2: 'Normal', 3: 'Low' } satisfies Record<GoalPriority, string>
export const toCents = (amount: number) => Math.round(amount * 100)
export const maxPlanAmount = Number.MAX_SAFE_INTEGER / 100

export function previewMonthlyPlan<T extends { goal: FinancialGoal; amount: number; priority: GoalPriority }>(
  allocations: T[], baseline: number | null,
) {
  const ordered = [...allocations].sort((a, b) =>
    a.priority - b.priority || a.goal.created_at.localeCompare(b.goal.created_at) || a.goal.id.localeCompare(b.goal.id),
  )
  const total = ordered.reduce((sum, item) => sum + toCents(item.amount), 0)
  const available = baseline === null ? null : Math.max(0, toCents(baseline))
  let remaining = available
  const rows = ordered.map(item => {
    const requested = toCents(item.amount)
    const funded = remaining === null ? null : Math.min(requested, remaining)
    if (remaining !== null && funded !== null) remaining -= funded
    return { ...item, funded: funded === null ? null : funded / 100 }
  })
  return { rows, planned: total / 100, balance: available === null ? null : (available - total) / 100 }
}

export function goalTimeline(remaining: number, funded: number | null, targetDate: string | null, today: Date) {
  if (remaining <= 0) return 'Target reached'
  const deadline = targetDate ? new Date(`${targetDate}T00:00:00`) : null
  const pastDue = deadline !== null && deadline < new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const timing = funded === null ? 'Choose a savings baseline' : funded <= 0 ? 'No funded timeline' : null
  const months = funded !== null && funded > 0 ? Math.ceil(toCents(remaining) / toCents(funded)) : null
  const estimate = timing ?? `${months?.toLocaleString()} ${months === 1 ? 'month' : 'months'}`
  if (pastDue) return `${estimate} · Target date passed`
  if (!deadline || months === null) return estimate

  const projectedMonth = today.getFullYear() * 12 + today.getMonth() + months
  const targetMonth = deadline.getFullYear() * 12 + deadline.getMonth()
  return `${estimate} · ${projectedMonth <= targetMonth ? 'On track by target month' : 'After target month'}`
}
