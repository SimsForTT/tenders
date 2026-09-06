import { db, schema } from "@piccolo/db";
import { and, eq, inArray } from "drizzle-orm";
import { GATE_STAGE, type GateNumber } from "@piccolo/shared";
import { ForbiddenError } from "../lib/errors.js";

/**
 * Enforces the design's hard rules in code, not just in the UI:
 *  - a tender cannot cross a gate's stage without a passing gate row
 *    (artboard P2-04 "gates" table description: "cannot change stage
 *    without the matching gate row")
 *  - a tender cannot leave stage 04 while any extraction for it is still
 *    a draft (artboard P2-03: "will not advance past stage 04 while a
 *    draft flag is set")
 *  - a tender cannot leave stage 13 without a passing completeness check
 *    (artboard P2-05 stage 13: "Upload stays closed until it clears")
 */
export async function assertStageAdvanceAllowed(tenderId: string, fromStage: number, toStage: number) {
  if (toStage <= fromStage) return; // moving backward/no-op is always allowed (correcting a mistake)

  const crossedGates = (Object.entries(GATE_STAGE) as [string, number][])
    .filter(([, gateStage]) => gateStage > fromStage && gateStage <= toStage)
    .map(([gateNo]) => Number(gateNo) as GateNumber);

  if (crossedGates.length > 0) {
    const rows = await db
      .select()
      .from(schema.gates)
      .where(and(eq(schema.gates.tenderId, tenderId), inArray(schema.gates.gateNo, crossedGates)));

    for (const gateNo of crossedGates) {
      const row = rows.find((r) => r.gateNo === gateNo);
      if (!row || (row.decision !== "go" && row.decision !== "approved")) {
        throw new ForbiddenError(`Gate ${gateNo} has not been passed for this tender.`);
      }
    }
  }

  if (fromStage <= 4 && toStage > 4) {
    const drafts = await db
      .select()
      .from(schema.extractions)
      .where(and(eq(schema.extractions.tenderId, tenderId), eq(schema.extractions.status, "draft")));
    if (drafts.length > 0) {
      throw new ForbiddenError("Every extraction draft must be verified before leaving stage 04.");
    }
  }

  if (fromStage <= 13 && toStage > 13) {
    const [tender] = await db.select().from(schema.tenders).where(eq(schema.tenders.id, tenderId));
    if (!tender || tender.lastCompletenessResult !== "pass") {
      throw new ForbiddenError("Run the stage 13 completeness check and clear the blocking list first.");
    }
  }
}
