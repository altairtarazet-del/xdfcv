import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

const STAGE_COLORS: Record<string, string> = {
  REGISTERED: "bg-gray-400",
  IDENTITY_VERIFIED: "bg-blue-400",
  BGC_PENDING: "bg-yellow-400",
  BGC_CLEAR: "bg-green-400",
  BGC_CONSIDER: "bg-orange-400",
  ACTIVE: "bg-emerald-400",
  DEACTIVATED: "bg-red-400",
};

const CATEGORY_COLORS: Record<string, string> = {
  bgc: "bg-purple-400",
  account: "bg-blue-400",
  earnings: "bg-green-400",
  operational: "bg-gray-400",
  warning: "bg-red-400",
  unknown: "bg-yellow-400",
};

function BarChart({ data, colors, total }: { data: Record<string, number>; colors: Record<string, string>; total: number }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      {sorted.map(([key, count]) => (
        <div key={key} className="flex items-center gap-3">
          <div className="w-28 text-xs text-gray-600 truncate text-right">{key}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full ${colors[key] || "bg-gray-400"}`}
              style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
            />
          </div>
          <div className="w-12 text-xs text-gray-500 text-right">{count}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
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

  if (loading) return <div className="p-8 text-gray-400">Loading analytics...</div>;
  if (!data) return <div className="p-8 text-red-600">Failed to load analytics</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</Link>
          <h1 className="text-lg font-bold text-gray-800">Analytics</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Total Accounts" value={data.accounts.total} />
          <StatCard label="Emails Analyzed" value={data.analysis.total} />
          <StatCard label="Scan Success Rate" value={`${data.scans.success_rate}%`} sub={`${data.scans.total_scanned} scanned`} />
          <StatCard label="Total Alerts" value={data.alerts.total} sub={`${data.alerts.unread} unread`} />
          <StatCard label="Active (24h)" value={data.portal_activity.active_24h} sub="portal logins" />
          <StatCard label="Active (7d)" value={data.portal_activity.active_7d} sub="portal logins" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Stage Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">ACCOUNT STAGE DISTRIBUTION</h2>
            <BarChart data={data.accounts.by_stage} colors={STAGE_COLORS} total={data.accounts.total} />
          </div>

          {/* Email Category Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">EMAIL CATEGORY DISTRIBUTION</h2>
            <BarChart data={data.analysis.by_category} colors={CATEGORY_COLORS} total={data.analysis.total} />
          </div>

          {/* Account Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">ACCOUNT STATUS</h2>
            <BarChart
              data={data.accounts.by_status}
              colors={{ active: "bg-green-400", suspended: "bg-yellow-400", archived: "bg-gray-400" }}
              total={data.accounts.total}
            />
          </div>

          {/* Analysis Source */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">ANALYSIS METHOD</h2>
            <BarChart
              data={data.analysis.by_source}
              colors={{ rules: "bg-blue-400", ai: "bg-purple-400", manual: "bg-orange-400" }}
              total={data.analysis.total}
            />
          </div>

          {/* Alert Types */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">ALERT TYPES</h2>
            <BarChart
              data={data.alerts.by_type}
              colors={{
                stage_change: "bg-blue-400",
                deactivation: "bg-red-400",
                contract_violation: "bg-red-600",
                low_rating: "bg-orange-400",
                anomaly: "bg-yellow-400",
                system: "bg-gray-400",
              }}
              total={data.alerts.total}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
