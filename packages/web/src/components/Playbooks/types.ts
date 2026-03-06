/** Shared Playbook types — used by all Playbooks components. */

export interface PlaybookAgent {
  role: string;
  model?: string;
  customPrompt?: string;
}

export interface PlaybookSettings {
  budget?: number;
  maxAgents?: number;
  model?: string;
}

export interface PlaybookMetadata {
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
  source: 'built-in' | 'user' | 'learned';
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  icon: string;
  agents: PlaybookAgent[];
  intentRules: Array<{ category: string; action: string }>;
  settings: PlaybookSettings;
  metadata: PlaybookMetadata;
}

/** Summarize agent roles as "1 Lead • 2 Dev • 1 Rev" */
export function summarizeRoles(agents: PlaybookAgent[]): string {
  const counts = new Map<string, number>();
  for (const a of agents) {
    const role = a.role.replace(/^Project /, '').replace(/ Agent$/, '');
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([role, n]) => n > 1 ? `${n} ${role}` : `1 ${role}`)
    .join(' • ');
}

/** Built-in playbook definitions */
export const BUILT_IN_PLAYBOOKS: Playbook[] = [
  {
    id: 'builtin-code-review',
    name: 'Code Review Crew',
    description: 'Focused code review with developer context',
    icon: '🔍',
    agents: [
      { role: 'Lead' },
      { role: 'Developer' },
      { role: 'Developer' },
      { role: 'Code Reviewer' },
    ],
    intentRules: [{ category: 'style', action: 'auto-approve' }],
    settings: { budget: 5 },
    metadata: { createdAt: '', updatedAt: '', usageCount: 0, lastUsedAt: null, source: 'built-in' },
  },
  {
    id: 'builtin-bug-fix',
    name: 'Bug Fix Sprint',
    description: 'Fast bug triage, fix, and verification',
    icon: '🐛',
    agents: [
      { role: 'Architect' },
      { role: 'Developer' },
      { role: 'Developer' },
      { role: 'QA Tester' },
    ],
    intentRules: [{ category: 'tool_access', action: 'auto-approve' }],
    settings: { budget: 10 },
    metadata: { createdAt: '', updatedAt: '', usageCount: 0, lastUsedAt: null, source: 'built-in' },
  },
  {
    id: 'builtin-docs',
    name: 'Docs Blitz',
    description: 'Rapid documentation writing and review',
    icon: '📝',
    agents: [
      { role: 'Tech Writer' },
      { role: 'Developer' },
      { role: 'Code Reviewer' },
    ],
    intentRules: [{ category: 'style', action: 'auto-approve' }],
    settings: { budget: 3 },
    metadata: { createdAt: '', updatedAt: '', usageCount: 0, lastUsedAt: null, source: 'built-in' },
  },
  {
    id: 'builtin-full-feature',
    name: 'Full Feature Build',
    description: 'End-to-end feature development with full crew',
    icon: '🏗',
    agents: [
      { role: 'Lead' },
      { role: 'Architect' },
      { role: 'Developer' },
      { role: 'Developer' },
      { role: 'Developer' },
      { role: 'Code Reviewer' },
      { role: 'QA Tester' },
    ],
    intentRules: [
      { category: 'style', action: 'auto-approve' },
      { category: 'tool_access', action: 'auto-approve' },
    ],
    settings: { budget: 25 },
    metadata: { createdAt: '', updatedAt: '', usageCount: 0, lastUsedAt: null, source: 'built-in' },
  },
  {
    id: 'builtin-quick-fix',
    name: 'Quick Fix',
    description: 'Minimal crew for small, focused changes',
    icon: '🚀',
    agents: [
      { role: 'Lead' },
      { role: 'Developer' },
    ],
    intentRules: [],
    settings: { budget: 2 },
    metadata: { createdAt: '', updatedAt: '', usageCount: 0, lastUsedAt: null, source: 'built-in' },
  },
];
