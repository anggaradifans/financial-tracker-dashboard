import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './testUtils.mjs'

const { savingsTotals, previousSavingsPeriod, buildSavingsReport } = await loadTsModule('../src/utils/savings.ts', import.meta.url)
const range = (start, end) => ({ start: new Date(`${start}T00:00:00`), end: new Date(`${end}T23:59:59.999`) })
let id = 0
const tx = (type, amount, day, currency = 'IDR', extra = {}) => ({ id: String(++id), type, amount, currency, occurred_at: new Date(`${day}T12:00:00`).toISOString(), ...extra })
const april = range('2026-04-01', '2026-04-30')

test('totals separate currencies, exclude both transfer legs and deleted rows, and include unassigned accounts', () => {
  const rows = [tx('income', 1000, '2026-04-01'), tx('outcome', 400, '2026-04-30'), tx('transfer_in', 200, '2026-04-02'), tx('transfer_out', 200, '2026-04-02'), tx('income', 100, '2026-04-04', 'USD'), tx('income', 9999, '2026-04-03', 'IDR', { deleted_at: '2026-04-04' })]
  const totals = savingsTotals(rows, 'IDR', april)
  assert.equal(totals.income, 1000)
  assert.equal(totals.expenses, 400)
  assert.equal(totals.savings, 600)
  assert.equal(totals.rate, 60)
  assert.equal(totals.transactions.length, 2)
  assert.equal(savingsTotals(rows, 'USD', april).savings, 100)
})

test('refunds follow their recorded income type and received month without description guessing', () => {
  const rows = [tx('outcome', 80, '2026-03-31'), tx('income', 20, '2026-04-01', 'IDR', { description: 'Refund' })]
  assert.equal(savingsTotals(rows, 'IDR', april).income, 20)
  assert.equal(savingsTotals(rows, 'IDR', april).expenses, 0)
  assert.equal(savingsTotals(rows, 'IDR', range('2026-03-01', '2026-03-31')).savings, -80)
})

test('negative savings and nonpositive income do not produce misleading rates', () => {
  const rows = [tx('income', 100, '2026-04-01'), tx('outcome', 150, '2026-04-02')]
  assert.equal(savingsTotals(rows, 'IDR', april).savings, -50)
  assert.equal(savingsTotals(rows, 'IDR', april).rate, -50)
  assert.equal(savingsTotals(rows.slice(1), 'IDR', april).rate, null)
  assert.equal(savingsTotals([tx('income', -10, '2026-04-01')], 'IDR', april).rate, null)
  assert.equal(savingsTotals([], 'IDR', april).rate, null)
})

test('local month boundaries are inclusive and fractional currency amounts remain exact', () => {
  const rows = [tx('income', 0.1, '2026-04-01', 'USD', { occurred_at: april.start.toISOString() }), tx('income', 0.2, '2026-04-30', 'USD', { occurred_at: april.end.toISOString() }), tx('income', 10, '2026-05-01', 'USD')]
  assert.equal(savingsTotals(rows, 'USD', april).savings, 0.3)
  rows[0].amount = 0.4
  assert.equal(savingsTotals(rows, 'USD', april).savings, 0.6)
  rows[0].deleted_at = '2026-05-01'
  assert.equal(savingsTotals(rows, 'USD', april).savings, 0.2)
})

test('full months compare to calendar months, custom ranges to equal calendar days across years', () => {
  const previous = previousSavingsPeriod(april)
  assert.equal(previous.start.getMonth(), 2)
  assert.equal(previous.start.getDate(), 1)
  assert.equal(previous.end.getDate(), 31)
  assert.equal(previous.end.getMilliseconds(), 999)
  const year = previousSavingsPeriod(range('2026-01-01', '2026-12-31'))
  assert.equal(year.start.getFullYear(), 2025)
  assert.equal(year.end.getFullYear(), 2025)
  const custom = previousSavingsPeriod(range('2026-01-01', '2026-01-10'))
  assert.equal(custom.start.getDate(), 22)
  assert.equal(custom.start.getMonth(), 11)
  assert.equal(custom.end.getDate(), 31)
  const leap = previousSavingsPeriod(range('2024-03-01', '2024-03-31'))
  assert.equal(leap.end.getDate(), 29)
  const dst = previousSavingsPeriod(range('2026-03-08', '2026-03-10'))
  assert.equal(dst.start.getDate(), 5)
  assert.equal(dst.end.getDate(), 7)
})

