import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import type { Role } from "@piccolo/shared";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing bearer token"));
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired access token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

/** Protects the small set of endpoints n8n workflows call directly. */
export function requireInternalToken(expected: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const provided = req.headers["x-internal-token"];
    if (!expected || provided !== expected) {
      return next(new UnauthorizedError("Invalid internal token"));
    }
    next();
  };
}
