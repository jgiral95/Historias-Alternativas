from datetime import datetime, timezone

from conftest import HEADERS, PASSWORD, anon, client_for, consent, make_user, patient

NOW = datetime.now(timezone.utc).isoformat()


def test_identity_is_immutable_and_changes_are_logged():
    make_user("pro@x.co", name="Ana Profesional")
    c = client_for("pro@x.co")
    p = patient("p_1", tipoDoc="CC", documento="123", nacimiento="1990-01-02", telefono="300")
    r = c.put("/api/records/p_1", json=p).json()
    assert r["abiertaEl"] and r["cambios"][0]["creado"] and r["cambios"][0]["por"] == "Ana Profesional"
    for k, v in (("nombres", "Otra"), ("documento", "999"), ("nacimiento", "1991-01-01"), ("tipoDoc", "CE")):
        assert c.put("/api/records/p_1", json={**p, k: v}).status_code == 409
    # un dato de identidad vacío se puede llenar una vez
    assert c.put("/api/records/p_1", json={**p, "paisNac": "Colombia"}).status_code == 200
    assert c.put("/api/records/p_1", json={**p, "paisNac": "Perú"}).status_code == 409
    # los demás datos cambian y queda el registro: quién, cuándo, antes y después
    r = c.put("/api/records/p_1", json={**p, "paisNac": "Colombia", "telefono": "301", "ciudad": "Bogotá"}).json()
    last = r["cambios"][-1]
    assert last["por"] == "Ana Profesional" and last["rol"] == "Terapeuta" and last["at"]
    assert {(x["campo"], x["antes"], x["despues"]) for x in last["campos"]} == {("telefono", "300", "301"), ("ciudad", None, "Bogotá")}
    # el navegador no puede reescribir el registro ni la fecha de apertura
    fake = c.put("/api/records/p_1", json={**p, "paisNac": "Colombia", "telefono": "301", "ciudad": "Bogotá", "cambios": [], "abiertaEl": "2000-01-01"}).json()
    assert fake["abiertaEl"] == r["abiertaEl"] and len(fake["cambios"]) == len(r["cambios"])
    # guardar sin cambios no agrega entradas
    assert len(c.put("/api/records/p_1", json={**p, "paisNac": "Colombia", "telefono": "301", "ciudad": "Bogotá"}).json()["cambios"]) == len(r["cambios"])


def test_opening_date_of_existing_history_comes_from_oldest_document():
    make_user("pro@x.co")
    c = client_for("pro@x.co")
    from app.db import Record, SessionLocal
    from app.security import encrypt
    with SessionLocal() as db:  # historia creada antes de existir la fecha de apertura
        db.add(Record(user_id=1, id="p_old", kind="patient", patient_id="p_old",
                      payload=encrypt(patient("p_old", consents=[{"tipo": "x", "text": "t", "signedAt": "2025-03-04T10:00:00+00:00"}]))))
        db.commit()
    old = next(r for r in c.get("/api/records").json() if r["id"] == "p_old")
    r = c.put("/api/records/p_old", json={**old, "telefono": "1"}).json()
    assert r["abiertaEl"].startswith("2025-03-04")


