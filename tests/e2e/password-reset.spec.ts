import { expect, test } from '@playwright/test'

for (const outcome of ['known', 'unknown', 'api-error', 'network-error']) {
  test(`password reset gives the same response for ${outcome}`, async ({ page }) => {
    let requests = 0
    await page.route('**/auth/v1/recover*', async route => {
      requests += 1
      if (outcome === 'network-error') return route.abort()
      await route.fulfill({
        status: outcome === 'api-error' ? 400 : 200,
        contentType: 'application/json',
        body: outcome === 'api-error' ? JSON.stringify({ msg: 'Account does not exist', error_code: 'user_not_found' }) : '{}',
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /forgot/i }).click()
    await page.getByLabel('Email Address').fill(`${outcome}@example.test`)
    await page.getByRole('button', { name: 'Send Reset Link' }).click()
    await expect(page.getByText('If an account exists for this email, a password reset link will be sent.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeDisabled()
    await expect(page.getByText('Account does not exist', { exact: true })).toHaveCount(0)
    expect(requests).toBeGreaterThan(0)
  })
}
