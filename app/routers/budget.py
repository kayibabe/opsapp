"""
routers/budget.py  —  Comprehensive Budget vs Actuals Variance Engine
FY2025/26  |  SRWB Southern Region Water Board

ANALYTICAL FRAMEWORK:
  Revenue Decomposition:  tariff fixed at MK 1,450/m³, so 100% of revenue
    variance = volume variance × tariff (IWA Op23 / IBNET volume produced).
  Zone Budgets:  IPSAS 18 segment allocation using FY actuals as basis
    (revenue share for revenue; volume share for costs/production).
  Statistical Process Control:  ISO 7870-2 Shewhart X-bar limits (2σ/3σ)
    computed from 11 months of corporate-level actuals.
  Budget Performance Index:  adapted from EVM — Actual÷Budget (>1 favourable
    for revenue/volume; Budget÷Actual for costs).
  Scheme Scoring:  composite of NRW, collection rate, revenue/m³, connections.

All monetary values: MWK.
"""
from __future__ import annotations
import statistics
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from app.database import Record, get_db

router = APIRouter(prefix="/api/budget", tags=["Budget"])

# ────────────────────────────────────────────────────────────────────────────
# APPROVED BUDGET — Table 29 (MWK) + Table 28 revenue line items
# Source: SRWB Draft Revenue & Capital Expenditure Budget FY2025/26
# ────────────────────────────────────────────────────────────────────────────
TARIFF_PER_M3    = 1_450.0   # MK 1,450/m³ — fixed, no tariff adjustment in FY

# Revenue (Table 28, K'000 × 1000)
BUD_WATER_SALES      = 16_719_582_000
BUD_BOTTLED_WATER    =  8_881_488_000   # new — no DB equivalent
BUD_AGENCY_RECONNECT =    158_494_000
BUD_METER_RENTAL     =    417_560_000
BUD_SERVICE_CHARGES  =    562_898_000
BUD_SUNDRY           =    315_012_000
BUD_RENTAL_INCOME    =     43_455_000
BUD_TOTAL_REVENUE    = 27_198_591_000   # full P&L revenue
BUD_WATER_REVENUE    = BUD_WATER_SALES  # water sales only (DB-comparable)

# Plant & Vehicle Operating Costs (Table 29)
BUD_MECH_ELEC_SPARES = 93_429_000
BUD_PLANT_MAINT      = 265_363_000
BUD_ELECTRICITY      = 1_754_765_000
BUD_CHEMICALS        = 1_057_349_000
BUD_BOTTLED_PROD     = 3_539_978_000   # bottled water production — no DB equiv
BUD_FUEL             = 1_317_750_000
BUD_OFFICE_EQUIP     = 24_892_000
BUD_PIPELINE_MAINT   = 879_633_000
BUD_MV_MAINT         = 379_475_000
BUD_WATER_PURCHASES  = 68_850_000
BUD_PLANT_VEH_TOTAL  = 9_381_484_000   # includes bottled water cost
BUD_PLANT_VEH_FIELD  = BUD_PLANT_VEH_TOTAL - BUD_BOTTLED_PROD  # 5,841,506,000

# Employee Costs (Table 29)
BUD_SALARIES         = 5_112_490_000
BUD_WAGES            = 812_407_000
BUD_PENSION          = 1_042_202_000
BUD_LIFE_COVER       = 219_986_000
BUD_FBT              = 113_612_000
BUD_GRATUITY         = 21_593_000
BUD_OVERTIME         = 414_317_000
BUD_MEDICAL          = 229_558_000
BUD_LEAVE_GRANT      = 94_071_000
BUD_TOTAL_EMPLOYEE   = 8_211_793_000

# Operating Costs (Table 29, selected key lines)
BUD_SECURITY         = 651_398_000
BUD_SUBSISTENCE      = 512_754_000
BUD_OUTSOURCED_MR    = 329_982_000
BUD_PRINTING_STAT    = 436_084_000
BUD_CONSULTING       = 168_073_000
BUD_TRAINING         = 142_600_000
BUD_TELEPHONE        = 124_920_000
BUD_PROPERTY_MAINT   = 126_937_000
BUD_TOTAL_OPEX       = 5_212_121_000

