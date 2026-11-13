import jwt

from app import main, survey
from app.config import SESSION_SECRET
from conftest import anon

OK = {"name": "Luz Prueba", "email": "luz@x.co", "password": "una-clave-larga-1"}


def _con_correo(monkeypatch):
    sent = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "a@x.co", "base": "https://ak.test"})
    monkeypatch.setattr(survey, "send_verify", lambda to, name, url, acc, lang=None: sent.append((to, url)))
    main._signups.clear()
    return sent


def test_registro_crea_cuenta_al_confirmar(monkeypatch):
    sent = _con_correo(monkeypatch)
    c = anon()
    assert c.post("/api/auth/register", json=OK).status_code == 202
    assert len(sent) == 1 and sent[0][1].startswith("https://ak.test/app?verificar=")
    tok = sent[0][1].split("verificar=")[1]
    r = c.post("/api/auth/verify", json={"token": tok})
    assert r.status_code == 200 and r.json()["email"] == "luz@x.co" and r.json()["role"] == "user"
    assert c.get("/api/auth/me").json()["name"] == "Luz Prueba"
    assert c.post("/api/auth/verify", json={"token": tok}).status_code == 409  # un solo uso
    assert anon().post("/api/auth/login", json={"email": "luz@x.co", "password": OK["password"]}).status_code == 200


def test_registro_validaciones(monkeypatch):
    sent = _con_correo(monkeypatch)
    assert anon().post("/api/auth/register", json={**OK, "password": "corta"}).status_code == 400
    assert anon().post("/api/auth/register", json={**OK, "email": "malo"}).status_code == 400
    assert anon().post("/api/auth/verify", json={"token": "x"}).status_code == 400
    bad = jwt.encode({"p": "otro", "e": "a@x.co"}, SESSION_SECRET, algorithm="HS256")
    assert anon().post("/api/auth/verify", json={"token": bad}).status_code == 400
    assert not sent


def test_registro_sin_correo_configurado(monkeypatch):
    monkeypatch.setattr(survey, "server_account", lambda: None)
    assert anon().post("/api/auth/register", json=OK).status_code == 503


def test_registro_en_ingles_envia_correo_en_ingles(monkeypatch):
    got = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "a@x.co", "base": "https://ak.test"})
    monkeypatch.setattr(survey, "send_verify", lambda to, name, url, acc, lang=None: got.append((url, lang)))
    main._signups.clear()
    assert anon().post("/api/auth/register", json={**OK, "idioma": "en"}).status_code == 202
    assert got[0][1] == "en" and got[0][0].endswith("&lang=en")
    got.clear(); main._signups.clear()
    assert anon().post("/api/auth/register", json={**OK, "email": "otra@x.co"}).status_code == 202
    assert got[0][1] is None and "lang=en" not in got[0][0]
