import { expect, test } from '@playwright/test'

test('sign-in keeps keyboard focus and announces progress and a recoverable error', async ({ page }) => {
  const response = Promise.withResolvers<void>()
  let attempts = 0
  await page.route('**/auth/v1/token*', async route => {
    attempts += 1
    await response.promise
    return route.fulfill({
      status: 400,
      json: { msg: 'Invalid login credentials', error_code: 'invalid_credentials' },
    })
  })

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByText('Financial Tracker', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  const email = page.getByLabel('Email Address')
  const password = page.getByLabel('Password', { exact: true })
  const reveal = page.getByRole('button', { name: 'Show password' })
  const forgot = page.getByRole('button', { name: 'Forgot password?' })
  const signUp = page.getByRole('button', { name: 'Sign up' })
  for (const control of [reveal, forgot, signUp]) {
    const bounds = await control.boundingBox()
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
  }

  await email.fill('reader@example.test')
  await email.press('Tab')
  await expect(password).toBeFocused()
  await password.fill('incorrect-password')
  await password.press('Tab')
  await expect(reveal).toBeFocused()
  await reveal.press('Enter')
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).press('Tab')
  await expect(forgot).toBeFocused()
  await forgot.press('Tab')

  const submit = page.getByRole('button', { name: 'Sign In', exact: true })
  await expect(submit).toBeFocused()
  await submit.press('Enter')
  await expect(submit).toHaveText('Signing in…')
  await expect(submit).toBeFocused()
  await expect(submit).toBeDisabled()
  await expect(page.getByRole('status')).toHaveText('Signing in…')
  await submit.press('Enter')
  response.resolve()

  await expect(page.getByRole('alert')).toContainText('Check your details and try again.')
  await expect(submit).toBeFocused()
  await expect(email).toHaveValue('reader@example.test')
  expect(attempts).toBe(1)
  await expect(page.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/demo')

  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page).toHaveURL(/view=reset/)
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeFocused()
  await expect(email).toHaveValue('reader@example.test')
  await email.fill('corrected@example.test')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(email).toHaveValue('corrected@example.test')
  await expect(email).toBeFocused()
})
