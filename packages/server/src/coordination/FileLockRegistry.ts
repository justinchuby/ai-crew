import { EventEmitter } from 'events';
import { Database } from '../db/database.js';

export interface FileLock {
  filePath: string;
  agentId: string;
  agentRole: string;
  reason: string;
  acquiredAt: string;
  expiresAt: string;
}

interface FileLockRow {
  file_path: string;
  agent_id: string;
  agent_role: string;
  reason: string;
  acquired_at: string;
  expires_at: string;
}

function rowToFileLock(row: FileLockRow): FileLock {
  return {
    filePath: row.file_path,
    agentId: row.agent_id,
    agentRole: row.agent_role,
    reason: row.reason,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

/** Check if two paths conflict via simple glob/prefix matching. */
function pathsConflict(existingPattern: string, requested: string): boolean {
  if (existingPattern === requested) return true;

  // Handle glob patterns ending with /*
  if (existingPattern.endsWith('/*')) {
    const prefix = existingPattern.slice(0, -1); // remove trailing *
    if (requested.startsWith(prefix)) return true;
  }
  if (requested.endsWith('/*')) {
    const prefix = requested.slice(0, -1);
    if (existingPattern.startsWith(prefix)) return true;
  }

  return false;
}

export class FileLockRegistry extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
  }

  acquire(
    agentId: string,
    agentRole: string,
    filePath: string,
    reason = '',
    ttlSeconds = 300,
  ): { ok: boolean; holder?: string } {
    this._cleanExpired();

    const activeLocks = this.db.all<FileLockRow>(
      `SELECT * FROM file_locks WHERE expires_at > datetime('now')`,
    );

    for (const lock of activeLocks) {
      if (lock.agent_id === agentId && lock.file_path === filePath) {
        // Same agent re-acquiring same exact path — allow (refresh)
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
        this.db.run(
          `UPDATE file_locks SET expires_at = ?, reason = ? WHERE file_path = ?`,
          [expiresAt, reason, filePath],
        );
        return { ok: true };
      }
      if (lock.agent_id !== agentId && pathsConflict(lock.file_path, filePath)) {
        return { ok: false, holder: lock.agent_id };
      }
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    this.db.run(
      `INSERT OR REPLACE INTO file_locks (file_path, agent_id, agent_role, reason, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [filePath, agentId, agentRole, reason, expiresAt],
    );

    this.emit('lock:acquired', { filePath, agentId, agentRole, reason });
    return { ok: true };
  }

  release(agentId: string, filePath: string): boolean {
    const result = this.db.run(
      `DELETE FROM file_locks WHERE file_path = ? AND agent_id = ?`,
      [filePath, agentId],
    );
    if (result.changes > 0) {
      this.emit('lock:released', { filePath, agentId });
      return true;
    }
    return false;
  }

  releaseAll(agentId: string): number {
    const result = this.db.run(
      `DELETE FROM file_locks WHERE agent_id = ?`,
      [agentId],
    );
    return result.changes;
  }

  isLocked(filePath: string): { locked: boolean; holder?: string; role?: string; reason?: string } {
    this._cleanExpired();
    const row = this.db.get<FileLockRow>(
      `SELECT * FROM file_locks WHERE file_path = ? AND expires_at > datetime('now')`,
      [filePath],
    );
    if (row) {
      return { locked: true, holder: row.agent_id, role: row.agent_role, reason: row.reason };
    }

    // Check glob conflicts
    const activeLocks = this.db.all<FileLockRow>(
      `SELECT * FROM file_locks WHERE expires_at > datetime('now')`,
    );
    for (const lock of activeLocks) {
      if (pathsConflict(lock.file_path, filePath)) {
        return { locked: true, holder: lock.agent_id, role: lock.agent_role, reason: lock.reason };
      }
    }

    return { locked: false };
  }

  getAll(): FileLock[] {
    this._cleanExpired();
    const rows = this.db.all<FileLockRow>(
      `SELECT * FROM file_locks WHERE expires_at > datetime('now')`,
    );
    return rows.map(rowToFileLock);
  }

  getByAgent(agentId: string): FileLock[] {
    this._cleanExpired();
    const rows = this.db.all<FileLockRow>(
      `SELECT * FROM file_locks WHERE agent_id = ? AND expires_at > datetime('now')`,
      [agentId],
    );
    return rows.map(rowToFileLock);
  }

  cleanExpired(): number {
    return this._cleanExpired();
  }

  private _cleanExpired(): number {
    const result = this.db.run(
      `DELETE FROM file_locks WHERE expires_at <= datetime('now')`,
    );
    return result.changes;
  }
}
