import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../lib/api";
import type { VaultDoc } from "../lib/types";

export function VaultPage() {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "", name: "", issuingBody: "", issuedAt: "", expiresAt: "" });

  function load() {
    apiFetch<VaultDoc[]>("/vault-docs").then(setDocs).catch((e) => setError(String(e)));
  }
  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/vault-docs", {
        method: "POST",
        body: {
          category: form.category,
          name: form.name,
          issuingBody: form.issuingBody || undefined,
          issuedAt: new Date(form.issuedAt).toISOString(),
          expiresAt: new Date(form.expiresAt).toISOString(),
        },
      });
      setForm({ category: "", name: "", issuingBody: "", issuedAt: "", expiresAt: "" });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Compliance Vault, current documents</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Name</th>
              <th>Issuing body</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.category}</td>
                <td>{d.name}</td>
                <td>{d.issuingBody ?? "-"}</td>
                <td>{new Date(d.expiresAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>No documents recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16 }}>Add / renew a document</h2>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        <label>
          <div className="label">Category</div>
          <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Tax compliance status" />
        </label>
        <label>
          <div className="label">Name</div>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <div className="label">Issuing body</div>
          <input value={form.issuingBody} onChange={(e) => setForm({ ...form, issuingBody: e.target.value })} />
        </label>
        <label>
          <div className="label">Issued</div>
          <input required type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
        </label>
        <label>
          <div className="label">Expires</div>
          <input required type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <button className="btn btn-primary" type="submit">Save</button>
      </form>
    </div>
  );
}
