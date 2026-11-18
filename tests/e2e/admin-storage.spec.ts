import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function signIn(page: import('@playwright/test').Page, admin = true) {
  const user = { id: 'storage-admin', email: 'admin@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { role: admin ? 'admin' : 'user' }, user_metadata: {} }
  await page.route('**/auth/v1/**', route => route.fulfill({ json: { access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, user } }))
  await page.route('**/rest/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/is_storage_admin')) return route.fulfill({ json: admin })
    if (path.endsWith('/admin_storage_status')) return route.fulfill({ json: {
      database_bytes: 362000000, limit_bytes: 500000000, measured_at: '2026-11-18T07:00:00Z',
      samples: Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 5).padStart(2, '0')}`, measured_at: '', database_bytes: 310000000 + i * 4000000 })),
      tables: [ { name: 'public.transactions', rows: 128430, total_bytes: 240000000, index_bytes: 64000000 }, { name: 'auth.audit_log_entries', rows: 38200, total_bytes: 42000000, index_bytes: 8000000 }, { name: 'public.accounts', rows: 12, total_bytes: 48000, index_bytes: 32000 } ],
    } })
    if (path.endsWith('/admin_export_financial_records')) return route.fulfill({ json: JSON.stringify({ format_version: 1, transactions: [{ id: 'original-id', amount: 123.45, transfer_id: 'pair-id' }], accounts: [], categories: [] }) })
    return route.fulfill({ json: [] })
  })
  await page.goto('/')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).toHaveURL(/dashboard/)
  await page.goto('/admin/storage')
}

test('admin storage: responsive monitoring, download and error recovery', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Capacity', exact: true })).toBeVisible()
  await expect(page.getByText('35 days', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '72')
  await mkdir('.impeccable/review', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(350)
  await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true, animations: 'disabled' })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download financial records' }).click()
  expect((await download).suggestedFilename()).toMatch(/^financial-records-.*\.json$/)
  await expect(page.getByRole('status').filter({ hasText: 'Download requested' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(350)
  await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const totalSize = await page.getByRole('cell', { name: '240 MB', exact: true }).boundingBox()
  expect(totalSize!.x + totalSize!.width).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  await page.route('**/rest/v1/rpc/admin_storage_status', route => route.fulfill({ status: 503, json: { message: 'unavailable' } }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByRole('alert')).toContainText('Showing the previous measurement')
  await page.route('**/rest/v1/rpc/admin_export_financial_records', route => route.fulfill({ status: 400, json: { message: 'More than 10,000 transactions. Use a PostgreSQL dump for a complete backup.' } }))
  await page.getByRole('button', { name: 'Download financial records' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '10,000' })).toBeVisible()
})

test('ordinary users cannot load metrics by opening the admin URL', async ({ page }) => {
  let requestedMetrics = false
  page.on('request', request => { if (request.url().includes('/admin_storage_status')) requestedMetrics = true })
  await signIn(page, false)
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
  expect(requestedMetrics).toBe(false)
  await expect(page.getByRole('button', { name: 'Download financial records' })).toHaveCount(0)
})

test('empty history does not invent a growth forecast', async ({ page }) => {
  await signIn(page)
  await page.route('**/rest/v1/rpc/admin_storage_status', route => route.fulfill({ json: { database_bytes: 52000000, limit_bytes: 500000000, measured_at: new Date().toISOString(), samples: [{ day: '2026-11-18', database_bytes: 52000000 }], tables: [] } }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByText('Your first measurement is recorded.')).toBeVisible()
  await expect(page.getByText('Not enough data', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(350)
  await page.screenshot({ path: '.impeccable/review/mobile-empty-dark.png', fullPage: true, animations: 'disabled' })
})

test('missing migration shows setup guidance and retries without granting access', async ({ page }) => {
  await signIn(page)
  await page.route('**/rest/v1/rpc/is_storage_admin', route => route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'function not found' } }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Admin storage is not set up')
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download financial records' })).toHaveCount(0)
  await page.route('**/rest/v1/rpc/is_storage_admin', route => route.fulfill({ json: true }))
  await page.getByRole('button', { name: 'Retry access check' }).click()
  await expect(page.getByRole('heading', { name: 'Capacity', exact: true })).toBeVisible()
})

test('failed access check does not misidentify an administrator as denied', async ({ page }) => {
  await signIn(page)
  await page.route('**/rest/v1/rpc/is_storage_admin', route => route.fulfill({ status: 503, json: { code: 'unavailable', message: 'unavailable' } }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Administrator access could not be checked')
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download financial records' })).toHaveCount(0)
})

test('capacity displays combined usage with two decimals and refreshes the live value', async ({ page }) => {
  await signIn(page)
  let databaseBytes = 31_790_000
  await page.route('**/rest/v1/rpc/admin_storage_status', route => route.fulfill({ json: {
    database_bytes: databaseBytes, limit_bytes: 500000000, measurement_scope: 'all_databases',
    measured_at: new Date().toISOString(), samples: [], tables: [],
  } }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByText('31.79 MB', { exact: false })).toBeVisible()
  await expect(page.getByText('Includes all databases in this project', { exact: false })).toBeVisible()
  databaseBytes = 31_810_000
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(page.getByText('31.81 MB', { exact: false })).toBeVisible()
})

test('storage tables paginate without skipping rows and reset after refresh', async ({ page }) => {
  await signIn(page)
  let tableCount = 23
  await page.route('**/rest/v1/rpc/admin_storage_status', route => route.fulfill({ json: {
    database_bytes: 31790000, limit_bytes: 500000000, measured_at: new Date().toISOString(), samples: [],
    tables: Array.from({ length: tableCount }, (_, i) => ({
      name: `public.table_${String(i + 1).padStart(2, '0')}`, rows: 100 - i,
      total_bytes: 1000000 - i * 1000, index_bytes: 100000,
    })),
  } }))
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  const section = page.getByRole('region', { name: 'Where storage goes' })
  const pagination = page.getByRole('navigation', { name: 'Storage table pagination' })
  await expect(section.getByRole('row')).toHaveCount(11)
  await expect(section.getByText('Showing 1–10 of 23 tables')).toBeVisible()
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await section.screenshot({ path: '.impeccable/review/storage-pagination-desktop.png' })
  await pagination.getByRole('button', { name: 'Next' }).click()
  await expect(section.getByRole('rowheader', { name: 'public.table_11', exact: true })).toBeVisible()
  await expect(section.getByRole('rowheader', { name: 'public.table_01', exact: true })).toHaveCount(0)
  await expect(section.getByText('Showing 11–20 of 23 tables')).toBeVisible()
  await pagination.getByRole('button', { name: 'Next' }).click()
  await expect(section.getByRole('row')).toHaveCount(4)
  await expect(section.getByText('Showing 21–23 of 23 tables')).toBeVisible()
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await section.screenshot({ path: '.impeccable/review/storage-pagination-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await pagination.getByRole('button', { name: 'Previous' }).click()
  await expect(section.getByText('Showing 11–20 of 23 tables')).toBeVisible()
  tableCount = 3
  await page.getByRole('button', { name: 'Refresh usage' }).click()
  await expect(section.getByText('Showing 1–3 of 3 tables')).toBeVisible()
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled()
})
