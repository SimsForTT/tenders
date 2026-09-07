"""
Phase 2: shared scraper interface.

Every portal-specific scraper (etenders.py, cidb.py, etc.) subclasses
BaseScraper and implements fetch() + parse(). run() is shared logic:
fetch -> parse -> hash each tender -> save raw HTML -> insert if new.

This keeps every future scraper (Phase 5+) structurally identical, so
main.py can loop over them without special-casing any portal.
"""

import hashlib
from abc import ABC, abstractmethod
from datetime import date
from pathlib import Path

from storage.db import insert_if_new

SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "snapshots"


class BaseScraper(ABC):
    """Base class all portal scrapers must implement."""

    portal_name: str = "unnamed_portal"

    @abstractmethod
    def fetch(self) -> str:
        """Fetch and return raw HTML for the portal's tender listing page."""
        raise NotImplementedError

    @abstractmethod
    def parse(self, html: str) -> list[dict]:
        """
        Parse raw HTML into a list of tender dicts, each with at least:
            title, ref_number, closing_date, url
        (portal, hash, first_seen, raw_html_path are added by run()).
        """
        raise NotImplementedError

    def _make_hash(self, tender: dict) -> str:
        raw = f"{tender.get('title','')}|{tender.get('ref_number','')}|{tender.get('closing_date','')}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _save_snapshot(self, html: str, tag: str) -> str:
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{self.portal_name}_{tag}_{date.today().isoformat()}.html"
        path = SNAPSHOT_DIR / filename
        path.write_text(html, encoding="utf-8")
        return str(path.relative_to(SNAPSHOT_DIR.parent))

    def run(self) -> list[dict]:
        """
        Fetch -> parse -> save snapshot -> dedup/insert.
        Returns the list of newly inserted tenders (empty list if none new).
        """
        html = self.fetch()
        snapshot_path = self._save_snapshot(html, "listing")

        tenders = self.parse(html)
        new_tenders = []

        for tender in tenders:
            tender["portal"] = self.portal_name
            tender["hash"] = self._make_hash(tender)
            tender["raw_html_path"] = snapshot_path

            if insert_if_new(tender):
                new_tenders.append(tender)

        return new_tenders
