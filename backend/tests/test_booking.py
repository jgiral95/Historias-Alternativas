import pytest

from app import booking, main, survey

from conftest import HEADERS, anon, client_for, consent, make_user, patient

CFG = {"activo": True, "dias": {str(i): ["08:00", "20:00"] for i in range(7)}, "duracion": 50, "aviso": 0, "horizonte": 7,
       "modalidades": ["Presencial", "Virtual"]}


def setup(monkeypatch, smtp=True):
    main._shits.clear()  # el límite por IP es global entre pruebas
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "ana@gmail.com", "base": "https://h.co", "propio": True} if smtp else None)
    monkeypatch.setattr(booking, "send_mail", lambda to, subj, body, prof, acc, html=None: sent.append((to, subj, body)))
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "consultorio": "Consultorio Ana", "correo": "ana@consulta.co"})
    slug = c.put("/api/reserva", json=CFG).json()["slug"]
    return c, slug, sent


def first_slot(pub, slug):
    d = pub.get(f"/api/reservar/{slug}").json()
    day = sorted(d["dias"])[0]
    return day, d["dias"][day][0]


def test_config_validation_and_status(monkeypatch):
    c, slug, _ = setup(monkeypatch)
    assert c.put("/api/reserva", json={**CFG, "duracion": 5}).status_code == 400
    assert c.put("/api/reserva", json={**CFG, "dias": {"9": ["08:00", "12:00"]}}).status_code == 400
    assert c.put("/api/reserva", json={**CFG, "modalidades": []}).status_code == 400
    g = c.get("/api/reserva").json()
    assert g["activo"] and g["slug"] == slug and g["correo"] and g["config"]["duracion"] == 50
    assert c.put("/api/reserva", json={**CFG, "renovar": True}).json()["slug"] != slug


def test_new_patient_books_without_creating_patient(monkeypatch):
    c, slug, sent = setup(monkeypatch)
    pub = anon()
    day, hour = first_slot(pub, slug)
    body = {"inicio": f"{day}T{hour}", "modalidad": "Virtual", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "Luis@Mail.co", "telefono": "3001234567"}
    r = pub.post(f"/api/reservar/{slug}", json=body)
    assert r.status_code == 200, r.text
    recs = c.get("/api/records").json()
    assert not [x for x in recs if x["kind"] == "patient"]
    a = next(x for x in recs if x["kind"] == "appt")
    assert "patientId" not in a and a["nuevo"]["correo"] == "luis@mail.co" and a["estado"] == "Programada" and a["modalidad"] == "Virtual"
    assert sorted(t for t, _, _ in sent) == ["ana@consulta.co", "luis@mail.co"]
    assert "diagn" not in str(sent).lower()
    pac = next(b for t, _, b in sent if t == "luis@mail.co")
    assert "/cita?t=" in pac and f"/reservar?c={slug}" in pac and "responda a este correo" not in pac
    tok = pac.split("/cita?t=")[1].split()[0]
    assert pub.get(f"/api/cita/{tok}").json()["estado"] == "Programada"  # el enlace funciona también sin paciente en la base
    assert pub.post(f"/api/cita/{tok}", json={"accion": "cancelar"}, headers=HEADERS).status_code == 200
    assert hour in pub.get(f"/api/reservar/{slug}").json()["dias"][day]  # el hueco se libera
    assert pub.post(f"/api/reservar/{slug}", json=body).status_code == 200
    assert hour not in pub.get(f"/api/reservar/{slug}").json()["dias"].get(day, [])
    assert pub.post(f"/api/reservar/{slug}", json=body).status_code == 409  # el hueco ya se ocupó


