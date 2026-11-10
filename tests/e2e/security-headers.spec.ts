import { expect, test } from '@playwright/test'
import deployment from '../../vercel.json' with { type: 'json' }

test('the production CSP permits dashboard scripts and CSV downloads', async ({ page }) => {
  const headers = Object.fromEntries(deployment.headers[0].headers.map(({ key, value }) => [key, value]))
  await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } })
  })
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.assign(window, { securityViolations: violations })
    document.addEventListener('securitypolicyviolation', event => {
      violations.push(`${event.violatedDirective}: ${event.blockedURI}`)
    })
  })
  await page.goto('/demo/transactions')
  await expect(page.getByRole('heading', { name: 'All sample transactions' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.csv$/)
  expect(await page.evaluate(() => Reflect.get(window, 'securityViolations'))).toEqual([])
})
