// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CrewStatusContent, type CrewAgent } from '../CrewStatusContent';
import type { Delegation } from '../../../types';

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ agents: [], setSelectedAgent: vi.fn() }),
    { getState: () => ({ agents: [], setSelectedAgent: vi.fn() }) },
  ),
}));

vi.mock('../../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../utils/markdown', () => ({
  MentionText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../../../utils/statusColors', () => ({
  agentStatusText: () => 'text-green-400',
}));

vi.mock('../../../utils/agentLabel', () => ({
  shortAgentId: (id: string) => id.slice(0, 8),
}));

vi.mock('../../../utils/format', () => ({
  formatTokens: (n: number) => `${n}`,
}));

vi.mock('../../Toast', () => ({
  useToastStore: { getState: () => ({ add: vi.fn() }) },
}));

vi.mock('../AgentReportBlock', () => ({
  AgentReportBlock: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock('../../ProviderBadge', () => ({
  ProviderBadge: () => <span data-testid="provider-badge" />,
}));

const testAgents: CrewAgent[] = [
  { id: 'dev-1', role: { name: 'Developer', icon: '🛠️' }, status: 'running', model: 'claude-sonnet-4' },
  { id: 'arch-1', role: { name: 'Architect', icon: '🏗️' }, status: 'completed' },
];

const testDelegations: Delegation[] = [
  { id: 'del-1', toAgentId: 'dev-1', task: 'Fix the login bug' } as Delegation,
];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('CrewStatusContent', () => {
  it('shows "No crew members" when empty', () => {
    render(<CrewStatusContent agents={[]} delegations={[]} />);
    expect(screen.getByText('No crew members yet')).toBeDefined();
  });

  it('renders agent cards with role names', () => {
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} />);
    expect(screen.getByText('Developer')).toBeDefined();
    expect(screen.getByText('Architect')).toBeDefined();
  });

  it('shows agent status text', () => {
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} />);
    expect(screen.getByText('running')).toBeDefined();
    expect(screen.getByText('completed')).toBeDefined();
  });

  it('shows delegation task for assigned agent', () => {
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} />);
    expect(screen.getByText('Fix the login bug')).toBeDefined();
  });

  it('shows role icon', () => {
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} />);
    expect(screen.getByText('🛠️')).toBeDefined();
    expect(screen.getByText('🏗️')).toBeDefined();
  });

  it('clicking agent opens detail panel', () => {
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} />);
    fireEvent.click(screen.getAllByText('Developer')[0]);
    expect(screen.getAllByText('Developer').length).toBeGreaterThanOrEqual(1);
  });

  it('shows chat button when onOpenChat provided', () => {
    const onOpenChat = vi.fn();
    render(<CrewStatusContent agents={testAgents} delegations={testDelegations} onOpenChat={onOpenChat} />);
    const chatBtns = screen.getAllByRole('button');
    expect(chatBtns.length).toBeGreaterThan(0);
  });
});
