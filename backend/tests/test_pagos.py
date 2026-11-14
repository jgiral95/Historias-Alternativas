from datetime import date

from conftest import HEADERS, PASSWORD, client_for, make_user, patient

HOY = date.today().isoformat()


def pago(pid="pa_1", **extra):
    return {"id": pid, "kind": "pago", "patientId": "p_1", "monto": 80000, "fecha": HOY, "medio": "Efectivo", **extra}


def setup():
    make_user("pro@x.co", name="Ana Profesional")
    pro = client_for("pro@x.co")
    pro.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana", "tarifas": {"Presencial": 80000}})
    pro.put("/api/records/p_1", json=patient("p_1"))
    return pro


def test_pago_validations():
    pro = setup()
    assert pro.put("/api/records/pa_1", json=pago()).status_code == 204
    for bad in ({"monto": 0}, {"monto": -5}, {"monto": 1.5}, {"monto": "80000"}, {"medio": "Bitcoin"}, {"fecha": "2999-01-01"},
                {"fecha": "ayer"}, {"patientId": "p_x"}, {"anulado": True}):
        assert pro.put("/api/records/pa_2", json=pago("pa_2", **bad)).status_code == 400, bad
    assert pro.put("/api/records/pb_1", json=pago("pb_1")).status_code == 400  # prefijo


def test_pago_is_immutable_and_can_only_be_voided():
    pro = setup()
    assert pro.put("/api/records/pa_1", json=pago()).status_code == 204
    got = next(r for r in pro.get("/api/records").json() if r["id"] == "pa_1")
    assert got["registradoPor"] == {"por": "Ana Profesional", "rol": "Profesional"} and got["registradoEn"]
    assert pro.put("/api/records/pa_1", json={**got, "monto": 1}).status_code == 409
    assert pro.put("/api/records/pa_1", json={**got, "nota": "abono"}).status_code == 204
    assert pro.put("/api/records/pa_1", json={**got, "nota": "abono", "anulado": True}).status_code == 400  # falta motivo
    assert pro.put("/api/records/pa_1", json={**got, "nota": "abono", "anulado": True, "anuladoMotivo": "Error de digitación"}).status_code == 204
    v = next(r for r in pro.get("/api/records").json() if r["id"] == "pa_1")
    assert v["anulado"] and v["anuladoPor"]["por"] == "Ana Profesional" and v["anuladoEn"]
    assert pro.put("/api/records/pa_1", json={**v, "anulado": False}).status_code == 409
    assert pro.delete("/api/records/pa_1", headers=HEADERS).status_code == 409
    log = pro.get("/api/bitacora").json()
    assert any("pago" in str(x) for x in log)


def test_team_can_register_and_void_payments_but_not_clinical():
    pro = setup()
    assert pro.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis Secretario", "password": PASSWORD}, headers=HEADERS).status_code == 201
    s = client_for("secre@x.co")
    assert s.put("/api/records/pa_1", json=pago()).status_code == 204
    recs = {r["id"]: r for r in s.get("/api/records").json()}
    assert recs["pa_1"]["registradoPor"] == {"por": "Luis Secretario", "rol": "Equipo"}
    assert recs["profile"]["tarifas"] == {"Presencial": 80000}
    assert s.put("/api/records/pa_1", json={**recs["pa_1"], "anulado": True, "anuladoMotivo": "Duplicado"}).status_code == 204
    assert s.put("/api/records/n_1", json={"id": "n_1", "kind": "note", "patientId": "p_1", "signedAt": "2026-01-01T00:00:00+00:00"}).status_code == 403
    assert s.delete("/api/records/pa_1", headers=HEADERS).status_code == 403


def test_void_works_without_server_fields_in_the_client_copy():
    pro = setup()
    assert pro.put("/api/records/pa_1", json=pago()).status_code == 204  # el navegador conserva su copia sin registradoEn/Por
    assert pro.put("/api/records/pa_1", json={**pago(), "anulado": True, "anuladoMotivo": "Duplicado"}).status_code == 204
    v = next(r for r in pro.get("/api/records").json() if r["id"] == "pa_1")
    assert v["registradoPor"]["por"] == "Ana Profesional" and v["registradoEn"] and v["anulado"]


