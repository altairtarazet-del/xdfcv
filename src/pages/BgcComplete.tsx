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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle,
  Clock,
  Search,
  XCircle,
  Package,
  Download,
  RefreshCw,
  Hourglass,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

interface AccountRow {
  account_email: string;
  bgcDone: boolean;
  bgcDate: string | null;
  deactivated: boolean;
  deactivatedDate: string | null;
  firstPackage: boolean;
  firstPackageDate: string | null;
}

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  // Fetch all data from DB and build account rows
  const fetchData = useCallback(async () => {
    try {
      // 1. Get all scanned accounts (this is our "all accounts" list)
      const { data: scanStatus } = await supabase
        .from('bgc_scan_status')
        .select('account_id, account_email, last_scanned_at')
        .order('account_email');

      // 2. Get all bgc_complete_emails
      const { data: emails } = await supabase
        .from('bgc_complete_emails')
        .select('account_email, email_type, email_date')
        .order('email_date', { ascending: false });

      // Build email lookup: account_email → { bgc, deactivated, firstPackage }
      const emailMap = new Map<string, {
        bgcDate: string | null;
        deactivatedDate: string | null;
        firstPackageDate: string | null;
      }>();

      for (const email of (emails || [])) {
        if (!emailMap.has(email.account_email)) {
          emailMap.set(email.account_email, {
            bgcDate: null,
            deactivatedDate: null,
            firstPackageDate: null,
          });
        }
        const entry = emailMap.get(email.account_email)!;
        if (email.email_type === 'bgc_complete' && !entry.bgcDate) {
          entry.bgcDate = email.email_date;
        }
        if (email.email_type === 'deactivated' && !entry.deactivatedDate) {
          entry.deactivatedDate = email.email_date;
        }
        if (email.email_type === 'first_package' && !entry.firstPackageDate) {
          entry.firstPackageDate = email.email_date;
        }
      }

      // Build account rows from scan status
      const rows: AccountRow[] = (scanStatus || []).map(s => {
        const emailData = emailMap.get(s.account_email);
        return {
          account_email: s.account_email,
          bgcDone: !!emailData?.bgcDate,
          bgcDate: emailData?.bgcDate || null,
          deactivated: !!emailData?.deactivatedDate,
          deactivatedDate: emailData?.deactivatedDate || null,
          firstPackage: !!emailData?.firstPackageDate,
          firstPackageDate: emailData?.firstPackageDate || null,
        };
      });

      setAccounts(rows);

      // Last scan time
      if (scanStatus && scanStatus.length > 0) {
        const dates = scanStatus.map(s => new Date(s.last_scanned_at).getTime());
        setLastScan(new Date(Math.max(...dates)));
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
    }
  }, []);

  useEffect(() => {
    if (canViewBgcComplete) {
      fetchData().finally(() => setInitialLoading(false));
    } else {
      setInitialLoading(false);
    }
  }, [canViewBgcComplete, fetchData]);

  // Single scan button: runs BGC + First Package scans
  const handleScan = async () => {
    setLoading(true);
    try {
      // BGC + Deactivation scan
      const { data: bgcResult, error: bgcError } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanBgcComplete' },
      });
      if (bgcError) throw bgcError;

      // First Package scan
      const { data: fpResult, error: fpError } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanFirstPackage' },
      });
      if (fpError) throw fpError;

      await fetchData();

      const newBgc = bgcResult?.newBgcFound || 0;
      const newDeact = bgcResult?.newDeactivatedFound || 0;
      const newFp = fpResult?.newFirstPackageFound || 0;

      toast({
        title: 'Tarama Tamamlandı',
        description: `${newBgc} yeni BGC, ${newDeact} yeni kapanma, ${newFp} yeni ilk paket bulundu.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Tarama sırasında hata oluştu',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filtered accounts
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter(a => a.account_email.toLowerCase().includes(q));
  }, [accounts, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = accounts.length;
    const bgcDone = accounts.filter(a => a.bgcDone).length;
    const bgcBekliyor = total - bgcDone;
    const deactivated = accounts.filter(a => a.deactivated).length;
    const clear = bgcDone - deactivated;
    const firstPackage = accounts.filter(a => a.firstPackage).length;
    return { total, bgcDone, bgcBekliyor, deactivated, clear, firstPackage };
  }, [accounts]);

  // CSV Export
  const exportToCSV = () => {
    const headers = ['Hesap', 'BGC', 'Durum', 'İlk Paket', 'BGC Tarihi', 'Kapanma Tarihi', 'Paket Tarihi'];
    const rows = filtered.map(a => [
      a.account_email,
      a.bgcDone ? 'Tamamlandı' : 'Bekliyor',
      a.deactivated ? 'Kapandı' : (a.bgcDone ? 'Aktif' : '-'),
      a.firstPackage ? 'Atıldı' : (a.bgcDone && !a.deactivated ? 'Atılmadı' : '-'),
      a.bgcDate ? format(new Date(a.bgcDate), 'dd/MM/yyyy') : '-',
      a.deactivatedDate ? format(new Date(a.deactivatedDate), 'dd/MM/yyyy') : '-',
      a.firstPackageDate ? format(new Date(a.firstPackageDate), 'dd/MM/yyyy') : '-',
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bgc-takip-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!canViewBgcComplete) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="cyber-card border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-muted-foreground font-mono">Bu sayfaya erişim yetkiniz bulunmuyor.</p>
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
              BGC Takip
            </h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">
              Hesap durumları: BGC, kapanma, ilk paket
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleScan} disabled={loading} className="cyber-button">
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Taranıyor...</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" />Tara</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs font-mono text-muted-foreground">Toplam</span>
              <div className="text-xl font-bold text-primary">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Hourglass size={12} className="text-amber-400" />BGC Bekliyor
              </span>
              <div className="text-xl font-bold text-amber-400">{stats.bgcBekliyor}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <CheckCircle size={12} className="text-emerald-400" />Clear
              </span>
              <div className="text-xl font-bold text-emerald-400">{stats.clear}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <XCircle size={12} className="text-red-400" />Kapandı
              </span>
              <div className="text-xl font-bold text-red-400">{stats.deactivated}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Package size={12} className="text-orange-400" />İlk Paket
              </span>
              <div className="text-xl font-bold text-orange-400">{stats.firstPackage}</div>
            </CardContent>
          </Card>
        </div>

        {/* Last Scan + Search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {lastScan && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Clock size={12} />
              Son tarama: {formatDistanceToNow(lastScan, { locale: tr, addSuffix: true })}
              <span className="text-primary/50">| Otomatik: her gün 06:00</span>
            </div>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hesap ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 font-mono bg-background/50 border-border/50"
            />
          </div>
        </div>

        {/* Table */}
        <Card className="cyber-card">
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search size={40} className="mb-4 opacity-30" />
                <p className="font-mono text-sm">
                  {accounts.length === 0
                    ? 'Henüz tarama yapılmamış. "Tara" butonuna tıklayın.'
                    : 'Sonuç bulunamadı.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">Hesap</TableHead>
                      <TableHead className="font-mono">BGC</TableHead>
                      <TableHead className="font-mono">Durum</TableHead>
                      <TableHead className="font-mono">İlk Paket</TableHead>
                      <TableHead className="font-mono">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(account => (
                      <TableRow key={account.account_email}>
                        <TableCell className="font-mono text-sm">{account.account_email}</TableCell>
                        <TableCell>
                          {account.bgcDone ? (
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-mono text-xs gap-1">
                              <CheckCircle size={10} />Tamamlandı
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/50 font-mono text-xs gap-1">
                              <Hourglass size={10} />Bekliyor
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {account.deactivated ? (
                            <Badge variant="destructive" className="font-mono text-xs gap-1">
                              <XCircle size={10} />Kapandı
                            </Badge>
                          ) : account.bgcDone ? (
                            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-mono text-xs gap-1">
                              <CheckCircle size={10} />Aktif
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {account.deactivated ? (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          ) : account.firstPackage ? (
                            <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/50 font-mono text-xs gap-1">
                              <Package size={10} />Atıldı
                            </Badge>
                          ) : account.bgcDone ? (
                            <span className="text-red-400 text-xs font-mono">Atılmadı</span>
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {account.bgcDate
                            ? format(new Date(account.bgcDate), 'dd/MM/yyyy')
                            : '-'}
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
