"""支出记录与分类 Pydantic Schema"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── 支出记录 ──

class ExpenseCreate(BaseModel):
    amount: Decimal = Field(..., gt=0, description="金额（元），必须 > 0")
    category_l1: str = Field(..., min_length=1, max_length=50, description="一级分类名称")
    category_l2: str = Field(..., min_length=1, max_length=50, description="二级分类名称")
    category_l3: str = Field(..., min_length=1, max_length=50, description="三级分类名称")
    note: Optional[str] = Field(None, description="备注")
    expense_date: date = Field(..., description="支出日期，格式 YYYY-MM-DD")


class ExpenseUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0, description="金额（元），必须 > 0")
    category_l1: Optional[str] = Field(None, min_length=1, max_length=50, description="一级分类名称")
    category_l2: Optional[str] = Field(None, min_length=1, max_length=50, description="二级分类名称")
    category_l3: Optional[str] = Field(None, min_length=1, max_length=50, description="三级分类名称")
    note: Optional[str] = Field(None, description="备注")
    expense_date: Optional[date] = Field(None, description="支出日期，格式 YYYY-MM-DD")


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: Decimal
    category_l1: str
    category_l2: str
    category_l3: str
    note: Optional[str] = None
    expense_date: date
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
