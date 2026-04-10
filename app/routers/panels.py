"""
routers/panels.py — v4 (comprehensive data + UX fix)

Changes from v3:
  - _nz_avg() helper: averages only non-zero values with optional outlier cap
    (fixes days_to_connect inflation from Mangochi data-entry error)
  - _monthly() now returns ALL fields needed by every page's table and charts
  - All panel endpoints now return "monthly": mo (full data, no field filtering)
    so tables never get '—' from a missing key
  - supply_hours averaged over non-zero schemes per month
  - expenses panel now includes "monthly": mo
"""
from __future__ import annotations
from collections import defaultdict
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.database import Record, get_db

router = APIRouter(prefix="/api/panels", tags=["Panels"])

FY_MONTHS = [
    "April","May","June","July","August","September",
    "October","November","December","January","February","March",
]
ZONE_COLORS = {
    "Liwonde":"#0077b6","Mangochi":"#0d9488",
    "Mulanje":"#16a34a","Ngabu":"#d97706","Zomba":"#7c3aed",
}


# ── Helpers ────────────────────────────────────────────────────────────────

def _lk(r): return (r.year, r.month_no)

def _filter(q, zones=None, schemes=None, months=None, year=None):
    if zones:   q = q.filter(Record.zone.in_(zones))
    if schemes: q = q.filter(Record.scheme.in_(schemes))
    if months:  q = q.filter(Record.month.in_(months))
    if year:
        q = q.filter(or_(
            and_(Record.year == year-1, Record.month_no >= 4),
            and_(Record.year == year,   Record.month_no <= 3),
        ))
    return q

def _parse(v): return v.split(",") if v else None

def _latest(rows):
    lv = {}
    for r in rows:
        k = (r.zone, r.scheme)
        if k not in lv or _lk(r) > _lk(lv[k]): lv[k] = r
    return list(lv.values())

def _nz_avg(rows, field, cap=None):
    """Average of non-zero values; optionally cap outliers before averaging."""
    vals = []
    for r in rows:
        v = getattr(r, field, 0) or 0
        if v > 0 and (cap is None or v <= cap):
            vals.append(v)
    return round(sum(vals)/len(vals), 1) if vals else 0

def _nz_sum(rows, field):
    return sum(getattr(r, field, 0) or 0 for r in rows)


# ── by_zone aggregation ────────────────────────────────────────────────────

def _by_zone(rows):
    zd = defaultdict(list)
    for r in rows: zd[r.zone].append(r)
    result = []
    for zone, zrows in sorted(zd.items()):
        lv  = _latest(zrows)
        vol = _nz_sum(zrows, 'vol_produced')
        nrw = _nz_sum(zrows, 'nrw')
        ch  = _nz_sum(zrows, 'chem_cost')
        pw  = _nz_sum(zrows, 'power_cost')
        bi  = _nz_sum(zrows, 'amt_billed')
        ca  = _nz_sum(zrows, 'cash_collected')
        result.append({
            "zone": zone, "color": ZONE_COLORS.get(zone,"#64748b"),
            "vol_produced":      round(vol,1),
            "revenue_water":     round(_nz_sum(zrows,'revenue_water'),1),
            "nrw":               round(nrw,1),
            "nrw_pct":           round(nrw/vol*100,2) if vol else 0,
            "active_customers":  round(sum(r.active_customers  for r in lv)),
            "active_postpaid":   round(sum(r.active_postpaid   for r in lv)),
            "active_prepaid":    round(sum(r.active_prepaid    for r in lv)),
            "new_connections":   round(_nz_sum(zrows,'new_connections')),
            "conn_applied":      round(_nz_sum(zrows,'conn_applied')),
            "cash_collected":    round(ca,2),
            "amt_billed":        round(bi,2),
            "collection_rate":   round(ca/bi*100,1) if bi else 0,
            "op_cost":           round(_nz_sum(zrows,'op_cost'),2),
            "chem_cost":         round(ch,2),
            "power_cost":        round(pw,2),
            "power_kwh":         round(_nz_sum(zrows,'power_kwh'),1),
            "fuel_cost":         round(_nz_sum(zrows,'fuel_cost'),2),
            "staff_costs":       round(_nz_sum(zrows,'staff_costs'),2),
            "wages":             round(_nz_sum(zrows,'wages'),2),
            "maintenance":       round(_nz_sum(zrows,'maintenance'),2),
            "chlorine_kg":       round(_nz_sum(zrows,'chlorine_kg'),1),
            "alum_kg":           round(_nz_sum(zrows,'alum_kg'),1),
            "soda_ash_kg":       round(_nz_sum(zrows,'soda_ash_kg'),1),
            "pipe_breakdowns":   round(_nz_sum(zrows,'pipe_breakdowns')),
            "pump_breakdowns":   round(_nz_sum(zrows,'pump_breakdowns')),
            "dev_lines_total":   round(_nz_sum(zrows,'dev_lines_total')),
            "service_charge":    round(_nz_sum(zrows,'service_charge'),2),
            "meter_rental":      round(_nz_sum(zrows,'meter_rental'),2),
            "total_sales":       round(_nz_sum(zrows,'total_sales'),2),
            "private_debtors":   round(sum(max(0,r.private_debtors) for r in lv),2),
            "public_debtors":    round(sum(max(0,r.public_debtors)  for r in lv),2),
            "total_debtors":     round(sum(max(0,r.total_debtors)   for r in lv),2),
            "stuck_meters":      round(sum(max(0,r.stuck_meters)    for r in lv)),
            "stuck_new":         round(_nz_sum(zrows,'stuck_new')),
            "stuck_repaired":    round(_nz_sum(zrows,'stuck_repaired')),
            "amt_billed_pp":     round(_nz_sum(zrows,'amt_billed_pp'),2),
            "amt_billed_prepaid":round(_nz_sum(zrows,'amt_billed_prepaid'),2),
            "cash_coll_pp":      round(_nz_sum(zrows,'cash_coll_pp'),2),
            "cash_coll_prepaid": round(_nz_sum(zrows,'cash_coll_prepaid'),2),
        })
    return result


