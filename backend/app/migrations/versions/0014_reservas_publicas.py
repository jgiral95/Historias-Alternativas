"""Enlace público de reservas de citas

Revisión: 0014
Anterior: 0013
"""
from alembic import op
import sqlalchemy as sa


revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'booking_links',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('slug', sa.String(64), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_booking_links_slug', 'booking_links', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_booking_links_slug', table_name='booking_links')
    op.drop_table('booking_links')
