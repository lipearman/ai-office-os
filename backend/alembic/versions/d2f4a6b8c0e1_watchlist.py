"""watchlist items (crypto symbols to monitor/scan)

Revision ID: d2f4a6b8c0e1
Revises: c1a2b3d4e5f6
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd2f4a6b8c0e1'
down_revision: Union[str, None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'watchlist_items',
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=30), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('strategies', sa.JSON(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_watchlist_workspace', 'watchlist_items', ['workspace_id'])


def downgrade() -> None:
    op.drop_index('ix_watchlist_workspace', table_name='watchlist_items')
    op.drop_table('watchlist_items')
