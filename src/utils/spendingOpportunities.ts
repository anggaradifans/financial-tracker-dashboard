import type { Transaction } from '../types/financial'
import { monthKey } from './savings'
import type { buildSavingsReport } from './savings'

export type SpendingReport = ReturnType<typeof buildSavingsReport>
type CurrencyReport = SpendingReport['groups'][number]

export interface SpendingDraft {
  startMonth: string
  endMonth: string
  categoryIds: (string | null)[]
  essentialIds: (string | null)[]
  excludedMonths: string[]
  excludedPurchases: string[]
  refunds: { creditId: string; purchaseId: string }[]
  mode: 'amount' | 'percent'
  reduction: string
}

export interface SpendingDrafts {
  drafts: Record<string, SpendingDraft>
  setDraft: (currency: string, draft: SpendingDraft) => void
}

export function createSpendingDraft(now: Date): SpendingDraft {
  return {
    startMonth: monthKey(new Date(now.getFullYear(), now.getMonth() - 3, 1)),
    endMonth: monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    categoryIds: [],
    essentialIds: [],
    excludedMonths: [],
    excludedPurchases: [],
    refunds: [],
    mode: 'percent',
    reduction: '',
  }
}

const cents = (amount: number) => Math.round(Number(amount) * 100)

function sumCents(rows: Transaction[]) {
  return rows.reduce((sum, tx) => sum + cents(tx.amount), 0)
}

function groupExpenses(rows: Transaction[]) {
  const groups = new Map<string | null, Transaction[]>()
  for (const tx of rows) {
    if (tx.type !== 'outcome') continue
    const categoryRows = groups.get(tx.category_id)
    if (categoryRows) categoryRows.push(tx)
    else groups.set(tx.category_id, [tx])
  }
  return groups
}

function categoryName(rows: Transaction[]) {
  return rows.find(tx => tx.category)?.category?.name ?? 'Uncategorized'
}

export function compareSpending(group: CurrencyReport, report: SpendingReport) {
  const current = groupExpenses(group.current.transactions)
  const previous = groupExpenses(group.previous.transactions)
  const firstMonth = group.months.find(month => month.totals.transactions.length > 0)
  const firstRecorded = firstMonth?.totals.transactions.reduce(
    (earliest, tx) => Math.min(earliest, new Date(tx.occurred_at).getTime()), Infinity,
  ) ?? Infinity
  const currentCovered = !report.future && firstRecorded < report.range.start.getTime() && group.current.transactions.length > 0
  const previousCovered = firstRecorded < report.previousRange.start.getTime() && group.previous.transactions.length > 0
  const categories = [...new Set([...current.keys(), ...previous.keys()])].map(id => {
    const currentRows = current.get(id) ?? []
    const previousRows = previous.get(id) ?? []
    const currentAmount = sumCents(currentRows)
    const previousAmount = sumCents(previousRows)
    const change = currentCovered && previousCovered && Number.isSafeInteger(currentAmount) && Number.isSafeInteger(previousAmount)
      ? currentAmount - previousAmount
      : null
    return {
      id,
      name: categoryName([...currentRows, ...previousRows]),
      currentRows,
      previousRows,
      currentAmount,
      previousAmount,
      change,
      percent: change !== null && previousAmount > 0 ? change / previousAmount * 100 : null,
    }
  })
  categories.sort((a, b) => a.name.localeCompare(b.name))
  return { categories, currentCovered, previousCovered }
}

function parseMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null
  const [year, month] = value.split('-').map(Number)
  if (year < 1) return null
  const date = new Date(0)
  date.setFullYear(year, month - 1, 1)
  date.setHours(0, 0, 0, 0)
  return date
}

function monthStatus(key: string, current: string, first: string | undefined, rows: Transaction[], excluded: string[]) {
  if (key >= current) return 'Month has not finished'
  if (!first || key <= first) return 'Incomplete recorded history'
  if (!rows.length) return 'No recorded activity'
  if (excluded.includes(key)) return 'Marked incomplete'
  return null
}

