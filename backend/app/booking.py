"""Reservas por enlace público: horario del profesional, huecos libres y correos de confirmación.

El consultante nuevo no se crea en la lista de consultantes: la cita guarda sus datos de contacto («nuevo») y el
profesional decide si abre su ficha. El consultante existente se identifica con documento y correo."""
import re
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from . import correo, reminders, survey


TZ = ZoneInfo("America/Bogota")
MODS = ("Presencial", "Virtual", "Telefónica")
HM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEFAULT = {"dias": {}, "duracion": 60, "descanso": 0, "aviso": 12, "cancelacion": 0, "horizonte": 30, "modalidades": ["Presencial"]}


def ranges(v) -> list:
    """Franjas de un día: [[«HH:MM», «HH:MM»], …]. Acepta el formato anterior, una sola franja [«HH:MM», «HH:MM»]."""
    return [v] if isinstance(v, (list, tuple)) and v and isinstance(v[0], str) else list(v or [])


def _franjas(rs) -> list:
    """Valida y ordena las franjas de un día (hasta 6, sin cruces)."""
    ok = 1 <= len(rs) <= 6 and all(isinstance(r, (list, tuple)) and len(r) == 2 and all(isinstance(x, str) and HM.match(x) for x in r) and r[0] < r[1] for r in rs)
    rs = sorted([list(r) for r in rs]) if ok else rs
    if not ok or any(rs[i][1] > rs[i + 1][0] for i in range(len(rs) - 1)):
        raise ValueError("El horario de atención no es válido: revise que las franjas de un mismo día no se crucen")
    return rs


def fechas_clean(f) -> dict:
    """Horario por fecha: {«AAAA-MM-DD»: {"modalidades": […], "franjas": [[«HH:MM», «HH:MM»], …]}}. Las fechas pasadas se descartan."""
    if not isinstance(f, dict) or len(f) > 400:
        raise ValueError("El calendario de atención no es válido")
    hoy, out = datetime.now(TZ).date().isoformat(), {}
    for k, v in f.items():
        if not (isinstance(k, str) and DATE_RE.match(k)) or not isinstance(v, dict):
            raise ValueError("El calendario de atención no es válido")
        try:
            date.fromisoformat(k)
        except ValueError:
            raise ValueError("El calendario de atención no es válido")
        raw = v.get("modalidades") if isinstance(v.get("modalidades"), list) else [v.get("modalidad")]  # «modalidad» (una sola) es el formato anterior
        if not raw or any(m not in MODS for m in raw):
            raise ValueError("Elija al menos un tipo de consulta para cada día (presencial, virtual o telefónica)")
        if k >= hoy:
            out[k] = {"modalidades": [m for m in MODS if m in raw], "franjas": _franjas(ranges(v.get("franjas")))}
    return out


def clean(c: dict) -> dict:
    """Valida el horario. Nuevo: fechas = {«AAAA-MM-DD»: {modalidad, franjas}}. Anterior: dias = {«0» (lunes) … «6»: [[«HH:MM» inicio, «HH:MM» fin], …]} (hasta 6 franjas por día)."""
    dias = {}
    for k, v in (c.get("dias") or {}).items():
        if not (k in "0123456" and len(k) == 1):
            raise ValueError("El horario de atención no es válido: revise que las franjas de un mismo día no se crucen")
        dias[k] = _franjas(ranges(v))
    fechas = fechas_clean(c["fechas"]) if c.get("fechas") is not None else None
    dur, aviso, hor = c.get("duracion"), c.get("aviso"), c.get("horizonte")
    if not (isinstance(dur, int) and 15 <= dur <= 180 and isinstance(aviso, int) and 0 <= aviso <= 168 and isinstance(hor, int) and 1 <= hor <= 60):
        raise ValueError("Duración, anticipación o plazo no válidos")
    cancel = c.get("cancelacion") or 0  # horas mínimas de anticipación para que el paciente cancele (0: sin límite)
    if not (isinstance(cancel, int) and 0 <= cancel <= 168):
        raise ValueError("La anticipación para cancelar debe estar entre 0 y 168 horas")
    desc = c.get("descanso") or 0
    if not (isinstance(desc, int) and 0 <= desc <= 120):
        raise ValueError("El descanso entre citas debe estar entre 0 y 120 minutos")
    if fechas is not None:  # la modalidad sale de cada día
        mods = [m for m in MODS if any(m in v["modalidades"] for v in fechas.values())] or ["Presencial"]
    else:
        mods = [m for m in MODS if m in (c.get("modalidades") or [])]
        if not mods:
            raise ValueError("Elija al menos una modalidad")
    out = {"dias": dias, "duracion": dur, "descanso": desc, "aviso": aviso, "cancelacion": cancel, "horizonte": hor, "modalidades": mods}
    if fechas is not None:
        out["fechas"] = fechas
    return out


