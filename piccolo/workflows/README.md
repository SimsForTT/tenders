# Discovery workflows

n8n workflow exports for the discovery layer (artboard P2-02). These are
templates, not finished automations - every one of them needs a human to
fill in real feed URLs, real CSS selectors, or real mailbox credentials
before it does anything useful. That's deliberate: none of this session
can browse the live tender platforms to verify a selector still matches,
and pretending otherwise would just mean everything silently returns zero
tenders forever, which is exactly the failure mode artboard P2-02 warns
about ("a silent scraper is worse than no scraper").

## What's here

| File | Covers | Status |
|---|---|---|
| `rss-poll-template.json` | Method 1, RSS poll | Template - set the real feed URL and platform UUID |
| `etenders-scraper-template.json` | Method 3, HTML scrape | Template - selectors are placeholders, inspect the live page first |
| `email-alert-parse-template.json` | Method 2, email alert parse | Template - needs a real IMAP mailbox + Anthropic API key as n8n credentials |
| `vault-expiry-watcher.json` | Build sequence step 03 | Working once `ALERT_WEBHOOK_URL` is set - this one has no site-specific guesswork |

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
