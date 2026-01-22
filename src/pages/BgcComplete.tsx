import { useState, useMemo } from 'react';
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
import { RefreshCw, Loader2, CheckCircle, Mail, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

interface BgcEmail {
  accountId: string;
  accountEmail: string;
  mailboxId: string;
  mailboxPath: string;
  messageId: string;
  subject: string;
  from: { address: string; name?: string } | string;
  date: string;
}

interface ScanStats {
  accounts: number;
  mailboxes: number;
  messagesScanned: number;
  found: number;
}

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [emails, setEmails] = useState<BgcEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [scanStats, setScanStats] = useState<ScanStats>({ 
    accounts: 0, 
    mailboxes: 0, 
    messagesScanned: 0, 
    found: 0 
  });
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Check permission
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  const handleScan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanBgcComplete' }
      });

      if (error) throw error;

      if (data) {
        setEmails(data.emails || []);
        setScanStats({
          accounts: data.scannedAccounts || 0,
          mailboxes: data.scannedMailboxes || 0,
          messagesScanned: data.messagesScanned || 0,
          found: data.totalFound || 0
        });
        setLastScan(new Date());
        
        toast({
          title: 'Tarama Tamamlandı',
          description: `${data.scannedAccounts} hesap tarandı, ${data.totalFound} BGC maili bulundu`,
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
      const emailDate = new Date(email.date);
      if (activeTab === '24h') {
        return now.getTime() - emailDate.getTime() < 24 * 60 * 60 * 1000;
      }
      if (activeTab === '7d') {
        return now.getTime() - emailDate.getTime() < 7 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [emails, activeTab]);

  const getFromAddress = (from: BgcEmail['from']) => {
    if (typeof from === 'string') return from;
    return from?.address || 'Bilinmiyor';
  };

  const getFromName = (from: BgcEmail['from']) => {
    if (typeof from === 'string') return null;
    return from?.name;
  };

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
                Tara
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                Taranan Mailbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.mailboxes}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">
                Taranan Mesaj
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.messagesScanned}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">
                Bulunan BGC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{scanStats.found}</div>
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
                    ? 'Henüz tarama yapılmadı. "Tara" butonuna tıklayın.'
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
                      <TableRow key={`${email.accountId}_${email.mailboxId}_${email.messageId}`}>
                        <TableCell className="font-mono text-sm">
                          {email.accountEmail}
                        </TableCell>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {email.subject}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <div>
                            {getFromAddress(email.from)}
                            {getFromName(email.from) && (
                              <span className="text-muted-foreground text-xs block">
                                {getFromName(email.from)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={email.mailboxPath.toLowerCase() === 'trash' ? 'destructive' : 'outline'}
                            className="font-mono text-xs"
                          >
                            {email.mailboxPath}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {format(new Date(email.date), 'dd/MM/yyyy HH:mm')}
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