/**
 * Tests for crew_* MCP tool call rendering in AcpOutput.
 *
 * Verifies that tool calls with names starting with "crew_" render as
 * collapsible command blocks (matching [[[ ]]] style), while regular
 * tool calls keep their default box rendering.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AcpOutput } from '../AcpOutput';
import { useAppStore } from '../../../stores/appStore';
import type { AgentInfo, AcpToolCall } from '../../../types';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeAgent(toolCalls: AcpToolCall[]): AgentInfo {
  return {
    id: 'agent-1',
    role: { id: 'dev', name: 'Developer', description: '', systemPrompt: '', color: '#000', icon: '🔧', builtIn: true },
    status: 'running',
    childIds: [],
    createdAt: new Date().toISOString(),
    outputPreview: '',
    autopilot: true,
    toolCalls,
    messages: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('AcpOutput — crew command tool calls', () => {
  beforeEach(() => {
    // Reset store
    useAppStore.getState().setAgents([]);
  });

  it('renders crew_* tool call as a collapsible command block with label', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-1',
        title: 'crew_delegate',
        kind: 'crew_delegate',
        status: 'completed',
        content: JSON.stringify({ task: 'Build the login page', role: 'developer' }),
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Should show the label (DELEGATE) not the raw crew_delegate name
    expect(screen.getByText('DELEGATE')).toBeTruthy();

    // Should show status badge
    expect(screen.getByText('completed')).toBeTruthy();

    // Should show preview text with key-value pairs when collapsed
    expect(container.textContent).toContain('task:');
    expect(container.textContent).toContain('Build the login page');
  });

  it('expands crew command block on click to show full params', () => {
    const params = JSON.stringify({ task: 'Implement OAuth', role: 'developer', context: 'Use GitHub provider' });
    const agent = makeAgent([
      {
        toolCallId: 'tc-2',
        title: 'crew_create_agent',
        kind: 'crew_create_agent',
        status: 'in_progress',
        content: params,
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Label should be CREATE_AGENT
    expect(screen.getByText('CREATE_AGENT')).toBeTruthy();

    // Click to expand
    const block = container.querySelector('.cursor-pointer');
    expect(block).not.toBeNull();
    fireEvent.click(block!);

    // After expanding, should show full JSON in a <pre>
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('Implement OAuth');
  });

  it('renders regular (non-crew) tool call in default box style', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-3',
        title: 'read_file',
        kind: 'file_operation',
        status: 'completed',
        content: 'file contents here',
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Should show title as plain text
    expect(screen.getByText('read_file')).toBeTruthy();
    // Should show kind
    expect(screen.getByText('file_operation')).toBeTruthy();
    // Should NOT have the collapsible command block style (no DELEGATE/CREATE_AGENT label)
    expect(container.textContent).not.toContain('READ_FILE');
  });

  it('renders mix of crew and regular tool calls correctly', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-crew',
        title: 'crew_terminate',
        kind: 'crew_terminate',
        status: 'completed',
        content: JSON.stringify({ agentId: 'abc123' }),
      },
      {
        toolCallId: 'tc-regular',
        title: 'bash',
        kind: 'shell',
        status: 'in_progress',
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Crew command renders with uppercase label
    expect(screen.getByText('TERMINATE')).toBeTruthy();
    // Regular tool call renders with original title
    expect(screen.getByText('bash')).toBeTruthy();
  });

  it('shows emoji for crew command based on tool name', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-msg',
        title: 'crew_message',
        kind: 'crew_message',
        status: 'completed',
        content: JSON.stringify({ to: 'dev-1', content: 'Hello' }),
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Message tool should get the 💬 emoji
    expect(container.textContent).toContain('💬');
    expect(screen.getByText('MESSAGE')).toBeTruthy();
  });

  it('shows in_progress status badge with blue styling', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-prog',
        title: 'crew_delegate',
        kind: 'crew_delegate',
        status: 'in_progress',
        content: JSON.stringify({ task: 'Do something' }),
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    render(<AcpOutput agentId="agent-1" />);

    const badge = screen.getByText('in_progress');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('text-blue-400');
  });

  it('handles crew tool call with no content gracefully', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-empty',
        title: 'crew_progress',
        kind: 'crew_progress',
        status: 'pending',
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    expect(screen.getByText('PROGRESS')).toBeTruthy();
    // No preview text when content is empty
    expect(container.textContent).not.toContain('—');
  });

  it('detects crew command by kind when title does not start with crew_', () => {
    const agent = makeAgent([
      {
        toolCallId: 'tc-kind',
        title: 'Delegate Task',
        kind: 'crew_delegate',
        status: 'completed',
        content: JSON.stringify({ task: 'Fix bug' }),
      },
    ]);
    useAppStore.getState().setAgents([agent]);
    const { container } = render(<AcpOutput agentId="agent-1" />);

    // Should still be treated as a crew command because kind starts with crew_
    // The label comes from title, which here is 'Delegate Task' — strip crew_ prefix if present
    // Since title doesn't start with crew_, the label will be 'DELEGATE TASK' (from title.replace(/^crew_/, '').toUpperCase())
    // Actually the label uses (tc.title || tc.kind || '').replace(/^crew_/, '').toUpperCase()
    // tc.title = 'Delegate Task' doesn't start with crew_, so it stays as 'DELEGATE TASK'
    expect(screen.getByText('DELEGATE TASK')).toBeTruthy();
    // Verify it's rendered as a collapsible block (has the cursor-pointer class)
    const block = container.querySelector('.cursor-pointer');
    expect(block).not.toBeNull();
  });
});
