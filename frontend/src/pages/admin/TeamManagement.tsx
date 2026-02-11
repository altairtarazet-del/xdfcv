import { useEffect, useState } from "react";
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
  super_admin: "bg-dd-red-lighter text-dd-red-active",
  admin: "bg-blue-50 text-blue-700",
  operator: "bg-[#FFF3D6] text-[#8A6100]",
  viewer: "bg-dd-100 text-dd-600",
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
    <div className="p-6 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-dd-950">Team Management</h1>
        <p className="text-sm text-dd-600 mt-1">Manage admin users and their roles</p>
      </div>

      {/* Create Form */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
        <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Add Team Member</h2>
        {error && (
          <div className="bg-dd-red-lighter text-dd-red-active p-3 rounded-dd text-sm font-medium border border-dd-red/20 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={createAdmin} className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Username</label>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Password</label>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Display Name</label>
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none bg-white"
            >
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="bg-dd-red text-white px-6 py-2.5 rounded-dd-pill text-sm hover:bg-dd-red-hover font-semibold disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Add Member"}
          </button>
        </form>
      </div>

      {/* Team Table */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-dd-50">
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Username</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Display Name</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Role</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Status</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Last Login</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-dd-50 transition-colors">
                <td className="px-4 py-3 text-sm text-dd-950 font-medium border-b border-dd-200">{a.username}</td>
                <td className="px-4 py-3 text-sm text-dd-800 border-b border-dd-200">{a.display_name || "--"}</td>
                <td className="px-4 py-3 border-b border-dd-200">
                  {editingId === a.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="px-3 py-1.5 border border-dd-400 rounded-lg text-xs text-dd-950 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none bg-white"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                      <button onClick={() => updateRole(a.id)}
                        className="px-3 py-1 rounded-dd-pill text-xs font-semibold bg-dd-red text-white hover:bg-dd-red-hover transition-colors">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1 rounded-dd-pill text-xs font-semibold text-dd-600 hover:text-dd-950 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingId(a.id); setEditRole(a.role); }}
                      className={`px-2.5 py-1 rounded-dd-pill text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${ROLE_COLORS[a.role] || "bg-dd-100 text-dd-600"}`}
                    >
                      {a.role}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 border-b border-dd-200">
                  <span className={`px-2.5 py-1 rounded-dd-pill text-xs font-semibold ${
                    a.is_active ? "bg-[#E5F9EB] text-[#004C1B]" : "bg-dd-red-lighter text-dd-red-active"
                  }`}>
                    {a.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-dd-600 border-b border-dd-200">
                  {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-right border-b border-dd-200">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleActive(a)}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold border border-dd-950 text-dd-950 hover:bg-dd-100 transition-colors"
                    >
                      {a.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => deleteAdmin(a)}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold text-dd-red border border-dd-red hover:bg-dd-red-lighter transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
