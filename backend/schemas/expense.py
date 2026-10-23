"""支出记录与分类 Pydantic Schema"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator


def _coerce_datetime(v: object) -> object:
    """把纯日期补全为当日 00:00 的 datetime。

    前端可能只传日期（YYYY-MM-DD），测试用例也常用 date 对象构造 schema，
    而 Pydantic 的 datetime 字段不接受 date 实例，故统一转换以兼容。
    """
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime.combine(v, time.min)
    return v


# ── 支出记录 ──

class ExpenseCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, description="金额（元），必须 > 0")
    category_l1: str = Field(..., min_length=1, max_length=50, description="一级分类名称")
    category_l2: str = Field(..., min_length=1, max_length=50, description="二级分类名称")
    category_l3: str = Field(..., min_length=1, max_length=50, description="三级分类名称")
    note: Optional[str] = Field(None, description="备注")
    expense_date: datetime = Field(..., description="支出日期时间，格式 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM")

    @field_validator("expense_date", mode="before")
    @classmethod
    def _coerce(cls, v: object) -> object:
        return _coerce_datetime(v)


class ExpenseUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0, description="金额（元），必须 > 0")
    category_l1: Optional[str] = Field(None, min_length=1, max_length=50, description="一级分类名称")
    category_l2: Optional[str] = Field(None, min_length=1, max_length=50, description="二级分类名称")
    category_l3: Optional[str] = Field(None, min_length=1, max_length=50, description="三级分类名称")
    note: Optional[str] = Field(None, description="备注")
    expense_date: Optional[datetime] = Field(None, description="支出日期时间，格式 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM")

    @field_validator("expense_date", mode="before")
    @classmethod
    def _coerce(cls, v: object) -> object:
        return _coerce_datetime(v)


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: Decimal
    category_l1: str
    category_l2: str
    category_l3: str
    note: Optional[str] = None
    expense_date: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None


class ExpenseListResponse(BaseModel):
    items: list[ExpenseResponse]
    total: int
    page: int
    page_size: int


# ── 分类管理 ──

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="分类名称")
    parent_id: Optional[int] = Field(None, description="父分类ID，NULL 表示一级分类")
    sort_order: Optional[int] = Field(0, description="排序权重，越小越靠前")


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="分类名称")
    sort_order: Optional[int] = Field(None, description="排序权重，越小越靠前")


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    level: int
    sort_order: int
    children: list["CategoryResponse"] = []


class CategoryListResponse(BaseModel):
    categories: list[CategoryResponse]
