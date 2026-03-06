import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionReplay } from '../coordination/SessionReplay.js';
import type { WorldState, Keyframe } from '../coordination/SessionReplay.js';
import type { ActivityLedger, ActivityEntry } from '../coordination/ActivityLedger.js';
import type { TaskDAG, DagTask } from '../tasks/TaskDAG.js';
import type { DecisionLog, Decision } from '../coordination/DecisionLog.js';
import type { FileLockRegistry, FileLock } from '../coordination/FileLockRegistry.js';

// ── Helpers ───────────────────────────────────────────────────────

const T1 = '2026-03-05T10:00:00.000Z';
const T2 = '2026-03-05T10:05:00.000Z';
const T3 = '2026-03-05T10:10:00.000Z';

function makeActivity(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 1,
    agentId: 'agent-1',
    agentRole: 'developer',
    actionType: 'file_edit',
    summary: 'Edited src/index.ts',
    details: {},
    timestamp: T1,
    projectId: 'proj-1',
    ...overrides,
  };
}

function makeTask(overrides: Partial<DagTask> = {}): DagTask {
  return {
    id: 'task-1',
    leadId: 'lead-1',
    role: 'developer',
    description: 'Test task',
    files: [],
    dependsOn: [],
    dagStatus: 'pending',
    priority: 1,
    createdAt: T1,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'dec-1',
    agentId: 'agent-1',
    agentRole: 'developer',
    leadId: 'lead-1',
    projectId: 'proj-1',
    title: 'Use prettier',
    rationale: 'Consistent formatting',
    needsConfirmation: true,
    status: 'recorded',
    autoApproved: false,
    confirmedAt: null,
    timestamp: T1,
    category: 'style',
    ...overrides,
  };
}

function makeLock(overrides: Partial<FileLock> = {}): FileLock {
  return {
    filePath: 'src/index.ts',
    agentId: 'agent-1',
    agentRole: 'developer',
    projectId: 'proj-1',
    reason: 'editing',
    acquiredAt: T1,
    expiresAt: T3,
    ...overrides,
  };
}

