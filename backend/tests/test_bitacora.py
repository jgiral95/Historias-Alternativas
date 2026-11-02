"""Bitácora de accesos: quién abrió cada historia, qué hizo, ingresos e intentos sin permiso."""
from conftest import HEADERS, PASSWORD, anon, client_for, make_user, patient


def test_access_log_per_history_and_team():
    make_user("ana@x.co", name="Ana Ruiz")
    make_user("otra@x.co", name="Otra")
    c = client_for("ana@x.co")
    c.put("/api/records/p_1", json=patient("p_1"))
    c.put("/api/records/p_2", json=patient("p_2", nombres="Luis", documento="22"))
    assert c.post("/api/acceso", json={"patientId": "p_1", "vista": "Primera vez"}, headers=HEADERS).status_code == 204
    c.post("/api/acceso", json={"patientId": "p_1", "vista": "Primera vez"}, headers=HEADERS)  # repetido: no se duplica
    c.post("/api/acceso", json={"patientId": "p_9", "vista": "x"}, headers=HEADERS)  # no existe: se ignora
    # la cuenta de equipo
    c.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis Secretario", "password": PASSWORD}, headers=HEADERS)
    s = client_for("secre@x.co")
    s.post("/api/acceso", json={"patientId": "p_1", "vista": "Datos"}, headers=HEADERS)
    assert s.get("/api/bitacora").status_code == 403  # sin permiso…
    assert s.get("/api/encuestas").status_code == 403
    log = c.get("/api/bitacora?patientId=p_1").json()
    acts = [(x["quien"], x["accion"]) for x in log]
    assert ("Luis Secretario", "Abrió la historia · Datos") in acts and ("Ana Ruiz", "Abrió la historia · Primera vez") in acts
    assert sum(1 for a in acts if a[1] == "Abrió la historia · Primera vez") == 1
    assert ("Ana Ruiz", "Guardó datos o documentos de la historia") in acts
    assert all(x["patientId"] == "p_1" for x in log) and log[0]["paciente"] == "María Pérez"
    c.get("/api/records")
    general = c.get("/api/bitacora").json()
    tipos = {x["tipo"] for x in general}
    assert {"login.ok", "history.view", "access.denied", "records.list"} <= tipos
    denied = next(x for x in general if x["tipo"] == "access.denied")
    assert denied["quien"] == "Luis Secretario" and denied["rol"] == "Equipo"
    # otra profesional no ve nada de esto
    o = client_for("otra@x.co")
    assert o.get("/api/bitacora?patientId=p_1").json() == []
    o.post("/api/acceso", json={"patientId": "p_1", "vista": "Datos"}, headers=HEADERS)  # no es su paciente: se ignora
    assert not any(x["quien"] == "Otra" for x in c.get("/api/bitacora?patientId=p_1").json())


def test_failed_login_is_logged():
    make_user("ana@x.co", name="Ana Ruiz")
    anon().post("/api/auth/login", json={"email": "ana@x.co", "password": "equivocada-123"})
    c = client_for("ana@x.co")
    assert any(x["tipo"] == "login.fail" for x in c.get("/api/bitacora").json())
