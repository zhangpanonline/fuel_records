"""分类管理 + 统计 API 路由"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.expense_category import ExpenseCategory
from models.expense import Expense
from schemas.expense import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryListResponse
from schemas.expense_stats import ExpenseStatsResponse
from services.expense_stats_service import get_stats
from core.deps import get_current_user
from models.user import User

router = APIRouter(prefix="/api/v1/expenses", tags=["分类管理 & 统计"])


# ── 分类管理 ──

@router.post("/categories", response_model=CategoryResponse, status_code=201)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建分类"""
    # 计算 level
    if data.parent_id is None:
        level = 1
    else:
        parent = (
            db.query(ExpenseCategory)
            .filter(
                ExpenseCategory.id == data.parent_id,
                ExpenseCategory.user_id == current_user.id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(404, "父分类不存在")
        if parent.level >= 3:
            raise HTTPException(400, "分类最多支持 3 层")
        level = parent.level + 1

    # 检查同级同名
    existing = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == current_user.id,
            ExpenseCategory.parent_id == data.parent_id,
            ExpenseCategory.name == data.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(409, f"分类名称 '{data.name}' 已存在")

    category = ExpenseCategory(
        user_id=current_user.id,
        parent_id=data.parent_id,
        name=data.name,
        level=level,
        sort_order=data.sort_order or 0,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories", response_model=CategoryListResponse)
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的分类树（树形结构）"""
    categories = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.user_id == current_user.id)
        .order_by(ExpenseCategory.level, ExpenseCategory.sort_order, ExpenseCategory.id)
        .all()
    )

    # 构建树：先按 parent_id 分组
    children_map: dict[int | None, list[ExpenseCategory]] = {}
    for c in categories:
        children_map.setdefault(c.parent_id, []).append(c)

    def build_tree(parent_id):
        nodes = children_map.get(parent_id, [])
        result: list[dict] = []
        for n in nodes:
            result.append({
                "id": n.id,
                "name": n.name,
                "level": n.level,
                "sort_order": n.sort_order,
                "children": build_tree(n.id),
            })
        return result

    return CategoryListResponse(categories=build_tree(None))


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改分类名称/排序（禁止修改 parent_id）"""
    category = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.id == category_id,
            ExpenseCategory.user_id == current_user.id,
        )
        .first()
    )
    if not category:
        raise HTTPException(404, "分类不存在")

    if data.name is not None:
        # 检查同级同名
        existing = (
            db.query(ExpenseCategory)
            .filter(
                ExpenseCategory.user_id == current_user.id,
                ExpenseCategory.parent_id == category.parent_id,
                ExpenseCategory.name == data.name,
                ExpenseCategory.id != category_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(409, f"分类名称 '{data.name}' 已存在")
        category.name = data.name

    if data.sort_order is not None:
        category.sort_order = data.sort_order

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除分类（校验子分类 + 关联记录）"""
    category = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.id == category_id,
            ExpenseCategory.user_id == current_user.id,
        )
        .first()
    )
    if not category:
        raise HTTPException(404, "分类不存在")

    # 校验子分类
    child_count = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.parent_id == category_id)
        .count()
    )
    if child_count > 0:
        raise HTTPException(400, f"该分类下有 {child_count} 个子分类，请先删除子分类")

    # 校验关联支出记录：用分类名去 expenses 表查
    if category.level == 1:
        record_count = (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                Expense.category_l1 == category.name,
            )
            .count()
        )
    elif category.level == 2:
        # 需要找到 L2 所属的 L1 名称，然后联合匹配
        parent = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id == category.parent_id)
            .first()
        )
        l1_name = parent.name if parent else ""
        record_count = (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                Expense.category_l1 == l1_name,
                Expense.category_l2 == category.name,
            )
            .count()
        )
    else:  # level == 3
        parent = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id == category.parent_id)
            .first()
        )
        grandparent = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id == parent.parent_id)
            .first()
        ) if parent else None
        l1_name = grandparent.name if grandparent else ""
        l2_name = parent.name if parent else ""
        record_count = (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                Expense.category_l1 == l1_name,
                Expense.category_l2 == l2_name,
                Expense.category_l3 == category.name,
            )
            .count()
        )

    if record_count > 0:
        raise HTTPException(400, f"该分类下有 {record_count} 条支出记录，无法删除")

    db.delete(category)
    db.commit()


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
    """多维度聚合统计"""
    return get_stats(
        db=db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        group_by=group_by,
        category_l1=category_l1,
        category_l2=category_l2,
        category_l3=category_l3,
    )