export function buildSpendingBaseline(group: CurrencyReport, draft: SpendingDraft, now: Date) {
  const history = new Map(group.months.map(month => [month.key, month.totals.transactions]))
  const first = group.months.find(month => month.totals.transactions.length > 0)?.key
  const current = monthKey(now)
  const from = parseMonth(draft.startMonth)
  const through = parseMonth(draft.endMonth)
  const validRange = Boolean(from && through && from <= through)
  const months = []
  if (validRange && from && through) {
    for (const date = from; date <= through; date.setMonth(date.getMonth() + 1)) {
      const key = monthKey(date)
      const rows = history.get(key) ?? []
      months.push({ key, reason: monthStatus(key, current, first, rows, draft.excludedMonths), rows })
    }
  }

  const includedMonths = months.filter(month => !month.reason)
  const recorded = group.months.flatMap(month => month.totals.transactions)
  const categories = [...groupExpenses(recorded)].map(([id, rows]) => ({ id, name: categoryName(rows) }))
  categories.sort((a, b) => a.name.localeCompare(b.name))
  const categoryIds = new Set(categories.map(category => category.id))
  const selected = new Set(draft.categoryIds.filter(id => categoryIds.has(id) && !draft.essentialIds.includes(id)))

  const baselineRows = includedMonths.flatMap(month => month.rows)
  const purchases = baselineRows.filter(tx => tx.type === 'outcome' && selected.has(tx.category_id))
  const excluded = new Set(draft.excludedPurchases)
  const includedPurchases = purchases.filter(tx => !excluded.has(tx.id))
  const credits = baselineRows.filter(tx => tx.type === 'income')
  const creditById = new Map(credits.map(tx => [tx.id, tx]))
  const purchaseById = new Map(includedPurchases.map(tx => [tx.id, tx]))
  const appliedCredits = new Set<string>()
  const refundedByPurchase = new Map<string, number>()

  const refunds = draft.refunds.map(link => {
    const credit = creditById.get(link.creditId)
    const purchase = purchaseById.get(link.purchaseId)
    if (!credit || !purchase) return { ...link, credit, purchase, error: 'Refund or purchase is outside the included baseline.' }
    if (appliedCredits.has(credit.id)) return { ...link, credit, purchase, error: 'This credit is already applied.' }
    const total = (refundedByPurchase.get(purchase.id) ?? 0) + cents(credit.amount)
    if (!Number.isSafeInteger(total) || total > cents(purchase.amount)) {
      return { ...link, credit, purchase, error: 'Combined refunds exceed the purchase amount.' }
    }
    appliedCredits.add(credit.id)
    refundedByPurchase.set(purchase.id, total)
    return { ...link, credit, purchase, error: null }
  })

  const includedIds = new Set(includedPurchases.map(tx => tx.id))
  const gross = sumCents(includedPurchases)
  const refunded = sumCents(credits.filter(tx => appliedCredits.has(tx.id)))
  const count = includedMonths.length
  const net = gross - refunded
  let message = null
  if (!validRange) message = 'Choose a valid start and end month.'
  else if (count < 2) message = 'Include at least two completed months with recorded activity to estimate savings.'
  else if (!selected.size) message = 'Select at least one nonessential category to estimate savings.'
  else if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(refunded)) message = 'The baseline is too large to calculate precisely.'
  const monthly = message ? null : roundDivision(BigInt(net), BigInt(count))
  if (monthly === 0) message = 'The included categories have zero net spending to reduce.'

  const recordedPurchases = new Set(recorded.filter(tx => tx.type === 'outcome').map(tx => tx.id))
  return {
    months: months.map(({ key, reason, rows }) => ({
      key, reason,
      gross: sumCents(rows.filter(tx => includedIds.has(tx.id))),
      refunded: sumCents(rows.filter(tx => appliedCredits.has(tx.id))),
    })),
    count, categories, purchases, includedPurchases, credits, refunds, gross, refunded,
    monthly: message ? null : monthly,
    message,
    unavailableCategories: draft.categoryIds.filter(id => !categoryIds.has(id)).length,
    unavailableExclusions: draft.excludedPurchases.filter(id => !recordedPurchases.has(id)).length,
  }
}

function roundDivision(numerator: bigint, divisor: bigint) {
  return Number((numerator + divisor / 2n) / divisor)
}

export function estimateSpendingReduction(monthly: number | null, draft: SpendingDraft) {
  const input = draft.reduction.trim()
  if (monthly === null || !input) return { estimate: null, error: null }
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(input)) {
    return { estimate: null, error: 'Enter a nonnegative number with up to two decimal places.' }
  }
  const [whole, fraction = ''] = input.split('.')
  const hundredths = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  const limit = draft.mode === 'percent' ? 10000 : monthly
  if (hundredths > BigInt(limit)) {
    return {
      estimate: null,
      error: draft.mode === 'percent' ? 'Enter a percentage from 0 to 100.' : 'The reduction cannot exceed monthly baseline spending.',
    }
  }
  const reduction = draft.mode === 'percent' ? roundDivision(BigInt(monthly) * hundredths, 10000n) : Number(hundredths)
  const annual = reduction * 12
  if (!Number.isSafeInteger(annual)) return { estimate: null, error: 'The annual estimate is too large to calculate precisely.' }
  return { estimate: { reduction, annual, projected: monthly - reduction }, error: null }
}
