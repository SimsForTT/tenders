# Deployment: web on Vercel, everything else self-hosted

Vercel is a good, free fit for `apps/web` (a static Vite build) and a bad
fit for Postgres, the API, or n8n - those need a persistent process and a
real database, which Vercel's serverless model doesn't run. This is the
split this doc assumes: **web on Vercel, API + Postgres + n8n on a host you
control**, talking to each other over HTTPS.

## 1. The web app, on Vercel

Vercel needs GitHub access to this repo (Continuous Deployment reads from
your GitHub connection, not from this session) - see the main README for
connecting GitHub first.

1. **Import the project** in the Vercel dashboard, pointing at this repo.
2. **Root Directory**: set it to `piccolo` (the folder this file is in),
   not the repo root and not `apps/web` - `vercel.json` here already
   handles building just the web workspace from that root:
   ```json
   {
     "buildCommand": "npm install && npm run build --workspace=apps/web",
     "outputDirectory": "apps/web/dist"
   }
   ```
   (If Vercel auto-detects a framework and overrides this, override back
   to "Other" / use the settings above explicitly.)
3. **Environment variable** (Project Settings → Environment Variables):
   - `VITE_API_BASE_URL` = the public HTTPS URL of your self-hosted API
     (step 2 below), e.g. `https://api.piccolo.yourdomain.com`.
   This is baked in at build time - it also fills in the page's own CSP
   `connect-src` (see `apps/web/index.html`), so if you change it you need
   to trigger a new deploy, not just restart.
4. Deploy. Vercel gives you a `*.vercel.app` URL immediately; attach a
   custom domain from Project Settings → Domains if you want one (also
   free, you just need a domain you already own or buy one).

## 2. The API, Postgres and n8n, self-hosted

These three stay together as `docker-compose.yml` already defines them
(minus the `web` service, which Vercel now serves). Any host that can run
Docker Compose and give you a public IP works. Roughly in order of
cost/effort:

- **A small VPS** (Hetzner, DigitalOcean, etc., a few dollars a month) -
  closest to zero surprises, matches this repo's Docker Compose as-is,
  and is the option assumed below.
- **Oracle Cloud's Always Free tier** - a genuinely free-forever small ARM
  VM, if you don't mind Oracle's signup process and occasional capacity
  limits in some regions.
- **Railway / Render** - usable free/trial tiers for a single container +
  Postgres, but you'd split the stack differently (they're less suited to
  a multi-container Compose file as-is) and the free tier typically sleeps
  or expires. Only worth it if you specifically want to avoid managing a
  VPS.

### On the VPS

```
git clone <your-github-repo-url> piccolo && cd piccolo/piccolo
cp .env.example .env
# fill in .env: real secrets, and CORS_ORIGIN=https://<your-vercel-domain>
```

Remove (or comment out) the `web` service from `docker-compose.yml` -
Vercel serves the frontend now, this host only needs `postgres`, `api`,
and `n8n`.

Put a reverse proxy in front for TLS. The lightest free option is
[Caddy](https://caddyserver.com/) - it gets you automatic Let's Encrypt
certificates with a two-line config:

```
# /etc/caddy/Caddyfile
api.piccolo.yourdomain.com {
    reverse_proxy localhost:4000
}
n8n.piccolo.yourdomain.com {
    reverse_proxy localhost:5678
}
```

Then:

```
docker compose up -d --build
npm install
npm run db:migrate
npm run db:seed
```

### Closing the loop: CORS

Once both halves are deployed, `CORS_ORIGIN` in the API's `.env` must be
the exact Vercel URL (or custom domain) the web app is served from -
`middleware/security.ts` rejects any other origin by design (see
`SECURITY.md`). Update it, restart the `api` container, and the web app
should be able to reach it.

### n8n

`workflows/n8n` still applies unchanged - just update
`PICCOLO_API_BASE_URL` in the n8n service's environment if the API's
internal Docker network address changes, and reconfirm the platform feed
URLs/selectors per `workflows/README.md` before turning anything on.
