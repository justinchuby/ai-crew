import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanvasGraph } from '../useCanvasGraph';
import type { AgentInfo } from '../../types';
import type { AgentComm } from '../../stores/leadStore';
import type { CanvasLayout } from '../useCanvasLayout';

function makeAgent(overrides: Partial<AgentInfo> & { id: string }): AgentInfo {
  return {
    status: 'running',
    messages: [],
    ...overrides,
  } as AgentInfo;
}

function makeComm(from: string, to: string, opts: Partial<AgentComm> = {}): AgentComm {
  return {
    fromId: from,
    toId: to,
    timestamp: Date.now(),
    type: 'dm',
    ...opts,
  } as AgentComm;
}

describe('useCanvasGraph', () => {
  it('returns empty nodes and edges for empty inputs', () => {
    const { result } = renderHook(() => useCanvasGraph([], [], null));
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
  });

  it('filters out terminated agents', () => {
    const agents = [
      makeAgent({ id: 'a1', status: 'running', role: { id: 'developer', name: 'Developer' } as any }),
      makeAgent({ id: 'a2', status: 'terminated', role: { id: 'reviewer', name: 'Reviewer' } as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    expect(result.current.nodes.length).toBe(1);
    expect(result.current.nodes[0].id).toBe('a1');
  });

  it('positions lead agent at center', () => {
    const agents = [
      makeAgent({ id: 'lead1', role: { id: 'lead', name: 'Lead' } as any }),
      makeAgent({ id: 'dev1', role: { id: 'developer', name: 'Dev' } as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    const leadNode = result.current.nodes.find(n => n.id === 'lead1');
    expect(leadNode?.position).toEqual({ x: 0, y: 0 });
  });

  it('positions non-lead agents in circular layout', () => {
    const agents = [
      makeAgent({ id: 'lead1', role: { id: 'lead', name: 'Lead' } as any }),
      makeAgent({ id: 'dev1', role: { id: 'developer', name: 'Dev' } as any }),
      makeAgent({ id: 'arch1', role: { id: 'architect', name: 'Architect' } as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    const dev = result.current.nodes.find(n => n.id === 'dev1');
    const arch = result.current.nodes.find(n => n.id === 'arch1');
    // Both should be at RADIUS distance from center
    expect(dev?.position.x).not.toBe(0);
    expect(arch?.position.x).not.toBe(0);
  });

  it('uses user-positioned layout when available', () => {
    const agents = [
      makeAgent({ id: 'a1', role: { id: 'developer', name: 'Dev' } as any }),
    ];
    const layout: CanvasLayout = {
      positions: { a1: { x: 42, y: 99 } },
    } as any;
    const { result } = renderHook(() => useCanvasGraph(agents, [], layout));
    expect(result.current.nodes[0].position).toEqual({ x: 42, y: 99 });
    expect(result.current.nodes[0].data.isUserPositioned).toBe(true);
  });

  it('falls back to auto-position when agent not in layout', () => {
    const agents = [
      makeAgent({ id: 'a1', role: { id: 'developer', name: 'Dev' } as any }),
    ];
    const layout: CanvasLayout = { positions: {} } as any;
    const { result } = renderHook(() => useCanvasGraph(agents, [], layout));
    expect(result.current.nodes[0].data.isUserPositioned).toBe(false);
  });

  it('handles case when no lead agent exists', () => {
    const agents = [
      makeAgent({ id: 'dev1', role: { id: 'developer', name: 'Dev' } as any }),
      makeAgent({ id: 'qa1', role: { id: 'qa-tester', name: 'QA' } as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    expect(result.current.nodes.length).toBe(2);
  });

  it('builds edges from communications', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
    ];
    const comms = [
      makeComm('a1', 'a2'),
      makeComm('a2', 'a1'),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    expect(result.current.edges.length).toBe(1); // bidirectional merged
    expect(result.current.edges[0].data.messageCount).toBe(2);
  });

  it('aggregates comm types on edges', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
    ];
    const comms = [
      makeComm('a1', 'a2', { type: 'dm' }),
      makeComm('a1', 'a2', { type: 'group' }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    expect(result.current.edges[0].data.types).toContain('dm');
    expect(result.current.edges[0].data.types).toContain('group');
  });

  it('handles comms without type', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
    ];
    const comms = [
      makeComm('a1', 'a2', { type: undefined as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    expect(result.current.edges[0].data.types).toEqual([]);
  });

  it('marks recent edges as active', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
    ];
    const comms = [
      makeComm('a1', 'a2', { timestamp: Date.now() }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    expect(result.current.edges[0].data.isActive).toBe(true);
  });

  it('marks stale edges as inactive', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
    ];
    const comms = [
      makeComm('a1', 'a2', { timestamp: Date.now() - 60_000 }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    expect(result.current.edges[0].data.isActive).toBe(false);
  });

  it('computes comm volume per agent', () => {
    const agents = [
      makeAgent({ id: 'a1' }),
      makeAgent({ id: 'a2' }),
      makeAgent({ id: 'a3' }),
    ];
    const comms = [
      makeComm('a1', 'a2'),
      makeComm('a1', 'a3'),
      makeComm('a2', 'a3'),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, comms, null));
    const a1 = result.current.nodes.find(n => n.id === 'a1');
    expect(a1?.data.commVolume).toBe(2);
    const a2 = result.current.nodes.find(n => n.id === 'a2');
    expect(a2?.data.commVolume).toBe(2);
  });

  it('uses layout position for lead agent when available', () => {
    const agents = [
      makeAgent({ id: 'lead1', role: { id: 'lead', name: 'Lead' } as any }),
    ];
    const layout: CanvasLayout = {
      positions: { lead1: { x: 100, y: 200 } },
    } as any;
    const { result } = renderHook(() => useCanvasGraph(agents, [], layout));
    expect(result.current.nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it('sorts agents by role priority for positioning', () => {
    const agents = [
      makeAgent({ id: 'lead1', role: { id: 'lead', name: 'Lead' } as any }),
      makeAgent({ id: 'sec1', role: { id: 'secretary', name: 'Secretary' } as any }),
      makeAgent({ id: 'arch1', role: { id: 'architect', name: 'Architect' } as any }),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    // All 3 should be present
    expect(result.current.nodes.length).toBe(3);
  });

  it('handles agents with parentId (not treated as lead)', () => {
    const agents = [
      makeAgent({ id: 'a1', role: { id: 'lead', name: 'Lead' } as any, parentId: 'parent1' } as any),
    ];
    const { result } = renderHook(() => useCanvasGraph(agents, [], null));
    // Agent with parentId is not treated as lead, so should be in circular layout
    expect(result.current.nodes.length).toBe(1);
    // Position should NOT be (0,0) since it's not recognized as lead
    // With only 1 agent in circular, it will be at angle=0 → (RADIUS, 0)
    expect(result.current.nodes[0].position.x).not.toBe(0);
  });
});
