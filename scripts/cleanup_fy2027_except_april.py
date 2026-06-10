#!/usr/bin/env python3
"""
cleanup_fy2027_except_april.py

Deletes all data for FY2026/27 (year=2027) EXCEPT April (month_no=4).
This ensures only April data is retained after the upload.

Usage:
  python cleanup_fy2027_except_april.py --test      # dry-run, show what would be deleted
  python cleanup_fy2027_except_april.py --delete    # actually delete the data
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal, Record, engine, create_tables


def cleanup_fy2027_except_april(test_mode: bool = True):
    """
    Delete all records for FY2026/27 (year=2027) except April (month_no=4).
    
    Args:
        test_mode: If True, show what would be deleted without actually deleting.
    
    Returns:
        tuple: (deleted_count, affected_zones)
    """
    db = SessionLocal()
    
    try:
        # Find all records to delete: year=2027 AND month_no != 4
        records_to_delete = db.query(Record).filter(
            Record.year == 2027,
            Record.month_no != 4
        ).all()
        
        affected_zones = set()
        affected_schemes = set()
        months_affected = set()
        
        for rec in records_to_delete:
            affected_zones.add(rec.zone)
            affected_schemes.add(rec.scheme)
            months_affected.add(rec.month)
        
        print("=" * 72)
        print("FY2026/27 Cleanup – Delete all months except April")
        print("=" * 72)
        print(f"Mode          : {'TEST / DRY-RUN' if test_mode else 'PRODUCTION - WILL DELETE'}")
        print(f"Fiscal Year   : 2026/27 (year=2027)")
        print(f"Keep          : April (month_no=4)")
        print(f"Delete        : All other months")
        print("")
        print(f"Records to delete      : {len(records_to_delete)}")
        print(f"Affected zones         : {len(affected_zones)} – {', '.join(sorted(affected_zones))}")
        print(f"Affected schemes       : {len(affected_schemes)}")
        print(f"Months affected        : {', '.join(sorted(months_affected))}")
        print("")
        
        if test_mode:
            print("TEST MODE – showing sample records to be deleted:")
            print("-" * 72)
            for i, rec in enumerate(records_to_delete[:10]):
                print(f"  {rec.zone} / {rec.scheme} / {rec.month} (month_no={rec.month_no})")
            if len(records_to_delete) > 10:
                print(f"  ... and {len(records_to_delete) - 10} more")
            print("")
            print("TEST MODE – No data was deleted. Run with --delete to confirm.")
        else:
            # Actually delete the records
            db.query(Record).filter(
                Record.year == 2027,
                Record.month_no != 4
            ).delete(synchronize_session='fetch')
            db.commit()
            print(f"✓ DELETED {len(records_to_delete)} records from FY2026/27 (kept April data)")
            print("")
        
        print("=" * 72)
        return len(records_to_delete), affected_zones
        
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 0, set()
    finally:
        db.close()


if __name__ == "__main__":
    test_mode = "--delete" not in sys.argv
    
    if not test_mode and "--delete" in sys.argv:
        print("\n⚠️  WARNING: You are about to DELETE data from the database!")
        print("This cannot be undone.\n")
        confirm = input("Type 'DELETE' to confirm: ").strip().upper()
        if confirm != "DELETE":
            print("Cancelled.")
            sys.exit(0)
    
    deleted, zones = cleanup_fy2027_except_april(test_mode=test_mode)
    
    if test_mode:
        print("\nTo delete this data, run:")
        print("  python cleanup_fy2027_except_april.py --delete")
        sys.exit(0)
    else:
        print("\n✓ Cleanup complete!")
        sys.exit(0)
