import { Router } from "express";
import { z } from "zod";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { emailSchema, passwordSchema, idParamSchema } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword, assessPasswordStrength } from "../lib/password.js";
import { writeAudit } from "../lib/audit.js";
import { ConflictError } from "../lib/errors.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
  role: z.enum(["owner", "admin"]),
});

// User provisioning is admin-only by design - Phase 2 stays "between us"
// per the design doc, and there is no self-service signup surface at all.
usersRouter.post("/", requireRole("admin"), validate(createUserSchema), async (req, res, next) => {
  try {
    const { email, name, password, role } = req.body as z.infer<typeof createUserSchema>;
    const strengthError = assessPasswordStrength(password, email);
    if (strengthError) return res.status(400).json({ error: "weak_password", message: strengthError });

    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (existing) throw new ConflictError("A user with that email already exists");

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(schema.users)
      .values({ email, name, passwordHash, role })
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role });

    await writeAudit({ actorId: req.user!.id, action: "user_created", entityType: "user", entityId: user!.id, ip: req.ip });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch(
  "/:id/deactivate",
  requireRole("admin"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, req.params.id));
      await writeAudit({ actorId: req.user!.id, action: "user_deactivated", entityType: "user", entityId: req.params.id, ip: req.ip });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
