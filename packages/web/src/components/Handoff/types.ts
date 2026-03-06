// Handoff Briefing types — aligned with P3 C5 designer spec

export type HandoffTrigger =
  | 'crash'
  | 'manual_termination'
  | 'model_swap'
  | 'role_change'
  | 'context_compaction'
  | 'session_end';

export interface QualityFactor {
  name: string;
  score: number;
  detail: string;
}

export interface HandoffBriefing {
  narrative: string;
  tasks: { id: string; name: string; status: string; progress?: string }[];
  files: { path: string; additions: number; deletions: number }[];
  lastMessages: string[];
  discoveries: string[];
  tokenCount: number;
}

export interface HandoffRecord {
  id: string;
  sessionId: string;
  sourceAgentId: string;
  sourceRole: string;
  sourceModel: string;
  targetAgentId: string | null;
  targetRole: string | null;
  targetModel: string | null;
  trigger: HandoffTrigger;
  briefing: HandoffBriefing;
  qualityScore: number | null;
  qualityFactors: QualityFactor[];
  status: 'draft' | 'reviewed' | 'delivered' | 'archived';
  createdAt: string;
  deliveredAt: string | null;
  reviewedBy: 'system' | 'user' | null;
  userEdits: string | null;
}

export const TRIGGER_DISPLAY: Record<HandoffTrigger, { icon: string; label: string; color: string }> = {
  crash: { icon: '🔴', label: 'Crash recovery', color: 'text-red-400' },
  manual_termination: { icon: '⏹', label: 'Manual termination', color: 'text-th-text-muted' },
  model_swap: { icon: '🔄', label: 'Model swap', color: 'text-blue-400' },
  role_change: { icon: '🎭', label: 'Role change', color: 'text-purple-400' },
  context_compaction: { icon: '🗜', label: 'Context compaction', color: 'text-orange-400' },
  session_end: { icon: '📦', label: 'Session archive', color: 'text-green-400' },
};

export function qualityColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export function qualityBarColor(score: number): string {
  if (score >= 80) return 'bg-green-400';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}
