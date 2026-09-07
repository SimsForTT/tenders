"""
Phase 2: eTenders portal scraper.

The listing page (LISTING_URL) renders its table via a client-side
DataTable (jQuery DataTables) that loads full tender records as JSON
into the page — the visible table columns only show a subset of that
data (no reference number or exact closing date/time is rendered into
a <td>, only a "closing in N days" string). Rather than scrape the
rendered HTML cells, fetch() drives the DataTable via Playwright to
sort by most-recently-published and expand its page size, then reads
the underlying row objects directly off the DataTables API
(`.rows().data()`), which include tender_No (reference number) and
closing_Date (exact ISO datetime) among other fields. This is far more
robust than CSS-selector scraping of the rendered cells.

There is no public per-tender detail page on this portal (details are
shown inline via an expandable row on this same listing page), so
`url` just points back at the listing page.
"""

import json

from playwright.sync_api import sync_playwright

from scrapers.base import BaseScraper

LISTING_URL = "https://www.etenders.gov.za/Home/opportunities?id=1"

# How many of the most-recently-published tenders to pull per run.
PAGE_LENGTH = 100


class EtendersScraper(BaseScraper):
    portal_name = "etenders"

    def fetch(self) -> str:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(LISTING_URL, wait_until="networkidle", timeout=30000)
            page.wait_for_selector("#tendeList tbody tr")

            # Column 4 is "date_Published"; sort newest-first and expand
            # the page size so a daily run sees recently posted tenders
            # instead of just the default alphabetical top-10.
            page.evaluate(
                """(pageLength) => {
                    const table = $('#tendeList').DataTable();
                    table.order([4, 'desc']).page.len(pageLength).draw();
                }""",
                PAGE_LENGTH,
            )
            page.wait_for_timeout(2000)

            rows = page.evaluate(
                "() => $('#tendeList').DataTable().rows().data().toArray()"
            )
            browser.close()
        return json.dumps(rows)

    def parse(self, html: str) -> list[dict]:
        rows = json.loads(html)
        tenders = []

        for row in rows:
            title = row.get("description")
            if not title:
                continue

            tenders.append({
                "title": title,
                "ref_number": row.get("tender_No"),
                "closing_date": row.get("closing_Date"),
                "url": LISTING_URL,
            })

        return tenders


def run():
    scraper = EtendersScraper()
    return scraper.run()