# Other Charges
BUD_DEPRECIATION     = 2_277_546_000
BUD_FINANCE_COSTS    = 2_066_088_000
BUD_TOTAL_OTHER      = 4_343_634_000

BUD_TOTAL_EXPENDITURE = 27_149_032_000

# Operational Targets (Tables 31, 39)
BUD_VOL_PRODUCED     = 15_883_399   # m³
BUD_VOL_SOLD         = 11_594_881   # m³
BUD_NRW_PCT          = 27.0
BUD_NEW_CUSTOMERS    = 8_588
BUD_ACTIVE_CUSTOMERS = 89_824
BUD_SUPPLY_HOURS     = 19.0         # hrs/day
BUD_COVERAGE_PCT     = 86.0
BUD_PIPELINES_KM     = 85.63        # km pipeline extension

# Zone proportional allocations (IPSAS 18 segment basis)
# Derived from FY2025/26 actual revenue and volume shares (11 months)
ZONE_REV_SHARE = {"Zomba":0.5651,"Mangochi":0.2115,"Liwonde":0.0970,"Ngabu":0.0777,"Mulanje":0.0488}
ZONE_VOL_SHARE = {"Zomba":0.5111,"Mangochi":0.2077,"Liwonde":0.1014,"Ngabu":0.0855,"Mulanje":0.0943}
ZONE_CONN_SHARE= {"Zomba":0.3558,"Mangochi":0.2881,"Liwonde":0.1287,"Ngabu":0.0979,"Mulanje":0.1295}

# SPC limits (ISO 7870-2 Shewhart, computed from 11 months of actuals)
SPC_LIMITS = {
    "nrw_pct":     {"mean":31.28,"std":1.12,"ucl2":33.52,"lcl2":29.03,"ucl3":34.65,"lcl3":27.91},
    "vol_prod":    {"mean":1205597,"std":65077,"ucl2":1335751,"lcl2":1075444,"ucl3":1400827,"lcl3":1010367},
    "sales":       {"mean":1226744754,"std":98900973,"ucl2":1424547700,"lcl2":1028942809},
    "connections": {"mean":669,"std":157,"ucl2":983,"lcl2":355,"ucl3":1140,"lcl3":198},
    "chems":       {"mean":117633260,"std":14907267,"ucl2":147447793,"lcl2":87818726},
    "power":       {"mean":72666277,"std":3983747,"ucl2":80633772,"lcl2":64698783},
}

MONTHS_LBL = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"]
FY_MNO     = [4,5,6,7,8,9,10,11,12,1,2,3]

def _fy_idx(yr,mno): return mno-4 if mno>=4 else mno+8

def _var(metric, actual, budget, unit="MWK", invert=False, scope="full", note="", iwa_pi=""):
    v = actual - budget
    vpct = (v/budget*100) if budget else None
    if abs(vpct or 0) < 2: direction = "on_budget"
    elif invert: direction = "favourable" if v < 0 else "adverse"
    else:        direction = "favourable" if v > 0 else "adverse"
    return {"metric":metric,"actual":round(actual,2),"budget_ytd":round(budget,2),
            "variance":round(v,2),"variance_pct":round(vpct,1) if vpct else None,
            "direction":direction,"unit":unit,"scope":scope,"note":note,"iwa_pi":iwa_pi}


