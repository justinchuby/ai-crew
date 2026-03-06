import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubIntegrationService,
  type GitHubConnection,
  type PullRequest,
  type CICheck,
  type CommitTaskLink,
} from '../coordination/GitHubIntegrationService.js';

// ── Mock Helpers ──────────────────────────────────────────────────

function createMockDb() {
  const settings = new Map<string, string>();
  return {
    getSetting: vi.fn((key: string) => settings.get(key) ?? null),
    setSetting: vi.fn((key: string, val: string) => { settings.set(key, val); }),
    drizzle: {} as any,
    raw: {} as any,
  };
}

/** Build a fake GitHub API Response */
function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}): Response {
  const h = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function repoResponse(overrides: Record<string, any> = {}) {
  return jsonResponse(
    { default_branch: 'main', full_name: 'owner/repo', ...overrides },
    200,
    { 'x-oauth-scopes': 'repo, workflow, read:org, read:user' },
  );
}

function prCreatedResponse(prNumber = 42) {
  return jsonResponse({
    number: prNumber,
    title: 'My PR',
    body: 'Description',
    draft: false,
    html_url: `https://github.com/owner/repo/pull/${prNumber}`,
    head: { sha: 'abc1234567890' },
  }, 201);
}

function checkRunsResponse(checks: Partial<CICheck>[] = []) {
  return jsonResponse({
    total_count: checks.length,
    check_runs: checks.map(c => ({
      name: c.name ?? 'build',
      status: c.status ?? 'completed',
      conclusion: c.conclusion ?? 'success',
      html_url: c.url ?? 'https://github.com/check/1',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:00Z',
    })),
  });
}

// ── Shared State ──────────────────────────────────────────────────

let db: ReturnType<typeof createMockDb>;
let fetchSpy: ReturnType<typeof vi.fn>;

async function connectService(svc: GitHubIntegrationService) {
  fetchSpy.mockResolvedValueOnce(repoResponse());
  return svc.connect('ghp_abcdefgh12345678', 'owner', 'repo');
}

beforeEach(() => {
  db = createMockDb();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Connection Management ────────────────────────────────────────

describe('GitHubIntegrationService — Connection', () => {
  it('getConnection returns null when not connected', () => {
    const svc = new GitHubIntegrationService(db as any);
    expect(svc.getConnection()).toBeNull();
  });

  it('isConnected returns false when not connected', () => {
    const svc = new GitHubIntegrationService(db as any);
    expect(svc.isConnected()).toBe(false);
  });

  it('connect succeeds and returns sanitized connection', async () => {
    const svc = new GitHubIntegrationService(db as any);
    const conn = await connectService(svc);

    expect(conn.status).toBe('connected');
    expect(conn.owner).toBe('owner');
    expect(conn.repo).toBe('repo');
    expect(conn.defaultBranch).toBe('main');
    expect(conn.provider).toBe('github');
    expect(conn.id).toMatch(/^gh-/);
    // Token must NOT be in the returned connection
    expect((conn as any).token).toBeUndefined();
    expect(conn.tokenMasked).toBe('ghp_...5678');
  });

  it('connect persists connection to db', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    expect(db.setSetting).toHaveBeenCalledWith('github_connection', expect.any(String));
    const stored = JSON.parse(db.setSetting.mock.calls.find((c: any) => c[0] === 'github_connection')![1]);
    expect(stored.token).toBe('ghp_abcdefgh12345678');
    expect(stored.status).toBe('connected');
  });

  it('connect parses permissions from scope header', async () => {
    const svc = new GitHubIntegrationService(db as any);
    const conn = await connectService(svc);
    expect(conn.permissions).toEqual(['repo', 'workflow', 'read:org', 'read:user']);
  });

  it('connect throws on API failure', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
    const svc = new GitHubIntegrationService(db as any);
    await expect(svc.connect('bad_token', 'owner', 'repo')).rejects.toThrow('GitHub connection failed');
  });

  it('connect throws on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failed'));
    const svc = new GitHubIntegrationService(db as any);
    await expect(svc.connect('ghp_token1234567890', 'owner', 'repo')).rejects.toThrow('Network failed');
  });

  it('disconnect clears connection', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    svc.disconnect();

    expect(svc.getConnection()).toBeNull();
    expect(svc.isConnected()).toBe(false);
  });

  it('testConnection returns connected true when API responds OK', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(repoResponse());
    const result = await svc.testConnection();
    expect(result.connected).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('testConnection returns error when API returns 401', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401));
    const result = await svc.testConnection();
    expect(result.connected).toBe(false);
    expect(result.error).toContain('401');
  });

  it('testConnection returns error when no connection exists', async () => {
    const svc = new GitHubIntegrationService(db as any);
    const result = await svc.testConnection();
    expect(result.connected).toBe(false);
    expect(result.error).toContain('No connection');
  });

  it('testConnection marks connection as error on network failure', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockRejectedValueOnce(new Error('Timeout'));
    const result = await svc.testConnection();
    expect(result.connected).toBe(false);
    expect(svc.isConnected()).toBe(false);
  });
});

