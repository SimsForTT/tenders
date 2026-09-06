const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// The access token lives only in memory - never localStorage/sessionStorage.
// A token in Web Storage is readable by any script that runs on the page,
// so a single XSS bug becomes full account takeover; keeping it in a JS
// closure means it disappears on refresh, which the silent-refresh flow
// below (backed by the httpOnly refresh cookie) papers over transparently.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!res.ok) return false;
  const data = await res.json();
  accessToken = data.accessToken;
  return true;
}

type RequestOptions = { method?: string; body?: unknown; isFormData?: boolean };

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = async () => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (opts.isFormData) {
        body = opts.body as FormData;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }
    }
    return fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
    });
  };

  let res = await doFetch();
  if (res.status === 401 && accessToken !== null) {
    // Access token expired mid-session: try one silent refresh, then retry
    // the original request exactly once. A second 401 means the session
    // is genuinely over.
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      accessToken = null;
      onUnauthorized?.();
    }
  }

  if (res.status === 401) {
    onUnauthorized?.();
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.message ?? errorBody.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_BASE, refreshAccessToken };
