import argon2 from "argon2";
import { db } from "../client.js";
import { users, platforms } from "../schema.js";
import { eq } from "drizzle-orm";

// The 42-platform reference groups into six tiers per artboard P2-02.
// These are the sources with a real, documented ingestion method today;
// the rest of the reference list is deliberately left for you to add via
// the admin UI once you've confirmed each site's terms allow automated
// polling - see workflows/README.md "Adding a new platform".
const SEED_PLATFORMS = [
  { name: "TenderBulletins", url: "https://example-tenderbulletins.invalid/rss", tier: 5, ingestMethod: "rss" as const, cadence: "hourly" },
  { name: "TenderFlow", url: "https://example-tenderflow.invalid/rss", tier: 5, ingestMethod: "rss" as const, cadence: "hourly" },
  { name: "SA-Tenders", url: "https://example-sa-tenders.invalid/rss", tier: 5, ingestMethod: "rss" as const, cadence: "hourly" },
  // URL is the real, verified listing page - see
  // workflows/scrapers/etenders/scrape.ts. id is pinned (not
  // auto-generated) so it matches the ETENDERS_PLATFORM_ID already set as
  // a GitHub Actions repo variable - if you ever re-seed against a fresh
  // database, this platform lands with the same id every time, no manual
  // copy-paste step needed.
  {
    id: "1ad55d48-4a3a-4010-bbbf-0dfbd46e435f",
    name: "eTenders",
    url: "https://www.etenders.gov.za/Home/opportunities?id=1",
    tier: 1,
    ingestMethod: "scrape" as const,
    cadence: "twice_daily",
  },
  { name: "SANRAL", url: "https://www.nra.co.za", tier: 2, ingestMethod: "scrape" as const, cadence: "twice_daily" },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminName = process.env.ADMIN_NAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || adminEmail === "changeme@example.com") {
    throw new Error(
      "Set ADMIN_EMAIL in .env to the real inbox that should own Piccolo before seeding.",
    );
  }
  if (!adminPassword || adminPassword.length < 12 || adminPassword.startsWith("change_me")) {
    throw new Error("Set a real ADMIN_PASSWORD (12+ characters) in .env before seeding.");
  }

  const existing = await db.select().from(users).where(eq(users.email, adminEmail.toLowerCase()));
  if (existing.length === 0) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    await db.insert(users).values({
      email: adminEmail.toLowerCase(),
      name: adminName ?? "Admin",
      passwordHash,
      role: "admin",
    });
    console.log(`Created admin user ${adminEmail}. Log in and rotate this password periodically.`);
  } else {
    console.log(`Admin user ${adminEmail} already exists, skipping.`);
  }

  for (const p of SEED_PLATFORMS) {
    const found = await db.select().from(platforms).where(eq(platforms.name, p.name));
    if (found.length === 0) {
      await db.insert(platforms).values(p);
    }
  }
  console.log(`Seeded ${SEED_PLATFORMS.length} starter platforms (edit URLs before enabling ingestion).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
