"""支出统计聚合业务逻辑 — PostgreSQL ROLLUP 多层级汇总"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, text

from core.exceptions import BadRequestError

from models.expense import Expense
from schemas.expense_stats import (
    ExpenseStatsResponse,
    BreakdownItem,
    PeriodItem,
    MultiSummaryResponse,
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
    """GROUP BY ROLLUP() 三级分类汇总"""
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

    # 计算总额用于 percentage
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
        raise BadRequestError("group_by 仅支持 none / month / week / year")

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
    if group_by == "month":
        period_expr = func.to_char(Expense.expense_date, "YYYY-MM")
    elif group_by == "week":
        period_expr = func.to_char(Expense.expense_date, 'IYYY-"W"IW')
    else:  # year
        period_expr = func.to_char(Expense.expense_date, "YYYY")

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


def get_multi_summary(db: Session, user_id: int, today: Optional[date] = None) -> MultiSummaryResponse:
    """一次返回 6 个时间区间的累计金额，用于记账页统计卡片。"""
    if today is None:
        today = date.today()

    def _sum_between(start: date, end: date) -> Decimal:
        total = (
            db.query(func.sum(Expense.amount))
            .filter(
                Expense.user_id == user_id,
                Expense.expense_date >= start,
                Expense.expense_date <= end,
            )
            .scalar()
        )
        return Decimal(str(total)) if total else Decimal("0")

    # current_year: 1 月 1 日 ~ 今天
    current_year = _sum_between(date(today.year, 1, 1), today)

    # current_month: 本月 1 日 ~ 今天
    current_month = _sum_between(date(today.year, today.month, 1), today)

    # current_week: 本周一 ~ 今天
    monday = today - timedelta(days=today.weekday())
    current_week = _sum_between(monday, today)

    # recent_year: 12 个月前（不含） ~ 今天
    year_ago = date(today.year - 1, today.month, today.day) + timedelta(days=1)
    recent_year = _sum_between(year_ago, today)

    # recent_month: 30 天前 ~ 今天
    recent_month = _sum_between(today - timedelta(days=30), today)

    # recent_week: 7 天前 ~ 今天
    recent_week = _sum_between(today - timedelta(days=7), today)

    return MultiSummaryResponse(
        current_year=current_year,
        current_month=current_month,
        current_week=current_week,
        recent_year=recent_year,
        recent_month=recent_month,
        recent_week=recent_week,
    )
