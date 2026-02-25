import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
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

  return { send, subscribe, unsubscribe, sendInput, resizeAgent };
}
