import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Jakarta' })

test('previews and saves allocations by currency, and records a partial linked contribution separately', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+07:00'))
  const user = { id: 'plan-owner', email: 'plan@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  const ts = '2026-10-01T00:00:00Z'
  const goal = (id: string, name: string, currency: string, status = 'active', date: string | null = null) => ({
    id, name, currency, status, kind: 'custom', user_id: user.id, target_amount: 200,
    planned_monthly_amount: 0, priority: 2, created_at: ts, updated_at: ts, target_date: date,
  })
  const goals = [
    goal('bike', 'Bicycle', 'IDR', 'active', '2026-10-20'),
    goal('school', 'School', 'IDR'),
    goal('usd', 'Travel', 'USD'),
    goal('archived', 'Old goal', 'IDR', 'archived'),
  ]
  const transaction = (id: string, type: string, amount: number, currency: string, occurred_at: string, description: string) =>
    ({ id, type, amount, currency, occurred_at, description, user_id: user.id, deleted_at: null })
  const rows = [
    transaction('opening', 'income', 20, 'IDR', '2026-09-15T00:00:00Z', 'September pay'),
    transaction('salary', 'income', 150, 'IDR', '2026-10-05T00:00:00Z', 'October pay'),
    transaction('expenses', 'outcome', 50, 'IDR', '2026-10-06T00:00:00Z', 'October expenses'),
    transaction('transfer', 'transfer_in', 500, 'IDR', '2026-10-07T00:00:00Z', 'Account transfer'),
    transaction('usd-pay', 'income', 1000, 'USD', '2026-10-08T00:00:00Z', 'USD pay'),
    transaction('nov-pay', 'income', 800, 'IDR', '2026-11-01T00:00:00Z', 'November pay'),
  ]
  const plans = new Map<string, unknown>()
  const contributions: { goal_id: string; transaction_id: string; amount: number }[] = []
  await page.route('**/auth/v1/**', route => route.fulfill({ json: {
    access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user,
  } }))
  await page.route('**/rest/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.split('/').pop()
    const payload = route.request().postDataJSON()
    if (path === 'goals') return route.fulfill({ json: goals })
    if (path === 'transactions') return route.fulfill({ json: rows })
    if (path === 'monthly_savings_plans') return route.fulfill({ json: [...plans.values()] })
    if (path === 'save_monthly_savings_plan') {
      expect(payload).toMatchObject({ p_currency: 'IDR', p_baseline_amount: 100, p_baseline_month: '2026-10-01' })
      expect(payload.p_allocations).toEqual([
        { goal_id: 'bike', expected_updated_at: ts, amount: 80, priority: 3 },
        { goal_id: 'school', expected_updated_at: ts, amount: 50, priority: 1 },
      ])
      plans.set(payload.p_currency, {
        currency: payload.p_currency, baseline_amount: payload.p_baseline_amount, baseline_month: payload.p_baseline_month, revision: 'saved',
      })
      for (const allocation of payload.p_allocations) {
        const updated = goals.find(item => item.id === allocation.goal_id)!
        updated.planned_monthly_amount = allocation.amount
        updated.priority = allocation.priority
      }
      return route.fulfill({ status: 204 })
    }
    if (path === 'goal_contributions' && route.request().method() === 'POST') {
      expect(payload).toMatchObject({ goal_id: 'bike', transaction_id: 'salary', amount: 60 })
      contributions.push({ ...payload, id: 'recorded' })
      return route.fulfill({ json: contributions })
    }
    if (path === 'goal_contributions') return route.fulfill({ json: contributions })
    if (path === 'goal_progress') return route.fulfill({ json: goals.map(item => {
      const saved = contributions.filter(entry => entry.goal_id === item.id).reduce((sum, entry) => sum + entry.amount, 0)
      return { goal_id: item.id, saved_amount: saved, remaining_amount: 200 - saved, progress_percent: saved / 2 }
    }) })
    return route.fulfill({ json: [] })
  })

  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByRole('link', { name: 'Goals', exact: true }).click()
  const plan = page.getByRole('region', { name: 'Monthly savings plan' })
  const idr = plan.getByRole('form', { name: 'IDR monthly savings plan' })
  const usd = plan.getByRole('form', { name: 'USD monthly savings plan' })
  const currency = plan.getByLabel('Plan currency')
  await expect(plan.getByRole('heading', { name: 'Bicycle' })).toBeVisible()
  await expect(plan.getByRole('heading', { name: 'Old goal' })).toHaveCount(0)

  await currency.focus()
  await page.keyboard.press('Tab')
  await expect(idr.getByLabel('Savings baseline')).toBeFocused()
  await plan.getByLabel('Available per month (IDR)').fill('200')
  await plan.getByLabel('Monthly amount for Bicycle').fill('80')
  await plan.getByLabel('Monthly amount for School').fill('50')
  await expect(idr.getByText('Unallocated savings')).toBeVisible()
  await expect(idr.getByText(/Rp\s*70/)).toBeVisible()
  await currency.selectOption('USD')
  await usd.getByLabel('Available per month (USD)').fill('10')
  await currency.selectOption('IDR')
  await expect(idr.getByLabel('Monthly amount for Bicycle')).toHaveValue('80')
  await idr.getByLabel('Savings baseline').selectOption('history')
  const months = plan.getByLabel('Completed month (IDR)')
  await expect(months.locator('option[value="2026-10"]')).toContainText(/Rp\s*100/)
  await expect(months.locator('option[value="2026-11"]')).toHaveCount(0)
  await months.selectOption('2026-10')
  await expect(plan.getByText('Funding shortfall')).toBeVisible()
  await expect(plan.getByText(/Rp\s*30/)).toBeVisible()

  const bike = plan.getByRole('listitem').filter({ hasText: 'Bicycle' })
  await expect(bike).toContainText('3 months · Target date passed')
  await plan.getByLabel('Priority for School').selectOption('1')
  await plan.getByLabel('Priority for Bicycle').selectOption('3')
  await expect(bike).toContainText('4 months · Target date passed')
  await plan.getByRole('button', { name: 'Save monthly plan' }).click()
  await expect(plan.getByLabel('Monthly amount for Bicycle')).toHaveValue('80')
  await expect(plan.getByRole('button', { name: 'Save monthly plan' })).toBeDisabled()
  await currency.selectOption('USD')
  await expect(plan.getByRole('heading', { name: 'Travel' })).toBeVisible()
  await expect(usd.getByLabel('Available per month (USD)')).toHaveValue('10')
  await currency.selectOption('IDR')
  await expect(plan.getByLabel('Priority for Bicycle')).toHaveValue('3')

  const bicycleGoal = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Bicycle' }) })
  await bicycleGoal.getByText('Record contribution').click()
  await bicycleGoal.getByLabel('Link a cash-flow transaction').check()
  const picker = bicycleGoal.getByLabel('Transaction for Bicycle')
  await expect(picker.locator('option[value="transfer"]')).toHaveCount(0)
  await expect(picker.locator('option[value="usd-pay"]')).toHaveCount(0)
  await picker.selectOption('salary')
  await bicycleGoal.getByLabel('Amount (IDR)').fill('60')
  await bicycleGoal.getByRole('button', { name: 'Add contribution' }).click()
  await expect(bicycleGoal.getByText('Recent activity (1)')).toBeVisible()
  const schoolGoal = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'School' }) })
  await schoolGoal.getByText('Record contribution').click()
  await schoolGoal.getByLabel('Link a cash-flow transaction').check()
  await schoolGoal.getByLabel('Transaction for School').selectOption('salary')
  await expect(schoolGoal.getByText(/Rp\s*90 available to link/)).toBeVisible()
  await schoolGoal.getByLabel('Amount (IDR)').fill('91')
  await expect(schoolGoal.getByRole('button', { name: 'Add contribution' })).toBeDisabled()
  await expect(plan.getByText('Funding shortfall')).toBeVisible()

  await page.setViewportSize({ width: 360, height: 780 })
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${theme} mode` }).click()
    await expect(plan).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
