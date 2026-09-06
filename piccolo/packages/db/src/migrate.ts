import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const sqlClient = postgres(connectionString, { max: 1 });
const db = drizzle(sqlClient);

await migrate(db, { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
await sqlClient.end();
// eslint-disable-next-line no-console
console.log("Migrations applied.");
