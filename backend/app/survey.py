"""Encuestas de satisfacción: sorteo periódico de consultantes, envío del enlace y respuestas anónimas.

Cada terapeuta configura su encuesta en su perfil (registro «profile», campo «encuesta»):
  activa, cadaDias, cantidad, intro, preguntas, incluirAnteriores.
Cada sorteo elige al azar, entre los consultantes atendidos en el periodo, a quienes no se invitó
en los últimos SURVEY_MIN_GAP_DAYS días, no pidieron la baja y autorizaron el tratamiento de datos.
Las respuestas se guardan sin el consultante ni la invitación: el terapeuta ve resultados agregados."""
import hashlib
import json
import random
import re
import secrets
import smtplib
import threading
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr

from sqlalchemy import select

from .config import (PUBLIC_URL, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER,
                     SURVEY_DAYS_OPEN, SURVEY_MIN_GAP_DAYS)
from .db import MailAccount, Record, SessionLocal, SurveyInvite, SurveyOptOut, SurveyState, User
from .security import decrypt, encrypt

DATA_TIPO = "Autorización de uso de datos personales"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Tipos de respuesta: opciones con su puntaje. «texto» es una respuesta abierta, sin puntaje.
TYPES = {
    "escala": [["Excelente", 4], ["Bueno", 3], ["Regular", 2], ["Malo", 1]],
    "dias": [["1 a 3 días", 5], ["4 a 7 días", 4], ["8 a 15 días", 3], ["16 a 30 días", 2], ["Más de 30 días", 1]],
    "sino": [["Sí", 1], ["No", 0]],
    "recomienda": [["Definitivamente sí", 4], ["Probablemente sí", 3], ["Probablemente no", 2], ["Definitivamente no", 1]],
    "texto": [],
}

# Preguntas sugeridas: las del formato del consultorio y una dimensión sobre el terapeuta.
DEFAULT_QUESTIONS = [
    {"id": "op1", "dim": "Oportunidad de consulta", "texto": "Cuando solicitó su cita, se la asignaron en:", "tipo": "dias"},
    {"id": "op2", "dim": "Oportunidad de consulta", "texto": "La hora en que le asignaron su cita coincidió con el momento de la atención", "tipo": "sino"},
    {"id": "pf1", "dim": "Planta física", "texto": "¿Cómo encontró el estado de aseo del consultorio?", "tipo": "escala"},
    {"id": "pf2", "dim": "Planta física", "texto": "¿Cómo califica las comodidades del consultorio?", "tipo": "escala"},
    {"id": "pf3", "dim": "Planta física", "texto": "¿Cómo califica el ambiente de las instalaciones?", "tipo": "escala"},
    {"id": "at1", "dim": "Atención", "texto": "El trato que recibió en la recepción o al agendar fue:", "tipo": "escala"},
    {"id": "cp1", "dim": "Características del terapeuta", "texto": "La puntualidad del terapeuta al iniciar las sesiones fue:", "tipo": "escala"},
    {"id": "cp2", "dim": "Características del terapeuta", "texto": "La forma en que el terapeuta escuchó lo que usted quería expresar fue:", "tipo": "escala"},
    {"id": "cp3", "dim": "Características del terapeuta", "texto": "La claridad con que le explicó su proceso y las actividades propuestas fue:", "tipo": "escala"},
    {"id": "cp4", "dim": "Características del terapeuta", "texto": "El respeto y el trato digno que recibió del terapeuta fueron:", "tipo": "escala"},
    {"id": "cp5", "dim": "Características del terapeuta", "texto": "La confianza y la confidencialidad que le transmitió el terapeuta fueron:", "tipo": "escala"},
    {"id": "cp6", "dim": "Características del terapeuta", "texto": "La información que recibió sobre sus derechos, deberes y el consentimiento informado fue:", "tipo": "escala"},
    {"id": "cp7", "dim": "Características del terapeuta", "texto": "La utilidad de las sesiones para su situación ha sido:", "tipo": "escala"},
    {"id": "eg1", "dim": "Experiencia general", "texto": "En general, ¿cómo califica su experiencia con el servicio?", "tipo": "escala"},
    {"id": "eg2", "dim": "Experiencia general", "texto": "¿Recomendaría este servicio a sus familiares y amigos?", "tipo": "recomienda"},
    {"id": "com", "dim": "Comentarios", "texto": "¿Qué podríamos mejorar? (opcional)", "tipo": "texto"},
]
DEFAULT_INTRO = "Queremos conocer su opinión sobre la atención que recibió. Son unos 2 minutos y sus respuestas se guardan sin su nombre."

