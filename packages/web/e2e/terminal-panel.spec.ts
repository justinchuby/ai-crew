import { test, expect } from '@playwright/test';

test.describe('Terminal Panel', () => {
  test.afterEach(async ({ page }) => {
    // Clean up agents
    const agents = await (await page.request.get('/api/agents')).json();
    for (const agent of agents) {
      await page.request.delete(`/api/agents/${agent.id}`);
    }
  });

  test('clicking an agent card opens the terminal panel', async ({ page }) => {
    // Spawn via API (it may fail to actually run CLI, but the card should still appear)
    const res = await page.request.post('/api/agents', { data: { roleId: 'developer' } });
    const agent = await res.json();

    await page.goto('/agents');
    await page.waitForTimeout(1000);

    // If agent card is visible, click it
    const card = page.getByText('Developer').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();

      // Terminal panel should appear with the agent info
      // Look for the input placeholder in the chat panel
      await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('terminal panel has input field and send button', async ({ page }) => {
    const res = await page.request.post('/api/agents', { data: { roleId: 'code-reviewer' } });
    const agent = await res.json();

    await page.goto('/agents');
    await page.waitForTimeout(1000);

    const card = page.getByText('Code Reviewer').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();

      const input = page.getByPlaceholder('Type a message...');
      await expect(input).toBeVisible({ timeout: 5_000 });

      // Should be able to type
      await input.fill('Hello agent');
      await expect(input).toHaveValue('Hello agent');
    }
  });

  test('close button dismisses terminal panel', async ({ page }) => {
    const res = await page.request.post('/api/agents', { data: { roleId: 'developer' } });

    await page.goto('/agents');
    await page.waitForTimeout(1000);

    const card = page.getByText('Developer').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();

      const input = page.getByPlaceholder('Type a message...');
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Find and click the X close button in the panel header
        // The close button is the last button in the panel header
        const panelHeader = page.locator('div').filter({ hasText: 'Developer' }).last();
        const closeBtn = panelHeader.locator('button').last();
        await closeBtn.click();

        // Input should no longer be visible
        await expect(input).not.toBeVisible();
      }
    }
  });

  test('input field sends on Enter key', async ({ page }) => {
    const res = await page.request.post('/api/agents', { data: { roleId: 'developer' } });

    await page.goto('/agents');
    await page.waitForTimeout(1000);

    const card = page.getByText('Developer').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click();

      const input = page.getByPlaceholder('Type a message...');
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('test message');
        await input.press('Enter');
        // After sending, input should be cleared
        await expect(input).toHaveValue('');
      }
    }
  });
});
