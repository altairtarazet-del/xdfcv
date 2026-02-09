import { useEffect, useState } from "react";
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
  CheckCircle
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

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

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) return;

      if (isAdmin) {
        setCanViewBgcComplete(true);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select(`
          custom_role_id,
          role_permissions!inner(can_view_bgc_complete)
        `)
        .eq("user_id", user.id)
        .single();

      if (data?.role_permissions) {
        const perms = data.role_permissions as any;
        setCanViewBgcComplete(perms.can_view_bgc_complete || false);
      }
    };

    checkPermissions();
  }, [user, isAdmin]);

  // Fetch email accounts stats
  const { data: accountStats, isLoading: accountsLoading } = useQuery({
    queryKey: ["account-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("status");
      
      if (error) throw error;

      const statusCounts: Record<string, number> = {};
      data.forEach((acc) => {
        statusCounts[acc.status] = (statusCounts[acc.status] || 0) + 1;
      });

      return {
        total: data.length,
        byStatus: statusCounts,
        aktif: statusCounts["aktif"] || 0
      };
    },
    refetchInterval: 30000
  });

  // Fetch user count
  const { data: userCount, isLoading: usersLoading } = useQuery({
    queryKey: ["user-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin
  });

  // Fetch role count
  const { data: roleCount, isLoading: rolesLoading } = useQuery({
    queryKey: ["role-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("custom_roles")
        .select("*", { count: "exact", head: true });
      
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin
  });

  // Fetch BGC stats
  const { data: bgcStats, isLoading: bgcLoading } = useQuery({
    queryKey: ["bgc-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bgc_complete_emails")
        .select("account_email, email_type, email_date");

      if (error) throw error;

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Unique accounts per type
      const bgcAccounts = new Set<string>();
      const deactAccounts = new Set<string>();
      const fpAccounts = new Set<string>();
      const bgcSubmittedAccounts = new Set<string>();
      const weekDeact = new Set<string>();
      const weekFp = new Set<string>();

      data.forEach((row: any) => {
        const emailDate = new Date(row.email_date);
        if (row.email_type === 'bgc_complete') bgcAccounts.add(row.account_email);
        if (row.email_type === 'bgc_submitted') bgcSubmittedAccounts.add(row.account_email);
        if (row.email_type === 'deactivated') {
          deactAccounts.add(row.account_email);
          if (emailDate >= weekAgo) weekDeact.add(row.account_email);
        }
        if (row.email_type === 'first_package') {
          fpAccounts.add(row.account_email);
          if (emailDate >= weekAgo) weekFp.add(row.account_email);
        }
      });

      const clearCount = [...bgcAccounts].filter(e => !deactAccounts.has(e)).length;

      return {
        totalClear: clearCount,
        totalDeactivated: deactAccounts.size,
        totalFirstPackage: fpAccounts.size,
        totalBgcSubmitted: bgcSubmittedAccounts.size,
        weekDeactivated: weekDeact.size,
        weekFirstPackage: weekFp.size,
      };
    },
    enabled: canViewBgcComplete,
    refetchInterval: 30000
  });

  // BGC pie chart data
  const bgcPieData = bgcStats ? [
    { name: 'Clear', value: bgcStats.totalClear, color: '#10b981' },
    { name: 'BGC Surecte', value: bgcStats.totalBgcSubmitted, color: '#06b6d4' },
    { name: 'Deaktive', value: bgcStats.totalDeactivated, color: '#ef4444' },
    { name: 'Ilk Paket', value: bgcStats.totalFirstPackage, color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  // Prepare pie chart data
  const pieChartData = accountStats?.byStatus 
    ? Object.entries(accountStats.byStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || "#6b7280"
      }))
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Genel Bakış</h1>
          <p className="text-muted-foreground text-sm">Sistem durumu ve istatistikler</p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Accounts */}
          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Toplam Hesap
              </CardTitle>
              <Mail className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  {accountStats?.total || 0}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Accounts */}
          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Aktif Hesap
              </CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-500">
                  {accountStats?.aktif || 0}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account Status Pie Chart */}
          <Card className="bg-card/50 border-border/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Hesap Durumları
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accountsLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Skeleton className="h-48 w-48 rounded-full" />
                </div>
              ) : pieChartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Veri bulunamadı
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* BGC Stats Section */}
        {canViewBgcComplete && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BGC Mini Stats */}
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  BGC İstatistikleri
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : bgcStats ? (
                  <div className="grid grid-cols-4 gap-4">
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
                  BGC Dağılımı
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bgcLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Skeleton className="h-32 w-32 rounded-full" />
                  </div>
                ) : bgcPieData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={bgcPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {bgcPieData.map((entry, index) => (
                            <Cell key={`bgc-cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    BGC verisi bulunamadı
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Users - Admin only */}
          {isAdmin && (
            <Card 
              className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/users")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Users className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      {usersLoading ? (
                        <Skeleton className="h-6 w-8" />
                      ) : (
                        <div className="text-xl font-bold">{userCount}</div>
                      )}
                      <div className="text-xs text-muted-foreground">Kullanıcı</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Roles - Admin only */}
          {isAdmin && (
            <Card 
              className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/roles")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      <Shield className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      {rolesLoading ? (
                        <Skeleton className="h-6 w-8" />
                      ) : (
                        <div className="text-xl font-bold">{roleCount}</div>
                      )}
                      <div className="text-xs text-muted-foreground">Rol</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Email Accounts */}
          <Card 
            className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
            onClick={() => navigate("/dashboard")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/20">
                    <Mail className="h-5 w-5 text-cyan-500" />
                  </div>
                  <div>
                    {accountsLoading ? (
                      <Skeleton className="h-6 w-8" />
                    ) : (
                      <div className="text-xl font-bold">{accountStats?.total || 0}</div>
                    )}
                    <div className="text-xs text-muted-foreground">E-posta Hesabı</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default Overview;
