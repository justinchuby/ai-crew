/**
 * UnifiedCrewPage — Merged Agents + Crews page.
 *
 * Uses CrewRoster's grouping as foundation. Adds:
 * - scope prop: 'project' (single project) or 'global' (all crews)
 * - Collapsible health strip from CrewPage
 * - Export/Import via overflow menu (dialogs ported from CrewPage)
 * - Project-scoped filtering when scope='project'
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Search,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Cpu,
  Activity,
  Heart,
  MoreHorizontal,
  Download,
  Upload,
  X,
  Server,
  Power,
  Wifi,
  WifiOff,
  FolderDown,
  Package,
  CheckCircle,
  Info,
  PauseCircle,
  UserMinus,
  MessageSquare,
  Zap,
  Square,
  Send,
  User,
  Clock,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import { getRoleIcon } from '../../utils/getRoleIcon';
import { sessionStatusDot } from '../../utils/statusColors';
import { useToastStore } from '../Toast';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { StatusBadge, agentStatusProps, connectionStatusProps } from '../ui/StatusBadge';
import { Tabs } from '../ui/Tabs';
import type { TabItem } from '../ui/Tabs';
import { useEffectiveProjectId } from '../../hooks/useEffectiveProjectId';
import { AgentChatPanel } from '../AgentChatPanel';

// ── Types (shared with CrewRoster) ─────────────────────────

type RosterStatus = 'idle' | 'busy' | 'terminated' | 'retired';
type LiveStatus = 'creating' | 'running' | 'idle' | 'completed' | 'failed' | 'terminated' | null;
type ProfileTab = 'overview' | 'chat' | 'settings';

interface RosterAgent {
  agentId: string;
  role: string;
  model: string;
  status: RosterStatus;
  liveStatus: LiveStatus;
  teamId: string;
  projectId: string | null;
  parentId: string | null;
  sessionId: string | null;
  lastTaskSummary: string | null;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
}

interface AgentProfile {
  agentId: string;
  role: string;
  model: string;
  status: RosterStatus;
  liveStatus: LiveStatus;
  teamId: string;
  projectId: string | null;
  lastTaskSummary: string | null;
  createdAt: string;
  updatedAt: string;
  knowledgeCount: number;
  live: {
    task: string | null;
    outputPreview: string | null;
    autopilot: boolean;
    model: string | null;
    sessionId: string | null;
    provider: string | null;
    backend: string | null;
  } | null;
}

interface TeamInfo {
  teamId: string;
  agentCount: number;
  roles: string[];
}

interface CrewSummary {
  leadId: string;
  projectId: string | null;
  projectName: string | null;
  agentCount: number;
  activeAgentCount: number;
  sessionCount: number;
  lastActivity: string;
}

interface SessionDetail {
  id: string;
  leadId: string;
  status: string;
  task: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  taskSummary: { total: number; done: number; failed: number };
  hasRetro: boolean;
}

interface HealthData {
  teamId: string;
  totalAgents: number;
  statusCounts: Record<string, number>;
  massFailurePaused: boolean;
}

interface ServerStatus {
  running: boolean;
  connected: boolean;
  state: string;
  agentCount: number | null;
  latencyMs: number | null;
  pendingRequests: number;
  trackedAgents: number;
}

interface ExportResult {
  success: boolean;
  bundle?: unknown;
  bundlePath?: string;
  manifest?: { exportedAt: string; agentCount: number; knowledgeCount: number };
  filesWritten?: number;
}

interface ImportReport {
  success: boolean;
  teamId: string;
  agents: Array<{ name: string; action: string; newAgentId: string; renamedTo?: string }>;
  knowledge: { imported: number; skipped: number; conflicts: number };
  training: { correctionsImported: number; feedbackImported: number };
  warnings: string[];
  validation: { valid: boolean; issues: Array<{ severity: string; message: string; phase?: string }> };
}

interface UnifiedCrewPageProps {
  scope?: 'project' | 'global';
}

// ── Helpers ───────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

// ── Crew Group (collapsible) ──────────────────────────────

function CrewGroup({ leadId, agents, summary, defaultExpanded = true, onSelectAgent, selectedAgentId }: {
  leadId: string;
  agents: RosterAgent[];
  summary: CrewSummary | null;
  defaultExpanded?: boolean;
  onSelectAgent: (id: string) => void;
  selectedAgentId: string | null;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || sessionsLoaded || !summary?.projectId) return;
    setSessionsLoaded(true);
    apiFetch<SessionDetail[]>(`/projects/${summary.projectId}/sessions/detail`)
      .then(data => {
        const crewSessions = Array.isArray(data)
          ? data.filter(s => s.leadId === leadId)
          : [];
        setSessions(crewSessions);
      })
      .catch(() => {});
  }, [expanded, sessionsLoaded, summary?.projectId, leadId]);

  const sorted = [...agents].sort((a, b) => {
    if (a.agentId === leadId) return -1;
    if (b.agentId === leadId) return 1;
    const aIsLead = a.role === 'lead' ? 0 : 1;
    const bIsLead = b.role === 'lead' ? 0 : 1;
    if (aIsLead !== bIsLead) return aIsLead - bIsLead;
    return a.role.localeCompare(b.role);
  });

  const lead = sorted.find(a => a.agentId === leadId || a.role === 'lead');
  const activeCount = summary?.activeAgentCount ?? agents.filter(a =>
    a.liveStatus === 'running' || a.liveStatus === 'idle'
  ).length;
  const latestActivity = summary?.lastActivity ??
    agents.reduce((latest, a) => a.updatedAt > latest ? a.updatedAt : latest, '');
  const displayName = summary?.projectName ?? (lead?.projectId ? `Project ${lead.projectId.slice(0, 8)}` : `Crew ${leadId.slice(0, 8)}`);

  return (
    <div className="border border-th-border rounded-lg overflow-hidden bg-surface-raised md:min-w-[280px]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-th-bg-alt/30 transition-colors"
      >
        <ChevronRight className={`w-4 h-4 text-th-text-muted shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-th-text text-sm">{displayName}</span>
            {activeCount > 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
                {activeCount}/{agents.length} active
              </span>
            ) : (
              <span className="text-[10px] text-th-text-muted">
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-th-text-muted mt-0.5">
            {lead && <span>🎖️ Lead: {lead.agentId.slice(0, 8)} · {lead.model}</span>}
            {summary?.sessionCount ? <span>📋 {summary.sessionCount} session{summary.sessionCount !== 1 ? 's' : ''}</span> : null}
            {latestActivity && <span>{formatRelativeTime(latestActivity)}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-th-border/50 divide-y divide-th-border/30">
          {sorted.map(agent => (
            <AgentRow
              key={agent.agentId}
              agent={agent}
              isLead={agent.agentId === leadId || agent.role === 'lead'}
              isSelected={selectedAgentId === agent.agentId}
              onSelect={() => onSelectAgent(agent.agentId)}
            />
          ))}
        </div>
      )}

      {expanded && sessions.length > 0 && (
        <div className="border-t border-th-border/50 px-3 py-2 bg-th-bg-alt/10">
          <div className="text-[10px] font-medium text-th-text-muted mb-1.5 uppercase tracking-wide">Sessions</div>
          <div className="space-y-1.5">
            {sessions.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-start gap-2 text-[11px]">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${sessionStatusDot(s.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-th-text truncate">{s.task ?? 'No task description'}</div>
                  <div className="flex items-center gap-2 text-[10px] text-th-text-muted">
                    <span>{formatRelativeTime(s.startedAt)}</span>
                    {s.durationMs != null && <span>{formatDuration(s.durationMs)}</span>}
                    {s.taskSummary.total > 0 && (
                      <span>
                        {s.taskSummary.done}/{s.taskSummary.total} tasks
                        {s.taskSummary.failed > 0 && ` · ${s.taskSummary.failed} failed`}
                      </span>
                    )}
                    {s.hasRetro && <span title="Session retro available">📝</span>}
                  </div>
                </div>
              </div>
            ))}
            {sessions.length > 5 && (
              <div className="text-[10px] text-th-text-muted">+ {sessions.length - 5} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Row ─────────────────────────────────────────────

function AgentRow({ agent, isLead, isSelected, onSelect }: {
  agent: RosterAgent; isLead?: boolean; isSelected: boolean; onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-th-bg-alt/30 transition-colors
        ${isSelected ? 'bg-th-bg-alt/40 border-l-2 border-blue-500' : ''}
        ${isLead ? 'font-medium' : ''}`}
    >
      <span className="w-4 text-center text-xs">{isLead ? '🎖️' : getRoleIcon(agent.role)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs capitalize">{agent.role}</span>
          <code className="text-[10px] text-th-text-muted">{agent.agentId.slice(0, 8)}</code>
          <span className="text-[10px] text-th-text-muted">{agent.model}</span>
        </div>
        {agent.lastTaskSummary && (
          <div className="text-[10px] text-th-text-muted truncate">{agent.lastTaskSummary}</div>
        )}
      </div>
      <StatusBadge {...agentStatusProps(agent.status, agent.liveStatus)} />
      {agent.provider && (
        <span className="px-1 py-0.5 rounded text-[10px] bg-th-bg-alt text-th-text-muted border border-th-border capitalize shrink-0">
          {agent.provider}
        </span>
      )}
    </button>
  );
}

// ── Profile Panel ─────────────────────────────────────────

function ProfilePanel({ agentId, teamId, onClose }: { agentId: string; teamId: string; onClose: () => void }) {
  const addToast = useToastStore(s => s.add);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [confirmStop, setConfirmStop] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const ActivityIcon = Activity;

  useEffect(() => {
    setLoading(true);
    apiFetch<AgentProfile>(`/teams/${teamId}/agents/${agentId}/profile`)
      .then(data => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [agentId, teamId]);

  const isAlive = profile?.liveStatus === 'running' || profile?.liveStatus === 'creating' || profile?.liveStatus === 'idle';

  const handleAction = async (action: string, endpoint: string, method = 'POST', body?: string) => {
    setActionLoading(action);
    try {
      await apiFetch(endpoint, { method, ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}) });
      addToast('success', action === 'stop' ? 'Agent terminated' : action === 'interrupt' ? 'Interrupt sent' : 'Message sent');
      if (action === 'stop') {
        const data = await apiFetch<AgentProfile>(`/teams/${teamId}/agents/${agentId}/profile`);
        setProfile(data);
        setConfirmStop(false);
      }
      if (action === 'message') { setMessageText(''); setShowMessageInput(false); }
    } catch (err: any) {
      addToast('error', `Failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-48 text-th-text-alt"><RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading profile…</div>;
  if (!profile) return <div className="flex items-center justify-center h-48 text-red-400"><AlertTriangle className="w-4 h-4 mr-2" />Profile not found</div>;

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-surface-raised rounded-lg border border-th-border w-full">
      <div className="p-4 border-b border-th-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-th-bg-alt flex items-center justify-center">
              <span className="text-xl">{getRoleIcon(profile.role)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-th-text capitalize">{profile.role}</h2>
                <StatusBadge {...agentStatusProps(profile.status, profile.liveStatus)} />
              </div>
              <span className="text-xs font-mono text-th-text-alt">{profile.agentId.slice(0, 12)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-th-bg-alt text-th-text-alt"><X className="w-4 h-4" /></button>
        </div>

        {isAlive && (
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setShowMessageInput(v => !v)} disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
              <MessageSquare className="w-3.5 h-3.5" />Message
            </button>
            <button onClick={() => handleAction('interrupt', `/agents/${agentId}/interrupt`)} disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
              {actionLoading === 'interrupt' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Interrupt
            </button>
            <button onClick={() => setConfirmStop(true)} disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
              <Square className="w-3.5 h-3.5" />Stop
            </button>
          </div>
        )}

        {confirmStop && (
          <div className="mt-2 p-3 rounded bg-red-500/10 border border-red-500/30">
            <p className="text-xs text-red-300 mb-2">Terminate this agent? This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => handleAction('stop', `/agents/${agentId}/terminate`)} disabled={actionLoading === 'stop'}
                className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50">
                {actionLoading === 'stop' ? 'Stopping...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmStop(false)} className="px-3 py-1 text-xs rounded bg-th-bg-alt text-th-text-alt hover:bg-th-border transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {showMessageInput && (
          <div className="mt-2 flex gap-2">
            <input type="text" value={messageText} onChange={e => setMessageText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAction('message', `/agents/${agentId}/message`, 'POST', JSON.stringify({ content: messageText.trim() })); } }}
              placeholder="Type a message…" className="flex-1 px-3 py-1.5 text-sm rounded bg-th-bg-alt border border-th-border text-th-text placeholder:text-th-text-alt" autoFocus />
            <button onClick={() => handleAction('message', `/agents/${agentId}/message`, 'POST', JSON.stringify({ content: messageText.trim() }))}
              disabled={!messageText.trim() || actionLoading === 'message'}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1">
              {actionLoading === 'message' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send
            </button>
          </div>
        )}
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={(id) => setActiveTab(id as ProfileTab)} className="px-4" />

      <div className="p-4">
        {activeTab === 'overview' && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-th-text-alt">Model:</span> <span className="text-th-text">{profile.model}</span></div>
              <div><span className="text-th-text-alt">Team:</span> <span className="text-th-text">{profile.teamId}</span></div>
              <div><span className="text-th-text-alt">Project:</span> <span className="text-th-text">{profile.projectId ?? '—'}</span></div>
              <div><span className="text-th-text-alt">Knowledge:</span> <span className="text-th-text">{profile.knowledgeCount} entries</span></div>
              <div><span className="text-th-text-alt">Created:</span> <span className="text-th-text">{new Date(profile.createdAt).toLocaleDateString()}</span></div>
              <div><span className="text-th-text-alt">Last Active:</span> <span className="text-th-text">{new Date(profile.updatedAt).toLocaleDateString()}</span></div>
              {profile.live?.provider && (
                <div><span className="text-th-text-alt">CLI:</span> <span className="text-th-text capitalize">{profile.live.provider}{profile.live.backend && profile.live.backend !== 'acp' ? ` (${profile.live.backend})` : ''}</span></div>
              )}
              {profile.live?.sessionId && (
                <div className="col-span-2">
                  <span className="text-th-text-alt">Session:</span>{' '}
                  <button className="font-mono text-xs text-th-text bg-th-bg-alt/60 px-1.5 py-0.5 rounded hover:bg-th-bg-alt transition-colors"
                    title="Click to copy" onClick={() => navigator.clipboard.writeText(profile.live!.sessionId!)}>
                    {profile.live.sessionId.slice(0, 12)}…
                  </button>
                </div>
              )}
            </div>
            {profile.lastTaskSummary && (
              <div><span className="text-th-text-alt">Last Task:</span><p className="text-th-text mt-1">{profile.lastTaskSummary}</p></div>
            )}
            {profile.live && (
              <div className="mt-3 p-3 rounded bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-green-400 text-xs mb-1"><ActivityIcon className="w-3.5 h-3.5" />Live Session</div>
                {profile.live.task && <p className="text-sm text-th-text">{profile.live.task}</p>}
              </div>
            )}
          </div>
        )}
        {activeTab === 'chat' && (
          <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
            <AgentChatPanel agentId={agentId} readOnly={!isAlive} maxHeight="400px" />
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-th-text-alt">Model:</span> <span className="text-th-text">{profile.model}</span></div>
              <div><span className="text-th-text-alt">Autopilot:</span> <span className="text-th-text">{profile.live?.autopilot ? 'On' : 'Off'}</span></div>
              {profile.live?.provider && <div><span className="text-th-text-alt">CLI Provider:</span> <span className="text-th-text capitalize">{profile.live.provider}</span></div>}
              {profile.live?.backend && <div><span className="text-th-text-alt">Backend:</span> <span className="text-th-text">{profile.live.backend}</span></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Health Strip (collapsible footer) ─────────────────────

function HealthStrip({ teamId }: { teamId: string }) {
  const addToast = useToastStore(s => s.add);
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const [h, s] = await Promise.all([
          apiFetch<HealthData>(`/teams/${teamId}/health`),
          apiFetch<ServerStatus>('/server/status'),
        ]);
        setHealth(h);
        setServerStatus(s);
      } catch {
        // Health data is optional
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, [teamId]);

  const handleStopServer = async () => {
    try {
      await apiFetch('/server/stop', { method: 'POST' });
      addToast('success', 'Agent server stopped');
      setConfirmStop(false);
    } catch (err: any) {
      addToast('error', `Failed to stop server: ${err.message}`);
    }
  };

  const statusCounts = health?.statusCounts ?? {};

  return (
    <div className="border border-th-border rounded-lg bg-surface-raised overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-th-text-muted hover:bg-th-bg-alt/30 transition-colors"
      >
        {serverStatus && !serverStatus.connected && <WifiOff className="w-3 h-3 text-red-400" />}
        {health?.massFailurePaused && <AlertTriangle className="w-3 h-3 text-red-400" />}
        <Heart className="w-3.5 h-3.5" />
        <span>Health</span>
        <span className="text-[10px]">
          {health
            ? `${health.totalAgents} total · ${statusCounts.busy ?? 0} active · ${statusCounts.idle ?? 0} idle`
            : '…'}
        </span>
        <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-th-border/50 px-4 py-3 space-y-3">
          {health?.massFailurePaused && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2 flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Mass failure detected — agent spawning is paused
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Users className="w-3.5 h-3.5 text-th-text-muted" />
              <span className="font-bold">{health?.totalAgents ?? 0}</span>
              <span className="text-th-text-muted">Total</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span className="font-bold text-green-400">{statusCounts.busy ?? 0}</span>
              <span className="text-th-text-muted">Active</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <PauseCircle className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-blue-400">{statusCounts.idle ?? 0}</span>
              <span className="text-th-text-muted">Idle</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <UserMinus className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-bold text-gray-400">{statusCounts.retired ?? 0}</span>
              <span className="text-th-text-muted">Retired</span>
            </div>
            {serverStatus && (
              <div className="flex items-center gap-2 text-xs">
                <Server className="w-3.5 h-3.5 text-th-text-muted" />
                {serverStatus.connected ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                <span className="text-th-text-muted">{serverStatus.agentCount || health?.totalAgents || 0} agents</span>
                {serverStatus.latencyMs != null && <span className="text-th-text-muted">{serverStatus.latencyMs}ms</span>}
              </div>
            )}
          </div>

          {serverStatus?.running && (
            <div className="flex items-center gap-2">
              {!confirmStop ? (
                <button onClick={() => setConfirmStop(true)}
                  className="px-2 py-1 text-[10px] rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors flex items-center gap-1">
                  <Power className="w-3 h-3" />Stop Server
                </button>
              ) : (
                <>
                  <span className="text-[10px] text-red-400">Stop server? All agents will be terminated.</span>
                  <button onClick={handleStopServer} className="px-2 py-1 text-[10px] rounded bg-red-600 text-white hover:bg-red-500">Confirm</button>
                  <button onClick={() => setConfirmStop(false)} className="px-2 py-1 text-[10px] rounded bg-th-bg-alt text-th-text-alt hover:bg-th-border">Cancel</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export Dialog (ported from CrewPage) ───────────────────

function ExportDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const addToast = useToastStore(s => s.add);
  const [includeKnowledge, setIncludeKnowledge] = useState(true);
  const [includeTraining, setIncludeTraining] = useState(true);
  const [excludeEpisodic, setExcludeEpisodic] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  const handleExport = async (toDirectory: boolean) => {
    setExporting(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { includeKnowledge, includeTraining, excludeEpisodic };
      if (toDirectory && outputPath.trim()) body.outputPath = outputPath.trim();
      const data = await apiFetch<ExportResult>(`/teams/${encodeURIComponent(teamId)}/export`, { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
      if (data.success && !toDirectory && data.bundle) {
        const blob = new Blob([JSON.stringify(data.bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${teamId}-crew-bundle.json`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('success', 'Crew bundle downloaded');
      } else if (data.success && toDirectory) {
        addToast('success', `Exported to ${data.bundlePath ?? outputPath}`);
      }
    } catch (err: any) {
      addToast('error', err.message ?? 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-th-bg border border-th-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-th-border">
          <div className="flex items-center gap-2"><Download className="w-5 h-5 text-th-accent" /><h2 className="text-base font-semibold text-th-text">Export Crew</h2></div>
          <button onClick={onClose} className="text-th-text-muted hover:text-th-text p-1" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Export packages your crew&apos;s agents, knowledge, and training data into a portable bundle.</span>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-th-text cursor-pointer"><input type="checkbox" checked={includeKnowledge} onChange={e => setIncludeKnowledge(e.target.checked)} className="rounded" />Include knowledge entries</label>
            <label className="flex items-center gap-2 text-sm text-th-text cursor-pointer"><input type="checkbox" checked={includeTraining} onChange={e => setIncludeTraining(e.target.checked)} className="rounded" />Include training data</label>
            <label className="flex items-center gap-2 text-sm text-th-text-alt cursor-pointer"><input type="checkbox" checked={excludeEpisodic} onChange={e => setExcludeEpisodic(e.target.checked)} className="rounded" />Exclude episodic knowledge</label>
          </div>
          <div>
            <label className="text-xs text-th-text-alt block mb-1">Export directory (optional)</label>
            <input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)} placeholder="/path/to/export/directory"
              className="w-full px-3 py-2 text-sm rounded bg-th-bg-alt border border-th-border text-th-text placeholder:text-th-text-alt" />
          </div>
          {result?.success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />{result.bundlePath ? `Exported to ${result.bundlePath}` : 'Bundle downloaded'}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => handleExport(true)} disabled={exporting || !outputPath.trim()}
              className="px-4 py-2 text-sm rounded bg-th-bg-alt hover:bg-th-border text-th-text-alt transition-colors flex items-center gap-1.5 disabled:opacity-40">
              <FolderDown className="w-4 h-4" />Export to Directory
            </button>
            <button onClick={() => handleExport(false)} disabled={exporting}
              className="px-4 py-2 text-sm rounded bg-th-accent/20 hover:bg-th-accent/30 text-th-accent border border-th-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-40">
              <Download className="w-4 h-4" />{exporting ? 'Exporting…' : 'Download Bundle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import Dialog (ported from CrewPage) ──────────────────

function ImportDialog({ teamId, onClose, onImported }: { teamId: string; onClose: () => void; onImported: () => void }) {
  const addToast = useToastStore(s => s.add);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bundleJson, setBundleJson] = useState('');
  const [projectId, setProjectId] = useState('');
  const [agentConflict, setAgentConflict] = useState<'skip' | 'rename' | 'overwrite'>('skip');
  const [knowledgeConflict, setKnowledgeConflict] = useState<'prefer_existing' | 'prefer_import' | 'keep_both' | 'skip'>('prefer_existing');
  const [importing, setImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ImportReport | null>(null);
  const [importResult, setImportResult] = useState<ImportReport | null>(null);

  const parseBundle = (): unknown | null => { try { return JSON.parse(bundleJson); } catch { addToast('error', 'Invalid JSON'); return null; } };

  const handleDryRun = async () => {
    const bundle = parseBundle();
    if (!bundle || !projectId.trim()) { addToast('error', 'Bundle and project ID required'); return; }
    setImporting(true);
    setDryRunResult(null);
    try {
      const data = await apiFetch<{ success: boolean; report: ImportReport }>('/teams/import', {
        method: 'POST', body: JSON.stringify({ bundle, projectId: projectId.trim(), teamId, agentConflict, knowledgeConflict, dryRun: true }),
      });
      setDryRunResult(data.report);
    } catch (err: any) { addToast('error', err.message ?? 'Dry run failed'); }
    finally { setImporting(false); }
  };

  const handleImport = async () => {
    const bundle = parseBundle();
    if (!bundle || !projectId.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const data = await apiFetch<{ success: boolean; report: ImportReport }>('/teams/import', {
        method: 'POST', body: JSON.stringify({ bundle, projectId: projectId.trim(), teamId, agentConflict, knowledgeConflict, dryRun: false }),
      });
      setImportResult(data.report);
      if (data.success) { addToast('success', 'Crew imported'); onImported(); }
    } catch (err: any) { addToast('error', err.message ?? 'Import failed'); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-th-bg border border-th-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-th-border sticky top-0 bg-th-bg z-10">
          <div className="flex items-center gap-2"><Upload className="w-5 h-5 text-th-accent" /><h2 className="text-base font-semibold text-th-text">Import Crew</h2></div>
          <button onClick={onClose} className="text-th-text-muted hover:text-th-text p-1" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <input ref={fileInputRef} type="file" accept=".json" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              try { setBundleJson(await file.text()); addToast('success', `Loaded ${file.name}`); } catch { addToast('error', 'Failed to read file'); }
            }} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-th-border hover:border-th-accent/50 text-sm text-th-text-alt hover:text-th-text transition-colors flex items-center justify-center gap-2">
              <Package className="w-5 h-5" />{bundleJson ? 'Bundle loaded ✓' : 'Choose crew bundle (.json)'}
            </button>
          </div>
          <div>
            <label className="text-xs text-th-text-alt block mb-1">Target project ID (required)</label>
            <input type="text" value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="my-project"
              className="w-full px-3 py-2 text-sm rounded bg-th-bg-alt border border-th-border text-th-text placeholder:text-th-text-alt" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-th-text-alt block mb-1">Agent conflicts</label>
              <select value={agentConflict} onChange={e => setAgentConflict(e.target.value as typeof agentConflict)}
                className="w-full px-2 py-1.5 text-sm rounded bg-th-bg-alt border border-th-border text-th-text">
                <option value="skip">Skip existing</option><option value="rename">Rename new</option><option value="overwrite">Overwrite</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-th-text-alt block mb-1">Knowledge conflicts</label>
              <select value={knowledgeConflict} onChange={e => setKnowledgeConflict(e.target.value as typeof knowledgeConflict)}
                className="w-full px-2 py-1.5 text-sm rounded bg-th-bg-alt border border-th-border text-th-text">
                <option value="prefer_existing">Keep existing</option><option value="prefer_import">Prefer import</option><option value="keep_both">Keep both</option><option value="skip">Skip all</option>
              </select>
            </div>
          </div>
          {dryRunResult && (
            <div className="p-3 rounded-lg border border-th-border bg-th-bg-alt space-y-2">
              <h3 className="text-sm font-medium text-th-text">Import Preview</h3>
              {dryRunResult.validation?.issues?.length > 0 && (
                <div className="space-y-1">
                  {dryRunResult.validation.issues.map((issue, i) => (
                    <div key={i} className={`text-xs flex items-center gap-1 ${issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                      <AlertTriangle className="w-3 h-3" />{issue.message}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-th-text-alt space-y-0.5">
                <p>Agents: {dryRunResult.agents?.length ?? 0}</p>
                <p>Knowledge: {dryRunResult.knowledge?.imported ?? 0} to import, {dryRunResult.knowledge?.skipped ?? 0} skipped</p>
              </div>
            </div>
          )}
          {importResult?.success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />Crew imported
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={handleDryRun} disabled={importing || !bundleJson || !projectId.trim()}
              className="px-4 py-2 text-sm rounded bg-th-bg-alt hover:bg-th-border text-th-text-alt transition-colors disabled:opacity-40">Preview</button>
            <button onClick={handleImport} disabled={importing || !bundleJson || !projectId.trim()}
              className="px-4 py-2 text-sm rounded bg-th-accent/20 hover:bg-th-accent/30 text-th-accent border border-th-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-40">
              <Upload className="w-4 h-4" />{importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────

export function UnifiedCrewPage({ scope = 'global' }: UnifiedCrewPageProps) {
  const addToast = useToastStore(s => s.add);
  const [agents, setAgents] = useState<RosterAgent[]>([]);
  const [crewSummaries, setCrewSummaries] = useState<CrewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RosterStatus | 'all'>('all');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const effectiveProjectId = useEffectiveProjectId();
  const projectId = scope === 'project' ? effectiveProjectId : null;

  const selectedAgentTeamId = agents.find(a => a.agentId === selectedAgent)?.teamId ?? 'default';

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const [summaryResult, teamsResult] = await Promise.allSettled([
        apiFetch<CrewSummary[]>('/crews/summary'),
        apiFetch<{ teams: TeamInfo[] }>('/teams'),
      ]);

      const summaries = summaryResult.status === 'fulfilled' && Array.isArray(summaryResult.value)
        ? summaryResult.value : [];
      setCrewSummaries(summaries);

      const teamList = teamsResult.status === 'fulfilled' ? (teamsResult.value.teams ?? []) : [];
      const statusQ = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const agentResults = await Promise.allSettled(
        teamList.map(t => apiFetch<RosterAgent[]>(`/teams/${t.teamId}/agents${statusQ}`))
      );

      const allAgents: RosterAgent[] = [];
      let failCount = 0;
      for (const r of agentResults) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          allAgents.push(...r.value);
        } else {
          failCount++;
        }
      }

      if (failCount === agentResults.length && agentResults.length > 0) {
        const firstFail = agentResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(firstFail?.reason?.message ?? 'Failed to fetch agents');
      }

      // Filter to project scope if needed
      if (projectId) {
        const projectLeadIds = new Set(summaries.filter(s => s.projectId === projectId).map(s => s.leadId));
        const filtered = allAgents.filter(a => {
          if (a.projectId === projectId) return true;
          if (projectLeadIds.has(a.agentId)) return true;
          if (a.parentId && projectLeadIds.has(a.parentId)) return true;
          return false;
        });
        setAgents(filtered);
      } else {
        setAgents(allAgents);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch crew roster');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filter agents by search
  const filtered = agents.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.role.toLowerCase().includes(q)
      || a.agentId.toLowerCase().includes(q)
      || (a.lastTaskSummary?.toLowerCase().includes(q) ?? false);
  });

  // Group by lead
  const crewGroups = (() => {
    const map = new Map<string, RosterAgent[]>();
    for (const a of filtered) {
      const leadId = a.role === 'lead' ? a.agentId : (a.parentId ?? 'unassigned');
      if (!map.has(leadId)) map.set(leadId, []);
      map.get(leadId)!.push(a);
    }
    return [...map.entries()].sort((a, b) => {
      const aActive = a[1].some(ag => ag.liveStatus === 'running' || ag.liveStatus === 'idle');
      const bActive = b[1].some(ag => ag.liveStatus === 'running' || ag.liveStatus === 'idle');
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aTime = a[1].reduce((max, ag) => ag.updatedAt > max ? ag.updatedAt : max, '');
      const bTime = b[1].reduce((max, ag) => ag.updatedAt > max ? ag.updatedAt : max, '');
      return bTime.localeCompare(aTime);
    });
  })();

  const summaryMap = new Map(crewSummaries.map(s => [s.leadId, s]));

  const hasActiveAgents = agents.some(a =>
    a.status === 'idle' || a.status === 'busy' || a.liveStatus === 'running' || a.liveStatus === 'creating' || a.liveStatus === 'idle'
  );
  const allTerminated = agents.length > 0 && !hasActiveAgents;

  if (loading && agents.length === 0) {
    return <div className="flex items-center justify-center h-64 text-th-text-alt"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading crew roster…</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-64 text-red-400"><AlertTriangle className="w-5 h-5 mr-2" />{error}</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-th-accent" />
          <h1 className="text-xl font-bold text-th-text">
            {scope === 'project' ? 'Crew' : 'All Crews'}
          </h1>
          <span className="text-sm text-th-text-muted">
            {crewGroups.length} crew{crewGroups.length !== 1 ? 's' : ''} · {filtered.length} agent{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Overflow menu for export/import */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(v => !v)}
              className="p-1.5 rounded hover:bg-th-bg-alt text-th-text-alt transition-colors"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-th-bg border border-th-border rounded-lg shadow-xl z-20 py-1">
                <button onClick={() => { setShowExport(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-th-text-alt hover:bg-th-bg-alt transition-colors">
                  <Download className="w-3.5 h-3.5" />Export Crew
                </button>
                <button onClick={() => { setShowImport(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-th-text-alt hover:bg-th-bg-alt transition-colors">
                  <Upload className="w-3.5 h-3.5" />Import Crew
                </button>
              </div>
            )}
          </div>
          <button onClick={() => fetchAll()}
            className="px-3 py-1.5 text-sm rounded bg-th-bg-alt hover:bg-th-border text-th-text-alt transition-colors flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-th-text-alt" />
          <input type="text" placeholder="Search crews, agents, tasks..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded bg-th-bg-alt border border-th-border text-th-text placeholder:text-th-text-alt" />
        </div>
        <div className="flex gap-1">
          {(['all', 'idle', 'busy', 'terminated', 'retired'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-th-accent/20 text-th-accent border border-th-accent/30'
                  : 'bg-th-bg-alt text-th-text-alt border border-th-border hover:bg-th-border'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Content: Grouped List + Profile */}
      <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0 overflow-y-auto mt-4">
        <div className={`space-y-3 w-full max-w-full md:min-w-[320px] lg:min-w-[400px] ${selectedAgent ? 'md:w-[60%]' : 'w-full'}`}>
          {/* Empty: no agents at all */}
          {agents.length === 0 && !loading && (
            <div className="text-center py-12 text-th-text-alt text-sm bg-surface-raised rounded-lg border border-th-border">
              <span className="text-4xl block mb-2">🤖</span>
              <p className="font-medium text-th-text">No agents yet</p>
              <p className="text-th-text-muted mt-1">Start a session to spawn your first crew.</p>
            </div>
          )}

          {/* Empty: search returns nothing */}
          {agents.length > 0 && filtered.length === 0 && search && (
            <div className="text-center py-8 text-th-text-alt text-sm bg-surface-raised rounded-lg border border-th-border flex items-center justify-center gap-2">
              <span>No agents match &ldquo;{search}&rdquo;</span>
              <button onClick={() => setSearch('')} className="px-2 py-0.5 text-xs rounded bg-th-bg-alt hover:bg-th-border text-th-text-alt border border-th-border transition-colors">Clear</button>
            </div>
          )}

          {/* Banner: all terminated */}
          {allTerminated && filtered.length > 0 && (
            <div className="text-center py-4 text-th-text-alt text-sm bg-surface-raised rounded-lg border border-th-border">
              <span className="text-2xl block mb-1">💤</span>
              <p className="font-medium text-th-text">No active agents</p>
              <p className="text-th-text-muted text-xs mt-0.5">All agents from previous sessions are shown below.</p>
            </div>
          )}

          {crewGroups.length > 0 && crewGroups.map(([leadId, groupAgents]) => (
            <CrewGroup
              key={leadId}
              leadId={leadId}
              agents={groupAgents}
              summary={summaryMap.get(leadId) ?? null}
              defaultExpanded
              onSelectAgent={setSelectedAgent}
              selectedAgentId={selectedAgent}
            />
          ))}
        </div>

        {/* Profile Panel — mobile: full-screen slide-over; desktop: side panel */}
        <div
          className={`
            fixed inset-0 z-40 bg-th-bg transform transition-transform duration-150 ease-out
            md:static md:inset-auto md:z-auto md:bg-transparent md:transform-none md:transition-none
            ${selectedAgent ? 'translate-x-0' : 'translate-x-full'}
            ${selectedAgent ? 'md:w-[40%] md:min-w-[360px] md:max-w-[480px]' : 'md:w-0 md:hidden'}
          `}
        >
          {selectedAgent && (
            <div className="h-full overflow-y-auto">
              <button
                onClick={() => setSelectedAgent(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-th-text-alt hover:text-th-text transition-colors md:hidden"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Back
              </button>
              <ProfilePanel agentId={selectedAgent} teamId={selectedAgentTeamId} onClose={() => setSelectedAgent(null)} />
            </div>
          )}
        </div>
      </div>

      {/* Health Strip (collapsed at bottom) */}
      <div className="mt-3 shrink-0">
        <HealthStrip teamId="default" />
      </div>

      {/* Dialogs */}
      {showExport && <ExportDialog teamId="default" onClose={() => setShowExport(false)} />}
      {showImport && <ImportDialog teamId="default" onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); fetchAll(); }} />}
    </div>
  );
}
