"""统计 API 路由"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from core.deps import get_current_user
from models.user import User
from services.stats_service import get_summary, get_timeline

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])


@router.get("/summary")
def summary(
    vehicle_id: int = Query(..., gt=0, description="车辆 ID"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取车辆油耗汇总统计，可选日期范围过滤"""
    return get_summary(
        db,
        user_id=current_user.id,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/timeline")
def timeline(
    vehicle_id: int = Query(..., gt=0, description="车辆 ID"),
    group_by: str = Query("month", description="聚合粒度：day / week / month"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取车辆油耗时间线统计，支持按天/周/月聚合"""
    items = get_timeline(
        db,
        user_id=current_user.id,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
        group_by=group_by,
    )
    return {"items": items}


@router.get("/monthly")
def monthly(
    vehicle_id: int = Query(..., gt=0, description="车辆 ID"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """[兼容旧接口] 获取车辆月度油耗统计"""
    items = get_timeline(
        db,
        user_id=current_user.id,
        vehicle_id=vehicle_id,
        start_date=start_date,
        end_date=end_date,
        group_by="month",
    )
    return {"months": items}
