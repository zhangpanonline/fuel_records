"""支出统计聚合业务逻辑 — PostgreSQL ROLLUP 多层级汇总"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, text, case, and_

from core.exceptions import BadRequestError

from models.expense import Expense
from services.expense_service import to_start_datetime, to_end_datetime
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
        Expense.expense_date >= to_start_datetime(start_date),
        Expense.expense_date <= to_end_datetime(end_date),
    )
    if category_l1:
        q = q.filter(Expense.category_l1 == category_l1)
    if category_l2:
        q = q.filter(Expense.category_l2 == category_l2)
    if category_l3:
        q = q.filter(Expense.category_l3 == category_l3)
    return q


def _compute_breakdown_rollup(db: Session, q) -> list[BreakdownItem]:
    """GROUP BY ROLLUP() 三级分类汇总

    从 ROLLUP 结果中直接提取 grand_total（三列均为 NULL 的最后一行），
    消除多余的独立 SUM 查询。
    """
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

    grand_total = Decimal("0")
    deferred: list[tuple] = []
    for r in rows:
        if r[3] is None:
            continue
        if r[0] is None and r[1] is None and r[2] is None:
            grand_total = Decimal(str(r[3]))
        else:
            deferred.append((r[0], r[1], r[2], Decimal(str(r[3]))))

    result: list[BreakdownItem] = []
    for l1, l2, l3, total in deferred:
        pct = round(float(total / grand_total * 100), 1) if grand_total > 0 else None
        result.append(BreakdownItem(
            category_l1=l1 or "",
            category_l2=l2,
            category_l3=l3,
            total=total,
            percentage=pct,
        ))
    # 保留总计行（category_l1="" 无子分类），兼容历史行为
    if grand_total > 0:
        result.append(BreakdownItem(
            category_l1="",
            category_l2=None,
            category_l3=None,
            total=grand_total,
            percentage=100.0 if grand_total > 0 else None,
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
    if group_by not in ("none", "month", "week", "year"):
        raise BadRequestError("group_by 仅支持 none / month / week / year")

    q = _build_query_filter(db, user_id, start_date, end_date, category_l1, category_l2, category_l3)

    if group_by == "none":
        total = q.with_entities(func.sum(Expense.amount)).scalar() or Decimal("0")
        count = q.count()
        days = (end_date - start_date).days + 1
        avg_daily = round(float(total) / days, 2) if days > 0 else 0

        breakdown = _compute_breakdown_rollup(db, q)

        return ExpenseStatsResponse(
            group_by="none",
            total_amount=total,
            record_count=count,
            avg_daily=avg_daily,
            category_breakdown=breakdown,
        )

    # ── 分时段模式：单次 ROLLUP 查询替代 N+1 ──
    if group_by == "month":
        period_format = "YYYY-MM"
    elif group_by == "week":
        period_format = 'IYYY-"W"IW'
    else:
        period_format = "YYYY"

    period_col = func.to_char(Expense.expense_date, period_format).label("period")
    col_l1 = Expense.category_l1
    col_l2 = Expense.category_l2
    col_l3 = Expense.category_l3
    amount_sum = func.sum(Expense.amount)

    rows = (
        q.with_entities(
            period_col, col_l1, col_l2, col_l3, amount_sum, func.count(Expense.id),
        )
        .group_by(text(f"ROLLUP(TO_CHAR(expense_date, '{period_format}'), category_l1, category_l2, category_l3)"))
        .order_by(period_col, col_l1, col_l2, col_l3)
        .all()
    )

    # 解析 ROLLUP 结果：
    #   (period, l1, l2, l3, sum, cnt) — 分类明细
    #   (period, NULL, NULL, NULL, sum, cnt) — 时间段合计
    #   (NULL, NULL, NULL, NULL, sum, cnt) — 总计
    from collections import defaultdict

    breakdowns_by_period: dict[str, list] = defaultdict(list)
    period_totals: dict[str, Decimal] = {}
    period_counts: dict[str, int] = {}

    for r in rows:
        period, l1, l2, l3, amt, cnt = r
        if amt is None:
            continue
        if period is None:
            continue  # grand total — 跳过
        if l1 is None and l2 is None and l3 is None:
            period_totals[period] = Decimal(str(amt))
            period_counts[period] = cnt
        else:
            breakdowns_by_period[period].append((l1 or "", l2, l3, Decimal(str(amt))))

    items: list[PeriodItem] = []
    for period in sorted(period_totals.keys()):
        p_total = period_totals[period]
        breakdown: list[BreakdownItem] = []
        for l1, l2, l3, total in breakdowns_by_period[period]:
            pct = round(float(total / p_total * 100), 1) if p_total > 0 else None
            breakdown.append(BreakdownItem(
                category_l1=l1, category_l2=l2, category_l3=l3,
                total=total, percentage=pct,
            ))
        items.append(PeriodItem(
            period=period,
            total=p_total,
            count=period_counts[period],
            breakdown=breakdown,
        ))

    return ExpenseStatsResponse(
        group_by=group_by,
        items=items,
    )


def get_multi_summary(db: Session, user_id: int, today: Optional[date] = None) -> MultiSummaryResponse:
    """一次查询返回 6 个时间区间的累计金额（CASE WHEN 替代 6 次独立 SUM）。"""
    if today is None:
        today = date.today()

    cy_start = date(today.year, 1, 1)
    cm_start = date(today.year, today.month, 1)
    monday = today - timedelta(days=today.weekday())
    year_ago = date(today.year - 1, today.month, today.day) + timedelta(days=1)
    days_30_ago = today - timedelta(days=30)
    days_7_ago = today - timedelta(days=7)

    def _case_if(start: date, end: date):
        return case((
            and_(Expense.expense_date >= to_start_datetime(start), Expense.expense_date <= to_end_datetime(end)),
            Expense.amount,
        ), else_=0)

    result = (
        db.query(
            func.sum(_case_if(cy_start, today)).label("current_year"),
            func.sum(_case_if(cm_start, today)).label("current_month"),
            func.sum(_case_if(monday, today)).label("current_week"),
            func.sum(_case_if(year_ago, today)).label("recent_year"),
            func.sum(_case_if(days_30_ago, today)).label("recent_month"),
            func.sum(_case_if(days_7_ago, today)).label("recent_week"),
        )
        .filter(Expense.user_id == user_id)
        .first()
    )

    def to_dec(val):
        return Decimal(str(val)) if val else Decimal("0")

    return MultiSummaryResponse(
        current_year=to_dec(result.current_year),
        current_month=to_dec(result.current_month),
        current_week=to_dec(result.current_week),
        recent_year=to_dec(result.recent_year),
        recent_month=to_dec(result.recent_month),
        recent_week=to_dec(result.recent_week),
    )
