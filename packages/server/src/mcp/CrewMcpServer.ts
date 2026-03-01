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

  server.tool(
    'crew_create_agent',
    'Create a new agent with the specified role. Only leads and architects can use this.',
    {
      role: z.string().describe('Role ID for the new agent (e.g., "developer", "reviewer")'),
      task: z.string().optional().describe('Initial task to assign to the agent'),
      context: z.string().optional().describe('Additional context for the task'),
      model: z.string().optional().describe('Model override (e.g., "claude-opus-4.6")'),
      name: z.string().optional().describe('Name for sub-project leads'),
    },
    async (params) => executeCommand('CREATE_AGENT', params),
  );

  server.tool(
    'crew_delegate',
    'Delegate a task to an existing child agent. Only leads and architects can use this.',
    {
      to: z.string().describe('Agent ID or prefix of the target agent'),
      task: z.string().describe('Task description to delegate'),
      context: z.string().optional().describe('Additional context for the task'),
    },
    async (params) => executeCommand('DELEGATE', params),
  );

  server.tool(
    'crew_terminate_agent',
    'Terminate a child agent. Only the lead can use this.',
    {
      id: z.string().describe('Agent ID or prefix to terminate'),
      reason: z.string().optional().describe('Reason for termination'),
    },
    async (params) => executeCommand('TERMINATE_AGENT', params),
  );

  server.tool(
    'crew_cancel_delegation',
    'Cancel active delegations to an agent. Only the lead can use this.',
    {
      agentId: z.string().optional().describe('Agent ID whose delegations to cancel'),
      delegationId: z.string().optional().describe('Specific delegation ID to cancel'),
    },
    async (params) => executeCommand('CANCEL_DELEGATION', params),
  );

  // Communication (all agents)

  server.tool(
    'crew_agent_message',
    'Send a message to another agent by ID, prefix, role ID, or role name.',
    {
      to: z.string().describe('Target agent ID, prefix, role ID, or role name'),
      content: z.string().describe('Message content'),
    },
    async (params) => executeCommand('AGENT_MESSAGE', params),
  );

  server.tool(
    'crew_broadcast',
    'Broadcast a message to all agents in your team.',
    {
      content: z.string().describe('Message content to broadcast'),
    },
    async (params) => executeCommand('BROADCAST', params),
  );

  server.tool(
    'crew_create_group',
    'Create a named chat group with specified members.',
    {
      name: z.string().describe('Group name'),
      members: z.array(z.string()).optional().describe('Array of agent IDs to include'),
      roles: z.array(z.string()).optional().describe('Array of role names to include'),
    },
    async (params) => executeCommand('CREATE_GROUP', params),
  );

  server.tool(
    'crew_group_message',
    'Send a message to a chat group.',
    {
      group: z.string().describe('Group name'),
      content: z.string().describe('Message content'),
    },
    async (params) => executeCommand('GROUP_MESSAGE', params),
  );

  server.tool(
    'crew_add_to_group',
    'Add members to an existing chat group.',
    {
      group: z.string().describe('Group name'),
      members: z.array(z.string()).describe('Array of agent IDs to add'),
    },
    async (params) => executeCommand('ADD_TO_GROUP', params),
  );

  server.tool(
    'crew_remove_from_group',
    'Remove members from a chat group.',
    {
      group: z.string().describe('Group name'),
      members: z.array(z.string()).describe('Array of agent IDs to remove'),
    },
    async (params) => executeCommand('REMOVE_FROM_GROUP', params),
  );

  server.tool(
    'crew_query_groups',
    'List all chat groups you are a member of.',
    {},
    async () => executeCommand('QUERY_GROUPS', {}),
  );

  server.tool(
    'crew_direct_message',
    'Send a direct peer-to-peer message to another agent (queued, non-interrupting).',
    {
      to: z.string().describe('Target agent ID or prefix'),
      content: z.string().describe('Message content'),
    },
    async (params) => executeCommand('DIRECT_MESSAGE', params),
  );

  server.tool(
    'crew_query_peers',
    'List active peer agents under the same lead.',
    {},
    async () => executeCommand('QUERY_PEERS', {}),
  );

  // Tasks & Progress

  server.tool(
    'crew_declare_tasks',
    'Declare a task DAG (directed acyclic graph). Lead only.',
    {
      tasks: z.array(z.object({
        id: z.string().describe('Unique task identifier'),
        title: z.string().describe('Task title/description'),
        depends_on: z.array(z.string()).optional().describe('Task IDs this depends on'),
        role: z.string().optional().describe('Role to assign this task to'),
        assignee: z.string().optional().describe('Specific agent ID to assign to'),
      })).describe('Array of task definitions'),
    },
    async (params) => executeCommand('DECLARE_TASKS', params),
  );

  server.tool(
    'crew_progress',
    'Report progress on the current project. Lead only.',
    {
      summary: z.string().describe('Progress summary'),
      completed: z.array(z.string()).optional().describe('Completed items'),
      in_progress: z.array(z.string()).optional().describe('Items in progress'),
      blocked: z.array(z.string()).optional().describe('Blocked items'),
    },
    async (params) => executeCommand('PROGRESS', params),
  );

  server.tool(
    'crew_complete_task',
    'Report task completion with a summary. Any agent can use this.',
    {
      summary: z.string().describe('Completion summary'),
    },
    async (params) => {
      // COMPLETE_TASK is not a separate command — it's communicated via
      // the agent going idle. For now, treat it as a PROGRESS update.
      return executeCommand('PROGRESS', { summary: `COMPLETED: ${params.summary}` });
    },
  );

  server.tool(
    'crew_decision',
    'Record an architectural or design decision.',
    {
      title: z.string().describe('Decision title'),
      rationale: z.string().describe('Rationale for the decision'),
      needsConfirmation: z.boolean().optional().describe('Whether this needs human confirmation'),
    },
    async (params) => executeCommand('DECISION', params),
  );

  server.tool(
    'crew_query_tasks',
    'Query the current task DAG status.',
    {},
    async () => executeCommand('QUERY_TASKS', {}),
  );

  server.tool(
    'crew_add_task',
    'Add a single task to the DAG. Lead only.',
    {
      id: z.string().describe('Unique task identifier'),
      title: z.string().describe('Task title/description'),
      depends_on: z.array(z.string()).optional().describe('Task IDs this depends on'),
      role: z.string().optional().describe('Role to assign this task to'),
    },
    async (params) => executeCommand('ADD_TASK', params),
  );

  server.tool(
    'crew_cancel_task',
    'Cancel a task in the DAG. Lead only.',
    {
      id: z.string().describe('Task ID to cancel'),
    },
    async (params) => executeCommand('CANCEL_TASK', params),
  );

  server.tool(
    'crew_pause_task',
    'Pause a task in the DAG. Lead only.',
    {
      id: z.string().describe('Task ID to pause'),
    },
    async (params) => executeCommand('PAUSE_TASK', params),
  );

  server.tool(
    'crew_retry_task',
    'Retry a failed task in the DAG. Lead only.',
    {
      id: z.string().describe('Task ID to retry'),
    },
    async (params) => executeCommand('RETRY_TASK', params),
  );

  server.tool(
    'crew_skip_task',
    'Skip a task in the DAG. Lead only.',
    {
      id: z.string().describe('Task ID to skip'),
    },
    async (params) => executeCommand('SKIP_TASK', params),
  );

  server.tool(
    'crew_reset_dag',
    'Reset the entire task DAG. Lead only.',
    {},
    async () => executeCommand('RESET_DAG', {}),
  );

  // Coordination (all agents)

  server.tool(
    'crew_lock_file',
    'Acquire a file lock to prevent conflicts with other agents.',
    {
      filePath: z.string().describe('Path to the file to lock'),
      reason: z.string().optional().describe('Reason for locking'),
    },
    async (params) => executeCommand('LOCK_FILE', params),
  );

  server.tool(
    'crew_unlock_file',
    'Release a file lock.',
    {
      filePath: z.string().describe('Path to the file to unlock'),
    },
    async (params) => executeCommand('UNLOCK_FILE', params),
  );

  server.tool(
    'crew_commit',
    'Prepare a scoped git commit from your locked files.',
    {
      message: z.string().describe('Commit message'),
      files: z.array(z.string()).optional().describe('Specific files to commit (defaults to locked files)'),
    },
    async (params) => executeCommand('COMMIT', params),
  );

  server.tool(
    'crew_query_crew',
    'Query the current crew roster and status.',
    {},
    async () => executeCommand('QUERY_CREW', {}),
  );

  server.tool(
    'crew_defer_issue',
    'Defer an issue for later resolution.',
    {
      description: z.string().describe('Issue description'),
      severity: z.string().optional().describe('Severity level (e.g., "P1", "P2")'),
      sourceFile: z.string().optional().describe('Source file related to the issue'),
    },
    async (params) => executeCommand('DEFER_ISSUE', params),
  );

  server.tool(
    'crew_query_deferred',
    'Query deferred issues.',
    {
      status: z.string().optional().describe('Filter by status: "open", "resolved", or "dismissed"'),
    },
    async (params) => executeCommand('QUERY_DEFERRED', params),
  );

  server.tool(
    'crew_resolve_deferred',
    'Resolve or dismiss a deferred issue.',
    {
      id: z.number().describe('Issue ID to resolve'),
      dismiss: z.boolean().optional().describe('If true, dismiss instead of resolving'),
    },
    async (params) => executeCommand('RESOLVE_DEFERRED', params),
  );

  // Timers

  server.tool(
    'crew_set_timer',
    'Set a reminder timer that fires after a delay.',
    {
      label: z.string().optional().describe('Timer label/name'),
      delay: z.number().describe('Delay in seconds (5–86400)'),
      message: z.string().optional().describe('Reminder message text'),
      repeat: z.boolean().optional().describe('Whether the timer repeats'),
    },
    async (params) => executeCommand('SET_TIMER', params),
  );

  server.tool(
    'crew_cancel_timer',
    'Cancel an active timer.',
    {
      id: z.string().optional().describe('Timer ID'),
      name: z.string().optional().describe('Timer label/name'),
    },
    async (params) => executeCommand('CANCEL_TIMER', params),
  );

  server.tool(
    'crew_list_timers',
    'List all active timers.',
    {},
    async () => executeCommand('LIST_TIMERS', {}),
  );

  // System

  server.tool(
    'crew_halt_heartbeat',
    'Pause heartbeat nudges. Lead only.',
    {},
    async () => executeCommand('HALT_HEARTBEAT', {}),
  );

  server.tool(
    'crew_request_limit_change',
    'Request a change to the agent concurrency limit. Lead only.',
    {
      limit: z.number().describe('New concurrency limit (1–100)'),
      reason: z.string().optional().describe('Reason for the change'),
    },
    async (params) => executeCommand('REQUEST_LIMIT_CHANGE', params),
  );

  server.tool(
    'crew_export_session',
    'Export the current session data. Lead/secretary only.',
    {},
    async () => executeCommand('EXPORT_SESSION', {}),
  );

  // Capabilities

  server.tool(
    'crew_acquire_capability',
    'Acquire an additional capability beyond your core role.',
    {
      capability: z.string().describe('Capability ID (e.g., "code-review", "architecture")'),
      reason: z.string().optional().describe('Reason for acquiring'),
    },
    async (params) => executeCommand('ACQUIRE_CAPABILITY', params),
  );

  server.tool(
    'crew_list_capabilities',
    'List all available capabilities and your current ones.',
    {},
    async () => executeCommand('LIST_CAPABILITIES', {}),
  );

  server.tool(
    'crew_release_capability',
    'Release an acquired capability.',
    {},
    async () => executeCommand('RELEASE_CAPABILITY', {}),
  );

  // Templates

  server.tool(
    'crew_list_templates',
    'List all available task workflow templates.',
    {},
    async () => executeCommand('LIST_TEMPLATES', {}),
  );

  server.tool(
    'crew_apply_template',
    'Apply a task workflow template to create a DAG. Lead only.',
    {
      template: z.string().describe('Template ID to apply'),
      overrides: z.record(z.string(), z.any()).optional().describe('Override values for template tasks'),
    },
    async (params) => executeCommand('APPLY_TEMPLATE', params),
  );

  server.tool(
    'crew_decompose_task',
    'Decompose a task description into suggested sub-tasks.',
    {
      task: z.string().describe('Task description to decompose'),
    },
    async (params) => executeCommand('DECOMPOSE_TASK', params),
  );

  return server;
}
