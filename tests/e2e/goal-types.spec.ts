import { expect, test } from '@playwright/test'
import type { FinancialGoal, GoalContribution } from '../../src/types/financial'

test.use({ timezoneId: 'Asia/Jakarta', viewport: { width: 360, height: 780 }, actionTimeout: 8000 })

test('creates all new goal types and keeps valuation and debt actuals separate from estimates', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+07:00'))
  const user = { id: 'goal-owner', email: 'goals@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  const ts = '2026-11-11T00:00:00Z'
  const goals: FinancialGoal[] = []
  const contributions: GoalContribution[] = []
  await page.route('**/auth/v1/**', route => route.fulfill({ json: {
    access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user,
  } }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.split('/').pop()
    const payload = request.postDataJSON()
    if (path === 'goals' && request.method() === 'POST') {
      const goal = {
        id: payload.kind, user_id: user.id, status: 'active', created_at: ts, updated_at: ts,
        priority: 2, planned_monthly_amount: null, ...payload,
      }
      goals.push(goal)
      return route.fulfill({ json: [goal] })
    }
    if (path === 'goals' && request.method() === 'PATCH') {
      const goal = goals.find(item => url.searchParams.get('id') === `eq.${item.id}`)!
      expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`)
      if ('debt_balance' in payload || 'investment_market_value' in payload) {
        expect(url.searchParams.get('updated_at')).toBe(`eq.${goal.updated_at}`)
      }
      Object.assign(goal, payload)
      return route.fulfill({ json: [goal] })
    }
    if (path === 'goals') return route.fulfill({ json: goals })
    if (path === 'goal_contributions' && request.method() === 'POST') {
      expect(payload).toMatchObject({ goal_id: 'debt_payoff', amount: 20.01, transaction_id: null })
      contributions.push({ id: 'repayment', ...payload })
      return route.fulfill({ json: contributions })
    }
    if (path === 'goal_contributions') return route.fulfill({ json: contributions })
    if (path === 'goal_progress') return route.fulfill({ json: goals.map(goal => {
      const repayment = contributions.find(row => row.goal_id === goal.id)?.amount ?? 0
      const saved = goal.kind === 'investment' ? 50.02 : goal.kind === 'debt_payoff' ? goal.target_amount - goal.debt_balance! : 0
      return {
        goal_id: goal.id, saved_amount: saved, remaining_amount: goal.debt_balance ?? goal.target_amount - saved,
        repayment_amount: repayment, progress_percent: saved / goal.target_amount * 100,
      }
    }) })
    if (path === 'monthly_savings_plans') return route.fulfill({ json: [{ currency: 'IDR', revision: 'saved', baseline_amount: 100, baseline_month: null }] })
    return route.fulfill({ json: [] })
  })

  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Goals', exact: true }).click()

  const newGoal = page.getByRole('button', { name: 'New goal' })
  await newGoal.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  const create = page.getByRole('form', { name: 'Create a goal' })
  await expect(create.getByLabel('Goal type')).toBeFocused()
  await create.getByRole('button', { name: 'Cancel' }).click()
  await expect(create).toHaveCount(0)

  const article = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })
  const estimate = (name: string) => article(name).getByRole('region', { name: `Planning estimate for ${name}` })
  for (const [kind, name, targetLabel, target] of [
    ['sinking_fund', 'Annual insurance', 'Target amount', '100.01'],
    ['investment', 'Index fund', 'Contribution target', '150.03'],
    ['debt_payoff', 'Loan', 'Opening debt balance', '100'],
  ]) {
    await newGoal.click()
    await create.getByLabel('Goal type').selectOption(kind)
    await create.getByLabel('Goal name').fill(name)
    await create.getByLabel(targetLabel, { exact: false }).fill(target)
    await create.getByLabel('Target date (optional)').fill('2027-01-20')
    if (kind === 'investment') await create.getByLabel('Market value (IDR, optional)').fill('200.10')
    if (kind === 'debt_payoff') {
      await create.getByLabel('Annual interest rate (%)').fill('12')
      await create.getByLabel('Recurring monthly fee (IDR)').fill('0.50')
      await create.getByLabel('Scheduled monthly payment (IDR)').fill('1')
    }
    await create.getByRole('button', { name: 'Create goal' }).click()
    await expect(article(name)).toBeVisible()
  }

  await expect(estimate('Annual insurance')).toContainText(/Rp\s*50,01/)
  const investment = article('Index fund')
  await expect(investment).toContainText(/Rp\s*200,1/)
  await expect(investment).toContainText(/Rp\s*50,02/)
  await investment.getByRole('button', { name: 'Edit goal' }).click()
  const investmentEdit = investment.getByRole('form', { name: 'Edit Index fund' })
  await investmentEdit.getByLabel('Market value (IDR, optional)').fill('220.25')
  await investmentEdit.getByRole('button', { name: 'Save changes' }).click()
  await expect(investment).toContainText(/Rp\s*220,25/)
  await expect(investment).toContainText(/Rp\s*50,02/)

  const debt = article('Loan')
  await expect(estimate('Loan')).toContainText('Balance grows')
  await expect(estimate('Loan')).toContainText(/Rp\s*51,25/)
  const plan = page.getByRole('region', { name: 'Monthly savings plan' })
  await plan.getByLabel('Monthly amount for Loan').fill('51.25')
  await expect(plan.getByRole('listitem').filter({ hasText: 'Loan' })).toContainText('2 months · On track by target month')
  await debt.getByText('Record repayment').click()
  await expect(debt.getByLabel('Link a cash-flow transaction')).toHaveCount(0)
  await debt.getByLabel('Amount (IDR)').fill('20.01')
  await debt.getByRole('button', { name: 'Add repayment' }).click()
  await expect(debt).toContainText(/Rp\s*20,01/)
  await expect(estimate('Loan')).toContainText(/Rp\s*51,25/)

  await debt.getByRole('button', { name: 'Edit goal' }).click()
  const debtEdit = debt.getByRole('form', { name: 'Edit Loan' })
  await debtEdit.getByLabel('Latest lender balance (IDR)').fill('0')
  await debtEdit.getByRole('button', { name: 'Save changes' }).click()
  await expect(estimate('Loan')).toContainText('Target reached')
  await debt.getByRole('button', { name: 'Mark complete' }).click()
  await expect(debt).toContainText('Completed')
  await debt.getByRole('button', { name: 'Reopen' }).click()
  await expect(debt.getByText('Recent activity (1)')).toBeVisible()

  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${theme} mode` }).click()
    await expect(estimate('Loan')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
