"""Reservas por enlace público: horario del profesional, huecos libres y correos de confirmación.

El consultante nuevo no se crea en la lista de consultantes: la cita guarda tus datos de contacto («nuevo») y el
profesional decide si abre tu ficha. El consultante existente se identifica con documento y correo."""
import hashlib
import os
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


def _aviso_falla(que: str, e: Exception) -> None:
    """Un correo que no sale no debe tumbar la acción, pero queda en el registro (sin direcciones ni datos)."""
    import logging
    logging.getLogger("uvicorn.error").warning("No se pudo enviar %s (%s)", que, type(e).__name__)


def ranges(v) -> list:
    """Franjas de un día: [[«HH:MM», «HH:MM»], …]. Acepta el formato anterior, una sola franja [«HH:MM», «HH:MM»]."""
    return [v] if isinstance(v, (list, tuple)) and v and isinstance(v[0], str) else list(v or [])


def _franjas(rs) -> list:
    """Valida y ordena las franjas de un día (hasta 6, sin cruces)."""
    ok = 1 <= len(rs) <= 6 and all(isinstance(r, (list, tuple)) and len(r) == 2 and all(isinstance(x, str) and HM.match(x) for x in r) and r[0] < r[1] for r in rs)
    rs = sorted([list(r) for r in rs]) if ok else rs
    if not ok or any(rs[i][1] > rs[i + 1][0] for i in range(len(rs) - 1)):
        raise ValueError("El horario de atención no es válido: revisa que las franjas de un mismo día no se crucen")
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
            raise ValueError("Elige al menos un tipo de consulta para cada día (presencial, virtual o telefónica)")
        if k >= hoy:
            out[k] = {"modalidades": [m for m in MODS if m in raw], "franjas": _franjas(ranges(v.get("franjas")))}
    return out


def clean(c: dict) -> dict:
    """Valida el horario. Nuevo: fechas = {«AAAA-MM-DD»: {modalidad, franjas}}. Anterior: dias = {«0» (lunes) … «6»: [[«HH:MM» inicio, «HH:MM» fin], …]} (hasta 6 franjas por día)."""
    dias = {}
    for k, v in (c.get("dias") or {}).items():
        if not (k in "0123456" and len(k) == 1):
            raise ValueError("El horario de atención no es válido: revisa que las franjas de un mismo día no se crucen")
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
            raise ValueError("Elige al menos una modalidad")
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


def send_mail(to: str, subject: str, body: str, prof: dict, acc: dict, html: str | None = None, ics: str | None = None) -> None:
    """Envía desde el correo de la cuenta (texto y, si hay, versión con el logo de Alter-Karute; `ics`: invitación de calendario adjunta). Se reemplaza en las pruebas."""
    m = EmailMessage()
    m["Subject"], m["To"] = subject, to
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body)
    if html:
        correo.agregar(m, html, prof.get("idioma"))
    if ics:
        m.add_attachment(ics.encode("utf-8"), maintype="text", subtype="calendar", filename="invitacion.ics", params={"method": "PUBLISH"})
    with survey.smtp_open(acc) as s:
        s.send_message(m)


# Videollamada de las reuniones informativas (cuentas admin). Se define en el servidor con REUNION_ZOOM_URL; sin ella, la reunión sale sin enlace.
REUNION_URL = os.environ.get("REUNION_ZOOM_URL", "")


def gcal_link(start: datetime, dur: int, ter: str, mod: str, place: str, meet: str = "", reunion: bool = False) -> str:
    """Enlace «Agregar a Google Calendar» (plantilla de evento)."""
    f = lambda d: d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    q = {"action": "TEMPLATE", "text": "Reunión informativa de Alter-Karute" if reunion else f"Cita con {ter}", "dates": f"{f(start)}/{f(start + timedelta(minutes=dur))}",
         "details": (f"Reunión informativa con {ter}." if reunion else f"Cita de {mod.lower()} con {ter}." if mod else f"Cita con {ter}.") + (f" Videollamada: {meet}" if meet else "")}
    if place and mod != "Virtual" and not reunion:
        q["location"] = place
    return "https://calendar.google.com/calendar/render?" + urlencode(q)


def enlace_ok(enlace: str) -> str:
    return enlace if re.match(r"^https?://\S{4,500}$", enlace or "") else ""


