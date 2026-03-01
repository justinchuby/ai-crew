import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterTabs, type FilterTabItem } from '../FilterTabs';

const items: FilterTabItem[] = [
  { value: 'alpha', label: 'Alpha', count: 3 },
  { value: 'beta', label: 'Beta', count: 7 },
  { value: 'gamma', label: 'Gamma' },
];

describe('FilterTabs', () => {
  it('renders all tab items', () => {
    render(<FilterTabs items={items} activeValue={null} onSelect={() => {}} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('shows counts when provided', () => {
    render(<FilterTabs items={items} activeValue={null} onSelect={() => {}} />);
    expect(screen.getByText('(3)')).toBeTruthy();
    expect(screen.getByText('(7)')).toBeTruthy();
    // Gamma has no count
    expect(screen.queryByText('Gamma')?.closest('button')?.textContent).toBe('Gamma');
  });

  it('renders "All" tab when allCount is provided', () => {
    render(
      <FilterTabs items={items} activeValue={null} onSelect={() => {}} allCount={10} />,
    );
    expect(screen.getByText('All (10)')).toBeTruthy();
  });

  it('does not render "All" tab when allCount is omitted', () => {
    render(<FilterTabs items={items} activeValue="alpha" onSelect={() => {}} />);
    expect(screen.queryByText(/^All/)).toBeNull();
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <FilterTabs items={items} activeValue="beta" onSelect={() => {}} allCount={10} />,
    );
    const betaBtn = screen.getByText('Beta').closest('button')!;
    expect(betaBtn.getAttribute('aria-selected')).toBe('true');

    const alphaBtn = screen.getByText('Alpha').closest('button')!;
    expect(alphaBtn.getAttribute('aria-selected')).toBe('false');

    const allBtn = screen.getByText('All (10)');
    expect(allBtn.getAttribute('aria-selected')).toBe('false');
  });

  it('marks "All" as active when activeValue is null', () => {
    render(
      <FilterTabs items={items} activeValue={null} onSelect={() => {}} allCount={10} />,
    );
    const allBtn = screen.getByText('All (10)');
    expect(allBtn.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onSelect with the tab value when clicked', () => {
    const onSelect = vi.fn();
    render(<FilterTabs items={items} activeValue={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Beta').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith('beta');
  });

  it('calls onSelect(null) when "All" is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FilterTabs items={items} activeValue="alpha" onSelect={onSelect} allCount={10} />,
    );
    fireEvent.click(screen.getByText('All (10)'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('renders icons when provided', () => {
    const itemsWithIcon: FilterTabItem[] = [
      { value: 'x', label: 'WithIcon', icon: <span data-testid="icon">★</span> },
    ];
    render(<FilterTabs items={itemsWithIcon} activeValue="x" onSelect={() => {}} />);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('applies custom className to the container', () => {
    const { container } = render(
      <FilterTabs items={items} activeValue={null} onSelect={() => {}} className="mb-3" />,
    );
    expect(container.firstElementChild?.classList.contains('mb-3')).toBe(true);
  });

  it('uses role="tablist" on container', () => {
    render(<FilterTabs items={items} activeValue={null} onSelect={() => {}} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
  });
});
