"""Sincronización de una vía con Google Calendar: las citas de la app se copian a un calendario
propio «Alter-Karute» en la cuenta de Google del terapeuta. Se usa el permiso más limitado
(calendar.app.created): la app solo ve y cambia el calendario que ella misma creó."""
import hashlib
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL
from .db import GoogleLink, Record, SessionLocal
from .security import decrypt, encrypt

CLIENT_ID, CLIENT_SECRET, BASE_URL = GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
TZ = "America/Bogota"
CAL_NAME = "Alter-Karute"

_tokens: dict[int, tuple[str, float]] = {}
_lock = threading.Lock()


class GoogleError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def enabled() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and BASE_URL)


def redirect_uri() -> str:
    return BASE_URL + "/api/google/callback"


def http(method: str, url: str, body: dict | None = None, token: str | None = None, form: bool = False):
    """Llamada HTTP a Google. Devuelve (estado, json). Se reemplaza en las pruebas."""
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except ValueError:
            return e.code, {}


def auth_url(state: str) -> str:
    q = {"client_id": CLIENT_ID, "redirect_uri": redirect_uri(), "response_type": "code", "scope": SCOPE,
         "access_type": "offline", "prompt": "consent", "include_granted_scopes": "false", "state": state}
    return AUTH_URL + "?" + urllib.parse.urlencode(q)


def exchange(code: str) -> dict:
    st, j = http("POST", TOKEN_URL, {"code": code, "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                                     "redirect_uri": redirect_uri(), "grant_type": "authorization_code"}, form=True)
    if st != 200 or not j.get("refresh_token"):
        raise GoogleError(st, j.get("error_description") or j.get("error") or "Google no entregó el permiso")
    if SCOPE not in (j.get("scope") or SCOPE):
        raise GoogleError(400, "No se concedió el permiso de calendario")
    return j


def access_token(link: GoogleLink) -> str:
    with _lock:
        cached = _tokens.get(link.user_id)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
    rt = decrypt(link.token)["refresh_token"]
    st, j = http("POST", TOKEN_URL, {"refresh_token": rt, "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
                                     "grant_type": "refresh_token"}, form=True)
    if st != 200 or not j.get("access_token"):
        raise GoogleError(401, "Google rechazó el permiso; reconecte la cuenta" if j.get("error") == "invalid_grant" else (j.get("error") or "Error de Google"))
    with _lock:
        _tokens[link.user_id] = (j["access_token"], time.time() + int(j.get("expires_in", 3600)))
    return j["access_token"]


def create_calendar(token: str) -> str:
    st, j = http("POST", API + "/calendars", {"summary": CAL_NAME, "timeZone": TZ,
                                              "description": "Citas creadas desde Alter-Karute. No contiene información clínica."}, token=token)
    if st not in (200, 201) or not j.get("id"):
        raise GoogleError(st, (j.get("error") or {}).get("message", "No se pudo crear el calendario"))
    return j["id"]


def event_id(user_id: int, appt_id: str) -> str:
    # Google admite ids propios con caracteres a-v y 0-9; un hash hexadecimal cumple.
    return "hc" + hashlib.sha1(f"{user_id}:{appt_id}".encode()).hexdigest()


def label(p: dict | None, detail: str) -> str:
    if detail == "oculto" or not p:
        return "Cita de psicología"
    if detail == "nombre":
        return "Cita · " + " ".join(x for x in (p.get("nombres"), p.get("apellidos")) if x).strip()
    ini = "".join(w[0].upper() + "." for w in f"{p.get('nombres', '')} {p.get('apellidos', '')}".split()[:3])
    return "Cita · " + (ini or "paciente")


def event_body(eid: str, a: dict, p: dict | None, detail: str) -> dict | None:
    try:
        start = datetime.fromisoformat(str(a.get("startAt", "")).replace("Z", "+00:00"))
    except ValueError:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(minutes=int(a.get("duracion") or 50))
    return {"id": eid, "summary": label(p, detail), "location": a.get("modalidad") or "",
            "description": "Cita registrada en Alter-Karute.",
            "start": {"dateTime": start.isoformat(), "timeZone": TZ}, "end": {"dateTime": end.isoformat(), "timeZone": TZ},
            "status": "confirmed", "transparency": "opaque"}


def _sync_one(token: str, link: GoogleLink, appt_id: str, a: dict | None, p: dict | None) -> None:
    eid = event_id(link.user_id, appt_id)
    cal = urllib.parse.quote(link.calendar_id, safe="")
    url = f"{API}/calendars/{cal}/events/{eid}"
    if not a or a.get("estado") == "Cancelada":
        st, j = http("DELETE", url, token=token)
        if st not in (200, 204, 404, 410):
            raise GoogleError(st, (j.get("error") or {}).get("message", "No se pudo borrar el evento"))
        return
    body = event_body(eid, a, p, link.detail)
    if not body:
        return
    st, j = http("PUT", url, body, token=token)
    if st == 404:
        st, j = http("POST", f"{API}/calendars/{cal}/events", body, token=token)
    if st not in (200, 201):
        raise GoogleError(st, (j.get("error") or {}).get("message", "No se pudo guardar el evento"))


def _record(db, user_id: int, rid: str | None) -> dict | None:
    row = db.get(Record, (user_id, rid)) if rid else None
    return decrypt(row.payload) if row else None


def sync(user_id: int, appt_ids: list[str] | None = None, everything: bool = False) -> int:
    """Copia a Google las citas indicadas (o todas desde hace 30 días). Guarda el error, si lo hay, en el vínculo."""
    if not enabled():
        return 0
    with SessionLocal() as db:
        link = db.get(GoogleLink, user_id)
        if not link or not link.calendar_id:
            return 0
        n = 0
        try:
            token = access_token(link)
            if everything:
                since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
                rows = db.scalars(select(Record).where(Record.user_id == user_id, Record.kind == "appt"))
                items = [(r.id, decrypt(r.payload)) for r in rows]
                items = [(i, a) for i, a in items if str(a.get("startAt", "")) >= since[:10]]
            else:
                items = [(i, _record(db, user_id, i)) for i in (appt_ids or [])]
            pats: dict[str, dict | None] = {}
            for aid, a in items:
                pid = (a or {}).get("patientId")
                if pid not in pats:
                    pats[pid] = _record(db, user_id, pid)
                _sync_one(token, link, aid, a, pats[pid])
                n += 1
            link.last_error = ""
            link.last_sync = datetime.now(timezone.utc)
        except GoogleError as e:
            link.last_error = str(e)[:300]
        except Exception:  # sin red, etc.: se reintenta en la próxima sincronización
            link.last_error = "No se pudo comunicar con Google"
        db.commit()
        return n


def patient_appts(user_id: int, patient_id: str) -> list[str]:
    with SessionLocal() as db:
        return [r.id for r in db.scalars(select(Record).where(Record.user_id == user_id, Record.kind == "appt", Record.patient_id == patient_id))]


def revoke(link: GoogleLink) -> None:
    try:
        http("POST", REVOKE_URL, {"token": decrypt(link.token)["refresh_token"]}, form=True)
    except Exception:
        pass
    with _lock:
        _tokens.pop(link.user_id, None)