def evento_ics(start: datetime, dur: int, titulo: str, ter: str, meet: str = "", uid: str = "", cancelado: bool = False) -> str:
    """Invitación .ics de un evento de la agenda (reunión con un colega, supervisión…): solo el título, la hora y el enlace; nada de consultantes."""
    f = lambda d: d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    esc = lambda t: str(t).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    det = f"Organiza: {ter}." + (f" Enlace de la reunión: {meet}" if meet else "")
    rows = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alter-Karute//Eventos//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
            f"UID:{uid or hashlib.sha1((f(start) + titulo).encode()).hexdigest()}@alter.karute.systems",
            f"DTSTAMP:{f(datetime.now(timezone.utc))}", f"DTSTART:{f(start)}", f"DTEND:{f(start + timedelta(minutes=dur))}", "SUMMARY:" + esc(titulo), "DESCRIPTION:" + esc(det)]
    if meet:
        rows.append("LOCATION:" + esc(meet))
    if cancelado:
        rows.append("STATUS:CANCELLED")
    rows += ["END:VEVENT", "END:VCALENDAR"]
    fold = lambda r: r if len(r.encode()) <= 74 else "\r\n ".join(r[i:i + 60] for i in range(0, len(r), 60))
    return "\r\n".join(fold(r) for r in rows) + "\r\n"


def gcal_link_evento(titulo: str, start: datetime, dur: int, ter: str, meet: str = "") -> str:
    """Enlace «Agregar a Google Calendar» de un evento (sin datos de consultantes)."""
    f = lambda d: d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    q = {"action": "TEMPLATE", "text": titulo, "dates": f"{f(start)}/{f(start + timedelta(minutes=dur))}", "details": f"Organiza: {ter}." + (f" Enlace de la reunión: {meet}" if meet else "")}
    if meet:
        q["location"] = meet
    return "https://calendar.google.com/calendar/render?" + urlencode(q)


def notify_evento(prof: dict, acc: dict, start: datetime, dur: int, titulo: str, invitados: list[str], enlace: str = "", modo: str = "invitacion", uid: str = "") -> None:
    """Invitación (o aviso de cambio o cancelación) de un evento de la agenda a una lista de correos, con el enlace de la reunión, botón para Google Calendar y el .ics adjunto.
    Un correo por invitado (no se ven entre sí). Un fallo no detiene a los demás. `modo`: invitacion | cambio | cancelado."""
    ter = prof.get("nombre") or "tu colega"
    meet = enlace if re.match(r"^https?://\S{4,500}$", enlace or "") else ""
    cuando = reminders.when_text(start)
    filas = [("Cuándo", cuando + " (hora de Colombia)"), ("Duración", f"{dur} min"), ("Organiza", ter)]
    if meet:
        filas.append(("Enlace", meet))
    titulo_c, asunto, intro = {
        "invitacion": ("Te invitan a una reunión", f"Invitación: {titulo}", f"{ter} te invita a «{titulo}»."),
        "cambio": ("Cambió una reunión", f"Cambio: {titulo}", f"{ter} cambió los datos de «{titulo}». Estos son los datos actualizados:"),
        "cancelado": ("Se canceló una reunión", f"Cancelada: {titulo}", f"{ter} canceló «{titulo}»."),
    }[modo]
    cal = gcal_link_evento(titulo, start, dur, ter, meet)
    txt = f"{intro}\n\n" + "\n".join(f"{k}: {v}" for k, v in filas) + (f"\n\nAgregar a Google Calendar: {cal}" if modo != "cancelado" else "") + f"\n\nAtentamente,\n{ter}\n\nMensaje automático enviado con Alter-Karute.\n"
    b1 = None if modo == "cancelado" else (("Entrar a la reunión", meet) if meet else ("Agregar a Google Calendar", cal))
    b2 = ("Agregar a Google Calendar", cal) if meet and modo != "cancelado" else None
    html = correo.layout(titulo_c, [intro], filas, [], b1, [], ("Atentamente,", ter), boton2=b2)
    ics = evento_ics(start, dur, titulo, ter, meet, uid, modo == "cancelado")
    for to in invitados:
        try:
            send_mail(to, asunto, txt, prof, acc, html, ics=ics)
        except Exception as e:  # noqa: BLE001 — el evento ya quedó guardado
            _aviso_falla("invitación", e)


