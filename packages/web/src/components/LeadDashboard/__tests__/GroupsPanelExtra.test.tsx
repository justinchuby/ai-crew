// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

const storeState = { agents: [], setSelectedAgent: vi.fn() };
vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: (s: any) => any) => sel(storeState),
    { getState: () => storeState },
  ),
}));

vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    (sel: (s: any) => any) => sel({ projects: {} }),
    { getState: () => ({ projects: {} }) },
  ),
}));

vi.mock('../../../utils/markdown', () => ({
  MentionText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../CommsPanel', () => ({
  roleColor: () => 'text-blue-400',
}));

import { GroupsPanelContent } from '../GroupsPanel';

describe('GroupsPanelContent extra', () => {
  const makeGroup = (name: string, memberIds: string[] = ['a1']) => ({
    name,
    leadId: 'lead-1',
    memberIds,
    createdAt: new Date().toISOString(),
  });

  it('renders group list', () => {
    render(
      <GroupsPanelContent
        groups={[makeGroup('Backend'), makeGroup('Frontend')]}
        groupMessages={{}}
        leadId="lead-1"
      />,
    );
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });

  it('renders empty groups', () => {
    const { container } = render(
      <GroupsPanelContent groups={[]} groupMessages={{}} leadId="lead-1" />,
    );
    expect(container).toBeTruthy();
  });

  it('shows member count', () => {
    render(
      <GroupsPanelContent
        groups={[makeGroup('Crew', ['a1', 'a2', 'a3'])]}
        groupMessages={{}}
        leadId="lead-1"
      />,
    );
    const text = document.body.textContent || '';
    expect(text).toMatch(/3/);
  });

  it('expands group on click', () => {
    const groupMsgs = {
      'Team': [{
        id: 'gm1',
        groupName: 'Team',
        leadId: 'lead-1',
        fromAgentId: 'a1',
        fromRole: 'Developer',
        content: 'Hello team',
        reactions: {},
        timestamp: new Date().toISOString(),
      }],
    };
    render(
      <GroupsPanelContent
        groups={[makeGroup('Team')]}
        groupMessages={groupMsgs as any}
        leadId="lead-1"
      />,
    );
    fireEvent.click(screen.getByText('Team'));
    expect(screen.getByText('Hello team')).toBeInTheDocument();
  });
});
