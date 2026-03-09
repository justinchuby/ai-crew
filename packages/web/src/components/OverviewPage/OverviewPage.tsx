import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useLeadStore } from '../../stores/leadStore';
import { apiFetch } from '../../hooks/useApi';
import { useProjects } from '../../hooks/useProjects';
import { deriveAgentsFromKeyframes } from '../../hooks/useHistoricalAgents';
import { formatDateTime } from '../../utils/format';
import { POLL_INTERVAL_MS } from '../../constants/timing';
import { ProgressTimeline } from './ProgressTimeline';
import { CumulativeFlow } from './TaskBurndown';
import { CostCurve } from './CostCurve';
import { KeyStats } from './KeyStats';
import { AgentHeatmap } from './AgentHeatmap';
import { MilestoneTimeline } from './MilestoneTimeline';
import { SessionHistory } from '../SessionHistory';
import {
  Square,
  Plus,
  Users,
  Clock,
  Crown,
  Loader2,
} from 'lucide-react';
import type { TimelineDataPoint } from './ProgressTimeline';
import type { FlowPoint } from './TaskBurndown';
import type { CostPoint } from './CostCurve';
import type { HeatmapBucket } from './AgentHeatmap';
import type { ReplayKeyframe } from '../../hooks/useSessionReplay';

// ── Props (kept for backward compat with App.tsx route) ────────────

interface Props {
  api?: any;
  ws?: any;
}

// ── Overview Page ──────────────────────────────────────────────────

