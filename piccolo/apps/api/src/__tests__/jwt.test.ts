import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken } from "../lib/jwt.js";
import { env } from "../env.js";

describe("access tokens", () => {
  it("round-trips a valid token", () => {
    const token = signAccessToken({ sub: "user-1", role: "owner" });
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ sub: "user-1", role: "owner" });
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ sub: "attacker", role: "admin" }, "wrong-secret", { algorithm: "HS256" });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects an alg:none token (algorithm confusion / signature stripping)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "attacker", role: "admin" })).toString("base64url");
    const noneToken = `${header}.${payload}.`;
    expect(() => verifyAccessToken(noneToken)).toThrow();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ sub: "user-1", role: "owner" }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: -10,
    });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

describe("refresh tokens", () => {
  it("generates a raw token whose hash matches independently recomputed hash", () => {
    const { raw, hash } = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hash);
  });

  it("never stores the raw value as its own hash", () => {
    const { raw, hash } = generateRefreshToken();
    expect(hash).not.toBe(raw);
  });
});
