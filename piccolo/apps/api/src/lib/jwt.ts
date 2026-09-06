import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../env.js";
import type { Role } from "@piccolo/shared";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // Pin the algorithm explicitly - never trust `alg` from the token itself
  // (the classic "alg: none" / algorithm-confusion JWT bug).
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
  if (typeof decoded === "string" || !("sub" in decoded) || !("role" in decoded)) {
    throw new Error("Malformed access token payload");
  }
  return { sub: decoded.sub as string, role: decoded.role as Role };
}

/**
 * Refresh tokens are opaque random strings, never JWTs - the DB is the
 * only source of truth for whether one is still valid, so revocation is
 * immediate (no waiting out a token's exp). Only the SHA-256 hash is
 * persisted; the raw value exists only in the httpOnly cookie.
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function refreshTtlMs(): number {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_REFRESH_TTL);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"];
  return value * unitMs;
}
