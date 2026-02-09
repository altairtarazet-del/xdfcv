import { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DollarSign,
  Download,
  RefreshCw,
  Hourglass,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

// Her hesabın TEK bir durumu var
type AccountStatus = 'bgc_bekliyor' | 'clear' | 'aktif' | 'kapandi';

interface AccountRow {
  account_email: string;
  status: AccountStatus;
  bgcDate: string | null;
  deactivatedDate: string | null;
  firstPackageDate: string | null;
}

function getStatus(bgcDone: boolean, deactivated: boolean, firstPackage: boolean): AccountStatus {
  if (deactivated) return 'kapandi';
  if (firstPackage) return 'aktif';
  if (bgcDone) return 'clear';
  return 'bgc_bekliyor';
}

const STATUS_CONFIG: Record<AccountStatus, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof CheckCircle;
}> = {
  bgc_bekliyor: {
    label: 'BGC Bekliyor',
    description: 'Background check devam ediyor',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/50',
    icon: Hourglass,
  },
  clear: {
    label: 'Clear',
    description: 'BGC tamam, ilk paket bekleniyor',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    icon: CheckCircle,
  },
  aktif: {
    label: 'Aktif',
    description: 'İlk paket atılmış, para alınabilir',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/50',
    icon: DollarSign,
  },
  kapandi: {
    label: 'Kapandı',
    description: 'Hesap kapanmış',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    icon: XCircle,
  },
};

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | null>(null);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const fetchData = useCallback(async () => {
    try {
      const [scanRes, emailRes] = await Promise.all([
        supabase.from('bgc_scan_status').select('account_id, account_email, last_scanned_at').order('account_email'),
        supabase.from('bgc_complete_emails').select('account_email, email_type, email_date').order('email_date', { ascending: false }),
      ]);

      const emailMap = new Map<string, { bgcDate: string | null; deactivatedDate: string | null; firstPackageDate: string | null }>();
      for (const email of (emailRes.data || [])) {
        if (!emailMap.has(email.account_email)) {
          emailMap.set(email.account_email, { bgcDate: null, deactivatedDate: null, firstPackageDate: null });
        }
        const entry = emailMap.get(email.account_email)!;
        if (email.email_type === 'bgc_complete' && !entry.bgcDate) entry.bgcDate = email.email_date;
        if (email.email_type === 'deactivated' && !entry.deactivatedDate) entry.deactivatedDate = email.email_date;
        if (email.email_type === 'first_package' && !entry.firstPackageDate) entry.firstPackageDate = email.email_date;
      }

      const rows: AccountRow[] = (scanRes.data || []).map(s => {
        const d = emailMap.get(s.account_email);
        return {
          account_email: s.account_email,
          status: getStatus(!!d?.bgcDate, !!d?.deactivatedDate, !!d?.firstPackageDate),
          bgcDate: d?.bgcDate || null,
          deactivatedDate: d?.deactivatedDate || null,
          firstPackageDate: d?.firstPackageDate || null,
        };
      });

      setAccounts(rows);

      if (scanRes.data && scanRes.data.length > 0) {
        const dates = scanRes.data.map(s => new Date(s.last_scanned_at).getTime());
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

  const handleScan = async () => {
    setLoading(true);
    try {
      const { data: bgcResult, error: bgcError } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanBgcComplete' },
      });
      if (bgcError) throw bgcError;

      const { data: fpResult, error: fpError } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'scanFirstPackage' },
      });
      if (fpError) throw fpError;

      await fetchData();

      toast({
        title: 'Tarama Tamamlandı',
        description: `${bgcResult?.newBgcFound || 0} yeni BGC, ${bgcResult?.newDeactivatedFound || 0} kapanma, ${fpResult?.newFirstPackageFound || 0} ilk paket.`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Hata', description: error.message || 'Tarama hatası' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return accounts.filter(a => {
      if (q && !a.account_email.toLowerCase().includes(q)) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const counts: Record<AccountStatus, number> = { bgc_bekliyor: 0, clear: 0, aktif: 0, kapandi: 0 };
    for (const a of accounts) counts[a.status]++;
    return counts;
  }, [accounts]);

  const exportToCSV = () => {
    const headers = ['Hesap', 'Durum', 'BGC Tarihi', 'Kapanma Tarihi', 'İlk Paket Tarihi'];
    const rows = filtered.map(a => [
      a.account_email,
      STATUS_CONFIG[a.status].label,
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

        {/* Stats — tıklanabilir filtre */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.entries(STATUS_CONFIG) as [AccountStatus, typeof STATUS_CONFIG[AccountStatus]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = statusFilter === key;
            return (
              <Card
                key={key}
                className={`cyber-card cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : 'hover:opacity-80'}`}
                onClick={() => setStatusFilter(isActive ? null : key)}
              >
                <CardContent className="pt-3 pb-3">
                  <span className={`text-xs font-mono flex items-center gap-1 ${cfg.color}`}>
                    <Icon size={12} />
                    {cfg.label}
                  </span>
                  <div className={`text-2xl font-bold ${cfg.color} mt-1`}>{stats[key]}</div>
                  <span className="text-[10px] font-mono text-muted-foreground">{cfg.description}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search + Last Scan */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            {lastScan && (
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <Clock size={12} />
                {formatDistanceToNow(lastScan, { locale: tr, addSuffix: true })}
              </span>
            )}
            {statusFilter && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter(null)} className="text-xs font-mono h-6 px-2">
                Filtreyi kaldır ×
              </Button>
            )}
          </div>
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
                      <TableHead className="font-mono">Durum</TableHead>
                      <TableHead className="font-mono">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(account => {
                      const cfg = STATUS_CONFIG[account.status];
                      const Icon = cfg.icon;
                      // En alakalı tarihi göster
                      const displayDate = account.status === 'kapandi'
                        ? account.deactivatedDate
                        : account.status === 'aktif'
                        ? account.firstPackageDate
                        : account.bgcDate;

                      return (
                        <TableRow key={account.account_email}>
                          <TableCell className="font-mono text-sm">{account.account_email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${cfg.bgColor} ${cfg.color} ${cfg.borderColor} font-mono text-xs gap-1`}>
                              <Icon size={10} />
                              {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {displayDate ? format(new Date(displayDate), 'dd/MM/yyyy') : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
