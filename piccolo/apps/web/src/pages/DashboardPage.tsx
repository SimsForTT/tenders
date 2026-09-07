import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Tender } from "../lib/types";
import { STAGES } from "@piccolo/shared";

type Tab = "mine" | "gate-queue" | "expiry";

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function stageLabel(stage: number) {
  return STAGES.find((s) => s.code === stage)?.label ?? `Stage ${stage}`;
}

function TendersTable({ tenders }: { tenders: Tender[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Tender</th>
          <th>Client</th>
          <th>Stage</th>
          <th>Closing</th>
          <th>T minus</th>
        </tr>
      </thead>
      <tbody>
        {tenders.map((t) => {
          const dLeft = daysUntil(t.closingAt);
          return (
            <tr key={t.id} className="row-link" onClick={() => (window.location.href = `/tenders/${t.id}`)}>
              <td>
                <Link to={`/tenders/${t.id}`}>{t.tenderNo}</Link>
                <div style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{t.title}</div>
              </td>
              <td>{t.client}</td>
              <td>{stageLabel(t.stage)}</td>
              <td>{new Date(t.closingAt).toLocaleString()}</td>
              <td style={{ color: dLeft <= 3 ? "var(--alert-700)" : undefined, fontWeight: dLeft <= 3 ? 700 : 400 }}>
                {dLeft >= 0 ? `T-${dLeft}` : "closed"}
              </td>
            </tr>
          );
        })}
        {tenders.length === 0 && (
          <tr>
            <td colSpan={5} style={{ color: "var(--color-neutral-700)" }}>
              Nothing here.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("mine");
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [gateQueue, setGateQueue] = useState<{ tender: Tender; gateNo: number }[]>([]);
  const [expiryWatch, setExpiryWatch] = useState<Array<{ name: string; expiresAt: string; earliestOpenClosing: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Tender[]>("/tenders").then(setTenders).catch((e) => setError(String(e)));
    apiFetch<{ tender: Tender; gateNo: number }[]>("/gate-queue").then(setGateQueue).catch(() => undefined);
    apiFetch<Array<{ name: string; expiresAt: string; earliestOpenClosing: string }>>("/vault-docs/expiry-watch")
      .then(setExpiryWatch)
      .catch(() => undefined);
  }, []);

  const myTenders = tenders.filter((t) => t.ownerId === user?.id && t.status === "active");
  const unclaimed = tenders.filter((t) => t.ownerId === null && t.status === "active");

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button className={`btn ${tab === "mine" ? "btn-primary" : ""}`} onClick={() => setTab("mine")}>
          My tenders
        </button>
        <button className={`btn ${tab === "gate-queue" ? "btn-primary" : ""}`} onClick={() => setTab("gate-queue")}>
          Gate queue ({gateQueue.length})
        </button>
        <button className={`btn ${tab === "expiry" ? "btn-primary" : ""}`} onClick={() => setTab("expiry")}>
          Expiry watch ({expiryWatch.length})
        </button>
      </div>

      {error && <div className="alert-box" style={{ marginBottom: 16 }}>{error}</div>}

      {tab === "mine" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>My tenders, sorted by closing date</h2>
            <TendersTable tenders={myTenders} />
          </div>
          {unclaimed.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>Unclaimed leads (stage 00, automated discovery)</h2>
              <TendersTable tenders={unclaimed} />
            </div>
          )}
        </div>
      )}

      {tab === "gate-queue" && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Everything waiting on a signature</h2>
          <table>
            <thead>
              <tr>
                <th>Tender</th>
                <th>Client</th>
                <th>Waiting on</th>
                <th>Closing</th>
              </tr>
            </thead>
            <tbody>
              {gateQueue.map(({ tender, gateNo }) => (
                <tr key={tender.id} className="row-link" onClick={() => (window.location.href = `/tenders/${tender.id}`)}>
                  <td>{tender.tenderNo}</td>
                  <td>{tender.client}</td>
                  <td style={{ fontWeight: 700, color: "var(--color-accent)" }}>Gate {gateNo}</td>
                  <td>{new Date(tender.closingAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {gateQueue.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>Nothing waiting.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "expiry" && (
        <div className="card">
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Vault documents expiring before an open closing date</h2>
          <div className="label" style={{ marginBottom: 10 }}>Should always be empty.</div>
          {expiryWatch.length === 0 ? (
            <div className="ok-box">All current Vault documents are valid past every open closing date.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Expires</th>
                  <th>Earliest open closing date</th>
                </tr>
              </thead>
              <tbody>
                {expiryWatch.map((d, i) => (
                  <tr key={i}>
                    <td>{d.name}</td>
                    <td style={{ color: "var(--alert-700)", fontWeight: 700 }}>{new Date(d.expiresAt).toLocaleDateString()}</td>
                    <td>{new Date(d.earliestOpenClosing).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
