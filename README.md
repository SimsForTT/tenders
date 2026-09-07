# SimsForTT/tenders

This repository holds two related, separately-runnable projects for
tracking South African tender platforms:

- **[`piccolo/`](piccolo/README.md) — Piccolo**, the full Phase 2 tender
  pipeline system for Birchleigh Industries: discovery, OCR/Claude
  extraction, a tracker UI, and the four-gate approval workflow from the
  original design (see `chats/` and `project/`). Self-hosted, free stack
  except Claude. Start there for setup, `piccolo/SECURITY.md` for the
  security model, and `piccolo/DEPLOYMENT.md` for hosting options.
- **Tender Scraper** (this directory's root: `main.py`, `scrapers/`,
  `storage/`, `notify/`) — the original, standalone Python scraper this
  repo started as. Still fully functional on its own (see "Tender
  Scraper" below) if you just want the eTenders scrape + Discord alert
  loop without the rest of Piccolo.

**They are not duplicates.** Piccolo's discovery layer
(`piccolo/workflows/scrapers/etenders/scrape.ts`) is a direct TypeScript
port of this project's verified `scrapers/etenders.py` technique, wired
into Piccolo's own Postgres-backed API instead of local SQLite. Bug
fixes to the underlying eTenders scraping approach belong in both places
if they still apply, but day-to-day, **Piccolo's version is the one
being maintained forward** - see `piccolo/workflows/README.md` for why
it runs on GitHub Actions rather than n8n.

`chats/` and `project/` are the original Claude Design handoff bundle
that Piccolo was built from - the exported chat transcripts and `.dc.html`
design artboards. Not something you need to read to run either project,
but the source of truth for *why* Piccolo's pipeline is shaped the way
it is (the six rules that don't bend, the four gates, etc).

---

# Tender Scraper

Free, open-source pipeline for tracking South African government/mining
tender portals (eTenders, CIDB, provincial sites, Coupa/Ariba) and alerting
on new matches. No paid services — GitHub Actions free tier + SQLite +
Discord webhooks.

## Status: Phases 0–4 built. Phase 5+ (more portals) not started.

**Verified against the live site (2026-08-11):**
- `storage/db.py` (Phase 1) — fully tested, works as-is.
- `scrapers/base.py` + `scrapers/etenders.py` (Phase 2) — **rewritten and
  verified against the live eTenders listing page.** The listing table is
  a client-side jQuery DataTable that only renders a subset of fields into
  visible `<td>`s (no reference number, no exact closing date). Instead of
  scraping those rendered cells, `fetch()` drives the page with Playwright,
  sorts the DataTable newest-published-first, expands it to 100 rows, and
  reads the full row objects straight off the DataTables JS API — which
  includes `tender_No` (reference number) and `closing_Date` (exact ISO
  datetime) that never appear in the HTML. Confirmed end-to-end: a real run
  pulled 100 live tenders with real ref numbers/closing dates, and a second
  run correctly found 0 new (dedup via `storage/db.py` hash works). There is
  no public per-tender detail page on this portal, so `url` points back at
  the listing page.
- `notify/discord.py` (Phase 3) — code complete, fails gracefully without
  credentials. **Still needs a real webhook URL to test sending** — see
  Discord setup below. (Also ported into Piccolo — see
  `piccolo/apps/api/src/lib/discord.ts`.)
- `.github/workflows/scrape.yml` (Phase 4) — referenced below but not
  actually present in this repo; use `piccolo`'s equivalent
  (`.github/workflows/etenders-scrape.yml`) if you want the GitHub
  Actions schedule working today, or recreate this one following the
  same pattern for a standalone (non-Piccolo) scrape+commit-to-SQLite
  loop.

## Setup (local)

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium    # downloads browser binary, first time only
cp .env.example .env           # fill in DISCORD_WEBHOOK_URL
```

Run it:

```bash
python main.py
```

## Discord webhook setup (Phase 3)

1. In your Discord server: Server Settings → Integrations → Webhooks → New Webhook.
2. Pick the channel you want tender alerts posted to, then copy the webhook URL.
3. Put it in `.env` as `DISCORD_WEBHOOK_URL`.

## GitHub Actions setup (Phase 4)

1. Push this repo to GitHub.
2. Settings → Secrets and variables → Actions → add `DISCORD_WEBHOOK_URL`.
3. Settings → Actions → General → Workflow permissions → set to "Read and write" (needed so the workflow can commit `tenders.db` back to the repo).
4. Actions tab → "Scrape Tenders" → Run workflow (manual trigger) to test before waiting for the daily schedule.

## Phase Plan

- [x] **Phase 0 — Skeleton**
- [x] **Phase 1 — Database layer** (`storage/db.py`) — tested
- [x] **Phase 2 — First scraper (eTenders)** (`scrapers/base.py`, `scrapers/etenders.py`) — verified against the live site
- [x] **Phase 3 — Alerts** (`notify/discord.py`) — code complete, **needs a real webhook URL to test sending**
- [x] **Phase 4 — Automation** (`.github/workflows/scrape.yml`) — YAML valid, **needs a real run on GitHub to confirm**
- [ ] **Phase 5+ — Additional portals**: CIDB, provincial sites, Coupa/Ariba — one at a time, each following the `base.py` interface

## Project Structure

```
tender-scraper/
├── .github/workflows/scrape.yml   # Phase 4
├── scrapers/
│   ├── base.py                     # Phase 2 — shared interface
│   └── etenders.py                 # Phase 2 — eTenders implementation
├── storage/db.py                   # Phase 1
├── notify/discord.py                # Phase 3
├── tests/fixture_etenders.html     # stale fixture from the old HTML-scraping parse(); no longer exercised
├── snapshots/                      # raw scrape dumps, gitignored
├── logs/                           # gitignored
├── main.py                         # entrypoint
├── config.py                       # portal list + keywords (Phase 5+)
├── requirements.txt
└── .env.example
```

## Instructions for Claude Code

Phases 0–4 are built. Remaining before Phase 5 (additional portals):
1. ~~Verify the eTenders selectors against the live site~~ — done; `parse()`
   now reads structured data off the page's DataTables JS object instead of
   scraping rendered cells (see Status above).
2. Confirm a real Discord alert sends successfully (needs a webhook URL in
   `.env`).
3. Push this repo to GitHub and confirm the GitHub Actions workflow runs
   successfully via manual trigger.

Once those two are confirmed working, build Phase 5+ scrapers one portal
at a time, each subclassing `BaseScraper` in `scrapers/base.py` the same
way `EtendersScraper` does — this keeps `main.py`'s scraper loop unchanged
as new portals are added.

**Note (from the Piccolo merge):** consider whether Phase 5+ belongs here
or as additions to `piccolo/workflows/` instead, now that Piccolo exists
as the actively-maintained system this scraper feeds into.

---

# Design handoff bundle (Piccolo's origin)

`chats/` and `project/` below are a **handoff bundle** from Claude Design
(claude.ai/design) - the source Piccolo (`piccolo/`) was built from. A
user mocked up the Phase 1 and Phase 2 tender-pipeline designs in
HTML/CSS/JS using Claude Design, then exported this bundle so a coding
agent could implement them for real. Kept here as the design record;
`piccolo/README.md` is what to read to actually run the system.

- `chats/` — the conversation transcripts between the user and the design
  assistant (what was actually wanted, and where it landed after
  iterating)
- `project/` — the `.dc.html` design artboards (Phase 1 and Phase 2),
  plus their imported assets/components
