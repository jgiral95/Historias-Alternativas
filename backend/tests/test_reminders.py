from datetime import datetime, timedelta, timezone

from app import reminders, survey

from conftest import HEADERS, PASSWORD, anon, client_for, consent, make_user, patient


def iso(h):
    return (datetime.now(timezone.utc) + timedelta(hours=h)).isoformat()


def setup(c, activo=True):
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "consultorio": "Consultorio Ana",
                                         "recordatorios": {"activo": activo, "horas": 24}})
    c.put("/api/records/p_1", json=patient("p_1", correo="maria@pac.co", telefono="3001234567", consents=consent()))
    c.put("/api/records/p_2", json=patient("p_2", nombres="Sin", apellidos="Correo", telefono="3009999999", consents=consent()))
    for aid, pid, h in (("a_1", "p_1", 5), ("a_2", "p_1", 72), ("a_3", "p_2", 5), ("a_4", "p_1", -2)):
        c.put(f"/api/records/{aid}", json={"id": aid, "kind": "appt", "patientId": pid, "startAt": iso(h), "duracion": 50, "modalidad": "Virtual", "estado": "Programada"})


def test_email_reminders_only_for_due_appointments(monkeypatch):
    uid = make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c)
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "ana@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(reminders, "send_mail", lambda to, body, prof, acc: sent.append((to, body)))
    assert reminders.due(uid) == 1
    to, body = sent[0]
    assert to == "maria@pac.co" and "Ana Ruiz" in body and "virtual" in body and "/cita?t=" in body
    assert "diagn" not in body.lower()
    assert reminders.due(uid) == 0  # no repite
    st = c.get("/api/recordatorios").json()
    assert st["activo"] and st["correo"] and st["items"]["a_1"]["canal"] == "correo" and st["items"]["a_1"]["enviado"]
    assert "a_3" not in st["items"]  # sin correo: queda para WhatsApp
    # si está desactivado no envía nada
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "recordatorios": {"activo": False}})
    c.put("/api/records/a_5", json={"id": "a_5", "kind": "appt", "patientId": "p_1", "startAt": iso(3), "estado": "Programada"})
    assert reminders.due(uid) == 0


def test_per_appointment_days_and_frequency(monkeypatch):
    uid = make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c, activo=False)  # sin recordatorio general: solo cuentan las citas con recordatorio propio
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "ana@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(reminders, "send_mail", lambda to, body, prof, acc: sent.append(to))
    c.put("/api/records/a_6", json={"id": "a_6", "kind": "appt", "patientId": "p_1", "startAt": iso(24 * 4), "estado": "Programada", "rec": {"activo": True, "dias": 5, "frec": 2}})
    c.put("/api/records/a_7", json={"id": "a_7", "kind": "appt", "patientId": "p_1", "startAt": iso(24 * 9), "estado": "Programada", "rec": {"activo": True, "dias": 5, "frec": 2}})
    assert reminders.due(uid) == 1 and len(sent) == 1  # a_6 entra en su ventana de 5 días; a_7 todavía no
    assert reminders.due(uid) == 0  # aún no pasan 2 días
    later = datetime.now(timezone.utc) + timedelta(days=2, minutes=5)
    assert reminders.due(uid, later) == 1  # se repite cada 2 días
    c.put("/api/records/a_6", json={"id": "a_6", "kind": "appt", "patientId": "p_1", "startAt": iso(24 * 4), "estado": "Programada", "rec": {"activo": True, "dias": 5, "frec": 0}})
    assert reminders.due(uid, later + timedelta(days=1)) == 0  # «una sola vez»: no repite


def test_patient_confirms_or_cancels_from_link(monkeypatch):
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c)
    tok = c.post("/api/recordatorios/a_3/enlace", headers=HEADERS).json()["enlace"]
    assert c.post("/api/recordatorios/a_3/enlace", headers=HEADERS).json()["enlace"] == tok  # el mismo enlace
    pub = anon()
    d = pub.get(f"/api/cita/{tok}").json()
    assert d["profesional"] == "Ana Ruiz" and d["modalidad"] == "Virtual" and d["estado"] == "Programada" and " a las " in d["cuando"]
    assert "Sin" not in str(d)  # no muestra datos del paciente
    assert pub.post(f"/api/cita/{tok}", json={"accion": "borrar"}, headers=HEADERS).status_code == 400
    assert pub.post(f"/api/cita/{tok}", json={"accion": "confirmar"}, headers=HEADERS).json()["respuesta"] == "Confirmada"
    a = next(r for r in c.get("/api/records").json() if r["id"] == "a_3")
    assert a["confirmacion"]["estado"] == "Confirmada" and a["estado"] == "Programada"
    assert pub.post(f"/api/cita/{tok}", json={"accion": "cancelar"}, headers=HEADERS).status_code == 200
    a = next(r for r in c.get("/api/records").json() if r["id"] == "a_3")
    assert a["estado"] == "Cancelada" and a["confirmacion"]["estado"] == "Cancelada por el consultante"
    assert pub.post(f"/api/cita/{tok}", json={"accion": "confirmar"}, headers=HEADERS).status_code == 409  # ya cancelada
    assert c.get("/api/recordatorios").json()["items"]["a_3"]["respuesta"] == "Cancelada por el consultante"
    old = c.post("/api/recordatorios/a_4/enlace", headers=HEADERS).json()["enlace"]
    assert pub.post(f"/api/cita/{old}", json={"accion": "confirmar"}, headers=HEADERS).status_code == 409  # cita pasada
    assert pub.get("/api/cita/noexiste-noexiste-noexiste").status_code == 404


def test_team_can_send_whatsapp_reminders():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    setup(c)
    c.post("/api/equipo", json={"email": "s@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    s = client_for("s@x.co")
    assert s.post("/api/recordatorios/a_3/enlace", headers=HEADERS).status_code == 200
    assert s.post("/api/recordatorios/a_3/enviado", headers=HEADERS).status_code == 204
    assert c.get("/api/recordatorios").json()["items"]["a_3"]["canal"] == "whatsapp"
    make_user("otro@x.co")
    assert client_for("otro@x.co").post("/api/recordatorios/a_3/enlace", headers=HEADERS).status_code == 404
