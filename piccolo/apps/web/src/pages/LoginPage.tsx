import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      // Deliberately generic - never echo back API error detail that could
      // hint at whether the email or the password was the wrong part.
      setError("Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-surface)" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <img src="/birchleigh-mark.png" alt="" style={{ height: 44 }} />
          <div>
            <h1 style={{ fontSize: 22 }}>Piccolo</h1>
            <div className="label">Birchleigh Industries</div>
          </div>
        </div>
        <label>
          <div className="label" style={{ marginBottom: 4 }}>Email</div>
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <div className="label" style={{ marginBottom: 4 }}>Password</div>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
          Accounts are provisioned by an admin. No public sign-up.
        </div>
      </form>
    </div>
  );
}
