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
  Banknote, 
  TrendingUp, 
  TrendingDown,
  Activity,
  DollarSign,
  ArrowRight
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

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
  const [canViewCash, setCanViewCash] = useState(false);

  // Check cash permission
  useEffect(() => {
    const checkCashPermission = async () => {
      if (!user) return;
      
      if (isAdmin) {
        setCanViewCash(true);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select(`
          custom_role_id,
          role_permissions!inner(can_view_cash, can_manage_cash)
        `)
        .eq("user_id", user.id)
        .single();

      if (data?.role_permissions) {
        const perms = data.role_permissions as any;
        setCanViewCash(perms.can_view_cash || perms.can_manage_cash || false);
      }
    };

    checkCashPermission();
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

  // Fetch cash stats
  const { data: cashStats, isLoading: cashLoading } = useQuery({
    queryKey: ["cash-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("amount, transaction_type, payment_stage");
      
      if (error) throw error;

      let totalPayments = 0;
      let totalRefunds = 0;
      const paymentsByStage: Record<string, { count: number; total: number }> = {};

      data.forEach((tx) => {
        if (tx.transaction_type === "payment") {
          totalPayments += Number(tx.amount);
          const stage = tx.payment_stage || "1";
          if (!paymentsByStage[stage]) {
            paymentsByStage[stage] = { count: 0, total: 0 };
          }
          paymentsByStage[stage].count++;
          paymentsByStage[stage].total += Number(tx.amount);
        } else if (tx.transaction_type === "refund") {
          totalRefunds += Number(tx.amount);
        }
      });

      return {
        gross: totalPayments,
        refunds: totalRefunds,
        net: totalPayments - totalRefunds,
        transactionCount: data.length,
        byStage: paymentsByStage
      };
    },
    enabled: canViewCash,
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

  // Prepare pie chart data
  const pieChartData = accountStats?.byStatus 
    ? Object.entries(accountStats.byStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || "#6b7280"
      }))
    : [];

  // Prepare bar chart data
  const barChartData = cashStats?.byStage
    ? Object.entries(cashStats.byStage).map(([stage, data]) => ({
        name: `${stage}. Ödeme`,
        adet: data.count,
        tutar: data.total
      }))
    : [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Genel Bakış</h1>
          <p className="text-muted-foreground text-sm">Sistem durumu ve istatistikler</p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Gross Cash - Only if permitted */}
          {canViewCash && (
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Brüt Kasa
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {cashLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-blue-500">
                    {formatCurrency(cashStats?.gross || 0)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Net Cash - Only if permitted */}
          {canViewCash && (
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Kasa
                </CardTitle>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                {cashLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-emerald-500">
                      {formatCurrency(cashStats?.net || 0)}
                    </span>
                    {cashStats && cashStats.refunds > 0 && (
                      <span className="text-xs text-red-400 flex items-center">
                        <TrendingDown className="h-3 w-3 mr-0.5" />
                        {formatCurrency(cashStats.refunds)} iade
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
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

          {/* Cash Bar Chart - Only if permitted */}
          {canViewCash && (
            <Card className="bg-card/50 border-border/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-primary" />
                  Kasa Özeti
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cashLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : barChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData}>
                        <XAxis 
                          dataKey="name" 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value: number, name: string) => [
                            name === "tutar" ? formatCurrency(value) : value,
                            name === "tutar" ? "Tutar" : "Adet"
                          ]}
                        />
                        <Legend />
                        <Bar dataKey="adet" fill="#3b82f6" name="Adet" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="tutar" fill="#10b981" name="Tutar (₺)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    Veri bulunamadı
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

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

          {/* Transactions - Only if permitted */}
          {canViewCash && (
            <Card 
              className="bg-card/50 border-border/50 backdrop-blur cursor-pointer hover:bg-card/70 transition-colors group"
              onClick={() => navigate("/dashboard/cash")}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <Banknote className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      {cashLoading ? (
                        <Skeleton className="h-6 w-8" />
                      ) : (
                        <div className="text-xl font-bold">{cashStats?.transactionCount || 0}</div>
                      )}
                      <div className="text-xs text-muted-foreground">İşlem</div>
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
