"""统计数据业务逻辑"""

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.fuel_record import FuelRecord


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    try:
        return datetime.strptime(val, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def get_summary(
    db: Session,
    user_id: int,
    vehicle_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """汇总统计：总里程、总加油量、总金额、平均油耗、平均单价"""
    filters = [
        FuelRecord.user_id == user_id,
        FuelRecord.vehicle_id == vehicle_id,
    ]

    s = _parse_date(start_date)
    e = _parse_date(end_date)
    if s:
        filters.append(FuelRecord.record_date >= s)
    if e:
        filters.append(FuelRecord.record_date < e + timedelta(days=1))

    records = (
        db.query(FuelRecord)
        .filter(*filters)
        .order_by(FuelRecord.record_date)
        .all()
    )

    if not records:
        return {
            "record_count": 0,
            "total_mileage": 0,
            "total_fuel_volume": 0,
            "total_fuel_cost": 0,
            "avg_consumption": None,
            "avg_unit_price": None,
        }

    total_mileage = float(records[-1].mileage - records[0].mileage)

    result = (
        db.query(
            func.count(FuelRecord.id).label("record_count"),
            func.sum(FuelRecord.fuel_volume).label("total_fuel_volume"),
            func.sum(FuelRecord.fuel_cost).label("total_fuel_cost"),
            func.avg(FuelRecord.fuel_consumption).label("avg_consumption"),
            func.avg(FuelRecord.unit_price).label("avg_unit_price"),
        )
        .filter(*filters)
        .first()
    )

    return {
        "record_count": result.record_count,
        "total_mileage": round(total_mileage, 1),
        "total_fuel_volume": round(float(result.total_fuel_volume or 0), 2),
        "total_fuel_cost": round(float(result.total_fuel_cost or 0), 2),
        "avg_consumption": round(float(result.avg_consumption), 2) if result.avg_consumption else None,
        "avg_unit_price": round(float(result.avg_unit_price), 2) if result.avg_unit_price else None,
    }


def get_timeline(
    db: Session,
    user_id: int,
    vehicle_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: str = "month",
) -> list[dict]:
    """时间线统计：按 day / week / month 聚合

    - day:   按天聚合，返回 {period: "2026-08-01"}
    - week:  从 start_date 起每 7 天一段，返回 {period: "08-01~08-07"}
    - month: 按月聚合，返回 {period: "2026-08"}
    """
    filters = [
        FuelRecord.user_id == user_id,
        FuelRecord.vehicle_id == vehicle_id,
    ]

    s = _parse_date(start_date)
    e = _parse_date(end_date)
    if s:
        filters.append(FuelRecord.record_date >= s)
    if e:
        filters.append(FuelRecord.record_date < e + timedelta(days=1))

    # 单条明细查询
    rows = (
        db.query(
            FuelRecord.record_date,
            FuelRecord.fuel_volume,
            FuelRecord.fuel_cost,
            FuelRecord.fuel_consumption,
        )
        .filter(*filters)
        .order_by(FuelRecord.record_date)
        .all()
    )

    if not rows:
        return []

    if group_by == "day":
        return _aggregate(rows, _key_builder_day())
    elif group_by == "week":
        base = s or rows[0].record_date.date()
        return _aggregate(rows, _key_builder_week(base))
    else:
        return _aggregate(rows, _key_builder_month())


# ── Key builders ──────────────────────────────

def _key_builder_day():
    """按天 key: 'YYYY-MM-DD'"""
    def key(r):
        return r.record_date.strftime("%Y-%m-%d") if hasattr(r.record_date, 'strftime') else str(r.record_date)[:10]
    return key


def _key_builder_week(base_date: date):
    """按周 key: (week_num, 'MM-DD~MM-DD') — tuple 保证跨年按整数排序"""
    def key(r):
        d = r.record_date.date() if hasattr(r.record_date, 'date') else r.record_date
        wn = (d - base_date).days // 7
        w_start = base_date + timedelta(days=wn * 7)
        w_end = w_start + timedelta(days=6)
        return (wn, f"{w_start.strftime('%m-%d')}~{w_end.strftime('%m-%d')}")
    return key


def _key_builder_month():
    """按月 key: 'YYYY-MM'"""
    def key(r):
        return r.record_date.strftime("%Y-%m") if hasattr(r.record_date, 'strftime') else str(r.record_date)[:7]
    return key


# ── Generic aggregation ───────────────────────

def _aggregate(rows, key_func) -> list[dict]:
    """通用时间聚合：按 key_func 分组 → 统计 count / volume / cost / avg consumption"""
    buckets: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_volume": 0.0, "total_cost": 0.0, "consumptions": []})

    for r in rows:
        k = key_func(r)
        buckets[k]["count"] += 1
        buckets[k]["total_volume"] += float(r.fuel_volume or 0)
        buckets[k]["total_cost"] += float(r.fuel_cost or 0)
        if r.fuel_consumption is not None:
            buckets[k]["consumptions"].append(float(r.fuel_consumption))

    result = []
    for period in sorted(buckets.keys()):
        b = buckets[period]
        consumptions = b["consumptions"]
        # tuple key → 提取 display label（如 (0, '08-01~08-07') → '08-01~08-07'）
        label = period[1] if isinstance(period, tuple) else period
        result.append({
            "period": label,
            "count": b["count"],
            "total_volume": round(b["total_volume"], 2),
            "total_cost": round(b["total_cost"], 2),
            "avg_consumption": round(sum(consumptions) / len(consumptions), 2) if consumptions else None,
        })
    return result
