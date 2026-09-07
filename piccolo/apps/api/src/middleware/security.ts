import helmet from "helmet";
import cors from "cors";
import { env } from "../env.js";

const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow same-origin/non-browser requests (no Origin header) but never
    // reflect an arbitrary Origin back - that would defeat CORS entirely.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
});

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: { maxAge: 15552000, includeSubDomains: true },
});
