#!/usr/bin/env python3
"""
cleanup_fy2027_except_april.py

Deletes all data for FY2026/27 (April 2026 → March 2027) EXCEPT April 2026.

FY2026/27 spans:
  April 2026     (month_no=4, year=2026)  ← KEEP THIS
  May-Dec 2026   (month_no=5-12, year=2026)  ← DELETE
  Jan-Mar 2027   (month_no=1-3, year=2027)   ← DELETE

Usage:
  python cleanup_fy2027_except_april.py --test      # dry-run, show what would be deleted
  python cleanup_fy2027_except_april.py --delete    # actually delete the data
"""

import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import SessionLocal, Record
from sqlalchemy import and_, or_


def cleanup_fy2027_except_april(test_mode: bool = True):
    """
    Delete all records for FY2026/27 except April 2026.
    
    FY2026/27 runs April 2026 → March 2027:
      - Keep: April 2026 (year=2026, month_no=4)
      - Delete: May-Dec 2026 (year=2026, month_no=5-12)
      - Delete: Jan-Mar 2027 (year=2027, month_no=1-3)
    
    Args:
        test_mode: If True, show what would be deleted without actually deleting.
    
    Returns:
        tuple: (deleted_count, affected_zones)
    """
    db = SessionLocal()
    
    try:
        # Records to delete:
        #   (year=2026 AND month_no IN [5,6,7,8,9,10,11,12])  OR  (year=2027 AND month_no IN [1,2,3])
        records_to_delete = db.query(Record).filter(
            or_(
                and_(Record.year == 2026, Record.month_no.in_([5, 6, 7, 8, 9, 10, 11, 12])),
                and_(Record.year == 2027, Record.month_no.in_([1, 2, 3]))
            )
        ).all()
        
        affected_zones = set()
        affected_schemes = set()
        months_affected = set()
        
        for rec in records_to_delete:
            affected_zones.add(rec.zone)
            affected_schemes.add(rec.scheme)
            months_affected.add(f"{rec.month} {rec.year}")
        
        print("=" * 72)
        print("FY2026/27 Cleanup – Delete all months except April 2026")
        print("=" * 72)
        print(f"Mode          : {'TEST / DRY-RUN' if test_mode else 'PRODUCTION - WILL DELETE'}")
        print(f"Fiscal Year   : 2026/27 (April 2026 → March 2027)")
        print(f"Keep          : April 2026 (year=2026, month_no=4)")
        print(f"Delete        : May-Dec 2026 (year=2026, month_no=5-12)")
        print(f"              : Jan-Mar 2027 (year=2027, month_no=1-3)")
        print("")
        print(f"Records to delete      : {len(records_to_delete)}")
        print(f"Affected zones         : {len(affected_zones)} – {', '.join(sorted(affected_zones)) if affected_zones else 'none'}")
        print(f"Affected schemes       : {len(affected_schemes)}")
        print(f"Periods affected       : {', '.join(sorted(months_affected)) if months_affected else 'none'}")
        print("")
        
        if len(records_to_delete) == 0:
            print("⚠️  No records found to delete.")
            print("   Possible reasons:")
            print("   - Data may have already been deleted")
            print("   - Data hasn't been imported yet for FY2026/27")
            print("   - Check fiscal year and month values in database")
            print("")
        elif test_mode:
            print("TEST MODE – showing sample records to be deleted:")
            print("-" * 72)
            for i, rec in enumerate(records_to_delete[:10]):
                print(f"  {rec.zone} / {rec.scheme} / {rec.month} {rec.year} (year={rec.year}, month_no={rec.month_no})")
            if len(records_to_delete) > 10:
                print(f"  ... and {len(records_to_delete) - 10} more")
            print("")
            print("TEST MODE – No data was deleted. Run with --delete to confirm.")
        else:
            # Actually delete the records
            delete_count = db.query(Record).filter(
                or_(
                    and_(Record.year == 2026, Record.month_no.in_([5, 6, 7, 8, 9, 10, 11, 12])),
                    and_(Record.year == 2027, Record.month_no.in_([1, 2, 3]))
                )
            ).delete(synchronize_session='fetch')
            db.commit()
            print(f"✓ DELETED {delete_count} records from FY2026/27")
            print(f"✓ Kept April 2026 data (year=2026, month_no=4)")
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
        print("  python scripts/cleanup_fy2027_except_april.py --delete")
        sys.exit(0)
    else:
        print("\n✓ Cleanup complete!")
        sys.exit(0)
