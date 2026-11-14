import glob, re
R = [("y tú configuró tu correo","y configuraste tu correo"),("los campos que tú usa","los campos que usas"),("(puede partir del","(puedes partir del"),
("tú decide cuándo","tú decides cuándo"),("tú trata datos","tratas datos"),("tú debe tratarla","debes tratarla"),("Si tú no solicitó esta cuenta, ignore","Si no solicitaste esta cuenta, ignora"),
("Lo que tú observa","Lo que observas"),("tu equipo no las ves","tu equipo no las ve"),("Cada cita que cree, mueve o cancela","Cada cita que creas, muevas o canceles"),
("en que atiende y escriba","en que atiendes y escribe"),("y toque el lugar","y toca el lugar"),("los datos que tú toma","los datos que tomas"),("Puedes editarlas y borrarlas cuando quiera","Puedes editarlas y borrarlas cuando quieras")]
R[9]=("Cada cita que cree, mueve o cancela","Cada cita que creas, mueves o cancelas")
R[10]=("en que atiendes y escribe","en que atiendes y escribe")
R[10]=("en que atiende y escriba","en que atiendes y escribe")
n=0
for p in glob.glob("frontend/js/*.js")+glob.glob("frontend/*.html")+glob.glob("frontend/blog/*.html")+glob.glob("backend/app/*.py")+["scripts/site_en.json"]:
    s=o=open(p,encoding="utf8").read()
    for a,b in R: s=s.replace(a,b)
    if s!=o: open(p,"w",encoding="utf8").write(s); n+=1
print(n)
