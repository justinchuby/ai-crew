import { useGroupStore, groupKey } from '../../stores/groupStore';
import type { HandlerContext } from './index';

export function handleGroupCreated(msg: any, _ctx: HandlerContext): void {
  const gs = useGroupStore.getState();
  gs.addGroup({
    name: msg.name,
    leadId: msg.leadId,
    memberIds: msg.memberIds ?? [],
    createdAt: msg.createdAt ?? new Date().toISOString(),
  });
}

export function handleGroupMessage(msg: any, _ctx: HandlerContext): void {
  const gs = useGroupStore.getState();
  if (msg.message) {
    const key = groupKey(msg.message.leadId, msg.message.groupName);
    gs.addMessage(key, msg.message);
  }
}

export function handleGroupMemberAdded(msg: any, _ctx: HandlerContext): void {
  const gs = useGroupStore.getState();
  if (msg.group && msg.agentId) {
    gs.addMember(msg.leadId, msg.group, msg.agentId);
  }
}

export function handleGroupMemberRemoved(msg: any, _ctx: HandlerContext): void {
  const gs = useGroupStore.getState();
  if (msg.group && msg.agentId) {
    gs.removeMember(msg.leadId, msg.group, msg.agentId);
  }
}

export function handleGroupReaction(msg: any, _ctx: HandlerContext): void {
  const gs = useGroupStore.getState();
  if (msg.messageId && msg.emoji && msg.agentId) {
    const key = groupKey(msg.leadId, msg.groupName);
    if (msg.action === 'remove') {
      gs.removeReaction(key, msg.messageId, msg.emoji, msg.agentId);
    } else {
      gs.addReaction(key, msg.messageId, msg.emoji, msg.agentId);
    }
  }
}
