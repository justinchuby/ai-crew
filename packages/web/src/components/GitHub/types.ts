export interface GitHubConnection {
  id: string;
  provider: 'github';
  status: 'connected' | 'disconnected' | 'error';
  owner: string;
  repo: string;
  defaultBranch: string;
  permissions: string[];
  connectedAt: string;
  lastSyncAt: string | null;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  branch: string;
  baseBranch: string;
  status: 'draft' | 'open' | 'merged' | 'closed';
  url: string;
  ciStatus: CIStatus;
  reviewStatus: ReviewStatus;
  commits: PRCommit[];
  linkedTasks: string[];
  linkedAgents: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CIStatus {
  state: 'pending' | 'success' | 'failure' | 'error' | 'neutral';
  checks: CICheck[];
  lastUpdatedAt: string;
}

export interface CICheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | null;
  url: string;
  duration?: number;
}

export interface ReviewStatus {
  state: 'pending' | 'approved' | 'changes_requested' | 'commented';
  reviewers: { login: string; state: string; avatarUrl: string }[];
}

export interface PRCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  agentId: string | null;
  taskId: string | null;
  timestamp: string;
  additions: number;
  deletions: number;
}

export interface CommitTaskLink {
  commitSha: string;
  agentId: string;
  taskId: string | null;
  message: string;
  timestamp: string;
  files: string[];
  additions: number;
  deletions: number;
}

export const CI_ICONS: Record<string, string> = {
  queued: '⏳',
  in_progress: '🔄',
  success: '✅',
  failure: '❌',
  neutral: '➖',
  cancelled: '⊘',
  timed_out: '⏰',
};

export const PR_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
};

export function ciConclusionIcon(conclusion: string | null): string {
  if (!conclusion) return '⏳';
  return CI_ICONS[conclusion] ?? '➖';
}
