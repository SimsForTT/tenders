"""
Tender Scraper — entrypoint.

Phase 0: skeleton only.
Phase 1: SQLite storage initialized (storage/db.py).
Phase 2: runs scrapers.etenders and reports newly found tenders.
Phase 3: sends a Discord alert batch for any newly found tenders.
Phase 4: will be triggered on a schedule via GitHub Actions
Phase 5+: will loop over additional scrapers as they're added
"""

from storage.db import init_db
from scrapers.etenders import EtendersScraper
from notify.discord import send_alert_batch


def main():
    print("Tender Scraper — Phase 3: scraping + alerting.")

    init_db()

    scrapers = [EtendersScraper()]  # Phase 5+: append more portal scrapers here
    all_new_tenders = []

    for scraper in scrapers:
        print(f"\nRunning scraper: {scraper.portal_name}")
        try:
            new_tenders = scraper.run()
        except Exception as e:
            print(f"  FAILED: {e}")
            continue

        if not new_tenders:
            print("  No new tenders found.")
        else:
            print(f"  {len(new_tenders)} new tender(s) found:")
            for t in new_tenders:
                print(f"    - {t['title']} (ref: {t.get('ref_number')}, closes: {t.get('closing_date')})")
            all_new_tenders.extend(new_tenders)

    if all_new_tenders:
        print(f"\nSending Discord alert for {len(all_new_tenders)} new tender(s)...")
        sent = send_alert_batch(all_new_tenders)
        print("  Sent." if sent else "  Not sent (see message above).")
    else:
        print("\nNothing new to alert on.")


if __name__ == "__main__":
    main()
