import { expect, test } from '@playwright/test'

test('public demo presents sample transactions and opens its working controls', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByRole('heading', { name: 'Financial Tracker (Demo)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Explore the demo' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
  await page.getByRole('button', { name: 'Budgets', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Budget management' })).toBeVisible()
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toBeVisible()
})
