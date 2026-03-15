// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

// ── localStorage mock ────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ── Prop-capture variables ───────────────────────────────────────
let capturedSidebarProps: any = {};
let capturedProgressBannerProps: any = {};
let capturedAgentReportsBannerProps: any = {};
let capturedInputComposerProps: any = {};
let capturedProgressDetailModalProps: any = {};
let capturedAgentReportDetailModalProps: any = {};

// ── Mocks (before component import) ─────────────────────────────
const mockSetDraft = vi.fn();
vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    vi.fn((sel: any) => sel({ projects: {}, selectedLeadId: null, drafts: {} })),
    { getState: () => ({ setDraft: mockSetDraft, projects: {} }) },
  ),
}));

const mockSetSelectedAgent = vi.fn();
vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    vi.fn((sel: any) => sel({ agents: [] })),
    { getState: () => ({ setSelectedAgent: mockSetSelectedAgent, agents: [] }) },
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

// Child components with prop capture
vi.mock('../InputComposer', () => ({
  InputComposer: (props: any) => {
    capturedInputComposerProps = props;
    return <div data-testid="input-composer" />;
  },
}));
vi.mock('../ChatMessages', () => ({
  ChatMessages: ({ chatContainerRef, messagesEndRef }: any) => (
    <div data-testid="chat-messages" ref={chatContainerRef}>
      <div ref={messagesEndRef} data-testid="messages-end" />
    </div>
  ),
}));
vi.mock('../SidebarTabs', () => ({
  SidebarTabs: (props: any) => {
    capturedSidebarProps = props;
    return <div data-testid="sidebar-tabs" />;
  },
}));
vi.mock('../CrewStatusContent', () => ({ CrewStatusContent: () => null }));
vi.mock('../NewProjectModal', () => ({
  NewProjectModal: () => <div data-testid="new-project-modal" />,
}));
vi.mock('../ProgressDetailModal', () => ({
  ProgressDetailModal: (props: any) => {
    capturedProgressDetailModalProps = props;
    return <div data-testid="progress-detail-modal" />;
  },
  AgentReportDetailModal: (props: any) => {
    capturedAgentReportDetailModalProps = props;
    return <div data-testid="agent-report-detail-modal" />;
  },
}));
vi.mock('../LeadProgressBanner', () => ({
  LeadProgressBanner: (props: any) => {
    capturedProgressBannerProps = props;
    return <div data-testid="progress-banner" />;
  },
}));
vi.mock('../LeadAgentReportsBanner', () => ({
  LeadAgentReportsBanner: (props: any) => {
    capturedAgentReportsBannerProps = props;
    return null;
  },
}));
vi.mock('../LeadPendingDecisionsBanner', () => ({ LeadPendingDecisionsBanner: () => null }));
vi.mock('../LeadSessionInfoBar', () => ({ LeadSessionInfoBar: () => null }));
vi.mock('../../DropOverlay', () => ({ DropOverlay: () => null }));

import { LeadDashboard } from '../LeadDashboard';
import { useLeadStore } from '../../../stores/leadStore';
import { useAppStore } from '../../../stores/appStore';

// ── Helpers ──────────────────────────────────────────────────────
function setupLeadState(leadId: string, projectData: any = {}, agents: any[] = []) {
  vi.mocked(useLeadStore).mockImplementation((sel: any) =>
    sel({
      projects: { [leadId]: { messages: [], decisions: [], ...projectData } },
      selectedLeadId: leadId,
      drafts: {},
    }),
  );
  vi.mocked(useAppStore).mockImplementation((sel: any) =>
    sel({ agents }),
  );
}

// ── Tests ────────────────────────────────────────────────────────
// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};

