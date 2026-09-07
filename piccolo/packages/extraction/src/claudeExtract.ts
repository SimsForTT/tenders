import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { extractionResultSchema, type ExtractionResult } from "@piccolo/shared";
import type { PageText } from "./rawText.js";

const TOOL_NAME = "record_extraction";

const inputSchema = zodToJsonSchema(extractionResultSchema, { target: "openApi3" }) as Record<
  string,
  unknown
>;

const SYSTEM_PROMPT = `You extract structured data from a South African tender document for Birchleigh Industries.

Rules, follow them exactly:
1. Every field is an object with "value", "confidence", "source_page" and "alternatives".
2. confidence="found": the value is stated once, unambiguously. Still set source_page.
3. confidence="ambiguous": the field is stated more than once with different values, or the wording conflicts between sections. Put your best reading in "value" and EVERY reading (including the one in "value") in "alternatives" with its own source_page.
4. confidence="not_found": nothing in the document answers this field. Set "value" to null and leave "alternatives" empty. NEVER invent or guess a value to fill a field.
5. source_page is the page number (1-indexed, matching the "----PAGE n----" markers in the input) the value came from, or null if not_found.
6. List every returnable form you can find under "returnables", and every distinct requirement under "requirements_matrix" - do not summarise or merge them.
7. This output is a DRAFT. A person will verify every line against the source page before anything downstream uses it. Do not omit a field because you are unsure - mark it "ambiguous" or "not_found" instead of skipping it.

Call the ${TOOL_NAME} tool exactly once with the complete result.`;

function buildDocumentText(pages: PageText[]): string {
  return pages.map((p) => `----PAGE ${p.page}----\n${p.text}`).join("\n\n");
}

export async function extractFields(
  pages: PageText[],
  opts: { apiKey: string; model: string },
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const documentText = buildDocumentText(pages);

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: TOOL_NAME,
        description: "Records the structured extraction result for this tender document.",
        input_schema: inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: documentText }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block for extraction");
  }

  // Never trust model output as-is: re-validate against the same zod
  // schema the rest of the system relies on. A schema-shaped response is
  // not automatically a *correct* one - this only guarantees shape.
  const parsed = extractionResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Extraction result failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
