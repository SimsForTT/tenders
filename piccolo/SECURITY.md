# Security notes

This document is the honest account of what Piccolo does for security, what it
deliberately doesn't do, and what a human still has to decide. Read it before
deploying, and re-read it if you change auth, file handling, or the internal
n8n API.

## Threat model

Piccolo handles a small company's tender pipeline: compliance documents,
pricing, and a handful of staff accounts (per the design, a team of ~12).
It is not a public-facing product. The realistic threats are:

- A staff account's credentials being phished or reused elsewhere.
- A malicious or careless upload (a crafted PDF/DOCX/XLSX) hitting the OCR
  pipeline.
- The n8n discovery layer being compromised or misconfigured, and trying to
  do something to the database beyond "create a draft lead."
- An insider (an authenticated but unrelated staff account) trying to touch
  a tender that isn't theirs.
- Accidental data loss or silent corruption of the audit trail / originals.

It is explicitly *not* designed against: nation-state actors, a compromised
Postgres host, or a compromised admin account (an admin can do essentially
anything by design - see "roles" below).

## Authentication & sessions

- Passwords are hashed with **argon2id** (`apps/api/src/lib/password.ts`),
  never stored or logged in plaintext.
- A minimum-12-character policy plus a small common-password/email-substring
  denylist - length matters more than forced complexity, per current
  guidance (NIST 800-63B).
- Access tokens are short-lived JWTs (default 15m), signed HS256 with the
  algorithm pinned at verification time (`lib/jwt.ts` `verifyAccessToken`) -
  this closes the classic "alg: none" / algorithm-confusion attack.
- Refresh tokens are **opaque random values**, not JWTs. Only their SHA-256
  hash is stored in `refresh_tokens`; the raw value lives only in an
  `httpOnly`, `SameSite=Strict`, path-scoped cookie. Every refresh **rotates**
  the token (old one revoked, new one issued) - a replayed, already-used
  refresh token is rejected outright, which is the standard signal for theft.
- Login is rate-limited per IP (`middleware/rateLimit.ts`) and additionally
  locks an *account* for 15 minutes after 5 consecutive failed attempts,
  tracked on the `users` row so it survives a process restart.
- Failed and successful logins are both audit-logged.
- There is **no self-service signup**. Accounts are provisioned by an admin
  (`POST /users`) only - this matches the design's "Phase 2 is between us"
  framing and removes an entire class of account-enumeration/spam risk.

## Authorization

- Two roles: `owner` and `admin`. `isOwnerOrAdmin` (`lib/authz.ts`) is the
  single source of truth for "can this user touch this tender," used
  consistently by every mutation route (tenders, gates, returnables,
  documents, extractions, outcomes, completeness check).
- **Gate 4 (two-person QA)** is the one deliberate exception: the design
  requires an *independent* reviewer, so gate 4 accepts any authenticated
  user **except** the tender's own owner - see `routes/gates.ts`.
- An earlier draft of this codebase shipped `POST /tenders/:id/gates`,
  `PATCH /returnables/:id`, `POST /tenders/:id/outcome` and the document
  upload route with `requireAuth` only, no ownership check - any
  authenticated account could record a fabricated gate decision or mark
  another tender's compliance document "satisfied." This was caught by a
  security review pass before ship and fixed by routing every one of those
  checks through `isOwnerOrAdmin`. If you fork or extend this codebase,
  treat "does this new mutation route check `isOwnerOrAdmin`?" as a required
  review question, not an optional one.
- The n8n-facing `/internal/*` API uses a **separate** shared-secret header
  (`X-Internal-Token`), not a user JWT, and can only create draft leads and
  report platform health (`routes/internal.ts`). It cannot reach gates,
  pricing, extractions, or any other tender data - a compromised n8n
  instance is a discovery-layer nuisance, not a path into the rest of the
  system.
- **Routing gotcha we hit and fixed**: routers mounted at `app.use("/", ...)`
  with their own unconditional `router.use(requireAuth)` will intercept
  *every* request path that reaches them, not just their own routes -
  because Express matches the mount path (`"/"` matches everything) before
  the router even looks at its own route table. This silently swallowed
  every `/internal/*` request behind an unrelated router's user-auth check
  until `/internal` was registered *before* those routers in `app.ts`. If
  you add another router mounted at `"/"`, register it after `/internal`,
  or better, give it its own path prefix instead of `"/"`.

## Input handling

- Every request body/query/params is validated with a zod schema
  (`middleware/validate.ts`) before touching a route handler - failures
  return 400, nothing partially-valid ever reaches a query.
- All database access goes through Drizzle's query builder
  (`eq`, `and`, `ilike`, etc.) with bound parameters - no raw string-built
  SQL anywhere in the codebase, so there is no SQL injection surface. (An
  actual SQL-injection CVE existed in `drizzle-orm` itself below 0.45.2 -
  see "Dependency vulnerabilities" below - independent of this codebase's
  own query patterns.)
