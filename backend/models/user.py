"""用户 ORM 模型"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, comment="用户名")
    email = Column(String(100), unique=True, nullable=True, comment="邮箱")
    hashed_password = Column(String(255), nullable=False, comment="密码哈希（bcrypt）")
    is_active = Column(Boolean, default=True, comment="是否激活")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    # 一对多关系：一个用户有多条加油记录
    records = relationship("FuelRecord", back_populates="user")

    # 一对多关系：一个用户有多辆车
    vehicles = relationship("Vehicle", back_populates="user")

    # 一对多关系：一个用户有多条支出记录
    expenses = relationship("Expense", back_populates="user", cascade="all, delete-orphan")

    # 一对多关系：一个用户有多条分类
    categories = relationship("ExpenseCategory", back_populates="user", cascade="all, delete-orphan")
