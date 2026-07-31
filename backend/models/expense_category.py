"""支出分类 ORM 模型 — 树形自引用结构，固定 3 层"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, SmallInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from database import Base


class ExpenseCategory(Base):
    """支出分类表（用户自定义三级分类）"""
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="所属用户")
    parent_id = Column(
        Integer,
        ForeignKey("expense_categories.id"),
        nullable=True,
        comment="父分类ID，NULL 表示一级分类",
    )
    name = Column(String(50), nullable=False, comment="分类名称")
    level = Column(SmallInteger, nullable=False, comment="层级：1 / 2 / 3")
    sort_order = Column(Integer, default=0, comment="排序权重，越小越靠前")
    created_at = Column(DateTime, server_default=func.now(), comment="创建时间")
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), comment="修改时间"
    )

    # ── 关系 ──
    # 关联 User
    user = relationship("User", back_populates="categories")

    # 树形自引用
    parent = relationship(
        "ExpenseCategory",
        remote_side=[id],                      # 远端是自身的 id 列
        back_populates="children",
    )
    children = relationship(
        "ExpenseCategory",
        back_populates="parent",
        cascade="all, delete-orphan",          # 删除父分类时级联删除子分类
    )
