import { EventEmitter } from 'events';
import type { Database } from '../db/database.js';

export interface ChatGroup {
  name: string;
  leadId: string;
  memberIds: string[];
  createdAt: string;
}

export interface GroupMessage {
  id: string;
  groupName: string;
  leadId: string;
  fromAgentId: string;
  fromRole: string;
  content: string;
  timestamp: string;
}

export class ChatGroupRegistry extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
  }

  create(leadId: string, name: string, memberIds: string[]): ChatGroup {
    // Ensure lead is always a member
    const allMembers = new Set([leadId, ...memberIds]);

    this.db.run(
      'INSERT OR IGNORE INTO chat_groups (name, lead_id) VALUES (?, ?)',
      [name, leadId],
    );

    for (const memberId of allMembers) {
      this.db.run(
        'INSERT OR IGNORE INTO chat_group_members (group_name, lead_id, agent_id) VALUES (?, ?, ?)',
        [name, leadId, memberId],
      );
    }

    const group: ChatGroup = {
      name,
      leadId,
      memberIds: Array.from(allMembers),
      createdAt: new Date().toISOString(),
    };
    this.emit('group:created', group);
    return group;
  }

  addMembers(leadId: string, name: string, memberIds: string[]): string[] {
    const added: string[] = [];
    for (const memberId of memberIds) {
      const existing = this.db.get<any>(
        'SELECT 1 FROM chat_group_members WHERE group_name = ? AND lead_id = ? AND agent_id = ?',
        [name, leadId, memberId],
      );
      if (!existing) {
        this.db.run(
          'INSERT INTO chat_group_members (group_name, lead_id, agent_id) VALUES (?, ?, ?)',
          [name, leadId, memberId],
        );
        added.push(memberId);
        this.emit('group:member_added', { group: name, leadId, agentId: memberId });
      }
    }
    return added;
  }

  removeMembers(leadId: string, name: string, memberIds: string[]): string[] {
    const removed: string[] = [];
    for (const memberId of memberIds) {
      // Don't allow removing the lead
      if (memberId === leadId) continue;
      const result = this.db.run(
        'DELETE FROM chat_group_members WHERE group_name = ? AND lead_id = ? AND agent_id = ?',
        [name, leadId, memberId],
      );
      if (result.changes > 0) {
        removed.push(memberId);
        this.emit('group:member_removed', { group: name, leadId, agentId: memberId });
      }
    }
    return removed;
  }

  sendMessage(groupName: string, leadId: string, fromId: string, fromRole: string, content: string): GroupMessage | null {
    // Check membership
    const isMember = this.db.get<any>(
      'SELECT 1 FROM chat_group_members WHERE group_name = ? AND lead_id = ? AND agent_id = ?',
      [groupName, leadId, fromId],
    );
    if (!isMember) return null;

    const id = `gmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.run(
      'INSERT INTO chat_group_messages (id, group_name, lead_id, from_agent_id, from_role, content, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, groupName, leadId, fromId, fromRole, content, timestamp],
    );

    const message: GroupMessage = { id, groupName, leadId, fromAgentId: fromId, fromRole, content, timestamp };

    // Get recipient IDs (all members except sender)
    const recipients = this.getMembers(groupName, leadId).filter((m) => m !== fromId);
    this.emit('group:message', { message, recipientIds: recipients });
    return message;
  }

  getGroups(leadId: string): ChatGroup[] {
    const rows = this.db.all<any>(
      'SELECT name, lead_id, created_at FROM chat_groups WHERE lead_id = ? ORDER BY created_at ASC',
      [leadId],
    );
    return rows.map((row) => ({
      name: row.name,
      leadId: row.lead_id,
      memberIds: this.getMembers(row.name, row.lead_id),
      createdAt: row.created_at,
    }));
  }

  getGroupsForAgent(agentId: string): ChatGroup[] {
    const rows = this.db.all<any>(
      `SELECT g.name, g.lead_id, g.created_at FROM chat_groups g
       JOIN chat_group_members m ON g.name = m.group_name AND g.lead_id = m.lead_id
       WHERE m.agent_id = ?
       ORDER BY g.created_at ASC`,
      [agentId],
    );
    return rows.map((row) => ({
      name: row.name,
      leadId: row.lead_id,
      memberIds: this.getMembers(row.name, row.lead_id),
      createdAt: row.created_at,
    }));
  }

  getMembers(groupName: string, leadId: string): string[] {
    const rows = this.db.all<any>(
      'SELECT agent_id FROM chat_group_members WHERE group_name = ? AND lead_id = ? ORDER BY added_at ASC',
      [groupName, leadId],
    );
    return rows.map((r) => r.agent_id);
  }

  getMessages(groupName: string, leadId: string, limit = 50): GroupMessage[] {
    const rows = this.db.all<any>(
      'SELECT * FROM chat_group_messages WHERE group_name = ? AND lead_id = ? ORDER BY timestamp DESC LIMIT ?',
      [groupName, leadId, limit],
    );
    return rows.reverse().map((r) => ({
      id: r.id,
      groupName: r.group_name,
      leadId: r.lead_id,
      fromAgentId: r.from_agent_id,
      fromRole: r.from_role,
      content: r.content,
      timestamp: r.timestamp,
    }));
  }

  exists(name: string, leadId: string): boolean {
    return !!this.db.get<any>(
      'SELECT 1 FROM chat_groups WHERE name = ? AND lead_id = ?',
      [name, leadId],
    );
  }
}
