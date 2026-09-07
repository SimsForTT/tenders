# Discovery workflows

Two different mechanisms cover the discovery layer (artboard P2-02),
split by whether the source needs a real browser:

- **n8n** (`n8n/`) for everything that's plain HTTP/IMAP - RSS polling,
  email alert parsing, and the vault expiry watcher. These are templates:
  every one needs a human to fill in real feed URLs or mailbox credentials
  before it does anything useful. None of this session can browse the
  live tender platforms to verify a selector still matches, and pretending
  otherwise would just mean everything silently returns zero tenders
  forever - exactly the failure mode artboard P2-02 warns about ("a
  silent scraper is worse than no scraper").
- **GitHub Actions** (`../../.github/workflows/etenders-scrape.yml` +
  `scrapers/etenders/`) for eTenders specifically, because its listing
  page only exposes reference numbers and exact closing dates through a
  client-side DataTable's JS API, not through any CSS-selectable HTML -
  scraping it needs a real Chromium instance. That doesn't fit n8n's
  official Docker image (no browser included), so it runs as a scheduled
  GitHub Actions job instead. **This one is not a template** - the
  technique was verified against the live site (see
  `scrapers/etenders/scrape.ts`'s header comment for where that
  verification came from: a real run that pulled 100 tenders with correct
  ref numbers and closing dates). What's still needed before the schedule
  fires on its own is the setup in "eTenders (GitHub Actions)" below.

## What's here

| Path | Covers | Status |
|---|---|---|
| `n8n/rss-poll-template.json` | Method 1, RSS poll | Template - set the real feed URL and platform UUID |
| `n8n/email-alert-parse-template.json` | Method 2, email alert parse | Template - needs a real IMAP mailbox + Anthropic API key as n8n credentials |
| `n8n/vault-expiry-watcher.json` | Build sequence step 03 | Working once `DISCORD_WEBHOOK_URL` is set - this one has no site-specific guesswork |
| `scrapers/etenders/scrape.ts` | Method 3, eTenders | Verified technique, needs the setup below to actually run |

## eTenders (GitHub Actions)

1. `POST /platforms` (or seed data) gives you the eTenders platform's
   UUID - `npm run db:seed` already creates one pointed at the real
   listing URL.
2. In the GitHub repo → Settings → Secrets and variables → Actions:
   - **Variables**: `PICCOLO_API_BASE_URL` (your self-hosted API's public
     HTTPS URL - see `../DEPLOYMENT.md`), `ETENDERS_PLATFORM_ID` (the UUID
     from step 1).
   - **Secrets**: `PICCOLO_API_INTERNAL_TOKEN` (same value as the API's
     `.env`).
3. The schedule trigger (`on.schedule` in the workflow file) only fires
   from your repo's **default branch**. If this lands on a non-default
   branch first, use Actions → "eTenders scrape" → Run workflow to test
   it manually - the cron won't fire until the workflow file is on the
   branch GitHub treats as default.
4. Watch a couple of runs in the Actions tab before trusting the schedule
   unattended, same as any other source.

## Importing

1. Open n8n at `http://localhost:5678` (basic-auth credentials are
   `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` from your `.env`).
2. Workflows menu -> Import from File -> pick one of the JSON files above
   (they're also mounted read-only into the container at
   `/home/node/workflows`).
3. Fill in every `REPLACE-...` placeholder in the node parameters.
4. Any node with a `credentials` block (IMAP, Anthropic) needs that
   credential created in n8n's own Credentials UI first - never paste a
   secret into a workflow's JSON or node parameters directly, since
   workflow JSON gets exported/shared far more casually than a credential
   does.
5. Turn the workflow on (top-right toggle) once you've tested it with
   "Execute workflow" against real data.

## Adding a new platform

The 42-platform reference groups into six tiers. Before adding one here:

1. **Check the site's terms of service / robots.txt** allow automated
   polling. Some tender portals explicitly prohibit scraping, or gate
   listings behind a login that scraping would have to bypass - those
   belong in "manual check, logged" (Method 4), not a scraper.
2. `POST /platforms` (admin only) to register it in Piccolo with a
   `tier`, `ingestMethod` and `cadence`.
3. Duplicate the matching template workflow above, point it at the real
   URL/feed/selectors, and set `sourcePlatformId` to the UUID from step 2.
4. Watch its health in the Platforms page for the first few runs before
   trusting it unattended.

## Alerts

Every genuinely new tender (from any source - RSS, eTenders, email) gets
a Discord alert automatically, sent server-side from
`POST /internal/leads` (`apps/api/src/lib/discord.ts`) - not something
each workflow has to remember to do itself. Set `DISCORD_WEBHOOK_URL` in
`.env` to turn it on; leave it blank and alerts just no-op, same as
everything else here that's optional. This is a straight port of
`notify/discord.py` from SimsForTT/tenders, which already proved the
pattern works. The vault expiry watcher (`n8n/vault-expiry-watcher.json`)
posts to the same webhook, so both land in one channel.

If you'd rather use Slack or Teams instead of Discord, both also support
incoming webhooks - the only change needed is the JSON body's key
(`content` for Discord, `text` for Slack/Teams). `apps/api/src/lib/discord.ts`
and the vault-expiry workflow's alert node are the two places that would
need updating.

## Why leads have no owner

`POST /internal/leads` creates a tender at stage 0 with `ownerId = null`.
This is not a bug - artboard P2-01 is explicit that "owner assignment
stays manual, one tender one owner" even when discovery is automated. A
person claims the lead from the dashboard's "Unclaimed leads" list, which
is what actually assigns an owner and moves it to stage 1.

## Internal API authentication

Every request from n8n to Piccolo carries `X-Internal-Token`, checked
against `PICCOLO_API_INTERNAL_TOKEN` (see `apps/api/src/middleware/auth.ts`
`requireInternalToken`). This token is deliberately narrow in what it can
do (`apps/api/src/routes/internal.ts`): create draft leads and report
platform health, nothing else. It cannot touch gates, pricing,
extractions, or another tender's data - a compromised or misconfigured
n8n instance is a discovery-layer nuisance, not a path to the rest of the
system.
