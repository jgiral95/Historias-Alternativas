import base64
import hashlib
import json
import os
import time

import jwt
from argon2 import PasswordHasher
from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .config import DATA_KEY, SESSION_HOURS, SESSION_SECRET

_ph = PasswordHasher()
_KEYS = [k.strip() for k in DATA_KEY.split(",") if k.strip()]
_fernet = MultiFernet([Fernet(k.encode()) for k in _KEYS])  # formato anterior (AES-128): solo para leer

# Cifrado actual: AES-256-GCM. La clave de 256 bits se deriva de cada
# DATA_KEY con HKDF-SHA256, así que no hay que cambiar el .env. La primera clave cifra; todas sirven para leer
# (rotación). Formato: «HC2» + identificador de la clave (4 bytes) + nonce (12 bytes) + texto cifrado con su etiqueta.
MAGIC = b"HC2"


def _derive(key: str) -> bytes:
    raw = base64.urlsafe_b64decode(key.encode())
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"historia-clinica/aes-256-gcm", info=b"datos").derive(raw)


_AES = [(hashlib.sha256(d).digest()[:4], AESGCM(d)) for d in (_derive(k) for k in _KEYS)]
CURRENT = MAGIC + _AES[0][0]


def _seal(raw: bytes) -> bytes:
    kid, aes = _AES[0]
    nonce = os.urandom(12)
    return MAGIC + kid + nonce + aes.encrypt(nonce, raw, MAGIC + kid)


def _open(blob: bytes) -> bytes:
    blob = bytes(blob)
    if blob[:3] == MAGIC:
        kid = blob[3:7]
        for k, aes in _AES:
            if k == kid:
                return aes.decrypt(blob[7:19], blob[19:], MAGIC + kid)
        raise InvalidToken("Clave de cifrado desconocida: revisa DATA_KEY")
    return _fernet.decrypt(blob)  # dato guardado antes del cambio a AES-256


def is_current(blob) -> bool:
    """Si el dato ya está cifrado con AES-256 y la clave principal."""
    return bytes(blob[:7]) == CURRENT
DUMMY_HASH = _ph.hash("contraseña-ficticia-para-igualar-tiempos")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def check_password(stored_hash: str, password: str) -> bool:
    try:
        return _ph.verify(stored_hash, password)
    except Exception:
        return False


def make_token(user_id: int, exp: int | None = None) -> str:
    """exp es el vencimiento absoluto (12 h desde el ingreso); act, la última actividad."""
    now = int(time.time())
    exp = exp or now + SESSION_HOURS * 3600
    return jwt.encode({"sub": str(user_id), "exp": exp, "act": now}, SESSION_SECRET, algorithm="HS256")


def read_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        data = jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
        data["sub"] = int(data["sub"])
        return data
    except Exception:
        return None


def encrypt(obj: dict) -> bytes:
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return _seal(raw)


# ---------- Verificación en dos pasos (TOTP, RFC 6238) ----------
import base64 as _b64
import hashlib as _hl
import hmac as _hmac
import secrets as _secrets
import struct as _struct


def totp_new_secret() -> str:
    return _b64.b32encode(_secrets.token_bytes(20)).decode().rstrip("=")


def _hotp(secret: str, counter: int) -> str:
    key = _b64.b32decode(secret + "=" * (-len(secret) % 8))
    h = _hmac.new(key, _struct.pack(">Q", counter), _hl.sha1).digest()
    o = h[-1] & 0x0F
    return f"{(_struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def totp_at(secret: str, t: float | None = None) -> str:
    return _hotp(secret, int((t if t is not None else time.time()) // 30))


def totp_check(secret: str, code: str, last_step: int | None) -> int | None:
    """Devuelve el paso de tiempo usado si el código es válido (±30 s) y no se ha usado antes."""
    code = "".join(c for c in str(code) if c.isdigit())
    if len(code) != 6:
        return None
    now = int(time.time() // 30)
    for step in (now - 1, now, now + 1):
        if (last_step is None or step > last_step) and _hmac.compare_digest(_hotp(secret, step), code):
            return step
    return None


def recovery_new(n: int = 10) -> list[str]:
    abc = "23456789abcdefghjkmnpqrstuvwxyz"
    return ["".join(_secrets.choice(abc) for _ in range(4)) + "-" + "".join(_secrets.choice(abc) for _ in range(4)) for _ in range(n)]


def recovery_hash(code: str) -> str:
    return _hl.sha256(code.strip().lower().replace(" ", "").encode()).hexdigest()


def encrypt_bytes(raw: bytes) -> bytes:
    return _seal(raw)


def decrypt_bytes(blob: bytes) -> bytes:
    return _open(blob)


def decrypt(blob: bytes) -> dict:
    return json.loads(_open(blob).decode("utf-8"))


def reseal(blob: bytes) -> bytes:
    """Vuelve a cifrar un dato con AES-256 y la clave principal (para pasar los datos viejos o rotar la clave)."""
    return _seal(_open(blob))
