import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { returnableUpdateSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { isOwnerOrAdmin } from "../lib/authz.js";

export const returnablesRouter = Router();
returnablesRouter.use(requireAuth);

returnablesRouter.get("/tenders/:id/returnables", validate(idParamSchema, "params"), async (req, res, next) => {
  try {
    const rows = await db.select().from(schema.returnables).where(eq(schema.returnables.tenderId, req.params.id!));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

returnablesRouter.patch(
  "/returnables/:id",
  validate(idParamSchema, "params"),
  validate(returnableUpdateSchema),
  async (req, res, next) => {
    try {
      const [existing] = await db.select().from(schema.returnables).where(eq(schema.returnables.id, req.params.id!));
      if (!existing) throw new NotFoundError("Returnable not found");

      // Without this, any authenticated account could mark another
      // tender's mandatory returnable "satisfied" and quietly defeat the
      // stage-13 completeness check, which trusts this table (see
      // SECURITY.md "broken access control fix").
      const [parentTender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, existing.tenderId));
      if (!parentTender || !isOwnerOrAdmin(req.user!, parentTender.ownerId)) {
        throw new ForbiddenError("Only the tender owner or an admin can update its returnables.");
      }

      const { status, satisfiedBy, docId } = req.body as typeof returnableUpdateSchema._output;
      const isVerification = status === "satisfied" && existing.status !== "satisfied";

      const [updated] = await db
        .update(schema.returnables)
        .set({
          status,
          satisfiedBy,
          docId,
          // "Owner verifies every line before work starts" - capture who
          // and when the first time a returnable is marked satisfied.
          verifiedBy: isVerification ? req.user!.id : existing.verifiedBy,
          verifiedAt: isVerification ? new Date() : existing.verifiedAt,
        })
        .where(eq(schema.returnables.id, existing.id))
        .returning();

      await writeAudit({
        actorId: req.user!.id,
        action: "returnable_updated",
        entityType: "returnable",
        entityId: existing.id,
        metadata: { status },
        ip: req.ip,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);
