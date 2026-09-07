import { Router } from "express";
import { z } from "zod";
import { db, schema } from "@piccolo/db";
import { ilike } from "drizzle-orm";
import { createRateItemSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const rateItemsRouter = Router();
rateItemsRouter.use(requireAuth);

rateItemsRouter.post("/", validate(createRateItemSchema), async (req, res, next) => {
  try {
    const body = req.body as typeof createRateItemSchema._output;
    const [item] = await db
      .insert(schema.rateItems)
      .values({
        description: body.description,
        unit: body.unit,
        rate: body.rate.toString(),
        pricedAt: new Date(body.pricedAt),
        tenderId: body.tenderId,
        client: body.client,
        region: body.region,
        won: body.won,
        notes: body.notes,
      })
      .returning();
    await writeAudit({ actorId: req.user!.id, action: "rate_item_added", entityType: "rate_item", entityId: item!.id, ip: req.ip });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

const suggestQuerySchema = z.object({ q: z.string().trim().min(2).max(500) });

// Stage 07 "suggested rates from history" - a plain search over past
// priced items. Pricing and margin decisions stay entirely human; this
// only surfaces history, it never writes a price anywhere.
rateItemsRouter.get("/suggest", validate(suggestQuerySchema, "query"), async (req, res, next) => {
  try {
    const { q } = req.query as unknown as { q: string };
    const rows = await db
      .select()
      .from(schema.rateItems)
      .where(ilike(schema.rateItems.description, `%${q}%`))
      .limit(25);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
