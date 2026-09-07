import fs from "node:fs/promises";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

async function main() {
  await fs.mkdir(env.DOCUMENT_STORAGE_PATH, { recursive: true });

  const app = createApp();
  app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT, env: env.NODE_ENV }, "Piccolo API listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
