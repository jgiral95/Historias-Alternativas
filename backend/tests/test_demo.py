"""Datos de ejemplo: los marca el servidor, se borran aunque estén firmados y nunca reciben correos."""
from datetime import datetime, timedelta, timezone

from app import reminders

from conftest import HEADERS, PASSWORD, client_for, make_user, patient

NOW = datetime.now(timezone.utc).isoformat()


def batch():
    return [patient("p_d1", documento="9000000001", correo="demo@example.com", consents=[{"tipo": "x", "text": "t", "signedAt": NOW}],
                    intake={"motivo": "ejemplo", "signedAt": NOW, "addenda": []}),
            {"id": "n_d1", "kind": "note", "patientId": "p_d1", "tema": "ejemplo", "signedAt": NOW, "addenda": []},
            {"id": "a_d1", "kind": "appt", "patientId": "p_d1", "startAt": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(), "estado": "Programada"},
            {"id": "pn_d1", "kind": "pnote", "patientId": None, "titulo": "Nota general de ejemplo"}]


def test_demo_load_and_delete(monkeypatch):
    uid = make_user("ana@x.co")
    c = client_for("ana@x.co")
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana", "recordatorios": {"activo": True, "horas": 24}})
    c.put("/api/records/p_real", json=patient("p_real", documento="123", consents=[{"tipo": "x", "text": "t", "signedAt": NOW}]))
    assert c.post("/api/demo", json={"records": [patient("p_x", documento="999")]}, headers=HEADERS).status_code == 400
    assert c.post("/api/demo", json={"records": [{"id": "n_x", "kind": "note", "patientId": "p_real", "signedAt": NOW}]}, headers=HEADERS).status_code == 400
    assert c.post("/api/demo", json={"records": batch()}, headers=HEADERS).json()["cargados"] == 4
    assert c.post("/api/demo", json={"records": batch()}, headers=HEADERS).status_code == 409
    recs = {r["id"]: r for r in c.get("/api/records").json()}
    assert recs["p_d1"]["demo"] and recs["n_d1"]["demo"] and recs["p_d1"]["abiertaEl"] and not recs["p_real"].get("demo")
    # el navegador no puede marcar nada como ejemplo, ni quitarle la marca
    c.put("/api/records/p_real", json={**{k: v for k, v in recs["p_real"].items() if k not in ("abiertaEl", "cambios", "firmasCambios")}, "demo": True})
    assert not next(r for r in c.get("/api/records").json() if r["id"] == "p_real").get("demo")
    c.put("/api/records/p_d1", json={**{k: v for k, v in recs["p_d1"].items() if k not in ("abiertaEl", "cambios", "firmasCambios", "demo")}, "ciudad": "Cali"})
    assert next(r for r in c.get("/api/records").json() if r["id"] == "p_d1")["demo"]
    # nunca se le envían correos a un paciente de ejemplo
    sent = []
    monkeypatch.setattr(reminders.survey, "account", lambda db, u: {"host": "h", "from": "a@gmail.com", "propio": True})
    monkeypatch.setattr(reminders, "send_mail", lambda *a: sent.append(a))
    assert reminders.due(uid) == 0 and not sent
    # se borran aunque estén firmados; lo real queda
    c.put("/api/records/n_d2", json={"id": "n_d2", "kind": "note", "patientId": "p_d1", "tema": "agregada luego", "signedAt": datetime.now(timezone.utc).isoformat(), "addenda": []})
    assert c.delete("/api/demo", headers=HEADERS).json()["borrados"] == 5
    ids = {r["id"] for r in c.get("/api/records").json()}
    assert "p_real" in ids and not ids & {"p_d1", "n_d1", "a_d1", "pn_d1", "n_d2"}
    # el equipo no puede
    c.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    assert client_for("secre@x.co").post("/api/demo", json={"records": batch()}, headers=HEADERS).status_code == 403