test('report includes empty months, current partial month, and incomplete currency history', () => {
  const now = new Date('2026-04-10T15:00:00')
  const rows = [tx('income', 100, '2026-01-15'), tx('income', 5, '2026-03-10', 'USD'), tx('outcome', 20, '2026-04-05'), tx('income', 1000, '2026-04-20')]
  const report = buildSavingsReport(rows, april, now)
  assert.equal(report.partial, true)
  assert.equal(report.range.end.getDate(), 10)
  assert.equal(report.previousRange.start.getDate(), 22)
  assert.equal(report.previousRange.end.getDate(), 31)
  const idr = report.groups.find(group => group.currency === 'IDR')
  assert.equal(idr.current.savings, -20)
  assert.equal(idr.months.length, 4)
  assert.equal(idr.months[0].status, 'Incomplete history')
  assert.equal(idr.months[1].totals.savings, 0)
  assert.equal(idr.months[3].partial, true)
  assert.equal(idr.months[3].totals.savings, -20)
  assert.equal(report.groups.find(group => group.currency === 'USD').months[0].status, 'Incomplete history')
  assert.equal(buildSavingsReport([], april, now).groups.length, 0)
})

test('future reporting ranges remain valid and exclude scheduled cash flow', () => {
  const report = buildSavingsReport([tx('income', 500, '2026-06-01')], range('2026-06-01', '2026-06-30'), new Date('2026-04-10T15:00:00'))
  assert.equal(report.future, true)
  assert.ok(report.range.start <= report.range.end)
  assert.equal(report.groups[0].current.income, 0)
})

test('report recalculates month and currency membership after transaction edits and deletions', () => {
  const rows = [tx('income', 100, '2026-04-01'), tx('outcome', 40, '2026-04-03')]
  const now = new Date('2026-05-10T12:00:00')
  assert.equal(buildSavingsReport(rows, april, now).groups[0].current.savings, 60)
  rows[1] = { ...rows[1], amount: 60, currency: 'USD', occurred_at: new Date('2026-03-31T12:00:00').toISOString() }
  const edited = buildSavingsReport(rows, april, now)
  assert.equal(edited.groups.find(group => group.currency === 'IDR').current.savings, 100)
  assert.equal(edited.groups.find(group => group.currency === 'USD').previous.savings, -60)
  rows[1].deleted_at = '2026-05-01'
  assert.equal(buildSavingsReport(rows, april, now).groups.length, 1)
})

test('history loader paginates deterministically and retains owner/deletion filters', async () => {
  const requests = []
  const page = Array.from({ length: 500 }, () => tx('income', 1, '2026-04-01'))
  const { loadSavingsHistory } = await loadTsModule('../src/utils/savingsHistory.ts', import.meta.url, {
    '../lib/supabaseRest': { supabaseRest: { async select(table, query) {
      requests.push({ table, query })
      return query.offset === 0 ? page : [{ ...page[0], id: 'last', accounts: { name: 'Checking' }, categories: { name: 'Salary' } }]
    } } },
  })
  const rows = await loadSavingsHistory('owner')
  assert.equal(rows.length, 501)
  assert.equal(rows[500].account.name, 'Checking')
  assert.equal(requests[1].query.offset, 500)
  assert.equal(requests[0].query.eq.user_id, 'owner')
  assert.equal(requests[0].query.is.deleted_at, null)
  assert.equal(requests[0].query.order, 'occurred_at.asc,id.asc')
  assert.ok(requests.every(request => request.table === 'transactions'))
})
