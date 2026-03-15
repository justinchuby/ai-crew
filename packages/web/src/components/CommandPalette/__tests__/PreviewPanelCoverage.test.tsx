// @vitest-environment jsdom
/**
 * Coverage tests for buildPreviewData — the untested export in PreviewPanel.tsx.
 * The existing test only covers the PreviewPanel component; this covers all
 * branches of buildPreviewData (agent, task, navigation, nl-command, suggestion, unknown).
 */
import { describe, it, expect } from 'vitest';
import { buildPreviewData } from '../PreviewPanel';
import type { AgentInfo } from '../../../types';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    role: { id: 'dev', name: 'Developer', systemPrompt: '' },
    status: 'running',
    model: 'gpt-4',
    provider: 'openai',
    backend: 'acp',
    inputTokens: 0,
    outputTokens: 0,
    contextWindowSize: 128000,
    contextWindowUsed: 64000,
    contextBurnRate: 0,
    estimatedExhaustionMinutes: null,
    pendingMessages: 0,
    createdAt: new Date().toISOString(),
    childIds: [],
    toolCalls: [],
    messages: [],
    isSubLead: false,
    hierarchyLevel: 0,
    outputPreview: '',
    task: 'Implement feature X',
    ...overrides,
  } as AgentInfo;
}

describe('buildPreviewData', () => {
  const agents = [makeAgent()];

  it('builds agent preview with full details', () => {
    const item = { type: 'agent', label: 'Dev', agentId: 'agent-1' };
    const result = buildPreviewData(item, agents);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('agent');
    expect(result!.title).toBe('Developer');
    expect(result!.subtitle).toBe('Status: running');
    expect(result!.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Task', value: 'Implement feature X' }),
        expect.objectContaining({ label: 'Context' }),
        expect.objectContaining({ label: 'Provider', value: 'openai' }),
        expect.objectContaining({ label: 'Model', value: 'gpt-4' }),
      ]),
    );
  });

  it('shows dash for context when window size is 0', () => {
    const a = [makeAgent({ contextWindowSize: 0, contextWindowUsed: 0 })];
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'agent-1' }, a);
    const ctxField = result!.fields.find(f => f.label === 'Context');
    expect(ctxField!.value).toBe('—');
  });

  it('computes context percentage correctly', () => {
    const a = [makeAgent({ contextWindowSize: 100000, contextWindowUsed: 50000 })];
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'agent-1' }, a);
    const ctxField = result!.fields.find(f => f.label === 'Context');
    expect(ctxField!.value).toBe('50%');
  });

  it('returns null for agent type when agent not found', () => {
    const result = buildPreviewData({ type: 'agent', label: 'X', agentId: 'nonexistent' }, agents);
    expect(result).toBeNull();
  });

  it('returns null for agent type without agentId', () => {
    const result = buildPreviewData({ type: 'agent', label: 'X' }, agents);
    expect(result).toBeNull();
  });

  it('omits provider and model fields when agent lacks them', () => {
    const a = [makeAgent({ provider: undefined, model: undefined })];
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'agent-1' }, a);
    expect(result!.fields.find(f => f.label === 'Provider')).toBeUndefined();
    expect(result!.fields.find(f => f.label === 'Model')).toBeUndefined();
  });

  it('shows "None" for task when agent has no task', () => {
    const a = [makeAgent({ task: undefined })];
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'agent-1' }, a);
    const taskField = result!.fields.find(f => f.label === 'Task');
    expect(taskField!.value).toBe('None');
  });

  it('uses role name "Agent" when agent has no role name', () => {
    const a = [makeAgent({ role: { id: 'x', systemPrompt: '' } as any })];
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'agent-1' }, a);
    expect(result!.title).toBe('Agent');
  });

  it('builds task preview', () => {
    const result = buildPreviewData({ type: 'task', label: 'Build UI', description: 'Create components' }, []);
    expect(result).toEqual({
      type: 'task',
      title: 'Build UI',
      subtitle: 'Create components',
      fields: [],
    });
  });

  it('builds navigation preview with description', () => {
    const result = buildPreviewData({ type: 'navigation', label: 'Dashboard', description: 'Go to dashboard' }, []);
    expect(result).toEqual({
      type: 'navigation',
      title: 'Dashboard',
      subtitle: 'Go to dashboard',
      fields: [],
    });
  });

  it('builds navigation preview with default subtitle', () => {
    const result = buildPreviewData({ type: 'navigation', label: 'Dashboard' }, []);
    expect(result!.subtitle).toBe('Navigate to this page');
  });

  it('builds nl-command preview with description', () => {
    const result = buildPreviewData({ type: 'nl-command', label: 'Run tests', description: 'Execute test suite' }, []);
    expect(result).toEqual({
      type: 'nl-command',
      title: 'Run tests',
      subtitle: 'Execute test suite',
      fields: [],
    });
  });

  it('builds nl-command preview with default subtitle', () => {
    const result = buildPreviewData({ type: 'nl-command', label: 'Run tests' }, []);
    expect(result!.subtitle).toBe('Execute this command');
  });

  it('builds suggestion preview', () => {
    const result = buildPreviewData({ type: 'suggestion', label: 'Try this', description: 'A suggestion' }, []);
    expect(result).toEqual({
      type: 'suggestion',
      title: 'Try this',
      subtitle: 'A suggestion',
      fields: [],
    });
  });

  it('returns null for unknown type', () => {
    const result = buildPreviewData({ type: 'unknown', label: 'X' }, []);
    expect(result).toBeNull();
  });
});
