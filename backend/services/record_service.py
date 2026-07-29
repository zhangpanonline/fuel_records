"""加油记录业务逻辑"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import desc

from models.fuel_record import FuelRecord
from schemas.record import FuelRecordCreate, FuelRecordUpdate


def create_record(db: Session, record_in: FuelRecordCreate, user_id: int) -> FuelRecord:
    """创建加油记录并计算油耗

    参数：
    - db: 数据库会话
    - record_in: 请求数据
    - user_id: 当前登录用户的 ID
    """
    # 0. 校验车辆是否存在且属于当前用户
    from models.vehicle import Vehicle
    vehicle = db.get(Vehicle, record_in.vehicle_id)
    if vehicle is None:
        raise ValueError(f"车辆不存在 (id={record_in.vehicle_id})")
    if vehicle.user_id != user_id:
        raise ValueError("无权为此车辆添加记录")

    # 1. 查询该车辆的上一条记录（按 record_date 倒序）
    last_record = (
        db.query(FuelRecord)
        .filter(FuelRecord.user_id == user_id, FuelRecord.vehicle_id == record_in.vehicle_id)
        .order_by(desc(FuelRecord.record_date))
        .first()
    )

    # 2. 判断是否为基线记录
    is_baseline = last_record is None

    # 3. 里程校验
    if last_record and record_in.mileage <= last_record.mileage:
        raise ValueError(
            f"里程数 ({record_in.mileage} km) 不能低于上一条记录 ({last_record.mileage} km)"
        )

    # 4. 创建 ORM 对象
    db_record = FuelRecord(
        user_id=user_id,
        vehicle_id=record_in.vehicle_id,
        mileage=record_in.mileage,
        fuel_volume=record_in.fuel_volume,
        fuel_cost=record_in.fuel_cost,
        unit_price=record_in.fuel_cost / record_in.fuel_volume,
        is_full_tank=record_in.is_full_tank,
        is_baseline=is_baseline,
        note=record_in.note or "",
    )

    # 5. 计算油耗
    if record_in.is_full_tank and not is_baseline:
        mile_diff = record_in.mileage - last_record.mileage
        consumption = record_in.fuel_volume / mile_diff * 100
        db_record.fuel_consumption = consumption.quantize(Decimal("0.00"))

    # 6. 写入数据库
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return db_record


def get_records(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    user_id: int | None = None,
    vehicle_id: int | None = None,
) -> tuple[list[FuelRecord], int]:
    """获取加油记录列表（分页，按时间倒序），按 user_id 和 vehicle_id 过滤"""
    query = db.query(FuelRecord)

    if user_id is not None:
        query = query.filter(FuelRecord.user_id == user_id)
    if vehicle_id is not None:
        query = query.filter(FuelRecord.vehicle_id == vehicle_id)

    total = query.count()

    records = (
        query
        .order_by(desc(FuelRecord.record_date))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return records, total


def recalculate_consumption(db: Session, from_record_date: datetime, user_id: int, vehicle_id: int) -> None:
    """级联重算：从指定日期开始，重新计算该车辆所有后继记录的油耗

    参数：
    - db: 数据库会话
    - from_record_date: 从哪个日期开始重算
    - user_id: 只重算该用户的记录（避免跨用户数据污染）
    - vehicle_id: 只重算该车辆的记录
    """
    previous = (
        db.query(FuelRecord)
        .filter(
            FuelRecord.user_id == user_id,
            FuelRecord.vehicle_id == vehicle_id,
            FuelRecord.record_date < from_record_date,
        )
        .order_by(desc(FuelRecord.record_date))
        .first()
    )

    records_to_update = (
        db.query(FuelRecord)
        .filter(
            FuelRecord.user_id == user_id,
            FuelRecord.vehicle_id == vehicle_id,
            FuelRecord.record_date >= from_record_date,
        )
        .order_by(FuelRecord.record_date)
        .all()
    )

    for record in records_to_update:
        if previous is None:
            record.is_baseline = True
            record.fuel_consumption = None
        else:
            record.is_baseline = False
            if record.mileage <= previous.mileage:
                raise ValueError(
                    f"里程数 ({record.mileage} km) 不能低于上一条记录 ({previous.mileage} km)"
                )
            if record.is_full_tank:
                mile_diff = record.mileage - previous.mileage
                consumption = record.fuel_volume / mile_diff * 100
                record.fuel_consumption = consumption.quantize(Decimal("0.00"))
            else:
                record.fuel_consumption = None

        previous = record

    db.commit()


def update_record(
    db: Session, record_id: int, record_in: FuelRecordUpdate, user_id: int
) -> FuelRecord:
    """修改加油记录（校验 user_id 归属），修改后级联重算"""
    db_record = db.get(FuelRecord, record_id)
    if db_record is None:
        raise ValueError(f"记录不存在 (id={record_id})")

    # 权限校验：只能修改自己的记录
    if db_record.user_id != user_id:
        raise ValueError("无权修改此记录")

    update_data = record_in.model_dump(exclude_unset=True)
    if not update_data:
        return db_record

    for field, value in update_data.items():
        setattr(db_record, field, value)

    if "fuel_volume" in update_data or "fuel_cost" in update_data:
        db_record.unit_price = db_record.fuel_cost / db_record.fuel_volume

    db.commit()
    recalculate_consumption(db, db_record.record_date, user_id, db_record.vehicle_id)
    db.refresh(db_record)
    return db_record


def delete_record(db: Session, record_id: int, user_id: int) -> FuelRecord:
    """删除加油记录（校验 user_id 归属），删除后级联重算"""
    db_record = db.get(FuelRecord, record_id)
    if db_record is None:
        raise ValueError(f"记录不存在 (id={record_id})")

    # 权限校验：只能删除自己的记录
    if db_record.user_id != user_id:
        raise ValueError("无权删除此记录")

    total = (
        db.query(FuelRecord)
        .filter(FuelRecord.user_id == user_id, FuelRecord.vehicle_id == db_record.vehicle_id)
        .count()
    )
    if total == 1 and db_record.is_baseline:
        raise ValueError("这是该车辆唯一的基线记录，无法删除。请先添加一条新记录后再删除。")

    record_date = db_record.record_date
    vehicle_id = db_record.vehicle_id

    db.delete(db_record)
    db.commit()

    recalculate_consumption(db, record_date, user_id, vehicle_id)

    return db_record
