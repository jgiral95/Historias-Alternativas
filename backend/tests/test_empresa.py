from datetime import datetime, timezone

from app.db import SessionLocal, User
from conftest import HEADERS, PASSWORD, client_for, consent, make_user, patient

NOW = datetime.now(timezone.utc).isoformat()
LATER = (datetime.now(timezone.utc) + __import__("datetime").timedelta(hours=3)).isoformat()
HOY = NOW[:10]
RANGO = {"desde": "2000-01-01", "hasta": "2100-01-01"}


def _clave(email):
    """Los profesionales de una empresa no tienen contraseña al crearse (la eligen con el enlace del correo): las pruebas se la ponen."""
    from app.db import SessionLocal, User
    from app.security import hash_password
    with SessionLocal() as db:
        u = db.query(User).filter(User.email == email).one()
        u.password_hash, u.must_change_password = hash_password(PASSWORD), False
        db.commit()


def _empresa():
    """Empresa «Clínica Sol» con su administrador y dos profesionales; cada uno con un paciente, una cita, un pago y documentos."""
    make_user("root@x.co", name="Root", role="admin")
    r = client_for("root@x.co").post("/api/admin/empresas", json={"name": "Clínica Sol", "email": "admin@x.co", "adminName": "Adela Admin", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 201, r.text
    admin_id = r.json()["admin"]["id"]
    admin = client_for("admin@x.co")
    pros = {}
    for i, mail in enumerate(("ana@x.co", "beto@x.co"), 1):
        r = admin.post("/api/empresa/profesionales", json={"email": mail, "name": f"Pro {i}"}, headers=HEADERS)
        assert r.status_code == 201, r.text
        _clave(mail)
        pros[mail] = (r.json()["id"], client_for(mail))
    for i, (pid, c) in enumerate(pros.values(), 1):
        c.put("/api/records/p_1", json=patient("p_1", nombres=f"Paciente{i}", consents=consent(),
                                                intake={"motivo": "SECRETO-CLINICO", "signedAt": NOW, "addenda": []}))
        c.put("/api/records/n_1", json={"id": "n_1", "kind": "note", "patientId": "p_1", "apptId": "a_1", "tema": "SECRETO-CLINICO", "signedAt": NOW, "addenda": []})
        c.put("/api/records/a_1", json={"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": NOW, "duracion": 50, "estado": "Atendida"})
        c.put("/api/records/pa_1", json={"id": "pa_1", "kind": "pago", "patientId": "p_1", "monto": 80000 * i, "fecha": HOY, "medio": "Efectivo"})
    return admin_id, admin, pros


def _otra_empresa():
    make_user("root2@x.co", name="Root2", role="admin")
    r = client_for("root2@x.co").post("/api/admin/empresas", json={"name": "Otra", "email": "otro@x.co", "adminName": "Otro Admin", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 201


def test_only_app_admin_creates_companies():
    anon_ = __import__("conftest").anon()
    body = {"name": "E", "email": "e@x.co", "adminName": "E", "password": PASSWORD}
    assert anon_.post("/api/admin/empresas", json=body, headers=HEADERS).status_code == 401
    make_user("pro@x.co")
    assert client_for("pro@x.co").post("/api/admin/empresas", json=body, headers=HEADERS).status_code == 403
    assert client_for("pro@x.co").post("/api/empresa", json={"name": "E"}, headers=HEADERS).status_code == 405  # ya no hay creación desde la cuenta
    make_user("root@x.co", name="Root", role="admin")
    root = client_for("root@x.co")
    assert root.post("/api/admin/empresas", json={**body, "password": "corta"}, headers=HEADERS).status_code == 400
    assert root.post("/api/admin/empresas", json=body, headers=HEADERS).status_code == 201
    assert root.post("/api/admin/empresas", json=body, headers=HEADERS).status_code == 409  # correo repetido
    lst = root.get("/api/admin/empresas").json()
    assert [(c["name"], c["admin"]["email"], c["profesionales"]) for c in lst] == [("E", "e@x.co", 1)]
    assert client_for("pro@x.co").get("/api/admin/empresas").status_code == 403


def test_company_creation_and_members():
    _, admin, pros = _empresa()
    e = admin.get("/api/empresa").json()["empresa"]
    assert e["name"] == "Clínica Sol" and e["admin"] and {p["email"] for p in e["profesionales"]} >= {"ana@x.co", "beto@x.co"}
    assert admin.post("/api/admin/empresas", json={"name": "Otra", "email": "o@x.co", "adminName": "O", "password": PASSWORD}, headers=HEADERS).status_code == 403  # solo el admin de la aplicación
    ana = pros["ana@x.co"][1]
    fila = next(p for p in e["profesionales"] if p["email"] == "ana@x.co")
    assert fila["ultimoIngreso"] and fila["suscripcion"]["activa"] is False and fila["equipo"] == []
    assert ana.post("/api/equipo", json={"email": "sec@x.co", "name": "Sec", "password": PASSWORD}, headers=HEADERS).status_code == 201
    assert [m["email"] for m in next(p for p in admin.get("/api/empresa").json()["empresa"]["profesionales"] if p["email"] == "ana@x.co")["equipo"]] == ["sec@x.co"]
    me = ana.get("/api/auth/me").json()
    assert me["companyId"] and not me["companyAdmin"]
    assert "profesionales" not in ana.get("/api/empresa").json()["empresa"]  # un profesional no ve a los demás
    assert ana.post("/api/empresa/profesionales", json={"email": "z@x.co", "name": "Z", "password": PASSWORD}, headers=HEADERS).status_code == 403
    assert ana.get("/api/empresa/agenda", params=RANGO).status_code == 403
    # archivar a un profesional: sigue en la empresa, marcado como archivado
    bid = pros["beto@x.co"][0]
    assert admin.patch(f"/api/empresa/profesionales/{bid}", json={"archivar": True}, headers=HEADERS).status_code == 200
    beto = next(p for p in admin.get("/api/empresa").json()["empresa"]["profesionales"] if p["email"] == "beto@x.co")
    assert beto["archivado"] is True and beto["active"] is False


def test_admin_sees_agenda_finance_and_signed_dates_but_no_clinical_content():
    _, admin, _ = _empresa()
    ag = admin.get("/api/empresa/agenda", params=RANGO).json()
    assert {a["paciente"] for a in ag} == {"Paciente1 Pérez", "Paciente2 Pérez"} and {a["proNombre"] for a in ag} == {"Pro 1", "Pro 2"}
    fin = admin.get("/api/empresa/finanzas", params=RANGO).json()
    assert fin["total"] == 80000 + 160000
    assert {o["proNombre"]: o["cobrado"] for o in fin["profesionales"]} == {"Pro 1": 80000, "Pro 2": 160000}  # el administrador no cuenta como profesional cuenta como profesional
    assert all(o["citas"] == {"Atendida": 1} for o in fin["profesionales"] if o["proNombre"] != "Adela Admin")
    r = admin.get("/api/empresa/agenda", params=RANGO)
    assert "SECRETO-CLINICO" not in r.text and "SECRETO-CLINICO" not in admin.get("/api/empresa/agenda", params=RANGO).text
    assert admin.get("/api/empresa/agenda", params={"desde": "x", "hasta": "y"}).status_code == 400
    assert admin.get("/api/empresa/agenda", params={"desde": "2000-01-01", "hasta": "2000-01-02"}).json() == []


def test_admin_acts_as_team_of_a_professional():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    h = {**HEADERS, "X-Empresa-Pro": str(ana_id)}
    recs = admin.get("/api/records", headers=h).json()
    assert {r["kind"] for r in recs} >= {"patient", "appt", "pago"} and not {"note", "report"} & {r["kind"] for r in recs}
    assert "SECRETO-CLINICO" not in str(recs) and "intake" not in next(r for r in recs if r["kind"] == "patient")
    # puede controlar la agenda y los pagos de ese profesional...
    assert admin.put("/api/records/a_2", json={"id": "a_2", "kind": "appt", "patientId": "p_1", "startAt": LATER, "duracion": 50, "estado": "Programada"},
                     headers=h).status_code == 204
    assert admin.put("/api/records/pa_2", json={"id": "pa_2", "kind": "pago", "patientId": "p_1", "monto": 50000, "fecha": HOY, "medio": "Nequi"},
                     headers=h).status_code == 204
    assert {r["id"] for r in ana.get("/api/records").json()} >= {"a_2", "pa_2"}  # y el profesional lo ve
    # ...pero no toca lo clínico
    assert admin.put("/api/records/n_9", json={"id": "n_9", "kind": "note", "patientId": "p_1", "tema": "x"}, headers=h).status_code == 403
    assert admin.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "X"}, headers=h).status_code == 403
    # sin la cabecera, el administrador sigue con sus propios datos (vacíos)
    assert admin.get("/api/records").json() == []


def test_acting_as_is_limited_to_the_admins_company_and_to_valid_targets():
    admin_id, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    # otra empresa
    _otra_empresa()
    otro = client_for("otro@x.co")
    for who, target in ((otro, ana_id), (ana, pros["beto@x.co"][0]), (admin, 99999), (admin, admin_id)):
        assert who.get("/api/records", headers={**HEADERS, "X-Empresa-Pro": str(target)}).status_code == 403
    assert admin.get("/api/records", headers={**HEADERS, "X-Empresa-Pro": "abc"}).status_code == 403
    # desactivado o fuera de la empresa: ya no se puede actuar
    admin.patch(f"/api/empresa/profesionales/{ana_id}", json={"archivar": True}, headers=HEADERS)
    assert admin.get("/api/records", headers={**HEADERS, "X-Empresa-Pro": str(ana_id)}).status_code == 403
    # la cabecera no sirve para funciones de la propia cuenta
    bid = pros["beto@x.co"][0]
    assert admin.get("/api/auth/me", headers={**HEADERS, "X-Empresa-Pro": str(bid)}).status_code == 400
    assert admin.get("/api/empresa", headers={**HEADERS, "X-Empresa-Pro": str(bid)}).status_code == 400


def test_other_company_admin_sees_nothing_of_this_company():
    _empresa()
    _otra_empresa()
    otro = client_for("otro@x.co")
    assert otro.get("/api/empresa/agenda", params=RANGO).json() == []
    assert otro.get("/api/empresa/finanzas", params=RANGO).json()["total"] == 0


def test_new_professional_gets_invitation_email_and_can_choose_password(monkeypatch):
    import re
    from app import survey
    from conftest import anon
    sent = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "k@x.co", "base": "https://k.co"})
    monkeypatch.setattr(survey, "send_invitacion_empresa", lambda to, name, empresa, url, acc: sent.append((to, empresa, url)))
    make_user("root@x.co", name="Root", role="admin")
    client_for("root@x.co").post("/api/admin/empresas", json={"name": "Clínica Sol", "email": "admin@x.co", "adminName": "Adela", "password": PASSWORD}, headers=HEADERS)
    r = client_for("admin@x.co").post("/api/empresa/profesionales", json={"email": "nuevo@x.co", "name": "Nuevo"}, headers=HEADERS)  # sin contraseña
    assert r.status_code == 201 and r.json()["correoEnviado"] is True
    assert sent[0][:2] == ("nuevo@x.co", "Clínica Sol")
    tok = re.search(r"recuperar=(.+)$", sent[0][2]).group(1)
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "otra-clave-larga-1"}).status_code == 204
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "otra-clave-larga-2"}).status_code == 400  # un solo uso


