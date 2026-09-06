import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 28px",
          background: "#fff",
          borderBottom: "2px solid var(--color-text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="/birchleigh-mark.png" alt="Birchleigh Industries" style={{ height: 40 }} />
          <div>
            <h1 style={{ fontSize: 20 }}>Piccolo</h1>
            <div className="label">Tender pipeline, Phase 2</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Link to="/">Pipeline</Link>
          <Link to="/vault">Vault</Link>
          {user?.role === "admin" && <Link to="/platforms">Platforms</Link>}
          <span className="label">{user?.name}</span>
          <button className="btn" onClick={() => logout()}>
            Log out
          </button>
        </nav>
      </header>
      <main style={{ padding: 28, maxWidth: 1400, margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
