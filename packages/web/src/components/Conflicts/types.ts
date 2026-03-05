export interface ConflictAlert {
  id: string;
  type: ConflictType;
  severity: 'low' | 'medium' | 'high';
  agents: [ConflictAgent, ConflictAgent];
  files: ConflictFile[];
  description: string;
  detectedAt: string;
  resolution?: ConflictResolution;
  status: 'active' | 'resolved' | 'dismissed';
}

export type ConflictType = 'same_directory' | 'import_overlap' | 'lock_contention' | 'branch_divergence';

export interface ConflictAgent {
  agentId: string;
  role: string;
  files: string[];
  taskId: string | null;
}

export interface ConflictFile {
  path: string;
  agents: string[];
  editType: 'locked' | 'recently_edited' | 'import_dependency';
  risk: 'direct' | 'indirect';
}

export type ConflictResolution =
  | { type: 'sequenced'; order: [string, string] }
  | { type: 'merged'; by: string }
  | { type: 'dismissed'; by: 'user' | 'system' }
  | { type: 'auto_resolved'; method: string };

export interface ConflictDetectionConfig {
  enabled: boolean;
  checkIntervalMs: number;
  directoryOverlapEnabled: boolean;
  importAnalysisEnabled: boolean;
  branchDivergenceEnabled: boolean;
}

export const CONFLICT_TYPE_LABELS: Record<ConflictType, string> = {
  same_directory: 'Directory Overlap',
  import_overlap: 'Import Overlap',
  lock_contention: 'Lock Contention',
  branch_divergence: 'Branch Divergence',
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-th-text-muted',
  medium: 'text-amber-400',
  high: 'text-red-400',
};

export const SEVERITY_BG: Record<string, string> = {
  low: 'bg-th-bg-muted',
  medium: 'bg-amber-500/10',
  high: 'bg-red-500/10',
};
