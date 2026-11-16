"""Aceptación de la política de privacidad por usuario

Revisión: 0016
Anterior: 0015
"""
from alembic import op
import sqlalchemy as sa


revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('users')}
    with op.batch_alter_table('users') as b:
        if 'privacy_version' not in cols:
            b.add_column(sa.Column('privacy_version', sa.String(10), nullable=True))
        if 'privacy_at' not in cols:
            b.add_column(sa.Column('privacy_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as b:
        b.drop_column('privacy_at')
        b.drop_column('privacy_version')
