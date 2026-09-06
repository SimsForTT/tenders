import "dotenv/config";
import { z } from "zod";

// Fail fast and loud on a missing/weak secret instead of booting with an
// insecure default - a server that silently falls back to a known JWT
// secret is worse than a server that refuses to start.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  DOCUMENT_STORAGE_PATH: z.string().default("./storage/documents"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  PICCOLO_API_INTERNAL_TOKEN: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Refusing to start with invalid environment configuration.");
}

if (
  parsed.data.NODE_ENV === "production" &&
  (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET)
) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.");
}

export const env = parsed.data;
