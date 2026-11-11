"""Suscripciones (ePayco)

Revisión: 0013
Anterior: 0012
"""
from alembic import op
import sqlalchemy as sa


revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('user_id', sa.Integer(), primary_key=True),
        sa.Column('plan', sa.String(length=10), nullable=False, server_default=''),
        sa.Column('paid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('subscriptions')
