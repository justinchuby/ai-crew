// ── Undo Stack with 5-minute TTL ────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface UndoEntry {
  commandId: string;
  description: string;
  timestamp: number;
}

class UndoStackImpl {
  private stack: UndoEntry[] = [];
  private listeners: Set<() => void> = new Set();

  push(commandId: string, description: string) {
    this.stack.push({ commandId, description, timestamp: Date.now() });
    this.notify();
  }

  peek(): UndoEntry | null {
    this.pruneExpired();
    return this.stack[this.stack.length - 1] ?? null;
  }

  pop(): UndoEntry | null {
    this.pruneExpired();
    const entry = this.stack.pop() ?? null;
    if (entry) this.notify();
    return entry;
  }

  get length(): number {
    this.pruneExpired();
    return this.stack.length;
  }

  clear() {
    this.stack = [];
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private pruneExpired() {
    const now = Date.now();
    this.stack = this.stack.filter(e => now - e.timestamp < TTL_MS);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }
}

export const undoStack = new UndoStackImpl();
