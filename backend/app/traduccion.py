"""Inglés para los correos: tr(texto, idioma) traduce líneas completas del texto plano, el asunto y los textos del HTML.
Las claves son el español; las claves con {n} coinciden por patrón (n = grupos, que se traducen también)."""
import html as _html
import re

EN = {
    "El equipo de Alter-Karute": "The Alter-Karute team", "Atentamente,": "Kind regards,", "Que tenga un buen día,": "Have a nice day,", "Gracias por su tiempo,": "Thank you for your time,",
    "Mensaje automático enviado con Alter-Karute.": "Automatic message sent with Alter-Karute.", "Conozca Alter-Karute →": "Discover Alter-Karute →",
    "Alter-Karute es un espacio sereno para que terapeutas de terapias alternativas lleven el seguimiento de sus consultantes: sesiones, agenda y acuerdos en un solo lugar. No es una herramienta clínica.":
        "Alter-Karute is a calm space for alternative-therapy practitioners to follow up with their clients: sessions, calendar and agreements in one place. It is not a clinical tool.",
    "Si el botón no funciona, copie y pegue esta dirección en su navegador:": "If the button doesn't work, copy and paste this address into your browser:",
    "su terapeuta": "your therapist", "su consulta": "your practice", "Cita con {0}": "Appointment with {0}", "Cita de {0} con {1}.": "{0}'s appointment with {1}.", "Cita con {0}.": "Appointment with {0}.", "Videollamada: {0}": "Video call: {0}",
    "¿Tuvo un imprevisto? Puede ver o cancelar su cita en cualquier momento con este botón.": "Something came up? You can view or cancel your appointment at any time with this button.", "¡Lo esperamos!": "We look forward to seeing you!",
    "¡Su cita está confirmada!": "Your appointment is confirmed!", "¡Su cita está confirmada! — {0}": "Your appointment is confirmed! — {0}", "Nueva cita agendada": "New appointment booked", "Nueva cita agendada: {0}": "New appointment booked: {0}",
    "Es un consultante nuevo: todavía no tiene ficha en la app. Cuando quiera, créela y vincule la cita desde su agenda.": "This is a new client: they don't have a file in the app yet. Whenever you like, create it and link the appointment from your calendar.",
    "La cita ya está en su agenda.": "The appointment is already in your calendar.", "Cuándo": "When", "Modalidad": "Format", "Con": "With", "Consultante": "Client", "Correo": "Email", "Teléfono": "Phone", "(nuevo)": "(new)",
    "Presencial": "In person", "Virtual": "Virtual", "Telefónica": "Phone", "{0} · {1} min": "{0} · {1} min",
    "Si prefiere otra hora, cancele la cita y": "If you prefer another time, cancel the appointment and", "elija un nuevo horario": "choose a new time",
    "Hola, {0}. Ya reservamos su espacio con {1}. Estos son los datos de su cita:": "Hello, {0}. We've reserved your spot with {1}. Here are your appointment details:",
    "¡Hola, {0}!": "Hello, {0}!", "Su cita está confirmada. Ya reservamos su espacio con {1}.": "Your appointment is confirmed. We've reserved your spot with {1}.",
    "Tiene una nueva cita agendada por su enlace.": "You have a new appointment booked through your link.", "{0} acaba de agendar una cita por su enlace de reservas.": "{0} has just booked an appointment through your booking link.",
    "Si prefiere otra hora, cancele la cita y elija un nuevo horario: {0}": "If you prefer another time, cancel the appointment and choose a new one: {0}",
    "Entrar a la videollamada": "Join the video call", "Entrar a la videollamada: {0}": "Join the video call: {0}", "Agregar a Google Calendar": "Add to Google Calendar", "Agregar la cita a su Google Calendar: {0}": "Add the appointment to your Google Calendar: {0}",
    "Ver o cancelar mi cita": "View or cancel my appointment", "Ver o cancelar mi cita: {0}": "View or cancel my appointment: {0}", "Para ver o cancelar su cita,": "To view or cancel your appointment,", "haga clic aquí": "click here",
    "Recordatorio de su cita": "Reminder of your appointment", "Recordatorio de su cita — {0}": "Reminder of your appointment — {0}", "Confirmar o cancelar mi cita": "Confirm or cancel my appointment",
    "Hola{0}, le recordamos su cita con {1} el {2} ({3}).": "Hello{0}, a reminder of your appointment with {1} on {2} ({3}).", "Por favor confirme o avísenos si no puede asistir: {0}": "Please confirm or let us know if you can't attend: {0}",
    "Por favor confirme o avísenos si no puede asistir:": "Please confirm or let us know if you can't attend:", "Este es un mensaje automático de recordatorio.": "This is an automatic reminder message.",
    "{0} {1} de {2} a las {3}": "{0}, {2} {1} at {3}",
    "lunes": "Monday", "martes": "Tuesday", "miércoles": "Wednesday", "jueves": "Thursday", "viernes": "Friday", "sábado": "Saturday", "domingo": "Sunday",
    "enero": "January", "febrero": "February", "marzo": "March", "abril": "April", "mayo": "May", "junio": "June", "julio": "July", "agosto": "August", "septiembre": "September", "octubre": "October", "noviembre": "November", "diciembre": "December",
    "¿Cómo le pareció la atención en {0}?": "How was your experience at {0}?", "¿Cómo le pareció la atención?": "How was your experience?", "Su terapeuta(a)": "Your therapist",
    "Hola{0}. {1} le invita a responder una encuesta corta sobre la atención que recibió. Toma unos 2 minutos y sus respuestas se guardan sin su nombre.": "Hello{0}. {1} invites you to answer a short survey about the care you received. It takes about 2 minutes and your answers are saved without your name.",
    "El enlace estará abierto {0} días. Responder es voluntario.": "The link will be open for {0} days. Answering is voluntary.", "Responder la encuesta": "Answer the survey", "Si no desea recibir más encuestas,": "If you don't want to receive more surveys,", "Si no desea recibir más encuestas: {0}": "If you don't want to receive more surveys: {0}", "Gracias por su tiempo.": "Thank you for your time.",
    "Bienvenido(a) a Alter-Karute: confirme su correo para activar su cuenta": "Welcome to Alter-Karute: confirm your email to activate your account", "Bienvenido(a) a Alter-Karute{0}": "Welcome to Alter-Karute{0}", "Bienvenido(a) a Alter-Karute{0}.": "Welcome to Alter-Karute{0}.",
    "Para activar su cuenta, confirme su correo con el siguiente botón. El enlace estará vigente durante 24 horas.": "To activate your account, confirm your email with the button below. The link is valid for 24 hours.", "Confirmar mi correo": "Confirm my email",
    "Si usted no solicitó esta cuenta, ignore este mensaje: no se creará ningún registro.": "If you didn't request this account, ignore this message: no record will be created.",
    "Formulario de datos para su primera atención — {0}": "Data form for your first session — {0}", "Complete sus datos": "Complete your details", "Llenar el formulario": "Fill in the form",
    "Hola{0}, {1} le envía un formulario para que registre sus datos antes de la primera atención: {2} Solo toma unos minutos. El enlace se puede usar una vez y vence en {3} días.": "Hello{0}, {1} is sending you a form to enter your details before your first session: {2} It only takes a few minutes. The link can be used once and expires in {3} days.",
    "Hola{0}, {1} le envía el documento «{2}» para que lo lea y lo firme desde su celular: {3} Para abrirlo se le pedirá su número de documento. El enlace vence en {4} días.": "Hello{0}, {1} is sending you the document “{2}” to read and sign from your phone: {3} You will be asked for your ID number to open it. The link expires in {4} days.",
    "Consentimiento para firmar — {0}": "Consent to sign — {0}", "Tiene un documento para firmar": "You have a document to sign", "Leer y firmar el documento": "Read and sign the document",
    "Hola:": "Hello:", "Hola{0}:": "Hello{0}:", "{0} le invita a responder una encuesta corta sobre la atención que recibió. Toma unos 2 minutos y sus respuestas se guardan sin su nombre.": "{0} invites you to answer a short survey about the care you received. It takes about 2 minutes and your answers are saved without your name.",
    "Si no esperaba este mensaje, ignórelo o comuníquese con el consultorio.": "If you weren't expecting this message, ignore it or contact the practice.",
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
