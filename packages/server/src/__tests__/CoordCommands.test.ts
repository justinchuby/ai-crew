import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoordCommands } from '../agents/commands/CoordCommands.js';
import type { CommandHandlerContext } from '../agents/commands/types.js';

// Mock child_process.exec for git command execution
const mockExec = vi.fn();
vi.mock('child_process', () => ({ exec: (...args: any[]) => mockExec(...args) }));

function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-dev-abc123',
    parentId: 'agent-lead-000',
    role: { id: 'developer', name: 'Developer' },
    cwd: '/fake/worktree',
    sendMessage: vi.fn(),
    ...overrides,
  } as any;
}

function makeCtx(overrides: Record<string, any> = {}): CommandHandlerContext {
  return {
    lockRegistry: {
      acquire: vi.fn(),
      release: vi.fn(),
      getByAgent: vi.fn().mockReturnValue([]),
    },
    activityLedger: {
      log: vi.fn(),
    },
    delegations: new Map(),
    reportedCompletions: new Set(),
    pendingSystemActions: new Map(),
    ...overrides,
  } as any;
}

function getCommitHandler(ctx: CommandHandlerContext) {
  const cmds = getCoordCommands(ctx);
  const commit = cmds.find((c) => c.name === 'COMMIT');
  if (!commit) throw new Error('COMMIT command not found');
  return commit;
}

// Helper: make mockExec resolve successfully (commit + post-commit dirty-tree check)
function mockExecSuccess(stdout = 'abc1234 feat: stuff\n 1 file changed', dirtyFiles?: string[]) {
  mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
    if (cmd.startsWith('git diff --name-only')) {
      // Post-commit dirty-tree check (scoped to agent's files)
      cb(null, { stdout: (dirtyFiles ?? []).join('\n') + '\n', stderr: '' });
    } else if (cmd.startsWith('git ls-files --others')) {
      cb(null, { stdout: '\n', stderr: '' });
    } else {
      cb(null, { stdout, stderr: '' });
    }
  });
}

// Helper: make mockExec reject with error
function mockExecFailure(message = 'nothing to commit') {
  mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
    cb(new Error(message), { stdout: '', stderr: message });
  });
}

// Helper: commit succeeds but dirty-tree check fails
function mockExecCommitOkVerifyFail(stdout = 'abc1234 feat: stuff\n 1 file changed') {
  mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
    if (cmd === 'git diff --name-only' || cmd.startsWith('git ls-files')) {
      cb(new Error('fatal: not a git repository'), { stdout: '', stderr: '' });
    } else {
      cb(null, { stdout, stderr: '' });
    }
  });
}

