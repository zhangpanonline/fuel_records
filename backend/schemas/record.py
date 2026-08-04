"""加油记录 Pydantic Schema"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class FuelRecordCreate(BaseModel):
    """创建加油记录时的请求体"""
    vehicle_id: int = Field(..., gt=0, description="所属车辆 ID")
    mileage: Decimal = Field(..., decimal_places=1, gt=0, description="当前里程表读数 (km)")
    fuel_volume: Decimal = Field(..., decimal_places=2, gt=0, description="加油量 (L)")
    fuel_cost: Decimal = Field(..., decimal_places=2, gt=0, description="加油金额 (元)")
    is_full_tank: bool = Field(True, description="是否加满")
    note: str = Field("", description="备注")


class FuelRecordResponse(BaseModel):
    """加油记录响应体"""
    id: int
    vehicle_id: Optional[int] = None
    user_id: Optional[int] = None
    mileage: Decimal
    fuel_volume: Decimal
    fuel_cost: Decimal
    is_full_tank: bool
    note: str
    unit_price: Optional[Decimal] = None
    is_baseline: bool = False
    fuel_consumption: Optional[Decimal] = None
    record_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class FuelRecordUpdate(BaseModel):
    """修改加油记录时的请求体（所有字段可选）"""
    mileage: Optional[Decimal] = Field(None, decimal_places=1, gt=0)
    fuel_volume: Optional[Decimal] = Field(None, decimal_places=2, gt=0)
    fuel_cost: Optional[Decimal] = Field(None, decimal_places=2, gt=0)
    is_full_tank: Optional[bool] = None
    note: Optional[str] = None


class FuelRecordListResponse(BaseModel):
    """加油记录列表响应体"""
    total: int
    page: int
    page_size: int
    records: list[FuelRecordResponse]
