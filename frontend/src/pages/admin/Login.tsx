import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ token: string }>("/api/admin/login", { username, password });
      localStorage.setItem("admin_token", data.token);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <LanguageSelector />
        </div>
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">{t("adminTitle")}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          <input
            type="text"
            placeholder={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            required
          />
          <input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? t("loggingIn") : t("login")}
          </button>
        </form>
      </div>
    </div>
  );
}