# ── Monthly series — ALL fields every page needs ───────────────────────────

def _monthly(rows):
    bm = defaultdict(list)
    for r in rows: bm[r.month].append(r)

    result = []
    for month in FY_MONTHS:
        mr = bm.get(month, [])
        if not mr:
            result.append({"month": month, "has_data": False}); continue

        lv  = _latest(mr)
        vol = _nz_sum(mr, 'vol_produced')
        # Mark months with zero production AND zero customers as no-data (stub rows)
        if vol == 0 and sum(r.active_customers for r in lv) == 0:
            result.append({"month": month, "has_data": False}); continue

        nrw    = _nz_sum(mr, 'nrw')
        chem   = _nz_sum(mr, 'chem_cost')
        power  = _nz_sum(mr, 'power_cost')
        billed = _nz_sum(mr, 'amt_billed')
        cash   = _nz_sum(mr, 'cash_collected')
        sales  = _nz_sum(mr, 'total_sales')
        opex   = _nz_sum(mr, 'op_cost')
        staff  = _nz_sum(mr, 'staff_costs')

        result.append({
            "month": month, "has_data": True,

            # ── Production & NRW ──────────────────────────────────────
            "vol_produced":           round(vol, 1),
            "revenue_water":          round(_nz_sum(mr,'revenue_water'), 1),
            "nrw":                    round(nrw, 1),
            "pct_nrw":                round(nrw/vol*100, 2) if vol else 0,
            "total_vol_billed_pp":    round(_nz_sum(mr,'total_vol_billed_pp'), 1),
            "total_vol_billed_prepaid":round(_nz_sum(mr,'total_vol_billed_prepaid'), 1),

            # ── Treatment chemicals ───────────────────────────────────
            "chlorine_kg":       round(_nz_sum(mr,'chlorine_kg'), 1),
            "alum_kg":           round(_nz_sum(mr,'alum_kg'), 1),
            "soda_ash_kg":       round(_nz_sum(mr,'soda_ash_kg'), 1),
            "algae_floc_litres": round(_nz_sum(mr,'algae_floc_litres'), 1),
            "sud_floc_litres":   round(_nz_sum(mr,'sud_floc_litres'), 1),
            "kmno4_kg":          round(_nz_sum(mr,'kmno4_kg'), 1),
            "chem_cost":         round(chem, 2),
            "chem_cost_per_m3":  round(chem/vol, 2) if vol else 0,

            # ── Power & Energy ────────────────────────────────────────
            "power_kwh":          round(_nz_sum(mr,'power_kwh'), 1),
            "power_cost":         round(power, 2),
            "power_cost_per_m3":  round(power/vol, 2) if vol else 0,
            # supply_hours: cap at 744 (31d×24h) to remove bogus values
            "supply_hours":       _nz_avg(mr, 'supply_hours', cap=744),
            "power_fail_hours":   round(_nz_sum(mr,'power_fail_hours')),

            # ── Customers (stock — latest per scheme) ─────────────────
            "total_metered":          round(sum(r.total_metered          for r in lv)),
            "total_disconnected":     round(sum(r.total_disconnected      for r in lv)),
            "active_customers":       round(sum(r.active_customers        for r in lv)),
            "active_postpaid":        round(sum(r.active_postpaid         for r in lv)),
            "active_prepaid":         round(sum(r.active_prepaid          for r in lv)),
            "active_post_individual": round(sum(r.active_post_individual  for r in lv)),
            "active_prep_individual": round(sum(r.active_prep_individual  for r in lv)),
            "active_post_inst":       round(sum(r.active_post_inst        for r in lv)),
            "active_prep_inst":       round(sum(r.active_prep_inst        for r in lv)),
            "active_post_commercial": round(sum(r.active_post_commercial  for r in lv)),
            "active_prep_commercial": round(sum(r.active_prep_commercial  for r in lv)),
            "active_post_cwp":        round(sum(r.active_post_cwp         for r in lv)),
            "active_prep_cwp":        round(sum(r.active_prep_cwp         for r in lv)),
            "perm_staff":             round(sum(r.perm_staff              for r in lv)),
            "temp_staff":             round(sum(r.temp_staff              for r in lv)),
            "pop_supplied":           round(sum(r.pop_supplied            for r in lv)),

            # ── Connections ───────────────────────────────────────────
            "new_connections":         round(_nz_sum(mr,'new_connections')),
            "conn_applied":            round(_nz_sum(mr,'conn_applied')),
            "prepaid_meters_installed":round(_nz_sum(mr,'prepaid_meters_installed')),
            "all_conn_bfwd":           round(sum(r.all_conn_bfwd for r in lv)),
            "all_conn_cfwd":           round(sum(r.all_conn_cfwd for r in lv)),
            "conn_fully_paid":         round(_nz_sum(mr,'conn_fully_paid')),

            # ── Connectivity — cap DTC at 365d (data-entry outliers exist) ──
            "days_to_quotation": _nz_avg(mr, 'days_to_quotation', cap=365),
            "days_to_connect":   _nz_avg(mr, 'days_to_connect',   cap=365),
            "connectivity_rate": _nz_avg(mr, 'connectivity_rate'),
            "queries_received":  round(_nz_sum(mr,'queries_received')),
            "time_to_resolve":   _nz_avg(mr, 'time_to_resolve',   cap=365),
            "response_time_avg": _nz_avg(mr, 'response_time_avg', cap=365),

            # ── Stuck meters (stock) ──────────────────────────────────
            "stuck_meters":  round(sum(max(0, r.stuck_meters) for r in lv)),
            "stuck_new":     round(_nz_sum(mr,'stuck_new')),
            "stuck_repaired":round(_nz_sum(mr,'stuck_repaired')),
            "stuck_replaced":round(_nz_sum(mr,'stuck_replaced')),

            # ── Breakdowns ────────────────────────────────────────────
            "pipe_breakdowns":   round(_nz_sum(mr,'pipe_breakdowns')),
            "pipe_pvc":          round(_nz_sum(mr,'pipe_pvc')),
            "pipe_gi":           round(_nz_sum(mr,'pipe_gi')),
            "pipe_di":           round(_nz_sum(mr,'pipe_di')),
            "pipe_hdpe_ac":      round(_nz_sum(mr,'pipe_hdpe_ac')),
            "pump_breakdowns":   round(_nz_sum(mr,'pump_breakdowns')),
            "pump_hours_lost":   round(_nz_sum(mr,'pump_hours_lost')),

            # ── Development lines ─────────────────────────────────────
            "dev_lines_32mm":  round(_nz_sum(mr,'dev_lines_32mm')),
            "dev_lines_50mm":  round(_nz_sum(mr,'dev_lines_50mm')),
            "dev_lines_63mm":  round(_nz_sum(mr,'dev_lines_63mm')),
            "dev_lines_90mm":  round(_nz_sum(mr,'dev_lines_90mm')),
            "dev_lines_110mm": round(_nz_sum(mr,'dev_lines_110mm')),
            "dev_lines_total": round(_nz_sum(mr,'dev_lines_total')),

            # ── Billing & Collections ─────────────────────────────────
            "amt_billed":        round(billed, 2),
            "amt_billed_pp":     round(_nz_sum(mr,'amt_billed_pp'), 2),
            "amt_billed_prepaid":round(_nz_sum(mr,'amt_billed_prepaid'), 2),
            "cash_collected":    round(cash, 2),
            "cash_coll_pp":      round(_nz_sum(mr,'cash_coll_pp'), 2),
            "cash_coll_prepaid": round(_nz_sum(mr,'cash_coll_prepaid'), 2),
            "collection_rate":   round(cash/billed*100, 2) if billed else 0,

            # ── Charges ───────────────────────────────────────────────
            "service_charge": round(_nz_sum(mr,'service_charge'), 2),
            "meter_rental":   round(_nz_sum(mr,'meter_rental'), 2),
            "total_sales":    round(sales, 2),
            "sc_mr_ratio":    round(_nz_sum(mr,'service_charge') /
                                    _nz_sum(mr,'meter_rental'), 3)
                              if _nz_sum(mr,'meter_rental') else 0,

            # ── Expenses ──────────────────────────────────────────────
            "op_cost":       round(opex, 2),
            "staff_costs":   round(staff, 2),
            "wages":         round(_nz_sum(mr,'wages'), 2),
            "fuel_cost":     round(_nz_sum(mr,'fuel_cost'), 2),
            "maintenance":   round(_nz_sum(mr,'maintenance'), 2),
            "other_overhead":round(_nz_sum(mr,'other_overhead'), 2),
            "op_cost_per_m3":round(opex/vol, 2) if vol else 0,

            # ── Debtors (stock) ───────────────────────────────────────
            "private_debtors":round(sum(max(0,r.private_debtors) for r in lv), 2),
            "public_debtors": round(sum(max(0,r.public_debtors)  for r in lv), 2),
            "total_debtors":  round(sum(max(0,r.total_debtors)   for r in lv), 2),
        })
    return result


