import { expect, test } from '@playwright/test'

test('public demo loads and opens the transaction form', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByRole('heading', { name: 'Financial Tracker (Demo)' })).toBeVisible()
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add Transaction' })).toBeVisible()
})
