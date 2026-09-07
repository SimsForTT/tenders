import { env } from "../env.js";
import { logger } from "./logger.js";

/**
 * Ported from notify/discord.py in SimsForTT/tenders (master branch) -
 * that alerting was already built and proven (a real Discord incoming
 * webhook, free, no bot/OAuth setup). This keeps the same message shape
 * and the same graceful "skip if unset" behavior, adapted to Piccolo's
 * tender shape and called from routes/internal.ts instead of a
 * standalone script's main loop.
 */

// Discord hard-caps a single message's `content` at 2000 characters.
const MAX_MESSAGE_LENGTH = 2000;

export type AlertTender = {
  title: string;
  tenderNo?: string | null;
  closingAt?: string | null;
  portal?: string | null;
  url?: string | null;
};

function formatTender(t: AlertTender): string {
  const lines = [`\u{1F195} **${t.title || "Untitled tender"}**`];
  if (t.tenderNo) lines.push(`Ref: ${t.tenderNo}`);
  if (t.closingAt) lines.push(`Closes: ${t.closingAt}`);
  if (t.portal) lines.push(`Portal: ${t.portal}`);
  if (t.url) lines.push(t.url);
  return lines.join("\n");
}

async function sendMessage(content: string): Promise<boolean> {
  if (!env.DISCORD_WEBHOOK_URL) {
    logger.debug("Discord alert skipped: DISCORD_WEBHOOK_URL not set");
    return false;
  }
  try {
    // Discord's webhook API expects a JSON body with a "content" key -
    // Slack/Teams incoming webhooks use "text" instead, which is an easy
    // mismatch to introduce if you swap providers later without updating
    // the field name (see workflows/n8n/vault-expiry-watcher.json).
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Discord alert send failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "Discord alert send failed");
    return false;
  }
}

export async function sendNewTenderAlert(tender: AlertTender): Promise<void> {
  const content = formatTender(tender);
  // Discord rejects an over-length message outright rather than
  // truncating it itself - better a clipped alert than a silently
  // dropped one.
  await sendMessage(content.length > MAX_MESSAGE_LENGTH ? content.slice(0, MAX_MESSAGE_LENGTH - 1) + "…" : content);
}
