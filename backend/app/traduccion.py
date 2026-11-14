"""Inglés para los correos: tr(texto, idioma) traduce líneas completas del texto plano, el asunto y los textos del HTML.
Las claves son el español; las claves con {n} coinciden por patrón (n = grupos, que se traducen también)."""
import html as _html
import re

EN = {
    "El equipo de Alter-Karute": "The Alter-Karute team", "Atentamente,": "Kind regards,", "Que tengas un buen día,": "Have a nice day,", "Gracias por tu tiempo,": "Thank you for your time,",
    "Mensaje automático enviado con Alter-Karute.": "Automatic message sent with Alter-Karute.", "Conoce Alter-Karute →": "Discover Alter-Karute →",
    "Alter-Karute es un espacio sereno para que terapeutas de terapias alternativas lleven el seguimiento de tus consultantes: sesiones, agenda y acuerdos en un solo lugar. No es una herramienta clínica.":
        "Alter-Karute is a calm space for alternative-therapy practitioners to follow up with their clients: sessions, calendar and agreements in one place. It is not a clinical tool.",
    "Si el botón no funciona, copia y pega esta dirección en tu navegador:": "If the button doesn't work, copy and paste this address into your browser:",
    "tu terapeuta": "your therapist", "tu consulta": "your practice", "Cita con {0}": "Appointment with {0}", "Cita de {0} con {1}.": "{0}'s appointment with {1}.", "Cita con {0}.": "Appointment with {0}.", "Videollamada: {0}": "Video call: {0}",
    "¿Tuvo un imprevisto? Puedes ver o cancelar tu cita en cualquier momento con este botón.": "Something came up? You can view or cancel your appointment at any time with this button.", "¡Te esperamos!": "We look forward to seeing you!",
    "¡Tu cita está confirmada!": "Your appointment is confirmed!", "¡Tu cita está confirmada! — {0}": "Your appointment is confirmed! — {0}", "Nueva cita agendada": "New appointment booked", "Nueva cita agendada: {0}": "New appointment booked: {0}",
    "Es un consultante nuevo: todavía no tiene ficha en la app. Cuando quieras, créala y vincula la cita desde tu agenda.": "This is a new client: they don't have a file in the app yet. Whenever you like, create it and link the appointment from your calendar.",
    "La cita ya está en tu agenda.": "The appointment is already in your calendar.", "Cuándo": "When", "Modalidad": "Format", "Con": "With", "Consultante": "Client", "Correo": "Email", "Teléfono": "Phone", "(nuevo)": "(new)",
    "Presencial": "In person", "Virtual": "Virtual", "Telefónica": "Phone", "{0} · {1} min": "{0} · {1} min",
    "Si prefieres otra hora, cancela la cita y": "If you prefer another time, cancel the appointment and", "elige un nuevo horario": "choose a new time",
    "Hola, {0}. Ya reservamos tu espacio con {1}. Estos son los datos de tu cita:": "Hello, {0}. We've reserved your spot with {1}. Here are your appointment details:",
    "¡Hola, {0}!": "Hello, {0}!", "Tu cita está confirmada. Ya reservamos tu espacio con {1}.": "Your appointment is confirmed. We've reserved your spot with {1}.",
    "Tienes una nueva cita agendada por tu enlace.": "You have a new appointment booked through your link.", "{0} acaba de agendar una cita por tu enlace de reservas.": "{0} has just booked an appointment through your booking link.",
    "Si prefieres otra hora, cancela la cita y elige un nuevo horario: {0}": "If you prefer another time, cancel the appointment and choose a new one: {0}",
    "Entrar a la videollamada": "Join the video call", "Entrar a la videollamada: {0}": "Join the video call: {0}", "Agregar a Google Calendar": "Add to Google Calendar", "Agregar la cita a tu Google Calendar: {0}": "Add the appointment to your Google Calendar: {0}",
    "Ver o cancelar mi cita": "View or cancel my appointment", "Ver o cancelar mi cita: {0}": "View or cancel my appointment: {0}", "Para ver o cancelar tu cita,": "To view or cancel your appointment,", "haz clic aquí": "click here",
    "Recordatorio de tu cita": "Reminder of your appointment", "Recordatorio de tu cita — {0}": "Reminder of your appointment — {0}", "Confirmar o cancelar mi cita": "Confirm or cancel my appointment",
    "Hola{0}, te recordamos tu cita con {1} el {2} ({3}).": "Hello{0}, a reminder of your appointment with {1} on {2} ({3}).", "Por favor confirma o avísanos si no puedes asistir: {0}": "Please confirm or let us know if you can't attend: {0}",
    "Por favor confirma o avísanos si no puedes asistir:": "Please confirm or let us know if you can't attend:", "Este es un mensaje automático de recordatorio.": "This is an automatic reminder message.",
    "{0} {1} de {2} a las {3}": "{0}, {2} {1} at {3}",
    "lunes": "Monday", "martes": "Tuesday", "miércoles": "Wednesday", "jueves": "Thursday", "viernes": "Friday", "sábado": "Saturday", "domingo": "Sunday",
    "enero": "January", "febrero": "February", "marzo": "March", "abril": "April", "mayo": "May", "junio": "June", "julio": "July", "agosto": "August", "septiembre": "September", "octubre": "October", "noviembre": "November", "diciembre": "December",
    "¿Cómo te pareció la atención en {0}?": "How was your experience at {0}?", "¿Cómo te pareció la atención?": "How was your experience?", "Tu terapeuta(a)": "Your therapist",
    "Hola{0}. {1} te invita a responder una encuesta corta sobre la atención que recibiste. Toma unos 2 minutos y tus respuestas se guardan sin tu nombre.": "Hello{0}. {1} invites you to answer a short survey about the care you received. It takes about 2 minutes and your answers are saved without your name.",
    "El enlace estará abierto {0} días. Responder es voluntario.": "The link will be open for {0} days. Answering is voluntary.", "Responder la encuesta": "Answer the survey", "Si no deseas recibir más encuestas,": "If you don't want to receive more surveys,", "Si no deseas recibir más encuestas: {0}": "If you don't want to receive more surveys: {0}", "Gracias por tu tiempo.": "Thank you for your time.",
    "Bienvenido(a) a Alter-Karute: confirma tu correo para activar tu cuenta": "Welcome to Alter-Karute: confirm your email to activate your account", "Bienvenido(a) a Alter-Karute{0}": "Welcome to Alter-Karute{0}", "Bienvenido(a) a Alter-Karute{0}.": "Welcome to Alter-Karute{0}.",
    "Para activar tu cuenta, confirma tu correo con el siguiente botón. El enlace estará vigente durante 24 horas.": "To activate your account, confirm your email with the button below. The link is valid for 24 hours.", "Confirmar mi correo": "Confirm my email",
    "Si no solicitaste esta cuenta, ignora este mensaje: no se creará ningún registro.": "If you didn't request this account, ignore this message: no record will be created.",
    "Formulario de datos para tu primera atención — {0}": "Data form for your first session — {0}", "Completa tus datos": "Complete your details", "Llenar el formulario": "Fill in the form",
    "Hola{0}, {1} te envía un formulario para que registres tus datos antes de la primera atención: {2} Solo toma unos minutos. El enlace se puede usar una vez y vence en {3} días.": "Hello{0}, {1} is sending you a form to enter your details before your first session: {2} It only takes a few minutes. The link can be used once and expires in {3} days.",
    "Hola{0}, {1} te envía el documento «{2}» para que lo leas y lo firmes desde tu celular: {3} Para abrirlo se te pedirá tu número de documento. El enlace vence en {4} días.": "Hello{0}, {1} is sending you the document “{2}” to read and sign from your phone: {3} You will be asked for your ID number to open it. The link expires in {4} days.",
    "Consentimiento para firmar — {0}": "Consent to sign — {0}", "Tienes un documento para firmar": "You have a document to sign", "Leer y firmar el documento": "Read and sign the document",
    "Hola:": "Hello:", "Hola{0}:": "Hello{0}:", "{0} te invita a responder una encuesta corta sobre la atención que recibiste. Toma unos 2 minutos y tus respuestas se guardan sin tu nombre.": "{0} invites you to answer a short survey about the care you received. It takes about 2 minutes and your answers are saved without your name.",
    "Si no esperaba este mensaje, ignórelo o comunícate con el consultorio.": "If you weren't expecting this message, ignore it or contact the practice.",
}