def messages(prof: dict, start: datetime, dur: int, mod: str, who: str, patient_mail: str, therapist_mail: str, nuevo: dict | None, url: str = "", otra_hora: str = "", enlace: str = "", reunion: bool = False) -> list[tuple[str, str, str, str]]:
    """(destinatario, asunto, texto, html) de la confirmación al consultante y del aviso al profesional."""
    cuando = reminders.when_text(start)
    ter = prof.get("nombre") or "tu terapeuta"
    place = prof.get("consultorio") or prof.get("nombre") or "tu consulta"
    first = who.split(" ")[0]
    filas = [("Cuándo", cuando), ("Modalidad", f"{mod} · {dur} min"), ("Con", ter + (f" · {prof['consultorio']}" if prof.get("consultorio") and prof["consultorio"].strip().lower() != ter.strip().lower() else ""))]
    presencial = mod == "Presencial" and not reunion
    dir_ = (prof.get("direccion") or "").strip() if presencial else ""
    if dir_:
        filas.append(("Dirección", dir_))
    meet = enlace_ok(REUNION_URL) if reunion else ("" if presencial else enlace_ok(enlace))  # el enlace de la videollamada no aplica a una cita presencial
    cal = gcal_link(start, dur, ter, mod, dir_ or prof.get("consultorio") or "", meet, reunion)
    cita, ver = ("reunión", "Ver o cancelar mi reunión") if reunion else ("cita", "Ver o cancelar mi cita")
    cierre = f"¿Tuviste un imprevisto? Puedes ver o cancelar tu {cita} en cualquier momento con este botón." if url else "¡Te esperamos!"
    otro = (f"Si prefieres otra hora, cancela la {cita} y", "elige un nuevo horario", otra_hora) if url and otra_hora else None
    txt = (f"¡Hola, {first}!\n\nTu {cita} está confirmada. Ya reservamos tu espacio {'en la reunión informativa con' if reunion else 'con'} {ter}.\n\n" + "\n".join(f"{k}: {v}" for k, v in filas)
           + f"\n\n{cierre}" + (f"\n\n{'Entrar a la reunión por Zoom' if reunion else 'Entrar a la videollamada'}: {meet}" if meet else "")
           + f"\n\nAgregar {'la reunión' if reunion else 'la cita'} a tu Google Calendar: {cal}" + (f"\n{ver}: {url}" if url else "")
           + (f"\nSi prefieres otra hora, cancela la {cita} y elige un nuevo horario: {otra_hora}" if otro else "")
           + f"\n\nAtentamente,\n{ter}\n\nMensaje automático enviado con Alter-Karute.\n")
    if meet:
        b1, b2 = ("Entrar a la reunión por Zoom" if reunion else "Entrar a la videollamada", meet), ("Agregar a Google Calendar", cal)
        nts = [otro] + ([(f"Para ver o cancelar tu {cita},", "haz clic aquí", url)] if url else [])
    else:
        b1, b2 = ("Agregar a Google Calendar", cal), ((ver, url) if url else None)
        nts = [otro]
    nts = [n for n in nts if n]
    html = correo.layout(f"¡Tu {cita} está confirmada!", [f"Hola, {first}. Ya reservamos tu espacio {'en la reunión informativa con' if reunion else 'con'} {ter}. Estos son los datos de tu {cita}:"], filas, [cierre], b1, nts, ("Atentamente,", ter), boton2=b2)
    t_filas = [("Persona" if reunion else "Consultante", who + (" (nuevo)" if nuevo and not reunion else "")), ("Cuándo", cuando), ("Modalidad", f"{mod} · {dur} min"), ("Correo", patient_mail)]
    if nuevo:
        t_filas.append(("Teléfono", nuevo.get("telefono") or ""))
        if reunion:
            t_filas += [("Tipo de terapia", nuevo.get("profesion") or ""), ("Ciudad", nuevo.get("ciudad") or "")]
    t_cierre = "Es una persona interesada en Alter-Karute: no se creó ninguna ficha. La reunión ya está en tu agenda." if reunion else "Es un consultante nuevo: todavía no tiene ficha en la app. Cuando quieras, créala y vincula la cita desde tu agenda." if nuevo else "La cita ya está en tu agenda."
    t_txt = f"Tienes {'una nueva reunión informativa agendada' if reunion else 'una nueva cita agendada'} por tu enlace.\n\n" + "\n".join(f"{k}: {v}" for k, v in t_filas) + f"\n\n{t_cierre}\n\nMensaje automático enviado con Alter-Karute.\n"
    t_html = correo.layout("Nueva reunión informativa agendada" if reunion else "Nueva cita agendada", [f"{first} acaba de agendar {'una reunión informativa' if reunion else 'una cita'} por tu enlace de reservas."], t_filas, [t_cierre], firma=("Que tengas un buen día,", "El equipo de Alter-Karute"))
    return [(patient_mail, f"¡Tu {cita} está confirmada! — {place}", txt, html), (therapist_mail, f"Nueva reunión informativa: {who}" if reunion else f"Nueva cita agendada: {who}", t_txt, t_html)]