// ── Token Masking ────────────────────────────────────────────────

describe('GitHubIntegrationService — Token Masking', () => {
  it('masks token showing first 4 and last 4 chars', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    const conn = svc.getConnection()!;
    expect(conn.tokenMasked).toBe('ghp_...5678');
  });

  it('masks short tokens as ****', async () => {
    fetchSpy.mockResolvedValueOnce(repoResponse());
    const svc = new GitHubIntegrationService(db as any);
    const conn = await svc.connect('short', 'owner', 'repo');
    expect(conn.tokenMasked).toBe('****');
  });
});

// ── sanitizeConnection ───────────────────────────────────────────

describe('GitHubIntegrationService — sanitizeConnection', () => {
  it('never exposes raw token', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    const conn = svc.getConnection()!;

    expect(conn).not.toHaveProperty('token');
    expect(conn.tokenMasked).toBeTruthy();
    expect(JSON.stringify(conn)).not.toContain('ghp_abcdefgh12345678');
  });
});

// ── Pull Requests ────────────────────────────────────────────────

describe('GitHubIntegrationService — Pull Requests', () => {
  it('getPulls returns empty array initially', () => {
    const svc = new GitHubIntegrationService(db as any);
    expect(svc.getPulls()).toEqual([]);
  });

  it('createPR creates and stores a PR', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(42));
    const pr = await svc.createPR({
      title: 'My PR',
      description: 'Description',
      branch: 'feature/x',
      baseBranch: 'main',
    });

    expect(pr.number).toBe(42);
    expect(pr.title).toBe('My PR');
    expect(pr.status).toBe('open');
    expect(pr.branch).toBe('feature/x');
    expect(pr.baseBranch).toBe('main');
    expect(pr.id).toMatch(/^gh-/);
    expect(svc.getPulls()).toHaveLength(1);
  });

  it('createPR sets status to draft when API response says draft', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(jsonResponse({
      number: 10,
      title: 'Draft PR',
      body: '',
      draft: true,
      html_url: 'https://github.com/owner/repo/pull/10',
    }, 201));

    const pr = await svc.createPR({
      title: 'Draft PR',
      description: '',
      branch: 'feat/y',
      baseBranch: 'main',
      draft: true,
    });

    expect(pr.status).toBe('draft');
  });

  it('createPR throws when not connected', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await expect(svc.createPR({
      title: 'x',
      description: '',
      branch: 'b',
      baseBranch: 'main',
    })).rejects.toThrow('Not connected');
  });

  it('createPR throws on API error', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Validation Failed' }, 422));
    await expect(svc.createPR({
      title: 'x',
      description: '',
      branch: 'b',
      baseBranch: 'main',
    })).rejects.toThrow('Failed to create PR');
  });

  it('getPull returns a specific PR by number', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(7));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    expect(svc.getPull(7)?.number).toBe(7);
    expect(svc.getPull(999)).toBeUndefined();
  });

  it('markReady changes status from draft to open', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    // Create a draft PR
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      number: 5,
      title: 'Draft',
      body: '',
      draft: true,
      html_url: 'https://github.com/owner/repo/pull/5',
    }, 201));
    await svc.createPR({ title: 'Draft', description: '', branch: 'b', baseBranch: 'main', draft: true });
    expect(svc.getPull(5)?.status).toBe('draft');

    // Mark ready
    fetchSpy.mockResolvedValueOnce(jsonResponse({ number: 5, draft: false }, 200));
    const pr = await svc.markReady(5);
    expect(pr?.status).toBe('open');
  });

  it('markReady returns undefined for unknown PR', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    const result = await svc.markReady(999);
    expect(result).toBeUndefined();
  });

  it('refreshPR updates PR data from GitHub', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(3));
    await svc.createPR({ title: 'Old Title', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockResolvedValueOnce(jsonResponse({
      number: 3,
      title: 'New Title',
      body: 'Updated description',
      draft: false,
      merged: false,
      state: 'open',
    }));

    const pr = await svc.refreshPR(3);
    expect(pr?.title).toBe('New Title');
    expect(pr?.description).toBe('Updated description');
  });

  it('refreshPR detects merged status', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(4));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockResolvedValueOnce(jsonResponse({
      number: 4,
      title: 'PR',
      body: '',
      draft: false,
      merged: true,
      state: 'closed',
    }));

    const pr = await svc.refreshPR(4);
    expect(pr?.status).toBe('merged');
  });

  it('prunes pulls to MAX (50) entries', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    for (let i = 0; i < 55; i++) {
      fetchSpy.mockResolvedValueOnce(jsonResponse({
        number: i,
        title: `PR ${i}`,
        body: '',
        draft: false,
        html_url: `https://github.com/owner/repo/pull/${i}`,
      }, 201));
      await svc.createPR({ title: `PR ${i}`, description: '', branch: `b${i}`, baseBranch: 'main' });
    }

    expect(svc.getPulls().length).toBeLessThanOrEqual(50);
  });
});

