"""Formulario de datos previo a la atención.

El terapeuta envía un enlace personal (por correo o para copiar; nunca por WhatsApp). El consultante llena sus datos de
identificación y contacto, sin iniciar sesión. Lo recibido NO crea al consultante: queda pendiente de revisión y el terapeuta
lo convierte en consultante con un clic (con las mismas reglas de siempre). El enlace sirve una sola vez y vence en 7 días."""
import re
from datetime import date, timedelta
from email.message import EmailMessage
from email.utils import formataddr

from . import correo, survey
from .config import PUBLIC_URL

DAYS = 7
TIPOS_DOC = ["CC", "TI", "CE", "Registro civil", "Pasaporte", "Permiso por protección temporal (PPT)", "Permiso especial de permanencia (PEP)", "Menor sin documento", "Otro"]
SEXOS = ["Femenino", "Masculino", "Intersexual"]
ESTADOS_CIVILES = ["Soltero/a", "Casado/a", "Unión libre", "Separado/a", "Divorciado/a", "Viudo/a", "No aplica (menor de edad)", "No responde"]
ESCOLARIDAD = ["Ninguna", "Preescolar", "Primaria", "Secundaria", "Técnico/tecnólogo", "Pregrado", "Posgrado", "No responde"]

GENEROS = ["Cisgénero", "Transgénero", "No binario", "Agénero", "Queer", "Género fluido", "Bigénero", "Prefiere no responder", "No aplica"]
ETNIAS = ["Ningún grupo étnico", "Indígena", "Rrom o gitano(a)", "Raizal del Archipiélago de San Andrés, Providencia y Santa Catalina", "Palenquero(a) de San Basilio",
          "Negro(a), mulato(a), afrodescendiente o afrocolombiano(a)", "Prefiere no responder"]
DISCAPACIDAD = ["Ninguna", "Física", "Auditiva", "Visual", "Sordoceguera", "Intelectual", "Psicosocial", "Múltiple", "No responde"]
ZONAS = ["Urbana", "Rural", "No responde"]

# (clave en el consultante, etiqueta, tipo, opciones, obligatorio). Son los datos de apertura de la ficha (pestaña Datos) que
# responde el propio consultante: no incluye cuidadores o acudientes ni lo que decide el terapeuta (servicio, modalidad, estado).
# Tipo «country»: lista de países que arma la página; el servidor solo valida el texto.
FIELDS = [
    ("nombres", "Nombres", "text", None, True), ("apellidos", "Apellidos", "text", None, True),
    ("tipoDoc", "Tipo de documento", "select", TIPOS_DOC, True), ("documento", "Número de documento", "text", None, True),
    ("nacimiento", "Fecha de nacimiento", "date", None, True), ("paisNac", "País de nacimiento", "country", None, True),
    ("lugarNac", "Lugar de nacimiento", "text", None, False), ("sexo", "Sexo", "select", SEXOS, True),
    ("identidadGenero", "Identidad de género", "select", GENEROS, False), ("nacionalidad", "Nacionalidad", "country", None, False),
    ("etnia", "Pertenencia étnica", "select", ETNIAS, False), ("etniaPueblo", "Pueblo o comunidad", "text", None, False),
    ("estadoCivil", "Estado civil", "select", ESTADOS_CIVILES, False), ("escolaridad", "Escolaridad", "select", ESCOLARIDAD, False),
    ("ocupacion", "Ocupación", "text", None, False),
    ("discapacidad", "Discapacidad", "select", DISCAPACIDAD, False),
    ("paisRes", "País de residencia", "country", None, False), ("ciudad", "Ciudad o municipio", "text", None, False),
    ("zona", "Zona de residencia", "select", ZONAS, False), ("localidad", "Localidad, comuna o barrio", "text", None, False),
    ("direccion", "Dirección", "text", None, False), ("telInd", "Indicativo del teléfono", "text", None, False),
    ("telefono", "Teléfono", "text", None, True), ("correo", "Correo electrónico", "email", None, False),
    ("emergNombre", "Contacto de emergencia: nombre", "text", None, False), ("emergParentesco", "Contacto de emergencia: parentesco", "text", None, False),
    ("emergInd", "Contacto de emergencia: indicativo", "text", None, False), ("emergTelefono", "Contacto de emergencia: teléfono", "text", None, False),
]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def fields(fmt: dict | None) -> list[tuple]:
    """Campos del formulario: el nombre (siempre) y los campos de los apartados de «Datos del consultante» (Mis formatos)
    que el terapeuta marcó (formatos.formulario); si nunca eligió, todos. (clave, etiqueta, tipo, opciones, obligatorio, sección)."""
    sel = (fmt or {}).get("formulario")
    sel = set(map(str, sel)) if isinstance(sel, list) else None
    out = [(k, l, t, o, r, "Identificación") for k, l, t, o, r in FIELDS if k == "nombres"]
    for sc in (fmt or {}).get("datos") or []:
        try:
            titulo, fs = str(sc[0]), sc[1]
            out += [(str(x[0]), str(x[1] or titulo)[:120], "text", None, False, titulo[:120]) for x in fs if re.match(r"^[A-Za-z0-9_-]{1,40}$", str(x[0])) and (sel is None or str(x[0]) in sel)]
        except (IndexError, TypeError):
            continue
    return out


