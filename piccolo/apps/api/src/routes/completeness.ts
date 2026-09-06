import { Router } from "express";
import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";
import { completenessCheckSchema, idParamSchema, GATE_NUMBERS } from "@piccolo/shared";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

export const completenessRouter = Router();
completenessRouter.use(requireAuth);

type CheckResult = { id: string; label: string; automated: boolean; pass: boolean; detail: string };

completenessRouter.post(
  "/tenders/:id/completeness-check",
  validate(idParamSchema, "params"),
  validate(completenessCheckSchema),
  async (req, res, next) => {
    try {
      const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, req.params.id));
      if (!tender) throw new NotFoundError("Tender not found");
      if (req.user!.role !== "admin" && req.user!.id !== tender.ownerId) {
        throw new ForbiddenError("Only the tender owner can run the completeness check.");
      }

      const [returnables, gates, vaultDocs] = await Promise.all([
        db.select().from(schema.returnables).where(eq(schema.returnables.tenderId, tender.id)),
        db.select().from(schema.gates).where(eq(schema.gates.tenderId, tender.id)),
        db.select().from(schema.vaultDocs).where(eq(schema.vaultDocs.current, true)),
      ]);

      const checks: CheckResult[] = [];

      const outstandingMandatory = returnables.filter((r) => r.mandatory && r.status !== "satisfied" && r.status !== "waived");
      checks.push({
        id: "01_mandatory_returnables",
        label: "Every mandatory returnable present, matched by reference",
        automated: true,
        pass: outstandingMandatory.length === 0,
        detail:
          outstandingMandatory.length === 0
            ? "All mandatory returnables satisfied or waived."
            : `Outstanding: ${outstandingMandatory.map((r) => r.reference).join(", ")}`,
      });

      const body = req.body as typeof completenessCheckSchema._output;
      checks.push({
        id: "02_no_blank_or_upside_pages",
        label: "No blank page where a form should be, no page scanned upside down",
        automated: false,
        pass: body.noBlankOrUpsidePages,
        detail: "Confirmed by the tender owner - not machine-checked.",
      });
      checks.push({
        id: "03_signatures_present",
        label: "Signature detected on every page flagged as requiring one",
        automated: false,
        pass: body.signaturesPresent,
        detail: "Confirmed by the tender owner - not machine-checked.",
      });

      const expiredDocs = vaultDocs.filter((d) => d.expiresAt < tender.closingAt);
      checks.push({
        id: "04_vault_certificates_valid",
        label: "Every Vault certificate valid at the closing date",
        automated: true,
        pass: expiredDocs.length === 0,
        detail:
          expiredDocs.length === 0
            ? "All current Vault documents are valid past this tender's closing date."
            : `Expired before closing: ${expiredDocs.map((d) => d.name).join(", ")}`,
      });

      checks.push({
        id: "05_boq_totals_match",
        label: "BOQ totals in the submitted file match the signed gate 3 figure",
        automated: false,
        pass: body.boqTotalsMatch,
        detail: "Confirmed by the tender owner - not machine-checked.",
      });
      checks.push({
        id: "06_file_rules_compliant",
        label: "File format, file size and naming comply with the portal rules",
        automated: false,
        pass: body.fileRulesCompliant,
        detail: "Confirmed by the tender owner - not machine-checked.",
      });

      const passedGates = GATE_NUMBERS.every((g) => gates.some((row) => row.gateNo === g && (row.decision === "go" || row.decision === "approved")));
      checks.push({
        id: "07_gates_signed",
        label: "Gate rows 1 to 4 all present and signed in the database",
        automated: true,
        pass: passedGates,
        detail: passedGates ? "Gates 1-4 all recorded with a passing decision." : "One or more gates missing or not passed.",
      });

      const overallPass = checks.every((c) => c.pass);

      await db
        .update(schema.tenders)
        .set({ lastCompletenessCheckAt: new Date(), lastCompletenessResult: overallPass ? "pass" : "fail" })
        .where(eq(schema.tenders.id, tender.id));

      await writeAudit({
        actorId: req.user!.id,
        action: "completeness_check_run",
        entityType: "tender",
        entityId: tender.id,
        metadata: { overallPass, checks },
        ip: req.ip,
      });

      res.json({
        overallPass,
        checks,
        blockingList: checks.filter((c) => !c.pass),
      });
    } catch (err) {
      next(err);
    }
  },
);
