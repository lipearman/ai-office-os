"""scan exclusions (DB-backed delisting denylist)

Revision ID: f1a2b3c4d5e6
Revises: 2c5c3c6eeac9
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = '2c5c3c6eeac9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'scan_exclusions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=30), nullable=False),
        sa.Column('reason', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='manual'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('symbol'),
    )
    op.create_index('ix_scan_exclusions_symbol', 'scan_exclusions', ['symbol'])


def downgrade() -> None:
    op.drop_index('ix_scan_exclusions_symbol', table_name='scan_exclusions')
    op.drop_table('scan_exclusions')
