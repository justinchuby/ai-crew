/**
 * ToolAutoAllowStore — server-side per-tool-type auto-allow storage.
 *
 * Replaces the client-side localStorage approach. Stores "always allow"
 * decisions in the server's settings table so they persist across browser
 * sessions and function even when no web UI is connected.
 *
 * Key format: `tool-auto-allow:{toolName}`
 */
import { eq, like } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { settings } from '../db/schema.js';

const KEY_PREFIX = 'tool-auto-allow:';

export class ToolAutoAllowStore {
  /** In-memory cache for fast lookups during permission checks */
  private cache = new Set<string>();
  private loaded = false;

  constructor(private db: Database) {}

  /** Load all auto-allowed tools into memory */
  private ensureLoaded(): void {
    if (this.loaded) return;
    const rows = this.db.drizzle.select({ key: settings.key })
      .from(settings)
      .where(like(settings.key, `${KEY_PREFIX}%`))
      .all();
    for (const row of rows) {
      this.cache.add(row.key.slice(KEY_PREFIX.length));
    }
    this.loaded = true;
  }

  /** Check if a tool type is auto-allowed */
  isAutoAllowed(toolName: string): boolean {
    this.ensureLoaded();
    return this.cache.has(toolName);
  }

  /** Set a tool type as auto-allowed */
  setAutoAllow(toolName: string, allowed: boolean): void {
    this.ensureLoaded();
    const key = `${KEY_PREFIX}${toolName}`;
    if (allowed) {
      this.db.drizzle.insert(settings)
        .values({ key, value: 'true' })
        .onConflictDoUpdate({ target: settings.key, set: { value: 'true' } })
        .run();
      this.cache.add(toolName);
    } else {
      this.db.drizzle.delete(settings)
        .where(eq(settings.key, key))
        .run();
      this.cache.delete(toolName);
    }
  }

  /** List all auto-allowed tool names */
  listAutoAllowed(): string[] {
    this.ensureLoaded();
    return [...this.cache];
  }
}
