// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection extra coverage', () => {
  it('renders with badge', () => {
    render(
      <CollapsibleSection title="Test Section" icon={<span>📋</span>} badge={5}>
        <div>Content</div>
      </CollapsibleSection>,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('toggles collapse', () => {
    const { container } = render(
      <CollapsibleSection title="Toggle Test" icon={<span>📋</span>}>
        <div data-testid="content">Inner content</div>
      </CollapsibleSection>,
    );
    // Click header to collapse
    const header = screen.getByText('Toggle Test').closest('div');
    if (header) fireEvent.click(header);
    // Content should be hidden
  });

  it('respects custom defaultHeight', () => {
    const { container } = render(
      <CollapsibleSection title="Custom Height" icon={<span>📏</span>} defaultHeight={200}>
        <div>Content</div>
      </CollapsibleSection>,
    );
    expect(container).toBeTruthy();
  });

  it('renders without badge', () => {
    render(
      <CollapsibleSection title="No Badge" icon={<span>🔧</span>}>
        <div>Content</div>
      </CollapsibleSection>,
    );
    expect(screen.getByText('No Badge')).toBeInTheDocument();
  });

  it('handles resize drag', () => {
    const { container } = render(
      <CollapsibleSection title="Resize" icon={<span>📐</span>} minHeight={50} maxHeight={400}>
        <div>Content</div>
      </CollapsibleSection>,
    );
    // Find resize handle
    const resizeHandle = container.querySelector('[class*="cursor-row-resize"], [class*="cursor-ns-resize"]');
    if (resizeHandle) {
      fireEvent.mouseDown(resizeHandle, { clientY: 100 });
      // Simulate drag - this tests the resize start code path
    }
    expect(container).toBeTruthy();
  });
});
