// @vitest-environment jsdom
/**
 * Coverage tests for PredictionsPanel — sorting, accuracy display, "more" button,
 * loading state, and empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUsePredictions = vi.fn();
const mockUsePredictionAccuracy = vi.fn();

vi.mock('../../../hooks/usePredictions', () => ({
  usePredictions: () => mockUsePredictions(),
  usePredictionAccuracy: () => mockUsePredictionAccuracy(),
}));

vi.mock('../PredictionCard', () => ({
  PredictionCard: ({ prediction }: any) => <div data-testid="prediction-card">{prediction.title}</div>,
}));

vi.mock('../../Shared', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

import { PredictionsPanel } from '../PredictionsPanel';

describe('PredictionsPanel — coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading state', () => {
    mockUsePredictions.mockReturnValue({ predictions: [], loading: true, dismiss: vi.fn() });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);
    expect(screen.getByText('Loading predictions…')).toBeInTheDocument();
  });

  it('shows empty state when no predictions', () => {
    mockUsePredictions.mockReturnValue({ predictions: [], loading: false, dismiss: vi.fn() });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);
    expect(screen.getByText('No active predictions')).toBeInTheDocument();
  });

  it('renders predictions sorted by severity', () => {
    mockUsePredictions.mockReturnValue({
      predictions: [
        { id: '1', type: 'risk', severity: 'info', confidence: 0.5, title: 'Info pred' },
        { id: '2', type: 'risk', severity: 'critical', confidence: 0.9, title: 'Critical pred' },
        { id: '3', type: 'risk', severity: 'warning', confidence: 0.7, title: 'Warning pred' },
      ],
      loading: false,
      dismiss: vi.fn(),
    });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);

    const cards = screen.getAllByTestId('prediction-card');
    expect(cards[0].textContent).toBe('Critical pred');
    expect(cards[1].textContent).toBe('Warning pred');
    expect(cards[2].textContent).toBe('Info pred');
  });

  it('shows completion_estimate first regardless of severity', () => {
    mockUsePredictions.mockReturnValue({
      predictions: [
        { id: '1', type: 'risk', severity: 'critical', confidence: 0.9, title: 'Critical' },
        { id: '2', type: 'completion_estimate', severity: 'info', confidence: 0.5, title: 'ETA' },
      ],
      loading: false,
      dismiss: vi.fn(),
    });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);

    const cards = screen.getAllByTestId('prediction-card');
    expect(cards[0].textContent).toBe('ETA');
  });

  it('shows "+N more" button when more than 5 predictions', () => {
    const predictions = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      type: 'risk',
      severity: 'info',
      confidence: 0.5,
      title: `Prediction ${i}`,
    }));
    mockUsePredictions.mockReturnValue({ predictions, loading: false, dismiss: vi.fn() });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);

    expect(screen.getByText('+3 more predictions')).toBeInTheDocument();
    expect(screen.getAllByTestId('prediction-card')).toHaveLength(5);
  });

  it('shows accuracy when available', () => {
    mockUsePredictions.mockReturnValue({ predictions: [], loading: false, dismiss: vi.fn() });
    mockUsePredictionAccuracy.mockReturnValue({ accuracy: 85.7, total: 10 });
    render(<PredictionsPanel />);
    expect(screen.getByText('Accuracy: 86% (10 predictions)')).toBeInTheDocument();
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });

  it('does not show accuracy when total is 0', () => {
    mockUsePredictions.mockReturnValue({ predictions: [], loading: false, dismiss: vi.fn() });
    mockUsePredictionAccuracy.mockReturnValue({ accuracy: 0, total: 0 });
    render(<PredictionsPanel />);
    expect(screen.queryByText(/Accuracy:/)).not.toBeInTheDocument();
  });

  it('sorts by confidence when severity is equal', () => {
    mockUsePredictions.mockReturnValue({
      predictions: [
        { id: '1', type: 'risk', severity: 'warning', confidence: 0.3, title: 'Low conf' },
        { id: '2', type: 'risk', severity: 'warning', confidence: 0.9, title: 'High conf' },
      ],
      loading: false,
      dismiss: vi.fn(),
    });
    mockUsePredictionAccuracy.mockReturnValue(null);
    render(<PredictionsPanel />);

    const cards = screen.getAllByTestId('prediction-card');
    expect(cards[0].textContent).toBe('High conf');
    expect(cards[1].textContent).toBe('Low conf');
  });
});
