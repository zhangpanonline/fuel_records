"""支出记录 API 路由"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, ExpenseListResponse
from services.expense_service import create_expense, get_expenses, get_expense_by_id, update_expense, delete_expense
from core.deps import get_current_user
from models.user import User

router = APIRouter(prefix="/api/v1/expenses", tags=["支出记录"])


@router.post("/", response_model=ExpenseResponse, status_code=201)
def api_create_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建支出记录"""
    return create_expense(db=db, user_id=current_user.id, data=data)


@router.get("/", response_model=ExpenseListResponse)
def api_get_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_l1: Optional[str] = None,
    category_l2: Optional[str] = None,
    category_l3: Optional[str] = None,
):
    """分页查询支出记录"""
    items, total = get_expenses(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        start_date=start_date,
        end_date=end_date,
        category_l1=category_l1,
        category_l2=category_l2,
        category_l3=category_l3,
    )
    return ExpenseListResponse(
        items=[ExpenseResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/{expense_id}", response_model=ExpenseResponse)
def api_update_expense(
    expense_id: int,
    data: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改支出记录"""
    return update_expense(db=db, expense_id=expense_id, user_id=current_user.id, data=data)


@router.delete("/{expense_id}", status_code=204)
def api_delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除支出记录"""
    delete_expense(db=db, expense_id=expense_id, user_id=current_user.id)
