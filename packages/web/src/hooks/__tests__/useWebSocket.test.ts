import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Mock WebSocket ---
let lastWs: MockWebSocket | null = null;
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    lastWs = this;
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; }
}
vi.stubGlobal('WebSocket', MockWebSocket);

// --- Mock useApi ---
vi.mock('../useApi', () => ({
  getAuthToken: vi.fn(() => null),
  apiFetch: vi.fn(() => Promise.resolve()),
}));

// --- Mock settingsStore ---
let mockOversightLevel = 'supervised';
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ getEffectiveLevel: () => mockOversightLevel }),
  },
}));

// --- Mock commandParser ---
vi.mock('../../utils/commandParser', () => ({
  hasUnclosedCommandBlock: vi.fn(() => false),
}));

import { useAppStore } from '../../stores/appStore';
import { useGroupStore } from '../../stores/groupStore';
import { useTimerStore } from '../../stores/timerStore';
import { sendWsMessage, useWebSocket } from '../useWebSocket';

function simulateMsg(msg: Record<string, unknown>) {
  act(() => { lastWs?.onmessage?.({ data: JSON.stringify(msg) }); });
}

function openWs() {
  act(() => { lastWs?.onopen?.({}); });
}

describe('sendWsMessage', () => {
  it('sends JSON when ws is OPEN', () => {
    const ws = new MockWebSocket('ws://test');
    ws.readyState = MockWebSocket.OPEN;
    // Assign to module-level globalWs via the hook
    renderHook(() => useWebSocket());
    openWs();
    sendWsMessage({ type: 'ping' });
    // The hook's connect() also sends a subscribe, so check the last sent message
    expect(lastWs!.sent.some(s => s.includes('"ping"'))).toBe(true);
  });

  it('is a no-op when ws is null or closed', () => {
    // Before any hook renders, sendWsMessage should not throw
    expect(() => sendWsMessage({ type: 'test' })).not.toThrow();
  });
});

describe('useWebSocket — connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastWs = null;
    useAppStore.setState({ agents: [], connected: false, loading: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates WebSocket on mount', () => {
    renderHook(() => useWebSocket());
    expect(lastWs).not.toBeNull();
    expect(lastWs!.url).toContain('ws://');
  });

  it('sends subscribe on open and sets connected', () => {
    renderHook(() => useWebSocket());
    openWs();
    expect(useAppStore.getState().connected).toBe(true);
    const sub = lastWs!.sent.find(s => s.includes('"subscribe"'));
    expect(sub).toBeDefined();
    expect(JSON.parse(sub!).agentId).toBe('*');
  });

  it('sets connected=false on close and reconnects', () => {
    renderHook(() => useWebSocket());
    openWs();
    expect(useAppStore.getState().connected).toBe(true);

    const closedWs = lastWs;
    act(() => { closedWs?.onclose?.({}); });
    expect(useAppStore.getState().connected).toBe(false);

    // Advance timer for reconnect (2s)
    act(() => { vi.advanceTimersByTime(2500); });
    expect(lastWs).not.toBe(closedWs);
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());
    openWs();
    const ws = lastWs;
    unmount();
    expect(ws!.readyState).toBe(MockWebSocket.CLOSED);
  });
});

