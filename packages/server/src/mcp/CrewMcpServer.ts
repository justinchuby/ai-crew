/**
 * CrewMcpServer — Exposes all AI Crew inter-agent commands as MCP tools.
 *
 * Uses the @modelcontextprotocol/sdk McpServer with zod v4 schemas.
 * Each tool reconstructs the [[[ COMMAND {...} ]]] string and dispatches
 * through the existing command handlers, capturing agent.sendMessage()
 * calls to return structured MCP results.
 *
 * Factory pattern: each agent process gets its own MCP server instance.
 */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router, type Request, type Response } from 'express';
import type { Agent } from '../agents/Agent.js';
import type { CommandEntry, CommandHandlerContext } from '../agents/commands/types.js';
import { getAgentCommands } from '../agents/commands/AgentCommands.js';
import { getCommCommands } from '../agents/commands/CommCommands.js';
import { getTaskCommands } from '../agents/commands/TaskCommands.js';
import { getCoordCommands } from '../agents/commands/CoordCommands.js';
import { getDeferredCommands } from '../agents/commands/DeferredCommands.js';
import { getSystemCommands } from '../agents/commands/SystemCommands.js';
import { getTimerCommands } from '../agents/commands/TimerCommands.js';
import { getExportCommands } from '../agents/commands/ExportCommands.js';
import { getCapabilityCommands } from '../agents/commands/CapabilityCommands.js';
import { getDirectMessageCommands } from '../agents/commands/DirectMessageCommands.js';
import { getTemplateCommands } from '../agents/commands/TemplateCommands.js';
import { logger } from '../utils/logger.js';

// ── Public interface ─────────────────────────────────────────────────

export interface CrewMcpServerOptions {
  /** The shared command handler context (from CommandDispatcher) */
  ctx: CommandHandlerContext;
  /** Callback to resolve the agent that owns this MCP server instance */
  getCallingAgent: () => Agent | undefined;
}

/**
 * Create an MCP server with all crew command tools registered.
 * The returned McpServer can be connected to any MCP transport.
 */
