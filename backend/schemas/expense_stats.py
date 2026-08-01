"""支出统计 Pydantic Schema — 与 fuel 的 stats.py 区分"""

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class BreakdownItem(BaseModel):
    """全层级扁平列表中的一行"""
    category_l1: str
    category_l2: Optional[str] = None   # NULL 表示父级汇总行
    category_l3: Optional[str] = None
    total: Decimal
    percentage: Optional[float] = None


class PeriodItem(BaseModel):
    """分时段统计中的单条"""
    period: str                        # e.g. "2026-07" / "2026W31" / "2026"
    total: Decimal
    count: int
    breakdown: list[BreakdownItem] = []


class ExpenseStatsResponse(BaseModel):
    group_by: str                       # "none" / "month" / "week" / "year"

    # group_by="none"（汇总模式）专属字段
    total_amount: Optional[Decimal] = None
    record_count: Optional[int] = None
    avg_daily: Optional[float] = None
    category_breakdown: Optional[list[BreakdownItem]] = None

    # group_by="month/week/year"（分时段模式）专属字段
    items: Optional[list[PeriodItem]] = None


class MultiSummaryResponse(BaseModel):
    """多时间区间汇总（当年/当月/当周/近一年/近一月/近一周）"""
    current_year: Decimal = Decimal("0")
    current_month: Decimal = Decimal("0")
    current_week: Decimal = Decimal("0")
    recent_year: Decimal = Decimal("0")
    recent_month: Decimal = Decimal("0")
    recent_week: Decimal = Decimal("0")