describe('useWebSocket — message handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastWs = null;
    mockOversightLevel = 'supervised';
    useAppStore.setState({
      agents: [],
      connected: false,
      loading: true,
      systemPaused: false,
      pendingDecisions: [],
    });
    useGroupStore.setState({ groups: [], messages: {} });
    useTimerStore.setState({ timers: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    renderHook(() => useWebSocket());
    openWs();
  }

  it('init sets agents and loading=false', () => {
    setup();
    const agents = [{ id: 'a1', status: 'running' }];
    simulateMsg({ type: 'init', agents });
    expect(useAppStore.getState().agents).toEqual(agents);
    expect(useAppStore.getState().loading).toBe(false);
  });

  it('init sets systemPaused when present', () => {
    setup();
    simulateMsg({ type: 'init', agents: [], systemPaused: true });
    expect(useAppStore.getState().systemPaused).toBe(true);
  });

  it('agent:spawned adds agent', () => {
    setup();
    const agent = { id: 'a2', status: 'running', role: { name: 'dev' } };
    simulateMsg({ type: 'agent:spawned', agent });
    expect(useAppStore.getState().agents.find(a => a.id === 'a2')).toBeTruthy();
  });

  it('agent:terminated updates status', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    simulateMsg({ type: 'agent:terminated', agentId: 'a1' });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.status).toBe('terminated');
  });

  it('agent:exit with code 0 sets completed', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    simulateMsg({ type: 'agent:exit', agentId: 'a1', code: 0 });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.status).toBe('completed');
  });

  it('agent:exit with non-zero code sets failed', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    simulateMsg({ type: 'agent:exit', agentId: 'a1', code: 1, error: 'crash' });
    const a = useAppStore.getState().agents.find(a => a.id === 'a1');
    expect(a?.status).toBe('failed');
    expect(a?.exitError).toBe('crash');
  });

  it('agent:exit does not overwrite terminated', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'terminated' } as any] });
    simulateMsg({ type: 'agent:exit', agentId: 'a1', code: 1 });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.status).toBe('terminated');
  });

  it('agent:status updates status', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running', messages: [] } as any] });
    simulateMsg({ type: 'agent:status', agentId: 'a1', status: 'idle' });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.status).toBe('idle');
  });

  it('agent:text appends text to agent messages', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running', messages: [] } as any] });
    simulateMsg({ type: 'agent:text', agentId: 'a1', text: 'hello' });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0].text).toBe('hello');
  });

  it('agent:text appends to existing agent message', () => {
    setup();
    useAppStore.setState({
      agents: [{
        id: 'a1', status: 'running',
        messages: [{ type: 'text', text: 'hello', sender: 'agent', timestamp: Date.now() }],
      } as any],
    });
    simulateMsg({ type: 'agent:text', agentId: 'a1', text: ' world' });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0].text).toBe('hello world');
  });

  it('agent:thinking creates thinking message', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running', messages: [] } as any] });
    simulateMsg({ type: 'agent:thinking', agentId: 'a1', text: 'hmm' });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.[0].sender).toBe('thinking');
    expect(msgs?.[0].text).toBe('hmm');
  });

  it('agent:thinking appends to existing thinking message', () => {
    setup();
    useAppStore.setState({
      agents: [{
        id: 'a1', status: 'running',
        messages: [{ type: 'text', text: 'think', sender: 'thinking', timestamp: Date.now() }],
      } as any],
    });
    simulateMsg({ type: 'agent:thinking', agentId: 'a1', text: 'ing' });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0].text).toBe('thinking');
  });

  it('agent:usage updates token counts', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    simulateMsg({ type: 'agent:usage', agentId: 'a1', inputTokens: 100, outputTokens: 50 });
    const a = useAppStore.getState().agents.find(a => a.id === 'a1');
    expect(a?.inputTokens).toBe(100);
    expect(a?.outputTokens).toBe(50);
  });

  it('agent:content pushes content message', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running', messages: [] } as any] });
    simulateMsg({
      type: 'agent:content', agentId: 'a1',
      content: { text: 'result', contentType: 'resource', mimeType: 'text/plain' },
    });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0].text).toBe('result');
    expect(msgs?.[0].contentType).toBe('resource');
  });

  it('agent:tool_call adds new tool call', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running', messages: [], toolCalls: [] } as any] });
    simulateMsg({
      type: 'agent:tool_call', agentId: 'a1',
      toolCall: { toolCallId: 'tc1', title: 'Run tests', status: 'running', kind: 'bash' },
    });
    const a = useAppStore.getState().agents.find(a => a.id === 'a1');
    expect(a?.toolCalls?.length).toBe(1);
    expect(a?.toolCalls?.[0].toolCallId).toBe('tc1');
  });

  it('agent:tool_call updates existing tool call on status change', () => {
    setup();
    useAppStore.setState({
      agents: [{
        id: 'a1', status: 'running', messages: [],
        toolCalls: [{ toolCallId: 'tc1', title: 'Run tests', status: 'running', kind: 'bash' }],
      } as any],
    });
    simulateMsg({
      type: 'agent:tool_call', agentId: 'a1',
      toolCall: { toolCallId: 'tc1', title: 'Run tests', status: 'completed', kind: 'bash' },
    });
    const a = useAppStore.getState().agents.find(a => a.id === 'a1');
    expect(a?.toolCalls?.[0].status).toBe('completed');
  });

  it('agent:response_start sets pending newline flag', () => {
    setup();
    useAppStore.setState({
      agents: [{
        id: 'a1', status: 'running',
        messages: [{ type: 'text', text: 'first', sender: 'agent', timestamp: Date.now() }],
      } as any],
    });
    simulateMsg({ type: 'agent:response_start', agentId: 'a1' });
    // Next text should create a new message, not append
    simulateMsg({ type: 'agent:text', agentId: 'a1', text: 'second' });
    const msgs = useAppStore.getState().agents.find(a => a.id === 'a1')?.messages;
    expect(msgs?.length).toBe(2);
    expect(msgs?.[1].text).toBe('second');
  });

  it('agent:plan updates agent plan', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    const plan = { tasks: [{ id: 't1', title: 'Do stuff' }] };
    simulateMsg({ type: 'agent:plan', agentId: 'a1', plan });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.plan).toEqual(plan);
  });

  it('agent:session_ready updates sessionId', () => {
    setup();
    useAppStore.setState({ agents: [{ id: 'a1', status: 'running' } as any] });
    simulateMsg({ type: 'agent:session_ready', agentId: 'a1', sessionId: 'sess-123' });
    expect(useAppStore.getState().agents.find(a => a.id === 'a1')?.sessionId).toBe('sess-123');
  });

  it('agent:sub_spawned adds child and updates parent', () => {
    setup();
    useAppStore.setState({
      agents: [{ id: 'parent', status: 'running', childIds: [] } as any],
    });
    const child = { id: 'child1', status: 'running' };
    simulateMsg({ type: 'agent:sub_spawned', parentId: 'parent', child });
    const state = useAppStore.getState();
    expect(state.agents.find(a => a.id === 'child1')).toBeTruthy();
    expect(state.agents.find(a => a.id === 'parent')?.childIds).toContain('child1');
  });

  it('group:created adds to groupStore', () => {
    setup();
    simulateMsg({
      type: 'group:created', name: 'team',
      leadId: 'lead1', memberIds: ['a1', 'a2'],
    });
    const groups = useGroupStore.getState().groups;
    expect(groups.some(g => g.name === 'team')).toBe(true);
  });

  it('system:paused updates systemPaused', () => {
    setup();
    simulateMsg({ type: 'system:paused', paused: true });
    expect(useAppStore.getState().systemPaused).toBe(true);
  });

  it('timer:created adds timer', () => {
    setup();
    const timer = { id: 't1', label: 'check', delay: 300, message: 'check' };
    simulateMsg({ type: 'timer:created', timer });
    expect(useTimerStore.getState().timers.some(t => t.id === 't1')).toBe(true);
  });

  it('timer:cancelled removes timer', () => {
    setup();
    useTimerStore.setState({ timers: [{ id: 't1', label: 'x' } as any] });
    simulateMsg({ type: 'timer:cancelled', timerId: 't1' });
    expect(useTimerStore.getState().timers.find(t => t.id === 't1')).toBeUndefined();
  });

  it('lead:decision adds pending decision', () => {
    setup();
    simulateMsg({
      type: 'lead:decision',
      needsConfirmation: true,
      id: 'd1',
      agentId: 'a1',
      agentRole: 'architect',
      title: 'Use React',
      rationale: 'team knows it',
      status: 'recorded',
    });
    const decisions = useAppStore.getState().pendingDecisions;
    expect(decisions?.some(d => d.id === 'd1')).toBe(true);
  });

  it('lead:decision auto-approves in autonomous mode', async () => {
    const { apiFetch } = await import('../useApi');
    mockOversightLevel = 'autonomous';
    setup();
    simulateMsg({
      type: 'lead:decision',
      needsConfirmation: true,
      id: 'd2',
      agentId: 'a1',
      title: 'Auto',
    });
    expect(apiFetch).toHaveBeenCalledWith('/decisions/d2/confirm', expect.anything());
  });

  it('decision:confirmed removes pending decision', () => {
    setup();
    useAppStore.setState({
      pendingDecisions: [{ id: 'd1', title: 'test' } as any],
    });
    simulateMsg({ type: 'decision:confirmed', decisionId: 'd1' });
    expect(useAppStore.getState().pendingDecisions?.find(d => d.id === 'd1')).toBeUndefined();
  });

  it('decisions:batch removes all resolved decisions', () => {
    setup();
    useAppStore.setState({
      pendingDecisions: [{ id: 'd1' } as any, { id: 'd2' } as any],
    });
    simulateMsg({ type: 'decisions:batch', decisions: [{ id: 'd1' }, { id: 'd2' }] });
    expect(useAppStore.getState().pendingDecisions?.length).toBe(0);
  });

  it('attention:changed dispatches custom event', () => {
    setup();
    const handler = vi.fn();
    window.addEventListener('attention:changed', handler);
    simulateMsg({ type: 'attention:changed' });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('attention:changed', handler);
  });

  it('handles unparseable JSON gracefully', () => {
    setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => { lastWs?.onmessage?.({ data: 'not json' }); });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('dispatches raw ws-message event', () => {
    setup();
    const handler = vi.fn();
    window.addEventListener('ws-message', handler);
    simulateMsg({ type: 'init', agents: [] });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('ws-message', handler);
  });
});