export function createCrewMcpServer(options: CrewMcpServerOptions): McpServer {
  const { ctx, getCallingAgent } = options;

  const server = new McpServer(
    { name: 'ai-crew', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── Helper: resolve agent or return error result ─────────────────

  function requireAgent(): { agent: Agent } | { error: string } {
    const agent = getCallingAgent();
    if (!agent) {
      return { error: 'No calling agent found. MCP server is not bound to an agent.' };
    }
    return { agent };
  }

  /**
   * Temporarily intercept agent.sendMessage() during handler execution
   * to capture response text for the MCP tool result.
   */
  function captureAgentResponse(agent: Agent, fn: () => void): string {
    const messages: string[] = [];
    const originalSend = agent.sendMessage.bind(agent);
    agent.sendMessage = (msg: string) => {
      messages.push(msg);
      originalSend(msg);
    };
    try {
      fn();
    } finally {
      agent.sendMessage = originalSend;
    }
    return messages.join('\n') || 'Command executed successfully';
  }

  /**
   * Execute a crew command by reconstructing the [[[ COMMAND {...} ]]] string
   * and dispatching through the existing handler pattern table.
   *
   * Returns the captured sendMessage output as MCP CallToolResult content.
   */
  function executeCommand(
    commandName: string,
    params: Record<string, unknown>,
  ): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
    const resolved = requireAgent();
    if ('error' in resolved) {
      return { content: [{ type: 'text', text: resolved.error }], isError: true };
    }
    const { agent } = resolved;

    logger.debug('mcp', `Tool call: crew_${commandName.toLowerCase()} from ${agent.role.name} (${agent.id.slice(0, 8)})`);

    try {
      // Build the [[[ COMMAND {...} ]]] string the existing handlers expect
      const hasParams = Object.keys(params).length > 0;
      const data = hasParams
        ? `[[[ ${commandName} ${JSON.stringify(params)} ]]]`
        : `[[[ ${commandName} ]]]`;

      // Find matching handler from all command modules
      const handler = findHandler(commandName);
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Unknown command: ${commandName}` }],
          isError: true,
        };
      }

      const result = captureAgentResponse(agent, () => handler(agent, data));
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('mcp', `Tool error: ${commandName} — ${message}`);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }

  // ── Handler lookup ─────────────────────────────────────────────────

  // Build handler map eagerly from all command modules.
  // Each get*Commands(ctx) returns CommandEntry[] with {regex, name, handler}.
  const allEntries: CommandEntry[] = [
    ...getAgentCommands(ctx),
    ...getCommCommands(ctx),
    ...getTaskCommands(ctx),
    ...getCoordCommands(ctx),
    ...getDeferredCommands(ctx),
    ...getSystemCommands(ctx),
    ...getTimerCommands(ctx),
    ...getExportCommands(ctx),
    ...getCapabilityCommands(ctx),
    ...getDirectMessageCommands(ctx),
    ...(ctx.taskTemplateRegistry && ctx.taskDecomposer
      ? getTemplateCommands(ctx, ctx.taskTemplateRegistry, ctx.taskDecomposer)
      : []),
  ];

  // Index by entry.name AND by the regex-derived command name for lookup
  const handlerMap = new Map<string, (agent: Agent, data: string) => void>();
  for (const entry of allEntries) {
    handlerMap.set(entry.name, entry.handler);
    const regexName = extractCommandNameFromRegex(entry.regex);
    if (regexName && regexName !== entry.name) {
      handlerMap.set(regexName, entry.handler);
    }
  }

  function extractCommandNameFromRegex(regex: RegExp): string | null {
    // Patterns look like: /\[\[\[\s*COMMAND_NAME\s*...\]\]\]/
    const match = regex.source.match(/\\\[\\\[\\\[\\s\*([A-Z_]+)\\s\*/);
    return match ? match[1] : null;
  }

  function findHandler(commandName: string): ((agent: Agent, data: string) => void) | null {
    return handlerMap.get(commandName) ?? handlerMap.get(commandName.toUpperCase()) ?? null;
  }

  // ── Tool Registration ──────────────────────────────────────────────

  // Agent Lifecycle (lead/architect only)

  server.registerTool(
    'crew_create_agent',
    {
      description: 'Create a new agent with the specified role. Only leads and architects can use this.',
      inputSchema: {
        role: z.string().describe('Role ID for the new agent (e.g., "developer", "reviewer")'),
        task: z.string().optional().describe('Initial task to assign to the agent'),
        context: z.string().optional().describe('Additional context for the task'),
        model: z.string().optional().describe('Model override (e.g., "claude-opus-4.6")'),
        name: z.string().optional().describe('Name for sub-project leads'),
      },
    },
    async (params) => executeCommand('CREATE_AGENT', params)
  );

  server.registerTool(
    'crew_delegate',
    {
      description: 'Delegate a task to an existing child agent. Only leads and architects can use this.',
      inputSchema: {
        to: z.string().describe('Agent ID or prefix of the target agent'),
        task: z.string().describe('Task description to delegate'),
        context: z.string().optional().describe('Additional context for the task'),
      },
    },
    async (params) => executeCommand('DELEGATE', params)
  );

  server.registerTool(
    'crew_terminate_agent',
    {
      description: 'Terminate a child agent. Only the lead can use this.',
      inputSchema: {
        id: z.string().describe('Agent ID or prefix to terminate'),
        reason: z.string().optional().describe('Reason for termination'),
      },
    },
    async (params) => executeCommand('TERMINATE_AGENT', params)
  );

  server.registerTool(
    'crew_cancel_delegation',
    {
      description: 'Cancel active delegations to an agent. Only the lead can use this.',
      inputSchema: {
        agentId: z.string().optional().describe('Agent ID whose delegations to cancel'),
        delegationId: z.string().optional().describe('Specific delegation ID to cancel'),
      },
    },
    async (params) => executeCommand('CANCEL_DELEGATION', params)
  );

  // Communication (all agents)

  server.registerTool(
    'crew_agent_message',
    {
      description: 'Send a message to another agent by ID, prefix, role ID, or role name.',
      inputSchema: {
        to: z.string().describe('Target agent ID, prefix, role ID, or role name'),
        content: z.string().describe('Message content'),
      },
    },
    async (params) => executeCommand('AGENT_MESSAGE', params)
  );

  server.registerTool(
    'crew_broadcast',
    {
      description: 'Broadcast a message to all agents in your team.',
      inputSchema: {
        content: z.string().describe('Message content to broadcast'),
      },
    },
    async (params) => executeCommand('BROADCAST', params)
  );

  server.registerTool(
    'crew_create_group',
    {
      description: 'Create a named chat group with specified members.',
      inputSchema: {
        name: z.string().describe('Group name'),
        members: z.array(z.string()).optional().describe('Array of agent IDs to include'),
        roles: z.array(z.string()).optional().describe('Array of role names to include'),
      },
    },
    async (params) => executeCommand('CREATE_GROUP', params)
  );

  server.registerTool(
    'crew_group_message',
    {
      description: 'Send a message to a chat group.',
      inputSchema: {
        group: z.string().describe('Group name'),
        content: z.string().describe('Message content'),
      },
    },
    async (params) => executeCommand('GROUP_MESSAGE', params)
  );

  server.registerTool(
    'crew_add_to_group',
    {
      description: 'Add members to an existing chat group.',
      inputSchema: {
        group: z.string().describe('Group name'),
        members: z.array(z.string()).describe('Array of agent IDs to add'),
      },
    },
    async (params) => executeCommand('ADD_TO_GROUP', params)
  );

  server.registerTool(
    'crew_remove_from_group',
    {
      description: 'Remove members from a chat group.',
      inputSchema: {
        group: z.string().describe('Group name'),
        members: z.array(z.string()).describe('Array of agent IDs to remove'),
      },
    },
    async (params) => executeCommand('REMOVE_FROM_GROUP', params)
  );

  server.registerTool(
    'crew_query_groups',
    { description: 'List all chat groups you are a member of.' },
    async () => executeCommand('QUERY_GROUPS', {})
  );

  server.registerTool(
    'crew_direct_message',
    {
      description: 'Send a direct peer-to-peer message to another agent (queued, non-interrupting).',
      inputSchema: {
        to: z.string().describe('Target agent ID or prefix'),
        content: z.string().describe('Message content'),
      },
    },
    async (params) => executeCommand('DIRECT_MESSAGE', params)
  );

  server.registerTool(
    'crew_query_peers',
    { description: 'List active peer agents under the same lead.' },
    async () => executeCommand('QUERY_PEERS', {})
  );

  // Tasks & Progress

  server.registerTool(
    'crew_declare_tasks',
    {
      description: 'Declare a task DAG (directed acyclic graph). Lead only.',
      inputSchema: {
        tasks: z.array(z.object({
        id: z.string().describe('Unique task identifier'),
        title: z.string().describe('Task title/description'),
        depends_on: z.array(z.string()).optional().describe('Task IDs this depends on'),
        role: z.string().optional().describe('Role to assign this task to'),
        assignee: z.string().optional().describe('Specific agent ID to assign to'),
        })).describe('Array of task definitions'),
      },
    },
    async (params) => executeCommand('DECLARE_TASKS', params)
  );

  server.registerTool(
    'crew_progress',
    {
      description: 'Report progress on the current project. Lead only.',
      inputSchema: {
        summary: z.string().describe('Progress summary'),
        completed: z.array(z.string()).optional().describe('Completed items'),
        in_progress: z.array(z.string()).optional().describe('Items in progress'),
        blocked: z.array(z.string()).optional().describe('Blocked items'),
      },
    },
    async (params) => executeCommand('PROGRESS', params)
  );

  server.registerTool(
    'crew_complete_task',
    {
      description: 'Report task completion with a summary. Any agent can use this.',
      inputSchema: {
        summary: z.string().describe('Completion summary'),
      },
    },
    async (params) => {
      // COMPLETE_TASK is not a separate command — it's communicated via
      // the agent going idle. For now, treat it as a PROGRESS update.
      return executeCommand('PROGRESS', { summary: `COMPLETED: ${params.summary}` });
    }
  );

  server.registerTool(
    'crew_decision',
    {
      description: 'Record an architectural or design decision.',
      inputSchema: {
        title: z.string().describe('Decision title'),
        rationale: z.string().describe('Rationale for the decision'),
        needsConfirmation: z.boolean().optional().describe('Whether this needs human confirmation'),
      },
    },
    async (params) => executeCommand('DECISION', params)
  );

  server.registerTool(
    'crew_query_tasks',
    { description: 'Query the current task DAG status.' },
    async () => executeCommand('QUERY_TASKS', {})
  );

  server.registerTool(
    'crew_add_task',
    {
      description: 'Add a single task to the DAG. Lead only.',
      inputSchema: {
        id: z.string().describe('Unique task identifier'),
        title: z.string().describe('Task title/description'),
        depends_on: z.array(z.string()).optional().describe('Task IDs this depends on'),
        role: z.string().optional().describe('Role to assign this task to'),
      },
    },
    async (params) => executeCommand('ADD_TASK', params)
  );

  server.registerTool(
    'crew_cancel_task',
    {
      description: 'Cancel a task in the DAG. Lead only.',
      inputSchema: {
        id: z.string().describe('Task ID to cancel'),
      },
    },
    async (params) => executeCommand('CANCEL_TASK', params)
  );

  server.registerTool(
    'crew_pause_task',
    {
      description: 'Pause a task in the DAG. Lead only.',
      inputSchema: {
        id: z.string().describe('Task ID to pause'),
      },
    },
    async (params) => executeCommand('PAUSE_TASK', params)
  );

  server.registerTool(
    'crew_retry_task',
    {
      description: 'Retry a failed task in the DAG. Lead only.',
      inputSchema: {
        id: z.string().describe('Task ID to retry'),
      },
    },
    async (params) => executeCommand('RETRY_TASK', params)
  );

  server.registerTool(
    'crew_skip_task',
    {
      description: 'Skip a task in the DAG. Lead only.',
      inputSchema: {
        id: z.string().describe('Task ID to skip'),
      },
    },
    async (params) => executeCommand('SKIP_TASK', params)
  );

  server.registerTool(
    'crew_reset_dag',
    { description: 'Reset the entire task DAG. Lead only.' },
    async () => executeCommand('RESET_DAG', {})
  );

  // Coordination (all agents)

  server.registerTool(
    'crew_lock_file',
    {
      description: 'Acquire a file lock to prevent conflicts with other agents.',
      inputSchema: {
        filePath: z.string().describe('Path to the file to lock'),
        reason: z.string().optional().describe('Reason for locking'),
      },
    },
    async (params) => executeCommand('LOCK_FILE', params)
  );

  server.registerTool(
    'crew_unlock_file',
    {
      description: 'Release a file lock.',
      inputSchema: {
        filePath: z.string().describe('Path to the file to unlock'),
      },
    },
    async (params) => executeCommand('UNLOCK_FILE', params)
  );

  server.registerTool(
    'crew_commit',
    {
      description: 'Prepare a scoped git commit from your locked files.',
      inputSchema: {
        message: z.string().describe('Commit message'),
        files: z.array(z.string()).optional().describe('Specific files to commit (defaults to locked files)'),
      },
    },
    async (params) => executeCommand('COMMIT', params)
  );

  server.registerTool(
    'crew_query_crew',
    { description: 'Query the current crew roster and status.' },
    async () => executeCommand('QUERY_CREW', {})
  );

  server.registerTool(
    'crew_defer_issue',
    {
      description: 'Defer an issue for later resolution.',
      inputSchema: {
        description: z.string().describe('Issue description'),
        severity: z.string().optional().describe('Severity level (e.g., "P1", "P2")'),
        sourceFile: z.string().optional().describe('Source file related to the issue'),
      },
    },
    async (params) => executeCommand('DEFER_ISSUE', params)
  );

  server.registerTool(
    'crew_query_deferred',
    {
      description: 'Query deferred issues.',
      inputSchema: {
        status: z.string().optional().describe('Filter by status: "open", "resolved", or "dismissed"'),
      },
    },
    async (params) => executeCommand('QUERY_DEFERRED', params)
  );

  server.registerTool(
    'crew_resolve_deferred',
    {
      description: 'Resolve or dismiss a deferred issue.',
      inputSchema: {
        id: z.number().describe('Issue ID to resolve'),
        dismiss: z.boolean().optional().describe('If true, dismiss instead of resolving'),
      },
    },
    async (params) => executeCommand('RESOLVE_DEFERRED', params)
  );

  // Timers

  server.registerTool(
    'crew_set_timer',
    {
      description: 'Set a reminder timer that fires after a delay.',
      inputSchema: {
        label: z.string().optional().describe('Timer label/name'),
        delay: z.number().describe('Delay in seconds (5–86400)'),
        message: z.string().optional().describe('Reminder message text'),
        repeat: z.boolean().optional().describe('Whether the timer repeats'),
      },
    },
    async (params) => executeCommand('SET_TIMER', params)
  );

  server.registerTool(
    'crew_cancel_timer',
    {
      description: 'Cancel an active timer.',
      inputSchema: {
        id: z.string().optional().describe('Timer ID'),
        name: z.string().optional().describe('Timer label/name'),
      },
    },
    async (params) => executeCommand('CANCEL_TIMER', params)
  );

  server.registerTool(
    'crew_list_timers',
    { description: 'List all active timers.' },
    async () => executeCommand('LIST_TIMERS', {})
  );

  // System

  server.registerTool(
    'crew_halt_heartbeat',
    { description: 'Pause heartbeat nudges. Lead only.' },
    async () => executeCommand('HALT_HEARTBEAT', {})
  );

  server.registerTool(
    'crew_request_limit_change',
    {
      description: 'Request a change to the agent concurrency limit. Lead only.',
      inputSchema: {
        limit: z.number().describe('New concurrency limit (1–100)'),
        reason: z.string().optional().describe('Reason for the change'),
      },
    },
    async (params) => executeCommand('REQUEST_LIMIT_CHANGE', params)
  );

  server.registerTool(
    'crew_export_session',
    { description: 'Export the current session data. Lead/secretary only.' },
    async () => executeCommand('EXPORT_SESSION', {})
  );

  // Capabilities

  server.registerTool(
    'crew_acquire_capability',
    {
      description: 'Acquire an additional capability beyond your core role.',
      inputSchema: {
        capability: z.string().describe('Capability ID (e.g., "code-review", "architecture")'),
        reason: z.string().optional().describe('Reason for acquiring'),
      },
    },
    async (params) => executeCommand('ACQUIRE_CAPABILITY', params)
  );

  server.registerTool(
    'crew_list_capabilities',
    { description: 'List all available capabilities and your current ones.' },
    async () => executeCommand('LIST_CAPABILITIES', {})
  );

  server.registerTool(
    'crew_release_capability',
    { description: 'Release an acquired capability.' },
    async () => executeCommand('RELEASE_CAPABILITY', {})
  );

  // Templates

  server.registerTool(
    'crew_list_templates',
    { description: 'List all available task workflow templates.' },
    async () => executeCommand('LIST_TEMPLATES', {})
  );

  server.registerTool(
    'crew_apply_template',
    {
      description: 'Apply a task workflow template to create a DAG. Lead only.',
      inputSchema: {
        template: z.string().describe('Template ID to apply'),
        overrides: z.record(z.string(), z.any()).optional().describe('Override values for template tasks'),
      },
    },
    async (params) => executeCommand('APPLY_TEMPLATE', params)
  );

  server.registerTool(
    'crew_decompose_task',
    {
      description: 'Decompose a task description into suggested sub-tasks.',
      inputSchema: {
        task: z.string().describe('Task description to decompose'),
      },
    },
    async (params) => executeCommand('DECOMPOSE_TASK', params)
  );

  return server;
}

// ── Streamable HTTP Transport Routes ────────────────────────────────────

/**
 * Options for creating per-agent MCP Streamable HTTP route handlers.
 */
export interface CrewMcpRouteOptions {
  /** The shared command handler context (from CommandDispatcher) */
  ctx: CommandHandlerContext;
  /** Resolve a live Agent instance by its full ID */
  getAgent: (agentId: string) => Agent | undefined;
}

/** Tracks an active MCP session: the transport and its MCP server instance */
interface McpSession {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  agentId: string;
}

/**
 * Create an Express router that serves per-agent MCP endpoints over Streamable HTTP.
 *
 * Mount at the app root (NOT under /api) since the Copilot CLI MCP client
 * connects directly to these endpoints from the same machine.
 *
 * Endpoints (per Streamable HTTP spec):
 *   POST /mcp/:agentId  — Send JSON-RPC messages (initialize, tool calls, etc.)
 *   GET  /mcp/:agentId  — Open SSE stream for server-initiated messages
 *   DELETE /mcp/:agentId — Terminate the MCP session
 */
export function createMcpRoutes(options: CrewMcpRouteOptions): Router {
  const router = Router();

  // Keyed by the transport's sessionId so we can route messages
  // to the correct agent's MCP server instance.
  const sessions = new Map<string, McpSession>();

  /**
   * Create a new transport + MCP server for an agent.
   * The transport session ID is assigned when the initialize request is handled.
   */
  async function createSessionAndHandle(
    agentId: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    const mcpServer = createCrewMcpServer({
      ctx: options.ctx,
      getCallingAgent: () => options.getAgent(agentId),
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        sessions.delete(sid);
        logger.debug('mcp', `Session closed: agent ${agentId.slice(0, 8)} (session ${sid.slice(0, 8)})`);
      }
      mcpServer.close().catch(() => {});
    };

    await mcpServer.connect(transport);

    // Handle the request (initialize) — this assigns the session ID
    await transport.handleRequest(req, res, req.body);

    // After handling, the transport should have a session ID
    const sid = transport.sessionId;
    if (sid) {
      sessions.set(sid, { transport, mcpServer, agentId });
      logger.info('mcp', `Session created: agent ${agentId.slice(0, 8)} (session ${sid.slice(0, 8)})`);
    }
  }

  // POST — JSON-RPC requests (initialize, tool calls, notifications)
  router.post('/mcp/:agentId', async (req: Request, res: Response) => {
    const agentId = req.params.agentId as string;
    const agent = options.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: `Agent not found: ${agentId}` });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — route to its transport
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('mcp', `POST error (session ${sessionId.slice(0, 8)}): ${msg}`);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to process MCP message' });
      }
      return;
    }

    // No session or unknown session — create a new one (initialization)
    try {
      await createSessionAndHandle(agentId, req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('mcp', `Session init failed for agent ${agentId.slice(0, 8)}: ${msg}`);
      if (!res.headersSent) res.status(500).json({ error: 'MCP session initialization failed' });
    }
  });

  // GET — SSE stream for server-initiated messages
  router.get('/mcp/:agentId', (req: Request, res: Response) => {
    const agentId = req.params.agentId as string;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Missing or invalid mcp-session-id header' });
      return;
    }

    const session = sessions.get(sessionId)!;
    session.transport.handleRequest(req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('mcp', `GET SSE error (session ${sessionId.slice(0, 8)}): ${msg}`);
    });
  });

  // DELETE — terminate a session
  router.delete('/mcp/:agentId', (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const session = sessions.get(sessionId)!;
    session.transport.handleRequest(req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('mcp', `DELETE error (session ${sessionId.slice(0, 8)}): ${msg}`);
    });
  });

  return router;
}

/**
 * Close all active MCP sessions for a given agent.
 * Called during agent termination to clean up resources.
 */
export function closeMcpSessions(sessions: Map<string, McpSession>, agentId: string): void {
  for (const [sessionId, session] of sessions) {
    if (session.agentId === agentId) {
      session.mcpServer.close().catch(() => {});
      sessions.delete(sessionId);
    }
  }
}
