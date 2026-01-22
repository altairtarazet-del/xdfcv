import { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Mail, Clock, Search, Database } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface BgcEmail {
  id: string;
  account_id: string;
  account_email: string;
  mailbox_id: string;
  mailbox_path: string;
  message_id: string;
  subject: string;
  from_address: string | null;
  from_name: string | null;
  email_date: string;
  scanned_at: string;
}

interface ScanStats {
  accounts: number;
  mailboxes: number;
  messagesScanned: number;
  newFound: number;
  totalInDb: number;
  skipped: number;
}

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [emails, setEmails] = useState<BgcEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [scanStats, setScanStats] = useState<ScanStats>({ 
    accounts: 0, 
    mailboxes: 0, 
    messagesScanned: 0, 
    newFound: 0,
    totalInDb: 0,
    skipped: 0
  });
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Check permission
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  // Fetch saved emails from database
  const fetchSavedEmails = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('bgc_complete_emails')
        .select('*')
        .order('email_date', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setEmails(data);
        setScanStats(prev => ({ ...prev, totalInDb: data.length }));
      }
    } catch (error: any) {
      console.error('Error fetching saved emails:', error);
    }
  }, []);

  // Load saved emails on mount
  useEffect(() => {
    if (canViewBgcComplete) {
      fetchSavedEmails().finally(() => setInitialLoading(false));
    } else {
      setInitialLoading(false);
    }
  }, [canViewBgcComplete, fetchSavedEmails]);

  const handleScan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanBgcComplete' }
      });

      if (error) throw error;

      if (data) {
        setScanStats({
          accounts: data.scannedAccounts || 0,
          mailboxes: data.scannedMailboxes || 0,
          messagesScanned: data.messagesScanned || 0,
          newFound: data.newFound || 0,
          totalInDb: data.totalInDb || 0,
          skipped: data.skippedMessages || 0
        });
        setLastScan(new Date());
        
        // Refresh emails from database
        await fetchSavedEmails();
        
        toast({
          title: 'Tarama Tamamlandı',
          description: data.newFound > 0 
            ? `${data.newFound} yeni BGC maili bulundu ve kaydedildi`
            : 'Yeni BGC maili bulunamadı',
        });
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Tarama sırasında bir hata oluştu',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter emails by time
  const filteredEmails = useMemo(() => {
    const now = new Date();
    return emails.filter(email => {
      const emailDate = new Date(email.email_date);
      if (activeTab === '24h') {
        return now.getTime() - emailDate.getTime() < 24 * 60 * 60 * 1000;
      }
      if (activeTab === '7d') {
        return now.getTime() - emailDate.getTime() < 7 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [emails, activeTab]);

  if (!canViewBgcComplete) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="cyber-card border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-muted-foreground font-mono">
                Bu sayfaya erişim yetkiniz bulunmuyor.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (initialLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold font-mono text-foreground flex items-center gap-2">
              <CheckCircle className="text-primary" />
              BGC Complete
            </h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">
              Background check tamamlanma maillerini tarayın
            </p>
          </div>
          <Button 
            onClick={handleScan} 
            disabled={loading}
            className="cyber-button"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Taranıyor...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Yeni Tara
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-1">
                <Database size={14} />
                Kayıtlı BGC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.totalInDb}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">
                Son Taramada Yeni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.newFound}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">
                Taranan Hesap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.accounts}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">
                Atlanan (Eski)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{scanStats.skipped}</div>
            </CardContent>
          </Card>
        </div>

        {/* Last Scan Info */}
        {lastScan && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Clock size={14} />
            Son tarama: {format(lastScan, 'dd/MM/yyyy HH:mm:ss')}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="cyber-card">
            <TabsTrigger value="all" className="font-mono">
              Tümü ({emails.length})
            </TabsTrigger>
            <TabsTrigger value="24h" className="font-mono">
              Son 24 Saat
            </TabsTrigger>
            <TabsTrigger value="7d" className="font-mono">
              Son 7 Gün
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Results Table */}
        <Card className="cyber-card">
          <CardContent className="p-0">
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Mail size={48} className="mb-4 opacity-50" />
                <p className="font-mono text-sm">
                  {emails.length === 0 
                    ? 'Henüz kayıtlı BGC maili yok. "Yeni Tara" butonuna tıklayın.'
                    : 'Bu zaman aralığında BGC maili bulunamadı.'
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">Hesap</TableHead>
                      <TableHead className="font-mono">Konu</TableHead>
                      <TableHead className="font-mono">Gönderen</TableHead>
                      <TableHead className="font-mono">Klasör</TableHead>
                      <TableHead className="font-mono">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell className="font-mono text-sm">
                          {email.account_email}
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {email.subject}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <div>
                            {email.from_address || 'Bilinmiyor'}
                            {email.from_name && (
                              <span className="text-muted-foreground text-xs block">
                                {email.from_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={email.mailbox_path.toLowerCase() === 'trash' ? 'destructive' : 'outline'}
                            className="font-mono text-xs"
                          >
                            {email.mailbox_path}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {format(new Date(email.email_date), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
