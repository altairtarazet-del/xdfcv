import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface PortalUser {
  id: string;
  email: string;
  display_name: string | null;
  account_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

interface ProvisionResult {
  credentials: {
    email: string;
    portal_password: string;
  };
}

export default function PortalUsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Provision wizard state
  const [showProvision, setShowProvision] = useState(false);
  const [provEmail, setProvEmail] = useState("");
  const [provName, setProvName] = useState("");
  const [provPhone, setProvPhone] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provResult, setProvResult] = useState<ProvisionResult | null>(null);

  // Manual create state
  const [showManual, setShowManual] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const data = await api.get<{ users: PortalUser[] }>(`/api/portal-users${params}`);
    setUsers(data.users);
  }

  async function provisionCustomer(e: React.FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    setError("");
    try {
      const result = await api.post<ProvisionResult>("/api/provision", {
        email: provEmail,
        customer_name: provName || null,
        phone: provPhone || null,
      });
      setProvResult(result);
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/api/portal-users", {
        email: manualEmail,
        password: manualPassword,
        display_name: manualName || null,
      });
      setManualEmail("");
      setManualPassword("");
      setManualName("");
      setShowManual(false);
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: PortalUser) {
    await api.patch(`/api/portal-users/${encodeURIComponent(user.email)}`, {
      is_active: !user.is_active,
    });
    loadUsers();
  }

  async function resetPassword(email: string) {
    if (!confirm(`Reset password for ${email}?`)) return;
    const newPassword = Math.random().toString(36).slice(-10);
    await api.patch(`/api/portal-users/${encodeURIComponent(email)}`, {
      password: newPassword,
    });
    alert(`New password for ${email}: ${newPassword}\n\nCopy this now — it won't be shown again.`);
  }

  async function deleteUser(userEmail: string) {
    if (!confirm(`Delete portal user ${userEmail}?`)) return;
    await api.delete(`/api/portal-users/${encodeURIComponent(userEmail)}`);
    loadUsers();
  }

  useEffect(() => {
    loadUsers();
  }, [search]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</Link>
            <h1 className="text-lg font-bold text-gray-800">Customer Management</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowProvision(true); setShowManual(false); setProvResult(null); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              New Customer
            </button>
            <button
              onClick={() => { setShowManual(true); setShowProvision(false); }}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300"
            >
              Manual Create
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

        {/* Provision Wizard */}
        {showProvision && !provResult && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">NEW CUSTOMER — AUTO PROVISION</h2>
            <p className="text-xs text-gray-500 mb-4">
              Creates SMTP.dev email account, DB record, and portal login in one step.
            </p>
            <form onSubmit={provisionCustomer} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="email"
                  placeholder="Email address *"
                  value={provEmail}
                  onChange={(e) => setProvEmail(e.target.value)}
                  required
                  className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={provName}
                  onChange={(e) => setProvName(e.target.value)}
                  className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={provPhone}
                  onChange={(e) => setProvPhone(e.target.value)}
                  className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={provisioning}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {provisioning ? "Provisioning..." : "Create Customer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProvision(false)}
                  className="text-gray-500 px-4 py-2 text-sm hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Provision Result */}
        {provResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-green-800 mb-3">Customer Created Successfully</h2>
            <div className="bg-white rounded-lg p-4 font-mono text-sm space-y-2">
              <div><span className="text-gray-500">Email:</span> {provResult.credentials.email}</div>
              <div><span className="text-gray-500">Portal Password:</span> <span className="font-bold text-green-700">{provResult.credentials.portal_password}</span></div>
            </div>
            <p className="text-xs text-green-700 mt-3">
              Copy these credentials now — the password won't be shown again.
            </p>
            <button
              onClick={() => { setShowProvision(false); setProvResult(null); setProvEmail(""); setProvName(""); setProvPhone(""); }}
              className="mt-3 text-sm text-green-700 hover:underline"
            >
              Done
            </button>
          </div>
        )}

        {/* Manual Create Form */}
        {showManual && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">MANUAL PORTAL USER CREATE</h2>
            <form onSubmit={createUser} className="flex gap-3 flex-wrap">
              <input
                type="email" placeholder="Email" value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)} required
                className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <input
                type="password" placeholder="Password" value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)} required
                className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <input
                type="text" placeholder="Display Name" value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button type="submit" disabled={creating}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {creating ? "Creating..." : "Create"}
              </button>
              <button type="button" onClick={() => setShowManual(false)}
                className="text-gray-500 px-4 py-2 text-sm hover:text-gray-700">Cancel</button>
            </form>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Display Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 text-gray-500">{u.display_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link
                      to={`/emails/${encodeURIComponent(u.email)}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Emails
                    </Link>
                    <button onClick={() => resetPassword(u.email)} className="text-yellow-600 hover:text-yellow-700 text-xs">
                      Reset Pwd
                    </button>
                    <button onClick={() => toggleActive(u)} className="text-orange-600 hover:text-orange-700 text-xs">
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => deleteUser(u.email)} className="text-red-500 hover:text-red-700 text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No customers found
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
