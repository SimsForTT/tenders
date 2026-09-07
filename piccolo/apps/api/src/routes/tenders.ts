import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq, asc } from "drizzle-orm";
import { createTenderSchema, claimTenderSchema, updateTenderStageSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError } from "../lib/errors.js";
import { assertStageAdvanceAllowed } from "../services/stageTransition.js";
import { isOwnerOrAdmin } from "../lib/authz.js";

export const tendersRouter = Router();
tendersRouter.use(requireAuth);

// Read access is team-wide by design: gate 4 requires an independent
// reviewer who is, by definition, not the tender's owner, so everyone
// needs visibility into everyone else's pipeline. Only the owner or an
// admin can mutate a given tender - see the ownership check below.
tendersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select().from(schema.tenders).orderBy(asc(schema.tenders.closingAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tendersRouter.get("/:id", validate(idParamSchema, "params"), async (req, res, next) => {
  try {
    const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id!));
    if (!tender) throw new NotFoundError("Tender not found");
    const [returnables, gates, documents, extractions, outcome] = await Promise.all([
      db.select().from(schema.returnables).where(eq(schema.returnables.tenderId, tender.id)),
      db.select().from(schema.gates).where(eq(schema.gates.tenderId, tender.id)),
      db.select().from(schema.documents).where(eq(schema.documents.tenderId, tender.id)),
      db.select().from(schema.extractions).where(eq(schema.extractions.tenderId, tender.id)),
      db.select().from(schema.outcomes).where(eq(schema.outcomes.tenderId, tender.id)),
    ]);
    res.json({ tender, returnables, gates, documents, extractions, outcome: outcome[0] ?? null });
  } catch (err) {
    next(err);
  }
});

// Stage 01 "Capture & log": owner assignment stays a deliberate human
// action, never automatic - even when an n8n workflow discovers the
// tender, a person still has to claim it here (see workflows/README.md).
tendersRouter.post("/", validate(createTenderSchema), async (req, res, next) => {
  try {
    const body = req.body as typeof createTenderSchema._output;
    const [tender] = await db
      .insert(schema.tenders)
      .values({
        tenderNo: body.tenderNo,
        client: body.client,
        title: body.title,
        sector: body.sector,
        region: body.region,
        valueBand: body.valueBand,
        closingAt: new Date(body.closingAt),
        briefingAt: body.briefingAt ? new Date(body.briefingAt) : null,
        queryDeadlineAt: body.queryDeadlineAt ? new Date(body.queryDeadlineAt) : null,
        sourcePlatformId: body.sourcePlatformId,
        ownerId: body.ownerId,
        stage: 1,
      })
      .returning();

    await writeAudit({ actorId: req.user!.id, action: "tender_captured", entityType: "tender", entityId: tender!.id, ip: req.ip });
    res.status(201).json(tender);
  } catch (err) {
    next(err);
  }
});

// Stage 00 -> 01: a person claims an automated lead. "One tender, one
// owner" means you can only claim for yourself unless you're an admin
// assigning someone else.
tendersRouter.patch(
  "/:id/claim",
  validate(idParamSchema, "params"),
  validate(claimTenderSchema),
  async (req, res, next) => {
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id!));
      if (!tender) throw new NotFoundError("Tender not found");
      if (tender.ownerId) return res.status(409).json({ error: "already_claimed" });

      const { ownerId } = req.body as { ownerId: string };
      if (req.user!.role !== "admin" && ownerId !== req.user!.id) {
        return res.status(403).json({ error: "can_only_claim_for_self" });
      }

      const [updated] = await db
        .update(schema.tenders)
        .set({ ownerId, stage: 1, updatedAt: new Date() })
        .where(eq(schema.tenders.id, tender.id))
        .returning();

      await writeAudit({ actorId: req.user!.id, action: "tender_claimed", entityType: "tender", entityId: tender.id, ip: req.ip });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

tendersRouter.patch(
  "/:id/stage",
  validate(idParamSchema, "params"),
  validate(updateTenderStageSchema),
  async (req, res, next) => {
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id!));
      if (!tender) throw new NotFoundError("Tender not found");
      if (!isOwnerOrAdmin(req.user!, tender.ownerId)) {
        return res.status(403).json({ error: "not_tender_owner" });
      }

      const { stage } = req.body as { stage: number };
      await assertStageAdvanceAllowed(tender.id, tender.stage, stage);

      const [updated] = await db
        .update(schema.tenders)
        .set({ stage, updatedAt: new Date() })
        .where(eq(schema.tenders.id, tender.id))
        .returning();

      await writeAudit({
        actorId: req.user!.id,
        action: "stage_changed",
        entityType: "tender",
        entityId: tender.id,
        metadata: { from: tender.stage, to: stage },
        ip: req.ip,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);
