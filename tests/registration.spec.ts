import { test, expect } from '@playwright/test';

test.describe('Registration Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Go to home page
    await page.goto('/');
    
    // Switch to registration form (assuming default is login)
    // Looking for text "Don't have an account? Sign up" or similar button
    // Based on AuthFlow, likely starts with Login. 
    // Need to find the switch button. In LoginForm it would trigger onSwitchToRegister
    // Let's assume the button text is "Sign up" based on common patterns, 
    // but I'll make the selector robust.
    await page.getByRole('button', { name: /sign up/i }).click();
    
    // Verify we are on registration page
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
  });

  test('should show validation errors for empty form submission', async ({ page }) => {
    // Click submit without filling anything
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Check for validation messages
    await expect(page.getByText('First name is required')).toBeVisible();
    await expect(page.getByText('Last name is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page.getByText('Please confirm your password')).toBeVisible();
  });

  test('should validate password length and matching', async ({ page }) => {
    // Fill valid name and email
    await page.getByLabel('First Name').fill('John');
    await page.getByLabel('Last Name').fill('Doe');
    await page.getByLabel('Email Address').fill('test@example.com');

    // Short password
    await page.getByLabel('Password', { exact: true }).fill('123');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();

    // Mismatched passwords
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm Password').fill('password456');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.getByLabel('Email Address').fill('invalid-email');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Email is invalid')).toBeVisible();
  });

  test('should handle successful registration', async ({ page }) => {
    // Mock Supabase sign-up response (Email verification flow)
    // API returns the user object directly, not wrapped in 'user'.
    await page.route('**/auth/v1/signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'fake-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'newuser@example.com',
          phone: '',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { first_name: 'New', last_name: 'User' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          confirmation_sent_at: new Date().toISOString()
        })
      });
    });

    // Mock RPC call for creating telegram user record
    await page.route('**/rest/v1/rpc/create_telegram_user_record', async route => {
      // Return 200 OK with "null" or "true" body
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        body: 'null' 
      });
    });

    // Fill form with valid data
    await page.getByLabel('First Name').fill('New');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Email Address').fill('newuser@example.com');
    await page.getByLabel('Password', { exact: true }).fill('securePassword123');
    await page.getByLabel('Confirm Password').fill('securePassword123');

    // Submit
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Verify success state
    await expect(page.getByText('Registration Successful!')).toBeVisible();
    await expect(page.getByText('Please check your email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should handle registration API error', async ({ page }) => {
    // Mock Supabase error response
    await page.route('**/auth/v1/signup', async route => {
      await route.fulfill({
        status: 400, // Return 400 (Bad Request)
        contentType: 'application/json',
        body: JSON.stringify({
           // Supabase GoTrue often returns: { code: ..., msg: ..., error: ..., error_description: ... }
           // The JS client maps this. If 'msg' is present, client might use it.
           // Let's provide a standard structure.
           code: 400,
           msg: "User already exists", 
           error: "invalid_request",
           error_description: "User already exists"
        })
      });
    });

    // Fill form
    await page.getByLabel('First Name').fill('Existing');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Email Address').fill('existing@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm Password').fill('password123');

    // Submit
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Verify error message
    // The component displays the error.message. 
    // If the mock returns `msg: "User already exists"`, supabase-js usually puts that in `error.message`.
    // We check for that text.
    await expect(page.getByText('User already exists')).toBeVisible();
  });

});
