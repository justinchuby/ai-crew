import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../db/database.js';
import { FileLockRegistry } from '../coordination/FileLockRegistry.js';

describe('FileLockRegistry', () => {
  let db: Database;
  let registry: FileLockRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new FileLockRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  it('can acquire a lock on an unlocked file', () => {
    const result = registry.acquire('agent-1', 'developer', 'src/index.ts', 'editing');
    expect(result.ok).toBe(true);
    expect(result.holder).toBeUndefined();
  });

  it('returns holder info when trying to lock an already-locked file', () => {
    registry.acquire('agent-1', 'developer', 'src/index.ts', 'editing');
    const result = registry.acquire('agent-2', 'reviewer', 'src/index.ts', 'reviewing');
    expect(result.ok).toBe(false);
    expect(result.holder).toBe('agent-1');
  });

  it('agent can release their own lock', () => {
    registry.acquire('agent-1', 'developer', 'src/index.ts');
    const released = registry.release('agent-1', 'src/index.ts');
    expect(released).toBe(true);

    const status = registry.isLocked('src/index.ts');
    expect(status.locked).toBe(false);
  });

  it('cannot release another agent\'s lock', () => {
    registry.acquire('agent-1', 'developer', 'src/index.ts');
    const released = registry.release('agent-2', 'src/index.ts');
    expect(released).toBe(false);

    const status = registry.isLocked('src/index.ts');
    expect(status.locked).toBe(true);
  });

  it('releaseAll releases all locks for an agent', () => {
    registry.acquire('agent-1', 'developer', 'src/a.ts');
    registry.acquire('agent-1', 'developer', 'src/b.ts');
    registry.acquire('agent-2', 'reviewer', 'src/c.ts');

    const count = registry.releaseAll('agent-1');
    expect(count).toBe(2);

    expect(registry.isLocked('src/a.ts').locked).toBe(false);
    expect(registry.isLocked('src/b.ts').locked).toBe(false);
    expect(registry.isLocked('src/c.ts').locked).toBe(true);
  });

  it('isLocked returns correct status', () => {
    expect(registry.isLocked('src/index.ts').locked).toBe(false);

    registry.acquire('agent-1', 'developer', 'src/index.ts', 'editing');
    const status = registry.isLocked('src/index.ts');
    expect(status.locked).toBe(true);
    expect(status.holder).toBe('agent-1');
    expect(status.role).toBe('developer');
    expect(status.reason).toBe('editing');
  });

  it('expired locks are auto-cleaned on acquire', () => {
    // Insert a lock with SQLite datetime format (matches datetime('now') for comparison)
    const pastTime = '2000-01-01 00:00:00';
    db.run(
      `INSERT INTO file_locks (file_path, agent_id, agent_role, reason, expires_at) VALUES (?, ?, ?, ?, ?)`,
      ['src/old.ts', 'agent-1', 'developer', 'editing', pastTime],
    );

    // A new acquire should clean the expired lock
    registry.acquire('agent-2', 'reviewer', 'src/new.ts');

    const all = registry.getAll();
    const paths = all.map((l) => l.filePath);
    expect(paths).not.toContain('src/old.ts');
    expect(paths).toContain('src/new.ts');
  });

  it('glob pattern conflict: locking src/auth/* blocks src/auth/login.ts', () => {
    registry.acquire('agent-1', 'developer', 'src/auth/*', 'refactoring auth');
    const result = registry.acquire('agent-2', 'reviewer', 'src/auth/login.ts');
    expect(result.ok).toBe(false);
    expect(result.holder).toBe('agent-1');

    const status = registry.isLocked('src/auth/login.ts');
    expect(status.locked).toBe(true);
    expect(status.holder).toBe('agent-1');
  });

  it('getAll returns only active locks', () => {
    registry.acquire('agent-1', 'developer', 'src/a.ts');
    registry.acquire('agent-2', 'reviewer', 'src/b.ts');
    // Insert an already-expired lock with SQLite datetime format
    const pastTime = '2000-01-01 00:00:00';
    db.run(
      `INSERT INTO file_locks (file_path, agent_id, agent_role, reason, expires_at) VALUES (?, ?, ?, ?, ?)`,
      ['src/expired.ts', 'agent-3', 'pm', '', pastTime],
    );

    const all = registry.getAll();
    expect(all.length).toBe(2);
    const paths = all.map((l) => l.filePath);
    expect(paths).toContain('src/a.ts');
    expect(paths).toContain('src/b.ts');
  });

  it('getByAgent returns correct locks', () => {
    registry.acquire('agent-1', 'developer', 'src/a.ts');
    registry.acquire('agent-1', 'developer', 'src/b.ts');
    registry.acquire('agent-2', 'reviewer', 'src/c.ts');

    const locks = registry.getByAgent('agent-1');
    expect(locks.length).toBe(2);
    expect(locks.every((l) => l.agentId === 'agent-1')).toBe(true);
  });
});
