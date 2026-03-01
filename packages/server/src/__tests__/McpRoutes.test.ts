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

function request(
  app: Express,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    // Start a temporary server
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode!, headers: res.headers, body: data });
        });
      });
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

/**
 * Open an SSE connection, collect the first event, and close.
 * Returns the event data and the response headers.
 */
function openSse(
  app: Express,
  path: string,
  { timeoutMs = 2000 }: { timeoutMs?: number } = {},
): Promise<{ status: number; events: string[]; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      };

      const events: string[] = [];
      const req = http.request(options, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          // Parse SSE events from the buffer
          const parts = buffer.split('\n\n');
          for (let i = 0; i < parts.length - 1; i++) {
            events.push(parts[i]);
          }
          buffer = parts[parts.length - 1];
        });
        // Resolve after first event or on timeout
        const timer = setTimeout(() => {
          req.destroy();
          server.close();
          resolve({ status: res.statusCode!, events, headers: res.headers });
        }, timeoutMs);

        // If we get at least one event, resolve quickly
        const checkInterval = setInterval(() => {
          if (events.length > 0) {
            clearTimeout(timer);
            clearInterval(checkInterval);
            req.destroy();
            server.close();
            resolve({ status: res.statusCode!, events, headers: res.headers });
          }
        }, 50);
      });

      req.on('error', (err) => {
        // ECONNRESET is expected when we destroy the request
        if ((err as any).code === 'ECONNRESET') return;
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('createMcpRoutes', () => {
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

  describe('GET /mcp/:agentId/sse', () => {
    it('returns 404 for unknown agent', async () => {
      const res = await request(app, 'GET', '/mcp/nonexistent-agent-id/sse');
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body).error).toContain('Agent not found');
    });

    it('establishes SSE connection for a valid agent', async () => {
      const res = await openSse(app, `/mcp/${agent.id}/sse`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');

      // Should receive the endpoint event with sessionId
      expect(res.events.length).toBeGreaterThanOrEqual(1);
      const endpointEvent = res.events[0];
      expect(endpointEvent).toContain('event: endpoint');
      expect(endpointEvent).toContain(`/mcp/${agent.id}/message`);
      expect(endpointEvent).toContain('sessionId=');
    });
  });

  describe('POST /mcp/:agentId/message', () => {
    it('returns 400 when sessionId is missing', async () => {
      const res = await request(app, 'POST', `/mcp/${agent.id}/message`, { jsonrpc: '2.0' });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toContain('Missing sessionId');
    });

    it('returns 404 for unknown sessionId', async () => {
      const res = await request(
        app,
        'POST',
        `/mcp/${agent.id}/message?sessionId=nonexistent`,
        { jsonrpc: '2.0', method: 'ping', id: 1 },
      );
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body).error).toContain('No active MCP session');
    });
  });

  describe('SSE + POST integration', () => {
    it('accepts POST messages on the endpoint from the SSE event', async () => {
      // This test verifies the full SSE → extract endpoint → POST flow.
      // We start an SSE connection, extract the endpoint URL, then POST to it.

      const server = await new Promise<http.Server>((resolve) => {
        const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
      });
      const addr = server.address() as { port: number };

      try {
        // Step 1: Open SSE and get the endpoint URL
        const sseEndpoint = await new Promise<string>((resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: `/mcp/${agent.id}/sse`,
              method: 'GET',
              headers: { Accept: 'text/event-stream' },
            },
            (res) => {
              let buffer = '';
              res.on('data', (chunk) => {
                buffer += chunk.toString();
                // Look for "event: endpoint\ndata: <url>"
                const match = buffer.match(/event: endpoint\ndata: (.+)/);
                if (match) {
                  resolve(match[1].trim());
                }
              });
              setTimeout(() => reject(new Error('SSE timeout')), 3000);
            },
          );
          req.on('error', reject);
          req.end();
        });

        expect(sseEndpoint).toContain(`/mcp/${agent.id}/message`);
        expect(sseEndpoint).toContain('sessionId=');

        // Step 2: POST a JSON-RPC message to the extracted endpoint
        const postResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const postReq = http.request(
            {
              hostname: '127.0.0.1',
              port: addr.port,
              path: sseEndpoint,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            },
            (res) => {
              let data = '';
              res.on('data', (chunk) => (data += chunk));
              res.on('end', () => resolve({ status: res.statusCode!, body: data }));
            },
          );
          postReq.on('error', reject);
          // Send a valid JSON-RPC initialize request
          postReq.write(JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            id: 1,
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          }));
          postReq.end();
        });

        // SSE transport responds with 202 Accepted for valid messages
        expect(postResult.status).toBe(202);
      } finally {
        server.close();
      }
    });
  });
});
