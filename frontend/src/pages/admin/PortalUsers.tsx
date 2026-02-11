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
  const [provFirstName, setProvFirstName] = useState("");
  const [provMiddleName, setProvMiddleName] = useState("");
  const [provLastName, setProvLastName] = useState("");
  const [provDobMonth, setProvDobMonth] = useState("");
  const [provDobDay, setProvDobDay] = useState("");
  const [provDobYear, setProvDobYear] = useState("");
  const [provPhone, setProvPhone] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provResult, setProvResult] = useState<ProvisionResult | null>(null);

  // Manual create state
  const [showManual, setShowManual] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-generated email preview
  const generatedEmail =
    provFirstName && provLastName
      ? `${provFirstName.toLowerCase().replace(/[^a-z]/g, "")}${provLastName.toLowerCase().replace(/[^a-z]/g, "")}@dasherhelp.com`
      : "";

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
      const dob =
        provDobYear && provDobMonth && provDobDay
          ? `${provDobYear}-${provDobMonth.padStart(2, "0")}-${provDobDay.padStart(2, "0")}`
          : null;
      const result = await api.post<ProvisionResult>("/api/provision", {
        first_name: provFirstName,
        middle_name: provMiddleName || null,
        last_name: provLastName,
        date_of_birth: dob,
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

  function resetProvisionForm() {
    setShowProvision(false);
    setProvResult(null);
    setProvFirstName("");
    setProvMiddleName("");
    setProvLastName("");
    setProvDobMonth("");
    setProvDobDay("");
    setProvDobYear("");
    setProvPhone("");
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
    <div className="p-6 space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dd-950">Customer Management</h1>
          <p className="text-sm text-dd-600 mt-1">Manage portal users and customer accounts</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setShowProvision(true); setShowManual(false); setProvResult(null); }}
            className="bg-dd-red text-white px-5 py-2.5 rounded-dd-pill text-sm hover:bg-dd-red-hover font-semibold transition-colors"
          >
            New Customer
          </button>
          <button
            onClick={() => { setShowManual(true); setShowProvision(false); }}
            className="border border-dd-950 text-dd-950 px-5 py-2.5 rounded-dd-pill text-sm hover:bg-dd-100 font-semibold transition-colors"
          >
            Manual Create
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-dd-red-lighter text-dd-red-active p-3 rounded-dd text-sm font-medium border border-dd-red/20">
          {error}
        </div>
      )}

      {/* Provision Wizard */}
      {showProvision && !provResult && (
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-1">New Customer -- Auto Provision</h2>
          <p className="text-xs text-dd-600 mb-5">
            Creates SMTP.dev email account, DB record, and portal login in one step.
          </p>
          <form onSubmit={provisionCustomer} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">First Name *</label>
                <input
                  type="text"
                  placeholder="Muhammet"
                  value={provFirstName}
                  onChange={(e) => setProvFirstName(e.target.value)}
                  required
                  className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Middle Name</label>
                <input
                  type="text"
                  placeholder="Oguz"
                  value={provMiddleName}
                  onChange={(e) => setProvMiddleName(e.target.value)}
                  className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Last Name *</label>
                <input
                  type="text"
                  placeholder="Bayram"
                  value={provLastName}
                  onChange={(e) => setProvLastName(e.target.value)}
                  required
                  className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                />
              </div>
            </div>

            {/* Email Preview */}
            {generatedEmail && (
              <div className="bg-dd-50 border border-dd-200 rounded-lg px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-dd-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-dd-600">Email:</span>
                <span className="text-sm font-semibold text-dd-950">{generatedEmail}</span>
              </div>
            )}

            {/* DOB + Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Date of Birth</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="MM"
                    value={provDobMonth}
                    onChange={(e) => setProvDobMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                    className="w-16 px-3 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 text-center placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="DD"
                    value={provDobDay}
                    onChange={(e) => setProvDobDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                    className="w-16 px-3 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 text-center placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="YYYY"
                    value={provDobYear}
                    onChange={(e) => setProvDobYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    className="w-20 px-3 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 text-center placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold">Phone</label>
                <input
                  type="text"
                  placeholder="+1 (555) 123-4567"
                  value={provPhone}
                  onChange={(e) => setProvPhone(e.target.value)}
                  className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={provisioning}
                className="bg-dd-red text-white px-6 py-2.5 rounded-dd-pill text-sm hover:bg-dd-red-hover font-semibold disabled:opacity-50 transition-colors"
              >
                {provisioning ? "Provisioning..." : "Create Customer"}
              </button>
              <button
                type="button"
                onClick={resetProvisionForm}
                className="border border-dd-950 text-dd-950 px-5 py-2.5 rounded-dd-pill text-sm hover:bg-dd-100 font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Provision Result */}
      {provResult && (
        <div className="bg-[#E5F9EB] border border-green-200 rounded-dd p-6">
          <h2 className="text-sm font-bold text-[#004C1B] mb-3">Customer Created Successfully</h2>
          <div className="bg-white rounded-lg p-4 font-mono text-sm space-y-2 border border-green-200">
            <div><span className="text-dd-600">Email:</span> <span className="text-dd-950">{provResult.credentials.email}</span></div>
            <div><span className="text-dd-600">Portal Password:</span> <span className="font-bold text-[#004C1B]">{provResult.credentials.portal_password}</span></div>
          </div>
          <p className="text-xs text-[#004C1B] mt-3 font-medium">
            Copy these credentials now -- the password won't be shown again.
          </p>
          <button
            onClick={resetProvisionForm}
            className="mt-4 bg-dd-red text-white px-5 py-2 rounded-dd-pill text-sm hover:bg-dd-red-hover font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Manual Create Form */}
      {showManual && (
        <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 p-6">
          <h2 className="text-[12px] uppercase tracking-wider text-dd-600 font-semibold mb-5">Manual Portal User Create</h2>
          <form onSubmit={createUser} className="flex gap-3 flex-wrap items-end">
            <input
              type="email" placeholder="Email" value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)} required
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
            <input
              type="password" placeholder="Password" value={manualPassword}
              onChange={(e) => setManualPassword(e.target.value)} required
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
            <input
              type="text" placeholder="Display Name" value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
            />
            <button type="submit" disabled={creating}
              className="bg-dd-red text-white px-5 py-2.5 rounded-dd-pill text-sm hover:bg-dd-red-hover font-semibold disabled:opacity-50 transition-colors">
              {creating ? "Creating..." : "Create"}
            </button>
            <button type="button" onClick={() => setShowManual(false)}
              className="border border-dd-950 text-dd-950 px-5 py-2.5 rounded-dd-pill text-sm hover:bg-dd-100 font-semibold transition-colors">
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-600 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
      />

      {/* Users Table */}
      <div className="bg-white rounded-dd shadow-dd-md border border-dd-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-dd-50">
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Name</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Email</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Status</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Last Login</th>
              <th className="text-left px-4 py-3 uppercase text-[12px] text-dd-600 tracking-wider font-semibold">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-dd-50 transition-colors">
                <td className="px-4 py-3 text-sm text-dd-950 font-medium border-b border-dd-200">
                  {u.display_name || "--"}
                </td>
                <td className="px-4 py-3 text-sm text-dd-800 border-b border-dd-200">{u.email}</td>
                <td className="px-4 py-3 border-b border-dd-200">
                  <span className={`px-2.5 py-1 rounded-dd-pill text-xs font-semibold ${
                    u.is_active ? "bg-[#E5F9EB] text-[#004C1B]" : "bg-dd-red-lighter text-dd-red-active"
                  }`}>
                    {u.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-dd-600 border-b border-dd-200">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                </td>
                <td className="px-4 py-3 text-xs text-dd-600 border-b border-dd-200">{new Date(u.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right border-b border-dd-200">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      to={`/emails/${encodeURIComponent(u.email)}`}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold border border-dd-950 text-dd-950 hover:bg-dd-100 transition-colors"
                    >
                      Emails
                    </Link>
                    <button onClick={() => resetPassword(u.email)}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold border border-dd-950 text-dd-950 hover:bg-dd-100 transition-colors">
                      Reset Pwd
                    </button>
                    <button onClick={() => toggleActive(u)}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold border border-dd-950 text-dd-950 hover:bg-dd-100 transition-colors">
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => deleteUser(u.email)}
                      className="px-3 py-1 rounded-dd-pill text-xs font-semibold text-dd-red border border-dd-red hover:bg-dd-red-lighter transition-colors">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-dd-600 text-sm">
                  No customers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
