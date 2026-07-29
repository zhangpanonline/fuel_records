"""加油记录业务逻辑"""
from datetime import datetime
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


def recalculate_consumption(db: Session, from_record_date: datetime) -> None:
    """级联重算：从指定日期开始，重新计算所有后继记录的油耗

    使用场景：
    - 修改了某条记录 → 该记录及其后面所有记录的油耗都可能需要重算
    - 删除了某条记录 → 后面所有记录的"上一条"变了，油耗需要重算

    参数：
    - db: 数据库会话
    - from_record_date: 从哪个日期开始重算（包含该日期的记录）

    工作原理：
    1. 找到 from_record_date 之前的那条记录，作为"上一条"
    2. 查出 from_record_date 及之后的所有记录，按时间升序排列
    3. 逐条重算：用"当前里程 - 上一条里程"计算油耗
    """
    # 1. 找到"起点之前"的那条记录，作为第一条待重算记录的"上一条"
    #    filter: 查 record_date < from_record_date 的记录
    #    order_by(desc(...)): 按时间倒序，取第一条 = 离起点最近的那条
    #    first(): 只取第一条，如果没有就返回 None
    previous = (
        db.query(FuelRecord)
        # 找出"起点之前"的所有记录
        .filter(FuelRecord.record_date < from_record_date)
        # 按时间倒序，最新的在第一个
        .order_by(desc(FuelRecord.record_date))
        # 只取第一条。比如起点是 7月15日，之前有 7月1日和7月10日的记录，倒序后取第一条就是 7月10日 — 这就是离起点最近的那条"上一条"
        .first()
    )

    # 2. 查出所有需要重算的记录（从 from_record_date 开始，按时间升序）
    #    升序很重要，因为每条记录的计算都依赖上一条
    records_to_update = (
        db.query(FuelRecord)
        .filter(FuelRecord.record_date >= from_record_date)
        .order_by(FuelRecord.record_date)  # 升序
        .all()
    )

    # 3. 逐条重算油耗
    for record in records_to_update:
        if previous is None:
            # 没有上一条记录 → 这是整个表里的第一条记录 → 标记为基线
            record.is_baseline = True
            record.fuel_consumption = None
        else:
            # 有上一条记录 → 正常记录
            record.is_baseline = False

            # 里程校验：新里程不能小于上一条记录的里程
            if record.mileage <= previous.mileage:
                raise ValueError(
                    f"里程数 ({record.mileage} km) 不能低于上一条记录 ({previous.mileage} km)"
                )

            # 只有加满的情况下才计算油耗
            if record.is_full_tank:
                mile_diff = record.mileage - previous.mileage
                consumption = record.fuel_volume / mile_diff * 100
                record.fuel_consumption = consumption.quantize(Decimal("0.00"))
            else:
                # 没加满 → 不计算油耗
                record.fuel_consumption = None

        # 当前记录变成下一条记录的"上一条"
        previous = record

    # 4. 所有修改一次性提交到数据库
    db.commit()


def update_record(db: Session, record_id: int, record_in: FuelRecordUpdate) -> FuelRecord:
    """修改加油记录，修改后级联重算后继记录的油耗

    参数：
    - db: 数据库会话
    - record_id: 要修改的记录 ID
    - record_in: 修改的内容（所有字段可选，只更新传了的字段）

    返回：修改后的记录
    """
    # 1. 根据 ID 查记录
    #    db.get(Model, id): SQLAlchemy 的主键查询方法，比 filter 更高效
    #    如果找不到，返回 None
    db_record = db.get(FuelRecord, record_id)
    if db_record is None:
        raise ValueError(f"记录不存在 (id={record_id})")

    # 2. 只更新用户传了的字段
    #    model_dump(exclude_unset=True): Pydantic 的方法
    #    - 把 Pydantic 对象转成 dict
    #    - exclude_unset=True: 只包含用户"显式设置过"的字段
    #    举例：用户只传了 {"mileage": 53000}，那 update_data 就是 {"mileage": 53000}
    #          fuel_volume、fuel_cost 等字段不会被覆盖
    update_data = record_in.model_dump(exclude_unset=True)

    if not update_data:
        # 用户什么都没传（虽然不太可能，Pydantic 已经校验过）→ 直接返回原记录
        return db_record

    # 3. 把 update_data 里的字段逐个赋给 ORM 对象
    #    setattr(obj, "属性名", 值): Python 内置函数，等价于 obj.属性名 = 值
    for field, value in update_data.items():
        setattr(db_record, field, value)

    # 4. 如果修改了油量或金额，重新计算单价
    #    update_data 里有 fuel_volume 或 fuel_cost 就说明用户改了这两个字段
    if "fuel_volume" in update_data or "fuel_cost" in update_data:
        db_record.unit_price = db_record.fuel_cost / db_record.fuel_volume

    # 5. 先提交本次修改（让数据库知道这条记录变了）
    db.commit()

    # 6. 级联重算：从这条记录开始，后面所有记录的油耗都要重新算
    recalculate_consumption(db, db_record.record_date)

    # 7. 刷新 ORM 对象（recaculate_consumption 可能改了其他字段例如 is_baseline）
    db.refresh(db_record)

    return db_record


def delete_record(db: Session, record_id: int) -> FuelRecord:
    """删除加油记录，删除后级联重算后继记录的油耗

    参数：
    - db: 数据库会话
    - record_id: 要删除的记录 ID

    返回：被删除的记录（删除前的内容）
    """
    # 1. 查记录
    db_record = db.get(FuelRecord, record_id)
    if db_record is None:
        raise ValueError(f"记录不存在 (id={record_id})")

    # 2. 保护：不允许删除唯一的基线记录
    #    先数一下总共有多少条记录
    total = db.query(FuelRecord).count()
    if total == 1 and db_record.is_baseline:
        raise ValueError("这是唯一的基线记录，无法删除。请先添加一条新记录后再删除。")

    # 3. 记住这条记录的日期（删掉后就拿不到了，后面级联重算需要）
    record_date = db_record.record_date

    # 4. 从数据库里删除
    db.delete(db_record)
    db.commit()

    # 5. 级联重算：从被删除记录的日期开始重算
    #    因为记录已被删除，recalculate_consumption 查 >= record_date 的记录时
    #    会自动跳过这条已删除的记录，把下一条当作第一条重算
    recalculate_consumption(db, record_date)

    # 6. 返回被删除的记录（虽然已经不在数据库里了，但 Python 对象的数据还在内存中）
    return db_record
