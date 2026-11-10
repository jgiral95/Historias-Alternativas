from datetime import datetime, timedelta, timezone

from app import survey
from app.db import SessionLocal, SurveyInvite, SurveyResponse

from conftest import HEADERS, anon, client_for, make_user, patient

NOW = datetime.now(timezone.utc)
ISO = NOW.isoformat()
AUTH = {"tipo": survey.DATA_TIPO, "text": "Finalidades: ... enviarme encuestas de satisfacción.", "signedAt": ISO}
OLD_AUTH = {"tipo": survey.DATA_TIPO, "text": "Finalidades: atención y citas.", "signedAt": ISO}


def setup_account(c, **cfg):
    prof = {"id": "profile", "kind": "profile", "nombre": "Ana Psicóloga", "consultorio": "Consultorio Ana", "correo": "ana@x.co",
            "encuesta": {"activa": True, "cadaDias": 30, "cantidad": 10, **cfg}}
    assert c.put("/api/records/profile", json=prof).status_code in (200, 204)
    pats = [patient("p_a", correo="a@pac.co", consents=[AUTH]),          # atendida y autorizó encuestas
            patient("p_b", consents=[OLD_AUTH]),                          # autorización sin encuestas
            patient("p_c", consents=[AUTH]),                              # no atendida en el periodo
            patient("p_d", consents=[{**AUTH, "revocacion": {"alcance": "Total"}}])]  # autorización revocada
    for p in pats:
        assert c.put(f"/api/records/{p['id']}", json=p).status_code == 200
    for pid in ("p_a", "p_b", "p_d"):
        n = {"id": "n_" + pid, "kind": "note", "patientId": pid, "tema": "x", "sessionAt": ISO, "signedAt": ISO, "addenda": []}
        assert c.put(f"/api/records/{n['id']}", json=n).status_code in (200, 204)


def test_draw_picks_only_eligible_and_never_repeats(monkeypatch):
    uid = make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c)
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: False)
    assert c.post("/api/encuestas/sortear", headers=HEADERS).json()["creadas"] == 1
    st = c.get("/api/encuestas").json()
    assert [i["patientId"] for i in st["invitaciones"]] == ["p_a"] and st["invitaciones"][0]["canal"] == "manual"
    assert st["invitaciones"][0]["enlace"]
    # no se vuelve a invitar al mismo paciente en el periodo mínimo
    assert c.post("/api/encuestas/sortear", headers=HEADERS).json()["creadas"] == 0
    # el sorteo automático respeta la frecuencia
    assert survey.draw(uid) == 0
    # con «incluir autorizaciones anteriores» entra p_b, pero nunca la autorización revocada
    prof = c.get("/api/records").json()
    prof = next(r for r in prof if r["kind"] == "profile")
    prof["encuesta"]["incluirAnteriores"] = True
    c.put("/api/records/profile", json=prof)
    assert c.post("/api/encuestas/sortear", headers=HEADERS).json()["creadas"] == 1
    ids = {i["patientId"] for i in c.get("/api/encuestas").json()["invitaciones"]}
    assert ids == {"p_a", "p_b"}
    # encuesta inactiva: no sortea
    prof["encuesta"]["activa"] = False
    c.put("/api/records/profile", json=prof)
    assert c.post("/api/encuestas/sortear", headers=HEADERS).json()["creadas"] == 0


def test_email_is_sent_and_failures_fall_back_to_manual(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c)
    sent = []
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: True)
    monkeypatch.setattr(survey, "send_mail", lambda to, token, p, prof, acc=None: sent.append((to, token)))
    assert c.post("/api/encuestas/sortear", headers=HEADERS).json()["creadas"] == 1
    inv = c.get("/api/encuestas").json()["invitaciones"][0]
    assert sent[0][0] == "a@pac.co" and inv["canal"] == "correo" and inv["enviada"] and "enlace" not in inv
    m = survey.message("a@pac.co", "tok", {"nombres": "María José"}, {"nombre": "Ana Psicóloga", "consultorio": "Consultorio Ana", "correo": "ana@x.co"})
    body = m.get_body(preferencelist=('plain',)).get_content()
    assert "Hola María" in body and "/encuesta?t=tok" in body and "baja=1" in body and m["Reply-To"] == "ana@x.co"
    assert "x" not in m["Subject"].replace("Consultorio", "")  # el asunto no lleva datos clínicos
    # si el correo falla, queda para envío manual con el error
    with SessionLocal() as db:
        db.query(SurveyInvite).delete(); db.commit()

    def boom(*a):
        raise OSError("sin conexión")
    monkeypatch.setattr(survey, "send_mail", boom)
    c.post("/api/encuestas/sortear", headers=HEADERS)
    inv = c.get("/api/encuestas").json()["invitaciones"][0]
    assert inv["canal"] == "manual" and "sin conexión" in inv["error"] and inv["enlace"]