def test_company_permissions_limit_professionals_but_not_the_admin():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    assert ana.get("/api/auth/me").json()["permisos"] == {"citas": True, "pagos": True}  # sin configurar, todo permitido
    r = admin.put("/api/empresa/permisos", json={"citas": False, "pagos": False}, headers=HEADERS)
    assert r.status_code == 200 and r.json() == {"citas": False, "pagos": False, "comprobante": False}
    assert ana.get("/api/auth/me").json()["permisos"] == {"citas": False, "pagos": False}
    cita = {"kind": "appt", "patientId": "p_1", "startAt": NOW, "duracion": 50}
    assert ana.put("/api/records/a_new", json={"id": "a_new", **cita}, headers=HEADERS).status_code == 403  # crear cita
    assert ana.put("/api/records/a_1", json={"id": "a_1", **cita, "estado": "Atendida"}, headers=HEADERS).status_code == 204  # la que ya tenía
    assert ana.put("/api/records/a_1", json={"id": "a_1", **{**cita, "duracion": 30}, "estado": "Atendida"}, headers=HEADERS).status_code == 403  # mover o cambiar
    assert ana.put("/api/records/a_1", json={"id": "a_1", **cita, "estado": "Cancelada", "motivoCancelacion": "x"}, headers=HEADERS).status_code == 403  # cancelar
    assert ana.put("/api/records/a_1", json={"id": "a_1", **cita, "estado": "No asistió"}, headers=HEADERS).status_code == 204  # marcar estado sí
    assert ana.delete("/api/records/a_1", headers=HEADERS).status_code == 403  # tampoco eliminar
    pago = {"kind": "pago", "patientId": "p_1", "monto": 1000, "fecha": HOY, "medio": "Efectivo"}
    assert ana.put("/api/records/pa_new", json={"id": "pa_new", **pago}, headers=HEADERS).status_code == 403
    # el administrador, trabajando en nombre del profesional, no tiene el límite
    r = admin.put("/api/records/pa_adm", json={"id": "pa_adm", **pago}, headers={**HEADERS, "X-Empresa-Pro": str(ana_id)})
    assert r.status_code in (200, 201, 204), r.text
    assert ana.put("/api/empresa/permisos", json={"citas": True, "pagos": True}, headers=HEADERS).status_code == 403  # solo el administrador


def test_trial_company_allows_two_immutable_professionals_until_subscribed(monkeypatch):
    from datetime import timedelta
    from app import main
    from app.db import SessionLocal, Subscription, User
    from sqlalchemy import select
    monkeypatch.setattr(main, "BILLING_ENFORCE", True)
    make_user("root@x.co", name="Root", role="admin")
    client_for("root@x.co").post("/api/admin/empresas", json={"name": "Clínica Sol", "email": "admin@x.co", "adminName": "Adela", "password": PASSWORD}, headers=HEADERS)
    admin = client_for("admin@x.co")
    ids = []
    for m in ("a@x.co", "b@x.co"):
        r = admin.post("/api/empresa/profesionales", json={"email": m, "name": m}, headers=HEADERS)
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    assert admin.get("/api/empresa").json()["empresa"]["prueba"] == {"activa": True, "max": 2}
    assert admin.post("/api/empresa/profesionales", json={"email": "c@x.co", "name": "C"}, headers=HEADERS).status_code == 402
    for body in ({"active": False}, {"name": "Otro"}, {"archivar": True}):
        assert admin.patch(f"/api/empresa/profesionales/{ids[0]}", json=body, headers=HEADERS).status_code == 402  # inmutables
    with SessionLocal() as db:  # se suscribe
        adm = db.scalar(select(User).where(User.email == "admin@x.co"))
        db.add(Subscription(user_id=adm.id, plan="mensual", paid_until=datetime.now(timezone.utc) + timedelta(days=30)))
        db.commit()
    assert admin.post("/api/empresa/profesionales", json={"email": "c@x.co", "name": "C"}, headers=HEADERS).status_code == 201
    assert admin.patch(f"/api/empresa/profesionales/{ids[0]}", json={"name": "Otro"}, headers=HEADERS).status_code == 200
    assert admin.get("/api/empresa").json()["empresa"]["prueba"]["activa"] is False


def test_company_agenda_uses_the_browser_day_for_evening_appointments():
    _, admin, pros = _empresa()
    ana = pros["ana@x.co"][1]
    ana.put("/api/records/a_tarde", json={"id": "a_tarde", "kind": "appt", "patientId": "p_1", "startAt": "2026-11-18T01:30:00+00:00", "duracion": 50, "estado": "Programada"}, headers=HEADERS)  # 8:30 p. m. del 17 en Colombia
    q = lambda dia, tz: [a["id"] for a in admin.get(f"/api/empresa/agenda?desde={dia}&hasta={dia}&tz={tz}").json() if a["id"] == "a_tarde"]
    assert q("2026-11-17", 300) == ["a_tarde"] and q("2026-11-18", 300) == []
    assert q("2026-11-18", 0) == ["a_tarde"]  # sin zona, el día UTC


def test_company_booking_link_lets_patient_pick_a_professional(monkeypatch):
    from app import booking, survey
    from conftest import anon
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(booking, "send_mail", lambda to, subj, body, prof, acc, html=None: sent.append((to, body)))
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    beto_id, beto = pros["beto@x.co"]
    cfg = {"activo": True, "dias": {str(i): ["08:00", "20:00"] for i in range(7)}, "duracion": 50, "aviso": 0, "horizonte": 7, "modalidades": ["Presencial"]}
    ana.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "correo": "ana@consulta.co"})
    ana.put("/api/reserva", json=cfg)  # Beto no activó su horario
    g = admin.put("/api/empresa/reservas", json={"activo": True}, headers=HEADERS).json()
    assert g["activo"] and g["slug"] and {p["id"]: p["horario"] for p in g["profesionales"]}[ana_id] is True
    assert ana.get("/api/empresa/reservas").status_code == 403  # solo el administrador
    pub, slug = anon(), g["slug"]
    lista = pub.get(f"/api/reservar-empresa/{slug}").json()
    assert lista["empresa"] and [p["id"] for p in lista["profesionales"]] == [ana_id]  # solo quien tiene horario
    p0 = lista["profesionales"][0]  # tarjeta: primer cupo libre y modalidades
    assert "especialidad" in p0 and p0["modalidades"] and (p0["proximo"] is None or set(p0["proximo"]) == {"fecha", "hora"})
    assert pub.get(f"/api/reservar-empresa/{slug}/{beto_id}").status_code == 404
    d = pub.get(f"/api/reservar-empresa/{slug}/{ana_id}").json()
    day = sorted(d["dias"])[0]; hour = d["dias"][day][0]
    body = {"inicio": f"{day}T{hour}", "modalidad": "Presencial", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "luis@mail.co", "telefono": "3001234567"}
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body).status_code == 200
    assert any(x["kind"] == "appt" and (x.get("nuevo") or {}).get("correo") == "luis@mail.co" for x in ana.get("/api/records").json())  # la cita queda en la agenda de Ana
    assert not [x for x in beto.get("/api/records").json() if (x.get("nuevo") or {}).get("correo") == "luis@mail.co"]
    assert f"/reservar?e={slug}&p={ana_id}" in next(b for t, b in sent if t == "luis@mail.co")
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body).status_code == 409  # el hueco ya se ocupó
    admin.put("/api/empresa/permisos", json={"citas": False, "pagos": True}, headers=HEADERS)  # sin permiso «citas» no hay reservas públicas
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json={**body, "correo": "otro@mail.co"}).status_code == 404
    admin.put("/api/empresa/permisos", json={"citas": True, "pagos": True}, headers=HEADERS)
    nuevo = admin.put("/api/empresa/reservas", json={"activo": True, "renovar": True}, headers=HEADERS).json()["slug"]
    assert nuevo != slug and pub.get(f"/api/reservar-empresa/{slug}").status_code == 404
    admin.put("/api/empresa/reservas", json={"activo": False}, headers=HEADERS)
    assert pub.get(f"/api/reservar-empresa/{nuevo}").status_code == 404


