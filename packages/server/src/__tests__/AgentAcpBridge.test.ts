import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock logger ───────────────────────────────────────────────────
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock agentFiles ───────────────────────────────────────────────
vi.mock('../agents/agentFiles.js', () => ({
  agentFlagForRole: (roleId: string) => roleId,
}));

// ── Mock AcpConnection ───────────────────────────────────────────
const mockStart = vi.fn();
const mockOn = vi.fn();

vi.mock('../acp/AcpConnection.js', () => {
  return {
    AcpConnection: class MockAcpConnection {
      start = mockStart;
      on = mockOn;
    },
  };
});

// Import AFTER mocking
import { startAcp } from '../agents/AgentAcpBridge.js';
import { logger } from '../utils/logger.js';
import type { ServerConfig } from '../config.js';

// ── Helpers ───────────────────────────────────────────────────────

function createFakeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-12345678-abcd',
    role: { id: 'lead', name: 'Project Lead', model: undefined, systemPrompt: '' },
    autopilot: true,
    model: undefined,
    resumeSessionId: undefined,
    cwd: '/test/project',
    status: 'idle',
    sessionId: undefined,
    _setAcpConnection: vi.fn(),
    _notifyExit: vi.fn(),
    _notifySessionReady: vi.fn(),
    ...overrides,
  } as any;
}

const fakeConfig: ServerConfig = {
  port: 3001,
  host: '127.0.0.1',
  cliCommand: 'copilot',
  cliArgs: [],
  maxConcurrentAgents: 50,
  dbPath: './test.db',
};

describe('AgentAcpBridge — startAcp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the actual error message when ACP start fails', async () => {
    const agent = createFakeAgent();
    const startError = new Error('CLI binary "copilot" not found in PATH. Install it or set COPILOT_CLI_PATH.');
    mockStart.mockRejectedValue(startError);

    startAcp(agent, fakeConfig);

    // Wait for the catch handler to execute
    await vi.waitFor(() => {
      expect(agent._notifyExit).toHaveBeenCalledWith(1);
    });

    // The error should be logged with details, NOT swallowed
    expect(logger.error).toHaveBeenCalledWith(
      'acp',
      expect.stringContaining('ACP start failed'),
      expect.objectContaining({
        cliCommand: 'copilot',
        cwd: '/test/project',
        role: 'lead',
      }),
    );

    // Verify the actual error message is included in the log
    const errorCall = (logger.error as any).mock.calls.find(
      (call: any[]) => call[1]?.includes('ACP start failed'),
    );
    expect(errorCall[1]).toContain('not found in PATH');
  });

  it('sets agent status to failed on error', async () => {
    const agent = createFakeAgent();
    mockStart.mockRejectedValue(new Error('connection refused'));

    startAcp(agent, fakeConfig);

    await vi.waitFor(() => {
      expect(agent._notifyExit).toHaveBeenCalled();
    });

    expect(agent.status).toBe('failed');
  });

  it('handles null/undefined error gracefully', async () => {
    const agent = createFakeAgent();
    mockStart.mockRejectedValue(null);

    startAcp(agent, fakeConfig);

    await vi.waitFor(() => {
      expect(agent._notifyExit).toHaveBeenCalledWith(1);
    });

    // Should not throw, should still log something
    expect(logger.error).toHaveBeenCalledWith(
      'acp',
      expect.stringContaining('ACP start failed'),
      expect.any(Object),
    );
  });

  it('includes agent ID prefix in error log', async () => {
    const agent = createFakeAgent({ id: 'abcdef12-3456-7890-xxxx' });
    mockStart.mockRejectedValue(new Error('timeout'));

    startAcp(agent, fakeConfig);

    await vi.waitFor(() => {
      expect(agent._notifyExit).toHaveBeenCalled();
    });

    expect(logger.error).toHaveBeenCalledWith(
      'acp',
      expect.stringContaining('abcdef12'),
      expect.any(Object),
    );
  });

  it('passes correct cliArgs to AcpConnection.start', () => {
    const agent = createFakeAgent({ model: 'claude-sonnet-4' });
    mockStart.mockResolvedValue('session-123');

    startAcp(agent, fakeConfig);

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        cliCommand: 'copilot',
        cwd: '/test/project',
        cliArgs: expect.arrayContaining(['--agent=lead', '--model', 'claude-sonnet-4']),
      }),
    );
  });
});
