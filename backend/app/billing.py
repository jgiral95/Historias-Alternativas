"""Suscripción con ePayco: se consulta por el correo de la cuenta (incluye la prueba gratis) y se da acceso hasta el fin del periodo."""
from datetime import datetime, timedelta, timezone

from .config import EPAYCO_PLAN_ANUAL, EPAYCO_PLAN_MENSUAL, EPAYCO_PRIVATE_KEY, EPAYCO_PUBLIC_KEY, EPAYCO_TEST

PLANES = {"mensual": "Plan mensual", "anual": "Plan anual"}
PLAN_IDS = {k: v for k, v in ((EPAYCO_PLAN_MENSUAL, "mensual"), (EPAYCO_PLAN_ANUAL, "anual")) if k}  # id_plan de ePayco -> plan
_emails: dict[str, str] = {}  # idCustomer -> correo: evita consultar el cliente en cada suscripción
ultima: dict[int, float] = {}  # usuario -> última consulta a ePayco (límite de frecuencia)


def cliente():
    """Cliente del SDK de ePayco (se importa aquí: sin el SDK o sin llaves, la app arranca igual)."""
    import epaycosdk.epayco as epayco
    return epayco.Epayco({"apiKey": EPAYCO_PUBLIC_KEY, "privateKey": EPAYCO_PRIVATE_KEY, "test": EPAYCO_TEST, "lenguage": "ES"})


def suscripciones_de(email: str, cli) -> list[dict]:
    """Suscripciones activas a los planes de Alter-Karute cuyo cliente de ePayco tiene este correo."""
    email = email.strip().lower()
    r = cli.subscriptions.getlist()
    if not r.get("status"):  # sin ninguna suscripción en la cuenta, ePayco responde status false
        return []
    out = []
    for s in r.get("data") or []:
        if s.get("status") != "active" or s.get("idPlan") not in PLAN_IDS:
            continue
        cid = s.get("idCustomer") or ""
        if cid not in _emails:
            c = cli.customer.get(cid)
            if not c.get("status"):
                raise RuntimeError("ePayco no devolvió el cliente")
            _emails[cid] = ((c.get("data") or {}).get("email") or "").strip().lower()
        if _emails[cid] == email:
            out.append(s)
    return out


def fin_periodo(s: dict) -> datetime | None:
    """periodEnd (día del próximo cobro) llega como DD-MM-YYYY; si no cuadra se prueba MM-DD-YYYY. El acceso cubre ese día completo."""
    for fmt in ("%d-%m-%Y", "%m-%d-%Y"):
        try:
            d = datetime.strptime(s.get("periodEnd") or "", fmt)
        except ValueError:
            continue
        return d.replace(tzinfo=timezone.utc) + timedelta(days=1)
    return None


def cancelar(sub_id: str, cli) -> None:
    if not cli.subscriptions.cancel(sub_id).get("status"):
        raise RuntimeError("ePayco no canceló la suscripción")


def aware(d: datetime | None) -> datetime | None:
    """SQLite pierde la zona horaria: se asume UTC."""
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


def nueva_vigencia(actual: datetime | None, dias: int, ahora: datetime) -> datetime:
    """Renovar antes de vencer suma al tiempo que queda; si ya venció, cuenta desde hoy."""
    actual = aware(actual)
    return (actual if actual and actual > ahora else ahora) + timedelta(days=dias)


def vigente(hasta: datetime | None, ahora: datetime) -> bool:
    hasta = aware(hasta)
    return bool(hasta and hasta > ahora)
