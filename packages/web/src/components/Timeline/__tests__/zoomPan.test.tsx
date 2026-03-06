/**
 * Tests for Timeline zoom controls, drag-to-pan, wheel zoom/pan,
 * and time window label display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TimelineData, TimelineSegment, TimelineAgent } from '../useTimelineData';

// Mock @visx/responsive ParentSize
vi.mock('@visx/responsive', () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 1000, height: 600 }),
}));

const { TimelineContainer } = await import('../TimelineContainer');

// ── Test data factory ─────────────────────────────────────────────

const BASE_TIME = new Date('2026-03-01T10:00:00Z').getTime();

function ts(offsetSeconds: number): string {
  return new Date(BASE_TIME + offsetSeconds * 1000).toISOString();
}

function makeSegment(status: TimelineSegment['status'], startSec: number, endSec?: number): TimelineSegment {
  return { status, startAt: ts(startSec), endAt: endSec != null ? ts(endSec) : undefined };
}

function makeAgent(id: string, role: string, segments: TimelineSegment[]): TimelineAgent {
  return { id, shortId: id.slice(0, 8), role, createdAt: segments[0]?.startAt ?? ts(0), segments };
}

function makeTestData(durationSeconds = 3600): TimelineData {
  return {
    agents: [
      makeAgent('lead-001', 'lead', [makeSegment('running', 0, durationSeconds)]),
      makeAgent('dev-002', 'developer', [makeSegment('running', 60, durationSeconds)]),
    ],
    communications: [],
    locks: [],
    timeRange: { start: ts(0), end: ts(durationSeconds) },
  };
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── Zoom Control Buttons ──────────────────────────────────────────

describe('Zoom Controls', () => {
  it('renders zoom in, zoom out, and label', () => {
    render(<TimelineContainer data={makeTestData()} />);
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    // At default zoom, shows "Full"
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('zoom out is disabled at 1x', () => {
    render(<TimelineContainer data={makeTestData()} />);
    const btn = screen.getByLabelText('Zoom out');
    expect(btn).toBeDisabled();
  });

  it('zoom in changes the time window label', () => {
    render(<TimelineContainer data={makeTestData()} />);
    const zoomIn = screen.getByLabelText('Zoom in');
    fireEvent.click(zoomIn);
    // After zoom in, should no longer show "Full"
    expect(screen.queryByText('Full')).not.toBeInTheDocument();
  });

  it('shows Fit button after zooming in', () => {
    render(<TimelineContainer data={makeTestData()} />);
    expect(screen.queryByText('⊞ Fit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByText('⊞ Fit')).toBeInTheDocument();
  });

  it('Fit button resets zoom to full view', () => {
    render(<TimelineContainer data={makeTestData()} />);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(screen.getByText('⊞ Fit')).toBeInTheDocument();
    fireEvent.click(screen.getByText('⊞ Fit'));
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.queryByText('⊞ Fit')).not.toBeInTheDocument();
  });

  it('zoom in then zoom out returns to full', () => {
    render(<TimelineContainer data={makeTestData()} />);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(screen.getByText('Full')).toBeInTheDocument();
  });
});

// ── Time Window Label ─────────────────────────────────────────────

describe('Time Window Label', () => {
  it('shows "Full" at default zoom', () => {
    render(<TimelineContainer data={makeTestData(3600)} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('shows time-based label when zoomed in', () => {
    const { container } = render(<TimelineContainer data={makeTestData(3600)} />);
    // Zoom in 3 times (1.5^3 ≈ 3.375x) — 1h / 3.375 ≈ 18m
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    // The label span has a title like "3.4× zoom" and contains a time like "18m"
    const label = container.querySelector('span[title*="zoom"]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.textContent).toMatch(/\d+m/);
  });
});

// ── Cursor Style ──────────────────────────────────────────────────

describe('Drag Cursor', () => {
  it('shows grab cursor when zoomed in', () => {
    const { container } = render(<TimelineContainer data={makeTestData()} />);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    const timeline = container.querySelector('.cursor-grab');
    expect(timeline).not.toBeNull();
  });

  it('no grab cursor at 1x zoom', () => {
    const { container } = render(<TimelineContainer data={makeTestData()} />);
    const timeline = container.querySelector('.cursor-grab');
    expect(timeline).toBeNull();
  });
});

// ── Wheel Events ──────────────────────────────────────────────────

describe('Wheel Zoom', () => {
  it('Ctrl+wheel up zooms in', () => {
    render(<TimelineContainer data={makeTestData()} />);
    expect(screen.getByText('Full')).toBeInTheDocument();
    // Find timeline area (the overflow-auto div)
    const svg = screen.getByRole('img');
    const container = svg.parentElement!;
    // Ctrl+wheel up (negative deltaY = zoom in)
    fireEvent.wheel(container, { deltaY: -100, ctrlKey: true });
    expect(screen.queryByText('Full')).not.toBeInTheDocument();
  });
});
