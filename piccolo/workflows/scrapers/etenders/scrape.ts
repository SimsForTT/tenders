/**
 * eTenders scraper for Piccolo's discovery layer (artboard P2-02, Method 3
 * "HTML scrape"). Ported from the technique verified against the live
 * site in the SimsForTT/tenders repo (scrapers/etenders.py, master
 * branch, 2026-08-11 run: 100 real tenders pulled, correct ref numbers
 * and closing dates, dedup confirmed on a second run).
 *
 * Why this isn't an n8n workflow like the other discovery sources: the
 * eTenders listing page renders its table via a client-side jQuery
 * DataTable that only puts a subset of fields into visible <td>s - no
 * reference number, no exact closing date/time, just a "closing in N
 * days" string. CSS-selector scraping of the rendered cells (what the
 * earlier, unverified n8n template did) cannot get those fields at all.
 * The working approach drives the page with a real browser, sorts and
 * expands the DataTable, then reads the row objects straight off the
 * DataTables JS API (`.rows().data()`), which does carry `tender_No`
 * and `closing_Date`. That needs a real Chromium instance - n8n's
 * official Docker image doesn't ship one, and adding Playwright/Chromium
 * to that image just to run one scraper isn't worth the bloat. GitHub
 * Actions runners already have everything `playwright install` needs,
 * run on a free schedule, and don't depend on the self-hosted stack
 * being up - see the workflow at
 * .github/workflows/etenders-scrape.yml (repo root).
 *
 * Dedup is NOT handled here with local state (the Python version used a
 * SQLite hash table) - Piccolo's own POST /internal/leads is already
 * idempotent on (tender_no, client) via the tenders table's unique
 * index, so this script can be re-run freely and simply reports what it
 * found each time.
 */
import { chromium } from "playwright";

const LISTING_URL = "https://www.etenders.gov.za/Home/opportunities?id=1";
// How many of the most-recently-published tenders to pull per run.
const PAGE_LENGTH = 100;
// eTenders publishes closing times in South African local time (SAST,
// UTC+2, no DST) with no offset in the DataTables row data - this is
// appended before conversion to a proper offset-bearing ISO string.
const SAST_OFFSET = "+02:00";

const API_BASE_URL = requireEnv("PICCOLO_API_BASE_URL");
const INTERNAL_TOKEN = requireEnv("PICCOLO_API_INTERNAL_TOKEN");
const PLATFORM_ID = requireEnv("ETENDERS_PLATFORM_ID");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

type EtendersRow = {
  description?: string;
  tender_No?: string;
  closing_Date?: string;
};

async function fetchRows(): Promise<EtendersRow[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(LISTING_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("#tendeList tbody tr");

    // Column 4 is "date_Published"; sort newest-first and expand the
    // page size so a scheduled run sees recently posted tenders instead
    // of just the default alphabetical top-10.
    await page.evaluate((pageLength) => {
      // @ts-expect-error - $ and DataTable() are injected by the page itself
      const table = $("#tendeList").DataTable();
      table.order([4, "desc"]).page.len(pageLength).draw();
    }, PAGE_LENGTH);
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      // @ts-expect-error - same as above
      return $("#tendeList").DataTable().rows().data().toArray();
    });
  } finally {
    await browser.close();
  }
}

function toLead(row: EtendersRow) {
  const title = row.description?.trim();
  const tenderNo = row.tender_No?.trim();
  const closingRaw = row.closing_Date?.trim();
  if (!title || !tenderNo || !closingRaw) return null;

  const closing = new Date(`${closingRaw}${SAST_OFFSET}`);
  if (Number.isNaN(closing.getTime())) return null;

  return {
    tenderNo: tenderNo.slice(0, 120),
    // eTenders' row data has no separate department/client field in what
    // this technique currently extracts - confirmed on capture by the
    // person who claims the lead, same pattern as the other discovery
    // sources in workflows/n8n/rss-poll-template.json.
    client: "Unknown - confirm on capture",
    title: title.slice(0, 500),
    closingAt: closing.toISOString(),
    sourcePlatformId: PLATFORM_ID,
  };
}

async function reportHealth(resultCount: number, success: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/internal/platforms/${PLATFORM_ID}/health`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
    body: JSON.stringify({ resultCount, success }),
  }).catch((err) => console.error("Failed to report platform health:", err));
}

async function createLead(lead: ReturnType<typeof toLead>): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/internal/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
    body: JSON.stringify(lead),
  });
  if (!res.ok) {
    console.error(`POST /internal/leads failed (${res.status}) for ${lead?.tenderNo}: ${await res.text()}`);
  }
}

async function main() {
  let rows: EtendersRow[];
  try {
    rows = await fetchRows();
  } catch (err) {
    console.error("Scrape failed:", err);
    await reportHealth(0, false);
    process.exit(1);
  }

  const leads = rows.map(toLead).filter((l): l is NonNullable<typeof l> => l !== null);
  console.log(`Parsed ${leads.length} of ${rows.length} rows into valid leads.`);

  // One bad row shouldn't sink the whole run - each POST is independent.
  await Promise.all(leads.map(createLead));
  await reportHealth(leads.length, true);

  console.log(`Done. ${leads.length} tender(s) sent to Piccolo.`);
}

main();