def modalidades_por_dia(cfg: dict) -> dict[str, list[str]]:
    """AAAA-MM-DD → tipos de consulta de ese día (vacío con el horario semanal anterior)."""
    return {k: [m for m in MODS if m in (v.get("modalidades") or [v.get("modalidad")])] for k, v in (cfg.get("fechas") or {}).items()}


def modalidad_ok(cfg: dict, dia: str, mod: str) -> bool:
    """Con calendario por fechas la modalidad debe ser una de las marcadas ese día; con el horario semanal anterior, cualquiera de las habilitadas."""
    return mod in cfg["modalidades"] if cfg.get("fechas") is None else mod in modalidades_por_dia(cfg).get(dia, [])


def slots(cfg: dict, busy: list[tuple[datetime, datetime]], now: datetime | None = None) -> dict[str, list[str]]:
    """Huecos libres por fecha local (AAAA-MM-DD → [«HH:MM»]); descarta los ocupados y los que no cumplen la anticipación."""
    now = now or datetime.now(timezone.utc)
    first, dur, gap = now.astimezone(TZ).date(), timedelta(minutes=cfg["duracion"]), timedelta(minutes=cfg.get("descanso") or 0)  # gap: descanso reservado tras cada cita
    out: dict[str, list[str]] = {}
    for i in range(cfg["horizonte"] + 1):
        day = first + timedelta(days=i)
        free = []
        fechas = cfg.get("fechas")  # None = horario semanal anterior
        for a, b in ranges((fechas.get(day.isoformat()) or {}).get("franjas") if fechas is not None else cfg["dias"].get(str(day.weekday()))):
            t = datetime.combine(day, datetime.strptime(a, "%H:%M").time(), TZ)
            end = datetime.combine(day, datetime.strptime(b, "%H:%M").time(), TZ)
            while t + dur <= end:
                if t >= now + timedelta(hours=cfg["aviso"]) and not any(b0 - gap < t + dur and b1 + gap > t for b0, b1 in busy):
                    free.append(t.strftime("%H:%M"))
                t += dur + gap
        if free:
            out[day.isoformat()] = free
    return out


def busy_of(appts: list[dict]) -> list[tuple[datetime, datetime]]:
    out = []
    for a in appts:
        s = reminders.parse(a.get("startAt"))
        if s and not str(a.get("estado") or "Programada").startswith("Cancelada"):
            out.append((s, s + timedelta(minutes=int(a.get("duracion") or 50))))
    return out


def send_mail(to: str, subject: str, body: str, prof: dict, acc: dict, html: str | None = None) -> None:
    """Envía desde el correo de la cuenta (texto y, si hay, versión con el logo de Alter-Karute). Se reemplaza en las pruebas."""
    m = EmailMessage()
    m["Subject"], m["To"] = subject, to
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body)
    if html:
        correo.agregar(m, html, prof.get("idioma"))
    with survey.smtp_open(acc) as s:
        s.send_message(m)


def gcal_link(start: datetime, dur: int, ter: str, mod: str, place: str, meet: str = "") -> str:
    """Enlace «Agregar a Google Calendar» (plantilla de evento)."""
    f = lambda d: d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    q = {"action": "TEMPLATE", "text": f"Cita con {ter}", "dates": f"{f(start)}/{f(start + timedelta(minutes=dur))}",
         "details": (f"Cita de {mod.lower()} con {ter}." if mod else f"Cita con {ter}.") + (f" Videollamada: {meet}" if meet else "")}
    if place and mod != "Virtual":
        q["location"] = place
    return "https://calendar.google.com/calendar/render?" + urlencode(q)


def enlace_ok(enlace: str) -> str:
    return enlace if re.match(r"^https?://\S{4,500}$", enlace or "") else ""


