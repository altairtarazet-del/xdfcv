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
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  Inbox,
  RefreshCw,
  Search,
  Clock,
  User,
  Paperclip,
  ExternalLink,
} from 'lucide-react';
import { SMTPDevMailbox, SMTPDevMessage } from '@/types/mail';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { toast } = useToast();
  const [mailboxes, setMailboxes] = useState<SMTPDevMailbox[]>([]);
  const [messages, setMessages] = useState<SMTPDevMessage[]>([]);
  const [selectedMailbox, setSelectedMailbox] = useState<SMTPDevMailbox | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<SMTPDevMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMailboxes = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMailboxes' },
      });

      if (error) throw error;
      setMailboxes(data.mailboxes || []);
    } catch (error: any) {
      console.error('Error fetching mailboxes:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Posta kutuları yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchMessages = useCallback(async (mailboxId: string) => {
    setIsLoadingMessages(true);
    try {
      // Get user permissions
      const permissions = profile?.permissions;

      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'getMessages',
          mailboxId,
          filters: {
            timeFilterMinutes: permissions?.time_filter_minutes,
            allowedSenders: permissions?.allowed_senders,
            allowedReceivers: permissions?.allowed_receivers,
          },
        },
      });

      if (error) throw error;
      setMessages(data.messages || []);
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
  }, [profile?.permissions, toast]);

  useEffect(() => {
    fetchMailboxes();
  }, [fetchMailboxes]);

  useEffect(() => {
    if (selectedMailbox) {
      fetchMessages(selectedMailbox.id);

      // Set up polling for realtime updates if enabled
      if (profile?.permissions?.realtime_enabled !== false) {
        const interval = setInterval(() => {
          fetchMessages(selectedMailbox.id);
        }, 10000); // Poll every 10 seconds

        return () => clearInterval(interval);
      }
    }
  }, [selectedMailbox, fetchMessages, profile?.permissions?.realtime_enabled]);

  const filteredMailboxes = mailboxes.filter((mailbox) => {
    // Apply mailbox filter if user has restrictions
    if (profile?.permissions?.allowed_mailboxes?.length) {
      if (!profile.permissions.allowed_mailboxes.includes(mailbox.id)) {
        return false;
      }
    }
    // Apply search filter
    if (searchQuery) {
      return (
        mailbox.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mailbox.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  const filteredMessages = messages.filter((message) => {
    if (searchQuery) {
      return (
        message.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        message.from.address.toLowerCase().includes(searchQuery.toLowerCase())
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

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col lg:flex-row gap-4">
        {/* Mailbox List */}
        <div className="w-full lg:w-80 flex-shrink-0">
          <div className="cyber-card rounded-lg p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono font-bold text-foreground flex items-center gap-2">
                <Inbox size={18} className="text-primary" />
                Posta Kutuları
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchMailboxes}
                className="hover:bg-primary/10"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </Button>
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
              {isLoading ? (
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
                        <span className="truncate">{mailbox.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {mailbox.email}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1">
          <div className="cyber-card rounded-lg p-4 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono font-bold text-foreground">
                {selectedMailbox ? (
                  <span className="flex items-center gap-2">
                    <Mail size={18} className="text-primary" />
                    {selectedMailbox.name}
                  </span>
                ) : (
                  'Mesajlar'
                )}
              </h2>
              {selectedMailbox && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fetchMessages(selectedMailbox.id)}
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
                              {message.from.name || message.from.address}
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
                            {formatDate(message.date)}
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
            </ScrollArea>
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
                      {selectedMessage.from.name && (
                        <span className="mr-2">{selectedMessage.from.name}</span>
                      )}
                      <span className="text-primary">&lt;{selectedMessage.from.address}&gt;</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Alıcı:</span>
                    <p className="text-foreground">
                      {selectedMessage.to.map((t) => t.address).join(', ')}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tarih:</span>
                    <p className="text-foreground">
                      {new Date(selectedMessage.date).toLocaleString('tr-TR')}
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