def test_company_admin_lists_each_professionals_patients_without_clinical_data():
    _, admin, pros = _empresa()
    r = admin.get("/api/empresa/pacientes")
    assert r.status_code == 200
    lista = r.json()
    assert sorted(p["nombre"] for p in lista) == ["Paciente1 Pérez", "Paciente2 Pérez"]
    assert {p["proId"] for p in lista} == {pid for pid, _ in pros.values()}
    assert all(p["atendidas"] == 1 and p["conEvolucion"] == 0 for p in lista) and "SECRETO-CLINICO" not in r.text
    assert pros["ana@x.co"][1].get("/api/empresa/pacientes").status_code == 403


def test_admin_sets_professional_agenda_color():
    _, admin, pros = _empresa()
    pid = pros["ana@x.co"][0]
    ver = lambda: next(p for p in admin.get("/api/empresa").json()["empresa"]["profesionales"] if p["id"] == pid)
    assert ver()["color"] is None
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"permisos": {"citas": False}}, headers=HEADERS).status_code == 200
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"color": "#1f7a5c"}, headers=HEADERS).status_code == 200
    assert ver()["color"] == "#1F7A5C" and ver()["permisosPro"]["citas"] is False  # el color no borra los permisos, ni al revés
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"permisos": {"pagos": True}}, headers=HEADERS).status_code == 200
    assert ver()["color"] == "#1F7A5C"
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"color": "rojo"}, headers=HEADERS).status_code == 400
    assert pros["beto@x.co"][1].patch(f"/api/empresa/profesionales/{pid}", json={"color": "#000000"}, headers=HEADERS).status_code == 403  # solo el administrador
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"color": ""}, headers=HEADERS).status_code == 200
    assert ver()["color"] is None and ver()["permisosPro"]["citas"] is False


def test_professional_cannot_have_two_appointments_at_once():
    _, admin, pros = _empresa()
    ana, beto = pros["ana@x.co"][1], pros["beto@x.co"][1]
    dia = "2030-06-06"
    cita = lambda i, ini, dur=60, **k: {"id": i, "kind": "appt", "patientId": "p_1", "startAt": f"{dia}T{ini}:00Z", "duracion": dur, "modalidad": "Virtual", "estado": "Programada", **k}
    assert ana.put("/api/records/a_x1", json=cita("a_x1", "15:00")).status_code in (200, 204)
    r = ana.put("/api/records/a_x2", json=cita("a_x2", "15:30"))
    assert r.status_code == 409 and "otra cita" in r.json()["detail"]  # se cruza con la suya
    assert ana.put("/api/records/a_x3", json=cita("a_x3", "16:00")).status_code in (200, 204)  # justo después
    assert beto.put("/api/records/a_x4", json=cita("a_x4", "15:00")).status_code in (200, 204)  # otro profesional: sin problema
    assert ana.put("/api/records/a_x5", json={"id": "a_x5", "kind": "appt", "evento": "Almuerzo", "startAt": f"{dia}T15:00:00Z", "duracion": 60, "modalidad": "Virtual", "estado": "Programada"}).status_code in (200, 204)  # un evento no cuenta
    assert ana.put("/api/records/a_x1", json=cita("a_x1", "15:00", estado="Atendida")).status_code in (200, 204)  # marcar atendida no se bloquea
    assert ana.put("/api/records/a_x3", json=cita("a_x3", "15:30")).status_code == 409  # mover a un horario ocupado
    assert ana.put("/api/records/a_x2", json=cita("a_x2", "15:30", estado="Cancelada")).status_code in (200, 204)  # una cancelada no ocupa


def test_consultorios_admin_creates_schedule_and_prevents_clashes():
    _, admin, pros = _empresa()
    ana, beto = pros["ana@x.co"][1], pros["beto@x.co"][1]
    assert ana.post("/api/empresa/consultorios", json={"name": "C1"}, headers=HEADERS).status_code == 403  # solo el administrador
    assert admin.post("/api/empresa/consultorios", json={"name": " "}, headers=HEADERS).status_code == 400
    c = admin.post("/api/empresa/consultorios", json={"name": "Consultorio 1", "horario": {str(d): [["08:00", "12:00"], ["14:00", "18:00"]] for d in range(7)}}, headers=HEADERS)
    assert c.status_code in (200, 204), c.text
    cid = c.json()["id"]
    for malo in ({"7": [["08:00", "09:00"]]}, {"1": [["10:00", "09:00"]]}, {"1": [["08:00", "10:00"], ["09:00", "11:00"]]}, {"1": [["8:00", "9:00"]]}):
        assert admin.patch(f"/api/empresa/consultorios/{cid}", json={"horario": malo}, headers=HEADERS).status_code == 400
    assert [x["name"] for x in admin.get("/api/empresa/consultorios").json()] == ["Consultorio 1"]
    assert beto.get("/api/auth/me").json()["consultorios"] is True
    # 10:00 en Bogotá (UTC-5) = 15:00 UTC
    dia = "2030-06-05"
    cita = lambda i, ini, **k: {"id": i, "kind": "appt", "patientId": "p_1", "startAt": f"{dia}T{ini}:00Z", "duracion": 60, "modalidad": "Presencial", "estado": "Programada", "consultorioId": cid, **k}
    assert ana.put("/api/records/a_c1", json=cita("a_c1", "15:00")).status_code in (200, 204)
    libres = beto.get("/api/consultorios", params={"inicio": f"{dia}T15:30:00Z", "duracion": 60}).json()
    assert libres == [{"id": cid, "name": "Consultorio 1", "libre": False, "motivo": "Ocupado por Pro 1", "direccion": ""}]
    assert beto.put("/api/records/a_c2", json=cita("a_c2", "15:30")).status_code == 409  # se cruza con la de Ana
    assert beto.put("/api/records/a_c3", json=cita("a_c3", "16:00")).status_code in (200, 204)  # justo después
    assert beto.put("/api/records/a_c4", json=cita("a_c4", "12:30")).status_code == 409  # 07:30 en Bogotá: antes del horario
    assert beto.put("/api/records/a_c5", json=cita("a_c5", "17:00")).status_code == 409  # 12:00 en Bogotá: entre franjas
    assert beto.put("/api/records/a_c6", json=cita("a_c6", "18:00", modalidad="Virtual")).status_code in (200, 204)  # virtual: no usa consultorio
    assert "consultorioId" not in next(x for x in beto.get("/api/records").json() if x["id"] == "a_c6")
    assert beto.put("/api/records/a_c7", json=cita("a_c7", "15:00", consultorioId=99999)).status_code == 400  # no es de la empresa
    ag = admin.get("/api/empresa/agenda", params={"desde": dia, "hasta": dia, "tz": 300}).json()
    assert {a["id"]: a["consultorioId"] for a in ag if a.get("consultorioId")} == {"a_c1": cid, "a_c3": cid}
    # marcar atendida una cita ya guardada no se bloquea; cancelar libera el consultorio
    assert ana.put("/api/records/a_c1", json=cita("a_c1", "15:00", estado="Cancelada")).status_code in (200, 204)
    assert beto.put("/api/records/a_c2", json=cita("a_c2", "15:00")).status_code in (200, 204)
    assert admin.patch(f"/api/empresa/consultorios/{cid}", json={"activo": False}, headers=HEADERS).status_code in (200, 204)
    assert beto.get("/api/consultorios", params={"inicio": f"{dia}T15:00:00Z"}).json() == []
    assert beto.put("/api/records/a_c8", json=cita("a_c8", "18:00")).status_code == 409  # desactivado
    assert beto.put("/api/records/a_c3", json=cita("a_c3", "16:00", estado="Atendida")).status_code in (200, 204)


def test_consultorios_of_another_company_are_not_visible():
    _, admin, pros = _empresa()
    admin.post("/api/empresa/consultorios", json={"name": "Solo mío"}, headers=HEADERS)
    _otra_empresa()
    otro = client_for("otro@x.co")
    assert otro.get("/api/empresa/consultorios").json() == []
    assert otro.patch("/api/empresa/consultorios/1", json={"activo": False}, headers=HEADERS).status_code == 404


