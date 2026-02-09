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
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle,
  Clock,
  Search,
  XCircle,
  Package,
  AlertTriangle,
  Brain,
  Download,
  Zap,
  Shield,
  UserCheck,
  Mail,
  Eye,
  ChevronRight,
  AlertCircle,
  Info,
  Activity,
  TrendingUp,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { AccountTimeline } from '@/components/AccountTimeline';

// State configuration: colors, labels, icons
const STATE_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof CheckCircle;
  order: number;
}> = {
  REGISTERED:   { label: 'Kayıt',        color: 'text-blue-400',    bgColor: 'bg-blue-500/10',    borderColor: 'border-blue-500/30',    icon: UserCheck,     order: 0 },
  VERIFYING:    { label: 'Doğrulama',    color: 'text-indigo-400',  bgColor: 'bg-indigo-500/10',  borderColor: 'border-indigo-500/30',  icon: Shield,        order: 1 },
  BGC_PENDING:  { label: 'BGC Bekliyor', color: 'text-amber-400',   bgColor: 'bg-amber-500/10',   borderColor: 'border-amber-500/30',   icon: Clock,         order: 2 },
  BGC_ISSUE:    { label: 'BGC Sorun',    color: 'text-orange-400',  bgColor: 'bg-orange-500/10',  borderColor: 'border-orange-500/30',  icon: AlertCircle,   order: 3 },
  BGC_CLEAR:    { label: 'BGC Tamam',    color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', icon: CheckCircle,   order: 4 },
  ONBOARDING:   { label: 'Onboarding',   color: 'text-cyan-400',    bgColor: 'bg-cyan-500/10',    borderColor: 'border-cyan-500/30',    icon: Package,       order: 5 },
  ACTIVE:       { label: 'Aktif',         color: 'text-green-400',   bgColor: 'bg-green-500/10',   borderColor: 'border-green-500/30',   icon: Activity,      order: 6 },
  WARNING:      { label: 'Uyarı',         color: 'text-yellow-400',  bgColor: 'bg-yellow-500/10',  borderColor: 'border-yellow-500/30',  icon: AlertTriangle, order: 7 },
  DEACTIVATED:  { label: 'Deaktif',       color: 'text-red-400',     bgColor: 'bg-red-500/10',     borderColor: 'border-red-500/30',     icon: XCircle,       order: 8 },
  APPEALING:    { label: 'İtiraz',        color: 'text-purple-400',  bgColor: 'bg-purple-500/10',  borderColor: 'border-purple-500/30',  icon: Eye,           order: 9 },
  UNKNOWN:      { label: 'Bilinmiyor',    color: 'text-gray-400',    bgColor: 'bg-gray-500/10',    borderColor: 'border-gray-500/30',    icon: Info,          order: 10 },
};

interface AccountState {
  id: string;
  account_email: string;
  current_state: string;
  previous_state: string | null;
  state_confidence: number;
  lifecycle_score: number;
  anomaly_flags: string[];
  email_count: number;
  first_email_at: string | null;
  last_email_at: string | null;
  last_analyzed_at: string;
  metadata: any;
}

interface Insight {
  id: string;
  account_email: string;
  insight_type: string;
  priority: string;
  title: string;
  description: string;
  suggested_action: string | null;
  is_dismissed: boolean;
  created_at: string;
}

type ViewMode = 'pipeline' | 'table';

export default function BgcComplete() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();

  // Data
  const [accountStates, setAccountStates] = useState<AccountState[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Analysis progress
  const [analysisProgress, setAnalysisProgress] = useState<{
    running: boolean;
    processed: number;
    total: number;
    phase: string;
  } | null>(null);

  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  // Fetch all data from DB
  const fetchData = useCallback(async () => {
    try {
      const [statesRes, insightsRes] = await Promise.all([
        supabase
          .from('account_states')
          .select('*')
          .order('lifecycle_score', { ascending: false }),
        supabase
          .from('account_insights')
          .select('*')
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false }),
      ]);

      if (statesRes.data) setAccountStates(statesRes.data as AccountState[]);
      if (insightsRes.data) setInsights(insightsRes.data as Insight[]);
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

  // Deep Analysis — calls deepAnalyze in batches until all accounts processed
  const handleDeepAnalyze = async () => {
    setLoading(true);
    setAnalysisProgress({ running: true, processed: 0, total: 0, phase: 'Başlatılıyor...' });

    try {
      let totalProcessed = 0;
      let totalAccounts = 0;
      let iteration = 0;
      const MAX_ITERATIONS = 20; // Safety limit

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        setAnalysisProgress(prev => ({
          ...prev!,
          phase: `Batch ${iteration} analiz ediliyor...`,
        }));

        const { data, error } = await supabase.functions.invoke('smtp-api', {
          body: {
            action: 'deepAnalyze',
            batchSize: 10,
            forceRefresh: iteration === 1, // Force refresh on first batch
          },
        });

        if (error) throw error;

        totalProcessed += data.processed || 0;
        totalAccounts = data.total || 0;

        setAnalysisProgress({
          running: true,
          processed: totalProcessed,
          total: totalAccounts,
          phase: `${totalProcessed}/${totalAccounts} hesap analiz edildi...`,
        });

        // If no remaining accounts, we're done
        if (data.remaining <= 0 || data.processed === 0) {
          break;
        }
      }

      setAnalysisProgress(prev => ({
        ...prev!,
        running: false,
        phase: 'Tamamlandı!',
      }));

      // Refresh data
      await fetchData();

      toast({
        title: 'Derin Analiz Tamamlandı',
        description: `${totalProcessed} hesap analiz edildi.`,
      });
    } catch (error: any) {
      console.error('Deep analysis error:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Analiz sırasında hata oluştu',
      });
    } finally {
      setLoading(false);
      setTimeout(() => setAnalysisProgress(null), 3000);
    }
  };

  // Dismiss insight
  const handleDismissInsight = async (insightId: string) => {
    const { error } = await supabase
      .from('account_insights')
      .update({ is_dismissed: true })
      .eq('id', insightId);

    if (!error) {
      setInsights(prev => prev.filter(i => i.id !== insightId));
    }
  };

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return accountStates.filter(a => {
      const passesSearch = !query || a.account_email.toLowerCase().includes(query);
      const passesState = !stateFilter || a.current_state === stateFilter;
      return passesSearch && passesState;
    });
  }, [accountStates, searchQuery, stateFilter]);

  // Group accounts by state for pipeline view
  const pipelineGroups = useMemo(() => {
    const groups: Record<string, AccountState[]> = {};
    const orderedStates = Object.entries(STATE_CONFIG)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key]) => key);

    for (const state of orderedStates) {
      groups[state] = [];
    }

    for (const account of filteredAccounts) {
      const state = account.current_state || 'UNKNOWN';
      if (!groups[state]) groups[state] = [];
      groups[state].push(account);
    }

    return groups;
  }, [filteredAccounts]);

  // Insights grouped by priority
  const insightsByPriority = useMemo(() => ({
    urgent: insights.filter(i => i.priority === 'urgent'),
    warning: insights.filter(i => i.priority === 'warning'),
    info: insights.filter(i => i.priority === 'info'),
  }), [insights]);

  // State distribution for stats
  const stateDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const a of accountStates) {
      dist[a.current_state] = (dist[a.current_state] || 0) + 1;
    }
    return dist;
  }, [accountStates]);

  // CSV Export
  const exportToCSV = () => {
    const headers = ['Hesap', 'Durum', 'Önceki Durum', 'Yaşam Skoru', 'Güven', 'Email Sayısı', 'İlk Email', 'Son Email', 'Analiz Tarihi'];
    const rows = filteredAccounts.map(a => [
      a.account_email,
      STATE_CONFIG[a.current_state]?.label || a.current_state,
      a.previous_state ? (STATE_CONFIG[a.previous_state]?.label || a.previous_state) : '-',
      a.lifecycle_score,
      `${Math.round(a.state_confidence * 100)}%`,
      a.email_count,
      a.first_email_at ? format(new Date(a.first_email_at), 'dd/MM/yyyy') : '-',
      a.last_email_at ? format(new Date(a.last_email_at), 'dd/MM/yyyy') : '-',
      format(new Date(a.last_analyzed_at), 'dd/MM/yyyy HH:mm'),
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bgc-intelligence-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Toggle select
  useEffect(() => {
    if (selectAll) {
      setSelectedEmails(new Set(filteredAccounts.map(a => a.account_email)));
    } else {
      setSelectedEmails(new Set());
    }
  }, [selectAll, filteredAccounts]);

  const toggleSelection = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

  // Last analyzed time
  const lastAnalyzed = useMemo(() => {
    if (accountStates.length === 0) return null;
    const dates = accountStates.map(a => new Date(a.last_analyzed_at).getTime());
    return new Date(Math.max(...dates));
  }, [accountStates]);

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
              <Brain className="text-primary" />
              Dasher Intelligence
            </h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">
              Akıllı hesap yaşam döngüsü analizi ve karar motoru
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleDeepAnalyze}
              disabled={loading}
              className="cyber-button"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analiz Ediliyor...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Derin Analiz
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={filteredAccounts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Analysis Progress Bar */}
        {analysisProgress && (
          <Card className="cyber-card border-primary/30">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {analysisProgress.running ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-mono text-foreground">{analysisProgress.phase}</p>
                  {analysisProgress.total > 0 && (
                    <Progress
                      value={(analysisProgress.processed / analysisProgress.total) * 100}
                      className="mt-2 h-2"
                    />
                  )}
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {analysisProgress.processed}/{analysisProgress.total}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-primary" />
                <span className="text-xs font-mono text-muted-foreground">Toplam Hesap</span>
              </div>
              <div className="text-xl font-bold text-primary mt-1">{accountStates.length}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-green-400" />
                <span className="text-xs font-mono text-muted-foreground">Aktif</span>
              </div>
              <div className="text-xl font-bold text-green-400 mt-1">
                {stateDistribution['ACTIVE'] || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <XCircle size={14} className="text-red-400" />
                <span className="text-xs font-mono text-muted-foreground">Deaktif</span>
              </div>
              <div className="text-xl font-bold text-red-400 mt-1">
                {stateDistribution['DEACTIVATED'] || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-400" />
                <span className="text-xs font-mono text-muted-foreground">Uyarı</span>
              </div>
              <div className="text-xl font-bold text-yellow-400 mt-1">
                {(stateDistribution['WARNING'] || 0) + (stateDistribution['BGC_ISSUE'] || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-cyan-400" />
                <span className="text-xs font-mono text-muted-foreground">İçgörü</span>
              </div>
              <div className="text-xl font-bold text-cyan-400 mt-1">{insights.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Insights Panel */}
        {insights.length > 0 && (
          <Card className="cyber-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <Brain size={16} className="text-primary" />
                İçgörüler ve Kararlar
                <div className="flex gap-2 ml-auto">
                  {insightsByPriority.urgent.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {insightsByPriority.urgent.length} Acil
                    </Badge>
                  )}
                  {insightsByPriority.warning.length > 0 && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 text-xs">
                      {insightsByPriority.warning.length} Uyarı
                    </Badge>
                  )}
                  {insightsByPriority.info.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {insightsByPriority.info.length} Bilgi
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-60 overflow-y-auto">
              {[...insightsByPriority.urgent, ...insightsByPriority.warning, ...insightsByPriority.info.slice(0, 5)].map(insight => {
                const priorityConfig = {
                  urgent: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20' },
                  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/5 border-yellow-500/20' },
                  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/20' },
                }[insight.priority] || { icon: Info, color: 'text-gray-400', bg: 'bg-gray-500/5 border-gray-500/20' };

                const Icon = priorityConfig.icon;

                return (
                  <div
                    key={insight.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${priorityConfig.bg} cursor-pointer hover:opacity-80 transition-opacity`}
                    onClick={() => {
                      setSelectedAccount(insight.account_email);
                      setTimelineOpen(true);
                    }}
                  >
                    <Icon size={16} className={`${priorityConfig.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-foreground">{insight.title}</span>
                        <span className="text-xs font-mono text-muted-foreground truncate">
                          {insight.account_email.split('@')[0]}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{insight.description}</p>
                      {insight.suggested_action && (
                        <p className="text-xs font-mono text-primary/70 mt-1 flex items-center gap-1">
                          <ChevronRight size={10} />
                          {insight.suggested_action}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-6 w-6 p-0 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismissInsight(insight.id);
                      }}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* View Toggle + Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'pipeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('pipeline')}
              className="font-mono text-xs"
            >
              Pipeline
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="font-mono text-xs"
            >
              Tablo
            </Button>
            {stateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStateFilter(null)}
                className="font-mono text-xs text-muted-foreground"
              >
                Filtre Temizle
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
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
            {lastAnalyzed && (
              <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                <Clock size={10} className="inline mr-1" />
                {formatDistanceToNow(lastAnalyzed, { locale: tr, addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        {/* No Data State */}
        {accountStates.length === 0 && (
          <Card className="cyber-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Brain size={48} className="text-muted-foreground/30 mb-4" />
              <p className="font-mono text-sm text-muted-foreground mb-2">
                Henüz analiz yapılmamış.
              </p>
              <p className="font-mono text-xs text-muted-foreground mb-4">
                "Derin Analiz" butonuna tıklayarak tüm hesapları analiz edin.
              </p>
              <Button onClick={handleDeepAnalyze} disabled={loading} className="cyber-button">
                <Zap className="mr-2 h-4 w-4" />
                Derin Analiz Başlat
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Pipeline View */}
        {viewMode === 'pipeline' && accountStates.length > 0 && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3 min-w-max">
              {Object.entries(pipelineGroups)
                .filter(([, accounts]) => accounts.length > 0)
                .map(([state, accounts]) => {
                  const config = STATE_CONFIG[state] || STATE_CONFIG.UNKNOWN;
                  const StateIcon = config.icon;

                  return (
                    <div
                      key={state}
                      className={`w-52 shrink-0 rounded-lg border ${config.borderColor} ${config.bgColor}`}
                    >
                      {/* Pipeline Column Header */}
                      <div
                        className="p-3 border-b border-border/30 cursor-pointer hover:opacity-80"
                        onClick={() => setStateFilter(stateFilter === state ? null : state)}
                      >
                        <div className="flex items-center gap-2">
                          <StateIcon size={14} className={config.color} />
                          <span className={`text-xs font-mono font-bold ${config.color}`}>
                            {config.label}
                          </span>
                          <Badge variant="outline" className="ml-auto text-xs font-mono">
                            {accounts.length}
                          </Badge>
                        </div>
                      </div>

                      {/* Pipeline Column Content */}
                      <div className="p-2 space-y-1.5 max-h-80 overflow-y-auto">
                        {accounts.map(account => {
                          const accountInsights = insights.filter(
                            i => i.account_email === account.account_email
                          );
                          const hasUrgent = accountInsights.some(i => i.priority === 'urgent');
                          const hasWarning = accountInsights.some(i => i.priority === 'warning');

                          return (
                            <div
                              key={account.account_email}
                              className={`p-2 rounded-md bg-background/60 border border-border/20 cursor-pointer hover:border-primary/40 transition-colors group ${
                                hasUrgent ? 'ring-1 ring-red-500/40' : hasWarning ? 'ring-1 ring-yellow-500/30' : ''
                              }`}
                              onClick={() => {
                                setSelectedAccount(account.account_email);
                                setTimelineOpen(true);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-foreground truncate max-w-[120px]">
                                  {account.account_email.split('@')[0]}
                                </span>
                                {hasUrgent && <AlertCircle size={10} className="text-red-400 shrink-0" />}
                                {!hasUrgent && hasWarning && <AlertTriangle size={10} className="text-yellow-400 shrink-0" />}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {account.email_count} email
                                </span>
                                <div className="flex items-center gap-1">
                                  <div className="h-1 w-12 bg-border/50 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary/60 rounded-full"
                                      style={{ width: `${account.lifecycle_score}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    {account.lifecycle_score}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && accountStates.length > 0 && (
          <>
            {/* Bulk Action Bar */}
            {selectedEmails.size > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-mono text-primary">{selectedEmails.size} seçili</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedEmails(new Set()); setSelectAll(false); }}
                >
                  Seçimi Temizle
                </Button>
              </div>
            )}

            <Card className="cyber-card">
              <CardContent className="p-0">
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
                        <TableHead className="font-mono">Durum</TableHead>
                        <TableHead className="font-mono">Yaşam Skoru</TableHead>
                        <TableHead className="font-mono">Email</TableHead>
                        <TableHead className="font-mono">Güven</TableHead>
                        <TableHead className="font-mono">İçgörü</TableHead>
                        <TableHead className="font-mono">Son Analiz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccounts.map(account => {
                        const config = STATE_CONFIG[account.current_state] || STATE_CONFIG.UNKNOWN;
                        const StateIcon = config.icon;
                        const accountInsights = insights.filter(
                          i => i.account_email === account.account_email
                        );
                        const urgentCount = accountInsights.filter(i => i.priority === 'urgent').length;
                        const warningCount = accountInsights.filter(i => i.priority === 'warning').length;

                        return (
                          <TableRow
                            key={account.account_email}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedAccount(account.account_email);
                              setTimelineOpen(true);
                            }}
                          >
                            <TableCell onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedEmails.has(account.account_email)}
                                onCheckedChange={() => toggleSelection(account.account_email)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {account.account_email}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${config.bgColor} ${config.color} ${config.borderColor} font-mono text-xs gap-1`}>
                                <StateIcon size={10} />
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 bg-border/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${account.lifecycle_score}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono text-muted-foreground w-6">
                                  {account.lifecycle_score}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {account.email_count}
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs font-mono ${
                                account.state_confidence >= 0.8 ? 'text-emerald-400' :
                                account.state_confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {Math.round(account.state_confidence * 100)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              {urgentCount > 0 && (
                                <Badge variant="destructive" className="text-xs mr-1">{urgentCount}</Badge>
                              )}
                              {warningCount > 0 && (
                                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 text-xs">{warningCount}</Badge>
                              )}
                              {urgentCount === 0 && warningCount === 0 && (
                                <span className="text-xs font-mono text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(account.last_analyzed_at), { locale: tr, addSuffix: true })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
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
