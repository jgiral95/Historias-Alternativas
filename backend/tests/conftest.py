import os
import sys
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SESSION_SECRET"] = "x" * 48
os.environ["DATA_KEY"] = Fernet.generate_key().decode()
os.environ["SURVEY_SCHEDULER"] = "0"
os.environ["RECIFRAR_AL_ARRANCAR"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402
from app.db import Base, SessionLocal, User, engine  # noqa: E402
from app.security import hash_password  # noqa: E402

HEADERS = {"X-Requested-With": "archivo-clinico"}
PASSWORD = "contraseña-segura-123"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    main._fails.clear()
    main._vhits.clear()
    yield


def make_user(email, name="Usuario", role="user", active=True):
    with SessionLocal() as db:
        u = User(email=email, name=name, password_hash=hash_password(PASSWORD), role=role, active=active)
        db.add(u)
        db.commit()
        return u.id


def client_for(email, password=PASSWORD, keep_first=False):
    """Cliente con sesión. Si la cuenta debe cambiar su contraseña al primer ingreso, la prueba lo da por hecho
    (salvo keep_first=True, para probar justamente ese paso)."""
    c = TestClient(main.app, headers=HEADERS)
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    if not keep_first:
        with SessionLocal() as db:
            u = db.query(User).filter(User.email == email.strip().lower()).first()
            if u and u.must_change_password:
                u.must_change_password = False
                db.commit()
    return c


def anon():
    return TestClient(main.app, headers=HEADERS)


def patient(pid="p_1", **extra):
    return {"id": pid, "kind": "patient", "nombres": "María", "apellidos": "Pérez", **extra}


def consent(tipo="Presencial y telepsicología"):
    """Consentimiento de atención vigente (sin él no se pueden agendar citas)."""
    from datetime import datetime, timezone
    return [{"tipo": tipo, "text": "Consiento la atención.", "signedAt": datetime.now(timezone.utc).isoformat()}]
