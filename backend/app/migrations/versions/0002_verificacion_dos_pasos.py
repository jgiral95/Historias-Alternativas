"""Verificación en dos pasos

Revisión: 0002
Anterior: 0001
Fecha: 2026-10-27 22:39:20.553631
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('totp_secret', sa.LargeBinary(), nullable=True))
        batch_op.add_column(sa.Column('totp_enabled', sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column('totp_last', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('recovery_codes', sa.Text(), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('recovery_codes')
        batch_op.drop_column('totp_last')
        batch_op.drop_column('totp_enabled')
        batch_op.drop_column('totp_secret')

