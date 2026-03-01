import { describe, it, expect, beforeEach } from 'vitest';
import { useGroupStore, groupKey } from '../groupStore';
import type { GroupMessage } from '../../types';

const KEY = groupKey('lead-1', 'test-group');

function makeMsg(overrides: Partial<GroupMessage> = {}): GroupMessage {
  return {
    id: 'msg-1',
    groupName: 'test-group',
    leadId: 'lead-1',
    fromAgentId: 'agent-a',
    fromRole: 'Developer',
    content: 'hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function resetStore() {
  useGroupStore.setState({
    groups: [],
    messages: {},
    selectedGroup: null,
    lastSeenTimestamps: {},
  });
}

describe('groupStore reactions', () => {
  beforeEach(resetStore);

  it('addReaction adds an emoji reaction to a message', () => {
    const msg = makeMsg();
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().addReaction(KEY, 'msg-1', '👍', 'agent-a');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions).toEqual({ '👍': ['agent-a'] });
  });

  it('addReaction appends to existing emoji reactions', () => {
    const msg = makeMsg({ reactions: { '👍': ['agent-a'] } });
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().addReaction(KEY, 'msg-1', '👍', 'agent-b');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions?.['👍']).toEqual(['agent-a', 'agent-b']);
  });

  it('addReaction deduplicates same agent on same emoji', () => {
    const msg = makeMsg({ reactions: { '👍': ['agent-a'] } });
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().addReaction(KEY, 'msg-1', '👍', 'agent-a');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions?.['👍']).toEqual(['agent-a']);
  });

  it('addReaction supports multiple emojis on same message', () => {
    const msg = makeMsg();
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().addReaction(KEY, 'msg-1', '👍', 'agent-a');
    useGroupStore.getState().addReaction(KEY, 'msg-1', '🎉', 'agent-b');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions).toEqual({ '👍': ['agent-a'], '🎉': ['agent-b'] });
  });

  it('removeReaction removes an agent from an emoji', () => {
    const msg = makeMsg({ reactions: { '👍': ['agent-a', 'agent-b'] } });
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().removeReaction(KEY, 'msg-1', '👍', 'agent-a');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions?.['👍']).toEqual(['agent-b']);
  });

  it('removeReaction cleans up empty emoji entries', () => {
    const msg = makeMsg({ reactions: { '👍': ['agent-a'], '🎉': ['agent-b'] } });
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().removeReaction(KEY, 'msg-1', '👍', 'agent-a');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions?.['👍']).toBeUndefined();
    expect(updated.reactions?.['🎉']).toEqual(['agent-b']);
  });

  it('removeReaction is a no-op for non-existent agent', () => {
    const msg = makeMsg({ reactions: { '👍': ['agent-a'] } });
    useGroupStore.getState().setMessages(KEY, [msg]);

    useGroupStore.getState().removeReaction(KEY, 'msg-1', '👍', 'agent-x');

    const updated = useGroupStore.getState().messages[KEY][0];
    expect(updated.reactions?.['👍']).toEqual(['agent-a']);
  });

  it('addReaction only affects the targeted message', () => {
    const msg1 = makeMsg({ id: 'msg-1' });
    const msg2 = makeMsg({ id: 'msg-2' });
    useGroupStore.getState().setMessages(KEY, [msg1, msg2]);

    useGroupStore.getState().addReaction(KEY, 'msg-1', '👍', 'agent-a');

    const msgs = useGroupStore.getState().messages[KEY];
    expect(msgs[0].reactions).toEqual({ '👍': ['agent-a'] });
    expect(msgs[1].reactions).toBeUndefined();
  });
});
