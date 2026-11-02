/* Primer ingreso, datos de ejemplo y bitácora de accesos. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Primer ingreso: contraseña propia, bienvenida y primeros pasos ===== */
function renderFirstPassword(msg) {
  $('#modal-root').innerHTML = ''; $('#fb-root').innerHTML = '';
  $('#app').innerHTML = `<div class="panel" style="max-width:440px;margin:8vh auto 0"><form class="body" id="firstpw" autocomplete="on">
    <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div>
    <h2 style="margin:0;font-size:20px">Elija su contraseña</h2>
    <p style="margin:0;color:var(--muted)">Hola${S.user.name ? ', ' + esc(S.user.name.split(' ')[0]) : ''}. Su cuenta se creó con una contraseña temporal. Antes de empezar, elija una que solo usted conozca (mínimo 10 caracteres).</p>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}
    <input type="email" autocomplete="username" value="${esc(S.user.email)}" hidden aria-hidden="true" tabindex="-1">
    <div class="fld"><label for="fp_cur">Contraseña temporal</label><input id="fp_cur" type="password" autocomplete="current-password" required></div>
    <div class="fld"><label for="fp_new">Nueva contraseña</label><input id="fp_new" type="password" autocomplete="new-password" minlength="10" required></div>
    <div class="fld"><label for="fp_new2">Repita la nueva contraseña</label><input id="fp_new2" type="password" autocomplete="new-password" required></div>
    <button class="btn pri" type="submit">Guardar y entrar</button><button class="btn" type="button" id="fp_out">Salir</button></form></div>`;
  $('#fp_out').onclick = () => ACT.logout();
  $('#firstpw').onsubmit = async ev => {
    ev.preventDefault();
    const cur = $('#fp_cur').value, nw = $('#fp_new').value;
    if (nw.length < 10) return renderFirstPassword('La nueva contraseña debe tener al menos 10 caracteres.');
    if (nw !== $('#fp_new2').value) return renderFirstPassword('Las dos contraseñas nuevas no coinciden.');
    try { await api('/auth/password', { method: 'POST', body: { current: cur, new: nw } }); S.user.cambiarClave = false; toast('Contraseña guardada.'); await startApp(); }
    catch (e) { renderFirstPassword(e.message); }
  };
  if (!TOUCH()) $('#fp_cur').focus();
}
async function stepDone(k) {
  if (TEAM() || S.mode !== 'server' || !S.profile) return;
  S.profile.pasos = S.profile.pasos || {}; if (S.profile.pasos[k]) return;
  S.profile.pasos[k] = nowISO(); try { await Store.save(S.profile, { strict: true }); } catch (e) { /* no es importante */ }
}
function stepsList() {
  const real = S.patients.filter(x => !x.demo), ps = (S.profile && S.profile.pasos) || {}, demo = S.patients.some(x => x.demo);
  return [
    ['perfil', !!(S.profile.nombre && S.profile.firma), 'Complete su perfil y dibuje su firma', 'Con ella se firman los consentimientos, las evoluciones y los informes.', '<button class="btn sm pri" data-act="profile">Mi perfil y firma</button>'],
    ['ejemplo', demo || !!ps.ejemplo, 'Explore con pacientes de ejemplo', 'Cargamos 3 pacientes ficticios con consentimientos, primera vez, evoluciones, citas y notas de proceso. Los borra con un clic.', demo ? '<button class="btn sm" data-act="demoDel">Borrar los ejemplos</button>' : '<button class="btn sm pri" data-act="demoLoad">Cargar ejemplos</button>'],
    ['formatos', !!ps.formatos, 'Revise sus formatos', 'Consentimiento, primera vez y evolución: ajústelos a su forma de trabajo.', '<button class="btn sm" data-act="formats">Mis formatos</button>'],
    ['paciente', real.length > 0, 'Cree su primer paciente', 'Con datos ficticios mientras sea una prueba.', '<button class="btn sm" data-act="newPatient">Nuevo paciente</button>'],
    ['cita', S.appts.some(a => !a.demo), 'Agende una cita', 'Desde la agenda; puede conectarla con Google Calendar.', '<button class="btn sm" data-act="view" data-v="agenda">Ir a la agenda</button>'],
    ['comentario', !!ps.comentario, 'Cuéntenos qué mejorar', 'Use el botón «Comentarios», abajo a la derecha: elija el apartado del programa y cuéntenos qué falla, qué no entiende o qué le gustaría.', '<button class="btn sm" data-act="fbOpenStep">Escribir un comentario</button>']
  ];
}
function stepsHTML() {
  if (TEAM() || S.mode !== 'server' || !S.profile || (S.profile.pasos && S.profile.pasos.oculto)) return '';
  const L = stepsList(), done = L.filter(x => x[1]).length;
  if (done === L.length) return '';
  const hello = (S.profile.pasos || {}).bienvenida ? '' : `<div class="card" style="background:var(--surface)"><b style="font-size:16px">Bienvenido(a) a Alter-Karute · versión de prueba</b>
    <p style="margin:0;font-size:15px"><b>¡Gracias por hacer parte de nuestro equipo de prueba!</b> Su colaboración es muy valiosa: como agradecimiento, contará con <b>tres meses gratis</b> cuando el software se lance oficialmente. Le pedimos que haga todos los comentarios que necesite, para que juntos lleguemos a un software completo, intuitivo e integral para sus historias clínicas.</p>
    <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px;font-size:14px"><li><b>Use solo datos inventados</b> mientras dure la prueba: puede cargar pacientes de ejemplo para ver la app «llena».</li>
    <li>Lo que firma (consentimientos, primera vez, evoluciones, informes) <b>no se puede modificar</b>, como en papel: solo se agregan adendas.</li>
    <li>Si algo falla o no se entiende, use el botón <b>Comentarios</b>, abajo a la derecha. Por favor <b>elija el apartado del programa</b> al que se refiere (Agenda, Evolución, Consentimiento…): así podemos ubicar y corregir más rápido.</li></ul>
    <div class="row end"><button class="btn sm" data-act="welcomeOk">Entendido</button></div></div>`;
  return `<section class="steps" aria-label="Primeros pasos">${hello}<div class="row" style="justify-content:space-between"><h3>Primeros pasos · ${done} de ${L.length}</h3><button class="btn sm" data-act="stepsHide">Ocultar</button></div>
    <div class="bar" aria-hidden="true"><i style="width:${Math.round(done / L.length * 100)}%"></i></div>
    <ol>${L.map(([k, ok, t, d, btn]) => `<li class="${ok ? 'ok' : ''}" data-step="${k}"><span class="ck" aria-hidden="true">${ok ? '✓' : ''}</span><span class="tx"><b>${t}</b><br><span class="ts" style="font-family:inherit">${d}</span></span>${ok && k !== 'ejemplo' ? '<span class="sr-only">Hecho</span>' : btn}</li>`).join('')}</ol></section>`;
}
ACT.stepsHide = async () => { S.profile.pasos = S.profile.pasos || {}; S.profile.pasos.oculto = nowISO(); render(); try { await Store.save(S.profile, { strict: true }); } catch (e) { /* no es importante */ } toast('Puede volver a ver los primeros pasos desde el menú → Ayuda: primeros pasos.'); };
ACT.stepsShow = async () => { closeMenu(); S.profile.pasos = S.profile.pasos || {}; delete S.profile.pasos.oculto; S.view = 'patients'; S.pid = null; S.homeTab = 'resumen'; S.homeOpen = true; render(); scrollTo(0, 0); try { await Store.save(S.profile, { strict: true }); } catch (e) { /* no es importante */ } };
ACT.fbOpenStep = () => fbOpen();
function welcome() { /* la bienvenida va dentro de «Primeros pasos», sin tapar la pantalla */ }
ACT.welcomeOk = async () => { await stepDone('bienvenida'); render(); };

