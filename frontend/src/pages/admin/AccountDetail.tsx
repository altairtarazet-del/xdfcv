import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";

const STAGE_COLORS: Record<string, { active: string; bar: string }> = {
  REGISTERED: { active: "bg-dd-400", bar: "bg-dd-300" },
  IDENTITY_VERIFIED: { active: "bg-blue-500", bar: "bg-blue-400" },
  BGC_PENDING: { active: "bg-yellow-500", bar: "bg-yellow-400" },
  BGC_CLEAR: { active: "bg-emerald-500", bar: "bg-emerald-400" },
  BGC_CONSIDER: { active: "bg-orange-500", bar: "bg-orange-400" },
  ACTIVE: { active: "bg-dd-red", bar: "bg-dd-red" },
  DEACTIVATED: { active: "bg-red-600", bar: "bg-red-500" },
};

const STAGE_BADGE: Record<string, string> = {
  REGISTERED: "bg-dd-200 text-dd-800",
  IDENTITY_VERIFIED: "bg-blue-100 text-blue-700",
  BGC_PENDING: "bg-yellow-100 text-yellow-700",
  BGC_CLEAR: "bg-emerald-100 text-emerald-700",
  BGC_CONSIDER: "bg-orange-100 text-orange-700",
  ACTIVE: "bg-dd-red-lighter text-dd-red",
  DEACTIVATED: "bg-red-100 text-red-700",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-yellow-100 text-yellow-700",
  archived: "bg-dd-200 text-dd-700",
};

interface Account {
  id: string;
  email: string;
  stage: string;
  stage_updated_at: string | null;
  last_scanned_at: string | null;
  scan_error: string | null;
  notes: string | null;
  created_at: string;
  customer_name: string | null;
  phone: string | null;
  tags: string[];
  status: string;
  assigned_admin_id: string | null;
}

interface HistoryEntry {
  id: number;
  old_stage: string | null;
  new_stage: string;
  trigger_email_subject: string | null;
  trigger_email_date: string | null;
  changed_at: string;
}

interface Admin {
  id: string;
  username: string;
  display_name: string | null;
}

type Tab = "info" | "history" | "analysis";

