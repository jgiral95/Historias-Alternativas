"""Aviso por correo al terapeuta: cumpleaños de sus consultantes.

Se activa en «Mi perfil» (`cumpleActivo`) con los días de anticipación (`cumpleDias`). Un solo correo al día, con los consultantes
que cumplen años justo dentro de esos días, enviado a la dirección del propio terapeuta. El aviso del día se anota en la bitácora
(`Audit`, acción `cumple.aviso`) para no repetirlo, aunque el servidor se reinicie."""
from datetime import date, datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr
from zoneinfo import ZoneInfo

from sqlalchemy import select

from . import correo, survey
from .db import Audit, Record, SessionLocal, User
from .security import decrypt

TZ = ZoneInfo("America/Bogota")
DIAS = (0, 1, 2, 3, 5, 7, 14)
HORA_ENVIO = 7  # no antes de las 7 a. m. (hora de Colombia)
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def config(profile: dict) -> dict:
    d = profile.get("cumpleDias")
    return {"activo": bool(profile.get("cumpleActivo")), "dias": d if d in DIAS else 1}


def proximo(nac: date, hoy: date) -> date:
    """Próximo cumpleaños desde hoy (el 29 de febrero se celebra el 28 en años no bisiestos)."""
    for y in (hoy.year, hoy.year + 1):
        try:
            c = nac.replace(year=y)
        except ValueError:
            c = date(y, 2, 28)
        if c >= hoy:
            return c
    return nac


def quienes(pacientes: list[dict], hoy: date, dias: int) -> list[tuple[str, date, int]]:
    out = []
    for p in pacientes:
        if p.get("demo") or p.get("esGrupo"):
            continue
        try:
            nac = date.fromisoformat(str(p.get("nacimiento") or "")[:10])
        except ValueError:
            continue
        c = proximo(nac, hoy)
        if (c - hoy).days == dias and c.year - nac.year > 0:
            nombre = " ".join(x for x in (p.get("nombres"), p.get("apellidos")) if x).strip() or "Consultante"
            out.append((nombre, c, c.year - nac.year))
    return sorted(out, key=lambda t: t[0].lower())


def send_mail(to: str, dias: int, lista: list[tuple[str, date, int]], prof: dict, acc: dict) -> None:
    """Envía el aviso. Se reemplaza en las pruebas."""
    cuando = "hoy" if dias == 0 else "mañana" if dias == 1 else f"en {dias} días"
    intro = "Hoy cumplen años estas personas que acompañas." if dias == 0 else "Cumplen años mañana estas personas que acompañas." if dias == 1 \
        else f"Cumplen años en {dias} días estas personas que acompañas."
    cierre = "Un saludo o un mensaje cálido de tu parte puede significar mucho para ellas."
    m = EmailMessage()
    m["Subject"] = "🎂 ¡Hay cumpleaños para celebrar! — " + cuando
    m["From"] = formataddr(("Alter-Karute", acc.get("from")))
    m["To"] = to
    filas = [("🎂 " + n, f"{c.day} de {MESES[c.month - 1]} · cumple {a} años") for n, c, a in lista]
    m.set_content("\n".join(["¡Hay cumpleaños para celebrar!", intro, "", *[f"- {n}: {t}" for n, t in filas], "", cierre, "¡Que sea un lindo día!"]) + "\n")
    correo.agregar(m, correo.layout("¡Hay cumpleaños para celebrar! 🎉", [intro, cierre], filas=filas, cierre=["¡Que sea un lindo día!"],
                                    notas=["Puedes cambiar o apagar este aviso en Mi perfil."]), prof.get("idioma"))
    with survey.smtp_open(acc) as s:
        s.send_message(m)


def due(user_id: int, now: datetime | None = None) -> int:
    """Envía el aviso del día si toca. Devuelve cuántos consultantes incluyó."""
    now = (now or datetime.now(timezone.utc)).astimezone(TZ)
    if now.hour < HORA_ENVIO:
        return 0
    hoy = now.date().isoformat()
    with SessionLocal() as db:
        recs = [decrypt(r.payload) for r in db.scalars(select(Record).where(Record.user_id == user_id, Record.kind.in_(("profile", "patient"))))]
        prof = next((r for r in recs if r.get("kind") == "profile"), {})
        cfg = config(prof)
        if not cfg["activo"]:
            return 0
        acc = survey.account(db, user_id)
        user = db.get(User, user_id)
        to = str(prof.get("correo") or "").strip() or (user.email if user else "")
        if not survey.smtp_enabled(acc) or not survey.EMAIL_RE.match(to):
            return 0
        lista = quienes([r for r in recs if r.get("kind") == "patient"], now.date(), cfg["dias"])
        if not lista or db.scalar(select(Audit.id).where(Audit.user_id == user_id, Audit.action == "cumple.aviso", Audit.detail == hoy).limit(1)):
            return 0
        db.add(Audit(user_id=user_id, action="cumple.aviso", detail=hoy))  # el día queda marcado: un solo correo al día
        db.commit()
    try:
        send_mail(to, cfg["dias"], lista, prof, acc)
    except Exception:  # noqa: BLE001 — no se reintenta hasta mañana
        return 0
    return len(lista)


def run_all() -> None:
    with SessionLocal() as db:
        ids = [u.id for u in db.scalars(select(User).where(User.active.is_(True), User.owner_id.is_(None)))]
    for uid in ids:
        try:
            due(uid)
        except Exception:  # noqa: BLE001
            pass
