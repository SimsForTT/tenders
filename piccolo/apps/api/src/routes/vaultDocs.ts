import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { createVaultDocSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getExpiryWatch } from "../services/expiryWatch.js";

export const vaultDocsRouter = Router();
vaultDocsRouter.use(requireAuth);

vaultDocsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select().from(schema.vaultDocs).where(eq(schema.vaultDocs.current, true));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// "Expiry Watch" Airtable view equivalent: vault documents expiring before
// any open tender's closing date. Also the query the nightly n8n workflow
// (workflows/n8n/vault-expiry-watcher.json) polls.
vaultDocsRouter.get("/expiry-watch", async (_req, res, next) => {
  try {
    res.json(await getExpiryWatch());
  } catch (err) {
    next(err);
  }
});

vaultDocsRouter.post("/", validate(createVaultDocSchema), async (req, res, next) => {
  try {
    const body = req.body as typeof createVaultDocSchema._output;

    if (body.replacesId) {
      await db.update(schema.vaultDocs).set({ current: false }).where(eq(schema.vaultDocs.id, body.replacesId));
    }

    const [doc] = await db
      .insert(schema.vaultDocs)
      .values({
        category: body.category,
        name: body.name,
        filePath: "", // set by the upload endpoint in a follow-up call; see routes/documents.ts
        issuedAt: new Date(body.issuedAt),
        expiresAt: new Date(body.expiresAt),
        issuingBody: body.issuingBody,
        replacesId: body.replacesId,
      })
      .returning();

    await writeAudit({ actorId: req.user!.id, action: "vault_doc_added", entityType: "vault_doc", entityId: doc!.id, ip: req.ip });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});
