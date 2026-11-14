"""Pasa los textos de «usted» a «tú». Se aplica igual a los textos de la app y a las claves de los diccionarios EN,
para que las traducciones sigan emparejadas. Palabra por palabra (sin contexto): lo ambiguo (su/le/lo) se revisa a mano."""
import re

IMP = """abra abre|acompañe acompaña|actívela actívala|agende agenda|agregue agrega|ahorre ahorra|arme arma|arrastre arrastra|
cambie cambia|comparta comparte|complete completa|compruebe comprueba|comuníquese comunícate|concluya concluye|conecte conecta|confirme confirma|
conozca conoce|copie copia|cree crea|descargue descarga|describa describe|desplace desplaza|dibuje dibuja|elija elige|elimine elimina|
entréguela entrégala|entréguele entrégale|envíe envía|envíele envíale|escriba escribe|espere espera|explore explora|fije fija|firme firma|
guarde guarda|guárdela guárdala|haga haz|indique indica|ingrese ingresa|instale instala|intente intenta|lea lee|marque marca|modifíquela modifícala|
muestre muestra|observe observa|pase pasa|pegue pega|pida pide|pruebe prueba|pulse pulsa|recargue recarga|reciba recibe|registre registra|
renueve renueva|repita repite|responda responde|revise revisa|seleccione selecciona|suba sube|suscríbase suscríbete|use usa|vea ve|vuelva vuelve|
ábrala ábrela|ponga pon|tenga ten|siga sigue|busque busca|cierre cierra|añada añade|borre borra|cargue carga|comience comienza|continúe continúa|
adjunte adjunta|anote anota|asegúrese asegúrate|cuide cuida|deje deja|diga di|evite evita|introduzca introduce|invite invita|llene llena|mire mira|
mueva mueve|ordene ordena|organice organiza|piense piensa|recuerde recuerda|reserve reserva|salga sal|separe separa|tome toma|traiga trae|
verifique verifica|vaya ve|venga ven|sepa sabe|escoja escoge|pruébela pruébala|ábrelo ábrelo|configure configura|cuéntenos cuéntanos|díganos dinos|
imprima imprime|descargue descarga|comparta comparte|acepte acepta|abónele abónale|anule anula|apague apaga|aplique aplica|arrastre arrastra|
cancele cancela|chequee chequea|clasifique clasifica|conserve conserva|consulte consulta|copie copia|corrija corrige|dé da|desactive desactiva|
digite digita|edite edita|ejecute ejecuta|empiece empieza|encuentre encuentra|entre entra|escanee escanea|filtre filtra|genere genera|
habilite habilita|incluya incluye|inicie inicia|inserte inserta|lleve lleva|mantenga mantén|mencione menciona|mueva mueve|nombre nombra|
obtenga obtén|ofrezca ofrece|oprima oprime|permita permite|presione presiona|programe programa|proteja protege|quite quita|reemplace reemplaza|
rellene rellena|restaure restaura|retome retoma|sincronice sincroniza|sume suma|tenga ten|toque toca|transcriba transcribe|utilice utiliza|
valide valida|visite visita|vuelva vuelve|actualice actualiza|amplíe amplía|añádalo añádelo|bloquee bloquea|compártalo compártelo|
descríbalo descríbelo|escríbalo escríbelo|guárdelo guárdalo|léalo léelo|llámelo llámalo|pídalo pídelo|revíselo revísalo|úselo úsalo""".replace("\n", "")
PAIRS = {}
for it in IMP.split("|"):
    it = it.strip()
    if it:
        a, b = it.split(" ")
        PAIRS[a] = b
FIX = {"Usted": "Tú", "usted": "tú", "Ustedes": "Ustedes"}
PAIRS.update({"ve": "ve"})  # «vea» → «ve» (ver) y «vaya» → «ve»: coinciden
WORD = re.compile(r"[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]+")
SKIP_BEFORE = re.compile(r"(?:^|[.\w/#_-])$")


