import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { writeAudit } from "../lib/audit.js";
import { sha256File } from "../lib/checksum.js";
import { env } from "../env.js";
import { AppError, NotFoundError, ForbiddenError } from "../lib/errors.js";
import { isOwnerOrAdmin } from "../lib/authz.js";
import { runExtraction } from "../services/runExtraction.js";
import { logger } from "../lib/logger.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// Allow-list, checked against the file's actual bytes (see
// fileTypeFromFile below), never the client-supplied filename or
// Content-Type header - both are trivially spoofable.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: env.DOCUMENT_STORAGE_PATH,
    // Random filename - the original name is kept only in the DB row,
    // never used to build a path on disk. This closes off path traversal
    // and any "upload a file that overwrites another one" trick.
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

documentsRouter.post(
  "/tenders/:id/documents",
  uploadLimiter,
  validate(idParamSchema, "params"),
  upload.single("file"),
  async (req, res, next) => {
    // multer has already written the file to disk by the time this handler
    // runs, so capture the path up front - every throw below must still
    // reach the cleanup in the catch block, including auth/lookup failures
    // that happen before the file is actually used.
    const storedPath: string | null = req.file?.path ?? null;
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id!));
      if (!tender) throw new NotFoundError("Tender not found");
      if (!isOwnerOrAdmin(req.user!, tender.ownerId)) {
        throw new ForbiddenError("Only the tender owner or an admin can upload documents to it.");
      }

      if (!req.file) throw new AppError(400, "No file uploaded");
      const filePath = req.file.path;

      const detected = await fileTypeFromFile(filePath);
      if (!detected || !ALLOWED_MIME.has(detected.mime)) {
        await fs.unlink(filePath).catch(() => undefined);
        throw new AppError(415, "Unsupported or unrecognised file type");
      }

      const checksum = await sha256File(filePath);
      const kind = (req.body?.kind as string | undefined)?.slice(0, 60) ?? "tender_pack";

      const [doc] = await db
        .insert(schema.documents)
        .values({
          tenderId: tender.id,
          kind,
          filePath: path.basename(filePath),
          checksum,
          mimeType: detected.mime,
          uploadedBy: req.user!.id,
          ocrStatus: "pending",
        })
        .returning();

      await writeAudit({
        actorId: req.user!.id,
        action: "document_uploaded",
        entityType: "document",
        entityId: doc!.id,
        metadata: { tenderId: tender.id, checksum },
        ip: req.ip,
      });

      res.status(201).json(doc);

      // Fire-and-forget: OCR + Claude extraction runs after the response
      // so the upload doesn't block on a multi-second pipeline. Failures
      // are logged and leave ocrStatus="failed" for the owner to see and
      // retry - they never disappear silently.
      runExtraction(doc!.id).catch((err) => logger.error({ err, documentId: doc!.id }, "extraction pipeline failed"));
    } catch (err) {
      if (storedPath) await fs.unlink(storedPath).catch(() => undefined);
      next(err);
    }
  },
);
