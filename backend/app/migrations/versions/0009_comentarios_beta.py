"""Comentarios de la versión beta

Revisión: 0009
Anterior: 0008
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'feedback',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('tema', sa.String(length=60), nullable=False),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('estado', sa.String(length=20), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.Column('image', sa.LargeBinary(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_feedback_user_id', 'feedback', ['user_id'])
    op.create_index('ix_feedback_estado', 'feedback', ['estado'])


def downgrade() -> None:
    op.drop_index('ix_feedback_estado', table_name='feedback')
    op.drop_index('ix_feedback_user_id', table_name='feedback')
    op.drop_table('feedback')
