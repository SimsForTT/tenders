import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  smallint,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- enums --------------------------------------------------------------

export const roleEnum = pgEnum("role", ["owner", "admin"]);
export const ingestMethodEnum = pgEnum("ingest_method", ["rss", "email", "scrape", "manual"]);
export const platformHealthEnum = pgEnum("platform_health", ["ok", "degraded", "broken"]);
export const returnableStatusEnum = pgEnum("returnable_status", [
  "missing",
  "in_progress",
  "satisfied",
  "waived",
]);
export const gateDecisionEnum = pgEnum("gate_decision", ["go", "no_go", "approved", "declined"]);
export const outcomeResultEnum = pgEnum("outcome_result", [
  "awarded",
  "lost",
  "withdrawn",
  "no_award",
]);
export const ocrStatusEnum = pgEnum("ocr_status", ["pending", "processing", "done", "failed"]);
export const extractionStatusEnum = pgEnum("extraction_status", ["draft", "verified"]);
export const tenderStatusEnum = pgEnum("tender_status", ["active", "declined", "closed"]);

// --- security / identity --------------------------------------------------
// Passwords are argon2id hashes (see apps/api/src/lib/password.ts), never
// plaintext, never reversible. Login throttling fields live on the row so
// lockout survives process restarts.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  role: roleEnum("role").notNull().default("owner"),
  isActive: boolean("is_active").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
}));

// Refresh tokens are stored as a SHA-256 hash, never the raw token, so a DB
// read alone can't be replayed as a session. Rotated on every use.
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("refresh_tokens_user_idx").on(t.userId),
}));

// --- discovery layer (artboard P2-01/02) ---------------------------------

export const platforms = pgTable("platforms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  url: text("url").notNull(),
  tier: smallint("tier").notNull(),
  ingestMethod: ingestMethodEnum("ingest_method").notNull(),
  cadence: varchar("cadence", { length: 60 }).notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastResultCount: integer("last_result_count"),
  consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
  health: platformHealthEnum("health").notNull().default("ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- the spine (artboard P2-04) ------------------------------------------

export const tenders = pgTable("tenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderNo: varchar("tender_no", { length: 120 }).notNull(),
  client: varchar("client", { length: 300 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  // Nullable: an automated lead may not carry a confident sector/region
  // yet - the human capture step (POST /tenders or PATCH .../claim) fills
  // these in when a person takes ownership.
  sector: varchar("sector", { length: 60 }),
  region: varchar("region", { length: 60 }),
  valueBand: varchar("value_band", { length: 60 }),
  closingAt: timestamp("closing_at", { withTimezone: true }).notNull(),
  briefingAt: timestamp("briefing_at", { withTimezone: true }),
  queryDeadlineAt: timestamp("query_deadline_at", { withTimezone: true }),
  sourcePlatformId: uuid("source_platform_id").references(() => platforms.id),
  stage: smallint("stage").notNull().default(0),
  // Nullable: an automated discovery lead lands at stage 0 with no owner.
  // Capturing it at stage 1 (POST /tenders, or PATCH /tenders/:id/claim)
  // is the deliberate human act that assigns "one tender, one owner".
  ownerId: uuid("owner_id").references(() => users.id),
  status: tenderStatusEnum("status").notNull().default("active"),
  // Set only by the stage-13 completeness scan (routes/completeness.ts).
  // Advancing past stage 13 requires lastCompletenessResult = 'pass'.
  lastCompletenessCheckAt: timestamp("last_completeness_check_at", { withTimezone: true }),
  lastCompletenessResult: varchar("last_completeness_result", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenderNoUnique: uniqueIndex("tenders_tender_no_client_unique").on(t.tenderNo, t.client),
  closingIdx: index("tenders_closing_idx").on(t.closingAt),
  ownerIdx: index("tenders_owner_idx").on(t.ownerId),
  stageIdx: index("tenders_stage_idx").on(t.stage),
}));

export const returnables = pgTable("returnables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }),
  reference: varchar("reference", { length: 120 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  mandatory: boolean("mandatory").notNull().default(true),
  sourcePage: integer("source_page"),
  satisfiedBy: text("satisfied_by"),
  docId: uuid("doc_id"),
  status: returnableStatusEnum("status").notNull().default("missing"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => ({
  tenderIdx: index("returnables_tender_idx").on(t.tenderId),
}));

// vault_docs holds no tenderId - it is company-wide, matched against every
// open closing date by the expiry watcher (build sequence step 03).
export const vaultDocs = pgTable("vault_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: varchar("category", { length: 120 }).notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  filePath: text("file_path").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  issuingBody: varchar("issuing_body", { length: 300 }),
  replacesId: uuid("replaces_id"),
  current: boolean("current").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  expiresIdx: index("vault_docs_expires_idx").on(t.expiresAt),
  currentIdx: index("vault_docs_current_idx").on(t.current),
}));

export const rateItems = pgTable("rate_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  description: varchar("description", { length: 500 }).notNull(),
  unit: varchar("unit", { length: 40 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  pricedAt: timestamp("priced_at", { withTimezone: true }).notNull(),
  tenderId: uuid("tender_id").references(() => tenders.id),
  client: varchar("client", { length: 300 }),
  region: varchar("region", { length: 60 }),
  won: boolean("won"),
  escalationIndex: numeric("escalation_index", { precision: 8, scale: 4 }),
  notes: text("notes"),
}, (t) => ({
  descriptionIdx: index("rate_items_description_idx").on(t.description),
}));

// Every uploaded file gets a sha256 checksum computed server-side at
// upload time (apps/api/src/routes/documents.ts) so a later swap of the
// bytes on disk is detectable - the design's "source documents are stored
// unaltered" rule made checkable, not just declared.
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 60 }).notNull(),
  filePath: text("file_path").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  // Detected from file bytes at upload time (see routes/documents.ts),
  // never trusted from the client - reused by the extraction pipeline so
  // it never has to re-sniff, and never has to trust a client either.
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  ocrStatus: ocrStatusEnum("ocr_status").notNull().default("pending"),
  pages: integer("pages"),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenderIdx: index("documents_tender_idx").on(t.tenderId),
}));