def test_consultorios_are_required_for_in_person_appointments_and_offered_hours(monkeypatch):
    from app import booking, survey
    from conftest import anon
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(booking, "send_mail", lambda to, subj, body, prof, acc, html=None: sent.append((to, body)))
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    cita = lambda i, **k: {"id": i, "kind": "appt", "patientId": "p_1", "startAt": "2030-06-05T15:00:00Z", "duracion": 60, "modalidad": "Presencial", "estado": "Programada", **k}
    assert ana.put("/api/records/a_s1", json=cita("a_s1")).status_code in (200, 204)  # aún sin consultorios en la empresa
    # consultorio abierto solo de 08:00 a 12:00 todos los días
    cid = admin.post("/api/empresa/consultorios", json={"name": "C1", "horario": {str(d): [["08:00", "12:00"]] for d in range(7)}}, headers=HEADERS).json()["id"]
    assert ana.put("/api/records/a_s2", json=cita("a_s2")).status_code == 409  # presencial sin consultorio
    assert ana.put("/api/records/a_s3", json=cita("a_s3", modalidad="Virtual", startAt="2030-06-05T18:00:00Z")).status_code in (200, 204)
    assert ana.put("/api/records/a_s1", json=cita("a_s1", estado="Atendida")).status_code in (200, 204)  # la ya existente sigue editable
    # su horario de reservas presencial debe caer en el del consultorio
    fuera = {"activo": True, "dias": {str(i): ["08:00", "20:00"] for i in range(7)}, "duracion": 50, "aviso": 0, "horizonte": 7, "modalidades": ["Presencial"]}
    assert ana.put("/api/reserva", json=fuera).status_code == 400
    assert ana.put("/api/reserva", json={**fuera, "modalidades": ["Virtual"]}).status_code == 200
    bien = {**fuera, "dias": {str(i): ["08:00", "12:00"] for i in range(7)}}
    assert ana.put("/api/reserva", json=bien).status_code == 200
    # el paciente solo ve huecos con consultorio libre y la cita queda con consultorio
    g = admin.put("/api/empresa/reservas", json={"activo": True}, headers=HEADERS).json()
    pub, slug = anon(), g["slug"]
    ana.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "correo": "ana@consulta.co"})
    d = pub.get(f"/api/reservar-empresa/{slug}/{ana_id}").json()
    day = sorted(d["dias"])[0]; hour = d["dias"][day][0]
    body = {"inicio": f"{day}T{hour}", "modalidad": "Presencial", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "luis@mail.co", "telefono": "3001234567"}
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body).status_code == 200
    assert any(x["kind"] == "appt" and x.get("consultorioId") == cid for x in ana.get("/api/records").json())
    admin.patch(f"/api/empresa/consultorios/{cid}", json={"activo": False}, headers=HEADERS)
    assert pub.get(f"/api/reservar-empresa/{slug}/{ana_id}").json()["dias"]  # sin consultorios activos vuelve a la regla de antes


def test_company_can_require_payment_proof_before_booking(monkeypatch):
    import base64
    from app import booking, survey
    from conftest import anon
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(booking, "send_mail", lambda *a, **k: None)
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    ana.put("/api/reserva", json={"activo": True, "dias": {str(i): ["08:00", "20:00"] for i in range(7)}, "duracion": 50, "aviso": 0, "horizonte": 7, "modalidades": ["Virtual"]})
    assert admin.get("/api/empresa").json()["empresa"]["permisos"]["comprobante"] is False  # por defecto no se exige
    slug = admin.put("/api/empresa/reservas", json={"activo": True}, headers=HEADERS).json()["slug"]
    pub = anon()
    d = pub.get(f"/api/reservar-empresa/{slug}/{ana_id}").json()
    assert d["comprobante"] is False
    day = next(k for k in sorted(d["dias"]) if len(d["dias"][k]) >= 2); horas = d["dias"][day]  # un día con al menos dos horas (hoy puede tener solo una)
    body = lambda h, **k: {"inicio": f"{day}T{h}", "modalidad": "Virtual", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "luis@mail.co", "telefono": "3001234567", **k}
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body(horas[0])).status_code == 200  # sin exigirlo, agenda sin comprobante
    assert admin.put("/api/empresa/permisos", json={"citas": True, "pagos": True, "comprobante": True}, headers=HEADERS).status_code == 200
    assert pub.get(f"/api/reservar-empresa/{slug}/{ana_id}").json()["comprobante"] is True
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body(horas[1])).status_code == 400  # falta el comprobante
    malo = base64.b64encode(b"no es una imagen").decode()
    assert pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body(horas[1], comprobante=malo, comprobanteTipo="image/png")).status_code == 415
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 2000
    ok = pub.post(f"/api/reservar-empresa/{slug}/{ana_id}", json=body(horas[1], comprobante=base64.b64encode(png).decode(), comprobanteTipo="image/png"))
    assert ok.status_code == 200, ok.text
    cita = next(x for x in ana.get("/api/records").json() if x["kind"] == "appt" and x.get("comprobanteId"))
    assert ana.get(f"/api/blobs/{cita['comprobanteId']}").content == png  # la profesional lo abre igual que lo subió el paciente
    assert not any(x.get("comprobanteId") for x in pros["beto@x.co"][1].get("/api/records").json())  # los demás no lo ven
    assert admin.get(f"/api/empresa/comprobante/{ana_id}/{cita['comprobanteId']}").content == png  # el administrador también lo abre
    admin.put("/api/empresa/permisos", json={"citas": True, "pagos": False, "comprobante": True}, headers=HEADERS)
    assert ana.get(f"/api/blobs/{cita['comprobanteId']}").status_code == 403  # sin permiso de cobros y pagos, la profesional no lo ve
    assert admin.get(f"/api/empresa/comprobante/{ana_id}/{cita['comprobanteId']}").content == png
    assert any(a.get("comprobanteId") for a in admin.get("/api/empresa/agenda", params={"desde": day, "hasta": day, "tz": 0}).json())
    assert pros["beto@x.co"][1].get(f"/api/empresa/comprobante/{ana_id}/{cita['comprobanteId']}").status_code == 403
    assert admin.get(f"/api/empresa/comprobante/{pros['beto@x.co'][0]}/{cita['comprobanteId']}").status_code == 404


