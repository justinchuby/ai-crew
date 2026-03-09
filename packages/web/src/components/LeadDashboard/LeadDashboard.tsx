import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Crown, Users, CheckCircle, Clock, MessageSquare, GitBranch, ChevronDown, ChevronRight, ChevronUp, AlertTriangle, Download, AlertCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLeadStore } from '../../stores/leadStore';
import { useTimerStore, selectActiveTimerCount } from '../../stores/timerStore';
import type { AgentReport } from '../../stores/leadStore';
import type { AcpTextChunk, DagStatus } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useHistoricalAgents } from '../../hooks/useHistoricalAgents';
import { AgentReportBlock } from './AgentReportBlock';
import { BannerDecisionActions } from './DecisionPanel';
import { CwdBar } from './CwdBar';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useAttachments } from '../../hooks/useAttachments';
import { DropOverlay } from '../DropOverlay';
import { InputComposer } from './InputComposer';
import { ChatMessages, type CatchUpSummary } from './ChatMessages';
import { SidebarTabs } from './SidebarTabs';
import { CrewStatusContent } from './CrewStatusContent';
import { NewProjectModal } from './NewProjectModal';
import { ProgressDetailModal, AgentReportDetailModal } from './ProgressDetailModal';
import { useLeadWebSocket } from './useLeadWebSocket';
import { useDragResize } from './useDragResize';

interface Props {
  api: any;
  ws: any;
}

