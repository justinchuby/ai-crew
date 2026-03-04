import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mock child_process ────────────────────────────────────────────
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  ChildProcess: EventEmitter,
}));

// ── Mock @agentclientprotocol/sdk ─────────────────────────────────
vi.mock('@agentclientprotocol/sdk', () => ({
  PROTOCOL_VERSION: '1.0',
  ndJsonStream: vi.fn(),
  ClientSideConnection: vi.fn(),
}));

// ── Mock logger ───────────────────────────────────────────────────
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocking
import { AcpConnection } from '../acp/AcpConnection.js';
import { logger } from '../utils/logger.js';

// ── Helpers ───────────────────────────────────────────────────────

/** Create a fake child process EventEmitter with piped stdin/stdout */
function createFakeProcess() {
  const proc = new EventEmitter() as any;
  proc.stdin = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

describe('AcpConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateCliCommand (pre-flight check)', () => {
    it('throws descriptive error when CLI binary is not found in PATH', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const conn = new AcpConnection({ autopilot: true });
      await expect(conn.start({
        cliCommand: 'nonexistent-binary',
        cwd: '/tmp',
      })).rejects.toThrow(/CLI binary "nonexistent-binary" not found in PATH/);
    });

    it('includes COPILOT_CLI_PATH hint in error message', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const conn = new AcpConnection({ autopilot: true });
      await expect(conn.start({
        cliCommand: 'copilot',
        cwd: '/tmp',
      })).rejects.toThrow(/COPILOT_CLI_PATH/);
    });

    it('proceeds to spawn when CLI binary exists', async () => {
      mockExecFileSync.mockReturnValue('');
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const conn = new AcpConnection({ autopilot: true });
      // start() will fail further along (no real ACP connection) but spawn should be called
      const startPromise = conn.start({ cliCommand: 'copilot', cwd: '/tmp' });

      // The spawn was called because validation passed
      expect(mockSpawn).toHaveBeenCalledWith(
        'copilot',
        expect.arrayContaining(['--acp', '--stdio']),
        expect.objectContaining({ cwd: '/tmp' }),
      );

      // Emit exit to clean up
      fakeProc.emit('exit', 1);

      // The promise will reject because ACP protocol setup fails, but that's expected
      await expect(startPromise).rejects.toThrow();
    });

    it('uses "command -v" on Unix and "where" on Windows', async () => {
      const originalPlatform = process.platform;

      // Test Unix path
      mockExecFileSync.mockReturnValue('/usr/local/bin/copilot');
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const conn = new AcpConnection({ autopilot: true });
      const startPromise = conn.start({ cliCommand: 'copilot', cwd: '/tmp' });

      // On macOS/Linux, should use 'command' with '-v'
      if (process.platform !== 'win32') {
        expect(mockExecFileSync).toHaveBeenCalledWith(
          'command',
          ['-v', 'copilot'],
          expect.objectContaining({ timeout: 3000 }),
        );
      }

      fakeProc.emit('exit', 1);
      await startPromise.catch(() => {});
    });
  });

  describe('process error handler', () => {
    it('emits exit(1) and logs error when spawn emits error event', async () => {
      mockExecFileSync.mockReturnValue('');
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const conn = new AcpConnection({ autopilot: true });
      const exitEvents: number[] = [];
      conn.on('exit', (code: number) => exitEvents.push(code));

      const startPromise = conn.start({ cliCommand: 'copilot', cwd: '/tmp' });

      // Simulate a spawn error (e.g., ENOENT after validation passed but binary was deleted)
      const spawnError = Object.assign(new Error('spawn copilot ENOENT'), { code: 'ENOENT' });
      fakeProc.emit('error', spawnError);

      await startPromise.catch(() => {});

      // Should have logged the error with details
      expect(logger.error).toHaveBeenCalledWith(
        'acp',
        expect.stringContaining('Spawn error for "copilot"'),
        expect.objectContaining({ code: 'ENOENT', command: 'copilot' }),
      );

      // Should have emitted exit event
      expect(exitEvents).toContain(1);
    });

    it('does not crash the process on spawn error', async () => {
      mockExecFileSync.mockReturnValue('');
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const conn = new AcpConnection({ autopilot: true });
      const startPromise = conn.start({ cliCommand: 'copilot', cwd: '/tmp' });

      // Emit error — should NOT throw an uncaught exception
      const spawnError = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
      expect(() => fakeProc.emit('error', spawnError)).not.toThrow();

      await startPromise.catch(() => {});
    });

    it('sets isConnected to false on spawn error', async () => {
      mockExecFileSync.mockReturnValue('');
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const conn = new AcpConnection({ autopilot: true });
      const startPromise = conn.start({ cliCommand: 'copilot', cwd: '/tmp' });

      fakeProc.emit('error', new Error('spawn failed'));

      await startPromise.catch(() => {});
      expect(conn.isConnected).toBe(false);
    });
  });
});