def spec(fmt: dict | None = None) -> list[dict]:
    res, last = [], None
    for k, l, t, o, r, s in fields(fmt):
        res.append({"k": k, "l": l, "t": t, "o": o, "r": r, **({"s": s} if s != last else {})})
        last = s
    return res


def clean(raw: dict, fmt: dict | None = None) -> dict:
    """Valida lo que el consultante envió: solo los campos del formulario, con su tipo y límites. ValueError con el motivo."""
    out = {}
    for k, l, t, opts, req, _s in fields(fmt):
        v = str((raw or {}).get(k) or "").strip()
        label = l.split(" (")[0]
        if not v:
            if req:
                raise ValueError(f"Falta: {label}")
            continue
        if len(v) > 200:
            raise ValueError(f"«{label}» es demasiado largo")
        if t == "select" and v not in opts:
            raise ValueError(f"Elija una opción válida en «{label}»")
        if t == "email" and not EMAIL_RE.match(v):
            raise ValueError("El correo no es válido")
        if t == "date":
            try:
                d = date.fromisoformat(v)
            except ValueError:
                raise ValueError("La fecha de nacimiento no es válida")
            if d > date.today() or d.year < 1900:
                raise ValueError("La fecha de nacimiento no es válida")
        out[k] = v
    return out


def ttl() -> timedelta:
    return timedelta(days=DAYS)


def link(token: str, base: str = "") -> str:
    return (PUBLIC_URL or base or "") + "/formulario?t=" + token


def message(nombre: str, prof: dict, url: str) -> str:
    first = str(nombre or "").split(" ")[0]
    who = prof.get("nombre") or "su terapeuta"
    return (f"Hola{(' ' + first) if first else ''}, {who} le envía un formulario para que registre sus datos antes de la primera atención: {url} "
            f"Solo toma unos minutos. El enlace se puede usar una vez y vence en {DAYS} días.")


def send_mail(to: str, body: str, prof: dict, acc: dict) -> None:
    """Envía el enlace desde el correo del terapeuta. Se reemplaza en las pruebas."""
    m = EmailMessage()
    place = prof.get("consultorio") or prof.get("nombre") or "su consulta"
    m["Subject"] = f"Formulario de datos para su primera atención — {place}"
    m["From"] = formataddr((prof.get("nombre") or "", acc.get("from"))) if acc.get("propio") else acc.get("from")
    m["To"] = to
    reply = acc.get("from") if acc.get("propio") else prof.get("correo")
    if reply:
        m["Reply-To"] = reply
    m.set_content(body + "\n\nSi no esperaba este mensaje, ignórelo o comuníquese con el consultorio.\n")
    antes, url, despues = correo.separar_enlace(body)
    correo.agregar(m, correo.layout("Complete sus datos", [antes, despues], boton=("Llenar el formulario", url) if url else None,
                                    notas=["Si no esperaba este mensaje, ignórelo o comuníquese con el consultorio."], firma=("Atentamente,", prof.get("nombre") or place)))
    with survey.smtp_open(acc) as s:
        s.send_message(m)
