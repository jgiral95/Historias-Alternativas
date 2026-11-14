import glob, re, sys
sys.path.insert(0, "scripts")
import tutear as T, tutear2 as P
n = 0
def w(p, new):
    global n
    old = open(p, encoding="utf8").read()
    if new != old:
        open(p, "w", encoding="utf8").write(new); n += 1
f = P.pron
for p in glob.glob("frontend/js/*.js"):
    src = open(p, encoding="utf8").read()
    w(p, T.en_keys(src, f) if re.search(r"/en-\d+\.js$", p) else T.js_tutear(src, f))
for p in glob.glob("frontend/*.html") + glob.glob("frontend/blog/*.html"):
    src = open(p, encoding="utf8").read()
    parts = re.split(r"(<style.*?</style>|<script.*?</script>)", src, flags=re.S)
    w(p, "".join(T.js_tutear(x, f) if x.startswith("<script") else x if x.startswith("<style") else f(x) for x in parts))
for p in glob.glob("backend/app/*.py"):
    src = open(p, encoding="utf8").read()
    new = T.py_tutear(src, solo_claves=p.endswith("traduccion.py"), fn=f)
    compile(new, p, "exec"); w(p, new)
print("cambiados:", n)
