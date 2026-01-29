import { expect, test } from '@playwright/test';

test('loads the home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('NavHub - AI 智能导航仪');
  await expect(page.locator('header input[type="text"]')).toBeVisible();
});

test('opens and closes settings modal', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('系统设置').click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeHidden();
});
