"""
Phase 3: Discord alerting via an incoming webhook (free, no bot required).

Setup (one-time, on your machine):
    1. In your Discord server: Server Settings -> Integrations -> Webhooks
       -> New Webhook. Pick the channel you want alerts posted to.
    2. Copy the webhook URL.
    3. Put it in .env (copy from .env.example):
       DISCORD_WEBHOOK_URL=...

Usage:
    from notify.discord import send_alert
    send_alert(tender_dict)
    # or for a batch:
    send_alert_batch(list_of_tender_dicts)
"""

import os

import httpx
from dotenv import load_dotenv

load_dotenv()

DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

# Discord hard-caps a single message's `content` at 2000 characters.
MAX_MESSAGE_LENGTH = 2000


def _format_tender(tender: dict) -> str:
    lines = [f"🆕 **{tender.get('title', 'Untitled tender')}**"]
    if tender.get("ref_number"):
        lines.append(f"Ref: {tender['ref_number']}")
    if tender.get("closing_date"):
        lines.append(f"Closes: {tender['closing_date']}")
    if tender.get("portal"):
        lines.append(f"Portal: {tender['portal']}")
    if tender.get("url"):
        lines.append(tender["url"])
    return "\n".join(lines)


def _chunk_blocks(header: str, blocks: list[str]) -> list[str]:
    """Pack blocks into messages, each kept under MAX_MESSAGE_LENGTH."""
    chunks = []
    current = header
    for block in blocks:
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) > MAX_MESSAGE_LENGTH:
            if current:
                chunks.append(current)
            current = block
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _send_message(text: str) -> bool:
    if not DISCORD_WEBHOOK_URL:
        print("  [discord] Skipped: DISCORD_WEBHOOK_URL not set in .env")
        return False

    try:
        resp = httpx.post(DISCORD_WEBHOOK_URL, json={"content": text}, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"  [discord] Send failed: {e}")
        return False


def send_alert(tender: dict) -> bool:
    """Send a single tender alert. Returns True if sent successfully."""
    return _send_message(_format_tender(tender))


def send_alert_batch(tenders: list[dict]) -> bool:
    """Send one or more messages summarizing multiple new tenders."""
    if not tenders:
        return True
    header = f"📋 {len(tenders)} new tender(s) found:"
    blocks = [_format_tender(t) for t in tenders]
    chunks = _chunk_blocks(header, blocks)
    return all(_send_message(chunk) for chunk in chunks)
