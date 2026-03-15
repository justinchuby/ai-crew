// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  BaseEdge: (props: Record<string, unknown>) => <path data-testid="base-edge" />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div data-testid="edge-label">{children}</div>,
  getBezierPath: () => ['M 0 0 C 50 0, 50 100, 100 100', 50, 50],
  getSmoothStepPath: () => ['M 0 0 L 50 50 L 100 100', 50, 50],
  useInternalNode: () => ({ internals: { positionAbsolute: { x: 0, y: 0 } } }),
}));

import { CommEdge } from '../CommEdge';

describe('CommEdge', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'bottom' as const,
    targetPosition: 'top' as const,
    data: { volume: 5 },
  };

  it('renders without crashing', () => {
    const { container } = render(
      <svg>
        <CommEdge {...defaultProps} />
      </svg>,
    );
    expect(container.querySelector('path')).toBeTruthy();
  });

  it('renders with different volumes', () => {
    const { container } = render(
      <svg>
        <CommEdge {...defaultProps} data={{ volume: 15 }} />
      </svg>,
    );
    expect(container).toBeTruthy();
  });

  it('renders with zero volume', () => {
    const { container } = render(
      <svg>
        <CommEdge {...defaultProps} data={{ volume: 0 }} />
      </svg>,
    );
    expect(container).toBeTruthy();
  });
});
