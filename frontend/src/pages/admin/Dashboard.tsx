import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useSSE } from "../../hooks/useSSE";

interface StageInfo {
  label: string;
  color: string;
}

const STAGE_MAP: Record<string, StageInfo> = {
  REGISTERED: { label: "Registered", color: "bg-dd-100 text-dd-800" },
  IDENTITY_VERIFIED: { label: "ID Verified", color: "bg-[#E0F0FF] text-[#004A99]" },
  BGC_PENDING: { label: "BGC Pending", color: "bg-[#FFF3D6] text-[#8A6100]" },
  BGC_CLEAR: { label: "BGC Clear", color: "bg-[#E5F9EB] text-[#004C1B]" },
  BGC_CONSIDER: { label: "BGC Consider", color: "bg-dd-red-lighter text-dd-red-active" },
  ACTIVE: { label: "Active", color: "bg-[#E5F9EB] text-[#004C1B]" },
  DEACTIVATED: { label: "Deactivated", color: "bg-dd-red-lighter text-dd-red-active" },
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

  const token = localStorage.getItem("admin_token");

  // SSE for real-time updates
  const { connected: sseConnected } = useSSE({
    endpoint: "/api/sse/admin/events",
    token,
    enabled: !!token,
    onEvent: {
      new_email: () => {
        loadStats();
        loadAccounts();
      },
      stage_change: () => {
        loadStats();
        loadAccounts();
      },
      alert: () => {
        loadStats();
        loadAlerts();
      },
    },
  });

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
    critical: "bg-dd-red",
    warning: "bg-[#E5A500]",
    info: "bg-[#0070E0]",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dd-950">Dashboard</h1>
          <p className="text-sm text-dd-600 mt-1">
            Monitor dasher accounts, run scans, and manage onboarding stages.
          </p>
        </div>
        {/* Alert Bell */}
        <div className="relative">
          <button
            onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) loadAlerts(); }}
            className="relative p-2.5 text-dd-600 hover:text-dd-950 hover:bg-dd-100 rounded-dd transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {(stats?.unread_alerts || 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-dd-red text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {stats!.unread_alerts > 99 ? "99+" : stats!.unread_alerts}
              </span>
            )}
          </button>
          {/* Alert Dropdown */}
          {showAlerts && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-dd shadow-dd-lg border border-dd-200 z-50 max-h-96 overflow-y-auto">
              <div className="px-4 py-3 border-b border-dd-200 flex justify-between items-center">
                <span className="text-sm font-semibold text-dd-950">Alerts</span>
                {alerts.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-dd-red hover:text-dd-red-hover font-medium">
                    Mark all read
                  </button>
                )}
              </div>
              {alerts.length === 0 ? (
                <div className="px-4 py-6 text-center text-dd-500 text-sm">No unread alerts</div>
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => markAlertRead(a.id)}
                    className="w-full text-left px-4 py-3 border-b border-dd-200 hover:bg-dd-50 flex gap-3 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityColor[a.severity] || "bg-dd-400"}`} />
                    <div>
                      <div className="text-sm font-medium text-dd-950">{a.title}</div>
                      {a.message && <div className="text-xs text-dd-600 mt-0.5">{a.message}</div>}
                      <div className="text-[10px] text-dd-500 mt-1">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stage Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setSearchParams(stage === s ? {} : { stage: s })}
              className={`p-4 rounded-dd text-center transition-all border-2 ${
                stage === s ? "border-dd-red shadow-dd-md" : "border-transparent hover:shadow-dd-sm"
              } ${STAGE_MAP[s].color}`}
            >
              <div className="text-2xl font-bold">{stats.stage_counts[s] || 0}</div>
              <div className="text-xs font-medium mt-1">{STAGE_MAP[s].label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Scan Controls */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-4 flex items-center justify-between">
        <div className="text-sm text-dd-600">
          {stats?.last_scan ? (
            <>
              Last scan: {new Date(stats.last_scan.started_at).toLocaleString()} —{" "}
              <span className={`font-medium ${
                stats.last_scan.status === "completed" ? "text-[#004C1B]" :
                stats.last_scan.status === "failed" ? "text-dd-red-active" :
                "text-dd-800"
              }`}>
                {stats.last_scan.status}
              </span>
              {" "}({stats.last_scan.scanned} scanned, {stats.last_scan.transitions} transitions)
            </>
          ) : (
            "No scans yet"
          )}
        </div>
        <div className="flex items-center gap-3">
          {scanStatus && <span className="text-sm text-dd-red font-medium">{scanStatus}</span>}
          <button
            onClick={startScan}
            disabled={scanning}
            className="bg-dd-red text-white px-5 py-2 rounded-dd-pill hover:bg-dd-red-hover active:bg-dd-red-active disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {scanning ? "Scanning..." : "Scan All"}
          </button>
        </div>
      </div>

      {/* Search + Bulk Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dd-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by email..."
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
            className="w-full pl-10 pr-4 py-2.5 border border-dd-300 rounded-dd-pill text-sm text-dd-950 placeholder:text-dd-500 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors"
          />
        </div>
        <span className="text-sm text-dd-600 font-medium">{total} accounts</span>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => bulkAction("archive")}
              className="px-4 py-1.5 bg-dd-200 text-dd-800 rounded-dd-pill text-xs font-medium hover:bg-dd-300 transition-colors"
            >
              Archive ({selectedIds.size})
            </button>
            <button
              onClick={() => bulkAction("suspend")}
              className="px-4 py-1.5 bg-[#FFF3D6] text-[#8A6100] rounded-dd-pill text-xs font-medium hover:bg-[#FFE9B3] transition-colors"
            >
              Suspend
            </button>
            <button
              onClick={() => bulkAction("activate")}
              className="px-4 py-1.5 bg-[#E5F9EB] text-[#004C1B] rounded-dd-pill text-xs font-medium hover:bg-[#C8F0D4] transition-colors"
            >
              Activate
            </button>
          </div>
        )}
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-dd-50 border-b border-dd-200">
            <tr>
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={accounts.length > 0 && selectedIds.size === accounts.length}
                  onChange={toggleSelectAll}
                  className="rounded accent-dd-red"
                />
              </th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Email</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Customer</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Stage</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Status</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Stage Updated</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dd-200">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-dd-50 transition-colors">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(acc.id)}
                    onChange={() => toggleSelect(acc.id)}
                    className="rounded accent-dd-red"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-dd-950">
                  <Link to={`/accounts/${encodeURIComponent(acc.email)}`} className="text-dd-red hover:text-dd-red-hover font-medium hover:underline">
                    {acc.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-dd-600">
                  {acc.customer_name || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-dd-pill text-xs font-medium ${STAGE_MAP[acc.stage]?.color || ""}`}>
                    {STAGE_MAP[acc.stage]?.label || acc.stage}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-dd-pill text-xs font-medium ${
                    acc.status === "active" ? "bg-[#E5F9EB] text-[#004C1B]" :
                    acc.status === "suspended" ? "bg-[#FFF3D6] text-[#8A6100]" :
                    "bg-dd-100 text-dd-600"
                  }`}>
                    {acc.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-dd-600">
                  {acc.stage_updated_at ? new Date(acc.stage_updated_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-dd-red-active max-w-xs truncate">
                  {acc.scan_error || ""}
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-dd-500">
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
              className={`px-3.5 py-1.5 rounded-dd-pill text-sm font-medium transition-colors ${
                p === page
                  ? "bg-dd-red text-white"
                  : "bg-white border border-dd-200 text-dd-800 hover:bg-dd-50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
