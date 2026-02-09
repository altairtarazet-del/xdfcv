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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  AlertTriangle,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

// Her hesabın TEK bir durumu var
type AccountStatus = 'bgc_bekliyor' | 'clear' | 'consider' | 'aktif' | 'kapandi';

interface AccountRow {
  account_email: string;
  status: AccountStatus;
  bgcDate: string | null;
  considerDate: string | null;
  deactivatedDate: string | null;
  firstPackageDate: string | null;
}

interface SuspiciousResult {
  testAccounts: Array<{ email: string; detectionMethod: string }>;
  duplicates: Array<{ email: string; similarTo: string; distance: number; reason: string; detectionMethod: string }>;
  suspicious: Array<{ email: string; reason: string; detectionMethod: string }>;
  totalSuspicious: number;
}

function getStatus(bgcClear: boolean, bgcConsider: boolean, deactivated: boolean, firstPackage: boolean): AccountStatus {
  if (deactivated) return 'kapandi';
  if (firstPackage) return 'aktif';
  if (bgcConsider) return 'consider';
  if (bgcClear) return 'clear';
  return 'bgc_bekliyor';
}

const STATUS_CONFIG: Record<AccountStatus, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof CheckCircle;
  tabColor: string;
}> = {
  bgc_bekliyor: {
    label: 'BGC Bekliyor',
    description: 'Background check devam ediyor',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/50',
    icon: Hourglass,
    tabColor: 'data-[state=active]:text-amber-400',
  },
  clear: {
    label: 'Clear',
    description: 'BGC tamam, ilk paket bekleniyor',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    icon: CheckCircle,
    tabColor: 'data-[state=active]:text-blue-400',
  },
  consider: {
    label: 'Consider',
    description: 'BGC sonucu consider, inceleme gerekli',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/50',
    icon: AlertTriangle,
    tabColor: 'data-[state=active]:text-orange-400',
  },
  aktif: {
    label: 'Aktif',
    description: 'İlk paket atılmış, para alınabilir',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/50',
    icon: DollarSign,
    tabColor: 'data-[state=active]:text-emerald-400',
  },
  kapandi: {
    label: 'Kapandı',
    description: 'Hesap kapanmış',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    icon: XCircle,
    tabColor: 'data-[state=active]:text-red-400',
  },
};

const TAB_ORDER: AccountStatus[] = ['bgc_bekliyor', 'clear', 'consider', 'aktif', 'kapandi'];

function getDisplayDate(account: AccountRow): string | null {
  switch (account.status) {
    case 'kapandi': return account.deactivatedDate;
    case 'aktif': return account.firstPackageDate;
    case 'consider': return account.considerDate;
    default: return account.bgcDate;
  }
}

