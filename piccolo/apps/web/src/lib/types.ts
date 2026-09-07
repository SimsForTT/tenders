export type Tender = {
  id: string;
  tenderNo: string;
  client: string;
  title: string;
  sector: string | null;
  region: string | null;
  valueBand: string | null;
  closingAt: string;
  briefingAt: string | null;
  queryDeadlineAt: string | null;
  sourcePlatformId: string | null;
  stage: number;
  ownerId: string | null;
  status: "active" | "declined" | "closed";
  lastCompletenessCheckAt: string | null;
  lastCompletenessResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Returnable = {
  id: string;
  tenderId: string;
  reference: string;
  name: string;
  mandatory: boolean;
  sourcePage: number | null;
  satisfiedBy: string | null;
  docId: string | null;
  status: "missing" | "in_progress" | "satisfied" | "waived";
  verifiedBy: string | null;
  verifiedAt: string | null;
};

export type Gate = {
  id: string;
  tenderId: string;
  gateNo: 1 | 2 | 3 | 4;
  decision: "go" | "no_go" | "approved" | "declined";
  decidedBy: string;
  decidedAt: string;
  reason: string;
  evidenceUrl: string | null;
};

export type DocumentRow = {
  id: string;
  tenderId: string;
  kind: string;
  filePath: string;
  checksum: string;
  mimeType: string;
  ocrStatus: "pending" | "processing" | "done" | "failed";
  pages: number | null;
  uploadedBy: string;
  uploadedAt: string;
};

export type Extraction = {
  id: string;
  tenderId: string;
  documentId: string;
  result: unknown;
  status: "draft" | "verified";
  createdAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
};

export type VaultDoc = {
  id: string;
  category: string;
  name: string;
  filePath: string;
  issuedAt: string;
  expiresAt: string;
  issuingBody: string | null;
  current: boolean;
};

export type Platform = {
  id: string;
  name: string;
  url: string;
  tier: number;
  ingestMethod: "rss" | "email" | "scrape" | "manual";
  cadence: string;
  lastSuccessAt: string | null;
  lastResultCount: number | null;
  health: "ok" | "degraded" | "broken";
};

export type TenderDetail = {
  tender: Tender;
  returnables: Returnable[];
  gates: Gate[];
  documents: DocumentRow[];
  extractions: Extraction[];
  outcome: unknown;
};
