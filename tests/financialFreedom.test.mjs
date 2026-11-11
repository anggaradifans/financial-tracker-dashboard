import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './testUtils.mjs'

const {
  freedomNumber, freedomTarget, freedomSpendingMonths, freedomSpendingBaseline, freedomTrackedAssets, projectFreedom,
} = await loadTsModule('../src/utils/financialFreedom.ts', import.meta.url)

const flat = {
  monthly_contribution: 0, investment_return: 0, inflation: 0, costs: 0, contribution_growth: 0,
}

test('computes the target, gap, and progress from the entered spending, rate, and eligible assets', () => {
  const values = { annual_spending: 40_000, withdrawal_rate: 4, investable_assets: 250_000 }
  assert.deepEqual({ ...freedomTarget(values) }, { capital: 1_000_000, gap: 750_000, progress: 25 })
  assert.deepEqual({ ...freedomTarget({ annual_spending: 0.07, withdrawal_rate: 10, investable_assets: 0.7 }) },
    { capital: 0.7, gap: 0, progress: 100 })
})

test('distinguishes already reached, zero contributions, total loss, and the last month of the horizon', () => {
  assert.equal(projectFreedom(100, 100, flat), 0)
  assert.equal(projectFreedom(1_000_000_000_000, 999_999_999_999.99, flat), null)
  assert.equal(projectFreedom(600, 0, { ...flat, monthly_contribution: 1 }), 600)
  assert.equal(projectFreedom(600.01, 0, { ...flat, monthly_contribution: 1 }), null)
  assert.equal(projectFreedom(100, 95, { ...flat, investment_return: -10 }), null)
  assert.equal(projectFreedom(100, 95, { ...flat, investment_return: -10, monthly_contribution: 10 }), 1)
  assert.equal(projectFreedom(100, 90, { ...flat, investment_return: -99.99, costs: 0.01, monthly_contribution: 100 }), 1)
  assert.equal(projectFreedom(100, 90, { ...flat, investment_return: -100, monthly_contribution: 99 }), null)
})

test('compounds the net return and deflates both the balance and contributions', () => {
  assert.equal(projectFreedom(110, 100, { ...flat, investment_return: 15, costs: 5 }), 12)
  assert.equal(projectFreedom(105, 100, { ...flat, investment_return: 15, costs: 5, inflation: 10 }), null)
  assert.equal(projectFreedom(120, 0, { ...flat, monthly_contribution: 10, inflation: 12 }), 14)
  assert.equal(projectFreedom(135, 0, { ...flat, monthly_contribution: 10, contribution_growth: 50 }), 13)
})

test('rejects blank, imprecise, non-finite and out-of-range inputs while accepting zero and negative rates', () => {
  for (const value of ['', ' ', 'NaN', 'Infinity', '1e2', '0.001', '-100.01', '101']) {
    assert.equal(freedomNumber(value, { min: -100, max: 100 }), null, value)
  }
  assert.equal(freedomNumber('0', { min: -100, max: 100 }), 0)
  assert.equal(freedomNumber('-5.25', { min: -100, max: 100 }), -5.25)
})

test('only offers the last 12 completed months of recorded expenses in the selected currency', () => {
  const now = new Date(2026, 10, 11)
  const months = freedomSpendingMonths(now)
  const rows = months.map(({ end }) => ({ currency: 'USD', type: 'outcome', amount: 10.03, occurred_at: end.toISOString() }))
  const otherRows = [
    { ...rows[0], currency: 'IDR' }, { ...rows[0], type: 'transfer_out' },
    { ...rows[0], type: 'income' }, { ...rows[0], deleted_at: now.toISOString() },
    { ...rows[0], occurred_at: now.toISOString() },
  ]
  assert.deepEqual({ ...freedomSpendingBaseline([...rows, ...otherRows], 'USD', months) },
    { recordedMonths: 12, amount: 120.36 })
  assert.deepEqual({ ...freedomSpendingBaseline([...rows.slice(1), ...otherRows], 'USD', months) },
    { recordedMonths: 11, amount: null })
})

test('only uses valued, active, same-currency investable assets toward the target', () => {
  const entry = (amount, overrides = {}) => ({
    amount, currency: 'IDR', classification: 'investable', effective_kind: 'asset',
    stale: false, missing_value: false, ...overrides,
  })
  const reserves = entry(150, { classification: 'emergency_reserve', source: 'account' })
  const missing = entry(null, { missing_value: true })
  const rows = [
    entry(100.1), entry(50.2, { goal_id: 'linked-investment-goal', stale: true }),
    reserves, missing, entry(1000, { classification: 'primary_residence' }),
    entry(400, { effective_kind: 'liability' }), entry(200, { currency: 'USD' }), entry(300, { archived: true }),
  ]
  assert.deepEqual({ ...freedomTrackedAssets(rows, 'IDR') }, {
    investable: 150.3, emergencyReserve: 150, liabilities: 400, missingCount: 1, staleCount: 1,
    hasLinkedAccounts: true, hasInvestableValue: true, canUseInvestable: true,
  })
  assert.equal(freedomTrackedAssets([reserves, missing], 'IDR').canUseInvestable, false)
  assert.equal(freedomTrackedAssets([entry(0)], 'IDR').canUseInvestable, true)
  assert.equal(freedomTrackedAssets(rows, 'EUR'), null)
})
