"""Firma de consentimientos a distancia

Revisión: 0008
Anterior: 0007
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'consent_requests',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('ref', sa.String(length=32), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ref'),
    )
    op.create_index('ix_consent_requests_user_id', 'consent_requests', ['user_id'])
    op.create_index('ix_consent_requests_patient_id', 'consent_requests', ['patient_id'])


def downgrade() -> None:
    op.drop_index('ix_consent_requests_patient_id', table_name='consent_requests')
    op.drop_index('ix_consent_requests_user_id', table_name='consent_requests')
    op.drop_table('consent_requests')
