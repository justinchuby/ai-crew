import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import http from 'http';
import { createMcpRoutes, type CrewMcpRouteOptions } from '../mcp/CrewMcpServer.js';
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
    id: 'agent-test-0001-0000-000000000001',
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
    activityLedger: { log: vi.fn() } as any,
    messageBus: { send: vi.fn() } as any,
    decisionLog: {
      add: vi.fn().mockReturnValue({ id: 'dec-1', status: 'recorded' }),
      markSystemDecision: vi.fn(),
    } as any,
    agentMemory: { store: vi.fn(), getByLead: vi.fn().mockReturnValue([]) } as any,
    chatGroupRegistry: {
      create: vi.fn().mockReturnValue({ name: 'g', memberIds: [], leadId: 'l', createdAt: '' }),
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
      add: vi.fn().mockReturnValue({ id: 1, description: 'test', severity: 'P1', status: 'open', createdAt: new Date().toISOString(), reviewerAgentId: 'a', reviewerRole: 'dev' }),
      list: vi.fn().mockReturnValue([]),
      resolve: vi.fn().mockReturnValue(true),
      dismiss: vi.fn().mockReturnValue(true),
    } as any,
    timerRegistry: {
      create: vi.fn().mockReturnValue({ id: 'tmr-1', label: 'test', repeat: false }),
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

// ── HTTP helper ──────────────────────────────────────────────────────

function httpRequest(
  app: Express,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  options?: { body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const reqHeaders: Record<string, string> = {
        ...(options?.body ? { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' } : {}),
        ...(options?.headers ?? {}),
      };

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method,
          headers: reqHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode!, headers: res.headers, body: data });
          });
        },
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (options?.body) req.write(JSON.stringify(options.body));
      req.end();
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('createMcpRoutes (Streamable HTTP)', () => {
  let app: Express;
  let ctx: CommandHandlerContext;
  let agent: Agent;

  beforeEach(() => {
    agent = makeAgent();
    ctx = makeHandlerContext();
    app = express();
    app.use(express.json());

    const routes = createMcpRoutes({
      ctx,
      getAgent: (id) => (id === agent.id ? agent : undefined),
    });
    app.use(routes);
  });

  describe('POST /mcp/:agentId (initialization)', () => {
    it('returns 404 for unknown agent', async () => {
      const res = await httpRequest(app, 'POST', '/mcp/nonexistent-agent-id', {
        body: {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
      });
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body).error).toContain('Agent not found');
    });

    it('creates a session for a valid agent and returns mcp-session-id', async () => {
      const res = await httpRequest(app, 'POST', `/mcp/${agent.id}`, {
        body: {
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers['mcp-session-id']).toBeDefined();
      expect(typeof res.headers['mcp-session-id']).toBe('string');

      // Streamable HTTP returns SSE stream for init; parse the JSON-RPC result from events
      const dataMatch = res.body.match(/^data: (.+)$/m);
      expect(dataMatch).toBeTruthy();
      const parsed = JSON.parse(dataMatch![1]);
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe(1);
      expect(parsed.result).toBeDefined();
      expect(parsed.result.serverInfo).toBeDefined();
      expect(parsed.result.serverInfo.name).toBe('ai-crew');
    });
  });

  describe('GET /mcp/:agentId (SSE stream)', () => {
    it('returns 400 without mcp-session-id header', async () => {
      const res = await httpRequest(app, 'GET', `/mcp/${agent.id}`);
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Missing or invalid mcp-session-id');
    });

    it('returns error for unknown session ID', async () => {
      const res = await httpRequest(app, 'GET', `/mcp/${agent.id}`, {
        headers: { 'mcp-session-id': 'nonexistent-session-id' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /mcp/:agentId', () => {
    it('returns 404 for unknown session', async () => {
      const res = await httpRequest(app, 'DELETE', `/mcp/${agent.id}`, {
        headers: { 'mcp-session-id': 'nonexistent-session-id' },
      });
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body).error).toContain('Session not found');
    });
  });

  describe('POST + subsequent POST (session reuse)', () => {
    it('routes subsequent requests to the same session', async () => {
      const server = await new Promise<http.Server>((resolve) => {
        const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
      });
      const addr = server.address() as { port: number };
      const mcpHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };

      try {
        // Step 1: Initialize and get session ID
        const initResult = await new Promise<{ status: number; sessionId: string; body: string }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: `/mcp/${agent.id}`,
              method: 'POST',
              headers: mcpHeaders,
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => {
                resolve({
                  status: res.statusCode!,
                  sessionId: res.headers['mcp-session-id'] as string,
                  body: data,
                });
              });
            },
          );
          req.on('error', reject);
          req.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            id: 1,
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }));
          req.end();
        });

        expect(initResult.status).toBe(200);
        expect(initResult.sessionId).toBeDefined();

        // Step 2: Send initialized notification (required by MCP spec before tool calls)
        const notifyResult = await new Promise<{ status: number }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: `/mcp/${agent.id}`,
              method: 'POST',
              headers: {
                ...mcpHeaders,
                'mcp-session-id': initResult.sessionId,
              },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => resolve({ status: res.statusCode! }));
            },
          );
          req.on('error', reject);
          req.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }));
          req.end();
        });

        // Notifications return 202 Accepted (no response body)
        expect(notifyResult.status).toBe(202);

        // Step 3: List tools using the same session
        const toolsResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: `/mcp/${agent.id}`,
              method: 'POST',
              headers: {
                ...mcpHeaders,
                'mcp-session-id': initResult.sessionId,
              },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => resolve({ status: res.statusCode!, body: data }));
            },
          );
          req.on('error', reject);
          req.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: 2,
          }));
          req.end();
        });

        expect(toolsResult.status).toBe(200);
        // Streamable HTTP returns SSE stream; parse data: line for the JSON-RPC response
        const toolsDataMatch = toolsResult.body.match(/^data: (.+)$/m);
        expect(toolsDataMatch).toBeTruthy();
        const toolsList = JSON.parse(toolsDataMatch![1]);
        expect(toolsList.result).toBeDefined();
        expect(toolsList.result.tools).toBeDefined();
        expect(toolsList.result.tools.length).toBeGreaterThanOrEqual(40);
        // Verify crew tools are present
        const toolNames = toolsList.result.tools.map((t: any) => t.name);
        expect(toolNames).toContain('crew_create_agent');
        expect(toolNames).toContain('crew_delegate');
        expect(toolNames).toContain('crew_lock_file');
      } finally {
        server.close();
      }
    });
  });
});
