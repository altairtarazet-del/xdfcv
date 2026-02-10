import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Package,
  Calendar,
  AlertTriangle,
  Clock,
  Mail,
  Shield,
  Lightbulb,
} from 'lucide-react';
import { format } from 'date-fns';

interface AccountEvent {
  id: string;
  event_type: string;
  event_date: string;
  metadata: any;
}

interface RiskScore {
  risk_score: number;
  risk_factors: string[];
  last_calculated_at: string;
}

interface AccountInsight {
  id: string;
  insight_type: string;
  priority: string;
  title: string;
  description: string;
  suggested_action: string | null;
  is_dismissed: boolean;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  bgc_complete: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400', label: 'BGC Complete' },
  deactivated: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400', label: 'Deaktive' },
  first_package: { icon: Package, color: 'text-orange-400', bg: 'bg-orange-400', label: 'Ilk Paket' },
  account_created: { icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-400', label: 'Hesap Olusturuldu' },
  bgc_submitted: { icon: Clock, color: 'text-cyan-400', bg: 'bg-cyan-400', label: 'BGC Gonderildi' },
  bgc_consider: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-400', label: 'BGC Consider' },
  bgc_info_needed: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400', label: 'Bilgi Bekliyor' },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/20' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/20' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/20' },
  info: { color: 'text-muted-foreground', bg: 'bg-muted/50' },
};

export default function AccountDetail() {
  const { email } = useParams<{ email: string }>();
  const decodedEmail = decodeURIComponent(email || '');
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();

  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [insights, setInsights] = useState<AccountInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const canViewBgcComplete = isAdmin || profile?.permissions?.can_view_bgc_complete;

  const fetchData = useCallback(async () => {
    if (!decodedEmail) return;
    setLoading(true);
    try {
      const [eventsRes, emailsRes, riskRes, insightsRes] = await Promise.all([
        supabase
          .from('account_events')
          .select('*')
          .eq('account_email', decodedEmail)
          .order('event_date', { ascending: true }),
        supabase
          .from('bgc_complete_emails')
          .select('*')
          .eq('account_email', decodedEmail)
          .order('email_date', { ascending: false }),
        supabase
          .from('bgc_risk_scores')
          .select('*')
          .eq('account_email', decodedEmail)
          .maybeSingle(),
        supabase
          .from('account_insights')
          .select('*')
          .eq('account_email', decodedEmail)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false }),
      ]);

      if (eventsRes.data) setEvents(eventsRes.data as AccountEvent[]);
      if (emailsRes.data) setEmails(emailsRes.data);
      if (riskRes.data) setRiskScore(riskRes.data as unknown as RiskScore);
      if (insightsRes.data) setInsights(insightsRes.data as AccountInsight[]);
    } catch (error) {
      console.error('Error fetching account data:', error);
    } finally {
      setLoading(false);
    }
  }, [decodedEmail]);

  useEffect(() => {
    if (canViewBgcComplete && decodedEmail) {
      fetchData();
    }
  }, [canViewBgcComplete, decodedEmail, fetchData]);

  const getDaysBetween = (dateA: string, dateB: string) => {
    const diff = Math.abs(new Date(dateB).getTime() - new Date(dateA).getTime());
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  const getRiskColor = () => {
    if (!riskScore) return '';
    if (riskScore.risk_score >= 70) return 'text-red-400';
    if (riskScore.risk_score >= 40) return 'text-yellow-400';
    return 'text-emerald-400';
  };

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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground font-mono flex items-center gap-3 flex-wrap">
              {decodedEmail.split('@')[0]}
              {riskScore && (
                <Badge className={`font-mono ${
                  riskScore.risk_score >= 70 ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                  riskScore.risk_score >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                  'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                }`}>
                  Risk: {riskScore.risk_score}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">{decodedEmail}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Timeline + Risk */}
          <div className="lg:col-span-2 space-y-6">
            {/* Timeline */}
            <Card className="cyber-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-mono flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Zaman Cizelgesi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">Henuz event kaydi yok.</p>
                ) : (
                  <div className="relative pl-6 space-y-6">
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
                    {events.map((event, idx) => {
                      const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.bgc_complete;
                      const Icon = config.icon;
                      return (
                        <div key={event.id} className="relative">
                          <div className={`absolute -left-6 top-1 w-[22px] h-[22px] rounded-full ${config.bg}/20 border-2 border-current ${config.color} flex items-center justify-center`}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="ml-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold font-mono ${config.color}`}>{config.label}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {format(new Date(event.event_date), 'dd/MM/yyyy HH:mm')}
                              </span>
                            </div>
                            {idx > 0 && (
                              <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                                +{getDaysBetween(events[idx - 1].event_date, event.event_date)} gun
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Email Records */}
            <Card className="cyber-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-mono flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Email Kayitlari ({emails.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">Email kaydi bulunamadi.</p>
                ) : (
                  emails.map(email => (
                    <div key={email.id} className="p-3 rounded-lg bg-muted/50 text-sm font-mono space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{email.email_type}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(email.email_date), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs truncate">{email.subject}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Risk + Insights + AI Data */}
          <div className="space-y-6">
            {/* Risk Score */}
            <Card className="cyber-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-mono flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Risk Analizi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {riskScore ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className={`text-4xl font-bold font-mono ${getRiskColor()}`}>
                        {riskScore.risk_score}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {riskScore.risk_score >= 70 ? 'Yuksek Risk' : riskScore.risk_score >= 40 ? 'Orta Risk' : 'Dusuk Risk'}
                      </p>
                    </div>
                    {riskScore.risk_factors && (riskScore.risk_factors as string[]).length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-muted-foreground">Risk Faktorleri</h4>
                        {(riskScore.risk_factors as string[]).map((factor, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs font-mono">
                            <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{factor}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 font-mono">
                      Son hesaplama: {format(new Date(riskScore.last_calculated_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground font-mono text-center py-4">
                    Risk skoru henuz hesaplanmamis.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className="cyber-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-mono flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-400" />
                  Oneriler ({insights.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">Oneri bulunamadi.</p>
                ) : (
                  insights.map(insight => {
                    const pCfg = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.info;
                    return (
                      <div key={insight.id} className={`p-2 rounded-lg ${pCfg.bg} text-xs font-mono space-y-1`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${pCfg.color}`}>{insight.priority}</Badge>
                          <span className="font-semibold">{insight.title}</span>
                        </div>
                        <p className="text-muted-foreground">{insight.description}</p>
                        {insight.suggested_action && (
                          <p className="text-primary/80 text-[10px]">Oneri: {insight.suggested_action}</p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
