// Debate Visualization types — aligned with backend detection API

export type ResolutionType = 'consensus' | 'lead_decision' | 'deferred' | 'ongoing';
export type DebateSeverity = 'minor' | 'significant' | 'major';

export interface DebateParticipant {
  agentId: string;
  role: string;
  position: string;
}

export interface DebateResolution {
  type: ResolutionType;
  summary: string;
  decidedBy?: string;
}

export interface Debate {
  id: string;
  topic: string;
  participants: DebateParticipant[];
  messageIds: string[];
  messageCount: number;
  startTime: string;
  endTime: string | null;
  duration: number;
  resolution: DebateResolution | null;
  severity: DebateSeverity;
}

export interface DebateMessage {
  id: string;
  agentId: string;
  role: string;
  content: string;
  timestamp: string;
  isDisagreement?: boolean;
}

export const RESOLUTION_DISPLAY: Record<ResolutionType, { icon: string; label: string; color: string }> = {
  consensus: { icon: '✅', label: 'Resolved by consensus', color: 'text-green-500' },
  lead_decision: { icon: '👑', label: 'Lead decision', color: 'text-amber-400' },
  deferred: { icon: '⏸', label: 'Deferred', color: 'text-th-text-muted' },
  ongoing: { icon: '🔄', label: 'In progress', color: 'text-blue-400' },
};

export const SEVERITY_STYLES: Record<DebateSeverity, string> = {
  minor: 'border-l-th-border',
  significant: 'border-l-amber-400',
  major: 'border-l-red-400',
};
