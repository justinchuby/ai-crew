import { X, FileIcon, ImageIcon } from 'lucide-react';
import type { Attachment } from '../hooks/useAttachments';

interface AttachmentBarProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="relative mb-1">
      <div className="flex flex-wrap gap-2 px-3 py-2 rounded-lg border border-th-border bg-th-bg shadow-lg">
        {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-md bg-th-bg border border-th-border text-xs text-th-text-alt group hover:border-th-border-hover transition-colors"
        >
          <AttachmentThumbnail attachment={att} />
          <div className="flex flex-col min-w-0">
            <span className="font-mono truncate max-w-[120px]">{att.name}</span>
            <span className="text-[10px] text-th-text-muted">{formatFileSize(att.size)}</span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="ml-1 p-0.5 rounded hover:bg-red-500/20 text-th-text-muted hover:text-red-400 transition-colors"
            aria-label={`Remove ${att.name}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}

function AttachmentThumbnail({ attachment }: { attachment: Attachment }) {
  if (attachment.kind === 'image' && attachment.thumbnailDataUrl) {
    return (
      <img
        src={attachment.thumbnailDataUrl}
        alt={attachment.name}
        className="w-10 h-10 rounded object-cover border border-th-border/50"
      />
    );
  }

  const Icon = attachment.kind === 'image' ? ImageIcon : FileIcon;
  return (
    <div className="w-10 h-10 rounded bg-th-bg-alt flex items-center justify-center border border-th-border/50">
      <Icon className="w-5 h-5 text-th-text-muted" />
    </div>
  );
}