export function LeadDashboard({ api, ws }: Props) {
  const { projects, selectedLeadId, drafts } = useLeadStore(
    useShallow((s) => ({ projects: s.projects, selectedLeadId: s.selectedLeadId, drafts: s.drafts }))
  );
  const agents = useAppStore((s) => s.agents);

  // Resolve project ID for historical agent derivation:
  // - "project:xxx" → strip prefix to get the project UUID
  // - Live lead UUID → use the lead's projectId, or the lead UUID itself as fallback
  const historicalProjectId = useMemo(() => {
    if (!selectedLeadId) return null;
    if (selectedLeadId.startsWith('project:')) return selectedLeadId.slice(8);
    const lead = agents.find((a) => a.id === selectedLeadId);
    return lead?.projectId ?? selectedLeadId;
  }, [selectedLeadId, agents]);

  const { agents: derivedAgents } = useHistoricalAgents(agents.length, historicalProjectId);
  const activeTimerCount = useTimerStore(selectActiveTimerCount);
  const input = selectedLeadId ? (drafts[selectedLeadId] ?? '') : '';
  const setInput = useCallback((text: string) => {
    if (selectedLeadId) useLeadStore.getState().setDraft(selectedLeadId, text);
  }, [selectedLeadId]);
  const handleLeadFileInsert = useCallback((text: string) => {
    setInput(input ? input + ' ' + text : text);
  }, [input, setInput]);
  const { attachments, addAttachment, removeAttachment, clearAttachments } = useAttachments();
  const { isDragOver: isLeadDragOver, handleDragOver: leadDragOver, handleDragLeave: leadDragLeave, handleDrop: leadDrop, handlePaste: leadPaste, dropZoneClassName: leadDropZoneClassName } = useFileDrop({
    onInsertText: handleLeadFileInsert,
    onAttach: addAttachment,
  });
  const [showNewProject, setShowNewProject] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const reportsScrollRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<string>('crew');
  const [sidebarTabHeight, setSidebarTabHeight] = useState(280);
  const [decisionsPanelHeight, setDecisionsPanelHeight] = useState(180);
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    const allSupportedTabs = ['crew', 'comms', 'groups', 'dag', 'models', 'costs', 'timers'];
    try {
      const stored = localStorage.getItem('flightdeck-sidebar-tabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= 4) {
          let tabs = parsed.filter((id: string) => id !== 'activity');
          // Migrate: ensure all supported tabs are present
          let changed = false;
          for (const tab of allSupportedTabs) {
            if (!tabs.includes(tab)) {
              tabs.push(tab);
              changed = true;
            }
          }
          if (changed) localStorage.setItem('flightdeck-sidebar-tabs', JSON.stringify(tabs));
          return tabs;
        }
      }
    } catch {}
    return allSupportedTabs;
  });
  const [hiddenTabs, setHiddenTabs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('flightdeck-hidden-tabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  });
  const [showTabConfig, setShowTabConfig] = useState(false);
  const [showProgressDetail, setShowProgressDetail] = useState(false);
  const [expandedReport, setExpandedReport] = useState<AgentReport | null>(null);
  const [reportsExpanded, setReportsExpanded] = useState(true);
  const [pendingBannerExpanded, setPendingBannerExpanded] = useState(false);

  // ── Catch-up summary banner ──────────────────────────────────────────
  const lastInteractionRef = useRef(Date.now());
  const snapshotRef = useRef<{ tasks: number; decisions: number; comms: number; reports: number }>({ tasks: 0, decisions: 0, comms: 0, reports: 0 });
  const [catchUpSummary, setCatchUpSummary] = useState<CatchUpSummary | null>(null);

  // Track user interactions
  useEffect(() => {
    const markActive = () => {
      lastInteractionRef.current = Date.now();
    };
    const markScroll = () => {
      lastInteractionRef.current = Date.now();
      // Auto-dismiss banner on scroll (designer spec)
      if (catchUpSummary) setCatchUpSummary(null);
    };
    window.addEventListener('click', markActive);
    window.addEventListener('keydown', markActive);
    window.addEventListener('scroll', markScroll, true);
    return () => {
      window.removeEventListener('click', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('scroll', markScroll, true);
    };
  }, [catchUpSummary]);

  // Snapshot current counts on each interaction; check for inactivity on data changes
  useEffect(() => {
    const project = selectedLeadId ? projects[selectedLeadId] : null;
    if (!project) return;
    const currentCounts = {
      tasks: agents.filter(a => a.parentId === selectedLeadId && (a.status === 'completed' || a.status === 'failed')).length,
      decisions: (project.decisions ?? []).filter((d: any) => d.needsConfirmation && d.status === 'recorded').length,
      comms: (project.comms ?? []).length,
      reports: (project.agentReports ?? []).length,
    };
    const elapsed = Date.now() - lastInteractionRef.current;
    if (elapsed >= 60_000 && !catchUpSummary) {
      const prev = snapshotRef.current;
      const tasksCompleted = Math.max(0, currentCounts.tasks - prev.tasks);
      const newMessages = Math.max(0, currentCounts.comms - prev.comms);
      const newReports = Math.max(0, currentCounts.reports - prev.reports);
      const totalNew = tasksCompleted + newMessages + newReports;
      if (totalNew >= 5 || currentCounts.decisions > 0) {
        setCatchUpSummary({ tasksCompleted, pendingDecisions: currentCounts.decisions, newMessages, newReports });
      }
    }
    // Always update snapshot when user is active
    if (elapsed < 60_000) {
      snapshotRef.current = currentCounts;
    }
  }, [agents, projects, selectedLeadId, catchUpSummary]);

  // Reset snapshot when switching projects
  useEffect(() => {
    snapshotRef.current = { tasks: 0, decisions: 0, comms: 0, reports: 0 };
    setCatchUpSummary(null);
  }, [selectedLeadId]);

  const currentProject = selectedLeadId ? projects[selectedLeadId] : null;
  const leadAgent = agents.find((a) => a.id === selectedLeadId);
  const isActive = leadAgent && (leadAgent.status === 'running' || leadAgent.status === 'idle');

  // On mount, load existing leads from server
  useEffect(() => {
    // Load active leads
    fetch('/api/lead').then((r) => r.json()).then((leads: any[]) => {
      if (Array.isArray(leads)) {
        leads.forEach((l) => {
          useLeadStore.getState().addProject(l.id);
          // Pre-load message history for each lead
          fetch(`/api/agents/${l.id}/messages?limit=200`)
            .then((r) => r.json())
            .then((data: any) => {
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                const msgs: AcpTextChunk[] = data.messages.map((m: any) => ({
                  type: 'text' as const,
                  text: m.content,
                  sender: m.sender as 'agent' | 'user' | 'system' | 'thinking',
                  timestamp: new Date(m.timestamp).getTime(),
                }));
                const current = useLeadStore.getState().projects[l.id];
                if (!current || current.messages.length === 0) {
                  useLeadStore.getState().setMessages(l.id, msgs);
                }
              }
            })
            .catch(() => {});
        });
        // Auto-select first running lead if none selected
        if (!useLeadStore.getState().selectedLeadId) {
          const running = leads.find((l) => l.status === 'running');
          if (running) useLeadStore.getState().selectLead(running.id);
        }
      }
    }).catch(() => {});
  }, []);

  // Subscribe to selected lead agent WS stream and load message history
  useEffect(() => {
    if (!selectedLeadId) return;
    chatInitialScroll.current = false; // reset so we scroll to bottom on lead change
    ws.subscribe(selectedLeadId);
    // Load persisted message history if we don't have any messages yet
    const proj = useLeadStore.getState().projects[selectedLeadId];
    if (!proj || proj.messages.length === 0) {
      // For historical projects (project:XYZ), use project messages endpoint
      const isHistorical = selectedLeadId.startsWith('project:');
      const url = isHistorical
        ? `/api/projects/${selectedLeadId.slice(8)}/messages?limit=200`
        : `/api/agents/${selectedLeadId}/messages?limit=200`;
      fetch(url)
        .then((r) => r.json())
        .then((data: any) => {
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            const msgs: AcpTextChunk[] = data.messages.map((m: any) => ({
              type: 'text' as const,
              text: m.content,
              sender: m.sender as 'agent' | 'user' | 'system' | 'thinking',
              timestamp: new Date(m.timestamp).getTime(),
            }));
            // Only set if still no messages (avoid overwriting live data)
            const current = useLeadStore.getState().projects[selectedLeadId];
            if (!current || current.messages.length === 0) {
              useLeadStore.getState().setMessages(selectedLeadId, msgs);
            }
          }
        })
        .catch(() => {});
    }
    return () => ws.unsubscribe(selectedLeadId);
  }, [selectedLeadId, ws]);

  // Auto-scroll on new messages only if near bottom
  const chatInitialScroll = useRef(false);
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    // On first render or lead change, scroll to bottom unconditionally
    if (!chatInitialScroll.current) {
      chatInitialScroll.current = true;
      messagesEndRef.current?.scrollIntoView();
      return;
    }
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentProject?.messages]);

  // Auto-scroll agent reports to show latest
  useEffect(() => {
    const el = reportsScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [currentProject?.agentReports?.length, reportsExpanded]);

  // Poll progress for selected lead (skip for project: prefixed IDs — those are persisted projects, not running agents)
  const isActiveAgent = selectedLeadId != null && !selectedLeadId.startsWith('project:');
  useEffect(() => {
    if (!isActiveAgent || !selectedLeadId) return;
    const fetchProgress = () => {
      fetch(`/api/lead/${selectedLeadId}/progress`).then((r) => r.json()).then((data) => {
        if (data && !data.error) useLeadStore.getState().setProgress(selectedLeadId, data);
      }).catch(() => {});
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [selectedLeadId, isActiveAgent]);

  // Poll decisions for selected lead
  useEffect(() => {
    if (!isActiveAgent || !selectedLeadId) return;
    const fetchDecisions = () => {
      fetch(`/api/lead/${selectedLeadId}/decisions`).then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) useLeadStore.getState().setDecisions(selectedLeadId, data);
      }).catch(() => {});
    };
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 5000);
    return () => clearInterval(interval);
  }, [selectedLeadId, isActiveAgent]);

  // Fetch groups for selected lead
  useEffect(() => {
    if (!isActiveAgent || !selectedLeadId) return;
    fetch(`/api/lead/${selectedLeadId}/groups`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) useLeadStore.getState().setGroups(selectedLeadId, data);
    }).catch(() => {});
  }, [selectedLeadId, isActiveAgent]);

  // Fetch DAG status for selected lead — always use agent UUID for /api/lead/:id/dag
  useEffect(() => {
    if (!isActiveAgent || !selectedLeadId) return;
    const fetchDag = () => {
      fetch(`/api/lead/${selectedLeadId}/dag`).then((r) => r.json()).then((data: any) => {
        if (data && data.tasks) {
          const store = useLeadStore.getState();
          store.setDagStatus(selectedLeadId, data as DagStatus);
          // Also store under projectId so DagMinimap can find it by either key
          if (historicalProjectId && historicalProjectId !== selectedLeadId) {
            store.setDagStatus(historicalProjectId, data as DagStatus);
          }
        }
      }).catch(() => {});
    };
    fetchDag();
    const interval = setInterval(fetchDag, 10000);
    return () => clearInterval(interval);
  }, [selectedLeadId, historicalProjectId, isActiveAgent]);

  // Listen for lead-specific WebSocket events
  useLeadWebSocket(agents, historicalProjectId);

  // Sidebar resize handlers
  const startResize = useDragResize('x', sidebarWidth, setSidebarWidth, 200, 600, true);
  const startTabResize = useDragResize('y', sidebarTabHeight, setSidebarTabHeight, 120, 600, true);
  const startDecisionsResize = useDragResize('y', decisionsPanelHeight, setDecisionsPanelHeight, 80, 400);

  const handleTabOrderChange = useCallback((newOrder: string[]) => {
    setTabOrder(newOrder);
    localStorage.setItem('flightdeck-sidebar-tabs', JSON.stringify(newOrder));
  }, []);

  const handleDismissCatchUp = useCallback(() => setCatchUpSummary(null), []);
  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const toggleTabVisibility = useCallback((tabId: string) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      localStorage.setItem('flightdeck-hidden-tabs', JSON.stringify([...next]));
      // If hiding the active tab, switch to first visible tab
      if (next.has(tabId)) {
        setSidebarTab((current) => {
          if (current === tabId) {
            const allSupportedTabs = ['crew', 'comms', 'groups', 'dag', 'models', 'costs', 'timers'];
            return allSupportedTabs.find((id) => !next.has(id)) ?? 'crew';
          }
          return current;
        });
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (mode: 'queue' | 'interrupt' = 'queue') => {
    if (!input.trim() || !selectedLeadId) return;
    const text = input.trim();
    setInput('');
    const store = useLeadStore.getState();
    // For interrupts, insert a separator so post-interrupt response appears as a new bubble
    if (mode === 'interrupt') {
      const proj = store.projects[selectedLeadId];
      const msgs = proj?.messages ?? [];
      const last = msgs[msgs.length - 1];
      if (last?.sender === 'agent') {
        store.addMessage(selectedLeadId, { type: 'text', text: '---', sender: 'system' as any, timestamp: Date.now() });
      }
    }
    store.addMessage(selectedLeadId, {
      type: 'text',
      text,
      sender: 'user',
      queued: mode === 'queue',
      timestamp: Date.now(),
      attachments: attachments.length > 0
        ? attachments
            .filter((a) => a.kind === 'image')
            .map((a) => ({ name: a.name, mimeType: a.mimeType, thumbnailDataUrl: a.thumbnailDataUrl }))
        : undefined,
    });
    const payload: Record<string, unknown> = { text, mode };
    if (attachments.length > 0) {
      payload.attachments = attachments
        .filter((a) => a.data)
        .map((a) => ({ name: a.name, mimeType: a.mimeType, data: a.data }));
    }
    try {
      const resp = await fetch(`/api/lead/${selectedLeadId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) clearAttachments();
    } catch {
      // Network error — keep attachments so user can retry
    }
  }, [input, selectedLeadId, attachments, clearAttachments]);

  const removeQueuedMessage = useCallback(async (queueIndex: number) => {
    if (!selectedLeadId) return;
    const resp = await fetch(`/api/agents/${selectedLeadId}/queue/${queueIndex}`, { method: 'DELETE' });
    if (resp.ok) {
      const store = useLeadStore.getState();
      const msgs = store.projects[selectedLeadId]?.messages || [];
      let seen = 0;
      const updated = msgs.filter((m: AcpTextChunk) => {
        if (!m.queued) return true;
        return seen++ !== queueIndex;
      });
      store.setMessages(selectedLeadId, updated);
    }
  }, [selectedLeadId]);

  const reorderQueuedMessage = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!selectedLeadId) return;
    const resp = await fetch(`/api/agents/${selectedLeadId}/queue/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromIndex, to: toIndex }),
    });
    if (resp.ok) {
      const store = useLeadStore.getState();
      const msgs = store.projects[selectedLeadId]?.messages || [];
      const queued = msgs.filter((m: AcpTextChunk) => m.queued);
      const nonQueued = msgs.filter((m: AcpTextChunk) => !m.queued);
      if (fromIndex < queued.length && toIndex < queued.length) {
        const [moved] = queued.splice(fromIndex, 1);
        queued.splice(toIndex, 0, moved);
        store.setMessages(selectedLeadId, [...nonQueued, ...queued]);
      }
    }
  }, [selectedLeadId]);

  const handleConfirmDecision = useCallback(async (decisionId: string, reason?: string) => {
    if (!selectedLeadId) return;
    // Optimistic update — hide buttons immediately
    useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: 'confirmed', confirmedAt: new Date().toISOString() });
    const resp = await fetch(`/api/decisions/${decisionId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (resp.ok) {
      const decision = await resp.json();
      useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: decision.status, confirmedAt: decision.confirmedAt });
    }
  }, [selectedLeadId]);

  const handleRejectDecision = useCallback(async (decisionId: string, reason?: string) => {
    if (!selectedLeadId) return;
    // Optimistic update — hide buttons immediately
    useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: 'rejected', confirmedAt: new Date().toISOString() });
    const resp = await fetch(`/api/decisions/${decisionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (resp.ok) {
      const decision = await resp.json();
      useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: decision.status, confirmedAt: decision.confirmedAt });
    }
  }, [selectedLeadId]);

  const handleDismissDecision = useCallback(async (decisionId: string) => {
    if (!selectedLeadId) return;
    useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: 'dismissed', confirmedAt: new Date().toISOString() });
    const resp = await fetch(`/api/decisions/${decisionId}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (resp.ok) {
      const decision = await resp.json();
      useLeadStore.getState().updateDecision(selectedLeadId, decisionId, { status: decision.status, confirmedAt: decision.confirmedAt });
    }
  }, [selectedLeadId]);

  const handleOpenAgentChat = useCallback((agentId: string) => {
    useAppStore.getState().setSelectedAgent(agentId);
  }, []);

  const messages = currentProject?.messages ?? [];
  const decisions = currentProject?.decisions ?? [];
  const pendingConfirmations = decisions.filter((d: any) => d.needsConfirmation && d.status === 'recorded');
  const progress = currentProject?.progress ?? null;
  const progressSummary = currentProject?.progressSummary ?? null;
  const progressHistory = currentProject?.progressHistory ?? [];
  const activity = currentProject?.activity ?? [];
  const comms = currentProject?.comms ?? [];
  const agentReports = currentProject?.agentReports ?? [];
  const groups = currentProject?.groups ?? [];
  const groupMessages = currentProject?.groupMessages ?? {};
  const dagStatus = currentProject?.dagStatus ?? null;
  const teamAgents = (() => {
    const live = agents.filter((a) => a.id === selectedLeadId || a.parentId === selectedLeadId);
    if (live.length > 0) return live;
    // Fallback: progress endpoint, then keyframe-derived agents
    const progressTeam = progress?.crewAgents ?? [];
    return progressTeam.length > 0 ? progressTeam : derivedAgents;
  })();

  const teamAgentIds = useMemo(() => new Set(teamAgents.map((a: any) => a.id)), [teamAgents]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* New project modal */}
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}

      {/* Main content */}
      {!selectedLeadId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Crown className="w-16 h-16 text-yellow-600/30 dark:text-yellow-400/30 mx-auto mb-4" />
            <p className="text-th-text-muted font-mono text-sm">Select a project or create a new one</p>
          </div>
        </div>
      ) : (
        <>
          {/* Chat area */}
          <div
            className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative"
            onDragOver={leadDragOver}
            onDragLeave={leadDragLeave}
            onDrop={leadDrop}
            onPaste={leadPaste}
          >
            {isLeadDragOver && <DropOverlay />}
            {/* Progress banner — clickable to open detail */}
            {progress && progress.totalDelegations > 0 && (
              <div
                className="border-b border-th-border px-4 py-2 flex items-center gap-4 text-sm font-mono bg-th-bg-alt/50 cursor-pointer hover:bg-th-bg-alt/80 transition-colors"
                onClick={() => setShowProgressDetail(true)}
                title="Click for detailed progress view"
              >
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>{progress.crewSize} agents</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span>{progress.active} active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>{progress.completed} done</span>
                </div>
                {progress.failed > 0 && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>{progress.failed} failed</span>
                  </div>
                )}
                {(() => {
                  return null;
                })()}
                <div className="ml-auto">
                  <div className="w-32 bg-th-bg-muted rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${progress.completionPct}%` }}
                    />
                  </div>
                </div>
                <span className="text-th-text-muted">{progress.completionPct}%</span>
              </div>
            )}
            {progressSummary && (
              <div
                className="border-b border-th-border px-4 py-1.5 text-xs text-th-text-muted bg-th-bg-alt/30 font-mono truncate cursor-pointer hover:bg-th-bg-alt/50 transition-colors"
                onClick={() => setShowProgressDetail(true)}
                title="Click for detailed progress view"
              >
                📋 {progressSummary}
              </div>
            )}

            {/* Working directory bar */}
            <CwdBar leadId={selectedLeadId!} cwd={leadAgent?.cwd} />

            {/* Session ID bar — copyable for resume */}
            {leadAgent?.sessionId && (
              <div className="border-b border-th-border px-4 py-1 flex items-center gap-2 text-xs font-mono bg-th-bg-alt/20">
                <GitBranch className="w-3 h-3 text-th-text-muted shrink-0" />
                <span className="text-th-text-muted">Session:</span>
                <span className="text-th-text-muted truncate" title={leadAgent.sessionId}>{leadAgent.sessionId}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(leadAgent.sessionId!);
                    const btn = document.activeElement as HTMLElement;
                    btn.textContent = 'copied!';
                    setTimeout(() => { btn.textContent = 'copy'; }, 1500);
                  }}
                  className="text-th-text-muted hover:text-yellow-600 dark:hover:text-yellow-400 text-[10px] shrink-0 ml-auto"
                >
                  copy
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/export/${selectedLeadId}`);
                      const data = await res.json();
                      if (data.error) {
                        alert(`Export failed: ${data.error}`);
                      } else {
                        alert(`Session exported to:\n${data.outputDir}\n\n${data.files.length} files · ${data.agentCount} agents · ${data.eventCount} events`);
                      }
                    } catch {
                      alert('Export failed — server may be unavailable');
                    }
                  }}
                  className="text-th-text-muted hover:text-yellow-600 dark:hover:text-yellow-400 text-[10px] shrink-0 flex items-center gap-1"
                  title="Export session to disk (summary, agents, decisions, DAG)"
                >
                  <Download className="w-3 h-3" />
                  export
                </button>
              </div>
            )}

            {/* Agent Reports — separate from lead output */}
            {agentReports.length > 0 && (
              <div className="border-b border-th-border bg-amber-500/5 dark:bg-amber-500/10">
                <button
                  className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  onClick={() => setReportsExpanded(!reportsExpanded)}
                >
                  {reportsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <MessageSquare className="w-3 h-3" />
                  <span className="font-mono font-medium">Agent Reports</span>
                  <span className="bg-amber-500/20 px-1.5 rounded text-[10px]">{agentReports.length}</span>
                </button>
                {reportsExpanded && (
                  <div ref={reportsScrollRef} className="max-h-48 overflow-y-auto px-3 pb-2 space-y-1">
                    {agentReports.slice(-20).map((r) => {
                      const time = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div
                          key={r.id}
                          className="flex items-start gap-2 px-2 py-1.5 rounded bg-amber-500/[0.06] border border-amber-400/20 border-l-2 border-l-amber-500/30 cursor-pointer hover:bg-amber-500/[0.10] transition-colors"
                          onClick={() => setExpandedReport(r)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">{r.fromRole}</span>
                              <span className="text-[10px] text-th-text-muted ml-auto">{time}</span>
                            </div>
                            <AgentReportBlock content={r.content} compact />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Pending decisions banner */}
            {pendingConfirmations.length > 0 && (
              <div className="border-b border-amber-700/50 bg-amber-900/30">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-amber-600 dark:text-amber-200 hover:bg-amber-900/40 transition-colors"
                  onClick={() => setPendingBannerExpanded(!pendingBannerExpanded)}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-mono font-medium">⚠ {pendingConfirmations.length} decision{pendingConfirmations.length !== 1 ? 's' : ''} need{pendingConfirmations.length === 1 ? 's' : ''} your confirmation</span>
                  {pendingBannerExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-amber-400" />}
                </button>
                {pendingBannerExpanded && (
                  <div className="px-4 pb-3 space-y-2">
                    {pendingConfirmations.map((d: any) => (
                      <div key={d.id} className="bg-th-bg-alt/80 border border-amber-700/40 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-mono font-semibold text-th-text-alt">{d.title}</span>
                              {d.agentRole && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">{d.agentRole}</span>
                              )}
                            </div>
                            {d.rationale && (
                              <p className="text-xs font-mono text-th-text-muted line-clamp-2">{d.rationale}</p>
                            )}
                          </div>
                        </div>
                        <BannerDecisionActions
                          decisionId={d.id}
                          onConfirm={handleConfirmDecision}
                          onReject={handleRejectDecision}
                          onDismiss={handleDismissDecision}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <ChatMessages
              messages={messages}
              agents={agents}
              isActive={!!isActive}
              chatContainerRef={chatContainerRef}
              messagesEndRef={messagesEndRef}
              catchUpSummary={catchUpSummary}
              onDismissCatchUp={handleDismissCatchUp}
              onScrollToBottom={handleScrollToBottom}
            />

            <InputComposer
              input={input}
              onInputChange={setInput}
              isActive={!!isActive}
              selectedLeadId={selectedLeadId}
              messages={messages}
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
              onSendMessage={sendMessage}
              onRemoveQueuedMessage={removeQueuedMessage}
              onReorderQueuedMessage={reorderQueuedMessage}
            />
          </div>

          <SidebarTabs
            layout={{
              collapsed: sidebarCollapsed,
              onToggle: () => setSidebarCollapsed((v) => !v),
              width: sidebarWidth,
              onResize: startResize,
            }}
            tabs={{
              activeTab: sidebarTab,
              onTabChange: setSidebarTab,
              tabOrder,
              onTabOrderChange: handleTabOrderChange,
              hiddenTabs,
              onToggleTabVisibility: toggleTabVisibility,
              showConfig: showTabConfig,
              onToggleConfig: () => setShowTabConfig((v) => !v),
              onResize: startTabResize,
            }}
            decision={{
              decisions,
              pendingConfirmations,
              panelHeight: decisionsPanelHeight,
              onResize: startDecisionsResize,
              onConfirm: handleConfirmDecision,
              onReject: handleRejectDecision,
              onDismiss: handleDismissDecision,
            }}
            crewTabContent={
              <CrewStatusContent
                agents={teamAgents}
                delegations={progress?.delegations ?? []}
                comms={comms}
                activity={activity}
                allAgents={agents}
                onOpenChat={handleOpenAgentChat}
              />
            }
            comms={comms}
            groups={groups}
            groupMessages={groupMessages}
            dagStatus={dagStatus}
            leadAgent={leadAgent}
            selectedLeadId={selectedLeadId}
            activeTimerCount={activeTimerCount}
            crewAgentIds={teamAgentIds}
          />
        </>
      )}

      {/* Progress detail popup */}
      {showProgressDetail && (
        <ProgressDetailModal
          progress={progress}
          progressHistory={progressHistory}
          onClose={() => setShowProgressDetail(false)}
        />
      )}

      {/* Agent report detail popup */}
      {expandedReport && (
        <AgentReportDetailModal
          report={expandedReport}
          onClose={() => setExpandedReport(null)}
        />
      )}
    </div>
  );
}
