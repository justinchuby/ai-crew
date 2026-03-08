/**
 * Unit tests for KanbanBoard component.
 *
 * Covers: column rendering, task grouping by status, card display,
 * empty state, hide-empty toggle, column collapse, task sorting,
 * expanded card details, and dependency rendering.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { KanbanBoard } from '../KanbanBoard';
import type { DagStatus, DagTask, DagTaskStatus } from '../../../types';

// ── Fixtures ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<DagTask> = {}): DagTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 6)}`,
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

// ── Tests ─────────────────────────────────────────────────────────

describe('KanbanBoard', () => {
  describe('empty state', () => {
    it('shows empty message when dagStatus is null', () => {
      render(<KanbanBoard dagStatus={null} />);
      expect(screen.getByText('No tasks to display')).toBeTruthy();
    });

    it('shows empty message when no tasks', () => {
      render(<KanbanBoard dagStatus={makeDagStatus([])} />);
      expect(screen.getByText('No tasks to display')).toBeTruthy();
    });
  });

  describe('column rendering', () => {
    it('renders all 8 status columns by default', () => {
      const tasks = [makeTask({ dagStatus: 'running', id: 'r1' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const statuses: DagTaskStatus[] = ['pending', 'ready', 'running', 'blocked', 'done', 'failed', 'paused', 'skipped'];
      for (const status of statuses) {
        expect(screen.getByTestId(`kanban-column-${status}`)).toBeTruthy();
      }
    });

    it('shows task count badges in column headers', () => {
      const tasks = [
        makeTask({ dagStatus: 'running', id: 'r1' }),
        makeTask({ dagStatus: 'running', id: 'r2' }),
        makeTask({ dagStatus: 'done', id: 'd1' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const runningCol = screen.getByTestId('kanban-column-running');
      expect(within(runningCol).getByText('2')).toBeTruthy();

      const doneCol = screen.getByTestId('kanban-column-done');
      expect(within(doneCol).getByText('1')).toBeTruthy();
    });

    it('shows "No tasks" in empty columns', () => {
      const tasks = [makeTask({ dagStatus: 'running', id: 'r1' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const pendingCol = screen.getByTestId('kanban-column-pending');
      expect(within(pendingCol).getByText('No tasks')).toBeTruthy();
    });
  });

  describe('task grouping', () => {
    it('places tasks in the correct columns by status', () => {
      const tasks = [
        makeTask({ dagStatus: 'pending', id: 'p1', title: 'Pending Task' }),
        makeTask({ dagStatus: 'running', id: 'r1', title: 'Running Task' }),
        makeTask({ dagStatus: 'done', id: 'd1', title: 'Done Task' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const pendingCol = screen.getByTestId('kanban-column-pending');
      expect(within(pendingCol).getByText('Pending Task')).toBeTruthy();

      const runningCol = screen.getByTestId('kanban-column-running');
      expect(within(runningCol).getByText('Running Task')).toBeTruthy();

      const doneCol = screen.getByTestId('kanban-column-done');
      expect(within(doneCol).getByText('Done Task')).toBeTruthy();
    });
  });

  describe('task card', () => {
    it('displays task title and role', () => {
      const tasks = [makeTask({ id: 't1', title: 'Build widget', role: 'architect' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      expect(screen.getByText('Build widget')).toBeTruthy();
      expect(screen.getByText('architect')).toBeTruthy();
    });

    it('falls back to description when title is empty', () => {
      const tasks = [makeTask({ id: 't1', title: undefined, description: 'Fallback description' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      expect(screen.getByText('Fallback description')).toBeTruthy();
    });

    it('shows priority badge for priority > 0', () => {
      const tasks = [makeTask({ id: 't1', priority: 2 })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      expect(screen.getByText('P2')).toBeTruthy();
    });

    it('does not show priority badge for priority 0', () => {
      const tasks = [makeTask({ id: 't1', priority: 0 })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      expect(screen.queryByText('P0')).toBeNull();
    });
  });

  describe('task sorting', () => {
    it('sorts tasks by priority desc within a column', () => {
      const tasks = [
        makeTask({ dagStatus: 'ready', id: 'lo', title: 'Low prio', priority: 1, createdAt: '2026-03-01T00:00:00Z' }),
        makeTask({ dagStatus: 'ready', id: 'hi', title: 'High prio', priority: 3, createdAt: '2026-03-02T00:00:00Z' }),
        makeTask({ dagStatus: 'ready', id: 'mid', title: 'Mid prio', priority: 2, createdAt: '2026-03-03T00:00:00Z' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const readyCol = screen.getByTestId('kanban-column-ready');
      const cards = within(readyCol).getAllByText(/prio/i);
      expect(cards[0].textContent).toBe('High prio');
      expect(cards[1].textContent).toBe('Mid prio');
      expect(cards[2].textContent).toBe('Low prio');
    });
  });

  describe('hide empty columns', () => {
    it('hides columns with no tasks when toggled', () => {
      const tasks = [makeTask({ dagStatus: 'running', id: 'r1' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      // All columns visible initially
      expect(screen.getByTestId('kanban-column-pending')).toBeTruthy();

      // Toggle hide empty
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Pending should be gone, running should remain
      expect(screen.queryByTestId('kanban-column-pending')).toBeNull();
      expect(screen.getByTestId('kanban-column-running')).toBeTruthy();
    });
  });

  describe('column collapse', () => {
    it('collapses a column when header is clicked', () => {
      const tasks = [makeTask({ dagStatus: 'running', id: 'r1', title: 'My Task' })];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      // Task card is visible
      expect(screen.getByText('My Task')).toBeTruthy();

      // Click column header to collapse
      const runningCol = screen.getByTestId('kanban-column-running');
      const headerButton = within(runningCol).getAllByRole('button')[0];
      fireEvent.click(headerButton);

      // Task card should be hidden after collapse
      expect(screen.queryByText('My Task')).toBeNull();

      // Click again to expand
      fireEvent.click(headerButton);
      expect(screen.getByText('My Task')).toBeTruthy();
    });
  });

  describe('expanded card details', () => {
    it('shows dependencies when card is expanded', () => {
      const tasks = [
        makeTask({ id: 'dep-1', title: 'Dep One', dagStatus: 'done' }),
        makeTask({ id: 'main', title: 'Main Task', dagStatus: 'running', dependsOn: ['dep-1'] }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      // Click the main task card to expand
      const card = screen.getByTestId('kanban-card-main');
      fireEvent.click(card);

      // Should show dependency info
      expect(screen.getByText('Dependencies:')).toBeTruthy();
      // The dependency label appears inside the running column's expanded card
      const runningCol = screen.getByTestId('kanban-column-running');
      expect(within(runningCol).getByText('Dep One')).toBeTruthy();
    });

    it('shows files when card is expanded', () => {
      const tasks = [
        makeTask({
          id: 'f1',
          title: 'File Task',
          dagStatus: 'running',
          files: ['src/index.ts', 'src/utils.ts'],
        }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const card = screen.getByTestId('kanban-card-f1');
      fireEvent.click(card);

      expect(screen.getByText('src/index.ts')).toBeTruthy();
      expect(screen.getByText('src/utils.ts')).toBeTruthy();
    });

    it('shows assigned agent when card is expanded', () => {
      const tasks = [
        makeTask({ id: 'a1', title: 'Agent Task', dagStatus: 'running', assignedAgentId: 'agent-abc123' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      const card = screen.getByTestId('kanban-card-a1');
      fireEvent.click(card);

      expect(screen.getByText(/Agent:/)).toBeTruthy();
    });
  });

  describe('summary toolbar', () => {
    it('shows total task count', () => {
      const tasks = [
        makeTask({ dagStatus: 'pending', id: 'p1' }),
        makeTask({ dagStatus: 'running', id: 'r1' }),
        makeTask({ dagStatus: 'done', id: 'd1' }),
      ];
      render(<KanbanBoard dagStatus={makeDagStatus(tasks)} />);

      expect(screen.getByText(/3 tasks/)).toBeTruthy();
    });
  });
});
