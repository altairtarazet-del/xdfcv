import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Mail,
  Inbox,
  RefreshCw,
  Search,
  User,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  X,
  Send,
  PenSquare,
} from 'lucide-react';
import { SMTPDevMailbox, SMTPDevMessage } from '@/types/mail';

interface PaginationView {
  first?: string;
  last?: string;
  next?: string;
  previous?: string;
}

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'img', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'thead', 'tbody', 'caption'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'class', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'valign'],
  ALLOW_DATA_ATTR: false,
};

export default function PortalInbox() {
  const { portalUser } = usePortalAuth();
  const { toast } = useToast();

  const [mailboxes, setMailboxes] = useState<SMTPDevMailbox[]>([]);
  const [messages, setMessages] = useState<SMTPDevMessage[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<SMTPDevMailbox | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SMTPDevMessage | null>(null);
  const [fullMessageData, setFullMessageData] = useState<SMTPDevMessage | null>(null);

  const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingFullMessage, setIsLoadingFullMessage] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const [paginationView, setPaginationView] = useState<PaginationView | null>(null);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Mobile: toggle folder panel
  const [showFolders, setShowFolders] = useState(false);

  const accountId = portalUser?.smtp_account_id;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch mailboxes
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
      // Auto-select INBOX
      if (list.length > 0 && !selectedMailbox) {
        const inbox = list.find((m: SMTPDevMailbox) =>
          (m.name || '').toUpperCase() === 'INBOX'
        ) || list[0];
        setSelectedMailbox(inbox);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Klasorler yuklenirken hata olustu',
      });
    } finally {
      setIsLoadingMailboxes(false);
    }
  }, [accountId, toast, selectedMailbox]);

  // Fetch messages
  const fetchMessages = useCallback(async (mailboxId: string, page?: number) => {
    if (!accountId) return;
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'getMessages',
          accountId,
          mailboxId,
          page: page || currentPage,
        },
      });
      if (error) throw error;
      const messageList = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(messageList);
      setTotalMessages(data?.totalItems || messageList.length);
      setPaginationView(data?.view || null);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Mesajlar yuklenirken hata olustu',
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [accountId, toast, currentPage]);

  // Fetch full message
  const fetchFullMessage = useCallback(async (message: SMTPDevMessage) => {
    if (!accountId || !selectedMailbox) return;
    setSelectedMessage(message);
    setFullMessageData(null);
    setIsLoadingFullMessage(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'getMessage',
          accountId,
          mailboxId: selectedMailbox.id,
          messageId: message.id,
        },
      });
      if (error) throw error;
      setFullMessageData(data);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Mesaj icerigi yuklenirken hata olustu',
      });
    } finally {
      setIsLoadingFullMessage(false);
    }
  }, [accountId, selectedMailbox, toast]);

  // Download attachment
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

  // Initial load
  useEffect(() => {
    fetchMailboxes();
  }, [fetchMailboxes]);

  // Load messages when mailbox changes
  useEffect(() => {
    if (selectedMailbox) {
      setCurrentPage(1);
      setTotalMessages(0);
      setPaginationView(null);
      setMessageSearchQuery('');
      fetchMessages(selectedMailbox.id, 1);
    }
  }, [selectedMailbox]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when page changes
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
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedMailbox, accountId, currentPage, fetchMessages]);

  // Helpers
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

  const getFromDisplay = (from: SMTPDevMessage['from']) => {
    if (typeof from === 'string') return from;
    return from?.name || from?.address || 'Bilinmeyen';
  };

  const getFromAddress = (from: SMTPDevMessage['from']) => {
    if (typeof from === 'string') return from;
    return from?.address || '';
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

  const handleSendEmail = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast({ variant: 'destructive', title: 'Hata', description: 'Alici ve konu zorunludur' });
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'sendEmail',
          from: portalUser?.email,
          to: composeTo.trim(),
          subject: composeSubject.trim(),
          text: composeBody,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Basarili', description: 'Email gonderildi' });
      setShowCompose(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      // Refresh messages to show sent mail
      if (selectedMailbox) {
        setTimeout(() => fetchMessages(selectedMailbox.id, currentPage), 1500);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Gonderilemedi',
        description: err?.message || 'Email gonderilirken hata olustu',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCloseMessageDialog = () => {
    setSelectedMessage(null);
    setFullMessageData(null);
  };

  return (
    <PortalLayout>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row">
        {/* Mobile Folder Toggle */}
        <div className="lg:hidden flex items-center gap-2 p-3 border-b border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFolders(!showFolders)}
          >
            <FolderOpen size={16} className="mr-1" />
            {selectedMailbox?.name || 'Klasorler'}
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => selectedMailbox && fetchMessages(selectedMailbox.id, currentPage)}
          >
            <RefreshCw size={16} className={isLoadingMessages ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Folder List - Sidebar */}
        <div className={`
          ${showFolders ? 'block' : 'hidden'} lg:block
          w-full lg:w-56 flex-shrink-0 border-r border-border bg-card/30
          ${showFolders ? 'absolute inset-0 z-30 bg-background lg:relative lg:z-auto' : ''}
        `}>
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Inbox size={16} className="text-primary" />
              Klasorler
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchMailboxes}
              >
                <RefreshCw size={14} className={isLoadingMailboxes ? 'animate-spin' : ''} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 lg:hidden"
                onClick={() => setShowFolders(false)}
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-6rem)]">
            {isLoadingMailboxes ? (
              <div className="text-center py-8">
                <span className="text-muted-foreground text-sm animate-pulse">Yukleniyor...</span>
              </div>
            ) : mailboxes.length === 0 ? (
              <div className="text-center py-8">
                <Mail size={24} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-xs">Klasor bulunamadi</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {mailboxes.map((mailbox) => (
                  <button
                    key={mailbox.id}
                    onClick={() => {
                      setSelectedMailbox(mailbox);
                      setShowFolders(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md transition-all text-sm ${
                      selectedMailbox?.id === mailbox.id
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Mail size={14} />
                      <span className="truncate">{mailbox.name || mailbox.id}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Message List */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Search bar + Compose button */}
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowCompose(true)}
              className="flex-shrink-0 h-9"
            >
              <PenSquare size={14} className="mr-1.5" />
              Yeni Mail
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Mesaj ara (konu, gonderen)..."
                value={messageSearchQuery}
                onChange={(e) => setMessageSearchQuery(e.target.value)}
                className="pl-9 text-sm h-9 bg-input border-border"
              />
              {messageSearchQuery && (
                <button
                  onClick={() => setMessageSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1">
            {!selectedMailbox ? (
              <div className="text-center py-16">
                <Inbox size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Bir klasor secin</p>
              </div>
            ) : isLoadingMessages ? (
              <div className="text-center py-8">
                <RefreshCw size={20} className="mx-auto text-primary animate-spin mb-2" />
                <span className="text-muted-foreground text-sm">Mesajlar yukleniyor...</span>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-16">
                <Mail size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {messageSearchQuery ? 'Arama sonucu bulunamadi' : 'Bu klasorde mesaj yok'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredMessages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => fetchFullMessage(message)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <User size={13} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate text-foreground">
                            {getFromDisplay(message.from)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground truncate">
                          {message.subject || '(Konu yok)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {message.text?.substring(0, 80) || '...'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(message.date || message.createdAt)}
                        </span>
                        {message.attachments && message.attachments.length > 0 && (
                          <Paperclip size={12} className="text-muted-foreground mt-1 ml-auto" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalMessages > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                <span className="text-[11px] text-muted-foreground">
                  Toplam: {totalMessages} mesaj
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoadingMessages}
                    className="h-7 text-xs"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="text-xs text-foreground px-2">
                    {currentPage}/{totalPages || 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentPage(p => p + 1)}
                    disabled={!paginationView?.next || isLoadingMessages}
                    className="h-7 text-xs"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Message Detail Dialog */}
        <Dialog open={!!selectedMessage} onOpenChange={handleCloseMessageDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground text-base">
                {selectedMessage?.subject || '(Konu yok)'}
              </DialogTitle>
            </DialogHeader>
            {selectedMessage && (
              <div className="flex-1 overflow-auto space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Gonderen:</span>
                    <p className="text-foreground font-mono text-sm">
                      {getFromDisplay(selectedMessage.from)}{' '}
                      <span className="text-primary text-xs">&lt;{getFromAddress(selectedMessage.from)}&gt;</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Alici:</span>
                    <p className="text-foreground font-mono text-sm">
                      {Array.isArray(selectedMessage.to)
                        ? selectedMessage.to.map((t) => (typeof t === 'string' ? t : t.address)).join(', ')
                        : selectedMessage.to}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Tarih:</span>
                    <p className="text-foreground font-mono text-sm">
                      {new Date(selectedMessage.date || selectedMessage.createdAt || '').toLocaleString('tr-TR')}
                    </p>
                  </div>
                  {((fullMessageData?.attachments || selectedMessage.attachments)?.length ?? 0) > 0 && (
                    <div>
                      <span className="text-muted-foreground text-xs">Ekler:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(fullMessageData?.attachments || selectedMessage.attachments)?.map((att, i) => (
                          <button
                            key={i}
                            onClick={() => handleDownloadAttachment(att)}
                            className="px-2 py-1 bg-muted rounded text-xs flex items-center gap-1 hover:bg-primary/20 transition-colors cursor-pointer"
                            title="Indirmek icin tikla"
                          >
                            <Paperclip size={12} />
                            {att.filename}
                            {downloadingAttachment === att.id && (
                              <RefreshCw size={12} className="animate-spin ml-1" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/30 pt-4">
                  {isLoadingFullMessage ? (
                    <div className="text-center py-8">
                      <RefreshCw size={24} className="mx-auto text-primary animate-spin mb-2" />
                      <span className="text-muted-foreground text-sm">Icerik yukleniyor...</span>
                    </div>
                  ) : fullMessageData?.html ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(fullMessageData.html, DOMPURIFY_CONFIG),
                      }}
                    />
                  ) : fullMessageData?.text ? (
                    <pre className="font-mono text-sm whitespace-pre-wrap text-foreground">
                      {fullMessageData.text}
                    </pre>
                  ) : selectedMessage.html ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(selectedMessage.html, DOMPURIFY_CONFIG),
                      }}
                    />
                  ) : selectedMessage.text ? (
                    <pre className="font-mono text-sm whitespace-pre-wrap text-foreground">
                      {selectedMessage.text}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-4">Icerik yok</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        {/* Compose Dialog */}
        <Dialog open={showCompose} onOpenChange={(open) => { if (!isSending) setShowCompose(open); }}>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Send size={18} className="text-primary" />
                Yeni Email
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Gonderen</Label>
                <Input
                  value={portalUser?.email || ''}
                  disabled
                  className="mt-1 text-sm bg-muted/30 border-border"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Alici *</Label>
                <Input
                  placeholder="ornek@email.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="mt-1 text-sm bg-input border-border"
                  disabled={isSending}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Konu *</Label>
                <Input
                  placeholder="Email konusu"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="mt-1 text-sm bg-input border-border"
                  disabled={isSending}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mesaj</Label>
                <Textarea
                  placeholder="Mesajinizi yazin..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="mt-1 text-sm bg-input border-border min-h-[150px] resize-y"
                  disabled={isSending}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCompose(false)}
                  disabled={isSending}
                >
                  Iptal
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={isSending || !composeTo.trim() || !composeSubject.trim()}
                >
                  {isSending ? (
                    <>
                      <RefreshCw size={14} className="mr-1.5 animate-spin" />
                      Gonderiliyor...
                    </>
                  ) : (
                    <>
                      <Send size={14} className="mr-1.5" />
                      Gonder
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PortalLayout>
  );
}