def _base(zones, schemes, months, year, db):
    rows = _filter(db.query(Record),
                   _parse(zones), _parse(schemes), _parse(months), year).all()
    return rows, _by_zone(rows), _monthly(rows)


# ── Panel endpoints — all return "monthly": mo (complete data) ─────────────

@router.get("/production")
def panel_production(zones:Optional[str]=None,schemes:Optional[str]=None,
                     months:Optional[str]=None,year:Optional[int]=None,
                     db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    vol=_nz_sum(rows,'vol_produced'); nrw=_nz_sum(rows,'nrw')
    return {
        "kpi":{"vol_produced":round(vol,1),
               "revenue_water":round(_nz_sum(rows,'revenue_water'),1),
               "nrw":round(nrw,1),
               "nrw_pct":round(nrw/vol*100,2) if vol else 0},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "vol_produced":z["vol_produced"],"nrw_pct":z["nrw_pct"]} for z in bz],
        "monthly":mo,
    }

@router.get("/nrw")
def panel_nrw(zones:Optional[str]=None,schemes:Optional[str]=None,
              months:Optional[str]=None,year:Optional[int]=None,
              db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    vol=_nz_sum(rows,'vol_produced'); nrw=_nz_sum(rows,'nrw')
    return {
        "kpi":{"vol_produced":round(vol,1),"revenue_water":round(vol-nrw,1),
               "nrw":round(nrw,1),"nrw_pct":round(nrw/vol*100,2) if vol else 0},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "revenue_water":z["revenue_water"],
                    "nrw":z["nrw"],"nrw_pct":z["nrw_pct"]} for z in bz],
        "monthly":mo,
    }

