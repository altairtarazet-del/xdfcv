import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";

interface PortalUser {
  id: string;
  email: string;
  display_name: string | null;
  last_login_at: string | null;
  created_at: string;
}

export default function PortalUsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { t } = useTranslation();

  async function loadUsers() {
    const data = await api.get<{ users: PortalUser[] }>("/api/portal-users");
    setUsers(data.users);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/api/portal-users", {
        email,
        password,
        display_name: displayName || null,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(userEmail: string) {
    if (!confirm(`${t("deleteConfirm")} ${userEmail}?`)) return;
    await api.delete(`/api/portal-users/${encodeURIComponent(userEmail)}`);
    loadUsers();
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; {t("dashboard")}</Link>
          <h1 className="text-lg font-bold text-gray-800">{t("portalUsers")}</h1>
          <div className="ml-auto">
            <LanguageSelector />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Create Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-4">{t("createPortalUser")}</h2>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}
          <form onSubmit={createUser} className="flex gap-3 flex-wrap">
            <input
              type="email"
              placeholder={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder={t("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder={t("displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? t("creating") : t("create")}
            </button>
          </form>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("emailHeader")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("displayName")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("lastLogin")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t("created")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500">{u.display_name || "\u2014"}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : t("never")}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteUser(u.email)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {t("noPortalUsers")}
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
