"""Entorno de Alembic: usa el motor y los modelos de la app (la URL sale de DATABASE_URL)."""
from alembic import context

from app.db import Base, engine

target_metadata = Base.metadata


def run() -> None:
    conn = context.config.attributes.get("connection")
    if conn is not None:
        _configure(conn)
        return
    with engine.connect() as c:
        _configure(c)
        c.commit()


def _configure(conn) -> None:
    # render_as_batch permite alterar tablas también en SQLite (pruebas).
    context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise SystemExit("Use el modo en línea: las migraciones se aplican contra la base de datos.")
run()
