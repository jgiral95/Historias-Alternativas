"""Compresión de adjuntos para ahorrar espacio sin perder legibilidad.

- PDF: si hay Ghostscript, se reescribe con calidad de impresión (imágenes a 300 ppp). Se usa solo
  si ahorra al menos 15 % y el resultado es un PDF válido con el mismo número de páginas.
- Todos: antes de cifrar se comprimen sin pérdida (zlib) cuando eso ahorra espacio. Al leer se
  descomprimen y se entrega exactamente el archivo guardado.
Las imágenes se reducen en el navegador antes de subir (máximo 2400 px de lado, JPEG de alta calidad)."""
import os
import re
import shutil
import subprocess
import tempfile
import zlib

MARK = b"\x00HCZ1"  # ningún PDF, PNG, JPG ni WEBP empieza así
PDF_COMPRESS = os.environ.get("PDF_COMPRESS", "1").strip() != "0"
GS = shutil.which("gs")


def _pages(data: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page[^s]", data))


def optimize_pdf(data: bytes) -> bytes:
    """PDF reescrito con Ghostscript si conviene; si no, el original."""
    if not (PDF_COMPRESS and GS):
        return data
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, "in.pdf"), os.path.join(d, "out.pdf")
        with open(src, "wb") as f:
            f.write(data)
        try:
            subprocess.run([GS, "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5",
                            "-dPDFSETTINGS=/printer", "-dDetectDuplicateImages=true", "-dAutoRotatePages=/None",
                            "-sOutputFile=" + out, src], check=True, timeout=90, capture_output=True, cwd=d)
            with open(out, "rb") as f:
                new = f.read()
        except (subprocess.SubprocessError, OSError):
            return data
    if not new.startswith(b"%PDF-") or len(new) > len(data) * 0.85:
        return data
    pa, pb = _pages(data), _pages(new)
    if pa and pb and pa != pb:
        return data
    return new


def pack(data: bytes) -> bytes:
    """Compresión sin pérdida antes de cifrar, solo si ahorra al menos 5 %."""
    z = zlib.compress(data, 9)
    return MARK + z if len(z) + len(MARK) < len(data) * 0.95 else data


def unpack(data: bytes) -> bytes:
    return zlib.decompress(data[len(MARK):]) if data.startswith(MARK) else data
