import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { createPlatformSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const platformsRouter = Router();
platformsRouter.use(requireAuth);

platformsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await db.select().from(schema.platforms));
  } catch (err) {
    next(err);
  }
});

// Adding a platform is admin-only: it's the point where someone should
// have already confirmed the target site's terms allow automated polling
// (see workflows/README.md). The API doesn't and can't verify that for you.
platformsRouter.post("/", requireRole("admin"), validate(createPlatformSchema), async (req, res, next) => {
  try {
    const [platform] = await db.insert(schema.platforms).values(req.body).returning();
    await writeAudit({ actorId: req.user!.id, action: "platform_added", entityType: "platform", entityId: platform!.id, ip: req.ip });
    res.status(201).json(platform);
  } catch (err) {
    next(err);
  }
});
