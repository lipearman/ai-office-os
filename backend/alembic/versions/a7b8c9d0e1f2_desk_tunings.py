"""desk tunings (runtime-tunable trading params, coach-adjusted)

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'desk_tunings',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('key', sa.String(length=50), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='coach'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_index('ix_desk_tunings_key', 'desk_tunings', ['key'])


def downgrade() -> None:
    op.drop_index('ix_desk_tunings_key', table_name='desk_tunings')
    op.drop_table('desk_tunings')
