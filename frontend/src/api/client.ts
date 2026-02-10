const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function isPortal(): boolean {
  return window.location.hostname.startsWith("portal");
}

function getTokenKey(): string {
  return isPortal() ? "portal_token" : "admin_token";
}

function getRefreshKey(): string {
  return isPortal() ? "portal_refresh_token" : "admin_refresh_token";
}

function getRefreshEndpoint(): string {
  return isPortal() ? "/api/portal/refresh" : "/api/admin/refresh";
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(getRefreshKey());
  if (!refreshToken) return null;

  // Deduplicate concurrent refresh requests
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const resp = await fetch(`${API_URL}${getRefreshEndpoint()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data.token) {
        localStorage.setItem(getTokenKey(), data.token);
        return data.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem(getTokenKey());
  }

  async fetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    let resp = await fetch(`${API_URL}${path}`, { ...options, headers });

    // On 401, try refreshing the token once
    if (resp.status === 401) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        resp = await fetch(`${API_URL}${path}`, { ...options, headers });
      }
    }

    if (resp.status === 401) {
      localStorage.removeItem(getTokenKey());
      localStorage.removeItem(getRefreshKey());
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    return resp.json();
  }

  get<T = unknown>(path: string) {
    return this.fetch<T>(path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.fetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
  }

  patch<T = unknown>(path: string, body: unknown) {
    return this.fetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  delete<T = unknown>(path: string) {
    return this.fetch<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
