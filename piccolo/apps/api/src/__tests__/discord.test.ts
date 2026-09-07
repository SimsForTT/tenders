import { describe, it, expect } from "vitest";
import { sendNewTenderAlert } from "../lib/discord.js";

describe("Discord alerts", () => {
  it("no-ops without throwing when DISCORD_WEBHOOK_URL is unset", async () => {
    // setupEnv.ts never sets DISCORD_WEBHOOK_URL - this locks in the
    // "optional, graceful skip" contract documented in workflows/README.md
    // and .env.example, ported from notify/discord.py's same behavior.
    await expect(
      sendNewTenderAlert({ title: "Test tender", tenderNo: "T-1", closingAt: "2026-01-01T00:00:00Z" }),
    ).resolves.toBeUndefined();
  });
});
