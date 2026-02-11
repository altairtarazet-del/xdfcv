import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ token: string; refresh_token: string; role: string }>("/api/admin/login", { username, password });
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_refresh_token", data.refresh_token);
      localStorage.setItem("admin_role", data.role || "admin");
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dd-100">
      <div className="bg-white rounded-dd shadow-dd-lg p-8 w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 bg-dd-red rounded-lg flex items-center justify-center">
            <span className="text-white text-xl font-bold leading-none">D</span>
          </div>
          <span className="text-2xl font-bold text-dd-950">DasherHelp</span>
        </div>
        <p className="text-center text-dd-600 text-sm mb-8">Sign in to your admin account</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-dd-red text-sm">{error}</div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-dd-950 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 border border-dd-400 rounded-lg focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none transition"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-dd-950 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-dd-400 rounded-lg focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none transition"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-dd-red text-white rounded-dd-pill py-3 font-semibold hover:bg-dd-red-hover disabled:opacity-50 transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
