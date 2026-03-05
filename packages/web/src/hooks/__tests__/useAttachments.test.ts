import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAttachments, type Attachment } from '../useAttachments';

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'test-id-1',
    kind: 'image',
    name: 'screenshot.png',
    mimeType: 'image/png',
    size: 1024,
    ...overrides,
  };
}

describe('useAttachments', () => {
  it('starts with empty attachments', () => {
    const { result } = renderHook(() => useAttachments());
    expect(result.current.attachments).toEqual([]);
  });

  it('adds an attachment', () => {
    const { result } = renderHook(() => useAttachments());
    const attachment = makeAttachment();

    act(() => {
      result.current.addAttachment(attachment);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]).toEqual(attachment);
  });

  it('adds multiple attachments', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addAttachment(makeAttachment({ id: 'a1', name: 'file1.png' }));
      result.current.addAttachment(makeAttachment({ id: 'a2', name: 'file2.png' }));
    });

    expect(result.current.attachments).toHaveLength(2);
    expect(result.current.attachments[0].id).toBe('a1');
    expect(result.current.attachments[1].id).toBe('a2');
  });

  it('removes an attachment by id', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addAttachment(makeAttachment({ id: 'keep' }));
      result.current.addAttachment(makeAttachment({ id: 'remove' }));
    });

    act(() => {
      result.current.removeAttachment('remove');
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].id).toBe('keep');
  });

  it('handles removing a non-existent id gracefully', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addAttachment(makeAttachment({ id: 'exists' }));
    });

    act(() => {
      result.current.removeAttachment('does-not-exist');
    });

    expect(result.current.attachments).toHaveLength(1);
  });

  it('clears all attachments', () => {
    const { result } = renderHook(() => useAttachments());

    act(() => {
      result.current.addAttachment(makeAttachment({ id: 'a1' }));
      result.current.addAttachment(makeAttachment({ id: 'a2' }));
      result.current.addAttachment(makeAttachment({ id: 'a3' }));
    });

    expect(result.current.attachments).toHaveLength(3);

    act(() => {
      result.current.clearAttachments();
    });

    expect(result.current.attachments).toEqual([]);
  });

  it('supports file kind attachments', () => {
    const { result } = renderHook(() => useAttachments());
    const fileAttachment = makeAttachment({
      id: 'file-1',
      kind: 'file',
      name: 'utils.ts',
      mimeType: 'text/typescript',
      localPath: '/src/utils.ts',
    });

    act(() => {
      result.current.addAttachment(fileAttachment);
    });

    expect(result.current.attachments[0].kind).toBe('file');
    expect(result.current.attachments[0].localPath).toBe('/src/utils.ts');
  });
});
