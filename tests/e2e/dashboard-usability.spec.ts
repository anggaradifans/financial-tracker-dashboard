import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Jakarta' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-21T14:30:00+07:00'))
  await page.goto('/demo')
})

test('custom dates validate inline, include the full end day, and return focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Custom Range' }).click()
  await page.getByLabel('Start Date', { exact: true }).fill('2026-09-17')
  await page.getByLabel('End Date', { exact: true }).fill('2026-09-16')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('End date must be on or after the start date.')
  await expect(page.getByLabel('Start Date', { exact: true })).toHaveValue('2026-09-17')
  await page.getByLabel('Start Date', { exact: true }).fill('2026-09-16')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Custom Range' })).toBeFocused()
  await expect(page.getByRole('region', { name: 'Reporting period' })).toContainText('Sep 16, 2026')
  await page.getByRole('textbox', { name: 'Search transactions' }).fill('Freelance Project')
  await expect(page.getByRole('cell', { name: 'Freelance Project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Custom Range' }).click()
  await page.getByLabel('Start Date', { exact: true }).press('Escape')
  await expect(page.getByRole('button', { name: 'Custom Range' })).toBeFocused()
  await expect(page.getByLabel('Start Date', { exact: true })).toHaveCount(0)
})

test('table sorting works with keyboard and empty search has an accurate count', async ({ page }) => {
  const amountSort = page.getByRole('button', { name: 'Sort by amount' })
  await amountSort.press('Enter')
  await expect(page.getByRole('columnheader').filter({ has: amountSort })).toHaveAttribute('aria-sort', 'descending')
  await amountSort.press('Enter')
  await expect(page.getByRole('columnheader').filter({ has: amountSort })).toHaveAttribute('aria-sort', 'ascending')
  await page.getByRole('textbox', { name: 'Search transactions' }).fill('No matching test transaction')
  await expect(page.getByText('Showing 0 to 0 of 0')).toBeVisible()
  await expect(page.getByText('No transactions match your filters.').filter({ visible: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('textbox', { name: 'Search transactions' })).toHaveValue('')
  await expect(page.getByText('Showing 0 to 0 of 0')).toHaveCount(0)
})

test('custom date controls fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.getByRole('button', { name: 'Custom Range' }).click()
  await expect(page.getByLabel('Start Date', { exact: true })).toBeVisible()
  await expect(page.getByLabel('End Date', { exact: true })).toBeVisible()
  const period = page.getByRole('region', { name: 'Reporting period' })
  const bounds = await period.boundingBox()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  for (const name of ['Start Date', 'End Date']) {
    const field = await page.getByLabel(name, { exact: true }).boundingBox()
    expect(field!.x).toBeGreaterThanOrEqual(0)
    expect(field!.x + field!.width).toBeLessThanOrEqual(320)
  }
})

test('transaction dialog contains keyboard focus and returns it when dismissed', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Add Transaction', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Add Transaction' })
  const close = dialog.getByRole('button', { name: 'Close form' })
  await expect(close).toBeFocused()
  await close.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Add Transaction', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
