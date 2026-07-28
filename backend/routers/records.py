"""加油记录 API 路由"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas.record import FuelRecordCreate, FuelRecordResponse
from services.record_service import create_record, get_records

router = APIRouter(prefix="/api/v1/records", tags=["加油记录"])


@router.post("/", response_model=FuelRecordResponse)
def api_create_record(
    record_in: FuelRecordCreate,
    db: Session = Depends(get_db),
):
    """创建加油记录"""
    try:
        return create_record(db=db, record_in=record_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=dict)
def api_get_records(
    db: Session = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
):
    """获取加油记录列表（分页）"""
    records, total = get_records(db=db, page=page, page_size=page_size)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": [FuelRecordResponse.model_validate(r) for r in records],
    }
