import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq, and } from "drizzle-orm";
import { gateDecisionSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors.js";

export const gatesRouter = Router();
gatesRouter.use(requireAuth);

// One gate decision per (tenderId, gateNo), ever - the unique index in
// the schema backs this up at the DB layer too, this is just the
// friendlier error path. To redo a decision, record it as a new gate row
// is deliberately unsupported: fix mistakes by talking to an admin, who
// can delete the row directly against the audit-logged DB, not via API.
gatesRouter.post(
  "/tenders/:id/gates",
  validate(idParamSchema, "params"),
  validate(gateDecisionSchema),
  async (req, res, next) => {
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id));
      if (!tender) throw new NotFoundError("Tender not found");

      const { gateNo, decision, reason, evidenceUrl } = req.body as typeof gateDecisionSchema._output;

      // Design's "Two-person QA" gate: the reviewer must not be the
      // tender's own owner.
      if (gateNo === 4 && req.user!.id === tender.ownerId) {
        throw new ForbiddenError("Gate 4 requires sign-off from someone other than the tender owner.");
      }

      const [existing] = await db
        .select()
        .from(schema.gates)
        .where(and(eq(schema.gates.tenderId, tender.id), eq(schema.gates.gateNo, gateNo)));
      if (existing) throw new ConflictError(`Gate ${gateNo} has already been decided for this tender.`);

      const [gate] = await db
        .insert(schema.gates)
        .values({
          tenderId: tender.id,
          gateNo,
          decision,
          decidedBy: req.user!.id,
          reason,
          evidenceUrl,
        })
        .returning();

      if (decision === "no_go" || decision === "declined") {
        await db.update(schema.tenders).set({ status: "declined" }).where(eq(schema.tenders.id, tender.id));
      }

      await writeAudit({
        actorId: req.user!.id,
        action: "gate_decided",
        entityType: "tender",
        entityId: tender.id,
        metadata: { gateNo, decision },
        ip: req.ip,
      });

      res.status(201).json(gate);
    } catch (err) {
      next(err);
    }
  },
);

gatesRouter.get("/gate-queue", async (_req, res, next) => {
  try {
    // Everything sitting at a gate stage without a matching decided gate
    // row yet - "Gate Queue" per artboard P2-04's Airtable views panel.
    const tenders = await db.select().from(schema.tenders).where(eq(schema.tenders.status, "active"));
    const gates = await db.select().from(schema.gates);
    const gateStages: Record<number, number> = { 2: 1, 9: 2, 11: 3, 12: 4 };

    const queue = tenders
      .filter((t) => t.stage in gateStages)
      .map((t) => ({ tender: t, gateNo: gateStages[t.stage] }))
      .filter(({ tender, gateNo }) => !gates.some((g) => g.tenderId === tender.id && g.gateNo === gateNo));

    res.json(queue);
  } catch (err) {
    next(err);
  }
});
