from fastapi.testclient import TestClient
from sqlalchemy import select

from app import main
from app.db import Record, SessionLocal

from datetime import datetime, timezone

from conftest import HEADERS, PASSWORD, anon, client_for, consent, make_user, patient

NOW = datetime.now(timezone.utc).isoformat()


def test_login_and_generic_error():
    make_user("ana@x.co", "Ana")
    r = anon().post("/api/auth/login", json={"email": "ana@x.co", "password": "mala"})
    assert r.status_code == 401
    r2 = anon().post("/api/auth/login", json={"email": "nadie@x.co", "password": "mala"})
    assert r2.status_code == 401 and r2.json() == r.json()
    c = client_for("ANA@x.co")
    assert c.get("/api/auth/me").json()["name"] == "Ana"


def test_requires_login():
    assert anon().get("/api/records").status_code == 401
    assert anon().get("/api/admin/users").status_code == 401


def test_csrf_header_required():
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    bare = TestClient(main.app)
    bare.cookies.update(c.cookies)
    assert bare.put("/api/records/p_1", json=patient()).status_code == 403
    assert c.put("/api/records/p_1", json=patient()).status_code == 200


def test_records_roundtrip_and_isolation():
    make_user("ana@x.co")
    make_user("beto@x.co")
    a, b = client_for("ana@x.co"), client_for("beto@x.co")
    assert a.put("/api/records/p_1", json=patient()).status_code == 200
    assert a.get("/api/records").json()[0]["apellidos"] == "Pérez"
    assert b.get("/api/records").json() == []
    assert b.put("/api/records/p_1", json=patient(apellidos="Otro")).status_code == 200
    assert a.get("/api/records").json()[0]["apellidos"] == "Pérez"
    assert b.delete("/api/records/p_1").status_code == 204
    assert len(a.get("/api/records").json()) == 1
    assert b.get("/api/records").json() == []


def test_content_is_encrypted_at_rest():
    make_user("ana@x.co")
    a = client_for("ana@x.co")
    a.put("/api/records/p_1", json=patient(motivo="ansiedad severa"))
    with SessionLocal() as db:
        raw = bytes(db.scalars(select(Record)).one().payload)
    assert b"ansiedad" not in raw and "Pérez".encode() not in raw and b"Mar" not in raw


def test_record_validation():
    make_user("ana@x.co")
    a = client_for("ana@x.co")
    assert a.put("/api/records/n_1", json=patient("p_1")).status_code == 400
    assert a.put("/api/records/x_1", json={"id": "x_1", "kind": "otro"}).status_code == 400
    assert a.put("/api/records/p_2", json={"id": "p_2", "kind": "note"}).status_code == 400
    assert a.put("/api/records/profile", json={"id": "profile", "kind": "profile"}).status_code in (200, 204)
    assert a.put("/api/records/p_1%2F..", json=patient()).status_code in (400, 404)


def test_admin_permissions_and_user_management():
    make_user("adm@x.co", "Admin", role="admin")
    make_user("ana@x.co")
    assert client_for("ana@x.co").get("/api/admin/users").status_code == 403
    adm = client_for("adm@x.co")
    new = {"email": "Nueva@x.co", "name": "Nueva", "password": PASSWORD, "role": "user"}
    assert adm.post("/api/admin/users", json=new).status_code == 201
    assert adm.post("/api/admin/users", json=new).status_code == 409
    assert adm.post("/api/admin/users", json={**new, "email": "o@x.co", "password": "corta"}).status_code == 400
    assert client_for("nueva@x.co").get("/api/auth/me").status_code == 200


def test_admin_guards_and_deactivation():
    adm_id = make_user("adm@x.co", "Admin", role="admin")
    ana_id = make_user("ana@x.co")
    adm = client_for("adm@x.co")
    assert adm.patch(f"/api/admin/users/{adm_id}", json={"active": False}).status_code == 400
    assert adm.patch(f"/api/admin/users/{adm_id}", json={"role": "user"}).status_code == 400
    ana = client_for("ana@x.co")
    assert adm.patch(f"/api/admin/users/{ana_id}", json={"active": False}).status_code == 200
    assert ana.get("/api/records").status_code == 401
    r = anon().post("/api/auth/login", json={"email": "ana@x.co", "password": PASSWORD})
    assert r.status_code == 401


def test_last_admin_cannot_be_removed_by_another_admin():
    a1 = make_user("a1@x.co", role="admin")
    a2 = make_user("a2@x.co", role="admin")
    c1 = client_for("a1@x.co")
    assert c1.patch(f"/api/admin/users/{a2}", json={"role": "user"}).status_code == 200
    c2_id = a2
    assert c1.patch(f"/api/admin/users/{c2_id}", json={"role": "admin"}).status_code == 200
    assert c1.patch(f"/api/admin/users/{a1}", json={"role": "user"}).status_code == 400