@router.get("/variance")
def get_variance(year:int=2026, db:Session=Depends(get_db)):
    """
    Full variance analysis: revenue · costs · operational KPIs · zone breakdown.
    Returns monthly trends with SPC limits, zone comparison, scheme rankings,
    and performance indices aligned with IWA/IBNET framework.
    """
    # ── Actuals by month ────────────────────────────────────────────────
    q = (db.query(
            Record.year, Record.month_no,
            func.sum(Record.total_sales).label("sales"),
            func.sum(Record.amt_billed).label("billed"),
            func.sum(Record.cash_collected).label("collected"),
            func.sum(Record.service_charge).label("svc"),
            func.sum(Record.meter_rental).label("mtr"),
            func.sum(Record.op_cost).label("opex"),
            (func.sum(Record.staff_costs)+func.sum(Record.wages)).label("employee"),
            func.sum(Record.chem_cost).label("chems"),
            func.sum(Record.power_cost).label("power"),
            func.sum(Record.fuel_cost).label("fuel"),
            func.sum(Record.vol_produced).label("vp"),
            func.sum(Record.revenue_water).label("rw"),
            func.sum(Record.nrw).label("nrw_vol"),
            func.sum(Record.new_connections).label("conn"),
            func.sum(Record.dev_lines_total).label("pipelines"),
            func.sum(Record.pipe_breakdowns).label("pipe_bkdn"),
            func.avg(Record.supply_hours).label("sup_hrs"),
         )
         .filter(or_(and_(Record.year==year-1,Record.month_no>=4),
                     and_(Record.year==year, Record.month_no<=3)))
         .group_by(Record.year,Record.month_no)
         .order_by(Record.year,Record.month_no).all())

    by_idx = {_fy_idx(r.year,r.month_no):r for r in q}
    complete = [i for i,r in by_idx.items() if r.vp and r.vp>0]
    n = len(complete)
    if n==0: return {"error":"No data"}

    f = n/12.0
    last_idx = max(complete)
    last_lbl = MONTHS_LBL[last_idx]
    last_yr  = year-1 if FY_MNO[last_idx]>=4 else year
    last_mno = FY_MNO[last_idx]

    def S(fld): return sum((getattr(by_idx[i],fld) or 0) for i in complete)

    act_sales=S("sales"); act_billed=S("billed"); act_collected=S("collected")
    act_svc=S("svc"); act_mtr=S("mtr"); act_opex=S("opex"); act_employee=S("employee")
    act_chems=S("chems"); act_power=S("power"); act_fuel=S("fuel")
    act_vp=S("vp"); act_rw=S("rw"); act_nrw_vol=S("nrw_vol"); act_conn=int(S("conn"))
    act_pipes=S("pipelines"); act_pipe_bkdn=S("pipe_bkdn")

    act_nrw_pct  = act_nrw_vol/act_vp*100 if act_vp else 0
    act_coll_rt  = act_collected/act_billed*100 if act_billed else 0
    act_rev_m3   = act_sales/act_rw if act_rw else 0  # eff tariff per billed m³
    act_opex_m3  = act_opex/act_vp if act_vp else 0

    # Revenue decomposition: fixed tariff → all variance = volume × rate
    bud_rw_ytd = BUD_VOL_SOLD * f
    vol_var_m3  = act_rw - bud_rw_ytd
    rev_vol_effect = vol_var_m3 * TARIFF_PER_M3  # revenue variance from volume shortfall
    # NRW effect: extra NRW volume × tariff = lost revenue from water loss above budget
    bud_nrw_vol_ytd = BUD_VOL_PRODUCED*f * BUD_NRW_PCT/100
    nrw_var_vol = act_nrw_vol - bud_nrw_vol_ytd
    nrw_rev_impact = nrw_var_vol * TARIFF_PER_M3

    act_active = (db.query(func.sum(Record.active_customers))
                  .filter(Record.year==last_yr, Record.month_no==last_mno).scalar() or 0)
    act_sup_hrs= (db.query(func.avg(Record.supply_hours))
                  .filter(Record.year==last_yr, Record.month_no==last_mno).scalar() or 0)

    # ── Revenue variance rows ───────────────────────────────────────────
    revenue_rows = [
        _var("Water Sales (Tariff Revenue)", act_sales, BUD_WATER_SALES*f,
             note="Fixed tariff MK 1,450/m³. All variance = volume effect.",
             iwa_pi="Fi1/IBNET Revenue"),
        _var("Service Charges", act_svc, BUD_SERVICE_CHARGES*f,
             note="Fixed connection/standing charges.", iwa_pi="Fi2"),
        _var("Meter Rental", act_mtr, BUD_METER_RENTAL*f, iwa_pi="Fi2"),
        _var("Cash Collected", act_collected, BUD_WATER_SALES*f*0.90,
             note="Vs 90% IBNET collection rate benchmark applied to water budget.",
             iwa_pi="Fi9/IBNET Collection Rate"),
    ]

    # ── Revenue decomposition ─────────────────────────────────────────
    decomposition = {
        "tariff_per_m3": TARIFF_PER_M3,
        "budget_vol_sold_ytd_m3": round(bud_rw_ytd),
        "actual_vol_sold_m3":     round(act_rw),
        "volume_variance_m3":     round(vol_var_m3),
        "revenue_volume_effect_mk": round(rev_vol_effect),
        "budget_nrw_vol_ytd_m3":  round(bud_nrw_vol_ytd),
        "actual_nrw_vol_m3":      round(act_nrw_vol),
        "nrw_vol_variance_m3":    round(nrw_var_vol),
        "nrw_revenue_impact_mk":  round(nrw_rev_impact),
        "interpretation": (
            f"At fixed tariff MK {TARIFF_PER_M3:,.0f}/m³, the {round(vol_var_m3/1e6,2)}M m³ "
            f"volume shortfall accounts for MK {abs(rev_vol_effect)/1e9:.2f}B of revenue loss. "
            f"Excess NRW ({act_nrw_pct:.1f}% vs {BUD_NRW_PCT}% target) represents an additional "
            f"MK {abs(nrw_rev_impact)/1e9:.2f}B in unbilled production cost."
        ),
    }

    # ── Operational rows ──────────────────────────────────────────────
    operational_rows = [
        _var("Volume Produced",      act_vp,       BUD_VOL_PRODUCED*f,   unit="m³",   iwa_pi="Op23"),
        _var("Revenue Water Sold",   act_rw,       BUD_VOL_SOLD*f,       unit="m³",   iwa_pi="Op24"),
        _var("NRW %",                act_nrw_pct,  BUD_NRW_PCT,          unit="%",    invert=True, scope="target",
             note="Vol-weighted. SRWB target 27%, IWA <20%.",  iwa_pi="Op23/Wn1"),
        _var("NRW Volume",           act_nrw_vol,  BUD_VOL_PRODUCED*f*BUD_NRW_PCT/100, unit="m³", invert=True, iwa_pi="Wn1"),
        _var("New Connections",      act_conn,     BUD_NEW_CUSTOMERS*f,  unit="connections",       iwa_pi="Cu1"),
        _var("Active Customer Base", act_active,   BUD_ACTIVE_CUSTOMERS, unit="customers", scope="target",
             note=f"Latest: {last_lbl}; budget = year-end.",   iwa_pi="Cu1"),
        _var("Pipeline Extensions",  act_pipes,    BUD_PIPELINES_KM*1000*f, unit="m",
             note="Budget: 85.63 km annual. DB captures dev_lines_total.", iwa_pi="Qa2"),
        _var("Supply Hours/Day",     float(act_sup_hrs or 0), BUD_SUPPLY_HOURS, unit="hrs/day",
             scope="target", note=f"Latest month ({last_lbl}).", iwa_pi="Op4"),
        _var("Collection Rate",      act_coll_rt,  90.0,  unit="%", scope="target",
             note="Actual vs IBNET 90% benchmark.",             iwa_pi="Fi9"),
    ]

    # ── Detailed cost variance rows ────────────────────────────────────
    cost_rows = [
        # Field-comparable lines
        _var("Electricity / Power",  act_power,  BUD_ELECTRICITY*f,    invert=True,
             note="Field scheme power. Budget MK 1.75B (excl. bottled water).",
             iwa_pi="Op39/Ee1", scope="field"),
        _var("Water Treatment Chemicals", act_chems, BUD_CHEMICALS*f, invert=True,
             note="Field scheme chemicals. Budget MK 1.06B.",
             iwa_pi="Op34", scope="field"),
        _var("Fuel",                 act_fuel,   BUD_FUEL*f,           invert=True,
             note="Field fuel. Budget MK 1.32B. DB capture may be incomplete.",
             scope="field"),
        _var("Field Employee Costs", act_employee, (BUD_SALARIES+BUD_WAGES)*f, invert=True,
             note="DB = scheme field staff only. Corporate budget includes full establishment.",
             scope="field"),
        _var("Total Field OpEx",     act_opex,   (BUD_PLANT_VEH_FIELD+BUD_SALARIES+BUD_WAGES)*f*0.45,
             invert=True, scope="field",
             note="Field portion estimated at 45% of corporate P&V+Salaries budget."),
    ]

    # ── Derived efficiency KPIs (IWA PI) ─────────────────────────────
    efficiency_kpis = {
        "operating_ratio":        round(act_opex/act_sales,3) if act_sales else None,
        "opex_per_m3_produced":   round(act_opex/act_vp,2) if act_vp else None,
        "revenue_per_connection": round(act_sales/act_active,0) if act_active else None,
        "nrw_financial_cost_mk":  round(act_nrw_vol*TARIFF_PER_M3),
        "chemical_cost_per_m3":   round(act_chems/act_vp,2) if act_vp else None,
        "power_cost_per_m3":      round(act_power/act_vp,2) if act_vp else None,
        "collection_rate_pct":    round(act_coll_rt,2),
        "revenue_tariff_eff":     round(act_rev_m3,1),
        "connections_per_month":  round(act_conn/n,1),
        "budget_nrw_cost_mk":     round(BUD_VOL_PRODUCED*f*BUD_NRW_PCT/100*TARIFF_PER_M3),
        "bpi_revenue":            round(act_sales/(BUD_WATER_SALES*f),3) if BUD_WATER_SALES else None,
        "bpi_volume":             round(act_vp/(BUD_VOL_PRODUCED*f),3) if BUD_VOL_PRODUCED else None,
        "bpi_nrw":                round(BUD_NRW_PCT/act_nrw_pct,3) if act_nrw_pct else None,
        "bpi_connections":        round(act_conn/(BUD_NEW_CUSTOMERS*f),3) if BUD_NEW_CUSTOMERS else None,
    }

    # ── Zone-level actuals + proportional budgets ─────────────────────
    zone_q = (db.query(
            Record.zone,
            func.sum(Record.total_sales).label("sales"),
            func.sum(Record.amt_billed).label("billed"),
            func.sum(Record.cash_collected).label("collected"),
            func.sum(Record.service_charge).label("svc"),
            func.sum(Record.op_cost).label("opex"),
            func.sum(Record.chem_cost).label("chems"),
            func.sum(Record.power_cost).label("power"),
            func.sum(Record.vol_produced).label("vp"),
            func.sum(Record.revenue_water).label("rw"),
            func.sum(Record.nrw).label("nrw_vol"),
            func.sum(Record.new_connections).label("conn"),
            func.sum(Record.dev_lines_total).label("pipelines"),
            func.count(func.distinct(Record.scheme)).label("schemes"),
         )
         .filter(or_(and_(Record.year==year-1,Record.month_no>=4),
                     and_(Record.year==year, Record.month_no<=3)),
                 or_(Record.vol_produced > 0))
         .group_by(Record.zone).all())

    latest_cust = (db.query(Record.zone, func.sum(Record.active_customers).label("cust"))
                   .filter(Record.year==last_yr, Record.month_no==last_mno)
                   .group_by(Record.zone).all())
    cust_map = {r.zone: r.cust for r in latest_cust}

    zones = []
    for r in sorted(zone_q, key=lambda x: x.zone):
        z = r.zone
        rs  = ZONE_REV_SHARE.get(z,0)
        vs  = ZONE_VOL_SHARE.get(z,0)
        cs  = ZONE_CONN_SHARE.get(z,0)
        nrw_pct = r.nrw_vol/r.vp*100 if r.vp else 0
        coll_rt = r.collected/r.billed*100 if r.billed else 0
        rev_m3  = r.sales/r.rw if r.rw else 0
        cust    = cust_map.get(z,0)
        bud_sales_z = BUD_WATER_SALES * rs * f
        bud_vp_z    = BUD_VOL_PRODUCED * vs * f
        bud_conn_z  = BUD_NEW_CUSTOMERS * cs * f
        zones.append({
            "zone": z,
            "schemes": r.schemes,
            "actual_sales": round(r.sales),
            "actual_vol_produced": round(r.vp),
            "actual_rev_water": round(r.rw),
            "actual_nrw_vol": round(r.nrw_vol),
            "actual_nrw_pct": round(nrw_pct,2),
            "actual_connections": round(r.conn),
            "actual_opex": round(r.opex),
            "actual_chems": round(r.chems),
            "actual_power": round(r.power),
            "actual_collected": round(r.collected),
            "active_customers": round(cust),
            "collection_rate": round(coll_rt,1),
            "revenue_per_m3": round(rev_m3,1),
            "budget_sales_ytd": round(bud_sales_z),
            "budget_vol_ytd": round(bud_vp_z),
            "budget_connections_ytd": round(bud_conn_z),
            "sales_variance": round(r.sales - bud_sales_z),
            "sales_variance_pct": round((r.sales-bud_sales_z)/bud_sales_z*100,1) if bud_sales_z else None,
            "vol_variance": round(r.vp - bud_vp_z),
            "conn_variance": round(r.conn - bud_conn_z),
            "nrw_variance_pp": round(nrw_pct - BUD_NRW_PCT,2),
            "budget_share_pct": round(rs*100,1),
            "allocation_basis": "IPSAS 18 revenue-weighted proportional allocation",
        })

    # ── Zone monthly NRW for SPC visualization ────────────────────────
    zone_monthly_q = (db.query(
            Record.zone, Record.year, Record.month_no,
            func.sum(Record.vol_produced).label("vp"),
            func.sum(Record.nrw).label("nrw_vol"),
            func.sum(Record.total_sales).label("sales"),
            func.sum(Record.new_connections).label("conn"),
         )
         .filter(or_(and_(Record.year==year-1,Record.month_no>=4),
                     and_(Record.year==year, Record.month_no<=3)),
                 Record.vol_produced > 0)
         .group_by(Record.zone,Record.year,Record.month_no)
         .order_by(Record.zone,Record.year,Record.month_no).all())

    zone_monthly = {}
    for r in zone_monthly_q:
        z = r.zone
        if z not in zone_monthly:
            zone_monthly[z] = {"nrw_pct":[None]*12,"sales":[None]*12,"connections":[None]*12}
        idx = _fy_idx(r.year, r.month_no)
        if r.vp and r.vp > 0:
            zone_monthly[z]["nrw_pct"][idx] = round(r.nrw_vol/r.vp*100,2)
        zone_monthly[z]["sales"][idx] = round(r.sales or 0)
        zone_monthly[z]["connections"][idx] = round(r.conn or 0)

    # ── Scheme league table ───────────────────────────────────────────
    scheme_q = (db.query(
            Record.zone, Record.scheme,
            func.count().label("n"),
            func.sum(Record.vol_produced).label("vp"),
            func.sum(Record.revenue_water).label("rw"),
            func.sum(Record.nrw).label("nrw_vol"),
            func.sum(Record.total_sales).label("sales"),
            func.sum(Record.amt_billed).label("billed"),
            func.sum(Record.cash_collected).label("collected"),
            func.sum(Record.chem_cost).label("chems"),
            func.sum(Record.power_cost).label("power"),
            func.sum(Record.new_connections).label("conn"),
            func.avg(Record.supply_hours).label("sup_hrs"),
            func.sum(Record.pipe_breakdowns).label("pipe_bkdn"),
         )
         .filter(or_(and_(Record.year==year-1,Record.month_no>=4),
                     and_(Record.year==year, Record.month_no<=3)),
                 Record.vol_produced > 0)
         .group_by(Record.zone,Record.scheme).all())

    latest_cust_sch = (db.query(Record.scheme, func.sum(Record.active_customers).label("cust"))
                       .filter(Record.year==last_yr, Record.month_no==last_mno)
                       .group_by(Record.scheme).all())
    cust_sch_map = {r.scheme:r.cust for r in latest_cust_sch}

    schemes = []
    for r in scheme_q:
        nrw_pct  = r.nrw_vol/r.vp*100 if r.vp else 0
        coll_rt  = r.collected/r.billed*100 if r.billed else 0
        rev_m3   = r.sales/r.rw if r.rw else 0
        chem_m3  = r.chems/r.vp if r.vp else 0
        pwr_m3   = r.power/r.vp if r.vp else 0
        cust     = cust_sch_map.get(r.scheme,0)
        # Composite Performance Score (0–100, higher=better)
        # NRW: 27%=100pts, 45%=0pts; Collection: 100%=100pts; Rev/m³ vs 1450 tariff
        nrw_score = max(0, min(100, (45-nrw_pct)/(45-10)*100)) if nrw_pct else 50
        coll_score= min(100, coll_rt) if coll_rt else 0
        rev_score = min(100, rev_m3/TARIFF_PER_M3*100) if rev_m3 else 0
        conn_score= min(100, r.conn/max(1,r.n)*10) if r.conn else 0
        composite = round(nrw_score*0.35 + coll_score*0.35 + rev_score*0.20 + conn_score*0.10, 1)
        schemes.append({
            "zone": r.zone, "scheme": r.scheme,
            "months": r.n,
            "vol_produced_m3":    round(r.vp),
            "nrw_pct":            round(nrw_pct,2),
            "nrw_variance_pp":    round(nrw_pct - BUD_NRW_PCT,2),
            "revenue_mk":         round(r.sales),
            "revenue_per_m3":     round(rev_m3,1),
            "collection_rate":    round(coll_rt,1),
            "new_connections":    round(r.conn),
            "active_customers":   round(cust),
            "chem_per_m3":        round(chem_m3,2),
            "power_per_m3":       round(pwr_m3,2),
            "supply_hrs_avg":     round(r.sup_hrs or 0,1),
            "pipe_breakdowns":    round(r.pipe_bkdn or 0),
            "performance_score":  composite,
            "nrw_score":   round(nrw_score,1),
            "coll_score":  round(coll_score,1),
            "rev_score":   round(rev_score,1),
            "rag": "green" if composite>=70 else "amber" if composite>=50 else "red",
        })
    schemes.sort(key=lambda x: x["performance_score"], reverse=True)

    # ── Monthly corporate trend arrays ─────────────────────────────────
    trend = {"months": MONTHS_LBL, "complete": [i in complete for i in range(12)]}
    for attr,lbl in [("sales","actual_sales"),("billed","actual_billed"),
                      ("collected","actual_collected"),("opex","actual_opex"),
                      ("employee","actual_employee"),("chems","actual_chems"),
                      ("power","actual_power"),("fuel","actual_fuel"),
                      ("vp","actual_vol_prod"),("rw","actual_rev_water"),
                      ("nrw_vol","actual_nrw_vol"),("conn","actual_connections"),
                      ("pipelines","actual_pipelines"),("pipe_bkdn","actual_pipe_bkdn")]:
        trend[lbl]=[round(getattr(by_idx[i],attr) or 0,2) if i in by_idx else None for i in range(12)]

    trend["actual_nrw_pct"] = [
        round(by_idx[i].nrw_vol/by_idx[i].vp*100,2)
        if i in by_idx and by_idx[i].vp and by_idx[i].vp>0 else None
        for i in range(12)]

    trend["budget_sales"]    = [round(BUD_WATER_SALES/12)] * 12
    trend["budget_vol_prod"] = [round(BUD_VOL_PRODUCED/12)] * 12
    trend["budget_rev_water"]= [round(BUD_VOL_SOLD/12)] * 12
    trend["budget_nrw_pct"]  = [BUD_NRW_PCT] * 12
    trend["budget_connections"] = [round(BUD_NEW_CUSTOMERS/12)] * 12
    trend["budget_chems"]    = [round(BUD_CHEMICALS/12)] * 12
    trend["budget_power"]    = [round(BUD_ELECTRICITY/12)] * 12
    trend["spc_nrw_ucl2"]   = [SPC_LIMITS["nrw_pct"]["ucl2"]] * 12
    trend["spc_nrw_lcl2"]   = [SPC_LIMITS["nrw_pct"]["lcl2"]] * 12
    trend["spc_nrw_ucl3"]   = [SPC_LIMITS["nrw_pct"]["ucl3"]] * 12
    trend["spc_nrw_mean"]   = [SPC_LIMITS["nrw_pct"]["mean"]] * 12
    trend["spc_vp_ucl2"]    = [SPC_LIMITS["vol_prod"]["ucl2"]] * 12
    trend["spc_vp_lcl2"]    = [SPC_LIMITS["vol_prod"]["lcl2"]] * 12
    trend["spc_vp_mean"]    = [SPC_LIMITS["vol_prod"]["mean"]] * 12

    # ── Headline summary ───────────────────────────────────────────────
    all_rows = revenue_rows + operational_rows
    headline = {
        "n_adverse":    sum(1 for r in all_rows if r["direction"]=="adverse"),
        "n_favourable": sum(1 for r in all_rows if r["direction"]=="favourable"),
        "n_on_budget":  sum(1 for r in all_rows if r["direction"]=="on_budget"),
        "revenue_variance_mk": round(act_sales - BUD_WATER_SALES*f),
        "nrw_pp_variance":     round(act_nrw_pct - BUD_NRW_PCT,2),
        "conn_variance":       round(act_conn - BUD_NEW_CUSTOMERS*f),
        "cash_variance_mk":    round(act_collected - BUD_WATER_SALES*f*0.90),
        "chem_overrun_mk":     round(act_chems - BUD_CHEMICALS*f),
        "power_variance_mk":   round(act_power - BUD_ELECTRICITY*f),
        "nrw_financial_cost":  round(act_nrw_vol*TARIFF_PER_M3),
        "bpi_revenue":         efficiency_kpis["bpi_revenue"],
        "bpi_volume":          efficiency_kpis["bpi_volume"],
        "bpi_nrw":             efficiency_kpis["bpi_nrw"],
    }

    return {
        "meta": {
            "fiscal_year":    f"{year-1}/{str(year)[-2:]}",
            "data_months":    n,
            "period":         f"April {year-1} – {last_lbl} {last_yr}",
            "budget_factor":  round(f,4),
            "framework":      "IWA/IBNET PI | IPSAS 18 | ISO 7870-2 SPC | EVM-adapted BPI",
            "tariff_mk_m3":   TARIFF_PER_M3,
            "zone_allocation": "IPSAS 18 revenue-weighted proportional segment allocation",
        },
        "headline":        headline,
        "decomposition":   decomposition,
        "revenue":         revenue_rows,
        "operational":     operational_rows,
        "costs":           cost_rows,
        "efficiency_kpis": efficiency_kpis,
        "zones":           zones,
        "zone_monthly":    zone_monthly,
        "schemes":         schemes,
        "monthly":         trend,
        "spc_limits":      SPC_LIMITS,
        "budget_ref": {
            "water_sales": BUD_WATER_SALES,
            "total_revenue": BUD_TOTAL_REVENUE,
            "total_expenditure": BUD_TOTAL_EXPENDITURE,
            "vol_produced_target": BUD_VOL_PRODUCED,
            "vol_sold_target": BUD_VOL_SOLD,
            "nrw_target": BUD_NRW_PCT,
            "electricity_budget": BUD_ELECTRICITY,
            "chemicals_budget": BUD_CHEMICALS,
            "fuel_budget": BUD_FUEL,
            "pipeline_maint_budget": BUD_PIPELINE_MAINT,
            "salaries_wages_budget": BUD_SALARIES + BUD_WAGES,
            "new_customer_target": BUD_NEW_CUSTOMERS,
            "pipelines_km_target": BUD_PIPELINES_KM,
        },
    }
