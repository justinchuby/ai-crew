import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../stores/appStore';
import { ApprovalBadge } from '../ApprovalQueue/ApprovalBadge';
import type { Decision } from '../../types';

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: `decision-${Math.random().toString(36).slice(2, 10)}`,
    agentId: 'agent-123',
    agentRole: 'Developer',
    title: 'Use prettier for formatting',
    rationale: 'Consistent code style',
    needsConfirmation: true,
    status: 'recorded',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  useAppStore.getState().setPendingDecisions([]);
  useAppStore.getState().setApprovalQueueOpen(false);
});

describe('ApprovalBadge', () => {
  it('renders without a count badge when no decisions pending', () => {
    const { container } = render(<ApprovalBadge />);
    expect(screen.getByText('Approvals')).toBeDefined();
    // No badge count should be visible
    const badge = container.querySelector('.animate-pulse');
    expect(badge).toBeNull();
  });

  it('shows count badge when decisions are pending', () => {
    useAppStore.getState().setPendingDecisions([makeDecision(), makeDecision()]);
    render(<ApprovalBadge />);
    expect(screen.getByText('2')).toBeDefined();
  });

  it('shows 99+ when more than 99 decisions are pending', () => {
    const decisions = Array.from({ length: 100 }, () => makeDecision());
    useAppStore.getState().setPendingDecisions(decisions);
    render(<ApprovalBadge />);
    expect(screen.getByText('99+')).toBeDefined();
  });

  it('opens the approval queue when clicked', () => {
    render(<ApprovalBadge />);
    fireEvent.click(screen.getByText('Approvals'));
    expect(useAppStore.getState().approvalQueueOpen).toBe(true);
  });
});
