import { expect, test } from '@playwright/test'

const user = { id: 'recovery-user', email: 'reader@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} }

test('an expired reset link offers a new request', async ({ page }) => {
  await page.goto('/update-password#error=access_denied&error_code=otp_expired')
  await expect(page.getByRole('heading', { name: 'Reset link unavailable' })).toBeFocused()
  await expect(page.getByLabel('New Password')).toHaveCount(0)
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled()
})

test('a recovery session can set a password, but a rejected link cannot reuse that session', async ({ page }) => {
  let updated = ''
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() === 'PUT') {
      updated = route.request().postDataJSON().password
    }
    return route.fulfill({ json: user })
  })

  await page.goto('/update-password#access_token=recovery-token&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=recovery')
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeFocused()
  const password = page.getByLabel('New Password', { exact: true })
  const confirmation = page.getByLabel('Confirm Password', { exact: true })
  await expect(page.locator('input[autocomplete=username]')).toHaveValue(user.email)
  await expect(password).toHaveAttribute('autocomplete', 'new-password')
  await expect(confirmation).toHaveAttribute('autocomplete', 'new-password')
  await password.fill('new-password-example')
  await confirmation.fill('typo-password-example')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await expect(confirmation).toBeFocused()
  await expect(confirmation).toHaveAccessibleDescription(/passwords don’t match/)
  expect(updated).toBe('')

  await confirmation.fill('new-password-example')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Continue to dashboard' })).toHaveAttribute('href', '/dashboard')
  expect(updated).toBe('new-password-example')

  await page.goto('/update-password?error_code=otp_expired')
  await expect(page.getByRole('heading', { name: 'Reset link unavailable' })).toBeVisible()
  await expect(page.getByLabel('New Password')).toHaveCount(0)
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
})

test('registration sends the entered profile and offers email confirmation help', async ({ page }) => {
  let profile: unknown
  await page.route('**/auth/v1/signup*', route => {
    profile = route.request().postDataJSON()
    return route.fulfill({ json: { ...user, identities: [{ id: 'identity' }] } })
  })

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByLabel('First Name').fill('Ari')
  await page.getByLabel('Last Name').fill('Putra')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill('registration-password')
  await page.getByLabel('Confirm Password').fill('registration-password')
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeFocused()
  expect(profile).toMatchObject({ email: user.email, data: { first_name: 'Ari', last_name: 'Putra' } })

  await page.getByRole('button', { name: 'Back to Sign In' }).click()
  await expect(page.getByLabel('Email Address')).toBeFocused()
  await expect(page.getByLabel('Email Address')).toHaveValue(user.email)
})
