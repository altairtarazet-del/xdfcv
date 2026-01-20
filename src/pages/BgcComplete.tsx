import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw, CheckCircle, Mail, Calendar, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';

interface BgcEmail {
  id: string;
  accountEmail: string;
  accountId: string;
  from: string;
  subject: string;
  date: string;
  isRead: boolean;
  preview: string;
}

interface EmailAccount {
  id: string;
  email: string;
}

const BGC_SUBJECT = "Your background check is complete";

const BgcComplete = () => {
  const navigate = useNavigate();
  const { profile, isLoading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [bgcEmails, setBgcEmails] = useState<BgcEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<BgcEmail | null>(null);
  const [emailContent, setEmailContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);

  // Check permission
  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const fetchBgcEmails = useCallback(async () => {
    try {
      // First get all email accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('email_accounts')
        .select('id, email');

      if (accountsError) throw accountsError;

      if (!accounts || accounts.length === 0) {
        setBgcEmails([]);
        return;
      }

      const allBgcEmails: BgcEmail[] = [];

      // Fetch emails for each account
      for (const account of accounts as EmailAccount[]) {
        try {
          // Get mailboxes for the account
          const { data: mailboxData, error: mailboxError } = await supabase.functions.invoke('smtp-api', {
            body: { action: 'getMailboxes', accountId: account.id }
          });

          // Skip accounts that return errors (404 means account doesn't exist in SMTP API)
          if (mailboxError || mailboxData?.error) {
            console.warn(`Skipping account ${account.email}: API error`);
            continue;
          }

          if (mailboxData?.data) {
            // Find INBOX
            const inbox = mailboxData.data.find((mb: any) => 
              mb.path?.toUpperCase() === 'INBOX'
            );

            if (inbox) {
              // Get messages from INBOX with subject filter
              const { data: messagesData, error: messagesError } = await supabase.functions.invoke('smtp-api', {
                body: { 
                  action: 'getMessages', 
                  mailboxId: inbox.id,
                  page: 0,
                  allowedSubjects: [BGC_SUBJECT]
                }
              });

              // Skip if messages fetch fails
              if (messagesError || messagesData?.error) {
                console.warn(`Skipping messages for account ${account.email}: API error`);
                continue;
              }

              if (messagesData?.data?.messages) {
                const emails = messagesData.data.messages.map((msg: any) => ({
                  id: msg.id,
                  accountEmail: account.email,
                  accountId: account.id,
                  from: msg.from?.address || msg.from?.name || 'Bilinmiyor',
                  subject: msg.subject || BGC_SUBJECT,
                  date: msg.date,
                  isRead: msg.seen,
                  preview: msg.intro || ''
                }));
                allBgcEmails.push(...emails);
              }
            }
          }
        } catch (err) {
          console.warn(`Error fetching emails for account ${account.email}:`, err);
          // Continue to next account instead of breaking
        }
      }

      // Sort by date descending
      allBgcEmails.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setBgcEmails(allBgcEmails);
    } catch (error) {
      console.error('Error fetching BGC emails:', error);
      toast({
        title: "Hata",
        description: "BGC mailleri yüklenirken bir hata oluştu",
        variant: "destructive"
      });
    }
  }, [toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBgcEmails();
    setRefreshing(false);
    toast({
      title: "Yenilendi",
      description: "BGC listesi güncellendi"
    });
  };

  const handleViewEmail = async (email: BgcEmail) => {
    setSelectedEmail(email);
    setLoadingContent(true);
    
    try {
      const { data } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getMessage', messageId: email.id }
      });

      if (data?.data) {
        const content = data.data.html || data.data.text || 'İçerik bulunamadı';
        setEmailContent(DOMPurify.sanitize(content, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'img', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'thead', 'tbody', 'caption'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'style', 'class', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'valign'],
          ALLOW_DATA_ATTR: false
        }));
      }
    } catch (error) {
      console.error('Error fetching email content:', error);
      setEmailContent('Mail içeriği yüklenirken hata oluştu');
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    if (!authLoading && canViewBgcComplete) {
      setLoading(true);
      fetchBgcEmails().finally(() => setLoading(false));
    }
  }, [authLoading, canViewBgcComplete, fetchBgcEmails]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    if (!canViewBgcComplete) return;
    
    const interval = setInterval(() => {
      fetchBgcEmails();
    }, 30000);

    return () => clearInterval(interval);
  }, [canViewBgcComplete, fetchBgcEmails]);

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewBgcComplete) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <CheckCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Erişim Yok</h2>
          <p className="text-muted-foreground text-center">
            Bu sayfayı görüntülemek için yetkiniz bulunmamaktadır.
          </p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard'a Dön
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-primary" />
              BGC Complete
            </h1>
            <p className="text-muted-foreground mt-1">
              Background check tamamlanan hesaplar
            </p>
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* Stats Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam BGC Tamamlanan</p>
                <p className="text-2xl font-bold">{bgcEmails.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Emails List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              BGC Mailleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : bgcEmails.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Henüz BGC tamamlanan mail bulunamadı
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {bgcEmails.map((email) => (
                    <div
                      key={email.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleViewEmail(email)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={email.isRead ? "secondary" : "default"}>
                              {email.isRead ? "Okundu" : "Yeni"}
                            </Badge>
                            <span className="font-medium truncate">
                              {email.accountEmail}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{email.from}</span>
                          </div>
                          {email.preview && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {email.preview}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(email.date), 'dd MMM yyyy HH:mm', { locale: tr })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Email Content Dialog */}
        <Dialog open={!!selectedEmail} onOpenChange={() => setSelectedEmail(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                {selectedEmail?.accountEmail}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>Gönderen: {selectedEmail?.from}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {selectedEmail?.date && format(new Date(selectedEmail.date), 'dd MMMM yyyy HH:mm', { locale: tr })}
                  </span>
                </div>
              </div>
              <ScrollArea className="h-[400px] border rounded-lg p-4">
                {loadingContent ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: emailContent }}
                  />
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default BgcComplete;
