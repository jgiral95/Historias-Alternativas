"""Correos en inglés: traducción de líneas, asunto, texto plano y HTML."""
from datetime import datetime, timezone
from email.message import EmailMessage

from app import booking, correo, traduccion


def test_tr_lineas_y_patrones():
    assert traduccion.tr("¡Lo esperamos!", "en") == "We look forward to seeing you!"
    assert traduccion.tr("¡Lo esperamos!", "es") == "¡Lo esperamos!"
    assert traduccion.tr("Hola, Luis. Ya reservamos su espacio con Ana. Estos son los datos de su cita:", "en") == "Hello, Luis. We've reserved your spot with Ana. Here are your appointment details:"
    assert traduccion.tr("martes 4 de noviembre a las 3:00 p. m.", "en") == "Tuesday, November 4 at 3:00 p. m."
    assert traduccion.tr("texto sin traducción", "en") == "texto sin traducción"


def test_correo_de_cita_en_ingles():
    prof = {"nombre": "Ana", "consultorio": "Casa Luz", "idioma": "en"}
    start = datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc)
    (to, subj, txt, html), _ = booking.messages(prof, start, 50, "Virtual", "Luis G.", "luis@mail.co", "ana@x.co", None, "http://x/cita?t=1", "", "")
    m = EmailMessage()
    m["Subject"], m["To"] = subj, to
    m.set_content(txt)
    correo.agregar(m, html, "en")
    assert m["Subject"].startswith("Your appointment is confirmed!")
    body = m.get_body(("plain",)).get_content()
    assert "Your appointment is confirmed" in body and "Su cita" not in body
    h = m.get_body(("html",)).get_content()
    assert 'lang="en"' in h and "We look forward" not in h or "Something came up?" in h
    assert "Kind regards" in h