_draw_lock = threading.Lock()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# Servidores de correo conocidos, según el dominio del correo del terapeuta.
PRESETS = {
    ("gmail.com", "googlemail.com"): ("smtp.gmail.com", 587),
    ("outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.es", "hotmail.es", "live.com.mx"): ("smtp-mail.outlook.com", 587),
    ("yahoo.com", "yahoo.es", "ymail.com", "yahoo.com.co"): ("smtp.mail.yahoo.com", 465),
    ("icloud.com", "me.com", "mac.com"): ("smtp.mail.me.com", 587),
    ("zoho.com",): ("smtp.zoho.com", 465),
}


def preset(email: str):
    dom = email.rsplit("@", 1)[-1].lower()
    return next((v for k, v in PRESETS.items() if dom in k), None)


def server_account() -> dict | None:
    """Correo general del servidor (opcional; solo si el administrador lo configuró en el .env)."""
    if SMTP_HOST and SMTP_FROM:
        return {"host": SMTP_HOST, "port": SMTP_PORT, "user": SMTP_USER, "password": SMTP_PASSWORD, "from": SMTP_FROM,
                "base": PUBLIC_URL, "propio": False}
    return None


def account(db, user_id: int) -> dict | None:
    """Correo con el que se envían las encuestas de esta cuenta: el propio del terapeuta o, si no, el del servidor."""
    row = db.get(MailAccount, user_id)
    if row:
        return {**decrypt(row.payload), "propio": True}
    return server_account()


def smtp_enabled(acc: dict | None) -> bool:
    return bool(acc and acc.get("host") and acc.get("from") and (acc.get("base") or PUBLIC_URL))


def smtp_open(acc: dict):
    port = int(acc.get("port") or 587)
    if port == 465:
        s = smtplib.SMTP_SSL(acc["host"], port, timeout=20)
    else:
        s = smtplib.SMTP(acc["host"], port, timeout=20)
        s.starttls()
    if acc.get("user"):
        s.login(acc["user"], acc.get("password") or "")
    return s


def check_login(acc: dict) -> None:
    """Comprueba que el servidor de correo acepta el usuario y la contraseña. Se reemplaza en las pruebas."""
    with smtp_open(acc):
        pass


def clean_questions(qs) -> list[dict]:
    """Preguntas válidas de la configuración del terapeuta (o las sugeridas)."""
    out, seen = [], set()
    for q in qs if isinstance(qs, list) else []:
        if not isinstance(q, dict):
            continue
        qid, tipo = str(q.get("id") or "")[:20], q.get("tipo")
        texto, dim = str(q.get("texto") or "").strip()[:300], str(q.get("dim") or "").strip()[:80]
        if not re.match(r"^[A-Za-z0-9_-]{1,20}$", qid) or qid in seen or tipo not in TYPES or not texto:
            continue
        seen.add(qid)
        out.append({"id": qid, "dim": dim or "General", "texto": texto, "tipo": tipo})
    return out[:40] or [dict(q) for q in DEFAULT_QUESTIONS]


def config(profile: dict) -> dict:
    c = profile.get("encuesta") if isinstance(profile.get("encuesta"), dict) else {}
    try:
        every = min(365, max(7, int(c.get("cadaDias") or 30)))
        count = min(50, max(1, int(c.get("cantidad") or 3)))
    except (TypeError, ValueError):
        every, count = 30, 3
    return {"activa": bool(c.get("activa")), "cadaDias": every, "cantidad": count,
            "intro": str(c.get("intro") or DEFAULT_INTRO)[:600], "preguntas": clean_questions(c.get("preguntas")),
            "incluirAnteriores": bool(c.get("incluirAnteriores"))}


