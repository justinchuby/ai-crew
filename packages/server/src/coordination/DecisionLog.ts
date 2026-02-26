import { EventEmitter } from 'events';

export interface Decision {
  id: string;
  agentId: string;
  agentRole: string;
  title: string;
  rationale: string;
  timestamp: string;
}

export class DecisionLog extends EventEmitter {
  private decisions: Decision[] = [];

  add(agentId: string, agentRole: string, title: string, rationale: string): Decision {
    const decision: Decision = {
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      agentRole,
      title,
      rationale,
      timestamp: new Date().toISOString(),
    };
    this.decisions.push(decision);
    this.emit('decision', decision);
    return decision;
  }

  getAll(): Decision[] {
    return [...this.decisions];
  }

  getByAgent(agentId: string): Decision[] {
    return this.decisions.filter((d) => d.agentId === agentId);
  }

  getByAgents(agentIds: string[]): Decision[] {
    const idSet = new Set(agentIds);
    return this.decisions.filter((d) => idSet.has(d.agentId));
  }

  clear(): void {
    this.decisions.length = 0;
  }
}
