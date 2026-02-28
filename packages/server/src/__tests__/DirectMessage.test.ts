import { describe, it, expect, vi } from 'vitest';
import { getDirectMessageCommands } from '../agents/commands/DirectMessageCommands.js';
import type { CommandHandlerContext } from '../agents/commands/types.js';

// ── Test helpers ──────────────────────────────────────────────────────

function makeAgent(overrides: Record<string, any> = {}) {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000000',
    parentId: 'lead-0000-0000-0000-000000000000' as string | undefined,
    role: { id: 'developer', name: 'Developer' },
    status: 'running',
    task: 'Implement feature X',
    sendMessage: vi.fn(),
    queueMessage: vi.fn(),
    ...overrides,
  } as any;
}

function makeTarget(overrides: Record<string, any> = {}) {
  return makeAgent({
    id: 'bbbbbbbb-0000-0000-0000-000000000000',
    role: { id: 'code-reviewer', name: 'Code Reviewer' },
    status: 'idle',
    task: 'Awaiting review',
    ...overrides,
  });
}

function makeCtx(agents: any[], overrides: Record<string, any> = {}): CommandHandlerContext {
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  return {
    getAgent: (id: string) => agentMap.get(id),
    getAllAgents: () => agents,
    activityLedger: { log: vi.fn() },
    delegations: new Map(),
    reportedCompletions: new Set(),
    pendingSystemActions: new Map(),
    ...overrides,
  } as any;
}

// ── DIRECT_MESSAGE tests ──────────────────────────────────────────────