def test_cancelling_a_future_appointment_emails_the_patient(monkeypatch):
    """Si el profesional o el administrador cancelan una cita futura, el paciente recibe un correo (también fuera de empresas)."""
    from datetime import timedelta
    from app import booking, survey
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(booking, "send_mail", lambda to, subj, body, prof, acc, html=None: sent.append((to, subj)))
    _, admin, pros = _empresa()
    ana, beto = pros["ana@x.co"][1], pros["beto@x.co"][1]
    ana_id, beto_id = pros["ana@x.co"][0], pros["beto@x.co"][0]
    futuro = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    for c, i in ((ana, 1), (beto, 2)):
        pac = next(x for x in c.get("/api/records").json() if x["id"] == "p_1")
        rp = c.put("/api/records/p_1", json={**pac, "correo": f"pac{i}@mail.co"})
        assert rp.status_code in (200, 204), rp.text
        c.put("/api/records/a_f", json={"id": "a_f", "kind": "appt", "patientId": "p_1", "startAt": futuro, "duracion": 50, "modalidad": "Virtual", "estado": "Programada"})
    assert sent == []
    cita = lambda **k: {"id": "a_f", "kind": "appt", "patientId": "p_1", "startAt": futuro, "duracion": 50, "modalidad": "Virtual", **k}
    assert ana.put("/api/records/a_f", json=cita(estado="Cancelada")).status_code in (200, 204)
    assert sent == [("pac1@mail.co", "Tu cita fue cancelada")]
    assert ana.put("/api/records/a_f", json=cita(estado="Cancelada", duracion=60)).status_code in (200, 204)  # ya estaba cancelada: no se repite
    assert len(sent) == 1
    r = admin.put("/api/records/a_f", json=cita(estado="Cancelada", motivoCancelacion="Prueba"), headers={**HEADERS, "X-Empresa-Pro": str(beto_id)})  # el administrador cancela la de Beto
    assert r.status_code in (200, 204), r.text
    assert ("pac2@mail.co", "Tu cita fue cancelada") in sent
    sent[:] = [m for m in sent if m[1] == "Tu cita fue cancelada" or m[1].startswith("Tu cita cambi")]  # (el aviso al terapeuta se prueba aparte)
    # una cita pasada no avisa
    beto.put("/api/records/a_p", json={"id": "a_p", "kind": "appt", "patientId": "p_1", "startAt": "2020-01-01T15:00:00Z", "duracion": 50, "modalidad": "Virtual", "estado": "Programada"})
    beto.put("/api/records/a_p", json={"id": "a_p", "kind": "appt", "patientId": "p_1", "startAt": "2020-01-01T15:00:00Z", "duracion": 50, "modalidad": "Virtual", "estado": "Cancelada"})
    assert len(sent) == 2
    # cambiar la fecha u hora de una cita futura también avisa; cambiar solo la duración no
    otro = (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()
    ana.put("/api/records/a_r", json={"id": "a_r", "kind": "appt", "patientId": "p_1", "startAt": futuro, "duracion": 50, "modalidad": "Virtual", "estado": "Programada"})
    ana.put("/api/records/a_r", json={"id": "a_r", "kind": "appt", "patientId": "p_1", "startAt": futuro, "duracion": 60, "modalidad": "Virtual", "estado": "Programada"})
    assert len(sent) == 2
    ana.put("/api/records/a_r", json={"id": "a_r", "kind": "appt", "patientId": "p_1", "startAt": otro, "duracion": 60, "modalidad": "Virtual", "estado": "Programada"})
    assert sent[-1] == ("pac1@mail.co", "Tu cita cambió de fecha u hora") and len(sent) == 3


def test_admin_cancelling_needs_a_reason_and_tells_the_therapist(monkeypatch):
    """El administrador debe dar un motivo: el terapeuta lo recibe por correo; el paciente solo sabe que debe consultar a su terapeuta."""
    from datetime import timedelta
    from app import booking, survey
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    monkeypatch.setattr(booking, "send_mail", lambda to, subj, body, prof, acc, html=None: sent.append((to, subj, body)))
    _, admin, pros = _empresa()
    ana = pros["ana@x.co"][1]
    ana_id = pros["ana@x.co"][0]
    futuro = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    pac = next(x for x in ana.get("/api/records").json() if x["id"] == "p_1")
    assert ana.put("/api/records/p_1", json={**pac, "correo": "pac1@mail.co"}).status_code in (200, 204)
    cita = lambda **k: {"id": "a_m", "kind": "appt", "patientId": "p_1", "startAt": futuro, "duracion": 50, "modalidad": "Virtual", **k}
    ana.put("/api/records/a_m", json=cita(estado="Programada"))
    h = {**HEADERS, "X-Empresa-Pro": str(ana_id)}
    r = admin.put("/api/records/a_m", json=cita(estado="Cancelada"), headers=h)
    assert r.status_code == 400 and sent == []
    r = admin.put("/api/records/a_m", json=cita(estado="Cancelada", motivoCancelacion="El consultorio cierra por mantenimiento"), headers=h)
    assert r.status_code in (200, 204), r.text
    al_paciente = [m for m in sent if m[0] == "pac1@mail.co"]
    al_terapeuta = [m for m in sent if m[0] != "pac1@mail.co"]
    assert len(al_paciente) == 1 and "mantenimiento" not in al_paciente[0][2] and "terapeuta" in al_paciente[0][2]
    assert len(al_terapeuta) == 1 and "mantenimiento" in al_terapeuta[0][2]
    guardada = next(x for x in ana.get("/api/records").json() if x["id"] == "a_m")
    assert guardada["motivoCancelacion"] == "El consultorio cierra por mantenimiento"
    # si cancela el propio terapeuta no hace falta motivo ni se avisa a nadie más que al paciente
    ana.put("/api/records/a_m2", json=cita(id="a_m2", estado="Programada"))
    n = len(sent)
    assert ana.put("/api/records/a_m2", json=cita(id="a_m2", estado="Cancelada")).status_code in (200, 204)
    assert len(sent) == n + 1 and sent[-1][0] == "pac1@mail.co"


def test_company_statistics():
    _, admin, pros = _empresa()
    ana = pros["ana@x.co"][1]
    ana.put("/api/records/a_x", json={"id": "a_x", "kind": "appt", "patientId": "p_1", "startAt": NOW, "duracion": 60, "modalidad": "Virtual", "estado": "Cancelada", "origen": "enlace"})
    r = admin.get("/api/empresa/estadisticas", params={"desde": HOY, "hasta": HOY, "tz": 0})
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["citas"]["Atendida"] == 2 and e["citas"]["Cancelada"] == 1 and e["totalCitas"] == 3 and e["tasaCancelacion"] == 33
    assert e["cobrado"] == 240000 and e["pagos"] == 2 and e["ticket"] == 120000 and e["pacientesActivos"] == 2
    assert {p["proNombre"]: p["cobrado"] for p in e["profesionales"]} == {"Pro 1": 80000, "Pro 2": 160000}
    assert sum(e["diaSemana"]) == 2 and e["agrupa"] == "semana" and e["serie"] and "SECRETO-CLINICO" not in r.text
    assert admin.get("/api/empresa/estadisticas", params={"desde": "2000-01-01", "hasta": "2100-01-01"}).status_code == 400
    assert ana.get("/api/empresa/estadisticas", params={"desde": HOY, "hasta": HOY}).status_code == 403


def test_company_statistics_detail_lists_who_is_behind_each_number():
    _, admin, pros = _empresa()
    ana_id = pros["ana@x.co"][0]
    P = {"desde": HOY, "hasta": HOY, "tz": 0}
    r = admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "atendidas"})
    assert r.status_code == 200, r.text
    assert {(f["pro"], f["paciente"], f["b"]) for f in r.json()["filas"]} == {("Pro 1", "Paciente1 Pérez", "Atendida"), ("Pro 2", "Paciente2 Pérez", "Atendida")}
    assert [f["paciente"] for f in admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "atendidas", "pro": ana_id}).json()["filas"]] == ["Paciente1 Pérez"]
    assert sorted(f["a"] for f in admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "pagos"}).json()["filas"]) == [80000, 160000]
    assert admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "activos"}).json()["total"] == 2
    assert admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "recurrentes"}).json()["total"] == 0
    assert admin.get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "nada"}).status_code == 400
    assert "SECRETO-CLINICO" not in r.text
    assert pros["ana@x.co"][1].get("/api/empresa/estadisticas/detalle", params={**P, "tipo": "citas"}).status_code == 403


def test_admin_private_notes_general_and_per_professional():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    r = admin.post("/api/empresa/notas", json={"titulo": "Reunión", "texto": "Revisar tarifas"}, headers=HEADERS)
    assert r.status_code == 201, r.text
    g = r.json()["id"]
    r = admin.post("/api/empresa/notas", json={"titulo": "Seguimiento", "texto": "Habló de horarios", "proId": ana_id}, headers=HEADERS)
    assert r.status_code == 201, r.text
    p = r.json()["id"]
    todas = admin.get("/api/empresa/notas").json()
    assert {(n["titulo"], n["proId"]) for n in todas} == {("Reunión", None), ("Seguimiento", ana_id)}
    r = admin.patch(f"/api/empresa/notas/{g}", json={"titulo": "Reunión 2", "texto": "x", "tipo": "Acuerdo", "estado": "En seguimiento", "revisar": "2030-01-05", "etiquetas": ["tarifas", " "], "seguimiento": [{"at": "2030-01-01", "texto": "Se habló"}], "proId": ana_id}, headers=HEADERS).json()
    assert (r["titulo"], r["tipo"], r["estado"], r["revisar"], r["etiquetas"], r["proId"]) == ("Reunión 2", "Acuerdo", "En seguimiento", "2030-01-05", ["tarifas"], ana_id) and r["seguimiento"][0]["texto"] == "Se habló"
    assert admin.patch(f"/api/empresa/notas/{g}", json={"titulo": "Reunión 2", "texto": "x", "proId": None}, headers=HEADERS).json()["proId"] is None
    assert admin.patch(f"/api/empresa/notas/{g}", json={"titulo": "R", "revisar": "mañana"}, headers=HEADERS).status_code == 400
    assert admin.post("/api/empresa/notas", json={"titulo": "", "texto": " "}, headers=HEADERS).status_code == 400
    assert admin.post("/api/empresa/notas", json={"titulo": "x", "proId": 999999}, headers=HEADERS).status_code == 400
    # el profesional no las ve ni las toca; otra empresa tampoco
    assert ana.get("/api/empresa/notas").status_code == 403 and ana.delete(f"/api/empresa/notas/{p}", headers=HEADERS).status_code == 403
    _otra_empresa()
    otro = client_for("otro@x.co")
    assert otro.get("/api/empresa/notas").json() == [] and otro.delete(f"/api/empresa/notas/{g}", headers=HEADERS).status_code == 404
    assert admin.delete(f"/api/empresa/notas/{g}", headers=HEADERS).status_code == 204
    assert [n["titulo"] for n in admin.get("/api/empresa/notas").json()] == ["Seguimiento"]


def test_permissions_can_be_set_per_professional():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    beto_id, beto = pros["beto@x.co"]
    admin.put("/api/empresa/permisos", json={"citas": False, "pagos": True}, headers=HEADERS)  # general: sin citas
    r = admin.patch(f"/api/empresa/profesionales/{ana_id}", json={"permisos": {"citas": True, "pagos": False}}, headers=HEADERS)
    assert r.status_code == 200
    assert ana.get("/api/auth/me").json()["permisos"] == {"citas": True, "pagos": False}  # los suyos mandan sobre el general
    assert beto.get("/api/auth/me").json()["permisos"] == {"citas": False, "pagos": True}  # Beto sigue el general
    cita = {"kind": "appt", "patientId": "p_1", "startAt": LATER, "duracion": 50}
    assert ana.put("/api/records/a_nueva", json={"id": "a_nueva", **cita}, headers=HEADERS).status_code in (200, 204)
    assert beto.put("/api/records/a_nueva2", json={"id": "a_nueva2", **cita}, headers=HEADERS).status_code == 403
    lista = admin.get("/api/empresa").json()["empresa"]["profesionales"]
    assert next(x for x in lista if x["id"] == ana_id)["permisosPro"] == {"citas": True, "pagos": False}
    assert next(x for x in lista if x["id"] == beto_id)["permisosPro"] == {"citas": None, "pagos": None}
    admin.patch(f"/api/empresa/profesionales/{ana_id}", json={"permisos": {"citas": None, "pagos": None}}, headers=HEADERS)  # volver al general
    assert ana.get("/api/auth/me").json()["permisos"] == {"citas": False, "pagos": True}


