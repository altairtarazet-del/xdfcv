import { Paperclip } from 'lucide-react';
import { SenderAvatar } from './SenderAvatar';
import type { SMTPDevMessage } from '@/types/mail';

interface MailMessageRowProps {
  message: SMTPDevMessage;
  isSelected: boolean;
  onClick: () => void;
  formatDate: (date?: string) => string;
}

function getFromDisplay(from: SMTPDevMessage['from']): string {
  if (typeof from === 'string') return from;
  return from?.name || from?.address || 'Bilinmeyen';
}

export function MailMessageRow({ message, isSelected, onClick, formatDate }: MailMessageRowProps) {
  const senderName = getFromDisplay(message.from);
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const preview = message.text?.substring(0, 80) || '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-all hover:bg-muted/40 border-l-2 ${
        isSelected
          ? 'bg-primary/5 border-l-primary'
          : 'border-l-transparent'
      }`}
    >
      <SenderAvatar name={senderName} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {senderName}
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
            {formatDate(message.date || message.createdAt)}
          </span>
        </div>
        <p className="text-sm text-foreground truncate">
          {message.subject || '(Konu yok)'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">
            {preview || '...'}
          </p>
          {hasAttachments && (
            <Paperclip size={12} className="text-muted-foreground shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}
