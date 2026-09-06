import express from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { helmetMiddleware, corsMiddleware } from "./middleware/security.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./lib/logger.js";

import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { tendersRouter } from "./routes/tenders.js";
import { gatesRouter } from "./routes/gates.js";
import { returnablesRouter } from "./routes/returnables.js";
import { vaultDocsRouter } from "./routes/vaultDocs.js";
import { rateItemsRouter } from "./routes/rateItems.js";
import { documentsRouter } from "./routes/documents.js";
import { extractionsRouter } from "./routes/extractions.js";
import { outcomesRouter } from "./routes/outcomes.js";
import { platformsRouter } from "./routes/platforms.js";
import { completenessRouter } from "./routes/completeness.js";
import { internalRouter } from "./routes/internal.js";

export function createApp() {
  const app = express();

  // Trust exactly one hop (the reverse proxy in front of this container) so
  // req.ip reflects the real client for rate limiting / audit logs, without
  // trusting an arbitrary chain of client-supplied X-Forwarded-For hops.
  app.set("trust proxy", 1);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(pinoHttp({ logger }));
  // 2mb cap: this API takes structured JSON, not file bodies - uploads go
  // through multer's own (much larger, MAX_UPLOAD_MB) limit instead.
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(generalLimiter);

  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/tenders", tendersRouter);
  app.use("/", gatesRouter);
  app.use("/", returnablesRouter);
  app.use("/vault-docs", vaultDocsRouter);
  app.use("/rate-items", rateItemsRouter);
  app.use("/", documentsRouter);
  app.use("/", extractionsRouter);
  app.use("/", outcomesRouter);
  app.use("/platforms", platformsRouter);
  app.use("/", completenessRouter);
  app.use("/internal", internalRouter);

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);

  return app;
}
