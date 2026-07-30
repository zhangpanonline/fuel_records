"""加油记录 API 路由"""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models.fuel_record import FuelRecord
from schemas.record import FuelRecordCreate, FuelRecordResponse, FuelRecordUpdate
from services.record_service import create_record, get_records, update_record, delete_record
from core.deps import get_current_user
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=dict)
def api_get_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = 20,
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/export/csv")
def api_export_csv(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出当前用户指定车辆的所有加油记录为 CSV 文件"""
    records = (
        db.query(FuelRecord)
        .filter(
            FuelRecord.user_id == current_user.id,
            FuelRecord.vehicle_id == vehicle_id,
        )
        .order_by(FuelRecord.record_date)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)

    # CSV 表头
    writer.writerow([
        "ID", "里程(km)", "油量(L)", "金额(元)", "单价(元/L)",
        "是否加满", "油耗(L/100km)", "备注", "记录日期",
    ])

    for r in records:
        writer.writerow([
            r.id,
            f"{r.mileage}",
            f"{r.fuel_volume}",
            f"{r.fuel_cost}",
            f"{r.unit_price}" if r.unit_price is not None else "",
            "是" if r.is_full_tank else "否",
            f"{r.fuel_consumption}" if r.fuel_consumption is not None else "",
            r.note or "",
            r.record_date.strftime("%Y-%m-%d %H:%M") if r.record_date else "",
        ])

    output.seek(0)

    filename = f"fuel_records_{vehicle_id}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
