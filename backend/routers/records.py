"""加油记录 API 路由"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.fuel_record import FuelRecord
from schemas.record import FuelRecordCreate, FuelRecordResponse, FuelRecordUpdate, FuelRecordListResponse
from services.record_service import create_record, get_records, update_record, delete_record
from core.deps import get_current_user
from core.exceptions import BusinessError, to_http_status
from models.user import User

router = APIRouter(prefix="/api/v1/records", tags=["加油记录"])


@router.post("/", response_model=FuelRecordResponse)
def api_create_record(
    record_in: FuelRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建加油记录（需登录）"""
    try:
        return create_record(db=db, record_in=record_in, user_id=current_user.id)
    except BusinessError as e:
        raise HTTPException(status_code=to_http_status(e), detail=e.message)


@router.get("/", response_model=FuelRecordListResponse)
def api_get_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    vehicle_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    is_full_tank: Optional[bool] = None,
    note: Optional[str] = None,
):
    """获取当前用户的加油记录列表（分页），可按车辆/日期/加满/备注筛选"""
    records, total = get_records(
        db=db, page=page, page_size=page_size,
        user_id=current_user.id, vehicle_id=vehicle_id,
        start_date=start_date, end_date=end_date,
        is_full_tank=is_full_tank, note=note,
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": [FuelRecordResponse.model_validate(r) for r in records],
    }


@router.put("/{record_id}", response_model=FuelRecordResponse)
def api_update_record(
    record_id: int,
    record_in: FuelRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改加油记录（只能修改自己的记录）"""
    try:
        return update_record(db=db, record_id=record_id, record_in=record_in, user_id=current_user.id)
    except BusinessError as e:
        raise HTTPException(status_code=to_http_status(e), detail=e.message)


@router.delete("/{record_id}")
def api_delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除加油记录（只能删除自己的记录）"""
    try:
        delete_record(db=db, record_id=record_id, user_id=current_user.id)
        return {"detail": "删除成功"}
    except BusinessError as e:
        raise HTTPException(status_code=to_http_status(e), detail=e.message)
