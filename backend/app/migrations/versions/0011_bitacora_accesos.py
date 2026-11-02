"""Bitácora de accesos por historia

Revisión: 0011
Anterior: 0010
"""
from alembic import op
import sqlalchemy as sa


revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audit') as b:
        b.add_column(sa.Column('patient_id', sa.String(length=64), nullable=True))
        b.add_column(sa.Column('ip', sa.String(length=64), nullable=True))
    op.create_index('ix_audit_patient_id', 'audit', ['patient_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_patient_id', table_name='audit')
    with op.batch_alter_table('audit') as b:
        b.drop_column('ip')
        b.drop_column('patient_id')
