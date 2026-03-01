import { create } from 'zustand';
import type { TimerInfo } from '../types';

interface TimerState {
  timers: TimerInfo[];
  /** Timer IDs that recently fired — shown with green flash before removal */
  recentlyFiredIds: string[];

  setTimers: (timers: TimerInfo[]) => void;
  addTimer: (timer: TimerInfo) => void;
  fireTimer: (timerId: string) => void;
  removeTimer: (timerId: string) => void;
  clearRecentlyFired: (timerId: string) => void;
}

export const useTimerStore = create<TimerState>((set) => ({
  timers: [],
  recentlyFiredIds: [],

  setTimers: (timers) => set({ timers }),

  addTimer: (timer) =>
    set((s) => ({
      timers: s.timers.some((t) => t.id === timer.id)
        ? s.timers.map((t) => (t.id === timer.id ? timer : t))
        : [...s.timers, timer],
    })),

  fireTimer: (timerId) =>
    set((s) => ({
      timers: s.timers.map((t) =>
        t.id === timerId ? { ...t, status: 'fired' as const, remainingMs: 0 } : t,
      ),
      recentlyFiredIds: s.recentlyFiredIds.includes(timerId)
        ? s.recentlyFiredIds
        : [...s.recentlyFiredIds, timerId],
    })),

  removeTimer: (timerId) =>
    set((s) => ({
      timers: s.timers.filter((t) => t.id !== timerId),
      recentlyFiredIds: s.recentlyFiredIds.filter((id) => id !== timerId),
    })),

  clearRecentlyFired: (timerId) =>
    set((s) => ({
      recentlyFiredIds: s.recentlyFiredIds.filter((id) => id !== timerId),
    })),
}));

/** Count of active (pending) timers */
export function selectActiveTimerCount(s: TimerState): number {
  return s.timers.filter((t) => t.status === 'pending').length;
}
