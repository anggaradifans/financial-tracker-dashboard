import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './testUtils.mjs'

const { forecastGoalTimeline, requiredGoalMonthly } = await loadTsModule('../src/utils/goalForecast.ts', import.meta.url)
const today = new Date(2026, 10, 11)
const debt = { kind: 'debt_payoff', debt_apr: 12, debt_monthly_fee: 0.5, target_date: '2027-01-01' }

test('sinking and investment estimates use the contribution gap and round up to cents', () => {
  for (const kind of ['sinking_fund', 'investment']) {
    const goal = { kind, target_date: '2027-01-01', investment_market_value: 999 }
    assert.equal(requiredGoalMonthly(goal, 10.01, today), 5.01)
    assert.match(forecastGoalTimeline(goal, 10.01, 5.01, today), /On track/)
    assert.match(forecastGoalTimeline(goal, 10.01, 5, today), /After target month/)
    assert.equal(requiredGoalMonthly({ ...goal, target_date: '2026-11-28' }, 10.01, today), null)
    assert.equal(requiredGoalMonthly({ ...goal, target_date: null }, 10.01, today), null)
  }
})

test('debt estimate uses the lender balance, rounded monthly interest, and fees', () => {
  // 100 + 1.00 + 0.50 - 51.25 = 50.25. Next month interest rounds to 0.50.
  assert.equal(requiredGoalMonthly(debt, 100, today), 51.25)
  assert.match(forecastGoalTimeline(debt, 100, 51.25, today), /^2 months.*On track/)
  assert.match(forecastGoalTimeline(debt, 100, 51.24, today), /^3 months.*After target month/)
  const freeDebt = { ...debt, debt_apr: 0, debt_monthly_fee: 0, target_date: '2027-02-01' }
  assert.equal(requiredGoalMonthly(freeDebt, 100, today), 33.34)
  assert.equal(requiredGoalMonthly(freeDebt, 0, today), 0)
  assert.equal(forecastGoalTimeline(freeDebt, 0, 0, today), 'Target reached')
})

test('debt estimate distinguishes growing debt, interest-only payments, and timing limits', () => {
  assert.match(forecastGoalTimeline(debt, 100, 0, today), /Balance grows/)
  assert.match(forecastGoalTimeline(debt, 100, 1.49, today), /Balance grows/)
  assert.match(forecastGoalTimeline(debt, 100, 1.5, today), /Balance stays the same/)
  assert.match(forecastGoalTimeline({ ...debt, target_date: '2026-10-31' }, 100, 51.25, today), /Target date passed/)
  assert.equal(requiredGoalMonthly({ ...debt, target_date: '2077-01-01' }, 100, today), null)
  assert.match(forecastGoalTimeline({ ...debt, debt_apr: 0, debt_monthly_fee: 0 }, 100, 0.01, today), /exceeds 50 years/)
})