def test_public_survey_is_anonymous_and_single_use(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c)
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: False)
    c.post("/api/encuestas/sortear", headers=HEADERS)
    token = c.get("/api/encuestas").json()["invitaciones"][0]["enlace"]
    pub = anon()
    assert pub.get("/api/encuesta/noexiste-noexiste-noexiste").status_code == 404
    d = pub.get(f"/api/encuesta/{token}").json()
    assert d["estado"] == "abierta" and d["profesional"] == "Ana Psicóloga"
    assert "María" not in str(d)  # la página no muestra datos del paciente
    qs = d["preguntas"]
    assert qs[0]["opciones"][0] == "1 a 3 días"
    resp = {q["id"]: 0 for q in qs if q["tipo"] != "texto"}
    assert pub.post(f"/api/encuesta/{token}", json={"respuestas": {**resp, "op1": 99}}, headers=HEADERS).status_code == 400
    incompleta = dict(resp); incompleta.pop("cp1")
    assert pub.post(f"/api/encuesta/{token}", json={"respuestas": incompleta}, headers=HEADERS).status_code == 400
    assert pub.post(f"/api/encuesta/{token}", json={"respuestas": {**resp, "com": "Todo muy bien"}}, headers=HEADERS).status_code == 204
    assert pub.post(f"/api/encuesta/{token}", json={"respuestas": resp}, headers=HEADERS).status_code == 409
    assert pub.get(f"/api/encuesta/{token}").json()["estado"] == "respondida"
    res = c.get("/api/encuestas/resultados").json()
    assert len(res) == 1 and res[0]["respuestas"]["com"] == "Todo muy bien" and res[0]["mes"] == NOW.strftime("%Y-%m")
    assert "patient" not in str(res).lower() and "p_a" not in str(res)
    with SessionLocal() as db:
        cols = SurveyResponse.__table__.columns.keys()
    assert "patient_id" not in cols and "invite_id" not in cols
    # la respuesta no se puede quitar; otra cuenta no ve nada
    inv = c.get("/api/encuestas").json()["invitaciones"][0]
    assert c.delete(f"/api/encuestas/{inv['id']}", headers=HEADERS).status_code == 409
    make_user("otro@x.co")
    o = client_for("otro@x.co")
    assert o.get("/api/encuestas/resultados").json() == [] and o.get("/api/encuestas").json()["invitaciones"] == []
    assert o.post(f"/api/encuestas/{inv['id']}/enviada", headers=HEADERS).status_code == 404


def test_optout_and_expiry(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c, incluirAnteriores=True)
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: False)
    c.post("/api/encuestas/sortear", headers=HEADERS)
    invs = c.get("/api/encuestas").json()["invitaciones"]
    a = next(i for i in invs if i["patientId"] == "p_a")
    assert anon().post(f"/api/encuesta/{a['enlace']}/baja", headers=HEADERS).status_code == 204
    st = c.get("/api/encuestas").json()
    assert "p_a" in st["bajas"] and next(i for i in st["invitaciones"] if i["patientId"] == "p_a")["estado"] == "vencida"
    # aunque pase el periodo mínimo, quien pidió la baja no vuelve a salir
    with SessionLocal() as db:
        for inv in db.query(SurveyInvite).all():
            inv.created_at = NOW - timedelta(days=400)
        db.commit()
    c.post("/api/encuestas/sortear", headers=HEADERS)
    again = [i["patientId"] for i in c.get("/api/encuestas").json()["invitaciones"] if survey.aware(datetime.fromisoformat(i["creada"])) > NOW - timedelta(days=1)]
    assert "p_a" not in again and "p_b" in again
    # cancelar una invitación manual que no se ha respondido
    b = next(i for i in c.get("/api/encuestas").json()["invitaciones"] if i["patientId"] == "p_b" and i["estado"] == "abierta")
    assert c.post(f"/api/encuestas/{b['id']}/enviada", headers=HEADERS).status_code == 204
    assert c.delete(f"/api/encuestas/{b['id']}", headers=HEADERS).status_code == 204
    assert anon().get("/api/encuestas").status_code == 401


def test_custom_questions_are_validated():
    qs = survey.clean_questions([{"id": "a1", "dim": "Mía", "texto": "¿Bien?", "tipo": "sino"}, {"id": "a1", "texto": "dup", "tipo": "sino"},
                                 {"id": "b", "texto": "x", "tipo": "raro"}, {"id": "c", "texto": "", "tipo": "escala"}])
    assert qs == [{"id": "a1", "dim": "Mía", "texto": "¿Bien?", "tipo": "sino"}]
    assert survey.clean_questions([]) == survey.DEFAULT_QUESTIONS


