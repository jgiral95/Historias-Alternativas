import pytest

from app import formularios, main, survey
from conftest import anon, client_for, make_user, patient

OK = {"nombres": "Luisa", "apellidos": "Mora", "tipoDoc": "CC", "documento": "123456", "nacimiento": "1990-05-04", "paisNac": "Colombia", "ciudad": "Bogotá", "telInd": "+57", "sexo": "Femenino", "telefono": "3001234567"}


TODOS = list(formularios.DEFAULT) + ["tipoDoc", "documento", "nacimiento", "paisNac", "ciudad", "telInd", "sexo", "etnia", "emergTelefono"]


def elegir(c, campos, datos=None):
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana", "formatos": {"formulario": campos, "datos": datos or []}})


def tok(c, **kw):
    return c.post("/api/formularios", json=kw).json()["enlace"]


def test_flujo_recibir_revisar_y_crear_paciente():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    elegir(c, TODOS)
    f = c.post("/api/formularios", json={"nombre": "Luisa"}).json()
    assert f["estado"] == "pendiente" and f["enlace"]
    p = anon().get(f"/api/formulario/{f['enlace']}").json()
    assert {x["k"] for x in p["campos"]} >= {"nombres", "documento", "nacimiento", "paisNac", "ciudad", "etnia", "emergTelefono"}
    assert not {x["k"] for x in p["campos"]} & {"acudNombre", "acud2Nombre", "servicio", "estado", "eps"}  # sin cuidadores ni datos del terapeuta
    assert anon().post(f"/api/formulario/{f['enlace']}", json={"datos": OK}).json() == {"ok": True}
    r = c.get("/api/formularios").json()[0]
    assert r["estado"] == "recibido" and r["datos"]["documento"] == "123456" and r["enlace"] is None
    assert anon().post(f"/api/formulario/{f['enlace']}", json={"datos": OK}).status_code == 409  # un solo uso
    pid = "p_1"
    assert c.put(f"/api/records/{pid}", json=patient(pid, **{k: v for k, v in r['datos'].items() if k not in ('nombres', 'apellidos')}, nombres=r['datos']['nombres'], apellidos=r['datos']['apellidos'])).status_code == 200
    assert c.post(f"/api/formularios/{f['ref']}/creado", json={"patientId": pid}).status_code == 204
    r = c.get("/api/formularios").json()[0]
    assert r["estado"] == "creado" and r["datos"] is None  # los datos recibidos se borran


def test_validacion_de_lo_que_envia_el_paciente():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    elegir(c, TODOS)
    t = tok(c)
    for malo in ({**OK, "nombres": ""}, {**OK, "sexo": "X"}, {**OK, "nacimiento": "2999-01-01"}, {**OK, "correo": "no-es-correo"}, {**OK, "documento": "9" * 300}):
        assert anon().post(f"/api/formulario/{t}", json={"datos": malo}).status_code == 400
    ok = anon().post(f"/api/formulario/{t}", json={"datos": {**OK, "extra": "ignorado", "estado": "Activo"}})
    assert ok.status_code == 200
    d = client_for("ana@x.co").get("/api/formularios").json()[0]["datos"]
    assert "extra" not in d and "estado" not in d


def test_anular_vence_y_aislamiento():
    make_user("ana@x.co"); make_user("beto@x.co")
    c, b = client_for("ana@x.co"), client_for("beto@x.co")
    f = c.post("/api/formularios", json={}).json()
    assert b.get("/api/formularios").json() == [] and b.post(f"/api/formularios/{f['ref']}/anular").status_code == 404
    anon().post(f"/api/formulario/{f['enlace']}", json={"datos": OK})
    assert c.post(f"/api/formularios/{f['ref']}/anular").status_code == 204
    r = c.get("/api/formularios").json()[0]
    assert r["estado"] == "anulado" and r["datos"] is None
    assert anon().get(f"/api/formulario/{f['enlace']}").status_code == 409
    assert anon().get("/api/formulario/" + "x" * 30).status_code == 404
    h = c.post("/api/formularios", json={}).json()
    assert c.delete(f"/api/formularios/{h['ref']}").status_code == 409  # pendiente: no se elimina
    assert b.delete(f"/api/formularios/{f['ref']}").status_code == 404
    assert c.delete(f"/api/formularios/{f['ref']}").status_code == 204
    assert [x["ref"] for x in c.get("/api/formularios").json()] == [h["ref"]]
    c.post(f"/api/formularios/{h['ref']}/anular")
    from datetime import datetime, timedelta, timezone
    from app.db import IntakeForm, SessionLocal
    g = c.post("/api/formularios", json={}).json()
    with SessionLocal() as db:
        db.get(IntakeForm, main.firmas.token_hash(g["enlace"])).expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    assert anon().get(f"/api/formulario/{g['enlace']}").status_code == 409


def test_envio_por_correo(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "ana@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(formularios, "send_mail", lambda to, body, prof, acc: sent.append((to, body)))
    assert c.post("/api/formularios", json={"enviar": True, "correo": "mal"}).status_code == 400
    f = c.post("/api/formularios", json={"nombre": "Luisa", "correo": "luisa@x.co", "enviar": True}).json()
    assert f["correoEnviado"] is True and sent[0][0] == "luisa@x.co" and "https://h.co/formulario?t=" + f["enlace"] in sent[0][1]
    assert c.post(f"/api/formularios/{f['ref']}/correo").json()["correoEnviado"] is True and len(sent) == 2


def test_el_terapeuta_elige_los_campos_del_formulario():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    t = tok(c)  # sin elección: solo lo básico
    assert [x["k"] for x in anon().get(f"/api/formulario/{t}").json()["campos"]] == ["nombres", "apellidos", "telefono", "correo"]
    elegir(c, ["apellidos", "xig"], [["Redes", [["xig", "Instagram", 1], ["xno", "Otro", 1]]]])  # el nombre siempre va; xno no se eligió
    t = tok(c)
    campos = anon().get(f"/api/formulario/{t}").json()["campos"]
    assert [x["k"] for x in campos] == ["nombres", "apellidos", "xig"] and campos[2]["l"] == "Instagram" and campos[2]["s"] == "Redes"
    assert anon().post(f"/api/formulario/{t}", json={"datos": {"apellidos": "Mora"}}).status_code == 400  # falta el nombre
    assert anon().post(f"/api/formulario/{t}", json={"datos": {"nombres": "Luisa", "apellidos": "Mora", "xig": "@luisa", "xno": "no", "documento": "1"}}).status_code == 200
    d = c.get("/api/formularios").json()[0]["datos"]
    assert d == {"nombres": "Luisa", "apellidos": "Mora", "xig": "@luisa"}
