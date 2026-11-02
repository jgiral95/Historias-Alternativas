"""Encuestas de satisfacción

Revisión: 0003
Anterior: 0002
"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'survey_invites',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('channel', sa.String(length=10), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('answered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error', sa.String(length=200), nullable=True),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_survey_invites_user_id', 'survey_invites', ['user_id'])
    op.create_table(
        'survey_responses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.String(length=7), nullable=False),
        sa.Column('payload', sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_survey_responses_user_id', 'survey_responses', ['user_id'])
    op.create_table(
        'survey_optouts',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('user_id', 'patient_id'),
    )
    op.create_table(
        'survey_state',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('last_draw', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('survey_state')
    op.drop_table('survey_optouts')
    op.drop_index('ix_survey_responses_user_id', table_name='survey_responses')
    op.drop_table('survey_responses')
    op.drop_index('ix_survey_invites_user_id', table_name='survey_invites')
    op.drop_table('survey_invites')
