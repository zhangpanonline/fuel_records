"""加油记录业务逻辑"""
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import desc
from models.fuel_record import FuelRecord
from schemas.record import FuelRecordCreate, FuelRecordUpdate


def create_record(db: Session, record_in: FuelRecordCreate) -> FuelRecord:
    """创建加油记录并计算油耗"""
    # 1. 查询上一条记录（按 record_date 倒序）
    last_record = (
        db.query(FuelRecord)
        .order_by(desc(FuelRecord.record_date))
        .first()
    )

    # 2. 判断是否为基线记录
    is_baseline = last_record is None

    # 3. 里程校验：新里程不能小于上一条记录的里程
    if last_record and record_in.mileage <= last_record.mileage:
        raise ValueError(
            f"里程数 ({record_in.mileage} km) 不能低于上一条记录 ({last_record.mileage} km)"
        )

    # 4. 创建 ORM 对象
    db_record = FuelRecord(
        mileage=record_in.mileage,
        fuel_volume=record_in.fuel_volume,
        fuel_cost=record_in.fuel_cost,
        unit_price=(
            record_in.fuel_cost / record_in.fuel_volume
        ),
        is_full_tank=record_in.is_full_tank,
        is_baseline=is_baseline,
        note=record_in.note or "",
    )

    # 5. 计算油耗
    #    条件：加满（is_full_tank=True）且非基线
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
) -> tuple[list[FuelRecord], int]:
    """获取加油记录列表（分页，按时间倒序）"""
    # 1. 计算总条数
    total = db.query(FuelRecord).count()

    # 2. 分页查询
    records = (
        db.query(FuelRecord)
        .order_by(desc(FuelRecord.record_date))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return records, total