def _records(db, user_id: int) -> list[dict]:
    return [decrypt(r.payload) for r in db.scalars(select(Record).where(Record.user_id == user_id))]


def _parse(ts) -> datetime | None:
    try:
        return aware(datetime.fromisoformat(str(ts).replace("Z", "+00:00")))
    except ValueError:
        return None


def authorized(p: dict, include_old: bool) -> bool:
    """Autorización de datos vigente que (salvo que el terapeuta diga lo contrario) mencione las encuestas."""
    for c in p.get("consents") or []:
        if c.get("tipo") == DATA_TIPO and not c.get("revocacion"):
            if include_old or "encuesta" in str(c.get("text") or c.get("texto") or "").lower():
                return True
    return False


def eligible(db, user_id: int, now: datetime, cfg: dict, recs: list[dict] | None = None) -> list[dict]:
    recs = recs if recs is not None else _records(db, user_id)
    since = now - timedelta(days=cfg["cadaDias"])
    attended = set()
    for r in recs:
        if r.get("kind") == "note" and r.get("signedAt"):
            t = _parse(r.get("sessionAt"))
            if t and since <= t <= now:
                attended.add(r.get("patientId"))
        if r.get("kind") == "patient":
            t = _parse(((r.get("intake") or {}).get("sessionAt"))) if (r.get("intake") or {}).get("signedAt") else None
            if t and since <= t <= now:
                attended.add(r.get("id"))
    gap = now - timedelta(days=SURVEY_MIN_GAP_DAYS)
    recent = {i.patient_id for i in db.scalars(select(SurveyInvite).where(SurveyInvite.user_id == user_id))
              if aware(i.created_at) >= gap}
    out_ = {o.patient_id for o in db.scalars(select(SurveyOptOut).where(SurveyOptOut.user_id == user_id))}
    return [p for p in recs if p.get("kind") == "patient" and not p.get("demo") and p.get("id") in attended and p["id"] not in recent
            and p["id"] not in out_ and authorized(p, cfg["incluirAnteriores"])]


def draw(user_id: int, force: bool = False, now: datetime | None = None) -> int:
    """Sortea y crea invitaciones si toca (o si force). Devuelve cuántas creó. Envía los correos después."""
    now = now or utcnow()
    to_send = []
    with _draw_lock, SessionLocal() as db:
        recs = _records(db, user_id)
        prof = next((r for r in recs if r.get("kind") == "profile"), {})
        cfg = config(prof)
        if not cfg["activa"]:
            return 0
        st = db.get(SurveyState, user_id)
        if not force and st and aware(st.last_draw) > now - timedelta(days=cfg["cadaDias"]):
            return 0
        acc = account(db, user_id)
        pool = eligible(db, user_id, now, cfg, recs)
        chosen = random.SystemRandom().sample(pool, min(cfg["cantidad"], len(pool)))
        for p in chosen:
            token = secrets.token_urlsafe(24)
            mail = str(p.get("correo") or "").strip()
            channel = "correo" if smtp_enabled(acc) and EMAIL_RE.match(mail) else "manual"
            inv = SurveyInvite(id=token_hash(token), user_id=user_id, patient_id=p["id"], created_at=now,
                               expires_at=now + timedelta(days=SURVEY_DAYS_OPEN), channel=channel,
                               payload=encrypt({"token": token, "preguntas": cfg["preguntas"], "intro": cfg["intro"],
                                                "profesional": prof.get("nombre") or "", "consultorio": prof.get("consultorio") or "",
                                                "correoProfesional": prof.get("correo") or ""}))
            db.add(inv)
            if channel == "correo":
                to_send.append((inv.id, token, mail, p, prof))
        if st:
            st.last_draw = now
        else:
            db.add(SurveyState(user_id=user_id, last_draw=now))
        db.commit()
    for inv_id, token, mail, p, prof in to_send:
        err = None
        try:
            send_mail(mail, token, p, prof, acc)
        except Exception as e:  # noqa: BLE001 — se registra y queda para envío manual
            err = (type(e).__name__ + ": " + str(e))[:200]
        with SessionLocal() as db:
            inv = db.get(SurveyInvite, inv_id)
            if inv:
                if err:
                    inv.channel, inv.error = "manual", err
                else:
                    inv.sent_at = utcnow()
                db.commit()
    return len(chosen)


