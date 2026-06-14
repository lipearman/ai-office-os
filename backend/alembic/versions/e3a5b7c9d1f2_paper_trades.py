"""paper trades (simulated trading + journal)

Revision ID: e3a5b7c9d1f2
Revises: d2f4a6b8c0e1
Create Date: 2026-06-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e3a5b7c9d1f2'
down_revision: Union[str, None] = 'd2f4a6b8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'paper_trades',
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=30), nullable=False),
        sa.Column('strategy', sa.String(length=40), nullable=False, server_default='manual'),
        sa.Column('timeframe', sa.String(length=8), nullable=False, server_default='1H'),
        sa.Column('side', sa.String(length=8), nullable=False, server_default='BUY'),
        sa.Column('entry_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('entry_price', sa.Float(), nullable=False),
        sa.Column('size_thb', sa.Float(), nullable=False),
        sa.Column('qty', sa.Float(), nullable=False),
        sa.Column('stop', sa.Float(), nullable=True),
        sa.Column('target', sa.Float(), nullable=True),
        sa.Column('fee_pct', sa.Float(), nullable=False, server_default='0.0025'),
        sa.Column('status', sa.String(length=8), nullable=False, server_default='OPEN'),
        sa.Column('exit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('exit_reason', sa.String(length=20), nullable=True),
        sa.Column('pnl_thb', sa.Float(), nullable=True),
        sa.Column('pnl_pct', sa.Float(), nullable=True),
        sa.Column('result', sa.String(length=10), nullable=True),
        sa.Column('rationale', sa.String(length=500), nullable=True),
        sa.Column('indicators', sa.JSON(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_paper_workspace_status', 'paper_trades', ['workspace_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_paper_workspace_status', table_name='paper_trades')
    op.drop_table('paper_trades')
