import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { projectsRoutes } from './projects.js';
import type { AppContext } from './context.js';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createTestServer(ctx: Partial<AppContext>) {
  const app = express();
  app.use(express.json());
  app.use(projectsRoutes(ctx as AppContext));
  let server: Server;
  return {
    app,
    start: () => new Promise<string>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        resolve(`http://127.0.0.1:${port}`);
      });
    }),
    stop: () => new Promise<void>((resolve) => { server?.close(() => resolve()); }),
  };
}

describe('POST /projects — title validation', () => {
  let baseUrl: string;
  let stop: () => Promise<void>;
  const mockCreate = vi.fn().mockReturnValue({
    id: 'test-abc123', name: 'Test', description: '', cwd: null,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  });
  const mockRegistry = { create: mockCreate, get: vi.fn() } as any;

  beforeAll(async () => {
    const srv = createTestServer({ projectRegistry: mockRegistry });
    baseUrl = await srv.start();
    stop = srv.stop;
  });
  afterAll(async () => { await stop?.(); });

  it('rejects missing name', async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'test' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('name is required');
  });

  it('rejects empty string name', async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('name is required');
  });

  it('rejects whitespace-only name', async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('name is required');
  });

  it('rejects name exceeding 100 characters', async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A'.repeat(101) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/100 characters/);
  });

  it('rejects name with only special characters', async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '!!!@@@###' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one letter or number/);
  });

  it('accepts valid name and trims it', async () => {
    mockCreate.mockClear();
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  My Project  ' }),
    });
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith('My Project', undefined, undefined);
  });

  it('accepts name at exactly 100 characters', async () => {
    mockCreate.mockClear();
    const name = 'A'.repeat(100);
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
  });

  it('accepts name with unicode that produces valid slug', async () => {
    mockCreate.mockClear();
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Café Project' }),
    });
    expect(res.status).toBe(201);
  });

  it('accepts the literal word "project"', async () => {
    mockCreate.mockClear();
    const res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'project' }),
    });
    expect(res.status).toBe(201);
  });
});
