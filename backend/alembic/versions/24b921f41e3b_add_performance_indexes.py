"""add_performance_indexes

Revision ID: 24b921f41e3b
Revises: ff245e876ff9
Create Date: 2026-07-30 10:22:46.931885

为高频查询字段添加索引：
- fuel_records: 复合索引 (user_id, vehicle_id, record_date) → 覆盖绝大多数查询
- vehicles: 索引 (user_id) → 按用户查车辆
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '24b921f41e3b'
down_revision: Union[str, None] = 'ff245e876ff9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # fuel_records 复合索引：覆盖 (user_id, vehicle_id, record_date) 查询 + 排序
    op.create_index(
        'ix_fuel_records_user_vehicle_date',
        'fuel_records',
        ['user_id', 'vehicle_id', 'record_date'],
    )
    # vehicles 按用户查询
    op.create_index(
        'ix_vehicles_user_id',
        'vehicles',
        ['user_id'],
    )
    # fuel_records 按日期范围筛选
    op.create_index(
        'ix_fuel_records_record_date',
        'fuel_records',
        ['record_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_fuel_records_record_date', table_name='fuel_records')
    op.drop_index('ix_vehicles_user_id', table_name='vehicles')
    op.drop_index('ix_fuel_records_user_vehicle_date', table_name='fuel_records')
