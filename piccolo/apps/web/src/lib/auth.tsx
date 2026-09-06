import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, setAccessToken, setUnauthorizedHandler, refreshAccessToken } from "./api";

type User = { id: string; email: string; name: string; role: "owner" | "admin" };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    // On load, there's no access token in memory yet (a hard refresh wipes
    // it by design) - try the httpOnly refresh cookie once to resume the
    // session silently.
    (async () => {
      try {
        const ok = await refreshAccessToken();
        if (ok) {
          const me = await apiFetch<User>("/auth/me");
          setUser(me);
        }
      } catch {
        // no valid session, stay logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
