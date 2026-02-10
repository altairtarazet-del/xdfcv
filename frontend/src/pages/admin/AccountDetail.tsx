import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n/LanguageContext";
import type { TranslationKey } from "../../i18n/translations";

const STAGE_COLORS: Record<string, string> = {
  REGISTERED: "bg-gray-200",
  IDENTITY_VERIFIED: "bg-blue-200",
  BGC_PENDING: "bg-yellow-200",
  BGC_CLEAR: "bg-green-200",
  BGC_CONSIDER: "bg-orange-200",
  ACTIVE: "bg-emerald-200",
  DEACTIVATED: "bg-red-200",
};

const STAGE_LABEL_KEYS: Record<string, TranslationKey> = {
  REGISTERED: "stageRegistered",
  IDENTITY_VERIFIED: "stageIdVerified",
  BGC_PENDING: "stageBgcPending",
  BGC_CLEAR: "stageBgcClear",
  BGC_CONSIDER: "stageBgcConsider",
  ACTIVE: "stageActive",
  DEACTIVATED: "stageDeactivated",
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
}

interface HistoryEntry {
  id: number;
  old_stage: string | null;
  new_stage: string;
  trigger_email_subject: string | null;
  trigger_email_date: string | null;
  changed_at: string;
}

export default function AccountDetail() {
  const { email } = useParams<{ email: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { t } = useTranslation();

  async function load() {
    try {
      const data = await api.get<{ account: Account; history: HistoryEntry[] }>(
        `/api/dashboard/accounts/${encodeURIComponent(email!)}`
      );
      setAccount(data.account);
      setHistory(data.history);
      setNotes(data.account.notes || "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await api.patch(`/api/accounts/${encodeURIComponent(email!)}/notes`, { notes });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, [email]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!account) return <div className="p-8 text-gray-400">{t("loading")}</div>;

  const STAGES = ["REGISTERED", "IDENTITY_VERIFIED", "BGC_PENDING", "BGC_CLEAR", "BGC_CONSIDER", "ACTIVE", "DEACTIVATED"];
  const currentIndex = STAGES.indexOf(account.stage);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; {t("dashboard")}</Link>
          <h1 className="text-lg font-bold text-gray-800">{account.email}</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stage Timeline */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-4">{t("stageProgression")}</h2>
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
                  {STAGE_LABEL_KEYS[s] ? t(STAGE_LABEL_KEYS[s]) : s}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("currentStage"), value: STAGE_LABEL_KEYS[account.stage] ? t(STAGE_LABEL_KEYS[account.stage]) : account.stage },
            { label: t("stageUpdated"), value: account.stage_updated_at ? new Date(account.stage_updated_at).toLocaleString() : "\u2014" },
            { label: t("lastScanned"), value: account.last_scanned_at ? new Date(account.last_scanned_at).toLocaleString() : "\u2014" },
            { label: t("created"), value: new Date(account.created_at).toLocaleString() },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-lg shadow-sm p-4">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="text-sm font-medium mt-1">{item.value}</div>
            </div>
          ))}
        </div>

        {account.scan_error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
            <strong>{t("lastScanError")}:</strong> {account.scan_error}
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">{t("notes")}</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("saving") : t("saveNotes")}
          </button>
        </div>

        {/* Stage History */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-500">{t("stageHistory")}</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("dateHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("fromHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("toHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("triggerEmail")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3 text-gray-500">{new Date(h.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{h.old_stage ? (STAGE_LABEL_KEYS[h.old_stage] ? t(STAGE_LABEL_KEYS[h.old_stage]) : h.old_stage) : "\u2014"}</td>
                  <td className="px-4 py-3 font-medium">{STAGE_LABEL_KEYS[h.new_stage] ? t(STAGE_LABEL_KEYS[h.new_stage]) : h.new_stage}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {h.trigger_email_subject || "\u2014"}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    {t("noStageChanges")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
