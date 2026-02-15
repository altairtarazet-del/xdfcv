import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { AnalyticsData } from "@/types";
import {
  Users,
  ScanLine,
  CheckCircle,
  XCircle,
  Bell,
  UserCheck,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

// --- Chart configs ---

const stageChartConfig: ChartConfig = {
  count: { label: "Accounts", color: "var(--chart-1)" },
};

const categoryChartConfig: ChartConfig = {
  count: { label: "Analyses", color: "var(--chart-2)" },
};

const scanChartConfig: ChartConfig = {
  total_scanned: { label: "Scanned", color: "var(--chart-1)" },
  total_errors: { label: "Errors", color: "var(--chart-5)" },
};

const alertChartConfig: ChartConfig = {
  count: { label: "Alerts", color: "var(--chart-4)" },
};

const statusChartConfig: ChartConfig = {
  count: { label: "Accounts", color: "var(--chart-3)" },
};

// --- Stat cards config ---

const STAGE_COLORS: Record<string, string> = {
  REGISTERED: "hsl(var(--dd-400))",
  IDENTITY_VERIFIED: "hsl(210, 100%, 50%)",
  BGC_PENDING: "hsl(45, 100%, 50%)",
  BGC_CLEAR: "hsl(150, 100%, 35%)",
  BGC_CONSIDER: "hsl(30, 100%, 50%)",
  ACTIVE: "hsl(0, 80%, 55%)",
  DEACTIVATED: "hsl(0, 70%, 40%)",
};

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AnalyticsData>("/api/analytics/overview")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !data) {
    return (
      <div className="p-8 text-destructive text-sm font-semibold">
        Failed to load analytics
      </div>
    );
  }

  // Derive stats
  const totalAccounts = data?.accounts?.total ?? 0;

  const statCards = [
    {
      label: "Total Accounts",
      value: totalAccounts,
      icon: Users,
    },
    {
      label: "Total Scanned",
      value: data?.scans?.total_scanned ?? 0,
      icon: ScanLine,
    },
    {
      label: "Success Rate",
      value: `${data?.scans?.success_rate ?? 0}%`,
      icon: CheckCircle,
    },
    {
      label: "Scan Errors",
      value: data?.scans?.total_errors ?? 0,
      icon: XCircle,
    },
    {
      label: "Total Alerts",
      value: data?.alerts?.total ?? 0,
      icon: Bell,
    },
    {
      label: "Active Users (7d)",
      value: data?.portal_activity?.active_7d ?? 0,
      icon: UserCheck,
    },
  ];

  // Transform data for charts
  const stageData = data?.accounts?.by_stage
    ? Object.entries(data.accounts.by_stage).map(([stage, count]) => ({
        stage,
        count,
        fill: STAGE_COLORS[stage] || "var(--chart-1)",
      }))
    : [];

  const categoryData = data?.analysis?.by_category
    ? Object.entries(data.analysis.by_category).map(([category, count]) => ({
        category,
        count,
      }))
    : [];

  const scanData = data?.scans
    ? [
        {
          name: "Scans",
          total_scanned: data.scans.total_scanned,
          total_errors: data.scans.total_errors,
        },
      ]
    : [];

  const alertData = data?.alerts?.by_type
    ? Object.entries(data.alerts.by_type).map(([type, count]) => ({
        type,
        count,
      }))
    : [];

  const statusData = data?.accounts?.by_status
    ? Object.entries(data.accounts.by_status).map(([status, count]) => ({
        status,
        count,
      }))
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of platform activity and metrics
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Accounts by Stage — horizontal bar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Accounts by Stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={stageChartConfig} className="h-[300px]">
                <BarChart data={stageData} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Analysis by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Analysis by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={categoryChartConfig}
                className="h-[300px]"
              >
                <BarChart data={categoryData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="category"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Scan Statistics — grouped bar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Scan Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={scanChartConfig} className="h-[300px]">
                <BarChart data={scanData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="total_scanned"
                    fill="var(--color-total_scanned)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="total_errors"
                    fill="var(--color-total_errors)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Alerts by Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Alerts by Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={alertChartConfig} className="h-[300px]">
                <BarChart data={alertData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="type"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Accounts by Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Accounts by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={statusChartConfig} className="h-[300px]">
                <BarChart data={statusData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="status"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs"
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
