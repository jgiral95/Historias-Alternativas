#!/usr/bin/env bash
# Pruebas de navegador de Karute.
# Levanta el backend (SQLite temporal) y un servidor que hace de nginx, y corre una prueba con Playwright.
#   bash tests/e2e/run.sh                 → prueba general (app_e2e.js)
#   bash tests/e2e/run.sh dos_pasos_e2e.js
#   bash tests/e2e/run.sh gcal_e2e.js     → con una configuración de Google ficticia
#   SIN_GOOGLE=1 bash tests/e2e/run.sh gcal_e2e.js → sin Google configurado
#   bash tests/e2e/run.sh todas           → todas, una tras otra
# Variables: PYTHON (por defecto python3; debe tener backend/requirements.txt instalado).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
PY="${PYTHON:-python3}"
TEST="${1:-app_e2e.js}"
if [ "$TEST" = "todas" ]; then
  st=0
  for t in humo_e2e.js app_e2e.js dos_pasos_e2e.js encuesta_e2e.js equipo_e2e.js movil_e2e.js caida_e2e.js recordatorios_e2e.js firma_distancia_e2e.js comentarios_e2e.js notas_proceso_e2e.js mano_e2e.js inicio_e2e.js formularios_e2e.js bitacora_e2e.js navegacion_e2e.js gcal_e2e.js; do echo "== $t"; bash "$0" "$t" || st=1; done
  echo "== gcal_e2e.js (sin Google)"; SIN_GOOGLE=1 bash "$0" gcal_e2e.js || st=1
  [ $st = 0 ] && echo "TODAS LAS PRUEBAS OK" || echo "HUBO FALLAS"; exit $st
fi
for port in 8099 8100 8101 8102; do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/"; then echo "El puerto $port está ocupado (¿quedó otra prueba corriendo?). Ciérrela y vuelva a intentar." >&2; exit 1; fi
done
mkdir -p "$HERE/out"; TMP="$(mktemp -d)"
cleanup() { for p in ${API_PID:-} ${WEB_PID:-}; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done; rm -rf "$TMP"; }
trap cleanup EXIT
unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET PUBLIC_URL SMTP_HOST SMTP_USER SMTP_PASSWORD SMTP_FROM
export SURVEY_SCHEDULER=0   # el sorteo se prueba con «sortear ahora»
export RECIFRAR_AL_ARRANCAR=0
export DATABASE_URL="sqlite:///$TMP/e2e.db"
export SESSION_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
export DATA_KEY="$("$PY" -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"
if [ "$TEST" = "gcal_e2e.js" ] && [ -z "${SIN_GOOGLE:-}" ]; then export GOOGLE_CLIENT_ID=cid-prueba GOOGLE_CLIENT_SECRET=sec PUBLIC_URL=http://127.0.0.1:8100; fi
cd "$REPO/backend"
"$PY" - <<'PY' || exit 1
from app.db import init_db, SessionLocal, User
from app.security import hash_password
init_db()
with SessionLocal() as db:
    db.add(User(email="psico@ejemplo.co", name="Psicóloga Prueba", password_hash=hash_password("contraseña-segura-123"), role="user")); db.add(User(email="admin@ejemplo.co", name="Juan Admin", password_hash=hash_password("contraseña-segura-123"), role="admin")); db.commit()
PY
"$PY" -m uvicorn app.main:app --port 8099 --log-level warning > "$HERE/out/api.log" 2>&1 & API_PID=$!
"$PY" -I "$HERE/serve.py" > "$HERE/out/web.log" 2>&1 & WEB_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8100/api/auth/me && break; sleep 1; done
if ! kill -0 "$API_PID" 2>/dev/null; then echo "El backend no arrancó:" >&2; cat "$HERE/out/api.log" >&2; exit 1; fi
cd "$HERE" && timeout 300 node "$TEST"
