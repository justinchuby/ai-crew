import { test, expect } from '@playwright/test';

test.describe('AI Crew Smoke Tests', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('AI Crew');
  });

  test('sidebar navigation works', async ({ page }) => {
    await page.goto('/');
    // Should start on Agents page
    await expect(page.locator('h2')).toHaveText('Agents');

    // Navigate to Tasks
    await page.click('a[title="Tasks"]');
    await expect(page.locator('h2')).toHaveText('Task Queue');

    // Navigate to Settings
    await page.click('a[title="Settings"]');
    await expect(page.locator('h2')).toHaveText('Settings');

    // Navigate back to Agents
    await page.click('a[title="Agents"]');
    await expect(page.locator('h2')).toHaveText('Agents');
  });

  test('shows connection status indicator', async ({ page }) => {
    await page.goto('/');
    // Should show connected status (green dot or text)
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 });
  });

  test('shows empty state when no agents', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No agents running')).toBeVisible();
    await expect(page.getByText('Spawn an agent to get started')).toBeVisible();
  });
});
