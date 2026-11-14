"""Segunda pasada: pronombres (su → tu), el trato en presente/futuro y los giros que dependen del contexto."""
import re
from tutear import tutear

KEEP = ["a su representante", "con todo lo suyo", "cada quien ocupa su lugar", "Lo que la familia cuenta sobre su salud", "continuar su proceso con",
        "en su autorización de uso de datos", "quien firma escribe su número de documento", "o su acudiente", "su respuesta aparece en la agenda",
        "de su madre", "con su madre", "sus padres", "su cambio de trabajo", "sus rutinas", "sus anotaciones", "su médico", "Es su primera vez en un proceso",
        "Cada persona tiene su propia ficha, sus consentimientos y sus notas", "lo firma desde su celular", "a sus preguntas", "escribe su número de documento, lee el texto",
        "Cada persona entra con su propio correo", "ve únicamente sus propios consultantes", "dentro de su usuario", "sus registros se conservan",
        "en sus palabras", "la confidencialidad y sus límites", "su estado (", "Se borrarán su ficha, notas", "con todo lo suyo", "su dueño", "su cuerpo", "sus preocupaciones del trabajo"]
V = {"puede": "puedes", "quiere": "quieres", "necesita": "necesitas", "prefiere": "prefieres", "desea": "deseas", "tiene": "tienes", "debe": "debes",
     "sabe": "sabes", "usa": "usas", "olvidó": "olvidaste", "perdió": "perdiste", "recibió": "recibiste", "ve": "ves"}


def conj(m):
    return m.group(1) + V[m.group(2)] + m.group(3)


def pron(t: str) -> str:
    hold = {}
    for i, k in enumerate(KEEP):
        if k in t:
            key = f"\u0001{i}\u0001"
            hold[key] = k
            t = t.replace(k, key)
    t = re.sub(r"\bsus\b", "tus", t)
    t = re.sub(r"\bsu\b", "tu", t)
    t = re.sub(r"\bSus\b", "Tus", t)
    t = re.sub(r"\bSu\b", "Tu", t)
    t = re.sub(r"\b(la|el|lo|los|las) (suyo|suya|suyos|suyas)\b", lambda m: m.group(1) + " " + {"suyo": "tuyo", "suya": "tuya", "suyos": "tuyos", "suyas": "tuyas"}[m.group(2)], t)
    for k, v in hold.items():
        t = t.replace(k, v)
    # presente de «usted» → «tú»
    vs = "|".join(V)
    t = re.sub(r"(\b[Ss]i (?:lo |la |no |ya |no lo |no la )?)(" + vs + r")\b()", conj, t)
    t = re.sub(r"(¿)(Quiere|Tiene|Puede|Desea|Prefiere|Necesita)\b()", lambda m: m.group(1) + m.group(2) + "s", t)
    t = re.sub(r"(?:(?<=[>.:!?»'\"`;])|^)(\s*)(Puede|Necesita|Tiene|Debe)\b(?! ser\b| haber\b)", lambda m: m.group(1) + m.group(2) + "s" if m.group(2) != "Debe" else m.group(0), t)
    t = re.sub(r"(Aún no |Ya |Todavía no |Aún )(tiene|puede)\b", lambda m: m.group(1) + V[m.group(2)], t) if re.search(r"(Aún no |Ya |Todavía no |Aún )(tiene|puede)\b", t) else t
    t = re.sub(r"([;,] |: )puede\b(?! ser\b)", r"\1puedes", t)
    return t