export default function AccountDetail() {
  const { email } = useParams<{ email: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [error, setError] = useState("");

  // Edit form state
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [assignedAdmin, setAssignedAdmin] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get<{ account: Account; history: HistoryEntry[] }>(
        `/api/dashboard/accounts/${encodeURIComponent(email!)}`
      );
      setAccount(data.account);
      setHistory(data.history);
      setCustomerName(data.account.customer_name || "");
      setPhone(data.account.phone || "");
      setNotes(data.account.notes || "");
      setStatus(data.account.status || "active");
      setAssignedAdmin(data.account.assigned_admin_id || "");
      setTags(data.account.tags || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  async function loadAdmins() {
    try {
      const data = await api.get<{ admins: Admin[] }>("/api/admin/team");
      setAdmins(data.admins);
    } catch {
      // non-critical
    }
  }

  async function saveAccount() {
    setSaving(true);
    try {
      await api.patch(`/api/dashboard/accounts/${encodeURIComponent(email!)}`, {
        customer_name: customerName || null,
        phone: phone || null,
        notes: notes || null,
        status,
        assigned_admin_id: assignedAdmin || null,
        tags,
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  useEffect(() => {
    load();
    loadAdmins();
  }, [email]);

  if (error)
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-dd p-4 text-sm">
          {error}
        </div>
      </div>
    );

  if (!account)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-dd-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading account...</span>
        </div>
      </div>
    );

  const STAGES = [
    "REGISTERED",
    "IDENTITY_VERIFIED",
    "BGC_PENDING",
    "BGC_CLEAR",
    "BGC_CONSIDER",
    "ACTIVE",
    "DEACTIVATED",
  ];
  const currentIndex = STAGES.indexOf(account.stage);

  const tabs: { key: Tab; label: string; icon: JSX.Element }[] = [
    {
      key: "info",
      label: "Account Info",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      key: "history",
      label: "Stage History",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      key: "analysis",
      label: "Email Analysis",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-dd-red hover:text-dd-red-hover transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dd-950">{account.email}</h1>
          {account.customer_name && (
            <p className="text-sm text-dd-600 mt-1">{account.customer_name}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-dd-pill text-xs font-semibold ${
            STAGE_BADGE[account.stage] || "bg-dd-200 text-dd-800"
          }`}
        >
          {account.stage.replace(/_/g, " ")}
        </span>
      </div>

      {/* Stage Progression Bar */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
        <h2 className="uppercase text-[12px] font-semibold text-dd-600 tracking-wider mb-4">
          Stage Progression
        </h2>
        <div className="flex items-center gap-1.5">
          {STAGES.map((s, i) => {
            const isCurrent = s === account.stage;
            const isPast = i <= currentIndex;
            const colors = STAGE_COLORS[s] || { active: "bg-dd-300", bar: "bg-dd-200" };
            return (
              <div key={s} className="flex-1">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isPast ? colors.bar : "bg-dd-200"
                  } ${isCurrent ? `${colors.active} ring-2 ring-offset-1 ring-${colors.active}` : ""}`}
                />
                <div
                  className={`text-[10px] mt-1.5 text-center leading-tight ${
                    isCurrent
                      ? "font-bold text-dd-950"
                      : isPast
                      ? "font-medium text-dd-700"
                      : "text-dd-400"
                  }`}
                >
                  {s.replace(/_/g, " ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info Grid Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Current Stage",
            value: account.stage.replace(/_/g, " "),
            badge: STAGE_BADGE[account.stage],
          },
          {
            label: "Status",
            value: account.status.charAt(0).toUpperCase() + account.status.slice(1),
            badge: STATUS_BADGE[account.status],
          },
          {
            label: "Last Scanned",
            value: account.last_scanned_at
              ? new Date(account.last_scanned_at).toLocaleString()
              : "Never",
          },
          {
            label: "Created",
            value: new Date(account.created_at).toLocaleString(),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-4"
          >
            <div className="uppercase text-[11px] font-semibold text-dd-500 tracking-wider">
              {item.label}
            </div>
            {item.badge ? (
              <span
                className={`inline-flex items-center mt-2 px-2.5 py-0.5 rounded-dd-pill text-xs font-semibold ${item.badge}`}
              >
                {item.value}
              </span>
            ) : (
              <div className="text-sm font-medium text-dd-950 mt-2">{item.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* Scan Error Alert */}
      {account.scan_error && (
        <div className="bg-dd-red-light border border-dd-red-lighter rounded-dd p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-dd-red flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-dd-red">Last Scan Error</div>
            <div className="text-sm text-dd-800 mt-0.5">{account.scan_error}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-dd-200">
        <div className="flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-dd-red text-dd-red"
                  : "border-transparent text-dd-600 hover:text-dd-950 hover:border-dd-300"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content: Info */}
      {activeTab === "info" && (
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6 space-y-6">
          <h2 className="uppercase text-[12px] font-semibold text-dd-600 tracking-wider">
            Account Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-1.5">
                Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                className="w-full px-3.5 py-2.5 border border-dd-300 rounded-dd text-sm text-dd-950 placeholder:text-dd-400 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-1.5">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
                className="w-full px-3.5 py-2.5 border border-dd-300 rounded-dd text-sm text-dd-950 placeholder:text-dd-400 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-dd-300 rounded-dd text-sm text-dd-950 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors bg-white"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-1.5">
                Assigned Admin
              </label>
              <select
                value={assignedAdmin}
                onChange={(e) => setAssignedAdmin(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-dd-300 rounded-dd text-sm text-dd-950 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors bg-white"
              >
                <option value="">Unassigned</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 bg-dd-100 text-dd-800 rounded-dd-pill px-3 py-1 text-xs font-medium"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-dd-500 hover:text-dd-red transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-dd-400">No tags added</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add a tag..."
                className="px-3.5 py-2 border border-dd-300 rounded-dd text-sm text-dd-950 placeholder:text-dd-400 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors"
              />
              <button
                onClick={addTag}
                className="px-4 py-2 border border-dd-950 text-dd-950 text-sm font-medium rounded-dd-pill hover:bg-dd-950 hover:text-white transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[12px] uppercase font-semibold text-dd-600 tracking-wider mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this account..."
              className="w-full border border-dd-300 rounded-dd px-3.5 py-2.5 text-sm text-dd-950 placeholder:text-dd-400 focus:ring-2 focus:ring-dd-red focus:border-dd-red focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={saveAccount}
              disabled={saving}
              className="bg-dd-red text-white px-8 py-2.5 rounded-dd-pill text-sm font-semibold hover:bg-dd-red-hover active:bg-dd-red-active disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-dd-sm"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab Content: History */}
      {activeTab === "history" && (
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dd-50 border-b border-dd-200">
              <tr>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Date
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  From
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  To
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Trigger Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dd-200">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-dd-50 transition-colors">
                  <td className="px-5 py-3.5 text-dd-600 text-xs">
                    {new Date(h.changed_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    {h.old_stage ? (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-dd-pill text-xs font-medium ${
                          STAGE_BADGE[h.old_stage] || "bg-dd-200 text-dd-800"
                        }`}
                      >
                        {h.old_stage.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-dd-400 text-xs">--</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-dd-pill text-xs font-semibold ${
                        STAGE_BADGE[h.new_stage] || "bg-dd-200 text-dd-800"
                      }`}
                    >
                      {h.new_stage.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-dd-600 text-xs max-w-xs truncate">
                    {h.trigger_email_subject || (
                      <span className="text-dd-400">--</span>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center">
                    <div className="text-dd-400 text-sm">No stage changes recorded</div>
                    <div className="text-dd-300 text-xs mt-1">
                      Changes will appear here as the account progresses
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Analysis */}
      {activeTab === "analysis" && (
        <AnalysisTab accountId={account.id} email={account.email} />
      )}
    </div>
  );
}

// --- Email Analysis Tab ---

interface Analysis {
  id: number;
  message_id: string;
  category: string;
  sub_category: string;
  confidence: number;
  analysis_source: string;
  summary: string;
  urgency: string;
  action_required: boolean;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  bgc: "bg-purple-100 text-purple-700",
  account: "bg-blue-100 text-blue-700",
  earnings: "bg-emerald-100 text-emerald-700",
  operational: "bg-dd-200 text-dd-700",
  warning: "bg-dd-red-light text-dd-red",
  unknown: "bg-yellow-100 text-yellow-700",
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "text-red-600 font-bold",
  high: "text-orange-600 font-semibold",
  medium: "text-yellow-600 font-medium",
  low: "text-dd-600",
  info: "text-blue-500",
};

function AnalysisTab({ accountId, email }: { accountId: string; email: string }) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  async function loadAnalyses() {
    setLoading(true);
    try {
      const params = filter ? `?category=${filter}` : "";
      const data = await api.get<{ analyses: Analysis[] }>(
        `/api/analysis/account/${accountId}${params}`
      );
      setAnalyses(data.analyses);
    } catch {
      setAnalyses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalyses();
  }, [accountId, filter]);

  // Count by category
  const categoryCounts: Record<string, number> = {};
  for (const a of analyses) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Category filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilter("")}
          className={`px-4 py-1.5 rounded-dd-pill text-xs font-semibold transition-colors ${
            !filter
              ? "bg-dd-red text-white"
              : "bg-white text-dd-700 border border-dd-300 hover:border-dd-950 hover:text-dd-950"
          }`}
        >
          All ({analyses.length})
        </button>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setFilter(cat === filter ? "" : cat)}
            className={`px-4 py-1.5 rounded-dd-pill text-xs font-semibold transition-all ${
              filter === cat
                ? "ring-2 ring-dd-red ring-offset-1"
                : ""
            } ${CATEGORY_COLORS[cat] || "bg-dd-200 text-dd-700"}`}
          >
            {cat} ({count})
          </button>
        ))}
      </div>

      {/* View emails link */}
      <div className="text-right">
        <Link
          to={`/emails/${encodeURIComponent(email)}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-dd-red hover:text-dd-red-hover transition-colors"
        >
          View All Emails
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Analysis table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-dd-500">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Loading analyses...</span>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dd-50 border-b border-dd-200">
              <tr>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Category
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Summary
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Urgency
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Source
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Confidence
                </th>
                <th className="text-left px-5 py-3.5 uppercase text-[12px] text-dd-600 font-semibold tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dd-200">
              {analyses.map((a) => (
                <tr key={a.id} className="hover:bg-dd-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-dd-pill text-xs font-medium ${
                        CATEGORY_COLORS[a.category] || "bg-dd-200 text-dd-700"
                      }`}
                    >
                      {a.category}/{a.sub_category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-dd-800 max-w-xs truncate">{a.summary}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs ${URGENCY_COLORS[a.urgency] || "text-dd-600"}`}>
                      {a.urgency.toUpperCase()}
                      {a.action_required && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 bg-dd-red-light text-dd-red rounded-dd-pill text-[10px] font-bold">
                          ACTION
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-dd-600 text-xs">{a.analysis_source}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-dd-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-dd-red rounded-full"
                          style={{ width: `${Math.round(a.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-dd-600 text-xs">
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-dd-600 text-xs">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {analyses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="text-dd-400 text-sm">
                      No email analyses yet
                    </div>
                    <div className="text-dd-300 text-xs mt-1">
                      Run a scan to analyze emails for this account
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