def test_link_unavailable(monkeypatch):
    c, slug, _ = setup(monkeypatch)
    assert anon().get("/api/reservar/no-existe-no-existe").status_code == 404
    c.put("/api/reserva", json={**CFG, "activo": False})
    assert anon().get(f"/api/reservar/{slug}").status_code == 404
    c.put("/api/reserva", json=CFG)
    monkeypatch.setattr(survey, "account", lambda db, u: None)
    assert anon().get(f"/api/reservar/{slug}").status_code == 503  # sin correo de envío no hay reservas


def test_multiple_ranges_per_day_and_default_duration(monkeypatch):
    c, slug, _ = setup(monkeypatch)
    assert c.get("/api/reserva").json()["config"]["duracion"] == 50  # lo guardado en setup
    cfg = {**CFG, "duracion": 60, "dias": {str(i): [["15:00", "19:00"], ["08:00", "10:00"]] for i in range(7)}}
    g = c.put("/api/reserva", json=cfg).json()["config"]
    assert g["dias"]["0"] == [["08:00", "10:00"], ["15:00", "19:00"]]  # se ordenan
    d = anon().get(f"/api/reservar/{slug}").json()["dias"]
    horas = d[sorted(d)[-1]]  # un día completo, lejos de «ahora»
    assert horas == ["08:00", "09:00", "15:00", "16:00", "17:00", "18:00"]
    for malo in ([["08:00", "12:00"], ["11:00", "14:00"]], [["09:00", "09:00"]], [], [["8:00", "9:00"]]):
        assert c.put("/api/reserva", json={**CFG, "dias": {"0": malo}}).status_code == 400
    assert c.put("/api/reserva", json={**CFG, "dias": {"0": ["08:00", "12:00"]}}).json()["config"]["dias"]["0"] == [["08:00", "12:00"]]  # formato anterior
    # sin guardar nada antes, la duración por defecto es de 60 minutos
    make_user("bea@x.co")
    assert client_for("bea@x.co").get("/api/reserva").json()["config"]["duracion"] == 60


def test_descanso_bloquea_huecos_junto_a_citas_ocupadas():
    from datetime import datetime, timedelta, timezone
    cfg = {"dias": {str(i): [["08:00", "12:00"]] for i in range(7)}, "duracion": 60, "descanso": 30, "aviso": 0, "horizonte": 3, "modalidades": ["Presencial"]}
    now = datetime(2030, 1, 7, 5, 0, tzinfo=timezone.utc)
    dia = now.astimezone(booking.TZ).date() + timedelta(days=1)
    ocupada = datetime.combine(dia, datetime.strptime("09:45", "%H:%M").time(), booking.TZ)
    libres = booking.slots(cfg, [(ocupada, ocupada + timedelta(minutes=60))], now)[dia.isoformat()]
    assert libres == ["08:00"] and booking.slots({**cfg, "descanso": 0}, [(ocupada, ocupada + timedelta(minutes=60))], now)[dia.isoformat()] == ["08:00", "11:00"]


def test_cita_manual_de_paciente_nuevo(monkeypatch):
    c, slug, _ = setup(monkeypatch)
    cita = {"id": "a_n1", "kind": "appt", "createdAt": "2026-11-06T10:00:00Z", "updatedAt": "2026-11-06T10:00:00Z", "startAt": "2026-11-20T15:00:00Z",
            "duracion": 50, "modalidad": "Virtual", "estado": "Programada", "nuevo": {"nombres": "Luis", "apellidos": "Gómez", "correo": "", "telefono": ""}}
    assert c.put("/api/records/a_n1", json=cita).status_code == 204  # sin paciente todavía: se agenda con sus datos básicos
    bad = {**cita, "id": "a_n2", "nuevo": {"nombres": " "}}
    assert c.put("/api/records/a_n2", json=bad).status_code == 400  # sin nombre ni paciente: no válido

    # al crear su historia, la cita de paciente nuevo se puede vincular sin consentimiento previo (se agendó antes)
    c.put("/api/records/p_9", json=patient("p_9", documento="777"))
    assert c.put("/api/records/a_n1", json={**cita, "patientId": "p_9", "nuevo": None}).status_code == 204


