import path from "node:path";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { extractRawText, extractFields } from "@piccolo/extraction";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";

/**
 * Artboard P2-03 steps 3-4: OCR then Claude extraction. Runs after the
 * upload response has already gone out (see routes/documents.ts). Result
 * is always written with status "draft" - only a human, via
 * routes/extractions.ts verify endpoint, can move it to "verified".
 */
export async function runExtraction(documentId: string): Promise<void> {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) return;

  await db.update(schema.documents).set({ ocrStatus: "processing" }).where(eq(schema.documents.id, doc.id));

  try {
    const fullPath = path.join(env.DOCUMENT_STORAGE_PATH, doc.filePath);
    const raw = await extractRawText(fullPath, doc.mimeType);

    await db
      .update(schema.documents)
      .set({ ocrStatus: "done", pages: raw.pages.length })
      .where(eq(schema.documents.id, doc.id));

    if (!env.ANTHROPIC_API_KEY) {
      logger.warn({ documentId }, "ANTHROPIC_API_KEY not set, skipping Claude extraction step");
      return;
    }

    const result = await extractFields(raw.pages, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    });

    await db.insert(schema.extractions).values({
      tenderId: doc.tenderId,
      documentId: doc.id,
      result,
      status: "draft",
    });

    // Draft the returnables checklist straight from the extraction, as
    // artboard P2-03 describes - still status "missing" until the owner
    // works through it, and the extraction itself still needs verifying.
    if (result.returnables.length > 0) {
      await db.insert(schema.returnables).values(
        result.returnables.map((r) => ({
          tenderId: doc.tenderId,
          reference: r.reference.value ?? "unspecified",
          name: r.name.value ?? "unspecified",
          mandatory: r.mandatory.value ?? true,
          sourcePage: r.reference.source_page ?? undefined,
          status: "missing" as const,
        })),
      );
    }
  } catch (err) {
    await db.update(schema.documents).set({ ocrStatus: "failed" }).where(eq(schema.documents.id, doc.id));
    throw err;
  }
}
