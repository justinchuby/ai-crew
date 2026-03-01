import { test, expect } from '@playwright/test';

test.describe('Coordination & Connection', () => {
  test('connection status shows Connected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 });
  });

  test('connection indicator has green dot when connected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10_000 });
    // Green dot should be visible (bg-green-400 class)
    const dot = page.locator('.bg-green-400');
    await expect(dot).toBeVisible();
  });

  test('shows agent count in header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/\d+ agents/)).toBeVisible();
  });

  test('coordination status API returns valid data', async ({ page }) => {
    const res = await page.request.get('/api/coordination/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('agents');
    expect(data).toHaveProperty('locks');
    expect(data).toHaveProperty('recentActivity');
    expect(Array.isArray(data.agents)).toBeTruthy();
    expect(Array.isArray(data.locks)).toBeTruthy();
  });

  test('file lock API works end-to-end', async ({ page }) => {
    // Acquire a lock
    const acquireRes = await page.request.post('/api/coordination/locks', {
      data: { agentId: 'test-agent-1', filePath: 'src/main.ts', reason: 'editing' },
    });
    expect(acquireRes.ok()).toBeTruthy();
    const lockResult = await acquireRes.json();
    expect(lockResult.ok).toBeTruthy();

    // Verify lock appears in list
    const locksRes = await page.request.get('/api/coordination/locks');
    const locks = await locksRes.json();
    expect(locks.some((l: any) => l.filePath === 'src/main.ts')).toBeTruthy();

    // Try to acquire same lock with different agent — should fail
    const conflictRes = await page.request.post('/api/coordination/locks', {
      data: { agentId: 'test-agent-2', filePath: 'src/main.ts', reason: 'also editing' },
    });
    const conflictResult = await conflictRes.json();
    expect(conflictResult.ok).toBeFalsy();
    expect(conflictResult.holder).toBe('test-agent-1');

    // Release the lock via query param
    const releaseRes = await page.request.delete(
      `/api/coordination/locks/${encodeURIComponent('src/main.ts')}?agentId=test-agent-1`,
    );
    expect(releaseRes.ok()).toBeTruthy();

    // Verify lock is gone
    const locksAfterRes = await page.request.get('/api/coordination/locks');
    const locksAfter = await locksAfterRes.json();
    expect(locksAfter.some((l: any) => l.filePath === 'src/main.ts')).toBeFalsy();
  });

  test('activity API returns data', async ({ page }) => {
    const res = await page.request.get('/api/coordination/activity');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('coordination summary API returns aggregated data', async ({ page }) => {
    const res = await page.request.get('/api/coordination/summary');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('totalActions');
    expect(data).toHaveProperty('byAgent');
    expect(data).toHaveProperty('byType');
  });

  test('health endpoint returns status', async ({ page }) => {
    // /health is not proxied by Vite, hit the server directly
    const res = await page.request.get('http://localhost:3001/health');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.agents).toBe('number');
  });
});
