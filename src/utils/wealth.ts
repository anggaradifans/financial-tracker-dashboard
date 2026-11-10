import { CurrentWealthEntry, WealthCategory, WealthClassification, WealthTotal } from '../types/wealth'

export const wealthCategories: Record<WealthCategory, string> = {
  property: 'House, apartment or boarding house', land: 'Land', cash: 'Cash or savings',
  deposit: 'Deposito / term deposit', stocks: 'Stocks', fund: 'Mutual fund / ETF', bond: 'Bonds',
  mortgage: 'Mortgage', loan: 'Loan', credit_card: 'Credit card debt', other: 'Other',
}

export const wealthClassifications: Record<WealthClassification, string> = {
  investable: 'Investable assets', emergency_reserve: 'Emergency reserves',
  primary_residence: 'Primary residence', other: 'Other assets',
}

export const wealthMoney = (value: number, currency: string) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(value)

export const wealthToday = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Sum cents so fractional amounts do not accumulate binary floating-point drift.
export function wealthTotals(entries: CurrentWealthEntry[]): WealthTotal[] {
  const totals = new Map<string, WealthTotal>()
  for (const entry of entries) {
    if (entry.archived) continue
    const total = totals.get(entry.currency) || {
      currency: entry.currency, assets: 0, liabilities: 0, net_worth: 0, investable: 0, missing_count: 0, stale_count: 0,
    }
    const cents = entry.amount === null ? 0 : Math.round(Number(entry.amount) * 100)
    if (entry.effective_kind === 'asset') {
      total.assets += cents
      if (entry.classification === 'investable') total.investable += cents
    } else total.liabilities += cents
    total.missing_count += Number(entry.missing_value)
    total.stale_count += Number(entry.stale)
    totals.set(entry.currency, total)
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(total => ({
    ...total, assets: total.assets / 100, liabilities: total.liabilities / 100,
    net_worth: (total.assets - total.liabilities) / 100, investable: total.investable / 100,
  }))
}

export function wealthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  if (raw.startsWith('Could not refresh your balance sheet.')) return raw
  const start = raw.indexOf('{')
  if (start >= 0) {
    try {
      const body = JSON.parse(raw.slice(start))
      if (body.code === '23505') return 'An active entry already uses this name or account. Edit the existing entry instead.'
      if (body.code === '23503') return 'This account or goal is unavailable. Refresh and choose another.'
      if (body.code === '22023' && typeof body.message === 'string') return body.message
      if (body.code === '23514' || body.code === '22003') return 'Check the amount, currency and valuation date. Amounts must be between 0 and 10 trillion, with at most two decimals.'
      if (body.code === '42501') return 'This entry is unavailable. Please sign in again or refresh.'
    } catch { /* The REST response may contain a plain-text network error. */ }
  }
  return 'Could not complete this request. Check your connection and try again.'
}
