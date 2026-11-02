"""Dispositivos de confianza para la verificación en dos pasos

Revisión: 0012
Anterior: 0011
"""
from alembic import op
import sqlalchemy as sa


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'trusted_devices',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False, unique=True),
        sa.Column('label', sa.String(length=120), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_trusted_devices_user_id', 'trusted_devices', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_trusted_devices_user_id', table_name='trusted_devices')
    op.drop_table('trusted_devices')
