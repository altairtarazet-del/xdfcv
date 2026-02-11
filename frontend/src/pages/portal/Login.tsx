import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ token: string; refresh_token: string }>("/api/portal/login", { email, password });
      localStorage.setItem("portal_token", data.token);
      localStorage.setItem("portal_refresh_token", data.refresh_token);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dd-100">
      <div className="bg-white rounded-dd shadow-dd-lg p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-dd-red rounded-xl flex items-center justify-center mb-3">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <h1 className="text-xl font-bold text-dd-950">DasherHelp</h1>
          <p className="text-sm text-dd-600 mt-1">Sign in to your portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-dd-red-lighter text-dd-red-active p-3 rounded-dd text-sm font-medium border border-dd-red/20">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-dd-950">Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-dd-950">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-dd-red text-white py-3 rounded-dd-pill font-semibold hover:bg-dd-red-hover active:bg-dd-red-active disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