// ── CI Status ────────────────────────────────────────────────────

describe('GitHubIntegrationService — CI Status', () => {
  it('getChecks returns checks for a PR', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(1));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    // getChecks: first fetch PR to get head SHA, then fetch check-runs
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      number: 1,
      head: { sha: 'abc123def456' },
    }));
    fetchSpy.mockResolvedValueOnce(checkRunsResponse([
      { name: 'build', status: 'completed', conclusion: 'success' },
      { name: 'test', status: 'completed', conclusion: 'failure' },
    ]));

    const checks = await svc.getChecks(1);
    expect(checks).toHaveLength(2);
    expect(checks[0].name).toBe('build');
    expect(checks[1].conclusion).toBe('failure');
  });

  it('getChecks returns empty for unknown PR', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    const checks = await svc.getChecks(999);
    expect(checks).toEqual([]);
  });

  it('refreshCIStatus computes aggregate failure state', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(2));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    // getChecks internals: fetch PR for SHA, then check-runs
    fetchSpy.mockResolvedValueOnce(jsonResponse({ number: 2, head: { sha: 'sha123' } }));
    fetchSpy.mockResolvedValueOnce(checkRunsResponse([
      { name: 'lint', status: 'completed', conclusion: 'success' },
      { name: 'test', status: 'completed', conclusion: 'failure' },
    ]));

    const ciStatus = await svc.refreshCIStatus(2);
    expect(ciStatus?.state).toBe('failure');
    expect(ciStatus?.checks).toHaveLength(2);
  });

  it('refreshCIStatus computes success state', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(3));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockResolvedValueOnce(jsonResponse({ number: 3, head: { sha: 'sha456' } }));
    fetchSpy.mockResolvedValueOnce(checkRunsResponse([
      { name: 'build', status: 'completed', conclusion: 'success' },
      { name: 'test', status: 'completed', conclusion: 'success' },
    ]));

    const ciStatus = await svc.refreshCIStatus(3);
    expect(ciStatus?.state).toBe('success');
  });

  it('refreshCIStatus returns pending for running checks', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(4));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockResolvedValueOnce(jsonResponse({ number: 4, head: { sha: 'sha789' } }));
    fetchSpy.mockResolvedValueOnce(checkRunsResponse([
      { name: 'build', status: 'in_progress', conclusion: null },
    ]));

    const ciStatus = await svc.refreshCIStatus(4);
    expect(ciStatus?.state).toBe('pending');
  });

  it('refreshCIStatus returns undefined for unknown PR', async () => {
    const svc = new GitHubIntegrationService(db as any);
    const result = await svc.refreshCIStatus(999);
    expect(result).toBeUndefined();
  });
});