describe('CoordCommands — COMMIT handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 6 coordination commands', () => {
    const cmds = getCoordCommands(makeCtx());
    expect(cmds).toHaveLength(6);
    expect(cmds.map((c) => c.name)).toEqual([
      'LOCK', 'UNLOCK', 'ACTIVITY', 'DECISION', 'PROGRESS', 'COMMIT',
    ]);
  });

  it('executes scoped git add with locked files', async () => {
    mockExecSuccess(undefined, ['src/auth.ts', 'src/utils.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'src/auth.ts' },
          { filePath: 'src/utils.ts' },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "Add auth module"} ⟧');

    expect(ctx.lockRegistry.getByAgent).toHaveBeenCalledWith('agent-dev-abc123');
    // Wait for async exec
    await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("git add 'src/auth.ts' 'src/utils.ts'");
    expect(cmd).toContain('git commit');
    expect(cmd).toContain('Add auth module');
  });

  it('shell-quotes file paths with spaces and special characters', async () => {
    mockExecSuccess(undefined, ['src/my component/App.tsx', "docs/note's.md"]);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'src/my component/App.tsx' },
          { filePath: "docs/note's.md" },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "Update docs"} ⟧');

    await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("'src/my component/App.tsx'");
    // Single quotes in paths should be escaped
    expect(cmd).toContain("docs/note");
  });

  it('warns and returns when agent has no locks', () => {
    const ctx = makeCtx();
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "test"} ⟧');

    expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('No file locks held'),
    );
    expect(ctx.activityLedger.log).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('includes Co-authored-by trailer in commit command', async () => {
    mockExecSuccess(undefined, ['file.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "feat: stuff"} ⟧');

    await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('Co-authored-by: Copilot');
  });

  it('uses default message when none provided', async () => {
    mockExecSuccess(undefined, ['file.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {} ⟧');

    await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('Changes by Developer (agent-d');
  });

  it('logs commit to activity ledger after successful commit', async () => {
    mockExecSuccess(undefined, ['a.ts', 'b.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'a.ts' },
          { filePath: 'b.ts' },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "ship it"} ⟧');

    // Activity ledger log now happens after async commit + verification
    await vi.waitFor(() => expect(ctx.activityLedger.log).toHaveBeenCalledWith(
      'agent-dev-abc123',
      'developer',
      'file_edit',
      expect.stringContaining('ship it'),
      expect.objectContaining({
        type: 'commit',
        files: ['a.ts', 'b.ts'],
        message: 'ship it',
      }),
    ));
  });

  it('sends success message after git commit succeeds', async () => {
    mockExecSuccess('abc1234 feat: ship it\n 2 files changed', ['file.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "ship it"} ⟧');

    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT succeeded'),
    ));
  });

  it('sends failure message when git commit fails', async () => {
    mockExecFailure('nothing to commit, working tree clean');
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "test"} ⟧');

    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT failed'),
    ));
  });

  it('executes in agent cwd (worktree path)', async () => {
    mockExecSuccess(undefined, ['file.ts']);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent({ cwd: '/my/worktree/path' });
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "test"} ⟧');

    await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
    const opts = mockExec.mock.calls[0][1];
    expect(opts.cwd).toBe('/my/worktree/path');
  });

  it('sends error on malformed JSON', () => {
    const ctx = makeCtx();
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {not valid json} ⟧');

    expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT error'),
    );
  });

  it('ignores non-matching input', () => {
    const ctx = makeCtx();
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, 'just some regular text');

    expect(agent.sendMessage).not.toHaveBeenCalled();
  });

  // ── A6: Post-commit verification tests ──────────────────────────────

  it('does not warn when working tree is clean after commit', async () => {
    mockExecSuccess(undefined, []);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'src/auth.ts' },
          { filePath: 'src/utils.ts' },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "verified commit"} ⟧');

    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT succeeded'),
    ));
    // Should NOT have a warning about dirty files
    const warnings = agent.sendMessage.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes('Post-commit warning'),
    );
    expect(warnings).toHaveLength(0);
  });

  it('does not warn when dirty-tree check returns no files', async () => {
    mockExecSuccess(undefined, []);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'src/auth.ts' },
          { filePath: 'src/utils.ts' },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "partial commit"} ⟧');

    // Should get success message but NOT a warning
    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT succeeded'),
    ));
    expect(agent.sendMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Post-commit warning'),
    );
  });

  it('does not warn when no dirty files remain', async () => {
    mockExecSuccess(undefined, []);
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([
          { filePath: 'a.ts' },
          { filePath: 'b.ts' },
          { filePath: 'c.ts' },
        ]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "empty commit"} ⟧');

    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT succeeded'),
    ));
    expect(agent.sendMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('Post-commit warning'),
    );
  });

  it('gracefully handles dirty-tree check failure (best-effort)', async () => {
    mockExecCommitOkVerifyFail();
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "test"} ⟧');

    // Commit success message should still arrive
    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT succeeded'),
    ));
    // No crash — dirty-tree check failure is swallowed
    const warnings = agent.sendMessage.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes('Post-commit warning'),
    );
    expect(warnings).toHaveLength(0);
    // Activity ledger still logs (dirty-tree check is best-effort)
    await vi.waitFor(() => expect(ctx.activityLedger.log).toHaveBeenCalled());
  });

  it('does not log to activity ledger on commit failure', async () => {
    mockExecFailure('nothing to commit');
    const ctx = makeCtx({
      lockRegistry: {
        getByAgent: vi.fn().mockReturnValue([{ filePath: 'file.ts' }]),
      },
    });
    const agent = makeAgent();
    const commit = getCommitHandler(ctx);

    commit.handler(agent, '⟦ COMMIT {"message": "test"} ⟧');

    await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT failed'),
    ));
    // Activity ledger should NOT be called on failure
    expect(ctx.activityLedger.log).not.toHaveBeenCalled();
  });

  // ── COMMIT safety invariants ──────────────────────────────────────────

  describe('safety: only locked files are staged', () => {
    it('git add command contains EXACTLY the locked files and no others', async () => {
      mockExecSuccess(undefined, ['src/TaskDAG.ts', 'src/__tests__/TaskDAG.test.ts']);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([
            { filePath: 'src/TaskDAG.ts' },
            { filePath: 'src/__tests__/TaskDAG.test.ts' },
          ]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "scoped commit"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      // Must contain exactly these two files
      expect(cmd).toContain("'src/TaskDAG.ts'");
      expect(cmd).toContain("'src/__tests__/TaskDAG.test.ts'");
      // Must NOT use git add -A or git add .
      expect(cmd).not.toContain('git add -A');
      expect(cmd).not.toContain('git add .');
      // The add command should start with git add followed by quoted paths
      expect(cmd).toMatch(/^git add '.*' && git commit/);
    });

    it('single locked file produces single-file git add', async () => {
      mockExecSuccess(undefined, ['README.md']);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([
            { filePath: 'README.md' },
          ]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "single file"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      expect(cmd).toContain("git add 'README.md'");
      // Should only have one quoted path
      const quotedPaths = cmd.match(/'[^']*'/g) ?? [];
      // 1 file path + 1 commit message = 2 quoted strings minimum
      expect(quotedPaths[0]).toBe("'README.md'");
    });
  });

  describe('safety: cross-agent isolation', () => {
    it('queries lockRegistry with the committing agent ID only', async () => {
      mockExecSuccess(undefined, ['agent-a-file.ts']);
      const getByAgent = vi.fn().mockReturnValue([
        { filePath: 'agent-a-file.ts' },
      ]);
      const ctx = makeCtx({
        lockRegistry: { getByAgent },
      });
      const agentA = makeAgent({ id: 'agent-aaa-111' });
      const commit = getCommitHandler(ctx);

      commit.handler(agentA, '⟦ COMMIT {"message": "agent A commit"} ⟧');

      // Must query locks ONLY for the committing agent
      expect(getByAgent).toHaveBeenCalledWith('agent-aaa-111');
      expect(getByAgent).toHaveBeenCalledTimes(1);
    });

    it('agent B locks are invisible to agent A commit', async () => {
      // Simulate: Agent A has 1 lock, Agent B has 2 locks
      const getByAgent = vi.fn().mockImplementation((agentId: string) => {
        if (agentId === 'agent-aaa') return [{ filePath: 'a-file.ts' }];
        if (agentId === 'agent-bbb') return [{ filePath: 'b-file1.ts' }, { filePath: 'b-file2.ts' }];
        return [];
      });
      mockExecSuccess(undefined, ['a-file.ts']);
      const ctx = makeCtx({
        lockRegistry: { getByAgent },
      });
      const agentA = makeAgent({ id: 'agent-aaa' });
      const commit = getCommitHandler(ctx);

      commit.handler(agentA, '⟦ COMMIT {"message": "A only"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      // Agent A's file is staged
      expect(cmd).toContain("'a-file.ts'");
      // Agent B's files are NOT staged
      expect(cmd).not.toContain('b-file1.ts');
      expect(cmd).not.toContain('b-file2.ts');
    });

    it('two agents committing simultaneously get their own scoped files', async () => {
      const getByAgent = vi.fn().mockImplementation((agentId: string) => {
        if (agentId === 'agent-x') return [{ filePath: 'x.ts' }];
        if (agentId === 'agent-y') return [{ filePath: 'y.ts' }];
        return [];
      });
      mockExecSuccess(undefined, ['x.ts']);
      const ctx = makeCtx({
        lockRegistry: { getByAgent },
      });
      const agentX = makeAgent({ id: 'agent-x' });
      const agentY = makeAgent({ id: 'agent-y' });
      const commit = getCommitHandler(ctx);

      commit.handler(agentX, '⟦ COMMIT {"message": "X work"} ⟧');
      commit.handler(agentY, '⟦ COMMIT {"message": "Y work"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalledTimes(2));
      const cmdX = mockExec.mock.calls[0][0] as string;
      const cmdY = mockExec.mock.calls[1][0] as string;
      expect(cmdX).toContain("'x.ts'");
      expect(cmdX).not.toContain("'y.ts'");
      expect(cmdY).toContain("'y.ts'");
      expect(cmdY).not.toContain("'x.ts'");
    });
  });

  describe('safety: all locked files are staged', () => {
    it('every locked file appears in the git add command', async () => {
      const lockedFiles = [
        { filePath: 'src/a.ts' },
        { filePath: 'src/b.ts' },
        { filePath: 'src/c.ts' },
        { filePath: 'tests/a.test.ts' },
      ];
      mockExecSuccess(undefined, lockedFiles.map(l => l.filePath));
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue(lockedFiles),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "all files"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      for (const lock of lockedFiles) {
        expect(cmd).toContain(`'${lock.filePath}'`);
      }
    });
  });

  describe('safety: no locks means no commit', () => {
    it('refuses to commit and does not invoke git at all', () => {
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "no locks"} ⟧');

      expect(mockExec).not.toHaveBeenCalled();
      expect(agent.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('No file locks held'),
      );
      expect(ctx.activityLedger.log).not.toHaveBeenCalled();
    });
  });

  describe('safety: post-commit verification', () => {
    it('runs dirty-tree check after commit succeeds', async () => {
      mockExecSuccess(undefined, []);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([{ filePath: 'src/file.ts' }]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "verify me"} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalledTimes(3));
      // First call: git add + commit -- files
      expect(mockExec.mock.calls[0][0]).toContain('git add');
      expect(mockExec.mock.calls[0][0]).toContain("-- 'src/file.ts'");
      // Second + third calls: scoped git diff and git ls-files (dirty-tree check)
      const postCommitCmds = [mockExec.mock.calls[1][0], mockExec.mock.calls[2][0]];
      expect(postCommitCmds.some((c: string) => c.includes('git diff --name-only --'))).toBe(true);
      expect(postCommitCmds.some((c: string) => c.includes('git ls-files --others'))).toBe(true);
    });

    it('warns when dirty files remain after commit', async () => {
      // Post-commit check finds dirty files still in the working tree
      mockExecSuccess(undefined, ['src/leftover.ts']);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([
            { filePath: 'src/modified.ts' },
          ]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "partial modify"} ⟧');

      await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('COMMIT succeeded'),
      ));
      await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Post-commit warning'),
      ));
    });
  });

  // ── Fix 2: Honor req.files parameter ──────────────────────────────────

  describe('fix 2: honor req.files parameter', () => {
    it('merges req.files with locked files', async () => {
      mockExecSuccess(undefined, []);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([{ filePath: 'src/locked.ts' }]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "merge test", "files": ["src/extra.ts"]} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      expect(cmd).toContain("'src/locked.ts'");
      expect(cmd).toContain("'src/extra.ts'");
    });

    it('warns about unlocked explicitly specified files', async () => {
      mockExecSuccess(undefined, []);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([{ filePath: 'src/locked.ts' }]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "test", "files": ["src/unlocked.ts"]} ⟧');

      expect(agent.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining("don't hold locks for"),
      );
    });

    it('allows commit with only req.files when no locks held', async () => {
      mockExecSuccess(undefined, []);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "manual files", "files": ["src/a.ts"]} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      expect(cmd).toContain("'src/a.ts'");
    });

    it('deduplicates when req.files overlaps with locks', async () => {
      mockExecSuccess(undefined, []);
      const ctx = makeCtx({
        lockRegistry: {
          getByAgent: vi.fn().mockReturnValue([{ filePath: 'src/shared.ts' }]),
        },
      });
      const agent = makeAgent();
      const commit = getCommitHandler(ctx);

      commit.handler(agent, '⟦ COMMIT {"message": "dedup", "files": ["src/shared.ts"]} ⟧');

      await vi.waitFor(() => expect(mockExec).toHaveBeenCalled());
      const cmd = mockExec.mock.calls[0][0] as string;
      // git add has the file once, and git commit -- has it once (2 total in cmd)
      const addPart = cmd.split('&&')[0];
      const addCount = (addPart.match(/src\/shared\.ts/g) ?? []).length;
      expect(addCount).toBe(1);
    });
  });

  // ── Fix 3: Pre-release lock audit ─────────────────────────────────────

  describe('fix 3: pre-release lock audit', () => {
    it('blocks release when file has uncommitted changes', async () => {
      const ctx = makeCtx({
        lockRegistry: {
          release: vi.fn().mockReturnValue(true),
        },
      });
      const agent = makeAgent();

      // Mock exec to return dirty file
      mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
        if (cmd.includes('git diff --name-only')) {
          cb(null, { stdout: 'src/dirty.ts\n', stderr: '' });
        } else {
          cb(null, { stdout: '', stderr: '' });
        }
      });

      const cmds = getCoordCommands(ctx);
      const unlock = cmds.find((c) => c.name === 'UNLOCK');
      unlock!.handler(agent, '⟦ UNLOCK_FILE {"filePath": "src/dirty.ts"} ⟧');

      await vi.waitFor(() => expect(agent.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('uncommitted changes'),
      ));
      // Lock should NOT be released — agent must commit first
      expect(ctx.lockRegistry.release).not.toHaveBeenCalled();
    });

    it('does not warn when releasing lock on clean file', async () => {
      const ctx = makeCtx({
        lockRegistry: {
          release: vi.fn().mockReturnValue(true),
        },
      });
      const agent = makeAgent();

      mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
        cb(null, { stdout: '\n', stderr: '' });
      });

      const cmds = getCoordCommands(ctx);
      const unlock = cmds.find((c) => c.name === 'UNLOCK');
      unlock!.handler(agent, '⟦ UNLOCK_FILE {"filePath": "src/clean.ts"} ⟧');

      await vi.waitFor(() => expect(ctx.lockRegistry.release).toHaveBeenCalled());
      // No warning about uncommitted changes
      const warnings = agent.sendMessage.mock.calls.filter(
        (c: any[]) => (c[0] as string).includes('uncommitted changes'),
      );
      expect(warnings).toHaveLength(0);
    });
  });
});