def messages(prof: dict, start: datetime, dur: int, mod: str, who: str, patient_mail: str, therapist_mail: str, nuevo: dict | None, url: str = "", otra_hora: str = "", enlace: str = "") -> list[tuple[str, str, str, str]]:
    """(destinatario, asunto, texto, html) de la confirmación al consultante y del aviso al profesional."""
    cuando = reminders.when_text(start)
    ter = prof.get("nombre") or "su terapeuta"
    place = prof.get("consultorio") or prof.get("nombre") or "su consulta"
    first = who.split(" ")[0]
    filas = [("Cuándo", cuando), ("Modalidad", f"{mod} · {dur} min"), ("Con", ter + (f" · {prof['consultorio']}" if prof.get("consultorio") and prof["consultorio"].strip().lower() != ter.strip().lower() else ""))]
    meet = enlace_ok(enlace)
    cal = gcal_link(start, dur, ter, mod, prof.get("consultorio") or "", meet)
    cierre = "¿Tuvo un imprevisto? Puede ver o cancelar su cita en cualquier momento con este botón." if url else "¡Lo esperamos!"
    otro = ("Si prefiere otra hora, cancele la cita y", "elija un nuevo horario", otra_hora) if url and otra_hora else None
    txt = (f"¡Hola, {first}!\n\nSu cita está confirmada. Ya reservamos su espacio con {ter}.\n\n" + "\n".join(f"{k}: {v}" for k, v in filas)
           + f"\n\n{cierre}" + (f"\n\nEntrar a la videollamada: {meet}" if meet else "")
           + f"\n\nAgregar la cita a su Google Calendar: {cal}" + (f"\nVer o cancelar mi cita: {url}" if url else "")
           + (f"\nSi prefiere otra hora, cancele la cita y elija un nuevo horario: {otra_hora}" if otro else "")
           + f"\n\nAtentamente,\n{ter}\n\nMensaje automático enviado con Alter-Karute.\n")
    if meet:
        b1, b2 = ("Entrar a la videollamada", meet), ("Agregar a Google Calendar", cal)
        nts = [otro] + ([("Para ver o cancelar su cita,", "haga clic aquí", url)] if url else [])
    else:
        b1, b2 = ("Agregar a Google Calendar", cal), (("Ver o cancelar mi cita", url) if url else None)
        nts = [otro]
    nts = [n for n in nts if n]
    html = correo.layout("¡Su cita está confirmada!", [f"Hola, {first}. Ya reservamos su espacio con {ter}. Estos son los datos de su cita:"], filas, [cierre], b1, nts, ("Atentamente,", ter), boton2=b2)
    t_filas = [("Consultante", who + (" (nuevo)" if nuevo else "")), ("Cuándo", cuando), ("Modalidad", f"{mod} · {dur} min"), ("Correo", patient_mail)]
    if nuevo:
        t_filas.append(("Teléfono", nuevo.get("telefono") or ""))
    t_cierre = "Es un consultante nuevo: todavía no tiene ficha en la app. Cuando quiera, créela y vincule la cita desde su agenda." if nuevo else "La cita ya está en su agenda."
    t_txt = "Tiene una nueva cita agendada por su enlace.\n\n" + "\n".join(f"{k}: {v}" for k, v in t_filas) + f"\n\n{t_cierre}\n\nMensaje automático enviado con Alter-Karute.\n"
    t_html = correo.layout("Nueva cita agendada", [f"{first} acaba de agendar una cita por su enlace de reservas."], t_filas, [t_cierre], firma=("Que tenga un buen día,", "El equipo de Alter-Karute"))
    return [(patient_mail, f"¡Su cita está confirmada! — {place}", txt, html), (therapist_mail, f"Nueva cita agendada: {who}", t_txt, t_html)]


def notify(prof: dict, acc: dict, start: datetime, dur: int, mod: str, who: str, patient_mail: str, therapist_mail: str, nuevo: dict | None, url: str = "", otra_hora: str = "", enlace: str = "") -> None:
    """Envía la confirmación y el aviso. Un fallo no afecta el otro envío."""
    for to, subj, txt, html in messages(prof, start, dur, mod, who, patient_mail, therapist_mail, nuevo, url, otra_hora, enlace):
        if not to:
            continue
        try:
            send_mail(to, subj, txt, prof, acc, html)
        except Exception:  # noqa: BLE001 — la cita ya quedó guardada
            pass