def case_like(src, dst):
    if src[:1].isupper() and not src.isupper():
        return dst[:1].upper() + dst[1:]
    if src.isupper() and len(src) > 1:
        return dst.upper()
    return dst


VOC = "aeiouáéíóú"


def acentuar(w: str) -> str:
    """Pone la tilde en la sílaba tónica de una forma llana (guarda → guárda) para pegarle pronombres."""
    if any(c in "áéíóú" for c in w):
        return w
    g = [(m.start(), m.end()) for m in re.finditer(r"[aeo][iu]|[iu][aeo]|[aeiou]", w)]
    if len(g) < 2:
        return w
    i = g[-2]
    seg = w[i[0]:i[1]]
    k = i[0] + (1 if len(seg) == 2 and seg[0] in "iu" else 0)
    return w[:k] + "áéíóú"["aeiou".index(w[k])] + w[k + 1:]


CLIT = ("lo", "la", "los", "las", "le", "les", "me", "nos")
for _u, _t in list(PAIRS.items()):
    if _u in ("ve", "di", "haz", "pon", "ten", "sal", "ven"):
        continue
    for _c in CLIT:
        PAIRS.setdefault(acentuar(_u) + _c if not any(x in "áéíóú" for x in _u) else _u + _c, (acentuar(_t) if not any(x in "áéíóú" for x in _t) else _t) + _c)
PAIRS.update({"pongo": "pongo"})
CAP_ONLY = {"use": "usa", "firme": "firma", "pase": "pasa", "tome": "toma", "toque": "toca", "quite": "quita", "lleve": "lleva", "sume": "suma"}
for k in list(PAIRS):
    if k in ("cierre", "nombre", "entre") or k in CAP_ONLY:
        del PAIRS[k]
LOWER_USE = re.compile(r"\b(use|firme|pase|tome|quite|lleve)(?= (?:el|la|los|las|un|una|«|solo|variables|lo|aquí|esta|este|otro|otra|algún|alguna)\b)")


def tutear(text: str) -> str:
    text = LOWER_USE.sub(lambda m: CAP_ONLY[m.group(1)], text)
    text = re.sub(r"(?<![\w])(Use|Firme|Pase|Tome|Toque|Quite|Lleve|Sume)\b(?![-_=(:])", lambda m: m.group(1)[0] + CAP_ONLY[m.group(1).lower()][1:], text)
    def rep(m):
        w = m.group(0)
        s, e = m.span()
        neg = False
        if w.lower() in PAIRS or w.lower() in CAP_ONLY:
            pre = re.split(r"[.:;,?!¿¡>«»(\n]", text[:s])[-1]
            if re.search(r"\b(que|quien|quienes|cuando|mientras|aunque|hasta|donde|sin|se|si)\b", pre, re.I) and not re.search(r"\bno\s+(?:(?:lo|la|le|los|las|me|se|te)\s+)*$", pre, re.I):
                return w
            if re.match(r"\s+que\b", text[e:e + 5]):
                return w  # «cree que» (creer): no es una orden
            neg = bool(re.search(r"(?:^|\s)no\s+(?:(?:lo|la|le|los|las|me|se|te)\s+)*$", pre, re.I))
        # no tocar identificadores de código (foo.use, _use, use_x, data-use) ni palabras pegadas a ".", "_" o "-"
        if s > 0 and text[s - 1] in "._-/#$@" or e < len(text) and text[e] in "_-:=(/":
            return w
        if w in FIX:
            return FIX[w]
        d = PAIRS.get(w.lower())
        if d and neg:
            d = w.lower() + "s"  # «no escriba» → «no escribas»
        return case_like(w, d) if d else w
    return WORD.sub(rep, text)


