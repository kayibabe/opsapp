
from fastapi import APIRouter
from app.services.kpi_engine import compute_kpis

router = APIRouter(prefix="/api/kpis")

@router.get("/executive")
def get_kpis():
    return compute_kpis([])
