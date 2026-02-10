import { useState, useEffect, useCallback, useRef } from 'react';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  X,
  Inbox,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { MailSidebar } from '@/components/portal/MailSidebar';
import { MailMessageRow } from '@/components/portal/MailMessageRow';
import { MailReadingPane } from '@/components/portal/MailReadingPane';
import { MailComposeWindow } from '@/components/portal/MailComposeWindow';
import { EmptyState } from '@/components/portal/EmptyState';
import type { SMTPDevMailbox, SMTPDevMessage } from '@/types/mail';

interface PaginationView {
  first?: string;
  last?: string;
  next?: string;
  previous?: string;
}

export default function PortalInbox() {
  const { portalUser } = usePortalAuth();
  const { toast } = useToast();

  // Data
  const [mailboxes, setMailboxes] = useState<SMTPDevMailbox[]>([]);
  const [messages, setMessages] = useState<SMTPDevMessage[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<SMTPDevMailbox | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SMTPDevMessage | null>(null);
  const [fullMessageData, setFullMessageData] = useState<SMTPDevMessage | null>(null);

  // Loading
  const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingFullMessage, setIsLoadingFullMessage] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  // Search & pagination
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const [paginationView, setPaginationView] = useState<PaginationView | null>(null);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Mobile
  const [mobileView, setMobileView] = useState<'list' | 'reading'>('list');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const accountId = portalUser?.smtp_account_id;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ------- API CALLS (preserved from original) -------

  const fetchMailboxes = useCallback(async () => {
    if (!accountId) return;
    setIsLoadingMailboxes(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMailboxes', accountId },
      });
      if (error) throw error;
      const list = Array.isArray(data?.mailboxes) ? data.mailboxes : [];
      setMailboxes(list);
      if (list.length > 0 && !selectedMailbox) {
        const inbox = list.find((m: SMTPDevMailbox) =>
          (m.name || '').toUpperCase() === 'INBOX'
        ) || list[0];
        setSelectedMailbox(inbox);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Klasorler yuklenirken hata olustu' });
    } finally {
      setIsLoadingMailboxes(false);
    }
  }, [accountId, toast, selectedMailbox]);

  const fetchMessages = useCallback(async (mailboxId: string, page?: number) => {
    if (!accountId) return;
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMessages', accountId, mailboxId, page: page || currentPage },
      });
      if (error) throw error;
      const messageList = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(messageList);
      setTotalMessages(data?.totalItems || messageList.length);
      setPaginationView(data?.view || null);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Mesajlar yuklenirken hata olustu' });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [accountId, toast, currentPage]);

  const fetchFullMessage = useCallback(async (message: SMTPDevMessage) => {
    if (!accountId || !selectedMailbox) return;
    setSelectedMessage(message);
    setFullMessageData(null);
    setIsLoadingFullMessage(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMessage', accountId, mailboxId: selectedMailbox.id, messageId: message.id },
      });
      if (error) throw error;
      setFullMessageData(data);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Mesaj icerigi yuklenirken hata olustu' });
    } finally {
      setIsLoadingFullMessage(false);
    }
  }, [accountId, selectedMailbox, toast]);

  const handleDownloadAttachment = async (attachment: { id?: string; filename: string; contentType?: string }) => {
    if (!accountId || !selectedMailbox || !selectedMessage || !attachment.id) {
      toast({ variant: 'destructive', title: 'Hata', description: 'Ek indirilemedi' });
      return;
    }
    setDownloadingAttachment(attachment.id);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'getAttachment',
          accountId,
          mailboxId: selectedMailbox.id,
          messageId: selectedMessage.id,
          attachmentId: attachment.id,
          filename: attachment.filename,
        },
      });
      if (error) throw error;

      const byteCharacters = atob(data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.contentType || 'application/octet-stream' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({ title: 'Basarili', description: `${attachment.filename} indirildi` });
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Ek indirilirken hata olustu' });
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const handleSendEmail = async (to: string, subject: string, body: string) => {
    if (!to.trim() || !subject.trim()) {
      toast({ variant: 'destructive', title: 'Hata', description: 'Alici ve konu zorunludur' });
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'sendEmail', from: portalUser?.email, to: to.trim(), subject: subject.trim(), text: body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Basarili', description: 'Email gonderildi' });
      setShowCompose(false);
      if (selectedMailbox) {
        setTimeout(() => fetchMessages(selectedMailbox.id, currentPage), 1500);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gonderilemedi', description: err?.message || 'Email gonderilirken hata olustu' });
    } finally {
      setIsSending(false);
    }
  };

  // ------- EFFECTS -------

  useEffect(() => { fetchMailboxes(); }, [fetchMailboxes]);

  useEffect(() => {
    if (selectedMailbox) {
      setCurrentPage(1);
      setTotalMessages(0);
      setPaginationView(null);
      setMessageSearchQuery('');
      setSelectedMessage(null);
      setFullMessageData(null);
      fetchMessages(selectedMailbox.id, 1);
    }
  }, [selectedMailbox]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedMailbox && currentPage > 1) {
      fetchMessages(selectedMailbox.id, currentPage);
    }
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // 10s polling
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedMailbox && accountId) {
      pollRef.current = setInterval(() => {
        fetchMessages(selectedMailbox.id, currentPage);
      }, 10000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedMailbox, accountId, currentPage, fetchMessages]);

  // ------- HELPERS -------

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return 'Simdi';
    if (minutes < 60) return `${minutes} dk once`;
    if (hours < 24) return `${hours} saat once`;
    if (days < 7) return `${days} gun once`;
    return date.toLocaleDateString('tr-TR');
  };

  const totalPages = Math.ceil(totalMessages / 30);

  const filteredMessages = messages.filter((message) => {
    if (!messageSearchQuery) return true;
    const subject = (message.subject || '').toLowerCase();
    const fromAddr = typeof message.from === 'string' ? message.from : message.from?.address || '';
    const fromName = typeof message.from === 'string' ? '' : message.from?.name || '';
    const q = messageSearchQuery.toLowerCase();
    return subject.includes(q) || fromAddr.toLowerCase().includes(q) || fromName.toLowerCase().includes(q);
  });

  const handleSelectMessage = (message: SMTPDevMessage) => {
    fetchFullMessage(message);
    setMobileView('reading');
  };

  const handleSelectMailbox = (mailbox: SMTPDevMailbox) => {
    setSelectedMailbox(mailbox);
    setShowMobileSidebar(false);
  };

  // ------- MESSAGE LIST CONTENT -------

  const messageListContent = (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-2 border-b border-border flex items-center gap-2">
        {/* Mobile sidebar toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 lg:hidden shrink-0"
          onClick={() => setShowMobileSidebar(true)}
        >
          <Menu size={16} />
        </Button>

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <Input
            placeholder="Mesaj ara..."
            value={messageSearchQuery}
            onChange={(e) => setMessageSearchQuery(e.target.value)}
            className="pl-8 pr-8 text-sm h-8"
          />
          {messageSearchQuery && (
            <button
              onClick={() => setMessageSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => selectedMailbox && fetchMessages(selectedMailbox.id, currentPage)}
        >
          <RefreshCw size={14} className={isLoadingMessages ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        {!selectedMailbox ? (
          <EmptyState icon={Inbox} title="Bir klasor secin" />
        ) : isLoadingMessages ? (
          <div className="text-center py-12">
            <RefreshCw size={20} className="mx-auto text-primary animate-spin mb-2" />
            <span className="text-muted-foreground text-sm">Mesajlar yukleniyor...</span>
          </div>
        ) : filteredMessages.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={messageSearchQuery ? 'Arama sonucu bulunamadi' : 'Bu klasorde mesaj yok'}
          />
        ) : (
          <div className="divide-y divide-border/30">
            {filteredMessages.map((message) => (
              <MailMessageRow
                key={message.id}
                message={message}
                isSelected={selectedMessage?.id === message.id}
                onClick={() => handleSelectMessage(message)}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {totalMessages > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {totalMessages} mesaj
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoadingMessages}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-xs text-foreground px-1.5">
              {currentPage}/{totalPages || 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!paginationView?.next || isLoadingMessages}
              className="h-6 w-6 p-0"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // ------- MOBILE VIEW -------

  const mobileContent = (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Mobile Sidebar Sheet */}
      <Sheet open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Klasorler</SheetTitle>
          <MailSidebar
            mailboxes={mailboxes}
            selectedMailbox={selectedMailbox}
            isLoading={isLoadingMailboxes}
            onSelect={handleSelectMailbox}
            onRefresh={fetchMailboxes}
            onCompose={() => { setShowMobileSidebar(false); setShowCompose(true); }}
          />
        </SheetContent>
      </Sheet>

      {mobileView === 'list' ? (
        messageListContent
      ) : (
        <div className="flex flex-col h-full">
          <div className="px-3 py-2 border-b border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMobileView('list'); setSelectedMessage(null); setFullMessageData(null); }}
              className="gap-1.5 text-sm"
            >
              <ChevronLeft size={16} />
              Geri
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <MailReadingPane
              message={selectedMessage}
              fullMessageData={fullMessageData}
              isLoading={isLoadingFullMessage}
              downloadingAttachment={downloadingAttachment}
              onDownloadAttachment={handleDownloadAttachment}
            />
          </div>
        </div>
      )}
    </div>
  );

  // ------- DESKTOP 3-PANEL LAYOUT -------

  const desktopContent = (
    <div className="h-[calc(100vh-3.5rem)]">
      <ResizablePanelGroup direction="horizontal" autoSaveId="portal-mail-layout">
        {/* Panel 1: Sidebar */}
        <ResizablePanel defaultSize={15} minSize={12} maxSize={25} collapsible className="bg-card/30">
          <MailSidebar
            mailboxes={mailboxes}
            selectedMailbox={selectedMailbox}
            isLoading={isLoadingMailboxes}
            onSelect={handleSelectMailbox}
            onRefresh={fetchMailboxes}
            onCompose={() => setShowCompose(true)}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Panel 2: Message List */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
          {messageListContent}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Panel 3: Reading Pane */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <MailReadingPane
            message={selectedMessage}
            fullMessageData={fullMessageData}
            isLoading={isLoadingFullMessage}
            downloadingAttachment={downloadingAttachment}
            onDownloadAttachment={handleDownloadAttachment}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  return (
    <PortalLayout requireAuth={true}>
      {/* Desktop: 3-panel, Mobile: stacked */}
      <div className="hidden lg:block">
        {desktopContent}
      </div>
      <div className="lg:hidden">
        {mobileContent}
      </div>

      {/* Floating Compose Window */}
      <MailComposeWindow
        open={showCompose}
        onClose={() => setShowCompose(false)}
        fromEmail={portalUser?.email || ''}
        onSend={handleSendEmail}
        isSending={isSending}
      />
    </PortalLayout>
  );
}