- File uploads (`routes/documents.ts`):
  - Stored under a **server-generated random filename**
    (`crypto.randomUUID()`), never the client-supplied name - this closes
    path traversal and "overwrite another tender's file" tricks.
  - Type is checked by **sniffing the actual file bytes**
    (`file-type`'s `fileTypeFromFile`) against an allow-list, never trusted
    from the client's `Content-Type` header or filename extension.
  - A SHA-256 checksum is computed and stored at upload time
    (`lib/checksum.ts`), so a later swap of the bytes on disk is detectable
    - this is what makes "source documents are stored unaltered" a checkable
    fact, not just policy.
  - Size-capped (`MAX_UPLOAD_MB`) and rate-limited (`uploadLimiter`).
  - Any early failure after multer has already written the file to disk
    (auth check, bad mime type, etc.) unlinks it - it never lingers as an
    orphaned file that bypassed validation.
- The OCR pipeline's one subprocess call
  (`packages/extraction/src/rawText.ts`, `pdftoppm` via poppler-utils) uses
  Node's `execFile` with an **argument array**, not a shell string - the
  path passed to it is the server-generated upload path, never anything a
  client can influence, so there's no command-injection surface even though
  a subprocess is involved.

## Secrets & configuration

- `apps/api/src/env.ts` validates the environment at boot with zod and
  **refuses to start** on a missing or too-short JWT secret, rather than
  silently falling back to an insecure default.
- `.env` is gitignored; `.env.example` ships with obvious placeholder values
  that the seed script explicitly refuses to run against
  (`ADMIN_EMAIL=changeme@example.com` and any `change_me...` password).
- CORS is an explicit allow-list (`CORS_ORIGIN`), never `*`, and the origin
  is never blindly reflected back.
- Content-Security-Policy is locked down (`helmet`'s `contentSecurityPolicy`
  on the API; a matching `<meta>` CSP plus nginx headers on the web app) -
  no inline scripts, no third-party script origins.
- Logs are redacted (`lib/logger.ts`) for auth headers, cookies, and any
  field literally named password/token/secret - never assume a log line is
  safe to paste into a support ticket without checking it wasn't redacted
  for a good reason.

## Audit trail

- `audit_log` is append-only by convention: no route in this codebase ever
  issues an UPDATE or DELETE against it. Gate decisions, stage changes,
  logins (success and failure), uploads, and extraction verification all
  write a row.
- The `gates` table itself is the *authoritative* audit trail for pipeline
  progression: `services/stageTransition.ts` refuses to let a tender cross
  a gate's stage without a matching, passing `gates` row, enforced at the
  API layer, not just suggested by the UI.

## Dependency vulnerabilities

Run `npm audit --omit=dev` from `piccolo/` before every deploy - as of this
writing it reports **zero** vulnerabilities in the production dependency
tree. The full `npm audit` (including devDependencies) will still show
issues in `vite`/`vitest`/`drizzle-kit`'s bundled `esbuild` - these are
**development-tooling-only** CVEs (a vulnerable dev server / Vitest UI
server that this project never runs in production) and are excluded from
the API's Docker image on purpose (`apps/api/Dockerfile` installs with
`--omit=dev`). Don't run `vitest --ui` or a public-facing `vite dev` server
against untrusted networks.

If `npm audit --omit=dev` ever stops reporting zero, treat it as a blocking
issue, not a background task - re-run this check after any dependency bump.

## Known limitations (be honest about these, don't paper over them)

- **Stage-13 completeness check** (`routes/completeness.ts`) automates what
  the database can actually verify (mandatory returnables satisfied, Vault
  certificates valid, all 4 gates passed) and requires an explicit human
  confirmation for the rest (blank/upside-down pages, signature presence,
  BOQ total reconciliation, portal file-rule compliance). These are real
  computer-vision and finance-reconciliation problems; this system does not
  pretend to solve them, because a false "automated pass" here is worse than
  an honest manual checkbox.
- **RSS/scraper templates** (`workflows/n8n/*.json`) ship with placeholder
  URLs and CSS selectors that were never verified against the live sites
  from this environment (no browsing tool was used to inspect them). Treat
  every template as untested until you've run it against real data.
- **OCR language data**: `tesseract.js` downloads its English trained-data
  file from a public CDN on first use and caches it - the one outbound
  dependency in an otherwise fully self-hosted stack. If you need a fully
  air-gapped deployment, pre-seed that cache and pin `tesseract.js` to load
  it from a local path instead.
- **Admin accounts are fully trusted.** There's no further privilege
  separation above `admin` - an admin can create users, reassign tenders,
  and read everything. This matches a ~12-person internal tool; it would
  need real RBAC before growing past that.
