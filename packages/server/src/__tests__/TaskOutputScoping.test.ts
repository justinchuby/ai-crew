import { describe, it, expect } from 'vitest';
import { Agent } from '../agents/Agent.js';

function makeAgent(): Agent {
  const role = { id: 'developer', name: 'Developer' } as any;
  const config = { model: 'test', projectName: 'test', maxConcurrentAgents: 5 } as any;
  return new Agent(role, config);
}

describe('Agent — task output scoping', () => {
  it('getTaskOutput returns all messages when taskOutputStartIndex is 0', () => {
    const agent = makeAgent();
    agent.messages.push('msg1', 'msg2', 'msg3');

    expect(agent.getTaskOutput()).toBe('msg1msg2msg3');
  });

  it('getTaskOutput only returns messages after taskOutputStartIndex', () => {
    const agent = makeAgent();
    agent.messages.push('old-task-output-1', 'old-task-output-2');
    agent.taskOutputStartIndex = agent.messages.length; // simulate new task
    agent.messages.push('new-task-msg-1', 'new-task-msg-2');

    const output = agent.getTaskOutput();
    expect(output).toBe('new-task-msg-1new-task-msg-2');
    expect(output).not.toContain('old-task');
  });

  it('getRecentOutput still returns all messages regardless of index', () => {
    const agent = makeAgent();
    agent.messages.push('old1', 'old2');
    agent.taskOutputStartIndex = agent.messages.length;
    agent.messages.push('new1', 'new2');

    const recent = agent.getRecentOutput(10000);
    expect(recent).toContain('old1');
    expect(recent).toContain('new2');
  });

  it('getTaskOutput respects maxChars limit', () => {
    const agent = makeAgent();
    agent.taskOutputStartIndex = 0;
    agent.messages.push('a'.repeat(100), 'b'.repeat(100));

    const output = agent.getTaskOutput(150);
    expect(output.length).toBeLessThanOrEqual(150);
  });

  it('getTaskOutput returns empty when no messages after start index', () => {
    const agent = makeAgent();
    agent.messages.push('old1', 'old2');
    agent.taskOutputStartIndex = agent.messages.length;

    expect(agent.getTaskOutput()).toBe('');
  });

  it('taskOutputStartIndex defaults to 0', () => {
    const agent = makeAgent();
    expect(agent.taskOutputStartIndex).toBe(0);
  });

  it('setting new task resets output scope to current message count', () => {
    const agent = makeAgent();
    agent.messages.push('task1-msg1', 'task1-msg2');

    // Simulate new task assignment (as AgentLifecycle does)
    agent.taskOutputStartIndex = agent.messages.length;
    agent.task = 'New task';

    agent.messages.push('task2-msg1');

    expect(agent.getTaskOutput()).toBe('task2-msg1');
  });

  it('handles negative taskOutputStartIndex gracefully', () => {
    const agent = makeAgent();
    agent.messages.push('msg1', 'msg2');
    agent.taskOutputStartIndex = -5;

    // Should clamp to 0 and return all messages
    expect(agent.getTaskOutput()).toBe('msg1msg2');
  });
});
