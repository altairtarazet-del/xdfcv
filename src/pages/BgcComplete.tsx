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
import { Loader2, CheckCircle, Mail, Clock, Search, Database, XCircle, Check, X, Package } from 'lucide-react';
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
  email_type: string;
}

interface ScanStats {
  totalBgcInDb: number;
  totalDeactivatedInDb: number;
  totalFirstPackageInDb: number;
}

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [bgcEmails, setBgcEmails] = useState<BgcEmail[]>([]);
  const [deactivatedAccounts, setDeactivatedAccounts] = useState<Set<string>>(new Set());
  const [firstPackageAccounts, setFirstPackageAccounts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [firstPackageLoading, setFirstPackageLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [scanStats, setScanStats] = useState<ScanStats>({ 
    totalBgcInDb: 0,
    totalDeactivatedInDb: 0,
    totalFirstPackageInDb: 0
  });
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Check permission
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  // Fetch saved emails from database
  const fetchSavedEmails = useCallback(async () => {
    try {
      // Fetch BGC complete emails
      const { data: bgcData, error: bgcError } = await supabase
        .from('bgc_complete_emails')
        .select('*')
        .eq('email_type', 'bgc_complete')
        .order('email_date', { ascending: false });

      if (bgcError) throw bgcError;
      
      // Fetch deactivated emails to build the set
      const { data: deactivatedData, error: deactivatedError } = await supabase
        .from('bgc_complete_emails')
        .select('account_email')
        .eq('email_type', 'deactivated');

      if (deactivatedError) {
        console.error('Error fetching deactivated emails:', deactivatedError);
      }

      // Fetch first_package emails to build the set
      const { data: firstPackageData, error: firstPackageError } = await supabase
        .from('bgc_complete_emails')
        .select('account_email')
        .eq('email_type', 'first_package');

      if (firstPackageError) {
        console.error('Error fetching first package emails:', firstPackageError);
      }
      
      if (bgcData) {
        setBgcEmails(bgcData);
        setScanStats(prev => ({ ...prev, totalBgcInDb: bgcData.length }));
      }

      // Build set of deactivated account emails
      if (deactivatedData) {
        setDeactivatedAccounts(new Set(deactivatedData.map(e => e.account_email)));
        setScanStats(prev => ({ ...prev, totalDeactivatedInDb: deactivatedData.length }));
      }

      // Build set of first package account emails
      if (firstPackageData) {
        setFirstPackageAccounts(new Set(firstPackageData.map(e => e.account_email)));
        setScanStats(prev => ({ ...prev, totalFirstPackageInDb: firstPackageData.length }));
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
        setScanStats(prev => ({
          ...prev,
          totalBgcInDb: data.totalBgcInDb || 0,
          totalDeactivatedInDb: data.totalDeactivatedInDb || 0
        }));
        setLastScan(new Date());
        
        // Refresh emails from database
        await fetchSavedEmails();
        
        const totalNew = (data.newBgcFound || 0) + (data.newDeactivatedFound || 0);
        
        toast({
          title: 'Tarama Tamamlandı',
          description: totalNew > 0 
            ? `${data.newBgcFound} yeni BGC, ${data.newDeactivatedFound} yeni deaktivasyon maili bulundu`
            : 'Yeni mail bulunamadı',
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

  const handleFirstPackageScan = async () => {
    setFirstPackageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanFirstPackage' }
      });

      if (error) throw error;

      if (data) {
        setScanStats(prev => ({
          ...prev,
          totalFirstPackageInDb: data.totalFirstPackageInDb || 0
        }));
        
        // Refresh emails from database
        await fetchSavedEmails();
        
        toast({
          title: 'İlk Paket Taraması Tamamlandı',
          description: data.newFirstPackageFound > 0 
            ? `${data.newFirstPackageFound} yeni ilk paket maili bulundu`
            : 'Yeni mail bulunamadı',
        });
      }
    } catch (error: any) {
      console.error('First package scan error:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Tarama sırasında bir hata oluştu',
      });
    } finally {
      setFirstPackageLoading(false);
    }
  };

  // Filter emails by time
  const filteredEmails = useMemo(() => {
    const now = new Date();
    return bgcEmails.filter(email => {
      const emailDate = new Date(email.email_date);
      if (activeTab === '24h') {
        return now.getTime() - emailDate.getTime() < 24 * 60 * 60 * 1000;
      }
      if (activeTab === '7d') {
        return now.getTime() - emailDate.getTime() < 7 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [bgcEmails, activeTab]);

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
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={handleScan} 
              disabled={loading || firstPackageLoading}
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
            <Button 
              onClick={handleFirstPackageScan} 
              disabled={loading || firstPackageLoading}
              variant="outline"
              className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
            >
              {firstPackageLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Taranıyor...
                </>
              ) : (
                <>
                  <Package className="mr-2 h-4 w-4" />
                  İlk Paket
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-1">
                <Database size={14} />
                Kayıtlı BGC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{scanStats.totalBgcInDb}</div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-1">
                <XCircle size={14} className="text-destructive" />
                Deaktive
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{scanStats.totalDeactivatedInDb}</div>
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
              Tümü ({bgcEmails.length})
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
                  {bgcEmails.length === 0 
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
                      <TableHead className="font-mono">BGC Complete</TableHead>
                      <TableHead className="font-mono">İlk Paket</TableHead>
                      <TableHead className="font-mono">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell className="font-mono text-sm">
                          {email.account_email}
                        </TableCell>
                        <TableCell>
                          {deactivatedAccounts.has(email.account_email) ? (
                            <Badge variant="destructive" className="font-mono text-xs gap-1">
                              <X size={12} />
                              Kapandı
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-mono text-xs gap-1">
                              <Check size={12} />
                              Clear
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {firstPackageAccounts.has(email.account_email) ? (
                            <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/50 font-mono text-xs gap-1">
                              <Check size={12} />
                              Paket Atıldı
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          )}
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
