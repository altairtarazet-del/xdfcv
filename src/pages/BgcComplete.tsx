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
import { RefreshCw, CheckCircle, Mail, Calendar, User, Trash2, AlertTriangle, Inbox } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';

interface BgcEmail {
  id: string;
  accountEmail: string;
  accountId: string;
  mailboxId: string;
  mailboxPath?: string; // INBOX, Trash, Junk etc.
  from: string;
  subject: string;
  date: string;
  isRead: boolean;
  preview: string;
}

const BGC_SUBJECT = "*background check is complete*";
const CACHE_KEY = 'bgc_complete_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 dakika

interface CachedData {
  emails: BgcEmail[];
  totalAccounts: number;
  scannedAt: string;
  cachedAt: number;
}

const loadFromCache = (): CachedData | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedData = JSON.parse(cached);
    const isExpired = Date.now() - data.cachedAt > CACHE_EXPIRY_MS;
    
    // Return cache even if expired (we'll refresh in background)
    return data;
  } catch {
    return null;
  }
};

const saveToCache = (emails: BgcEmail[], totalAccounts: number, scannedAt: string) => {
  try {
    const cacheData: CachedData = {
      emails,
      totalAccounts,
      scannedAt,
      cachedAt: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (e) {
    console.warn('Failed to save BGC cache:', e);
  }
};

const BgcComplete = () => {
  const navigate = useNavigate();
  const { profile, isLoading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [bgcEmails, setBgcEmails] = useState<BgcEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<BgcEmail | null>(null);
  const [emailContent, setEmailContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Check permission
  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const fetchBgcEmails = useCallback(async () => {
    try {
      // Single API call - optimized server-side with date filtering
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { 
          action: 'scanBgcComplete',
          subjectFilter: BGC_SUBJECT,
          daysLimit: 7,        // Son 7 gün
          onePerAccount: true  // Hesap başına 1 kayıt
        }
      });
      
      if (error) throw error;
      
      const emails = data?.emails || [];
      const accounts = data?.totalAccounts || 0;
      const scannedAt = data?.scannedAt || new Date().toISOString();
      
      setBgcEmails(emails);
      setTotalAccounts(accounts);
      setLastScannedAt(scannedAt);
      setIsFromCache(false);
      
      // Save to cache
      saveToCache(emails, accounts, scannedAt);
    } catch (error) {
      console.error('Error fetching BGC emails:', error);
      toast({
        title: "Hata",
        description: "BGC mailleri yüklenirken bir hata oluştu",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setIsFromCache(false);
    await fetchBgcEmails();
    setRefreshing(false);
    toast({
      title: "Yenilendi",
      description: "BGC listesi güncellendi"
    });
  };

  // Initial load - from cache first, then background refresh
  useEffect(() => {
    if (!authLoading && canViewBgcComplete) {
      // Try to load from cache first for instant display
      const cached = loadFromCache();
      if (cached) {
        setBgcEmails(cached.emails);
        setTotalAccounts(cached.totalAccounts);
        setLastScannedAt(cached.scannedAt);
        setIsFromCache(true);
        setLoading(false);
        
        // Background refresh
        setBackgroundRefreshing(true);
        fetchBgcEmails().finally(() => setBackgroundRefreshing(false));
      } else {
        // No cache, show loading state
        setLoading(true);
        fetchBgcEmails().finally(() => setLoading(false));
      }
    }
  }, [authLoading, canViewBgcComplete, fetchBgcEmails]);

  const handleViewEmail = async (email: BgcEmail) => {
    setSelectedEmail(email);
    setLoadingContent(true);
    
    try {
      const { data } = await supabase.functions.invoke('smtp-api', {
        body: { 
          action: 'getMessage', 
          accountId: email.accountId,
          mailboxId: email.mailboxId,
          messageId: email.id 
        }
      });

      if (data) {
        const content = data.html || data.text?.html || data.text?.plain || 'İçerik bulunamadı';
        setEmailContent(DOMPurify.sanitize(content, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'img', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr', 'thead', 'tbody', 'caption'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'style', 'class', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'valign'],
          ALLOW_DATA_ATTR: false
        }));
      } else {
        setEmailContent('Mail içeriği yüklenirken hata oluştu');
      }
    } catch (error) {
      console.error('Error fetching email content:', error);
      setEmailContent('Mail içeriği yüklenirken hata oluştu');
    } finally {
      setLoadingContent(false);
    }
  };

  // Auto refresh every 60 seconds (background)
  useEffect(() => {
    if (!canViewBgcComplete) return;
    
    const interval = setInterval(() => {
      setBackgroundRefreshing(true);
      fetchBgcEmails().finally(() => setBackgroundRefreshing(false));
    }, 60000);

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
              Background check tamamlanan hesaplar (son 7 gün)
            </p>
            <div className="flex items-center gap-2 mt-1">
              {lastScannedAt && (
                <p className="text-xs text-muted-foreground">
                  Son tarama: {format(new Date(lastScannedAt), 'HH:mm:ss', { locale: tr })}
                </p>
              )}
              {isFromCache && (
                <Badge variant="outline" className="text-xs">
                  Önbellekten
                </Badge>
              )}
              {backgroundRefreshing && (
                <Badge variant="secondary" className="text-xs animate-pulse">
                  Güncelleniyor...
                </Badge>
              )}
            </div>
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing || backgroundRefreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing || backgroundRefreshing ? 'animate-spin' : ''}`} />
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
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant={email.isRead ? "secondary" : "default"}>
                              {email.isRead ? "Okundu" : "Yeni"}
                            </Badge>
                            {/* Folder badge */}
                            {email.mailboxPath && email.mailboxPath.toUpperCase() === 'TRASH' && (
                              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                                <Trash2 className="h-3 w-3" />
                                Çöp Kutusu
                              </Badge>
                            )}
                            {email.mailboxPath && (email.mailboxPath.toUpperCase() === 'JUNK' || email.mailboxPath.toUpperCase() === 'SPAM') && (
                              <Badge variant="outline" className="text-xs flex items-center gap-1 border-orange-500 text-orange-500">
                                <AlertTriangle className="h-3 w-3" />
                                Spam
                              </Badge>
                            )}
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
