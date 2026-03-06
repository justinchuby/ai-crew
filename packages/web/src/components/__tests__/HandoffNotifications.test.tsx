import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock apiFetch — return appropriate shapes per endpoint
vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockImplementation((path: string) => {
    if (path.includes('/notifications/channels')) return Promise.resolve({ channels: [] });
    if (path.includes('/notifications/routing')) return Promise.resolve({ routing: {}, preset: 'conservative' });
    if (path.includes('/notifications/log')) return Promise.resolve({ entries: [] });
    return Promise.resolve({});
  }),
}));

import { HandoffQualityBar } from '../Handoff/HandoffQualityBar';
import { HandoffTimelineEntry } from '../Handoff/HandoffTimelineEntry';
import { SessionEndArchive } from '../Handoff/SessionEndArchive';
import { TRIGGER_DISPLAY, qualityColor, qualityBarColor } from '../Handoff/types';
import type { HandoffRecord } from '../Handoff/types';

import { NotificationPreferencesPanel } from '../Notifications/NotificationPreferencesPanel';
import { NotificationActivityLog } from '../Notifications/NotificationActivityLog';
import { CHANNEL_DISPLAY, EVENT_LABELS, PRESET_DEFAULTS } from '../Notifications/types';

// ── Test Data ──────────────────────────────────────────────────────

const mockQualityFactors = [
  { name: 'task_coverage', score: 100, detail: 'Covers 3/3 tasks' },
  { name: 'message_recency', score: 80, detail: 'Last 10 of 47 messages' },
  { name: 'file_context', score: 60, detail: '2 of 4 locked files' },
  { name: 'discovery_count', score: 90, detail: '3 discoveries captured' },
];

const mockHandoff: HandoffRecord = {
  id: 'h1',
  sessionId: 's1',
  sourceAgentId: 'a1',
  sourceRole: 'developer',
  sourceModel: 'Sonnet',
  targetAgentId: 'a2',
  targetRole: 'developer',
  targetModel: 'Opus',
  trigger: 'model_swap',
  briefing: {
    narrative: 'Dev was implementing REST endpoints for the user service.',
    tasks: [{ id: 't1', name: 'API refactor', status: 'running', progress: '3/5' }],
    files: [{ path: 'src/api/users.ts', additions: 47, deletions: 3 }],
    lastMessages: ['Implementing GET /users/:id with pagination'],
    discoveries: ['User service needs cursor-based pagination'],
    tokenCount: 420,
  },
  qualityScore: 82,
  qualityFactors: mockQualityFactors,
  status: 'reviewed',
  createdAt: new Date().toISOString(),
  deliveredAt: null,
  reviewedBy: 'user',
  userEdits: null,
};

// ── Handoff Tests ──────────────────────────────────────────────────

