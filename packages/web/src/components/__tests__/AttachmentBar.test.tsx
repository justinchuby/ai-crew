import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttachmentBar } from '../AttachmentBar';
import type { Attachment } from '../../hooks/useAttachments';

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    kind: 'image',
    name: 'screenshot.png',
    mimeType: 'image/png',
    size: 1024,
    ...overrides,
  };
}

describe('AttachmentBar', () => {
  it('renders nothing when there are no attachments', () => {
    const { container } = render(<AttachmentBar attachments={[]} onRemove={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders attachment names', () => {
    const attachments = [
      makeAttachment({ id: 'a1', name: 'file1.png' }),
      makeAttachment({ id: 'a2', name: 'file2.jpg', kind: 'file' }),
    ];
    render(<AttachmentBar attachments={attachments} onRemove={() => {}} />);
    expect(screen.getByText('file1.png')).toBeDefined();
    expect(screen.getByText('file2.jpg')).toBeDefined();
  });

  it('renders file sizes', () => {
    const attachments = [
      makeAttachment({ id: 'a1', size: 512 }),
      makeAttachment({ id: 'a2', size: 2048 }),
      makeAttachment({ id: 'a3', size: 1.5 * 1024 * 1024 }),
    ];
    render(<AttachmentBar attachments={attachments} onRemove={() => {}} />);
    expect(screen.getByText('512 B')).toBeDefined();
    expect(screen.getByText('2.0 KB')).toBeDefined();
    expect(screen.getByText('1.5 MB')).toBeDefined();
  });

  it('calls onRemove with attachment id when remove button is clicked', () => {
    const onRemove = vi.fn();
    const attachments = [makeAttachment({ id: 'remove-me', name: 'test.png' })];
    render(<AttachmentBar attachments={attachments} onRemove={onRemove} />);

    const removeButton = screen.getByRole('button', { name: 'Remove test.png' });
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith('remove-me');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders thumbnail image when thumbnailDataUrl is provided', () => {
    const attachments = [
      makeAttachment({
        id: 'img-1',
        kind: 'image',
        name: 'photo.png',
        thumbnailDataUrl: 'data:image/png;base64,abc123',
      }),
    ];
    render(<AttachmentBar attachments={attachments} onRemove={() => {}} />);
    const img = screen.getByAltText('photo.png');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,abc123');
  });

  it('renders icon placeholder when no thumbnail is available', () => {
    const attachments = [
      makeAttachment({ id: 'f1', kind: 'file', name: 'utils.ts', thumbnailDataUrl: undefined }),
    ];
    const { container } = render(<AttachmentBar attachments={attachments} onRemove={() => {}} />);
    // Should not have an img element
    expect(container.querySelector('img')).toBeNull();
    // Should have the file name
    expect(screen.getByText('utils.ts')).toBeDefined();
  });
});
