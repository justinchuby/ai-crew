/**
 * OverviewPage — Project Command Center.
 *
 * Answers: "What needs my attention right now?"
 * - Quick Status Bar — running/stopped, agent count, task progress, duration
 * - Session Controls — start/stop/resume
 * - Attention Items — alerts from detectAlerts (failed agents, pending decisions, blocked tasks)
 * - Two-column feed: Decisions + Progress (including milestones)
 * - Session History (collapsible, always visible)
 *
 * All visualization charts moved to AnalysisPage.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useLeadStore } from '../../stores/leadStore';
import { apiFetch } from '../../hooks/useApi';
import { useProjects } from '../../hooks/useProjects';
import { formatDateTime } from '../../utils/format';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { POLL_INTERVAL_MS } from '../../constants/timing';
import { SessionHistory, NewSessionDialog } from '../SessionHistory';
import { detectAlerts, type Alert, type AlertSeverity } from '../MissionControl/AlertsPanel';
import {
  Square,
  Plus,
  Users,
  Clock,
  Crown,
  Loader2,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Decision, DagStatus } from '../../types';
import type { ReplayKeyframe } from '../../hooks/useSessionReplay';

// ── Constants ──────────────────────────────────────────────────────

const DECISION_CATEGORY_ICONS: Record<string, string> = {
  architecture: '🏗️',
  dependency: '📦',
  style: '🎨',
  tool_access: '🔧',
  testing: '🧪',
  general: '💡',
};

const SEVERITY_BG: Record<AlertSeverity, string> = {
  critical: 'bg-red-500/10 border border-red-500/20',
  warning: 'bg-amber-500/10 border border-amber-500/20',
  info: 'bg-blue-500/10 border border-blue-500/20',
};

interface ActivityEntry {
  id: number;
  agentId: string;
  agentRole: string;
  actionType: string;
  summary: string;
  timestamp: string;
  projectId: string;
}

/** Unified progress item — merges activity feed with milestone keyframes */
interface ProgressItem {
  id: string;
  icon: string;
  text: string;
  detail: string;
  timestamp: number;
}

// ── Props ──────────────────────────────────────────────────────────

interface Props {
  api?: any;
  ws?: any;
}

// ── Component ──────────────────────────────────────────────────────

