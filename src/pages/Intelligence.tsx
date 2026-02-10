import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Shield,
  Lightbulb,
  Activity,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Package,
  Calendar,
  Clock,
  Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface RiskEntry {
  account_email: string;
  risk_score: number;
  risk_factors: string[];
  last_calculated_at: string;
}

interface Classification {
  id: string;
  account_email: string;
  email_type: string;
  ai_classified: boolean;
  ai_confidence: number | null;
  subject: string;
  email_date: string;
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

interface AccountEvent {
  id: string;
  account_email: string;
  event_type: string;
  event_date: string;
  metadata: any;
}

const EVENT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  bgc_complete: { icon: CheckCircle, color: 'text-emerald-400', label: 'BGC Complete' },
  deactivated: { icon: XCircle, color: 'text-red-400', label: 'Deaktive' },
  first_package: { icon: Package, color: 'text-orange-400', label: 'Ilk Paket' },
  account_created: { icon: Calendar, color: 'text-blue-400', label: 'Hesap Olusturuldu' },
  bgc_submitted: { icon: Clock, color: 'text-cyan-400', label: 'BGC Gonderildi' },
  bgc_consider: { icon: AlertTriangle, color: 'text-orange-400', label: 'BGC Consider' },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  info: 'bg-muted text-muted-foreground',
};

