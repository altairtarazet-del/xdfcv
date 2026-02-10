import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface Admin {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-700",
};

export default function TeamManagement() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("admin");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");

  async function loadAdmins() {
    const data = await api.get<{ admins: Admin[] }>("/api/admin/team");
    setAdmins(data.admins);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/api/admin/team", {
        username,
        password,
        display_name: displayName || null,
        role,
      });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("admin");
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function updateRole(adminId: string) {
    try {
      await api.patch(`/api/admin/team/${adminId}`, { role: editRole });
      setEditingId(null);
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function toggleActive(admin: Admin) {
    try {
      await api.patch(`/api/admin/team/${admin.id}`, { is_active: !admin.is_active });
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function deleteAdmin(admin: Admin) {
    if (!confirm(`Delete admin "${admin.username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/team/${admin.id}`);
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-blue-600 hover:underline text-sm">&larr; Dashboard</Link>
          <h1 className="text-lg font-bold text-gray-800">Team Management</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Create Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-4">ADD TEAM MEMBER</h2>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}
          <form onSubmit={createAdmin} className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Add Member"}
            </button>
          </form>
        </div>

        {/* Team Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Display Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.username}</td>
                  <td className="px-4 py-3 text-gray-500">{a.display_name || "—"}</td>
                  <td className="px-4 py-3">
                    {editingId === a.id ? (
                      <div className="flex gap-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="px-2 py-1 border rounded text-xs"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <button onClick={() => updateRole(a.id)} className="text-blue-600 text-xs">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(a.id); setEditRole(a.role); }}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[a.role] || ""}`}
                      >
                        {a.role}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      a.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {a.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => toggleActive(a)}
                      className="text-yellow-600 hover:text-yellow-700 text-xs"
                    >
                      {a.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => deleteAdmin(a)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
