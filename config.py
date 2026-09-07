"""
Central config for the tender scraper.

PORTALS: list of portal configs, each added when its scraper is built.
    Example (Phase 2+):
    {
        "name": "etenders",
        "base_url": "https://etenders.gov.za",
        "enabled": True,
    }

KEYWORDS: terms used to filter/match relevant tenders once scraping
    and matching logic is built (Phase 2+). Add Tholotlokwa-relevant
    terms here, e.g. mining, construction, engineering, IT/digital,
    Carletonville, Rustenburg, etc.
"""

PORTALS = []

KEYWORDS = []
