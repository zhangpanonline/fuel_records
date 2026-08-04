"""支出分类业务逻辑"""

from typing import Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, BadRequestError, ConflictError
from models.expense import Expense
from models.expense_category import ExpenseCategory


def create_category(
    db: Session,
    user_id: int,
    name: str,
    parent_id: Optional[int],
    sort_order: int = 0,
) -> ExpenseCategory:
    """创建分类，自动计算 level"""
    if parent_id is None:
        level = 1
    else:
        parent = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.id == parent_id, ExpenseCategory.user_id == user_id)
            .first()
        )
        if not parent:
            raise NotFoundError("父分类不存在")
        if parent.level >= 3:
            raise BadRequestError("分类最多支持 3 层")
        level = parent.level + 1

    # 同级同名检查
    existing = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == user_id,
            ExpenseCategory.parent_id == parent_id,
            ExpenseCategory.name == name,
        )
        .first()
    )
    if existing:
        raise ConflictError(f"分类名称 '{name}' 已存在")

    category = ExpenseCategory(
        user_id=user_id,
        parent_id=parent_id,
        name=name,
        level=level,
        sort_order=sort_order,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _build_tree(
    db: Session,
    user_id: int,
) -> list[dict]:
    """查询当前用户全部分类，构建树形结构"""
    categories = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.user_id == user_id)
        .order_by(ExpenseCategory.level, ExpenseCategory.sort_order, ExpenseCategory.id)
        .all()
    )

    children_map: dict[int | None, list[ExpenseCategory]] = {}
    for c in categories:
        children_map.setdefault(c.parent_id, []).append(c)

    def walk(parent_id):
        nodes = children_map.get(parent_id, [])
        result: list[dict] = []
        for n in nodes:
            result.append({
                "id": n.id,
                "name": n.name,
                "level": n.level,
                "sort_order": n.sort_order,
                "children": walk(n.id),
            })
        return result

    return walk(None)


def list_categories(
    db: Session,
    user_id: int,
) -> list[dict]:
    """获取当前用户的分类树"""
    return _build_tree(db, user_id)


def update_category(
    db: Session,
    category_id: int,
    user_id: int,
    name: Optional[str] = None,
    sort_order: Optional[int] = None,
) -> ExpenseCategory:
    """修改分类名称/排序"""
    category = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == category_id, ExpenseCategory.user_id == user_id)
        .first()
    )
    if not category:
        raise NotFoundError("分类不存在")

    if name is not None:
        existing = (
            db.query(ExpenseCategory)
            .filter(
                ExpenseCategory.user_id == user_id,
                ExpenseCategory.parent_id == category.parent_id,
                ExpenseCategory.name == name,
                ExpenseCategory.id != category_id,
            )
            .first()
        )
        if existing:
            raise ConflictError(f"分类名称 '{name}' 已存在")
        category.name = name

    if sort_order is not None:
        category.sort_order = sort_order

    db.commit()
    db.refresh(category)
    return category


def delete_category(
    db: Session,
    category_id: int,
    user_id: int,
) -> None:
    """删除分类（校验子分类 + 关联记录）"""
    category = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == category_id, ExpenseCategory.user_id == user_id)
        .first()
    )
    if not category:
        raise NotFoundError("分类不存在")

    # 校验子分类
    child_count = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.parent_id == category_id)
        .count()
    )
    if child_count > 0:
        raise BadRequestError(f"该分类下有 {child_count} 个子分类，请先删除子分类")

    # 校验关联支出记录：根据 level 逐级匹配
    record_count = _count_linked_expenses(db, user_id, category)
    if record_count > 0:
        raise BadRequestError(f"该分类下有 {record_count} 条支出记录，无法删除")

    db.delete(category)
    db.commit()


def _count_linked_expenses(db: Session, user_id: int, category: ExpenseCategory) -> int:
    """按分类层级统计关联的支出记录数"""
    if category.level == 1:
        return (
            db.query(Expense)
            .filter(Expense.user_id == user_id, Expense.category_l1 == category.name)
            .count()
        )

    parent = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == category.parent_id)
        .first()
    )

    if category.level == 2:
        l1_name = parent.name if parent else ""
        return (
            db.query(Expense)
            .filter(
                Expense.user_id == user_id,
                Expense.category_l1 == l1_name,
                Expense.category_l2 == category.name,
            )
            .count()
        )

    # level == 3
    grandparent = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == parent.parent_id)
        .first()
    ) if parent else None
    l1_name = grandparent.name if grandparent else ""
    l2_name = parent.name if parent else ""
    return (
        db.query(Expense)
        .filter(
            Expense.user_id == user_id,
            Expense.category_l1 == l1_name,
            Expense.category_l2 == l2_name,
            Expense.category_l3 == category.name,
        )
        .count()
    )
