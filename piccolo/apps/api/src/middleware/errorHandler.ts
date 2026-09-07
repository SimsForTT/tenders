import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../env.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, "request failed");
    return res.status(err.status).json({ error: err.message });
  }

  logger.error({ err, path: req.path }, "unhandled error");
  // Never leak stack traces or internal error text to the client, even in
  // an unexpected-error path - that's a common source of accidental
  // information disclosure (DB details, file paths, library versions).
  const message = env.NODE_ENV === "production" ? "Internal server error" : String(err);
  res.status(500).json({ error: "internal_error", message });
}
