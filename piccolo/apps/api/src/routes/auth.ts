import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { loginSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { verifyPassword } from "../lib/password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTtlMs,
} from "../lib/jwt.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { env } from "../env.js";

export const authRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/auth",
};

authRouter.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

    // Constant-shape response whether the account exists or not - do not
    // let response content or timing reveal account existence.
    const genericError = () => res.status(401).json({ error: "invalid_credentials" });

    if (!user || !user.isActive) return genericError();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({ error: "account_locked", lockedUntil: user.lockedUntil });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      const failedCount = user.failedLoginCount + 1;
      const locked = failedCount >= MAX_FAILED_ATTEMPTS;
      await db
        .update(schema.users)
        .set({
          failedLoginCount: locked ? 0 : failedCount,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : null,
        })
        .where(eq(schema.users.id, user.id));
      await writeAudit({
        actorId: user.id,
        action: "login_failed",
        entityType: "user",
        entityId: user.id,
        ip: req.ip,
      });
      return genericError();
    }

    await db
      .update(schema.users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id));

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const { raw, hash } = generateRefreshToken();
    await db.insert(schema.refreshTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
    });

    res.cookie("piccolo_refresh", raw, { ...cookieOptions, maxAge: refreshTtlMs() });
    await writeAudit({ actorId: user.id, action: "login", entityType: "user", entityId: user.id, ip: req.ip });

    res.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.piccolo_refresh as string | undefined;
    if (!raw) return res.status(401).json({ error: "missing_refresh_token" });

    const hash = hashRefreshToken(raw);
    const [tokenRow] = await db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.tokenHash, hash),
          isNull(schema.refreshTokens.revokedAt),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      );

    if (!tokenRow) {
      res.clearCookie("piccolo_refresh", cookieOptions);
      return res.status(401).json({ error: "invalid_refresh_token" });
    }

    // Rotate: revoke the used token and issue a fresh one. If a revoked
    // token is ever replayed, that's a signal of theft, not just reuse.
    await db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, tokenRow.id));

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, tokenRow.userId));
    if (!user || !user.isActive) {
      res.clearCookie("piccolo_refresh", cookieOptions);
      return res.status(401).json({ error: "invalid_refresh_token" });
    }

    const { raw: newRaw, hash: newHash } = generateRefreshToken();
    await db.insert(schema.refreshTokens).values({
      userId: user.id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + refreshTtlMs()),
    });
    res.cookie("piccolo_refresh", newRaw, { ...cookieOptions, maxAge: refreshTtlMs() });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const raw = req.cookies?.piccolo_refresh as string | undefined;
    if (raw) {
      const hash = hashRefreshToken(raw);
      await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.refreshTokens.tokenHash, hash));
    }
    res.clearCookie("piccolo_refresh", cookieOptions);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id));
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    next(err);
  }
});
