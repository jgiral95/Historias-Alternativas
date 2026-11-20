"""Empresas: administrador, apoyo administrativo, consultorios, notas, marca y reservas de empresa

Revisión: 0017
Anterior: 0016
"""
from alembic import op
import sqlalchemy as sa


revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None

USER_COLS = [
    ('permisos', lambda: sa.Column('permisos', sa.Text(), nullable=True)),
    ('company_id', lambda: sa.Column('company_id', sa.Integer(), nullable=True)),
    ('company_admin', lambda: sa.Column('company_admin', sa.Boolean(), nullable=False, server_default=sa.false())),
    ('company_secretary', lambda: sa.Column('company_secretary', sa.Boolean(), nullable=False, server_default=sa.false())),
    ('company_archived', lambda: sa.Column('company_archived', sa.Boolean(), nullable=False, server_default=sa.false())),
]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    tablas = set(insp.get_table_names())
    if 'companies' not in tablas:
        op.create_table(
            'companies',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('name', sa.String(200), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('permisos', sa.Text(), nullable=True),
            sa.Column('reserva_slug', sa.String(64), nullable=True),
            sa.Column('reserva_activa', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('logo', sa.Text(), nullable=True),
            sa.Column('texto_correo', sa.Text(), nullable=True),
            sa.Column('texto_reservas', sa.Text(), nullable=True),
            sa.Column('color_reservas', sa.String(7), nullable=True),
            sa.Column('slogan', sa.String(160), nullable=True),
        )
        op.create_index('ix_companies_reserva_slug', 'companies', ['reserva_slug'])
    if 'consultorios' not in tablas:
        op.create_table(
            'consultorios',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(120), nullable=False),
            sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('horario', sa.Text(), nullable=True),
            sa.Column('direccion', sa.String(200), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_consultorios_company_id', 'consultorios', ['company_id'])
    if 'company_notes' not in tablas:
        op.create_table(
            'company_notes',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('pro_id', sa.Integer(), nullable=True),
            sa.Column('datos', sa.LargeBinary(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_company_notes_company_id', 'company_notes', ['company_id'])
        op.create_index('ix_company_notes_pro_id', 'company_notes', ['pro_id'])
    have = {c['name'] for c in insp.get_columns('users')}
    with op.batch_alter_table('users') as b:
        for n, col in USER_COLS:
            if n not in have:
                b.add_column(col())
        if 'company_id' not in have:
            b.create_index('ix_users_company_id', ['company_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('users') as b:
        b.drop_index('ix_users_company_id')
        for n, _ in reversed(USER_COLS):
            b.drop_column(n)
    op.drop_table('company_notes')
    op.drop_table('consultorios')
    op.drop_table('companies')