def test_evento_sin_paciente_cierra_el_horario(monkeypatch):
    from datetime import datetime, timezone
    c, slug, _ = setup(monkeypatch)
    pub = anon()
    day, hour = first_slot(pub, slug)
    ini = datetime.fromisoformat(f"{day}T{hour}").replace(tzinfo=booking.TZ).astimezone(timezone.utc).isoformat()
    ev = {"id": "a_e1", "kind": "appt", "createdAt": ini, "updatedAt": ini, "startAt": ini, "duracion": 50, "modalidad": "", "estado": "Programada", "evento": "Almuerzo"}
    assert c.put("/api/records/a_e1", json=ev).status_code == 204  # sin paciente ni consentimiento
    assert hour not in pub.get(f"/api/reservar/{slug}").json()["dias"].get(day, [])  # el horario deja de ofrecerse
    assert c.put("/api/records/a_e2", json={**ev, "id": "a_e2", "evento": " "}).status_code == 400  # sin título ni paciente: no válido


def test_calendario_por_fechas_con_modalidad_por_dia(monkeypatch):
    from datetime import datetime, timedelta
    c, slug, _ = setup(monkeypatch)
    hoy = datetime.now(booking.TZ).date()
    d1, d2, ayer = [(hoy + timedelta(days=n)).isoformat() for n in (1, 2, -1)]
    cfg = {**CFG, "dias": {}, "modalidades": [], "fechas": {
        d1: {"modalidades": ["Virtual", "Presencial"], "franjas": [["15:00", "17:00"], ["08:00", "10:00"]]}, d2: {"modalidades": ["Telefónica"], "franjas": [["09:00", "10:00"]]},
        ayer: {"modalidades": ["Presencial"], "franjas": [["09:00", "10:00"]]}}}
    g = c.put("/api/reserva", json=cfg).json()["config"]
    assert ayer not in g["fechas"] and g["fechas"][d1]["franjas"][0] == ["08:00", "10:00"] and g["fechas"][d1]["modalidades"] == ["Presencial", "Virtual"] and g["modalidades"] == ["Presencial", "Virtual", "Telefónica"]  # pasadas fuera, franjas y modalidades en orden
    pub = anon()
    d = pub.get(f"/api/reservar/{slug}").json()
    assert sorted(d["dias"]) == [d1, d2] and d["modalidadDia"] == {d1: ["Presencial", "Virtual"], d2: ["Telefónica"]}  # solo hay horas en las fechas marcadas
    body = {"inicio": f"{d1}T08:00", "modalidad": "Telefónica", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "luis@mail.co", "telefono": "3001234567"}
    assert pub.post(f"/api/reservar/{slug}", json=body).status_code == 400  # ese día no es telefónico
    assert pub.post(f"/api/reservar/{slug}", json={**body, "modalidad": "Virtual"}).status_code == 200  # pero sí virtual o presencial
    for malo in ({"2026-13-45": {"modalidades": ["Virtual"], "franjas": [["08:00", "09:00"]]}}, {d1: {"modalidades": ["Otra"], "franjas": [["08:00", "09:00"]]}},
                 {d1: {"modalidades": ["Virtual"], "franjas": [["08:00", "10:00"], ["09:00", "11:00"]]}}, {d1: {"modalidades": ["Virtual"], "franjas": []}}, {d1: {"modalidades": [], "franjas": [["08:00", "09:00"]]}}):
        assert c.put("/api/reserva", json={**cfg, "fechas": malo}).status_code == 400


