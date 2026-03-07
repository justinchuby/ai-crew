import { eq, and, lt, isNull, asc } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { messageQueue, utcNow } from '../db/schema.js';
import { logger } from '../utils/logger.js';

export type MessageType = 'agent_message' | 'delegation_result' | 'broadcast' | 'system';
export type MessageStatus = 'queued' | 'delivered' | 'expired';

export interface QueuedMessage {
  id: number;
  targetAgentId: string;
  sourceAgentId: string | null;
  messageType: MessageType;
  payload: string;
  status: MessageStatus;
  attempts: number;
  createdAt: string | null;
  deliveredAt: string | null;
  projectId: string | null;
}

/**
 * MessageQueueStore — crash-safe message persistence using write-on-enqueue pattern.
 *
 * Messages are written to SQLite BEFORE in-memory delivery, ensuring they
 * survive server crashes. On successful delivery, messages are marked delivered.
 * On startup, pending messages are drained to reconnected agents.
 */
export class MessageQueueStore {
  constructor(private readonly db: Database) {}

  /**
   * Persist a message before delivery (write-on-enqueue).
   * Returns the inserted row ID for later markDelivered().
   */
  enqueue(
    targetAgentId: string,
    messageType: MessageType,
    payload: string,
    sourceAgentId?: string,
    projectId?: string,
  ): number {
    const result = this.db.drizzle
      .insert(messageQueue)
      .values({
        targetAgentId,
        sourceAgentId: sourceAgentId ?? null,
        messageType,
        payload,
        projectId: projectId ?? null,
      })
      .run();

    logger.debug({ module: 'comms', msg: 'Message enqueued', targetAgentId, messageType, mqId: Number(result.lastInsertRowid) });
    return Number(result.lastInsertRowid);
  }

  /** Mark a message as delivered (remove from pending queue). */
  markDelivered(id: number): void {
    this.db.drizzle
      .update(messageQueue)
      .set({ status: 'delivered', deliveredAt: new Date().toISOString() })
      .where(eq(messageQueue.id, id))
      .run();
  }

  /** Increment the attempt counter (for retry tracking). */
  retry(id: number): void {
    const row = this.db.drizzle
      .select({ attempts: messageQueue.attempts })
      .from(messageQueue)
      .where(eq(messageQueue.id, id))
      .get();

    if (row) {
      this.db.drizzle
        .update(messageQueue)
        .set({ attempts: row.attempts + 1 })
        .where(eq(messageQueue.id, id))
        .run();
    }
  }

  /** Get all pending (undelivered) messages for a specific agent, ordered FIFO. */
  getPending(targetAgentId: string): QueuedMessage[] {
    return this.db.drizzle
      .select()
      .from(messageQueue)
      .where(and(
        eq(messageQueue.targetAgentId, targetAgentId),
        eq(messageQueue.status, 'queued'),
      ))
      .orderBy(asc(messageQueue.id))
      .all() as QueuedMessage[];
  }

  /** Get all pending messages across all agents (for startup drain). */
  getPendingAll(): QueuedMessage[] {
    return this.db.drizzle
      .select()
      .from(messageQueue)
      .where(eq(messageQueue.status, 'queued'))
      .orderBy(asc(messageQueue.id))
      .all() as QueuedMessage[];
  }

  /** Count of pending messages (for diagnostics). */
  getPendingCount(targetAgentId?: string): number {
    const conditions = [eq(messageQueue.status, 'queued')];
    if (targetAgentId) conditions.push(eq(messageQueue.targetAgentId, targetAgentId));

    const rows = this.db.drizzle
      .select({ id: messageQueue.id })
      .from(messageQueue)
      .where(and(...conditions))
      .all();
    return rows.length;
  }

  /** Delete delivered messages older than N days (housekeeping). */
  cleanup(olderThanDays: number = 7): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.drizzle
      .delete(messageQueue)
      .where(and(
        eq(messageQueue.status, 'delivered'),
        lt(messageQueue.deliveredAt, cutoff),
      ))
      .run();

    if (result.changes > 0) {
      logger.debug({ module: 'comms', msg: 'Message queue cleanup', deletedCount: result.changes, olderThanDays });
    }
    return result.changes;
  }

  /** Expire stale queued messages older than N days (agent never reconnected). */
  expireStale(olderThanDays: number = 3): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.drizzle
      .update(messageQueue)
      .set({ status: 'expired' })
      .where(and(
        eq(messageQueue.status, 'queued'),
        lt(messageQueue.createdAt, cutoff),
      ))
      .run();
    return result.changes;
  }
}