export function OverviewPage(_props: Props) {
  const agents = useAppStore((s) => s.agents);
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);
  const { projects } = useProjects();

  // Derive effective project ID
  const effectiveId = useMemo(() => {
    if (selectedLeadId) {
      const lead = agents.find((a) => a.id === selectedLeadId);
      return lead?.projectId || selectedLeadId;
    }
    const lead = agents.find((a) => a.role?.id === 'lead' && !a.parentId);
    if (lead) return lead.projectId || lead.id;
    return projects.length > 0 ? projects[0].id : null;
  }, [selectedLeadId, agents, projects]);

  const hasActiveLead = useMemo(() => {
    return agents.some(a => a.role?.id === 'lead' && a.projectId === effectiveId &&
      (a.status === 'running' || a.status === 'idle'));
  }, [agents, effectiveId]);

  const activeLeadAgent = useMemo(() => {
    if (!hasActiveLead || !effectiveId) return null;
    return agents.find(a => a.role?.id === 'lead' && a.projectId === effectiveId &&
      (a.status === 'running' || a.status === 'idle')) ?? null;
  }, [agents, effectiveId, hasActiveLead]);

  const projectAgents = useMemo(() => {
    if (!effectiveId) return [];
    return agents.filter(a => a.projectId === effectiveId && (a.status === 'running' || a.status === 'idle'));
  }, [agents, effectiveId]);

  // ── Session controls state ────────────────────────────────────
  const [stopping, setStopping] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);

  const handleStopSession = useCallback(async () => {
    if (!effectiveId) return;
    setStopping(true);
    try {
      await apiFetch(`/projects/${effectiveId}/stop`, { method: 'POST' });
    } catch { /* ignore */ }
    finally { setStopping(false); }
  }, [effectiveId]);

  // ── Attention alerts ──────────────────────────────────────────
  const dagStatus = useLeadStore(s => {
    const proj = s.projects[effectiveId ?? ''];
    return proj?.dagStatus ?? null;
  });
  const storeDecisions = useLeadStore(s => {
    const proj = s.projects[effectiveId ?? ''];
    return proj?.decisions ?? [];
  });

  const alerts = useMemo(
    () => detectAlerts(projectAgents, storeDecisions, dagStatus),
    [projectAgents, storeDecisions, dagStatus],
  );

  // ── Decisions feed ────────────────────────────────────────────
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!effectiveId) return;
    mountedRef.current = true;
    const poll = async () => {
      try {
        const data = await apiFetch<Decision[]>(`/lead/${effectiveId}/decisions`);
        if (mountedRef.current) setDecisions(Array.isArray(data) ? data : []);
      } catch { /* API may not be ready */ }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [effectiveId]);

  const actionableDecisions = useMemo(() =>
    decisions.filter(d => d.status === 'recorded' && d.needsConfirmation),
    [decisions],
  );

  // ── Progress feed (activity + milestone keyframes) ────────────
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [milestoneKeyframes, setMilestoneKeyframes] = useState<ReplayKeyframe[]>([]);

  useEffect(() => {
    if (!effectiveId) return;
    const poll = async () => {
      try {
        const data = await apiFetch<ActivityEntry[]>(
          `/coordination/activity?projectId=${effectiveId}&type=progress&limit=20`,
        );
        if (mountedRef.current) setActivity(Array.isArray(data) ? data : []);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [effectiveId]);

  // Lightweight keyframes fetch — only milestone/progress types for the feed
  useEffect(() => {
    if (!effectiveId) return;
    const fetchMilestones = async () => {
      try {
        const data = await apiFetch<{ keyframes: ReplayKeyframe[] }>(`/replay/${effectiveId}/keyframes`);
        const kf = (data.keyframes ?? []).filter(
          (k: ReplayKeyframe) => k.type === 'milestone' || k.type === 'progress',
        );
        if (mountedRef.current) setMilestoneKeyframes(kf);
      } catch { /* ignore */ }
    };
    fetchMilestones();
    const interval = setInterval(fetchMilestones, POLL_INTERVAL_MS * 3);
    return () => clearInterval(interval);
  }, [effectiveId]);

  // Merge activity + milestones into unified progress feed
  const progressItems = useMemo((): ProgressItem[] => {
    const items: ProgressItem[] = [];

    for (const entry of activity) {
      items.push({
        id: `activity-${entry.id}`,
        icon: '📊',
        text: entry.summary,
        detail: `${entry.agentRole} · ${formatRelativeTime(entry.timestamp)}`,
        timestamp: new Date(entry.timestamp).getTime(),
      });
    }

    for (const kf of milestoneKeyframes) {
      items.push({
        id: `milestone-${kf.timestamp}`,
        icon: kf.type === 'milestone' ? '🏁' : '📊',
        text: (kf as any).label ?? (kf as any).summary ?? `${kf.type} reached`,
        detail: formatRelativeTime(kf.timestamp),
        timestamp: new Date(kf.timestamp).getTime(),
      });
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [activity, milestoneKeyframes]);

  // ── Quick status bar data ─────────────────────────────────────
  const tasksDone = dagStatus?.summary?.done ?? 0;
  const tasksTotal = dagStatus?.summary
    ? dagStatus.summary.done + dagStatus.summary.running + dagStatus.summary.ready +
      dagStatus.summary.pending + dagStatus.summary.failed + dagStatus.summary.blocked +
      dagStatus.summary.paused + dagStatus.summary.skipped
    : 0;

  // ── Render ────────────────────────────────────────────────────

  if (!effectiveId && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-th-text-muted text-sm">
        No session data yet. Start a project to see the overview.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4" data-testid="overview-page">
      <div className="px-4 pt-2 space-y-4">

      {/* ── Quick Status Bar ───────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900/50 rounded-lg text-sm text-zinc-400" data-testid="quick-status-bar">
        <span className={hasActiveLead ? 'text-green-400' : 'text-red-400'}>
          {hasActiveLead ? '● Running' : '● Stopped'}
        </span>
        <span>{projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}</span>
        {tasksTotal > 0 && <span>{tasksDone}/{tasksTotal} tasks</span>}
        {activeLeadAgent?.createdAt && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            Started {formatDateTime(activeLeadAgent.createdAt)}
          </span>
        )}
      </div>

      {/* ── Session Controls ───────────────────────────────────── */}
      {effectiveId && hasActiveLead && activeLeadAgent && (
        <div className="bg-surface-raised border border-th-border rounded-lg p-4" data-testid="active-session-banner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Crown className="w-5 h-5 text-yellow-500" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-medium text-th-text">Active Session</div>
                <div className="text-xs text-th-text-muted flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Started {formatDateTime(activeLeadAgent.createdAt ?? '')}
                  </span>
                  {activeLeadAgent.task && (
                    <span className="truncate max-w-xs" title={activeLeadAgent.task}>
                      · {activeLeadAgent.task}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStopSession}
              disabled={stopping}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors font-medium disabled:opacity-50"
              data-testid="stop-session-btn"
            >
              {stopping ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
              {stopping ? 'Stopping…' : 'Stop Session'}
            </button>
          </div>
        </div>
      )}

      {effectiveId && !hasActiveLead && (
        <div className="flex items-center gap-3" data-testid="no-session-controls">
          <button
            type="button"
            onClick={() => setShowNewSessionDialog(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:bg-accent/80 text-white rounded-md transition-colors font-medium"
            data-testid="new-session-btn"
          >
            <Plus size={14} />
            New Session
          </button>
          <span className="text-xs text-th-text-muted">
            No active session. Start a new one or resume from history below.
          </span>
        </div>
      )}

      {/* ── Attention Items (only when alerts exist) ───────────── */}
      {alerts.length > 0 && (
        <section className="space-y-2" data-testid="attention-items">
          <h3 className="text-sm font-medium text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Attention Required
          </h3>
          {alerts.map(alert => (
            <div key={alert.id} className={`px-3 py-2 rounded-lg text-sm ${SEVERITY_BG[alert.severity]}`}>
              <span>{alert.icon} {alert.title}</span>
              <p className="text-xs text-zinc-400 mt-0.5">{alert.detail}</p>
            </div>
          ))}
        </section>
      )}

      {/* ── Two-Column Feed ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Decisions Feed */}
        <section className="bg-surface-raised border border-th-border rounded-lg" data-testid="decisions-feed">
          <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider px-4 py-2 border-b border-th-border">
            Decisions
          </h3>
          {actionableDecisions.length === 0 && decisions.length === 0 ? (
            <p className="text-zinc-500 text-sm px-4 py-6 text-center">No decisions yet</p>
          ) : (
            <div className="divide-y divide-th-border/30">
              {(actionableDecisions.length > 0 ? actionableDecisions : decisions).slice(0, 6).map(d => {
                const icon = DECISION_CATEGORY_ICONS[d.category] ?? '💡';
                const statusIcon = d.status === 'confirmed'
                  ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                  : d.status === 'rejected'
                    ? <XCircle className="w-3 h-3 text-red-400" />
                    : <Clock className="w-3 h-3 text-th-text-muted" />;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="flex items-start gap-2.5 px-3 py-2 w-full text-left hover:bg-th-bg-hover/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedDecision(d)}
                  >
                    <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {statusIcon}
                        <span className="text-xs text-th-text-alt truncate">{d.title}</span>
                      </div>
                      <div className="text-[10px] text-th-text-muted mt-0.5">
                        {d.agentRole} · {formatRelativeTime(d.timestamp)}
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-th-text-muted/50 shrink-0 mt-1" />
                  </button>
                );
              })}
              {(actionableDecisions.length > 6 || decisions.length > 6) && (
                <div className="px-4 py-2 text-center">
                  <span className="text-[10px] text-zinc-500">
                    +{Math.max(actionableDecisions.length, decisions.length) - 6} more
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Progress Feed */}
        <section className="bg-surface-raised border border-th-border rounded-lg" data-testid="progress-feed">
          <h3 className="text-xs font-medium text-th-text-muted uppercase tracking-wider px-4 py-2 border-b border-th-border">
            Recent Progress
          </h3>
          {progressItems.length === 0 ? (
            <p className="text-zinc-500 text-sm px-4 py-6 text-center">No progress events yet</p>
          ) : (
            <div className="divide-y divide-th-border/30">
              {progressItems.slice(0, 8).map(item => (
                <div key={item.id} className="flex items-start gap-2.5 px-3 py-2">
                  <span className="text-sm shrink-0 mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-th-text-alt truncate block">{item.text}</span>
                    <div className="text-[10px] text-th-text-muted mt-0.5">{item.detail}</div>
                  </div>
                </div>
              ))}
              {progressItems.length > 8 && (
                <div className="px-4 py-2 text-center">
                  <span className="text-[10px] text-zinc-500">+{progressItems.length - 8} more</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ── Session History (collapsible, always visible) ──────── */}
      {effectiveId && (
        <details className="mt-2" open={!hasActiveLead}>
          <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300 select-none">
            Session History
          </summary>
          <div className="mt-2">
            <SessionHistory projectId={effectiveId} hasActiveLead={hasActiveLead} />
          </div>
        </details>
      )}

      </div>

      {/* Decision Detail Modal */}
      {selectedDecision && (
        <DecisionDetailInline decision={selectedDecision} onClose={() => setSelectedDecision(null)} />
      )}

      {/* New Session Dialog */}
      {showNewSessionDialog && effectiveId && (
        <NewSessionDialog
          projectId={effectiveId}
          onClose={() => setShowNewSessionDialog(false)}
          onStarted={() => setShowNewSessionDialog(false)}
        />
      )}
    </div>
  );
}

// ── Inline Decision Detail (lightweight, no shared component dependency) ──

function DecisionDetailInline({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const icon = DECISION_CATEGORY_ICONS[decision.category] ?? '💡';
  const statusLabels: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Confirmed', color: 'text-green-400' },
    rejected: { label: 'Rejected', color: 'text-red-400' },
    recorded: { label: 'Recorded', color: 'text-th-text-muted' },
    dismissed: { label: 'Dismissed', color: 'text-yellow-400' },
  };
  const statusInfo = statusLabels[decision.status] ?? statusLabels.recorded;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="decision-detail-modal"
    >
      <div className="bg-th-bg-alt border border-th-border rounded-lg shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-th-border">
          <span className="text-base">{icon}</span>
          <h2 className="text-sm font-semibold text-th-text flex-1">Decision Detail</h2>
          <button type="button" onClick={onClose} className="text-th-text-muted hover:text-th-text text-sm">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div>
            <div className="text-xs text-th-text-muted mb-0.5">Title</div>
            <div className="text-sm text-th-text">{decision.title}</div>
          </div>
          {decision.rationale && (
            <div>
              <div className="text-xs text-th-text-muted mb-0.5">Rationale</div>
              <div className="text-sm text-th-text whitespace-pre-wrap">{decision.rationale}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-th-text-muted mb-0.5">Status</div>
              <span className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
            <div>
              <div className="text-xs text-th-text-muted mb-0.5">Made by</div>
              <span className="text-sm text-th-text">{decision.agentRole}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-th-text-muted mb-0.5">Timestamp</div>
            <span className="text-xs text-th-text">{new Date(decision.timestamp).toLocaleString()}</span>
          </div>
          <div className="flex gap-3 text-xs text-th-text-muted pt-1 border-t border-th-border/50">
            {decision.autoApproved && <span>✓ Auto-approved</span>}
            {decision.needsConfirmation && <span>⚠ Requires confirmation</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