@router.get("/wt-ei")
def panel_wt_ei(zones:Optional[str]=None,schemes:Optional[str]=None,
                months:Optional[str]=None,year:Optional[int]=None,
                db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    vol=_nz_sum(rows,'vol_produced') or 1
    chem=_nz_sum(rows,'chem_cost'); power=_nz_sum(rows,'power_cost')
    kwh=_nz_sum(rows,'power_kwh')
    return {
        "kpi":{
            "chem_cost":round(chem,2),"chem_per_m3":round(chem/vol,2),
            "chlorine_kg":round(_nz_sum(rows,'chlorine_kg'),1),
            "alum_kg":round(_nz_sum(rows,'alum_kg'),1),
            "soda_ash_kg":round(_nz_sum(rows,'soda_ash_kg'),1),
            "power_kwh":round(kwh,1),"power_cost":round(power,2),
            "power_per_m3":round(power/vol,2),
            "supply_hours_avg":_nz_avg(rows,'supply_hours',cap=744),
            "power_fail_hours":round(_nz_sum(rows,'power_fail_hours')),
        },
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "chem_cost":z["chem_cost"],"power_cost":z["power_cost"],
                    "power_kwh":z["power_kwh"],"chlorine_kg":z["chlorine_kg"]} for z in bz],
        "monthly":mo,
    }

