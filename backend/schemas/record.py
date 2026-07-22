"""加油记录 Pydantic Schema"""
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class FuelRecordCreate(BaseModel):
    """创建加油记录时的请求体"""
    mileage: Decimal = Field(..., decimal_places=1, gt=0, description="当前里程表读数 (km)")
    fuel_volume: Decimal = Field(..., decimal_places=2, gt=0, description="加油量 (L)")
    fuel_cost: Decimal = Field(..., decimal_places=2, gt=0, description="加油金额 (元)")
    is_full_tank: bool = Field(True, description="是否加满")
    note: str = Field("", description="备注")


class FuelRecordResponse(FuelRecordCreate):
    """加油记录响应体"""
    id: int
    unit_price: Decimal | None = None
    is_baseline: bool = False
    fuel_consumption: Decimal | None = None
    record_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class FuelRecordUpdate(BaseModel):
    """修改加油记录时的请求体（所有字段可选）"""
    mileage: Decimal | None = Field(None, decimal_places=1, gt=0)
    fuel_volume: Decimal | None = Field(None, decimal_places=2, gt=0)
    fuel_cost: Decimal | None = Field(None, decimal_places=2, gt=0)
    is_full_tank: bool | None = None
    note: str | None = None