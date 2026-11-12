"""Formularios de datos que el consultante llena antes de la atención

Revisión: 0015
Anterior: 0014
"""
from alembic import op
import sqlalchemy as sa


revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if 'intake_forms' in sa.inspect(op.get_bind()).get_table_names():
        return  # base creada con el modelo actual
    op.create_table(
        'intake_forms',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('ref', sa.String(32), nullable=False, unique=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('intake_forms')
