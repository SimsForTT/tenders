import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../lib/api";
import type { Platform } from "../lib/types";

const healthColor: Record<Platform["health"], string> = {
  ok: "var(--ok)",
  degraded: "var(--alert)",
  broken: "var(--alert-700)",
};

export function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", tier: "3", ingestMethod: "rss", cadence: "" });

  function load() {
    apiFetch<Platform[]>("/platforms").then(setPlatforms).catch((e) => setError(String(e)));
  }
  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/platforms", {
        method: "POST",
        body: { ...form, tier: Number(form.tier) },
      });
      setForm({ name: "", url: "", tier: "3", ingestMethod: "rss", cadence: "" });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Discovery sources</h2>
        <div className="label" style={{ marginBottom: 10 }}>
          A silent scraper is worse than no scraper - health flips to "broken" after two empty runs on a normally active source.
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Method</th>
              <th>Cadence</th>
              <th>Health</th>
              <th>Last success</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <tr key={p.id}>
                <td><a href={p.url} target="_blank" rel="noreferrer noopener">{p.name}</a></td>
                <td>{p.ingestMethod}</td>
                <td>{p.cadence}</td>
                <td style={{ color: healthColor[p.health], fontWeight: 700, textTransform: "uppercase" }}>{p.health}</td>
                <td>{p.lastSuccessAt ? new Date(p.lastSuccessAt).toLocaleString() : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16 }}>Add a platform</h2>
        <div style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
          Confirm the site's terms allow automated polling before adding it here.
        </div>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        <label>
          <div className="label">Name</div>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <div className="label">URL</div>
          <input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </label>
        <label>
          <div className="label">Tier (1-6)</div>
          <input required type="number" min={1} max={6} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} />
        </label>
        <label>
          <div className="label">Ingest method</div>
          <select value={form.ingestMethod} onChange={(e) => setForm({ ...form, ingestMethod: e.target.value })}>
            <option value="rss">RSS poll</option>
            <option value="email">Email alert parse</option>
            <option value="scrape">HTML scrape</option>
            <option value="manual">Manual check, logged</option>
          </select>
        </label>
        <label>
          <div className="label">Cadence</div>
          <input required placeholder="hourly / twice_daily / weekly" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} />
        </label>
        <button className="btn btn-primary" type="submit">Add platform</button>
      </form>
    </div>
  );
}
