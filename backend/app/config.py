import os


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}")
    return value


DATABASE_URL = _required("DATABASE_URL")
SESSION_SECRET = _required("SESSION_SECRET")
# Una o varias claves Fernet separadas por coma. La primera cifra; todas pueden descifrar (rotación).
DATA_KEY = _required("DATA_KEY")

if len(SESSION_SECRET) < 32:
    raise RuntimeError("SESSION_SECRET debe tener al menos 32 caracteres")

SESSION_HOURS = 12
# Minutos sin actividad tras los cuales la sesión se cierra sola.
IDLE_MINUTES = max(5, int(os.environ.get("IDLE_MINUTES", "30") or 30))
# Dispositivo de confianza: tras verificar el código en un dispositivo, no se vuelve a pedir allí mientras se use
# al menos una vez cada tantos días. 0 desactiva la opción (el código se pide siempre).
TRUSTED_DEVICE_DAYS = max(0, int(os.environ.get("TRUSTED_DEVICE_DAYS", "30") or 0))
MIN_PASSWORD = 10
MAX_RECORD_BYTES = 2_000_000
MAX_FILE_BYTES = 8 * 1024 * 1024
# Conexión directa con Google Calendar (opcional). Si faltan, solo funciona el enlace iCal.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
# Minutos durante los cuales un adjunto recién subido se puede quitar (error de carga).
FILE_UNDO_MINUTES = 15
# Correo saliente para las encuestas de satisfacción (opcional; vea «Encuestas de satisfacción» en el README).
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", "").strip() or SMTP_USER
# Días que dura abierta una encuesta y días mínimos antes de volver a invitar al mismo paciente.
SURVEY_DAYS_OPEN = 14
SURVEY_MIN_GAP_DAYS = 180
# Sorteo automático en segundo plano (0 lo apaga; las pruebas lo apagan).
SURVEY_SCHEDULER = os.environ.get("SURVEY_SCHEDULER", "1").strip() != "0"

# Botón de comentarios de la versión beta (0 lo oculta).
BETA_COMENTARIOS = os.environ.get("BETA_COMENTARIOS", "1").strip() != "0"

# Al arrancar, pasa en segundo plano los datos cifrados al formato actual (AES-256). 0 lo apaga (pruebas).
RECIFRAR_AL_ARRANCAR = os.environ.get("RECIFRAR_AL_ARRANCAR", "1").strip() != "0"
