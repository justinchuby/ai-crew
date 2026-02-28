import BetterSqlite3 from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'url';
import path from 'path';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, '../../drizzle');

export class Database {
  private db: BetterSqlite3.Database;
  public readonly drizzle: BetterSQLite3Database<typeof schema>;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('wal_checkpoint(PASSIVE)');
    this.drizzle = drizzle(this.db, { schema });
    migrate(this.drizzle, { migrationsFolder });
  }

  /** @deprecated Use db.drizzle instead */
  run(sql: string, params?: any[]): BetterSqlite3.RunResult {
    const stmt = this.db.prepare(sql);
    return params ? stmt.run(...params) : stmt.run();
  }

  /** @deprecated Use db.drizzle instead */
  get<T = any>(sql: string, params?: any[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  }

  /** @deprecated Use db.drizzle instead */
  all<T = any>(sql: string, params?: any[]): T[] {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  }

  close(): void {
    this.db.close();
  }

  /** Get a setting value from the settings table */
  getSetting(key: string): string | undefined {
    const row = this.drizzle
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get();
    return row?.value;
  }

  /** Set a setting value in the settings table (upsert) */
  setSetting(key: string, value: string): void {
    this.drizzle
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
      .run();
  }
}
