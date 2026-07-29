"""车辆管理业务逻辑"""

from sqlalchemy.orm import Session

from models.vehicle import Vehicle
from schemas.vehicle import VehicleCreate, VehicleUpdate


def create_vehicle(db: Session, vehicle_in: VehicleCreate, user_id: int) -> Vehicle:
    """创建车辆"""
    db_vehicle = Vehicle(
        user_id=user_id,
        name=vehicle_in.name,
        plate=vehicle_in.plate,
        initial_mileage=vehicle_in.initial_mileage,
    )
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


def get_vehicles(db: Session, user_id: int) -> list[Vehicle]:
    """获取当前用户的所有车辆（活跃的在前）"""
    return (
        db.query(Vehicle)
        .filter(Vehicle.user_id == user_id)
        .order_by(Vehicle.is_active.desc(), Vehicle.created_at.desc())
        .all()
    )


def update_vehicle(db: Session, vehicle_id: int, vehicle_in: VehicleUpdate, user_id: int) -> Vehicle:
    """修改车辆信息（校验归属）"""
    db_vehicle = db.get(Vehicle, vehicle_id)
    if db_vehicle is None:
        raise ValueError(f"车辆不存在 (id={vehicle_id})")
    if db_vehicle.user_id != user_id:
        raise ValueError("无权修改此车辆")

    update_data = vehicle_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_vehicle, field, value)

    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


def delete_vehicle(db: Session, vehicle_id: int, user_id: int) -> Vehicle:
    """删除车辆（校验归属，校验无关联记录）"""
    from models.fuel_record import FuelRecord

    db_vehicle = db.get(Vehicle, vehicle_id)
    if db_vehicle is None:
        raise ValueError(f"车辆不存在 (id={vehicle_id})")
    if db_vehicle.user_id != user_id:
        raise ValueError("无权删除此车辆")

    # 校验有无关联的加油记录
    record_count = (
        db.query(FuelRecord)
        .filter(FuelRecord.vehicle_id == vehicle_id)
        .count()
    )
    if record_count > 0:
        raise ValueError(f"该车辆下有 {record_count} 条加油记录，无法删除。请先清空记录或归档后再操作。")

    db.delete(db_vehicle)
    db.commit()
    return db_vehicle
