"""统计数据业务逻辑"""

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
        return _group_by_day(rows)
    elif group_by == "week":
        return _group_by_week(rows, s or rows[0].record_date.date())
    else:
        return _group_by_month(rows)


def _group_by_day(rows) -> list[dict]:
    """按天聚合"""
    from collections import defaultdict

    buckets: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_volume": 0.0, "total_cost": 0.0, "consumptions": []})

    for r in rows:
        key = r.record_date.strftime("%Y-%m-%d") if hasattr(r.record_date, 'strftime') else str(r.record_date)[:10]
        buckets[key]["count"] += 1
        buckets[key]["total_volume"] += float(r.fuel_volume or 0)
        buckets[key]["total_cost"] += float(r.fuel_cost or 0)
        if r.fuel_consumption is not None:
            buckets[key]["consumptions"].append(float(r.fuel_consumption))

    result = []
    for period in sorted(buckets.keys()):
        b = buckets[period]
        consumptions = b["consumptions"]
        result.append({
            "period": period,
            "count": b["count"],
            "total_volume": round(b["total_volume"], 2),
            "total_cost": round(b["total_cost"], 2),
            "avg_consumption": round(sum(consumptions) / len(consumptions), 2) if consumptions else None,
        })
    return result


def _group_by_week(rows, base_date: date) -> list[dict]:
    """按 7 天一段聚合（从 base_date 开始）"""
    from collections import defaultdict

    buckets: dict[int, dict] = defaultdict(lambda: {"count": 0, "total_volume": 0.0, "total_cost": 0.0, "consumptions": []})

    for r in rows:
        d = r.record_date.date() if hasattr(r.record_date, 'date') else r.record_date
        week_num = (d - base_date).days // 7
        buckets[week_num]["count"] += 1
        buckets[week_num]["total_volume"] += float(r.fuel_volume or 0)
        buckets[week_num]["total_cost"] += float(r.fuel_cost or 0)
        if r.fuel_consumption is not None:
            buckets[week_num]["consumptions"].append(float(r.fuel_consumption))

    result = []
    for wn in sorted(buckets.keys()):
        b = buckets[wn]
        w_start = base_date + timedelta(days=wn * 7)
        w_end = w_start + timedelta(days=6)
        consumptions = b["consumptions"]
        result.append({
            "period": f"{w_start.strftime('%m-%d')}~{w_end.strftime('%m-%d')}",
            "count": b["count"],
            "total_volume": round(b["total_volume"], 2),
            "total_cost": round(b["total_cost"], 2),
            "avg_consumption": round(sum(consumptions) / len(consumptions), 2) if consumptions else None,
        })
    return result


def _group_by_month(rows) -> list[dict]:
    """按月聚合"""
    from collections import defaultdict

    buckets: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_volume": 0.0, "total_cost": 0.0, "consumptions": []})

    for r in rows:
        key = r.record_date.strftime("%Y-%m") if hasattr(r.record_date, 'strftime') else str(r.record_date)[:7]
        buckets[key]["count"] += 1
        buckets[key]["total_volume"] += float(r.fuel_volume or 0)
        buckets[key]["total_cost"] += float(r.fuel_cost or 0)
        if r.fuel_consumption is not None:
            buckets[key]["consumptions"].append(float(r.fuel_consumption))

    result = []
    for period in sorted(buckets.keys()):
        b = buckets[period]
        consumptions = b["consumptions"]
        result.append({
            "period": period,
            "count": b["count"],
            "total_volume": round(b["total_volume"], 2),
            "total_cost": round(b["total_cost"], 2),
            "avg_consumption": round(sum(consumptions) / len(consumptions), 2) if consumptions else None,
        })
    return result
