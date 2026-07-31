"""支出记录 ORM 模型"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date, Numeric, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


class Expense(Base):
    """支出记录表"""
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="所属用户")
    amount = Column(Numeric(10, 2), nullable=False, comment="金额（元），> 0")
    category_l1 = Column(String(50), nullable=False, comment="一级分类名称（冗余）")
    category_l2 = Column(String(50), nullable=False, comment="二级分类名称（冗余）")
    category_l3 = Column(String(50), nullable=False, comment="三级分类名称（冗余）")
    note = Column(Text, nullable=True, comment="备注")
    expense_date = Column(Date, nullable=False, comment="支出日期")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="修改时间"
    )

    # ── 关系 ──
    user = relationship("User", back_populates="expenses")
