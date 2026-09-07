import { z } from "zod";

// Shared request/response validation. Keep these in lockstep with
// packages/db/src/schema.ts - this file is the contract the API enforces
// at its boundary, the DB schema is what Postgres enforces underneath it.

export const SECTORS = [
  "Private mining",
  "National / provincial government",
  "Municipalities",
  "Parastatals / SOEs",
  "Private industrial",
  "Main contractors (subcontract)",
] as const;

export const REGIONS = ["Gauteng", "North West", "Northern Cape", "Eastern Cape"] as const;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

// OWASP-aligned password policy: length over complexity theatre, checked
// against a small denylist server-side (see apps/api/src/lib/password.ts).
export const passwordSchema = z.string().min(12).max(256);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const createTenderSchema = z.object({
  tenderNo: z.string().trim().min(1).max(120),
  client: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(500),
  sector: z.enum(SECTORS),
  region: z.enum(REGIONS),
  valueBand: z.string().trim().max(60).optional(),
  closingAt: z.string().datetime({ offset: true }),
  briefingAt: z.string().datetime({ offset: true }).optional(),
  queryDeadlineAt: z.string().datetime({ offset: true }).optional(),
  sourcePlatformId: z.string().uuid().optional(),
  ownerId: z.string().uuid(),
});

// Used by the automated discovery endpoint (n8n -> POST /internal/leads).
// No ownerId: capture stays a deliberate human act (see createTenderSchema
// and PATCH /tenders/:id/claim).
export const createLeadSchema = z.object({
  tenderNo: z.string().trim().min(1).max(120),
  client: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(500),
  sector: z.enum(SECTORS).optional(),
  region: z.enum(REGIONS).optional(),
  closingAt: z.string().datetime({ offset: true }),
  sourcePlatformId: z.string().uuid(),
});

export const claimTenderSchema = z.object({
  ownerId: z.string().uuid(),
});

export const updateTenderStageSchema = z.object({
  stage: z.number().int().min(0).max(15),
});

export const gateDecisionSchema = z.object({
  gateNo: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  decision: z.enum(["go", "no_go", "approved", "declined"]),
  reason: z.string().trim().min(1).max(4000),
  evidenceUrl: z.string().url().max(2000).optional(),
});

export const returnableUpdateSchema = z.object({
  status: z.enum(["missing", "in_progress", "satisfied", "waived"]),
  satisfiedBy: z.string().trim().max(500).optional(),
  docId: z.string().uuid().optional(),
});

export const createVaultDocSchema = z.object({
  category: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(300),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  issuingBody: z.string().trim().max(300).optional(),
  replacesId: z.string().uuid().optional(),
});

export const createRateItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(40),
  rate: z.coerce.number().nonnegative(),
  pricedAt: z.string().datetime({ offset: true }),
  tenderId: z.string().uuid().optional(),
  client: z.string().trim().max(300).optional(),
  region: z.enum(REGIONS).optional(),
  won: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const createOutcomeSchema = z.object({
  result: z.enum(["awarded", "lost", "withdrawn", "no_award"]),
  ourPrice: z.coerce.number().nonnegative().optional(),
  winningPrice: z.coerce.number().nonnegative().optional(),
  winner: z.string().trim().max(300).optional(),
  awardedAt: z.string().datetime({ offset: true }).optional(),
  lessons: z.string().trim().max(4000).optional(),
});

export const createPlatformSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
  tier: z.number().int().min(1).max(6),
  ingestMethod: z.enum(["rss", "email", "scrape", "manual"]),
  cadence: z.string().trim().max(60),
});

// Stage 13 completeness scan (artboard P2-05). Checks 01, 04 and 07 are
// computed from the database; 02, 03, 05 and 06 need a human eye (blank
// page detection, signature detection and BOQ reconciliation are real
// computer-vision/finance problems, not something this system fakes
// automating) - the owner confirms them explicitly and that confirmation
// is what gets audit-logged, not a false "automated" pass.
export const completenessCheckSchema = z.object({
  noBlankOrUpsidePages: z.boolean(),
  signaturesPresent: z.boolean(),
  boqTotalsMatch: z.boolean(),
  fileRulesCompliant: z.boolean(),
});

// UUID path params, reused across routes.
export const idParamSchema = z.object({ id: z.string().uuid() });
