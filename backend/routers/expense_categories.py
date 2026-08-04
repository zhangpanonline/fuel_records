"""分类管理 + 统计 API 路由"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.deps import get_current_user
from core.exceptions import BusinessError, to_http_status
from database import get_db
from models.user import User
from schemas.expense import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryListResponse
from schemas.expense_stats import ExpenseStatsResponse, MultiSummaryResponse
from services.expense_category_service import create_category, list_categories, update_category, delete_category
from services.expense_stats_service import get_stats, get_multi_summary

router = APIRouter(prefix="/api/v1/expenses", tags=["分类管理 & 统计"])


# ── 分类管理 ──

@router.post("/categories", response_model=CategoryResponse, status_code=201)
def api_create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return create_category(
            db=db,
            user_id=current_user.id,
            name=data.name,
            parent_id=data.parent_id,
            sort_order=data.sort_order or 0,
        )
    except BusinessError as e:
        raise HTTPException(to_http_status(e), e.message)


@router.get("/categories", response_model=CategoryListResponse)
def api_list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return CategoryListResponse(categories=list_categories(db=db, user_id=current_user.id))


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def api_update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return update_category(
            db=db,
            category_id=category_id,
            user_id=current_user.id,
            name=data.name,
            sort_order=data.sort_order,
        )
    except BusinessError as e:
        raise HTTPException(to_http_status(e), e.message)


@router.delete("/categories/{category_id}", status_code=204)
def api_delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        delete_category(db=db, category_id=category_id, user_id=current_user.id)
    except BusinessError as e:
        raise HTTPException(to_http_status(e), e.message)


# ── 统计 ──

@router.get("/stats", response_model=ExpenseStatsResponse)
def api_get_stats(
    start_date: date = Query(..., description="开始日期"),
    end_date: date = Query(..., description="结束日期"),
    group_by: str = Query("none", description="聚合粒度: none / month / week / year"),
    category_l1: Optional[str] = None,
    category_l2: Optional[str] = None,
    category_l3: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return get_stats(
            db=db, user_id=current_user.id,
            start_date=start_date, end_date=end_date,
            group_by=group_by,
            category_l1=category_l1, category_l2=category_l2, category_l3=category_l3,
        )
    except BusinessError as e:
        raise HTTPException(to_http_status(e), e.message)


@router.get("/multi_summary", response_model=MultiSummaryResponse)
def api_multi_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_multi_summary(db=db, user_id=current_user.id)
