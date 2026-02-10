import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  PenSquare,
  RefreshCw,
  Mail,
} from 'lucide-react';
import type { SMTPDevMailbox } from '@/types/mail';

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  INBOX: Inbox,
  SENT: Send,
  DRAFTS: FileText,
  TRASH: Trash2,
};

interface MailSidebarProps {
  mailboxes: SMTPDevMailbox[];
  selectedMailbox: SMTPDevMailbox | null;
  isLoading: boolean;
  onSelect: (mailbox: SMTPDevMailbox) => void;
  onRefresh: () => void;
  onCompose: () => void;
}

export function MailSidebar({
  mailboxes,
  selectedMailbox,
  isLoading,
  onSelect,
  onRefresh,
  onCompose,
}: MailSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Compose Button */}
      <div className="p-3">
        <Button onClick={onCompose} className="w-full gap-2 bg-primary/15 text-primary hover:bg-primary/25 border-0">
          <PenSquare size={16} />
          Yeni Mail
        </Button>
      </div>

      {/* Folder List */}
      <ScrollArea className="flex-1 px-2">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ) : mailboxes.length === 0 ? (
          <div className="text-center py-8">
            <Mail size={20} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-xs">Klasor bulunamadi</p>
          </div>
        ) : (
          <div className="space-y-0.5 pb-2">
            {mailboxes.map((mailbox) => {
              const name = (mailbox.name || mailbox.id || '').toUpperCase();
              const Icon = FOLDER_ICONS[name] || Mail;
              const isActive = selectedMailbox?.id === mailbox.id;

              return (
                <button
                  key={mailbox.id}
                  onClick={() => onSelect(mailbox)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                  <span className="truncate flex-1 text-left">{mailbox.name || mailbox.id}</span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Refresh */}
      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="w-full gap-1.5 text-xs text-muted-foreground"
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Yenile
        </Button>
      </div>
    </div>
  );
}
