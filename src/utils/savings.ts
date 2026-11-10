import { DateRange, Transaction } from '../types/financial'

export interface SavingsTotals {
  income: number
  expenses: number
  savings: number
  rate: number | null
  transactions: Transaction[]
}

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const dayEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

// Full calendar months compare to preceding calendar months. Other ranges compare
// the same number of local calendar days, including across daylight-saving changes.
export function previousSavingsPeriod(range: DateRange): DateRange {
  if (range.start.getTime() === monthStart(range.start).getTime() && range.end.getTime() === monthEnd(range.end).getTime()) {
    const months = (range.end.getFullYear() - range.start.getFullYear()) * 12 + range.end.getMonth() - range.start.getMonth() + 1
    return {
      start: new Date(range.start.getFullYear(), range.start.getMonth() - months, 1),
      end: new Date(range.start.getFullYear(), range.start.getMonth(), 0, 23, 59, 59, 999),
    }
  }
  const days = Math.round((Date.UTC(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()) - Date.UTC(range.start.getFullYear(), range.start.getMonth(), range.start.getDate())) / 86400000) + 1
  return {
    start: new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() - days),
    end: new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() - 1, 23, 59, 59, 999),
  }
}

export function savingsTotals(rows: Transaction[], currency: string, range: DateRange): SavingsTotals {
  const transactions = rows.filter(tx => !tx.deleted_at && tx.currency === currency &&
    (tx.type === 'income' || tx.type === 'outcome') &&
    new Date(tx.occurred_at) >= range.start && new Date(tx.occurred_at) <= range.end)
  // Integer cents prevent binary floating point drift for stored numeric amounts.
  const cents = (type: string) => transactions.filter(tx => tx.type === type).reduce((sum, tx) => sum + Math.round(Number(tx.amount) * 100), 0)
  const income = cents('income') / 100
  const expenses = cents('outcome') / 100
  const savings = (cents('income') - cents('outcome')) / 100
  return { income, expenses, savings, rate: income > 0 ? savings / income * 100 : null, transactions }
}

export function buildSavingsReport(rows: Transaction[], selectedRange: DateRange | null, now = new Date()) {
  const active = rows.filter(tx => !tx.deleted_at && new Date(tx.occurred_at) <= dayEnd(now))
  const first = active.reduce<Date | null>((earliest, tx) => !earliest || new Date(tx.occurred_at) < earliest ? new Date(tx.occurred_at) : earliest, null)
  const requested = selectedRange ?? { start: first ? monthStart(first) : monthStart(now), end: monthEnd(now) }
  const future = requested.start > dayEnd(now)
  const range = { start: dayStart(requested.start), end: future ? dayEnd(requested.end) : dayEnd(new Date(Math.min(requested.end.getTime(), now.getTime()))) }
  const previousRange = previousSavingsPeriod(range)
  const currencies = [...new Set(rows.filter(tx => !tx.deleted_at).map(tx => tx.currency))].sort()
  const historyStatus = (period: DateRange, currency: string) => {
    const dates = active.filter(tx => tx.currency === currency).map(tx => new Date(tx.occurred_at).getTime())
    const earliest = dates.reduce((min, date) => Math.min(min, date), Infinity)
    return earliest >= period.start.getTime() ? 'Incomplete history' : 'Recorded history only'
  }
  const groups = currencies.map(currency => {
    const months = []
    if (first) {
      for (let start = monthStart(first); start <= now; start = new Date(start.getFullYear(), start.getMonth() + 1, 1)) {
        const end = monthEnd(start)
        const period = { start, end: new Date(Math.min(end.getTime(), dayEnd(now).getTime())) }
        months.push({ key: monthKey(start), range: period, partial: end >= now, status: historyStatus(period, currency), totals: savingsTotals(active, currency, period) })
      }
    }
    return {
      currency,
      current: savingsTotals(active, currency, range),
      previous: savingsTotals(active, currency, previousRange),
      status: historyStatus(range, currency),
      previousStatus: historyStatus(previousRange, currency),
      months,
    }
  })
  return { range, previousRange, partial: !future && requested.end > now, future, groups }
}
