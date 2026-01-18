import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  Inbox,
  RefreshCw,
  Search,
  Clock,
  User,
  Paperclip,
  Server,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SMTPDevMailbox, SMTPDevMessage } from '@/types/mail';

interface Account {
  id: string;
  name?: string;
  address?: string;
  mailboxes?: SMTPDevMailbox[];
}

interface PaginationView {
  first?: string;
  last?: string;
  next?: string;
  previous?: string;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [mailboxes, setMailboxes] = useState<SMTPDevMailbox[]>([]);
  const [messages, setMessages] = useState<SMTPDevMessage[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<SMTPDevMailbox | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SMTPDevMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const [paginationView, setPaginationView] = useState<PaginationView | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getAccounts' },
      });

      if (error) throw error;
      
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);
      
      // Auto-select first account and set its mailboxes
      if (accountList.length > 0 && !selectedAccount) {
        const firstAccount = accountList[0];
        setSelectedAccount(firstAccount);
        if (firstAccount.mailboxes) {
          setMailboxes(firstAccount.mailboxes);
        }
      }
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Hesaplar yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, selectedAccount]);

  const fetchMailboxes = useCallback(async (accountId: string) => {
    // First check if mailboxes are already loaded from the account
    const account = accounts.find(a => a.id === accountId);
    if (account?.mailboxes && account.mailboxes.length > 0) {
      setMailboxes(account.mailboxes);
      setIsLoadingMailboxes(false);
      return;
    }
    
    setIsLoadingMailboxes(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMailboxes', accountId },
      });

      if (error) throw error;
      const mailboxList = Array.isArray(data?.mailboxes) ? data.mailboxes : [];
      setMailboxes(mailboxList);
    } catch (error: any) {
      console.error('Error fetching mailboxes:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Posta kutuları yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoadingMailboxes(false);
    }
  }, [toast, accounts]);

  const fetchMessages = useCallback(async (accountId: string, mailboxId: string, page?: number) => {
    setIsLoadingMessages(true);
    try {
      const permissions = profile?.permissions;

      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'getMessages',
          accountId,
          mailboxId,
          page: page || currentPage,
          filters: {
            timeFilterMinutes: permissions?.time_filter_minutes,
            allowedSenders: permissions?.allowed_senders,
            allowedReceivers: permissions?.allowed_receivers,
          },
        },
      });

      if (error) throw error;
      const messageList = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(messageList);
      setTotalMessages(data?.totalItems || messageList.length);
      setPaginationView(data?.view || null);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Mesajlar yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [profile?.permissions, toast, currentPage]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccount) {
      fetchMailboxes(selectedAccount.id);
      setSelectedMailbox(null);
      setMessages([]);
    }
  }, [selectedAccount, fetchMailboxes]);

  useEffect(() => {
    if (selectedAccount && selectedMailbox) {
      // Guard: if mailbox belongs to a previous account, skip fetch
      if (!mailboxes.some((m) => m.id === selectedMailbox.id)) return;

      fetchMessages(selectedAccount.id, selectedMailbox.id, currentPage);

      // Set up polling for realtime updates if enabled
      if (profile?.permissions?.realtime_enabled !== false) {
        const interval = setInterval(() => {
          fetchMessages(selectedAccount.id, selectedMailbox.id, currentPage);
        }, 10000);

        return () => clearInterval(interval);
      }
    }
  }, [selectedAccount, selectedMailbox, mailboxes, fetchMessages, profile?.permissions?.realtime_enabled, currentPage]);

  // Reset pagination when mailbox changes
  useEffect(() => {
    setCurrentPage(1);
    setTotalMessages(0);
    setPaginationView(null);
  }, [selectedMailbox]);

  const handlePrevPage = () => {
    if (paginationView?.previous && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (paginationView?.next) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const totalPages = Math.ceil(totalMessages / 30); // SMTP.dev returns 30 per page

  const filteredMailboxes = mailboxes.filter((mailbox) => {
    if (profile?.permissions?.allowed_mailboxes?.length) {
      if (!profile.permissions.allowed_mailboxes.includes(mailbox.id)) {
        return false;
      }
    }
    if (searchQuery) {
      return (
        mailbox.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mailbox.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  const filteredMessages = messages.filter((message) => {
    if (searchQuery) {
      const subject = message.subject || '';
      const fromAddr = typeof message.from === 'string' ? message.from : message.from?.address || '';
      return (
        subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fromAddr.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Şimdi';
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    return `${days} gün önce`;
  };

  const getFromDisplay = (from: any) => {
    if (typeof from === 'string') return from;
    return from?.name || from?.address || 'Bilinmeyen';
  };

  const getFromAddress = (from: any) => {
    if (typeof from === 'string') return from;
    return from?.address || '';
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-4">
        {/* Account Selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-primary" />
            <span className="font-mono text-sm text-muted-foreground">Hesap:</span>
          </div>
          <Select
            value={selectedAccount?.id || ''}
            onValueChange={(value) => {
              const account = accounts.find((a) => a.id === value) || null;
              // Prevent mismatched accountId+mailboxId fetches (causes SMTP.dev 404)
              setSelectedMailbox(null);
              setSelectedMessage(null);
              setMessages([]);
              setMailboxes(account?.mailboxes ?? []);
              setSelectedAccount(account);
            }}
          >
            <SelectTrigger className="w-64 cyber-input font-mono">
              <SelectValue placeholder="Hesap seçin..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id} className="font-mono">
                  {account.name || account.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAccounts}
            className="hover:bg-primary/10"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Mailbox List */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="cyber-card rounded-lg p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono font-bold text-foreground flex items-center gap-2">
                  <Inbox size={18} className="text-primary" />
                  Posta Kutuları
                </h2>
                {selectedAccount && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fetchMailboxes(selectedAccount.id)}
                    className="hover:bg-primary/10"
                  >
                    <RefreshCw size={16} className={isLoadingMailboxes ? 'animate-spin' : ''} />
                  </Button>
                )}
              </div>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="cyber-input pl-9 font-mono text-sm"
                />
              </div>

              <ScrollArea className="flex-1">
                {!selectedAccount ? (
                  <div className="text-center py-8">
                    <Server size={32} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground font-mono text-sm">
                      Önce bir hesap seçin
                    </p>
                  </div>
                ) : isLoadingMailboxes ? (
                  <div className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </div>
                ) : filteredMailboxes.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail size={32} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground font-mono text-sm">
                      Posta kutusu bulunamadı
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMailboxes.map((mailbox) => (
                      <button
                        key={mailbox.id}
                        onClick={() => setSelectedMailbox(mailbox)}
                        className={`w-full text-left p-3 rounded-lg transition-all font-mono text-sm ${
                          selectedMailbox?.id === mailbox.id
                            ? 'bg-primary/20 border border-primary/30 text-primary'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Mail size={16} />
                          <span className="truncate">{mailbox.name || mailbox.id}</span>
                        </div>
                        {mailbox.email && (
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {mailbox.email}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 min-h-0">
            <div className="cyber-card rounded-lg p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono font-bold text-foreground">
                  {selectedMailbox ? (
                    <span className="flex items-center gap-2">
                      <Mail size={18} className="text-primary" />
                      {selectedMailbox.name || selectedMailbox.id}
                    </span>
                  ) : (
                    'Mesajlar'
                  )}
                </h2>
                {selectedMailbox && selectedAccount && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fetchMessages(selectedAccount.id, selectedMailbox.id)}
                    className="hover:bg-primary/10"
                  >
                    <RefreshCw size={16} className={isLoadingMessages ? 'animate-spin' : ''} />
                  </Button>
                )}
              </div>

              {/* Permission Info */}
              {profile?.permissions && (
                <div className="flex flex-wrap gap-2 mb-4 text-xs font-mono">
                  {profile.permissions.time_filter_minutes && (
                    <span className="px-2 py-1 bg-secondary/20 text-secondary rounded flex items-center gap-1">
                      <Clock size={12} />
                      Son {profile.permissions.time_filter_minutes} dk
                    </span>
                  )}
                  {profile.permissions.realtime_enabled && (
                    <span className="px-2 py-1 bg-primary/20 text-primary rounded animate-pulse">
                      ● Canlı
                    </span>
                  )}
                </div>
              )}

              <ScrollArea className="flex-1">
                {!selectedMailbox ? (
                  <div className="text-center py-16">
                    <Inbox size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-mono">
                      Bir posta kutusu seçin
                    </p>
                  </div>
                ) : isLoadingMessages ? (
                  <div className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Mesajlar yükleniyor...
                    </span>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="text-center py-16">
                    <Mail size={48} className="mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground font-mono">
                      Bu kriterlere uygun mesaj yok
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMessages.map((message) => (
                      <button
                        key={message.id}
                        onClick={() => setSelectedMessage(message)}
                        className="w-full text-left p-4 rounded-lg hover:bg-muted/50 transition-all border border-transparent hover:border-primary/20"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <User size={14} className="text-muted-foreground" />
                              <span className="font-mono text-sm truncate text-foreground">
                                {getFromDisplay(message.from)}
                              </span>
                            </div>
                            <p className="font-mono text-sm font-medium text-foreground truncate">
                              {message.subject || '(Konu yok)'}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground truncate mt-1">
                              {message.text?.substring(0, 100) || message.html?.substring(0, 100) || '...'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {formatDate(message.date || message.createdAt)}
                            </span>
                            {message.attachments && message.attachments.length > 0 && (
                              <Paperclip size={14} className="text-muted-foreground mt-1 ml-auto" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {totalMessages > 0 && (
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/30">
                    <span className="font-mono text-xs text-muted-foreground">
                      Toplam: {totalMessages} mesaj
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage <= 1 || isLoadingMessages}
                        className="hover:bg-primary/10 font-mono text-xs"
                      >
                        <ChevronLeft size={16} className="mr-1" />
                        Önceki
                      </Button>
                      <span className="font-mono text-sm text-foreground px-2">
                        {currentPage} / {totalPages || 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={!paginationView?.next || isLoadingMessages}
                        className="hover:bg-primary/10 font-mono text-xs"
                      >
                        Sonraki
                        <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Message Detail Dialog */}
        <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="cyber-card border-primary/30 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-mono text-foreground">
                {selectedMessage?.subject || '(Konu yok)'}
              </DialogTitle>
            </DialogHeader>
            {selectedMessage && (
              <div className="flex-1 overflow-auto space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                  <div>
                    <span className="text-muted-foreground">Gönderen:</span>
                    <p className="text-foreground">
                      {getFromDisplay(selectedMessage.from)}{' '}
                      <span className="text-primary">&lt;{getFromAddress(selectedMessage.from)}&gt;</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Alıcı:</span>
                    <p className="text-foreground">
                      {Array.isArray(selectedMessage.to)
                        ? selectedMessage.to.map((t) => (typeof t === 'string' ? t : t.address)).join(', ')
                        : selectedMessage.to}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tarih:</span>
                    <p className="text-foreground">
                      {new Date(selectedMessage.date || selectedMessage.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Ekler:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedMessage.attachments.map((att, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-muted rounded text-xs flex items-center gap-1"
                          >
                            <Paperclip size={12} />
                            {att.filename}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/30 pt-4">
                  {selectedMessage.html ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.html }}
                    />
                  ) : (
                    <pre className="font-mono text-sm whitespace-pre-wrap text-foreground">
                      {selectedMessage.text || 'İçerik yok'}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
