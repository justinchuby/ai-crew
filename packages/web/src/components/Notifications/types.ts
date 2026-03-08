// Notification Channel types — aligned with P3 C5 designer spec

export type ChannelType = 'desktop' | 'slack' | 'discord' | 'email' | 'webhook' | 'telegram';
export type NotificationTier = 'interrupt' | 'summon';
export type NotifiableEvent =
  | 'decision_pending'
  | 'agent_crashed'
  | 'agent_recovered'
  | 'budget_warning'
  | 'budget_exceeded'
  | 'session_completed'
  | 'task_completed'
  | 'context_critical'
  | 'handoff_ready';

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  tiers: NotificationTier[];
  quietHours?: { start: string; end: string; timezone: string };
}

export interface NotificationPreference {
  event: NotifiableEvent;
  tier: NotificationTier;
  channels: string[];
  enabled: boolean;
}

export interface NotificationLogEntry {
  id: string;
  event: NotifiableEvent;
  channelType: ChannelType;
  status: 'sent' | 'failed' | 'suppressed';
  timestamp: string;
  detail?: string;
}

export const CHANNEL_DISPLAY: Record<ChannelType, { icon: string; label: string; description: string }> = {
  desktop: { icon: '🖥', label: 'Desktop Notifications', description: 'Browser push notifications' },
  slack: { icon: '💬', label: 'Slack', description: 'Post alerts to a Slack channel' },
  discord: { icon: '🎮', label: 'Discord', description: 'Post alerts to Discord' },
  email: { icon: '📧', label: 'Email Digest', description: 'Receive session summaries by email' },
  webhook: { icon: '🔗', label: 'Webhook', description: 'POST events to a custom URL' },
  telegram: { icon: '📱', label: 'Telegram', description: 'Send alerts to a Telegram chat' },
};

export const EVENT_LABELS: Record<NotifiableEvent, string> = {
  decision_pending: 'Decision pending',
  agent_crashed: 'Agent crashed',
  agent_recovered: 'Agent recovered',
  budget_warning: 'Budget warning',
  budget_exceeded: 'Budget exceeded',
  session_completed: 'Session completed',
  task_completed: 'Task completed',
  context_critical: 'Context critical',
  handoff_ready: 'Handoff ready',
};

export type PresetName = 'conservative' | 'moderate' | 'everything';

export const PRESET_DEFAULTS: Record<PresetName, Record<NotifiableEvent, ChannelType[]>> = {
  conservative: {
    decision_pending: ['desktop'],
    agent_crashed: ['desktop'],
    agent_recovered: [],
    budget_warning: ['desktop'],
    budget_exceeded: ['desktop', 'slack', 'email'],
    session_completed: ['desktop', 'slack', 'email'],
    task_completed: [],
    context_critical: [],
    handoff_ready: ['desktop'],
  },
  moderate: {
    decision_pending: ['desktop', 'slack', 'telegram'],
    agent_crashed: ['desktop', 'slack', 'telegram'],
    agent_recovered: ['slack'],
    budget_warning: ['desktop'],
    budget_exceeded: ['desktop', 'slack', 'email'],
    session_completed: ['desktop', 'slack', 'email'],
    task_completed: [],
    context_critical: [],
    handoff_ready: ['desktop', 'slack'],
  },
  everything: {
    decision_pending: ['desktop', 'slack', 'email', 'webhook', 'telegram'],
    agent_crashed: ['desktop', 'slack', 'email', 'webhook', 'telegram'],
    agent_recovered: ['desktop', 'slack', 'webhook'],
    budget_warning: ['desktop', 'slack', 'webhook', 'telegram'],
    budget_exceeded: ['desktop', 'slack', 'email', 'webhook', 'telegram'],
    session_completed: ['desktop', 'slack', 'email', 'webhook'],
    task_completed: ['desktop', 'webhook'],
    context_critical: ['desktop', 'webhook', 'telegram'],
    handoff_ready: ['desktop', 'slack', 'webhook', 'telegram'],
  },
};
