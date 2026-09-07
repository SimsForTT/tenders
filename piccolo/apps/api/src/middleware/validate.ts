import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

type Target = "body" | "query" | "params";

/**
 * Every route that accepts input runs it through here first - this is the
 * single choke point that keeps unvalidated data out of SQL, out of file
 * paths, and out of the extraction pipeline. Fails closed with 400 on any
 * mismatch rather than coercing silently.
 */
export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return res.status(400).json({
        error: "validation_error",
        details: result.error.flatten(),
      });
    }
    req[target] = result.data;
    next();
  };
}
