"""Pasa todos los datos cifrados al formato actual: AES-256-GCM con la clave principal de DATA_KEY.

Corre solo al arrancar el servidor (en segundo plano) y también se puede correr a mano:
    docker compose exec api python -m app.recifrar
Recorre todas las columnas cifradas de la base; lo que ya está al día no se toca. Sirve también para
terminar una rotación de clave: después de correrlo, la clave anterior ya no hace falta."""
import logging
import threading

from sqlalchemy import LargeBinary, select, update

from .db import Base, SessionLocal
from .security import is_current, reseal

log = logging.getLogger("recifrar")


def run(batch: int = 200) -> dict:
    done: dict[str, int] = {}
    with SessionLocal() as db:
        for table in Base.metadata.sorted_tables:
            cols = [c for c in table.columns if isinstance(c.type, LargeBinary)]
            if not cols:
                continue
            pk = list(table.primary_key.columns)
            n = 0
            rows = db.execute(select(*pk, *cols)).all()
            for row in rows:
                vals = {c.name: row._mapping[c] for c in cols}
                new = {k: reseal(v) for k, v in vals.items() if v is not None and not is_current(v)}
                if not new:
                    continue
                db.execute(update(table).where(*[c == row._mapping[c] for c in pk]).values(**new))
                n += 1
                if n % batch == 0:
                    db.commit()
            db.commit()
            if n:
                done[table.name] = n
    if done:
        log.warning("Datos recifrados con AES-256: %s", done)
    return done


def start() -> None:
    def go():
        try:
            run()
        except Exception:  # noqa: BLE001 — no debe tumbar el servidor; se reintenta en el próximo arranque
            log.exception("No se pudieron recifrar los datos")
    threading.Thread(target=go, name="recifrar", daemon=True).start()


if __name__ == "__main__":
    print(run() or "Todo estaba al día.")
