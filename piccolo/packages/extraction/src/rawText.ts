import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorker } from "tesseract.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

const execFileAsync = promisify(execFile);

export type PageText = { page: number; text: string };
export type RawExtraction = { pages: PageText[]; method: "pdf_text_layer" | "ocr" | "docx" | "xlsx" };

// Below this many characters per page, a "born-digital" PDF is almost
// certainly a scan with no text layer - fall back to OCR rather than
// hand Claude a near-empty document.
const MIN_CHARS_PER_PAGE = 40;

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Rasterizes each PDF page to a PNG via poppler-utils' `pdftoppm`
 * (installed in the API Docker image - see apps/api/Dockerfile) and OCRs
 * each page image. Only used when the PDF has no usable text layer.
 * execFile (not exec/shell) with an argument array - no shell
 * interpolation of the file path, so a crafted filename can't inject
 * shell metacharacters.
 */
async function ocrPdfViaPoppler(pdfPath: string, pageCount: number): Promise<PageText[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "piccolo-ocr-"));
  try {
    const prefix = path.join(tmpDir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", "200", pdfPath, prefix]);

    const pages: PageText[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const padded = String(i).padStart(pageCount >= 100 ? 3 : 2, "0");
      const candidates = [`${prefix}-${padded}.png`, `${prefix}-${i}.png`];
      let buffer: Buffer | null = null;
      for (const candidate of candidates) {
        try {
          buffer = await fs.readFile(candidate);
          break;
        } catch {
          // try next naming convention pdftoppm might have used
        }
      }
      if (!buffer) continue;
      const text = await ocrImageBuffer(buffer);
      pages.push({ page: i, text });
    }
    return pages;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function extractRawText(filePath: string, mime: string): Promise<RawExtraction> {
  if (mime === "application/pdf") {
    const buffer = await fs.readFile(filePath);
    const parsed = await pdfParse(buffer);
    const pageCount = parsed.numpages || 1;
    const avgCharsPerPage = parsed.text.length / pageCount;

    if (avgCharsPerPage >= MIN_CHARS_PER_PAGE) {
      // pdf-parse gives one text blob, not per-page - split on form-feed
      // (\f), which it inserts between pages.
      const rawPages = parsed.text.split("\f");
      return {
        method: "pdf_text_layer",
        pages: rawPages.map((text, i) => ({ page: i + 1, text })),
      };
    }

    return { method: "ocr", pages: await ocrPdfViaPoppler(filePath, pageCount) };
  }

  if (mime.startsWith("image/")) {
    const buffer = await fs.readFile(filePath);
    return { method: "ocr", pages: [{ page: 1, text: await ocrImageBuffer(buffer) }] };
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { method: "docx", pages: [{ page: 1, text: value }] };
  }

  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const pages: PageText[] = [];
    workbook.eachSheet((sheet, id) => {
      const rows: string[] = [];
      sheet.eachRow((row) => {
        const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v)));
        rows.push(cells.join("\t"));
      });
      pages.push({ page: id, text: `Sheet: ${sheet.name}\n${rows.join("\n")}` });
    });
    return { method: "xlsx", pages };
  }

  throw new Error(`No text extraction strategy for mime type ${mime}`);
}