function getDateLabel(status: AccountStatus): string {
  switch (status) {
    case 'kapandi': return 'Kapanma Tarihi';
    case 'aktif': return 'İlk Paket Tarihi';
    case 'consider': return 'BGC Tarihi';
    case 'clear': return 'BGC Tarihi';
    case 'bgc_bekliyor': return 'Kayıt Tarihi';
  }
}

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<AccountStatus>('bgc_bekliyor');
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Deletion feature state
  const [detecting, setDetecting] = useState(false);
  const [suspiciousResult, setSuspiciousResult] = useState<SuspiciousResult | null>(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const fetchData = useCallback(async () => {
    try {
      const [scanRes, emailRes] = await Promise.all([
        supabase.from('bgc_scan_status').select('account_id, account_email, last_scanned_at').order('account_email'),
        supabase.from('bgc_complete_emails').select('account_email, email_type, email_date').order('email_date', { ascending: false }),
      ]);

      const emailMap = new Map<string, { bgcDate: string | null; considerDate: string | null; deactivatedDate: string | null; firstPackageDate: string | null }>();
      for (const email of (emailRes.data || [])) {
        if (!emailMap.has(email.account_email)) {
          emailMap.set(email.account_email, { bgcDate: null, considerDate: null, deactivatedDate: null, firstPackageDate: null });
        }
        const entry = emailMap.get(email.account_email)!;
        if (email.email_type === 'bgc_complete' && !entry.bgcDate) entry.bgcDate = email.email_date;
        if (email.email_type === 'bgc_consider' && !entry.considerDate) entry.considerDate = email.email_date;
        if (email.email_type === 'deactivated' && !entry.deactivatedDate) entry.deactivatedDate = email.email_date;
        if (email.email_type === 'first_package' && !entry.firstPackageDate) entry.firstPackageDate = email.email_date;
      }

      const rows: AccountRow[] = [];
      for (const s of (scanRes.data || [])) {
        const d = emailMap.get(s.account_email);
        rows.push({
          account_email: s.account_email,
          status: getStatus(!!d?.bgcDate, !!d?.considerDate, !!d?.deactivatedDate, !!d?.firstPackageDate),
          bgcDate: d?.bgcDate || null,
          considerDate: d?.considerDate || null,
          deactivatedDate: d?.deactivatedDate || null,
          firstPackageDate: d?.firstPackageDate || null,
        });
      }

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

      // Recheck existing BGC emails for consider status
      const { data: recheckResult } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'recheckBgcConsider' },
      });

      await fetchData();

      const parts = [];
      if (bgcResult?.newBgcFound) parts.push(`${bgcResult.newBgcFound} clear`);
      if (bgcResult?.newConsiderFound) parts.push(`${bgcResult.newConsiderFound} consider`);
      if (bgcResult?.newDeactivatedFound) parts.push(`${bgcResult.newDeactivatedFound} kapanma`);
      if (fpResult?.newFirstPackageFound) parts.push(`${fpResult.newFirstPackageFound} ilk paket`);
      if (recheckResult?.considersFound) parts.push(`${recheckResult.considersFound} consider tespit`);

      toast({
        title: 'Tarama Tamamlandi',
        description: parts.length > 0 ? parts.join(', ') + '.' : 'Yeni sonuc yok.',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Hata', description: error.message || 'Tarama hatasi' });
    } finally {
      setLoading(false);
    }
  };

  const handleDetectSuspicious = async () => {
    setDetecting(true);
    setSuspiciousResult(null);
    setSelectedForDeletion(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'detectSuspiciousAccounts' },
      });
      if (error) throw error;
      setSuspiciousResult(data as SuspiciousResult);

      // Auto-select all suspicious accounts
      const allSuspicious = new Set([
        ...(data.testAccounts || []).map((t: any) => t.email),
        ...(data.duplicates || []).map((d: any) => d.email),
        ...(data.suspicious || []).map((s: any) => s.email),
      ]);
      setSelectedForDeletion(allSuspicious);

      toast({
        title: 'Tespit Tamamlandi',
        description: `${data.totalSuspicious} supheli hesap bulundu.`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Hata', description: error.message || 'Tespit hatasi' });
    } finally {
      setDetecting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) return;
    setDeleting(true);
    try {
      const emails = Array.from(selectedForDeletion);

      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'deleteFromBgc', accountEmails: emails },
      });
      if (error) throw error;

      await fetchData();
      setSuspiciousResult(null);
      setSelectedForDeletion(new Set());

      toast({
        title: 'Hesaplar Silindi',
        description: `${data.deleted} hesap kalici olarak silindi.`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Hata', description: error.message || 'Silme hatasi' });
    } finally {
      setDeleting(false);
    }
  };

  const toggleDeletionSelection = (email: string) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: Record<AccountStatus, AccountRow[]> = {
      bgc_bekliyor: [],
      clear: [],
      consider: [],
      aktif: [],
      kapandi: [],
    };

    for (const a of accounts) {
      if (q && !a.account_email.toLowerCase().includes(q)) continue;
      result[a.status].push(a);
    }

    // Sort each group by relevant date descending (newest first)
    result.bgc_bekliyor.sort((a, b) => {
      const da = a.bgcDate ? new Date(a.bgcDate).getTime() : 0;
      const db = b.bgcDate ? new Date(b.bgcDate).getTime() : 0;
      return db - da;
    });
    result.clear.sort((a, b) => {
      const da = a.bgcDate ? new Date(a.bgcDate).getTime() : 0;
      const db = b.bgcDate ? new Date(b.bgcDate).getTime() : 0;
      return db - da;
    });
    result.consider.sort((a, b) => {
      const da = a.considerDate ? new Date(a.considerDate).getTime() : 0;
      const db = b.considerDate ? new Date(b.considerDate).getTime() : 0;
      return db - da;
    });
    result.aktif.sort((a, b) => {
      const da = a.firstPackageDate ? new Date(a.firstPackageDate).getTime() : 0;
      const db = b.firstPackageDate ? new Date(b.firstPackageDate).getTime() : 0;
      return db - da;
    });
    result.kapandi.sort((a, b) => {
      const da = a.deactivatedDate ? new Date(a.deactivatedDate).getTime() : 0;
      const db = b.deactivatedDate ? new Date(b.deactivatedDate).getTime() : 0;
      return db - da;
    });

    return result;
  }, [accounts, searchQuery]);

  const stats = useMemo(() => {
    const counts: Record<AccountStatus, number> = { bgc_bekliyor: 0, clear: 0, consider: 0, aktif: 0, kapandi: 0 };
    for (const a of accounts) counts[a.status]++;
    return counts;
  }, [accounts]);

  const exportToCSV = () => {
    const activeAccounts = grouped[activeTab];
    if (activeAccounts.length === 0) return;
    const headers = ['Hesap', 'Durum', 'BGC Tarihi', 'Kapanma Tarihi', 'Ilk Paket Tarihi'];
    const rows = activeAccounts.map(a => [
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
    link.download = `bgc-${STATUS_CONFIG[activeTab].label.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!canViewBgcComplete) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="cyber-card border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-muted-foreground font-mono">Bu sayfaya erisim yetkiniz bulunmuyor.</p>
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Taraniyor...</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" />Tara</>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={grouped[activeTab].length === 0}>
              <Download className="mr-2 h-4 w-4" />CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(Object.entries(STATUS_CONFIG) as [AccountStatus, typeof STATUS_CONFIG[AccountStatus]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <Card key={key} className="cyber-card">
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountStatus)}>
          <TabsList className="w-full grid grid-cols-5 h-auto">
            {TAB_ORDER.map((key) => {
              const cfg = STATUS_CONFIG[key];
              const Icon = cfg.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className={`font-mono text-xs gap-1.5 py-2 ${cfg.tabColor}`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{cfg.label}</span>
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${cfg.bgColor}`}>
                    {grouped[key].length}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {TAB_ORDER.map((key) => {
            const cfg = STATUS_CONFIG[key];
            const tabAccounts = grouped[key];
            return (
              <TabsContent key={key} value={key} className="mt-4 space-y-4">
                {/* Suspicious Detection Panel — only on BGC Bekliyor tab */}
                {key === 'bgc_bekliyor' && (
                  <Card className="cyber-card border-amber-500/30">
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono text-amber-400 flex items-center gap-2">
                          <ShieldAlert size={16} />
                          Hesap Temizligi
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDetectSuspicious}
                            disabled={detecting}
                          >
                            {detecting ? (
                              <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Tespit ediliyor...</>
                            ) : (
                              <><Search className="mr-2 h-3 w-3" />Supheli Hesaplari Tespit Et</>
                            )}
                          </Button>
                          {selectedForDeletion.size > 0 && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleDeleteSelected}
                              disabled={deleting}
                            >
                              {deleting ? (
                                <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Siliniyor...</>
                              ) : (
                                <><Trash2 className="mr-2 h-3 w-3" />Secilenleri Sil ({selectedForDeletion.size})</>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Suspicious Results */}
                      {suspiciousResult && (
                        <div className="space-y-2">
                          {suspiciousResult.testAccounts.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-mono text-red-400">Test Hesaplari:</span>
                              {suspiciousResult.testAccounts.map(t => (
                                <div key={t.email} className="flex items-center gap-2 pl-2">
                                  <Checkbox
                                    checked={selectedForDeletion.has(t.email)}
                                    onCheckedChange={() => toggleDeletionSelection(t.email)}
                                  />
                                  <span className="font-mono text-xs">{t.email}</span>
                                  <Badge className="bg-red-500/20 text-red-400 border-red-500/50 text-[10px]">test ({t.detectionMethod})</Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {suspiciousResult.duplicates.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-mono text-orange-400">Duplike/Typo Hesaplar:</span>
                              {suspiciousResult.duplicates.map(dup => (
                                <div key={dup.email} className="flex items-center gap-2 pl-2">
                                  <Checkbox
                                    checked={selectedForDeletion.has(dup.email)}
                                    onCheckedChange={() => toggleDeletionSelection(dup.email)}
                                  />
                                  <span className="font-mono text-xs">{dup.email}</span>
                                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 text-[10px]">
                                    {dup.detectionMethod === 'ai' ? dup.reason : `benzer: ${dup.similarTo.split('@')[0]} (d=${dup.distance})`} ({dup.detectionMethod})
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {suspiciousResult.suspicious && suspiciousResult.suspicious.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs font-mono text-purple-400">AI Tespit - Supheli:</span>
                              {suspiciousResult.suspicious.map(s => (
                                <div key={s.email} className="flex items-center gap-2 pl-2">
                                  <Checkbox
                                    checked={selectedForDeletion.has(s.email)}
                                    onCheckedChange={() => toggleDeletionSelection(s.email)}
                                  />
                                  <span className="font-mono text-xs">{s.email}</span>
                                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50 text-[10px]">
                                    {s.reason} (ai)
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                          {suspiciousResult.totalSuspicious === 0 && (
                            <p className="text-xs font-mono text-muted-foreground">Supheli hesap bulunamadi.</p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Account Table */}
                <Card className="cyber-card">
                  <CardContent className="p-0">
                    {tabAccounts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <cfg.icon size={40} className="mb-4 opacity-30" />
                        <p className="font-mono text-sm">
                          {accounts.length === 0
                            ? 'Henuz tarama yapilmamis. "Tara" butonuna tiklayin.'
                            : 'Bu durumda hesap yok.'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="font-mono">Hesap</TableHead>
                              <TableHead className="font-mono">{getDateLabel(key)}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tabAccounts.map(account => {
                              const displayDate = getDisplayDate(account);
                              return (
                                <TableRow key={account.account_email}>
                                  <TableCell className="font-mono text-sm">{account.account_email}</TableCell>
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
              </TabsContent>
            );
          })}
        </Tabs>

      </div>
    </DashboardLayout>
  );
}