def test_admin_cannot_set_password_only_send_reset_email_and_archive_is_reversible(monkeypatch):
    import re
    from app import survey, main
    from conftest import anon
    sent = []
    monkeypatch.setattr(survey, "server_account", lambda: {"host": "h", "from": "k@x.co", "base": "https://k.co"})
    monkeypatch.setattr(survey, "send_invitacion_empresa", lambda *a: None)
    monkeypatch.setattr(main, "_send_reset", lambda to, name, url, acc: sent.append((to, url)))
    make_user("root@x.co", name="Root", role="admin")
    client_for("root@x.co").post("/api/admin/empresas", json={"name": "Clínica Sol", "email": "admin@x.co", "adminName": "Adela", "password": PASSWORD}, headers=HEADERS)
    admin = client_for("admin@x.co")
    pid = admin.post("/api/empresa/profesionales", json={"email": "pro@x.co", "name": "Pro"}, headers=HEADERS).json()["id"]
    _clave("pro@x.co")
    # fijar la contraseña ya no se puede: el campo se ignora y la del profesional sigue siendo la misma
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"password": "clave-del-admin-1"}, headers=HEADERS).status_code == 200
    assert anon().post("/api/auth/login", json={"email": "pro@x.co", "password": "clave-del-admin-1"}, headers=HEADERS).status_code in (400, 401)
    # el correo de restablecer llega al profesional y sirve una sola vez
    assert admin.post(f"/api/empresa/profesionales/{pid}/restablecer", headers=HEADERS).status_code == 200
    assert sent[0][0] == "pro@x.co"
    tok = re.search(r"recuperar=(.+)$", sent[0][1]).group(1)
    assert anon().post("/api/auth/reset", json={"token": tok, "password": "otra-clave-larga-1"}).status_code == 204
    # no vale para el administrador, otra empresa ni profesionales archivados
    assert admin.post(f"/api/empresa/profesionales/{admin.get('/api/auth/me').json()['id']}/restablecer", headers=HEADERS).status_code == 404
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"archivar": True}, headers=HEADERS).status_code == 200
    assert admin.post(f"/api/empresa/profesionales/{pid}/restablecer", headers=HEADERS).status_code == 409
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"active": True}, headers=HEADERS).status_code == 409  # archivado: se reactiva con «archivar: false»
    # reactivar lo devuelve a la lista de activos
    assert admin.patch(f"/api/empresa/profesionales/{pid}", json={"archivar": False}, headers=HEADERS).status_code == 200
    p = next(x for x in admin.get("/api/empresa").json()["empresa"]["profesionales"] if x["id"] == pid)
    assert p["archivado"] is False and p["active"] is True


def test_team_member_cannot_log_in_when_professional_is_archived_or_inactive():
    from conftest import anon
    make_user("root@x.co", name="Root", role="admin")
    client_for("root@x.co").post("/api/admin/empresas", json={"name": "C", "email": "admin@x.co", "adminName": "A", "password": PASSWORD}, headers=HEADERS)
    admin = client_for("admin@x.co")
    pid = admin.post("/api/empresa/profesionales", json={"email": "pro@x.co", "name": "Pro"}, headers=HEADERS).json()["id"]
    _clave("pro@x.co")
    assert client_for("pro@x.co").post("/api/equipo", json={"email": "eq@x.co", "name": "Eq", "password": PASSWORD}, headers=HEADERS).status_code == 201
    login = lambda: anon().post("/api/auth/login", json={"email": "eq@x.co", "password": PASSWORD}, headers=HEADERS).status_code
    assert login() == 200
    admin.patch(f"/api/empresa/profesionales/{pid}", json={"archivar": True}, headers=HEADERS)
    assert login() == 401  # archivado: su equipo tampoco ingresa
    admin.patch(f"/api/empresa/profesionales/{pid}", json={"archivar": False}, headers=HEADERS)
    assert login() == 200
    admin.patch(f"/api/empresa/profesionales/{pid}", json={"active": False}, headers=HEADERS)
    assert login() == 401  # inactivo: igual


def test_company_logo_is_set_by_admin_and_reaches_professionals_and_their_team():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    _, beto = pros["beto@x.co"]
    logo = "data:image/png;base64,iVBORw0KGgo="
    assert ana.put("/api/empresa/logo", json={"logo": logo}, headers=HEADERS).status_code == 403  # un profesional no lo sube
    assert admin.put("/api/empresa/logo", json={"logo": "data:text/html;base64,AAAA"}, headers=HEADERS).status_code == 400
    assert admin.put("/api/empresa/logo", json={"logo": logo}, headers=HEADERS).json() == {"logo": logo}
    assert ana.get("/api/auth/me").json()["companyLogo"] == logo
    assert beto.get("/api/auth/me").json()["companyLogo"] == logo
    assert admin.get("/api/auth/me").json()["companyLogo"] == logo
    assert admin.get("/api/empresa").json()["empresa"]["logo"] == logo
    admin.put("/api/empresa/logo", json={"logo": ""}, headers=HEADERS)
    assert "companyLogo" not in ana.get("/api/auth/me").json()


def test_consultorio_two_simultaneous_saves_do_not_share_the_room():
    import threading
    from app import main
    _, admin, pros = _empresa()
    ana, beto = pros["ana@x.co"][1], pros["beto@x.co"][1]
    cid = admin.post("/api/empresa/consultorios", json={"name": "C1", "horario": {str(d): [["08:00", "18:00"]] for d in range(7)}}, headers=HEADERS).json()["id"]
    cita = lambda i: {"id": i, "kind": "appt", "patientId": "p_1", "startAt": "2030-06-05T15:00:00Z", "duracion": 60, "modalidad": "Presencial", "estado": "Programada", "consultorioId": cid}
    res, barrera = {}, threading.Barrier(2)

    def guardar(cl, i):
        barrera.wait()
        res[i] = cl.put(f"/api/records/{i}", json=cita(i)).status_code
    ts = [threading.Thread(target=guardar, args=(cl, i)) for cl, i in ((ana, "a_x1"), (beto, "a_x2"))]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(res.values()) == [204, 409] or sorted(res.values()) == [200, 409], res  # solo una queda con el consultorio
    assert main._book_lock.acquire(timeout=1)  # el candado se soltó al terminar
    main._book_lock.release()


def test_professional_creation_has_no_password_and_probing_emails_is_limited():
    _, admin, _ = _empresa()
    r = admin.post("/api/empresa/profesionales", json={"email": "sin@x.co", "name": "Sin", "password": PASSWORD}, headers=HEADERS)  # la contraseña que se mande se ignora
    assert r.status_code == 201
    from conftest import anon
    assert anon().post("/api/auth/login", json={"email": "sin@x.co", "password": PASSWORD}).status_code in (401, 403)
    codes = [admin.post("/api/empresa/profesionales", json={"email": "ana@x.co", "name": "Dup"}, headers=HEADERS).status_code for _ in range(25)]
    assert codes[0] == 409 and codes[-1] == 429  # el 409 no sirve de sondeo sin límite


def test_company_notes_have_a_cap(monkeypatch):
    from app import main
    _, admin, _ = _empresa()
    monkeypatch.setattr(main, "MAX_NOTAS_EMPRESA", 2)
    assert [admin.post("/api/empresa/notas", json={"titulo": f"n{i}"}, headers=HEADERS).status_code for i in range(3)] == [201, 201, 400]


def test_archived_professional_does_not_hold_consultorios():
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    cid = admin.post("/api/empresa/consultorios", json={"name": "C1", "horario": {str(d): [["08:00", "18:00"]] for d in range(7)}}, headers=HEADERS).json()["id"]
    cita = {"id": "a_c1", "kind": "appt", "patientId": "p_1", "startAt": "2030-06-05T15:00:00Z", "duracion": 60, "modalidad": "Presencial", "estado": "Programada", "consultorioId": cid}
    assert ana.put("/api/records/a_c1", json=cita).status_code in (200, 204)
    ocupado = lambda: pros["beto@x.co"][1].get("/api/consultorios", params={"inicio": "2030-06-05T15:00:00Z", "duracion": 60}).json()[0]["libre"]
    assert ocupado() is False
    assert admin.patch(f"/api/empresa/profesionales/{ana_id}", json={"archivar": True}, headers=HEADERS).status_code == 200
    assert ocupado() is True


def test_secretary_sees_only_the_sections_the_admin_leaves_and_cannot_manage_the_company():
    from app.security import hash_password
    admin_id, admin, pros = _empresa()
    r = admin.post("/api/empresa/secretarios", json={"email": "sec@x.co", "name": "Sara Secretaria"}, headers=HEADERS)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert admin.post("/api/empresa/secretarios", json={"email": "dos@x.co", "name": "Dos"}, headers=HEADERS).status_code == 409  # solo uno por empresa
    assert r.json()["permisos"] == {"pros": True, "agenda": True, "cons": True, "fin": True, "stats": True, "notas": False}
    with SessionLocal() as db:  # el secretario elige su contraseña con el enlace del correo: aquí se la ponemos directo
        u = db.get(User, sid); u.password_hash = hash_password(PASSWORD); db.commit()
    sec = client_for("sec@x.co")
    assert sec.get("/api/empresa/agenda", params=RANGO).status_code == 200
    assert sec.get("/api/empresa/notas").status_code == 403  # las notas privadas del administrador vienen apagadas
    for ruta in ("/api/empresa/permisos", "/api/empresa/logo"):  # solo del administrador
        assert sec.put(ruta, json={"citas": True, "pagos": True} if "permisos" in ruta else {"logo": ""}, headers=HEADERS).status_code == 403
    assert sec.post("/api/empresa/secretarios", json={"email": "otro@x.co", "name": "Otro"}, headers=HEADERS).status_code == 403
    assert sec.get("/api/empresa").json()["empresa"].get("secretarios") is None
    me = sec.get("/api/auth/me").json()
    assert me["companySecretary"] is True and me["secPermisos"]["notas"] is False
    # no cuenta como profesional ni se puede tratar como tal
    assert {u["name"] for u in admin.get("/api/empresa").json()["empresa"]["profesionales"]} == {"Pro 1", "Pro 2"}
    assert admin.patch(f"/api/empresa/profesionales/{sid}", json={"active": False}, headers=HEADERS).status_code == 404
    # el administrador le quita Finanzas y le da Notas
    r = admin.patch(f"/api/empresa/secretarios/{sid}", json={"permisos": {"fin": False, "notas": True}}, headers=HEADERS)
    assert r.status_code == 200 and r.json()["permisos"]["fin"] is False
    assert sec.get("/api/empresa/finanzas", params=RANGO).status_code == 403
    assert sec.get("/api/empresa/notas").status_code == 200
    # trabajar en nombre de un profesional (agenda) sigue permitido; sin Agenda ni Finanzas, no
    pid = pros["ana@x.co"][0]
    assert sec.get("/api/records", headers={**HEADERS, "X-Empresa-Pro": str(pid)}).status_code == 200
    admin.patch(f"/api/empresa/secretarios/{sid}", json={"permisos": {"agenda": False}}, headers=HEADERS)
    assert sec.get("/api/records", headers={**HEADERS, "X-Empresa-Pro": str(pid)}).status_code == 403
    # desactivarlo cierra su acceso
    assert admin.patch(f"/api/empresa/secretarios/{sid}", json={"active": False}, headers=HEADERS).status_code == 200
    assert sec.get("/api/empresa/agenda", params=RANGO).status_code in (401, 403)
    # otra empresa no puede tocarlo
    _otra_empresa()
    assert client_for("otro@x.co").patch(f"/api/empresa/secretarios/{sid}", json={"active": True}, headers=HEADERS).status_code == 404


