import { expect, test } from '@playwright/test'
import type { CurrentWealthEntry, WealthSaveInput, WealthSnapshot, WealthValuation } from '../../src/types/wealth'
import { wealthTotals } from '../../src/utils/wealth'

test.use({ timezoneId: 'Asia/Jakarta' })

test('balance sheet saves properties and investments, keeps history, and supports linked accounts and recovery', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-11-10T14:00:00+07:00'))
  const user = { id: 'wealth-owner', email: 'wealth@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }
  const account = { id: 'checking', name: 'Checking', currency: 'IDR', user_id: user.id }
  let entries: CurrentWealthEntry[] = []
  const revisions: WealthValuation[] = []
  const snapshots: WealthSnapshot[] = []
  let failLoad = true
  let failSave = true
  const saveRequests: string[] = []
  await page.route('**/auth/v1/**', route => route.fulfill({ json: { access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user } }))
  await page.route('**/rest/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.split('/').pop()
    const payload = route.request().postDataJSON()
    if (path === 'wealth_current') {
      if (failLoad) { failLoad = false; return route.fulfill({ status: 503, body: 'Unavailable' }) }
      return route.fulfill({ json: entries.filter(entry => !entry.archived) })
    }
    if (path === 'wealth_entries') return route.fulfill({ json: entries })
    if (path === 'wealth_valuations') return route.fulfill({ json: revisions })
    if (path === 'wealth_snapshots') return route.fulfill({ json: snapshots })
    if (path === 'goals') return route.fulfill({ json: [{ id: 'retirement', name: 'Retirement', currency: 'IDR', status: 'active' }, { id: 'dollar-goal', name: 'Dollar goal', currency: 'USD', status: 'active' }] })
    if (path === 'save_wealth_entry') {
      saveRequests.push(payload.p_revision_id)
      if (failSave) { failSave = false; return route.fulfill({ status: 503, body: 'Network unavailable' }) }
      const input: WealthSaveInput = payload.p_entry
      const timestamp = new Date(Date.UTC(2026, 10, 10, 7, 0, revisions.length)).toISOString()
      const entry: CurrentWealthEntry = { ...input, user_id: user.id, archived: false, created_at: timestamp, updated_at: timestamp, revision_id: payload.p_revision_id, effective_kind: input.kind, source: input.account_id ? 'account' : 'manual', account_name: input.account_id ? 'Checking' : null, goal_name: input.goal_id ? 'Retirement' : null, amount: input.account_id ? 500 : input.amount, missing_value: !input.account_id && input.amount === null, stale: !!input.valued_on && input.valued_on < '2026-08-12', valued_on: input.account_id ? '2026-11-10' : input.valued_on }
      entries = [...entries.filter(item => item.id !== entry.id), entry]
      revisions.unshift({ id: payload.p_revision_id, entry_id: input.id, user_id: user.id, amount: input.amount, valued_on: input.valued_on, recorded_at: timestamp, request: input })
      return route.fulfill({ json: input.id })
    }
    if (path === 'archive_wealth_entry') {
      entries = entries.map(entry => entry.id === payload.p_entry_id ? { ...entry, archived: payload.p_archived } : entry)
      return route.fulfill({ json: null })
    }
    if (path === 'capture_wealth_snapshot') {
      snapshots.unshift({ id: payload.p_snapshot_id, user_id: user.id, captured_at: '2026-11-10T07:00:00Z', entries: structuredClone(entries.filter(entry => !entry.archived)), totals: wealthTotals(entries) })
      return route.fulfill({ json: payload.p_snapshot_id })
    }
    return route.fulfill({ json: path === 'accounts' ? [account] : [] })
  })

  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByRole('link', { name: 'Net worth', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load your balance sheet')
  await page.getByRole('button', { name: 'Retry balance sheet' }).click()
  await expect(page.getByRole('heading', { name: 'Start your balance sheet' })).toBeVisible()
  const addAsset = page.getByRole('button', { name: 'Add asset', exact: true })
  await addAsset.click()
  let form = page.getByRole('dialog', { name: 'Add asset', exact: true })
  await expect(form.getByLabel('Name', { exact: true })).toBeFocused()
  await form.getByLabel('Name', { exact: true }).press('Shift+Tab')
  await expect(form.getByRole('button', { name: 'Save asset', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(form.getByLabel('Name', { exact: true })).toBeFocused()
  await form.getByLabel('Name', { exact: true }).fill('Jakarta apartment')
  await form.getByRole('combobox', { name: 'Classification', exact: true }).selectOption('primary_residence')
  await form.getByLabel('Current value').fill('1000')
  await form.getByLabel('Valuation date').fill('2026-01-01')
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Could not complete')
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Jakarta apartment')
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(form).not.toBeVisible()
  expect(saveRequests[0]).toBe(saveRequests[1])
  await expect(addAsset).toBeFocused()
  const idr = page.getByRole('region', { name: 'IDR net worth', exact: true })
  await expect(idr).toContainText('1.000')
  await expect(idr).toContainText('over 90 days old')

  await page.getByRole('button', { name: 'Add liability', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Add liability', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Apartment mortgage')
  await form.getByRole('combobox', { name: 'Value source', exact: true }).selectOption('account')
  await expect(form.getByRole('combobox', { name: 'Linked account', exact: true })).toBeVisible()
  await expect(form).toContainText('absolute tracked balance is treated as outstanding debt')
  await form.getByRole('combobox', { name: 'Value source', exact: true }).selectOption('manual')
  await form.getByLabel('Outstanding balance').fill('1400')
  await form.getByLabel('Notes').fill('Remaining principal')
  await form.getByRole('button', { name: 'Save liability', exact: true }).click()
  await expect(idr).toContainText('-Rp')
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Snapshot saved')

  await page.getByRole('button', { name: 'Edit Jakarta apartment', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit asset', exact: true })
  await expect(form.getByLabel('Currency')).toBeDisabled()
  await expect(form.getByLabel('Value source')).toBeDisabled()
  await form.getByLabel('Current value').fill('2000')
  await form.getByLabel('Valuation date').fill('2026-11-10')
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(idr).toContainText('600')
  const apartment = page.getByRole('article', { name: 'Jakarta apartment', exact: true })
  await apartment.locator('summary').click()
  await expect(apartment).toContainText('Valuation history (2)')
  await expect(apartment).toContainText('1.000')
  const snapshot = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '10/11/2026' }) }).last()
  await snapshot.locator('summary').click()
  await expect(snapshot).toContainText('1.000')
  expect(snapshots[0].entries.find(entry => entry.name === 'Jakarta apartment')?.amount).toBe(1000)

  await addAsset.click()
  form = page.getByRole('dialog', { name: 'Add asset', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Bank deposito')
  await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption('deposit')
  await form.getByLabel('Currency').fill('USD')
  await form.getByLabel('Current value').fill('50.25')
  await expect(form.getByLabel('Goal earmark')).toContainText('Dollar goal')
  await expect(form.getByLabel('Goal earmark')).not.toContainText('Retirement')
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(page.getByRole('region', { name: 'USD net worth', exact: true })).toContainText('50,25')

  await addAsset.click()
  form = page.getByRole('dialog', { name: 'Add asset', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Checking holdings')
  await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption('cash')
  await form.getByRole('combobox', { name: 'Value source', exact: true }).selectOption('account')
  await form.getByRole('combobox', { name: 'Linked account', exact: true }).selectOption('checking')
  await form.getByLabel('Goal earmark').selectOption('retirement')
  await expect(form).toContainText('money held before tracking began')
  await expect(form.getByLabel('Current value')).toHaveCount(0)
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Checking holdings' })).toContainText('Earmarked for Retirement · counted once')
  await expect(idr).toContainText('1.100')
  await page.getByRole('button', { name: 'Archive Checking holdings', exact: true }).click()
  await expect(idr).toContainText('600')
  await page.getByRole('button', { name: 'Restore Checking holdings', exact: true }).click()
  await expect(idr).toContainText('1.100')

  await addAsset.click()
  form = page.getByRole('dialog', { name: 'Add asset', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Land without valuation')
  await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption('land')
  await form.getByLabel('I don’t have a valuation yet').check()
  await expect(form.getByLabel('Current value')).toHaveCount(0)
  await form.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(idr).toContainText('Partial total: 1 missing valuation')
  await page.getByRole('button', { name: 'Refresh balances', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Balances refreshed')

  await page.setViewportSize({ width: 320, height: 850 })
  for (const theme of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: `Switch to ${theme} mode` })
    if (await toggle.count()) await toggle.click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await addAsset.click()
  form = page.getByRole('dialog', { name: 'Add asset', exact: true })
  await form.getByLabel('Name', { exact: true }).fill('Unsaved entry')
  await form.getByRole('button', { name: 'Cancel', exact: true }).focus()
  await page.screenshot({ path: '/tmp/net-worth-form-mobile.png', fullPage: true })
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(addAsset).toBeFocused()
  await addAsset.press('Enter')
  await page.keyboard.press('Escape')
  await expect(addAsset).toBeFocused()
  await page.screenshot({ path: '/tmp/net-worth-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/tmp/net-worth-desktop.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

test('demo net worth labels sample property and investments', async ({ page }) => {
  await page.goto('/demo/net-worth')
  await expect(page.getByRole('heading', { name: 'Net worth', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'IDR net worth' })).toContainText('750.000.000')
  await expect(page.getByRole('article', { name: 'Sample deposito' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add asset', exact: true })).toHaveCount(0)
})
