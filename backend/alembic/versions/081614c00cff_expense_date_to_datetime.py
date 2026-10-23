"""expense_date date -> datetime

Revision ID: 081614c00cff
Revises: 7b168dd2c3d1
Create Date: 2026-10-23 09:12:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '081614c00cff'
down_revision: Union[str, None] = '7b168dd2c3d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 记账需要精确到时分，expense_date 由 Date 改为 DateTime。
    # 历史行的时间部分补成 created_at 的时分，列表显示与迁移前保持一致。
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.alter_column(
            'expenses',
            'expense_date',
            existing_type=sa.Date(),
            type_=sa.DateTime(),
            existing_nullable=False,
            # PostgreSQL 没有 timestamp + time 运算符，但 date + time → timestamp 可用
            postgresql_using="expense_date + COALESCE(created_at::time, '00:00'::time)",
        )
    else:
        # SQLite / MySQL 不支持 USING，走 batch 重建表，时间部分补 00:00
        with op.batch_alter_table('expenses') as batch_op:
            batch_op.alter_column(
                'expense_date',
                existing_type=sa.Date(),
                type_=sa.DateTime(),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.alter_column(
            'expenses',
            'expense_date',
            existing_type=sa.DateTime(),
            type_=sa.Date(),
            existing_nullable=False,
            postgresql_using='expense_date::date',
        )
    else:
        with op.batch_alter_table('expenses') as batch_op:
            batch_op.alter_column(
                'expense_date',
                existing_type=sa.DateTime(),
                type_=sa.Date(),
                existing_nullable=False,
            )
