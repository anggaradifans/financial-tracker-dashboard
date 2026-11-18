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
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await page.getByLabel('Email Address').fill(`${outcome}@example.test`)
    await page.getByRole('button', { name: 'Send Reset Link' }).click()
    await expect(page.getByText('If an account exists for this email, a password reset link will be sent.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request another link' })).toBeVisible()
    await expect(page.getByText('Account does not exist', { exact: true })).toHaveCount(0)
    expect(requests).toBeGreaterThan(0)
  })
}

test('recovery carries the email through both views and allows a corrected address', async ({ page }) => {
  const addresses: string[] = []
  await page.route('**/auth/v1/recover*', route => {
    addresses.push(route.request().postDataJSON().email)
    return route.fulfill({ json: {} })
  })

  await page.goto('/')
  const email = page.getByLabel('Email Address')
  await email.fill('typo@example.test')
  await page.getByLabel('Password', { exact: true }).fill('unsent-password')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeFocused()
  await expect(email).toHaveValue('typo@example.test')

  const send = page.getByRole('button', { name: 'Send Reset Link' })
  await send.click()
  await expect(page.getByText('If an account exists', { exact: false })).toBeVisible()
  const anotherLink = page.getByRole('button', { name: 'Request another link' })
  await expect(anotherLink).toBeFocused()
  await anotherLink.click()
  await expect(email).toBeFocused()
  await expect(send).toBeEnabled()
  expect(addresses).toEqual(['typo@example.test'])
  await email.fill('corrected@example.test')
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page.getByText('If an account exists', { exact: false })).toBeVisible()
  expect(addresses).toEqual(['typo@example.test', 'corrected@example.test'])

  await page.getByRole('button', { name: 'Back to Login' }).click()
  await expect(email).toHaveValue('corrected@example.test')
  await expect(email).toBeFocused()
  await expect(page.getByLabel('Password', { exact: true })).toBeEmpty()
})
