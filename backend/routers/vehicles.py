"""车辆管理 API 路由"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate
from services.vehicle_service import create_vehicle, get_vehicles, update_vehicle, delete_vehicle
from core.deps import get_current_user
from models.user import User

router = APIRouter(prefix="/api/v1/vehicles", tags=["车辆管理"])


@router.post("/", response_model=VehicleResponse)
def api_create_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建车辆（需登录）"""
    try:
        return create_vehicle(db=db, vehicle_in=vehicle_in, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[VehicleResponse])
def api_get_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的所有车辆"""
    return get_vehicles(db=db, user_id=current_user.id)


@router.put("/{vehicle_id}", response_model=VehicleResponse)
def api_update_vehicle(
    vehicle_id: int,
    vehicle_in: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改车辆信息（只能修改自己的车辆）"""
    try:
        return update_vehicle(db=db, vehicle_id=vehicle_id, vehicle_in=vehicle_in, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{vehicle_id}")
def api_delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除车辆（只能删除自己的车辆）"""
    try:
        delete_vehicle(db=db, vehicle_id=vehicle_id, user_id=current_user.id)
        return {"detail": "删除成功"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
