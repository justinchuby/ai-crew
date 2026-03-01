import { test, expect } from '@playwright/test';

test.describe('Error States & Edge Cases', () => {
  test.afterEach(async ({ page }) => {
    const agents = await (await page.request.get('/api/agents')).json();
    for (const agent of agents) {
      await page.request.delete(`/api/agents/${agent.id}`);
    }
  });

  test('spawning agent with invalid role returns 400', async ({ page }) => {
    const res = await page.request.post('/api/agents', {
      data: { roleId: 'nonexistent-role', task: 'test' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unknown role');
  });

  test('killing non-existent agent returns gracefully', async ({ page }) => {
    const res = await page.request.delete('/api/agents/fake-agent-id-12345');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('sending input to non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/input', {
      data: { text: 'hello' },
    });
    expect(res.status()).toBe(404);
  });

  test('cannot delete built-in roles', async ({ page }) => {
    const res = await page.request.delete('/api/roles/developer');
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test('lock release by wrong agent fails', async ({ page }) => {
    await page.request.post('/api/coordination/locks', {
      data: { agentId: 'owner-agent', filePath: 'locked.ts', reason: 'mine' },
    });

    await page.request.delete(
      `/api/coordination/locks/${encodeURIComponent('locked.ts')}?agentId=other-agent`
    );
    const locks = await (await page.request.get('/api/coordination/locks')).json();
    const lock = locks.find((l: any) => l.filePath === 'locked.ts');
    expect(lock).toBeTruthy();
    expect(lock.agentId).toBe('owner-agent');

    await page.request.delete(`/api/coordination/locks/${encodeURIComponent('locked.ts')}?agentId=owner-agent`);
  });

  test('double-creating same lock by same agent refreshes TTL', async ({ page }) => {
    await page.request.post('/api/coordination/locks', {
      data: { agentId: 'agent-1', filePath: 'refresh.ts', reason: 'first' },
    });

    const res = await page.request.post('/api/coordination/locks', {
      data: { agentId: 'agent-1', filePath: 'refresh.ts', reason: 'refreshed' },
    });
    const body = await res.json();
    expect(body.ok).toBeTruthy();

    await page.request.delete(`/api/coordination/locks/${encodeURIComponent('refresh.ts')}?agentId=agent-1`);
  });

  test('config update persists and returns updated values', async ({ page }) => {
    const original = await (await page.request.get('/api/config')).json();

    const res = await page.request.patch('/api/config', {
      data: { maxConcurrentAgents: 15 },
    });
    const updated = await res.json();
    expect(updated.maxConcurrentAgents).toBe(15);

    await page.request.patch('/api/config', {
      data: { maxConcurrentAgents: original.maxConcurrentAgents },
    });
  });

  test('health endpoint always returns ok', async ({ page }) => {
    const res = await page.request.get('http://localhost:3001/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.agents).toBe('number');
  });

  test('permission endpoint for non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/permission', {
      data: { approved: true },
    });
    expect(res.status()).toBe(404);
  });

  test('restart non-existent agent returns 404', async ({ page }) => {
    const res = await page.request.post('/api/agents/fake-id/restart');
    expect(res.status()).toBe(404);
  });
});
