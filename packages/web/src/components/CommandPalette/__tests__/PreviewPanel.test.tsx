// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewPanel, type PreviewData } from '../PreviewPanel';

describe('PreviewPanel', () => {
  it('renders nothing when data is null', () => {
    const { container } = render(<PreviewPanel data={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders preview with title and fields', () => {
    const data: PreviewData = {
      type: 'agent',
      title: 'Developer Agent',
      subtitle: 'Running',
      fields: [
        { label: 'Model', value: 'gpt-4' },
        { label: 'Status', value: 'active' },
      ],
    };
    render(<PreviewPanel data={data} />);
    expect(screen.getByText('Developer Agent')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    const data: PreviewData = {
      type: 'project',
      title: 'My Project',
      subtitle: 'In Progress',
      fields: [],
    };
    render(<PreviewPanel data={data} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    const onClick = vi.fn();
    const data: PreviewData = {
      type: 'command',
      title: 'Run Tests',
      fields: [],
      actions: [{ label: 'Execute', onClick }],
    };
    render(<PreviewPanel data={data} />);
    fireEvent.click(screen.getByText('Execute'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders multiple fields', () => {
    const data: PreviewData = {
      type: 'info',
      title: 'Info Panel',
      fields: [
        { label: 'Field1', value: 'Value1' },
        { label: 'Field2', value: 'Value2' },
        { label: 'Field3', value: 'Value3' },
      ],
    };
    render(<PreviewPanel data={data} />);
    expect(screen.getByText('Value1')).toBeInTheDocument();
    expect(screen.getByText('Value3')).toBeInTheDocument();
  });
});