@router.get("/customers")
def panel_customers(zones:Optional[str]=None,schemes:Optional[str]=None,
                    months:Optional[str]=None,year:Optional[int]=None,
                    db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    lv=_latest(rows)
    return {
        "kpi":{"active_customers":round(sum(r.active_customers for r in lv)),
               "active_postpaid":round(sum(r.active_postpaid   for r in lv)),
               "active_prepaid":round(sum(r.active_prepaid     for r in lv)),
               "pop_supplied":round(sum(r.pop_supplied          for r in lv)),
               "perm_staff":round(sum(r.perm_staff              for r in lv)),
               "temp_staff":round(sum(r.temp_staff              for r in lv))},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "active_customers":z["active_customers"],
                    "active_postpaid":z["active_postpaid"],
                    "active_prepaid":z["active_prepaid"]} for z in bz],
        "monthly":mo,
    }

@router.get("/connections")
def panel_connections(zones:Optional[str]=None,schemes:Optional[str]=None,
                      months:Optional[str]=None,year:Optional[int]=None,
                      db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    lv=_latest(rows)
    return {
        "kpi":{"new_connections":round(_nz_sum(rows,'new_connections')),
               "conn_applied":round(_nz_sum(rows,'conn_applied')),
               "all_conn_bfwd":round(sum(r.all_conn_bfwd for r in lv)),
               "all_conn_cfwd":round(sum(r.all_conn_cfwd for r in lv)),
               "prepaid_installed":round(_nz_sum(rows,'prepaid_meters_installed')),
               "distances_km":round(_nz_sum(rows,'distances_km'),1)},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "new_connections":z["new_connections"],
                    "conn_applied":z["conn_applied"]} for z in bz],
        "monthly":mo,
    }

@router.get("/stuck")
def panel_stuck(zones:Optional[str]=None,schemes:Optional[str]=None,
                months:Optional[str]=None,year:Optional[int]=None,
                db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    lv=_latest(rows)
    cf=sum(max(0,r.stuck_meters) for r in lv)
    new=_nz_sum(rows,'stuck_new'); rep=_nz_sum(rows,'stuck_repaired')
    repl=_nz_sum(rows,'stuck_replaced')
    active=sum(r.active_customers for r in lv) or 1
    return {
        "kpi":{"stuck_meters":round(cf),"stuck_new":round(new),
               "stuck_repaired":round(rep),"stuck_replaced":round(repl),
               "per_1k_customers":round(cf/active*1000,1),
               "repair_rate":round(rep/(new+rep)*100,1) if (new+rep) else 0},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "stuck_meters":z["stuck_meters"],"stuck_new":z["stuck_new"],
                    "stuck_repaired":z["stuck_repaired"]} for z in bz],
        "monthly":mo,
    }

