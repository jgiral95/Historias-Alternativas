"""Diseño común de los correos de Alter-Karute: logo, título, tarjeta de datos, botón y pie.

Cada correo conserva su versión en texto plano y le suma esta versión HTML. El logo es la imagen pública
/logo-email.png del sitio (PUBLIC_URL); si PUBLIC_URL no está configurado, el correo sale sin logo."""
import re
from email.message import EmailMessage
from html import escape as e

from .config import PUBLIC_URL

URL_RE = re.compile(r"https?://[^\s]+")
_P = 'style="padding:16px 32px 0;font-size:15px;line-height:1.6"'
BOSQUE, SALVIA, ARENA, CREMA, SUAVE, LINEA, TINTA = "#2F4A3A", "#7C9A83", "#F6F1E7", "#FBF8F2", "#6A675C", "#E3DBCB", "#2B2A25"
ACERCA = ("Alter-Karute es un espacio sereno para que terapeutas de terapias alternativas lleven el seguimiento de sus consultantes: "
          "sesiones, agenda y acuerdos en un solo lugar. No es una herramienta clínica.")


def separar_enlace(texto: str) -> tuple[str, str, str]:
    """Separa un mensaje con un enlace en (antes, enlace, después) para poner el enlace en un botón."""
    m = URL_RE.search(texto or "")
    if not m:
        return (texto or "").strip(), "", ""
    antes = texto[:m.start()].rstrip(" :\n")
    return (antes + "." if antes and antes[-1] not in ".!?»" else antes), m.group(0).rstrip(".,;"), texto[m.end():].strip()


def layout(titulo: str, intro=(), filas=(), cierre=(), boton: tuple[str, str] | None = None, notas=(), firma: tuple[str, str] = ("Atentamente,", "El equipo de Alter-Karute"),
           codigo: str = "", bloque: str = "") -> str:
    """intro/cierre: párrafos; filas: [(etiqueta, valor)] en la tarjeta; notas: textos pequeños (o (texto, etiqueta, enlace));
    bloque: texto largo en recuadro (por ejemplo, un consentimiento); codigo: código grande."""
    par = lambda ts: "".join(f"<tr><td {_P}>{e(t)}</td></tr>" for t in ts if t)
    tarjeta = ""
    if filas:
        datos = "".join(f'<tr><td style="padding:3px 12px 3px 0;font-size:13px;color:{SUAVE};vertical-align:top">{e(k)}</td><td style="padding:3px 0;font-size:15px;font-weight:bold;color:{TINTA}">{e(v)}</td></tr>' for k, v in filas if v)
        tarjeta = f'<tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E4EBE2;border-left:4px solid {SALVIA};border-radius:8px"><tr><td style="padding:14px 18px"><table role="presentation" cellpadding="0" cellspacing="0">{datos}</table></td></tr></table></td></tr>'
    cod = f'<tr><td style="padding:20px 32px 0"><div style="background:#E4EBE2;border-radius:8px;padding:16px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:{BOSQUE}">{e(codigo)}</div></td></tr>' if codigo else ""
    blq = f'<tr><td style="padding:20px 32px 0"><div style="background:{CREMA};border:1px solid {LINEA};border-radius:8px;padding:14px 18px;font-size:14px;line-height:1.6;white-space:pre-wrap">{e(bloque)}</div></td></tr>' if bloque else ""
    btn = ""
    if boton:
        u = e(boton[1], quote=True)
        btn = (f'<tr><td style="padding:24px 32px 0"><a href="{u}" style="background:{BOSQUE};color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:99px;font-weight:bold;font-size:15px;display:inline-block">{e(boton[0])}</a></td></tr>'
               f'<tr><td style="padding:16px 32px 0;font-size:13px;line-height:1.6;color:{SUAVE}">Si el botón no funciona, copie y pegue esta dirección en su navegador:<br><a href="{u}" style="color:{BOSQUE};word-break:break-all">{e(boton[1])}</a></td></tr>')
    nts = ""
    for n in notas:
        if not n:
            continue
        txt = f'{e(n[0])} <a href="{e(n[2], quote=True)}" style="color:{BOSQUE}">{e(n[1])}</a>.' if isinstance(n, tuple) else e(n)
        nts += f'<tr><td style="padding:16px 32px 0;font-size:13px;line-height:1.6;color:{SUAVE}">{txt}</td></tr>'
    logo = f'<img src="{e(PUBLIC_URL, quote=True)}/logo-email.png" width="64" height="64" alt="Alter-Karute" style="display:block;border:0">' if PUBLIC_URL else f'<b style="font-size:20px;color:{BOSQUE}">Alter-Karute</b>'
    sitio = f'<br><a href="{e(PUBLIC_URL, quote=True)}" style="color:{BOSQUE};font-weight:bold;text-decoration:none">Conozca Alter-Karute →</a>' if PUBLIC_URL else ""
    return f"""<!doctype html><html lang="es"><body style="margin:0;padding:0;background:{ARENA}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{ARENA};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;border-top:6px solid {BOSQUE};font-family:Arial,Helvetica,sans-serif;color:{TINTA}">
<tr><td style="padding:32px 32px 8px">{logo}</td></tr>
<tr><td style="padding:8px 32px 0"><h1 style="margin:0;font-size:22px;line-height:1.3;color:{BOSQUE}">{e(titulo)}</h1></td></tr>
{par(intro)}{cod}{tarjeta}{blq}{par(cierre)}{btn}{nts}
<tr><td style="padding:24px 32px 24px;font-size:14px;line-height:1.6">{e(firma[0])}<br><b>{e(firma[1])}</b></td></tr>
<tr><td style="padding:0 32px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid {LINEA}"><tr><td style="padding-top:18px;font-size:13px;line-height:1.6;color:{SUAVE}"><b style="color:{BOSQUE}">Alter-Karute</b>{e(ACERCA[len("Alter-Karute"):])}{sitio}</td></tr></table></td></tr>
</table>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8B879A;margin:16px 0 0">Mensaje automático enviado con Alter-Karute.</p>
</td></tr></table></body></html>"""


def agregar(m: EmailMessage, html: str) -> EmailMessage:
    """Suma al correo (ya con su texto plano) la versión HTML y, en ambas, la descripción de Alter-Karute."""
    m.set_content(m.get_content().rstrip("\n") + f"\n\n--\n{ACERCA}" + (f"\n{PUBLIC_URL}" if PUBLIC_URL else "") + "\n")
    m.add_alternative(html, subtype="html")
    return m
