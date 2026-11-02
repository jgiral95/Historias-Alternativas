"""Folio consecutivo por tipo de registro, número de sesión y una sola historia por documento."""
from datetime import datetime, timezone

from conftest import client_for, make_user, patient


def now():
    return datetime.now(timezone.utc).isoformat()


def note(i, pid="p_1", signed=True):
    n = {"id": f"n_{i}", "kind": "note", "patientId": pid, "sessionAt": now(), "tema": f"sesión {i}", "addenda": []}
    if signed:
        n["signedAt"] = now()
    return n


def test_folios_and_session_numbers():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    base = patient("p_1", documento="1.020.304")
    c.put("/api/records/p_1", json=base)
    # consentimientos: folio 1 y 2; primera vez: folio 1, sesión 1
    r = c.put("/api/records/p_1", json={**base, "consents": [{"tipo": "a", "text": "t", "signedAt": now(), "folio": 99}]}).json()
    assert r["consents"][0]["folio"] == 1  # el servidor ignora el que mande el navegador
    pat = next(x for x in c.get("/api/records").json() if x["id"] == "p_1")
    clean = lambda p: {k: v for k, v in p.items() if k not in ("abiertaEl", "cambios", "firmasCambios")}
    # el navegador guarda sin el folio: se conserva (no es un cambio a un documento firmado)
    stale = {**clean(pat), "consents": [{k: v for k, v in pat["consents"][0].items() if k != "folio"}]}
    stale["consents"].append({"tipo": "b", "text": "t", "signedAt": now()})
    stale["intake"] = {"motivo": "x", "signedAt": now(), "addenda": []}
    r = c.put("/api/records/p_1", json=stale)
    assert r.status_code == 200 and [x["folio"] for x in r.json()["consents"]] == [1, 2] and r.json()["intake"]["sesion"] == 1
    # sesiones: folio 1, 2… y sesión 2, 3… (la primera vez fue la sesión 1); un borrador no cuenta
    c.put("/api/records/n_0", json=note(0, signed=False))
    assert c.put("/api/records/n_1", json=note(1)).json() == {"folio": 1, "sesion": 2}
    assert c.put("/api/records/n_2", json=note(2)).json() == {"folio": 2, "sesion": 3}
    # una adenda posterior (sin el folio en lo que manda el navegador) no lo pierde ni falla
    n2 = next(x for x in c.get("/api/records").json() if x["id"] == "n_2")
    n2 = {k: v for k, v in n2.items() if k not in ("folio", "sesion")}
    n2["addenda"] = [{"text": "aclaración", "at": now(), "by": "Ana"}]
    assert c.put("/api/records/n_2", json=n2).status_code == 204
    n2 = next(x for x in c.get("/api/records").json() if x["id"] == "n_2")
    assert n2["folio"] == 2 and n2["sesion"] == 3 and len(n2["addenda"]) == 1
    # cada paciente tiene su propia numeración
    c.put("/api/records/p_2", json=patient("p_2", documento="555"))
    assert c.put("/api/records/n_9", json=note(9, pid="p_2")).json() == {"folio": 1, "sesion": 1}


def test_one_history_per_document():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    c.put("/api/records/p_1", json=patient("p_1", documento="1.020.304"))
    r = c.put("/api/records/p_2", json=patient("p_2", nombres="Otra", documento="1020304"))
    assert r.status_code == 409 and "María Pérez" in r.json()["detail"]
    assert c.put("/api/records/p_3", json=patient("p_3", documento="999")).status_code == 200
    # otra profesional sí puede tener a la misma persona
    make_user("luz@x.co")
    assert client_for("luz@x.co").put("/api/records/p_1", json=patient("p_1", documento="1020304")).status_code == 200
