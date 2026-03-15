// @vitest-environment jsdom
/**
 * Coverage tests for GroupsPanel — historical groups, group expansion,
 * message fetching, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ChatGroup, GroupMessage } from '../../../types';

const mockApiFetch = vi.fn();
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    (sel: any) => sel({
      projects: {},
      addGroupMessage: vi.fn(),
    }),
    {
      getState: () => ({
        projects: {},
        addGroupMessage: vi.fn(),
      }),
    },
  ),
}));

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: any) => sel({ agents: [], setSelectedAgent: vi.fn() }),
    { getState: () => ({ agents: [], setSelectedAgent: vi.fn() }) },
  ),
}));

vi.mock('../../../utils/markdown', () => ({
  MentionText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../../../utils/agentLabel', () => ({
  shortAgentId: (id: string) => id.slice(0, 8),
}));

vi.mock('../CommsPanel', () => ({
  roleColor: () => 'text-cyan-400',
}));

import { GroupsPanelContent } from '../GroupsPanel';

const makeGroup = (name: string, members: string[] = ['a1', 'a2']): ChatGroup => ({
  name,
  leadId: 'lead-1',
  memberIds: members,
  createdAt: '2024-01-01T00:00:00Z',
});

const makeMsg = (id: string, content: string): GroupMessage => ({
  id,
  groupName: 'test-group',
  fromAgentId: 'a1',
  fromRole: 'Developer',
  content,
  timestamp: '2024-01-01T00:00:00Z',
} as GroupMessage);

describe('GroupsPanelContent — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue([]);
  });

  it('shows "No groups yet" when no groups', () => {
    render(<GroupsPanelContent groups={[]} groupMessages={{}} leadId="lead-1" />);
    expect(screen.getByText('No groups yet')).toBeInTheDocument();
  });

  it('renders groups with member counts', () => {
    const groups = [makeGroup('frontend-team'), makeGroup('backend-team', ['a1', 'a2', 'a3'])];
    render(<GroupsPanelContent groups={groups} groupMessages={{}} leadId="lead-1" />);
    expect(screen.getByText('frontend-team')).toBeInTheDocument();
    expect(screen.getByText('backend-team')).toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
  });

  it('expands a group to show messages', () => {
    const groups = [makeGroup('test-group')];
    const msgs = { 'test-group': [makeMsg('m1', 'Hello team')] };
    render(<GroupsPanelContent groups={groups} groupMessages={msgs} leadId="lead-1" />);

    fireEvent.click(screen.getByText('test-group'));
    expect(screen.getByText('Hello team')).toBeInTheDocument();
  });

  it('collapses an expanded group', () => {
    const groups = [makeGroup('test-group')];
    const msgs = { 'test-group': [makeMsg('m1', 'Hello team')] };
    render(<GroupsPanelContent groups={groups} groupMessages={msgs} leadId="lead-1" />);

    fireEvent.click(screen.getByText('test-group'));
    expect(screen.getByText('Hello team')).toBeInTheDocument();

    fireEvent.click(screen.getByText('test-group'));
    expect(screen.queryByText('Hello team')).not.toBeInTheDocument();
  });

  it('shows "No messages" for empty group', () => {
    const groups = [makeGroup('empty-group')];
    render(<GroupsPanelContent groups={groups} groupMessages={{}} leadId="lead-1" />);

    fireEvent.click(screen.getByText('empty-group'));
    expect(screen.getByText('No messages')).toBeInTheDocument();
  });

  it('fetches historical groups when no live groups exist', async () => {
    mockApiFetch.mockResolvedValue([
      { name: 'old-group', leadId: 'l1', memberIds: ['a1'], messageCount: 5, createdAt: '2024-01-01T00:00:00Z' },
    ]);
    render(<GroupsPanelContent groups={[]} groupMessages={{}} leadId="lead-1" projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('old-group')).toBeInTheDocument();
    });
    expect(screen.getByText('Historical group chats')).toBeInTheDocument();
  });

  it('does not fetch historical groups when live groups exist', () => {
    render(
      <GroupsPanelContent
        groups={[makeGroup('live-group')]}
        groupMessages={{}}
        leadId="lead-1"
        projectId="proj-1"
      />,
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
