import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Jakarta', viewport: { width: 320, height: 800 } })

test('dashboard controls fit on mobile and keep their state across reporting requests', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+07:00'))
  const user = { id: 'dashboard-owner', email: 'dashboard@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  const account = { id: 'checking', name: 'Checking', user_id: user.id, currency: 'IDR' }
  const transaction = { id: 'transaction', account_id: account.id, account, user_id: user.id, type: 'outcome', amount: 45000, occurred_at: '2026-11-11T03:00:00Z' }
  const initialRequest = Promise.withResolvers<void>()
  const todayRequest = Promise.withResolvers<void>()

  await page.route('**/auth/v1/**', route => route.fulfill({ json: {
    access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user,
  } }))
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').pop()
    if (table === 'transactions') {
      const start = url.searchParams.get('occurred_at')
      if (start === 'gte.2026-10-31T17:00:00.000Z') {
        await initialRequest.promise
        return route.fulfill({ json: [{ ...transaction, description: 'Monthly groceries' }] })
      }
      if (start === 'gte.2026-11-10T17:00:00.000Z') {
        await todayRequest.promise
        return route.fulfill({ json: [{ ...transaction, description: 'Today groceries' }] })
      }
      return route.fulfill({ json: [{ ...transaction, description: 'Weekly groceries' }] })
    }
    return route.fulfill({ json: table === 'accounts' ? [account] : [] })
  })

  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  const menu = page.getByRole('button', { name: 'Open navigation' })
  await expect(page.getByRole('region', { name: 'Reporting period' })).toBeVisible()
  await expect(page.getByText('Loading financial data…')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Period overview' })).toBeVisible()
  await page.getByRole('link', { name: 'View all' }).click()

  const search = page.getByRole('textbox', { name: 'Search transactions' })
  await expect(search).toBeVisible()
  await expect(page.getByText('No transactions yet')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Import statement', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  initialRequest.resolve()
  await expect(page.getByText('Monthly groceries').filter({ visible: true })).toBeVisible()

  await menu.click()
  const close = page.getByRole('button', { name: 'Close navigation' })
  await expect(close).toBeFocused()
  await close.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()

  await search.fill('groceries')
  const today = page.getByRole('button', { name: 'Today', exact: true })
  await today.click()
  await expect(today).toBeFocused()
  await expect(page.getByText(/Updating…/)).toBeVisible()
  await expect(search).toHaveValue('groceries')
  await expect(page.getByText('Monthly groceries').filter({ visible: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()

  await page.getByRole('button', { name: 'This Week', exact: true }).click()
  await expect(page.getByText('Weekly groceries').filter({ visible: true })).toBeVisible()
  const lateResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('occurred_at') === 'gte.2026-11-10T17:00:00.000Z')
  todayRequest.resolve()
  await (await lateResponse).finished()
  await expect(page.getByText('Weekly groceries').filter({ visible: true })).toBeVisible()
  await expect(search).toHaveValue('groceries')

  await page.setViewportSize({ width: 1024, height: 800 })
  const edit = page.getByRole('button', { name: 'Edit', exact: true })
  await edit.scrollIntoViewIfNeeded()
  await expect(edit).toBeInViewport()
  await page.setViewportSize({ width: 1440, height: 800 })
  await expect(page.getByRole('cell', { name: 'Weekly groceries' })).toBeVisible()
  const remove = page.getByRole('button', { name: 'Delete transaction' })
  await remove.scrollIntoViewIfNeeded()
  await expect(remove).toBeInViewport()
})