// ── Commit Links ─────────────────────────────────────────────────

describe('GitHubIntegrationService — Commit Links', () => {
  it('starts with empty commit links', () => {
    const svc = new GitHubIntegrationService(db as any);
    expect(svc.getCommitLinks()).toEqual([]);
  });

  it('addCommitLink adds a link with auto-generated shortSha', () => {
    const svc = new GitHubIntegrationService(db as any);
    svc.addCommitLink({
      sha: 'abcdef1234567890',
      message: 'fix: bug',
      agentId: 'agent-1',
      taskId: 'task-42',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const links = svc.getCommitLinks();
    expect(links).toHaveLength(1);
    expect(links[0].shortSha).toBe('abcdef1');
    expect(links[0].taskId).toBe('task-42');
  });

  it('getCommitsByTask filters by taskId', () => {
    const svc = new GitHubIntegrationService(db as any);
    svc.addCommitLink({
      sha: 'aaa1111111111111',
      message: 'feat: a',
      agentId: 'a1',
      taskId: 'task-1',
      timestamp: '2024-01-01T00:00:00Z',
    });
    svc.addCommitLink({
      sha: 'bbb2222222222222',
      message: 'feat: b',
      agentId: 'a2',
      taskId: 'task-2',
      timestamp: '2024-01-01T00:01:00Z',
    });
    svc.addCommitLink({
      sha: 'ccc3333333333333',
      message: 'fix: c',
      agentId: 'a1',
      taskId: 'task-1',
      timestamp: '2024-01-01T00:02:00Z',
    });

    const t1 = svc.getCommitsByTask('task-1');
    expect(t1).toHaveLength(2);
    expect(t1.every(l => l.taskId === 'task-1')).toBe(true);
  });

  it('prunes commit links to MAX (500) entries', () => {
    const svc = new GitHubIntegrationService(db as any);
    for (let i = 0; i < 510; i++) {
      svc.addCommitLink({
        sha: `sha${i.toString().padStart(14, '0')}`,
        message: `commit ${i}`,
        agentId: null,
        taskId: null,
        timestamp: new Date().toISOString(),
      });
    }
    expect(svc.getCommitLinks().length).toBeLessThanOrEqual(500);
  });

  it('persists commit links to db', () => {
    const svc = new GitHubIntegrationService(db as any);
    svc.addCommitLink({
      sha: 'abc1234567890abc',
      message: 'test',
      agentId: null,
      taskId: 'task-1',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(db.setSetting).toHaveBeenCalledWith('github_commit_links', expect.any(String));
  });
});

// ── Persistence ──────────────────────────────────────────────────

describe('GitHubIntegrationService — Persistence', () => {
  it('loads connection from db on construction', async () => {
    // First, connect and persist
    const svc1 = new GitHubIntegrationService(db as any);
    await connectService(svc1);

    // Grab persisted value and seed a new db
    const db2 = createMockDb();
    const connJson = db.setSetting.mock.calls.find((c: any) => c[0] === 'github_connection')![1];
    db2.getSetting.mockImplementation((key: string) => {
      if (key === 'github_connection') return connJson;
      return null;
    });

    const svc2 = new GitHubIntegrationService(db2 as any);
    expect(svc2.isConnected()).toBe(true);
    const conn = svc2.getConnection();
    expect(conn?.owner).toBe('owner');
    expect(conn?.repo).toBe('repo');
  });

  it('loads pulls from db on construction', async () => {
    const svc1 = new GitHubIntegrationService(db as any);
    await connectService(svc1);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(99));
    await svc1.createPR({ title: 'Persistent PR', description: '', branch: 'b', baseBranch: 'main' });

    // Find the pulls persisted value
    const pullsJson = db.setSetting.mock.calls.find((c: any) => c[0] === 'github_pulls')![1];
    const db2 = createMockDb();
    db2.getSetting.mockImplementation((key: string) => {
      if (key === 'github_pulls') return pullsJson;
      return null;
    });

    const svc2 = new GitHubIntegrationService(db2 as any);
    expect(svc2.getPulls()).toHaveLength(1);
    expect(svc2.getPull(99)?.title).toBe('My PR');
  });

  it('loads commit links from db on construction', () => {
    const svc1 = new GitHubIntegrationService(db as any);
    svc1.addCommitLink({
      sha: 'deadbeef12345678',
      message: 'init',
      agentId: 'a1',
      taskId: 't1',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const linksJson = db.setSetting.mock.calls.find((c: any) => c[0] === 'github_commit_links')![1];
    const db2 = createMockDb();
    db2.getSetting.mockImplementation((key: string) => {
      if (key === 'github_commit_links') return linksJson;
      return null;
    });

    const svc2 = new GitHubIntegrationService(db2 as any);
    expect(svc2.getCommitLinks()).toHaveLength(1);
    expect(svc2.getCommitLinks()[0].sha).toBe('deadbeef12345678');
  });

  it('handles corrupt data in db gracefully', () => {
    db.getSetting.mockReturnValue('{{not json');
    const svc = new GitHubIntegrationService(db as any);
    expect(svc.getConnection()).toBeNull();
    expect(svc.getPulls()).toEqual([]);
    expect(svc.getCommitLinks()).toEqual([]);
  });
});

// ── Error Handling ───────────────────────────────────────────────

describe('GitHubIntegrationService — Error Handling', () => {
  it('githubFetch marks connection as error on 401', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    expect(svc.isConnected()).toBe(true);

    // testConnection will call githubFetch which returns 401
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401));
    await svc.testConnection();

    expect(svc.isConnected()).toBe(false);
  });

  it('githubFetch marks connection as error on 403', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Forbidden' }, 403));
    await svc.testConnection();

    expect(svc.isConnected()).toBe(false);
  });

  it('refreshPR handles network errors gracefully', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(8));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const pr = await svc.refreshPR(8);
    // Should return the existing PR, not throw
    expect(pr).toBeDefined();
    expect(pr?.number).toBe(8);
  });

  it('markReady handles network errors gracefully', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(9));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const pr = await svc.markReady(9);
    expect(pr).toBeDefined();
  });

  it('getChecks handles network errors gracefully', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);

    fetchSpy.mockResolvedValueOnce(prCreatedResponse(11));
    await svc.createPR({ title: 'PR', description: '', branch: 'b', baseBranch: 'main' });

    fetchSpy.mockResolvedValueOnce(jsonResponse({ number: 11, head: { sha: 'sha' } }));
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    const checks = await svc.getChecks(11);
    expect(checks).toEqual([]);
  });

  it('disconnect after connect clears persisted data', async () => {
    const svc = new GitHubIntegrationService(db as any);
    await connectService(svc);
    svc.disconnect();

    // The last setSetting call for connection key should be empty string
    const connCalls = db.setSetting.mock.calls.filter((c: any) => c[0] === 'github_connection');
    const lastCall = connCalls[connCalls.length - 1];
    expect(lastCall[1]).toBe('');
  });
});

// ── Rate Limiting ────────────────────────────────────────────────

describe('GitHubIntegrationService — Rate Limiting', () => {
  it('logs warning when rate limit is low', async () => {
    const svc = new GitHubIntegrationService(db as any);
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        { default_branch: 'main' },
        200,
        { 'x-oauth-scopes': 'repo', 'x-ratelimit-remaining': '50' },
      ),
    );

    // This just validates it doesn't crash with low rate limit headers
    const conn = await svc.connect('ghp_tokenlong1234', 'owner', 'repo');
    expect(conn.status).toBe('connected');
  });
});
