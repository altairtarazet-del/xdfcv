import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Package, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AccountTimelineProps {
  accountEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

const EVENT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  bgc_complete: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400', label: 'BGC Complete' },
  deactivated: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400', label: 'Deaktive' },
  first_package: { icon: Package, color: 'text-orange-400', bg: 'bg-orange-400', label: 'İlk Paket' },
  account_created: { icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-400', label: 'Hesap Oluşturuldu' },
};

export function AccountTimeline({ accountEmail, open, onOpenChange }: AccountTimelineProps) {
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open && accountEmail) {
      fetchData();
    }
  }, [open, accountEmail]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, emailsRes, riskRes] = await Promise.all([
        supabase
          .from('account_events')
          .select('*')
          .eq('account_email', accountEmail)
          .order('event_date', { ascending: true }),
        supabase
          .from('bgc_complete_emails')
          .select('*')
          .eq('account_email', accountEmail)
          .order('email_date', { ascending: false }),
        supabase
          .from('bgc_risk_scores')
          .select('*')
          .eq('account_email', accountEmail)
          .maybeSingle(),
      ]);

      if (eventsRes.data) setEvents(eventsRes.data as AccountEvent[]);
      if (emailsRes.data) setEmails(emailsRes.data);
      if (riskRes.data) setRiskScore(riskRes.data as unknown as RiskScore);
    } catch (error) {
      console.error('Error fetching timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = () => {
    if (!riskScore) return null;
    const score = riskScore.risk_score;
    if (score >= 50) return <Badge variant="destructive" className="font-mono">Yüksek Risk: {score}</Badge>;
    if (score >= 25) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50 font-mono">Orta Risk: {score}</Badge>;
    return <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-mono">Düşük Risk: {score}</Badge>;
  };

  // Calculate days between events
  const getDaysBetween = (dateA: string, dateB: string) => {
    const diff = Math.abs(new Date(dateB).getTime() - new Date(dateA).getTime());
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-lg flex items-center gap-2 flex-wrap">
            {accountEmail.split('@')[0]}
            {getRiskBadge()}
          </SheetTitle>
          <p className="text-xs text-muted-foreground font-mono">{accountEmail}</p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Timeline */}
            <div>
              <h3 className="text-sm font-semibold font-mono mb-4">Zaman Çizelgesi</h3>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono">Henüz event kaydı yok.</p>
              ) : (
                <div className="relative pl-6 space-y-6">
                  {/* Vertical line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

                  {events.map((event, idx) => {
                    const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.bgc_complete;
                    const Icon = config.icon;

                    return (
                      <div key={event.id} className="relative">
                        {/* Dot */}
                        <div className={`absolute -left-6 top-1 w-[22px] h-[22px] rounded-full ${config.bg}/20 border-2 border-current ${config.color} flex items-center justify-center`}>
                          <Icon className="h-3 w-3" />
                        </div>

                        <div className="ml-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold font-mono ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {format(new Date(event.event_date), 'dd/MM/yyyy HH:mm')}
                            </span>
                          </div>

                          {/* Days between this and previous event */}
                          {idx > 0 && (
                            <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                              +{getDaysBetween(events[idx - 1].event_date, event.event_date)} gün
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Risk Factors */}
            {riskScore && riskScore.risk_factors && (riskScore.risk_factors as string[]).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold font-mono mb-2">Risk Faktörleri</h3>
                <ul className="space-y-1">
                  {(riskScore.risk_factors as string[]).map((factor, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground font-mono flex items-start gap-2">
                      <span className="text-yellow-400 mt-0.5">!</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Email List */}
            <div>
              <h3 className="text-sm font-semibold font-mono mb-2">Email Kayıtları ({emails.length})</h3>
              <div className="space-y-2">
                {emails.map(email => (
                  <div key={email.id} className="p-2 rounded-lg bg-muted/50 text-xs font-mono">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {email.email_type}
                      </Badge>
                    </div>
                    <p className="truncate text-muted-foreground">{email.subject}</p>
                    <p className="text-muted-foreground/60 mt-0.5">
                      {format(new Date(email.email_date), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
