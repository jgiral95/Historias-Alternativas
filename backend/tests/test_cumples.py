from datetime import date, datetime, timedelta, timezone

from app import cumples


def pac(nac, **kw):
    return {"kind": "patient", "nombres": "Ana", "apellidos": "Pérez", "nacimiento": nac, **kw}


def test_quienes_por_anticipacion():
    hoy = date(2026, 11, 17)
    ps = [pac("1990-11-20"), pac("2000-11-17"), pac("1985-12-25"), pac(""), pac("1990-11-20", demo=True), pac("1990-11-20", esGrupo=True)]
    assert [(n, c.isoformat(), a) for n, c, a in cumples.quienes(ps, hoy, 3)] == [("Ana Pérez", "2026-11-20", 36)]
    assert [a for _, _, a in cumples.quienes(ps, hoy, 0)] == [26]
    assert cumples.quienes(ps, hoy, 1) == []


def test_fin_de_año_y_29_de_febrero():
    assert cumples.proximo(date(1990, 1, 2), date(2026, 12, 30)) == date(2027, 1, 2)
    assert cumples.proximo(date(2000, 2, 29), date(2027, 2, 1)) == date(2027, 2, 28)
    assert cumples.proximo(date(2000, 2, 29), date(2028, 2, 1)) == date(2028, 2, 29)


def test_nacido_hoy_no_cumple_cero_años():
    assert cumples.quienes([pac("2026-11-17")], date(2026, 11, 17), 0) == []


def test_config():
    assert cumples.config({}) == {"activo": False, "dias": 1}
    assert cumples.config({"cumpleActivo": True, "cumpleDias": 7}) == {"activo": True, "dias": 7}
    assert cumples.config({"cumpleActivo": True, "cumpleDias": 9})["dias"] == 1


def test_no_envia_antes_de_las_7():
    assert cumples.due(1, datetime(2026, 11, 17, 10, 0, tzinfo=timezone.utc)) == 0  # 5 a. m. en Colombia


def test_aviso_diario_al_terapeuta(monkeypatch):
    from app import survey
    from conftest import client_for, consent, make_user, patient
    uid = make_user("cumple@x.co")
    c = client_for("cumple@x.co")
    ahora = datetime.now(timezone.utc).astimezone(cumples.TZ).replace(hour=9)
    objetivo = ahora.date() + timedelta(days=2)
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "correo": "ana@terapia.co", "cumpleActivo": True, "cumpleDias": 2})
    c.put("/api/records/p_1", json=patient("p_1", nombres="Luis", apellidos="Mora", nacimiento=objetivo.replace(year=objetivo.year - 30).isoformat(), consents=consent()))
    c.put("/api/records/p_2", json=patient("p_2", nombres="Otro", apellidos="Día", nacimiento=(objetivo + timedelta(days=1)).replace(year=1990).isoformat(), consents=consent()))
    sent = []
    monkeypatch.setattr(survey, "account", lambda db, u: {"host": "h", "from": "karute@x.co", "base": "https://h.co"})
    monkeypatch.setattr(cumples, "send_mail", lambda to, dias, lista, prof, acc: sent.append((to, dias, [n for n, _, _ in lista])))
    assert cumples.due(uid, ahora) == 1
    assert sent == [("ana@terapia.co", 2, ["Luis Mora"])]
    assert cumples.due(uid, ahora) == 0  # un solo correo al día
    c.put("/api/records/profile", json={"id": "profile", "kind": "profile", "nombre": "Ana Ruiz", "cumpleActivo": False})
    assert cumples.due(uid, ahora + timedelta(days=1)) == 0


def test_correo_en_ingles():
    from email.message import EmailMessage
    from app import correo
    captured = []

    class S:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def send_message(self, m): captured.append(m)
    from app import survey
    orig = survey.smtp_open
    survey.smtp_open = lambda acc: S()
    try:
        cumples.send_mail("a@b.co", 3, [("Luis Mora", date(2026, 11, 20), 36)], {"idioma": "en"}, {"from": "x@y.co"})
    finally:
        survey.smtp_open = orig
    m = captured[0]
    assert "in 3 days" in m["Subject"] and "Birthdays to celebrate" in m["Subject"]
    assert "November 20 · turns 36" in m.get_body(("plain",)).get_content()
