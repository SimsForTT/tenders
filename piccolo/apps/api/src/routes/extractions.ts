import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

export const extractionsRouter = Router();
extractionsRouter.use(requireAuth);

extractionsRouter.get("/tenders/:id/extractions", validate(idParamSchema, "params"), async (req, res, next) => {
  try {
    const rows = await db.select().from(schema.extractions).where(eq(schema.extractions.tenderId, req.params.id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// "Owner verifies line by line against the source page. Nothing proceeds
// on unverified extraction." This is the endpoint that makes that a fact
// about the system, not just a house rule: see
// services/stageTransition.ts, which blocks leaving stage 04 while any
// extraction for the tender is still "draft".
extractionsRouter.post("/extractions/:id/verify", validate(idParamSchema, "params"), async (req, res, next) => {
  try {
    const [extraction] = await db.select().from(schema.extractions).where(eq(schema.extractions.id, req.params.id));
    if (!extraction) throw new NotFoundError("Extraction not found");

    const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, extraction.tenderId));
    if (!tender) throw new NotFoundError("Tender not found");
    if (req.user!.role !== "admin" && req.user!.id !== tender.ownerId) {
      throw new ForbiddenError("Only the tender owner can verify its extraction.");
    }

    const [updated] = await db
      .update(schema.extractions)
      .set({ status: "verified", verifiedBy: req.user!.id, verifiedAt: new Date() })
      .where(eq(schema.extractions.id, extraction.id))
      .returning();

    await writeAudit({
      actorId: req.user!.id,
      action: "extraction_verified",
      entityType: "extraction",
      entityId: extraction.id,
      metadata: { tenderId: tender.id },
      ip: req.ip,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
