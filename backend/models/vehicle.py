"""车辆 ORM 模型"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


class Vehicle(Base):
    """车辆表"""
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="所属用户")
    name = Column(String(50), nullable=False, comment="车辆名称（如 KPT400）")
    plate = Column(String(20), nullable=True, comment="车牌号")
    initial_mileage = Column(Numeric(10, 1), nullable=False, comment="初始里程（首次记录时的里程）")
    is_active = Column(Boolean, default=True, comment="是否启用")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")

    # 一对多关系：一个用户有多辆车
    user = relationship("User", back_populates="vehicles")

    # 一对多关系：一辆车有多条加油记录
    records = relationship("FuelRecord", back_populates="vehicle")
