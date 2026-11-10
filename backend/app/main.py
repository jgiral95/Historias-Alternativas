import base64
import hashlib
import json
import re
import secrets
import threading
import time
import urllib.parse
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

import jwt

from .config import (FILE_UNDO_MINUTES, IDLE_MINUTES, MAX_FILE_BYTES, MAX_RECORD_BYTES,
                     MIN_PASSWORD, SESSION_HOURS, SESSION_SECRET)
from . import compress, firmas, gcal, reminders, survey
from .config import BETA_COMENTARIOS, PUBLIC_URL, RECIFRAR_AL_ARRANCAR, SURVEY_SCHEDULER, TRUSTED_DEVICE_DAYS
from .db import (TrustedDevice, ApptReminder, Audit, ConsentRequest, Feedback, Blob, Feed, GoogleLink, MailAccount, Record, SessionLocal, SurveyInvite, SurveyOptOut, SurveyResponse,
                 User, Verification, init_db)
from .security import (DUMMY_HASH, check_password, decrypt, decrypt_bytes, encrypt, encrypt_bytes,
                       recovery_hash, recovery_new, totp_check, totp_new_secret,
                       hash_password, make_token, read_token)

COOKIE = "ac_session"
DEVICE_COOKIE = "ac_device"  # dispositivo de confianza (solo viaja a /api/auth)
DEVICE_PATH = "/api/auth"
MAX_DEVICES = 20
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "archivo-clinico"
KINDS = {"profile", "patient", "note", "report", "appt", "file", "scale", "pnote"}  # pnote: notas de proceso (fuera de la historia)
PREFIX = {"patient": "p_", "note": "n_", "report": "r_", "appt": "a_", "file": "f_", "scale": "e_", "pnote": "pn_"}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
VERIF_RE = re.compile(r"^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if RECIFRAR_AL_ARRANCAR:
        from . import recifrar
        recifrar.start()
    if SURVEY_SCHEDULER:
        survey.start_scheduler()
    yield
    survey.stop_scheduler()


def csrf_check(request: Request) -> None:
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get(CSRF_HEADER) != CSRF_VALUE:
            raise HTTPException(403, "Solicitud no permitida")


app = FastAPI(title="Alter-Karute API", docs_url=None, redoc_url=None, openapi_url=None,
              lifespan=lifespan, dependencies=[Depends(csrf_check)])



def _iso(d):
    """Fecha en ISO con zona: SQLite pierde la zona y el navegador la leería como hora local."""
    if not d:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    if "cache-control" not in response.headers:  # todo es privado y no se guarda, salvo lo que diga otra cosa (tablas públicas)
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def audit(db: Session, user_id: int | None, action: str, detail: str = "", patient_id: str | None = None, ip: str | None = None) -> None:
    db.add(Audit(user_id=user_id, action=action, detail=detail[:160], patient_id=(patient_id or None) and str(patient_id)[:64], ip=(ip or None) and ip[:64]))
    db.commit()


def client_ip(request: Request) -> str:
    return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")


def set_session(request: Request, response: Response, user_id: int, exp: int | None = None) -> None:
    response.set_cookie(COOKIE, make_token(user_id, exp), httponly=True, samesite="strict", path="/",
                        secure=request.headers.get("x-forwarded-proto") == "https",
                        max_age=SESSION_HOURS * 3600)


def current_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    tok = read_token(request.cookies.get(COOKIE))
    user = db.get(User, tok["sub"]) if tok else None
    if not user or not user.active:
        raise HTTPException(401, "Sesión no válida")
    if user.owner_id:  # la subcuenta deja de funcionar si el terapeuta está inactivo
        owner = db.get(User, user.owner_id)
        if not owner or not owner.active:
            raise HTTPException(401, "Sesión no válida")
    idle = time.time() - tok.get("act", 0)
    if idle > IDLE_MINUTES * 60:
        response.delete_cookie(COOKIE, path="/")
        raise HTTPException(401, "Su sesión se cerró por inactividad")
    if idle > 60:  # sesión deslizante: renueva la marca de actividad
        set_session(request, response, user.id, tok["exp"])
    if user.must_change_password and request.url.path not in PASSWORD_FIRST_OK:
        raise HTTPException(403, "Debe elegir su propia contraseña antes de continuar")
    return user


# Mientras la persona no elija su propia contraseña, solo puede usar esto.
PASSWORD_FIRST_OK = {"/api/auth/me", "/api/auth/password", "/api/auth/logout", "/api/time"}


def pro_user(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
    """Funciones del terapeuta. Las subcuentas de equipo solo usan los datos de consultantes y la agenda."""
    if user.role == "asistente":
        audit(db, user.id, "access.denied", f"{request.method} {request.url.path}", ip=client_ip(request))
        raise HTTPException(403, "Su cuenta de equipo no tiene acceso a esta función")
    return user


def owner_id(user: User) -> int:
    return user.owner_id or user.id


def require_admin(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
    if user.role != "admin":
        audit(db, user.id, "access.denied", f"{request.method} {request.url.path}", ip=client_ip(request))
        raise HTTPException(403, "Solo para administradores")
    return user


def user_out(u: User, owner: User | None = None) -> dict:
    out = {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "active": u.active, "totp": bool(u.totp_enabled),
           "cambiarClave": bool(u.must_change_password)}
    if u.owner_id:
        out["ownerId"] = u.owner_id
        out["tieneFirma"] = bool(u.profile and decrypt(u.profile).get("firma"))
        if owner:
            out["ownerName"] = owner.name
    return out


# ---------- Autenticación ----------
_fails: dict[str, list[float]] = {}
_lock = threading.Lock()
WINDOW = 15 * 60


def _recent(key: str) -> list[float]:
    cutoff = time.time() - WINDOW
    _fails[key] = [t for t in _fails.get(key, []) if t > cutoff]
    return _fails[key]


def _locked(email: str, ip: str) -> bool:
    with _lock:
        return len(_recent(f"{email}|{ip}")) >= 5 or len(_recent(email)) >= 20


def _register_fail(email: str, ip: str) -> None:
    with _lock:
        _recent(f"{email}|{ip}").append(time.time())
        _recent(email).append(time.time())


class LoginIn(BaseModel):
    email: str
    password: str


def _device_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _device_label(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    os_ = next((n for k, n in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
                               ("Mac OS", "Mac"), ("Linux", "Linux")) if k in ua), "")
    br = next((n for k, n in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"),
                              ("Safari/", "Safari")) if k in ua), "")
    return " · ".join(x for x in (br, os_) if x)[:120]


def _set_device_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(DEVICE_COOKIE, token, httponly=True, samesite="strict", path=DEVICE_PATH,
                        secure=request.headers.get("x-forwarded-proto") == "https", max_age=TRUSTED_DEVICE_DAYS * 86400)


def _trusted_device(request: Request, response: Response, db: Session, user: User) -> bool:
    """¿Este navegador ya verificó el segundo paso y se ha usado en los últimos TRUSTED_DEVICE_DAYS días?"""
    token = request.cookies.get(DEVICE_COOKIE) or ""
    if not TRUSTED_DEVICE_DAYS or not token or len(token) > 100:
        return False
    dev = db.scalar(select(TrustedDevice).where(TrustedDevice.token_hash == _device_hash(token)))
    if not dev or dev.user_id != user.id:
        return False
    last = dev.last_used if dev.last_used.tzinfo else dev.last_used.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - last > timedelta(days=TRUSTED_DEVICE_DAYS):
        db.delete(dev)
        db.commit()
        response.delete_cookie(DEVICE_COOKIE, path=DEVICE_PATH)
        return False
    dev.last_used = datetime.now(timezone.utc)  # sin uso por más tiempo, se vuelve a pedir el código
    db.commit()
    _set_device_cookie(request, response, token)
    return True


def _remember_device(request: Request, response: Response, db: Session, user: User) -> None:
    token = secrets.token_urlsafe(32)
    old = request.cookies.get(DEVICE_COOKIE)
    if old and len(old) <= 100:  # el mismo navegador no acumula registros
        db.execute(delete(TrustedDevice).where(TrustedDevice.token_hash == _device_hash(old)))
    db.add(TrustedDevice(user_id=user.id, token_hash=_device_hash(token), label=_device_label(request)))
    db.commit()
    keep = db.scalars(select(TrustedDevice.id).where(TrustedDevice.user_id == user.id)
                      .order_by(TrustedDevice.last_used.desc()).limit(MAX_DEVICES)).all()
    db.execute(delete(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.id.not_in(keep)))
    db.commit()
    _set_device_cookie(request, response, token)


def forget_devices(db: Session, user_id: int) -> int:
    """Olvida todos los dispositivos de confianza de la persona (cambio de contraseña, de la verificación, etc.)."""
    n = db.execute(delete(TrustedDevice).where(TrustedDevice.user_id == user_id)).rowcount or 0
    db.commit()
    return n


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "?"
    if _locked(email, ip):
        raise HTTPException(429, "Demasiados intentos. Espere unos minutos e intente de nuevo.")
    user = db.scalar(select(User).where(User.email == email))
    ok = check_password(user.password_hash if user else DUMMY_HASH, body.password)
    if not (user and user.active and ok):
        _register_fail(email, ip)
        audit(db, user.id if user else None, "login.fail", email, ip=client_ip(request))
        raise HTTPException(401, "Correo o contraseña incorrectos")
    if user.totp_enabled and _trusted_device(request, response, db, user):
        set_session(request, response, user.id)
        audit(db, user.id, "login.ok", "dispositivo de confianza", ip=client_ip(request))
        return {**user_out(user, db.get(User, user.owner_id) if user.owner_id else None), "idle_minutes": IDLE_MINUTES,
                "comentarios": BETA_COMENTARIOS}
    if user.totp_enabled:
        # contraseña correcta: falta el código. El «ticket» dura 5 minutos y no abre sesión por sí solo.
        audit(db, user.id, "login.password_ok")
        ticket = jwt.encode({"sub": str(user.id), "p": "2fa", "exp": int(time.time()) + 300}, SESSION_SECRET, algorithm="HS256")
        return {"need_2fa": True, "ticket": ticket, "remember_days": TRUSTED_DEVICE_DAYS}
    set_session(request, response, user.id)
    audit(db, user.id, "login.ok", ip=client_ip(request))
    return {**user_out(user, db.get(User, user.owner_id) if user.owner_id else None), "idle_minutes": IDLE_MINUTES,
            "comentarios": BETA_COMENTARIOS}


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str


SIGNUPS_POR_IP = 3  # cuentas nuevas por IP cada 24 horas
_signups: dict[str, list[float]] = {}


def _signup_limit(ip: str) -> bool:
    """True si esta IP ya creó demasiadas cuentas hoy; si no, cuenta esta."""
    with _lock:
        cutoff = time.time() - 86400
        hits = [t for t in _signups.get(ip, []) if t > cutoff]
        if len(hits) >= SIGNUPS_POR_IP:
            _signups[ip] = hits
            return True
        hits.append(time.time())
        _signups[ip] = hits
        return False


@app.post("/api/auth/register", status_code=202)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    """Cuenta nueva con correo: los datos viajan firmados en el enlace y la cuenta se crea al confirmar el correo."""
    email, name, ip = body.email.strip().lower(), body.name.strip()[:200], client_ip(request)
    if not name:
        raise HTTPException(400, "Escriba su nombre")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Correo no válido")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    acc = survey.server_account()
    if not survey.smtp_enabled(acc):
        raise HTTPException(503, "El envío de correos no está disponible por ahora. Intente más tarde.")
    if _locked(email, ip):
        raise HTTPException(429, "Demasiados intentos. Espere unos minutos e intente de nuevo.")
    _register_fail(email, ip)
    if not db.scalar(select(User).where(User.email == email)):  # si ya existe no se revela: la respuesta es la misma
        tok = jwt.encode({"p": "reg", "e": email, "n": name, "h": hash_password(body.password), "exp": int(time.time()) + 86400},
                         SESSION_SECRET, algorithm="HS256")
        try:
            survey.send_verify(email, name, f"{acc.get('base') or PUBLIC_URL}/app?verificar={tok}", acc)
        except Exception:
            raise HTTPException(502, "No se pudo enviar el correo. Revise la dirección e intente de nuevo.")
    return {"ok": True}


class VerifyIn(BaseModel):
    token: str


@app.post("/api/auth/verify")
def verify_email(body: VerifyIn, request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        t = jwt.decode(body.token, SESSION_SECRET, algorithms=["HS256"])
        assert t.get("p") == "reg"
    except Exception:
        raise HTTPException(400, "El enlace venció o no es válido. Cree la cuenta de nuevo.")
    if db.scalar(select(User).where(User.email == t["e"])):  # el enlace sirve una sola vez: no vuelve a abrir sesión
        raise HTTPException(409, "Su cuenta ya está activa: ingrese con su correo y contraseña.")
    if _signup_limit(client_ip(request) or "?"):
        raise HTTPException(429, "Se crearon demasiadas cuentas desde esta conexión hoy. Intente de nuevo mañana.")
    user = User(email=t["e"], name=t["n"], password_hash=t["h"], role="user")
    db.add(user)
    db.commit()
    audit(db, user.id, "user.create", f"{user.email} (correo verificado)", ip=client_ip(request))
    set_session(request, response, user.id)
    audit(db, user.id, "login.ok", "verificación de correo", ip=client_ip(request))
    return {**user_out(user, None), "idle_minutes": IDLE_MINUTES, "comentarios": BETA_COMENTARIOS}


def _second_factor(db: Session, user: User, code: str) -> bool:
    """Acepta un código de la app autenticadora (una sola vez) o un código de recuperación (se gasta)."""
    secret = decrypt(user.totp_secret)["s"] if user.totp_secret else None
    if not secret:
        return False
    step = totp_check(secret, code, user.totp_last)
    if step is not None:
        user.totp_last = step
        db.commit()
        return True
    codes = json.loads(user.recovery_codes or "[]")
    h = recovery_hash(code)
    if h in codes:
        codes.remove(h)
        user.recovery_codes = json.dumps(codes)
        db.commit()
        audit(db, user.id, "2fa.recovery_used", f"quedan {len(codes)}")
        return True
    return False


class TwoFAIn(BaseModel):
    ticket: str
    code: str
    remember: bool = False


@app.post("/api/auth/2fa/login")
def login_2fa(body: TwoFAIn, request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        t = jwt.decode(body.ticket, SESSION_SECRET, algorithms=["HS256"])
        assert t.get("p") == "2fa"
        user = db.get(User, int(t["sub"]))
    except Exception:
        raise HTTPException(401, "El ingreso venció. Escriba de nuevo su correo y contraseña.")
    ip = request.client.host if request.client else "?"
    if not user or not user.active or not user.totp_enabled:
        raise HTTPException(401, "El ingreso venció. Escriba de nuevo su correo y contraseña.")
    if _locked(user.email, ip):
        raise HTTPException(429, "Demasiados intentos. Espere unos minutos e intente de nuevo.")
    if not _second_factor(db, user, body.code):
        _register_fail(user.email, ip)
        audit(db, user.id, "login.2fa_fail")
        raise HTTPException(401, "El código no es válido o ya se usó")
    set_session(request, response, user.id)
    if body.remember and TRUSTED_DEVICE_DAYS:
        _remember_device(request, response, db, user)
    audit(db, user.id, "login.ok", "2fa" + (" · recordó el dispositivo" if body.remember and TRUSTED_DEVICE_DAYS else ""), ip=client_ip(request))
    return {**user_out(user, db.get(User, user.owner_id) if user.owner_id else None), "idle_minutes": IDLE_MINUTES,
            "comentarios": BETA_COMENTARIOS}


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")


@app.get("/api/auth/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {**user_out(user, db.get(User, user.owner_id) if user.owner_id else None), "idle_minutes": IDLE_MINUTES,
            "comentarios": BETA_COMENTARIOS}


class PasswordIn(BaseModel):
    current: str
    new: str


@app.post("/api/auth/password", status_code=204)
def change_password(body: PasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not check_password(user.password_hash, body.current):
        raise HTTPException(400, "La contraseña actual no es correcta")
    if len(body.new) < MIN_PASSWORD:
        raise HTTPException(400, f"La nueva contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    if body.new == body.current:
        raise HTTPException(400, "La nueva contraseña debe ser distinta de la actual")
    user.password_hash = hash_password(body.new)
    user.must_change_password = False
    db.add(user)
    db.commit()
    forget_devices(db, user.id)
    audit(db, user.id, "password.change")


# ---------- Administración de usuarios ----------
class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"


class UserPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None
    password: str | None = None
    reset_2fa: bool | None = None


@app.get("/api/admin/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = list(db.scalars(select(User).order_by(User.name)))
    by_id = {u.id: u for u in users}
    return [user_out(u, by_id.get(u.owner_id)) for u in users]


@app.post("/api/admin/users", status_code=201)
def create_user(body: UserCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Correo no válido")
    if not body.name.strip():
        raise HTTPException(400, "Escriba el nombre")
    if body.role not in ("admin", "user"):
        raise HTTPException(400, "Rol no válido")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ya existe un usuario con ese correo")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), role=body.role, must_change_password=True)
    db.add(user)
    db.commit()
    audit(db, admin.id, "user.create", f"{email} ({body.role})")
    return user_out(user)


@app.patch("/api/admin/users/{uid}")
def patch_user(uid: int, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, uid)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    new_role = body.role if body.role is not None else user.role
    new_active = body.active if body.active is not None else user.active
    if new_role not in ("admin", "user") and not (user.role == "asistente" and new_role == "asistente"):
        raise HTTPException(400, "Rol no válido")
    if user.id == admin.id and (new_role != "admin" or not new_active):
        raise HTTPException(400, "No puede quitarse el rol de administrador ni desactivar su propia cuenta")
    if user.role == "admin" and user.active and (new_role != "admin" or not new_active):
        others = db.scalar(select(func.count()).select_from(User).where(
            User.role == "admin", User.active.is_(True), User.id != user.id))
        if not others:
            raise HTTPException(400, "Debe quedar al menos un administrador activo")
    if body.password is not None:
        if len(body.password) < MIN_PASSWORD:
            raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
        user.password_hash = hash_password(body.password)
        user.must_change_password = True
        forget_devices(db, user.id)
    if body.reset_2fa:
        user.totp_enabled, user.totp_secret, user.totp_last, user.recovery_codes = False, None, None, None
        forget_devices(db, user.id)
        audit(db, admin.id, "2fa.reset_by_admin", f"id={user.id}")
    if body.name is not None and body.name.strip():
        user.name = body.name.strip()
    user.role, user.active = new_role, new_active
    db.add(user)
    db.commit()
    audit(db, admin.id, "user.update", f"id={user.id}")
    return user_out(user)


@app.get("/api/time")
def server_time():
    """Hora del servidor, para que las firmas usen la hora legal y no la del equipo del usuario."""
    return {"now": datetime.now(timezone.utc).isoformat()}


# ---------- Registros (siempre del usuario autenticado) ----------
def _append_only(old: dict, new: dict, what: str) -> None:
    """Un documento firmado no cambia: solo puede crecer la lista de adendas."""
    o = {k: v for k, v in old.items() if k != "addenda"}
    n = {k: v for k, v in new.items() if k != "addenda"}
    oa, na = old.get("addenda") or [], new.get("addenda") or []
    if o != n or na[:len(oa)] != oa:
        raise HTTPException(409, f"{what} ya está firmado y no se puede modificar; solo se pueden agregar adendas")


def _grow_only(old: list, new: list, extra: str, what: str) -> None:
    """La lista solo crece; a un elemento existente solo se le puede agregar la clave `extra` una vez."""
    if len(new) < len(old):
        raise HTTPException(409, f"{what} no se pueden quitar")
    for o, n in zip(old, new):
        if o == n:
            continue
        if extra in o or {k: v for k, v in n.items() if k != extra} != o:
            raise HTTPException(409, f"{what} firmados no se pueden modificar")


SIGN_TOLERANCE = timedelta(minutes=10)


def _new_signatures(kind: str, old: dict | None, new: dict) -> list:
    """Horas de firma que aparecen por primera vez en este guardado."""
    old = old or {}
    out = []
    if kind in ("note", "report", "scale") and new.get("signedAt") and not old.get("signedAt"):
        out.append(new["signedAt"])
    if kind == "patient":
        ni, oi = new.get("intake") or {}, old.get("intake") or {}
        if ni.get("signedAt") and not oi.get("signedAt"):
            out.append(ni["signedAt"])
        for key in ("consents", "cierres", "incorporaciones"):
            o, n = old.get(key) or [], new.get(key) or []
            out += [x.get("signedAt") for x in n[len(o):]]
            if key == "consents":
                out += [(nx.get("revocacion") or {}).get("signedAt") for ox, nx in zip(o, n) if nx.get("revocacion") and not ox.get("revocacion")]
    return out


def _check_clock(stamps: list) -> None:
    """Las firmas deben llevar la hora del servidor (sincronizado con la hora legal), no la del equipo del usuario."""
    now = datetime.now(timezone.utc)
    for ts in stamps:
        try:
            t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "La hora de la firma no es válida")
        if abs(now - t) > SIGN_TOLERANCE:
            raise HTTPException(400, "La hora de la firma no coincide con la hora del servidor. Recargue la página e intente de nuevo.")


def _check_dx(doc: dict) -> None:
    """Impresiones o motivos de seguimiento: texto libre (sin clasificaciones oficiales)."""
    dx = doc.get("diagnosticos")
    if dx is None:
        return
    if not isinstance(dx, list) or len(dx) > 12:
        raise HTTPException(400, "Lista de impresiones no válida")
    for d in dx:
        if not (isinstance(d, dict) and str(d.get("nombre") or "").strip()) or len(str(d.get("nombre"))) > 300:
            raise HTTPException(400, "Cada impresión debe tener un texto (máx. 300 caracteres)")


# ---------- Datos del paciente: identidad inamovible, fecha de apertura y registro de cambios ----------
CLINICAL_KEYS = {"consents", "intake", "cierres", "solicitudes", "incorporaciones"}
DATA_TIPO = "Autorización de uso de datos personales"
REMOTE_MODS = {"Virtual", "Telefónica"}


def consent_agenda(pat: dict) -> dict:
    """Qué modalidades de cita cubren los consentimientos vigentes del consultante.
    Teleterapia: el tipo o el texto la mencionan. Presencial: cualquier consentimiento de atención que no sea solo de teleterapia."""
    ok = [c for c in pat.get("consents") or [] if c.get("tipo") != DATA_TIPO and (c.get("revocacion") or {}).get("alcance") != "Total"]
    tele = any("tele" in str(c.get("tipo") or "").lower() or "TELETERAPIA" in str(c.get("text") or "").upper() for c in ok)
    pres = any(not str(c.get("tipo") or "").startswith("Teleterapia") for c in ok)
    return {"presencial": pres, "distancia": tele}


def _check_appt_consent(db: Session, oid: int, old: dict | None, new: dict) -> None:
    if (new.get("estado") or "Programada") != "Programada":
        return
    if old and (old.get("estado") or "Programada") == "Programada" and old.get("patientId") == new.get("patientId") and old.get("modalidad") == new.get("modalidad"):
        return  # mover una cita ya programada no exige volver a revisar
    prow = db.get(Record, (oid, new.get("patientId") or ""))
    if not prow or prow.kind != "patient":
        raise HTTPException(400, "Consultante no válido")
    ca = consent_agenda(decrypt(prow.payload))
    remote = new.get("modalidad") in REMOTE_MODS
    if not ca["distancia" if remote else "presencial"]:
        raise HTTPException(400, "El consultante tiene pendiente el consentimiento informado de teleterapia: fírmelo antes de agendar una cita virtual o telefónica"
                            if remote else "El consultante tiene pendiente el consentimiento informado de atención presencial: fírmelo antes de agendar la cita")
IDENTITY_KEYS = {"nombres": "Nombres", "apellidos": "Apellidos", "tipoDoc": "Tipo de documento", "documento": "Número de documento",
                 "nacimiento": "Fecha de nacimiento", "paisNac": "País de nacimiento"}
SERVER_KEYS = {"abiertaEl", "cambios", "firmasCambios"}
SIG_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")


def _signer(db: Session, user: User) -> dict:
    """Quién firma el cambio: nombre, rol, registro, cédula y firma (copias del momento)."""
    if user.role == "asistente":
        prof = decrypt(user.profile) if user.profile else {}
        return {"por": user.name, "rol": "Equipo", "tp": "", "cc": str(prof.get("documento") or ""), "firma": prof.get("firma") or ""}
    row = db.get(Record, (owner_id(user), "profile"))
    prof = decrypt(row.payload) if row else {}
    return {"por": prof.get("nombre") or user.name, "rol": "Terapeuta", "tp": str(prof.get("registro") or ""),
            "cc": str(prof.get("cedula") or ""), "firma": prof.get("firma") or ""}


def _opened_from(doc: dict) -> str | None:
    """Fecha de apertura de una historia anterior a este registro: su documento más antiguo."""
    ds = [c.get("signedAt") for c in doc.get("consents") or []] + [(doc.get("intake") or {}).get("sessionAt")]
    ds += [i.get("desde") for i in doc.get("incorporaciones") or []] + [i.get("signedAt") for i in doc.get("incorporaciones") or []]
    ds = sorted(str(d) for d in ds if d)
    return ds[0] if ds else None


def _patient_rules(old: dict | None, new: dict, user: User, restoring: bool, signer: dict | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    if restoring:  # copia de respaldo: se respeta lo que trae
        return new
    if old:
        for k, label in IDENTITY_KEYS.items():
            if str(old.get(k) or "").strip() and new.get(k) != old.get(k):
                raise HTTPException(409, f"«{label}» no se puede cambiar una vez guardado")
    new = {k: v for k, v in new.items() if k not in SERVER_KEYS}
    new["abiertaEl"] = (old or {}).get("abiertaEl") or (_opened_from(old) if old else None) or now
    log = list((old or {}).get("cambios") or [])
    signer = signer or {"por": user.name, "rol": "Equipo" if user.role == "asistente" else "Terapeuta"}
    who = {"por": signer["por"], "rol": signer["rol"], "at": now}
    if signer.get("tp"):
        who["tp"] = signer["tp"][:40]
    if signer.get("cc"):
        who["cc"] = signer["cc"][:40]
    sigs = dict((old or {}).get("firmasCambios") or {})
    f = signer.get("firma") or ""
    if f and SIG_RE.match(f) and len(f) < 400_000:  # cada firma se guarda una vez por consultante
        key = hashlib.sha256(f.encode()).hexdigest()[:16]
        sigs.setdefault(key, f)
        who["firma"] = key
    if not old:
        log.append({**who, "creado": True})
    else:
        keys = sorted((set(old) | set(new)) - CLINICAL_KEYS - SERVER_KEYS - {"id", "kind"})
        scalar = lambda v: v is None or isinstance(v, (str, int, float, bool))  # noqa: E731
        diff = [{"campo": k, "antes": old.get(k), "despues": new.get(k)} for k in keys
                if scalar(old.get(k)) and scalar(new.get(k)) and (old.get(k) or "") != (new.get(k) or "")]
        if diff:
            log.append({**who, "campos": diff})
    new["cambios"] = log[-500:]
    used = {e.get("firma") for e in new["cambios"]}
    new["firmasCambios"] = {k: v for k, v in sigs.items() if k in used}
    return new


def _keep_remote(old: dict, new: dict) -> tuple[dict, bool]:
    """Un consentimiento firmado a distancia llega a la historia mientras el terapeuta puede tenerla abierta.
    Si un guardado viene sin él (pantalla desactualizada), se conserva en su lugar en vez de rechazar el guardado."""
    oc, nc = old.get("consents") or [], new.get("consents") or []
    ids = {(c.get("remoto") or {}).get("id") for c in nc if isinstance(c, dict)}
    missing = [c for c in oc if (c.get("remoto") or {}).get("id") and c["remoto"]["id"] not in ids]
    if not missing:
        return new, False
    rest, out = iter(nc), []
    for c in oc:
        if c in missing:
            out.append(c)
        else:
            nxt = next(rest, None)
            if nxt is not None:
                out.append(nxt)
    out += list(rest)
    return {**new, "consents": out}, True


# ---------- Folio por tipo de registro y número de sesión  ----------
FOLIO_KEYS = ("folio", "sesion")


def _keep_folios(kind: str, old: dict | None, new: dict) -> None:
    """El folio y la sesión los pone el servidor: si el navegador guarda sin ellos, se conservan los que había."""
    if not old:
        return
    if kind in ("note", "report", "scale"):
        for k in FOLIO_KEYS:
            if k in old and k not in new:
                new[k] = old[k]
    if kind == "patient":
        oi, ni = old.get("intake") or {}, new.get("intake")
        if isinstance(ni, dict):
            for k in FOLIO_KEYS:
                if k in oi and k not in ni:
                    ni[k] = oi[k]
        for key in ("consents", "cierres"):
            for o, n in zip(old.get(key) or [], new.get(key) or []):
                if isinstance(n, dict) and "folio" in o and "folio" not in n:
                    n["folio"] = o["folio"]


def _signed_count(db: Session, oid: int, patient_id: str, kind: str, exclude: str) -> int:
    rows = db.scalars(select(Record).where(Record.user_id == oid, Record.patient_id == patient_id, Record.kind == kind, Record.id != exclude))
    return sum(1 for r in rows if decrypt(r.payload).get("signedAt"))


def _assign_folios(db: Session, oid: int, kind: str, rid: str, old: dict | None, new: dict) -> bool:
    """Numera cada documento al firmarlo: consecutivo por tipo de registro dentro de la historia del consultante.
    Las sesiones llevan además el número de sesión (la primera vez es la sesión 1). Devuelve si asignó alguno."""
    old = old or {}
    done = False
    if kind in ("note", "report", "scale") and new.get("signedAt") and not old.get("signedAt"):
        pid = new.get("patientId") or ""
        new["folio"] = _signed_count(db, oid, pid, kind, rid) + 1
        if kind == "note":
            prow = db.get(Record, (oid, pid))
            pat = decrypt(prow.payload) if prow else {}
            first = 1 if ((pat.get("intake") or {}).get("signedAt") or pat.get("incorporaciones")) else 0
            new["sesion"] = new["folio"] + first
        done = True
    if kind == "patient":
        ni, oi = new.get("intake"), old.get("intake") or {}
        if isinstance(ni, dict) and ni.get("signedAt") and not oi.get("signedAt"):
            ni["folio"], ni["sesion"] = 1, 1
            done = True
        for key in ("consents", "cierres"):
            lst, n0 = new.get(key) or [], len(old.get(key) or [])
            for i, item in enumerate(lst[n0:], start=n0):
                if isinstance(item, dict) and item.get("signedAt"):
                    item["folio"] = i + 1
                    done = True
    return done


def _same_document(db: Session, oid: int, rid: str, doc) -> str | None:
    """Una sola historia por persona: nombre del consultante que ya tiene ese documento."""
    d = firmas.norm_doc(doc)
    if len(d) < 3:
        return None
    for r in db.scalars(select(Record).where(Record.user_id == oid, Record.kind == "patient", Record.id != rid)):
        x = decrypt(r.payload)
        if firmas.norm_doc(x.get("documento")) == d:
            return " ".join(v for v in (x.get("nombres"), x.get("apellidos")) if v) or "otro consultante"
    return None


def _check_immutable(kind: str, old: dict | None, new: dict) -> None:
    if kind == "file" and old is not None and old != new:
        raise HTTPException(409, "Un adjunto no se puede modificar")
    if kind in ("note", "report", "scale"):
        if old is None and not new.get("signedAt"):
            raise HTTPException(400, "El documento debe guardarse firmado")
        if kind == "note" and new.get("signedAt") and not (old or {}).get("signedAt"):
            _check_dx(new)
        if old and old.get("signedAt"):
            _append_only(old, new, "El documento")
    elif kind == "patient" and old:
        _grow_only(old.get("consents") or [], new.get("consents") or [], "revocacion", "Los consentimientos")
        _grow_only(old.get("solicitudes") or [], new.get("solicitudes") or [], "entrega", "Los registros de solicitud de copia")
        oinc, ninc = old.get("incorporaciones") or [], new.get("incorporaciones") or []
        if ninc[:len(oinc)] != oinc:
            raise HTTPException(409, "Las constancias de incorporación firmadas no se pueden modificar")
        ok_, nk = old.get("cierres") or [], new.get("cierres") or []
        if nk[:len(ok_)] != ok_:
            raise HTTPException(409, "Las notas de cierre firmadas no se pueden modificar")
    if kind == "patient":
        ni = new.get("intake") or {}
        if ni.get("signedAt") and not ((old or {}).get("intake") or {}).get("signedAt"):
            _check_dx(ni)
    if kind == "patient" and old:
        oi = old.get("intake")
        if oi and oi.get("signedAt"):
            ni = new.get("intake")
            if not ni:
                raise HTTPException(409, "La consulta de primera vez ya está firmada y no se puede modificar")
            _append_only(oi, ni, "El documento de primera vez")


@app.get("/api/records")
def list_records(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    audit(db, user.id, "records.list", ip=client_ip(request))
    rows = db.scalars(select(Record).where(Record.user_id == owner_id(user)))
    if user.role != "asistente":
        return [decrypt(r.payload) for r in rows]
    # Subcuenta de equipo: solo datos de consultantes (sin acceso a lo que se habla en sesión), la agenda y lo mínimo del perfil.
    out = []
    for r in rows:
        if r.kind == "patient":
            pat = decrypt(r.payload)
            out.append({**{k: v for k, v in pat.items() if k not in CLINICAL_KEYS}, "consentAgenda": consent_agenda(pat)})
        elif r.kind == "appt":
            out.append(decrypt(r.payload))
        elif r.kind == "profile":
            pr = decrypt(r.payload)
            out.append({"id": "profile", "kind": "profile", "nombre": pr.get("nombre"), "consultorio": pr.get("consultorio"),
                        "formatos": {"datos": (pr.get("formatos") or {}).get("datos") or [], "ocultos": (pr.get("formatos") or {}).get("ocultos") or []}})
    return out


@app.put("/api/records/{rid}")
def put_record(rid: str, request: Request, bg: BackgroundTasks, payload: dict = Body(...), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    if not ID_RE.match(rid):
        raise HTTPException(400, "Identificador no válido")
    kind = payload.get("kind")
    if kind not in KINDS or payload.get("id") != rid:
        raise HTTPException(400, "Registro no válido")
    if kind == "profile" and rid != "profile":
        raise HTTPException(400, "Registro no válido")
    if kind in PREFIX and not rid.startswith(PREFIX[kind]):
        raise HTTPException(400, "Registro no válido")
    patient_id = rid if kind == "patient" else payload.get("patientId") if kind in ("note", "report", "appt", "file", "scale") else None
    if kind == "pnote":  # nota de proceso: el consultante es opcional
        patient_id = payload.get("patientId") or None
    if patient_id is not None and not (isinstance(patient_id, str) and ID_RE.match(patient_id)):
        raise HTTPException(400, "Consultante no válido")
    if len(json.dumps(payload, ensure_ascii=False)) > MAX_RECORD_BYTES:
        raise HTTPException(413, "El registro es demasiado grande")
    oid, team = owner_id(user), user.role == "asistente"
    payload.pop("demo", None)  # la marca de «datos de ejemplo» solo la pone el servidor (POST /api/demo)
    if team and kind not in ("patient", "appt"):
        raise HTTPException(403, "Su cuenta de equipo solo puede modificar datos de consultantes y la agenda")
    row = db.get(Record, (oid, rid))
    old = decrypt(row.payload) if row else None
    restoring = request.headers.get("x-import") == "1" and not team
    if kind == "patient":
        payload.pop("consentAgenda", None)  # dato calculado para el equipo; no se guarda
        if team:  # el equipo nunca ve ni toca lo que se habla en sesión (ni la retención especial): se conserva lo que ya había
            payload = {**{k: v for k, v in payload.items() if k not in CLINICAL_KEYS and k != "retencion"},
                       **{k: v for k, v in (old or {}).items() if k in CLINICAL_KEYS or k == "retencion"}}
        merged = False
        if old and not team and not restoring:
            payload, merged = _keep_remote(old, payload)
        payload = _patient_rules(old, payload, user, restoring, _signer(db, user))
        if old is None and not restoring:
            dup = _same_document(db, oid, rid, payload.get("documento"))
            if dup:
                raise HTTPException(409, f"Ya existe una historia con ese número de documento ({dup}). Ábrala en vez de crear otra: debe haber una sola historia por persona.")
    if not restoring:
        _keep_folios(kind, old, payload)
    _check_immutable(kind, old, payload)
    numbered = not restoring and _assign_folios(db, oid, kind, rid, old, payload)
    if not restoring:
        _check_clock(_new_signatures(kind, old, payload))
    if kind == "report" and payload.get("signedAt") and not (old or {}).get("signedAt") and payload.get("verificacion"):
        code = str(payload["verificacion"])
        if not VERIF_RE.match(code):
            raise HTTPException(400, "Código de verificación no válido")
        if db.get(Verification, _hash(code)):
            raise HTTPException(409, "Código de verificación repetido; intente de nuevo")
        db.add(Verification(code_hash=_hash(code), user_id=oid, record_id=rid))
    if old and old.get("demo"):
        payload["demo"] = True
    blob = encrypt(payload)
    if row:
        row.kind, row.patient_id, row.payload = kind, patient_id, blob
    else:
        db.add(Record(user_id=oid, id=rid, kind=kind, patient_id=patient_id, payload=blob))
    db.commit()
    audit(db, user.id, "record.import" if restoring else "record.put", f"{kind}:{rid}", patient_id=patient_id)
    if kind == "appt":
        bg.add_task(gcal.sync, oid, [rid])
    elif kind == "patient" and old and (old.get("nombres"), old.get("apellidos")) != (payload.get("nombres"), payload.get("apellidos")):
        bg.add_task(lambda: gcal.sync(oid, gcal.patient_appts(oid, rid)))
    if kind == "patient":  # devuelve lo que calculó el servidor (fecha de apertura y registro de cambios)
        out = {"abiertaEl": payload.get("abiertaEl"), "cambios": payload.get("cambios") or [], "firmasCambios": payload.get("firmasCambios") or {}}
        if merged or numbered:  # consentimientos firmados a distancia o folios nuevos que el navegador aún no tenía
            out["consents"] = payload.get("consents") or []
        if numbered:
            out["cierres"] = payload.get("cierres") or []
            if payload.get("intake"):
                out["intake"] = payload["intake"]
        return out
    if numbered:  # devuelve el folio (y la sesión) que puso el servidor
        return {k: payload[k] for k in FOLIO_KEYS if k in payload}
    return Response(status_code=204)


@app.delete("/api/records/{rid}", status_code=204)
def delete_record(rid: str, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not ID_RE.match(rid):
        raise HTTPException(400, "Identificador no válido")
    oid = owner_id(user)
    row = db.get(Record, (oid, rid))
    if row and user.role == "asistente" and row.kind != "appt":
        raise HTTPException(403, "Su cuenta de equipo solo puede quitar citas")
    if row:
        old = decrypt(row.payload)
        if row.kind in ("note", "report", "scale") and old.get("signedAt"):
            raise HTTPException(409, "Un documento firmado no se puede eliminar")
        if row.kind == "file":
            made = row.updated_at if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - made > timedelta(minutes=FILE_UNDO_MINUTES):
                raise HTTPException(409, f"Un adjunto solo se puede quitar en los {FILE_UNDO_MINUTES} minutos siguientes a subirlo")
            blob = db.get(Blob, (oid, rid))
            if blob:
                db.delete(blob)
        if row.kind == "patient" and (old.get("consents") or old.get("cierres") or old.get("solicitudes") or old.get("incorporaciones") or (old.get("intake") or {}).get("signedAt")):
            raise HTTPException(409, "Un consultante con documentos firmados no se puede eliminar")
        if row.kind == "patient" and db.scalar(select(func.count()).select_from(Record).where(
                Record.user_id == oid, Record.patient_id == rid, Record.id != rid, Record.kind != "pnote")):
            raise HTTPException(409, "Un consultante con documentos no se puede eliminar")
        db.delete(row)
        db.commit()
        audit(db, user.id, "record.delete", f"{row.kind}:{rid}", patient_id=row.patient_id)
        if row.kind == "appt":
            bg.add_task(gcal.sync, oid, [rid])


# ---------- Calendario (enlace iCal para Google Calendar u otros) ----------
FEED_DETAILS = ("iniciales", "nombre", "oculto")


class FeedIn(BaseModel):
    detail: str = "iniciales"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@app.get("/api/calendar/feed")
def feed_status(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    f = db.get(Feed, user.id)
    return {"active": bool(f), "detail": f.detail if f else "iniciales",
            "created_at": f.created_at.isoformat() if f else None}


@app.post("/api/calendar/feed")
def feed_create(body: FeedIn, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Crea un enlace nuevo; el anterior deja de funcionar. El token solo se muestra esta vez."""
    if body.detail not in FEED_DETAILS:
        raise HTTPException(400, "Opción no válida")
    token = secrets.token_urlsafe(32)
    f = db.get(Feed, user.id) or Feed(user_id=user.id)
    f.token_hash, f.detail, f.created_at = _hash(token), body.detail, datetime.now(timezone.utc)
    db.add(f)
    db.commit()
    audit(db, user.id, "calendar.feed.create", body.detail)
    return {"token": token, "detail": body.detail}


@app.delete("/api/calendar/feed", status_code=204)
def feed_delete(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    f = db.get(Feed, user.id)
    if f:
        db.delete(f)
        db.commit()
        audit(db, user.id, "calendar.feed.delete")


def _ics_text(v: str) -> str:
    return str(v).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode()) > 74:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def _ics_time(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _label(p: dict | None, detail: str) -> str:
    if detail == "oculto" or not p:
        return "Cita de terapia"
    if detail == "nombre":
        return "Cita · " + " ".join(x for x in (p.get("nombres"), p.get("apellidos")) if x).strip()
    ini = "".join(w[0].upper() + "." for w in f"{p.get('nombres', '')} {p.get('apellidos', '')}".split()[:3])
    return "Cita · " + (ini or "paciente")


@app.get("/api/calendar/{token}.ics")
def feed_ics(token: str, db: Session = Depends(get_db)):
    f = db.scalar(select(Feed).where(Feed.token_hash == _hash(token))) if len(token) < 100 else None
    user = db.get(User, f.user_id) if f else None
    if not user or not user.active:
        raise HTTPException(404, "No encontrado")
    rows = list(db.scalars(select(Record).where(Record.user_id == user.id, Record.kind.in_(("appt", "patient")))))
    pats = {r.id: decrypt(r.payload) for r in rows if r.kind == "patient"}
    since = datetime.now(timezone.utc) - timedelta(days=90)
    stamp = _ics_time(datetime.now(timezone.utc))
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alter-Karute//Agenda//ES", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", "X-WR-CALNAME:Alter-Karute · Agenda", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"]
    for r in rows:
        if r.kind != "appt":
            continue
        a = decrypt(r.payload)
        try:
            start = datetime.fromisoformat(str(a.get("startAt", "")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if start < since or a.get("estado") == "Cancelada":
            continue
        end = start + timedelta(minutes=int(a.get("duracion") or 50))
        lines += ["BEGIN:VEVENT", f"UID:{r.id}@historia-clinica", f"DTSTAMP:{stamp}",
                  f"DTSTART:{_ics_time(start)}", f"DTEND:{_ics_time(end)}",
                  "SUMMARY:" + _ics_text(_label(pats.get(a.get("patientId")), f.detail)),
                  "LOCATION:" + _ics_text(a.get("modalidad") or ""), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    body = "\r\n".join(_fold(x) for x in lines) + "\r\n"
    return PlainTextResponse(body, media_type="text/calendar; charset=utf-8")


# ---------- Adjuntos (archivos cifrados) ----------
MAGIC = {"application/pdf": (b"%PDF-",), "image/png": (b"\x89PNG\r\n\x1a\n",), "image/jpeg": (b"\xff\xd8\xff",),
         "image/webp": (b"RIFF",)}


@app.put("/api/blobs/{bid}")
async def put_blob(bid: str, request: Request, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    if not ID_RE.match(bid) or not bid.startswith("f_"):
        raise HTTPException(400, "Identificador no válido")
    mime = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if mime not in MAGIC:
        raise HTTPException(415, "Solo se admiten PDF, PNG, JPG o WEBP")
    data = await request.body()
    if not data:
        raise HTTPException(400, "El archivo está vacío")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, f"El archivo supera {MAX_FILE_BYTES // (1024 * 1024)} MB")
    if not any(data.startswith(m) for m in MAGIC[mime]) or (mime == "image/webp" and data[8:12] != b"WEBP"):
        raise HTTPException(415, "El contenido no corresponde al tipo de archivo")
    if db.get(Blob, (user.id, bid)):
        raise HTTPException(409, "Un adjunto no se puede reemplazar")
    original = len(data)
    if mime == "application/pdf":
        data = await run_in_threadpool(compress.optimize_pdf, data)
    stored = compress.pack(data)
    db.add(Blob(user_id=user.id, id=bid, mime=mime, size=len(data), data=encrypt_bytes(stored)))
    db.commit()
    audit(db, user.id, "blob.put", bid)
    # tamaño y huella del archivo tal como queda guardado (es el que se descarga después)
    return {"size": len(data), "original": original, "sha256": hashlib.sha256(data).hexdigest(), "guardado": len(stored)}


@app.get("/api/blobs/{bid}")
def get_blob(bid: str, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    b = db.get(Blob, (user.id, bid)) if ID_RE.match(bid) else None
    if not b:
        raise HTTPException(404, "No encontrado")
    frow = db.get(Record, (owner_id(user), bid))
    audit(db, user.id, "blob.get", bid, patient_id=frow.patient_id if frow else None)
    return Response(compress.unpack(decrypt_bytes(b.data)), media_type=b.mime,
                    headers={"Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff"})


class ExportIn(BaseModel):
    patientId: str


@app.post("/api/audit/export", status_code=204)
def audit_export(body: ExportIn, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Deja constancia (sin contenido de las sesiones) de que se descargó la copia completa de una historia."""
    if ID_RE.match(body.patientId):
        audit(db, user.id, "history.export", body.patientId, patient_id=body.patientId)


# ---------- Verificación pública de informes ----------
_vhits: dict[str, list[float]] = {}


@app.get("/api/verify/{code}")
def verify(code: str, request: Request, db: Session = Depends(get_db)):
    """Cualquiera con el código impreso en un informe puede comprobar que es auténtico y ver su contenido firmado."""
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
    with _lock:
        hits = [t for t in _vhits.get(ip, []) if t > time.time() - WINDOW]
        if len(hits) >= 30:
            raise HTTPException(429, "Demasiadas consultas. Intente más tarde.")
        hits.append(time.time())
        _vhits[ip] = hits
    code = code.strip().upper()
    v = db.get(Verification, _hash(code)) if VERIF_RE.match(code) else None
    row = db.get(Record, (v.user_id, v.record_id)) if v else None
    if not row:
        raise HTTPException(404, "No existe un documento con ese código")
    r = decrypt(row.payload)
    prow = db.get(Record, (v.user_id, r.get("patientId") or ""))
    p = decrypt(prow.payload) if prow else {}
    audit(db, v.user_id, "verify", v.record_id, patient_id=row.patient_id, ip=ip)
    return {"tipo": r.get("tipo"), "destinatario": r.get("destinatario"), "asunto": r.get("asunto"),
            "contenido": r.get("contenido"), "firmado": r.get("signedAt"), "profesional": r.get("therapistName"),
            "registro": r.get("therapistReg"),
            "paciente": " ".join(x for x in (p.get("nombres"), p.get("apellidos")) if x),
            "adendas": [{"fecha": a.get("at"), "texto": a.get("text")} for a in (r.get("addenda") or [])]}


# ---------- Google Calendar (sincronización de una vía, opcional) ----------
class GDetail(BaseModel):
    detail: str = "iniciales"


def _gstatus(link: GoogleLink | None) -> dict:
    return {"enabled": gcal.enabled(), "connected": bool(link), "detail": link.detail if link else "iniciales",
            "last_sync": link.last_sync.isoformat() if link and link.last_sync else None,
            "last_error": link.last_error if link else "", "calendar": gcal.CAL_NAME}


@app.get("/api/google/status")
def google_status(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    return _gstatus(db.get(GoogleLink, user.id))


@app.post("/api/google/connect")
def google_connect(body: GDetail, user: User = Depends(pro_user)):
    if not gcal.enabled():
        raise HTTPException(400, "La conexión con Google no está configurada en el servidor")
    if body.detail not in FEED_DETAILS:
        raise HTTPException(400, "Opción no válida")
    state = jwt.encode({"sub": str(user.id), "d": body.detail, "p": "gcal", "exp": int(time.time()) + 600}, SESSION_SECRET, algorithm="HS256")
    return {"url": gcal.auth_url(state)}


@app.get("/api/google/callback")
def google_callback(bg: BackgroundTasks, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    """Google vuelve aquí tras el permiso. La cookie no llega (SameSite=Strict), así que el usuario sale del «state» firmado."""
    try:
        st = jwt.decode(state, SESSION_SECRET, algorithms=["HS256"])
        assert st.get("p") == "gcal"
        uid = int(st["sub"])
    except Exception:
        return RedirectResponse("/app?google=error", status_code=303)
    user = db.get(User, uid)
    if error or not code or not user or not user.active:
        return RedirectResponse("/app?google=cancel" if error == "access_denied" else "/app?google=error", status_code=303)
    try:
        tok = gcal.exchange(code)
        cal = gcal.create_calendar(tok["access_token"])
    except gcal.GoogleError:
        return RedirectResponse("/app?google=error", status_code=303)
    link = db.get(GoogleLink, uid)
    if link:
        gcal.revoke(link)
        db.delete(link)
        db.flush()
    db.add(GoogleLink(user_id=uid, token=encrypt({"refresh_token": tok["refresh_token"]}), calendar_id=cal, detail=st.get("d") or "iniciales"))
    db.commit()
    audit(db, uid, "google.connect")
    bg.add_task(gcal.sync, uid, None, True)
    return RedirectResponse("/app?google=ok", status_code=303)


@app.post("/api/google/detail")
def google_detail(body: GDetail, bg: BackgroundTasks, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    if body.detail not in FEED_DETAILS:
        raise HTTPException(400, "Opción no válida")
    link = db.get(GoogleLink, user.id)
    if not link:
        raise HTTPException(404, "No hay conexión con Google")
    link.detail = body.detail
    db.commit()
    bg.add_task(gcal.sync, user.id, None, True)
    return _gstatus(link)


@app.post("/api/google/sync")
def google_sync(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    if not db.get(GoogleLink, user.id):
        raise HTTPException(404, "No hay conexión con Google")
    n = gcal.sync(user.id, None, True)
    db.expire_all()
    return {**_gstatus(db.get(GoogleLink, user.id)), "synced": n}


@app.delete("/api/google", status_code=204)
def google_disconnect(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    link = db.get(GoogleLink, user.id)
    if link:
        gcal.revoke(link)
        db.delete(link)
        db.commit()
        audit(db, user.id, "google.disconnect")


# ---------- Verificación en dos pasos: activar y desactivar ----------
class CodeIn(BaseModel):
    code: str


class Disable2FA(BaseModel):
    password: str
    code: str


@app.get("/api/auth/2fa")
def twofa_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=TRUSTED_DEVICE_DAYS)
    devs = [d for d in db.scalars(select(TrustedDevice).where(TrustedDevice.user_id == user.id)
                                  .order_by(TrustedDevice.last_used.desc())).all()
            if (d.last_used if d.last_used.tzinfo else d.last_used.replace(tzinfo=timezone.utc)) >= cutoff]
    return {"enabled": bool(user.totp_enabled), "recovery_left": len(json.loads(user.recovery_codes or "[]")),
            "remember_days": TRUSTED_DEVICE_DAYS,
            "devices": [{"label": d.label or "Navegador", "last_used": _iso(d.last_used)} for d in devs]}


@app.post("/api/auth/2fa/setup")
def twofa_setup(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Genera un secreto nuevo (todavía inactivo) para escanear con la app autenticadora."""
    if user.totp_enabled:
        raise HTTPException(400, "La verificación en dos pasos ya está activa")
    secret = totp_new_secret()
    user.totp_secret, user.totp_last = encrypt({"s": secret}), None
    db.commit()
    label = urllib.parse.quote(f"Alter-Karute:{user.email}")
    uri = f"otpauth://totp/{label}?secret={secret}&issuer={urllib.parse.quote('Alter-Karute')}&algorithm=SHA1&digits=6&period=30"
    return {"secret": secret, "uri": uri}


@app.post("/api/auth/2fa/enable")
def twofa_enable(body: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(400, "La verificación en dos pasos ya está activa")
    secret = decrypt(user.totp_secret)["s"] if user.totp_secret else None
    step = totp_check(secret, body.code, None) if secret else None
    if step is None:
        raise HTTPException(400, "El código no coincide. Revise que la hora del teléfono sea la correcta e intente con el código nuevo.")
    codes = recovery_new()
    user.totp_enabled, user.totp_last, user.recovery_codes = True, step, json.dumps([recovery_hash(c) for c in codes])
    db.commit()
    audit(db, user.id, "2fa.enable")
    return {"recovery_codes": codes}


@app.post("/api/auth/2fa/recovery")
def twofa_new_recovery(body: CodeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not user.totp_enabled or not _second_factor(db, user, body.code):
        raise HTTPException(400, "El código no es válido o ya se usó")
    codes = recovery_new()
    user.recovery_codes = json.dumps([recovery_hash(c) for c in codes])
    db.commit()
    audit(db, user.id, "2fa.recovery_new")
    return {"recovery_codes": codes}


@app.post("/api/auth/2fa/disable", status_code=204)
def twofa_disable(body: Disable2FA, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not check_password(user.password_hash, body.password):
        raise HTTPException(400, "La contraseña no es correcta")
    if not user.totp_enabled or not _second_factor(db, user, body.code):
        raise HTTPException(400, "El código no es válido o ya se usó")
    user.totp_enabled, user.totp_secret, user.totp_last, user.recovery_codes = False, None, None, None
    db.commit()
    forget_devices(db, user.id)
    audit(db, user.id, "2fa.disable")


@app.post("/api/auth/2fa/devices/forget")
def twofa_forget_devices(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = forget_devices(db, user.id)
    response.delete_cookie(DEVICE_COOKIE, path=DEVICE_PATH)
    audit(db, user.id, "2fa.devices_forget", str(n), ip=client_ip(request))
    return {"forgotten": n}


# ---------- Encuestas de satisfacción ----------
_shits: dict[str, list[float]] = {}


def _public_throttle(request: Request, limit: int = 40) -> None:
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "?")
    with _lock:
        hits = [t for t in _shits.get(ip, []) if t > time.time() - WINDOW]
        if len(hits) >= limit:
            raise HTTPException(429, "Demasiadas consultas. Intente más tarde.")
        hits.append(time.time())
        _shits[ip] = hits


def _invite(db: Session, token: str) -> SurveyInvite | None:
    if not re.match(r"^[A-Za-z0-9_-]{20,64}$", token or ""):
        return None
    return db.get(SurveyInvite, survey.token_hash(token))


def _invite_state(inv: SurveyInvite) -> str:
    if inv.answered_at:
        return "respondida"
    if survey.aware(inv.expires_at) < datetime.now(timezone.utc):
        return "vencida"
    return "abierta"


@app.get("/api/encuesta/{token}")
def public_survey(token: str, request: Request, db: Session = Depends(get_db)):
    """Página pública de la encuesta: solo con el enlace que recibió el consultante."""
    _public_throttle(request)
    inv = _invite(db, token)
    if not inv:
        raise HTTPException(404, "Enlace no válido")
    d = decrypt(inv.payload)
    return {"estado": _invite_state(inv), "prueba": bool(d.get("prueba")), "profesional": d.get("profesional"), "consultorio": d.get("consultorio"),
            "intro": d.get("intro"),
            "preguntas": [{**q, "opciones": [o[0] for o in survey.TYPES[q["tipo"]]]} for q in d.get("preguntas") or []]}


@app.post("/api/encuesta/{token}", status_code=204)
def public_survey_answer(token: str, request: Request, body: dict = Body(...), db: Session = Depends(get_db)):
    _public_throttle(request)
    inv = _invite(db, token)
    if not inv:
        raise HTTPException(404, "Enlace no válido")
    st = _invite_state(inv)
    if st != "abierta":
        raise HTTPException(409, "Esta encuesta ya fue respondida." if st == "respondida" else "Esta encuesta ya cerró.")
    d = decrypt(inv.payload)
    try:
        ans = survey.validate_answers(d.get("preguntas") or [], body.get("respuestas"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    now = datetime.now(timezone.utc)
    inv.answered_at = now
    # la respuesta no guarda el consultante ni la invitación: solo la cuenta y el mes
    # las respuestas de prueba se guardan marcadas: Estadísticas las muestra solo si se pide
    db.add(SurveyResponse(user_id=inv.user_id, month=now.strftime("%Y-%m"),
                          payload=encrypt({"preguntas": d.get("preguntas"), "respuestas": ans, **({"prueba": True} if d.get("prueba") else {})})))
    db.commit()


@app.post("/api/encuesta/{token}/baja", status_code=204)
def public_survey_optout(token: str, request: Request, db: Session = Depends(get_db)):
    _public_throttle(request)
    inv = _invite(db, token)
    if not inv:
        raise HTTPException(404, "Enlace no válido")
    if not db.get(SurveyOptOut, (inv.user_id, inv.patient_id)):
        db.add(SurveyOptOut(user_id=inv.user_id, patient_id=inv.patient_id))
    if not inv.answered_at and survey.aware(inv.expires_at) > datetime.now(timezone.utc):
        inv.expires_at = datetime.now(timezone.utc)
    db.commit()


def _my_invite(db: Session, user: User, iid: str) -> SurveyInvite:
    inv = db.get(SurveyInvite, iid) if re.match(r"^[0-9a-f]{64}$", iid or "") else None
    if not inv or inv.user_id != user.id:
        raise HTTPException(404, "Invitación no encontrada")
    return inv


@app.get("/api/encuestas")
def surveys_status(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Invitaciones de la cuenta (sin respuestas) y estado del sorteo."""
    st = db.get(survey.SurveyState, user.id)
    out = []
    for inv in db.scalars(select(SurveyInvite).where(SurveyInvite.user_id == user.id).order_by(SurveyInvite.created_at.desc())):
        state = _invite_state(inv)
        item = {"prueba": inv.channel == "prueba", "id": inv.id, "patientId": inv.patient_id, "creada": inv.created_at.isoformat(), "vence": inv.expires_at.isoformat(),
                "canal": inv.channel, "enviada": _iso(inv.sent_at), "estado": state, "error": inv.error}
        if state == "abierta" and inv.channel == "manual":
            item["enlace"] = decrypt(inv.payload)["token"]
        out.append(item)
    optouts = [o.patient_id for o in db.scalars(select(SurveyOptOut).where(SurveyOptOut.user_id == user.id))]
    return {"correo": survey.smtp_enabled(survey.account(db, user.id)), "ultimoSorteo": survey.aware(st.last_draw).isoformat() if st else None,
            "invitaciones": out, "bajas": optouts}


@app.get("/api/encuestas/resultados")
def surveys_results(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Respuestas anónimas, en orden aleatorio y solo con el mes."""
    rows = [{"mes": r.month, **decrypt(r.payload)} for r in db.scalars(select(SurveyResponse).where(SurveyResponse.user_id == user.id))]
    secrets.SystemRandom().shuffle(rows)
    return rows


@app.post("/api/encuestas/sortear")
def surveys_draw(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    n = survey.draw(user.id, force=True)
    audit(db, user.id, "survey.draw", f"n={n}")
    return {"creadas": n}


@app.post("/api/encuestas/{iid}/enviada", status_code=204)
def surveys_mark_sent(iid: str, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    inv = _my_invite(db, user, iid)
    inv.sent_at = inv.sent_at or datetime.now(timezone.utc)
    db.commit()


@app.delete("/api/encuestas/{iid}", status_code=204)
def surveys_cancel(iid: str, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    inv = _my_invite(db, user, iid)
    if inv.answered_at:
        raise HTTPException(409, "Una encuesta respondida no se puede quitar")
    db.delete(inv)
    db.commit()


class SurveyTestIn(BaseModel):
    correo: str


@app.post("/api/encuestas/prueba")
def surveys_test(body: SurveyTestIn, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Encuesta de prueba: llega al correo indicado, usa las preguntas actuales y no cuenta en las estadísticas."""
    to = body.correo.strip()
    if not EMAIL_RE.match(to):
        raise HTTPException(400, "Escriba un correo válido")
    with _lock:  # máximo 10 pruebas por hora por cuenta
        hits = [t for t in _shits.get(f"t{user.id}", []) if t > time.time() - 3600]
        if len(hits) >= 10:
            raise HTTPException(429, "Ya envió varias pruebas. Espere un rato.")
        hits.append(time.time())
        _shits[f"t{user.id}"] = hits
    prof = next((decrypt(r.payload) for r in db.scalars(select(Record).where(Record.user_id == user.id, Record.kind == "profile"))), {})
    cfg = survey.config(prof)
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    db.add(SurveyInvite(id=survey.token_hash(token), user_id=user.id, patient_id="prueba", created_at=now,
                        expires_at=now + timedelta(days=2), channel="prueba",
                        payload=encrypt({"token": token, "prueba": True, "preguntas": cfg["preguntas"], "intro": cfg["intro"],
                                         "profesional": prof.get("nombre") or "", "consultorio": prof.get("consultorio") or ""})))
    db.commit()
    audit(db, user.id, "survey.test", "")
    acc = survey.account(db, user.id)
    if not survey.smtp_enabled(acc):
        return {"enviado": False, "enlace": token, "motivo": "Aún no ha configurado su correo de envío (más arriba, en «Correo de envío»)."}
    try:
        survey.send_mail(to, token, {"nombres": "Prueba"}, prof, acc)
    except Exception as e:  # noqa: BLE001 — se muestra al terapeuta para que corrija la configuración
        return {"enviado": False, "enlace": token, "motivo": "El servidor de correo respondió: " + (type(e).__name__ + ": " + str(e))[:300]}
    return {"enviado": True, "enlace": token}


@app.post("/api/encuestas/borrar-pruebas", status_code=204)
def surveys_delete_tests(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Borra las encuestas de prueba y sus respuestas (antes de empezar con consultantes reales)."""
    for r in db.scalars(select(SurveyResponse).where(SurveyResponse.user_id == user.id)):
        if decrypt(r.payload).get("prueba"):
            db.delete(r)
    for inv in db.scalars(select(SurveyInvite).where(SurveyInvite.user_id == user.id, SurveyInvite.channel == "prueba")):
        db.delete(inv)
    db.commit()
    audit(db, user.id, "survey.tests.delete", "")


# ---------- Correo propio de cada terapeuta (para enviar sus encuestas) ----------
class MailIn(BaseModel):
    correo: str
    password: str
    host: str = ""
    port: int = 0


def _mail_out(db: Session, user: User) -> dict:
    row = db.get(MailAccount, user.id)
    if row:
        d = decrypt(row.payload)
        return {"propio": True, "correo": d.get("from"), "host": d.get("host"), "port": d.get("port"),
                "actualizado": survey.aware(row.updated_at).isoformat()}
    return {"propio": False, "servidor": survey.server_account() is not None}


@app.get("/api/correo")
def mail_get(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    return _mail_out(db, user)


@app.put("/api/correo")
def mail_put(body: MailIn, request: Request, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Guarda el correo del terapeuta después de comprobar que el servidor de correo acepta la contraseña."""
    email = body.correo.strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Escriba un correo válido")
    pw = body.password.replace(" ", "") if "gmail" in email.lower() else body.password.strip()
    if not pw:
        raise HTTPException(400, "Escriba la contraseña de aplicación")
    pre = survey.preset(email)
    host = (body.host.strip() or (pre[0] if pre else "")).lower()
    port = body.port or (pre[1] if pre else 587)
    if not re.match(r"^[a-z0-9.-]{3,253}$", host) or port not in (25, 465, 587, 2525):
        raise HTTPException(400, "No reconocemos el proveedor de ese correo: escriba el servidor SMTP y el puerto (465 o 587).")
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    base = PUBLIC_URL or f"{proto}://{request.headers.get('host') or ''}"
    acc = {"host": host, "port": port, "user": email, "password": pw, "from": email, "base": base}
    try:
        survey.check_login(acc)
    except Exception as e:  # noqa: BLE001 — se muestra el motivo para que lo corrija
        msg = str(e)
        hint = (" Use una «contraseña de aplicación», no la contraseña normal del correo." if re.search(r"535|534|auth|password|credentials", msg, re.I) else "")
        raise HTTPException(400, "El servidor de correo no aceptó el ingreso: " + msg[:200] + hint)
    row = db.get(MailAccount, user.id)
    if row:
        row.payload, row.updated_at = encrypt(acc), datetime.now(timezone.utc)
    else:
        db.add(MailAccount(user_id=user.id, payload=encrypt(acc)))
    db.commit()
    audit(db, user.id, "mail.set", host)
    return _mail_out(db, user)


@app.delete("/api/correo", status_code=204)
def mail_delete(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    row = db.get(MailAccount, user.id)
    if row:
        db.delete(row)
        db.commit()
        audit(db, user.id, "mail.delete", "")


# ---------- Equipo: subcuentas de cada terapeuta (secretaría, asistentes) ----------
class TeamIn(BaseModel):
    email: str
    name: str
    password: str


class TeamPatch(BaseModel):
    active: bool | None = None
    password: str | None = None
    name: str | None = None


@app.get("/api/equipo")
def team_list(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.scalars(select(User).where(User.owner_id == user.id).order_by(User.name))]


@app.post("/api/equipo", status_code=201)
def team_create(body: TeamIn, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Correo no válido")
    if not body.name.strip():
        raise HTTPException(400, "Escriba el nombre")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Ya existe un usuario con ese correo")
    if db.scalar(select(func.count()).select_from(User).where(User.owner_id == user.id)) >= 10:
        raise HTTPException(400, "Máximo 10 personas en el equipo")
    u = User(email=email, name=body.name.strip()[:200], password_hash=hash_password(body.password), role="asistente", owner_id=user.id,
             must_change_password=True)
    db.add(u)
    db.commit()
    audit(db, user.id, "team.create", email)
    return user_out(u)


@app.patch("/api/equipo/{uid}")
def team_patch(uid: int, body: TeamPatch, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u or u.owner_id != user.id:
        raise HTTPException(404, "No encontrado")
    if body.password is not None:
        if len(body.password) < MIN_PASSWORD:
            raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
        u.password_hash = hash_password(body.password)
        u.must_change_password = True
        forget_devices(db, u.id)
    if body.active is not None:
        u.active = body.active
    if body.name is not None and body.name.strip():
        u.name = body.name.strip()[:200]
    db.commit()
    audit(db, user.id, "team.update", f"id={uid}")
    return user_out(u)


class TeamProfileIn(BaseModel):
    documento: str = ""
    firma: str = ""


@app.get("/api/equipo/mi-perfil")
def team_profile_get(user: User = Depends(current_user)):
    """Documento y firma de una persona del equipo (aparecen en el historial de cambios que haga)."""
    if user.role != "asistente":
        raise HTTPException(403, "Solo para cuentas de equipo")
    return decrypt(user.profile) if user.profile else {"documento": "", "firma": ""}


@app.put("/api/equipo/mi-perfil")
def team_profile_put(body: TeamProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "asistente":
        raise HTTPException(403, "Solo para cuentas de equipo")
    if body.firma and (not SIG_RE.match(body.firma) or len(body.firma) > 400_000):
        raise HTTPException(400, "Firma no válida")
    u = db.get(User, user.id)
    u.profile = encrypt({"documento": body.documento.strip()[:40], "firma": body.firma})
    db.commit()
    audit(db, user.id, "team.profile", "")
    return {"documento": body.documento.strip()[:40], "firma": body.firma}


# ---------- Recordatorios de citas ----------
@app.get("/api/recordatorios")
def reminders_status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Estado de los recordatorios de la cuenta (el equipo también los ve y los envía)."""
    oid = owner_id(user)
    row = db.get(Record, (oid, "profile"))
    cfg = reminders.config(decrypt(row.payload) if row else {})
    items = {}
    for r in db.scalars(select(ApptReminder).where(ApptReminder.user_id == oid)):
        items[r.appt_id] = {"canal": r.channel, "enviado": _iso(r.sent_at), "error": r.error,
                            "respuesta": decrypt(r.payload).get("respuesta")}
    return {**cfg, "correo": survey.smtp_enabled(survey.account(db, oid)), "items": items}


@app.post("/api/recordatorios/{appt_id}/enlace")
def reminders_link(appt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Enlace de confirmación para enviar el recordatorio a mano (WhatsApp o copiar)."""
    oid = owner_id(user)
    row = db.get(Record, (oid, appt_id)) if ID_RE.match(appt_id) else None
    if not row or row.kind != "appt":
        raise HTTPException(404, "Cita no encontrada")
    r, token = reminders.make(db, oid, decrypt(row.payload), "whatsapp")
    db.commit()
    return {"enlace": token}


@app.post("/api/recordatorios/{appt_id}/enviado", status_code=204)
def reminders_sent(appt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    oid = owner_id(user)
    r = next(iter(db.scalars(select(ApptReminder).where(ApptReminder.user_id == oid, ApptReminder.appt_id == appt_id))), None)
    if not r:
        raise HTTPException(404, "No encontrado")
    r.sent_at = r.sent_at or datetime.now(timezone.utc)
    if r.channel != "correo":
        r.channel = "whatsapp"
    db.commit()
    audit(db, user.id, "reminder.sent", appt_id)


# ---------- Firma de consentimientos a distancia ----------
class RemoteConsentIn(BaseModel):
    patientId: str
    tipo: str
    plantilla: str | None = None
    text: str
    signerType: str = "Consultante"
    signerName: str
    signerDoc: str
    correo: bool = False


def _cr_state(r: ConsentRequest) -> str:
    if r.signed_at:
        return "firmado"
    if r.cancelled_at:
        return "anulado"
    if survey.aware(r.expires_at) < datetime.now(timezone.utc):
        return "vencido"
    if r.attempts >= firmas.MAX_ATTEMPTS:
        return "bloqueado"
    return "pendiente"


def _cr_out(r: ConsentRequest) -> dict:
    d = decrypt(r.payload)
    return {"ref": r.ref, "patientId": r.patient_id, "tipo": d.get("tipo"), "signerName": d.get("signerName"), "estado": _cr_state(r),
            "creado": _iso(r.created_at), "vence": _iso(r.expires_at), "firmado": _iso(r.signed_at), "anulado": _iso(r.cancelled_at),
            "enlace": d.get("token") if _cr_state(r) == "pendiente" else None, "correo": d.get("correo")}


def _base(request: Request) -> str:
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    return PUBLIC_URL or f"{proto}://{request.headers.get('host') or ''}"


@app.get("/api/firmas")
def remote_list(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ConsentRequest).where(ConsentRequest.user_id == user.id).order_by(ConsentRequest.created_at.desc()))
    return [_cr_out(r) for r in rows]


@app.post("/api/firmas")
def remote_create(body: RemoteConsentIn, request: Request, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Prepara un consentimiento para que el consultante lo firme desde su celular."""
    prow = db.get(Record, (user.id, body.patientId)) if ID_RE.match(body.patientId or "") else None
    if not prow or prow.kind != "patient":
        raise HTTPException(404, "Consultante no encontrado")
    prof_row = db.get(Record, (user.id, "profile"))
    prof = decrypt(prof_row.payload) if prof_row else {}
    if not (prof.get("nombre") and prof.get("firma")):
        raise HTTPException(400, "Primero guarde su nombre y firma en «Mi perfil y firma».")
    text, tipo = body.text.strip(), body.tipo.strip()[:200]
    if not text or len(text) > 60_000 or not tipo:
        raise HTTPException(400, "El documento está vacío o es demasiado largo")
    if body.signerType not in firmas.SIGNER_TYPES or not body.signerName.strip():
        raise HTTPException(400, "Escriba quién firma")
    if len(firmas.norm_doc(body.signerDoc)) < 3:
        raise HTTPException(400, "Escriba el número de documento de quien firma: se le pedirá para abrir el enlace")
    token, now = firmas.new_token(), datetime.now(timezone.utc)
    data = {"token": token, "tipo": tipo, "plantilla": (body.plantilla or None), "text": text, "signerType": body.signerType,
            "signerName": body.signerName.strip()[:200], "signerDoc": body.signerDoc.strip()[:40],
            "therapistName": prof.get("nombre"), "therapistDocId": prof.get("cedula") or None, "therapistReg": prof.get("registro"),
            "therapistSig": prof.get("firma"), "consultorio": prof.get("consultorio"), "enviadoAt": now.isoformat()}
    r = ConsentRequest(id=firmas.token_hash(token), ref=secrets.token_hex(12), user_id=user.id, patient_id=body.patientId,
                       created_at=now, expires_at=now + firmas.ttl(), attempts=0, payload=encrypt(data))
    db.add(r)
    db.commit()
    audit(db, user.id, "consent.remote.create", f"{body.patientId}:{r.ref}", patient_id=body.patientId)
    out = _cr_out(r)
    if body.correo:
        out.update(_remote_mail(db, user, r, request))
    return out


def _remote_mail(db: Session, user: User, r: ConsentRequest, request: Request) -> dict:
    p = decrypt(db.get(Record, (user.id, r.patient_id)).payload)
    to = str(p.get("correo") or "").strip()
    if not EMAIL_RE.match(to):
        return {"correoEnviado": False, "motivo": "El consultante no tiene un correo válido en sus datos."}
    acc = survey.account(db, user.id)
    if not survey.smtp_enabled(acc):
        return {"correoEnviado": False, "motivo": "Aún no ha configurado su correo de envío."}
    prof_row = db.get(Record, (user.id, "profile"))
    prof = decrypt(prof_row.payload) if prof_row else {}
    d = decrypt(r.payload)
    try:
        firmas.send_mail(to, firmas.message(p, prof, d["tipo"], firmas.link(d["token"], acc.get("base") or _base(request))), prof, acc)
    except Exception as e:  # noqa: BLE001
        return {"correoEnviado": False, "motivo": "El servidor de correo respondió: " + (type(e).__name__ + ": " + str(e))[:300]}
    d["correo"] = datetime.now(timezone.utc).isoformat()
    r.payload = encrypt(d)
    db.commit()
    return {"correoEnviado": True, "correo": d["correo"]}


def _my_request(db: Session, user: User, ref: str) -> ConsentRequest:
    r = db.scalar(select(ConsentRequest).where(ConsentRequest.ref == ref, ConsentRequest.user_id == user.id)) if re.match(r"^[0-9a-f]{24}$", ref or "") else None
    if not r:
        raise HTTPException(404, "No encontrado")
    return r


@app.post("/api/firmas/{ref}/correo")
def remote_mail(ref: str, request: Request, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    r = _my_request(db, user, ref)
    if _cr_state(r) != "pendiente":
        raise HTTPException(409, "Este enlace ya no está pendiente")
    return _remote_mail(db, user, r, request)


@app.post("/api/firmas/{ref}/anular", status_code=204)
def remote_cancel(ref: str, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    r = _my_request(db, user, ref)
    if r.signed_at:
        raise HTTPException(409, "Ya fue firmado: si el consultante lo retira, registre una revocación")
    r.cancelled_at = r.cancelled_at or datetime.now(timezone.utc)
    db.commit()
    audit(db, user.id, "consent.remote.cancel", ref)


def _public_request(db: Session, token: str) -> ConsentRequest:
    r = db.get(ConsentRequest, firmas.token_hash(token)) if re.match(r"^[A-Za-z0-9_-]{20,64}$", token or "") else None
    if not r:
        raise HTTPException(404, "Enlace no válido")
    return r


def _public_head(db: Session, r: ConsentRequest) -> dict:
    d = decrypt(r.payload)
    return {"tipo": d.get("tipo"), "profesional": d.get("therapistName") or "", "consultorio": d.get("consultorio") or "",
            "estado": _cr_state(r), "vence": _iso(r.expires_at), "firmado": _iso(r.signed_at), "quien": d.get("signerType")}


@app.get("/api/firma/{token}")
def public_consent(token: str, request: Request, db: Session = Depends(get_db)):
    """Encabezado del enlace: sin el documento de identidad no se muestra el texto ni datos del consultante."""
    _public_throttle(request)
    return _public_head(db, _public_request(db, token))


class RemoteOpenIn(BaseModel):
    documento: str


class RemoteSignIn(BaseModel):
    documento: str
    firma: str
    acepto: bool = False
    sha256: str = ""


def _unlock(db: Session, r: ConsentRequest, documento: str) -> dict:
    st = _cr_state(r)
    if st != "pendiente":
        raise HTTPException(409, {"vencido": "El enlace venció. Pida uno nuevo al consultorio.", "anulado": "Este enlace fue anulado por el consultorio.",
                                  "firmado": "Este documento ya fue firmado.", "bloqueado": "Se superó el número de intentos. Pida un enlace nuevo al consultorio."}[st])
    d = decrypt(r.payload)
    if firmas.norm_doc(documento) != firmas.norm_doc(d.get("signerDoc")):
        r.attempts = (r.attempts or 0) + 1
        db.commit()
        left = firmas.MAX_ATTEMPTS - r.attempts
        raise HTTPException(403, "El número de documento no coincide." + (f" Le quedan {left} intentos." if left > 0 else " El enlace quedó bloqueado; pida uno nuevo."))
    return d


@app.post("/api/firma/{token}/abrir")
def public_consent_open(token: str, body: RemoteOpenIn, request: Request, db: Session = Depends(get_db)):
    _public_throttle(request)
    r = _public_request(db, token)
    d = _unlock(db, r, body.documento)
    return {**_public_head(db, r), "texto": d["text"], "sha256": firmas.text_hash(d["text"]), "firmante": d.get("signerName"), "documento": d.get("signerDoc"),
            "terapeuta": {"nombre": d.get("therapistName") or "", "registro": d.get("therapistReg") or "", "cedula": d.get("therapistDocId") or "",
                          "firma": d.get("therapistSig") or "", "enviado": d.get("enviadoAt")}}


@app.post("/api/firma/{token}")
def public_consent_sign(token: str, body: RemoteSignIn, request: Request, db: Session = Depends(get_db)):
    """El consultante firma: el consentimiento se agrega a su historia con la hora del servidor."""
    _public_throttle(request)
    r = _public_request(db, token)
    d = _unlock(db, r, body.documento)
    if not body.acepto:
        raise HTTPException(400, "Marque que leyó y acepta el documento")
    if not SIG_RE.match(body.firma or "") or len(body.firma) > 400_000:
        raise HTTPException(400, "Dibuje su firma")
    sha = firmas.text_hash(d["text"])
    if body.sha256 and body.sha256 != sha:
        raise HTTPException(409, "El documento cambió mientras lo leía. Recargue la página.")
    prow = db.get(Record, (r.user_id, r.patient_id))
    if not prow:
        raise HTTPException(404, "La historia ya no existe. Comuníquese con el consultorio.")
    now = datetime.now(timezone.utc)
    ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "")
    c = {"tipo": d["tipo"], "text": d["text"], "signerType": d["signerType"], "signerName": d["signerName"], "signerDoc": d["signerDoc"],
         "signerSig": body.firma, "signedAt": now.isoformat(),
         "therapistName": d.get("therapistName"), "therapistReg": d.get("therapistReg"), "therapistSig": d.get("therapistSig"),
         "consultorio": d.get("consultorio"),
         "remoto": {"id": r.ref, "enviadoAt": d.get("enviadoAt"), "firmadoAt": now.isoformat(), "ip": ip[:64],
                    "navegador": (request.headers.get("user-agent") or "")[:300], "sha256": sha,
                    "verificacion": "El firmante abrió su enlace personal y escribió su número de documento"},
         "copia": "Disponible para el usuario en su enlace de firma, donde puede guardarla o imprimirla"}
    if d.get("plantilla"):
        c["plantilla"] = d["plantilla"]
    if d.get("therapistDocId"):
        c["therapistDocId"] = d["therapistDocId"]
    p = decrypt(prow.payload)
    c["folio"] = len(p.get("consents") or []) + 1
    p["consents"] = list(p.get("consents") or []) + [c]
    p["abiertaEl"] = p.get("abiertaEl") or now.isoformat()
    if len(json.dumps(p, ensure_ascii=False)) > MAX_RECORD_BYTES:
        raise HTTPException(413, "La historia es demasiado grande. Comuníquese con el consultorio.")
    prow.payload = encrypt(p)
    r.signed_at = now
    d.pop("token", None)
    r.payload = encrypt(d)  # el enlace ya no sirve: se borra
    db.commit()
    audit(db, r.user_id, "consent.remote.sign", f"{r.patient_id}:{r.ref}", patient_id=r.patient_id, ip=ip)
    return {"firmado": now.isoformat(), "sha256": sha}


def _reminder(db: Session, token: str):
    if not re.match(r"^[A-Za-z0-9_-]{20,64}$", token or ""):
        return None, None
    r = db.get(ApptReminder, reminders.token_hash(token))
    row = db.get(Record, (r.user_id, r.appt_id)) if r else None
    return (r, row) if row else (None, None)


@app.get("/api/cita/{token}")
def public_appt(token: str, request: Request, db: Session = Depends(get_db)):
    """Página pública del recordatorio: solo fecha, hora, modalidad y el terapeuta."""
    _public_throttle(request)
    r, row = _reminder(db, token)
    if not r:
        raise HTTPException(404, "Enlace no válido")
    a = decrypt(row.payload)
    prof_row = db.get(Record, (r.user_id, "profile"))
    prof = decrypt(prof_row.payload) if prof_row else {}
    start = reminders.parse(a.get("startAt"))
    return {"cuando": reminders.when_text(start) if start else "", "inicio": a.get("startAt"), "modalidad": a.get("modalidad") or "Presencial",
            "profesional": prof.get("nombre") or "", "consultorio": prof.get("consultorio") or "", "estado": a.get("estado") or "Programada",
            "respuesta": (a.get("confirmacion") or {}).get("estado"), "pasada": bool(start and start < datetime.now(timezone.utc))}


class ApptAnswer(BaseModel):
    accion: str


@app.post("/api/cita/{token}")
def public_appt_answer(token: str, body: ApptAnswer, request: Request, bg: BackgroundTasks, db: Session = Depends(get_db)):
    _public_throttle(request)
    r, row = _reminder(db, token)
    if not r:
        raise HTTPException(404, "Enlace no válido")
    if body.accion not in ("confirmar", "cancelar"):
        raise HTTPException(400, "Acción no válida")
    a = decrypt(row.payload)
    start = reminders.parse(a.get("startAt"))
    if not start or start < datetime.now(timezone.utc) or a.get("estado") not in (None, "Programada"):
        raise HTTPException(409, "Esta cita ya no se puede confirmar ni cancelar desde aquí. Comuníquese con el consultorio.")
    now = datetime.now(timezone.utc).isoformat()
    estado = "Confirmada" if body.accion == "confirmar" else "Cancelada por el consultante"
    a["confirmacion"] = {"estado": estado, "at": now}
    if body.accion == "cancelar":
        a["estado"] = "Cancelada"
    row.payload = encrypt(a)
    pl = decrypt(r.payload)
    pl["respuesta"] = estado
    r.payload = encrypt(pl)
    db.commit()
    audit(db, None, "appt.answer", f"{r.appt_id}:{body.accion}")
    if body.accion == "cancelar":
        bg.add_task(gcal.sync, r.user_id, [r.appt_id])
    return {"estado": a.get("estado"), "respuesta": estado}


# ---------- Comentarios de la versión beta ----------
FB_TEMAS = ("Datos del consultante", "Consentimiento", "Firma a distancia", "Primera vez", "Sesión", "Impresión / motivo", "Escalas",
            "Informes", "Cierre", "Archivo y adjuntos", "Agenda y calendario", "Recordatorios", "Mis formatos", "Resumen y pendientes",
            "Estadísticas", "Encuesta de satisfacción", "Mi perfil y firma", "Cuenta, equipo y acceso", "Celular", "Otro")
FB_TIPOS = ("Error", "Sugerencia", "Duda")
FB_ESTADOS = ("Nuevo", "En revisión", "Resuelto", "Descartado")
IMG_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$")
_fbhits: dict[int, list[float]] = {}


class FeedbackIn(BaseModel):
    tema: str
    tipo: str = "Sugerencia"
    texto: str
    contexto: dict = {}
    imagen: str | None = None


class FeedbackPatch(BaseModel):
    estado: str | None = None
    respuesta: str | None = None


def _fb_out(f: Feedback, author: User | None = None, admin: bool = False) -> dict:
    d = decrypt(f.payload)
    out = {"id": f.id, "creado": _iso(f.created_at), "tema": f.tema, "tipo": f.tipo, "estado": f.estado, "texto": d.get("texto"),
           "respuesta": d.get("respuesta") or "", "captura": bool(f.image)}
    if admin:
        out.update({"contexto": d.get("contexto") or {}, "autor": author.name if author else "", "correo": author.email if author else "",
                    "rol": author.role if author else "", "actualizado": _iso(f.updated_at)})
    return out


@app.post("/api/comentarios", status_code=201)
def feedback_create(body: FeedbackIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not BETA_COMENTARIOS:
        raise HTTPException(404, "Los comentarios no están activos")
    with _lock:
        hits = [t for t in _fbhits.get(user.id, []) if t > time.time() - 3600]
        if len(hits) >= 30:
            raise HTTPException(429, "Ha enviado muchos comentarios en la última hora. Intente más tarde.")
        hits.append(time.time())
        _fbhits[user.id] = hits
    texto = body.texto.strip()
    if body.tema not in FB_TEMAS or body.tipo not in FB_TIPOS:
        raise HTTPException(400, "Elija el tema y el tipo de comentario")
    if not texto or len(texto) > 5000:
        raise HTTPException(400, "Escriba el comentario (máximo 5000 caracteres)")
    ctx = {k: str(v)[:300] for k, v in (body.contexto or {}).items() if isinstance(k, str) and len(k) <= 40}
    ctx = dict(list(ctx.items())[:12])
    img = None
    if body.imagen:
        m = IMG_RE.match(body.imagen)
        if not m or len(body.imagen) > 4_500_000:
            raise HTTPException(400, "La captura debe ser una imagen de máximo 3 MB")
        import base64
        img = encrypt_bytes(base64.b64decode(m.group(2)))
    f = Feedback(user_id=user.id, tema=body.tema, tipo=body.tipo, estado="Nuevo", payload=encrypt({"texto": texto, "contexto": ctx}), image=img)
    db.add(f)
    db.commit()
    audit(db, user.id, "feedback.create", str(f.id))
    return {"id": f.id}


@app.get("/api/comentarios")
def feedback_mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Feedback).where(Feedback.user_id == user.id).order_by(Feedback.created_at.desc()).limit(100))
    return {"activo": BETA_COMENTARIOS, "temas": FB_TEMAS, "tipos": FB_TIPOS, "items": [_fb_out(f) for f in rows]}


@app.get("/api/admin/comentarios")
def feedback_all(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Feedback).order_by(Feedback.created_at.desc())))
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({f.user_id for f in rows})))} if rows else {}
    return {"estados": FB_ESTADOS, "items": [_fb_out(f, users.get(f.user_id), True) for f in rows]}


@app.patch("/api/admin/comentarios/{fid}")
def feedback_patch(fid: int, body: FeedbackPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    f = db.get(Feedback, fid)
    if not f:
        raise HTTPException(404, "No encontrado")
    if body.estado is not None:
        if body.estado not in FB_ESTADOS:
            raise HTTPException(400, "Estado no válido")
        f.estado = body.estado
    if body.respuesta is not None:
        d = decrypt(f.payload)
        d["respuesta"] = body.respuesta.strip()[:2000]
        f.payload = encrypt(d)
    f.updated_at = datetime.now(timezone.utc)
    db.commit()
    audit(db, admin.id, "feedback.update", str(fid))
    return _fb_out(f, db.get(User, f.user_id), True)


def _fb_image(db: Session, f: Feedback | None, user: User) -> Response:
    if not f or not f.image or (user.role != "admin" and f.user_id != user.id):
        raise HTTPException(404, "Sin captura")
    raw = decrypt_bytes(f.image)
    mime = "image/png" if raw[:4] == b"\x89PNG" else "image/webp" if raw[8:12] == b"WEBP" else "image/jpeg"
    return Response(raw, media_type=mime, headers={"Cache-Control": "no-store"})


@app.get("/api/comentarios/{fid}/captura")
def feedback_image(fid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _fb_image(db, db.get(Feedback, fid), user)


def feedback_markdown(items: list[dict], imgs: dict[int, str]) -> str:
    """Texto listo para pasárselo a Claude: instrucciones arriba y los comentarios agrupados por tema."""
    now = datetime.now(reminders.TZ)
    lines = ["# Comentarios de la beta — Alter-Karute", "",
             f"Exportado el {now.strftime('%Y-%m-%d %H:%M')} (hora de Colombia). {len(items)} comentario(s).", "",
             "> Para Claude: estos son comentarios de personas que probaron la versión beta de la app (repositorio jgiral95/Historias_clinicas).",
             "> Revísalos, agrupa los que hablan de lo mismo, propone las correcciones y prioriza primero los de tipo «Error».",
             "> Cada comentario trae dónde estaba la persona en la app (vista, pestaña, ventana abierta, pantalla y navegador).", ""]
    by: dict[str, list[dict]] = {}
    for it in items:
        by.setdefault(it["tema"], []).append(it)
    for tema in sorted(by, key=lambda t: FB_TEMAS.index(t) if t in FB_TEMAS else 99):
        lines += [f"## {tema} ({len(by[tema])})", ""]
        for it in sorted(by[tema], key=lambda x: (FB_TIPOS.index(x["tipo"]) if x["tipo"] in FB_TIPOS else 9, x["creado"] or "")):
            when = reminders.parse(it["creado"]).astimezone(reminders.TZ).strftime("%Y-%m-%d %H:%M") if it["creado"] else ""
            lines.append(f"### #{it['id']} · {it['tipo']} · {it['estado']}")
            lines.append(f"- Fecha: {when} · De: {it['autor']} ({'equipo' if it['rol'] == 'asistente' else 'terapeuta' if it['rol'] == 'user' else it['rol']})")
            ctx = it.get("contexto") or {}
            if ctx:
                lines.append("- Dónde: " + " · ".join(f"{k}: {v}" for k, v in ctx.items() if v))
            if it["id"] in imgs:
                lines.append(f"- Captura: `{imgs[it['id']]}`")
            lines += ["", "\n".join("> " + x for x in str(it["texto"] or "").splitlines()) or "> (vacío)", ""]
            if it.get("respuesta"):
                lines += [f"Respuesta dada: {it['respuesta']}", ""]
    return "\n".join(lines).rstrip() + "\n"


@app.get("/api/admin/comentarios/exportar")
def feedback_export(abiertos: int = 1, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Un .zip con comentarios.md y las capturas, para adjuntárselo a Claude."""
    import io
    import zipfile
    q = select(Feedback).order_by(Feedback.created_at)
    if abiertos:
        q = q.where(Feedback.estado.in_(("Nuevo", "En revisión")))
    rows = list(db.scalars(q))
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({f.user_id for f in rows})))} if rows else {}
    items, imgs, buf = [], {}, io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in rows:
            it = _fb_out(f, users.get(f.user_id), True)
            items.append(it)
            if f.image:
                raw = decrypt_bytes(f.image)
                ext = "png" if raw[:4] == b"\x89PNG" else "webp" if raw[8:12] == b"WEBP" else "jpg"
                imgs[f.id] = f"capturas/comentario-{f.id}.{ext}"
                z.writestr(imgs[f.id], raw)
        z.writestr("comentarios.md", feedback_markdown(items, imgs))
    audit(db, admin.id, "feedback.export", str(len(rows)))
    name = "comentarios-beta-" + datetime.now(reminders.TZ).strftime("%Y-%m-%d") + ".zip"
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@app.get("/api/admin/comentarios/texto")
def feedback_text(abiertos: int = 1, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """El mismo texto del .zip, para copiar y pegar (sin capturas)."""
    q = select(Feedback).order_by(Feedback.created_at)
    if abiertos:
        q = q.where(Feedback.estado.in_(("Nuevo", "En revisión")))
    rows = list(db.scalars(q))
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({f.user_id for f in rows})))} if rows else {}
    items = [_fb_out(f, users.get(f.user_id), True) for f in rows]
    return {"texto": feedback_markdown(items, {f.id: f"(captura en la app, comentario #{f.id})" for f in rows if f.image}), "cantidad": len(items)}


# ---------- Datos de ejemplo (para conocer la app sin datos reales) ----------
class DemoIn(BaseModel):
    records: list[dict]


def _demo_ids(db: Session, oid: int) -> tuple[list[Record], set[str]]:
    rows = list(db.scalars(select(Record).where(Record.user_id == oid)))
    demo_pats = {r.id for r in rows if r.kind == "patient" and decrypt(r.payload).get("demo")}
    out = [r for r in rows if r.patient_id in demo_pats or r.id in demo_pats or (r.kind in ("appt", "pnote") and decrypt(r.payload).get("demo"))]
    return out, demo_pats


@app.post("/api/demo", status_code=201)
def demo_load(body: DemoIn, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Guarda los consultantes ficticios que arma la app. Quedan marcados por el servidor para poder borrarlos
    después, aunque tengan documentos firmados; solo se aceptan consultantes con documento «DEMO-…»."""
    recs = body.records
    if not recs or len(recs) > 80:
        raise HTTPException(400, "Datos de ejemplo no válidos")
    pats = {r.get("id") for r in recs if r.get("kind") == "patient"}
    if _demo_ids(db, user.id)[1]:
        raise HTTPException(409, "Ya tiene datos de ejemplo cargados")
    signer = _signer(db, user)
    rows = []
    for r in recs:
        kind, rid = r.get("kind"), r.get("id") or ""
        if kind not in ("patient", "note", "appt", "pnote") or not ID_RE.match(rid) or not rid.startswith(PREFIX[kind]):
            raise HTTPException(400, "Registro de ejemplo no válido")
        if db.get(Record, (user.id, rid)) or len(json.dumps(r, ensure_ascii=False)) > MAX_RECORD_BYTES:
            raise HTTPException(400, "Registro de ejemplo no válido")
        if kind == "patient" and not str(r.get("documento") or "").startswith("DEMO-"):
            raise HTTPException(400, "Los consultantes de ejemplo deben tener documento DEMO-")
        pid = rid if kind == "patient" else r.get("patientId") or None
        if kind != "patient" and pid not in pats and not (kind == "pnote" and pid is None):
            raise HTTPException(400, "Los registros de ejemplo deben ser de consultantes de ejemplo")
        r = {k: v for k, v in r.items() if k not in SERVER_KEYS}
        if kind == "patient":
            r = _patient_rules(None, r, user, False, signer)
        r["demo"] = True
        rows.append(Record(user_id=user.id, id=rid, kind=kind, patient_id=pid, payload=encrypt(r)))
    db.add_all(rows)
    db.commit()
    audit(db, user.id, "demo.load", str(len(rows)))
    return {"cargados": len(rows)}


@app.delete("/api/demo")
def demo_delete(user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Borra los datos de ejemplo (y lo que se haya agregado a esos consultantes ficticios)."""
    rows, pats = _demo_ids(db, user.id)
    for r in rows:
        b = db.get(Blob, (user.id, r.id))
        if b:
            db.delete(b)
        db.delete(r)
    for x in db.scalars(select(ApptReminder).where(ApptReminder.user_id == user.id, ApptReminder.appt_id.in_({r.id for r in rows if r.kind == "appt"} or {""}))):
        db.delete(x)
    for x in db.scalars(select(ConsentRequest).where(ConsentRequest.user_id == user.id, ConsentRequest.patient_id.in_(pats or {""}))):
        db.delete(x)
    db.commit()
    audit(db, user.id, "demo.delete", str(len(rows)))
    return {"borrados": len(rows)}


# ---------- Bitácora de accesos  ----------
class AccessIn(BaseModel):
    patientId: str
    vista: str = ""


@app.post("/api/acceso", status_code=204)
def access_log(body: AccessIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """La app avisa cada vez que alguien abre una historia (y qué pestaña). Repeticiones en 2 minutos no se repiten."""
    if not ID_RE.match(body.patientId or "") or not db.get(Record, (owner_id(user), body.patientId)):
        return
    vista = re.sub(r"[^\wáéíóúñÁÉÍÓÚÑ .-]", "", body.vista or "")[:40]
    since = datetime.now(timezone.utc) - timedelta(minutes=2)
    last = db.scalar(select(Audit).where(Audit.user_id == user.id, Audit.action == "history.view", Audit.patient_id == body.patientId)
                     .order_by(Audit.id.desc()).limit(1))
    if last and last.detail == vista and survey.aware(last.at) > since:
        return
    audit(db, user.id, "history.view", vista, patient_id=body.patientId, ip=client_ip(request))


AUDIT_TXT = {"history.view": "Abrió la historia", "record.put": "Guardó", "record.delete": "Eliminó", "history.export": "Descargó la historia completa",
             "blob.put": "Subió un adjunto", "blob.get": "Abrió un adjunto", "verify": "Se verificó un informe con su código", "records.list": "Cargó la lista de consultantes",
             "consent.remote.create": "Envió un consentimiento para firmar a distancia", "consent.remote.sign": "El consultante firmó a distancia",
             "login.ok": "Ingresó", "login.fail": "Intento de ingreso fallido", "login.2fa_fail": "Código de verificación equivocado",
             "access.denied": "Intento de acceso sin permiso", "password.change": "Cambió su contraseña", "record.import": "Importó",
             }
KIND_TXT = {"patient": "datos o documentos de la historia", "note": "una sesión", "report": "un informe", "scale": "una escala", "appt": "una cita", "file": "un adjunto"}


@app.get("/api/bitacora")
def access_list(patientId: str = "", limit: int = 300, user: User = Depends(pro_user), db: Session = Depends(get_db)):
    """Quién entró y qué hizo: el terapeuta y su equipo. Por historia (patientId) o en general (incluye ingresos)."""
    team = {u.id: u for u in db.scalars(select(User).where((User.id == user.id) | (User.owner_id == user.id)))}
    q = select(Audit).where(Audit.user_id.in_(team)).order_by(Audit.id.desc()).limit(max(1, min(limit, 1000)))
    if patientId:
        q = q.where(Audit.patient_id == patientId)
    else:
        q = q.where(Audit.action.in_(list(AUDIT_TXT)))
    pats = {r.id: decrypt(r.payload) for r in db.scalars(select(Record).where(Record.user_id == user.id, Record.kind == "patient"))}
    out = []
    for a in db.scalars(q):
        u = team.get(a.user_id)
        txt = AUDIT_TXT.get(a.action, a.action)
        if a.action in ("record.put", "record.delete", "record.import"):
            txt += " " + KIND_TXT.get((a.detail or "").split(":")[0], "un registro")
        elif a.action == "access.denied" and a.detail:
            txt += f" ({a.detail.split(' ', 1)[-1]})"
        elif a.action == "history.view" and a.detail:
            txt += " · " + a.detail
        p = pats.get(a.patient_id or "") or {}
        out.append({"at": _iso(a.at), "quien": u.name if u else "", "rol": "Equipo" if u and u.role == "asistente" else "Terapeuta",
                    "accion": txt, "tipo": a.action, "paciente": " ".join(x for x in (p.get("nombres"), p.get("apellidos")) if x) if a.patient_id else "",
                    "patientId": a.patient_id, "ip": a.ip or ""})
    return out