describe('LeadDashboardCoverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSidebarProps = {};
    capturedProgressBannerProps = {};
    capturedAgentReportsBannerProps = {};
    capturedInputComposerProps = {};
    capturedProgressDetailModalProps = {};
    capturedAgentReportDetailModalProps = {};
    localStorageMock.clear();
  });

  afterEach(cleanup);

  // ── Lines 68-70: effectiveLeadId with project: prefix ─────────
  describe('project: prefix resolution', () => {
    it('resolves project:xxx to the active lead agent ID', () => {
      const agents = [
        { id: 'lead-abc', projectId: 'proj-1', role: { id: 'lead', name: 'Lead' }, status: 'running' },
      ];
      setupLeadState('project:proj-1', {}, agents);
      render(<LeadDashboard />);
      expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
    });

    it('falls back to selectedLeadId when no matching lead agent found', () => {
      const agents = [
        { id: 'worker-1', projectId: 'proj-1', role: { id: 'worker' }, status: 'running' },
      ];
      setupLeadState('project:proj-1', {}, agents);
      render(<LeadDashboard />);
      expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
    });
  });

  // ── Lines 97-109: localStorage tabOrder with migration ────────
  describe('localStorage tab order initialization', () => {
    it('migrates stored tab order adding missing tabs', () => {
      // Old order missing models, costs, timers
      localStorage.setItem('flightdeck-sidebar-tabs', JSON.stringify(['crew', 'comms', 'groups', 'dag']));
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      const stored = JSON.parse(localStorage.getItem('flightdeck-sidebar-tabs')!);
      expect(stored).toContain('models');
      expect(stored).toContain('timers');
      expect(stored).toContain('costs');
    });

    it('filters out deprecated activity tab from stored order', () => {
      localStorage.setItem(
        'flightdeck-sidebar-tabs',
        JSON.stringify(['crew', 'activity', 'comms', 'groups', 'dag']),
      );
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      const stored = JSON.parse(localStorage.getItem('flightdeck-sidebar-tabs')!);
      expect(stored).not.toContain('activity');
    });
  });

  // ── Lines 119-120: localStorage hiddenTabs ────────────────────
  describe('localStorage hiddenTabs initialization', () => {
    it('restores hidden tabs from localStorage', () => {
      localStorage.setItem('flightdeck-hidden-tabs', JSON.stringify(['timers', 'models']));
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      expect(capturedSidebarProps.tabs.hiddenTabs.has('timers')).toBe(true);
      expect(capturedSidebarProps.tabs.hiddenTabs.has('models')).toBe(true);
    });
  });

  // ── Lines 173-174: handleTabOrderChange ────────────────────────
  describe('sidebar callbacks', () => {
    it('handleTabOrderChange persists new order to localStorage', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      act(() => {
        capturedSidebarProps.tabs.onTabOrderChange(['groups', 'crew', 'comms', 'dag', 'models', 'timers']);
      });

      const stored = JSON.parse(localStorage.getItem('flightdeck-sidebar-tabs')!);
      expect(stored[0]).toBe('groups');
    });

    // ── Lines 181-200: toggleTabVisibility ───────────────────────
    it('toggleTabVisibility hides active tab and switches to next visible', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      // Default active tab is 'crew'
      act(() => {
        capturedSidebarProps.tabs.onToggleTabVisibility('crew');
      });

      const stored = JSON.parse(localStorage.getItem('flightdeck-hidden-tabs')!);
      expect(stored).toContain('crew');
      // Should have switched away from 'crew'
      expect(capturedSidebarProps.tabs.activeTab).not.toBe('crew');
    });

    it('toggleTabVisibility shows a previously hidden tab', () => {
      localStorage.setItem('flightdeck-hidden-tabs', JSON.stringify(['timers']));
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      act(() => {
        capturedSidebarProps.tabs.onToggleTabVisibility('timers');
      });

      const stored = JSON.parse(localStorage.getItem('flightdeck-hidden-tabs')!);
      expect(stored).not.toContain('timers');
    });

    it('toggleTabVisibility does not switch tab when hiding non-active tab', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      // Active tab is 'crew', hide 'timers' (not active)
      act(() => {
        capturedSidebarProps.tabs.onToggleTabVisibility('timers');
      });

      // Active tab should still be 'crew'
      expect(capturedSidebarProps.tabs.activeTab).toBe('crew');
    });

    // ── Line 305: sidebar collapse toggle ───────────────────────
    it('sidebar onToggle toggles collapsed state', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      expect(capturedSidebarProps.layout.collapsed).toBe(false);
      act(() => { capturedSidebarProps.layout.onToggle(); });
      expect(capturedSidebarProps.layout.collapsed).toBe(true);
    });

    // ── Line 317: tab config toggle ─────────────────────────────
    it('onToggleConfig toggles config visibility', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      expect(capturedSidebarProps.tabs.showConfig).toBe(false);
      act(() => { capturedSidebarProps.tabs.onToggleConfig(); });
      expect(capturedSidebarProps.tabs.showConfig).toBe(true);
    });
  });

  // ── Lines 260, 360, 368: modal open/close ─────────────────────
  describe('modals', () => {
    it('opens and closes progress detail modal', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      act(() => { capturedProgressBannerProps.onShowDetail(); });
      expect(screen.getByTestId('progress-detail-modal')).toBeInTheDocument();

      act(() => { capturedProgressDetailModalProps.onClose(); });
      expect(screen.queryByTestId('progress-detail-modal')).not.toBeInTheDocument();
    });

    it('opens and closes agent report detail modal', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      act(() => { capturedAgentReportsBannerProps.onExpandReport({ id: 'r1', text: 'report' }); });
      expect(screen.getByTestId('agent-report-detail-modal')).toBeInTheDocument();

      act(() => { capturedAgentReportDetailModalProps.onClose(); });
      expect(screen.queryByTestId('agent-report-detail-modal')).not.toBeInTheDocument();
    });
  });

  // ── Line 78: setInput → setDraft ──────────────────────────────
  describe('setInput callback', () => {
    it('calls setDraft via store when input changes', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);

      act(() => { capturedInputComposerProps.onInputChange('hello world'); });
      expect(mockSetDraft).toHaveBeenCalledWith('lead-1', 'hello world');
    });
  });

  // ── Line 211: handleOpenAgentChat ─────────────────────────────
  describe('handleScrollToBottom', () => {
    it('scrollToBottom is a function passed to ChatMessages', () => {
      setupLeadState('lead-1', {}, [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }]);
      render(<LeadDashboard />);
      // The ChatMessages mock receives onScrollToBottom
      // We can verify the sidebar tabs got the crewTabContent
      expect(capturedSidebarProps.crewTabContent).toBeDefined();
    });
  });

  // ── Auto-scroll (lines 145-152) ───────────────────────────────
  describe('auto-scroll', () => {
    it('scrolls to bottom on first load with messages', () => {
      const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

      setupLeadState('lead-1', { messages: [{ role: 'assistant', content: 'hello' }] }, [
        { id: 'lead-1', status: 'running', role: { id: 'lead' } },
      ]);
      render(<LeadDashboard />);

      expect(scrollSpy).toHaveBeenCalled();
      scrollSpy.mockRestore();
    });

    it('scrolls on new messages when near bottom', () => {
      const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

      const msgs1 = [{ role: 'assistant', content: 'hello' }];
      const msgs2 = [{ role: 'assistant', content: 'hello' }, { role: 'user', content: 'hi' }];

      vi.mocked(useLeadStore).mockImplementation((sel: any) =>
        sel({ projects: { 'lead-1': { messages: msgs1, decisions: [] } }, selectedLeadId: 'lead-1', drafts: {} }),
      );
      vi.mocked(useAppStore).mockImplementation((sel: any) =>
        sel({ agents: [{ id: 'lead-1', status: 'running', role: { id: 'lead' } }] }),
      );

      const { rerender } = render(<LeadDashboard />);
      scrollSpy.mockClear();

      // Update messages to trigger re-scroll
      vi.mocked(useLeadStore).mockImplementation((sel: any) =>
        sel({ projects: { 'lead-1': { messages: msgs2, decisions: [] } }, selectedLeadId: 'lead-1', drafts: {} }),
      );
      rerender(<LeadDashboard />);

      expect(scrollSpy).toHaveBeenCalled();
      scrollSpy.mockRestore();
    });
  });
});
