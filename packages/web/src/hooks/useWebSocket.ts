import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useToastStore } from '../components/Toast';
import type { WsMessage } from '../types';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const { setConnected, setAgents, setTasks, addAgent, updateAgent, removeAgent, updateTask } =
    useAppStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };

    ws.onmessage = (event) => {
      // Dispatch raw message for terminal components
      window.dispatchEvent(new MessageEvent('ws-message', { data: event.data }));

      const msg: WsMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'init':
          setAgents(msg.agents);
          setTasks(msg.tasks);
          useAppStore.getState().setLoading(false);
          break;
        case 'agent:spawned':
          addAgent(msg.agent);
          break;
        case 'agent:killed':
          removeAgent(msg.agentId);
          break;
        case 'agent:exit':
          updateAgent(msg.agentId, {
            status: msg.code === 0 ? 'completed' : 'failed',
          });
          break;
        case 'agent:sub_spawned':
          addAgent(msg.child);
          updateAgent(msg.parentId, {
            childIds: [
              ...(useAppStore.getState().agents.find((a) => a.id === msg.parentId)?.childIds || []),
              msg.child.id,
            ],
          });
          break;
        case 'agent:text': {
          const state = useAppStore.getState();
          const existing = state.agents.find((a) => a.id === msg.agentId);
          const msgs = existing?.messages ?? [];
          updateAgent(msg.agentId, { messages: [...msgs, { type: 'text', text: msg.text }] });
          break;
        }
        case 'agent:tool_call': {
          const state = useAppStore.getState();
          const existing = state.agents.find((a) => a.id === msg.agentId);
          const calls = existing?.toolCalls ?? [];
          const idx = calls.findIndex((tc) => tc.toolCallId === msg.toolCall.toolCallId);
          const updated = idx >= 0
            ? calls.map((tc, i) => (i === idx ? msg.toolCall : tc))
            : [...calls, msg.toolCall];
          updateAgent(msg.agentId, { toolCalls: updated });
          break;
        }
        case 'agent:plan':
          updateAgent(msg.agentId, { plan: msg.plan });
          break;
        case 'agent:permission_request':
          updateAgent(msg.agentId, { pendingPermission: msg.request });
          {
            const agent = useAppStore.getState().agents.find((a) => a.id === msg.agentId);
            const roleName = agent?.role?.name ?? msg.agentId.slice(0, 8);
            useToastStore.getState().add('info', `🛡️ Agent ${roleName} requests permission`);
          }
          break;
        case 'task:updated':
          updateTask(msg.task);
          break;
      }
    };
  }, [setConnected, setAgents, setTasks, addAgent, updateAgent, removeAgent, updateTask]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback(
    (agentId: string) => {
      send({ type: 'subscribe', agentId });
    },
    [send],
  );

  const unsubscribe = useCallback(
    (agentId: string) => {
      send({ type: 'unsubscribe', agentId });
    },
    [send],
  );

  const sendInput = useCallback(
    (agentId: string, text: string) => {
      send({ type: 'input', agentId, text });
    },
    [send],
  );

  const resizeAgent = useCallback(
    (agentId: string, cols: number, rows: number) => {
      send({ type: 'resize', agentId, cols, rows });
    },
    [send],
  );

  const broadcastInput = useCallback(
    (text: string) => {
      const allAgents = useAppStore.getState().agents;
      const running = allAgents.filter((a) => a.status === 'running');
      running.forEach((a) => sendInput(a.id, text));
    },
    [sendInput],
  );

  return { send, subscribe, unsubscribe, sendInput, resizeAgent, broadcastInput };
}
