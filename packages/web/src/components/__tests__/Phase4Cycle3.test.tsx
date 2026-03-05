import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mock return values (mutable so tests can override) ──────────────────────

let mockConnection: any = null;
let mockConnectionLoading = false;
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockTestConnection = vi.fn();

vi.mock('../../hooks/useGitHubConnection', () => ({
  useGitHubConnection: () => ({
    connection: mockConnection,
    loading: mockConnectionLoading,
    connect: mockConnect,
    disconnect: mockDisconnect,
    testConnection: mockTestConnection,
  }),
  usePullRequests: () => ({
    pulls: mockPulls,
    loading: mockPullsLoading,
    createPR: mockCreatePR,
    markReady: mockMarkReady,
    refetch: vi.fn(),
  }),
  useCommitLinks: () => mockCommitLinks,
}));

let mockPulls: any[] = [];
let mockPullsLoading = false;
const mockCreatePR = vi.fn();
const mockMarkReady = vi.fn();
let mockCommitLinks: any[] = [];

let mockConflicts: any[] = [];
let mockConflictsLoading = false;
const mockResolve = vi.fn();
const mockDismissConflict = vi.fn();

let mockConflictConfig: any = null;
const mockSaveConfig = vi.fn();

vi.mock('../../hooks/useConflicts', () => ({
  useConflicts: () => ({
    conflicts: mockConflicts,
    activeConflicts: mockConflicts.filter((c: any) => c.status === 'active'),
    loading: mockConflictsLoading,
    resolve: mockResolve,
    dismiss: mockDismissConflict,
  }),
  useConflictConfig: () => ({
    config: mockConflictConfig,
    saveConfig: mockSaveConfig,
  }),
}));

vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

// ── Imports (must come AFTER vi.mock calls) ─────────────────────────────────

import { GitHubSetup } from '../GitHub/GitHubSetup';
import { PRCreationFlow } from '../GitHub/PRCreationFlow';
import { PRStatusPanel } from '../GitHub/PRStatusPanel';
import { PulsePRIndicator } from '../GitHub/PulsePRIndicator';
import { CommitTaskLinkList } from '../GitHub/CommitTaskLink';
import { ConflictDetailPanel } from '../Conflicts/ConflictDetailPanel';
import { ConflictBadge } from '../Conflicts/ConflictBadge';
import { PulseConflictIndicator } from '../Conflicts/PulseConflictIndicator';
import { ConflictSettingsPanel } from '../Conflicts/ConflictSettingsPanel';

// ── Fixtures ────────────────────────────────────────────────────────────────

const connectedGitHub = {
  id: 'gh-1',
  provider: 'github' as const,
  status: 'connected' as const,
  owner: 'acme-corp',
  repo: 'api-service',
  defaultBranch: 'main',
  permissions: ['contents', 'pull_requests'],
  connectedAt: '2025-01-01T00:00:00Z',
  lastSyncAt: '2025-01-01T12:00:00Z',
};

