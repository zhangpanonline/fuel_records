"""加油记录 ORM 模型"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Numeric, String, Text, Boolean
#func 提供了 SQL 函数，比如 func.now() 相当于 SQL 里的 NOW() ——返回数据库当前时间。
from sqlalchemy.sql import func

from database import Base


class FuelRecord(Base):
    """加油记录表"""
    __tablename__ = "fuel_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mileage = Column(Numeric(10, 1), nullable=False, comment="当前里程表读数 (km)")
    fuel_volume = Column(Numeric(10, 2), nullable=False, comment="加油量 (L)")
    fuel_cost = Column(Numeric(10, 2), nullable=False, comment="加油金额 (元)")
    unit_price = Column(Numeric(10, 2), nullable=True, comment="单价 = 金额/油量")
    is_full_tank = Column(Boolean, default=True, comment="是否加满")
    is_baseline = Column(Boolean, default=False, comment="基线记录（首次加油，不计算油耗）")
    fuel_consumption = Column(Numeric(5, 2), nullable=True, comment="百公里油耗 (L/100km)")
    note = Column(Text, nullable=True, comment="备注")
    record_date = Column(DateTime, default=datetime.now, comment="记录时间")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
