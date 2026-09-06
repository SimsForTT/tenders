import { Router } from "express";
import { z } from "zod";
import { db, schema } from "@piccolo/db";
import { eq, and } from "drizzle-orm";
import { createLeadSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireInternalToken } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { env } from "../env.js";
import { getExpiryWatch } from "../services/expiryWatch.js";
import { logger } from "../lib/logger.js";

/**
 * Everything under here is reached only by n8n workflows (see
 * workflows/n8n/*.json), authenticated with a single shared bearer-style
 * token (X-Internal-Token) rather than a user JWT. Keep this router small
 * and paranoid: no route here should do anything a compromised n8n
 * instance shouldn't be trusted to do alone (it can create draft leads
 * and report platform health; it can never touch pricing, gates,
 * submissions, or another tender's data).
 */
export const internalRouter = Router();
internalRouter.use(requireInternalToken(env.PICCOLO_API_INTERNAL_TOKEN));

// Stage 00/01: automated discovery creates an unowned, stage-0 lead.
// Dedupe is a hash of tender number + client, enforced by the DB's unique
// index - this endpoint is safe to call repeatedly for the same tender.
internalRouter.post("/leads", validate(createLeadSchema), async (req, res, next) => {
  try {
    const body = req.body as typeof createLeadSchema._output;
    const [platform] = await db.select().from(schema.platforms).where(eq(schema.platforms.id, body.sourcePlatformId));
    if (!platform) return res.status(404).json({ error: "unknown_platform" });

    const [existing] = await db
      .select()
      .from(schema.tenders)
      .where(and(eq(schema.tenders.tenderNo, body.tenderNo), eq(schema.tenders.client, body.client)));

    if (existing) {
      return res.status(200).json({ created: false, tender: existing });
    }

    const [tender] = await db
      .insert(schema.tenders)
      .values({
        tenderNo: body.tenderNo,
        client: body.client,
        title: body.title,
        sector: body.sector,
        region: body.region,
        closingAt: new Date(body.closingAt),
        sourcePlatformId: body.sourcePlatformId,
        stage: 0,
        status: "active",
      })
      .returning();

    await writeAudit({
      actorId: null,
      action: "lead_discovered",
      entityType: "tender",
      entityId: tender!.id,
      metadata: { platform: platform.name },
    });
    res.status(201).json({ created: true, tender });
  } catch (err) {
    next(err);
  }
});

const healthReportSchema = z.object({
  resultCount: z.number().int().min(0),
  success: z.boolean(),
});

// "The failure that matters" (artboard P2-02): two consecutive empty runs
// on a platform that has succeeded before flips it to "broken" so the
// tracker surfaces it instead of silently missing tenders.
internalRouter.post(
  "/platforms/:id/health",
  validate(z.object({ id: z.string().uuid() }), "params"),
  validate(healthReportSchema),
  async (req, res, next) => {
    try {
      const [platform] = await db.select().from(schema.platforms).where(eq(schema.platforms.id, req.params.id));
      if (!platform) return res.status(404).json({ error: "unknown_platform" });

      const { resultCount, success } = req.body as z.infer<typeof healthReportSchema>;

      if (!success) {
        await db
          .update(schema.platforms)
          .set({ health: "broken" })
          .where(eq(schema.platforms.id, platform.id));
        logger.warn({ platform: platform.name }, "platform ingestion run failed");
        return res.status(204).end();
      }

      const consecutiveEmptyRuns = resultCount === 0 ? platform.consecutiveEmptyRuns + 1 : 0;
      const hasHistory = platform.lastResultCount !== null && platform.lastResultCount > 0;
      const health = hasHistory && consecutiveEmptyRuns >= 2 ? "broken" : "ok";

      await db
        .update(schema.platforms)
        .set({
          lastSuccessAt: new Date(),
          lastResultCount: resultCount,
          consecutiveEmptyRuns,
          health,
        })
        .where(eq(schema.platforms.id, platform.id));

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

internalRouter.get("/vault-expiry", async (_req, res, next) => {
  try {
    res.json(await getExpiryWatch());
  } catch (err) {
    next(err);
  }
});
