const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiClient {
  private getToken(): string | null {
    const hostname = window.location.hostname;
    if (hostname.startsWith("portal")) {
      return localStorage.getItem("portal_token");
    }
    return localStorage.getItem("admin_token");
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
    const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (resp.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem("admin_token");
      localStorage.removeItem("portal_token");
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
