import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../../stores/appStore';
import { useLeadStore } from '../../../stores/leadStore';
import type { AgentInfo } from '../../../types';

// Mock ReactFlow and its sub-components
vi.mock('@xyflow/react', () => {
  const actual = { BackgroundVariant: { Dots: 'dots' } };
  return {
    ...actual,
    ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Background: () => <div data-testid="rf-background" />,
    Controls: () => <div data-testid="rf-controls" />,
    useReactFlow: () => ({
      fitView: vi.fn(),
      setViewport: vi.fn(),
    }),
    applyNodeChanges: (changes: any[], nodes: any[]) => nodes,
  };
});

// Mock canvas hooks
vi.mock('../../../hooks/useCanvasLayout', () => ({
  useCanvasLayout: () => [null, vi.fn()],
}));

vi.mock('../../../hooks/useCanvasGraph', () => ({
  useCanvasGraph: () => ({ nodes: [], edges: [] }),
}));

vi.mock('../../../hooks/useHistoricalAgents', () => ({
  useHistoricalAgents: (liveCount: number) => ({
    agents: [],
    loading: false,
  }),
}));

// Mock child components
vi.mock('../AgentNode', () => ({
  AgentNode: () => <div data-testid="agent-node" />,
}));

vi.mock('../CommEdge', () => ({
  CommEdge: () => <div data-testid="comm-edge" />,
}));

vi.mock('../CanvasToolbar', () => ({
  CanvasToolbar: (props: any) => <div data-testid="canvas-toolbar" />,
}));

vi.mock('../FocusPanel', () => ({
  FocusPanel: ({ agentId, onClose }: any) => (
    <div data-testid="focus-panel">{agentId}</div>
  ),
}));

vi.mock('../../ProjectTabs', () => ({
  ProjectTabs: ({ activeId, onChange }: any) => (
    <div data-testid="project-tabs" data-active={activeId} />
  ),
}));

import { CanvasPage } from '../CanvasPage';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    role: { id: 'developer', name: 'Developer', systemPrompt: '' },
    status: 'running',
    model: 'gpt-4',
    provider: 'copilot',
    backend: 'acp',
    inputTokens: 0,
    outputTokens: 0,
    contextWindowSize: 200000,
    contextWindowUsed: 0,
    contextBurnRate: 0,
    estimatedExhaustionMinutes: null,
    pendingMessages: 0,
    createdAt: new Date().toISOString(),
    childIds: [],
    toolCalls: [],
    messages: [],
    isSubLead: false,
    hierarchyLevel: 0,
    ...overrides,
  } as AgentInfo;
}

function resetStores() {
  useAppStore.setState({
    agents: [],
    pendingDecisions: [],
    selectedAgentId: null,
    connected: false,
    loading: false,
  });
  useLeadStore.setState({
    projects: {},
    selectedLeadId: null,
    drafts: {},
  });
}

describe('CanvasPage', () => {
  beforeEach(() => {
    resetStores();
  });

  // ── Empty state ──────────────────────────────────────────────────

  it('renders empty state when no agents exist', () => {
    render(<CanvasPage />);
    expect(screen.getByTestId('canvas-empty')).toBeInTheDocument();
    expect(screen.getByText('Agent Canvas')).toBeInTheDocument();
    expect(screen.getByText(/Agents will appear here as nodes/)).toBeInTheDocument();
  });

  it('shows helpful instructions in empty state', () => {
    render(<CanvasPage />);
    expect(screen.getByText(/Click any agent node to see details/)).toBeInTheDocument();
  });

  // ── Loading historical state ─────────────────────────────────────
  // Note: testing the loading state of useHistoricalAgents requires
  // a module-level mock override which is complex with hoisted mocks.
  // The empty state text variations are covered by the empty state test above.

  // ── With agents ──────────────────────────────────────────────────

  it('renders canvas with ReactFlow when agents exist', () => {
    const lead = makeAgent({
      id: 'lead-1',
      role: { id: 'lead', name: 'Project Lead', systemPrompt: '' },
    });
    const dev = makeAgent({
      id: 'dev-1',
      parentId: 'lead-1',
      role: { id: 'developer', name: 'Developer', systemPrompt: '' },
    });

    useAppStore.setState({ agents: [lead, dev] });
    useLeadStore.setState({ selectedLeadId: 'lead-1' });

    render(<CanvasPage />);

    expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('project-tabs')).toBeInTheDocument();
  });

  it('does not show empty state when agents are present', () => {
    useAppStore.setState({
      agents: [makeAgent({ id: 'lead-1', role: { id: 'lead', name: 'Lead', systemPrompt: '' } })],
    });
    useLeadStore.setState({ selectedLeadId: 'lead-1' });

    render(<CanvasPage />);

    expect(screen.queryByTestId('canvas-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
  });

  it('passes activeId to ProjectTabs', () => {
    useAppStore.setState({
      agents: [makeAgent({ id: 'lead-1', role: { id: 'lead', name: 'Lead', systemPrompt: '' } })],
    });
    useLeadStore.setState({ selectedLeadId: 'lead-1' });

    render(<CanvasPage />);

    const tabs = screen.getByTestId('project-tabs');
    expect(tabs).toHaveAttribute('data-active', 'lead-1');
  });

  it('shows legend with visualization info', () => {
    useAppStore.setState({
      agents: [makeAgent({ id: 'lead-1', role: { id: 'lead', name: 'Lead', systemPrompt: '' } })],
    });
    useLeadStore.setState({ selectedLeadId: 'lead-1' });

    render(<CanvasPage />);

    expect(screen.getByText(/edges show agent messages/)).toBeInTheDocument();
  });
});
