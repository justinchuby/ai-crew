// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockUseFocusAgent = vi.fn();
vi.mock('../../../hooks/useFocusAgent', () => ({
  useFocusAgent: (...args: unknown[]) => mockUseFocusAgent(...args),
}));
vi.mock('../../DiffPreview', () => ({
  DiffPreview: () => <div data-testid="diff-preview" />,
}));
vi.mock('../../Shared', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  SkeletonCard: () => <div>Loading...</div>,
}));
vi.mock('../../ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab, onTabChange }: any) => (
    <div data-testid="tabs">
      {tabs.map((t: any) => (
        <button key={t.id} data-testid={`tab-${t.id}`} onClick={() => onTabChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../../../utils/agentLabel', () => ({
  shortAgentId: (id: string) => id.slice(0, 8),
}));

import { FocusPanel } from '../FocusPanel';

const baseAgent = {
  id: 'agent-1', role: { id: 'r', name: 'Dev', icon: '💻', description: '', systemPrompt: '', color: '#fff', builtIn: false },
  status: 'working', model: 'sonnet', provider: 'anthropic',
};

describe('FocusPanel – safeText coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles object with type+summary in details', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: { type: 'file_edit', summary: 'Edited main.ts' }, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('file_edit: Edited main.ts')).toBeInTheDocument();
  });

  it('handles object with only label (type) field', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: { type: 'progress_update' }, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('progress_update')).toBeInTheDocument();
  });

  it('handles object with only detail field', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: { message: 'All tests passed' }, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('All tests passed')).toBeInTheDocument();
  });

  it('handles complex object falling back to JSON.stringify', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: { nested: { deep: true } }, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    // Should render JSON.stringify output
    expect(screen.getByText(/nested/)).toBeInTheDocument();
  });

  it('handles number detail value', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: 42, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('handles boolean detail value', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: true, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('handles null detail falling back to action', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'file_write', details: null, timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText('file_write')).toBeInTheDocument();
  });

  it('handles array detail value via JSON.stringify', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [{ id: 'a1', action: 'event', details: ['a', 'b'], timestamp: '2024-01-01T00:00:00Z' }],
        decisions: [], fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    expect(screen.getByText(/\["a","b"\]/)).toBeInTheDocument();
  });

  // Test decisions tab with object values for rationale
  it('handles object rationale in decisions', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: baseAgent, recentOutput: '',
        activities: [],
        decisions: [{ id: 'd1', title: { action: 'deploy', summary: 'Deploy to prod' }, rationale: { message: 'Stability verified' } }],
        fileLocks: [], diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    expect(screen.getByText('deploy: Deploy to prod')).toBeInTheDocument();
    expect(screen.getByText('Stability verified')).toBeInTheDocument();
  });
});
