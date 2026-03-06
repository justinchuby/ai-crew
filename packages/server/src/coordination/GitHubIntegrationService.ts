/**
 * GitHubIntegrationService — GitHub connection, PR creation, CI polling,
 * and commit→task linking for the Flightdeck P4C3 panel.
 *
 * Uses plain fetch() against GitHub API v3 (no @octokit dependency).
 * All state is persisted via db.getSetting / db.setSetting.
 */
import type { Database } from '../db/database.js';
import { logger } from '../utils/logger.js';

// ── Persistence Keys ──────────────────────────────────────────────

const CONNECTION_KEY = 'github_connection';
const PULLS_KEY = 'github_pulls';
const COMMIT_LINKS_KEY = 'github_commit_links';

const MAX_PULLS = 50;
const MAX_COMMIT_LINKS = 500;
const GITHUB_API = 'https://api.github.com';

// ── Types ─────────────────────────────────────────────────────────

export type GitHubPermission = 'repo' | 'workflow' | 'read:org' | 'read:user';

export interface GitHubConnection {
  id: string;
  provider: 'github';
  status: 'connected' | 'disconnected' | 'error';
  owner: string;
  repo: string;
  defaultBranch: string;
  tokenMasked: string;
  permissions: GitHubPermission[];
  connectedAt: string;
  lastSyncAt: string | null;
}

/** Internal only — never exposed to frontend */
interface StoredConnection extends GitHubConnection {
  token: string;
}

export interface CICheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | null;
  url: string;
  duration?: number;
}

export interface CIStatus {
  state: 'pending' | 'success' | 'failure' | 'error' | 'neutral';
  checks: CICheck[];
  lastUpdatedAt: string;
}

export interface ReviewStatus {
  state: 'pending' | 'approved' | 'changes_requested' | 'commented';
  reviewers: Array<{
    login: string;
    state: 'pending' | 'approved' | 'changes_requested' | 'commented';
    avatarUrl: string;
  }>;
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

export interface CommitTaskLink {
  sha: string;
  shortSha: string;
  message: string;
  agentId: string | null;
  taskId: string | null;
  timestamp: string;
}

export interface CreatePRInput {
  title: string;
  description: string;
  branch: string;
  baseBranch: string;
  draft?: boolean;
  linkTasks?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

function generateId(): string {
  return `gh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyCIStatus(): CIStatus {
  return { state: 'pending', checks: [], lastUpdatedAt: new Date().toISOString() };
}

function emptyReviewStatus(): ReviewStatus {
  return { state: 'pending', reviewers: [] };
}

/**
 * Compute an aggregate CI state from a set of check runs.
 *   any failure/timed_out/cancelled → 'failure'
 *   any in_progress/queued         → 'pending'
 *   all success                    → 'success'
 *   all neutral                    → 'neutral'
 *   otherwise                      → 'pending'
 */
function aggregateCIState(checks: CICheck[]): CIStatus['state'] {
  if (checks.length === 0) return 'pending';

  const hasFailure = checks.some(
    c => c.conclusion === 'failure' || c.conclusion === 'timed_out' || c.conclusion === 'cancelled',
  );
  if (hasFailure) return 'failure';

  const hasRunning = checks.some(c => c.status === 'in_progress' || c.status === 'queued');
  if (hasRunning) return 'pending';

  const allSuccess = checks.every(c => c.conclusion === 'success');
  if (allSuccess) return 'success';

  const allNeutral = checks.every(c => c.conclusion === 'neutral');
  if (allNeutral) return 'neutral';

  return 'pending';
}

// ── Service ───────────────────────────────────────────────────────

export class GitHubIntegrationService {
  private connection: StoredConnection | null = null;
  private pulls: PullRequest[] = [];
  private commitLinks: CommitTaskLink[] = [];

  constructor(private db: Database) {
    this.connection = this.loadConnection();
    this.pulls = this.loadPulls();
    this.commitLinks = this.loadCommitLinks();
  }

  // ── Connection Management ──────────────────────────────────────

  /** Returns sanitized connection (no raw token). */
  getConnection(): GitHubConnection | null {
    if (!this.connection) return null;
    return this.sanitizeConnection(this.connection);
  }

  /** Connect to a GitHub repo. Validates by fetching repo info. Throws on failure. */
  async connect(token: string, owner: string, repo: string): Promise<GitHubConnection> {
    // Validate by hitting the repo endpoint
    const res = await this.githubFetch(`/repos/${owner}/${repo}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as any).message ?? `HTTP ${res.status}`;
      throw new Error(`GitHub connection failed: ${message}`);
    }

