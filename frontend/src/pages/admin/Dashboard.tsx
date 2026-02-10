import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

interface StageInfo {
  label: string;
  color: string;
}

const STAGE_MAP: Record<string, StageInfo> = {
  REGISTERED: { label: "Registered", color: "bg-gray-100 text-gray-700" },
  IDENTITY_VERIFIED: { label: "ID Verified", color: "bg-blue-100 text-blue-700" },
  BGC_PENDING: { label: "BGC Pending", color: "bg-yellow-100 text-yellow-700" },
  BGC_CLEAR: { label: "BGC Clear", color: "bg-green-100 text-green-700" },
  BGC_CONSIDER: { label: "BGC Consider", color: "bg-orange-100 text-orange-700" },
  ACTIVE: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  DEACTIVATED: { label: "Deactivated", color: "bg-red-100 text-red-700" },
};

const STAGES = Object.keys(STAGE_MAP);

interface Stats {
  stage_counts: Record<string, number>;
  total_accounts: number;
  unread_alerts: number;
  last_scan: {
    id: number;
    status: string;
    started_at: string;
    finished_at: string | null;
    scanned: number;
    errors: number;
    transitions: number;
  } | null;
}

interface Account {
  id: string;
  email: string;
  stage: string;
  stage_updated_at: string | null;
  last_scanned_at: string | null;
  scan_error: string | null;
  notes: string | null;
  customer_name: string | null;
  status: string;
  tags: string[];
}