// Extraction drafts. Never authoritative on their own - a tender cannot
// leave stage 04 while its extraction status is "draft" (enforced in
// apps/api/src/routes/tenders.ts, not just in the UI).
export const extractions = pgTable("extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  result: jsonb("result").notNull(),
  status: extractionStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => ({
  tenderIdx: index("extractions_tender_idx").on(t.tenderId),
}));

// The audit trail. A stage change without a matching gate row is a bug,
// not a shortcut - enforced in the gates route, not left to convention.
export const gates = pgTable("gates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }),
  gateNo: smallint("gate_no").notNull(),
  decision: gateDecisionEnum("decision").notNull(),
  decidedBy: uuid("decided_by").notNull().references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull(),
  evidenceUrl: text("evidence_url"),
}, (t) => ({
  tenderIdx: index("gates_tender_idx").on(t.tenderId),
  tenderGateUnique: uniqueIndex("gates_tender_gate_unique").on(t.tenderId, t.gateNo),
}));

export const outcomes = pgTable("outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id").notNull().references(() => tenders.id, { onDelete: "cascade" }).unique(),
  result: outcomeResultEnum("result").notNull(),
  ourPrice: numeric("our_price", { precision: 14, scale: 2 }),
  winningPrice: numeric("winning_price", { precision: 14, scale: 2 }),
  winner: varchar("winner", { length: 300 }),
  awardedAt: timestamp("awarded_at", { withTimezone: true }),
  lessons: text("lessons"),
  debriefBy: uuid("debrief_by").references(() => users.id),
});

// Append-only. No update/delete route is ever wired to this table -
// see SECURITY.md "audit log integrity".
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index("audit_log_entity_idx").on(t.entityType, t.entityId),
  createdIdx: index("audit_log_created_idx").on(t.createdAt),
}));
