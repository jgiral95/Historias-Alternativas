from datetime import datetime, timedelta, timezone

import pytest

from app import billing, main
from app.db import SessionLocal, Subscription, User
from sqlalchemy import select

from conftest import HEADERS, PASSWORD, client_for, make_user, patient


@pytest.fixture(autouse=True)
def exigir(monkeypatch):
    monkeypatch.setattr(main, "BILLING_ENFORCE", True)
    billing.ultima.clear()


def _dar(email, dias):
    with SessionLocal() as db:
        uid = db.scalar(select(User.id).where(User.email == email))
        db.merge(Subscription(user_id=uid, plan="mensual", paid_until=datetime.now(timezone.utc) + timedelta(days=dias)))
        db.commit()


def test_sin_suscripcion_solo_un_consultante_y_sin_equipo():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200
    r = c.put("/api/records/p_2", json=patient("p_2", documento="999"))
    assert r.status_code == 402 and "un consultante" in r.json()["detail"]
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200  # el que ya tiene se sigue editando
    assert c.post("/api/equipo", json={"email": "a@x.co", "name": "A", "password": PASSWORD}, headers=HEADERS).status_code == 402
    st = c.get("/api/billing").json()
    assert st["exigido"] and not st["activa"] and len(st["planes"]) == 2 and st["planes"][0]["url"].startswith("https://")


def test_con_suscripcion_vigente_todo_libre():
    make_user("ana@x.co")
    _dar("ana@x.co", 20)
    c = client_for("ana@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200
    assert c.put("/api/records/p_2", json=patient("p_2", documento="999")).status_code == 200
    assert c.post("/api/equipo", json={"email": "a@x.co", "name": "A", "password": PASSWORD}, headers=HEADERS).status_code == 201
    assert c.get("/api/billing").json()["activa"] is True


def test_vencida_30_dias_solo_ver_y_luego_nada():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200
    _dar("ana@x.co", -10)
    assert c.get("/api/records").status_code == 200
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 402
    assert 19 <= c.get("/api/billing").json()["gracia"] <= 20
    _dar("ana@x.co", -40)
    assert c.get("/api/records").status_code == 402
    assert c.get("/api/billing").status_code == 200  # desde aquí se renueva


def test_sincroniza_con_epayco_por_correo(monkeypatch):
    make_user("ana@x.co")
    monkeypatch.setattr(main, "EPAYCO_PRIVATE_KEY", "k")
    monkeypatch.setattr(billing, "PLAN_IDS", {"pl_m": "mensual"})
    monkeypatch.setattr(billing, "cliente", lambda: object())
    fin = datetime.now(timezone.utc) + timedelta(days=12)
    monkeypatch.setattr(billing, "suscripciones_de", lambda email, cli: [{"_id": "s1", "idPlan": "pl_m", "periodEnd": fin.strftime("%d-%m-%Y")}] if email == "ana@x.co" else [])
    c = client_for("ana@x.co")
    st = c.get("/api/billing").json()
    assert st["activa"] and st["plan"] == "mensual"
    assert c.put("/api/records/p_2", json=patient("p_2", documento="999")).status_code == 200


def test_sin_exigir_no_limita(monkeypatch):
    monkeypatch.setattr(main, "BILLING_ENFORCE", False)
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200
    assert c.put("/api/records/p_2", json=patient("p_2", documento="999")).status_code == 200
