# Piccolo

Tender pipeline automation for Birchleigh Industries - Phase 2 of the
design in `../chats/` and `../project/Tender Pipeline Phase 2.dc.html`.
Phase 1 is the manual, paper-and-people pipeline (one tender, one owner,
four hard gates). Piccolo automates the finding, reading and assembling;
every decision, price and signature in Phase 1 stays human - see
`SECURITY.md` and the design doc for the six rules that don't bend.

Self-hosted and free by design: Postgres, n8n and the tracker all run in
your own Docker Compose. The one paid piece is Claude, for document
extraction - everything else (OCR, the database, the workflow engine, the
web UI) is open source and runs on your own hardware.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL 16 | Source of truth for everything (artboard P2-04) |
| API | Node.js/TypeScript, Express, Drizzle ORM | Typed, parameterized queries, no ORM magic to audit |
| Web tracker | React + Vite | My Tenders / Gate Queue / Expiry Watch views, tender detail, uploads |
| Automation | n8n (self-hosted) | RSS/email/scrape discovery, vault expiry watcher |
| OCR | Tesseract (via `tesseract.js`) + `pdf-parse` + `mammoth` + `exceljs` | Free, no cloud OCR bill |
| Extraction | Claude (Anthropic API) | Structured extraction against the fixed schema in artboard P2-03 |

See `SECURITY.md` for the full security model and `workflows/README.md` for
the discovery-layer setup.

## First-time setup

1. **Copy and fill in the environment file.** Every secret in
   `.env.example` needs a real, unique value - generate them with
   `openssl rand -base64 48`. Do not skip `ADMIN_EMAIL`/`ADMIN_PASSWORD`;
   the seed script refuses to run against the placeholder values.

   ```
   cp .env.example .env
   # edit .env
   ```

2. **Bring up the stack.**

   ```
   docker compose up -d --build
   ```

   This starts Postgres, the API, the web app, and n8n. All ports are
   bound to `127.0.0.1` only by default (see `docker-compose.yml`) - put a
   reverse proxy with TLS in front (Caddy is the easiest free option) if
   you need to reach this from another machine.

3. **Run migrations and seed the first admin account.**

   ```
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. **Log in.** Web app at `http://localhost:5173`, API at
   `http://localhost:4000`, n8n at `http://localhost:5678`.

5. **Set up discovery.** Follow `workflows/README.md` - the seeded
   platforms have placeholder feed URLs that need replacing with real ones
   before you turn any workflow on.

## Local development (without Docker)

```
npm install
# point DATABASE_URL at a local Postgres (see .env.example)
npm run db:migrate
npm run db:seed
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
```

## Tests, types, and the security posture

```
npm run typecheck   # all workspaces
npm test            # apps/api's vitest suite
npm audit --omit=dev  # should report 0 vulnerabilities - see SECURITY.md
```

## Repository layout

```
apps/
  api/          Express API - auth, RBAC, gates, extraction pipeline trigger
  web/          React tracker UI
packages/
  db/           Drizzle schema, migrations, seed script
  shared/       Zod schemas and constants shared by api + web
  extraction/   OCR + Claude extraction pipeline
workflows/
  n8n/          Discovery-layer workflow templates (RSS/scrape/email/expiry watcher)
```

## What's a template vs. what's finished

Per the build sequence in artboard P2-06, this scaffold implements all
seven steps at working-MVP depth, but two things need your own follow-up
before they're production-grade:

- **n8n workflow templates** (`workflows/n8n/`) have placeholder feed URLs
  and CSS selectors - see `workflows/README.md` for what to fill in and why
  nothing here pretends those work against live sites unverified.
- **The stage-13 completeness check** automates what the database can
  verify and asks the tender owner to confirm the rest by hand (blank-page
  detection, signature presence, BOQ reconciliation) - see `SECURITY.md`
  "Known limitations" for why that's a deliberate choice, not a shortcut.
