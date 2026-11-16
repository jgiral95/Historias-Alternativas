import re

from sqlalchemy import select

from app import survey
from app.db import SessionLocal, TrustedDevice, User

from conftest import PASSWORD, anon, make_user


def _mail(monkeypatch):
    sent = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "a@x.co", "base": "https://ak.test"})
    monkeypatch.setattr(survey, "send_reset", lambda to, name, url, acc, lang=None: sent.append((to, url, lang)))
    return sent


def _token(sent):
    return re.search(r"recuperar=([^&]+)", sent[-1][1]).group(1)


def test_recover_same_answer_and_mail_only_for_active_accounts(monkeypatch):
    sent = _mail(monkeypatch)
    make_user("ana@x.co")
    make_user("off@x.co", active=False)
    for e in ("ana@x.co", "nadie@x.co", "off@x.co"):
        r = anon().post("/api/auth/recover", json={"email": e})
        assert r.status_code == 202 and r.json() == {"ok": True}  # no revela si la cuenta existe
    assert [s[0] for s in sent] == ["ana@x.co"]
    assert anon().post("/api/auth/recover", json={"email": "no-es-correo"}).status_code == 400


def test_recover_en_idioma_ingles(monkeypatch):
    sent = _mail(monkeypatch)
    make_user("ana@x.co")
    anon().post("/api/auth/recover", json={"email": "ana@x.co", "idioma": "en"})
    assert sent[-1][2] == "en" and sent[-1][1].endswith("&lang=en")


def test_reset_with_link_is_single_use_and_closes_trusted_devices(monkeypatch):
    sent = _mail(monkeypatch)
    uid = make_user("ana@x.co")
    with SessionLocal() as db:
        db.add(TrustedDevice(user_id=uid, token_hash="h" * 64, label="PC"))
        db.commit()
    anon().post("/api/auth/recover", json={"email": "ana@x.co"})
    tok = _token(sent)
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "corta"}).status_code == 400  # el enlace sigue sirviendo
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "nueva-clave-larga"}).status_code == 204
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "otra-clave-larga"}).status_code == 400  # un solo uso
    assert anon().post("/api/auth/login", json={"email": "ana@x.co", "password": PASSWORD}).status_code == 401
    assert anon().post("/api/auth/login", json={"email": "ana@x.co", "password": "nueva-clave-larga"}).status_code == 200
    with SessionLocal() as db:
        assert not db.scalars(select(TrustedDevice).where(TrustedDevice.user_id == uid)).all()
    assert anon().post("/api/auth/reset", json={"token": "basura", "password": "nueva-clave-larga"}).status_code == 400


def test_reset_does_not_bypass_two_factor(monkeypatch):
    sent = _mail(monkeypatch)
    uid = make_user("ana@x.co")
    with SessionLocal() as db:
        u = db.get(User, uid)
        u.totp_enabled = True
        db.commit()
    anon().post("/api/auth/recover", json={"email": "ana@x.co"})
    assert anon().post("/api/auth/reset", json={"token": _token(sent), "password": "nueva-clave-larga"}).status_code == 204
    r = anon().post("/api/auth/login", json={"email": "ana@x.co", "password": "nueva-clave-larga"})
    assert r.status_code == 200 and r.json().get("need_2fa") is True and "set-cookie" not in r.headers


def test_recover_requests_are_limited(monkeypatch):
    sent = _mail(monkeypatch)
    make_user("ana@x.co")
    codes = [anon().post("/api/auth/recover", json={"email": "ana@x.co"}).status_code for _ in range(7)]
    assert codes[:5] == [202] * 5 and codes[5:] == [429, 429] and len(sent) == 5
