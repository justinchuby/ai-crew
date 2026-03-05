import { useState, useCallback } from 'react';

export interface Attachment {
  id: string;
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  /** Base64-encoded file data (for images < 10MB) */
  data?: string;
  /** Local file path (Electron/Tauri — may be available) */
  localPath?: string;
  /** Small thumbnail data URL for preview */
  thumbnailDataUrl?: string;
  size: number;
}

export interface UseAttachmentsResult {
  attachments: Attachment[];
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export function useAttachments(): UseAttachmentsResult {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return { attachments, addAttachment, removeAttachment, clearAttachments };
}