def test_password_change():
    make_user("ana@x.co")
    a = client_for("ana@x.co")
    assert a.post("/api/auth/password", json={"current": "mala", "new": "nueva-clave-larga"}).status_code == 400
    assert a.post("/api/auth/password", json={"current": PASSWORD, "new": "corta"}).status_code == 400
    assert a.post("/api/auth/password", json={"current": PASSWORD, "new": "nueva-clave-larga"}).status_code == 204
    assert anon().post("/api/auth/login", json={"email": "ana@x.co", "password": PASSWORD}).status_code == 401
    client_for("ana@x.co", "nueva-clave-larga")


def test_login_throttling():
    make_user("ana@x.co")
    for _ in range(5):
        assert anon().post("/api/auth/login", json={"email": "ana@x.co", "password": "mala"}).status_code == 401
    assert anon().post("/api/auth/login", json={"email": "ana@x.co", "password": PASSWORD}).status_code == 429


def test_signed_documents_are_immutable():
    make_user("a@x.co")
    c = client_for("a@x.co")
    pat = patient("p_1", intake={"motivo": "m", "signedAt": NOW, "addenda": []},
                  consents=[{"text": "t", "signedAt": NOW}])
    assert c.put("/api/records/p_1", json=pat).status_code == 200
    # la primera cita firmada no cambia, pero admite adendas
    chg = {**pat, "intake": {**pat["intake"], "motivo": "otro"}}
    assert c.put("/api/records/p_1", json=chg).status_code == 409
    add = {**pat, "intake": {**pat["intake"], "addenda": [{"text": "nota", "at": "2026-01-02"}]}}
    assert c.put("/api/records/p_1", json=add).status_code == 200
    # los consentimientos firmados no se reescriben ni se quitan
    assert c.put("/api/records/p_1", json={**add, "consents": []}).status_code == 409
    # datos sociodemográficos sí se pueden corregir
    assert c.put("/api/records/p_1", json={**add, "telefono": "300"}).status_code == 200
    # notas: deben guardarse firmadas, no se editan ni se borran
    assert c.put("/api/records/n_1", json={"id": "n_1", "kind": "note", "patientId": "p_1", "tema": "x"}).status_code == 400
    note = {"id": "n_1", "kind": "note", "patientId": "p_1", "tema": "x", "signedAt": NOW, "addenda": []}
    assert c.put("/api/records/n_1", json=note).status_code in (200, 204)
    assert c.put("/api/records/n_1", json={**note, "tema": "y"}).status_code == 409
    assert c.put("/api/records/n_1", json={**note, "addenda": [{"text": "a"}]}).status_code in (200, 204)
    assert c.put("/api/records/n_1", json=note).status_code == 409  # quitar una adenda
    assert c.delete("/api/records/n_1", headers=HEADERS).status_code == 409
    assert c.delete("/api/records/p_1", headers=HEADERS).status_code == 409


def test_format_snapshot_cannot_change_after_signing():
    make_user("f@x.co")
    c = client_for("f@x.co")
    schema = [["Motivo", [["motivo", "Motivo de consulta", 3]]]]
    pat = patient("p_9", intake={"motivo": "m", "signedAt": NOW, "addenda": [], "schema": schema})
    assert c.put("/api/records/p_9", json=pat).status_code == 200
    other = [["Otro", [["motivo", "Otra etiqueta", 3]]]]
    assert c.put("/api/records/p_9", json={**pat, "intake": {**pat["intake"], "schema": other}}).status_code == 409
    prof = {"id": "profile", "kind": "profile", "formatos": {"intake": other, "evol": [["tema", "Tema", 3]]}}
    assert c.put("/api/records/profile", json=prof).status_code in (200, 204)  # el perfil sí puede cambiar de formato


def test_idle_session_expires_and_activity_renews():
    import time as _t

    import jwt as _jwt

    from app.config import SESSION_SECRET
    make_user("i@x.co")
    c = client_for("i@x.co")
    me = c.get("/api/auth/me").json()
    assert me["idle_minutes"] == 30
    uid = me["id"]
    old = _jwt.encode({"sub": str(uid), "exp": int(_t.time()) + 3600, "act": int(_t.time()) - 31 * 60}, SESSION_SECRET, algorithm="HS256")
    c.cookies.set("ac_session", old)
    r = c.get("/api/auth/me")
    assert r.status_code == 401 and "inactividad" in r.json()["detail"]
    recent = _jwt.encode({"sub": str(uid), "exp": int(_t.time()) + 3600, "act": int(_t.time()) - 5 * 60}, SESSION_SECRET, algorithm="HS256")
    c.cookies.clear()
    c.cookies.set("ac_session", recent)
    r = c.get("/api/auth/me")
    assert r.status_code == 200 and "ac_session" in r.headers.get("set-cookie", "")


