"""车辆 Pydantic Schema"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class VehicleCreate(BaseModel):
    """创建车辆时的请求体"""
    name: str = Field(..., min_length=1, max_length=50, description="车辆名称（如 KPT400）")
    plate: Optional[str] = Field(None, max_length=20, description="车牌号")
    initial_mileage: Decimal = Field(..., decimal_places=1, gt=0, description="初始里程 (km)")


class VehicleUpdate(BaseModel):
    """修改车辆时的请求体（所有字段可选）"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    plate: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class VehicleResponse(BaseModel):
    """车辆响应体"""
    id: int
    user_id: int
    name: str
    plate: Optional[str] = None
    initial_mileage: Decimal
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
