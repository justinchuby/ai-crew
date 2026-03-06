import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Debate } from '../Debates/types';
import { RESOLUTION_DISPLAY } from '../Debates/types';

vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue([]),
}));

import { DebateCard } from '../Debates/DebateCard';
import { DebatesPanel } from '../Debates/DebatesPanel';

// ── Test Data ──────────────────────────────────────────────────────

const makeDebate = (overrides: Partial<Debate> = {}): Debate => ({
  id: 'debate-1',
  topic: 'Focus Mode Implementation',
  participants: [
    { agentId: 'a1', role: 'architect', position: 'Separate route /agents/:id/focus' },
    { agentId: 'a2', role: 'developer', position: 'useFocusAgent() hook, incremental' },
    { agentId: 'a3', role: 'product-manager', position: 'Filter in-place with ?focus=agentId' },
  ],
  messageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
  messageCount: 12,
  startTime: new Date(Date.now() - 480_000).toISOString(),
  endTime: new Date().toISOString(),
  duration: 480,
  resolution: {
    type: 'consensus',
    summary: "Adopted Developer's approach",
    decidedBy: undefined,
  },
  severity: 'significant',
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────

describe('Debate Visualization', () => {
  describe('DebateCard (full)', () => {
    it('renders topic and participants', () => {
      render(<DebateCard debate={makeDebate()} />);
      expect(screen.getByTestId('debate-card')).toBeInTheDocument();
      expect(screen.getByText('Focus Mode Implementation')).toBeInTheDocument();
      expect(screen.getAllByText(/architect/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/developer/).length).toBeGreaterThan(0);
    });

    it('shows positions', () => {
      render(<DebateCard debate={makeDebate()} />);
      expect(screen.getByText(/"Separate route/)).toBeInTheDocument();
      expect(screen.getByText(/"useFocusAgent/)).toBeInTheDocument();
    });

    it('shows resolution', () => {
      render(<DebateCard debate={makeDebate()} />);
      expect(screen.getByText(/Adopted Developer/)).toBeInTheDocument();
    });

    it('shows View Thread button', () => {
      const onViewThread = vi.fn();
      render(<DebateCard debate={makeDebate()} onViewThread={onViewThread} />);
      fireEvent.click(screen.getByText('View Thread →'));
      expect(onViewThread).toHaveBeenCalled();
    });
  });

  describe('DebateCard (compact)', () => {
    it('renders one-line summary', () => {
      render(<DebateCard debate={makeDebate()} variant="compact" />);
      expect(screen.getByTestId('debate-card-compact')).toBeInTheDocument();
      expect(screen.getByText('Focus Mode Implementation')).toBeInTheDocument();
      expect(screen.getByText(/3 agents/)).toBeInTheDocument();
    });

    it('shows ongoing animation', () => {
      const ongoing = makeDebate({
        resolution: { type: 'ongoing', summary: '' },
        endTime: null,
      });
      render(<DebateCard debate={ongoing} variant="compact" />);
      expect(screen.getByText('⚡').className).toContain('animate-pulse');
    });
  });

  describe('DebatesPanel', () => {
    it('renders empty state', async () => {
      render(<DebatesPanel leadId="lead-1" />);
      const panel = await screen.findByTestId('debates-panel');
      expect(panel).toBeInTheDocument();
      expect(screen.getByText('No debates detected yet')).toBeInTheDocument();
    });
  });

  describe('types', () => {
    it('RESOLUTION_DISPLAY covers all types', () => {
      expect(RESOLUTION_DISPLAY.consensus.icon).toBe('✅');
      expect(RESOLUTION_DISPLAY.lead_decision.icon).toBe('👑');
      expect(RESOLUTION_DISPLAY.deferred.icon).toBe('⏸');
      expect(RESOLUTION_DISPLAY.ongoing.icon).toBe('🔄');
    });
  });
});