def test_pago_ligado_a_una_cita():
    pro = setup()
    assert pro.put("/api/records/a_1", json={"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": "2026-01-05T10:00:00", "estado": "Atendida", "modalidad": "Presencial"}).status_code == 204
    pro.put("/api/records/p_2", json=patient("p_2"))
    assert pro.put("/api/records/pa_1", json=pago(citaId="a_1")).status_code == 204
    assert pro.put("/api/records/pa_2", json=pago("pa_2", citaId="a_x")).status_code == 400  # no existe
    assert pro.put("/api/records/pa_3", json={**pago("pa_3", citaId="a_1"), "patientId": "p_2"}).status_code == 400  # cita de otro paciente
    got = next(r for r in pro.get("/api/records").json() if r["id"] == "pa_1")
    assert got["citaId"] == "a_1"
    assert pro.put("/api/records/pa_1", json={**got, "citaId": "a_2"}).status_code == 409  # la cita no cambia después


def test_pago_sin_cita_con_fecha_de_sesion():
    pro = setup()
    assert pro.put("/api/records/pa_1", json=pago(sinCita=True, citaFecha="2026-10-20")).status_code == 204
    assert pro.put("/api/records/pa_2", json=pago("pa_2", sinCita=True, citaFecha="mañana")).status_code == 400
    assert pro.put("/api/records/pa_3", json=pago("pa_3", citaFecha="2026-10-20")).status_code == 400  # sin «sin cita»
    got = next(r for r in pro.get("/api/records").json() if r["id"] == "pa_1")
    assert pro.put("/api/records/pa_1", json={**got, "citaFecha": "2026-10-21"}).status_code == 409


def cobro(cid="co_1", **extra):
    return {"id": cid, "kind": "cobro", "patientId": "p_1", "concepto": "Taller de respiración", "monto": 120000, "fecha": HOY, **extra}


def test_cobro_validations_and_link():
    pro = setup()
    assert pro.put("/api/records/co_1", json=cobro()).status_code == 204
    for bad in ({"monto": 0}, {"monto": 1.5}, {"concepto": "  "}, {"fecha": "2999-01-01"}, {"patientId": "p_x"}, {"anulado": True}):
        assert pro.put("/api/records/co_2", json=cobro("co_2", **bad)).status_code == 400, bad
    assert pro.put("/api/records/cx_1", json=cobro("cx_1")).status_code == 400  # prefijo
    assert pro.put("/api/records/pa_1", json=pago(cobroId="co_1", monto=50000)).status_code == 204
    assert pro.put("/api/records/pa_2", json=pago("pa_2", cobroId="co_x")).status_code == 400  # cobro inexistente
    assert pro.put("/api/records/pa_3", json=pago("pa_3", cobroId="co_1", sinCita=True)).status_code == 400
    assert pro.delete("/api/records/co_1").status_code == 409


def test_cobro_is_immutable_and_can_only_be_voided():
    pro = setup()
    assert pro.put("/api/records/co_1", json=cobro()).status_code == 204
    got = next(r for r in pro.get("/api/records").json() if r["id"] == "co_1")
    assert got["registradoPor"]["por"] == "Ana Profesional"
    assert pro.put("/api/records/co_1", json={**got, "monto": 1}).status_code == 409
    assert pro.put("/api/records/co_1", json={**got, "anulado": True}).status_code == 400  # falta motivo
    assert pro.put("/api/records/co_1", json={**got, "anulado": True, "anuladoMotivo": "Error"}).status_code == 204
    v = next(r for r in pro.get("/api/records").json() if r["id"] == "co_1")
    assert pro.put("/api/records/co_1", json={**v, "anulado": False}).status_code == 409
    assert pro.put("/api/records/pa_9", json=pago("pa_9", cobroId="co_1")).status_code == 400  # cobro anulado
