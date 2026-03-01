import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner } from '../ErrorBanner';
import type { ErrorEntry } from '../ErrorBanner';

// ── Mock IntersectionObserver (not available in jsdom) ────────────────

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor() {}
  });
});

// ── Helpers ───────────────────────────────────────────────────────────

function makeErrors(count: number): ErrorEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `error-${i + 1}`,
    agentLabel: `Developer ${i + 1}`,
    message: `Something went wrong in task ${i + 1}`,
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ErrorBanner', () => {
  it('renders nothing when no errors', () => {
    const { container } = render(
      <ErrorBanner errors={[]} onScrollToError={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders with role="alert" and aria-live="assertive"', () => {
    render(
      <ErrorBanner errors={makeErrors(1)} onScrollToError={vi.fn()} />,
    );
    const banner = screen.getByTestId('error-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
  });

  it('shows singular "1 error" label', () => {
    render(
      <ErrorBanner errors={makeErrors(1)} onScrollToError={vi.fn()} />,
    );
    expect(screen.getByText('1 error')).toBeInTheDocument();
  });

  it('shows plural "3 errors" label', () => {
    render(
      <ErrorBanner errors={makeErrors(3)} onScrollToError={vi.fn()} />,
    );
    expect(screen.getByText('3 errors')).toBeInTheDocument();
  });

  it('expands to show error list on click', () => {
    render(
      <ErrorBanner errors={makeErrors(2)} onScrollToError={vi.fn()} />,
    );

    // Error list should not be visible initially
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    // Click to expand
    const expandBtn = screen.getByRole('button', { name: /2 errors.*Expand/i });
    fireEvent.click(expandBtn);

    // Error list should be visible
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Developer 1')).toBeInTheDocument();
    expect(screen.getByText('Developer 2')).toBeInTheDocument();
  });

  it('collapses error list on second click', () => {
    render(
      <ErrorBanner errors={makeErrors(2)} onScrollToError={vi.fn()} />,
    );

    const expandBtn = screen.getByRole('button', { name: /2 errors/i });
    fireEvent.click(expandBtn); // expand
    expect(screen.getByRole('list')).toBeInTheDocument();

    fireEvent.click(expandBtn); // collapse
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('calls onScrollToError when clicking an error item', () => {
    const onScrollToError = vi.fn();
    render(
      <ErrorBanner errors={makeErrors(2)} onScrollToError={onScrollToError} />,
    );

    // Expand first
    const expandBtn = screen.getByRole('button', { name: /2 errors/i });
    fireEvent.click(expandBtn);

    // Click first error
    const errorBtn = screen.getByRole('button', { name: /Developer 1/ });
    fireEvent.click(errorBtn);

    expect(onScrollToError).toHaveBeenCalledWith('error-1');
  });

  it('dismisses when clicking the X button', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorBanner
        errors={makeErrors(1)}
        onScrollToError={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Banner should disappear
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('dismisses when clicking an error (scrolls to it)', () => {
    const onScrollToError = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ErrorBanner
        errors={makeErrors(1)}
        onScrollToError={onScrollToError}
        onDismiss={onDismiss}
      />,
    );

    // Expand and click error
    fireEvent.click(screen.getByRole('button', { name: /1 error/i }));
    fireEvent.click(screen.getByRole('button', { name: /Developer 1/ }));

    expect(onScrollToError).toHaveBeenCalledWith('error-1');
    expect(onDismiss).toHaveBeenCalled();
    expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
  });

  it('each error item has accessible label', () => {
    render(
      <ErrorBanner errors={makeErrors(1)} onScrollToError={vi.fn()} />,
    );

    // Expand
    fireEvent.click(screen.getByRole('button', { name: /1 error/i }));

    const errorBtn = screen.getByRole('button', {
      name: /Scroll to error: Developer 1/,
    });
    expect(errorBtn).toBeInTheDocument();
  });
});
