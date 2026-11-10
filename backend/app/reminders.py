"""Recordatorios de citas.

Cada terapeuta los activa (perfil → «recordatorios»: activo, horas antes). El servidor revisa cada
15 minutos las citas programadas que empiezan dentro de ese plazo y, si el consultante tiene correo y el
terapeuta configuró su correo de envío, le envía un recordatorio con un enlace para confirmar o
cancelar. Las demás quedan para enviar a mano (WhatsApp o copiar el mensaje) desde Pendientes.
El mensaje no lleva información de las sesiones: solo fecha, hora, modalidad y el nombre del terapeuta."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from zoneinfo import ZoneInfo

from sqlalchemy import select

from . import correo, survey
from .config import PUBLIC_URL
from .db import ApptReminder, Record, SessionLocal, User
from .security import decrypt, encrypt

TZ = ZoneInfo("America/Bogota")
HOURS = (2, 12, 24, 48)
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def token_hash(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def parse(ts) -> datetime | None:
    try:
        d = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def when_text(start: datetime) -> str:
    d = start.astimezone(TZ)
    h = d.strftime("%I:%M").lstrip("0") + (" a. m." if d.hour < 12 else " p. m.")
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]} a las {h}"


def config(profile: dict) -> dict:
    c = profile.get("recordatorios") if isinstance(profile.get("recordatorios"), dict) else {}
    h = c.get("horas") if c.get("horas") in HOURS else 24
    return {"activo": bool(c.get("activo")), "horas": h, "nota": str(c.get("nota") or "")[:300]}


def make(db, owner: int, appt: dict, channel: str) -> tuple[ApptReminder, str]:
    """Crea (o reutiliza) el enlace de confirmación de una cita."""
    for r in db.scalars(select(ApptReminder).where(ApptReminder.user_id == owner, ApptReminder.appt_id == appt["id"])):
        return r, decrypt(r.payload)["token"]
    token = secrets.token_urlsafe(24)
    r = ApptReminder(id=token_hash(token), user_id=owner, appt_id=appt["id"], channel=channel, payload=encrypt({"token": token}))
    db.add(r)
    return r, token


def link(token: str, base: str = "") -> str:
    return (PUBLIC_URL or base or "") + "/cita?t=" + token


def text(p: dict, a: dict, prof: dict, url: str, nota: str = "") -> str:
    first = str(p.get("nombres") or "").split(" ")[0]
    who = prof.get("nombre") or "su terapeuta"
    start = parse(a.get("startAt"))
    mod = a.get("modalidad") or "Presencial"
    return (f"Hola{(' ' + first) if first else ''}, le recordamos su cita con {who} el {when_text(start)} ({mod.lower()}). "
            + (nota + " " if nota else "") + f"Por favor confirme o avísenos si no puede asistir: {url}")


def send_mail(to: str, body: str, prof: dict, acc: dict) -> None:
    """Envía el recordatorio desde el correo del terapeuta. Se reemplaza en las pruebas."""
    m = EmailMessage()
    place = prof.get("consultorio") or prof.get("nombre") or "su consulta"
    m["Subject"] = f"Recordatorio de su cita — {place}"
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    m["To"] = to
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body + "\n\nEste es un mensaje automático de recordatorio.\n")
    antes, url, despues = correo.separar_enlace(body)
    correo.agregar(m, correo.layout("Recordatorio de su cita", [antes, despues], boton=("Confirmar o cancelar mi cita", url) if url else None,
                                    firma=("Atentamente,", prof.get("nombre") or place)))
    with survey.smtp_open(acc) as s:
        s.send_message(m)


def due(user_id: int, now: datetime | None = None) -> int:
    """Envía por correo los recordatorios que tocan. Devuelve cuántos envió."""
    now = now or utcnow()
    jobs = []
    with SessionLocal() as db:
        recs = [decrypt(r.payload) for r in db.scalars(select(Record).where(Record.user_id == user_id, Record.kind.in_(("profile", "patient", "appt"))))]
        prof = next((r for r in recs if r.get("kind") == "profile"), {})
        cfg = config(prof)
        if not cfg["activo"]:
            return 0
        acc = survey.account(db, user_id)
        if not survey.smtp_enabled(acc):
            return 0
        pats = {r["id"]: r for r in recs if r.get("kind") == "patient"}
        done = {r.appt_id for r in db.scalars(select(ApptReminder).where(ApptReminder.user_id == user_id)) if r.sent_at or r.error}
        for a in recs:
            if a.get("kind") != "appt" or a.get("estado", "Programada") != "Programada" or a["id"] in done:
                continue
            start = parse(a.get("startAt"))
            if not start or not (now < start <= now + timedelta(hours=cfg["horas"])):
                continue
            p = pats.get(a.get("patientId")) or {}
            if p.get("demo") or a.get("demo"):
                continue  # datos de ejemplo: nunca se envía nada
            mail = str(p.get("correo") or "").strip()
            if not survey.EMAIL_RE.match(mail):
                continue  # sin correo: queda para WhatsApp desde Pendientes
            r, token = make(db, user_id, a, "correo")
            r.channel = "correo"
            jobs.append((r.id, mail, text(p, a, prof, link(token, acc.get("base") or ""), cfg["nota"])))
        db.commit()
    n = 0
    for rid, mail, body in jobs:
        err = None
        try:
            send_mail(mail, body, prof, acc)
            n += 1
        except Exception as e:  # noqa: BLE001 — queda el error y el recordatorio pasa a envío manual
            err = (type(e).__name__ + ": " + str(e))[:200]
        with SessionLocal() as db:
            r = db.get(ApptReminder, rid)
            if r:
                if err:
                    r.channel, r.error = "manual", err
                else:
                    r.sent_at = utcnow()
                db.commit()
    return n


def run_all() -> None:
    with SessionLocal() as db:
        ids = [u.id for u in db.scalars(select(User).where(User.active.is_(True), User.owner_id.is_(None)))]
    for uid in ids:
        try:
            due(uid)
        except Exception:  # noqa: BLE001
            pass