describe('useWebSocket — returned methods', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastWs = null;
    useAppStore.setState({ agents: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribe sends subscribe message', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    result.current.subscribe('agent-1');
    const msg = lastWs!.sent.find(s => JSON.parse(s).agentId === 'agent-1');
    expect(msg).toBeDefined();
    expect(JSON.parse(msg!).type).toBe('subscribe');
  });

  it('unsubscribe sends unsubscribe message', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    result.current.unsubscribe('agent-1');
    const msg = lastWs!.sent.find(s => {
      const p = JSON.parse(s);
      return p.type === 'unsubscribe' && p.agentId === 'agent-1';
    });
    expect(msg).toBeDefined();
  });

  it('subscribeProject sends subscribe-project message', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    result.current.subscribeProject('proj-1');
    const msg = lastWs!.sent.find(s => JSON.parse(s).type === 'subscribe-project');
    expect(msg).toBeDefined();
    expect(JSON.parse(msg!).projectId).toBe('proj-1');
  });

  it('sendInput sends input message', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    result.current.sendInput('a1', 'hello');
    const msg = lastWs!.sent.find(s => JSON.parse(s).type === 'input');
    expect(msg).toBeDefined();
    expect(JSON.parse(msg!).text).toBe('hello');
  });

  it('resizeAgent sends resize message', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    result.current.resizeAgent('a1', 80, 24);
    const msg = lastWs!.sent.find(s => JSON.parse(s).type === 'resize');
    expect(msg).toBeDefined();
    expect(JSON.parse(msg!).cols).toBe(80);
  });

  it('broadcastInput sends input to all running agents', () => {
    const { result } = renderHook(() => useWebSocket());
    openWs();
    useAppStore.setState({
      agents: [
        { id: 'a1', status: 'running' } as any,
        { id: 'a2', status: 'idle' } as any,
        { id: 'a3', status: 'running' } as any,
      ],
    });
    result.current.broadcastInput('broadcast msg');
    const inputs = lastWs!.sent.filter(s => JSON.parse(s).type === 'input');
    expect(inputs.length).toBe(2); // a1 and a3, not a2
  });

  it('send is no-op when ws is not OPEN', () => {
    const { result } = renderHook(() => useWebSocket());
    // Don't call openWs — ws is in constructor state
    lastWs!.readyState = MockWebSocket.CLOSED;
    result.current.send({ type: 'test' } as any);
    // Only the connect() call's messages should be there (subscribe from onopen won't fire)
    expect(lastWs!.sent.length).toBe(0);
  });
});
