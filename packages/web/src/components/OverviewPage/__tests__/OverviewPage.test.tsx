import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../../stores/appStore';
import { useLeadStore } from '../../../stores/leadStore';
import type { AgentInfo, Decision } from '../../../types';

// ── Mocks ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

let mockProjectId: string | null = 'proj-1';
vi.mock('../../../contexts/ProjectContext', () => ({
  useProjectId: () => mockProjectId,
}));

let mockProjects: Array<{ id: string; name: string; status: string; cwd?: string }> = [];
vi.mock('../../../hooks/useProjects', () => ({
  useProjects: () => ({ projects: mockProjects, loading: false }),
}));

const mockApiFetch = vi.fn().mockResolvedValue([]);
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Simplify child components to avoid deep dependency trees
vi.mock('../../SessionHistory', () => ({
  SessionHistory: ({ projectId }: { projectId: string }) => (
    <div data-testid="session-history">history-{projectId}</div>
  ),
  NewSessionDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="new-session-dialog">
      <button onClick={onClose}>close-dialog</button>
    </div>
  ),
}));

vi.mock('../TokenUsageSection', () => ({
  TokenUsageSection: ({ projectId }: { projectId: string }) => (
    <div data-testid="token-usage-section">tokens-{projectId}</div>
  ),
}));

vi.mock('../../FleetOverview/FileLockPanel', () => ({
  FileLockPanel: () => <div data-testid="file-lock-panel" />,
}));

vi.mock('../../Shared', () => ({
  DecisionFeedItem: ({ decision }: { decision: Decision }) => (
    <div data-testid="decision-feed-item">{decision.title}</div>
  ),
  DecisionDetailModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="decision-detail-modal"><button onClick={onClose}>close</button></div>
  ),
  ActivityFeedItem: ({ entry }: { entry: { summary: string } }) => (
    <div data-testid="activity-feed-item">{entry.summary}</div>
  ),
  ActivityDetailModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="activity-detail-modal"><button onClick={onClose}>close</button></div>
  ),
}));

vi.mock('../../SectionErrorBoundary', () => ({
  SectionErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../MissionControl/AlertsPanel', () => ({
  detectAlerts: vi.fn(() => []),
}));

// Import after mocks
import { OverviewPage } from '../OverviewPage';
import { detectAlerts } from '../../MissionControl/AlertsPanel';

// ── Helpers ─────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    role: { id: 'worker', name: 'Worker', icon: '🔧', description: '' },
    status: 'running',
    childIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    outputPreview: '',
    model: 'claude-sonnet',
    projectId: 'proj-1',
    ...overrides,
  } as AgentInfo;
}

function resetStores() {
  useAppStore.setState({ agents: [], connected: true, loading: false });
  useLeadStore.setState({ projects: {}, selectedLeadId: null, drafts: {} });
}

