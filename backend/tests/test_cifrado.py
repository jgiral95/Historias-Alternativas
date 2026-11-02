"""Cifrado AES-256-GCM: lo nuevo se cifra así, lo viejo (Fernet, AES-128) se sigue leyendo y se recifra."""
from cryptography.fernet import Fernet

from app import recifrar, security
from app.db import Record, SessionLocal

from conftest import client_for, make_user, patient


def test_new_data_uses_aes256_and_old_data_is_resealed():
    blob = security.encrypt({"a": "ñ"})
    assert blob[:3] == b"HC2" and security.is_current(blob) and security.decrypt(blob) == {"a": "ñ"}
    assert security.encrypt({"a": 1}) != security.encrypt({"a": 1})  # nonce aleatorio
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    try:
        security.decrypt(tampered)
        assert False, "un dato alterado no se debe poder leer"
    except Exception:
        pass
    # un dato guardado con el formato anterior (Fernet con la misma DATA_KEY) se sigue leyendo
    old = Fernet(security._KEYS[0].encode()).encrypt(b'{"viejo":true}')
    assert security.decrypt(old) == {"viejo": True} and not security.is_current(old)
    # y el recifrado lo pasa a AES-256 sin perder nada
    make_user("ana@x.co")
    c = client_for("ana@x.co")
    c.put("/api/records/p_1", json=patient("p_1"))
    with SessionLocal() as db:
        row = db.get(Record, (1, "p_1"))
        content = security.decrypt(row.payload)
        row.payload = Fernet(security._KEYS[0].encode()).encrypt(security.json.dumps(content).encode())
        db.commit()
    assert c.get("/api/records").json()[0]["nombres"] == "María"  # se lee igual
    done = recifrar.run()
    assert done.get("records") == 1
    with SessionLocal() as db:
        assert security.is_current(db.get(Record, (1, "p_1")).payload)
    assert recifrar.run() == {}  # ya estaba al día
    assert c.get("/api/records").json()[0]["nombres"] == "María"
