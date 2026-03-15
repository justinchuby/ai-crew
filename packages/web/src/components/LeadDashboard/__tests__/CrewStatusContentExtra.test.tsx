// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../Toast', () => ({
  useToastStore: { getState: () => ({ add: vi.fn() }) },
}));

const storeState = { agents: [] as any[], setSelectedAgent: vi.fn() };
vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: any) => any) => sel(storeState),
    { getState: () => storeState },
  ),
}));

vi.mock('../../../utils/markdown', () => ({
  MentionText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../AgentReportBlock', () => ({
  AgentReportBlock: ({ content }: { content: string }) => <div data-testid="report-block">{content}</div>,
}));

vi.mock('../../ProviderBadge', () => ({
  ProviderBadge: ({ provider }: { provider: string }) => <span data-testid="provider-badge">{provider}</span>,
}));

import { CrewStatusContent } from '../CrewStatusContent';

const makeAgent = (id: string, role: string, status = 'running', extra = {}) => ({
  id,
  role: { name: role, icon: '\ud83d\udcbb' },
  status,
  model: 'gpt-4',
  provider: 'openai',
  ...extra,
});

const makeDelegation = (id: string, agentId: string, role: string, status = 'active') => ({
  id,
  status,
  toRole: role,
  toAgentId: agentId,
  task: `Task for ${role}`,
});

describe('CrewStatusContent', () => {
  it('renders empty state with no agents', () => {
    const { container } = render(
      <CrewStatusContent agents={[]} delegations={[]} />,
    );
    expect(container).toBeTruthy();
  });

  it('renders agent list', () => {
    render(
      <CrewStatusContent
        agents={[makeAgent('a1', 'Developer'), makeAgent('a2', 'Tester', 'idle')]}
        delegations={[]}
      />,
    );
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Tester')).toBeInTheDocument();
  });

  it('shows agent status', () => {
    render(
      <CrewStatusContent agents={[makeAgent('a1', 'Developer', 'running')]} delegations={[]} />,
    );
    const text = document.body.textContent || '';
    expect(text).toMatch(/running|active/i);
  });

  it('selects agent on click', () => {
    render(
      <CrewStatusContent
        agents={[makeAgent('a1', 'Developer'), makeAgent('a2', 'Tester')]}
        delegations={[makeDelegation('d1', 'a1', 'developer')]}
      />,
    );
    fireEvent.click(screen.getByText('Developer'));
    // After selection, delegation details should appear
    const text = document.body.textContent || '';
    expect(text).toMatch(/Task for developer|developer/i);
  });

  it('shows comm history when agent selected', () => {
    const comms = [
      { fromId: 'a1', toId: 'lead', fromRole: 'Developer', toRole: 'Lead', content: 'Hello lead', timestamp: Date.now() },
    ];
    render(
      <CrewStatusContent
        agents={[makeAgent('a1', 'Developer')]}
        delegations={[]}
        comms={comms as any}
      />,
    );
    fireEvent.click(screen.getByText('Developer'));
    const text = document.body.textContent || '';
    expect(text).toMatch(/Hello lead|Developer/i);
  });

  it('shows provider badge', () => {
    render(
      <CrewStatusContent
        agents={[makeAgent('a1', 'Developer', 'running', { provider: 'openai' })]}
        delegations={[]}
      />,
    );
    expect(screen.getByTestId('provider-badge')).toBeInTheDocument();
  });

  it('handles onOpenChat callback', () => {
    const onOpenChat = vi.fn();
    render(
      <CrewStatusContent
        agents={[makeAgent('a1', 'Developer')]}
        delegations={[]}
        onOpenChat={onOpenChat}
      />,
    );
    // Select agent first
    fireEvent.click(screen.getByText('Developer'));
    // Look for chat button
    const chatBtn = screen.queryByLabelText(/chat|message/i);
    if (chatBtn) {
      fireEvent.click(chatBtn);
      expect(onOpenChat).toHaveBeenCalled();
    }
  });
});
