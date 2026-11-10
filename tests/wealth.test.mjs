import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { loadTsModule } from './testUtils.mjs'

test('net worth separates currencies, classifies overdrafts, excludes archived and unknown amounts, and preserves cents', async () => {
  const { wealthTotals } = await loadTsModule('../src/utils/wealth.ts', import.meta.url)
  const make = (amount, extra = {}) => ({ currency: 'IDR', effective_kind: 'asset', classification: 'investable', amount, missing_value: false, stale: false, archived: false, ...extra })
  const totals = wealthTotals([
    make(0.1), make(0.2), make(100, { classification: 'primary_residence' }),
    make(10, { classification: 'emergency_reserve', stale: true }),
    make(200, { effective_kind: 'liability' }),
    make(null, { missing_value: true }), make(900, { archived: true }),
    make(50, { currency: 'USD' }),
  ])
  assert.equal(totals.length, 2)
  assert.equal(totals[0].assets, 110.3)
  assert.equal(totals[0].liabilities, 200)
  assert.equal(totals[0].net_worth, -89.7)
  assert.equal(totals[0].investable, 0.3)
  assert.equal(totals[0].missing_count, 1)
  assert.equal(totals[0].stale_count, 1)
  assert.equal(totals[1].net_worth, 50)
})

test('wealth errors expose known validation messages and conceal raw server errors', async () => {
  const { wealthError } = await loadTsModule('../src/utils/wealth.ts', import.meta.url, {}, new Map(), vm.createContext({ Error }))
  assert.match(wealthError(new Error('internal server dump')), /Could not complete/)
  assert.match(wealthError(new Error('Supabase RPC error: 409 - {"code":"23505"}')), /already uses this name or account/)
  assert.equal(wealthError(new Error('Supabase RPC error: 400 - {"code":"22023","message":"Refresh before editing."}')), 'Refresh before editing.')
  assert.match(wealthError(null), /Could not complete/)
})

test('valuation dates use the Jakarta day even when the database/browser clock is still on the prior UTC day', async () => {
  class FixedDate extends Date {
    constructor() { super('2026-11-09T18:30:00Z') }
  }
  const { wealthToday } = await loadTsModule('../src/utils/wealth.ts', import.meta.url, {}, new Map(), vm.createContext({ Date: FixedDate }))
  assert.equal(wealthToday(), '2026-11-10')
})

test('net worth requests scope every table to its owner and paginate large registers', async () => {
  const calls = []
  const setters = []
  const { useNetWorth } = await loadTsModule('../src/hooks/useNetWorth.ts', import.meta.url, {
    react: {
      useCallback: fn => fn,
      useEffect() {},
      useRef: value => ({ current: value }),
      useState(initial) { const index = setters.push(initial) - 1; return [initial, value => { setters[index] = value }] },
    },
    '../lib/supabaseRest': { supabaseRest: {
      async select(table, query) {
        calls.push({ table, query })
        if (table === 'wealth_current' && query.offset === 0) return Array.from({ length: 500 }, (_, id) => ({ id }))
        if (table === 'wealth_current' && query.offset === 500) return [{ id: 'last' }]
        return []
      },
    } },
  })
  await useNetWorth('owner').refresh()
  assert.equal(setters[0].length, 501)
  assert.equal(calls.length, 6)
  assert.ok(calls.every(call => call.query.eq.user_id === 'owner'))
  assert.equal(calls.find(call => call.table === 'wealth_snapshots').query.limit, 50)
})
