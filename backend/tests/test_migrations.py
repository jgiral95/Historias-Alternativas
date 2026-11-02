"""Las migraciones deben producir exactamente el esquema de los modelos, en una base nueva y en una antigua."""
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text

from app.db import Base, engine
from app.migrate import migrate


def _reset():
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS alembic_version"))


def _diff():
    with engine.connect() as c:
        return compare_metadata(MigrationContext.configure(c, opts={"compare_type": True}), Base.metadata)


def test_fresh_database_gets_full_schema():
    _reset()
    migrate()
    assert _diff() == []
    with engine.connect() as c:
        assert c.execute(text("SELECT version_num FROM alembic_version")).scalar() is not None
    migrate()  # volver a correrla no hace nada
    assert _diff() == []


def test_legacy_database_is_stamped_and_completed():
    _reset()
    # base creada con una versión vieja: solo algunas tablas, sin control de versiones
    with engine.begin() as c:  # tabla de usuarios como la creaba la versión antigua (sin columnas de 2FA)
        c.execute(text("CREATE TABLE users (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, email VARCHAR(254) NOT NULL, name VARCHAR(200) NOT NULL, "
                       "password_hash VARCHAR(300) NOT NULL, role VARCHAR(10) NOT NULL, active BOOLEAN NOT NULL, created_at DATETIME NOT NULL)"))
        c.execute(text("CREATE UNIQUE INDEX ix_users_email ON users (email)"))
        # bitácora como la creaba la versión antigua (sin historia ni IP)
        c.execute(text("CREATE TABLE audit (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, at DATETIME NOT NULL, user_id INTEGER, action VARCHAR(40) NOT NULL, detail VARCHAR(160) NOT NULL)"))
    Base.metadata.create_all(engine, tables=[Base.metadata.tables["records"]])
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (email, name, password_hash, role, active, created_at) VALUES ('a@x.co', 'A', 'h', 'admin', 1, '2026-01-01')"))
    migrate()
    assert _diff() == []
    with engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM users")).scalar() == 1  # los datos se conservan
        assert c.execute(text("SELECT totp_enabled FROM users")).scalar() in (0, False)  # columna nueva agregada
    assert "verifications" in inspect(engine).get_table_names()
