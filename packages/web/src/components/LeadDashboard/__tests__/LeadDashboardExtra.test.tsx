// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    vi.fn((sel: any) =>
      sel({
        projects: {},
        selectedLeadId: null,
        drafts: {},
      }),
    ),
    { getState: () => ({ setDraft: vi.fn(), projects: {} }) },
  ),
}));

vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    vi.fn((sel: any) => sel({ agents: [] })),
    { getState: () => ({ setSelectedAgent: vi.fn(), agents: [] }) },
  ),
}));

vi.mock('../../../stores/timerStore', () => ({
  useTimerStore: vi.fn(() => 0),
  selectActiveTimerCount: vi.fn(),
}));

vi.mock('../../../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ connected: false, subscribe: vi.fn() }),
}));

vi.mock('../../../hooks/useHistoricalAgents', () => ({
  useHistoricalAgents: () => ({ agents: [] }),
}));

vi.mock('../../../hooks/useFileDrop', () => ({
  useFileDrop: () => ({
    isDragOver: false,
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    handlePaste: vi.fn(),
    dropZoneClassName: '',
  }),
}));

vi.mock('../../../hooks/useAttachments', () => ({
  useAttachments: () => ({
    attachments: [],
    addAttachment: vi.fn(),
    removeAttachment: vi.fn(),
    clearAttachments: vi.fn(),
  }),
}));

vi.mock('../useLeadWebSocket', () => ({ useLeadWebSocket: vi.fn() }));
vi.mock('../useDragResize', () => ({ useDragResize: () => vi.fn() }));
vi.mock('../useLeadPolling', () => ({ useLeadPolling: vi.fn() }));
vi.mock('../useLeadMessages', () => ({ useLeadMessages: vi.fn() }));
vi.mock('../useCatchUpSummary', () => ({
  useCatchUpSummary: () => ({ catchUpSummary: null, dismissCatchUp: vi.fn() }),
}));
vi.mock('../useDecisionActions', () => ({
  useDecisionActions: () => ({
    handleConfirmDecision: vi.fn(),
    handleRejectDecision: vi.fn(),
    handleDismissDecision: vi.fn(),
  }),
}));
vi.mock('../useMessageActions', () => ({
  useMessageActions: () => ({
    sendMessage: vi.fn(),
    removeQueuedMessage: vi.fn(),
    reorderQueuedMessage: vi.fn(),
  }),
}));

vi.mock('../InputComposer', () => ({ InputComposer: () => <div data-testid="input-composer" /> }));
vi.mock('../ChatMessages', () => ({ ChatMessages: () => <div data-testid="chat-messages" /> }));
vi.mock('../SidebarTabs', () => ({ SidebarTabs: () => <div data-testid="sidebar-tabs" /> }));
vi.mock('../CrewStatusContent', () => ({ CrewStatusContent: () => null }));
vi.mock('../NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../ProgressDetailModal', () => ({
  ProgressDetailModal: () => null,
  AgentReportDetailModal: () => null,
}));
vi.mock('../LeadProgressBanner', () => ({ LeadProgressBanner: () => null }));
vi.mock('../LeadAgentReportsBanner', () => ({ LeadAgentReportsBanner: () => null }));
vi.mock('../LeadPendingDecisionsBanner', () => ({ LeadPendingDecisionsBanner: () => null }));
vi.mock('../LeadSessionInfoBar', () => ({ LeadSessionInfoBar: () => null }));
vi.mock('../../DropOverlay', () => ({ DropOverlay: () => null }));

import { LeadDashboard } from '../LeadDashboard';
import { useLeadStore } from '../../../stores/leadStore';
import { useAppStore } from '../../../stores/appStore';

describe('LeadDashboard — extra coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default behavior  
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({ projects: {}, selectedLeadId: null, drafts: {} }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({ agents: [] }),
    );
    try { localStorage.removeItem('flightdeck-sidebar-tabs'); localStorage.removeItem('flightdeck-hidden-tabs'); } catch {}
  });

  it('resolves project:xxx prefix to actual lead agent', () => {
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({
        projects: { 'project:p1': { messages: [], decisions: [] } },
        selectedLeadId: 'project:p1',
        drafts: {},
      }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({
        agents: [
          { id: 'lead-abc', projectId: 'p1', status: 'running', role: { id: 'lead', name: 'Lead' }, parentId: null },
        ],
      }),
    );
    render(<LeadDashboard />);
    // Should render the chat area since a selectedLeadId is present
    expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-tabs')).toBeInTheDocument();
  });

  it('renders empty state with Crown icon when no lead selected', () => {
    render(<LeadDashboard />);
    expect(screen.getByText(/Select a project or create a new one/)).toBeInTheDocument();
  });

  it('uses lead projectId for historicalProjectId when no project: prefix', () => {
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({
        projects: { 'lead-123': { messages: [], decisions: [] } },
        selectedLeadId: 'lead-123',
        drafts: {},
      }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({
        agents: [
          { id: 'lead-123', projectId: 'my-proj', status: 'running', role: { id: 'lead', name: 'Lead' }, parentId: null },
        ],
      }),
    );
    render(<LeadDashboard />);
    expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
  });

  it('uses selectedLeadId as fallback when lead has no projectId', () => {
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({
        projects: { 'lead-xyz': { messages: [], decisions: [] } },
        selectedLeadId: 'lead-xyz',
        drafts: {},
      }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({
        agents: [
          { id: 'lead-xyz', status: 'running', role: { id: 'lead', name: 'Lead' }, parentId: null },
        ],
      }),
    );
    render(<LeadDashboard />);
    expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
  });

  it('renders read-only mode for project: prefix lead', () => {
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({
        projects: { 'project:p1': { messages: [], decisions: [] } },
        selectedLeadId: 'project:p1',
        drafts: {},
      }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({ agents: [] }),
    );
    render(<LeadDashboard readOnly />);
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it('uses empty draft when no draft for selected lead', () => {
    vi.mocked(useLeadStore).mockImplementation((sel: any) =>
      sel({
        projects: { 'lead-1': { messages: [], decisions: [] } },
        selectedLeadId: 'lead-1',
        drafts: { 'lead-2': 'some draft' }, // different lead
      }),
    );
    vi.mocked(useAppStore).mockImplementation((sel: any) =>
      sel({
        agents: [{ id: 'lead-1', status: 'running', role: { id: 'lead', name: 'Lead' } }],
      }),
    );
    render(<LeadDashboard />);
    expect(screen.getByTestId('input-composer')).toBeInTheDocument();
  });
});
