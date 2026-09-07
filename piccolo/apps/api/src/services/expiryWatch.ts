import { db, schema } from "@piccolo/db";
import { eq } from "drizzle-orm";

export async function getExpiryWatch() {
  const [openTenders, currentDocs] = await Promise.all([
    db.select().from(schema.tenders).where(eq(schema.tenders.status, "active")),
    db.select().from(schema.vaultDocs).where(eq(schema.vaultDocs.current, true)),
  ]);
  if (openTenders.length === 0) return [];

  const earliestOpenClosing = openTenders.reduce(
    (min, t) => (t.closingAt < min ? t.closingAt : min),
    openTenders[0]!.closingAt,
  );

  return currentDocs
    .filter((d) => d.expiresAt < earliestOpenClosing)
    .map((d) => ({ ...d, earliestOpenClosing }));
}
