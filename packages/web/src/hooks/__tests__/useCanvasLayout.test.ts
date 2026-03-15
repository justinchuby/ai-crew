import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasLayout } from '../useCanvasLayout';

const store = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: () => null,
};

describe('useCanvasLayout', () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null layout when sessionId is null', () => {
    const { result } = renderHook(() => useCanvasLayout(null));
    expect(result.current[0]).toBeNull();
  });

  it('returns null layout for new session with no saved data', () => {
    const { result } = renderHook(() => useCanvasLayout('session-1'));
    expect(result.current[0]).toBeNull();
  });

  it('loads layout from localStorage', () => {
    const saved = {
      positions: { 'node-1': { x: 100, y: 200 } },
      zoom: 1.5,
      viewport: { x: 10, y: 20 },
    };
    store.set('canvas-layout-session-1', JSON.stringify(saved));

    const { result } = renderHook(() => useCanvasLayout('session-1'));
    expect(result.current[0]).toEqual(saved);
  });

  it('handles corrupted localStorage gracefully', () => {
    store.set('canvas-layout-session-1', 'not-json');

    const { result } = renderHook(() => useCanvasLayout('session-1'));
    expect(result.current[0]).toBeNull();
  });

  it('updates layout and persists to localStorage', () => {
    const { result } = renderHook(() => useCanvasLayout('session-1'));

    act(() => {
      result.current[1]({
        positions: { 'node-1': { x: 50, y: 75 } },
        zoom: 2,
        viewport: { x: 0, y: 0 },
      });
    });

    expect(result.current[0]).toEqual({
      positions: { 'node-1': { x: 50, y: 75 } },
      zoom: 2,
      viewport: { x: 0, y: 0 },
    });

    const saved = JSON.parse(store.get('canvas-layout-session-1')!);
    expect(saved.zoom).toBe(2);
  });

  it('merges partial updates with existing layout', () => {
    const { result } = renderHook(() => useCanvasLayout('session-1'));

    act(() => {
      result.current[1]({
        positions: { 'node-1': { x: 10, y: 20 } },
        zoom: 1,
        viewport: { x: 0, y: 0 },
      });
    });

    act(() => {
      result.current[1]({
        positions: { 'node-2': { x: 30, y: 40 } },
      });
    });

    // Both positions should exist
    expect(result.current[0]!.positions['node-1']).toEqual({ x: 10, y: 20 });
    expect(result.current[0]!.positions['node-2']).toEqual({ x: 30, y: 40 });
    // Zoom preserved from first update
    expect(result.current[0]!.zoom).toBe(1);
  });

  it('defaults zoom to 1 when not specified', () => {
    const { result } = renderHook(() => useCanvasLayout('session-1'));

    act(() => {
      result.current[1]({ positions: {} });
    });

    expect(result.current[0]!.zoom).toBe(1);
  });

  it('defaults viewport to {0,0} when not specified', () => {
    const { result } = renderHook(() => useCanvasLayout('session-1'));

    act(() => {
      result.current[1]({ positions: {} });
    });

    expect(result.current[0]!.viewport).toEqual({ x: 0, y: 0 });
  });

  it('does not persist when sessionId is null', () => {
    const { result } = renderHook(() => useCanvasLayout(null));

    act(() => {
      result.current[1]({ zoom: 2 });
    });

    // No localStorage entries with canvas-layout prefix
    expect(store.size).toBe(0);
  });

  it('handles localStorage.setItem throwing', () => {
    const brokenStorage = {
      ...mockStorage,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    vi.stubGlobal('localStorage', brokenStorage);

    const { result } = renderHook(() => useCanvasLayout('session-1'));

    // Should not throw
    expect(() => {
      act(() => {
        result.current[1]({ zoom: 2, positions: {}, viewport: { x: 0, y: 0 } });
      });
    }).not.toThrow();

    // State still updated in memory
    expect(result.current[0]!.zoom).toBe(2);
  });

  it('uses different storage keys for different sessions', () => {
    const { result: r1 } = renderHook(() => useCanvasLayout('session-a'));
    const { result: r2 } = renderHook(() => useCanvasLayout('session-b'));

    act(() => {
      r1.current[1]({ zoom: 1.5, positions: {}, viewport: { x: 0, y: 0 } });
    });
    act(() => {
      r2.current[1]({ zoom: 2.5, positions: {}, viewport: { x: 0, y: 0 } });
    });

    expect(JSON.parse(store.get('canvas-layout-session-a')!).zoom).toBe(1.5);
    expect(JSON.parse(store.get('canvas-layout-session-b')!).zoom).toBe(2.5);
  });
});