# ---------- JS: solo el texto de las cadenas (no el código) ----------
def js_tutear(src: str, fn=None) -> str:
    fn = fn or tutear
    out, n = [], len(src)

    def code(i, stop_brace=False):
        depth = 0
        while i < n:
            c = src[i]
            if c in "'\"":
                j = i + 1
                while j < n and src[j] != c:
                    j += 2 if src[j] == "\\" else 1
                out.append(c + fn(src[i + 1:j]) + (src[j] if j < n else ""))
                i = j + 1
            elif c == "`":
                i = tmpl(i + 1)
            elif c == "/" and i + 1 < n and src[i + 1] == "/":
                j = src.find("\n", i); j = n if j < 0 else j
                out.append(src[i:j]); i = j
            elif c == "/" and i + 1 < n and src[i + 1] == "*":
                j = src.find("*/", i + 2); j = n if j < 0 else j + 2
                out.append(src[i:j]); i = j
            elif c == "/" and re.search(r"([(=,:\[!&|?{};]|return)\s*$", "".join(out)[-40:]):  # literal de expresión regular
                j, cls = i + 1, False
                while j < n and (src[j] != "/" or cls) and src[j] != "\n":
                    if src[j] == "\\":
                        j += 1
                    elif src[j] == "[":
                        cls = True
                    elif src[j] == "]":
                        cls = False
                    j += 1
                j += 1
                out.append(src[i:j]); i = j
            elif c == "{":
                depth += 1; out.append(c); i += 1
            elif c == "}":
                if stop_brace and depth == 0:
                    return i
                depth -= 1; out.append(c); i += 1
            else:
                out.append(c); i += 1
        return i

    def tmpl(i):
        out.append("`")
        buf = i
        while i < n:
            c = src[i]
            if c == "\\":
                i += 2
            elif c == "`":
                out.append(fn(src[buf:i]) + "`")
                return i + 1
            elif c == "$" and i + 1 < n and src[i + 1] == "{":
                out.append(fn(src[buf:i]) + "${")
                i = code(i + 2, True)
                out.append("}")
                i += 1
                buf = i
            else:
                i += 1
        out.append(src[buf:])
        return n
    code(0)
    return "".join(out)


def en_keys(src: str, fn=None) -> str:
    fn = fn or tutear
    """Diccionarios en-*.js: solo la clave (español) de cada par «es»:«en»."""
    return re.sub(r'"((?:\\.|[^"\\])*)":(?=")', lambda m: '"' + fn(m.group(1)) + '":', src)


# ---------- Python: cadenas del servidor (y solo las claves en traduccion.py) ----------
def py_tutear(src: str, solo_claves: bool = False, fn=None) -> str:
    import ast
    fn = fn or tutear
    tree = ast.parse(src)
    lines = src.splitlines(keepends=True)
    offs = [0]
    for ln in lines:
        offs.append(offs[-1] + len(ln.encode("utf8")))
    b = src.encode("utf8")
    spans = []

    def add(node):
        spans.append((offs[node.lineno - 1] + node.col_offset, offs[node.end_lineno - 1] + node.end_col_offset))

    if solo_claves:
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                for k in node.keys:
                    if isinstance(k, ast.Constant) and isinstance(k.value, str):
                        add(k)
    else:
        skip = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.JoinedStr):
                add(node); skip.update(id(c) for c in ast.walk(node))
            elif isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip:
                add(node)
    out, last = [], 0
    for s, e in sorted(set(spans)):
        if s < last:
            continue
        seg = b[s:e].decode("utf8")
        seg = re.sub(r"\{[^{}]*\}|[^{]+", lambda m: m.group(0) if m.group(0).startswith("{") and m.group(0).endswith("}") and len(m.group(0)) > 1 and not re.fullmatch(r"\{\d*\}", m.group(0)) and "(" in m.group(0) or "[" in m.group(0) else fn(m.group(0)), seg) if seg[:1] in "fF" or seg[:2].lower() in ("rf", "fr") else fn(seg)
        out.append(b[last:s].decode("utf8")); out.append(seg); last = e
    out.append(b[last:].decode("utf8"))
    return "".join(out)