def test_team_accounts_only_see_patient_data_and_agenda():
    make_user("pro@x.co", name="Ana Profesional")
    pro = client_for("pro@x.co")
    pro.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana", "consultorio": "C", "frases": [{"a": "x", "t": "y"}],
                                          "formatos": {"datos": [["Extra", [["xc1", "Campo", 1]]]]}})
    pro.put("/api/records/p_1", json=patient("p_1", telefono="300", consents=[{"tipo": "x", "text": "secreto", "signedAt": NOW}],
                                              intake={"motivo": "secreto clínico", "signedAt": NOW, "addenda": []}))
    pro.put("/api/records/n_1", json={"id": "n_1", "kind": "note", "patientId": "p_1", "tema": "secreto", "signedAt": NOW, "addenda": []})
    pro.put("/api/records/a_1", json={"id": "a_1", "kind": "appt", "patientId": "p_1", "startAt": NOW, "duracion": 50, "estado": "Programada"})
    # el profesional crea la subcuenta
    assert pro.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis Secretario", "password": "corta"}, headers=HEADERS).status_code == 400
    t = pro.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis Secretario", "password": PASSWORD}, headers=HEADERS)
    assert t.status_code == 201 and t.json()["role"] == "asistente"
    s = client_for("secre@x.co")
    me = s.get("/api/auth/me").json()
    assert me["role"] == "asistente" and me["ownerName"] == "Ana Profesional"
    recs = s.get("/api/records").json()
    assert {r["kind"] for r in recs} == {"profile", "patient", "appt"}
    assert "secreto" not in str(recs) and "frases" not in str(recs)
    assert next(r for r in recs if r["kind"] == "profile")["formatos"]["datos"]  # campos propios de los datos
    # edita datos y agenda; lo clínico se conserva intacto y el cambio queda con su nombre
    pat = next(r for r in recs if r["kind"] == "patient")
    r = s.put("/api/records/p_1", json={**pat, "telefono": "311", "consents": [], "intake": {"motivo": "cambiado"}})
    assert r.status_code == 200 and r.json()["cambios"][-1]["por"] == "Luis Secretario" and r.json()["cambios"][-1]["rol"] == "Equipo"
    full = next(x for x in pro.get("/api/records").json() if x["id"] == "p_1")
    assert full["telefono"] == "311" and full["intake"]["motivo"] == "secreto clínico" and len(full["consents"]) == 1
    assert s.put("/api/records/p_2", json=patient("p_2", nombres="Nuevo")).status_code == 200  # crea pacientes
    assert pat["consentAgenda"] == {"presencial": True, "distancia": False}  # solo el resumen, sin el texto
    a2 = {"id": "a_2", "kind": "appt", "patientId": "p_2", "startAt": NOW, "duracion": 50, "estado": "Programada"}
    p2 = next(x for x in pro.get("/api/records").json() if x["id"] == "p_2")
    pro.put("/api/records/p_2", json={**p2, "consents": consent("Atención presencial")})
    assert s.put("/api/records/a_2", json=a2).status_code in (200, 204)
    assert s.delete("/api/records/a_2", headers=HEADERS).status_code == 204
    # nada clínico ni de configuración
    assert s.put("/api/records/n_2", json={"id": "n_2", "kind": "note", "patientId": "p_1", "tema": "x", "signedAt": NOW, "addenda": []}).status_code == 403
    assert s.put("/api/records/profile", json={"id": "profile", "kind": "profile"}).status_code == 403
    assert s.delete("/api/records/p_2", headers=HEADERS).status_code == 403
    for url in ("/api/encuestas", "/api/blobs/f_1", "/api/google/status", "/api/equipo", "/api/correo"):
        assert s.get(url).status_code == 403, url
    # el profesional desactiva la subcuenta
    uid = t.json()["id"]
    assert pro.patch(f"/api/equipo/{uid}", json={"active": False}, headers=HEADERS).status_code == 200
    assert s.get("/api/records").status_code == 401
    # otro profesional no puede tocar esa subcuenta
    make_user("otro@x.co")
    assert client_for("otro@x.co").patch(f"/api/equipo/{uid}", json={"active": True}, headers=HEADERS).status_code == 404
    assert anon().get("/api/equipo").status_code == 401


SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_change_log_carries_signature_and_professional_card():
    make_user("pro@x.co", name="Ana")
    pro = client_for("pro@x.co")
    pro.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana María Ruiz", "registro": "TP-777", "cedula": "52123456", "firma": SIG})
    p = patient("p_1", telefono="1")
    r = pro.put("/api/records/p_1", json=p).json()
    first = r["cambios"][0]
    assert first["por"] == "Ana María Ruiz" and first["tp"] == "TP-777" and first["cc"] == "52123456" and r["firmasCambios"][first["firma"]] == SIG
    for i in range(3):  # la misma firma se guarda una sola vez
        r = pro.put("/api/records/p_1", json={**p, "telefono": str(i + 2)}).json()
    assert len(r["firmasCambios"]) == 1 and all(e["firma"] == first["firma"] for e in r["cambios"])
    # equipo: documento y firma propios, sin tarjeta profesional
    pro.post("/api/equipo", json={"email": "s@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    s = client_for("s@x.co")
    assert s.get("/api/auth/me").json()["tieneFirma"] is False
    assert s.put("/api/equipo/mi-perfil", json={"documento": "1010", "firma": "javascript:alert(1)"}, headers=HEADERS).status_code == 400
    sig2 = SIG.replace("Ug", "Uh")
    assert s.put("/api/equipo/mi-perfil", json={"documento": "1010", "firma": sig2}, headers=HEADERS).status_code == 200
    assert s.get("/api/auth/me").json()["tieneFirma"] is True and s.get("/api/equipo/mi-perfil").json()["documento"] == "1010"
    assert pro.get("/api/equipo/mi-perfil").status_code == 403
    pat = next(x for x in s.get("/api/records").json() if x["id"] == "p_1")
    r = s.put("/api/records/p_1", json={**pat, "ciudad": "Cali"}).json()
    last = r["cambios"][-1]
    assert last["rol"] == "Equipo" and last["cc"] == "1010" and "tp" not in last and r["firmasCambios"][last["firma"]] == sig2
    assert len(r["firmasCambios"]) == 2


def test_first_login_requires_own_password():
    """Las cuentas que crea otra persona (o con contraseña restablecida) deben elegir su contraseña al entrar."""
    make_user("admin@x.co", role="admin")
    adm = client_for("admin@x.co")
    assert adm.post("/api/admin/users", json={"email": "nuevo@x.co", "name": "Nuevo", "password": PASSWORD, "role": "user"}).status_code in (200, 201)
    n = client_for("nuevo@x.co", keep_first=True)
    me = n.get("/api/auth/me").json()
    assert me["cambiarClave"] is True
    r = n.get("/api/records")
    assert r.status_code == 403 and "contraseña" in r.json()["detail"]
    assert n.post("/api/auth/password", json={"current": PASSWORD, "new": PASSWORD}).status_code == 400  # debe ser otra
    assert n.post("/api/auth/password", json={"current": PASSWORD, "new": "mi-clave-propia-2026"}).status_code == 204
    assert n.get("/api/auth/me").json()["cambiarClave"] is False and n.get("/api/records").status_code == 200
    # al restablecerla el administrador, vuelve a pedirla
    uid = me["id"]
    adm.patch(f"/api/admin/users/{uid}", json={"password": "otra-clave-temporal-1"})
    n2 = client_for("nuevo@x.co", password="otra-clave-temporal-1", keep_first=True)
    assert n2.get("/api/auth/me").json()["cambiarClave"] is True
    # las cuentas de equipo también
    make_user("pro@x.co")
    pro = client_for("pro@x.co")
    pro.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    assert client_for("secre@x.co", keep_first=True).get("/api/auth/me").json()["cambiarClave"] is True
    # quien se registra con su propia contraseña (creada por consola) no
    assert pro.get("/api/auth/me").json()["cambiarClave"] is False


def test_team_is_limited_to_two_helpers():
    make_user("pro@x.co")
    c = client_for("pro@x.co")
    for i in range(2):
        assert c.post("/api/equipo", json={"email": f"a{i}@x.co", "name": "Ayuda", "password": PASSWORD}, headers=HEADERS).status_code == 201
    r = c.post("/api/equipo", json={"email": "a3@x.co", "name": "Ayuda", "password": PASSWORD}, headers=HEADERS)
    assert r.status_code == 400 and "Máximo 2" in r.json()["detail"]


def test_admin_resumen_counts():
    from conftest import make_user, client_for
    make_user("adm@x.co", role="admin")
    make_user("t1@x.co")
    c = client_for("adm@x.co")
    r = c.get("/api/admin/resumen").json()
    assert r["terapeutas"] == 2 and r["equipo"] == 0 and r["activas"] == 2 and r["sinSuscripcion"] >= 0
    assert set(r) >= {"conSuscripcion", "vencidas", "nunca", "consultantes", "dosPasos", "nuevos"}
    assert client_for("t1@x.co").get("/api/admin/resumen").status_code == 403
