// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildPreviewData } from '../PreviewPanel';

describe('buildPreviewData', () => {
  // Agent with matching agent in list
  it('returns agent preview with context percentage', () => {
    const agents = [{
      id: 'a1', status: 'running', task: 'Build UI',
      contextWindowSize: 100000, contextWindowUsed: 75000,
      role: { name: 'Developer' }, provider: 'anthropic', model: 'sonnet',
    }] as any;
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'a1' }, agents);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('agent');
    expect(result!.title).toBe('Developer');
    expect(result!.subtitle).toBe('Status: running');
    expect(result!.fields.find(f => f.label === 'Context')!.value).toBe('75%');
    expect(result!.fields.find(f => f.label === 'Provider')!.value).toBe('anthropic');
    expect(result!.fields.find(f => f.label === 'Model')!.value).toBe('sonnet');
  });

  // Agent with no context data
  it('returns dash for context when no context data', () => {
    const agents = [{
      id: 'a1', status: 'idle', task: null,
      role: { name: 'Tester' },
    }] as any;
    const result = buildPreviewData({ type: 'agent', label: 'Test', agentId: 'a1' }, agents);
    expect(result!.fields.find(f => f.label === 'Context')!.value).toBe('—');
    expect(result!.fields.find(f => f.label === 'Task')!.value).toBe('None');
  });

  // Agent not found
  it('returns null when agent is not found', () => {
    const result = buildPreviewData({ type: 'agent', label: 'X', agentId: 'missing' }, []);
    expect(result).toBeNull();
  });

  // Agent without agentId
  it('returns null for agent type without agentId', () => {
    const result = buildPreviewData({ type: 'agent', label: 'X' }, []);
    expect(result).toBeNull();
  });

  // Agent without provider/model
  it('omits provider/model fields when not set', () => {
    const agents = [{
      id: 'a1', status: 'running', task: 'Work',
      role: { name: 'Dev' },
    }] as any;
    const result = buildPreviewData({ type: 'agent', label: 'Dev', agentId: 'a1' }, agents);
    expect(result!.fields.find(f => f.label === 'Provider')).toBeUndefined();
    expect(result!.fields.find(f => f.label === 'Model')).toBeUndefined();
  });

  // Agent with no role name
  it('uses "Agent" when role has no name', () => {
    const agents = [{
      id: 'a1', status: 'running', task: 'Work', role: {},
    }] as any;
    const result = buildPreviewData({ type: 'agent', label: 'Ag', agentId: 'a1' }, agents);
    expect(result!.title).toBe('Agent');
  });

  // Task
  it('returns task preview', () => {
    const result = buildPreviewData({ type: 'task', label: 'Fix bug', description: 'Fix the login bug' }, []);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('task');
    expect(result!.title).toBe('Fix bug');
    expect(result!.subtitle).toBe('Fix the login bug');
  });

  // Navigation
  it('returns navigation preview', () => {
    const result = buildPreviewData({ type: 'navigation', label: 'Go to Settings', description: 'Open settings page' }, []);
    expect(result!.type).toBe('navigation');
    expect(result!.title).toBe('Go to Settings');
    expect(result!.subtitle).toBe('Open settings page');
  });

  // Navigation without description
  it('returns default subtitle for navigation without description', () => {
    const result = buildPreviewData({ type: 'navigation', label: 'Home' }, []);
    expect(result!.subtitle).toBe('Navigate to this page');
  });

  // NL command
  it('returns nl-command preview', () => {
    const result = buildPreviewData({ type: 'nl-command', label: 'Run tests', description: 'Execute test suite' }, []);
    expect(result!.type).toBe('nl-command');
    expect(result!.title).toBe('Run tests');
    expect(result!.subtitle).toBe('Execute test suite');
  });

  // NL command without description
  it('returns default subtitle for nl-command without description', () => {
    const result = buildPreviewData({ type: 'nl-command', label: 'Deploy' }, []);
    expect(result!.subtitle).toBe('Execute this command');
  });

  // Suggestion
  it('returns suggestion preview', () => {
    const result = buildPreviewData({ type: 'suggestion', label: 'Add tests', description: 'Improve coverage' }, []);
    expect(result!.type).toBe('suggestion');
    expect(result!.title).toBe('Add tests');
    expect(result!.subtitle).toBe('Improve coverage');
  });

  // Unknown type
  it('returns null for unknown type', () => {
    const result = buildPreviewData({ type: 'unknown-type', label: 'X' }, []);
    expect(result).toBeNull();
  });
});
