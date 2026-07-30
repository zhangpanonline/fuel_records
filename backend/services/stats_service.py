"""统计数据业务逻辑"""

from decimal import Decimal

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from models.fuel_record import FuelRecord


def get_summary(db: Session, user_id: int, vehicle_id: int) -> dict:
    """汇总统计：总里程、总加油量、总金额、平均油耗、平均单价

    参数：
    - db: 数据库会话
    - user_id: 当前用户 ID
    - vehicle_id: 车辆 ID
    """
    records = (
        db.query(FuelRecord)
        .filter(
            FuelRecord.user_id == user_id,
            FuelRecord.vehicle_id == vehicle_id,
        )
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

    # 总里程 = 最后一笔里程 - 第一笔里程
    total_mileage = float(records[-1].mileage - records[0].mileage)

    # 聚合计算
    result = (
        db.query(
            func.count(FuelRecord.id).label("record_count"),
            func.sum(FuelRecord.fuel_volume).label("total_fuel_volume"),
            func.sum(FuelRecord.fuel_cost).label("total_fuel_cost"),
            func.avg(FuelRecord.fuel_consumption).label("avg_consumption"),
            func.avg(FuelRecord.unit_price).label("avg_unit_price"),
        )
        .filter(
            FuelRecord.user_id == user_id,
            FuelRecord.vehicle_id == vehicle_id,
        )
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


def get_monthly(db: Session, user_id: int, vehicle_id: int, year: int) -> list[dict]:
    """月度统计：每月加油次数、总油量、总金额、平均油耗

    参数：
    - db: 数据库会话
    - user_id: 当前用户 ID
    - vehicle_id: 车辆 ID
    - year: 年份
    """
    records = (
        db.query(
            extract("month", FuelRecord.record_date).label("month"),
            func.count(FuelRecord.id).label("count"),
            func.sum(FuelRecord.fuel_volume).label("total_volume"),
            func.sum(FuelRecord.fuel_cost).label("total_cost"),
            func.avg(FuelRecord.fuel_consumption).label("avg_consumption"),
        )
        .filter(
            FuelRecord.user_id == user_id,
            FuelRecord.vehicle_id == vehicle_id,
            extract("year", FuelRecord.record_date) == year,
        )
        .group_by(extract("month", FuelRecord.record_date))
        .order_by(extract("month", FuelRecord.record_date))
        .all()
    )

    return [
        {
            "month": int(r.month),
            "count": r.count,
            "total_volume": round(float(r.total_volume or 0), 2),
            "total_cost": round(float(r.total_cost or 0), 2),
            "avg_consumption": round(float(r.avg_consumption), 2) if r.avg_consumption else None,
        }
        for r in records
    ]
