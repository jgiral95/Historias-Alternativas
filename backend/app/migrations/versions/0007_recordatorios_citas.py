"""Recordatorios de citas

Revisión: 0007
Anterior: 0006
"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'appt_reminders',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('appt_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('channel', sa.String(length=10), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error', sa.String(length=200), nullable=True),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_appt_reminders_user_id', 'appt_reminders', ['user_id'])
    op.create_index('ix_appt_reminders_appt_id', 'appt_reminders', ['appt_id'])


def downgrade() -> None:
    op.drop_index('ix_appt_reminders_appt_id', table_name='appt_reminders')
    op.drop_index('ix_appt_reminders_user_id', table_name='appt_reminders')
    op.drop_table('appt_reminders')
