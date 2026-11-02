"""Comentarios de la versión beta: cada usuario envía y ve los suyos; el administrador los gestiona y los exporta."""
import io
import zipfile

from conftest import HEADERS, PASSWORD, client_for, make_user

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_feedback_flow():
    make_user("admin@x.co", name="Juan Admin", role="admin")
    make_user("ana@x.co", name="Ana Ruiz")
    make_user("otro@x.co", name="Otro")
    a, adm, o = client_for("ana@x.co"), client_for("admin@x.co"), client_for("otro@x.co")
    assert a.get("/api/auth/me").json()["comentarios"] is True
    assert a.post("/api/comentarios", json={"tema": "Inventado", "texto": "x"}).status_code == 400
    assert a.post("/api/comentarios", json={"tema": "Evolución", "tipo": "Error", "texto": "  "}).status_code == 400
    assert a.post("/api/comentarios", json={"tema": "Evolución", "tipo": "Error", "texto": "x", "imagen": "data:text/html;base64,AAAA"}).status_code == 400
    r = a.post("/api/comentarios", json={"tema": "Evolución", "tipo": "Error", "texto": "No guarda la nota\nsi cierro rápido",
                                         "contexto": {"vista": "Pacientes", "pestaña": "Evolución", "pantalla": "390x844"}, "imagen": PNG})
    assert r.status_code == 201
    fid = r.json()["id"]
    a.post("/api/comentarios", json={"tema": "Agenda y calendario", "tipo": "Sugerencia", "texto": "Vista de día más grande"})
    mine = a.get("/api/comentarios").json()
    assert len(mine["items"]) == 2 and "Evolución" in mine["temas"] and "contexto" not in mine["items"][0]
    assert o.get("/api/comentarios").json()["items"] == []
    assert o.get(f"/api/comentarios/{fid}/captura").status_code == 404  # no es suyo
    assert a.get(f"/api/comentarios/{fid}/captura").headers["content-type"] == "image/png"
    # solo el administrador gestiona
    assert a.get("/api/admin/comentarios").status_code == 403
    allc = adm.get("/api/admin/comentarios").json()["items"]
    ev = next(x for x in allc if x["id"] == fid)
    assert ev["autor"] == "Ana Ruiz" and ev["contexto"]["pestaña"] == "Evolución" and ev["captura"]
    assert adm.patch(f"/api/admin/comentarios/{fid}", json={"estado": "Raro"}).status_code == 400
    assert adm.patch(f"/api/admin/comentarios/{fid}", json={"estado": "En revisión", "respuesta": "Gracias, lo reviso"}).json()["estado"] == "En revisión"
    assert a.get("/api/comentarios").json()["items"][1]["respuesta"] == "Gracias, lo reviso"
    # exportación para Claude
    z = zipfile.ZipFile(io.BytesIO(adm.get("/api/admin/comentarios/exportar").content))
    md = z.read("comentarios.md").decode()
    assert f"capturas/comentario-{fid}.png" in z.namelist()
    assert "## Evolución (1)" in md and "> No guarda la nota\n> si cierro rápido" in md and "pestaña: Evolución" in md and "Para Claude" in md
    txt = adm.get("/api/admin/comentarios/texto").json()
    assert txt["cantidad"] == 2 and "Vista de día más grande" in txt["texto"]
    adm.patch(f"/api/admin/comentarios/{fid}", json={"estado": "Resuelto"})
    assert adm.get("/api/admin/comentarios/texto").json()["cantidad"] == 1  # solo abiertos
    assert adm.get("/api/admin/comentarios/texto?abiertos=0").json()["cantidad"] == 2


def test_team_can_comment():
    make_user("pro@x.co", name="Pro")
    pro = client_for("pro@x.co")
    pro.post("/api/equipo", json={"email": "secre@x.co", "name": "Luis", "password": PASSWORD}, headers=HEADERS)
    s = client_for("secre@x.co")
    assert s.post("/api/comentarios", json={"tema": "Agenda y calendario", "tipo": "Duda", "texto": "¿Cómo muevo una cita?"}).status_code == 201