    const data = await res.json();
    const defaultBranch: string = data.default_branch ?? 'main';

    // Parse permissions from X-OAuth-Scopes header
    const scopeHeader: string = res.headers?.get?.('x-oauth-scopes') ?? '';
    const permissions = this.parsePermissions(scopeHeader);

    const now = new Date().toISOString();
    this.connection = {
      id: generateId(),
      provider: 'github',
      status: 'connected',
      owner,
      repo,
      defaultBranch,
      token,
      tokenMasked: this.maskToken(token),
      permissions,
      connectedAt: now,
      lastSyncAt: now,
    };

    this.saveConnection();
    logger.info('github', `Connected to ${owner}/${repo} (branch: ${defaultBranch})`);
    return this.sanitizeConnection(this.connection);
  }

  /** Disconnect from GitHub and clear stored credentials. */
  disconnect(): void {
    this.connection = null;
    this.saveConnection();
    logger.info('github', 'Disconnected from GitHub');
  }

  /** Ping the API to verify the connection is still valid. */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!this.connection || !this.connection.token) {
      return { connected: false, error: 'No connection configured' };
    }
    try {
      const res = await this.githubFetch(
        `/repos/${this.connection.owner}/${this.connection.repo}`,
      );
      if (!res.ok) {
        this.connection.status = 'error';
        this.saveConnection();
        return { connected: false, error: `GitHub API returned ${res.status}` };
      }
      this.connection.status = 'connected';
      this.connection.lastSyncAt = new Date().toISOString();
      this.saveConnection();
      return { connected: true };
    } catch (err: any) {
      this.connection.status = 'error';
      this.saveConnection();
      return { connected: false, error: err.message ?? 'Network error' };
    }
  }

  /** Quick check — does not hit the network. */
  isConnected(): boolean {
    return this.connection?.status === 'connected';
  }

  // ── Pull Requests ──────────────────────────────────────────────

  getPulls(): PullRequest[] {
    return this.pulls;
  }

  getPull(number: number): PullRequest | undefined {
    return this.pulls.find(p => p.number === number);
  }

  /** Create a pull request on GitHub. */
  async createPR(input: CreatePRInput): Promise<PullRequest> {
    this.ensureConnected();

    const res = await this.githubFetch(
      `/repos/${this.connection!.owner}/${this.connection!.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          body: input.description,
          head: input.branch,
          base: input.baseBranch,
          draft: input.draft ?? false,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Failed to create PR: ${(body as any).message ?? res.status}`);
    }

    const data = await res.json();
    const now = new Date().toISOString();

    const pr: PullRequest = {
      id: generateId(),
      number: data.number,
      title: data.title,
      description: data.body ?? '',
      branch: input.branch,
      baseBranch: input.baseBranch,
      status: data.draft ? 'draft' : 'open',
      url: data.html_url ?? `https://github.com/${this.connection!.owner}/${this.connection!.repo}/pull/${data.number}`,
      ciStatus: emptyCIStatus(),
      reviewStatus: emptyReviewStatus(),
      commits: [],
      linkedTasks: [],
      linkedAgents: [],
      createdAt: now,
      updatedAt: now,
    };

    this.pulls.unshift(pr);
    this.prunePulls();
    this.savePulls();

    logger.info('github', `Created PR #${pr.number}: ${pr.title}`);
    return pr;
  }

  /** Mark a draft PR as ready for review. */
  async markReady(number: number): Promise<PullRequest | undefined> {
    this.ensureConnected();
    const pr = this.getPull(number);
    if (!pr) return undefined;

    try {
      const res = await this.githubFetch(
        `/repos/${this.connection!.owner}/${this.connection!.repo}/pulls/${number}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ draft: false }),
        },
      );

      if (res.ok) {
        pr.status = 'open';
        pr.updatedAt = new Date().toISOString();
        this.savePulls();
        logger.info('github', `Marked PR #${number} as ready for review`);
      }
    } catch (err: any) {
      logger.error('github', `Failed to mark PR #${number} ready: ${err.message}`);
    }

    return pr;
  }

  /** Refresh a single PR's data from GitHub. */
  async refreshPR(number: number): Promise<PullRequest | undefined> {
    this.ensureConnected();
    const pr = this.getPull(number);
    if (!pr) return undefined;

    try {
      const res = await this.githubFetch(
        `/repos/${this.connection!.owner}/${this.connection!.repo}/pulls/${number}`,
      );

      if (res.ok) {
        const data = await res.json();
        pr.title = data.title;
        pr.description = data.body ?? '';
        pr.status = data.draft
          ? 'draft'
          : data.merged
            ? 'merged'
            : data.state === 'closed'
              ? 'closed'
              : 'open';
        pr.updatedAt = new Date().toISOString();
        this.savePulls();
      }
    } catch (err: any) {
      logger.error('github', `Failed to refresh PR #${number}: ${err.message}`);
    }

    return pr;
  }

  // ── CI Status ──────────────────────────────────────────────────

  /** Fetch check runs for a PR by its head SHA. */
  async getChecks(prNumber: number): Promise<CICheck[]> {
    this.ensureConnected();
    const pr = this.getPull(prNumber);
    if (!pr) return [];

    // Get head SHA from PR commits — if we don't have one, fetch the PR first
    let headSha = pr.commits.length > 0
      ? pr.commits[pr.commits.length - 1].sha
      : null;

    if (!headSha) {
      // Try to get head SHA from the PR endpoint
      try {
        const prRes = await this.githubFetch(
          `/repos/${this.connection!.owner}/${this.connection!.repo}/pulls/${prNumber}`,
        );
        if (prRes.ok) {
          const prData = await prRes.json();
          headSha = prData.head?.sha ?? null;
        }
      } catch {
        // ignore — we'll return empty checks
      }
    }

    if (!headSha) return [];

    try {
      const res = await this.githubFetch(
        `/repos/${this.connection!.owner}/${this.connection!.repo}/commits/${headSha}/check-runs`,
      );

      if (!res.ok) return [];

      const data = await res.json();
      const checks: CICheck[] = (data.check_runs ?? []).map((cr: any) => ({
        name: cr.name,
        status: cr.status,
        conclusion: cr.conclusion ?? null,
        url: cr.html_url ?? cr.details_url ?? '',
        duration: cr.completed_at && cr.started_at
          ? Math.round((new Date(cr.completed_at).getTime() - new Date(cr.started_at).getTime()) / 1000)
          : undefined,
      }));

      return checks;
    } catch (err: any) {
      logger.error('github', `Failed to get checks for PR #${prNumber}: ${err.message}`);
      return [];
    }
  }

  /** Refresh CI status for a PR and update stored state. */
  async refreshCIStatus(prNumber: number): Promise<CIStatus | undefined> {
    const pr = this.getPull(prNumber);
    if (!pr) return undefined;

    try {
      const checks = await this.getChecks(prNumber);
      const state = aggregateCIState(checks);
      const now = new Date().toISOString();

      pr.ciStatus = { state, checks, lastUpdatedAt: now };
      pr.updatedAt = now;
      this.savePulls();

      return pr.ciStatus;
    } catch (err: any) {
      logger.error('github', `Failed to refresh CI status for PR #${prNumber}: ${err.message}`);
      return pr.ciStatus;
    }
  }

  // ── Commit Links ───────────────────────────────────────────────

  getCommitLinks(): CommitTaskLink[] {
    return this.commitLinks;
  }

  getCommitsByTask(taskId: string): CommitTaskLink[] {
    return this.commitLinks.filter(l => l.taskId === taskId);
  }

  addCommitLink(link: Omit<CommitTaskLink, 'shortSha'>): void {
    const full: CommitTaskLink = {
      ...link,
      shortSha: link.sha.slice(0, 7),
    };
    this.commitLinks.unshift(full);
    this.pruneCommitLinks();
    this.saveCommitLinks();

    logger.info('github', `Linked commit ${full.shortSha} → task ${full.taskId ?? '(none)'}`);
  }

  // ── Private: GitHub API ────────────────────────────────────────

  /** Authenticated fetch wrapper for GitHub API v3. */
  private async githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${GITHUB_API}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      ...(options.headers as Record<string, string> ?? {}),
    };

    if (this.connection?.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.connection.token}`;
    }

    const res = await fetch(url, { ...options, headers });

    // Rate limit warnings
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    if (remaining !== null && remaining !== undefined) {
      const n = parseInt(remaining, 10);
      if (!isNaN(n) && n < 100) {
        logger.warn('github', `Rate limit low: ${n} requests remaining`);
      }
    }

    // Auth failure — mark connection as error
    if ((res.status === 401 || res.status === 403) && this.connection) {
      this.connection.status = 'error';
      this.saveConnection();
      logger.error('github', `Auth failure (${res.status}) — connection marked as error`);
    }

    return res;
  }

  // ── Private: Token / Sanitization ──────────────────────────────

  private maskToken(token: string): string {
    if (token.length < 12) return '****';
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  /** Remove the raw token, return a GitHubConnection safe for the frontend. */
  private sanitizeConnection(conn: StoredConnection): GitHubConnection {
    const { token: _token, ...safe } = conn;
    return safe;
  }

  /** Parse GitHub permission scopes from the X-OAuth-Scopes header. */
  private parsePermissions(scopeHeader: string): GitHubPermission[] {
    if (!scopeHeader) return [];
    const known: GitHubPermission[] = ['repo', 'workflow', 'read:org', 'read:user'];
    const scopes = scopeHeader.split(',').map(s => s.trim());
    return known.filter(k => scopes.includes(k));
  }

  /** Guard: throws if not connected. */
  private ensureConnected(): void {
    if (!this.connection || this.connection.status !== 'connected') {
      throw new Error('Not connected to GitHub');
    }
  }

  // ── Private: Persistence ───────────────────────────────────────

  private loadConnection(): StoredConnection | null {
    try {
      const raw = this.db.getSetting(CONNECTION_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    return null;
  }

  private saveConnection(): void {
    try {
      if (this.connection) {
        this.db.setSetting(CONNECTION_KEY, JSON.stringify(this.connection));
      } else {
        this.db.setSetting(CONNECTION_KEY, '');
      }
    } catch (err: any) {
      logger.error('github', `Failed to save connection: ${err.message}`);
    }
  }

  private loadPulls(): PullRequest[] {
    try {
      const raw = this.db.getSetting(PULLS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    return [];
  }

  private savePulls(): void {
    try {
      this.db.setSetting(PULLS_KEY, JSON.stringify(this.pulls));
    } catch (err: any) {
      logger.error('github', `Failed to save pulls: ${err.message}`);
    }
  }

  private loadCommitLinks(): CommitTaskLink[] {
    try {
      const raw = this.db.getSetting(COMMIT_LINKS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    return [];
  }

  private saveCommitLinks(): void {
    try {
      this.db.setSetting(COMMIT_LINKS_KEY, JSON.stringify(this.commitLinks));
    } catch (err: any) {
      logger.error('github', `Failed to save commit links: ${err.message}`);
    }
  }

  private prunePulls(): void {
    if (this.pulls.length > MAX_PULLS) {
      this.pulls = this.pulls.slice(0, MAX_PULLS);
    }
  }

  private pruneCommitLinks(): void {
    if (this.commitLinks.length > MAX_COMMIT_LINKS) {
      this.commitLinks = this.commitLinks.slice(0, MAX_COMMIT_LINKS);
    }
  }
}
