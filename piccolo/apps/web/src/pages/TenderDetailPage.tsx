import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { TenderDetail, Returnable } from "../lib/types";
import { STAGES, GATE_NUMBERS, type GateNumber } from "@piccolo/shared";

function stageInfo(stage: number) {
  return STAGES.find((s) => s.code === stage);
}

function GatesPanel({ detail, onChanged }: { detail: TenderDetail; onChanged: () => void }) {
  const { user } = useAuth();
  const [gateNo, setGateNo] = useState<GateNumber>(1);
  const [decision, setDecision] = useState("go");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const decided = new Set(detail.gates.map((g) => g.gateNo));
  const isSelfOwner = user?.id === detail.tender.ownerId;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/tenders/${detail.tender.id}/gates`, {
        method: "POST",
        body: { gateNo, decision, reason },
      });
      setReason("");
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Gates</h2>
      <table style={{ marginBottom: 16 }}>
        <thead>
          <tr>
            <th>Gate</th>
            <th>Decision</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {GATE_NUMBERS.map((g) => {
            const row = detail.gates.find((r) => r.gateNo === g);
            return (
              <tr key={g}>
                <td>Gate {g}</td>
                <td style={{ fontWeight: 700, color: row ? "var(--ok)" : "var(--color-neutral-500)" }}>
                  {row ? row.decision : "pending"}
                </td>
                <td>{row?.reason ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        {gateNo === 4 && isSelfOwner && (
          <div className="alert-box" style={{ fontSize: 13 }}>
            Gate 4 needs an independent reviewer - the tender owner cannot sign their own two-person QA.
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <select value={gateNo} onChange={(e) => setGateNo(Number(e.target.value) as GateNumber)} style={{ width: 120 }}>
            {GATE_NUMBERS.map((g) => (
              <option key={g} value={g} disabled={decided.has(g)}>
                Gate {g}
              </option>
            ))}
          </select>
          <select value={decision} onChange={(e) => setDecision(e.target.value)} style={{ width: 160 }}>
            <option value="go">Go</option>
            <option value="no_go">No-go</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </div>
        <input required placeholder="Reason (required, becomes the audit record)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={submitting || decided.has(gateNo)}>
          Record decision
        </button>
      </form>
    </div>
  );
}

function ReturnablesPanel({ returnables, onChanged }: { returnables: Returnable[]; onChanged: () => void }) {
  async function updateStatus(r: Returnable, status: Returnable["status"]) {
    await apiFetch(`/returnables/${r.id}`, { method: "PATCH", body: { status } });
    onChanged();
  }
  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Returnables checklist</h2>
      <table>
        <thead>
          <tr>
            <th>Reference</th>
            <th>Name</th>
            <th>Mandatory</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {returnables.map((r) => (
            <tr key={r.id}>
              <td>{r.reference}</td>
              <td>{r.name}{r.sourcePage ? <span style={{ color: "var(--color-neutral-500)" }}> (p.{r.sourcePage})</span> : null}</td>
              <td>{r.mandatory ? "Yes" : "No"}</td>
              <td>
                <select value={r.status} onChange={(e) => updateStatus(r, e.target.value as Returnable["status"])}>
                  <option value="missing">Missing</option>
                  <option value="in_progress">In progress</option>
                  <option value="satisfied">Satisfied</option>
                  <option value="waived">Waived</option>
                </select>
              </td>
            </tr>
          ))}
          {returnables.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>
                None yet - upload the tender document to run extraction, or add manually.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsPanel({ detail, onChanged }: { detail: TenderDetail; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("tender_pack");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      await apiFetch(`/tenders/${detail.tender.id}/documents`, { method: "POST", body: form, isFormData: true });
      setFile(null);
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  }

  async function verify(extractionId: string) {
    await apiFetch(`/extractions/${extractionId}/verify`, { method: "POST" });
    onChanged();
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Documents &amp; extraction</h2>
      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Kind</th>
            <th>OCR</th>
            <th>Checksum</th>
            <th>Extraction</th>
          </tr>
        </thead>
        <tbody>
          {detail.documents.map((d) => {
            const extraction = detail.extractions.find((e) => e.documentId === d.id);
            return (
              <tr key={d.id}>
                <td>{d.kind}</td>
                <td>{d.ocrStatus}</td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{d.checksum.slice(0, 12)}...</td>
                <td>
                  {extraction ? (
                    extraction.status === "draft" ? (
                      <button className="btn" onClick={() => verify(extraction.id)}>
                        Mark verified
                      </button>
                    ) : (
                      <span style={{ color: "var(--ok)", fontWeight: 700 }}>Verified</span>
                    )
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
          {detail.documents.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "var(--color-neutral-700)" }}>No documents uploaded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <form onSubmit={upload} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 160 }}>
          <option value="tender_pack">Tender pack</option>
          <option value="boq">BOQ</option>
          <option value="returnable_form">Returnable form</option>
          <option value="signed_submission">Signed submission</option>
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} accept=".pdf,.png,.jpg,.jpeg,.tiff,.docx,.xlsx" />
        <button className="btn btn-primary" type="submit" disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>
      <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: 6 }}>
        Originals are stored unaltered with a checksum. Extraction output is always a draft until verified above.
      </div>
    </div>
  );
}

function CompletenessPanel({ detail, onChanged }: { detail: TenderDetail; onChanged: () => void }) {
  const [confirmations, setConfirmations] = useState({
    noBlankOrUpsidePages: false,
    signaturesPresent: false,
    boqTotalsMatch: false,
    fileRulesCompliant: false,
  });
  const [result, setResult] = useState<{ overallPass: boolean; checks: { label: string; pass: boolean; automated: boolean; detail: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<typeof result>(`/tenders/${detail.tender.id}/completeness-check`, {
        method: "POST",
        body: confirmations,
      });
      setResult(res);
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Stage 13, completeness check before upload</h2>
      <div className="label" style={{ marginBottom: 10 }}>Upload stays closed until every check clears.</div>
      {error && <div className="alert-box" style={{ fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <form onSubmit={run} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {([
          ["noBlankOrUpsidePages", "No blank page where a form should be, no page scanned upside down"],
          ["signaturesPresent", "Signature detected on every page flagged as requiring one"],
          ["boqTotalsMatch", "BOQ totals match the signed gate 3 figure"],
          ["fileRulesCompliant", "File format, size and naming comply with the portal rules"],
        ] as const).map(([key, label]) => (
          <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={confirmations[key]}
              onChange={(e) => setConfirmations({ ...confirmations, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start" }}>
          Run completeness check
        </button>
      </form>

      {result && (
        <div className={result.overallPass ? "ok-box" : "alert-box"}>
          <strong>{result.overallPass ? "Green report - all checks passed." : "Blocking list - not clear to submit."}</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {result.checks.filter((c) => !c.pass).map((c, i) => (
              <li key={i}>
                {c.label} {c.automated ? "" : "(confirm manually)"}
                <div style={{ fontSize: 12 }}>{c.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RateSuggestPanel() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; description: string; unit: string; rate: string; region: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setRows(await apiFetch(`/rate-items/suggest?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Stage 07, Rate Library</h2>
      <div className="label" style={{ marginBottom: 10 }}>History only. Pricing and margin stay the owner's call.</div>
      <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input placeholder="e.g. asphalt paving" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Description</th><th>Unit</th><th>Rate</th><th>Region</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.description}</td><td>{r.unit}</td><td>{r.rate}</td><td>{r.region ?? "-"}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OutcomePanel({ detail, onChanged }: { detail: TenderDetail; onChanged: () => void }) {
  const [result, setResult] = useState("awarded");
  const [ourPrice, setOurPrice] = useState("");
  const [winningPrice, setWinningPrice] = useState("");
  const [winner, setWinner] = useState("");
  const [lessons, setLessons] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (detail.outcome) {
    return (
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Stage 15, outcome</h2>
        <div className="ok-box">Outcome recorded. The feedback loop to the Rate Library is closed for this tender.</div>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(`/tenders/${detail.tender.id}/outcome`, {
        method: "POST",
        body: {
          result,
          ourPrice: ourPrice || undefined,
          winningPrice: winningPrice || undefined,
          winner: winner || undefined,
          lessons: lessons || undefined,
        },
      });
      onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Stage 15, record outcome</h2>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {error && <div className="alert-box" style={{ fontSize: 13 }}>{error}</div>}
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="awarded">Awarded</option>
          <option value="lost">Lost</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="no_award">No award</option>
        </select>
        <input placeholder="Our price" value={ourPrice} onChange={(e) => setOurPrice(e.target.value)} />
        <input placeholder="Winning price" value={winningPrice} onChange={(e) => setWinningPrice(e.target.value)} />
        <input placeholder="Winner" value={winner} onChange={(e) => setWinner(e.target.value)} />
        <textarea placeholder="Lessons" value={lessons} onChange={(e) => setLessons(e.target.value)} rows={3} />
        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start" }}>
          Save outcome
        </button>
      </form>
    </div>
  );
}

export function TenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    apiFetch<TenderDetail>(`/tenders/${id}`).then(setDetail).catch((e) => setError(String(e)));
  }
  useEffect(load, [id]);

  async function claim() {
    if (!id || !user) return;
    await apiFetch(`/tenders/${id}/claim`, { method: "PATCH", body: { ownerId: user.id } });
    load();
  }

  async function advanceStage() {
    if (!detail) return;
    try {
      await apiFetch(`/tenders/${detail.tender.id}/stage`, { method: "PATCH", body: { stage: detail.tender.stage + 1 } });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  if (error) return <div className="alert-box">{error}</div>;
  if (!detail) return <div>Loading...</div>;

  const { tender } = detail;
  const stage = stageInfo(tender.stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 24 }}>{tender.tenderNo}</h1>
            <div style={{ fontSize: 16 }}>{tender.title}</div>
            <div style={{ color: "var(--color-neutral-700)" }}>{tender.client}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="label">Stage {tender.stage}{stage?.gate ? ` (Gate ${stage.gate})` : ""}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-accent)" }}>{stage?.label}</div>
            <div style={{ fontSize: 13 }}>Closing {new Date(tender.closingAt).toLocaleString()}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {!tender.ownerId && (
            <button className="btn btn-primary" onClick={claim}>
              Claim this tender
            </button>
          )}
          {tender.ownerId && tender.stage < 15 && (
            <button className="btn" onClick={advanceStage}>
              Advance to next stage
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <GatesPanel detail={detail} onChanged={load} />
        <ReturnablesPanel returnables={detail.returnables} onChanged={load} />
      </div>

      <DocumentsPanel detail={detail} onChanged={load} />
      <CompletenessPanel detail={detail} onChanged={load} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <RateSuggestPanel />
        <OutcomePanel detail={detail} onChanged={load} />
      </div>
    </div>
  );
}
