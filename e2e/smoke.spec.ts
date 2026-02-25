import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('navhub-language', 'en-US');
    } catch {
      // Ignore
    }
  });
});

test('loads the home page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('NavHub - AI Smart Navigator');
  await expect(page.locator('header input[type="text"]')).toBeVisible();
});

test('opens and closes settings modal', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('System settings').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();
});