/* ===== Datos de ejemplo: pacientes ficticios para conocer la app ===== */
function demoSig(seed) {  // una firma ficticia (garabato) como imagen
  const c = document.createElement('canvas'); c.width = 360; c.height = 120; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 360, 120); g.strokeStyle = '#10222a'; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
  let r = 0; for (const ch of seed) r = (r * 31 + ch.charCodeAt(0)) % 997;
  g.beginPath(); g.moveTo(30, 70);
  for (let t = 0; t <= 1; t += .01) { const x = 30 + t * 280, y = 66 + Math.sin(t * (14 + r % 6)) * (18 + r % 9) * (1 - t * .5) + Math.cos(t * 31 + r) * 6; g.lineTo(x, y); }
  g.stroke(); g.beginPath(); g.moveTo(60, 92); g.quadraticCurveTo(190, 100 + r % 8, 320, 84); g.stroke();
  return c.toDataURL('image/png');
}
function demoRecords() {
  const now = new Date(), at = (days, h = 10, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const iso = nowISO(), pr = S.profile || {};
  const ther = { therapistName: pr.nombre || 'Profesional de ejemplo', therapistDocId: pr.cedula || undefined, therapistReg: pr.registro || 'TP-EJEMPLO', therapistSig: pr.firma || demoSig('profesional'), consultorio: pr.consultorio || '' };
  const dx = nombre => [{ nombre, fecha: iso, estado: 'Activo' }];
  const P = (id, o) => Object.assign({ id, kind: 'patient', tipoDoc: 'CC', estado: 'Activo', servicio: 'Individual', paisNac: 'Colombia', paisRes: 'Colombia', telInd: '+57', consents: [], createdAt: iso }, o);
  const consent = (p, tipo, signer) => Object.assign({ copia: COPIA[1], tipo, text: consentText(p, tipo), signerType: signer ? 'Acudiente' : 'Paciente', signerName: signer || fullName(p), signerDoc: signer ? 'DEMO-ACUD' : p.documento, signerSig: demoSig(signer || p.nombres), signedAt: iso }, ther);
  const ids = { a: newId('p'), b: newId('p'), c: newId('p') };
  const A = P(ids.a, { nombres: 'Laura', apellidos: 'Restrepo Gómez', documento: 'DEMO-0001', nacimiento: '1991-04-12', sexo: 'Femenino', identidadGenero: 'Cisgénero', ciudad: 'Bogotá', localidad: 'Chapinero', telefono: '3000000001', ocupacion: 'Diseñadora gráfica', modalidadAt: 'Presencial', estadoCivil: 'Soltero/a', escolaridad: 'Pregrado' });
  const B = P(ids.b, { nombres: 'Andrés', apellidos: 'Quintero Ruiz', documento: 'DEMO-0002', nacimiento: '1997-09-03', sexo: 'Masculino', identidadGenero: 'Cisgénero', ciudad: 'Medellín', telefono: '3000000002', ocupacion: 'Estudiante de ingeniería', modalidadAt: 'Virtual', escolaridad: 'Secundaria' });
  const C = P(ids.c, { nombres: 'Sofía', apellidos: 'Martínez Rojas', tipoDoc: 'TI', documento: 'DEMO-0003', nacimiento: (now.getFullYear() - 15) + '-02-20', sexo: 'Femenino', ciudad: 'Cali', telefono: '3000000003', acudNombre: 'Carolina Rojas', acudParentesco: 'Madre', acudDoc: 'DEMO-ACUD', acudTel: '3000000004', modalidadAt: 'Presencial', escolaridad: 'Secundaria' });
  A.consents = [consent(A, 'Atención presencial'), consent(A, DATA_TIPO)];
  B.consents = [consent(B, 'Telepsicología (atención a distancia)'), consent(B, DATA_TIPO)];
  const tele = { tele_plataforma: 'Google Meet', tele_comunicacion: COMUNIC[0] };
  const atA = { viaIngreso: 'Demanda espontánea', riesgoNivel: 'Sin riesgo evidente' };
  A.intake = Object.assign({ ...atA, riesgoAcciones: 'Niega ideación suicida y autolesiones. Sin riesgo para terceros.', formulacion: 'La preocupación cumple una función de control ante la incertidumbre; se mantiene por evitación y creencias sobre su utilidad.', antFam: 'Madre con ansiedad.', desarrollo: 'No refiere', academicoLaboral: 'Diseñadora gráfica; cambio reciente de empresa.', sessionAt: at(-35), modalidad: 'Presencial', motivo: 'Consulta por preocupación constante y dificultad para dormir desde hace 6 meses, que se intensificó con un cambio de trabajo.', remitido: 'Por iniciativa propia', historiaProblema: 'Refiere preocupación difícil de controlar por el trabajo, la salud de su madre y el dinero. Tensión muscular y cansancio. Evita reuniones donde debe exponer.', antMedicos: 'Sin enfermedades crónicas. No toma medicamentos.', antPsi: 'Sin tratamientos previos.', familia: 'Vive sola. Buena relación con su madre y su hermano.', examenMental: 'Alerta, orientada, lenguaje fluido, afecto ansioso congruente. Sin ideación suicida.', objetivos: 'Reducir la preocupación y mejorar el sueño; retomar actividades que evita.', plan: 'Terapia cognitivo-conductual, sesiones semanales de 50 minutos durante 12 semanas.', impresion: 'Cuadro compatible con ansiedad generalizada.', diagnosticos: dx('Trastorno de ansiedad generalizada'), signedAt: iso, addenda: [], schema: clone(intakeSchema({})) }, ther);
  B.intake = Object.assign({ ...atA, riesgoNivel: 'Bajo', riesgoAcciones: 'Ideación pasiva ocasional, sin plan. Se acordó plan de seguridad y líneas de ayuda.', formulacion: 'Pérdida de reforzadores tras la ruptura, con retraimiento que mantiene el ánimo bajo.', antMedicos: 'No refiere', antPsi: 'Sin tratamientos previos.', antFam: 'No refiere', desarrollo: 'No se indagó', familia: 'Vive con sus padres.', academicoLaboral: 'Estudiante de ingeniería; bajo rendimiento este semestre.', sessionAt: at(-21, 18), modalidad: 'Virtual', ...tele, motivo: 'Desánimo, aislamiento y bajo rendimiento académico en el último semestre.', historiaProblema: 'Tras una ruptura de pareja disminuyó su interés por actividades que disfrutaba. Duerme más de lo habitual.', examenMental: 'Afecto triste, pensamiento enlentecido, sin ideación suicida actual; niega intentos previos.', objetivos: 'Recuperar rutinas y actividades gratificantes; mejorar el rendimiento académico.', plan: 'Activación conductual y reestructuración cognitiva, sesiones semanales virtuales.', diagnosticos: dx('Episodio depresivo, no especificado'), signedAt: iso, addenda: [], schema: clone(intakeSchema({})) }, ther);
  const recs = [A, B, C], note = (p, days, h, o, ap) => { const n = Object.assign({ riesgoNivel: 'Sin riesgo evidente', riesgoNota: 'Sin riesgo evidente.', objetivoSesion: 'Trabajar los objetivos del plan.', evolucionObj: 'Avance parcial.', id: newId('n'), kind: 'note', patientId: p.id, sessionAt: at(days, h), modalidad: p.modalidadAt === 'Virtual' ? 'Virtual' : 'Presencial', duracion: 50, ...(p.modalidadAt === 'Virtual' ? tele : {}), diagnosticos: clone(p.intake.diagnosticos), dxCambio: false, signedAt: iso, addenda: [], schema: clone(NOTE_FIELDS) }, o, ther); if (ap) { ap.noteId = n.id; n.apptId = ap.id; } recs.push(n); return n; };
  const appt = (p, days, h, estado, extra) => { const a = Object.assign({ id: newId('a'), kind: 'appt', patientId: p.id, startAt: at(days, h), duracion: 50, modalidad: p.modalidadAt === 'Virtual' ? 'Virtual' : 'Presencial', estado }, extra); recs.push(a); return a; };
  appt(A, -35, 10, 'Atendida');
  note(A, -28, 10, { tema: 'Psicoeducación sobre la ansiedad y el ciclo de la preocupación.', intervenciones: 'Psicoeducación; registro de preocupaciones.', respuesta: 'Se identifica con el modelo; colaboradora.', tareas: 'Registrar preocupaciones diarias.', proxima: 'Revisar registros; introducir tiempo de preocupación.' }, appt(A, -28, 10, 'Atendida'));
  note(A, -21, 10, { tema: 'Revisión de registros: predominan preocupaciones laborales.', intervenciones: 'Tiempo de preocupación; respiración diafragmática.', respuesta: 'Reporta leve mejoría del sueño.', tareas: 'Practicar respiración dos veces al día.', proxima: 'Reestructuración cognitiva.' }, appt(A, -21, 10, 'Atendida'));
  note(A, -14, 10, { tema: 'Creencias sobre la utilidad de preocuparse.', intervenciones: 'Reestructuración cognitiva; experimento conductual.', respuesta: 'Logra cuestionar dos creencias.', tareas: 'Experimento: posponer una preocupación.', proxima: 'Exposición gradual a reuniones.' }, appt(A, -14, 10, 'Atendida'));
  appt(A, 2, 10, 'Programada');
  appt(B, -21, 18, 'Atendida', { modalidad: 'Virtual' });
  note(B, -14, 18, { tema: 'Activación conductual: monitoreo de actividades y ánimo.', intervenciones: 'Programación de actividades gratificantes.', respuesta: 'Acepta retomar el fútbol los sábados.', tareas: 'Registrar actividades y ánimo (0-10).', proxima: 'Revisar registro.' }, appt(B, -14, 18, 'Atendida'));
  appt(B, 1, 18, 'Programada');
  appt(C, 5, 15, 'Programada');
  const pn = (o, segs) => recs.push(Object.assign({ id: newId('pn'), kind: 'pnote', estado: segs ? 'En seguimiento' : 'Abierta', revisar: '', etiquetas: [], seguimiento: segs || [], createdAt: iso, updatedAt: iso }, o));
  pn({ patientId: A.id, tipo: 'Hipótesis', titulo: 'La preocupación como forma de control', texto: 'Hipótesis: la preocupación le da sensación de control ante la enfermedad de su madre (pérdida temprana del padre). Explorar creencias metacognitivas positivas.', etiquetas: ['metacognición', 'duelo'] }, [{ at: iso, texto: 'En la sesión 3 confirma: «si no me preocupo, algo malo puede pasar».' }]);
  pn({ patientId: B.id, tipo: 'Notas de supervisión', titulo: 'Supervisión: ritmo de la activación', texto: 'Sugerencia de la supervisora: empezar por actividades de bajo esfuerzo y evaluar riesgo en cada sesión.', revisar: at(7).slice(0, 10), etiquetas: ['supervisión'] });
  pn({ patientId: null, tipo: 'Idea', titulo: 'Lecturas pendientes', texto: 'Terapia de aceptación y compromiso para ansiedad generalizada.\nModelo metacognitivo de Wells.' });
  return recs;
}
ACT.demoLoad = async b => {
  if (S.patients.some(x => x.demo)) { toast('Ya tiene los pacientes de ejemplo.'); return; }
  setBusy(b, true);
  try { await api('/demo', { method: 'POST', body: { records: demoRecords() } }); await Store.load(); stepDone('ejemplo'); S.view = 'patients'; S.pid = null; render(); toast('Listo: 3 pacientes de ejemplo. Ábralos desde la lista de la izquierda.'); }
  catch (e) { toast(e.message); } finally { if (b && b.isConnected) setBusy(b, false); }
};
ACT.demoDel = async b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: borrar los ejemplos'; return; }
  setBusy(b, true);
  try { const r = await api('/demo', { method: 'DELETE' }); const pid = S.pid; await Store.load(); if (pid && !S.patients.some(x => x.id === pid)) S.pid = null; S.pn.sel = null; render(); toast('Se borraron ' + r.borrados + ' registros de ejemplo.'); }
  catch (e) { toast(e.message); if (b.isConnected) setBusy(b, false); }
};

