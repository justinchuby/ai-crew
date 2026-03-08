import { useEffect } from 'react';
import { useLeadStore } from '../../stores/leadStore';
import type { AgentInfo, DagStatus } from '../../types';

/**
 * Handles all lead-specific WebSocket events: text streaming, decisions,
 * tool calls, delegations, comms, progress, groups, DAG updates, and context compaction.
 */
export function useLeadWebSocket(agents: AgentInfo[], historicalProjectId: string | null) {
  useEffect(() => {
    const handler = (event: Event) => {
      const msg = JSON.parse((event as MessageEvent).data);
      const store = useLeadStore.getState();
      const selectedLeadId = store.selectedLeadId;

      if (msg.type === 'lead:decision' && msg.agentId) {
        // Route to correct lead project (child decisions go under their parent lead)
        const targetLeadId = msg.leadId || msg.agentId;
        store.addDecision(targetLeadId, { ...msg, agentRole: msg.agentRole || 'Lead' });
      }

      // Stream PL text into chat
      if (msg.type === 'agent:text' && msg.agentId === selectedLeadId) {
        const rawText = typeof msg.text === 'string' ? msg.text : msg.text?.text ?? JSON.stringify(msg.text);
        store.appendToLastAgentMessage(msg.agentId, rawText);
      }

      // Stream PL reasoning/thinking into chat (collapsed in UI)
      if (msg.type === 'agent:thinking' && msg.agentId === selectedLeadId) {
        const rawText = typeof msg.text === 'string' ? msg.text : msg.text?.text ?? JSON.stringify(msg.text);
        store.appendToThinkingMessage(msg.agentId, rawText);
      }

      // Stream PL rich content into chat
      if (msg.type === 'agent:content' && msg.agentId === selectedLeadId) {
        store.addMessage(msg.agentId, {
          type: 'text',
          text: msg.content.text || '',
          sender: 'agent',
          contentType: msg.content.contentType,
          mimeType: msg.content.mimeType,
          data: msg.content.data,
          uri: msg.content.uri,
        });
      }

      // When lead goes back to running after idle, promote queued messages
      if (msg.type === 'agent:status' && msg.agentId === selectedLeadId && msg.status === 'running') {
        store.promoteQueuedMessages(msg.agentId);
      }

      // Track tool calls from PL and its children
      if (msg.type === 'agent:tool_call') {
        const leadId = selectedLeadId;
        if (!leadId) return;
        const { agentId, toolCall } = msg;
        // Only track if it's the lead or one of its children
        const isChild = agents.some((a) => a.id === agentId && a.parentId === leadId);
        if (agentId === leadId || isChild) {
          const agent = agents.find((a) => a.id === agentId);
          const roleName = agent?.role?.name ?? 'Agent';
          const uniqueId = `${toolCall.toolCallId}-${toolCall.status || Date.now()}`;
          store.addActivity(leadId, {
            id: uniqueId,
            agentId,
            agentRole: roleName,
            type: 'tool_call',
            summary: (typeof toolCall.title === 'string' ? toolCall.title : toolCall.title?.text ?? JSON.stringify(toolCall.title)) || (typeof toolCall.kind === 'string' ? toolCall.kind : JSON.stringify(toolCall.kind)) || 'Working...',
            status: toolCall.status,
            timestamp: Date.now(),
          });
        }
      }

      // Track delegation events
      if (msg.type === 'agent:delegated' && msg.parentId) {
        store.addActivity(msg.parentId, {
          id: msg.delegation?.id || `del-${Date.now()}`,
          agentId: msg.parentId,
          agentRole: 'Project Lead',
          type: 'delegation',
          summary: `Delegated to ${msg.delegation?.toRole}: ${msg.delegation?.task?.slice(0, 80) || ''}`,
          timestamp: Date.now(),
        });
        // Also track as a comm for heatmap
        const childAgent = agents.find((a) => a.id === msg.childId);
        store.addComm(msg.parentId, {
          id: `del-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromId: msg.parentId,
          fromRole: 'Project Lead',
          toId: msg.childId,
          toRole: msg.delegation?.toRole || childAgent?.role?.name || 'Agent',
          content: msg.delegation?.task ?? '',
          timestamp: Date.now(),
          type: 'delegation',
        });
      }

      // Track agent completion reports
      if (msg.type === 'agent:completion_reported' && msg.parentId) {
        store.addActivity(msg.parentId, {
          id: `done-${Date.now()}`,
          agentId: msg.childId,
          agentRole: 'Agent',
          type: 'completion',
          summary: `Agent ${msg.childId?.slice(0, 8)} ${msg.status}`,
          timestamp: Date.now(),
        });
        // Also track as a comm for heatmap
        const childAgent = agents.find((a) => a.id === msg.childId);
        store.addComm(msg.parentId, {
          id: `report-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromId: msg.childId,
          fromRole: childAgent?.role?.name || 'Agent',
          toId: msg.parentId,
          toRole: 'Project Lead',
          content: `Completion: ${msg.status ?? 'done'}`,
          timestamp: Date.now(),
          type: 'report',
        });
      }

      // Handle PROGRESS updates from the lead
      if (msg.type === 'lead:progress' && msg.agentId) {
        const leadId = msg.agentId;
        if (msg.summary) {
          store.setProgressSummary(leadId, msg.summary);
        }
        // Store full snapshot for detail view
        store.addProgressSnapshot(leadId, {
          summary: msg.summary || 'Progress update',
          completed: Array.isArray(msg.completed) ? msg.completed : [],
          inProgress: Array.isArray(msg.in_progress) ? msg.in_progress : [],
          blocked: Array.isArray(msg.blocked) ? msg.blocked : [],
          timestamp: Date.now(),
        });
        // Build a display string for the activity feed
        const parts: string[] = [];
        if (msg.summary) parts.push(msg.summary);
        if (Array.isArray(msg.in_progress) && msg.in_progress.length > 0) {
          parts.push(`In progress: ${msg.in_progress.join(', ')}`);
        }
        if (Array.isArray(msg.blocked) && msg.blocked.length > 0) {
          parts.push(`Blocked: ${msg.blocked.join(', ')}`);
        }
        store.addActivity(leadId, {
          id: `progress-${Date.now()}`,
          agentId: leadId,
          agentRole: 'Project Lead',
          type: 'progress',
          summary: parts.join(' · ') || 'Progress update',
          timestamp: Date.now(),
        });
      }

      // Track inter-agent messages (DMs and broadcasts)
      if (msg.type === 'agent:message_sent') {
        const fromAgent = agents.find((a) => a.id === msg.from);
        const toAgent = agents.find((a) => a.id === msg.to);
        const leadId = selectedLeadId;
        const isBroadcast = msg.to === 'all';
        if (leadId && (msg.from === leadId || fromAgent?.parentId === leadId || toAgent?.parentId === leadId || isBroadcast)) {
          store.addComm(leadId, {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromId: msg.from,
            fromRole: msg.fromRole || fromAgent?.role?.name || 'Unknown',
            toId: msg.to,
            toRole: isBroadcast ? 'Team' : (msg.toRole || toAgent?.role?.name || 'Unknown'),
            content: msg.content ?? '',
            timestamp: Date.now(),
            type: isBroadcast ? 'broadcast' : 'message',
          });

          // Store messages sent TO the lead as agent reports (separate from lead's output)
          if (msg.to === leadId && msg.from !== 'system') {
            const senderRole = msg.fromRole || fromAgent?.role?.name || 'Agent';
            store.addAgentReport(leadId, {
              id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              fromRole: senderRole,
              fromId: msg.from,
              content: msg.content ?? '',
              timestamp: Date.now(),
            });
          }

          // Surface DMs and broadcasts in the lead chat panel
          const preview = (msg.content ?? '').slice(0, 2000);
          const senderRole = msg.fromRole || fromAgent?.role?.name || 'Agent';
          const senderId = (msg.from ?? '').slice(0, 8);
          if (msg.from === 'system') {
            store.addMessage(leadId, {
              type: 'text', text: `⚙️ [System] ${preview}`, sender: 'system', timestamp: Date.now(),
            });
          } else if (isBroadcast) {
            // Broadcasts tracked in comms panel — don't duplicate in chat
          } else if (msg.to === leadId) {
            store.addMessage(leadId, {
              type: 'text', text: `📨 [From ${senderRole} ${senderId}] ${preview}`, sender: 'system', timestamp: Date.now(),
            });
          } else if (msg.from === leadId) {
            const recipientRole = msg.toRole || toAgent?.role?.name || 'Agent';
            const recipientId = (msg.to ?? '').slice(0, 8);
            store.addMessage(leadId, {
              type: 'text', text: `📤 [To ${recipientRole} ${recipientId}] ${preview}`, sender: 'system', timestamp: Date.now(),
            });
          } else {
            // Inter-agent DMs tracked in comms panel — don't duplicate in chat
          }
        }
      }

      // Group chat events
      if (msg.type === 'group:created' && msg.leadId === selectedLeadId) {
        fetch(`/api/lead/${selectedLeadId}/groups`).then((r) => r.json()).then((data) => {
          if (Array.isArray(data)) store.setGroups(selectedLeadId!, data);
        }).catch(() => {});
      }
      if (msg.type === 'group:message' && msg.leadId === selectedLeadId) {
        store.addGroupMessage(selectedLeadId!, msg.groupName, msg.message);
        // Also track as a comm for heatmap (from → all group members)
        if (msg.message) {
          const gm = msg.message;
          store.addComm(selectedLeadId!, {
            id: `grp-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromId: gm.fromAgentId,
            fromRole: gm.fromRole || 'Agent',
            toId: '',
            toRole: msg.groupName || 'Group',
            content: gm.content ?? '',
            timestamp: Date.now(),
            type: 'group_message',
          });
          // Group messages tracked in comms panel and groups tab — don't duplicate in chat
        }
      }

      // DAG status updates
      if (msg.type === 'dag:updated' && msg.leadId === selectedLeadId) {
        fetch(`/api/lead/${selectedLeadId}/dag`).then((r) => r.json()).then((data: DagStatus) => {
          if (data && data.tasks) {
            store.setDagStatus(selectedLeadId!, data as DagStatus);
            if (historicalProjectId && historicalProjectId !== selectedLeadId) {
              store.setDagStatus(historicalProjectId, data as DagStatus);
            }
          }
        }).catch(() => {});
      }

      // Context compaction — add system message to relevant lead's chat
      if (msg.type === 'agent:context_compacted' && msg.agentId) {
        const compactedId = msg.agentId;
        // Find the lead project this agent belongs to (could be the lead itself or a child)
        let targetLeadId: string | null = null;
        if (store.projects[compactedId]) {
          targetLeadId = compactedId;
        } else {
          const parentAgent = agents.find((a) => a.id === compactedId);
          if (parentAgent?.parentId && store.projects[parentAgent.parentId]) {
            targetLeadId = parentAgent.parentId;
          }
        }
        if (targetLeadId) {
          const pct = msg.percentDrop != null ? `${msg.percentDrop}%` : '?%';
          store.addMessage(targetLeadId, {
            type: 'text',
            text: `🔄 Context compacted for agent ${compactedId.slice(0, 8)}: ${pct} reduction`,
            sender: 'system',
            timestamp: Date.now(),
          });
        }
      }
    };
    window.addEventListener('ws-message', handler);
    return () => window.removeEventListener('ws-message', handler);
  }, [agents, historicalProjectId]);
}
