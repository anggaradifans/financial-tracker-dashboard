import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test('log in, load transactions, add one, and see it', async ({ page }) => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required')

  const description = `E2E transaction ${Date.now()}`

  await page.goto('/')
  await page.getByLabel('Email Address').fill(email!)
  await page.getByLabel('Password', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Financial Tracker' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click()
  const form = page.locator('form')
  await form.getByLabel('Amount').fill('1')
  await form.getByLabel('Category').selectOption({ index: 1 })
  await form.getByLabel('Description (Optional)').fill(description)
  await form.getByRole('button', { name: 'Add Transaction', exact: true }).click()

  await expect(page.getByText(description, { exact: true }).first()).toBeVisible()
})