_PAT = []
_EXACT = {}
for _k, _v in EN.items():
    if re.search(r"\{\d+\}", _k):
        _PAT.append((re.compile("^" + "(.+?)".join(re.escape(p) for p in re.split(r"\{\d+\}", _k)) + "$", re.S), _v, {int(n): i + 1 for i, n in enumerate(re.findall(r"\{(\d+)\}", _k))}))
    else:
        _EXACT[_k] = _v


def tr(s: str, lang: str | None) -> str:
    """Traduce una línea completa; si no está en el diccionario, queda igual."""
    if lang != "en" or not s or not s.strip():
        return s
    lead, core, trail = s[:len(s) - len(s.lstrip())], s.strip(), s[len(s.rstrip()):]
    if core in _EXACT:
        return lead + _EXACT[core] + trail
    for rx, v, idx in _PAT:
        m = rx.match(core)
        if m:
            return lead + re.sub(r"\{(\d+)\}", lambda g: tr(m.group(idx.get(int(g.group(1)), 1)), lang), v) + trail
    return s


def texto(s: str, lang: str | None) -> str:
    """Texto plano de varias líneas, línea por línea."""
    return "\n".join(tr(x, lang) for x in s.split("\n")) if lang == "en" else s


def html(h: str, lang: str | None) -> str:
    """HTML: traduce los textos entre etiquetas (y alt/title); el resto queda intacto."""
    if lang != "en":
        return h
    h = re.sub(r">([^<>]+)<", lambda m: ">" + _html.escape(tr(_html.unescape(m.group(1)), lang), quote=False) + "<", h)
    h = h.replace('<html lang="es">', '<html lang="en">')
    return h