@router.get("/connectivity")
def panel_connectivity(zones:Optional[str]=None,schemes:Optional[str]=None,
                       months:Optional[str]=None,year:Optional[int]=None,
                       db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    return {
        "kpi":{"conn_applied":round(_nz_sum(rows,'conn_applied')),
               "conn_fully_paid":round(_nz_sum(rows,'conn_fully_paid')),
               "days_to_quotation":_nz_avg(rows,'days_to_quotation',cap=365),
               "days_to_connect":_nz_avg(rows,'days_to_connect',cap=365),
               "connectivity_rate":_nz_avg(rows,'connectivity_rate'),
               "queries_received":round(_nz_sum(rows,'queries_received')),
               "time_to_resolve":_nz_avg(rows,'time_to_resolve',cap=365),
               "response_time_avg":_nz_avg(rows,'response_time_avg',cap=365)},
        "monthly":mo,
    }

@router.get("/breakdowns")
def panel_breakdowns(zones:Optional[str]=None,schemes:Optional[str]=None,
                     months:Optional[str]=None,year:Optional[int]=None,
                     db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    pipe=_nz_sum(rows,'pipe_breakdowns'); pump=_nz_sum(rows,'pump_breakdowns')
    lv=_latest(rows); active=sum(r.active_customers for r in lv) or 1
    return {
        "kpi":{"pipe_breakdowns":round(pipe),"pump_breakdowns":round(pump),
               "total":round(pipe+pump),
               "per_1k_customers":round((pipe+pump)/active*1000,1),
               "pump_hours_lost":round(_nz_sum(rows,'pump_hours_lost'))},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "pipe_breakdowns":z["pipe_breakdowns"],
                    "pump_breakdowns":z["pump_breakdowns"]} for z in bz],
        "monthly":mo,
    }

@router.get("/pipelines")
def panel_pipelines(zones:Optional[str]=None,schemes:Optional[str]=None,
                    months:Optional[str]=None,year:Optional[int]=None,
                    db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    return {
        "kpi":{"dev_lines_total":round(_nz_sum(rows,'dev_lines_total')),
               "dev_lines_32mm": round(_nz_sum(rows,'dev_lines_32mm')),
               "dev_lines_50mm": round(_nz_sum(rows,'dev_lines_50mm')),
               "dev_lines_63mm": round(_nz_sum(rows,'dev_lines_63mm')),
               "dev_lines_90mm": round(_nz_sum(rows,'dev_lines_90mm')),
               "dev_lines_110mm":round(_nz_sum(rows,'dev_lines_110mm'))},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "dev_lines_total":z["dev_lines_total"]} for z in bz],
        "size_split":[
            {"label":"32mm", "value":round(_nz_sum(rows,'dev_lines_32mm')), "color":"#0077b6"},
            {"label":"50mm", "value":round(_nz_sum(rows,'dev_lines_50mm')), "color":"#0d9488"},
            {"label":"63mm", "value":round(_nz_sum(rows,'dev_lines_63mm')), "color":"#16a34a"},
            {"label":"90mm", "value":round(_nz_sum(rows,'dev_lines_90mm')), "color":"#d97706"},
            {"label":"110mm","value":round(_nz_sum(rows,'dev_lines_110mm')),"color":"#7c3aed"},
        ],
        "monthly":mo,
    }

@router.get("/billed")
def panel_billed(zones:Optional[str]=None,schemes:Optional[str]=None,
                 months:Optional[str]=None,year:Optional[int]=None,
                 db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    pp=_nz_sum(rows,'amt_billed_pp'); pre=_nz_sum(rows,'amt_billed_prepaid')
    total=pp+pre
    return {
        "kpi":{"amt_billed":round(total,2),"amt_billed_pp":round(pp,2),
               "amt_billed_prepaid":round(pre,2),
               "pp_pct":round(pp/total*100,1) if total else 0,
               "prepaid_pct":round(pre/total*100,1) if total else 0,
               "total_sales":round(_nz_sum(rows,'total_sales'),2)},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "amt_billed":z["amt_billed"],"amt_billed_pp":z["amt_billed_pp"],
                    "amt_billed_prepaid":z["amt_billed_prepaid"]} for z in bz],
        "monthly":mo,
    }

@router.get("/collections")
def panel_collections(zones:Optional[str]=None,schemes:Optional[str]=None,
                      months:Optional[str]=None,year:Optional[int]=None,
                      db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    cash=_nz_sum(rows,'cash_collected'); billed=_nz_sum(rows,'amt_billed')
    return {
        "kpi":{"cash_collected":round(cash,2),"amt_billed":round(billed,2),
               "collection_rate":round(cash/billed*100,2) if billed else 0,
               "billing_gap":round(abs(billed-cash),2),
               "cash_coll_pp":round(_nz_sum(rows,'cash_coll_pp'),2),
               "cash_coll_prepaid":round(_nz_sum(rows,'cash_coll_prepaid'),2)},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "cash_collected":z["cash_collected"],"amt_billed":z["amt_billed"],
                    "collection_rate":z["collection_rate"]} for z in bz],
        "monthly":mo,
    }

