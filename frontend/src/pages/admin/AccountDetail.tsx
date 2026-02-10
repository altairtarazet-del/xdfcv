import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";

const STAGE_COLORS: Record<string, string> = {
  REGISTERED: "bg-gray-200",
  IDENTITY_VERIFIED: "bg-blue-200",
  BGC_PENDING: "bg-yellow-200",
  BGC_CLEAR: "bg-green-200",
  BGC_CONSIDER: "bg-orange-200",
  ACTIVE: "bg-emerald-200",
  DEACTIVATED: "bg-red-200",
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

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!account) return <div className="p-8 text-gray-400">Loading...</div>;

  const STAGES = ["REGISTERED", "IDENTITY_VERIFIED", "BGC_PENDING", "BGC_CLEAR", "BGC_CONSIDER", "ACTIVE", "DEACTIVATED"];
  const currentIndex = STAGES.indexOf(account.stage);

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "Account Info" },
    { key: "history", label: "Stage History" },
    { key: "analysis", label: "Email Analysis" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</Link>
          <div>
            <h1 className="text-lg font-bold text-gray-800">{account.email}</h1>
            {account.customer_name && (
              <span className="text-sm text-gray-500">{account.customer_name}</span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stage Timeline */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-4">STAGE PROGRESSION</h2>
          <div className="flex items-center gap-1">
            {STAGES.map((s, i) => (
              <div key={s} className="flex-1">
                <div
                  className={`h-2 rounded-full ${
                    i <= currentIndex ? STAGE_COLORS[s] : "bg-gray-100"
                  }`}
                />
                <div className={`text-[10px] mt-1 text-center ${
                  s === account.stage ? "font-bold text-gray-800" : "text-gray-400"
                }`}>
                  {s.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Current Stage", value: account.stage },
            { label: "Status", value: account.status },
            { label: "Last Scanned", value: account.last_scanned_at ? new Date(account.last_scanned_at).toLocaleString() : "—" },
            { label: "Created", value: new Date(account.created_at).toLocaleString() },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="text-sm font-medium mt-1">{item.value}</div>
            </div>
          ))}
        </div>

        {account.scan_error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
            <strong>Last scan error:</strong> {account.scan_error}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`pb-2 text-sm font-medium border-b-2 transition ${
                  activeTab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "info" && (
          <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">ACCOUNT DETAILS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Assigned Admin</label>
                <select
                  value={assignedAdmin}
                  onChange={(e) => setAssignedAdmin(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
              <label className="block text-xs text-gray-500 mb-1">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-blue-400 hover:text-blue-600">&times;</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="Add tag..."
                  className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button onClick={addTag} className="text-sm text-blue-600 hover:underline">Add</button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={saveAccount}
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

        {activeTab === "history" && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Trigger Email</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 text-gray-500">{new Date(h.changed_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{h.old_stage || "—"}</td>
                    <td className="px-4 py-3 font-medium">{h.new_stage}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                      {h.trigger_email_subject || "—"}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      No stage changes recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "analysis" && (
          <AnalysisTab accountId={account.id} email={account.email} />
        )}
      </div>
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
  earnings: "bg-green-100 text-green-700",
  operational: "bg-gray-100 text-gray-600",
  warning: "bg-red-100 text-red-700",
  unknown: "bg-yellow-100 text-yellow-700",
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "text-red-600",
  high: "text-orange-600",
  medium: "text-yellow-600",
  low: "text-gray-500",
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
      const data = await api.get<{ analyses: Analysis[] }>(`/api/analysis/account/${accountId}${params}`);
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
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("")}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${!filter ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}
        >
          All ({analyses.length})
        </button>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <button
            key={cat}
            onClick={() => setFilter(cat === filter ? "" : cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filter === cat ? "ring-2 ring-blue-500" : ""} ${CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-600"}`}
          >
            {cat} ({count})
          </button>
        ))}
      </div>

      {/* View emails link */}
      <div className="text-right">
        <Link to={`/emails/${encodeURIComponent(email)}`} className="text-sm text-blue-600 hover:underline">
          View All Emails &rarr;
        </Link>
      </div>

      {/* Analysis table */}
      {loading ? (
        <div className="p-8 text-gray-400 text-sm text-center">Loading analyses...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Summary</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Urgency</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Confidence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analyses.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[a.category] || ""}`}>
                      {a.category}/{a.sub_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{a.summary}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${URGENCY_COLORS[a.urgency] || ""}`}>
                      {a.urgency}
                      {a.action_required && " *"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.analysis_source}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{Math.round(a.confidence * 100)}%</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {analyses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No email analyses yet. Run a scan to analyze emails.
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
