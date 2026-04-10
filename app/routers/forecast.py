
from fastapi import APIRouter
from app.services.forecast_engine import simple_forecast

router = APIRouter(prefix="/api/forecast")

@router.post("/")
def forecast(data: list):
    return simple_forecast(data)
