// @vitest-environment jsdom
/**
 * Coverage for CanvasPage — empty state, historical loading, agent interactions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockAppState = { agents: [] as any[] };
vi.mock('../../../stores/appStore', () => ({
  useAppStore: Object.assign(
    (sel: any) => sel(mockAppState),
    { getState: () => mockAppState },
  ),
}));

vi.mock('../../../stores/leadStore', () => ({
  useLeadStore: Object.assign(
    (sel: any) => sel({ selectedLeadId: null, projects: {} }),
    { getState: () => ({ selectedLeadId: null, projects: {} }) },
  ),
}));

vi.mock('../../../hooks/useCanvasLayout', () => ({
  useCanvasLayout: () => [{}, vi.fn()],
}));

vi.mock('../../../hooks/useCanvasGraph', () => ({
  useCanvasGraph: () => ({ nodes: [], edges: [] }),
}));

vi.mock('../../../hooks/useHistoricalAgents', () => ({
  useHistoricalAgents: (count: number) => ({
    agents: [],
    loading: count === 0,
  }),
}));

vi.mock('../../ProjectTabs', () => ({
  ProjectTabs: () => <div data-testid="project-tabs" />,
}));

vi.mock('../AgentNode', () => ({
  AgentNode: () => <div data-testid="agent-node" />,
}));

vi.mock('../CommEdge', () => ({
  CommEdge: () => <div data-testid="comm-edge" />,
}));

vi.mock('../CanvasToolbar', () => ({
  CanvasToolbar: () => <div data-testid="canvas-toolbar" />,
}));

vi.mock('../FocusPanel', () => ({
  FocusPanel: () => <div data-testid="focus-panel" />,
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  useReactFlow: () => ({ fitView: vi.fn(), setViewport: vi.fn() }),
  ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
  applyNodeChanges: (changes: any, nodes: any) => nodes,
}));

import { CanvasPage } from '../CanvasPage';

describe('CanvasPage — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppState.agents = [];
  });

  it('shows empty state when no agents and loading historical', () => {
    render(<CanvasPage />);
    expect(screen.getByTestId('canvas-empty')).toBeInTheDocument();
    expect(screen.getByText('Agent Canvas')).toBeInTheDocument();
    expect(screen.getByText(/Loading agent graph/)).toBeInTheDocument();
  });

  it('shows canvas with agents', () => {
    mockAppState.agents = [
      {
        id: 'a1',
        role: { id: 'lead', name: 'Lead' },
        status: 'running',
        projectId: 'p1',
      },
    ];
    render(<CanvasPage />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
