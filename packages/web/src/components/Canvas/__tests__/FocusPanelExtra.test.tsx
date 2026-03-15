// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const mockUseFocusAgent = vi.fn();
vi.mock('../../../hooks/useFocusAgent', () => ({
  useFocusAgent: (...args: unknown[]) => mockUseFocusAgent(...args),
}));

vi.mock('../../DiffPreview', () => ({
  DiffPreview: ({ diff }: { diff: unknown }) => <div data-testid="diff-preview">{JSON.stringify(diff)}</div>,
}));
vi.mock('../../Shared', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
  SkeletonCard: () => <div data-testid="skeleton-card">Loading...</div>,
}));
vi.mock('../../ui/Tabs', () => ({
  Tabs: ({ tabs, activeTab, onTabChange }: any) => (
    <div data-testid="tabs">
      {tabs.map((t: any) => (
        <button key={t.id} data-testid={`tab-${t.id}`} onClick={() => onTabChange(t.id)} aria-selected={activeTab === t.id}>
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

const mockAgent = {
  id: 'agent-001-full',
  role: { id: 'r1', name: 'Coder', icon: '💻', description: '', systemPrompt: '', color: '#fff', builtIn: false },
  status: 'working',
  model: 'sonnet',
  provider: 'anthropic',
  contextBurnRate: 12.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFocusAgent.mockReturnValue({
    data: {
      agent: mockAgent,
      recentOutput: 'hello',
      activities: [
        { id: 'a1', action: 'file_edit', agentId: 'agent-001', details: 'Edited App.tsx', timestamp: '2024-01-01T00:00:00Z' },
      ],
      decisions: [
        { id: 'd1', title: 'Use React', rationale: 'Better ecosystem' },
      ],
      fileLocks: [],
      diff: null,
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
});
afterEach(cleanup);

describe('FocusPanel — extra coverage', () => {
  it('shows "unknown" status when agent status is undefined', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: { ...mockAgent, status: undefined }, recentOutput: '', activities: [], decisions: [], fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('does not show provider when agent has no provider', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: { ...mockAgent, provider: undefined }, recentOutput: '', activities: [], decisions: [], fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    expect(screen.queryByText('anthropic')).not.toBeInTheDocument();
  });

  it('does not show burn rate when contextBurnRate is null', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: { ...mockAgent, contextBurnRate: null }, recentOutput: '', activities: [], decisions: [], fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    expect(screen.queryByText(/tok\/s/)).not.toBeInTheDocument();
  });

  it('messages tab shows activity details correctly', () => {
    mockUseFocusAgent.mockReturnValue({
      data: {
        agent: mockAgent,
        recentOutput: '',
        activities: [
          { id: 'a1', action: 'file_edit', details: null, timestamp: '2024-01-01T00:00:00Z' },
          { id: 'a2', action: 'commit', details: 'Committed changes', timestamp: '2024-01-01T00:00:01Z' },
        ],
        decisions: [],
        fileLocks: [],
        diff: null,
      },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-messages'));
    // When details is null, should show action
    expect(screen.getByText('file_edit')).toBeInTheDocument();
    expect(screen.getByText('Committed changes')).toBeInTheDocument();
  });

  it('tasks tab renders up to 20 decisions', () => {
    const decisions = Array.from({ length: 25 }, (_, i) => ({
      id: `d${i}`, title: `Decision ${i}`, rationale: `Rationale ${i}`,
    }));
    mockUseFocusAgent.mockReturnValue({
      data: { agent: mockAgent, recentOutput: '', activities: [], decisions, fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    // Should show first 20
    expect(screen.getByText('Decision 0')).toBeInTheDocument();
    expect(screen.getByText('Decision 19')).toBeInTheDocument();
    expect(screen.queryByText('Decision 20')).not.toBeInTheDocument();
  });

  it('does not show overview content when agent is null', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: null, recentOutput: '', activities: [], decisions: [], fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    // Overview tab is active by default but agent is null
    expect(screen.queryByText('anthropic')).not.toBeInTheDocument();
  });

  it('does not show tasks content when data.decisions is null', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: mockAgent, recentOutput: '', activities: [], decisions: null, fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    // decisions is null so content block won't render
    expect(screen.queryByText('No decisions recorded')).not.toBeInTheDocument();
  });

  it('does not show metrics content when agent is null', () => {
    mockUseFocusAgent.mockReturnValue({
      data: { agent: null, recentOutput: '', activities: [], decisions: [], fileLocks: [], diff: null },
      loading: false, error: null, refresh: vi.fn(),
    });
    render(<FocusPanel agentId="agent-001-full" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-metrics'));
    expect(screen.queryByText(/Token usage/)).not.toBeInTheDocument();
  });
});