def notify_cancel(prof: dict, acc: dict, start: datetime, dur: int, mod: str, who: str, to: str, antes: datetime | None = None, por_admin: bool = False) -> None:
    """Avisa al consultante que su cita fue cancelada (o, con `antes`, que cambió de fecha u hora) por el terapeuta o la administración. Un fallo no afecta el guardado."""
    ter = prof.get("nombre") or "tu terapeuta"
    first = (who or "").split(" ")[0]
    if antes:
        asunto, frase = "Tu cita cambió de fecha u hora", f"Te informamos que tu cita con {ter} fue reprogramada."
        filas = [("Antes", reminders.when_text(antes)), ("Ahora", reminders.when_text(start)), ("Modalidad", f"{mod} · {dur} min"), ("Con", ter)]
        cierre = "Si esta nueva hora no te sirve, comunícate con el consultorio."
    else:
        asunto, frase = "Tu cita fue cancelada", f"Te informamos que tu cita con {ter} fue cancelada."
        filas = [("Cuándo", reminders.when_text(start)), ("Modalidad", f"{mod} · {dur} min"), ("Con", ter)]
        cierre = "Si tienes dudas, comunícate con tu terapeuta." if por_admin else "Si quieres reagendar, comunícate con el consultorio. Lamentamos los inconvenientes."
    txt = f"Hola{(', ' + first) if first else ''}. {frase}\n\n" + "\n".join(f"{k}: {v}" for k, v in filas) + f"\n\n{cierre}\n\nAtentamente,\n{ter}\n\nMensaje automático enviado con Alter-Karute.\n"
    html = correo.layout(asunto, [f"Hola{(', ' + first) if first else ''}. {frase}"], filas, [cierre], None, [], ("Atentamente,", ter))
    try:
        send_mail(to, asunto, txt, prof, acc, html)
    except Exception as e:  # noqa: BLE001
        _aviso_falla("aviso de cancelación", e)


def notify_cancel_pro(prof: dict, acc: dict, start: datetime, dur: int, mod: str, who: str, motivo: str, admin: str, to: str) -> None:
    """Avisa al terapeuta que el administrador de su empresa canceló una de sus citas, con el motivo."""
    first = (prof.get("nombre") or "").split(" ")[0]
    frase = f"{admin or 'El administrador de tu empresa'} canceló una de tus citas."
    filas = [("Consultante", who or "Consultante nuevo"), ("Cuándo", reminders.when_text(start)), ("Modalidad", f"{mod} · {dur} min"), ("Motivo", motivo or "—")]
    txt = f"Hola{(', ' + first) if first else ''}. {frase}\n\n" + "\n".join(f"{k}: {v}" for k, v in filas) + "\n\nMensaje automático enviado con Alter-Karute.\n"
    html = correo.layout("Se canceló una de tus citas", [f"Hola{(', ' + first) if first else ''}. {frase}"], filas, [], None, [])
    try:
        send_mail(to, "Se canceló una de tus citas", txt, prof, acc, html)
    except Exception as e:  # noqa: BLE001
        _aviso_falla("aviso de cancelación al terapeuta", e)


def notify(prof: dict, acc: dict, start: datetime, dur: int, mod: str, who: str, patient_mail: str, therapist_mail: str, nuevo: dict | None, url: str = "", otra_hora: str = "", enlace: str = "", reunion: bool = False) -> None:
    """Envía la confirmación y el aviso. Un fallo no afecta el otro envío."""
    for to, subj, txt, html in messages(prof, start, dur, mod, who, patient_mail, therapist_mail, nuevo, url, otra_hora, enlace, reunion):
        if not to:
            continue
        try:
            send_mail(to, subj, txt, prof, acc, html)
        except Exception as e:  # noqa: BLE001 — la cita ya quedó guardada
            _aviso_falla("correo de la cita", e)
