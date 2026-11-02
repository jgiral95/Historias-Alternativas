"""Firma de consentimientos a distancia: enlace personal, documento de identidad, hora del servidor e inmutabilidad."""
from datetime import datetime, timezone

from app import firmas, survey

from conftest import HEADERS, PASSWORD, anon, client_for, make_user, patient

SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
NOW = datetime.now(timezone.utc).isoformat()


def setup(c):
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "registro": "TP-1", "cedula": "52", "firma": SIG, "consultorio": "Consultorio Ana"})
    c.put("/api/records/p_1", json=patient("p_1", documento="1.020.304", correo="maria@pac.co", telefono="300",
                                           consents=[{"tipo": "Atención presencial", "text": "uno", "signedAt": NOW, "signerSig": SIG}]))


def body(**k):
    return {"patientId": "p_1", "tipo": "Teleterapia (atención a distancia)", "text": "Texto del **consentimiento** para María.",
            "signerType": "Paciente", "signerName": "María Pérez", "signerDoc": "1.020.304", **k}


def pat(c):
    return next(r for r in c.get("/api/records").json() if r["id"] == "p_1")


def test_remote_signature_flow(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c)
    assert c.post("/api/firmas", json=body(signerDoc=""), headers=HEADERS).status_code == 400
    assert c.post("/api/firmas", json=body(patientId="p_9"), headers=HEADERS).status_code == 404
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "ana@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(firmas, "send_mail", lambda to, b, prof, acc: sent.append((to, b)))
    r = c.post("/api/firmas", json=body(correo=True), headers=HEADERS).json()
    assert r["estado"] == "pendiente" and r["correoEnviado"] and sent[0][0] == "maria@pac.co" and "/firmar?t=" + r["enlace"] in sent[0][1]
    tok, pub = r["enlace"], anon()
    head = pub.get(f"/api/firma/{tok}").json()
    assert head["profesional"] == "Ana Ruiz" and head["estado"] == "pendiente" and "texto" not in head and "María" not in str(head)
    # sin el documento no se abre; con puntos o sin ellos sí
    bad = pub.post(f"/api/firma/{tok}/abrir", json={"documento": "999"}, headers=HEADERS)
    assert bad.status_code == 403 and "4 intentos" in bad.json()["detail"]
    op = pub.post(f"/api/firma/{tok}/abrir", json={"documento": "1020304"}, headers=HEADERS).json()
    assert "consentimiento" in op["texto"] and op["sha256"] == firmas.text_hash(op["texto"])
    assert op["terapeuta"]["firma"] == SIG and op["terapeuta"]["registro"] == "TP-1" and op["terapeuta"]["nombre"] == "Ana Ruiz"
    assert pub.post(f"/api/firma/{tok}", json={"documento": "1020304", "firma": SIG}, headers=HEADERS).status_code == 400  # sin aceptar
    assert pub.post(f"/api/firma/{tok}", json={"documento": "1020304", "firma": "x", "acepto": True}, headers=HEADERS).status_code == 400
    s = pub.post(f"/api/firma/{tok}", json={"documento": "1020304", "firma": SIG, "acepto": True, "sha256": op["sha256"]}, headers=HEADERS)
    assert s.status_code == 200
    p = pat(c)
    cs = p["consents"]
    assert len(cs) == 2 and cs[1]["signerSig"] == SIG and cs[1]["therapistName"] == "Ana Ruiz" and cs[1]["therapistSig"] == SIG
    rem = cs[1]["remoto"]
    assert rem["id"] == r["ref"] and rem["sha256"] == op["sha256"] and rem["enviadoAt"] and rem["firmadoAt"] == cs[1]["signedAt"]
    assert abs((datetime.fromisoformat(cs[1]["signedAt"]) - datetime.now(timezone.utc)).total_seconds()) < 60  # hora del servidor
    # el enlace ya no sirve
    assert pub.get(f"/api/firma/{tok}").json()["estado"] == "firmado"
    assert pub.post(f"/api/firma/{tok}", json={"documento": "1020304", "firma": SIG, "acepto": True}, headers=HEADERS).status_code == 409
    lst = c.get("/api/firmas").json()
    assert lst[0]["estado"] == "firmado" and lst[0]["enlace"] is None
    # inmutable: no se puede modificar ni quitar
    p2 = {k: v for k, v in p.items() if k not in ("abiertaEl", "cambios", "firmasCambios")}
    mod = {**p2, "consents": [cs[0], {**cs[1], "text": "otro"}]}
    assert c.put("/api/records/p_1", json=mod).status_code == 409
    assert c.post(f"/api/firmas/{r['ref']}/anular", headers=HEADERS).status_code == 409


def test_stale_screen_keeps_remote_consent():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c)
    stale = pat(c)  # el profesional tiene la historia abierta
    tok = c.post("/api/firmas", json=body(), headers=HEADERS).json()["enlace"]
    anon().post(f"/api/firma/{tok}", json={"documento": "1020304", "firma": SIG, "acepto": True}, headers=HEADERS)
    stale = {k: v for k, v in stale.items() if k not in ("abiertaEl", "cambios", "firmasCambios")}
    # guarda un cambio de datos con la pantalla desactualizada: no se pierde el consentimiento
    r = c.put("/api/records/p_1", json={**stale, "ciudad": "Cali"})
    assert r.status_code == 200 and len(r.json()["consents"]) == 2
    # y si además firma otro en consulta, ambos quedan
    new = {"tipo": "Autorización", "text": "dos", "signedAt": datetime.now(timezone.utc).isoformat(), "signerSig": SIG}
    r = c.put("/api/records/p_1", json={**stale, "ciudad": "Cali", "consents": stale["consents"] + [new]})
    assert r.status_code == 200
    cs = pat(c)["consents"]
    assert [x["text"] for x in cs] == ["uno", "Texto del **consentimiento** para María.", "dos"] and pat(c)["ciudad"] == "Cali"


def test_attempts_cancel_and_isolation():
    make_user("ana@x.co")
    make_user("otro@x.co")
    c = client_for("ana@x.co")
    setup(c)
    r = c.post("/api/firmas", json=body(), headers=HEADERS).json()
    pub = anon()
    for _ in range(firmas.MAX_ATTEMPTS):
        pub.post(f"/api/firma/{r['enlace']}/abrir", json={"documento": "1"}, headers=HEADERS)
    assert pub.post(f"/api/firma/{r['enlace']}/abrir", json={"documento": "1020304"}, headers=HEADERS).status_code == 409  # bloqueado
    r2 = c.post("/api/firmas", json=body(), headers=HEADERS).json()
    o = client_for("otro@x.co")
    assert o.post(f"/api/firmas/{r2['ref']}/anular", headers=HEADERS).status_code == 404
    assert o.get("/api/firmas").json() == []
    assert c.post(f"/api/firmas/{r2['ref']}/anular", headers=HEADERS).status_code == 204
    assert pub.get(f"/api/firma/{r2['enlace']}").json()["estado"] == "anulado"
    # el equipo no puede enviar consentimientos
    c.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    s = client_for("secre@x.co")
    assert s.post("/api/firmas", json=body(), headers=HEADERS).status_code == 403
    assert s.get("/api/firmas").status_code == 403
