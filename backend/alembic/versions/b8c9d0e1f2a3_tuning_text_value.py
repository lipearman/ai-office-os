"""desk_tunings.text_value (enum-typed runtime params, e.g. scan timeframe)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('desk_tunings', sa.Column('text_value', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('desk_tunings', 'text_value')