def test_test_survey_email_does_not_count(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c)
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: False)
    r = c.post("/api/encuestas/prueba", json={"correo": "yo@prueba.co"}, headers=HEADERS).json()
    assert r["enviado"] is False and "no ha configurado su correo" in r["motivo"] and r["enlace"]
    assert c.post("/api/encuestas/prueba", json={"correo": "no-es-correo"}, headers=HEADERS).status_code == 400
    sent = []
    monkeypatch.setattr(survey, "smtp_enabled", lambda *a: True)
    monkeypatch.setattr(survey, "send_mail", lambda to, token, p, prof, acc=None: sent.append((to, token)))
    r = c.post("/api/encuestas/prueba", json={"correo": "yo@prueba.co"}, headers=HEADERS).json()
    assert r["enviado"] is True and sent[0] == ("yo@prueba.co", r["enlace"])
    # se puede responder, pero no aparece en invitaciones ni en resultados
    pub = anon()
    qs = pub.get(f"/api/encuesta/{r['enlace']}").json()["preguntas"]
    assert pub.post(f"/api/encuesta/{r['enlace']}", json={"respuestas": {q["id"]: 0 for q in qs if q["tipo"] != "texto"}}, headers=HEADERS).status_code == 204
    invs, res = c.get("/api/encuestas").json()["invitaciones"], c.get("/api/encuestas/resultados").json()
    assert all(i["prueba"] for i in invs) and len(res) == 1 and res[0]["prueba"] is True
    # se borran todas las pruebas de una vez
    assert c.post("/api/encuestas/borrar-pruebas", headers=HEADERS).status_code == 204
    assert c.get("/api/encuestas").json()["invitaciones"] == [] and c.get("/api/encuestas/resultados").json() == []

    def boom(*a):
        raise OSError("535 Username and Password not accepted")
    monkeypatch.setattr(survey, "send_mail", boom)
    r = c.post("/api/encuestas/prueba", json={"correo": "yo@prueba.co"}, headers=HEADERS).json()
    assert r["enviado"] is False and "535" in r["motivo"]


def test_each_professional_sends_from_own_email(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup_account(c)
    assert c.get("/api/correo").json()["propio"] is False
    assert c.get("/api/encuestas").json()["correo"] is False  # sin correo propio ni del servidor
    logins = []
    monkeypatch.setattr(survey, "check_login", lambda acc: logins.append(acc))
    r = c.put("/api/correo", json={"correo": "ana.psicologa@gmail.com", "password": "abcd efgh ijkl mnop"}, headers=HEADERS)
    assert r.status_code == 200 and r.json()["host"] == "smtp.gmail.com" and r.json()["port"] == 587
    assert logins[0]["password"] == "abcdefghijklmnop"  # Gmail muestra la clave con espacios
    assert "password" not in str(c.get("/api/correo").json()) and "abcd" not in str(c.get("/api/correo").json())
    assert c.put("/api/correo", json={"correo": "ana@miconsultorio.co", "password": "x"}, headers=HEADERS).status_code == 400
    ok = c.put("/api/correo", json={"correo": "ana@miconsultorio.co", "password": "x", "host": "mail.miconsultorio.co", "port": 465}, headers=HEADERS)
    assert ok.status_code == 200 and ok.json()["host"] == "mail.miconsultorio.co"

    def bad(acc):
        raise OSError("(535, b'5.7.8 Username and Password not accepted')")
    monkeypatch.setattr(survey, "check_login", bad)
    r = c.put("/api/correo", json={"correo": "ana.psicologa@gmail.com", "password": "mala"}, headers=HEADERS)
    assert r.status_code == 400 and "contraseña de aplicación" in r.json()["detail"]
    assert c.get("/api/correo").json()["correo"] == "ana@miconsultorio.co"  # si falla, no cambia lo guardado
    # el sorteo envía desde el correo del profesional, con su nombre
    used = []
    monkeypatch.setattr(survey, "send_mail", lambda to, token, p, prof, acc=None: used.append(survey.message(to, token, p, prof, acc)))
    assert c.get("/api/encuestas").json()["correo"] is True
    c.post("/api/encuestas/sortear", headers=HEADERS)
    m = used[0]
    assert m["From"] == "Ana Psicóloga <ana@miconsultorio.co>" or "ana@miconsultorio.co" in m["From"]
    assert m["Reply-To"] == "ana@miconsultorio.co" and "/encuesta?t=" in m.get_body(preferencelist=('plain',)).get_content()
    # otra cuenta no usa ese correo
    make_user("otro@x.co")
    assert client_for("otro@x.co").get("/api/correo").json()["propio"] is False
    assert c.delete("/api/correo", headers=HEADERS).status_code == 204 and c.get("/api/correo").json()["propio"] is False
