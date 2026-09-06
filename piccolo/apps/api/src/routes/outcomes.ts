import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { createOutcomeSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../lib/errors.js";
import { isOwnerOrAdmin } from "../lib/authz.js";

export const outcomesRouter = Router();
outcomesRouter.use(requireAuth);

// Stage 15 "Track, debrief, feed library" - closes the feedback loop from
// artboard P2-01: outcome recorded -> Rate Library -> faster pricing next
// time. Recording an outcome never itself writes to rate_items; that stays
// a deliberate, separate POST to /rate-items so a person chooses what
// history is worth keeping.
outcomesRouter.post(
  "/tenders/:id/outcome",
  validate(idParamSchema, "params"),
  validate(createOutcomeSchema),
  async (req, res, next) => {
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id!));
      if (!tender) throw new NotFoundError("Tender not found");
      if (!isOwnerOrAdmin(req.user!, tender.ownerId)) {
        throw new ForbiddenError("Only the tender owner or an admin can record its outcome.");
      }

      const [existing] = await db.select().from(schema.outcomes).where(eq(schema.outcomes.tenderId, tender.id));
      if (existing) throw new ConflictError("Outcome already recorded for this tender");

      const body = req.body as typeof createOutcomeSchema._output;
      const [outcome] = await db
        .insert(schema.outcomes)
        .values({
          tenderId: tender.id,
          result: body.result,
          ourPrice: body.ourPrice?.toString(),
          winningPrice: body.winningPrice?.toString(),
          winner: body.winner,
          awardedAt: body.awardedAt ? new Date(body.awardedAt) : null,
          lessons: body.lessons,
          debriefBy: req.user!.id,
        })
        .returning();

      await db.update(schema.tenders).set({ status: "closed", stage: 15 }).where(eq(schema.tenders.id, tender.id));
      await writeAudit({ actorId: req.user!.id, action: "outcome_recorded", entityType: "tender", entityId: tender.id, ip: req.ip });

      res.status(201).json(outcome);
    } catch (err) {
      next(err);
    }
  },
);
