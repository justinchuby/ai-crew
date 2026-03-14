// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HealthStrip, type RosterAgent } from '../UnifiedCrewPage';

// ── Fixtures ──────────────────────────────────────────────

function makeAgent(overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    agentId: crypto.randomUUID(),
    role: 'developer',
    model: 'claude-sonnet-4-6',
    status: 'running',
    liveStatus: 'running',
    teamId: 'default',
    projectId: 'proj-1',
    parentId: null,
    sessionId: null,
    lastTaskSummary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provider: 'anthropic',
    inputTokens: null,
    outputTokens: null,
    contextWindowSize: null,
    contextWindowUsed: null,
    task: null,
    outputPreview: null,
    ...overrides,
  };
}

const mixedAgents: RosterAgent[] = [
  makeAgent({ liveStatus: 'running' }),
  makeAgent({ liveStatus: 'running' }),
  makeAgent({ liveStatus: 'creating' }),
  makeAgent({ liveStatus: 'idle' }),
  makeAgent({ liveStatus: 'completed' }),
  makeAgent({ liveStatus: 'terminated' }),
  makeAgent({ liveStatus: 'failed' }),
];

// ── Tests ──────────────────────────────────────────────────

describe('HealthStrip', () => {
  it('renders correct total count from agents prop', () => {
    render(<HealthStrip agents={mixedAgents} />);
    expect(screen.getByText(/7 total/)).toBeTruthy();
  });

  it('counts running agents (running + creating)', () => {
    render(<HealthStrip agents={mixedAgents} />);
    expect(screen.getByText(/3 running/)).toBeTruthy();
  });

  it('counts idle agents', () => {
    render(<HealthStrip agents={mixedAgents} />);
    expect(screen.getByText(/1 idle/)).toBeTruthy();
  });

  it('shows zero counts when agents list is empty', () => {
    render(<HealthStrip agents={[]} />);
    expect(screen.getByText(/0 total/)).toBeTruthy();
    expect(screen.getByText(/0 running/)).toBeTruthy();
    expect(screen.getByText(/0 idle/)).toBeTruthy();
  });

  it('shows expanded details on click', () => {
    render(<HealthStrip agents={mixedAgents} />);
    fireEvent.click(screen.getByRole('button'));

    // Expanded grid shows individual status counts
    const boldElements = document.querySelectorAll('.font-bold');
    const values = Array.from(boldElements).map(el => el.textContent);
    expect(values).toContain('7');  // total
    expect(values).toContain('3');  // running
    expect(values).toContain('1');  // idle
    expect(values).toContain('2');  // completed + terminated
  });

  it('only counts agents passed as props, not from global store', () => {
    const projectAgents = [
      makeAgent({ liveStatus: 'running', projectId: 'proj-a' }),
      makeAgent({ liveStatus: 'idle', projectId: 'proj-a' }),
    ];
    render(<HealthStrip agents={projectAgents} />);
    expect(screen.getByText(/2 total/)).toBeTruthy();
    expect(screen.getByText(/1 running/)).toBeTruthy();
    expect(screen.getByText(/1 idle/)).toBeTruthy();
  });
});
