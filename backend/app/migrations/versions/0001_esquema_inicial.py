"""Esquema inicial

Revisión: 0001
Anterior: 
Fecha: 2026-10-27 22:38:15.500898
"""
from alembic import op
import sqlalchemy as sa


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('audit',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=40), nullable=False),
    sa.Column('detail', sa.String(length=160), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('password_hash', sa.String(length=300), nullable=False),
    sa.Column('role', sa.String(length=10), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('blobs',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('mime', sa.String(length=40), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('data', sa.LargeBinary(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('user_id', 'id')
    )
    op.create_table('calendar_feeds',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('detail', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('user_id')
    )
    with op.batch_alter_table('calendar_feeds', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_calendar_feeds_token_hash'), ['token_hash'], unique=True)

    op.create_table('google_links',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token', sa.LargeBinary(), nullable=False),
    sa.Column('calendar_id', sa.String(length=255), nullable=False),
    sa.Column('detail', sa.String(length=12), nullable=False),
    sa.Column('last_sync', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_error', sa.String(length=300), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('records',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('patient_id', sa.String(length=64), nullable=True),
    sa.Column('payload', sa.LargeBinary(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('user_id', 'id')
    )
    with op.batch_alter_table('records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_records_patient_id'), ['patient_id'], unique=False)

    op.create_table('verifications',
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('record_id', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('code_hash')
    )


def downgrade() -> None:
    op.drop_table('verifications')
    with op.batch_alter_table('records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_records_patient_id'))

    op.drop_table('records')
    op.drop_table('google_links')
    with op.batch_alter_table('calendar_feeds', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_calendar_feeds_token_hash'))

    op.drop_table('calendar_feeds')
    op.drop_table('blobs')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
    op.drop_table('audit')