// ── Tests ───────────────────────────────────────────────────────────

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    mockProjectId = 'proj-1';
    mockProjects = [{ id: 'proj-1', name: 'Test Project', status: 'active' }];
    mockApiFetch.mockResolvedValue([]);
  });

  it('renders empty state when no projects and no effectiveId', () => {
    mockProjectId = '';
    mockProjects = [];
    useAppStore.setState({ agents: [] });

    render(<OverviewPage />);
    expect(screen.getByText(/No session data yet/i)).toBeInTheDocument();
  });

  it('renders overview page with quick status bar', () => {
    useAppStore.setState({
      agents: [
        makeAgent({ id: 'lead-1', role: { id: 'lead', name: 'Lead', icon: '👑', description: '' }, status: 'running' }),
        makeAgent({ id: 'worker-1' }),
      ],
    });

    render(<OverviewPage />);
    expect(screen.getByTestId('overview-page')).toBeInTheDocument();
    expect(screen.getByTestId('quick-status-bar')).toBeInTheDocument();
    expect(screen.getByText('● Running')).toBeInTheDocument();
    // "2 agents" appears in both status bar and session banner; verify at least one
    expect(screen.getAllByText(/2 agents/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Stopped" when no active agents', () => {
    useAppStore.setState({ agents: [] });
    render(<OverviewPage />);
    expect(screen.getByText('● Stopped')).toBeInTheDocument();
    expect(screen.getByText(/0 agents/)).toBeInTheDocument();
  });

  it('shows active session banner with stop button when lead is running', () => {
    const lead = makeAgent({
      id: 'lead-1',
      role: { id: 'lead', name: 'Lead', icon: '👑', description: '' },
      status: 'running',
      task: 'Build something cool',
    });
    useAppStore.setState({ agents: [lead] });

    render(<OverviewPage />);
    expect(screen.getByTestId('active-session-banner')).toBeInTheDocument();
    expect(screen.getByText('Active Session')).toBeInTheDocument();
    expect(screen.getByTestId('stop-session-btn')).toBeInTheDocument();
  });

  it('shows "New Session" button when no active lead', () => {
    useAppStore.setState({ agents: [] });
    render(<OverviewPage />);
    expect(screen.getByTestId('no-session-controls')).toBeInTheDocument();
    expect(screen.getByTestId('new-session-btn')).toBeInTheDocument();
  });

  it('opens new session dialog on button click', () => {
    useAppStore.setState({ agents: [] });
    render(<OverviewPage />);
    fireEvent.click(screen.getByTestId('new-session-btn'));
    expect(screen.getByTestId('new-session-dialog')).toBeInTheDocument();
  });

  it('shows task progress in status bar', () => {
    const lead = makeAgent({
      id: 'lead-1',
      role: { id: 'lead', name: 'Lead', icon: '👑', description: '' },
      status: 'running',
    });
    useAppStore.setState({ agents: [lead] });
    useLeadStore.setState({
      projects: {
        'proj-1': {
          dagStatus: {
            tasks: [],
            fileLockMap: {},
            summary: { pending: 1, ready: 0, running: 2, done: 3, failed: 0, blocked: 0, paused: 0, skipped: 0 },
          },
          decisions: [],
          messages: [],
          progress: null,
          progressSummary: null,
          progressHistory: [],
          agentReports: [],
          toolCalls: [],
          activity: [],
          comms: [],
          groups: [],
          groupMessages: {},
          lastTextAt: 0,
          pendingNewline: false,
        },
      },
    });

    render(<OverviewPage />);
    expect(screen.getByText('3/6 tasks')).toBeInTheDocument();
  });

  it('displays decisions feed section', () => {
    render(<OverviewPage />);
    expect(screen.getByTestId('decisions-feed')).toBeInTheDocument();
    expect(screen.getByText('Decisions')).toBeInTheDocument();
  });

  it('displays progress feed section', () => {
    render(<OverviewPage />);
    expect(screen.getByTestId('progress-feed')).toBeInTheDocument();
    expect(screen.getByText('Recent Progress')).toBeInTheDocument();
  });

  it('renders token usage section', () => {
    render(<OverviewPage />);
    expect(screen.getByTestId('token-usage-section')).toBeInTheDocument();
    expect(screen.getByText('tokens-proj-1')).toBeInTheDocument();
  });

  it('renders session history section', () => {
    render(<OverviewPage />);
    expect(screen.getByTestId('session-history')).toBeInTheDocument();
  });

  it('shows attention alerts when detectAlerts returns items', () => {
    vi.mocked(detectAlerts).mockReturnValue([
      {
        id: 'alert-1',
        severity: 'critical' as const,
        icon: '🚨',
        title: 'Agent failed',
        detail: 'Agent worker-1 crashed',
        timestamp: Date.now(),
      },
    ]);
    useAppStore.setState({ agents: [makeAgent()] });

    render(<OverviewPage />);
    expect(screen.getByTestId('attention-items')).toBeInTheDocument();
    expect(screen.getByText('Attention Required')).toBeInTheDocument();
    expect(screen.getByText(/Agent failed/)).toBeInTheDocument();
  });

  it('shows project directory when project has cwd', () => {
    mockProjects = [{ id: 'proj-1', name: 'Test', status: 'active', cwd: '/home/user/project' }];
    render(<OverviewPage />);
    expect(screen.getByTestId('project-directory')).toBeInTheDocument();
    expect(screen.getByText('/home/user/project')).toBeInTheDocument();
  });

  it('navigates to session page when clicking active session banner', () => {
    const lead = makeAgent({
      id: 'lead-1',
      role: { id: 'lead', name: 'Lead', icon: '👑', description: '' },
      status: 'running',
    });
    useAppStore.setState({ agents: [lead] });

    render(<OverviewPage />);
    fireEvent.click(screen.getByTestId('active-session-banner'));
    expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1/session');
  });

  it('calls stop session API when stop button clicked', async () => {
    const lead = makeAgent({
      id: 'lead-1',
      role: { id: 'lead', name: 'Lead', icon: '👑', description: '' },
      status: 'running',
    });
    useAppStore.setState({ agents: [lead] });

    render(<OverviewPage />);
    fireEvent.click(screen.getByTestId('stop-session-btn'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/projects/proj-1/stop',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
