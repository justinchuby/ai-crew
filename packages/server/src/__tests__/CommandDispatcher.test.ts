import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandDispatcher, type CommandContext, type Delegation } from '../agents/CommandDispatcher.js';
import type { Agent } from '../agents/Agent.js';
import type { Role } from '../agents/RoleRegistry.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'developer',
    name: 'Developer',
    description: 'Writes code',
    systemPrompt: 'You are a developer',
    color: '#00ff00',
    icon: '💻',
    builtIn: true,
    model: 'claude-sonnet-4.5',
    ...overrides,
  };
}

function makeAgent(overrides: Partial<Record<string, any>> = {}): Agent {
  return {
    id: 'agent-lead-0001-0000-000000000001',
    role: { id: 'lead', name: 'Project Lead', description: '', systemPrompt: '', color: '', icon: '', builtIn: true },
    status: 'running',
    parentId: undefined,
    childIds: [],
    task: undefined,
    model: undefined,
    cwd: '/tmp/test',
    sessionId: null,
    humanMessageResponded: true,
    lastHumanMessageAt: null,
    lastHumanMessageText: null,
    hierarchyLevel: 0,
    sendMessage: vi.fn(),
    getBufferedOutput: vi.fn().mockReturnValue(''),
    toJSON: vi.fn(),
    ...overrides,
  } as unknown as Agent;
}

function makeChildAgent(parentId: string, overrides: Partial<Record<string, any>> = {}): Agent {
  return makeAgent({
    id: 'agent-child-0002-0000-000000000002',
    role: makeRole(),
    status: 'idle',
    parentId,
    ...overrides,
  });
}

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    getAgent: vi.fn(),
    getAllAgents: vi.fn().mockReturnValue([]),
    getRunningCount: vi.fn().mockReturnValue(1),
    spawnAgent: vi.fn(),
    killAgent: vi.fn().mockReturnValue(true),
    emit: vi.fn().mockReturnValue(true),
    roleRegistry: {
      get: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
    } as any,
    config: { workingDirectory: '/tmp/test', parallelSessions: 10 } as any,
    lockRegistry: {
      acquire: vi.fn().mockReturnValue({ ok: true }),
      release: vi.fn().mockReturnValue(true),
      releaseAll: vi.fn(),
    } as any,
    activityLedger: {
      log: vi.fn(),
    } as any,
    messageBus: {
      send: vi.fn(),
    } as any,
    decisionLog: {
      add: vi.fn().mockReturnValue({ id: 'dec-1', status: 'recorded' }),
    } as any,
    agentMemory: {
      store: vi.fn(),
      getByLead: vi.fn().mockReturnValue([]),
    } as any,
    chatGroupRegistry: {
      create: vi.fn().mockReturnValue({ name: 'test', memberIds: [], leadId: '', createdAt: '' }),
      addMembers: vi.fn().mockReturnValue([]),
      removeMembers: vi.fn().mockReturnValue([]),
      sendMessage: vi.fn(),
      getGroupsForAgent: vi.fn().mockReturnValue([]),
      getMembers: vi.fn().mockReturnValue([]),
      getMessages: vi.fn().mockReturnValue([]),
    } as any,
    taskDAG: {
      declareTaskBatch: vi.fn().mockReturnValue({ tasks: [], conflicts: [] }),
      getStatus: vi.fn().mockReturnValue({ tasks: [], fileLockMap: {}, summary: {} }),
      getTaskByAgent: vi.fn().mockReturnValue(null),
      completeTask: vi.fn().mockReturnValue([]),
      failTask: vi.fn(),
      startTask: vi.fn(),
      pauseTask: vi.fn(),
      retryTask: vi.fn(),
      skipTask: vi.fn(),
      resolveReady: vi.fn().mockReturnValue([]),
      addTask: vi.fn(),
      cancelTask: vi.fn(),
    } as any,
    maxConcurrent: 10,
    ...overrides,
  };
}

