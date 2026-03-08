/**
 * DnD-specific integration tests for KanbanBoard.
 *
 * Mocks @dnd-kit to capture drag event handlers, then tests the business
 * logic: cross-column status change, same-column reorder, invalid drop
 * targets (UNDROP_TARGETS), drag overlay, and API error handling.
 *
 * We trust @dnd-kit fires events correctly — we test what KanbanBoard
 * DOES with those events (API calls, toast messages, state updates).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { DagStatus, DagTask, DagTaskStatus } from '../../../types';

// ── Capture DnD handlers ────────────────────────────────────────────

let capturedHandlers: {
  onDragStart?: (event: any) => void;
  onDragOver?: (event: any) => void;
  onDragEnd?: (event: any) => void;
  onDragCancel?: () => void;
} = {};

vi.mock('@dnd-kit/core', () => {
  return {
    DndContext: ({ children, onDragStart, onDragOver, onDragEnd, onDragCancel }: any) => {
      capturedHandlers = { onDragStart, onDragOver, onDragEnd, onDragCancel };
      return React.createElement('div', { 'data-testid': 'dnd-context' }, children);
    },
    DragOverlay: ({ children }: any) => children ?? null,
    closestCorners: vi.fn(),
    PointerSensor: class {},
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn(() => []),
    useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  };
});

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => children,
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  verticalListSortingStrategy: {},
  arrayMove: (arr: any[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// Mock apiFetch for verifying API calls
const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

// Import AFTER mocks are set up
import { KanbanBoard } from '../KanbanBoard';

// ── Fixtures ────────────────────────────────────────────────────────

let taskCounter = 0;

function makeTask(overrides: Partial<DagTask> = {}): DagTask {
  taskCounter++;
  return {
    id: overrides.id ?? `task-${taskCounter}`,
    leadId: 'lead-1',
    projectId: 'proj-1',
    role: 'developer',
    title: 'Test task',
    description: 'A test task description',
    files: [],
    dependsOn: [],
    dagStatus: 'pending',
    priority: 0,
    createdAt: '2026-03-08T00:00:00Z',
    ...overrides,
  };
}

function makeDagStatus(tasks: DagTask[]): DagStatus {
  const summary: DagStatus['summary'] = {
    pending: 0, ready: 0, running: 0, done: 0,
    failed: 0, blocked: 0, paused: 0, skipped: 0,
  };
  for (const t of tasks) {
    summary[t.dagStatus]++;
  }
  return { tasks, fileLockMap: {}, summary };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('KanbanBoard DnD', () => {
  beforeEach(() => {
    taskCounter = 0;
    capturedHandlers = {};
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({});
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  describe('cross-column drag (status change)', () => {
    it('calls PATCH /status when dragged to a different column', async () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready', title: 'Ready Task' }),
        makeTask({ id: 'task-b', dagStatus: 'done', title: 'Done Task' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      // Simulate drag: task-a from 'ready' to 'done' column
      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-done' },
        });
      });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/projects/proj-1/tasks/task-a/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'done' }),
          }),
        );
      });
    });

    it('calls PATCH /status when dragged onto a task in different column', async () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready', title: 'Ready Task' }),
        makeTask({ id: 'task-b', dagStatus: 'done', title: 'Done Task' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      // Drag task-a onto task-b (which is in 'done' column)
      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'task-b' },
        });
      });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/projects/proj-1/tasks/task-a/status',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'done' }),
          }),
        );
      });
    });

    it('calls onTaskUpdated after successful status change', async () => {
      const onUpdated = vi.fn();
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" onTaskUpdated={onUpdated} />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-done' },
        });
      });

      await waitFor(() => {
        expect(onUpdated).toHaveBeenCalled();
      });
    });

    it('drags failed task to ready (retry via DnD)', async () => {
      const tasks = [makeTask({ id: 'task-f', dagStatus: 'failed' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-f' },
          over: { id: 'column-ready' },
        });
      });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/projects/proj-1/tasks/task-f/status',
          expect.objectContaining({
            body: JSON.stringify({ status: 'ready' }),
          }),
        );
      });
    });
  });

  describe('invalid drop targets (UNDROP_TARGETS)', () => {
    it('rejects drag to "running" column with toast message', async () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready' }),
        makeTask({ id: 'task-b', dagStatus: 'running', startedAt: new Date().toISOString() }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-running' },
        });
      });

      // Should NOT call apiFetch
      expect(mockApiFetch).not.toHaveBeenCalled();

      // Should show error toast
      expect(screen.getByText(/Cannot manually move tasks to "running"/)).toBeTruthy();
    });

    it('rejects drag to "blocked" column with toast message', async () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready' }),
        makeTask({ id: 'task-b', dagStatus: 'blocked' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-blocked' },
        });
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(screen.getByText(/Cannot manually move tasks to "blocked"/)).toBeTruthy();
    });
  });

  describe('same-column drag (priority reorder)', () => {
    it('calls PATCH /priority when reordered within same column', async () => {
      const tasks = [
        makeTask({ id: 'task-a', dagStatus: 'ready', priority: 3, createdAt: '2026-03-01' }),
        makeTask({ id: 'task-b', dagStatus: 'ready', priority: 2, createdAt: '2026-03-02' }),
        makeTask({ id: 'task-c', dagStatus: 'ready', priority: 1, createdAt: '2026-03-03' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      // Drag task-c onto task-a (reorder within ready column)
      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-c' },
          over: { id: 'task-a' },
        });
      });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/projects/proj-1/tasks/task-c/priority',
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"priority"'),
          }),
        );
      });
    });

    it('does not call API when dropped on same position', () => {
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      // Drop task-a on itself — no reorder
      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'task-a' },
        });
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('drag edge cases', () => {
    it('ignores drag when dropped on nothing (over is null)', () => {
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: null,
        });
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('ignores drag when no projectId is set', () => {
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />); // no projectId

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-done' },
        });
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('ignores drag of unknown task id', () => {
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'nonexistent-task' },
          over: { id: 'column-done' },
        });
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('dragCancel clears active state without API call', () => {
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragStart?.({ active: { id: 'task-a' } });
      });

      act(() => {
        capturedHandlers.onDragCancel?.();
      });

      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('API error handling during DnD', () => {
    it('shows toast on 409 conflict error', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('409 Conflict'));
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-done' },
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Invalid transition: ready → done/)).toBeTruthy();
      });
    });

    it('shows generic error toast on non-409 failure', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('Network timeout'));
      const tasks = [makeTask({ id: 'task-a', dagStatus: 'ready' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} projectId="proj-1" />);

      act(() => {
        capturedHandlers.onDragEnd?.({
          active: { id: 'task-a' },
          over: { id: 'column-done' },
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Network timeout')).toBeTruthy();
      });
    });
  });
});
