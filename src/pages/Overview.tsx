import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Shield,
  Mail,
  TrendingUp,
  Activity,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Clock,
  Info,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  acildi: "#22c55e",
  background: "#3b82f6",
  aktif: "#10b981",
  kapandi: "#ef4444",
  suspend: "#f59e0b"
};

const STATUS_LABELS: Record<string, string> = {
  acildi: "Açıldı",
  background: "Background",
  aktif: "Aktif",
  kapandi: "Kapandı",
  suspend: "Suspend"
};

const Overview = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [canViewBgcComplete, setCanViewBgcComplete] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) return;
      if (isAdmin) { setCanViewBgcComplete(true); return; }
      const { data } = await supabase
        .from("user_roles")
        .select(`custom_role_id, role_permissions!inner(can_view_bgc_complete)`)
        .eq("user_id", user.id)
        .single();
      if (data?.role_permissions) {
        setCanViewBgcComplete((data.role_permissions as any).can_view_bgc_complete || false);
      }
    };
    checkPermissions();
  }, [user, isAdmin]);

  // Fetch email accounts stats
  const { data: accountStats, isLoading: accountsLoading } = useQuery({
    queryKey: ["account-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_accounts").select("status");
      if (error) throw error;
      const statusCounts: Record<string, number> = {};
      data.forEach((acc) => { statusCounts[acc.status] = (statusCounts[acc.status] || 0) + 1; });
      return { total: data.length, byStatus: statusCounts, aktif: statusCounts["aktif"] || 0 };
    },
    refetchInterval: 30000
  });

  const { data: userCount, isLoading: usersLoading } = useQuery({
    queryKey: ["user-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin
  });

  const { data: roleCount, isLoading: rolesLoading } = useQuery({
    queryKey: ["role-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("custom_roles").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin
  });

  // Enhanced BGC stats with weekly trends, avg duration, risk distribution
  const { data: bgcStats, isLoading: bgcLoading } = useQuery({
    queryKey: ["bgc-stats-enhanced"],
    queryFn: async () => {
      const [emailsRes, riskRes] = await Promise.all([
        supabase.from("bgc_complete_emails").select("account_email, email_type, email_date"),
        supabase.from("bgc_risk_scores").select("account_email, risk_score"),
      ]);

      if (emailsRes.error) throw emailsRes.error;
      const data = emailsRes.data || [];
      const riskData = riskRes.data || [];

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const bgcAccounts = new Set<string>();
      const deactAccounts = new Set<string>();
      const fpAccounts = new Set<string>();
      const bgcSubmittedAccounts = new Set<string>();
      const infoNeededAccounts = new Set<string>();
      const weekDeact = new Set<string>();
      const weekFp = new Set<string>();

      // Weekly trend: last 4 weeks
      const weeklyData: Record<string, { clear: number; consider: number; deactivated: number }> = {};
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
        weeklyData[label] = { clear: 0, consider: 0, deactivated: 0 };
      }

      // For avg BGC duration calculation
      const submittedDates = new Map<string, Date>();
      const clearDates = new Map<string, Date>();

      data.forEach((row: any) => {
        const emailDate = new Date(row.email_date);
        if (row.email_type === 'bgc_complete') {
          bgcAccounts.add(row.account_email);
          if (!clearDates.has(row.account_email)) clearDates.set(row.account_email, emailDate);
        }
        if (row.email_type === 'bgc_submitted') {
          bgcSubmittedAccounts.add(row.account_email);
          if (!submittedDates.has(row.account_email)) submittedDates.set(row.account_email, emailDate);
        }
        if (row.email_type === 'bgc_info_needed') infoNeededAccounts.add(row.account_email);
        if (row.email_type === 'deactivated') {
          deactAccounts.add(row.account_email);
          if (emailDate >= weekAgo) weekDeact.add(row.account_email);
        }
        if (row.email_type === 'first_package') {
          fpAccounts.add(row.account_email);
          if (emailDate >= weekAgo) weekFp.add(row.account_email);
        }

        // Weekly trend buckets
        for (let i = 0; i < 4; i++) {
          const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
          if (emailDate >= weekStart && emailDate < weekEnd) {
            if (row.email_type === 'bgc_complete') weeklyData[label].clear++;
            if (row.email_type === 'bgc_consider') weeklyData[label].consider++;
            if (row.email_type === 'deactivated') weeklyData[label].deactivated++;
          }
        }
      });

      // Average BGC duration (submitted → clear)
      let totalDays = 0;
      let durationCount = 0;
      submittedDates.forEach((submitDate, email) => {
        const clearDate = clearDates.get(email);
        if (clearDate && clearDate > submitDate) {
          const days = Math.round((clearDate.getTime() - submitDate.getTime()) / (1000 * 60 * 60 * 24));
          if (days > 0 && days < 90) { totalDays += days; durationCount++; }
        }
      });
      const avgBgcDuration = durationCount > 0 ? Math.round(totalDays / durationCount) : 0;

      // Risk distribution
      let riskHigh = 0, riskMedium = 0, riskLow = 0;
      riskData.forEach((r: any) => {
        if (r.risk_score >= 70) riskHigh++;
        else if (r.risk_score >= 40) riskMedium++;
        else riskLow++;
      });

      const clearCount = [...bgcAccounts].filter(e => !deactAccounts.has(e)).length;

      // Remove info_needed for accounts that have progressed
      const actualInfoNeeded = [...infoNeededAccounts].filter(e =>
        !bgcAccounts.has(e) && !deactAccounts.has(e) && !fpAccounts.has(e)
      ).length;

      return {
        totalClear: clearCount,
        totalDeactivated: deactAccounts.size,
        totalFirstPackage: fpAccounts.size,
        totalBgcSubmitted: bgcSubmittedAccounts.size,
        weekDeactivated: weekDeact.size,
        weekFirstPackage: weekFp.size,
        avgBgcDuration,
        bilgiBekliyor: actualInfoNeeded,
        riskHigh, riskMedium, riskLow,
        weeklyTrend: Object.entries(weeklyData).reverse().map(([week, counts]) => ({
          week, ...counts,
        })),
      };
    },
    enabled: canViewBgcComplete,
    refetchInterval: 30000
  });

  const bgcPieData = bgcStats ? [
    { name: 'Clear', value: bgcStats.totalClear, color: '#10b981' },
    { name: 'BGC Surecte', value: bgcStats.totalBgcSubmitted, color: '#06b6d4' },
    { name: 'Deaktive', value: bgcStats.totalDeactivated, color: '#ef4444' },
    { name: 'Ilk Paket', value: bgcStats.totalFirstPackage, color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  const riskPieData = bgcStats ? [
    { name: 'Yuksek', value: bgcStats.riskHigh, color: '#ef4444' },
    { name: 'Orta', value: bgcStats.riskMedium, color: '#f59e0b' },
    { name: 'Dusuk', value: bgcStats.riskLow, color: '#10b981' },
  ].filter(d => d.value > 0) : [];

  const pieChartData = accountStats?.byStatus
    ? Object.entries(accountStats.byStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || "#6b7280"
      }))
    : [];

  const chartTooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Genel Bakis</h1>
          <p className="text-muted-foreground text-sm">Sistem durumu ve istatistikler</p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Hesap</CardTitle>
              <Mail className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {accountsLoading ? <Skeleton className="h-8 w-20" /> : (
                <div className="text-2xl font-bold text-foreground">{accountStats?.total || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aktif Hesap</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {accountsLoading ? <Skeleton className="h-8 w-20" /> : (
                <div className="text-2xl font-bold text-green-500">{accountStats?.aktif || 0}</div>
              )}
            </CardContent>
          </Card>

          {canViewBgcComplete && (
            <>
              <Card className="bg-card/50 border-border/50 backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ort. BGC Suresi</CardTitle>
                  <Clock className="h-4 w-4 text-cyan-500" />
                </CardHeader>
                <CardContent>
                  {bgcLoading ? <Skeleton className="h-8 w-20" /> : (
                    <div className="text-2xl font-bold text-cyan-500">
                      {bgcStats?.avgBgcDuration || 0} <span className="text-sm font-normal text-muted-foreground">gun</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50 backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Bilgi Bekliyor</CardTitle>
                  <Info className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  {bgcLoading ? <Skeleton className="h-8 w-20" /> : (
                    <div className="text-2xl font-bold text-yellow-500">{bgcStats?.bilgiBekliyor || 0}</div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account Status Pie Chart */}
          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Hesap Durumlari
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div className="h-64 flex items-center justify-center"><Skeleton className="h-48 w-48 rounded-full" /></div>
              ) : pieChartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}>
                        {pieChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">Veri bulunamadi</div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Trend Bar Chart */}
          {canViewBgcComplete && (
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Haftalik Trend (Son 4 Hafta)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="h-64 flex items-center justify-center"><Skeleton className="h-48 w-full" /></div>
                ) : bgcStats?.weeklyTrend && bgcStats.weeklyTrend.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bgcStats.weeklyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="week" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                        <Bar dataKey="clear" name="Clear" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="consider" name="Consider" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="deactivated" name="Deaktive" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Trend verisi bulunamadi</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* BGC Stats Section */}
        {canViewBgcComplete && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* BGC Mini Stats */}
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  BGC Istatistikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
                ) : bgcStats ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-500">{bgcStats.totalClear}</div>
                      <div className="text-xs text-muted-foreground">Clear</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-500">{bgcStats.totalBgcSubmitted}</div>
                      <div className="text-xs text-muted-foreground">BGC Surecte</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-500">{bgcStats.weekDeactivated}</div>
                      <div className="text-xs text-muted-foreground">Deaktive (hafta)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-500">{bgcStats.weekFirstPackage}</div>
                      <div className="text-xs text-muted-foreground">Ilk Paket (hafta)</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground text-sm">Veri yok</div>
                )}
              </CardContent>
            </Card>

            {/* BGC Pie Chart */}
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  BGC Dagilimi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="h-48 flex items-center justify-center"><Skeleton className="h-32 w-32 rounded-full" /></div>
                ) : bgcPieData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={bgcPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}>
                          {bgcPieData.map((entry, index) => <Cell key={`bgc-cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">BGC verisi bulunamadi</div>
                )}
              </CardContent>
            </Card>

            {/* Risk Distribution Pie Chart */}
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Risk Dagilimi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="h-48 flex items-center justify-center"><Skeleton className="h-32 w-32 rounded-full" /></div>
                ) : riskPieData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}>
                          {riskPieData.map((entry, index) => <Cell key={`risk-cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Risk verisi bulunamadi</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isAdmin && (
            <Card className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/users")}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20"><Users className="h-5 w-5 text-blue-500" /></div>
                    <div>
                      {usersLoading ? <Skeleton className="h-6 w-8" /> : <div className="text-xl font-bold">{userCount}</div>}
                      <div className="text-xs text-muted-foreground">Kullanici</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <Card className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/roles")}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20"><Shield className="h-5 w-5 text-purple-500" /></div>
                    <div>
                      {rolesLoading ? <Skeleton className="h-6 w-8" /> : <div className="text-xl font-bold">{roleCount}</div>}
                      <div className="text-xs text-muted-foreground">Rol</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
            onClick={() => navigate("/dashboard")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20"><Mail className="h-5 w-5 text-cyan-500" /></div>
                  <div>
                    {accountsLoading ? <Skeleton className="h-6 w-8" /> : <div className="text-xl font-bold">{accountStats?.total || 0}</div>}
                    <div className="text-xs text-muted-foreground">E-posta Hesabi</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>

          {canViewBgcComplete && (
            <Card className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/intelligence")}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20"><Shield className="h-5 w-5 text-purple-400" /></div>
                    <div>
                      <div className="text-xl font-bold">{(bgcStats?.riskHigh || 0) + (bgcStats?.riskMedium || 0) + (bgcStats?.riskLow || 0)}</div>
                      <div className="text-xs text-muted-foreground">Istihbarat</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
