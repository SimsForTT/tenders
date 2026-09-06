import pino from "pino";
import { env } from "../env.js";

// Redact anything that could carry a credential or secret into logs by
// accident - the field list is deliberately broad (wildcards included).
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
      "*.accessToken",
      "*.ANTHROPIC_API_KEY",
    ],
    censor: "[redacted]",
  },
});
