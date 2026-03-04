import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the timer:fired delivery logic in index.ts.
 * The handler delivers timer messages to non-terminal agents using queueMessage(),
 * which handles both idle (immediate delivery) and running (queued) agents.
 */

interface MockAgent {
  id: string;
  status: string;
  queueMessage: (msg: string) => void;
  sendMessage: (msg: string) => void;
}

function createAgent(status: string): MockAgent {
  return {
    id: 'agent-1',
    status,
    queueMessage: vi.fn(),
    sendMessage: vi.fn(),
  };
}

/** Mirror of the timer:fired handler logic from index.ts */
function handleTimerFired(
  agent: MockAgent | undefined,
  timer: { agentId: string; label: string; message: string },
): void {
  if (agent && agent.status !== 'completed' && agent.status !== 'failed' && agent.status !== 'terminated') {
    agent.queueMessage(`[System Timer "${timer.label}"] ${timer.message}`);
  }
}

const timer = { agentId: 'agent-1', label: 'check-build', message: 'Check if the build passed' };

describe('Timer delivery to agents (Issue #60)', () => {
  it('delivers timer message to running agent', () => {
    const agent = createAgent('running');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).toHaveBeenCalledWith('[System Timer "check-build"] Check if the build passed');
  });

  it('delivers timer message to idle agent (wake-up)', () => {
    const agent = createAgent('idle');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).toHaveBeenCalledWith('[System Timer "check-build"] Check if the build passed');
  });

  it('delivers timer message to creating agent', () => {
    const agent = createAgent('creating');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).toHaveBeenCalledTimes(1);
  });

  it('does NOT deliver to terminated agent', () => {
    const agent = createAgent('terminated');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).not.toHaveBeenCalled();
  });

  it('does NOT deliver to completed agent', () => {
    const agent = createAgent('completed');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).not.toHaveBeenCalled();
  });

  it('does NOT deliver to failed agent', () => {
    const agent = createAgent('failed');
    handleTimerFired(agent, timer);
    expect(agent.queueMessage).not.toHaveBeenCalled();
  });

  it('handles missing agent gracefully (agent was terminated/removed)', () => {
    handleTimerFired(undefined, timer);
    // No crash — timer fires but message is silently dropped
  });

  it('uses queueMessage not sendMessage for proper idle/running handling', () => {
    const agent = createAgent('idle');
    handleTimerFired(agent, timer);
    // queueMessage handles idle (immediate write) vs running (queue for later)
    expect(agent.queueMessage).toHaveBeenCalledTimes(1);
    expect(agent.sendMessage).not.toHaveBeenCalled();
  });
});