def test_company_google_calendar_collects_every_professionals_appointments(monkeypatch):
    from app import gcal
    from test_api import FakeGoogle
    from urllib.parse import parse_qs, urlparse
    g = FakeGoogle()
    monkeypatch.setattr(gcal, "http", g)
    monkeypatch.setattr(gcal, "CLIENT_ID", "cid"); monkeypatch.setattr(gcal, "CLIENT_SECRET", "sec"); monkeypatch.setattr(gcal, "BASE_URL", "https://historias.ejemplo.co")
    gcal._tokens.clear()
    _, admin, pros = _empresa()
    fut = {"startAt": "2099-03-04T15:00:00.000Z", "duracion": 50, "modalidad": "Virtual", "estado": "Programada"}
    (id_ana, ana), (id_beto, beto) = pros["ana@x.co"], pros["beto@x.co"]
    ana.put("/api/records/a_9", json={"id": "a_9", "kind": "appt", "patientId": "p_1", **fut})
    st = admin.get("/api/google/status").json()
    assert st["empresa"] is True and st["calendar"].startswith("Alter-Karute · ") and st["connected"] is False
    q = parse_qs(urlparse(admin.post("/api/google/connect", json={"detail": "iniciales"}).json()["url"]).query)
    from conftest import anon
    assert anon().get("/api/google/callback", params={"state": q["state"][0], "code": "abc"}, follow_redirects=False).headers["location"] == "/app?google=ok"
    # al conectar se copian las citas de todos los profesionales, con su nombre, y con ids que no chocan aunque ambos usen a_9
    beto.put("/api/records/a_9", json={"id": "a_9", "kind": "appt", "patientId": "p_1", **fut})
    ev = g.events
    assert ev[gcal.event_id(id_ana, "a_9")]["summary"].startswith("Pro · ") and gcal.event_id(id_ana, "a_9") != gcal.event_id(id_beto, "a_9")
    assert gcal.event_id(id_ana, "a_9") in ev and gcal.event_id(id_beto, "a_9") in ev
    # un cambio de un profesional llega solo; cancelar lo quita
    ana.put("/api/records/a_9", json={"id": "a_9", "kind": "appt", "patientId": "p_1", **{**fut, "estado": "Cancelada"}})
    assert gcal.event_id(id_ana, "a_9") not in ev and gcal.event_id(id_beto, "a_9") in ev
    assert "Paciente" not in str(ev)  # solo iniciales
    # el secretario no conecta Google
    from app.security import hash_password
    sid = admin.post("/api/empresa/secretarios", json={"email": "sg@x.co", "name": "Sec"}, headers=HEADERS).json()["id"]
    with SessionLocal() as db:
        u = db.get(User, sid); u.password_hash = hash_password(PASSWORD); db.commit()
    assert client_for("sg@x.co").get("/api/google/status").status_code == 403


def test_document_of_a_colleagues_patient_is_flagged_inside_the_company():
    _, admin, pros = _empresa()
    (_, ana), (_, beto) = pros["ana@x.co"], pros["beto@x.co"]
    ana.put("/api/records/p_dup", json={"id": "p_dup", "kind": "patient", "nombres": "Luz", "apellidos": "Mora", "tipoDoc": "CC", "documento": "1.234.567", "estado": "Activo", "consents": []})
    aviso = lambda c, d: c.post("/api/consultantes/documento-empresa", json={"documento": d}).json()["profesional"]
    assert aviso(beto, "1234567")  # la cédula está con otro profesional de la empresa
    assert aviso(ana, "1234567") is None  # con uno mismo avisa el propio formulario, no la empresa
    assert aviso(beto, "999999") is None and aviso(beto, "12") is None
    assert "Mora" not in str(beto.post("/api/consultantes/documento-empresa", json={"documento": "1234567"}).json())  # nunca el nombre del paciente


def test_company_logo_and_slogan_brand_the_booking_page_and_emails(monkeypatch):
    import base64, io
    from email.message import EmailMessage
    import struct, zlib
    from app import survey
    from conftest import anon
    try:
        from PIL import Image
    except ImportError:
        Image = None
    ch = lambda k, d: struct.pack(">I", len(d)) + k + d + struct.pack(">I", zlib.crc32(k + d))
    png0 = b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 1200, 400, 8, 6, 0, 0, 0)) + ch(b"IDAT", zlib.compress((b"\x00" + b"\x0a\x5a\xc8\xff" * 1200) * 400)) + ch(b"IEND", b"")
    logo = "data:image/png;base64," + base64.b64encode(png0).decode()
    _, admin, pros = _empresa()
    assert admin.put("/api/empresa/logo", json={"logo": logo}, headers=HEADERS).status_code == 200
    assert admin.put("/api/empresa/eslogan", json={"eslogan": "  Cuidamos   su salud mental "}, headers=HEADERS).json()["eslogan"] == "Cuidamos su salud mental"
    assert admin.get("/api/empresa").json()["empresa"]["eslogan"] == "Cuidamos su salud mental"
    assert pros["ana@x.co"][1].put("/api/empresa/eslogan", json={"eslogan": "x"}, headers=HEADERS).status_code == 403  # solo el administrador
    ana_id, ana = pros["ana@x.co"]
    # el servidor de correo puede no estar configurado en las pruebas: la marca se arma igual
    from app.correo import marca_empresa
    from app.db import Company
    with SessionLocal() as db:
        c = db.get(Company, db.get(User, ana_id).company_id); m = marca_empresa(c, "https://h.co")
    assert m["eslogan"] == "Cuidamos su salud mental" and m["logo"].startswith(f"https://h.co/api/logo-empresa/{c.id}?v=")
    png = anon().get(f"/api/logo-empresa/{c.id}")
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    if Image:
        w, h = Image.open(io.BytesIO(png.content)).size
        assert w <= 360 and h <= 120  # se redimensiona para correos y páginas
    # el correo del profesional: logo y eslogan de la empresa arriba y Karute en un pie pequeño
    sent = []
    class FakeSMTP:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def send_message(self, m): sent.append(m)
    monkeypatch.setattr(survey.smtplib, "SMTP", lambda *a, **k: type("S", (FakeSMTP,), {"starttls": lambda s: None})())
    from app import correo
    monkeypatch.setattr(correo, "PUBLIC_URL", "https://alter.test")
    msg = EmailMessage(); msg["To"] = "p@x.co"; msg["From"] = "k@x.co"; msg["Subject"] = "Hola"; msg.set_content("texto")
    correo.agregar(msg, correo.layout("Hola", ["Un mensaje"]))
    with survey.smtp_open({"host": "h", "port": 587, "marca": m}) as s:
        s.send_message(msg)
    html = sent[0].get_body(("html",)).get_content()
    assert m["logo"] in html and "Cuidamos su salud mental" in html and 'width="28"' in html and 'width="64"' not in html and "Conoce Alter-Karute" not in html and "Enviado con" in html
    slug = admin.put("/api/empresa/reservas", json={"activo": True}, headers=HEADERS).json()["slug"]
    assert anon().get(f"/api/reservar-empresa/{slug}").json()["marca"]["eslogan"] == "Cuidamos su salud mental"  # el enlace de reservas lleva logo y eslogan


def test_company_texts_for_emails_and_booking_page_are_separate(monkeypatch):
    from conftest import anon
    from app import correo
    from app.db import Company
    _, admin, pros = _empresa()
    r = admin.put("/api/empresa/textos", json={"correo": "Escríbanos 24 horas antes."}, headers=HEADERS).json()
    assert r == {"correo": "Escríbanos 24 horas antes.", "reservas": ""}  # cambiar uno no toca el otro
    admin.put("/api/empresa/textos", json={"reservas": "Atendemos de lunes a viernes."}, headers=HEADERS)
    e = admin.get("/api/empresa").json()["empresa"]
    assert e["textoCorreo"] == "Escríbanos 24 horas antes." and e["textoReservas"] == "Atendemos de lunes a viernes."
    assert pros["ana@x.co"][1].put("/api/empresa/textos", json={"correo": "x"}, headers=HEADERS).status_code == 403
    with SessionLocal() as db:
        c = db.get(Company, db.get(User, pros["ana@x.co"][0]).company_id); m = correo.marca_empresa(c, "https://h.co")
    monkeypatch.setattr(correo, "PUBLIC_URL", "https://alter.test")
    html = correo.marcar(correo.layout("Hola", ["Un mensaje"]), m)
    assert "Escríbanos 24 horas antes." in html and "Atendemos de lunes" not in html  # cada texto va a su lugar
    assert html.index("Escríbanos") < html.index("Atentamente") and "logo-email.png" in html  # antes de la firma; Karute pequeño arriba a la derecha
    assert admin.put("/api/empresa/textos", json={"correo": ""}, headers=HEADERS).json()["correo"] == ""