export default function Intelligence() {
  const { isAdmin, profile } = useAuth();
  const navigate = useNavigate();
  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const [loading, setLoading] = useState(true);
  const [riskEntries, setRiskEntries] = useState<RiskEntry[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [events, setEvents] = useState<AccountEvent[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [riskRes, classRes, insightRes, eventRes] = await Promise.all([
        supabase.from('bgc_risk_scores').select('*').order('risk_score', { ascending: false }),
        supabase.from('bgc_complete_emails').select('id, account_email, email_type, ai_classified, ai_confidence, subject, email_date')
          .order('email_date', { ascending: false }).limit(200),
        supabase.from('account_insights').select('*').eq('is_dismissed', false).order('created_at', { ascending: false }).limit(100),
        supabase.from('account_events').select('*').order('event_date', { ascending: false }).limit(100),
      ]);

      if (riskRes.data) setRiskEntries(riskRes.data as RiskEntry[]);
      if (classRes.data) setClassifications(classRes.data as Classification[]);
      if (insightRes.data) setInsights(insightRes.data as Insight[]);
      if (eventRes.data) setEvents(eventRes.data as AccountEvent[]);
    } catch (error) {
      console.error('Error fetching intelligence data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canViewBgcComplete) fetchData();
    else setLoading(false);
  }, [canViewBgcComplete, fetchData]);

  // Risk stats
  const riskStats = useMemo(() => {
    const high = riskEntries.filter(r => r.risk_score >= 70).length;
    const medium = riskEntries.filter(r => r.risk_score >= 40 && r.risk_score < 70).length;
    const low = riskEntries.filter(r => r.risk_score < 40).length;
    const avg = riskEntries.length > 0 ? Math.round(riskEntries.reduce((s, r) => s + r.risk_score, 0) / riskEntries.length) : 0;
    return { high, medium, low, avg, total: riskEntries.length };
  }, [riskEntries]);

  // Filtered risk entries
  const filteredRisk = useMemo(() => {
    let result = riskEntries;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.account_email.toLowerCase().includes(q));
    }
    if (riskFilter === 'high') result = result.filter(r => r.risk_score >= 70);
    else if (riskFilter === 'medium') result = result.filter(r => r.risk_score >= 40 && r.risk_score < 70);
    else if (riskFilter === 'low') result = result.filter(r => r.risk_score < 40);
    return result;
  }, [riskEntries, searchQuery, riskFilter]);

  // Filtered insights
  const filteredInsights = useMemo(() => {
    let result = insights;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.account_email.toLowerCase().includes(q) || i.title.toLowerCase().includes(q));
    }
    if (priorityFilter !== 'all') result = result.filter(i => i.priority === priorityFilter);
    return result;
  }, [insights, searchQuery, priorityFilter]);

  // Filtered classifications
  const filteredClassifications = useMemo(() => {
    if (!searchQuery) return classifications;
    const q = searchQuery.toLowerCase();
    return classifications.filter(c => c.account_email.toLowerCase().includes(q) || c.subject?.toLowerCase().includes(q));
  }, [classifications, searchQuery]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e => e.account_email.toLowerCase().includes(q));
  }, [events, searchQuery]);

  if (!canViewBgcComplete) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="cyber-card border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Bu sayfaya erisim yetkiniz bulunmuyor.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
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
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="text-purple-400" />
            Istihbarat Merkezi
          </h1>
          <p className="text-sm text-muted-foreground">Risk analizi, email kayitlari, hesap onerileri ve olay akisi</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs text-muted-foreground">Toplam Skor</span>
              <div className="text-2xl font-bold text-foreground mt-1">{riskStats.total}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs text-red-400">Yuksek Risk</span>
              <div className="text-2xl font-bold text-red-400 mt-1">{riskStats.high}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs text-yellow-400">Orta Risk</span>
              <div className="text-2xl font-bold text-yellow-400 mt-1">{riskStats.medium}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs text-emerald-400">Dusuk Risk</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{riskStats.low}</div>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="pt-3 pb-3">
              <span className="text-xs text-muted-foreground">Ortalama</span>
              <div className={`text-2xl font-bold mt-1 ${
                riskStats.avg >= 70 ? 'text-red-400' : riskStats.avg >= 40 ? 'text-yellow-400' : 'text-emerald-400'
              }`}>{riskStats.avg}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hesap veya konu ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono bg-background/50 border-border/50"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="risk">
          <TabsList className="w-full grid grid-cols-4 h-auto">
            <TabsTrigger value="risk" className="text-xs gap-1.5 py-2">
              <Shield size={14} />Risk Haritasi
              <Badge variant="outline" className="ml-1 text-[10px]">{riskStats.total}</Badge>
            </TabsTrigger>
            <TabsTrigger value="classification" className="text-xs gap-1.5 py-2">
              <Mail size={14} />Email Kayitlari
              <Badge variant="outline" className="ml-1 text-[10px]">{classifications.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="insights" className="text-xs gap-1.5 py-2">
              <Lightbulb size={14} />Oneriler
              <Badge variant="outline" className="ml-1 text-[10px]">{insights.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs gap-1.5 py-2">
              <Activity size={14} />Olay Akisi
              <Badge variant="outline" className="ml-1 text-[10px]">{events.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Risk Map Tab */}
          <TabsContent value="risk" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Risk Filtre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tumu</SelectItem>
                  <SelectItem value="high">Yuksek (70+)</SelectItem>
                  <SelectItem value="medium">Orta (40-69)</SelectItem>
                  <SelectItem value="low">Dusuk (&lt;40)</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filteredRisk.length} hesap</span>
            </div>
            <Card className="cyber-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hesap</TableHead>
                        <TableHead>Risk Skoru</TableHead>
                        <TableHead>Faktorler</TableHead>
                        <TableHead>Hesaplama</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRisk.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Risk skoru bulunamadi.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRisk.map(entry => (
                          <TableRow key={entry.account_email}>
                            <TableCell>
                              <button
                                onClick={() => navigate(`/dashboard/account/${encodeURIComponent(entry.account_email)}`)}
                                className="font-mono text-sm hover:text-primary transition-colors"
                              >
                                {entry.account_email}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge className={`font-mono ${
                                entry.risk_score >= 70 ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                entry.risk_score >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                                'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                              }`}>{entry.risk_score}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap max-w-xs">
                                {(entry.risk_factors as string[] || []).slice(0, 3).map((f, i) => (
                                  <span key={i} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{f}</span>
                                ))}
                                {(entry.risk_factors as string[] || []).length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{(entry.risk_factors as string[]).length - 3}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {format(new Date(entry.last_calculated_at), 'dd/MM HH:mm')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Classification Tab */}
          <TabsContent value="classification" className="mt-4">
            <Card className="cyber-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hesap</TableHead>
                        <TableHead>Tip</TableHead>
                        <TableHead>Konu</TableHead>
                        <TableHead>Tarih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClassifications.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Siniflandirma bulunamadi.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredClassifications.map(cls => (
                          <TableRow key={cls.id}>
                            <TableCell>
                              <button
                                onClick={() => navigate(`/dashboard/account/${encodeURIComponent(cls.account_email)}`)}
                                className="font-mono text-sm hover:text-primary transition-colors"
                              >
                                {cls.account_email.split('@')[0]}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{cls.email_type}</Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{cls.subject}</TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {format(new Date(cls.email_date), 'dd/MM/yyyy')}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Oncelik Filtre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tumu</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                  <SelectItem value="high">Yuksek</SelectItem>
                  <SelectItem value="medium">Orta</SelectItem>
                  <SelectItem value="low">Dusuk</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filteredInsights.length} oneri</span>
            </div>
            <div className="space-y-2">
              {filteredInsights.length === 0 ? (
                <Card className="cyber-card">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Oneri bulunamadi.
                  </CardContent>
                </Card>
              ) : (
                filteredInsights.map(insight => (
                  <Card key={insight.id} className="cyber-card">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] ${PRIORITY_COLORS[insight.priority] || ''}`}>
                              {insight.priority}
                            </Badge>
                            <span className="text-sm font-semibold">{insight.title}</span>
                            <button
                              onClick={() => navigate(`/dashboard/account/${encodeURIComponent(insight.account_email)}`)}
                              className="text-xs font-mono text-primary hover:underline ml-auto"
                            >
                              {insight.account_email.split('@')[0]}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">{insight.description}</p>
                          {insight.suggested_action && (
                            <p className="text-xs text-primary/80">Oneri: {insight.suggested_action}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 font-mono">
                            {format(new Date(insight.created_at), 'dd/MM/yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="mt-4">
            <Card className="cyber-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Olay</TableHead>
                        <TableHead>Hesap</TableHead>
                        <TableHead>Tarih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            Olay bulunamadi.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEvents.map(event => {
                          const cfg = EVENT_CONFIG[event.event_type] || { icon: Activity, color: 'text-muted-foreground', label: event.event_type };
                          const Icon = cfg.icon;
                          return (
                            <TableRow key={event.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                                  <span className={`text-sm font-mono ${cfg.color}`}>{cfg.label}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() => navigate(`/dashboard/account/${encodeURIComponent(event.account_email)}`)}
                                  className="font-mono text-sm hover:text-primary transition-colors"
                                >
                                  {event.account_email.split('@')[0]}
                                </button>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {format(new Date(event.event_date), 'dd/MM/yyyy HH:mm')}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
