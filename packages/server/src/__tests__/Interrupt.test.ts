import { describe, it, expect, vi } from 'vitest';
import { getCommCommands } from '../agents/commands/CommCommands.js';
import type { CommandHandlerContext } from '../agents/commands/types.js';

function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'lead-001',
    parentId: undefined,
    role: { id: 'lead', name: 'Project Lead' },
    status: 'running',
    sendMessage: vi.fn(),
    interruptWithMessage: vi.fn(),
    ...overrides,
  } as any;
}

function makeCtx(overrides: Record<string, any> = {}): CommandHandlerContext {
  return {
    getAgent: vi.fn(),
    getAllAgents: vi.fn().mockReturnValue([]),
    getProjectIdForAgent: vi.fn().mockReturnValue(undefined),
    emit: vi.fn(),
    activityLedger: { log: vi.fn() },
    messageBus: { send: vi.fn() },
    chatGroupRegistry: { getGroupsForAgent: vi.fn().mockReturnValue([]) },
    ...overrides,
  } as any;
}

function findInterruptHandler(ctx: CommandHandlerContext) {
  const commands = getCommCommands(ctx);
  return commands.find(c => c.name === 'INTERRUPT')!;
}

describe('INTERRUPT command', () => {
  it('happy path: lead interrupts child agent', async () => {
    const child = makeAgent({
      id: 'child-001',
      parentId: 'lead-001',
      role: { id: 'developer', name: 'Developer' },
      status: 'running',
    });
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'child-001' ? child : null),
      getAllAgents: vi.fn().mockReturnValue([child]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "child-001", "content": "Switch to task X now"} ⟧⟧');

    expect(child.interruptWithMessage).toHaveBeenCalledTimes(1);
    const msg = child.interruptWithMessage.mock.calls[0][0];
    expect(msg).toContain('Switch to task X now');
    expect(msg).toContain('PRIORITY');
    expect(msg).toContain('Project Lead');
    expect(lead.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Interrupted Developer'));
    expect(ctx.activityLedger.log).toHaveBeenCalledWith(
      'lead-001', 'lead', 'agent_interrupted',
      expect.stringContaining('Switch to task X'),
      expect.objectContaining({ toAgentId: 'child-001' }),
    );
    expect(ctx.emit).toHaveBeenCalledWith('agent:interrupted', expect.objectContaining({
      from: 'lead-001', to: 'child-001',
    }));
  });

  it('rejects non-parent interrupt', async () => {
    const child = makeAgent({
      id: 'child-001',
      parentId: 'other-lead',
      role: { id: 'developer', name: 'Developer' },
      status: 'running',
    });
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'child-001' ? child : null),
      getAllAgents: vi.fn().mockReturnValue([child]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "child-001", "content": "do something"} ⟧⟧');

    expect(child.interruptWithMessage).not.toHaveBeenCalled();
    expect(lead.sendMessage).toHaveBeenCalledWith(expect.stringContaining('not their parent'));
  });

  it('rejects self-interrupt', async () => {
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'lead-001' ? lead : null),
      getAllAgents: vi.fn().mockReturnValue([lead]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "lead-001", "content": "self"} ⟧⟧');

    expect(lead.interruptWithMessage).not.toHaveBeenCalled();
    expect(lead.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Cannot interrupt yourself'));
  });

  it('rejects interrupt of terminated agent', async () => {
    const child = makeAgent({
      id: 'child-001',
      parentId: 'lead-001',
      role: { id: 'developer', name: 'Developer' },
      status: 'terminated',
    });
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'child-001' ? child : null),
      getAllAgents: vi.fn().mockReturnValue([child]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "child-001", "content": "wake up"} ⟧⟧');

    expect(child.interruptWithMessage).not.toHaveBeenCalled();
    expect(lead.sendMessage).toHaveBeenCalledWith(expect.stringContaining('terminated'));
  });

  it('returns error for unresolvable target', async () => {
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn().mockReturnValue(null),
      getAllAgents: vi.fn().mockReturnValue([]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "nonexistent", "content": "hello"} ⟧⟧');

    expect(lead.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve agent'));
  });

  it('resolves target by ID prefix', async () => {
    const child = makeAgent({
      id: 'child-001-full-uuid',
      parentId: 'lead-001',
      role: { id: 'developer', name: 'Developer' },
      status: 'running',
    });
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'child-001-full-uuid' ? child : null),
      getAllAgents: vi.fn().mockReturnValue([child]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "child-001", "content": "switch tasks"} ⟧⟧');

    expect(child.interruptWithMessage).toHaveBeenCalledTimes(1);
  });

  it('resolves target by role name', async () => {
    const child = makeAgent({
      id: 'child-001',
      parentId: 'lead-001',
      role: { id: 'developer', name: 'Developer' },
      status: 'idle',
    });
    const lead = makeAgent({ id: 'lead-001' });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'child-001' ? child : null),
      getAllAgents: vi.fn().mockReturnValue([child]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(lead, '⟦⟦ INTERRUPT {"to": "Developer", "content": "new priority"} ⟧⟧');

    expect(child.interruptWithMessage).toHaveBeenCalledTimes(1);
  });

  it('sub-lead can interrupt their own child', async () => {
    const grandchild = makeAgent({
      id: 'grandchild-001',
      parentId: 'sublead-001',
      role: { id: 'developer', name: 'Developer' },
      status: 'running',
    });
    const sublead = makeAgent({
      id: 'sublead-001',
      parentId: 'lead-001',
      role: { id: 'lead', name: 'Sub-Lead' },
    });
    const ctx = makeCtx({
      getAgent: vi.fn((id: string) => id === 'grandchild-001' ? grandchild : null),
      getAllAgents: vi.fn().mockReturnValue([grandchild]),
    });

    const { handler } = findInterruptHandler(ctx);
    await handler(sublead, '⟦⟦ INTERRUPT {"to": "grandchild-001", "content": "redirect"} ⟧⟧');

    expect(grandchild.interruptWithMessage).toHaveBeenCalledTimes(1);
  });
});
