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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle,
  Clock,
  Search,
  Database,
  XCircle,
  Check,
  X,
  Package,
  AlertTriangle,
  Brain,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { AccountTimeline } from '@/components/AccountTimeline';

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
  ai_classified?: boolean;
  ai_confidence?: number;
  extracted_data?: any;
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
  const [recentDeactivated, setRecentDeactivated] = useState<string[]>([]);
  const [recentFirstPackage, setRecentFirstPackage] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [firstPackageLoading, setFirstPackageLoading] = useState(false);
  const [riskLoading, setRiskLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanStats, setScanStats] = useState<ScanStats>({
    totalBgcInDb: 0,
    totalDeactivatedInDb: 0,
    totalFirstPackageInDb: 0
  });
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Phase 5: Timeline drawer
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Phase 6: Risk scores
  const [riskScores, setRiskScores] = useState<Map<string, number>>(new Map());

  // Phase 6: Bulk selection
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Check permission
  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

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

      // Fetch deactivated emails to build the set (ordered by date for recent list)
      const { data: deactivatedData, error: deactivatedError } = await supabase
        .from('bgc_complete_emails')
        .select('account_email, email_date')
        .eq('email_type', 'deactivated')
        .order('email_date', { ascending: false });

      if (deactivatedError) {
        console.error('Error fetching deactivated emails:', deactivatedError);
      }

      // Fetch first_package emails to build the set (ordered by date for recent list)
      const { data: firstPackageData, error: firstPackageError } = await supabase
        .from('bgc_complete_emails')
        .select('account_email, email_date')
        .eq('email_type', 'first_package')
        .order('email_date', { ascending: false });

      if (firstPackageError) {
        console.error('Error fetching first package emails:', firstPackageError);
      }

      // Fetch risk scores
      const { data: riskData } = await supabase
        .from('bgc_risk_scores')
        .select('account_email, risk_score');

      if (riskData) {
        const riskMap = new Map<string, number>();
        riskData.forEach((r: any) => riskMap.set(r.account_email, r.risk_score));
        setRiskScores(riskMap);
      }

      if (bgcData) {
        setBgcEmails(bgcData as BgcEmail[]);
        // For BGC: deduplicate by account_email
        const uniqueBgcAccounts = new Set(bgcData.map(e => e.account_email));
        setScanStats(prev => ({ ...prev, totalBgcInDb: uniqueBgcAccounts.size }));
      }

      // Build set of deactivated account emails and recent list
      if (deactivatedData) {
        const deactivatedAccountSet = new Set(deactivatedData.map(e => e.account_email));
        setDeactivatedAccounts(deactivatedAccountSet);
        setRecentDeactivated(deactivatedData.slice(0, 5).map(e => e.account_email));
        // For deactivated: use unique account count
        setScanStats(prev => ({ ...prev, totalDeactivatedInDb: deactivatedAccountSet.size }));
      }

      // Build set of first package account emails and recent list
      if (firstPackageData) {
        const firstPackageAccountSet = new Set(firstPackageData.map(e => e.account_email));
        setFirstPackageAccounts(firstPackageAccountSet);
        setRecentFirstPackage(firstPackageData.slice(0, 5).map(e => e.account_email));
        // For firstPackage: use unique account count
        setScanStats(prev => ({ ...prev, totalFirstPackageInDb: firstPackageAccountSet.size }));
      }
      // Load last scan time from database
      const { data: lastScanData } = await supabase
        .from('bgc_scan_status')
        .select('last_scanned_at')
        .order('last_scanned_at', { ascending: false })
        .limit(1)
        .single();

      if (lastScanData?.last_scanned_at) {
        setLastScan(new Date(lastScanData.last_scanned_at));
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

        toast({
          title: 'Tarama Tamamlandı',
          description: `${data.newBgcFound || 0} yeni BGC, ${data.newDeactivatedFound || 0} yeni deaktive bulundu.`,
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
          description: `${data.newFirstPackageFound || 0} yeni ilk paket bulundu.`,
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

  const handleCalculateRisk = async () => {
    setRiskLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'calculateRiskScores' }
      });

      if (error) throw error;

      toast({
        title: 'Risk Hesaplandı',
        description: `${data?.calculated || 0} hesap: ${data?.highRisk || 0} yüksek, ${data?.mediumRisk || 0} orta, ${data?.lowRisk || 0} düşük risk.`,
      });

      // Refresh to get updated risk scores
      await fetchSavedEmails();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Risk hesaplama sırasında hata oluştu',
      });
    } finally {
      setRiskLoading(false);
    }
  };

  // CSV Export
  const exportToCSV = (emails: BgcEmail[]) => {
    const headers = ['Hesap', 'BGC Durumu', 'İlk Paket', 'Risk', 'Tarih'];
    const rows = emails.map(email => {
      const status = deactivatedAccounts.has(email.account_email) ? 'Kapandı' : 'Clear';
      const firstPkg = firstPackageAccounts.has(email.account_email) ? 'Evet' : 'Hayır';
      const risk = riskScores.get(email.account_email) ?? '-';
      return [email.account_email, status, firstPkg, risk, format(new Date(email.email_date), 'dd/MM/yyyy HH:mm')];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bgc-complete-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter emails by time and search query, deduplicated by account_email
  const filteredEmails = useMemo(() => {
    const now = new Date();
    const query = searchQuery.toLowerCase().trim();

    // Deduplicate by account_email — keep the latest email per account
    const accountMap = new Map<string, BgcEmail>();
    for (const email of bgcEmails) {
      const existing = accountMap.get(email.account_email);
      if (!existing || new Date(email.email_date) > new Date(existing.email_date)) {
        accountMap.set(email.account_email, email);
      }
    }

    return Array.from(accountMap.values()).filter(email => {
      const emailDate = new Date(email.email_date);
      let passesTimeFilter = true;
      if (activeTab === '24h') {
        passesTimeFilter = now.getTime() - emailDate.getTime() < 24 * 60 * 60 * 1000;
      } else if (activeTab === '7d') {
        passesTimeFilter = now.getTime() - emailDate.getTime() < 7 * 24 * 60 * 60 * 1000;
      }
      const passesSearchFilter = !query || email.account_email.toLowerCase().includes(query);
      return passesTimeFilter && passesSearchFilter;
    });
  }, [bgcEmails, activeTab, searchQuery]);

  // Handle select all toggle
  useEffect(() => {
    if (selectAll) {
      setSelectedEmails(new Set(filteredEmails.map(e => e.id)));
    } else {
      setSelectedEmails(new Set());
    }
  }, [selectAll, filteredEmails]);

  const toggleEmailSelection = (emailId: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const getRiskBadge = (email: string) => {
    const score = riskScores.get(email);
    if (score === undefined) return <span className="text-muted-foreground text-xs font-mono">-</span>;
    if (score >= 50) {
      return (
        <Badge variant="destructive" className="font-mono text-xs gap-1">
          <AlertTriangle size={10} />
          {score}
        </Badge>
      );
    }
    if (score >= 25) {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 font-mono text-xs gap-1">
          <AlertTriangle size={10} />
          {score}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-mono text-xs gap-1">
        {score}
      </Badge>
    );
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
              Background check tamamlanma durumlarını tarayın
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleScan}
              disabled={loading || firstPackageLoading || riskLoading}
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
              disabled={loading || firstPackageLoading || riskLoading}
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
            <Button
              onClick={handleCalculateRisk}
              disabled={loading || firstPackageLoading || riskLoading}
              variant="outline"
              className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
            >
              {riskLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Hesaplanıyor...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Risk Hesapla
                </>
              )}
            </Button>
          </div>
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
              <div className="text-2xl font-bold text-primary">{scanStats.totalBgcInDb}</div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-1">
                <CheckCircle size={14} className="text-emerald-400" />
                Sadece Clear
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">
                {scanStats.totalBgcInDb - scanStats.totalDeactivatedInDb}
              </div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground flex items-center gap-1">
                <Package size={14} className="text-orange-400" />
                İlk Paket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-400">{scanStats.totalFirstPackageInDb}</div>
              {recentFirstPackage.length > 0 && (
                <div className="mt-2 space-y-1">
                  {recentFirstPackage.slice(0, 5).map((email, idx) => (
                    <div key={idx} className="text-xs font-mono text-muted-foreground truncate">
                      {email.split('@')[0]}
                    </div>
                  ))}
                </div>
              )}
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
              {recentDeactivated.length > 0 && (
                <div className="mt-2 space-y-1">
                  {recentDeactivated.slice(0, 5).map((email, idx) => (
                    <div key={idx} className="text-xs font-mono text-muted-foreground truncate">
                      {email.split('@')[0]}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Last Scan Info + Auto Scan Note */}
        {lastScan && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Clock size={14} />
            Son tarama: {format(lastScan, 'dd/MM/yyyy HH:mm:ss')}
            <span className="text-xs text-primary/60 ml-2">| Otomatik tarama: her 30 dakikada</span>
          </div>
        )}

        {/* Search, Tabs, and Export */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="cyber-card">
              <TabsTrigger value="all" className="font-mono">
                Tümü ({scanStats.totalBgcInDb})
              </TabsTrigger>
              <TabsTrigger value="24h" className="font-mono">
                Son 24 Saat
              </TabsTrigger>
              <TabsTrigger value="7d" className="font-mono">
                Son 7 Gün
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2 items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Hesap ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 font-mono bg-background/50 border-border/50"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(filteredEmails)}
              disabled={filteredEmails.length === 0}
              className="shrink-0"
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedEmails.size > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <span className="text-sm font-mono text-primary">{selectedEmails.size} seçili</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const selected = filteredEmails.filter(e => selectedEmails.has(e.id));
                exportToCSV(selected);
              }}
            >
              <Download className="mr-2 h-3 w-3" />
              Seçilenleri İndir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedEmails(new Set()); setSelectAll(false); }}
            >
              Seçimi Temizle
            </Button>
          </div>
        )}

        {/* Results Table */}
        <Card className="cyber-card">
          <CardContent className="p-0">
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Database size={48} className="mb-4 opacity-50" />
                <p className="font-mono text-sm">
                  {bgcEmails.length === 0
                    ? 'Henüz kayıtlı BGC verisi yok. "Yeni Tara" butonuna tıklayın.'
                    : 'Bu zaman aralığında BGC verisi bulunamadı.'
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={(checked) => setSelectAll(!!checked)}
                        />
                      </TableHead>
                      <TableHead className="font-mono">Hesap</TableHead>
                      <TableHead className="font-mono">BGC Complete</TableHead>
                      <TableHead className="font-mono">İlk Paket</TableHead>
                      <TableHead className="font-mono">Risk</TableHead>
                      <TableHead className="font-mono">Tarih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmails.map((email) => (
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedAccount(email.account_email);
                          setTimelineOpen(true);
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedEmails.has(email.id)}
                            onCheckedChange={() => toggleEmailSelection(email.id)}
                          />
                        </TableCell>
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
                          {deactivatedAccounts.has(email.account_email) ? (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          ) : firstPackageAccounts.has(email.account_email) ? (
                            <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/50 font-mono text-xs gap-1">
                              <Check size={12} />
                              Paket Atıldı
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getRiskBadge(email.account_email)}
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

      {/* Timeline Drawer */}
      <AccountTimeline
        accountEmail={selectedAccount}
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
      />
    </DashboardLayout>
  );
}
