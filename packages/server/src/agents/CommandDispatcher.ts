/**
 * CommandDispatcher — Holds the CommandHandlerContext and delegates
 * public API calls to command modules.
 *
 * Previously this also owned regex-based buffer scanning for [[[ COMMAND ]]]
 * patterns. That has been removed — commands now arrive via MCP tool calls
 * (see CrewMcpServer.ts). This class remains as the owner of the shared
 * handler context and the public API surface that AgentManager uses.
 */
import type { Agent } from './Agent.js';
import type { CommandContext, CommandHandlerContext, Delegation } from './commands/types.js';
import {
  notifyParentOfIdle as _notifyParentOfIdle,
  notifyParentOfCompletion as _notifyParentOfCompletion,
  getDelegations as _getDelegations,
  completeDelegationsForAgent as _completeDelegationsForAgent,
  cleanupStaleDelegations as _cleanupStaleDelegations,
  clearCompletionTracking as _clearCompletionTracking,
} from './commands/AgentCommands.js';

// Re-export types for backward compatibility (AgentManager, HeartbeatMonitor import from here)
export type { Delegation, CommandContext } from './commands/types.js';

// ── CommandDispatcher ────────────────────────────────────────────────

export class CommandDispatcher {
  private handlerCtx: CommandHandlerContext;

  constructor(ctx: CommandContext) {
    // Build the extended handler context with shared mutable state
    const delegations = new Map<string, Delegation>();
    const reportedCompletions = new Set<string>();
    const pendingSystemActions = new Map<string, { type: string; value: number; agentId: string }>();

    this.handlerCtx = Object.assign(Object.create(null), ctx, {
      delegations,
      reportedCompletions,
      pendingSystemActions,
    }) as CommandHandlerContext;

    // Proxy mutable properties so modules see live values
    Object.defineProperty(this.handlerCtx, 'maxConcurrent', {
      get: () => ctx.maxConcurrent,
      set: (v: number) => { ctx.maxConcurrent = v; },
    });
  }

  // ── Public API (delegates to command modules) ──────────────────────

  notifyParentOfIdle(agent: Agent): void {
    _notifyParentOfIdle(this.handlerCtx, agent);
  }

  notifyParentOfCompletion(agent: Agent, exitCode: number | null): void {
    _notifyParentOfCompletion(this.handlerCtx, agent, exitCode);
  }

  getDelegations(parentId?: string): Delegation[] {
    return _getDelegations(this.handlerCtx, parentId);
  }

  getDelegationsMap(): Map<string, Delegation> {
    return this.handlerCtx.delegations;
  }

  clearCompletionTracking(agentId: string): void {
    _clearCompletionTracking(this.handlerCtx, agentId);
  }

  completeDelegationsForAgent(agentId: string): void {
    _completeDelegationsForAgent(this.handlerCtx, agentId);
  }

  cleanupStaleDelegations(maxAgeMs = 300_000): number {
    return _cleanupStaleDelegations(this.handlerCtx, maxAgeMs);
  }

  consumePendingSystemAction(decisionId: string): { type: string; value: number; agentId: string } | undefined {
    const action = this.handlerCtx.pendingSystemActions.get(decisionId);
    if (action) this.handlerCtx.pendingSystemActions.delete(decisionId);
    return action;
  }

  /** Late-bind sessionExporter (created after AgentManager due to circular dep) */
  setSessionExporter(exporter: import('../coordination/SessionExporter.js').SessionExporter): void {
    this.handlerCtx.sessionExporter = exporter;
  }

  /** Expose the handler context so the MCP SSE routes can share it */
  getHandlerContext(): CommandHandlerContext {
    return this.handlerCtx;
  }
}
