"""
Remove fiscal year rows outside the supported range (FY2015/16 → FY2029/30).
Safe to run while the server is running — only touches fiscal_years rows
for years < 2016 that have no associated records data anyway.
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from app.database import SessionLocal, FiscalYear, BudgetLine, BudgetZoneShare, SpcLimit

CUTOFF = 2016  # keep FY2015/16 (year=2016) and above

db = SessionLocal()
try:
    stale = db.query(FiscalYear).filter(FiscalYear.year < CUTOFF).all()
    if not stale:
        print(f"Nothing to remove — no FY rows below year {CUTOFF}.")
    else:
        for fy in stale:
            # Cascade-delete dependent rows (SQLite doesn't enforce FKs by default)
            db.query(BudgetLine).filter(BudgetLine.year == fy.year).delete()
            db.query(BudgetZoneShare).filter(BudgetZoneShare.year == fy.year).delete()
            db.query(SpcLimit).filter(SpcLimit.year == fy.year).delete()
            db.delete(fy)
            print(f"  Removed {fy.label} (year={fy.year})")
        db.commit()
        print(f"\n[OK] Removed {len(stale)} fiscal year(s). Range is now FY2015/16 to FY2029/30.")

    # Confirm what remains
    remaining = db.query(FiscalYear).order_by(FiscalYear.year).all()
    print(f"\nActive FY range: {remaining[0].label} → {remaining[-1].label} ({len(remaining)} years)")
finally:
    db.close()