def test_appointments_and_calendar_feed():
    make_user("cal@x.co")
    make_user("otro@x.co")
    c, o = client_for("cal@x.co"), client_for("otro@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1", consents=consent())).status_code == 200
    appt = {"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": "2099-03-04T15:00:00.000Z", "duracion": 50, "modalidad": "Virtual", "estado": "Programada"}
    assert c.put("/api/records/a_1", json=appt).status_code in (200, 204)
    assert c.put("/api/records/a_2", json={**appt, "id": "a_2", "estado": "Cancelada"}).status_code in (200, 204)
    assert c.put("/api/records/x_1", json={**appt, "id": "x_1"}).status_code == 400  # prefijo
    assert c.get("/api/calendar/feed").json()["active"] is False
    tok = c.post("/api/calendar/feed", json={"detail": "iniciales"}).json()["token"]
    anon_c = anon()
    r = anon_c.get(f"/api/calendar/{tok}.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    body = r.text
    assert "BEGIN:VEVENT" in body and "Cita · M.P." in body and "DTSTART:20990304T150000Z" in body
    assert "María" not in body and body.count("BEGIN:VEVENT") == 1  # sin nombre ni canceladas
    assert anon_c.get("/api/calendar/" + "x" * 43 + ".ics").status_code == 404
    assert o.get("/api/calendar/feed").json()["active"] is False
    # nuevo enlace invalida el anterior; desactivar lo apaga
    tok2 = c.post("/api/calendar/feed", json={"detail": "nombre"}).json()["token"]
    assert anon_c.get(f"/api/calendar/{tok}.ics").status_code == 404
    assert "María Pérez" in anon_c.get(f"/api/calendar/{tok2}.ics").text
    assert c.post("/api/calendar/feed", json={"detail": "todo"}).status_code == 400
    assert c.delete("/api/calendar/feed").status_code == 204
    assert anon_c.get(f"/api/calendar/{tok2}.ics").status_code == 404
    # las citas sí se pueden editar y borrar
    assert c.put("/api/records/a_1", json={**appt, "estado": "Atendida"}).status_code in (200, 204)
    assert c.delete("/api/records/a_2").status_code == 204


def test_closing_notes_are_append_only():
    make_user("z@x.co")
    c = client_for("z@x.co")
    cierre = {"motivo": "Cumplimiento de objetivos", "signedAt": NOW}
    pat = patient("p_3", estado="Alta", cierres=[cierre])
    assert c.put("/api/records/p_3", json=pat).status_code == 200
    assert c.put("/api/records/p_3", json={**pat, "cierres": [{**cierre, "motivo": "otro"}]}).status_code == 409
    assert c.put("/api/records/p_3", json={**pat, "estado": "Activo"}).status_code == 200  # reabrir
    assert c.delete("/api/records/p_3").status_code == 409


PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def test_attachments_are_encrypted_immutable_and_private():
    make_user("adj@x.co")
    make_user("otra@x.co")
    c, o = client_for("adj@x.co"), client_for("otra@x.co")
    c.put("/api/records/p_1", json=patient("p_1"))
    h = {"Content-Type": "application/pdf"}
    assert c.put("/api/blobs/f_1", content=PDF, headers=h).status_code == 200
    assert c.put("/api/blobs/f_1", content=PDF, headers=h).status_code == 409  # no se reemplaza
    assert c.put("/api/blobs/f_2", content=b"MZ-ejecutable", headers=h).status_code == 415  # contenido falso
    assert c.put("/api/blobs/f_3", content=PDF, headers={"Content-Type": "text/html"}).status_code == 415
    assert c.put("/api/blobs/n_1", content=PDF, headers=h).status_code == 400
    r = c.get("/api/blobs/f_1")
    assert r.status_code == 200 and r.content == PDF and r.headers["content-type"] == "application/pdf"
    assert o.get("/api/blobs/f_1").status_code == 404  # otro usuario no lo ve
    from app.db import Blob
    with SessionLocal() as db:
        assert b"%PDF" not in db.get(Blob, (1, "f_1")).data  # cifrado en la base
    meta = {"id": "f_1", "kind": "file", "patientId": "p_1", "nombre": "remision.pdf", "mime": "application/pdf"}
    assert c.put("/api/records/f_1", json=meta).status_code in (200, 204)
    assert c.put("/api/records/f_1", json={**meta, "nombre": "otro.pdf"}).status_code == 409
    assert c.delete("/api/records/p_1").status_code == 409  # paciente con adjuntos
    # quitar dentro de los primeros minutos sí; después no
    assert c.delete("/api/records/f_1").status_code == 204
    assert c.get("/api/blobs/f_1").status_code == 404
    c.put("/api/blobs/f_9", content=PDF, headers=h)
    c.put("/api/records/f_9", json={**meta, "id": "f_9"})
    from datetime import datetime, timedelta, timezone
    with SessionLocal() as db:
        row = db.get(Record, (1, "f_9"))
        row.updated_at = datetime.now(timezone.utc) - timedelta(minutes=20)
        db.commit()
    assert c.delete("/api/records/f_9").status_code == 409


def test_consent_revocation_and_copy_requests_grow_only():
    make_user("rv@x.co")
    c = client_for("rv@x.co")
    con = {"text": "t", "signedAt": NOW, "tipo": "Presencial"}
    sol = {"id": "s1", "fecha": "2026-02-01", "solicitante": "María"}
    pat = patient("p_1", consents=[con], solicitudes=[sol])
    assert c.put("/api/records/p_1", json=pat).status_code == 200
    rev = {**con, "revocacion": {"fecha": "2026-03-01", "signedAt": NOW}}
    ent = {**sol, "entrega": {"fecha": "2026-02-05"}}
    assert c.put("/api/records/p_1", json={**pat, "consents": [rev], "solicitudes": [ent]}).status_code == 200
    pat2 = {**pat, "consents": [rev], "solicitudes": [ent]}
    # no se cambia una revocación ni una entrega ya registradas, ni el texto, ni se quitan
    assert c.put("/api/records/p_1", json={**pat2, "consents": [{**rev, "revocacion": {"fecha": "x"}}]}).status_code == 409
    assert c.put("/api/records/p_1", json={**pat2, "solicitudes": [{**ent, "solicitante": "Otro"}]}).status_code == 409
    assert c.put("/api/records/p_1", json={**pat2, "consents": [{**rev, "text": "otro"}]}).status_code == 409
    assert c.put("/api/records/p_1", json={**pat2, "solicitudes": []}).status_code == 409
    assert c.put("/api/records/p_1", json={**pat2, "solicitudes": [ent, {"id": "s2"}]}).status_code == 200


def test_signature_time_must_match_server_clock():
    make_user("hl@x.co")
    c = client_for("hl@x.co")
    assert "now" in anon().get("/api/time").json()
    note = {"id": "n_5", "kind": "note", "patientId": "p_1", "tema": "x", "signedAt": "2026-01-03T10:00:00Z", "addenda": []}
    r = c.put("/api/records/n_5", json=note)
    assert r.status_code == 400 and "hora" in r.json()["detail"]
    assert c.put("/api/records/n_5", json={**note, "signedAt": NOW}).status_code in (200, 204)
    pat = patient("p_7", consents=[{"text": "t", "signedAt": "2020-01-01T00:00:00Z"}])
    assert c.put("/api/records/p_7", json=pat).status_code == 400
    # restaurar un respaldo conserva las horas originales (queda en la bitácora como importación)
    assert c.put("/api/records/p_7", json=pat, headers={"X-Import": "1"}).status_code == 200
    from app.db import Audit
    with SessionLocal() as db:
        assert db.scalar(select(Audit).where(Audit.action == "record.import")) is not None


def test_scale_applications_are_signed_and_immutable():
    make_user("es@x.co")
    c = client_for("es@x.co")
    e = {"id": "e_1", "kind": "scale", "patientId": "p_1", "escala": {"id": "bienestar"}, "respuestas": [1, 2], "total": 3}
    assert c.put("/api/records/e_1", json=e).status_code == 400  # sin firmar
    e = {**e, "signedAt": NOW, "addenda": []}
    assert c.put("/api/records/e_1", json=e).status_code in (200, 204)
    assert c.put("/api/records/e_1", json={**e, "total": 9}).status_code == 409
    assert c.delete("/api/records/e_1").status_code == 409


def test_report_verification_code():
    make_user("vf@x.co")
    c = client_for("vf@x.co")
    c.put("/api/records/p_1", json=patient("p_1", consents=[{"text": "t", "signedAt": NOW}], intake={"motivo": "m", "signedAt": NOW, "addenda": []}))
    rep = {"id": "r_1", "kind": "report", "patientId": "p_1", "tipo": "Constancia de asistencia", "contenido": "Asistió a 5 sesiones.",
           "signedAt": NOW, "addenda": [], "therapistName": "Ana Psicóloga", "verificacion": "ABCD-EFGH-JK23"}
    assert c.put("/api/records/r_1", json={**rep, "verificacion": "abc"}).status_code == 400
    assert c.put("/api/records/r_1", json=rep).status_code in (200, 204)
    assert c.put("/api/records/r_2", json={**rep, "id": "r_2"}).status_code == 409  # código repetido
    a = anon()
    r = a.get("/api/verify/abcd-efgh-jk23")
    assert r.status_code == 200
    j = r.json()
    assert j["contenido"] == "Asistió a 5 sesiones." and j["paciente"] == "María Pérez" and j["profesional"] == "Ana Psicóloga"
    assert a.get("/api/verify/ABCD-EFGH-JK24").status_code == 404
    for _ in range(30):
        a.get("/api/verify/ZZZZ-ZZZZ-ZZZZ")
    assert a.get("/api/verify/ABCD-EFGH-JK23").status_code == 429  # límite de consultas


def test_paper_record_incorporation_is_signed_and_append_only():
    make_user("inc@x.co")
    c = client_for("inc@x.co")
    inc = {"id": "i1", "archivos": [{"id": "f_1", "sha256": "ab" * 32}], "desde": "2019-02-01", "hasta": "2023-06-30", "signedAt": NOW}
    pat = patient("p_4", incorporaciones=[inc])
    assert c.put("/api/records/p_4", json=pat).status_code == 200
    assert c.put("/api/records/p_4", json={**pat, "incorporaciones": [{**inc, "hasta": "2024-01-01"}]}).status_code == 409
    assert c.put("/api/records/p_4", json={**pat, "incorporaciones": []}).status_code == 409
    old = {**inc, "id": "i2", "signedAt": "2020-01-01T00:00:00Z"}
    assert c.put("/api/records/p_4", json={**pat, "incorporaciones": [inc, old]}).status_code == 400  # hora de firma antigua
    assert c.delete("/api/records/p_4").status_code == 409


class FakeGoogle:
    """Simula los servicios de Google que usa la sincronización."""
    def __init__(self):
        self.events, self.calls, self.revoked, self.fail_refresh = {}, [], [], False

    def __call__(self, method, url, body=None, token=None, form=False):
        self.calls.append((method, url))
        if url.endswith("/token"):
            if body.get("grant_type") == "authorization_code":
                return 200, {"access_token": "at1", "refresh_token": "rt-secreto", "expires_in": 3600, "scope": "https://www.googleapis.com/auth/calendar.app.created"}
            return (400, {"error": "invalid_grant"}) if self.fail_refresh else (200, {"access_token": "at2", "expires_in": 3600})
        if url.endswith("/revoke"):
            self.revoked.append(body["token"]); return 200, {}
        if url.endswith("/calendars"):
            return 200, {"id": "cal123@group.calendar.google.com"}
        eid = url.rsplit("/", 1)[-1]
        if method == "PUT":
            if eid not in self.events: return 404, {}
            self.events[eid] = body; return 200, body
        if method == "POST":
            self.events[body["id"]] = body; return 200, body
        if method == "DELETE":
            return (204, {}) if self.events.pop(eid, None) else (404, {})
        return 500, {}


def test_google_calendar_one_way_sync(monkeypatch):
    from urllib.parse import parse_qs, urlparse

    from app import gcal
    from app.db import GoogleLink
    g = FakeGoogle()
    monkeypatch.setattr(gcal, "http", g)
    monkeypatch.setattr(gcal, "CLIENT_ID", "cid"); monkeypatch.setattr(gcal, "CLIENT_SECRET", "sec"); monkeypatch.setattr(gcal, "BASE_URL", "https://historias.ejemplo.co")
    gcal._tokens.clear()
    make_user("gc@x.co"); make_user("otro2@x.co")
    c = client_for("gc@x.co")
    assert c.get("/api/google/status").json() == {"enabled": True, "connected": False, "detail": "iniciales", "last_sync": None, "last_error": "", "calendar": "Alter-Karute"}
    c.put("/api/records/p_1", json=patient("p_1", consents=consent()))
    appt = {"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": "2099-03-04T15:00:00.000Z", "duracion": 50, "modalidad": "Virtual", "estado": "Programada"}
    c.put("/api/records/a_1", json=appt)  # antes de conectar no pasa nada
    assert not g.events
    url = c.post("/api/google/connect", json={"detail": "iniciales"}).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["scope"] == ["https://www.googleapis.com/auth/calendar.app.created"] and q["redirect_uri"] == ["https://historias.ejemplo.co/api/google/callback"] and q["access_type"] == ["offline"]
    # Google vuelve sin cookie (SameSite=Strict); el usuario sale del state firmado
    r = anon().get("/api/google/callback", params={"state": q["state"][0], "code": "abc"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/app?google=ok"
    assert anon().get("/api/google/callback", params={"state": "falso", "code": "abc"}, follow_redirects=False).headers["location"] == "/app?google=error"
    with SessionLocal() as db:
        link = db.get(GoogleLink, 1)
        assert link.calendar_id.startswith("cal123") and b"rt-secreto" not in link.token  # permiso cifrado
    eid = gcal.event_id(1, "a_1")
    assert g.events[eid]["summary"] == "Cita · M.P." and g.events[eid]["location"] == "Virtual"  # sincronización inicial
    assert "María" not in str(g.events)
    # mover la cita, cambiar a nombre completo, cancelar y borrar
    c.put("/api/records/a_1", json={**appt, "startAt": "2099-03-05T16:00:00.000Z"})
    assert g.events[eid]["start"]["dateTime"].startswith("2099-03-05T16:00")
    assert c.post("/api/google/detail", json={"detail": "nombre"}).status_code == 200
    assert g.events[eid]["summary"] == "Cita · María Pérez"
    assert c.put("/api/records/p_1", json=patient("p_1", nombres="Marta")).status_code == 409  # el nombre no cambia
    assert g.events[eid]["summary"] == "Cita · María Pérez"
    c.put("/api/records/a_1", json={**appt, "estado": "Cancelada"})
    assert eid not in g.events
    c.put("/api/records/a_1", json=appt)
    assert eid in g.events  # al reactivarla vuelve
    c.delete("/api/records/a_1")
    assert eid not in g.events
    # permiso revocado en Google: se informa y no rompe el guardado
    gcal._tokens.clear(); g.fail_refresh = True
    assert c.put("/api/records/a_2", json={**appt, "id": "a_2"}).status_code in (200, 204)
    assert "reconecte" in c.get("/api/google/status").json()["last_error"]
    assert client_for("otro2@x.co").get("/api/google/status").json()["connected"] is False
    assert c.delete("/api/google").status_code == 204 and g.revoked == ["rt-secreto"]
    assert c.get("/api/google/status").json()["connected"] is False


def test_two_factor_authentication():
    import time as _t
    from urllib.parse import parse_qs, urlparse

    from app.security import _hotp, totp_at
    make_user("tf@x.co")
    c = client_for("tf@x.co")
    st0 = c.get("/api/auth/2fa").json()
    assert st0["enabled"] is False and st0["recovery_left"] == 0 and st0["devices"] == []
    st = c.post("/api/auth/2fa/setup").json()
    q = parse_qs(urlparse(st["uri"]).query)
    assert st["uri"].startswith("otpauth://totp/") and q["secret"] == [st["secret"]] and q["issuer"] == ["Alter-Karute"]
    sec = st["secret"]
    assert c.post("/api/auth/2fa/enable", json={"code": "000000" if totp_at(sec) != "000000" else "111111"}).status_code == 400
    codes = c.post("/api/auth/2fa/enable", json={"code": totp_at(sec)}).json()["recovery_codes"]
    assert len(codes) == 10 and c.get("/api/auth/me").json()["totp"] is True
    with SessionLocal() as db:
        u = db.scalar(select(main.User).where(main.User.email == "tf@x.co"))
        assert sec.encode() not in u.totp_secret and codes[0] not in (u.recovery_codes or "")  # secreto cifrado, códigos como hash
    # ingreso: la contraseña sola ya no abre sesión
    a = anon()
    r = a.post("/api/auth/login", json={"email": "tf@x.co", "password": PASSWORD}).json()
    assert r["need_2fa"] is True and "ac_session" not in a.cookies
    assert a.get("/api/auth/me").status_code == 401
    assert a.post("/api/auth/2fa/login", json={"ticket": "falso", "code": "123456"}).status_code == 401
    assert a.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": "000000" if totp_at(sec) != "000000" else "111111"}).status_code == 401
    # el código que se usó para activar no se puede reutilizar; uno del siguiente intervalo sí sirve
    nxt = _hotp(sec, int(_t.time() // 30) + 1)
    assert a.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": nxt}).status_code == 200
    assert a.get("/api/auth/me").status_code == 200
    b = anon()
    r2 = b.post("/api/auth/login", json={"email": "tf@x.co", "password": PASSWORD}).json()
    assert b.post("/api/auth/2fa/login", json={"ticket": r2["ticket"], "code": nxt}).status_code == 401  # ya usado
    # código de recuperación: sirve una sola vez
    assert b.post("/api/auth/2fa/login", json={"ticket": r2["ticket"], "code": codes[0].upper()}).status_code == 200
    d = anon(); r3 = d.post("/api/auth/login", json={"email": "tf@x.co", "password": PASSWORD}).json()
    assert d.post("/api/auth/2fa/login", json={"ticket": r3["ticket"], "code": codes[0]}).status_code == 401
    assert c.get("/api/auth/2fa").json()["recovery_left"] == 9
    # desactivar exige contraseña y código
    assert c.post("/api/auth/2fa/disable", json={"password": "mala-clave-123", "code": codes[1]}).status_code == 400
    assert c.post("/api/auth/2fa/disable", json={"password": PASSWORD, "code": codes[1]}).status_code == 204
    assert "need_2fa" not in anon().post("/api/auth/login", json={"email": "tf@x.co", "password": PASSWORD}).json()


def test_trusted_device_skips_code_until_unused():
    import time as _t
    from datetime import timedelta

    from app.db import TrustedDevice
    from app.security import _hotp, totp_at
    make_user("td@x.co")
    c = client_for("td@x.co")
    sec = c.post("/api/auth/2fa/setup").json()["secret"]
    rc = c.post("/api/auth/2fa/enable", json={"code": totp_at(sec)}).json()["recovery_codes"]
    step = int(_t.time() // 30)
    # sin «recordar»: el código se pide siempre
    a = anon()
    r = a.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()
    assert r["need_2fa"] is True and r["remember_days"] == 30
    assert a.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": _hotp(sec, step + 1)}).status_code == 200
    assert "ac_device" not in a.cookies
    assert a.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()["need_2fa"] is True
    # con «recordar»: el mismo navegador entra solo con la contraseña
    r = a.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()
    assert a.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": rc[0], "remember": True}).status_code == 200
    assert a.cookies.get("ac_device")
    a.post("/api/auth/logout")
    r = a.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()
    assert "need_2fa" not in r and a.get("/api/auth/me").status_code == 200
    assert len(c.get("/api/auth/2fa").json()["devices"]) == 1
    # la contraseña sigue siendo necesaria, y otro navegador sigue necesitando el código
    assert a.post("/api/auth/login", json={"email": "td@x.co", "password": "mala-clave-123"}).status_code == 401
    assert anon().post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()["need_2fa"] is True
    # la cookie no sirve para otra cuenta
    make_user("otra@x.co"); o = client_for("otra@x.co")
    sec2 = o.post("/api/auth/2fa/setup").json()["secret"]; o.post("/api/auth/2fa/enable", json={"code": totp_at(sec2)})
    assert a.post("/api/auth/login", json={"email": "otra@x.co", "password": PASSWORD}).json()["need_2fa"] is True
    # tras más de 30 días sin usar el dispositivo, se vuelve a pedir el código
    with SessionLocal() as db:
        d = db.scalar(select(TrustedDevice))
        d.last_used = d.last_used - timedelta(days=31)
        db.commit()
    assert a.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()["need_2fa"] is True
    with SessionLocal() as db:
        assert db.scalar(select(TrustedDevice)) is None
    # «olvidar dispositivos» y el cambio de contraseña lo anulan
    b = anon()
    r = b.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()
    assert b.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": rc[1], "remember": True}).status_code == 200
    assert c.post("/api/auth/2fa/devices/forget").json()["forgotten"] == 1
    assert b.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()["need_2fa"] is True
    r = b.post("/api/auth/login", json={"email": "td@x.co", "password": PASSWORD}).json()
    assert b.post("/api/auth/2fa/login", json={"ticket": r["ticket"], "code": rc[2], "remember": True}).status_code == 200
    assert c.post("/api/auth/password", json={"current": PASSWORD, "new": "otra-clave-segura-456"}).status_code == 204
    assert b.post("/api/auth/login", json={"email": "td@x.co", "password": "otra-clave-segura-456"}).json()["need_2fa"] is True


def test_admin_can_reset_two_factor():
    from app.security import totp_at
    make_user("adm@x.co", role="admin"); uid = make_user("u2@x.co")
    u = client_for("u2@x.co")
    sec = u.post("/api/auth/2fa/setup").json()["secret"]
    u.post("/api/auth/2fa/enable", json={"code": totp_at(sec)})
    adm = client_for("adm@x.co")
    assert [x for x in adm.get("/api/admin/users").json() if x["id"] == uid][0]["totp"] is True
    assert adm.patch(f"/api/admin/users/{uid}", json={"reset_2fa": True}).status_code == 200
    assert "need_2fa" not in anon().post("/api/auth/login", json={"email": "u2@x.co", "password": PASSWORD}).json()


def test_impressions_are_free_text():
    make_user("dx2@x.co")
    c = client_for("dx2@x.co")
    def put(pid, d):
        return c.put(f"/api/records/{pid}", json=patient(pid, intake={"motivo": "m", "signedAt": NOW, "addenda": [], "diagnosticos": d}))
    assert put("p_s1", [{"nombre": "Ansiedad ante exámenes"}]).status_code == 200
    assert put("p_s2", [{"nombre": "  "}]).status_code == 400
    assert put("p_s3", [{"nombre": "x"}] * 13).status_code == 400


def test_process_notes_are_private_and_editable():
    """Notas de proceso: el profesional las edita y borra; no son de la historia y el equipo no las ve."""
    from conftest import HEADERS as H, PASSWORD as PW
    make_user("pro@x.co", name="Pro")
    c = client_for("pro@x.co")
    c.put("/api/records/p_1", json=patient("p_1"))
    n = {"id": "pn_1", "kind": "pnote", "patientId": "p_1", "titulo": "Hipótesis", "tipo": "Hipótesis", "texto": "uno", "estado": "Abierta"}
    assert c.put("/api/records/pn_1", json=n).status_code in (200, 204)
    assert c.put("/api/records/pn_1", json={**n, "texto": "dos"}).status_code in (200, 204)  # se puede editar
    assert c.put("/api/records/pn_2", json={**n, "id": "pn_2", "patientId": None}).status_code in (200, 204)  # sin paciente
    assert c.put("/api/records/x_3", json={**n, "id": "x_3"}).status_code == 400
    recs = {r["id"]: r for r in c.get("/api/records").json()}
    assert recs["pn_1"]["texto"] == "dos"
    c.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis", "password": PW}, headers=H)
    s = client_for("secre@x.co")
    assert not any(r["kind"] == "pnote" for r in s.get("/api/records").json())
    assert s.put("/api/records/pn_9", json={**n, "id": "pn_9"}).status_code == 403
    assert s.delete("/api/records/pn_1").status_code == 403
    # no impiden borrar un paciente sin documentos, y se pueden borrar
    assert c.delete("/api/records/p_1").status_code == 204
    assert c.delete("/api/records/pn_1").status_code == 204


def test_consents_are_optional():
    make_user("opt@x.co")
    c = client_for("opt@x.co")
    c.put("/api/records/p_1", json=patient("p_1"))
    appt = {"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": "2099-03-04T15:00:00.000Z", "duracion": 50, "modalidad": "Virtual", "estado": "Programada"}
    assert c.put("/api/records/a_1", json=appt).status_code in (200, 204)
    rep = {"id": "r_1", "kind": "report", "patientId": "p_1", "tipo": "Constancia", "contenido": "x", "signedAt": NOW, "addenda": []}
    assert c.put("/api/records/r_1", json=rep).status_code in (200, 204)
    con = {"text": "t", "signerName": "Laura", "sinFirma2": "Padre fallecido", "signedAt": NOW}
    assert c.put("/api/records/p_1", json=patient("p_1", consents=[con])).status_code == 200


def test_custom_tab_text_and_tab_config_are_saved():
    make_user("tabs@x.co")
    c = client_for("tabs@x.co")
    c.put("/api/records/p_1", json=patient("p_1", extras={"x_a": "texto libre"}))
    p = next(x for x in c.get("/api/records").json() if x["id"] == "p_1")
    assert p["extras"] == {"x_a": "texto libre"}


def test_delete_patient_cascade():
    make_user("ana@x.co")
    make_user("beto@x.co")
    c = client_for("ana@x.co")
    o = client_for("beto@x.co")
    assert c.put("/api/records/p_1", json=patient("p_1")).status_code == 200
    assert o.put("/api/records/p_9", json=patient("p_9")).status_code == 200
    note = {"id": "n_1", "kind": "note", "patientId": "p_1", "tema": "x", "signedAt": NOW, "addenda": []}
    assert c.put("/api/records/n_1", json=note).status_code in (200, 204)
    assert c.delete("/api/records/p_1").status_code == 409  # el borrado suelto sigue protegido
    assert o.delete("/api/patients/p_1").status_code == 404  # otro usuario no puede
    assert c.delete("/api/patients/p_1").status_code == 204
    ids = {r["id"] for r in c.get("/api/records").json()}
    assert "p_1" not in ids and "n_1" not in ids
    assert any(r["id"] == "p_9" for r in o.get("/api/records").json())
    assert c.delete("/api/patients/p_1").status_code == 404
