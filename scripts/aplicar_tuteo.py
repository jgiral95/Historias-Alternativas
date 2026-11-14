import glob, re, sys
sys.path.insert(0, "scripts")
import tutear as T
n = 0
def w(p, new):
    global n
    old = open(p, encoding="utf8").read()
    if new != old:
        open(p, "w", encoding="utf8").write(new); n += 1
for p in glob.glob("frontend/js/*.js"):
    src = open(p, encoding="utf8").read()
    w(p, T.en_keys(src) if re.search(r"/en-\d+\.js$", p) else T.js_tutear(src))
for p in glob.glob("frontend/*.html") + glob.glob("frontend/blog/*.html"):
    src = open(p, encoding="utf8").read()
    parts = re.split(r"(<style.*?</style>|<script.*?</script>)", src, flags=re.S)
    out = []
    for x in parts:
        out.append(T.js_tutear(x) if x.startswith("<script") else x if x.startswith("<style") else T.tutear(x))
    w(p, "".join(out))
print("archivos cambiados:", n)
for p in glob.glob("backend/app/*.py"):
    src = open(p, encoding="utf8").read()
    new = T.py_tutear(src, solo_claves=p.endswith("traduccion.py"))
    compile(new, p, "exec")
    w(p, new)
print("total:", n)