def test_admin_of_another_company_cannot_touch_this_companys_people_or_data():
    """El administrador de «Otra» usa los ids de «Clínica Sol»: ninguna ruta de empresa le debe dar acceso ni cambiar nada."""
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    sec = admin.post("/api/empresa/secretarios", json={"email": "sec@x.co", "name": "Sec"}, headers=HEADERS)
    assert sec.status_code == 201, sec.text
    sec_id = sec.json()["id"]
    cons_id = admin.post("/api/empresa/consultorios", json={"name": "C1", "horario": {"1": [["08:00", "18:00"]]}}, headers=HEADERS).json()["id"]
    nota_id = admin.post("/api/empresa/notas", json={"titulo": "Reservada", "texto": "SECRETO-ADMIN"}, headers=HEADERS).json()["id"]
    _otra_empresa()
    otro = client_for("otro@x.co")
    malo = lambda r: r.status_code in (403, 404)  # 404: ese id no existe para esta empresa; 403: no puede actuar por él
    # control: con el mismo cuerpo, el administrador dueño sí puede (así el 404 de abajo es por la empresa y no por un campo mal escrito)
    assert admin.patch(f"/api/empresa/profesionales/{ana_id}", json={"name": "Pro Uno"}, headers=HEADERS).status_code == 200
    assert admin.patch(f"/api/empresa/consultorios/{cons_id}", json={"name": "C9"}, headers=HEADERS).status_code == 200
    assert admin.patch(f"/api/empresa/notas/{nota_id}", json={"titulo": "Reservada"}, headers=HEADERS).status_code == 200
    assert admin.patch(f"/api/empresa/secretarios/{sec_id}", json={"name": "Sec"}, headers=HEADERS).status_code == 200

    assert malo(otro.patch(f"/api/empresa/profesionales/{ana_id}", json={"name": "Hackeado"}, headers=HEADERS))
    assert malo(otro.post(f"/api/empresa/profesionales/{ana_id}/restablecer", headers=HEADERS))
    assert malo(otro.patch(f"/api/empresa/secretarios/{sec_id}", json={"name": "Hackeado"}, headers=HEADERS))
    assert malo(otro.post(f"/api/empresa/secretarios/{sec_id}/invitar", headers=HEADERS))
    assert malo(otro.patch(f"/api/empresa/consultorios/{cons_id}", json={"name": "Hackeado"}, headers=HEADERS))
    assert malo(otro.patch(f"/api/empresa/notas/{nota_id}", json={"titulo": "Hackeada"}, headers=HEADERS))
    assert malo(otro.delete(f"/api/empresa/notas/{nota_id}", headers=HEADERS))
    assert malo(otro.get(f"/api/empresa/comprobante/{ana_id}/b_x"))
    # trabajar en nombre de un profesional ajeno: ni leer ni escribir sus registros
    r = otro.get("/api/records", headers={"X-Empresa-Pro": str(ana_id)})
    assert malo(r) and "Paciente1" not in r.text
    assert malo(otro.put("/api/records/pa_robado", json={"id": "pa_robado", "kind": "pago", "patientId": "p_1", "monto": 1, "fecha": HOY, "medio": "Efectivo"}, headers={**HEADERS, "X-Empresa-Pro": str(ana_id)}))
    # y las listas de la otra empresa no incluyen nada de esta
    for ruta in ("/api/empresa/pacientes", "/api/empresa/consultorios", "/api/empresa/notas"):
        assert "Paciente" not in otro.get(ruta, params=RANGO).text and "Reservada" not in otro.get(ruta, params=RANGO).text
    det = otro.get("/api/empresa/estadisticas/detalle", params={**RANGO, "tipo": "citas", "pro": ana_id})
    assert det.status_code in (200, 400, 403, 404) and "Paciente" not in det.text

    # lo de esta empresa quedó intacto
    assert admin.get("/api/empresa/notas").json()[0]["titulo"] == "Reservada"
    assert ana.get("/api/records").status_code == 200


def test_a_professional_cannot_use_company_admin_routes_or_act_for_another():
    _, admin, pros = _empresa()
    ana, beto = pros["ana@x.co"][1], pros["beto@x.co"][1]
    beto_id = pros["beto@x.co"][0]
    for ruta in ("/api/empresa/agenda", "/api/empresa/finanzas", "/api/empresa/pacientes", "/api/empresa/notas", "/api/empresa/estadisticas"):
        assert ana.get(ruta, params=RANGO).status_code in (401, 403), ruta
    assert ana.post("/api/empresa/profesionales", json={"email": "x@x.co", "name": "X"}, headers=HEADERS).status_code in (401, 403)
    assert ana.put("/api/empresa/permisos", json={"citas": True, "pagos": True}, headers=HEADERS).status_code in (401, 403)
    r = ana.get("/api/records", headers={"X-Empresa-Pro": str(beto_id)})  # un colega no puede hacerse pasar por otro
    assert "Paciente2" not in r.text and (r.status_code in (401, 403, 404) or "Paciente1" in r.text)


def test_company_booking_link_never_reaches_another_companys_or_a_solo_professional(monkeypatch):
    from app import survey
    from conftest import anon
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "p@gmail.com", "base": "https://h.co", "propio": True})
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    cfg = {"activo": True, "dias": {str(i): ["08:00", "20:00"] for i in range(7)}, "duracion": 50, "aviso": 0, "horizonte": 7, "modalidades": ["Presencial"]}
    ana.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "correo": "ana@consulta.co"})
    ana.put("/api/reserva", json=cfg)
    slug_a = admin.put("/api/empresa/reservas", json={"activo": True}, headers=HEADERS).json()["slug"]
    # otra empresa con su profesional con horario, y un terapeuta sin empresa con horario
    _otra_empresa()
    otro = client_for("otro@x.co")
    pid_b = otro.post("/api/empresa/profesionales", json={"email": "pro-b@x.co", "name": "Pro B"}, headers=HEADERS).json()["id"]
    _clave("pro-b@x.co")
    pro_b = client_for("pro-b@x.co")
    pro_b.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Pro B", "correo": "b@consulta.co"})
    pro_b.put("/api/reserva", json=cfg)
    solo = make_user("solo@x.co")
    client_for("solo@x.co").put("/api/reserva", json=cfg)
    pub = anon()
    assert pub.get(f"/api/reservar-empresa/{slug_a}/{ana_id}").status_code == 200  # control: el propio sí
    d = pub.get(f"/api/reservar-empresa/{slug_a}/{ana_id}").json(); day = sorted(d["dias"])[0]
    body = {"inicio": f"{day}T{d['dias'][day][0]}", "modalidad": "Presencial", "nuevo": True, "nombres": "Luis", "apellidos": "Gómez", "correo": "luis@mail.co", "telefono": "3001234567"}
    for ajeno in (pid_b, solo):
        assert pub.get(f"/api/reservar-empresa/{slug_a}/{ajeno}").status_code == 404
        assert pub.post(f"/api/reservar-empresa/{slug_a}/{ajeno}", json=body).status_code == 404
    assert pid_b not in [p["id"] for p in pub.get(f"/api/reservar-empresa/{slug_a}").json()["profesionales"]]

def test_consultorio_address_is_used_in_presencial_mail(monkeypatch):
    from app import booking
    from app.main import _lugar
    _, admin, pros = _empresa()
    c = admin.post("/api/empresa/consultorios", json={"name": "C1", "direccion": " Carrera 5 # 6-7 "}, headers=HEADERS)
    assert c.status_code in (200, 201) and c.json()["direccion"] == "Carrera 5 # 6-7"
    cid = c.json()["id"]
    assert admin.patch(f"/api/empresa/consultorios/{cid}", json={"direccion": "Calle 1 # 2-3"}, headers=HEADERS).json()["direccion"] == "Calle 1 # 2-3"
    with SessionLocal() as db:
        assert _lugar(db, {"direccion": "Del perfil"}, cid)["direccion"] == "Calle 1 # 2-3"  # el del consultorio manda
        assert _lugar(db, {"direccion": "Del perfil"}, None)["direccion"] == "Del perfil"


def test_company_sets_booking_background_color():
    from app.correo import marca_empresa
    from app.db import Company
    _, admin, pros = _empresa()
    ana_id, ana = pros["ana@x.co"]
    assert admin.put("/api/empresa/color", json={"color": "#FDEFF0"}, headers=HEADERS).json()["color"] == "#fdeff0"
    assert admin.get("/api/empresa").json()["empresa"]["colorReservas"] == "#fdeff0"
    for malo in ("rojo", "#12345", "#gggggg", "url(x)"):
        assert admin.put("/api/empresa/color", json={"color": malo}, headers=HEADERS).status_code == 400
    assert ana.put("/api/empresa/color", json={"color": "#000000"}, headers=HEADERS).status_code == 403  # solo el administrador
    with SessionLocal() as db:
        c = db.get(Company, db.get(User, ana_id).company_id)
        assert marca_empresa(c)["color"] == "#fdeff0"
    assert admin.put("/api/empresa/color", json={"color": ""}, headers=HEADERS).json()["color"] == ""
