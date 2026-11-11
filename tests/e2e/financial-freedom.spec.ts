import { expect, test } from '@playwright/test'
import type { FreedomPlan } from '../../src/utils/financialFreedom'

test.use({ timezoneId: 'Asia/Jakarta', viewport: { width: 360, height: 780 } })

test('compares scenarios and saves an explicitly accepted spending snapshot', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+07:00'))
  const user = { id: 'freedom-owner', email: 'freedom@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  let saved: (FreedomPlan & { revision: string }) | null = null
  let historyMonths = 11
  let recordedExpense = 10
  let trackedInvestment = 200
  let failLoad = true
  let failPreview = true

  await page.route('**/auth/v1/**', route => route.fulfill({ json: {
    access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user,
  } }))
  await page.route('**/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    if (table === 'financial_freedom_plans') {
      if (request.method() === 'GET' && failLoad) {
        failLoad = false
        return route.fulfill({ status: 503, json: {} })
      }
      if (request.method() === 'POST') saved = request.postDataJSON()
      if (request.method() === 'PATCH') {
        expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`)
        if (url.searchParams.get('revision') !== `eq.${saved?.revision}`) return route.fulfill({ json: [] })
        saved = request.postDataJSON()
      }
      return route.fulfill({ json: saved ? [saved] : [] })
    }
    if (table === 'transactions' && url.searchParams.get('type') === 'eq.outcome') {
      expect(url.searchParams.get('currency')).toBe('eq.IDR')
      expect(url.searchParams.getAll('occurred_at')).toEqual([
        'gte.2025-10-31T17:00:00.000Z', 'lte.2026-10-31T16:59:59.999Z',
      ])
      if (failPreview) {
        failPreview = false
        return route.fulfill({ status: 503, json: {} })
      }
      return route.fulfill({ json: Array.from({ length: historyMonths }, (_, index) => ({
        id: `expense-${index}`, currency: 'IDR', type: 'outcome', amount: recordedExpense,
        occurred_at: new Date(Date.UTC(2025, 10 + index, 15)).toISOString(),
      })) })
    }
    if (table === 'wealth_current' && url.searchParams.has('currency')) {
      expect(url.searchParams.get('user_id')).toBe(`eq.${user.id}`)
      expect(url.searchParams.get('archived')).toBe('eq.false')
      if (url.searchParams.get('currency') !== 'eq.IDR') return route.fulfill({ json: [] })
      return route.fulfill({ json: [
        { id: 'investment', currency: 'IDR', classification: 'investable', effective_kind: 'asset', amount: trackedInvestment, stale: true },
        { id: 'reserve', currency: 'IDR', classification: 'emergency_reserve', effective_kind: 'asset', amount: 450, source: 'account' },
        { id: 'home', currency: 'IDR', classification: 'primary_residence', effective_kind: 'asset', amount: 1200 },
        { id: 'loan', currency: 'IDR', classification: 'other', effective_kind: 'liability', amount: 250 },
        { id: 'missing', currency: 'IDR', classification: 'investable', effective_kind: 'asset', amount: null, missing_value: true },
      ].map(entry => ({ stale: false, missing_value: false, ...entry })) })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Goals', exact: true }).click()
  await expect(page.getByRole('button', { name: 'New goal' })).toBeVisible()
  await page.getByRole('link', { name: 'Financial freedom' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Financial freedom' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Could not load your financial freedom plan.')
  await page.getByRole('button', { name: 'Retry loading plan' }).click()
  const form = page.getByRole('form', { name: 'Financial freedom plan' })
  const annualSpending = form.getByLabel(/Desired annual spending/)
  const withdrawal = form.getByLabel('Annual withdrawal rate (%)')
  const withdrawalHelp = form.getByRole('button', { name: 'About the annual withdrawal rate' })
  const withdrawalHelpText = form.getByText(/The share of your starting portfolio/)
  const assets = form.getByLabel(/Eligible investable assets/)
  const currency = form.getByLabel('Plan currency')
  const scenarioA = form.getByRole('group', { name: 'Scenario A' })
  const scenarioB = form.getByRole('group', { name: 'Scenario B' })
  const preview = form.getByRole('button', { name: 'Preview recorded spending' })
  const accept = form.getByRole('button', { name: 'Use this spending baseline' })
  const save = form.getByRole('button', { name: 'Save plan' })
  const tracked = form.getByRole('region', { name: 'Tracked balances · IDR' })
  const useTrackedAssets = tracked.getByRole('button', { name: 'Use tracked investable assets' })

  await expect(withdrawal).toHaveValue('')
  await expect(withdrawal).toHaveAccessibleDescription(/entering 4 means 4%/)
  await expect(withdrawalHelpText).toBeHidden()
  await withdrawalHelp.focus()
  await page.keyboard.press('Enter')
  await expect(withdrawalHelp).toHaveAttribute('aria-expanded', 'true')
  await expect(withdrawalHelpText).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(withdrawalHelpText).toBeHidden()
  await expect(withdrawalHelp).toBeFocused()
  await withdrawalHelp.click()
  await expect(withdrawalHelpText).toBeVisible()
  await annualSpending.click()
  await expect(withdrawalHelpText).toBeHidden()
  await expect(scenarioA.getByLabel('Annual gross return (%)')).toHaveValue('')
  await annualSpending.fill('200')
  await currency.selectOption('USD')
  await expect(annualSpending).toHaveValue('')
  await expect(form.getByText(/No active Net worth entries in USD/)).toBeVisible()
  await currency.selectOption('IDR')
  await annualSpending.fill('200')
  await preview.click()
  await expect(form.getByRole('alert')).toContainText('Could not load recorded spending')
  await preview.click()
  await expect(form.getByText(/11 of 12 months/)).toBeVisible()
  await expect(accept).toHaveCount(0)
  historyMonths = 12
  await preview.click()
  await expect(accept).toBeVisible()
  await expect(annualSpending).toHaveValue('200')
  await accept.click()
  await expect(annualSpending).toHaveValue('120')
  await expect(annualSpending).toHaveAttribute('readonly', '')

  await withdrawal.fill('10')
  await expect(form.getByText('Target capital', { exact: true })).toBeVisible()
  await expect(form.getByText('Remaining gap', { exact: true })).toHaveCount(0)
  await expect(tracked).toContainText(/Rp\s*450/)
  await expect(tracked).toContainText(/Rp\s*250/)
  await expect(tracked).toContainText('1 entry has no valuation')
  await expect(tracked).toContainText('1 valuation is over 90 days old')
  await expect(tracked).toContainText('Linked balances come from recorded transactions')
  await useTrackedAssets.click()
  await expect(assets).toHaveValue('200')
  for (const [scenario, contribution, investmentReturn] of [[scenarioA, '100', '0'], [scenarioB, '0', '-5']] as const) {
    await scenario.getByLabel('Monthly contribution (IDR)').fill(contribution)
    await scenario.getByLabel('Annual gross return (%)').fill(investmentReturn)
    await scenario.getByLabel('Annual inflation (%)').fill('0')
    await scenario.getByLabel('Annual fees and taxes drag (percentage points)').fill('0')
    await scenario.getByLabel('Annual contribution growth (%)').fill('0')
  }
  await expect(scenarioA).toContainText('September 2027 · 10 months')
  await expect(scenarioB).toContainText('Target not reached within 50 years')
  await expect(form.getByRole('progressbar')).toHaveAttribute('value', /^16\.66/)
  await scenarioB.getByLabel('Annual gross return (%)').fill('-100')
  await scenarioB.getByLabel('Annual fees and taxes drag (percentage points)').fill('1')
  await save.click()
  await expect(form.getByRole('alert')).toContainText('Check the return after fees and taxes')
  await scenarioB.getByLabel('Annual fees and taxes drag (percentage points)').fill('0')
  await save.click()
  await expect(form.getByText('Financial freedom plan saved.')).toBeVisible()
  expect(saved).toMatchObject({ annual_spending: 120, spending_period_start: '2025-11-01', calculation_date: '2026-11-11' })

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await withdrawalHelp.click()
  await expect(withdrawalHelpText).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await withdrawalHelp.click()
  await page.setViewportSize({ width: 1280, height: 900 })
  expect((await scenarioA.boundingBox())!.x).toBeLessThan((await scenarioB.boundingBox())!.x)
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+07:00'))
  recordedExpense = 20
  trackedInvestment = 300
  await page.reload()
  await expect(annualSpending).toHaveValue('120')
  await expect(tracked).toContainText(/Rp\s*300/)
  await expect(assets).toHaveValue('200')
  await expect(form.getByText(/^Calculation date 2026-11-11/)).toBeVisible()
  await preview.click()
  await expect(accept).toBeVisible()
  await expect(annualSpending).toHaveValue('120')
  await form.getByRole('button', { name: 'Switch to manual spending' }).click()
  await annualSpending.fill('100')
  await assets.fill('1000')
  await expect(scenarioA).toContainText('Target already met on the calculation date')
  await save.click()
  await expect(form.getByText('Financial freedom plan saved.')).toBeVisible()
  expect(saved).toMatchObject({ annual_spending: 100, spending_period_start: null, calculation_date: '2026-11-20' })
  Object.assign(saved!, { revision: 'another-session', investable_assets: 2000 })
  await assets.fill('1250')
  await save.click()
  await expect(form.getByRole('alert')).toContainText('The saved plan changed in another session')
  await form.getByRole('button', { name: 'Discard edits and reload saved plan' }).click()
  await expect(assets).toHaveValue('2000')

  await page.getByRole('link', { name: 'Savings goals' }).click()
  await expect(page.getByRole('button', { name: 'New goal' })).toBeVisible()
})