/* ===== Bitácora de accesos: cada vez que alguien abre una historia queda registrado (quién, cuándo, qué pestaña) ===== */
const LOGGED = {};
function logView() {
  if (S.mode !== 'server' || !S.pid || S.draft) return;
  const vista = (Object.fromEntries(TABS)[S.tab] || ''), k = S.pid + '|' + vista;
  if (LOGGED[k] && Date.now() - LOGGED[k] < 110000) return;
  LOGGED[k] = Date.now();
  api('/acceso', { method: 'POST', body: { patientId: S.pid, vista } }).catch(() => { /* no interrumpe el trabajo */ });
}
ACT.accessLog = async b => {
  closeMenu();
  const pid = b && b.closest('.file-head') ? S.pid : '', root = $('#modal-root');
  let list; try { list = await api('/bitacora' + (pid ? '?patientId=' + encodeURIComponent(pid) : '')); } catch (e) { toast(e.message); return; }
  let who = '', what = '';
  const people = [...new Set(list.map(x => x.quien).filter(Boolean))];
  const draw = () => {
    const rows = list.filter(x => (!who || x.quien === who) && (!what || (what === 'hist' ? x.patientId : what === 'ing' ? /^login/.test(x.tipo) : x.tipo === 'access.denied')));
    $('#al_body').innerHTML = rows.length ? `<table class="altable"><thead><tr><th>Fecha y hora</th><th>Quién</th><th>Qué hizo</th>${pid ? '' : '<th>Historia</th>'}</tr></thead><tbody>${rows.map(x => `<tr class="${x.tipo === 'access.denied' || x.tipo === 'login.fail' ? 'bad' : ''}"><td data-l="Fecha" style="white-space:nowrap">${esc(fmtShort(x.at))}</td><td data-l="Quién">${esc(x.quien || '—')} <span class="chip">${esc(x.rol)}</span></td><td data-l="Qué hizo">${esc(x.accion)}${x.ip ? ` <span class="ts">IP ${esc(x.ip)}</span>` : ''}</td>${pid ? '' : `<td data-l="Historia">${x.patientId ? `<button class="btn sm" data-act="open" data-id="${esc(x.patientId)}">${esc(x.paciente || 'Ver')}</button>` : ''}</td>`}</tr>`).join('')}</tbody></table>` : '<p class="stnote">No hay registros con ese filtro.</p>';
  };
  const p = pid ? S.patients.find(x => x.id === pid) : null;
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Bitácora de accesos"><div class="box" style="max-width:860px"><div class="row" style="justify-content:space-between"><h3>${p ? 'Accesos a la historia de ' + esc(fullName(p)) : 'Bitácora de accesos'}</h3><button class="btn sm" id="al_close">Cerrar</button></div>
    <p class="stnote" style="margin:0">Cada vez que usted o alguien de su equipo abre una historia, guarda, firma o descarga, queda aquí con la fecha y la hora. ${pid ? '' : 'También los ingresos a la cuenta y los intentos fallidos o sin permiso. '}Nadie puede borrar ni modificar este registro.</p>
    <div class="row"><select id="al_who" style="width:auto" aria-label="Filtrar por persona"><option value="">Todas las personas</option>${people.map(x => `<option>${esc(x)}</option>`).join('')}</select>${pid ? '' : `<select id="al_what" style="width:auto" aria-label="Filtrar por tipo"><option value="">Todo</option><option value="hist">Historias</option><option value="ing">Ingresos a la cuenta</option><option value="den">Intentos sin permiso</option></select>`}<span class="ts">${list.length} registros${list.length >= 300 ? ' (los más recientes)' : ''}</span></div>
    <div id="al_body" class="tscroll"></div></div></div>`;
  $('#al_close').onclick = () => { root.innerHTML = ''; };
  $('#al_who').onchange = e => { who = e.target.value; draw(); };
  if ($('#al_what')) $('#al_what').onchange = e => { what = e.target.value; draw(); };
  root.querySelector('.modal').addEventListener('click', e => { const o = e.target.closest('[data-act="open"]'); if (o) { root.innerHTML = ''; ACT.open(o); } });
  draw();
};

