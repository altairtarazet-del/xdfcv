import DOMPurify from 'dompurify';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Reply,
  Forward,
  Trash2,
  Paperclip,
  RefreshCw,
  Mail,
  Download,
} from 'lucide-react';
import { SenderAvatar } from './SenderAvatar';
import type { SMTPDevMessage } from '@/types/mail';

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'a', 'img', 'table', 'tr', 'td', 'th',
    'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'hr', 'thead', 'tbody', 'caption',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'target', 'class', 'width', 'height',
    'border', 'cellpadding', 'cellspacing', 'align', 'valign',
  ],
  ALLOW_DATA_ATTR: false,
};

interface MailReadingPaneProps {
  message: SMTPDevMessage | null;
  fullMessageData: SMTPDevMessage | null;
  isLoading: boolean;
  downloadingAttachment: string | null;
  onDownloadAttachment: (att: { id?: string; filename: string; contentType?: string }) => void;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}

function getFromDisplay(from: SMTPDevMessage['from']): string {
  if (typeof from === 'string') return from;
  return from?.name || from?.address || 'Bilinmeyen';
}

function getFromAddress(from: SMTPDevMessage['from']): string {
  if (typeof from === 'string') return from;
  return from?.address || '';
}

function getToDisplay(to: SMTPDevMessage['to']): string {
  if (!to) return '';
  if (typeof to === 'string') return to;
  if (Array.isArray(to)) {
    return to.map((t) => (typeof t === 'string' ? t : t.address)).join(', ');
  }
  return '';
}

export function MailReadingPane({
  message,
  fullMessageData,
  isLoading,
  downloadingAttachment,
  onDownloadAttachment,
}: MailReadingPaneProps) {
  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="rounded-2xl bg-muted/30 p-5 mb-4">
          <Mail size={32} className="text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground text-sm">Bir mesaj secin</p>
        <p className="text-muted-foreground/50 text-xs mt-1">
          Sol panelden bir mesaja tiklayarak icerigini buradan gorebilirsiniz
        </p>
      </div>
    );
  }

  const senderName = getFromDisplay(message.from);
  const senderAddress = getFromAddress(message.from);
  const toDisplay = getToDisplay(message.to);
  const attachments = fullMessageData?.attachments || message.attachments;

  const htmlContent = fullMessageData?.html || message.html;
  const textContent = fullMessageData?.text || message.text;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {message.subject || '(Konu yok)'}
        </h2>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <SenderAvatar name={senderName} size="md" />
            <div>
              <p className="text-sm font-medium text-foreground">{senderName}</p>
              <p className="text-xs text-muted-foreground font-mono">{senderAddress}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alici: {toDisplay}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">
              {new Date(message.date || message.createdAt || '').toLocaleString('tr-TR')}
            </p>
            <div className="flex items-center gap-1 mt-1 justify-end">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Yanitla">
                <Reply size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ilet">
                <Forward size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Sil">
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        </div>

        {/* Attachments */}
        {attachments && attachments.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center gap-2 flex-wrap">
              <Paperclip size={14} className="text-muted-foreground" />
              {attachments.map((att, i) => (
                <button
                  key={i}
                  onClick={() => onDownloadAttachment(att)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-xs text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  title="Indirmek icin tikla"
                >
                  <Download size={12} />
                  {att.filename}
                  {downloadingAttachment === att.id && (
                    <RefreshCw size={12} className="animate-spin" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw size={24} className="mx-auto text-primary animate-spin mb-2" />
              <span className="text-muted-foreground text-sm">Icerik yukleniyor...</span>
            </div>
          ) : htmlContent ? (
            <div
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG),
              }}
            />
          ) : textContent ? (
            <pre className="font-mono text-sm whitespace-pre-wrap text-foreground">
              {textContent}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Icerik yok</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
