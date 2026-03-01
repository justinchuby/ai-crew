import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders with default title and description', () => {
    render(<EmptyState />);
    expect(screen.getByText('No crew activity yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Start a project to see your AI agents/),
    ).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<EmptyState />);
    const el = screen.getByTestId('empty-state');
    expect(el).toHaveAttribute('role', 'status');
  });

  it('accepts custom title and description', () => {
    render(
      <EmptyState
        title="Custom Title"
        description="Custom description text"
      />,
    );
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom description text')).toBeInTheDocument();
  });

  it('shows helpful hint text about agents and communications', () => {
    render(<EmptyState />);
    expect(screen.getByText('Agents will appear here')).toBeInTheDocument();
    expect(
      screen.getByText('Communications shown as links'),
    ).toBeInTheDocument();
  });

  it('renders the Users icon placeholder', () => {
    const { container } = render(<EmptyState />);
    // lucide-react renders an SVG element
    const svgIcon = container.querySelector('svg');
    expect(svgIcon).not.toBeNull();
  });

  it('has aria-label matching the title', () => {
    render(<EmptyState title="Test Title" />);
    const el = screen.getByTestId('empty-state');
    expect(el).toHaveAttribute('aria-label', 'Test Title');
  });
});
