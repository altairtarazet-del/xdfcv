import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface AnalyticsData {
  accounts: {
    total: number;
    by_stage: Record<string, number>;
    by_status: Record<string, number>;
  };
  analysis: {
    total: number;
    by_category: Record<string, number>;
    by_source: Record<string, number>;
  };
  scans: {
    recent_count: number;
    success_rate: number;
    total_scanned: number;
    total_errors: number;
  };
  alerts: {
    total: number;
    unread: number;
    by_type: Record<string, number>;
  };
  portal_activity: {
    active_24h: number;
    active_7d: number;
  };
}

function BarChart({ data, total }: { data: Record<string, number>; total: number }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      {sorted.map(([key, count]) => (
        <div key={key} className="flex items-center gap-3">
          <div className="w-32 text-xs text-dd-600 truncate text-right font-medium">{key}</div>
          <div className="flex-1 bg-dd-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full rounded-full bg-dd-red transition-all duration-300"
              style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
            />
          </div>
          <div className="w-12 text-xs text-dd-600 text-right font-semibold">{count}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-5">
      <div className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-dd-950 mt-1">{value}</div>
      {sub && <div className="text-xs text-dd-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const result = await api.get<AnalyticsData>("/api/analytics/overview");
      setData(result);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-8 text-dd-600 text-sm">Loading analytics...</div>;
  if (!data) return <div className="p-8 text-dd-red text-sm font-semibold">Failed to load analytics</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-dd-950">Analytics</h1>
        <p className="text-sm text-dd-600 mt-1">Overview of platform activity and metrics</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Accounts" value={data.accounts.total} />
        <StatCard label="Emails Analyzed" value={data.analysis.total} />
        <StatCard label="Scan Success Rate" value={`${data.scans.success_rate}%`} sub={`${data.scans.total_scanned} scanned`} />
        <StatCard label="Total Alerts" value={data.alerts.total} sub={`${data.alerts.unread} unread`} />
        <StatCard label="Active (24h)" value={data.portal_activity.active_24h} sub="portal logins" />
        <StatCard label="Active (7d)" value={data.portal_activity.active_7d} sub="portal logins" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stage Distribution */}
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Account Stage Distribution</h2>
          <BarChart data={data.accounts.by_stage} total={data.accounts.total} />
        </div>

        {/* Email Category Distribution */}
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Email Category Distribution</h2>
          <BarChart data={data.analysis.by_category} total={data.analysis.total} />
        </div>

        {/* Account Status */}
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Account Status</h2>
          <BarChart data={data.accounts.by_status} total={data.accounts.total} />
        </div>

        {/* Analysis Source */}
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Analysis Method</h2>
          <BarChart data={data.analysis.by_source} total={data.analysis.total} />
        </div>

        {/* Alert Types */}
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Alert Types</h2>
          <BarChart data={data.alerts.by_type} total={data.alerts.total} />
        </div>
      </div>
    </div>
  );
}
