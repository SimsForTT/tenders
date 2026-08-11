"""
Phase 1: SQLite storage layer.

Schema:
    tenders(
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ref_number     TEXT,
        title          TEXT NOT NULL,
        portal         TEXT NOT NULL,
        closing_date   TEXT,
        url            TEXT,
        hash           TEXT NOT NULL UNIQUE,
        first_seen     TEXT NOT NULL,   -- ISO timestamp, set automatically
        raw_html_path  TEXT
    )

Usage:
    from storage.db import init_db, insert_if_new, is_duplicate

    init_db()
    was_new = insert_if_new({
        "ref_number": "MKHO27/2025/26",
        "title": "Pour-flush toilet installation",
        "portal": "etenders",
        "closing_date": "2026-09-01",
        "url": "https://etenders.gov.za/...",
        "hash": "abc123...",
        "raw_html_path": "snapshots/etenders_MKHO27.html",
    })
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "tenders.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_number     TEXT,
    title          TEXT NOT NULL,
    portal         TEXT NOT NULL,
    closing_date   TEXT,
    url            TEXT,
    hash           TEXT NOT NULL UNIQUE,
    first_seen     TEXT NOT NULL,
    raw_html_path  TEXT
);
"""


def _connect():
    """Open a connection to the tenders DB (creates the file if absent)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the tenders table if it doesn't already exist."""
    conn = _connect()
    try:
        conn.execute(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def is_duplicate(hash_: str) -> bool:
    """Return True if a tender with this hash has already been stored."""
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT 1 FROM tenders WHERE hash = ? LIMIT 1", (hash_,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def insert_if_new(tender: dict) -> bool:
    """
    Insert a tender dict if its hash isn't already present.

    Required keys: title, portal, hash
    Optional keys: ref_number, closing_date, url, raw_html_path

    Returns True if inserted (new tender), False if it was a duplicate.
    """
    required = {"title", "portal", "hash"}
    missing = required - tender.keys()
    if missing:
        raise ValueError(f"tender dict missing required keys: {missing}")

    if is_duplicate(tender["hash"]):
        return False

    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO tenders
                (ref_number, title, portal, closing_date, url, hash, first_seen, raw_html_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tender.get("ref_number"),
                tender["title"],
                tender["portal"],
                tender.get("closing_date"),
                tender.get("url"),
                tender["hash"],
                datetime.now(timezone.utc).isoformat(),
                tender.get("raw_html_path"),
            ),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def all_tenders():
    """Return all stored tenders, most recently seen first."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM tenders ORDER BY first_seen DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
