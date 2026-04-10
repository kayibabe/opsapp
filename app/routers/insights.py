
from fastapi import APIRouter
from app.services.insights_engine import generate_insights

router = APIRouter(prefix="/api/insights")

@router.get("/summary")
def get_insights():
    return generate_insights([])
