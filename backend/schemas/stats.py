"""统计数据 Pydantic Schema"""
from typing import Optional
from pydantic import BaseModel


class SummaryResponse(BaseModel):
    """汇总统计响应"""
    record_count: int
    total_mileage: float
    total_fuel_volume: float
    total_fuel_cost: float
    avg_consumption: Optional[float]
    avg_unit_price: Optional[float]


class MonthlyItem(BaseModel):
    """月度统计项"""
    month: int
    count: int
    total_volume: float
    total_cost: float
    avg_consumption: Optional[float]


class MonthlyResponse(BaseModel):
    """月度统计响应"""
    year: int
    months: list[MonthlyItem]