export function OverviewPage(_props: Props) {
  const agents = useAppStore((s) => s.agents);
  const selectedLeadId = useLeadStore((s) => s.selectedLeadId);

  // ── Project list for selector ───────────────────────────────────
  const { projects } = useProjects();

  // Derive the effective ID used for data fetching.
  // Priority: live lead agent > sidebar > first project
  // Uses lead.projectId (project registry UUID) when available so replay fetches
  // match the projectId stored in activity events.
  const effectiveId = useMemo(() => {
    if (selectedLeadId) {
      const lead = agents.find((a) => a.id === selectedLeadId);
      return lead?.projectId || selectedLeadId;
    }
    const lead = agents.find((a) => a.role?.id === 'lead' && !a.parentId);
    if (lead) return lead.projectId || lead.id;
    return projects.length > 0 ? projects[0].id : null;
  }, [selectedLeadId, agents, projects]);

  // Check if project has an active running lead
  const hasActiveLead = useMemo(() => {
    return agents.some(a => a.role?.id === 'lead' && a.projectId === effectiveId &&
      (a.status === 'running' || a.status === 'idle'));
  }, [agents, effectiveId]);

  // Active session info
  const activeLeadAgent = useMemo(() => {
    if (!hasActiveLead || !effectiveId) return null;
    return agents.find(a => a.role?.id === 'lead' && a.projectId === effectiveId &&
      (a.status === 'running' || a.status === 'idle')) ?? null;
  }, [agents, effectiveId, hasActiveLead]);

  const projectAgents = useMemo(() => {
    if (!effectiveId) return [];
    return agents.filter(a => a.projectId === effectiveId && (a.status === 'running' || a.status === 'idle'));
  }, [agents, effectiveId]);

  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleStopSession = useCallback(async () => {
    if (!effectiveId) return;
    setStopping(true);
    try {
      await apiFetch(`/projects/${effectiveId}/stop`, { method: 'POST' });
    } catch { /* ignore */ }
    finally { setStopping(false); }
  }, [effectiveId]);

  const handleNewSession = useCallback(async () => {
    if (!effectiveId) return;
    setStarting(true);
    try {
      await apiFetch(`/projects/${effectiveId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ freshStart: true }),
      });
    } catch { /* ignore */ }
    finally { setStarting(false); }
  }, [effectiveId]);

  // ── Data state ─────────────────────────────────────────────────
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
  const [flowData, setFlowData] = useState<FlowPoint[]>([]);
  const [costData, setCostData] = useState<CostPoint[]>([]);
  const [heatmapBuckets, setHeatmapBuckets] = useState<HeatmapBucket[]>([]);
  const [keyframes, setKeyframes] = useState<ReplayKeyframe[]>([]);
  const [historicalAgents, setHistoricalAgents] = useState<any[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  // Use live agents if available, otherwise fall back to API-fetched historical agents
  const displayAgents = agents.length > 0 ? agents : historicalAgents;

  // ── Fetch overview data ────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!effectiveId) return;
    const requestId = ++fetchIdRef.current;

    try {
      // Fetch keyframes first — they drive all visualization panels
      const kfData = await apiFetch<{ keyframes: ReplayKeyframe[] }>(`/replay/${effectiveId}/keyframes`);
      const kf: ReplayKeyframe[] = kfData.keyframes ?? [];

      // Fetch/derive agent roster when live WebSocket agents are empty
      let resolvedAgents: any[] = [];
      if (agents.length === 0) {
        try {
          const agentData = await apiFetch<any[]>('/agents');
          resolvedAgents = Array.isArray(agentData) ? agentData : [];
        } catch { /* API may not have agent list endpoint */ }

        // Derive agents from spawn keyframes when REST /agents returns empty
        if (resolvedAgents.length === 0 && kf.length > 0) {
          resolvedAgents = deriveAgentsFromKeyframes(kf);
        }

        if (mountedRef.current) setHistoricalAgents(resolvedAgents);
      }

      // Bail if a newer request was started (rapid project switching)
      if (fetchIdRef.current !== requestId) return;

      // Use live agents if available, otherwise the resolved historical data
      const currentAgents = agents.length > 0 ? agents : resolvedAgents;
      if (mountedRef.current) {
        setKeyframes(kf);

        // Derive timeline data from keyframes
        if (kf.length > 0) {
          let completed = 0, inProgress = 0, agentCount = 0;
          const tPoints: TimelineDataPoint[] = [];
          const fPoints: FlowPoint[] = [];
          const cPoints: CostPoint[] = [];
          const hBuckets: HeatmapBucket[] = [];
          let taskTotal = 0;
          let spawnIdx = 0;

          // Use real token counts from available agents
          const totalInput = currentAgents.reduce((s: number, a: any) => s + (a.inputTokens ?? 0), 0);
          const totalOutput = currentAgents.reduce((s: number, a: any) => s + (a.outputTokens ?? 0), 0);
          const realTokens = totalInput + totalOutput;

          for (const frame of kf) {
            const t = new Date(frame.timestamp).getTime();

            if (frame.type === 'spawn') {
              agentCount++;
              // Map heatmap bucket to matching derived/live agent ID
              const matchAgent = currentAgents[spawnIdx];
              const bucketId = matchAgent?.id ?? `agent-${spawnIdx}`;
              spawnIdx++;
              hBuckets.push({ agentId: bucketId, time: t, intensity: 0.8 });
            }
            if (frame.type === 'agent_exit') agentCount = Math.max(0, agentCount - 1);
            if (frame.type === 'delegation') { taskTotal++; inProgress++; }
            if (frame.type === 'milestone' || frame.type === 'task') { completed++; inProgress = Math.max(0, inProgress - 1); }

            // Distribute real token usage proportionally across keyframes for the curve
            const progress = (tPoints.length + 1) / kf.length;
            cPoints.push({ time: t, cumulativeCost: realTokens * progress });

            tPoints.push({
              time: t,
              completed,
              inProgress,
              remaining: Math.max(0, taskTotal - completed - inProgress),
              agentCount,
            });
            fPoints.push({ time: t, created: taskTotal, inProgress, completed });
          }

          setTimelineData(tPoints);
          setFlowData(fPoints);
          setCostData(cPoints);
          setHeatmapBuckets(hBuckets);
          setTotalTokens(realTokens);
          setTotalTasks(taskTotal);
        } else {
          // No keyframes — clear stale data
          setTimelineData([]);
          setFlowData([]);
          setCostData([]);
          setHeatmapBuckets([]);
          setTotalTokens(0);
          setTotalTasks(0);
        }
      }
    } catch {
      // API not ready — show empty states
    }
  }, [effectiveId, agents.length]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS * 3); // 30s
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  // ── Session start time ─────────────────────────────────────────
  const sessionStart = useMemo(() => {
    if (keyframes.length > 0) return keyframes[0].timestamp;
    const lead = displayAgents.find((a: any) => a.id === effectiveId || a.projectId === effectiveId);
    return lead?.createdAt ?? undefined;
  }, [keyframes, displayAgents, effectiveId]);

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

      {/* ── Session Lifecycle Controls ─────────────────────────── */}
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
            onClick={handleNewSession}
            disabled={starting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:bg-accent/80 text-white rounded-md transition-colors font-medium disabled:opacity-50"
            data-testid="new-session-btn"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {starting ? 'Starting…' : 'New Session'}
          </button>
          <span className="text-xs text-th-text-muted">
            No active session. Start a new one or resume from history below.
          </span>
        </div>
      )}

      {/* Session History — prominent when no active session */}
      {effectiveId && !hasActiveLead && (
        <SessionHistory projectId={effectiveId} hasActiveLead={false} />
      )}

      {/* Hero: Progress Timeline */}
      <ProgressTimeline data={timelineData} width={800} height={240} />

      {/* Milestones */}
      <MilestoneTimeline keyframes={keyframes} />

      {/* Stats row: Burndown + Cost + Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CumulativeFlow data={flowData} />
        <CostCurve data={costData} />
        <KeyStats agents={displayAgents} totalTokens={totalTokens} sessionStart={sessionStart} />
      </div>

      {/* Agent Activity Heatmap */}
      <AgentHeatmap agents={displayAgents} buckets={heatmapBuckets} />

      {/* Session History — secondary when active session is running */}
      {effectiveId && hasActiveLead && (
        <SessionHistory projectId={effectiveId} hasActiveLead={true} />
      )}
      </div>
    </div>
  );
}
