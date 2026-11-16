import re

from sqlalchemy import select

from app import main, survey
from app.config import PRIVACY_VERSION
from app.db import SessionLocal, User

from conftest import HEADERS, PASSWORD, anon, client_for, make_user


def test_privacy_acceptance(monkeypatch):
    sent = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "a@x.co", "base": "https://ak.test"})
    monkeypatch.setattr(survey, "send_verify", lambda to, name, url, acc, lang=None: sent.append(url))
    main._signups.clear()
    body = {"name": "Eva", "email": "eva@mail.com", "password": PASSWORD}
    r = anon().post("/api/auth/register", json=body, headers=HEADERS)  # sin aceptar la política no hay cuenta
    assert r.status_code == 400 and "privacidad" in r.json()["detail"] and not sent
    c = anon()
    assert c.post("/api/auth/register", json={**body, "acepto": True}, headers=HEADERS).status_code == 202
    c.post("/api/auth/verify", json={"token": re.search(r"verificar=([^&]+)", sent[0]).group(1)}, headers=HEADERS)
    me = c.get("/api/auth/me").json()
    assert me["privacidadOk"] is True and me["privacidadVersion"] == PRIVACY_VERSION
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "eva@mail.com"))
        assert u.privacy_version == PRIVACY_VERSION and u.privacy_at
    # cuenta creada de otra forma (Google, equipo, anterior a la política): debe aceptar al ingresar, y queda registrado
    make_user("sin@mail.com")
    c2 = client_for("sin@mail.com")
    assert c2.get("/api/auth/me").json()["privacidadOk"] is False
    assert c2.post("/api/auth/privacidad", headers=HEADERS).status_code == 204
    assert c2.get("/api/auth/me").json()["privacidadOk"] is True
    # si la versión vigente cambia, vuelve a pedirse
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "sin@mail.com"))
        u.privacy_version = "2020-01-01"
        db.commit()
    me = c2.get("/api/auth/me").json()
    assert me["privacidadOk"] is False and me["privacidadAntes"] is True
    assert anon().post("/api/auth/privacidad", headers=HEADERS).status_code == 401
