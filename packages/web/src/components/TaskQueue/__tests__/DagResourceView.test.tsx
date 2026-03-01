/**
 * Tests for DagResourceView — agent-centric resource utilization view.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DagResourceView } from '../DagResourceView';
import type { DagStatus, DagTask } from '../../../types';

function makeTask(overrides: Partial<DagTask> & { id: string }): DagTask {
  return {
    leadId: 'lead-1',
    role: 'developer',
    description: 'Test task',
    files: [],
    dependsOn: [],
    dagStatus: 'running',
    priority: 1,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function makeDagStatus(tasks: DagTask[]): DagStatus {
  const summary = { pending: 0, ready: 0, running: 0, done: 0, failed: 0, blocked: 0, paused: 0, skipped: 0 };
  for (const t of tasks) summary[t.dagStatus]++;
  return { tasks, fileLockMap: {}, summary };
}

describe('DagResourceView', () => {
  it('shows empty state when no tasks', () => {
    render(<DagResourceView dagStatus={null} />);
    expect(screen.getByText(/no tasks to display/i)).toBeInTheDocument();
  });

  it('shows empty state for empty task array', () => {
    const status = makeDagStatus([]);
    render(<DagResourceView dagStatus={status} />);
    expect(screen.getByText(/no tasks to display/i)).toBeInTheDocument();
  });

  it('groups tasks by assigned agent', () => {
    const tasks = [
      makeTask({ id: 't1', assignedAgentId: 'agent-a', dagStatus: 'running' }),
      makeTask({ id: 't2', assignedAgentId: 'agent-a', dagStatus: 'done' }),
      makeTask({ id: 't3', assignedAgentId: 'agent-b', dagStatus: 'running' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    const agentIds = screen.getAllByTestId('agent-id');
    expect(agentIds).toHaveLength(2);
  });

  it('shows unassigned tasks in separate section', () => {
    const tasks = [
      makeTask({ id: 't1', assignedAgentId: 'agent-a', dagStatus: 'running' }),
      makeTask({ id: 't2', dagStatus: 'pending' }), // no agent
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('1 task')).toBeInTheDocument();
  });

  it('shows correct agent count', () => {
    const tasks = [
      makeTask({ id: 't1', assignedAgentId: 'agent-a', dagStatus: 'running' }),
      makeTask({ id: 't2', assignedAgentId: 'agent-b', dagStatus: 'done' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('2 agents assigned')).toBeInTheDocument();
  });

  it('shows progress percentage', () => {
    const tasks = [
      makeTask({ id: 't1', dagStatus: 'done' }),
      makeTask({ id: 't2', dagStatus: 'done' }),
      makeTask({ id: 't3', dagStatus: 'running' }),
      makeTask({ id: 't4', dagStatus: 'pending' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('2/4 done (50%)')).toBeInTheDocument();
  });

  it('shows task status badges', () => {
    const tasks = [
      makeTask({ id: 't1', assignedAgentId: 'agent-a', dagStatus: 'running' }),
      makeTask({ id: 't2', assignedAgentId: 'agent-a', dagStatus: 'done' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders task rows for each task', () => {
    const tasks = [
      makeTask({ id: 't1', assignedAgentId: 'agent-a', dagStatus: 'running' }),
      makeTask({ id: 't2', assignedAgentId: 'agent-a', dagStatus: 'done' }),
      makeTask({ id: 't3', dagStatus: 'pending' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    const rows = screen.getAllByTestId('resource-task-row');
    expect(rows).toHaveLength(3);
  });

  it('shows task title when available', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'My Important Task', assignedAgentId: 'agent-a', dagStatus: 'running' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('My Important Task')).toBeInTheDocument();
  });

  it('falls back to task id when no title', () => {
    const tasks = [
      makeTask({ id: 'task-xyz', assignedAgentId: 'agent-a', dagStatus: 'running' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('task-xyz')).toBeInTheDocument();
  });

  it('shows the role of the agent', () => {
    const tasks = [
      makeTask({ id: 't1', role: 'architect', assignedAgentId: 'agent-a', dagStatus: 'running' }),
    ];
    const status = makeDagStatus(tasks);
    render(<DagResourceView dagStatus={status} />);

    expect(screen.getByText('architect')).toBeInTheDocument();
  });
});
