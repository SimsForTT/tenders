CREATE TYPE "public"."extraction_status" AS ENUM('draft', 'verified');--> statement-breakpoint
CREATE TYPE "public"."gate_decision" AS ENUM('go', 'no_go', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."ingest_method" AS ENUM('rss', 'email', 'scrape', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outcome_result" AS ENUM('awarded', 'lost', 'withdrawn', 'no_award');--> statement-breakpoint
CREATE TYPE "public"."platform_health" AS ENUM('ok', 'degraded', 'broken');--> statement-breakpoint
CREATE TYPE "public"."returnable_status" AS ENUM('missing', 'in_progress', 'satisfied', 'waived');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."tender_status" AS ENUM('active', 'declined', 'closed');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"kind" varchar(60) NOT NULL,
	"file_path" text NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"ocr_status" "ocr_status" DEFAULT 'pending' NOT NULL,
	"pages" integer,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"status" "extraction_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"gate_no" smallint NOT NULL,
	"decision" "gate_decision" NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"result" "outcome_result" NOT NULL,
	"our_price" numeric(14, 2),
	"winning_price" numeric(14, 2),
	"winner" varchar(300),
	"awarded_at" timestamp with time zone,
	"lessons" text,
	"debrief_by" uuid,
	CONSTRAINT "outcomes_tender_id_unique" UNIQUE("tender_id")
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"tier" smallint NOT NULL,
	"ingest_method" "ingest_method" NOT NULL,
	"cadence" varchar(60) NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_result_count" integer,
	"consecutive_empty_runs" integer DEFAULT 0 NOT NULL,
	"health" "platform_health" DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" varchar(500) NOT NULL,
	"unit" varchar(40) NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"priced_at" timestamp with time zone NOT NULL,
	"tender_id" uuid,
	"client" varchar(300),
	"region" varchar(60),
	"won" boolean,
	"escalation_index" numeric(8, 4),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "returnables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"reference" varchar(120) NOT NULL,
	"name" varchar(300) NOT NULL,
	"mandatory" boolean DEFAULT true NOT NULL,
	"source_page" integer,
	"satisfied_by" text,
	"doc_id" uuid,
	"status" "returnable_status" DEFAULT 'missing' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_no" varchar(120) NOT NULL,
	"client" varchar(300) NOT NULL,
	"title" varchar(500) NOT NULL,
	"sector" varchar(60),
	"region" varchar(60),
	"value_band" varchar(60),
	"closing_at" timestamp with time zone NOT NULL,
	"briefing_at" timestamp with time zone,
	"query_deadline_at" timestamp with time zone,
	"source_platform_id" uuid,
	"stage" smallint DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"status" "tender_status" DEFAULT 'active' NOT NULL,
	"last_completeness_check_at" timestamp with time zone,
	"last_completeness_result" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" "role" DEFAULT 'owner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(120) NOT NULL,
	"name" varchar(300) NOT NULL,
	"file_path" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issuing_body" varchar(300),
	"replaces_id" uuid,
	"current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gates" ADD CONSTRAINT "gates_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gates" ADD CONSTRAINT "gates_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_debrief_by_users_id_fk" FOREIGN KEY ("debrief_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_items" ADD CONSTRAINT "rate_items_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnables" ADD CONSTRAINT "returnables_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnables" ADD CONSTRAINT "returnables_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_source_platform_id_platforms_id_fk" FOREIGN KEY ("source_platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_tender_idx" ON "documents" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "extractions_tender_idx" ON "extractions" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "gates_tender_idx" ON "gates" USING btree ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gates_tender_gate_unique" ON "gates" USING btree ("tender_id","gate_no");--> statement-breakpoint
CREATE INDEX "rate_items_description_idx" ON "rate_items" USING btree ("description");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "returnables_tender_idx" ON "returnables" USING btree ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenders_tender_no_client_unique" ON "tenders" USING btree ("tender_no","client");--> statement-breakpoint
CREATE INDEX "tenders_closing_idx" ON "tenders" USING btree ("closing_at");--> statement-breakpoint
CREATE INDEX "tenders_owner_idx" ON "tenders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tenders_stage_idx" ON "tenders" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "vault_docs_expires_idx" ON "vault_docs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vault_docs_current_idx" ON "vault_docs" USING btree ("current");