@router.get("/charges")
def panel_charges(zones:Optional[str]=None,schemes:Optional[str]=None,
                  months:Optional[str]=None,year:Optional[int]=None,
                  db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    sc=_nz_sum(rows,'service_charge'); mr=_nz_sum(rows,'meter_rental')
    ts=_nz_sum(rows,'total_sales')
    return {
        "kpi":{"service_charge":round(sc,2),"meter_rental":round(mr,2),
               "total_sales":round(ts,2),
               "sc_pct":round(sc/ts*100,1) if ts else 0,
               "mr_pct":round(mr/ts*100,1) if ts else 0,
               "sc_mr_ratio":round(sc/mr,3) if mr else 0},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "service_charge":z["service_charge"],"meter_rental":z["meter_rental"],
                    "total_sales":z["total_sales"]} for z in bz],
        "monthly":mo,
    }

@router.get("/expenses")
def panel_expenses(zones:Optional[str]=None,schemes:Optional[str]=None,
                   months:Optional[str]=None,year:Optional[int]=None,
                   db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    op=_nz_sum(rows,'op_cost'); chem=_nz_sum(rows,'chem_cost')
    power=_nz_sum(rows,'power_cost'); fuel=_nz_sum(rows,'fuel_cost')
    staff=_nz_sum(rows,'staff_costs'); wages=_nz_sum(rows,'wages')
    maint=_nz_sum(rows,'maintenance'); kwh=_nz_sum(rows,'power_kwh')
    other=_nz_sum(rows,'other_overhead')
    return {
        "kpi":{"op_cost":round(op,2),"chem_cost":round(chem,2),
               "power_cost":round(power,2),"power_kwh":round(kwh,1),
               "fuel_cost":round(fuel,2),"staff_costs":round(staff,2),
               "wages":round(wages,2),"maintenance":round(maint,2)},
        "by_zone":[{"zone":z["zone"],"color":z["color"],"op_cost":z["op_cost"],
                    "chem_cost":z["chem_cost"],"power_cost":z["power_cost"]} for z in bz],
        "cost_split":[
            {"label":"Staff",       "value":round(staff,2), "color":"#0077b6"},
            {"label":"Wages",       "value":round(wages,2), "color":"#4DAFEE"},
            {"label":"Power",       "value":round(power,2), "color":"#d97706"},
            {"label":"Chemicals",   "value":round(chem,2),  "color":"#7c3aed"},
            {"label":"Fuel",        "value":round(fuel,2),  "color":"#dc2626"},
            {"label":"Maintenance", "value":round(maint,2), "color":"#16a34a"},
            {"label":"Other",       "value":round(max(0,op-staff-wages-power-chem-fuel-maint),2),
             "color":"#64748b"},
        ],
        "monthly":mo,
    }

@router.get("/debtors")
def panel_debtors(zones:Optional[str]=None,schemes:Optional[str]=None,
                  months:Optional[str]=None,year:Optional[int]=None,
                  db:Session=Depends(get_db)):
    rows,bz,mo=_base(zones,schemes,months,year,db)
    lv=_latest(rows)
    total=sum(max(0,r.total_debtors)   for r in lv)
    priv =sum(max(0,r.private_debtors) for r in lv)
    pub  =sum(max(0,r.public_debtors)  for r in lv)
    billed=_nz_sum(rows,'amt_billed')
    return {
        "kpi":{"total_debtors":round(total,2),"private_debtors":round(priv,2),
               "public_debtors":round(pub,2),
               "private_pct":round(priv/total*100,1) if total else 0,
               "debtors_to_billed":round(total/billed*100,1) if billed else 0},
        "by_zone":[{"zone":z["zone"],"color":z["color"],
                    "total_debtors":z["total_debtors"],
                    "private_debtors":z["private_debtors"],
                    "public_debtors":z["public_debtors"]} for z in bz],
        "monthly":mo,
    }
