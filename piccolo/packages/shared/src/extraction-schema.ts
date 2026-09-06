import { z } from "zod";

/**
 * Fixed extraction schema, per artboard P2-03 "Document capture, stage 04".
 * Claude is called with this schema as a tool definition (see
 * packages/extraction/src/claudeExtract.ts) so output is structured, not
 * free text. Every leaf field is wrapped in `Field<T>` so confidence and
 * page provenance travel with the value - never just the value alone.
 *
 * Confidence handling (design's three-state key):
 *  - "found"      found and unambiguous. Still verified by the owner.
 *  - "ambiguous"  found but conflicting between sections. `alternatives`
 *                 must carry every reading with its own page number.
 *  - "not_found"  nothing found. `value` stays null. Never guessed.
 */
export const CONFIDENCE = ["found", "ambiguous", "not_found"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

const fieldSchema = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    value: inner.nullable(),
    confidence: z.enum(CONFIDENCE),
    source_page: z.number().int().positive().nullable(),
    alternatives: z
      .array(z.object({ value: inner, source_page: z.number().int().positive().nullable() }))
      .default([]),
  });

export type Field<T> = {
  value: T | null;
  confidence: Confidence;
  source_page: number | null;
  alternatives: { value: T; source_page: number | null }[];
};

export const returnableSchema = z.object({
  reference: fieldSchema(z.string()),
  name: fieldSchema(z.string()),
  mandatory: fieldSchema(z.boolean()),
});

export const requirementSchema = z.object({
  requirement: fieldSchema(z.string()),
  evidence: fieldSchema(z.string()),
  gap: fieldSchema(z.string()),
});

export const extractionResultSchema = z.object({
  tender_number: fieldSchema(z.string()),
  client: fieldSchema(z.string()),
  description: fieldSchema(z.string()),
  // Free-text rather than a strict ISO datetime: tender documents state
  // dates in every format imaginable, and this is a draft a person
  // verifies against the source page anyway - a strict parse failure here
  // would break the whole extraction over a formatting quirk. The tracker
  // UI parses/normalises this once a human confirms it.
  closing_at: fieldSchema(z.string()),
  briefing: z.object({
    compulsory: fieldSchema(z.boolean()),
    date: fieldSchema(z.string()),
    venue: fieldSchema(z.string()),
  }),
  query_deadline_at: fieldSchema(z.string()),
  returnables: z.array(returnableSchema),
  eligibility: z.object({
    cidb_grade: fieldSchema(z.string()),
    cidb_class: fieldSchema(z.string()),
    bbbee_requirement: fieldSchema(z.string()),
  }),
  bonds_and_insurance: fieldSchema(z.string()),
  evaluation_criteria: z.array(
    z.object({
      criterion: fieldSchema(z.string()),
      weighting_pct: fieldSchema(z.number()),
    }),
  ),
  jv_and_local_content: fieldSchema(z.string()),
  requirements_matrix: z.array(requirementSchema),
  submission: z.object({
    method: fieldSchema(z.string()),
    address_or_portal: fieldSchema(z.string()),
    format_rules: fieldSchema(z.string()),
  }),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
