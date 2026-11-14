"""Recordatorios de citas.

Cada terapeuta los activa (perfil → «recordatorios»: activo, horas antes). El servidor revisa cada
15 minutos las citas programadas que empiezan dentro de ese plazo y, si el consultante tiene correo y el
terapeuta configuró tu correo de envío, le envía un recordatorio con un enlace para confirmar o
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


UNIDADES = {"horas": timedelta(hours=1), "días": timedelta(days=1), "semanas": timedelta(weeks=1), "meses": timedelta(days=30)}
MAX_RECS = 10


def appt_rec(a: dict) -> list[timedelta] | None:
    """Recordatorios propios de la cita: lista de «tanto tiempo antes» (cantidad + unidad), de mayor a menor.
    También entiende el formato anterior (dias + frec)."""
    r = a.get("rec")
    if not isinstance(r, dict) or not r.get("activo"):
        return None
    offs = []
    if isinstance(r.get("items"), list):
        for it in r["items"][:MAX_RECS]:
            try:
                n, u = int(it.get("n")), UNIDADES.get(it.get("u"))
            except (TypeError, ValueError, AttributeError):
                continue
            if u and 1 <= n <= 999:
                offs.append(n * u)
    else:  # formato anterior
        try:
            dias = max(1, min(30, int(r.get("dias"))))
        except (TypeError, ValueError):
            dias = 1
        frec = r.get("frec") if r.get("frec") in (1, 2, 3, 7) else 0
        offs = [timedelta(days=d) for d in (range(dias, 0, -frec) if frec else [dias])]
    return sorted(set(offs), reverse=True) or None


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
    who = prof.get("nombre") or "tu terapeuta"
    start = parse(a.get("startAt"))
    mod = a.get("modalidad") or "Presencial"
    return (f"Hola{(' ' + first) if first else ''}, le recordamos tu cita con {who} el {when_text(start)} ({mod.lower()}). "
            + (nota + " " if nota else "") + f"Por favor confirma o avísenos si no puedes asistir: {url}")


def send_mail(to: str, body: str, prof: dict, acc: dict) -> None:
    """Envía el recordatorio desde el correo del terapeuta. Se reemplaza en las pruebas."""
    m = EmailMessage()
    place = prof.get("consultorio") or prof.get("nombre") or "tu consulta"
    m["Subject"] = f"Recordatorio de tu cita — {place}"
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    m["To"] = to
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body + "\n\nEste es un mensaje automático de recordatorio.\n")
    antes, url, despues = correo.separar_enlace(body)
    correo.agregar(m, correo.layout("Recordatorio de tu cita", [antes, despues], boton=("Confirmar o cancelar mi cita", url) if url else None,
                                    firma=("Atentamente,", prof.get("nombre") or place)), prof.get("idioma"))
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
        if not cfg["activo"] and not any(r.get("kind") == "appt" and appt_rec(r) for r in recs):
            return 0
        acc = survey.account(db, user_id)
        if not survey.smtp_enabled(acc):
            return 0
        pats = {r["id"]: r for r in recs if r.get("kind") == "patient"}
        rows = list(db.scalars(select(ApptReminder).where(ApptReminder.user_id == user_id)))
        done = {r.appt_id for r in rows if r.sent_at or r.error}
        errored = {r.appt_id for r in rows if r.error}
        sent = {r.appt_id: set(decrypt(r.payload).get("sent") or []) for r in rows}
        for a in recs:
            if a.get("kind") != "appt" or a.get("evento") or a.get("estado", "Programada") != "Programada":
                continue
            rec = appt_rec(a)
            start = parse(a.get("startAt"))
            mark = None
            if rec:  # recordatorios propios: cada uno sale al llegar su momento (si ya pasaron varios, solo el último)
                if not start or now >= start or a["id"] in errored:
                    continue
                passed = [i for i, off in enumerate(rec) if start - off <= now]
                if not [i for i in passed if i not in sent.get(a["id"], set())]:
                    continue
                mark = passed
            elif not cfg["activo"] or a["id"] in done or not start or not (now < start <= now + timedelta(hours=cfg["horas"])):
                continue
            p = pats.get(a.get("patientId")) or a.get("nuevo") or {}
            if p.get("demo") or a.get("demo"):
                continue  # datos de ejemplo: nunca se envía nada
            mail = str(p.get("correo") or "").strip()
            if not survey.EMAIL_RE.match(mail):
                continue  # sin correo: queda para WhatsApp desde Pendientes
            r, token = make(db, user_id, a, "correo")
            r.channel = "correo"
            jobs.append((r.id, mail, text(p, a, prof, link(token, acc.get("base") or ""), cfg["nota"]), mark))
        db.commit()
    n = 0
    for rid, mail, body, mark in jobs:
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
                    if mark is not None:
                        d = decrypt(r.payload)
                        d["sent"] = sorted(set(d.get("sent") or []) | set(mark))
                        r.payload = encrypt(d)
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