describe('DIRECT_MESSAGE', () => {
  it('sends message to target agent', () => {
    const sender = makeAgent();
    const target = makeTarget();
    const ctx = makeCtx([sender, target]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "${target.id}", "content": "Hello peer!"} ]]]`);

    expect(target.queueMessage).toHaveBeenCalledWith(
      expect.stringContaining('Hello peer!'),
    );
    expect(target.queueMessage).toHaveBeenCalledWith(
      expect.stringContaining('Developer'),
    );
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('✉️'),
    );
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Code Reviewer'),
    );
  });

  it('allows short ID prefix matching', () => {
    const sender = makeAgent();
    const target = makeTarget(); // id starts with 'bbbbbbbb'
    const ctx = makeCtx([sender, target]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    // Use just first 8 chars as prefix
    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "bbbbbbbb", "content": "Hey"} ]]]`);

    expect(target.queueMessage).toHaveBeenCalledWith(expect.stringContaining('Hey'));
  });

  it('rejects message to non-existent agent', () => {
    const sender = makeAgent();
    const ctx = makeCtx([sender]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "no-such-agent", "content": "Hello"} ]]]`);

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('QUERY_PEERS'),
    );
  });

  it('rejects message to terminated agent', () => {
    const sender = makeAgent();
    const target = makeTarget({ status: 'terminated' });
    const ctx = makeCtx([sender, target]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "${target.id}", "content": "Hello"} ]]]`);

    expect(target.queueMessage).not.toHaveBeenCalled();
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('terminated'),
    );
  });

  it('rejects message to completed agent', () => {
    const sender = makeAgent();
    const target = makeTarget({ status: 'completed' });
    const ctx = makeCtx([sender, target]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "${target.id}", "content": "Hello"} ]]]`);

    expect(target.queueMessage).not.toHaveBeenCalled();
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('completed'),
    );
  });

  it('rejects message missing "to" field', () => {
    const sender = makeAgent();
    const ctx = makeCtx([sender]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"content": "Oops no target"} ]]]`);

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('requires'),
    );
  });

  it('logs communication to activity ledger', () => {
    const sender = makeAgent();
    const target = makeTarget();
    const ctx = makeCtx([sender, target]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {"to": "${target.id}", "content": "Logging test"} ]]]`);

    expect(ctx.activityLedger.log).toHaveBeenCalledWith(
      sender.id,
      sender.role.id,
      'message_sent',
      expect.stringContaining('Logging test'),
      expect.objectContaining({ type: 'direct_message', targetId: target.id }),
    );
  });

  it('handles malformed JSON gracefully', () => {
    const sender = makeAgent();
    const ctx = makeCtx([sender]);
    const [dmCmd] = getDirectMessageCommands(ctx);

    dmCmd.handler(sender, `[[[ DIRECT_MESSAGE {not valid json} ]]]`);

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('DIRECT_MESSAGE error'),
    );
  });
});

// ── QUERY_PEERS tests ─────────────────────────────────────────────────

describe('QUERY_PEERS', () => {
  it('shows sibling agents under the same lead', () => {
    const leadId = 'lead-0000-0000-0000-000000000000';
    const sender = makeAgent({ parentId: leadId });
    const sibling = makeTarget({ parentId: leadId, status: 'running' });
    const ctx = makeCtx([sender, sibling]);
    const [, queryCmd] = getDirectMessageCommands(ctx);

    queryCmd.handler(sender, '[[[ QUERY_PEERS ]]]');

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Code Reviewer'),
    );
    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('DIRECT_MESSAGE'),
    );
  });

  it('excludes terminated agents', () => {
    const leadId = 'lead-0000-0000-0000-000000000000';
    const sender = makeAgent({ parentId: leadId });
    const terminated = makeTarget({ parentId: leadId, status: 'terminated' });
    const ctx = makeCtx([sender, terminated]);
    const [, queryCmd] = getDirectMessageCommands(ctx);

    queryCmd.handler(sender, '[[[ QUERY_PEERS ]]]');

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active peers'),
    );
  });

  it('excludes self', () => {
    const leadId = 'lead-0000-0000-0000-000000000000';
    const sender = makeAgent({ parentId: leadId });
    const ctx = makeCtx([sender]); // Only the sender in the list
    const [, queryCmd] = getDirectMessageCommands(ctx);

    queryCmd.handler(sender, '[[[ QUERY_PEERS ]]]');

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('No active peers'),
    );
  });

  it('includes the parent lead as a peer', () => {
    const lead = makeAgent({
      id: 'lead-0000-0000-0000-000000000000',
      parentId: undefined,
      role: { id: 'lead', name: 'Project Lead' },
      status: 'running',
    });
    const sender = makeAgent({ parentId: lead.id });
    const ctx = makeCtx([lead, sender]);
    const [, queryCmd] = getDirectMessageCommands(ctx);

    queryCmd.handler(sender, '[[[ QUERY_PEERS ]]]');

    expect(sender.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Project Lead'),
    );
  });

  it('shows status icons for running and idle agents', () => {
    const leadId = 'lead-0000-0000-0000-000000000000';
    const sender = makeAgent({ parentId: leadId });
    const runningPeer = makeTarget({ parentId: leadId, status: 'running' });
    const idlePeer = makeAgent({
      id: 'cccccccc-0000-0000-0000-000000000000',
      parentId: leadId,
      role: { id: 'architect', name: 'Architect' },
      status: 'idle',
    });
    const ctx = makeCtx([sender, runningPeer, idlePeer]);
    const [, queryCmd] = getDirectMessageCommands(ctx);

    queryCmd.handler(sender, '[[[ QUERY_PEERS ]]]');

    const call = (sender.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(call).toContain('🟢');
    expect(call).toContain('🟡');
  });
});

// ── Command registration tests ────────────────────────────────────────

describe('getDirectMessageCommands', () => {
  it('registers exactly two commands', () => {
    const ctx = makeCtx([]);
    const cmds = getDirectMessageCommands(ctx);
    expect(cmds).toHaveLength(2);
    expect(cmds[0].name).toBe('DIRECT_MESSAGE');
    expect(cmds[1].name).toBe('QUERY_PEERS');
  });

  it('DIRECT_MESSAGE regex matches expected patterns', () => {
    const ctx = makeCtx([]);
    const [dmCmd] = getDirectMessageCommands(ctx);
    expect(dmCmd.regex.test('[[[ DIRECT_MESSAGE {"to":"x","content":"y"} ]]]')).toBe(true);
    expect(dmCmd.regex.test('[[[DIRECT_MESSAGE{"to":"x","content":"y"}]]]')).toBe(true);
  });

  it('QUERY_PEERS regex matches expected patterns', () => {
    const ctx = makeCtx([]);
    const [, queryCmd] = getDirectMessageCommands(ctx);
    expect(queryCmd.regex.test('[[[ QUERY_PEERS ]]]')).toBe(true);
    expect(queryCmd.regex.test('[[[QUERY_PEERS]]]')).toBe(true);
  });
});
