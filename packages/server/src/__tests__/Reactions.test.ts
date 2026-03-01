import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../db/database.js';
import { ChatGroupRegistry } from '../comms/ChatGroupRegistry.js';

const TEST_DB = ':memory:';

describe('ChatGroupRegistry reactions', () => {
  let db: Database;
  let registry: ChatGroupRegistry;

  beforeEach(() => {
    db = new Database(TEST_DB);
    registry = new ChatGroupRegistry(db);
    registry.create('lead-1', 'test-group', ['agent-a', 'agent-b']);
  });

  afterEach(() => {
    db.close();
  });

  function sendTestMessage(content = 'hello world'): string {
    const msg = registry.sendMessage('test-group', 'lead-1', 'agent-a', 'Developer', content);
    return msg!.id;
  }

  // ── addReaction ──────────────────────────────────────────────────────

  describe('addReaction', () => {
    it('adds a reaction to a message', () => {
      const msgId = sendTestMessage();
      const result = registry.addReaction(msgId, 'agent-a', '👍');
      expect(result).toBe(true);

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions).toEqual({ '👍': ['agent-a'] });
    });

    it('supports multiple agents reacting with the same emoji', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');
      registry.addReaction(msgId, 'agent-b', '👍');

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions['👍']).toEqual(['agent-a', 'agent-b']);
    });

    it('supports multiple emoji types on the same message', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');
      registry.addReaction(msgId, 'agent-a', '🎉');

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions).toEqual({ '👍': ['agent-a'], '🎉': ['agent-a'] });
    });

    it('returns false if agent already reacted with same emoji', () => {
      const msgId = sendTestMessage();
      expect(registry.addReaction(msgId, 'agent-a', '👍')).toBe(true);
      expect(registry.addReaction(msgId, 'agent-a', '👍')).toBe(false);
    });

    it('returns false for non-existent message', () => {
      expect(registry.addReaction('fake-id', 'agent-a', '👍')).toBe(false);
    });

    it('emits group:reaction event on add', () => {
      const msgId = sendTestMessage();
      const events: any[] = [];
      registry.on('group:reaction', (data) => events.push(data));

      registry.addReaction(msgId, 'agent-a', '👍');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        messageId: msgId,
        groupName: 'test-group',
        leadId: 'lead-1',
        agentId: 'agent-a',
        emoji: '👍',
        action: 'add',
      });
    });

    it('does not emit event on duplicate reaction', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');

      const events: any[] = [];
      registry.on('group:reaction', (data) => events.push(data));
      registry.addReaction(msgId, 'agent-a', '👍'); // duplicate

      expect(events).toHaveLength(0);
    });
  });

  // ── removeReaction ───────────────────────────────────────────────────

  describe('removeReaction', () => {
    it('removes a reaction from a message', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');
      const result = registry.removeReaction(msgId, 'agent-a', '👍');
      expect(result).toBe(true);

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions).toEqual({});
    });

    it('returns false if agent has not reacted with that emoji', () => {
      const msgId = sendTestMessage();
      expect(registry.removeReaction(msgId, 'agent-a', '👍')).toBe(false);
    });

    it('returns false for non-existent message', () => {
      expect(registry.removeReaction('fake-id', 'agent-a', '👍')).toBe(false);
    });

    it('preserves other agents reactions when removing one', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');
      registry.addReaction(msgId, 'agent-b', '👍');
      registry.removeReaction(msgId, 'agent-a', '👍');

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions['👍']).toEqual(['agent-b']);
    });

    it('cleans up empty emoji arrays', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');
      registry.removeReaction(msgId, 'agent-a', '👍');

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      // The '👍' key should be deleted, not an empty array
      expect(msg?.reactions).toEqual({});
      expect(msg?.reactions['👍']).toBeUndefined();
    });

    it('emits group:reaction event on remove', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '👍');

      const events: any[] = [];
      registry.on('group:reaction', (data) => events.push(data));
      registry.removeReaction(msgId, 'agent-a', '👍');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        messageId: msgId,
        action: 'remove',
        emoji: '👍',
        agentId: 'agent-a',
      });
    });
  });

  // ── getMessages includes reactions ───────────────────────────────────

  describe('getMessages with reactions', () => {
    it('returns empty reactions object for messages with no reactions', () => {
      sendTestMessage();
      const messages = registry.getMessages('test-group', 'lead-1');
      expect(messages[0].reactions).toEqual({});
    });

    it('returns reactions in getMessages response', () => {
      const msgId = sendTestMessage();
      registry.addReaction(msgId, 'agent-a', '🎉');
      registry.addReaction(msgId, 'agent-b', '🎉');
      registry.addReaction(msgId, 'agent-a', '❤️');

      const messages = registry.getMessages('test-group', 'lead-1');
      const msg = messages.find((m) => m.id === msgId);
      expect(msg?.reactions).toEqual({
        '🎉': ['agent-a', 'agent-b'],
        '❤️': ['agent-a'],
      });
    });

    it('new messages have reactions field in interface', () => {
      const msg = registry.sendMessage('test-group', 'lead-1', 'agent-a', 'Developer', 'test');
      expect(msg).toBeTruthy();
      expect(msg!.reactions).toEqual({});
    });
  });
});