function makeMocks(overrides: {
  activities?: ActivityEntry[];
  tasks?: DagTask[];
  decisions?: Decision[];
  locks?: FileLock[];
} = {}) {
  const activityLedger = {
    getUntil: vi.fn(() => overrides.activities ?? []),
  } as unknown as ActivityLedger;

  const taskDAG = {
    getTasksAt: vi.fn(() => overrides.tasks ?? []),
  } as unknown as TaskDAG;

  const decisionLog = {
    getDecisionsAt: vi.fn(() => overrides.decisions ?? []),
  } as unknown as DecisionLog;

  const lockRegistry = {
    getLocksAt: vi.fn(() => overrides.locks ?? []),
  } as unknown as FileLockRegistry;

  return { activityLedger, taskDAG, decisionLog, lockRegistry };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('SessionReplay', () => {
  it('returns empty world state when no data exists', () => {
    const mocks = makeMocks();
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const state = replay.getWorldStateAt('lead-1', T2);
    expect(state.timestamp).toBe(T2);
    expect(state.agents).toEqual([]);
    expect(state.dagTasks).toEqual([]);
    expect(state.decisions).toEqual([]);
    expect(state.locks).toEqual([]);
    expect(state.recentActivity).toEqual([]);
  });

  it('passes correct parameters to data sources', () => {
    const mocks = makeMocks();
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    replay.getWorldStateAt('lead-1', T2);

    expect(mocks.activityLedger.getUntil).toHaveBeenCalledWith(T2, undefined, 10_000);
    expect(mocks.taskDAG.getTasksAt).toHaveBeenCalledWith('lead-1', T2);
    expect(mocks.decisionLog.getDecisionsAt).toHaveBeenCalledWith('lead-1', T2);
    expect(mocks.lockRegistry.getLocksAt).toHaveBeenCalledWith(T2);
  });

  it('extracts agent roster from spawn events', () => {
    const activities = [
      makeActivity({
        actionType: 'sub_agent_spawned',
        summary: 'Spawned developer',
        details: { spawnedAgentId: 'dev-1', role: 'developer' },
        timestamp: T1,
      }),
      makeActivity({
        actionType: 'sub_agent_spawned',
        summary: 'Spawned architect',
        details: { spawnedAgentId: 'arch-1', role: 'architect' },
        timestamp: T2,
      }),
    ];
    const mocks = makeMocks({ activities });
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const state = replay.getWorldStateAt('lead-1', T3);
    expect(state.agents).toHaveLength(2);
    expect(state.agents[0].id).toBe('dev-1');
    expect(state.agents[0].role).toBe('developer');
    expect(state.agents[0].status).toBe('running');
    expect(state.agents[1].id).toBe('arch-1');
  });

  it('marks agents as completed/terminated from events', () => {
    const activities = [
      makeActivity({
        actionType: 'sub_agent_spawned',
        agentId: 'dev-1',
        details: { spawnedAgentId: 'dev-1', role: 'developer' },
        timestamp: T1,
      }),
      makeActivity({
        actionType: 'task_completed',
        agentId: 'dev-1',
        timestamp: T2,
      }),
    ];
    const mocks = makeMocks({ activities });
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const state = replay.getWorldStateAt('lead-1', T3);
    expect(state.agents[0].status).toBe('completed');
  });

  it('includes tasks, decisions, and locks in state', () => {
    const mocks = makeMocks({
      tasks: [makeTask()],
      decisions: [makeDecision()],
      locks: [makeLock()],
    });
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const state = replay.getWorldStateAt('lead-1', T2);
    expect(state.dagTasks).toHaveLength(1);
    expect(state.decisions).toHaveLength(1);
    expect(state.locks).toHaveLength(1);
  });

  it('limits recentActivity to last 20 entries', () => {
    const activities = Array.from({ length: 30 }, (_, i) =>
      makeActivity({ id: i + 1, timestamp: `2026-03-05T10:${String(i).padStart(2, '0')}:00.000Z` }),
    );
    const mocks = makeMocks({ activities });
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const state = replay.getWorldStateAt('lead-1', T3);
    expect(state.recentActivity).toHaveLength(20);
  });

  it('caches results for the same leadId + timestamp', () => {
    const mocks = makeMocks();
    const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

    const s1 = replay.getWorldStateAt('lead-1', T2);
    const s2 = replay.getWorldStateAt('lead-1', T2);
    expect(s1).toBe(s2); // same reference = cached
    // First call: projectId-filtered fetch (empty) + unfiltered fallback = 2 calls
    // Second call: served from cache = 0 additional calls
    const callCount = (mocks.activityLedger.getUntil as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBe(2);
  });

  describe('getKeyframes', () => {
    it('extracts keyframes from significant events', () => {
      const activities = [
        makeActivity({ actionType: 'sub_agent_spawned', summary: 'Spawned dev', timestamp: T1 }),
        makeActivity({ actionType: 'file_edit', summary: 'Edited file', timestamp: T1 }), // not a keyframe
        makeActivity({ actionType: 'task_completed', summary: 'Task done', timestamp: T2 }),
        makeActivity({ actionType: 'error', summary: 'Something broke', timestamp: T3 }),
      ];
      const mocks = makeMocks({ activities });
      // getKeyframes calls getUntil internally
      (mocks.activityLedger.getUntil as ReturnType<typeof vi.fn>).mockReturnValue(activities);
      const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

      const keyframes = replay.getKeyframes('lead-1');
      expect(keyframes).toHaveLength(3); // spawn, milestone, error — not file_edit
      expect(keyframes[0].type).toBe('spawn');
      expect(keyframes[1].type).toBe('milestone');
      expect(keyframes[2].type).toBe('error');
    });
  });

  describe('getEventsInRange', () => {
    it('returns events within time range', () => {
      const activities = [
        makeActivity({ timestamp: T1 }),
        makeActivity({ id: 2, timestamp: T2 }),
        makeActivity({ id: 3, timestamp: T3 }),
      ];
      const mocks = makeMocks();
      (mocks.activityLedger.getUntil as ReturnType<typeof vi.fn>).mockReturnValue(activities);
      const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

      const events = replay.getEventsInRange('lead-1', T2, T3);
      expect(events).toHaveLength(2); // T2 and T3 (T1 < from)
    });

    it('filters by event types', () => {
      const activities = [
        makeActivity({ actionType: 'file_edit', timestamp: T1 }),
        makeActivity({ id: 2, actionType: 'sub_agent_spawned', timestamp: T1 }),
      ];
      const mocks = makeMocks();
      (mocks.activityLedger.getUntil as ReturnType<typeof vi.fn>).mockReturnValue(activities);
      const replay = new SessionReplay(mocks.activityLedger, mocks.taskDAG, mocks.decisionLog, mocks.lockRegistry);

      const events = replay.getEventsInRange('lead-1', T1, T3, ['sub_agent_spawned']);
      expect(events).toHaveLength(1);
      expect(events[0].actionType).toBe('sub_agent_spawned');
    });
  });
});