def test_cita_creada_por_el_profesional_para_paciente_nuevo_envia_confirmacion(monkeypatch):
    c, _, sent = setup(monkeypatch)
    base = {"kind": "appt", "nuevo": {"nombres": "Pepe", "apellidos": "Gómez", "correo": "Pepe@Mail.co"}, "duracion": 60, "modalidad": "Presencial", "estado": "Programada"}
    assert c.put("/api/records/a_1", json={**base, "id": "a_1", "startAt": "2099-03-04T15:00:00.000Z", "nuevoSerie": "s1"}).status_code in (200, 204)
    assert c.put("/api/records/a_2", json={**base, "id": "a_2", "startAt": "2099-03-11T15:00:00.000Z", "nuevoSerie": "s1"}).status_code in (200, 204)  # serie: un solo correo
    assert [t for t, _, _ in sent] == ["pepe@mail.co"]
    assert c.put("/api/records/a_1", json={**base, "id": "a_1", "startAt": "2099-03-05T15:00:00.000Z", "nuevoSerie": "s1"}).status_code in (200, 204)  # editar no reenvía
    assert len(sent) == 1
    sin = {**base, "nuevo": {"nombres": "Sin", "apellidos": "Correo"}}
    assert c.put("/api/records/a_3", json={**sin, "id": "a_3", "startAt": "2099-03-12T15:00:00.000Z"}).status_code in (200, 204)
    assert len(sent) == 1


def test_confirmation_includes_custom_meeting_link():
    from datetime import datetime, timezone
    m = booking.messages({"nombre": "Ana Ruiz"}, datetime(2030, 5, 6, 15, 0, tzinfo=timezone.utc), 50, "Virtual", "Luis G", "l@x.co", "", None, enlace="https://meet.google.com/abc-defg-hij")
    pac = m[0]
    assert "https://meet.google.com/abc-defg-hij" in pac[2] and "Entrar a la videollamada" in pac[3] and pac[2].index("Entrar a la videollamada") < pac[2].index("Google Calendar")
    assert "Entrar a la videollamada" not in booking.messages({"nombre": "Ana Ruiz"}, datetime(2030, 5, 6, 15, 0, tzinfo=timezone.utc), 50, "Virtual", "Luis G", "l@x.co", "", None, enlace="javascript:alert(1)")[0][3]


def test_existing_patient_needs_match(monkeypatch):
    c, slug, sent = setup(monkeypatch)
    c.put("/api/records/p_1", json=patient("p_1", documento="123.456", correo="maria@pac.co"))
    pub = anon()
    day, hour = first_slot(pub, slug)
    base = {"inicio": f"{day}T{hour}", "modalidad": "Presencial", "nombres": "María", "apellidos": "Pérez"}
    assert pub.post(f"/api/reservar/{slug}", json={**base, "documento": "123456", "correo": "otro@pac.co"}).status_code == 404
    assert pub.post(f"/api/reservar/{slug}", json={**base, "documento": "123456", "correo": "maria@pac.co"}).status_code == 200
    a = next(x for x in c.get("/api/records").json() if x["kind"] == "appt")
    assert a["patientId"] == "p_1" and "nuevo" not in a and len(sent) == 2


def test_professional_appt_mails_existing_patient_with_calendar_button(monkeypatch):
    c, slug, sent = setup(monkeypatch)
    c.put("/api/records/p_1", json=patient("p_1", documento="1020304", correo="maria@pac.co"))
    ap = {"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": "2030-05-06T15:00:00+00:00", "duracion": 50, "modalidad": "Virtual", "estado": "Programada", "enlace": "https://meet.google.com/abc-defg-hij"}
    c.put("/api/records/a_1", json=ap, headers=HEADERS)
    assert not sent  # sin la casilla no sale nada
    c.put("/api/records/a_2", json={**ap, "id": "a_2", "avisarCorreo": True}, headers=HEADERS)
    assert len(sent) == 1 and sent[0][0] == "maria@pac.co" and "calendar.google.com/calendar/render" in sent[0][2] and "meet.google.com" in sent[0][2]
    c.put("/api/records/a_2", json={**ap, "id": "a_2", "avisarCorreo": True, "duracion": 60}, headers=HEADERS)
    assert len(sent) == 1  # editar la cita no reenvía