interface Alert {
  id: number;
  alert_type: string;
  severity: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAlerts, setShowAlerts] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const stage = searchParams.get("stage") || "";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");

  async function loadStats() {
    const data = await api.get<Stats>("/api/dashboard/stats");
    setStats(data);
  }

  async function loadAccounts() {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (search) params.set("search", search);
    params.set("page", String(page));
    const data = await api.get<{ accounts: Account[]; total: number }>(
      `/api/dashboard/accounts?${params}`
    );
    setAccounts(data.accounts);
    setTotal(data.total);
  }

  async function loadAlerts() {
    const data = await api.get<{ alerts: Alert[] }>("/api/dashboard/alerts?unread_only=true&per_page=10");
    setAlerts(data.alerts);
  }

  async function markAlertRead(alertId: number) {
    await api.patch(`/api/dashboard/alerts/${alertId}/read`, {});
    loadAlerts();
    loadStats();
  }

  async function markAllRead() {
    await api.post("/api/dashboard/alerts/mark-all-read");
    setAlerts([]);
    loadStats();
  }

  async function startScan() {
    setScanning(true);
    setScanStatus("Starting scan...");
    try {
      const data = await api.post<{ scan_id: number }>("/api/scan");
      const scanId = data.scan_id;
      const poll = setInterval(async () => {
        const s = await api.get<{ status: string; scanned: number; errors: number; transitions: number }>(
          `/api/scan/${scanId}`
        );
        setScanStatus(`${s.status} — ${s.scanned} scanned, ${s.transitions} transitions, ${s.errors} errors`);
        if (s.status !== "running") {
          clearInterval(poll);
          setScanning(false);
          loadStats();
          loadAccounts();
        }
      }, 2000);
    } catch {
      setScanning(false);
      setScanStatus("Scan failed to start");
    }
  }

  async function bulkAction(action: string, value?: string) {
    if (selectedIds.size === 0) return;
    await api.post("/api/dashboard/bulk-action", {
      account_ids: Array.from(selectedIds),
      action,
      value,
    });
    setSelectedIds(new Set());
    loadAccounts();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_refresh_token");
    navigate("/login");
  }

  useEffect(() => {
    loadStats();
    loadAlerts();
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [stage, search, page]);

  const severityColor: Record<string, string> = {
    critical: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">DasherHelp Admin</h1>
          <div className="flex items-center gap-4">
            {/* Alert Bell */}
            <div className="relative">
              <button
                onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) loadAlerts(); }}
                className="relative p-2 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {(stats?.unread_alerts || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {stats!.unread_alerts > 99 ? "99+" : stats!.unread_alerts}
                  </span>
                )}
              </button>
              {/* Alert Dropdown */}
              {showAlerts && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
                  <div className="px-4 py-3 border-b flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">Alerts</span>
                    {alerts.length > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  {alerts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">No unread alerts</div>
                  ) : (
                    alerts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => markAlertRead(a.id)}
                        className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 flex gap-2"
                      >
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityColor[a.severity] || "bg-gray-400"}`} />
                        <div>
                          <div className="text-sm font-medium text-gray-800">{a.title}</div>
                          {a.message && <div className="text-xs text-gray-500 mt-0.5">{a.message}</div>}
                          <div className="text-[10px] text-gray-400 mt-1">
                            {new Date(a.created_at).toLocaleString()}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Link to="/all-emails" className="text-sm text-blue-600 hover:underline">All Emails</Link>
            <Link to="/analytics" className="text-sm text-blue-600 hover:underline">Analytics</Link>
            <Link to="/team" className="text-sm text-blue-600 hover:underline">Team</Link>
            <Link to="/portal-users" className="text-sm text-blue-600 hover:underline">Customers</Link>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stage Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={() => setSearchParams(stage === s ? {} : { stage: s })}
                className={`p-4 rounded-lg text-center transition border-2 ${
                  stage === s ? "border-blue-500" : "border-transparent"
                } ${STAGE_MAP[s].color}`}
              >
                <div className="text-2xl font-bold">{stats.stage_counts[s] || 0}</div>
                <div className="text-xs font-medium mt-1">{STAGE_MAP[s].label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Scan Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {stats?.last_scan ? (
              <>
                Last scan: {new Date(stats.last_scan.started_at).toLocaleString()} —{" "}
                {stats.last_scan.status} ({stats.last_scan.scanned} scanned, {stats.last_scan.transitions} transitions)
              </>
            ) : (
              "No scans yet"
            )}
          </div>
          <div className="flex items-center gap-3">
            {scanStatus && <span className="text-sm text-blue-600">{scanStatus}</span>}
            <button
              onClick={startScan}
              disabled={scanning}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition"
            >
              {scanning ? "Scanning..." : "Scan All"}
            </button>
          </div>
        </div>

        {/* Search + Bulk Actions */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search email..."
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value;
                const p: Record<string, string> = {};
                if (val) p.search = val;
                if (stage) p.stage = stage;
                setSearchParams(p);
              }
            }}
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <span className="self-center text-sm text-gray-500">{total} accounts</span>
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <button onClick={() => bulkAction("archive")} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300">
                Archive ({selectedIds.size})
              </button>
              <button onClick={() => bulkAction("suspend")} className="px-3 py-1.5 bg-yellow-200 text-yellow-700 rounded-lg text-xs hover:bg-yellow-300">
                Suspend
              </button>
              <button onClick={() => bulkAction("activate")} className="px-3 py-1.5 bg-green-200 text-green-700 rounded-lg text-xs hover:bg-green-300">
                Activate
              </button>
            </div>
          )}
        </div>

        {/* Accounts Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={accounts.length > 0 && selectedIds.size === accounts.length}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stage Updated</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(acc.id)}
                      onChange={() => toggleSelect(acc.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/accounts/${encodeURIComponent(acc.email)}`} className="text-blue-600 hover:underline">
                      {acc.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {acc.customer_name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_MAP[acc.stage]?.color || ""}`}>
                      {STAGE_MAP[acc.stage]?.label || acc.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      acc.status === "active" ? "bg-green-100 text-green-700" :
                      acc.status === "suspended" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {acc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {acc.stage_updated_at ? new Date(acc.stage_updated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-red-500 text-xs max-w-xs truncate">
                    {acc.scan_error || ""}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 50 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: Math.ceil(total / 50) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => {
                  const params: Record<string, string> = { page: String(p) };
                  if (stage) params.stage = stage;
                  if (search) params.search = search;
                  setSearchParams(params);
                }}
                className={`px-3 py-1 rounded text-sm ${
                  p === page ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
