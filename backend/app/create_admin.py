"""Crea (o rescata) una cuenta de administrador.

Uso dentro del contenedor:
    docker compose exec api python -m app.create_admin correo@ejemplo.com "Nombre Apellido"
"""
import getpass
import sys

from sqlalchemy import delete, select

from .config import MIN_PASSWORD
from .db import SessionLocal, TrustedDevice, User, init_db
from .security import hash_password


def main() -> int:
    if len(sys.argv) < 3:
        print('Uso: python -m app.create_admin correo@ejemplo.com "Nombre Apellido"')
        return 2
    email, name = sys.argv[1].strip().lower(), sys.argv[2].strip()
    password = getpass.getpass("Contraseña: ")
    if password != getpass.getpass("Repita la contraseña: "):
        print("Las contraseñas no coinciden.")
        return 1
    if len(password) < MIN_PASSWORD:
        print(f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres.")
        return 1
    init_db()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            user.role, user.active, user.password_hash = "admin", True, hash_password(password)
            # rescate: también quita la verificación en dos pasos (por si se perdió el teléfono)
            user.totp_enabled, user.totp_secret, user.totp_last, user.recovery_codes = False, None, None, None
            db.execute(delete(TrustedDevice).where(TrustedDevice.user_id == user.id))
            print(f"Cuenta existente actualizada como administrador (sin verificación en dos pasos): {email}")
        else:
            db.add(User(email=email, name=name, password_hash=hash_password(password), role="admin"))
            print(f"Administrador creado: {email}")
        db.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
