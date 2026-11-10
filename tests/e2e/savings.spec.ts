import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Jakarta' })

test('savings report separates currencies, drills into history, and reflects edits and deletions', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-04-10T15:00:00+07:00'))
  const user = { id: 'savings-owner', email: 'savings@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  const category = { id: 'cash-flow', name: 'Cash flow', allowed_type: 'both' }
  const account = { id: 'checking', name: 'Checking', currency: 'IDR' }
  const makeTx = (id: string, type: string, amount: number, day: string, currency = 'IDR') => ({ id, type, amount, currency, occurred_at: `${day}T05:00:00Z`, created_at: `${day}T05:00:00Z`, description: id, category_id: category.id, account_id: account.id, metadata: {}, categories: category, accounts: account, user_id: user.id, deleted_at: null })
  let rows = [makeTx('Salary', 'income', 1000, '2026-04-01'), makeTx('Spending', 'outcome', 400, '2026-04-02'), makeTx('Refund', 'income', 100, '2026-04-03'), makeTx('Owned transfer out', 'transfer_out', 800, '2026-04-04'), makeTx('Owned transfer in', 'transfer_in', 800, '2026-04-04'), makeTx('Dollar income', 'income', 50, '2026-04-02', 'USD'), makeTx('March expense', 'outcome', 200, '2026-03-25')]
  let failHistory = true
  await page.route('**/auth/v1/**', route => route.fulfill({ json: { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user } }))
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/transactions')) {
      if (url.searchParams.get('offset') === '0' && failHistory) {
        failHistory = false
        return route.fulfill({ status: 503, body: 'History temporarily unavailable' })
      }
      if (route.request().method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '')
        rows = rows.map(row => row.id === id ? { ...row, ...route.request().postDataJSON() } : row)
        return route.fulfill({ json: rows.filter(row => row.id === id) })
      }
      let filtered = rows.filter(row => !row.deleted_at)
      for (const bound of url.searchParams.getAll('occurred_at')) {
        if (bound.startsWith('gte.')) filtered = filtered.filter(row => new Date(row.occurred_at) >= new Date(bound.slice(4)))
        if (bound.startsWith('lte.')) filtered = filtered.filter(row => new Date(row.occurred_at) <= new Date(bound.slice(4)))
      }
      return route.fulfill({ json: filtered })
    }
    return route.fulfill({ json: url.pathname.endsWith('/accounts') ? [account] : url.pathname.endsWith('/categories') ? [category] : [] })
  })
  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load savings history')
  await page.getByRole('button', { name: 'Retry savings history' }).click()
  const idr = page.getByRole('region', { name: 'IDR savings', exact: true })
  const usd = page.getByRole('region', { name: 'USD savings', exact: true })
  const selected = idr.locator('div').filter({ has: page.getByRole('heading', { name: /^Selected period:/ }) }).first()
  await expect(idr).toBeVisible()
  await expect(selected.locator('dd').nth(2)).toContainText('700')
  await expect(usd).toContainText('$50.00')
  await expect(idr).toContainText('Partial period')
  const drill = idr.locator('summary').filter({ hasText: 'Selected-period transactions' })
  await expect(drill).toHaveText('Selected-period transactions (3)')
  await drill.press('Enter')
  await expect(selected.getByText('Refund', { exact: true })).toBeVisible()
  await expect(idr.getByText('Owned transfer out', { exact: true })).toHaveCount(0)
  await idr.locator('summary').filter({ hasText: 'March 2026' }).click()
  await expect(idr).toContainText('Unavailable')

  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  const spending = page.getByRole('row').filter({ hasText: 'Spending' })
  await spending.getByTitle('Edit', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit Transaction' })
  await dialog.getByLabel('Amount', { exact: true }).fill('600')
  await dialog.getByRole('button', { name: /update transaction/i }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(selected.locator('dd').nth(2)).toContainText('500')

  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'Refund' }).getByTitle('Delete transaction').click()
  await page.getByRole('button', { name: 'Delete', exact: true }).filter({ visible: true }).click()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(drill).toHaveText('Selected-period transactions (2)')
  await expect(selected.locator('dd').nth(2)).toContainText('400')
})

test('demo savings stays usable on mobile and in both themes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-04-10T15:00:00+07:00'))
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/demo/analytics')
  await expect(page.getByRole('heading', { name: 'Cash-flow savings', exact: true })).toBeVisible()
  await expect(page.locator('summary').filter({ hasText: 'Incomplete history' }).first()).toBeVisible()
  const drill = page.locator('summary').filter({ hasText: 'Selected-period transactions' })
  await drill.press('Enter')
  await expect(page.getByText('Monthly Salary', { exact: true }).first()).toBeVisible()
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: `Switch to ${theme} mode` }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.getByRole('button', { name: 'Custom Range' }).click()
  await page.getByLabel('Start Date', { exact: true }).fill('2026-03-01')
  await page.getByLabel('End Date', { exact: true }).fill('2026-03-31')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Selected period:/ })).toContainText('Mar 1, 2026')
  await page.screenshot({ path: '/tmp/savings-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/tmp/savings-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Goal contributions', exact: true }).click()
  await expect(page).toHaveURL(/\/demo\/goals$/)
})
