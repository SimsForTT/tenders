import rateLimit from "express-rate-limit";

// Generous for normal tracker use, tight enough to blunt scripted abuse.
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints are the highest-value target for credential stuffing /
// brute force, so they get a much tighter, IP-scoped limit on top of the
// per-account lockout enforced in routes/auth.ts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts", message: "Too many attempts, try again later." },
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
