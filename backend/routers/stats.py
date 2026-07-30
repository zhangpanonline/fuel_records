"""统计 API 路由"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from core.deps import get_current_user
from models.user import User
from services.stats_service import get_summary, get_monthly

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/summary")
def summary(
    vehicle_id: int = Query(..., gt=0, description="车辆 ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取车辆油耗汇总统计"""
    return get_summary(db, user_id=current_user.id, vehicle_id=vehicle_id)


@router.get("/monthly")
def monthly(
    vehicle_id: int = Query(..., gt=0, description="车辆 ID"),
    year: int = Query(..., ge=2000, le=2100, description="年份"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取车辆月度油耗统计"""
    months = get_monthly(db, user_id=current_user.id, vehicle_id=vehicle_id, year=year)
    return {"year": year, "months": months}
