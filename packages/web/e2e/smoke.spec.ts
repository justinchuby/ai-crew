import { test, expect } from '@playwright/test';

test.describe('Flightdeck Smoke Tests', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Flightdeck');
  });

  test('sidebar navigation works', async ({ page }) => {
    await page.goto('/');

    // Navigate to Agents
    await page.locator('nav a[href="/agents"]').click();
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole('button', { name: /Spawn Agent/i })).toBeVisible({ timeout: 5000 });

    // Navigate to Settings
    await page.locator('nav a[href="/settings"]').click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('h2')).toHaveText('Settings');
  });

  test('shows connection status indicator', async ({ page }) => {
    await page.goto('/');
    // Should show connected status (green dot or text)
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 });
  });
});
