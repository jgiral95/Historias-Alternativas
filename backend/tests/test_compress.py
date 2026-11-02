import hashlib
import os

import pytest

from app import compress
from app.db import Blob, SessionLocal

from conftest import client_for, make_user


def make_pdf(pages=2, lines=1500) -> bytes:
    """PDF válido con flujos de contenido sin comprimir (como los de algunos escáneres viejos)."""
    objs, kids = [], []
    body = "".join(f"BT /F1 9 Tf 40 {20 + (i % 70) * 10} Td (Linea {i} de la historia clinica escaneada) Tj ET\n" for i in range(lines)).encode()
    n = 3
    for _ in range(pages):
        kids.append(n)
        objs.append((n, b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents %d 0 R >>" % (n + 1)))
        objs.append((n + 1, b"<< /Length %d >>\nstream\n" % len(body) + body + b"\nendstream"))
        n += 2
    objs = [(1, b"<< /Type /Catalog /Pages 2 0 R >>"), (2, b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % k for k in kids) + b"] /Count %d >>" % pages)] + objs
    out, offs = bytearray(b"%PDF-1.4\n"), {}
    for num, o in objs:
        offs[num] = len(out)
        out += b"%d 0 obj\n" % num + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % offs[i] for i in range(1, len(objs) + 1))
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)
    return bytes(out)


def test_pack_is_lossless_and_only_when_it_helps():
    data = make_pdf()
    packed = compress.pack(data)
    assert packed.startswith(compress.MARK) and len(packed) < len(data) and compress.unpack(packed) == data
    rnd = os.urandom(5000)
    assert compress.pack(rnd) == rnd and compress.unpack(rnd) == rnd


@pytest.mark.skipif(not compress.GS, reason="sin Ghostscript")
def test_pdf_is_optimized_keeping_pages():
    data = make_pdf(pages=3)
    new = compress.optimize_pdf(data)
    assert new.startswith(b"%PDF-") and len(new) < len(data) * 0.85 and compress._pages(new) == 3
    assert compress.optimize_pdf(b"%PDF-1.4 roto") == b"%PDF-1.4 roto"  # si falla, queda el original


def test_upload_reports_hash_of_stored_file():
    make_user("z@x.co")
    c = client_for("z@x.co")
    data = make_pdf()
    r = c.put("/api/blobs/f_z", content=data, headers={"Content-Type": "application/pdf"})
    assert r.status_code == 200
    j = r.json()
    got = c.get("/api/blobs/f_z").content
    assert got.startswith(b"%PDF-") and j["original"] == len(data) and j["size"] == len(got)
    assert j["sha256"] == hashlib.sha256(got).hexdigest()
    with SessionLocal() as db:
        stored = db.get(Blob, (1, "f_z")) or next(iter(db.query(Blob).all()))
    assert len(stored.data) < len(data)  # ocupa menos en el servidor
