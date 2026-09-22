import { expect, test } from '@playwright/test'

test('public demo navigates between its financial sections', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page).toHaveURL(/\/demo\/analytics$/)
  await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/demo\/settings$/)
  await expect(page.getByRole('heading', { name: 'Sample accounts and categories' })).toBeVisible()
})

test('public demo opens the transaction form from its global action', async ({ page }) => {
  await page.goto('/demo/transactions')

  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toBeVisible()
})

test('public demo exposes section navigation in a mobile drawer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/demo')

  await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('complementary', { name: 'Dashboard navigation' })
  await expect(navigation.getByRole('link', { name: 'Budgets', exact: true })).toBeVisible()
  await navigation.getByRole('link', { name: 'Budgets', exact: true }).click()
  await expect(page).toHaveURL(/\/demo\/budgets$/)
  await expect(page.getByRole('heading', { name: 'Budgets', exact: true })).toBeVisible()
})
