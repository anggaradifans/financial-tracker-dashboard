import assert from 'node:assert/strict'
import test from 'node:test'
import * as dateFns from 'date-fns'
import { loadTsModule } from './testUtils.mjs'

test('dashboard resolves the owner-scoped account embed and preserves transactions without accounts', async () => {
  const states = []
  const requests = []
  const account = { id: 'account', user_id: 'owner', name: 'Checking' }
  const rows = [
    { id: 'with-account', accounts: account, categories: { name: 'Salary' } },
    { id: 'without-account', accounts: null, categories: { name: 'Food' } },
  ]
  const { useFinancialData } = await loadTsModule('../src/hooks/useFinancialData.ts', import.meta.url, {
    react: {
      useEffect() {},
      useState(initial) {
        const index = states.push(initial) - 1
        return [initial, value => { states[index] = value }]
      },
    },
    'date-fns': dateFns,
    '../utils/notifications': { devError() {} },
    '../lib/supabaseRest': { supabaseRest: {
      async select(table, query) {
        requests.push({ table, query })
        if (table !== 'transactions') return []
        // Model the ambiguity introduced by the second account foreign key.
        if (!query.select.includes('accounts:accounts!transactions_account_owner_fkey(*)')) {
          throw new Error('PGRST201: ambiguous account relationship')
        }
        return rows
      },
    } },
  })
  const range = { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-30T23:59:59Z') }
  await useFinancialData('owner', range).refresh()
  const query = requests.find(request => request.table === 'transactions').query
  assert.equal(query.eq.user_id, 'owner')
  assert.equal(query.is.deleted_at, null)
  assert.equal(query.gte.occurred_at, range.start.toISOString())
  assert.equal(query.lte.occurred_at, range.end.toISOString())
  assert.equal(states[0].length, 2)
  assert.equal(states[0][0].account.name, 'Checking')
  assert.equal(states[0][1].account, null)
  assert.equal(states[5], null)
})
