"""Aplica las migraciones pendientes al arrancar.

Las bases creadas antes de usar Alembic (con create_all) ya tienen las tablas de la revisión 0001:
se marcan como «0001» sin tocarlas y luego se aplican las migraciones nuevas."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from .db import Base, engine

BASELINE = "0001"
# Tablas de la revisión 0001. Una base creada con una versión anterior de la app puede no tenerlas todas;
# se crean antes de marcarla como 0001. (Lista fija: no cambiarla cuando se agreguen migraciones.)
BASELINE_TABLES = {"audit", "users", "blobs", "calendar_feeds", "google_links", "records", "verifications"}


def _config(conn) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    cfg.attributes["connection"] = conn
    return cfg


def migrate() -> None:
    with engine.begin() as conn:
        tables = set(inspect(conn).get_table_names())
        cfg = _config(conn)
        if "users" in tables and "alembic_version" not in tables:
            missing = [t for t in Base.metadata.sorted_tables if t.name in BASELINE_TABLES and t.name not in tables]
            if missing:
                Base.metadata.create_all(conn, tables=missing)
            command.stamp(cfg, BASELINE)
        command.upgrade(cfg, "head")
