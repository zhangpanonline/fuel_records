"""支出记录业务逻辑"""

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, BadRequestError, ForbiddenError
from models.expense import Expense
from models.expense_category import ExpenseCategory
from schemas.expense import ExpenseCreate, ExpenseUpdate


def _validate_category_chain(
    db: Session,
    user_id: int,
    l1: str,
    l2: str,
    l3: str,
):
    """校验 L1→L2→L3 构成合法的父子关系链，且均属于当前用户

    规则：
    - L1 的 level=1, parent_id=NULL
    - L2 的 level=2, parent_id=L1.id
    - L3 的 level=3, parent_id=L2.id
    """
    # 找 L1
    cat_l1 = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == user_id,
            ExpenseCategory.name == l1,
            ExpenseCategory.level == 1,
        )
        .first()
    )
    if not cat_l1:
        raise NotFoundError(f"一级分类 '{l1}' 不存在")

    # 找 L2（必须是 cat_l1 的子分类）
    cat_l2 = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == user_id,
            ExpenseCategory.name == l2,
            ExpenseCategory.level == 2,
            ExpenseCategory.parent_id == cat_l1.id,
        )
        .first()
    )
    if not cat_l2:
        raise BadRequestError(f"二级分类 '{l2}' 不属于一级分类 '{l1}'")

    # 找 L3（必须是 cat_l2 的子分类）
    cat_l3 = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == user_id,
            ExpenseCategory.name == l3,
            ExpenseCategory.level == 3,
            ExpenseCategory.parent_id == cat_l2.id,
        )
        .first()
    )
    if not cat_l3:
        raise BadRequestError(f"三级分类 '{l3}' 不属于二级分类 '{l2}'")


def create_expense(
    db: Session,
    user_id: int,
    data: ExpenseCreate,
) -> Expense:
    _validate_category_chain(db, user_id, data.category_l1, data.category_l2, data.category_l3)

    expense = Expense(
        user_id=user_id,
        amount=data.amount,
        category_l1=data.category_l1,
        category_l2=data.category_l2,
        category_l3=data.category_l3,
        note=data.note,
        expense_date=data.expense_date,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def get_expenses(
    db: Session,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category_l1: Optional[str] = None,
    category_l2: Optional[str] = None,
    category_l3: Optional[str] = None,
) -> tuple[list[Expense], int]:
    query = db.query(Expense).filter(Expense.user_id == user_id)

    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)
    if category_l1:
        query = query.filter(Expense.category_l1 == category_l1)
    if category_l2:
        query = query.filter(Expense.category_l2 == category_l2)
    if category_l3:
        query = query.filter(Expense.category_l3 == category_l3)

    total = query.count()
    items = (
        query
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def get_expense_by_id(db: Session, expense_id: int, user_id: int) -> Expense:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise NotFoundError("支出记录不存在")
    if expense.user_id != user_id:
        raise ForbiddenError("无权操作此记录")
    return expense


def update_expense(
    db: Session,
    expense_id: int,
    user_id: int,
    data: ExpenseUpdate,
) -> Expense:
    expense = get_expense_by_id(db, expense_id, user_id)

    # 如果修改了分类，需要校验分类链
    new_l1 = data.category_l1 or expense.category_l1
    new_l2 = data.category_l2 or expense.category_l2
    new_l3 = data.category_l3 or expense.category_l3

    if (
        data.category_l1 is not None
        or data.category_l2 is not None
        or data.category_l3 is not None
    ):
        _validate_category_chain(db, user_id, new_l1, new_l2, new_l3)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(expense, key, value)

    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, expense_id: int, user_id: int) -> None:
    expense = get_expense_by_id(db, expense_id, user_id)
    db.delete(expense)
    db.commit()