describe('Handoff Briefings', () => {
  describe('HandoffQualityBar', () => {
    it('renders quality score and factors (full)', () => {
      render(<HandoffQualityBar score={82} factors={mockQualityFactors} />);
      expect(screen.getByTestId('handoff-quality-bar')).toBeInTheDocument();
      expect(screen.getByText('82/100')).toBeInTheDocument();
      expect(screen.getByText('Covers 3/3 tasks')).toBeInTheDocument();
    });

    it('renders compact variant', () => {
      render(<HandoffQualityBar score={45} factors={[]} compact />);
      expect(screen.getByText('45/100')).toBeInTheDocument();
    });
  });

  describe('HandoffTimelineEntry', () => {
    it('renders trigger icon, role, and quality', () => {
      render(<HandoffTimelineEntry record={mockHandoff} onClick={vi.fn()} />);
      expect(screen.getByTestId('handoff-timeline-entry')).toBeInTheDocument();
      expect(screen.getByText('Model swap')).toBeInTheDocument();
      expect(screen.getByText(/developer.*Sonnet/)).toBeInTheDocument();
      expect(screen.getByText('420 tokens')).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
      const onClick = vi.fn();
      render(<HandoffTimelineEntry record={mockHandoff} onClick={onClick} />);
      fireEvent.click(screen.getByTestId('handoff-timeline-entry'));
      expect(onClick).toHaveBeenCalledOnce();
    });
  });

  describe('SessionEndArchive', () => {
    it('renders agent list and archive button', () => {
      render(
        <SessionEndArchive
          sessionId="s1"
          agents={[{ id: 'a1', role: 'developer' }, { id: 'a2', role: 'architect' }]}
          onClose={vi.fn()}
          onArchive={vi.fn()}
        />
      );
      expect(screen.getByTestId('session-end-archive')).toBeInTheDocument();
      expect(screen.getByText('developer')).toBeInTheDocument();
      expect(screen.getByText('architect')).toBeInTheDocument();
      expect(screen.getByText('Archive & End →')).toBeInTheDocument();
    });
  });

  describe('types', () => {
    it('TRIGGER_DISPLAY covers all triggers', () => {
      expect(TRIGGER_DISPLAY.crash.icon).toBe('🔴');
      expect(TRIGGER_DISPLAY.model_swap.icon).toBe('🔄');
      expect(TRIGGER_DISPLAY.session_end.icon).toBe('📦');
    });

    it('qualityColor returns correct colors', () => {
      expect(qualityColor(85)).toBe('text-green-400');
      expect(qualityColor(60)).toBe('text-amber-400');
      expect(qualityColor(30)).toBe('text-red-400');
    });
  });
});

// ── Notification Tests ─────────────────────────────────────────────

describe('Notification Channels', () => {
  describe('NotificationPreferencesPanel', () => {
    it('renders notification settings panel', async () => {
      render(<NotificationPreferencesPanel />);
      await waitFor(() => {
        expect(screen.getByTestId('notification-preferences')).toBeInTheDocument();
      });
      expect(screen.getByText('🔔 Notification Settings')).toBeInTheDocument();
      expect(screen.getByText('Channels')).toBeInTheDocument();
      expect(screen.getByText('Event Routing')).toBeInTheDocument();
      expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
    });

    it('shows preset buttons', async () => {
      render(<NotificationPreferencesPanel />);
      await waitFor(() => {
        expect(screen.getByText('conservative')).toBeInTheDocument();
      });
      expect(screen.getByText('moderate')).toBeInTheDocument();
      expect(screen.getByText('everything')).toBeInTheDocument();
    });

    it('shows all event labels in routing matrix', async () => {
      render(<NotificationPreferencesPanel />);
      await waitFor(() => {
        expect(screen.getByText('Decision pending')).toBeInTheDocument();
      });
      expect(screen.getByText('Agent crashed')).toBeInTheDocument();
      expect(screen.getByText('Session completed')).toBeInTheDocument();
    });
  });

  describe('NotificationActivityLog', () => {
    it('renders empty state', async () => {
      render(<NotificationActivityLog />);
      await waitFor(() => {
        expect(screen.getByTestId('notification-activity-log')).toBeInTheDocument();
      });
      expect(screen.getByText('No notifications sent yet.')).toBeInTheDocument();
    });
  });

  describe('types', () => {
    it('CHANNEL_DISPLAY covers all types', () => {
      expect(CHANNEL_DISPLAY.desktop.label).toBe('Desktop Notifications');
      expect(CHANNEL_DISPLAY.slack.label).toBe('Slack');
      expect(CHANNEL_DISPLAY.webhook.label).toBe('Webhook');
    });

    it('EVENT_LABELS covers all events', () => {
      expect(Object.keys(EVENT_LABELS)).toHaveLength(9);
      expect(EVENT_LABELS.decision_pending).toBe('Decision pending');
    });

    it('PRESET_DEFAULTS has correct structure', () => {
      expect(Object.keys(PRESET_DEFAULTS)).toEqual(['conservative', 'moderate', 'everything']);
      expect(PRESET_DEFAULTS.conservative.decision_pending).toEqual(['desktop']);
      expect(PRESET_DEFAULTS.everything.decision_pending).toContain('webhook');
    });
  });
});
