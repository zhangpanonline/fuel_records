"""支出统计聚合业务逻辑 — 跨数据库兼容 ROLLUP"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, text
from fastapi import HTTPException

from config import settings
from models.expense import Expense
from schemas.expense_stats import (
    ExpenseStatsResponse,
    BreakdownItem,
    PeriodItem,
)


def _build_query_filter(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    category_l1: Optional[str],
    category_l2: Optional[str],
    category_l3: Optional[str],
):
    """构建查询过滤条件"""
    q = db.query(Expense).filter(
        Expense.user_id == user_id,
        Expense.expense_date >= start_date,
        Expense.expense_date <= end_date,
    )
    if category_l1:
        q = q.filter(Expense.category_l1 == category_l1)
    if category_l2:
        q = q.filter(Expense.category_l2 == category_l2)
    if category_l3:
        q = q.filter(Expense.category_l3 == category_l3)
    return q


def _compute_breakdown_rollup(db: Session, q) -> list[BreakdownItem]:
    """跨数据库 ROLLUP 兼容：
    - PostgreSQL / MySQL：使用 GROUP BY ROLLUP()
    - SQLite：多次 GROUP BY + Python UNION 聚合
    """
    db_type = settings.DB_TYPE

    if db_type in ("postgresql", "mysql"):
        # 原生 ROLLUP
        col_l1 = Expense.category_l1
        col_l2 = Expense.category_l2
        col_l3 = Expense.category_l3
        amount_sum = func.sum(Expense.amount)

        rows = (
            q.with_entities(
                col_l1, col_l2, col_l3, amount_sum,
            )
            .group_by(text("ROLLUP(category_l1, category_l2, category_l3)"))
            .order_by(col_l1, col_l2, col_l3)
            .all()
        )
    else:
        # SQLite：多次 GROUP BY + Python 合并
        rows = _breakdown_sqlite(q)

    # 计算总额用于 percentage — 直接用独立 SUM 查询，不依赖 ROLLUP 行排列顺序
    grand_total = Decimal(
        str(q.with_entities(func.sum(Expense.amount)).scalar() or 0)
    )

    result: list[BreakdownItem] = []
    for r in rows:
        total = Decimal(str(r[3]))
        pct = round(float(total / grand_total * 100), 1) if grand_total > 0 else None
        result.append(BreakdownItem(
            category_l1=r[0] or "",
            category_l2=r[1],
            category_l3=r[2],
            total=total,
            percentage=pct,
        ))
    return result


def _breakdown_sqlite(q) -> list:
    """SQLite 兼容 ROLLUP：分 4 层 GROUP BY + 手动合并"""
    from sqlalchemy import func as sa_func, null as sa_null
    col_l1 = Expense.category_l1
    col_l2 = Expense.category_l2
    col_l3 = Expense.category_l3
    amount_sum = sa_func.sum(Expense.amount)

    rows: list[tuple] = []

    # Level 0: L1 + L2 + L3
    r0 = (
        q.with_entities(col_l1, col_l2, col_l3, amount_sum)
        .group_by(col_l1, col_l2, col_l3)
        .order_by(col_l1, col_l2, col_l3)
        .all()
    )
    rows.extend(r0)

    # Level 1: L1 + L2 (L3 is NULL)
    r1 = (
        q.with_entities(col_l1, col_l2, sa_null(), amount_sum)
        .group_by(col_l1, col_l2)
        .order_by(col_l1, col_l2)
        .all()
    )
    rows.extend(r1)

    # Level 2: L1 only (L2, L3 are NULL)
    r2 = (
        q.with_entities(col_l1, sa_null(), sa_null(), amount_sum)
        .group_by(col_l1)
        .order_by(col_l1)
        .all()
    )
    rows.extend(r2)

    # Sort: L1 asc, then NULLs (汇总行) last within each L1 group
    # Python-side sorting: L1 first, then we put non-None L2 before None L2, etc.
    def sort_key(row):
        l1 = row[0] or ""
        l2 = row[1]
        l3 = row[2]
        return (l1, 0 if l2 is not None else 1, l2 or "", 0 if l3 is not None else 1, l3 or "")

    rows.sort(key=sort_key)
    return rows


def get_stats(
    db: Session,
    user_id: int,
    start_date: date,
    end_date: date,
    group_by: str = "none",
    category_l1: Optional[str] = None,
    category_l2: Optional[str] = None,
    category_l3: Optional[str] = None,
) -> ExpenseStatsResponse:
    q = _build_query_filter(db, user_id, start_date, end_date, category_l1, category_l2, category_l3)

    if group_by not in ("none", "month", "week", "year"):
        raise HTTPException(400, "group_by 仅支持 none / month / week / year")

    if group_by == "none":
        total = q.with_entities(func.sum(Expense.amount)).scalar() or Decimal("0")
        count = q.count()
        days = (end_date - start_date).days + 1  # 单日查询天数=1，避免除零
        avg_daily = round(float(total) / days, 2) if days > 0 else 0

        breakdown = _compute_breakdown_rollup(db, q)

        return ExpenseStatsResponse(
            group_by="none",
            total_amount=total,
            record_count=count,
            avg_daily=avg_daily,
            category_breakdown=breakdown,
        )

    # 分时段模式
    db_type = settings.DB_TYPE
    if group_by == "month":
        if db_type == "sqlite":
            period_expr = func.strftime("%Y-%m", Expense.expense_date)
        else:
            period_expr = func.date_format(Expense.expense_date, "%Y-%m")
    elif group_by == "week":
        if db_type == "sqlite":
            period_expr = func.strftime("%Y-W%W", Expense.expense_date)
        else:
            period_expr = func.date_format(Expense.expense_date, "%Y-W%u")
    else:  # year
        if db_type == "sqlite":
            period_expr = func.strftime("%Y", Expense.expense_date)
        else:
            period_expr = func.date_format(Expense.expense_date, "%Y")

    # 查询每个时间段的总金额和记录数
    period_rows = (
        q.with_entities(period_expr.label("period"), func.sum(Expense.amount).label("total"), func.count(Expense.id).label("count"))
        .group_by("period")
        .order_by("period")
        .all()
    )

    items: list[PeriodItem] = []
    for pr in period_rows:
        # 为这个时间段构建子查询获取 breakdown
        sub_q = _build_query_filter(db, user_id, start_date, end_date, category_l1, category_l2, category_l3)
        sub_q = sub_q.filter(period_expr == pr.period)
        breakdown = _compute_breakdown_rollup(db, sub_q)

        items.append(PeriodItem(
            period=pr.period,
            total=Decimal(str(pr.total)) if pr.total else Decimal("0"),
            count=pr.count,
            breakdown=breakdown,
        ))

    return ExpenseStatsResponse(
        group_by=group_by,
        items=items,
    )