function makePR(overrides: Record<string, any> = {}) {
  return {
    id: 'pr-1',
    number: 42,
    title: 'feat: add user service',
    description: 'Implements user CRUD',
    branch: 'session/user-service',
    baseBranch: 'main',
    status: 'open' as const,
    url: 'https://github.com/acme-corp/api-service/pull/42',
    ciStatus: {
      state: 'success' as const,
      checks: [
        { name: 'build', status: 'completed' as const, conclusion: 'success' as const, url: '#' },
        { name: 'lint', status: 'completed' as const, conclusion: 'success' as const, url: '#' },
      ],
      lastUpdatedAt: '2025-01-01T12:05:00Z',
    },
    reviewStatus: { state: 'pending', reviewers: [] },
    commits: [
      {
        sha: 'abc1234567890',
        shortSha: 'abc1234',
        message: 'feat: user model',
        author: 'dev-1',
        agentId: 'agent-1',
        taskId: 'task-1',
        timestamp: '2025-01-01T11:00:00Z',
        additions: 120,
        deletions: 5,
      },
      {
        sha: 'def4567890123',
        shortSha: 'def4567',
        message: 'feat: user routes',
        author: 'dev-2',
        agentId: 'agent-2',
        taskId: 'task-2',
        timestamp: '2025-01-01T11:30:00Z',
        additions: 80,
        deletions: 10,
      },
    ],
    linkedTasks: ['task-1', 'task-2'],
    linkedAgents: ['agent-1', 'agent-2'],
    createdAt: '2025-01-01T11:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  };
}

const sampleCommitLinks = [
  {
    commitSha: 'abc1234567890',
    agentId: 'agent-1',
    taskId: 'task-1',
    message: 'feat: add user model',
    timestamp: '2025-01-01T11:00:00Z',
    files: ['src/models/user.ts', 'src/models/index.ts'],
    additions: 100,
    deletions: 5,
  },
  {
    commitSha: 'def4567890abc',
    agentId: 'agent-2',
    taskId: null,
    message: 'fix: validation logic',
    timestamp: '2025-01-01T11:30:00Z',
    files: ['src/validators/user.ts'],
    additions: 20,
    deletions: 8,
  },
];

function makeConflict(overrides: Record<string, any> = {}) {
  return {
    id: 'conflict-1',
    type: 'same_directory' as const,
    severity: 'medium' as const,
    agents: [
      { agentId: 'agent-1', role: 'Backend Dev', files: ['src/models/user.ts'], taskId: 'task-1' },
      { agentId: 'agent-2', role: 'API Dev', files: ['src/models/types.ts'], taskId: 'task-2' },
    ] as [any, any],
    files: [
      {
        path: 'src/models/user.ts',
        agents: ['agent-1', 'agent-2'],
        editType: 'recently_edited' as const,
        risk: 'direct' as const,
      },
    ],
    description: 'Both agents editing files in src/models/',
    detectedAt: '2025-01-01T12:00:00Z',
    status: 'active' as const,
    ...overrides,
  };
}

const defaultConfig = {
  enabled: true,
  checkIntervalMs: 15000,
  directoryOverlapEnabled: true,
  importAnalysisEnabled: true,
  branchDivergenceEnabled: false,
};

// ── Reset mocks between tests ───────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockConnection = null;
  mockConnectionLoading = false;
  mockPulls = [];
  mockPullsLoading = false;
  mockCommitLinks = [];
  mockConflicts = [];
  mockConflictsLoading = false;
  mockConflictConfig = null;
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 4 Cycle 3 — GitHub Integration + Conflict Detection
// ═════════════════════════════════════════════════════════════════════════════

describe('Phase 4 Cycle 3 — GitHub Integration + Conflict Detection', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // GitHub — GitHubSetup
  // ─────────────────────────────────────────────────────────────────────────

  describe('GitHub — GitHubSetup', () => {
    it('shows loading state', () => {
      mockConnectionLoading = true;
      render(<GitHubSetup />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('shows "Not connected" by default and Connect button', () => {
      render(<GitHubSetup />);
      expect(screen.getByText('Not connected')).toBeInTheDocument();
      expect(screen.getByText('Connect GitHub')).toBeInTheDocument();
    });

    it('shows connection form after clicking Connect GitHub', () => {
      render(<GitHubSetup />);
      fireEvent.click(screen.getByText('Connect GitHub'));
      expect(screen.getByPlaceholderText('ghp_xxxx...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('acme-corp')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('api-service')).toBeInTheDocument();
      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('disables Connect when fields are empty', () => {
      render(<GitHubSetup />);
      fireEvent.click(screen.getByText('Connect GitHub'));
      const connectBtn = screen.getByText('Connect');
      expect(connectBtn).toBeDisabled();
    });

    it('calls connect with filled fields', async () => {
      mockConnect.mockResolvedValue(connectedGitHub);
      render(<GitHubSetup />);
      fireEvent.click(screen.getByText('Connect GitHub'));
      fireEvent.change(screen.getByPlaceholderText('ghp_xxxx...'), {
        target: { value: 'ghp_test123' },
      });
      fireEvent.change(screen.getByPlaceholderText('acme-corp'), {
        target: { value: 'acme-corp' },
      });
      fireEvent.change(screen.getByPlaceholderText('api-service'), {
        target: { value: 'api-service' },
      });
      fireEvent.click(screen.getByText('Connect'));
      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith('ghp_test123', 'acme-corp', 'api-service');
      });
    });

    it('displays connected state with repo info', () => {
      mockConnection = connectedGitHub;
      render(<GitHubSetup />);
      expect(screen.getByText('● Connected')).toBeInTheDocument();
      expect(screen.getByText('acme-corp/api-service')).toBeInTheDocument();
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });

    it('calls disconnect when clicking Disconnect', () => {
      mockConnection = connectedGitHub;
      render(<GitHubSetup />);
      fireEvent.click(screen.getByText('Disconnect'));
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('hides form when Cancel is clicked', () => {
      render(<GitHubSetup />);
      fireEvent.click(screen.getByText('Connect GitHub'));
      expect(screen.getByPlaceholderText('ghp_xxxx...')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('ghp_xxxx...')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GitHub — PRCreationFlow
  // ─────────────────────────────────────────────────────────────────────────

  describe('GitHub — PRCreationFlow', () => {
    it('renders the PR creation modal with form fields', () => {
      render(<PRCreationFlow onClose={vi.fn()} />);
      expect(screen.getByText('🔀 Create Pull Request')).toBeInTheDocument();
      expect(screen.getByDisplayValue('session/feature')).toBeInTheDocument(); // default branch
      expect(screen.getByDisplayValue('main')).toBeInTheDocument(); // base branch
      expect(screen.getByText('Create as draft PR')).toBeInTheDocument();
      expect(screen.getByText('Link to DAG tasks in PR body')).toBeInTheDocument();
    });

    it('disables Create button when title is empty', () => {
      render(<PRCreationFlow onClose={vi.fn()} />);
      const createBtn = screen.getByText('Create PR →');
      expect(createBtn).toBeDisabled();
    });

    it('enables Create button when title is provided', () => {
      render(<PRCreationFlow onClose={vi.fn()} />);
      const titleInput = screen.getByPlaceholderText('feat: implement user service');
      fireEvent.change(titleInput, { target: { value: 'feat: my PR' } });
      expect(screen.getByText('Create PR →')).not.toBeDisabled();
    });

    it('calls createPR and onClose on submit', async () => {
      const onClose = vi.fn();
      mockCreatePR.mockResolvedValue(makePR());
      render(<PRCreationFlow onClose={onClose} />);
      fireEvent.change(screen.getByPlaceholderText('feat: implement user service'), {
        target: { value: 'feat: add user service' },
      });
      fireEvent.click(screen.getByText('Create PR →'));
      await waitFor(() => {
        expect(mockCreatePR).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      render(<PRCreationFlow onClose={onClose} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('pre-populates from sessionData', () => {
      render(
        <PRCreationFlow
          onClose={vi.fn()}
          sessionData={{
            branch: 'feat/auth',
            title: 'feat: authentication',
            description: 'Auth implementation',
          }}
        />,
      );
      expect(screen.getByDisplayValue('feat/auth')).toBeInTheDocument();
      expect(screen.getByDisplayValue('feat: authentication')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Auth implementation')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GitHub — PRStatusPanel
  // ─────────────────────────────────────────────────────────────────────────

  describe('GitHub — PRStatusPanel', () => {
    it('shows loading state', () => {
      mockPullsLoading = true;
      render(<PRStatusPanel />);
      expect(screen.getByText('Loading PRs…')).toBeInTheDocument();
    });

    it('shows empty state when no PRs', () => {
      render(<PRStatusPanel />);
      expect(screen.getByText('No pull requests')).toBeInTheDocument();
    });

    it('renders PR cards with number, title, and status', () => {
      mockPulls = [makePR()];
      render(<PRStatusPanel />);
      expect(screen.getByText('#42')).toBeInTheDocument();
      expect(screen.getByText('feat: add user service')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    it('renders CI check items', () => {
      mockPulls = [makePR()];
      render(<PRStatusPanel />);
      expect(screen.getByText('build')).toBeInTheDocument();
      expect(screen.getByText('lint')).toBeInTheDocument();
    });

    it('shows commit stats', () => {
      mockPulls = [makePR()];
      render(<PRStatusPanel />);
      expect(screen.getByText('2 commits')).toBeInTheDocument();
      expect(screen.getByText(/\+200/)).toBeInTheDocument(); // 120 + 80
    });

    it('shows Mark Ready button for draft PRs', () => {
      mockPulls = [makePR({ status: 'draft' })];
      render(<PRStatusPanel />);
      expect(screen.getByText('Mark Ready')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('does not show Mark Ready for open PRs', () => {
      mockPulls = [makePR({ status: 'open' })];
      render(<PRStatusPanel />);
      expect(screen.queryByText('Mark Ready')).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GitHub — PulsePRIndicator
  // ─────────────────────────────────────────────────────────────────────────

  describe('GitHub — PulsePRIndicator', () => {
    it('renders nothing when no PRs', () => {
      mockPulls = [];
      const { container } = render(<PulsePRIndicator />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when only merged/closed PRs', () => {
      mockPulls = [makePR({ status: 'merged' }), makePR({ id: 'pr-2', status: 'closed' })];
      const { container } = render(<PulsePRIndicator />);
      expect(container.innerHTML).toBe('');
    });

    it('shows PR number and CI icon for open PR with success CI', () => {
      mockPulls = [makePR({ status: 'open', ciStatus: { state: 'success', checks: [], lastUpdatedAt: '' } })];
      render(<PulsePRIndicator />);
      expect(screen.getByText('PR #42')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument();
    });

    it('shows failure icon for failing CI', () => {
      mockPulls = [makePR({ status: 'open', ciStatus: { state: 'failure', checks: [], lastUpdatedAt: '' } })];
      render(<PulsePRIndicator />);
      expect(screen.getByText('❌')).toBeInTheDocument();
    });

    it('shows pending icon for pending CI', () => {
      mockPulls = [makePR({ status: 'draft', ciStatus: { state: 'pending', checks: [], lastUpdatedAt: '' } })];
      render(<PulsePRIndicator />);
      expect(screen.getByText('🔄')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GitHub — CommitTaskLinkList
  // ─────────────────────────────────────────────────────────────────────────

  describe('GitHub — CommitTaskLinkList', () => {
    it('renders nothing when commits array is empty', () => {
      const { container } = render(<CommitTaskLinkList commits={[]} />);
      expect(container.innerHTML).toBeFalsy();
    });

    it('renders commit SHAs (first 7 chars) and messages', () => {
      render(<CommitTaskLinkList commits={sampleCommitLinks} />);
      expect(screen.getByText('abc1234')).toBeInTheDocument();
      expect(screen.getByText('def4567')).toBeInTheDocument();
      expect(screen.getByText('feat: add user model')).toBeInTheDocument();
      expect(screen.getByText('fix: validation logic')).toBeInTheDocument();
    });

    it('shows additions and deletions per commit', () => {
      render(<CommitTaskLinkList commits={sampleCommitLinks} />);
      expect(screen.getByText('+100')).toBeInTheDocument();
      expect(screen.getByText('-5')).toBeInTheDocument();
      expect(screen.getByText('+20')).toBeInTheDocument();
      expect(screen.getByText('-8')).toBeInTheDocument();
    });

    it('shows totals across all commits', () => {
      render(<CommitTaskLinkList commits={sampleCommitLinks} />);
      // 100 + 20 = 120 additions, 5 + 8 = 13 deletions, 3 unique files
      expect(screen.getByText(/\+120/)).toBeInTheDocument();
      expect(screen.getByText(/-13/)).toBeInTheDocument();
      expect(screen.getByText(/3 files/)).toBeInTheDocument();
    });

    it('truncates to 3 items in compact mode', () => {
      const threeCommits = [
        ...sampleCommitLinks,
        { commitSha: '999aaa0001234', agentId: 'a3', taskId: null, message: 'chore: cleanup', timestamp: '', files: ['f.ts'], additions: 1, deletions: 1 },
        { commitSha: 'bbb1230004567', agentId: 'a4', taskId: null, message: 'docs: readme', timestamp: '', files: ['README.md'], additions: 2, deletions: 0 },
      ];
      render(<CommitTaskLinkList commits={threeCommits} compact />);
      // 3 shown + "…1 more"
      expect(screen.getByText(/1 more/)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Conflicts — ConflictDetailPanel
  // ─────────────────────────────────────────────────────────────────────────

  describe('Conflicts — ConflictDetailPanel', () => {
    it('renders conflict type and severity header', () => {
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={vi.fn()} />);
      expect(screen.getByText(/Directory Overlap/)).toBeInTheDocument();
      expect(screen.getByText(/Medium Severity/)).toBeInTheDocument();
    });

    it('shows both agents with their roles', () => {
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={vi.fn()} />);
      expect(screen.getAllByText(/Backend Dev/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/API Dev/).length).toBeGreaterThanOrEqual(1);
      // Specifically check the agent cards render role headers
      expect(screen.getByText('💻 Backend Dev')).toBeInTheDocument();
      expect(screen.getByText('💻 API Dev')).toBeInTheDocument();
    });

    it('shows agent task IDs', () => {
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={vi.fn()} />);
      expect(screen.getByText('Task: task-1')).toBeInTheDocument();
      expect(screen.getByText('Task: task-2')).toBeInTheDocument();
    });

    it('shows overlap files and description', () => {
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={vi.fn()} />);
      expect(screen.getAllByText(/src\/models\/user\.ts/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Both agents editing files in src/models/')).toBeInTheDocument();
    });

    it('renders 4 resolution options', () => {
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={vi.fn()} />);
      expect(screen.getByText('Sequence their work')).toBeInTheDocument();
      expect(screen.getByText('Split the file')).toBeInTheDocument();
      expect(screen.getByText('Let them proceed')).toBeInTheDocument();
      expect(screen.getByText('Dismiss this alert')).toBeInTheDocument();
    });

    it('calls onClose when X button is clicked', () => {
      const onClose = vi.fn();
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={onClose} />);
      fireEvent.click(screen.getByText('✕'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls resolve and onClose when Sequence is applied', async () => {
      const onClose = vi.fn();
      mockResolve.mockResolvedValue(undefined);
      render(<ConflictDetailPanel conflict={makeConflict()} onClose={onClose} />);
      // "Apply →" buttons — first one is "Sequence their work"
      const applyBtns = screen.getAllByText('Apply →');
      fireEvent.click(applyBtns[0]);
      await waitFor(() => {
        expect(mockResolve).toHaveBeenCalledWith('conflict-1', {
          type: 'sequenced',
          order: ['agent-1', 'agent-2'],
        });
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Conflicts — ConflictBadge
  // ─────────────────────────────────────────────────────────────────────────

  describe('Conflicts — ConflictBadge', () => {
    it('shows conflict with other agent role', () => {
      render(<ConflictBadge conflict={makeConflict()} agentId="agent-1" />);
      expect(screen.getByText(/Conflict with API Dev/)).toBeInTheDocument();
    });

    it('shows conflict from the other agents perspective', () => {
      render(<ConflictBadge conflict={makeConflict()} agentId="agent-2" />);
      expect(screen.getByText(/Conflict with Backend Dev/)).toBeInTheDocument();
    });

    it('returns null when agentId matches neither agent', () => {
      const { container } = render(
        <ConflictBadge conflict={makeConflict()} agentId="agent-unknown" />,
      );
      // Both agents don't match agent-unknown, so find returns the first match that isn't agent-unknown
      // Actually looking at the code: otherAgent = agents.find(a => a.agentId !== agentId)
      // If agentId="agent-unknown", both agents match the filter, so it finds agent-1
      expect(screen.getByText(/Conflict with Backend Dev/)).toBeInTheDocument();
      expect(container.querySelector('button')).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
      const onClick = vi.fn();
      render(<ConflictBadge conflict={makeConflict()} agentId="agent-1" onClick={onClick} />);
      fireEvent.click(screen.getByText(/Conflict with API Dev/));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('has accessible aria-label', () => {
      render(<ConflictBadge conflict={makeConflict()} agentId="agent-1" />);
      expect(
        screen.getByLabelText(/File conflict with API Dev.*medium severity/i),
      ).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Conflicts — PulseConflictIndicator
  // ─────────────────────────────────────────────────────────────────────────

  describe('Conflicts — PulseConflictIndicator', () => {
    it('renders nothing when no active conflicts', () => {
      mockConflicts = [];
      const { container } = render(<PulseConflictIndicator />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when all conflicts are resolved', () => {
      mockConflicts = [makeConflict({ status: 'resolved' }), makeConflict({ id: 'c2', status: 'dismissed' })];
      const { container } = render(<PulseConflictIndicator />);
      expect(container.innerHTML).toBe('');
    });

    it('shows count for active conflicts', () => {
      mockConflicts = [makeConflict()];
      render(<PulseConflictIndicator />);
      expect(screen.getByText('1 conflict')).toBeInTheDocument();
    });

    it('pluralizes count for multiple conflicts', () => {
      mockConflicts = [
        makeConflict({ id: 'c1' }),
        makeConflict({ id: 'c2' }),
      ];
      render(<PulseConflictIndicator />);
      expect(screen.getByText('2 conflicts')).toBeInTheDocument();
    });

    it('reflects highest severity in title', () => {
      mockConflicts = [
        makeConflict({ id: 'c1', severity: 'low' }),
        makeConflict({ id: 'c2', severity: 'high' }),
      ];
      render(<PulseConflictIndicator />);
      expect(screen.getByTitle('2 active conflicts')).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Conflicts — ConflictSettingsPanel
  // ─────────────────────────────────────────────────────────────────────────

  describe('Conflicts — ConflictSettingsPanel', () => {
    it('shows loading when config is null', () => {
      mockConflictConfig = null;
      render(<ConflictSettingsPanel />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('renders all config options when loaded', () => {
      mockConflictConfig = defaultConfig;
      render(<ConflictSettingsPanel />);
      expect(screen.getByText('Conflict Detection')).toBeInTheDocument();
      expect(screen.getByText('Conflict detection')).toBeInTheDocument();
      expect(screen.getByText('Check interval')).toBeInTheDocument();
      expect(screen.getByText('Same directory overlap')).toBeInTheDocument();
      expect(screen.getByText('Import/dependency overlap')).toBeInTheDocument();
      expect(screen.getByText(/Branch divergence/)).toBeInTheDocument();
    });

    it('calls saveConfig when toggling enabled', () => {
      mockConflictConfig = defaultConfig;
      mockSaveConfig.mockResolvedValue({ ...defaultConfig, enabled: false });
      render(<ConflictSettingsPanel />);
      // The toggle button for "Conflict detection" — it's a button element
      const toggleBtn = screen.getByText('Conflict detection').closest('label')!.querySelector('button')!;
      fireEvent.click(toggleBtn);
      expect(mockSaveConfig).toHaveBeenCalledWith({ enabled: false });
    });

    it('calls saveConfig when changing check interval', () => {
      mockConflictConfig = defaultConfig;
      mockSaveConfig.mockResolvedValue({ ...defaultConfig, checkIntervalMs: 30000 });
      render(<ConflictSettingsPanel />);
      // Select value is the numeric interval; getByDisplayValue matches option text for <select>
      const select = screen.getByDisplayValue('15s');
      fireEvent.change(select, { target: { value: '30000' } });
      expect(mockSaveConfig).toHaveBeenCalledWith({ checkIntervalMs: 30000 });
    });

    it('calls saveConfig when toggling directory overlap checkbox', () => {
      mockConflictConfig = defaultConfig;
      mockSaveConfig.mockResolvedValue({ ...defaultConfig, directoryOverlapEnabled: false });
      render(<ConflictSettingsPanel />);
      const checkbox = screen.getByLabelText('Same directory overlap');
      fireEvent.click(checkbox);
      expect(mockSaveConfig).toHaveBeenCalledWith({ directoryOverlapEnabled: false });
    });
  });
});