/** Feed text through appendToBuffer + scanBuffer (the real public API) */
function dispatch(dispatcher: CommandDispatcher, agent: Agent, text: string): void {
  dispatcher.appendToBuffer(agent.id, text);
  dispatcher.scanBuffer(agent);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CommandDispatcher', () => {
  let ctx: CommandContext;
  let dispatcher: CommandDispatcher;
  let leadAgent: Agent;

  beforeEach(() => {
    ctx = makeContext();
    dispatcher = new CommandDispatcher(ctx);
    leadAgent = makeAgent();
  });

  // ── File locking ───────────────────────────────────────────────────

  describe('LOCK_FILE', () => {
    it('dispatches lock request to lockRegistry.acquire', () => {
      dispatch(dispatcher, leadAgent, '[[[ LOCK_FILE {"filePath": "src/index.ts", "reason": "editing"} ]]]');

      expect(ctx.lockRegistry.acquire).toHaveBeenCalledWith(
        leadAgent.id,
        'lead',
        'src/index.ts',
        'editing',
      );
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Lock acquired'),
      );
    });
  });

  describe('UNLOCK_FILE', () => {
    it('releases lock via lockRegistry.release', () => {
      dispatch(dispatcher, leadAgent, '[[[ UNLOCK_FILE {"filePath": "src/index.ts"} ]]]');

      expect(ctx.lockRegistry.release).toHaveBeenCalledWith(
        leadAgent.id,
        'src/index.ts',
      );
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Lock released'),
      );
    });
  });

  // ── Activity logging ───────────────────────────────────────────────

  describe('ACTIVITY', () => {
    it('logs activity to the activityLedger', () => {
      dispatch(dispatcher, leadAgent, '[[[ ACTIVITY {"actionType": "file_edit", "summary": "edited index.ts"} ]]]');

      expect(ctx.activityLedger.log).toHaveBeenCalledWith(
        leadAgent.id,
        'lead',
        'file_edit',
        'edited index.ts',
        expect.any(Object),
      );
    });
  });

  // ── Decision logging ───────────────────────────────────────────────

  describe('DECISION', () => {
    it('records decision via decisionLog.add', () => {
      dispatch(dispatcher, leadAgent, '[[[ DECISION {"title": "Use React", "rationale": "best fit"} ]]]');

      expect(ctx.decisionLog.add).toHaveBeenCalledWith(
        leadAgent.id,
        'lead',
        'Use React',
        'best fit',
        false,
        leadAgent.id, // leadId fallback to self when no parentId
      );
    });
  });

  // ── Progress updates ───────────────────────────────────────────────

  describe('PROGRESS', () => {
    it('emits lead:progress event', () => {
      (ctx.getAllAgents as any).mockReturnValue([leadAgent]);
      dispatch(dispatcher, leadAgent, '[[[ PROGRESS {"summary": "50% done"} ]]]');

      expect(ctx.emit).toHaveBeenCalledWith(
        'lead:progress',
        expect.objectContaining({ agentId: leadAgent.id, summary: '50% done' }),
      );
    });
  });

  // ── Query crew ─────────────────────────────────────────────────────

  describe('QUERY_CREW', () => {
    it('sends crew roster to the requesting agent', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);
      (ctx.getRunningCount as any).mockReturnValue(2);

      dispatch(dispatcher, leadAgent, '[[[ QUERY_CREW ]]]');

      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('CREW_ROSTER'),
      );
    });
  });

  // ── Broadcast ──────────────────────────────────────────────────────

  describe('BROADCAST', () => {
    it('sends message to all team children', () => {
      const child1 = makeChildAgent(leadAgent.id, {
        id: 'agent-child-0003-0000-000000000003',
        status: 'running',
      });
      const child2 = makeChildAgent(leadAgent.id, {
        id: 'agent-child-0004-0000-000000000004',
        status: 'idle',
      });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child1, child2]);

      dispatch(dispatcher, leadAgent, '[[[ BROADCAST {"content": "hello all"} ]]]');

      expect((child1.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('hello all'),
      );
      expect((child2.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('hello all'),
      );
    });
  });

  // ── CREATE_AGENT ───────────────────────────────────────────────────

  describe('CREATE_AGENT', () => {
    it('spawns a new agent when role exists', () => {
      const devRole = makeRole();
      (ctx.roleRegistry.get as any).mockReturnValue(devRole);
      const newChild = makeChildAgent(leadAgent.id, { id: 'agent-new-child-0000-000000000005' });
      (ctx.spawnAgent as any).mockReturnValue(newChild);

      dispatch(dispatcher, leadAgent, '[[[ CREATE_AGENT {"role": "developer", "task": "build feature"} ]]]');

      expect(ctx.roleRegistry.get).toHaveBeenCalledWith('developer');
      expect(ctx.spawnAgent).toHaveBeenCalledWith(
        devRole,
        'build feature',
        leadAgent.id,
        true,
        undefined, // model
        leadAgent.cwd,
      );
    });

    it('rejects non-lead agents', () => {
      const devAgent = makeAgent({
        id: 'agent-dev-0006-0000-000000000006',
        role: makeRole(),
      });

      dispatch(dispatcher, devAgent, '[[[ CREATE_AGENT {"role": "developer", "task": "build"} ]]]');

      expect(ctx.spawnAgent).not.toHaveBeenCalled();
      expect((devAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Only the Project Lead'),
      );
    });

    it('sends error when concurrency limit is reached', () => {
      const devRole = makeRole();
      (ctx.roleRegistry.get as any).mockReturnValue(devRole);
      (ctx.getRunningCount as any).mockReturnValue(10);
      (ctx.getAllAgents as any).mockReturnValue([]);
      (ctx.spawnAgent as any).mockImplementation(() => {
        throw new Error('Concurrency limit reached');
      });

      dispatch(dispatcher, leadAgent, '[[[ CREATE_AGENT {"role": "developer", "task": "build"} ]]]');

      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('concurrency limit'),
      );
    });
  });

  // ── DELEGATE ───────────────────────────────────────────────────────

  describe('DELEGATE', () => {
    it('creates a delegation and sends task to child', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);

      dispatch(dispatcher, leadAgent, `[[[ DELEGATE {"to": "${child.id}", "task": "review code"} ]]]`);

      // Delegation was tracked
      const delegations = dispatcher.getDelegationsMap();
      expect(delegations.size).toBe(1);

      const del = Array.from(delegations.values())[0];
      expect(del.toAgentId).toBe(child.id);
      expect(del.fromAgentId).toBe(leadAgent.id);
      expect(del.task).toBe('review code');
      expect(del.status).toBe('active');

      // Task was sent to the child
      expect((child.sendMessage as any)).toHaveBeenCalledWith('review code');
    });

    it('rejects non-lead agents', () => {
      const devAgent = makeAgent({
        id: 'agent-dev-0007-0000-000000000007',
        role: makeRole(),
      });

      dispatch(dispatcher, devAgent, '[[[ DELEGATE {"to": "agent-123", "task": "review"} ]]]');

      expect(dispatcher.getDelegationsMap().size).toBe(0);
      expect((devAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Only the Project Lead'),
      );
    });
  });

  // ── TERMINATE_AGENT ─────────────────────────────────────────────────────

  describe('TERMINATE_AGENT', () => {
    it('terminates the targeted child agent', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);

      dispatch(dispatcher, leadAgent, `[[[ TERMINATE_AGENT {"id": "${child.id}", "reason": "done"} ]]]`);

      expect(ctx.killAgent).toHaveBeenCalledWith(child.id);
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Terminated'),
      );
    });

    it('rejects non-lead agents', () => {
      const devAgent = makeAgent({
        id: 'agent-dev-0008-0000-000000000008',
        role: makeRole(),
      });

      dispatch(dispatcher, devAgent, '[[[ TERMINATE_AGENT {"id": "agent-123", "reason": "done"} ]]]');

      expect(ctx.killAgent).not.toHaveBeenCalled();
      expect((devAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Only the Project Lead'),
      );
    });

    it('allows terminating a sub-lead\'s child agent (grandchild)', () => {
      const subLead = makeAgent({
        id: 'agent-sub-0003-0000-000000000003',
        role: { id: 'lead', name: 'Sub Lead', description: '', systemPrompt: '', color: '', icon: '', builtIn: true },
        parentId: leadAgent.id,
      });
      const grandchild = makeChildAgent(subLead.id, {
        id: 'agent-gc-0004-0000-000000000004',
      });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, subLead, grandchild]);

      dispatch(dispatcher, leadAgent, `[[[ TERMINATE_AGENT {"id": "${grandchild.id}", "reason": "cleanup"} ]]]`);

      expect(ctx.killAgent).toHaveBeenCalledWith(grandchild.id);
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('Terminated'),
      );
    });

    it('rejects terminating an agent belonging to another top-level lead', () => {
      const otherLead = makeAgent({
        id: 'agent-other-0005-0000-000000000005',
        role: { id: 'lead', name: 'Other Lead', description: '', systemPrompt: '', color: '', icon: '', builtIn: true },
        parentId: undefined,
      });
      const otherChild = makeChildAgent(otherLead.id, {
        id: 'agent-oc-0006-0000-000000000006',
      });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, otherLead, otherChild]);

      dispatch(dispatcher, leadAgent, `[[[ TERMINATE_AGENT {"id": "${otherChild.id}", "reason": "steal"} ]]]`);

      expect(ctx.killAgent).not.toHaveBeenCalled();
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('belongs to another lead'),
      );
    });

    it('rejects terminating another top-level lead itself', () => {
      const otherLead = makeAgent({
        id: 'agent-other-0005-0000-000000000005',
        role: { id: 'lead', name: 'Other Lead', description: '', systemPrompt: '', color: '', icon: '', builtIn: true },
        parentId: undefined,
      });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, otherLead]);

      dispatch(dispatcher, leadAgent, `[[[ TERMINATE_AGENT {"id": "${otherLead.id}", "reason": "remove"} ]]]`);

      expect(ctx.killAgent).not.toHaveBeenCalled();
      expect((leadAgent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('belongs to another lead'),
      );
    });
  });

  // ── Delegation cleanup ─────────────────────────────────────────────

  describe('delegation lifecycle', () => {
    it('completeDelegationsForAgent marks active delegations as failed', () => {
      const child = makeChildAgent(leadAgent.id);
      const devRole = makeRole({ id: 'developer', name: 'Developer' });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);
      (ctx.spawnAgent as any).mockReturnValue(child);
      (ctx.roleRegistry.get as any).mockReturnValue(devRole);

      // Create a delegation by spawning via CREATE_AGENT
      dispatch(dispatcher, leadAgent, `[[[ CREATE_AGENT {"role": "developer", "task": "work"} ]]]`);

      const delegations = dispatcher.getDelegations(leadAgent.id);
      expect(delegations.length).toBeGreaterThan(0);
      expect(delegations[0].status).toBe('active');

      // Simulate agent killed — complete its delegations
      dispatcher.completeDelegationsForAgent(child.id);

      const updated = dispatcher.getDelegations(leadAgent.id);
      expect(updated[0].status).toBe('failed');
    });

    it('cleanupStaleDelegations removes old completed delegations', () => {
      const child = makeChildAgent(leadAgent.id);
      const devRole = makeRole({ id: 'developer', name: 'Developer' });
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);
      (ctx.spawnAgent as any).mockReturnValue(child);
      (ctx.roleRegistry.get as any).mockReturnValue(devRole);

      // Create a delegation
      dispatch(dispatcher, leadAgent, `[[[ CREATE_AGENT {"role": "developer", "task": "work"} ]]]`);

      // Mark it as completed
      dispatcher.completeDelegationsForAgent(child.id);

      // With maxAge=0, everything old gets cleaned
      const removed = dispatcher.cleanupStaleDelegations(0);
      expect(removed).toBe(1);
      expect(dispatcher.getDelegations().length).toBe(0);
    });
  });

  // ── Multiple commands in one text ──────────────────────────────────

  describe('multiple commands', () => {
    it('dispatches both LOCK_FILE and ACTIVITY from one text', () => {
      const text = [
        'Some preamble text.',
        '[[[ LOCK_FILE {"filePath": "src/main.ts", "reason": "editing"} ]]]',
        'Some middle text.',
        '[[[ ACTIVITY {"actionType": "file_edit", "summary": "changed main"} ]]]',
        'Trailing text.',
      ].join('\n');

      dispatch(dispatcher, leadAgent, text);

      expect(ctx.lockRegistry.acquire).toHaveBeenCalledWith(
        leadAgent.id,
        'lead',
        'src/main.ts',
        'editing',
      );
      expect(ctx.activityLedger.log).toHaveBeenCalledWith(
        leadAgent.id,
        'lead',
        'file_edit',
        'changed main',
        expect.any(Object),
      );
    });
  });

  // ── Invalid JSON ───────────────────────────────────────────────────

  describe('invalid JSON', () => {
    it('handles gracefully without crashing', () => {
      // The regex requires {...} so truly malformed JSON like {bad json} won't match
      // as a valid JSON object. But a regex-matching string with invalid JSON will
      // hit the try/catch in the handler and be silently ignored (logged).
      expect(() => {
        dispatch(dispatcher, leadAgent, '[[[ LOCK_FILE {"filePath": "missing-quote} ]]]');
      }).not.toThrow();

      // No lock should have been acquired since JSON parsing failed
      expect(ctx.lockRegistry.acquire).not.toHaveBeenCalled();
    });
  });

  // ── getDelegationsMap / delegation lifecycle ───────────────────────

  describe('delegation lifecycle', () => {
    it('getDelegationsMap returns tracked delegations', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);

      // Create via DELEGATE command
      dispatch(dispatcher, leadAgent, `[[[ DELEGATE {"to": "${child.id}", "task": "task-1"} ]]]`);

      const map = dispatcher.getDelegationsMap();
      expect(map.size).toBe(1);
      const del = Array.from(map.values())[0];
      expect(del.status).toBe('active');
      expect(del.toAgentId).toBe(child.id);
    });

    it('getDelegations filters by parentId', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);

      dispatch(dispatcher, leadAgent, `[[[ DELEGATE {"to": "${child.id}", "task": "task-1"} ]]]`);

      const forLead = dispatcher.getDelegations(leadAgent.id);
      expect(forLead.length).toBe(1);

      const forOther = dispatcher.getDelegations('nonexistent-id');
      expect(forOther.length).toBe(0);
    });
  });

  // ── Buffer management ──────────────────────────────────────────────

  describe('buffer management', () => {
    it('appendToBuffer accumulates text', () => {
      dispatcher.appendToBuffer('agent-1', 'hello ');
      dispatcher.appendToBuffer('agent-1', 'world');
      // Verify by dispatching a command that spans both appends
      const agent = makeAgent({ id: 'agent-1' });
      dispatcher.appendToBuffer('agent-1', ' [[[ QUERY_CREW ]]]');
      (ctx.getAllAgents as any).mockReturnValue([agent]);
      (ctx.getRunningCount as any).mockReturnValue(1);
      dispatcher.scanBuffer(agent);

      expect((agent.sendMessage as any)).toHaveBeenCalledWith(
        expect.stringContaining('CREW_ROSTER'),
      );
    });

    it('clearBuffer removes buffered text', () => {
      dispatcher.appendToBuffer('agent-1', '[[[ QUERY_CREW ]]]');
      dispatcher.clearBuffer('agent-1');

      const agent = makeAgent({ id: 'agent-1' });
      (ctx.getAllAgents as any).mockReturnValue([agent]);
      dispatcher.scanBuffer(agent);

      // No command should have fired since buffer was cleared
      expect((agent.sendMessage as any)).not.toHaveBeenCalled();
    });
  });

  // ── CREATE_AGENT with model ────────────────────────────────────────

  describe('CREATE_AGENT with model', () => {
    it('passes model to spawnAgent', () => {
      const devRole = makeRole();
      (ctx.roleRegistry.get as any).mockReturnValue(devRole);
      const newChild = makeChildAgent(leadAgent.id, { id: 'agent-new-0009' });
      (ctx.spawnAgent as any).mockReturnValue(newChild);

      dispatch(dispatcher, leadAgent, '[[[ CREATE_AGENT {"role": "developer", "task": "build", "model": "claude-opus-4"} ]]]');

      expect(ctx.spawnAgent).toHaveBeenCalledWith(
        devRole,
        'build',
        leadAgent.id,
        true,
        'claude-opus-4',
        leadAgent.cwd,
      );
      // Memory stores model
      expect(ctx.agentMemory.store).toHaveBeenCalledWith(
        leadAgent.id,
        newChild.id,
        'model',
        'claude-opus-4',
      );
    });
  });

  // ── DELEGATE with context ──────────────────────────────────────────

  describe('DELEGATE with context', () => {
    it('sends task + context to child', () => {
      const child = makeChildAgent(leadAgent.id);
      (ctx.getAllAgents as any).mockReturnValue([leadAgent, child]);

      dispatch(dispatcher, leadAgent, `[[[ DELEGATE {"to": "${child.id}", "task": "review code", "context": "PR #42"} ]]]`);

      expect((child.sendMessage as any)).toHaveBeenCalledWith('review code\n\nContext: PR #42');

      // Memory stores context
      expect(ctx.agentMemory.store).toHaveBeenCalledWith(
        leadAgent.id,
        child.id,
        'context',
        'PR #42',
      );
    });
  });
});
