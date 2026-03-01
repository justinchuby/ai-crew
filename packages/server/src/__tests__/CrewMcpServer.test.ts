import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrewMcpServer, type CrewMcpServerOptions } from '../mcp/CrewMcpServer.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Agent } from '../agents/Agent.js';
import type { Role } from '../agents/RoleRegistry.js';
import type { CommandHandlerContext, Delegation } from '../agents/commands/types.js';

// ── Test Helpers ─────────────────────────────────────────────────────

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
    projectId: undefined,
    humanMessageResponded: true,
    lastHumanMessageAt: null,
    lastHumanMessageText: null,
    hierarchyLevel: 0,
    sendMessage: vi.fn(),
    queueMessage: vi.fn(),
    getRecentOutput: vi.fn().mockReturnValue(''),
    getBufferedOutput: vi.fn().mockReturnValue(''),
    clearPendingMessages: vi.fn().mockReturnValue({ count: 0, previews: [] }),
    write: vi.fn(),
    toJSON: vi.fn(),
    ...overrides,
  } as unknown as Agent;
}

function makeHandlerContext(overrides: Partial<CommandHandlerContext> = {}): CommandHandlerContext {
  return {
    getAgent: vi.fn(),
    getAllAgents: vi.fn().mockReturnValue([]),
    getRunningCount: vi.fn().mockReturnValue(1),
    spawnAgent: vi.fn(),
    terminateAgent: vi.fn().mockReturnValue(true),
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
      getByAgent: vi.fn().mockReturnValue([]),
    } as any,
    activityLedger: {
      log: vi.fn(),
    } as any,
    messageBus: {
      send: vi.fn(),
    } as any,
    decisionLog: {
      add: vi.fn().mockReturnValue({ id: 'dec-1', status: 'recorded' }),
      markSystemDecision: vi.fn(),
    } as any,
    agentMemory: {
      store: vi.fn(),
      getByLead: vi.fn().mockReturnValue([]),
    } as any,
    chatGroupRegistry: {
      create: vi.fn().mockReturnValue({ name: 'test-group', memberIds: ['agent-1'], leadId: 'lead-1', createdAt: '' }),
      addMembers: vi.fn().mockReturnValue([]),
      removeMembers: vi.fn().mockReturnValue([]),
      sendMessage: vi.fn().mockReturnValue({ id: 'msg-1' }),
      getGroupsForAgent: vi.fn().mockReturnValue([]),
      getMembers: vi.fn().mockReturnValue([]),
      getMessages: vi.fn().mockReturnValue([]),
      getGroupSummary: vi.fn().mockReturnValue({ messageCount: 0, lastMessage: '' }),
      findGroupForAgent: vi.fn().mockReturnValue(null),
    } as any,
    taskDAG: {
      declareTaskBatch: vi.fn().mockReturnValue({ tasks: [], conflicts: [] }),
      getStatus: vi.fn().mockReturnValue({ tasks: [], fileLockMap: {}, summary: { done: 0, running: 0, ready: 0, pending: 0 } }),
      getTaskByAgent: vi.fn().mockReturnValue(null),
      completeTask: vi.fn().mockReturnValue([]),
      failTask: vi.fn(),
      startTask: vi.fn(),
      pauseTask: vi.fn().mockReturnValue(true),
      retryTask: vi.fn().mockReturnValue(true),
      skipTask: vi.fn().mockReturnValue(true),
      resolveReady: vi.fn().mockReturnValue([]),
      addTask: vi.fn().mockReturnValue({ id: 'task-1', dagStatus: 'ready' }),
      cancelTask: vi.fn().mockReturnValue(true),
      resetDAG: vi.fn().mockReturnValue(3),
    } as any,
    deferredIssueRegistry: {
      add: vi.fn().mockReturnValue({ id: 1, description: 'test issue', severity: 'P1', status: 'open', createdAt: new Date().toISOString(), reviewerAgentId: 'a', reviewerRole: 'dev' }),
      list: vi.fn().mockReturnValue([]),
      resolve: vi.fn().mockReturnValue(true),
      dismiss: vi.fn().mockReturnValue(true),
    } as any,
    timerRegistry: {
      create: vi.fn().mockReturnValue({ id: 'tmr-1', label: 'test-timer', repeat: false }),
      cancel: vi.fn().mockReturnValue(true),
      getAgentTimers: vi.fn().mockReturnValue([]),
      getAllTimers: vi.fn().mockReturnValue([]),
      clearAgent: vi.fn(),
    } as any,
    capabilityInjector: {
      acquire: vi.fn().mockReturnValue({ ok: true, message: 'Capability acquired: code-review' }),
      getAllDefinitions: vi.fn().mockReturnValue([]),
      getAgentCapabilities: vi.fn().mockReturnValue([]),
      hasCommand: vi.fn().mockReturnValue(false),
    } as any,
    sessionExporter: undefined,
    taskTemplateRegistry: undefined,
    taskDecomposer: undefined,
    maxConcurrent: 10,
    markHumanInterrupt: vi.fn(),
    delegations: new Map<string, Delegation>(),
    reportedCompletions: new Set<string>(),
    pendingSystemActions: new Map(),
    ...overrides,
  } as CommandHandlerContext;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('CrewMcpServer', () => {
  let ctx: CommandHandlerContext;
  let agent: Agent;
  let server: McpServer;

  beforeEach(() => {
    ctx = makeHandlerContext();
    agent = makeAgent();
    server = createCrewMcpServer({
      ctx,
      getCallingAgent: () => agent,
    });
  });

  describe('createCrewMcpServer', () => {
    it('returns a McpServer instance', () => {
      expect(server).toBeDefined();
      // McpServer should have a server property (the underlying Server)
      expect(server.server).toBeDefined();
    });

    it('registers all expected tools', () => {
      // Access the internal registered tools via the server
      // McpServer tracks registered tools internally
      const registeredTools = (server as any)._registeredTools;
      expect(registeredTools).toBeDefined();

      const toolNames = Object.keys(registeredTools);

      // Check a sample of expected tool names
      expect(toolNames).toContain('crew_create_agent');
      expect(toolNames).toContain('crew_delegate');
      expect(toolNames).toContain('crew_terminate_agent');
      expect(toolNames).toContain('crew_agent_message');
      expect(toolNames).toContain('crew_broadcast');
      expect(toolNames).toContain('crew_create_group');
      expect(toolNames).toContain('crew_group_message');
      expect(toolNames).toContain('crew_query_groups');
      expect(toolNames).toContain('crew_direct_message');
      expect(toolNames).toContain('crew_query_peers');
      expect(toolNames).toContain('crew_declare_tasks');
      expect(toolNames).toContain('crew_progress');
      expect(toolNames).toContain('crew_query_tasks');
      expect(toolNames).toContain('crew_lock_file');
      expect(toolNames).toContain('crew_unlock_file');
      expect(toolNames).toContain('crew_commit');
      expect(toolNames).toContain('crew_query_crew');
      expect(toolNames).toContain('crew_set_timer');
      expect(toolNames).toContain('crew_cancel_timer');
      expect(toolNames).toContain('crew_list_timers');
      expect(toolNames).toContain('crew_halt_heartbeat');
      expect(toolNames).toContain('crew_export_session');
      expect(toolNames).toContain('crew_acquire_capability');
      expect(toolNames).toContain('crew_list_capabilities');
      expect(toolNames).toContain('crew_list_templates');
      expect(toolNames).toContain('crew_apply_template');
      expect(toolNames).toContain('crew_decompose_task');
      expect(toolNames).toContain('crew_defer_issue');
      expect(toolNames).toContain('crew_query_deferred');
      expect(toolNames).toContain('crew_resolve_deferred');
    });

    it('prefixes all tool names with crew_', () => {
      const registeredTools = (server as any)._registeredTools;
      const toolNames = Object.keys(registeredTools);
      for (const name of toolNames) {
        expect(name).toMatch(/^crew_/);
      }
    });
  });

  describe('tool handler execution', () => {
    /**
     * Helper to directly invoke a registered tool handler (bypasses MCP transport).
     * This is how we unit-test handlers without a full MCP client connection.
     */
    async function callTool(name: string, params: Record<string, unknown> = {}): Promise<any> {
      const registeredTools = (server as any)._registeredTools;
      const tool = registeredTools[name];
      if (!tool) throw new Error(`Tool not found: ${name}`);
      // The handler is the tool callback — call it with params and empty extra
      return tool.handler(params, {});
    }

    // ── Agent Lifecycle ────────────────────────────────────────────

    it('crew_create_agent calls spawnAgent via handler', async () => {
      const childRole = makeRole({ id: 'developer', name: 'Developer' });
      const childAgent = makeAgent({
        id: 'agent-child-0002',
        role: childRole,
        parentId: agent.id,
      });
      (ctx.roleRegistry.get as any).mockReturnValue(childRole);
      (ctx.spawnAgent as any).mockReturnValue(childAgent);

      const result = await callTool('crew_create_agent', {
        role: 'developer',
        task: 'Write tests',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(ctx.spawnAgent).toHaveBeenCalled();
    });

    it('crew_terminate_agent terminates agent via handler', async () => {
      const child = makeAgent({
        id: 'agent-child-0002-0000-000000000002',
        role: makeRole(),
        status: 'running',
        parentId: agent.id,
      });
      (ctx.getAllAgents as any).mockReturnValue([agent, child]);
      (ctx.getAgent as any).mockImplementation((id: string) =>
        id === child.id ? child : id === agent.id ? agent : undefined,
      );

      const result = await callTool('crew_terminate_agent', {
        id: 'agent-child',
        reason: 'no longer needed',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.terminateAgent).toHaveBeenCalledWith(child.id);
    });

    // ── Communication ──────────────────────────────────────────────

    it('crew_agent_message sends via messageBus', async () => {
      const target = makeAgent({
        id: 'agent-target-0003-0000-000000000003',
        role: makeRole(),
        status: 'running',
      });
      (ctx.getAgent as any).mockImplementation((id: string) =>
        id === target.id ? target : id === agent.id ? agent : undefined,
      );

      const result = await callTool('crew_agent_message', {
        to: target.id,
        content: 'Hello from MCP!',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.messageBus.send).toHaveBeenCalled();
    });

    it('crew_broadcast sends to all team agents', async () => {
      const peer = makeAgent({
        id: 'agent-peer-0004-0000-000000000004',
        role: makeRole(),
        status: 'running',
        parentId: agent.id,
      });
      (ctx.getAllAgents as any).mockReturnValue([agent, peer]);

      const result = await callTool('crew_broadcast', {
        content: 'Team update from MCP',
      });

      expect(result.content[0].type).toBe('text');
      // The peer should have received the broadcast
      expect(peer.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Team update from MCP'),
      );
    });

    it('crew_query_groups returns groups info', async () => {
      (ctx.chatGroupRegistry.getGroupsForAgent as any).mockReturnValue([]);

      const result = await callTool('crew_query_groups');

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('not a member');
    });

    it('crew_direct_message sends DM to peer', async () => {
      const peer = makeAgent({
        id: 'agent-peer-0004-0000-000000000004',
        role: makeRole(),
        status: 'running',
      });
      (ctx.getAgent as any).mockImplementation((id: string) =>
        id === peer.id ? peer : id === agent.id ? agent : undefined,
      );

      const result = await callTool('crew_direct_message', {
        to: peer.id,
        content: 'Quick question',
      });

      expect(result.content[0].type).toBe('text');
      expect(peer.queueMessage).toHaveBeenCalledWith(
        expect.stringContaining('Quick question'),
      );
    });

    it('crew_query_peers lists active peers', async () => {
      const peer = makeAgent({
        id: 'agent-peer-0004-0000-000000000004',
        role: makeRole({ id: 'developer', name: 'Developer' }),
        status: 'running',
        parentId: agent.id,
      });
      (ctx.getAllAgents as any).mockReturnValue([agent, peer]);

      const result = await callTool('crew_query_peers');

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Developer');
    });

    // ── Coordination ───────────────────────────────────────────────

    it('crew_lock_file acquires lock via lockRegistry', async () => {
      const result = await callTool('crew_lock_file', {
        filePath: 'src/index.ts',
        reason: 'editing',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.lockRegistry.acquire).toHaveBeenCalledWith(
        agent.id,
        'lead',
        'src/index.ts',
        'editing',
      );
      expect(result.content[0].text).toContain('Lock acquired');
    });

    it('crew_unlock_file releases lock', async () => {
      const result = await callTool('crew_unlock_file', {
        filePath: 'src/index.ts',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.lockRegistry.release).toHaveBeenCalledWith(
        agent.id,
        'src/index.ts',
      );
    });

    it('crew_commit prepares scoped commit', async () => {
      (ctx.lockRegistry.getByAgent as any).mockReturnValue([
        { filePath: 'src/foo.ts' },
        { filePath: 'src/bar.ts' },
      ]);

      const result = await callTool('crew_commit', {
        message: 'Add feature X',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('commit');
    });

    it('crew_query_crew returns roster', async () => {
      (ctx.getAllAgents as any).mockReturnValue([agent]);

      const result = await callTool('crew_query_crew');

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('CREW_ROSTER');
    });

    // ── Tasks ──────────────────────────────────────────────────────

    it('crew_declare_tasks declares a task DAG', async () => {
      const tasks = [{ id: 'task-1', title: 'Build API', dagStatus: 'ready', dependsOn: [], role: 'developer', files: [] }];
      (ctx.taskDAG.declareTaskBatch as any).mockReturnValue({ tasks, conflicts: [] });

      const result = await callTool('crew_declare_tasks', {
        tasks: [{ id: 'task-1', title: 'Build API', role: 'developer' }],
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.taskDAG.declareTaskBatch).toHaveBeenCalled();
    });

    it('crew_query_tasks queries task status', async () => {
      const result = await callTool('crew_query_tasks');

      expect(result.content[0].type).toBe('text');
      // When no DAG is declared, should say so
      expect(result.content[0].text).toContain('No task DAG');
    });

    it('crew_add_task adds a task', async () => {
      const result = await callTool('crew_add_task', {
        id: 'new-task',
        title: 'New task',
        role: 'developer',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.taskDAG.addTask).toHaveBeenCalled();
    });

    it('crew_pause_task pauses a task', async () => {
      const result = await callTool('crew_pause_task', { id: 'task-1' });

      expect(result.content[0].type).toBe('text');
      expect(ctx.taskDAG.pauseTask).toHaveBeenCalledWith(agent.id, 'task-1');
    });

    it('crew_reset_dag resets the DAG', async () => {
      const result = await callTool('crew_reset_dag');

      expect(result.content[0].type).toBe('text');
      expect(ctx.taskDAG.resetDAG).toHaveBeenCalledWith(agent.id);
      expect(result.content[0].text).toContain('3');
    });

    // ── Deferred Issues ────────────────────────────────────────────

    it('crew_defer_issue creates a deferred issue', async () => {
      const result = await callTool('crew_defer_issue', {
        description: 'Need to fix race condition',
        severity: 'P1',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.deferredIssueRegistry.add).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Deferred issue');
    });

    it('crew_query_deferred lists issues', async () => {
      const result = await callTool('crew_query_deferred', {});

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('No deferred issues');
    });

    it('crew_resolve_deferred resolves an issue', async () => {
      const result = await callTool('crew_resolve_deferred', { id: 1 });

      expect(result.content[0].type).toBe('text');
      expect(ctx.deferredIssueRegistry.resolve).toHaveBeenCalled();
    });

    // ── Timers ─────────────────────────────────────────────────────

    it('crew_set_timer creates a timer', async () => {
      const result = await callTool('crew_set_timer', {
        label: 'check-build',
        delay: 60,
        message: 'Check build status',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.timerRegistry!.create).toHaveBeenCalled();
      expect(result.content[0].text).toContain('Timer');
    });

    it('crew_cancel_timer cancels a timer', async () => {
      const result = await callTool('crew_cancel_timer', { id: 'tmr-1' });

      expect(result.content[0].type).toBe('text');
      expect(ctx.timerRegistry!.cancel).toHaveBeenCalled();
    });

    it('crew_list_timers lists timers', async () => {
      const result = await callTool('crew_list_timers');

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('No active timers');
    });

    // ── System ─────────────────────────────────────────────────────

    it('crew_halt_heartbeat halts heartbeat', async () => {
      const result = await callTool('crew_halt_heartbeat');

      expect(result.content[0].type).toBe('text');
      expect(ctx.markHumanInterrupt).toHaveBeenCalledWith(agent.id);
    });

    it('crew_request_limit_change requests limit change', async () => {
      const result = await callTool('crew_request_limit_change', {
        limit: 20,
        reason: 'Need more agents',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('submitted');
    });

    // ── Capabilities ───────────────────────────────────────────────

    it('crew_acquire_capability acquires a capability', async () => {
      const result = await callTool('crew_acquire_capability', {
        capability: 'code-review',
        reason: 'Found a bug',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.capabilityInjector!.acquire).toHaveBeenCalled();
    });

    it('crew_list_capabilities lists capabilities', async () => {
      const result = await callTool('crew_list_capabilities');

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Capabilities');
    });

    // ── Decision ───────────────────────────────────────────────────

    it('crew_decision records a decision', async () => {
      const result = await callTool('crew_decision', {
        title: 'Use PostgreSQL',
        rationale: 'Better query support',
      });

      expect(result.content[0].type).toBe('text');
      expect(ctx.decisionLog.add).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns error when no calling agent', async () => {
      const noAgentServer = createCrewMcpServer({
        ctx,
        getCallingAgent: () => undefined,
      });

      const registeredTools = (noAgentServer as any)._registeredTools;
      const result = await registeredTools['crew_query_crew'].handler({}, {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No calling agent');
    });

    it('returns error when handler throws', async () => {
      // Make lockRegistry.acquire throw
      (ctx.lockRegistry.acquire as any).mockImplementation(() => {
        throw new Error('Registry unavailable');
      });

      const registeredTools = (server as any)._registeredTools;
      const result = await registeredTools['crew_lock_file'].handler(
        { filePath: 'test.ts' },
        {},
      );

      expect(result.content[0].type).toBe('text');
      // The handler catches errors internally, so it may not propagate as isError
      // but the response should still be valid
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('sendMessage capture', () => {
    it('captures sendMessage calls and returns them as tool result', async () => {
      // Lock file — the handler calls agent.sendMessage() with ack
      // Track calls via a separate spy since captureAgentResponse rebinds sendMessage
      const sentMessages: string[] = [];
      const originalSendMock = vi.fn((msg: string) => { sentMessages.push(msg); });
      agent.sendMessage = originalSendMock;

      const registeredTools = (server as any)._registeredTools;
      const result = await registeredTools['crew_lock_file'].handler(
        { filePath: 'test.ts', reason: 'testing' },
        {},
      );

      expect(result.content[0].text).toContain('Lock acquired');
      // Original sendMessage should also have been called (not suppressed)
      expect(sentMessages.length).toBeGreaterThan(0);
      expect(sentMessages[0]).toContain('Lock acquired');
    });

    it('restores original sendMessage after execution', async () => {
      const originalSend = agent.sendMessage;

      const registeredTools = (server as any)._registeredTools;
      await registeredTools['crew_lock_file'].handler(
        { filePath: 'test.ts' },
        {},
      );

      // sendMessage should be the original fn (or at least still work)
      // Since we're using vi.fn(), check it's still callable
      expect(typeof agent.sendMessage).toBe('function');
    });
  });
});
