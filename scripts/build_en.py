#!/usr/bin/env python3
"""Genera frontend/en/** (sitio estático en inglés) desde las páginas en español + scripts/site_en.json."""
import json, re, sys, pathlib, html as H
R = pathlib.Path(__file__).resolve().parent.parent / 'frontend'
D = json.load(open(pathlib.Path(__file__).parent / 'site_en.json', encoding='utf-8'))
N = lambda s: re.sub(r'\s+', ' ', H.unescape(s)).strip()
DN = {N(k): v for k, v in D.items()}
PAGES = ['index.html', 'privacidad.html', 'blog/index.html'] + ['blog/' + p.name for p in sorted((R / 'blog').glob('*.html')) if p.name != 'index.html']
miss = set()

def tr(s):
    n = N(s)
    if not n or not re.search(r'[A-Za-zÁÉÍÓÚáéíóúñÑ]', n): return s
    if n in DN:
        m = re.match(r'^(\s*)(.*?)(\s*)$', s, re.S)
        return m.group(1) + H.escape(DN[n], quote=False) + m.group(3)
    miss.add(n); return s

def url(p):  # ruta pública de una página
    p = re.sub(r'index\.html$', '', p); p = re.sub(r'\.html$', '', p)
    return '/' + p

def build(p):
    s = (R / p).read_text(encoding='utf-8')
    u = url(p)
    head, body = s.split('</head>', 1)
    # JSON-LD
    def ld(m):
        j = m.group(1)
        j = re.sub(r'"(description|headline|name|alternativeHeadline)":"([^"]*)"', lambda k: '"%s":"%s"' % (k.group(1), DN.get(N(k.group(2)), k.group(2)) if k.group(1) != 'name' or N(k.group(2)) in DN else k.group(2)), j)
        j = j.replace('"inLanguage":"es-CO"', '"inLanguage":"en"').replace('"inLanguage":"es"', '"inLanguage":"en"')
        return '<script type="application/ld+json">' + j + '</script>'
    head = re.sub(r'<script type="application/ld\+json">(.*?)</script>', ld, head, flags=re.S)
    head = re.sub(r'<title>(.*?)</title>', lambda m: '<title>' + tr(m.group(1)) + '</title>', head, flags=re.S)
    head = re.sub(r'(<meta (?:name|property)="(?:description|og:title|og:description)" content=")([^"]*)(")', lambda m: m.group(1) + tr(m.group(2)) + m.group(3), head)
    head = head.replace('og:locale" content="es_CO"', 'og:locale" content="en_US"')
    head = re.sub(r'(<link rel="canonical" href="__ORIGIN__)[^"]*"', r'\1/en' + (u if u != '/' else '/') + '"', head)
    head = re.sub(r'(<meta property="og:url" content="__ORIGIN__)[^"]*"', r'\1/en' + (u if u != '/' else '/') + '"', head)
    alt = ('<link rel="alternate" hreflang="es" href="__ORIGIN__%s">\n<link rel="alternate" hreflang="en" href="__ORIGIN__/en%s">\n<link rel="alternate" hreflang="x-default" href="__ORIGIN__%s">\n') % (u, u, u)
    head = head.replace('<link rel="icon"', alt + '<link rel="icon"', 1)
    head = re.sub(r'(href|src)="(?!/|https?:|mailto:|#|__ORIGIN__|data:)([^"]+)"', r'\1="/\2"', head)
    head = head.replace('<html lang="es">', '<html lang="en">')
    # cuerpo
    body = re.sub(r'(href|src)="(?!/|https?:|mailto:|#|__ORIGIN__|data:)([^"]+)"', r'\1="/\2"', body)
    body = re.sub(r'(<script\b[^>]*>)(.*?)(</script>)', lambda m: m.group(0), body, flags=re.S)
    parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>)', body, flags=re.S)
    for i in range(0, len(parts), 2):
        t = parts[i]
        t = re.sub(r'(?<=>)([^<>]+)(?=<)', lambda m: tr(m.group(1)), t)
        t = re.sub(r'((?:alt|aria-label|title|placeholder)=")([^"]*)(")', lambda m: m.group(1) + tr(m.group(2)) + m.group(3), t)
        # enlaces internos -> /en
        def lk(m):
            h = m.group(2)
            if h.startswith('/app'): return 'href="' + h + ('&' if '?' in h else '?') + 'lang=en"'
            if re.match(r'^/(blog/?.*|privacidad|)$', h): return m.group(1) + '"/en' + (h if h != '/' else '/') + '"'
            return m.group(0)
        t = re.sub(r'(href=)"(/[^"]*)"', lambda m: lk(m), t)
        parts[i] = t
    body = ''.join(parts)
    body = re.sub(r'<a class="lg"[^>]*>ES</a>', '<a class="lg" href="%s" hreflang="es" lang="es" title="Español">ES</a>' % u, body)
    body = re.sub(r'<a class="lang-en"[^>]*>English</a>', '<a href="%s" hreflang="es">Español</a>' % u, body)
    body = body.replace('<span><a href="/en/blog/">', '<span><a href="%s">Español</a> · <a href="/en/blog/">' % u, 1) if '<span><a href="/en/blog/">' in body else body
    return head + '</head>' + body

def patch_es(p):
    """Agrega hreflang y enlace «English» a la página en español (idempotente)."""
    f = R / p; s = f.read_text(encoding='utf-8'); u = url(p)
    if 'hreflang' not in s:
        alt = ('<link rel="alternate" hreflang="es" href="__ORIGIN__%s">\n<link rel="alternate" hreflang="en" href="__ORIGIN__/en%s">\n<link rel="alternate" hreflang="x-default" href="__ORIGIN__%s">\n') % (u, u, u)
        s = s.replace('<link rel="icon"', alt + '<link rel="icon"', 1)
    if 'class="lg"' not in s and '<nav class="nav" aria-label="Principal">' in s:
        s = s.replace('<nav class="nav" aria-label="Principal">', '<nav class="nav" aria-label="Principal"><a class="lg" href="/en%s" hreflang="en" lang="en" title="English">EN</a>' % u, 1)
        s = s.replace('</style>', 'header.top .nav a.lg{border:1.5px solid var(--salvia);color:var(--bosque);text-decoration:none;font-weight:600;font-size:14px;padding:6px 12px;border-radius:99px;min-height:0;letter-spacing:.04em}header.top .nav a.lg:hover{background:var(--crema)}</style>', 1)
    if 'class="lang-en"' not in s and '<span><a href="/blog/">' in s:
        s = s.replace('<span><a href="/blog/">', '<span><a class="lang-en" href="/en%s" hreflang="en">English</a> · <a href="/blog/">' % u, 1)
    f.write_text(s, encoding='utf-8')

# html lang en: lang=es en <html>
for p in PAGES:
    patch_es(p)
    out = R / 'en' / p
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(p), encoding='utf-8')
print('generadas', len(PAGES))
if miss:
    print('SIN TRADUCIR (%d):' % len(miss))
    for m in sorted(miss): print(' -', m[:110])
    sys.exit(1 if '--strict' in sys.argv else 0)