def link(token: str, base: str = "") -> str:
    return (PUBLIC_URL or base or "") + "/encuesta?t=" + token


def message(to: str, token: str, p: dict, prof: dict, acc: dict | None = None) -> EmailMessage:
    acc = acc or {}
    who = prof.get("nombre") or "Su terapeuta(a)"
    place = prof.get("consultorio") or who
    first = str(p.get("nombres") or "").split(" ")[0]
    url = link(token, acc.get("base") or "")
    out = url + "&baja=1"
    m = EmailMessage()
    m["Subject"] = f"¿Cómo le pareció la atención en {place}?"
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from") or SMTP_FROM)) if acc.get("propio") else (acc.get("from") or SMTP_FROM)
    m["To"] = to
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply and EMAIL_RE.match(reply):
        m["Reply-To"] = reply
    m.set_content(
        f"Hola{(' ' + first) if first else ''}:\n\n{who} le invita a responder una encuesta corta sobre la atención que recibió. "
        f"Toma unos 2 minutos y sus respuestas se guardan sin su nombre.\n\n{url}\n\n"
        f"El enlace estará abierto {SURVEY_DAYS_OPEN} días. Responder es voluntario.\n"
        f"Si no desea recibir más encuestas: {out}\n\nGracias por su tiempo.\n")
    return m


def send_verify(to: str, name: str, url: str, acc: dict) -> None:
    """Correo con el enlace para activar una cuenta nueva. Se reemplaza en las pruebas."""
    m = EmailMessage()
    m["Subject"] = "Bienvenido(a) a Alter-Karute: confirme su correo para activar su cuenta"
    m["From"] = formataddr(("Alter-Karute", acc.get("from") or SMTP_FROM))
    m["To"] = to
    nombre = (name or "").strip()
    m.set_content(
        f"Bienvenido(a) a Alter-Karute{(', ' + nombre) if nombre else ''}.\n\n"
        f"Para activar su cuenta, confirme su correo con este enlace (vigente durante 24 horas):\n\n{url}\n\n"
        "Si usted no solicitó esta cuenta, ignore este mensaje: no se creará ningún registro.\n\nAtentamente,\nAlter-Karute\n")
    with smtp_open(acc) as s:
        s.send_message(m)


def send_mail(to: str, token: str, p: dict, prof: dict, acc: dict | None) -> None:
    """Envía el correo con el enlace desde el correo de la cuenta. Se reemplaza en las pruebas."""
    m = message(to, token, p, prof, acc)
    with smtp_open(acc) as s:
        s.send_message(m)


def validate_answers(questions: list[dict], body) -> dict:
    """Respuestas: índice de opción para las preguntas con opciones (obligatorias) y texto para las abiertas."""
    if not isinstance(body, dict):
        raise ValueError("Respuestas no válidas")
    out = {}
    for q in questions:
        v = body.get(q["id"])
        if q["tipo"] == "texto":
            if v not in (None, ""):
                out[q["id"]] = str(v).strip()[:1500]
            continue
        if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v < len(TYPES[q["tipo"]]):
            raise ValueError("Responda todas las preguntas con opciones")
        out[q["id"]] = v
    return out


def run_all() -> None:
    with SessionLocal() as db:
        ids = [u.id for u in db.scalars(select(User).where(User.active.is_(True)))]
    for uid in ids:
        try:
            draw(uid)
        except Exception:  # noqa: BLE001 — un error de una cuenta no detiene a las demás
            pass


_stop = threading.Event()


def start_scheduler(every_seconds: int = 900) -> None:
    """Cada 15 minutos: recordatorios de citas; el sorteo de encuestas respeta su propia frecuencia."""
    def loop():
        from . import reminders  # importación tardía: reminders usa este módulo
        _stop.wait(60)
        while not _stop.is_set():
            for job in (reminders.run_all, run_all):
                try:
                    job()
                except Exception:  # noqa: BLE001
                    pass
            _stop.wait(every_seconds)
    threading.Thread(target=loop, name="sorteo-encuestas", daemon=True).start()


def stop_scheduler() -> None:
    _stop.set()
