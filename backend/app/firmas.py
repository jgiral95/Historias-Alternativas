"""Firma de consentimientos a distancia (teleterapia).

El terapeuta prepara el consentimiento y envía al consultante un enlace personal. Para abrirlo, el consultante
escribe su número de documento; lee el texto completo, marca que lo acepta y firma con el dedo. La hora de
la firma la pone el servidor y el documento queda agregado a la historia, igual de inmutable que los demás.
Como evidencia se guardan la hora de envío y de firma, la dirección IP, el navegador y la huella SHA-256 del texto."""
import hashlib
import re
import secrets
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr

from . import correo, survey
from .config import PUBLIC_URL

DAYS = 7
MAX_ATTEMPTS = 5
SIGNER_TYPES = ("Consultante", "Paciente", "Acudiente")  # «Paciente»: registros anteriores


def token_hash(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(24)


def ttl() -> timedelta:
    return timedelta(days=DAYS)


def norm_doc(v) -> str:
    """Documento comparable: sin puntos, espacios ni guiones, en mayúsculas."""
    return re.sub(r"[^0-9A-Za-z]", "", str(v or "")).upper()


def text_hash(text: str) -> str:
    return hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()


def link(token: str, base: str = "") -> str:
    return (PUBLIC_URL or base or "") + "/firmar?t=" + token


def message(p: dict, prof: dict, tipo: str, url: str) -> str:
    first = str(p.get("nombres") or "").split(" ")[0]
    who = prof.get("nombre") or "su terapeuta"
    return (f"Hola{(' ' + first) if first else ''}, {who} le envía el documento «{tipo}» para que lo lea y lo firme desde su celular: {url} "
            f"Para abrirlo se le pedirá su número de documento. El enlace vence en {DAYS} días.")


def send_mail(to: str, body: str, prof: dict, acc: dict) -> None:
    """Envía el enlace desde el correo del terapeuta. Se reemplaza en las pruebas."""
    m = EmailMessage()
    place = prof.get("consultorio") or prof.get("nombre") or "su consulta"
    m["Subject"] = f"Consentimiento para firmar — {place}"
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    m["To"] = to
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body + "\n\nSi no esperaba este mensaje, ignórelo o comuníquese con el consultorio.\n")
    antes, url, despues = correo.separar_enlace(body)
    correo.agregar(m, correo.layout("Tiene un documento para firmar", [antes, despues], boton=("Leer y firmar el documento", url) if url else None,
                                    notas=["Si no esperaba este mensaje, ignórelo o comuníquese con el consultorio."], firma=("Atentamente,", prof.get("nombre") or place)), prof.get("idioma"))
    with survey.smtp_open(acc) as s:
        s.send_message(m)
