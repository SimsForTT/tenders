export const GATE_NUMBERS = [1, 2, 3, 4] as const;
export type GateNumber = (typeof GATE_NUMBERS)[number];

export type StageCode = number;

export interface StageDef {
  code: StageCode;
  key: string;
  label: string;
  continuous?: boolean;
  conditional?: boolean;
  lane?: "A" | "B" | "C";
  gate?: GateNumber;
}

/**
 * The Phase 1 master pipeline, stage 00 through 15, as drawn in
 * `project/Tender Pipeline Phase 1.dc.html` (artboard "01 Master pipeline").
 * Stage numbers are the contract between the tracker UI, the gates table,
 * and every n8n workflow that writes back to Piccolo - do not renumber.
 */
export const STAGES: readonly StageDef[] = [
  { code: 0, key: "sources_watchlist", label: "Sources & watchlist", continuous: true },
  { code: 1, key: "capture_log", label: "Capture & log" },
  { code: 2, key: "bid_no_bid", label: "Bid / no-bid", gate: 1 },
  { code: 3, key: "register_obtain_docs", label: "Register & obtain docs" },
  { code: 4, key: "deconstruct_document", label: "Deconstruct the document" },
  { code: 5, key: "compliance_pack_pull", label: "Compliance pack pull", lane: "A" },
  { code: 6, key: "site_visit", label: "Site visit / clarifications", conditional: true },
  { code: 7, key: "pricing_boq", label: "Pricing & BOQ", lane: "B" },
  { code: 8, key: "technical_submissions", label: "Technical submissions", lane: "C" },
  { code: 9, key: "compliance_complete", label: "Compliance complete", gate: 2 },
  { code: 10, key: "assemble_returnables", label: "Assemble returnables" },
  { code: 11, key: "price_sign_off", label: "Price sign-off", gate: 3 },
  { code: 12, key: "two_person_qa", label: "Two-person QA", gate: 4 },
  { code: 13, key: "submit", label: "Submit" },
  { code: 14, key: "proof_register", label: "Proof & register" },
  { code: 15, key: "track_debrief_feed_library", label: "Track, debrief, feed library" },
];

export const GATE_STAGE: Record<GateNumber, StageCode> = {
  1: 2,
  2: 9,
  3: 11,
  4: 12,
};

export function stageByCode(code: number): StageDef | undefined {
  return STAGES.find((s) => s.code === code);
}
