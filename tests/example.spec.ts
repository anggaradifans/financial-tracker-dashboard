import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Financial Tracker/);
});

test('get started link', async ({ page }) => {
  await page.goto('/');

  // Check if root element exists
  await expect(page.locator('#root')).toBeVisible();
});
