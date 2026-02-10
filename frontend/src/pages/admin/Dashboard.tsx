import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";
import type { TranslationKey } from "../../i18n/translations";

interface StageInfo {
  labelKey: TranslationKey;
  color: string;
}

const STAGE_MAP: Record<string, StageInfo> = {
  REGISTERED: { labelKey: "stageRegistered", color: "bg-gray-100 text-gray-700" },
  IDENTITY_VERIFIED: { labelKey: "stageIdVerified", color: "bg-blue-100 text-blue-700" },
  BGC_PENDING: { labelKey: "stageBgcPending", color: "bg-yellow-100 text-yellow-700" },
  BGC_CLEAR: { labelKey: "stageBgcClear", color: "bg-green-100 text-green-700" },
  BGC_CONSIDER: { labelKey: "stageBgcConsider", color: "bg-orange-100 text-orange-700" },
  ACTIVE: { labelKey: "stageActive", color: "bg-emerald-100 text-emerald-700" },
  DEACTIVATED: { labelKey: "stageDeactivated", color: "bg-red-100 text-red-700" },
};

const STAGES = Object.keys(STAGE_MAP);

interface Stats {
  stage_counts: Record<string, number>;
  total_accounts: number;
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
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

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

  async function startScan() {
    setScanning(true);
    setScanStatus(t("startingScan"));
    try {
      const data = await api.post<{ scan_id: number }>("/api/scan");
      const scanId = data.scan_id;
      // Poll for status
      const poll = setInterval(async () => {
        const s = await api.get<{ status: string; scanned: number; errors: number; transitions: number }>(
          `/api/scan/${scanId}`
        );
        setScanStatus(`${s.status} — ${s.scanned} ${t("scanned")}, ${s.transitions} ${t("transitions")}, ${s.errors} ${t("errors")}`);
        if (s.status !== "running") {
          clearInterval(poll);
          setScanning(false);
          loadStats();
          loadAccounts();
        }
      }, 2000);
    } catch {
      setScanning(false);
      setScanStatus(t("scanFailed"));
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    navigate("/login");
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [stage, search, page]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">{t("adminTitle")}</h1>
          <div className="flex items-center gap-4">
            <LanguageSelector />
            <Link to="/portal-users" className="text-sm text-blue-600 hover:underline">
              {t("portalUsers")}
            </Link>
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">
              {t("logout")}
            </button>
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
                <div className="text-xs font-medium mt-1">{t(STAGE_MAP[s].labelKey)}</div>
              </button>
            ))}
          </div>
        )}

        {/* Scan Controls */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {stats?.last_scan ? (
              <>
                {t("lastScan")}: {new Date(stats.last_scan.started_at).toLocaleString()} —{" "}
                {stats.last_scan.status} ({stats.last_scan.scanned} {t("scanned")}, {stats.last_scan.transitions} {t("transitions")})
              </>
            ) : (
              t("noScansYet")
            )}
          </div>
          <div className="flex items-center gap-3">
            {scanStatus && <span className="text-sm text-blue-600">{scanStatus}</span>}
            <button
              onClick={startScan}
              disabled={scanning}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition"
            >
              {scanning ? t("scanning") : t("scanAll")}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder={t("searchEmail")}
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
          <span className="self-center text-sm text-gray-500">{total} {t("accounts")}</span>
        </div>

        {/* Accounts Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("emailHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("stageHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("stageUpdated")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("lastScanned")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("errorHeader")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/accounts/${encodeURIComponent(acc.email)}`} className="text-blue-600 hover:underline">
                      {acc.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STAGE_MAP[acc.stage]?.color || ""}`}>
                      {STAGE_MAP[acc.stage] ? t(STAGE_MAP[acc.stage].labelKey) : acc.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {acc.stage_updated_at ? new Date(acc.stage_updated_at).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {acc.last_scanned_at ? new Date(acc.last_scanned_at).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-red-500 text-xs max-w-xs truncate">
                    {acc.scan_error || ""}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {t("noAccountsFound")}
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
