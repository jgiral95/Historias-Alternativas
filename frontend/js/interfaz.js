/* Estructura de la pantalla, botón «Atrás», lista de consultantes, notas de sesión, Datos y consentimiento. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Interfaz: estructura, lista, datos y consentimiento ===== */
const ACT = {};
ACT.theme = () => { const dark = document.documentElement.getAttribute('data-theme') !== 'dark'; document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); try { localStorage.setItem('ac_theme', dark ? 'dark' : 'light'); } catch (e) { /* sin almacenamiento */ } const tb = $('[data-act="theme"]'); if (tb) tb.textContent = dark ? 'Modo claro' : 'Modo oscuro'; };
const TOUCH = () => !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
const TEAM = () => !!(S.user && S.user.role === 'asistente');
const initials = n => String(n || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'P';
ACT.menu = () => { const m = $('#acmenu'), b = $('[data-act="menu"]'); if (!m) return; const o = !m.classList.contains('open'); m.classList.toggle('open', o); b.setAttribute('aria-expanded', o ? 'true' : 'false'); if (o) { const f = m.querySelector('button'); if (f) f.focus(); } };
const closeMenu = () => { const m = $('#acmenu'), b = $('[data-act="menu"]'); if (m) m.classList.remove('open'); if (b) b.setAttribute('aria-expanded', 'false'); };
const curPatient = () => S.draft ? S.draftObj : S.patients.find(x => x.id === S.pid);
const therSnap = () => ({ therapistName: S.profile.nombre, therapistDocId: S.profile.cedula || undefined, therapistReg: S.profile.registro, therapistSig: S.profile.firma, consultorio: S.profile.consultorio });
const canSign = () => S.profile.nombre && S.profile.firma;
const TABS = [['datos', 'Datos'], ['consent', 'Consentimiento'], ['intake', 'Primera vez'], ['evol', 'Sesión'], ['escalas', 'Chequeos'], ['informes', 'Informes'], ['cierre', 'Cierre'], ['archivo', 'Archivo']];
/* Pestañas de la ficha según «Mis formatos»: se pueden renombrar, ocultar (menos Datos) y agregar propias (id «x_…»). */
const tabsConf = () => (S.profile && S.profile.formatos && S.profile.formatos.pestanas) || {};
const tabsList = () => { const c = tabsConf(), ex = c.extra || [];
  return TABS.filter(([k]) => k === 'datos' || !(c.ocultas || []).includes(k)).map(([k, l]) => [k, (c.nombres || {})[k] || l]).concat(ex.map(x => [x.id, x.nombre])); };
const OPT = {
  tipoDoc: ['CC', 'TI', 'CE', 'Registro civil', 'Pasaporte', 'Permiso por protección temporal (PPT)', 'Permiso especial de permanencia (PEP)', 'Menor sin documento', 'Otro'],
  zona: ['', 'Urbana', 'Rural', 'No responde'],
  discapacidad: ['', 'Ninguna', 'Física', 'Auditiva', 'Visual', 'Sordoceguera', 'Intelectual', 'Psicosocial', 'Múltiple', 'No responde'],
  sexo: ['', 'Femenino', 'Masculino', 'Intersexual'],
  etnia: ['', 'Ningún grupo étnico', 'Indígena', 'Rrom o gitano(a)', 'Raizal del Archipiélago de San Andrés, Providencia y Santa Catalina', 'Palenquero(a) de San Basilio', 'Negro(a), mulato(a), afrodescendiente o afrocolombiano(a)', 'Prefiere no responder'],
  estadoCivil: ['', 'Soltero/a', 'Casado/a', 'Unión libre', 'Separado/a', 'Divorciado/a', 'Viudo/a', 'No aplica (menor de edad)', 'No responde'],
  escolaridad: ['', 'Ninguna', 'Preescolar', 'Primaria', 'Secundaria', 'Técnico/tecnólogo', 'Pregrado', 'Posgrado', 'No responde'],
  estado: ['Activo', 'En pausa', 'Alta', 'Cerrado', 'Remitido'],
  modalidadAt: ['', 'Presencial', 'Virtual', 'Mixta (presencial y virtual)'],
  servicio: ['', 'Individual', 'Pareja', 'Familiar', 'Grupal', 'Otro'],
  genero: ['', 'Cisgénero', 'Transgénero', 'No binario', 'Agénero', 'Queer', 'Género fluido', 'Bigénero', 'Prefiere no responder', 'No aplica'],
  razon: ['', 'Distancia y horarios', 'Finalizó el proceso', 'No reporta', 'Está en seguimiento', 'Se siente mejor', 'Dificultades con la atención', 'Dificultad con el terapeuta', 'Tuvo que escoger entre psicología y psiquiatría', 'Factor económico', 'Otra']
};
const CLOSED = ['Alta', 'Cerrado', 'Remitido'];
const isClosed = p => CLOSED.includes(p.estado);

const DIRTY_SEL = '#noteform, #intakeform, #reportform, #cierreform, #scaleform, #solform, #incform, #consentform, #repsblock';
function askDiscard(go) {
  if ($('#discardask')) return;
  const d = document.createElement('div'); d.className = 'idle'; d.id = 'discardask';
  d.innerHTML = '<div class="box" role="alertdialog" aria-labelledby="dk_t"><b id="dk_t">Tiene texto sin firmar</b><p style="margin:0">Si sale ahora, lo que escribió se pierde. Los documentos solo se guardan al firmarlos.</p><div class="row end"><button class="btn warn" id="dk_go">Descartar y salir</button><button class="btn pri" id="dk_stay">Seguir escribiendo</button></div></div>';
  document.body.appendChild(d);
  $('#dk_stay').onclick = () => d.remove();
  $('#dk_go').onclick = () => { d.remove(); go(); };
  $('#dk_stay').focus();
}
/* ----- Botón «Atrás» del navegador (y gesto de volver en el celular) -----
   Cada cambio de pantalla (sección, consultante, pestaña, formulario abierto) queda en el historial del navegador,
   así «Atrás» vuelve a la pantalla anterior dentro de la app en vez de salir de ella. */
const Nav = { key: null, restoring: false };
function navState() {
  const v = S.view === 'agenda' || S.view === 'cuaderno' ? S.view : 'patients';
  return { hc: 1, v, pid: v === 'patients' && !S.draft ? S.pid || null : null, draft: v === 'patients' && !!S.draft, tab: v === 'patients' && S.pid ? S.tab : null,
    home: v === 'patients' && !S.pid ? !!S.homeOpen : null, ht: v === 'patients' && !S.pid ? S.homeTab || null : null, pn: v === 'cuaderno' ? S.pn.sel || null : null,
    form: v === 'patients' && S.pid ? (S.newNote ? 'note' : S.newReport ? 'report' : S.newScale ? 'scale' : S.reconsent ? 'consent' : S.newSol ? 'sol' : S.newIncorp ? 'incorp' : null) : null };
}
function navSync() {
  if (!S.user) return;
  const st = navState(), k = JSON.stringify(st);
  if (k === Nav.key) return;
  try { if (Nav.key === null || Nav.restoring) history.replaceState(st, ''); else history.pushState(st, ''); } catch (e) { /* sin historial */ }
  Nav.key = k;
}
async function navRestore(st) {
  if (!S.user || !S.profile || !st || !st.hc) return;
  const modal = $('#modal-root .modal');
  if (modal || $('#discardask')) {  // «Atrás» con una ventana abierta: la cierra y se queda en la pantalla
    if (modal) { $('#modal-root').innerHTML = ''; $('#modal-root').onclick = null; }
    try { history.pushState(JSON.parse(Nav.key), ''); } catch (e) { /* sin historial */ }
    return;
  }
  if (S.dirty) {  // texto sin firmar: se pregunta antes de salir
    try { history.pushState(JSON.parse(Nav.key), ''); } catch (e) { /* sin historial */ }
    askDiscard(() => { S.dirty = false; navRestore(st); });
    return;
  }
  if (S.view === 'cuaderno') await pnLeave();
  closeMenu();
  const p = st.pid && S.patients.find(x => x.id === st.pid);
  S.view = st.v === 'agenda' || st.v === 'cuaderno' ? st.v : 'patients';
  S.draft = false; S.draftObj = null; S.pid = p ? p.id : null; S.tab = p && st.tab ? st.tab : 'datos';
  S.newNote = false; S.newReport = false; S.newScale = null; S.reconsent = false; S.consentPreset = null; S.newSol = false; S.newIncorp = false; S.noteSeed = null;
  if (!p) { S.homeOpen = !!st.home; if (st.ht) S.homeTab = st.ht; }
  if (S.view === 'cuaderno') { S.pn.sel = st.pn || null; S.pn.draft = null; }
  Nav.restoring = true;
  try { render(); } finally { Nav.restoring = false; }
  scrollTo(0, 0);
  if (p) logView();
}
window.addEventListener('popstate', e => { navRestore(e.state); });
function render() { renderMain(); navSync(); const sh = $('#app'); if (sh && !$('#aviso-alcance')) sh.insertAdjacentHTML('beforeend', '<div id="aviso-alcance" style="text-align:center;font-size:12px;color:var(--muted);padding:10px 0">Alter-Karute acompaña el bienestar y la salud con terapias alternativas: no realiza procesos clínicos.</div>'); }
function renderMain() {
  S.dirty = false;
  const p = curPatient(), pr = S.profile;
  const incomplete = !pr.nombre || !pr.firma;
  $('#app').innerHTML = `
  <header class="top"><button class="brand" data-act="home" title="Ir al resumen">${logoSVG(34)}<b>Alter-Karute</b></button>
    <nav class="nav" aria-label="Secciones"><button class="${S.view === 'agenda' || S.view === 'cuaderno' ? '' : 'on'}" data-act="view" data-v="patients">Consultantes</button><button class="${S.view === 'agenda' ? 'on' : ''}" data-act="view" data-v="agenda">Agenda</button>${TEAM() ? '' : `<button class="${S.view === 'cuaderno' ? 'on' : ''}" data-act="view" data-v="cuaderno" title="Notas de proceso: ideas y consejos de colegas, fuera de la ficha">Notas<span class="lbl-long"> de proceso</span></button>`}</nav>
    <div class="top-search"><input type="text" id="q" placeholder="Buscar consultante o texto en notas" value="${esc(S.q)}" aria-label="Buscar consultante"></div>
    <div class="top-actions">${S.view === 'cuaderno' ? '<button class="btn pri" data-act="pnNew">+ <span class="lbl-long">Nueva nota</span></button>' : '<button class="btn pri" data-act="newPatient">+ <span class="lbl-long">Nuevo consultante</span></button>'}
    <div class="avwrap"><button class="avatar" data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="Menú de cuenta"><i>${esc(initials(pr.nombre || (S.user && S.user.name) || (S.user && S.user.email) || 'P'))}</i><svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4"/></svg></button>
    <div class="menu" id="acmenu" role="menu"><div class="who"><b>${esc(pr.nombre || (S.user && S.user.name) || 'Terapia')}</b><span>${esc(pr.nombre && pr.registro ? 'T.P. ' + pr.registro : (S.user && S.user.email) || '')}</span></div>
    ${TEAM() ? '<button role="menuitem" data-act="profile">Mi cuenta</button>' : `<button role="menuitem" data-act="profile">Mi perfil y firma</button><button role="menuitem" data-act="formats">Mis formatos</button>${S.mode === 'server' ? '<button role="menuitem" data-act="survey">Mi encuesta de satisfacción</button><button role="menuitem" data-act="team">Mi equipo</button><button role="menuitem" data-act="suscripcion">Mi suscripción</button>' : ''}`}<button role="menuitem" data-act="theme">${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Modo claro' : 'Modo oscuro'}</button>${S.mode === 'server' && S.user && S.user.role === 'admin' ? '<button role="menuitem" data-act="users">Usuarios</button><button role="menuitem" data-act="fbAdmin">Comentarios de la beta</button>' : ''}${TEAM() || S.mode !== 'server' ? '' : '<button role="menuitem" data-act="accessLog">Bitácora de accesos</button>'}${TEAM() ? '' : '<button role="menuitem" data-act="stepsShow">Ayuda: primeros pasos</button>'}<button role="menuitem" data-act="privacy">Política de privacidad</button>${S.mode === 'server' ? '<hr><button role="menuitem" class="out" data-act="logout">Salir</button>' : ''}</div></div></div></header>
  ${S.mode === 'local' ? '<div class="banner">Modo local: los datos quedan solo en este navegador.</div>' : ''}
  ${S.mode === 'server' && hasLocal() ? '<div class="banner">Hay datos guardados en este navegador de antes de usar el servidor. <span class="row" style="display:inline-flex;margin-left:6px"><button class="btn sm" data-act="importLocal">Importar al servidor</button><button class="btn sm warn" data-act="dropLocal">Borrar copia local</button></span></div>' : ''}
  ${S.patients.some(x => x.demo) ? `<div class="banner demo">Está viendo <b>consultantes de ejemplo</b> (ficticios), marcados «Ejemplo». Pruebe lo que quiera con ellos; nunca se les envía nada.${TEAM() ? '' : ' <button class="btn sm" data-act="demoDel">Borrar los datos de ejemplo</button>'}</div>` : ''}
  ${incomplete && !TEAM() ? '<div class="banner">Complete su perfil y dibuje su firma en «Mi perfil y firma». Sin ella no podrá firmar consentimientos, notas ni informes.</div>' : ''}
  ${S.view === 'agenda' ? agendaHTML() : S.view === 'cuaderno' && !TEAM() ? pnHTML() : `<div class="layout ${p || S.homeOpen ? 'in-file' : ''}"><div class="plist-wrap">${listHTML()}</div><div class="file-wrap">${p ? fileHTML(p) : homeHTML()}</div></div>`}`;
  if (S.view === 'agenda') return;
  if (S.view === 'cuaderno') { pnMount(); return; }
  if (p && !S.draft) { if (S.tab === 'consent' || S.tab === 'intake' || S.tab === 'evol' || S.tab === 'informes') mountPads(); }
  mountGeno(); dxMount();
  if (S.newScale) updateScaleTotal();
}

const GROUPS = [['Activo', 'Activos'], ['En pausa', 'En pausa'], ['Remitido', 'Remitidos'], ['Alta', 'De alta'], ['Cerrado', 'Cerrados']];
function prowHTML(p) {
  const st = sessionStats(p);
  return `<button class="prow ${p.id === S.pid ? 'on' : ''}" data-act="open" data-id="${p.id}"><span class="dot ${p.estado === 'En pausa' ? 'pausa' : isClosed(p) ? 'alta' : ''}"></span><span><div class="nm">${esc(fullName(p))}${p.demo ? ' <span class="chip" style="font-size:10px">Ejemplo</span>' : ''}</div><div class="sub">${esc(p.documento || 'sin documento')}${st.last ? ' · últ. ' + esc(fmtD(st.last).replace(/ de /g, ' ')) : ''}</div></span></button>`;
}
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function searchNotes(q) {
  const nq = norm(q), hits = [];
  const add = (p, tab, rec, label, txt) => { const nt = norm(txt), i = nt.indexOf(nq); if (i < 0) return; const a = Math.max(0, i - 40), raw = String(txt); hits.push({ p, tab, rec, label, pre: (a ? '…' : '') + raw.slice(a, i), m: raw.slice(i, i + q.length), post: raw.slice(i + q.length, i + q.length + 60) + (i + q.length + 60 < raw.length ? '…' : '') }); };
  S.patients.forEach(p => {
    const i = p.intake; if (i && i.signedAt) { intakeSchema(i).forEach(([t, fs]) => fs.forEach(f => add(p, 'intake', '', 'Primera vez', i[f[0]]))); (i.diagnosticos || []).forEach(d => add(p, 'intake', '', 'Impresión', d.codigo + ' ' + d.nombre)); }
    (p.cierres || []).forEach(c => CIERRE_FIELDS.forEach(f => add(p, 'cierre', '', 'Cierre ' + fmtD(c.fecha), c[f[0]])));
  });
  S.notes.forEach(n => { const p = S.patients.find(x => x.id === n.patientId); if (p && n.signedAt) { evolSchema(n).forEach(f => add(p, 'evol', n.id, 'Sesión ' + fmtD(n.sessionAt), n[f[0]])); if (n.dxCambio) (n.diagnosticos || []).forEach(d => add(p, 'evol', n.id, 'Impresión ' + fmtD(n.sessionAt), d.codigo + ' ' + d.nombre)); } });
  S.reports.forEach(r => { const p = S.patients.find(x => x.id === r.patientId); if (p && r.signedAt) add(p, 'informes', r.id, r.tipo, r.contenido); });
  S.scales.forEach(e => { const p = S.patients.find(x => x.id === e.patientId); if (p) add(p, 'escalas', '', e.escala.nombre, e.observaciones); });
  const seen = new Set();
  return hits.filter(h => { const k = h.p.id + h.tab + h.rec + h.label; if (seen.has(k)) return false; seen.add(k); return true; });
}
function hitsHTML(q) {
  if (norm(q).length < 3) return '';
  const hs = searchNotes(q);
  if (!hs.length) return '';
  return `<div class="hits"><div class="hits-h">En las notas (${hs.length})</div>${hs.slice(0, 30).map(h => `<button class="prow hit" data-act="openHit" data-id="${h.p.id}" data-tab="${h.tab}" data-rec="${esc(h.rec)}"><span><div class="nm">${esc(fullName(h.p))}</div><div class="sub">${esc(h.label)}</div><div class="snip">${esc(h.pre)}<mark>${esc(h.m)}</mark>${esc(h.post)}</div></span></button>`).join('')}</div>`;
}
ACT.openHit = b => {
  ACT.open(b);
  const id = b.dataset.rec; if (!id) return;
  const el = document.getElementById('rec-' + id); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200); }
};
function rowsHTML() {
  const q = S.q.toLowerCase();
  const list = S.patients.filter(p => !q || norm(fullName(p) + ' ' + (p.documento || '')).includes(norm(q)))
    .sort((a, b) => (a.apellidos || '').localeCompare(b.apellidos || '') || (a.nombres || '').localeCompare(b.nombres || ''));
  const home = `<button class="prow home ${!S.pid ? 'on' : ''}" data-act="home"><span class="ico" aria-hidden="true">⌂</span><span class="nm">Resumen</span></button>`;
  if (!list.length) return home + (hitsHTML(S.q) || `<div class="empty">${S.patients.length ? 'Ningún consultante ni nota coincide.' : 'Aún no hay consultantes. Cree el primero con «Nuevo consultante».'}</div>`);
  S.openGroups = S.openGroups || ['Activo'];
  const cur = S.patients.find(x => x.id === S.pid);
  return home + GROUPS.map(([k, label]) => {
    const g = list.filter(p => (p.estado || 'Activo') === k);
    if (!g.length) return '';
    const open = q || S.openGroups.includes(k) || (cur && (cur.estado || 'Activo') === k);
    return `<details class="pgroup" data-g="${esc(k)}" ${open ? 'open' : ''}><summary><span>${esc(label)}</span><span class="cnt">${g.length}</span></summary>${g.map(prowHTML).join('')}</details>`;
  }).join('') + hitsHTML(S.q);
}
function listHTML() {
  return `<div class="panel plist"><div class="plist-head"><span>Consultantes</span><span id="pcount">${S.patients.length}</span></div><div id="rows">${rowsHTML()}</div></div>`;
}
ACT.home = () => { S.view = 'patients'; S.pid = null; S.draft = false; S.draftObj = null; S.homeOpen = true; render(); scrollTo(0, 0); };
function todoHTML() {
  const now = Date.now(), nowI = nowISO(), items = [];
  const noted = new Set(S.notes.filter(n => n.signedAt && n.apptId).map(n => n.apptId));
  const pat = id => S.patients.find(x => x.id === id);
  // citas ya pasadas sin sesión
  S.appts.filter(a => (a.estado === 'Programada' || a.estado === 'Atendida') && new Date(a.startAt).getTime() + (a.duracion || 50) * 60000 < now && !a.noteId && !noted.has(a.id) && now - new Date(a.startAt).getTime() < 30 * 864e5)
    .sort((a, b) => b.startAt.localeCompare(a.startAt)).forEach(a => { const p = pat(a.patientId); if (p) items.push({ k: 'Sesión pendiente', t: fullName(p), d: fmtShort(a.startAt), act: `data-act="apptEvol" data-id="${a.id}"`, btn: 'Registrar sesión', w: 0 }); });
  const active = S.patients.filter(p => !p.estado || p.estado === 'Activo');
  active.forEach(p => {
    const cs = p.consents || [];
    if (!(p.intake && p.intake.signedAt) && !(p.incorporaciones || []).length && (cs.length || S.notes.some(n => n.patientId === p.id))) items.push({ k: 'Primera vez sin firmar', t: fullName(p), d: 'Aún no tiene la consulta de primera vez', act: `data-act="open" data-id="${p.id}" data-tab="intake"`, btn: 'Abrir', w: 3 });
    const last = lastAttention(p), next = S.appts.some(a => a.patientId === p.id && a.estado === 'Programada' && a.startAt >= nowI);
    if (last && !next && now - new Date(last).getTime() > 28 * 864e5) items.push({ k: 'Sin cita', t: fullName(p), d: 'Última atención ' + fmtD(last) + '; no tiene próxima cita', act: `data-act="apptEdit" data-patient="${p.id}"`, btn: 'Agendar', w: 5 });
  });
  const today = dayKey(new Date());
  S.patients.forEach(p => (p.solicitudes || []).forEach(r => { if (r.entrega) return; const lim = addBusinessDays(r.fecha, 10); items.push({ k: today > lim ? 'Copia vencida' : 'Copia por entregar', t: fullName(p), d: 'Pedida por ' + r.solicitante + ' · límite ' + fmtD(lim), act: `data-act="open" data-id="${p.id}" data-tab="archivo"`, btn: 'Abrir', w: today > lim ? -1 : 4 }); }));
  ((S.sv && S.sv.invitaciones) || []).filter(i => i.estado === 'abierta' && i.canal === 'manual' && !i.enviada).forEach(i => { const p = pat(i.patientId); if (p) items.push({ k: 'Encuesta por enviar', t: fullName(p), d: (i.error ? 'No se pudo enviar el correo · ' : 'Encuesta de satisfacción · ') + 'vence ' + fmtD(i.vence), act: `data-act="svSend" data-id="${i.id}"`, btn: 'Enviar', w: 6 }); });
  (S.firmas || []).filter(f => f.estado === 'pendiente' || ((f.estado === 'vencido' || f.estado === 'bloqueado') && !(S.patients.find(x => x.id === f.patientId) || {}).consents?.some(c => c.tipo === f.tipo && c.signedAt > f.creado))).forEach(f => { const p = pat(f.patientId); if (p) items.push({ k: f.estado === 'pendiente' ? 'Firma a distancia pendiente' : 'Enlace de firma ' + f.estado, t: fullName(p), d: f.tipo + (f.estado === 'pendiente' ? ' · vence ' + fmtD(f.vence) : ' · envíe uno nuevo'), act: `data-act="open" data-id="${p.id}" data-tab="consent"`, btn: 'Abrir', w: f.estado === 'pendiente' ? 7 : 2 }); });
  S.pnotes.filter(n => n.revisar && n.revisar <= today && n.estado !== 'Cerrada').forEach(n => { const pp = n.patientId && pat(n.patientId); items.push({ k: 'Nota de proceso por revisar', t: n.titulo || 'Sin título', d: (pp ? fullName(pp) + ' · ' : '') + 'revisar el ' + fmtD(n.revisar), act: `data-act="pnOpen" data-id="${n.id}"`, btn: 'Abrir', w: 2 }); });
  remDue().forEach(a => { const p = pat(a.patientId); if (p) items.push({ k: 'Recordatorio por enviar', t: fullName(p), d: 'Cita ' + fmtShort(a.startAt) + (S.rem.items[a.id] && S.rem.items[a.id].error ? ' · no se pudo enviar el correo' : ''), act: `data-act="remSend" data-id="${a.id}"`, btn: 'Enviar', w: 1 }); });
  if (TEAM()) { const keep = items.filter(x => x.k === 'Sin cita' || x.k === 'Recordatorio por enviar'); items.length = 0; items.push(...keep); }
  items.sort((a, b) => a.w - b.w);
  const shown = S.showAllTodo ? items : items.slice(0, 8);
  return `<details class="sec fold" data-fold="pend" ${foldOpen('pend')}><summary><h3>Pendientes${items.length ? ' (' + items.length + ')' : ''}</h3></summary>${items.length ? `<div class="tlist">${shown.map(x => `<div class="todo ${x.w < 0 ? 'late' : ''}"><span class="chip ${x.w < 0 ? 'danger' : x.w === 0 ? '' : 'warn'}">${esc(x.k)}</span><span class="tt"><b>${esc(x.t)}</b><small>${esc(x.d)}</small></span><button class="btn sm" ${x.act}>${esc(x.btn)}</button></div>`).join('')}</div>${items.length > shown.length ? `<div class="row"><button class="btn sm" data-act="allTodo">Ver los ${items.length}</button></div>` : ''}` : '<p style="margin:0;color:var(--muted)">Todo al día.</p>'}</details>`;
}
ACT.privacy = () => { window.open('privacidad', '_blank', 'noopener'); };
ACT.allTodo = () => { S.showAllTodo = true; render(); };
ACT.apptEvol = b => { const a = S.appts.find(x => x.id === b.dataset.id); S.view = 'patients'; S.draft = false; S.pid = a.patientId; S.tab = 'evol'; S.newReport = false; S.noteSeed = { sessionAt: a.startAt, modalidad: a.modalidad, duracion: a.duracion, apptId: a.id }; S.newNote = 'new'; render(); scrollTo(0, 0); };
/* ===== Notas de sesión: lista de todas las notas firmadas, con búsqueda y filtros ===== */
const NL = { q: '', per: '30', tipo: '', sort: 'fecha', dir: -1, n: 25, all: false };
function sessionRows() {
  const rows = [];
  S.patients.forEach(p => {
    const docs = [];
    if (p.intake && p.intake.signedAt) docs.push({ tipo: 'Primera vez', at: p.intake.sessionAt, signedAt: p.intake.signedAt, rec: '', tab: 'intake', remoto: isRemote(p.intake.modalidad), dx: false, text: intakeSchema(p.intake).map(([, fs]) => fs.map(f => p.intake[f[0]] || '').join(' ')).join(' ') });
    S.notes.filter(n => n.patientId === p.id && n.signedAt).forEach(n => docs.push({ tipo: 'Sesión', at: n.sessionAt, signedAt: n.signedAt, rec: n.id, tab: 'evol', remoto: isRemote(n.modalidad), dx: !!n.dxCambio, text: evolSchema(n).map(f => n[f[0]] || '').join(' ') }));
    (p.cierres || []).forEach(c => docs.push({ tipo: 'Cierre', at: c.fecha || c.signedAt, signedAt: c.signedAt, rec: '', tab: 'cierre', text: CIERRE_FIELDS.map(f => c[f[0]] || '').join(' ') }));
    docs.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.signedAt).localeCompare(String(b.signedAt)));
    let k = 0; docs.forEach(d => { if (d.tipo !== 'Cierre') d.num = ++k; rows.push(Object.assign(d, { p, name: fullName(p) })); });
  });
  return rows;
}
function nlFilter(rows) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const from = { '7': new Date(now - 7 * 864e5), '30': new Date(now - 30 * 864e5), mes: new Date(y, m, 1), mesant: new Date(y, m - 1, 1), anio: new Date(y, 0, 1) }[NL.per];
  const to = NL.per === 'mesant' ? new Date(y, m, 1) : null, q = norm(NL.q.trim());
  return rows.filter(r => (!from || new Date(r.at) >= from) && (!to || new Date(r.at) < to) && (!NL.tipo || r.tipo === NL.tipo) && (!q || norm(r.name + ' ' + r.text).includes(q)));
}
/* Por defecto, una fila por paciente: su nota más reciente entre las que cumplen los filtros. */
function latestPerPatient(rows) {
  const m = new Map(); rows.forEach(r => { const c = m.get(r.p.id); if (!c || String(r.at) > String(c.at) || (String(r.at) === String(c.at) && String(r.signedAt) > String(c.signedAt))) m.set(r.p.id, r); });
  return [...m.values()];
}
function notesTableHTML() {
  const filtered = nlFilter(sessionRows()), all = NL.all ? filtered : latestPerPatient(filtered), f = { paciente: r => norm(r.name), num: r => r.num || 0, fecha: r => String(r.at) }[NL.sort];
  all.sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * NL.dir || String(b.at).localeCompare(String(a.at)); });
  const rows = all.slice(0, NL.n);
  const th = (k, l) => `<th aria-sort="${NL.sort === k ? (NL.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="thsort" data-act="nlSort" data-k="${k}">${l}<svg viewBox="0 0 10 14" aria-hidden="true"><path d="M2 5l3-3 3 3" class="${NL.sort === k && NL.dir > 0 ? 'on' : ''}"/><path d="M2 9l3 3 3-3" class="${NL.sort === k && NL.dir < 0 ? 'on' : ''}"/></svg></button></th>`;
  if (!all.length) return `<div class="empty">${S.notes.length || S.patients.some(p => p.intake && p.intake.signedAt) ? 'No hay notas con esos filtros.' : 'Aún no hay notas firmadas. Aparecerán aquí al firmar la primera vez o una sesión.'}</div>`;
  return `<div class="ntwrap"><table class="ntable"><thead><tr>${th('paciente', 'Consultante')}${th('num', 'Sesión #')}${th('fecha', 'Fecha')}<th>Tipo</th><th class="hide-sm">Firmada</th></tr></thead><tbody>
  ${rows.map(r => `<tr data-act="openHit" data-id="${r.p.id}" data-tab="${r.tab}" data-rec="${esc(r.rec)}"><td><button class="ntname" data-act="openHit" data-id="${r.p.id}" data-tab="${r.tab}" data-rec="${esc(r.rec)}"><span class="av">${esc(initials(r.name))}</span>${esc(r.name)}</button></td><td class="mono">${r.num ? '#' + r.num : '—'}</td><td class="mono">${esc(fmtNum(r.at))}</td><td><span class="chip ${r.tipo === 'Primera vez' ? 'ok' : r.tipo === 'Cierre' ? 'warn' : ''}">${r.tipo}</span>${r.remoto ? ' <span class="chip">A distancia</span>' : ''}${r.dx ? ' <span class="chip warn">Impresión actualizada</span>' : ''}</td><td class="mono hide-sm">${esc(fmtNum(r.signedAt))}</td></tr>`).join('')}</tbody></table></div>
  <div class="row" style="justify-content:space-between"><span class="ts">${rows.length < all.length ? `Mostrando ${rows.length} de ${all.length}` : NL.all ? `${all.length} nota${all.length === 1 ? '' : 's'}` : `${all.length} consultante${all.length === 1 ? '' : 's'} · última nota de cada uno`}</span>${rows.length < all.length ? '<button class="btn sm" data-act="nlMore">Ver más</button>' : ''}</div>`;
}
const fmtNum = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
function notesListHTML() {
  const per = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['mes', 'Este mes'], ['mesant', 'Mes anterior'], ['anio', 'Este año'], ['', 'Todo']];
  return `<details class="sec fold" data-fold="notas" ${foldOpen('notas')}><summary><h3>Notas de sesión</h3></summary><div class="nlbar"><input type="search" id="nl_q" placeholder="Buscar notas por consultante o contenido" value="${esc(NL.q)}" aria-label="Buscar notas">
  <select id="nl_per" aria-label="Periodo">${per.map(([v, l]) => `<option value="${v}" ${NL.per === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <select id="nl_tipo" aria-label="Tipo o plantilla"><option value="">Todos los tipos</option>${['Primera vez', 'Sesión', 'Cierre'].map(t => `<option ${NL.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
  <label class="check" style="font-size:13px"><input type="checkbox" id="nl_all" ${NL.all ? 'checked' : ''}> <span>Ver todas las notas (no solo la última de cada consultante)</span></label>
  <div id="ntbody">${notesTableHTML()}</div></details>`;
}
const nlRedraw = () => { const b = $('#ntbody'); if (b) b.innerHTML = notesTableHTML(); };
ACT.nlSort = b => { const k = b.dataset.k; if (NL.sort === k) NL.dir = -NL.dir; else { NL.sort = k; NL.dir = k === 'fecha' ? -1 : 1; } nlRedraw(); };
ACT.nlMore = () => { NL.n += 50; nlRedraw(); };

/* Resumen de una cuenta de equipo: agenda y consultantes, sin acceso a lo que se habla en sesión. */
function teamHomeHTML() {
  const act = S.patients.filter(p => !p.estado || p.estado === 'Activo').length, todayN = apptsOn(dayKey(new Date())).filter(a => a.estado !== 'Cancelada').length;
  return `<div class="panel"><div class="body"><button class="btn sm back" data-act="back">← Consultantes</button><h2 style="font-family:var(--f-doc);font-size:22px">Resumen</h2>
  <p class="stnote">Cuenta de equipo de ${esc((S.user && S.user.ownerName) || 'su terapeuta')}. Puede manejar la agenda y los datos de los consultantes; la información de las sesiones es solo del terapeuta.</p>
  ${S.user && !S.user.tieneFirma ? '<div class="banner">Registre su documento y su firma en «Mi cuenta» (menú arriba a la derecha): aparecen en el historial de cada cambio que haga a los datos de un consultante.</div>' : ''}
  <div class="stats"><div class="stat"><b>${act}</b><span>consultantes activos</span></div><div class="stat"><b>${todayN}</b><span>citas hoy</span></div></div>
  ${todoHTML()}${todayHTML()}</div></div>`;
}
function homeHTML() {
  const month = new Date().toISOString().slice(0, 7);
  const act = S.patients.filter(p => !p.estado || p.estado === 'Activo').length, noI = S.patients.filter(p => !(p.intake && p.intake.signedAt)).length;
  const nm = S.notes.filter(n => n.signedAt && (n.sessionAt || '').startsWith(month)).length;
  if (TEAM()) return teamHomeHTML();
  const ht = ['stats', 'enc'].includes(S.homeTab) ? S.homeTab : 'resumen';
  const tabs = `<div class="tabs" role="tablist" style="margin:0">${[['resumen', 'Resumen'], ['stats', 'Estadísticas'], ['enc', 'Encuesta de satisfacción']].map(([k, l]) => `<button class="tab ${ht === k ? 'on' : ''}" role="tab" data-act="homeTab" data-t="${k}">${l}</button>`).join('')}</div>`;
  const back = '<button class="btn sm back" data-act="back">← Consultantes</button>';
  if (ht !== 'resumen') return `<div class="panel"><div class="body">${back}${tabs}${statsHTML(false, ht)}</div></div>`;
  return `<div class="panel"><div class="body">${back}${tabs}${stepsHTML()}<h2 style="font-family:var(--f-doc);font-size:22px">Resumen</h2>
  <div class="stats"><div class="stat"><b>${act}</b><span>consultantes activos</span></div><div class="stat"><b>${noI}</b><span>sin primera vez firmada</span></div><div class="stat"><b>${nm}</b><span>notas firmadas este mes</span></div></div>
  ${todoHTML()}
  ${todayHTML()}
  ${notesListHTML()}
  <p style="color:var(--muted);margin:0">Seleccione un consultante de la lista o cree uno nuevo. Cada consentimiento, primera vez, nota de sesión e informe queda firmado con su firma, la fecha y la hora, y no se puede modificar después; solo se pueden agregar adendas.</p></div></div>`;
}

function fileHTML(p) {
  const a = ageOf(p.nacimiento);
  return `<div class="panel file"><div class="file-head"><div><button class="btn sm back" data-act="back">← Consultantes</button><h2>${esc(S.draft ? 'Nuevo consultante' : fullName(p))}</h2>
  <div class="meta"><span class="mono">${esc([p.tipoDoc, p.documento].filter(Boolean).join(' ') || 'sin documento')}</span>${!S.draft && openedAt(p) ? `<span>Historia abierta el ${esc(fmtD(openedAt(p)))}</span>` : ''}${a !== null ? `<span>${a} años</span>` : ''}${p.estado ? `<span class="chip ${p.estado === 'Activo' ? 'ok' : 'warn'}">${esc(p.estado)}</span>` : ''}${p.servicio && p.servicio !== 'Individual' ? `<span class="chip">${esc(p.servicio)}${linked(p).length ? ' · con ' + esc(linked(p).map(x => x.nombres || fullName(x)).join(', ')) : ''}</span>` : ''}${S.draft ? '' : nextApptHTML(p)}</div></div>
  ${S.draft || TEAM() ? '' : `<span class="row" style="gap:6px"><button class="btn sm" data-act="pnFor" data-id="${p.id}" title="Ideas, consejos de colegas y seguimiento: no forman parte de la ficha">Notas de proceso${S.pnotes.filter(n => n.patientId === p.id).length ? ' (' + S.pnotes.filter(n => n.patientId === p.id).length + ')' : ''}</button><button class="btn sm" data-act="accessLog" title="Quién abrió esta historia y qué hizo">Accesos</button><button class="btn sm" data-act="fullDoc">Historia completa</button></span>`}</div>
  <div class="tabs" role="tablist">${(TEAM() ? TABS.slice(0, 1) : tabsList()).map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" role="tab" data-act="tab" data-tab="${k}" ${S.draft && k !== 'datos' ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}>${l}</button>`).join('')}</div>
  <div class="body" id="tabbody">${tabHTML(p)}</div></div>`;
}
function tabHTML(p) {
  if (S.tab === 'datos' || TEAM()) return tabDatos(p);
  if (S.tab.startsWith('x_')) return tabExtra(p);
  if (S.tab === 'consent') return tabConsent(p);
  if (S.tab === 'intake') return tabIntake(p);
  if (S.tab === 'evol') return tabEvol(p);
  if (S.tab === 'cierre') return tabCierre(p);
  if (S.tab === 'escalas') return tabEscalas(p);
  if (S.tab === 'archivo') return tabArchivo(p);
  return tabInformes(p);
}
function sigNeeded() { return canSign() ? '' : '<div class="banner">Necesita su nombre y su firma en «Mi perfil y firma» para firmar.</div>'; }
function therPreview() { return S.profile.firma ? `<img class="sigimg" src="${S.profile.firma}" alt="Su firma guardada">` : '<span class="chip warn">Sin firma guardada</span>'; }

/* ----- Datos ----- */
const hasDocs = p => (p.incorporaciones || []).length || S.scales.some(e => e.patientId === p.id) || (p.consents || []).length || (p.cierres || []).length || (p.solicitudes || []).length || S.files.some(f => f.patientId === p.id) || (p.intake && p.intake.signedAt) || S.notes.some(n => n.patientId === p.id) || S.reports.some(r => r.patientId === p.id);
function cuidadorHTML(p, n, pre) {
  const na = !!p[pre + 'NA'], nac = p[pre + 'Nac'] || '';
  return `<div class="card cuid${na ? ' na' : ''}" data-cuid="${pre}"><div class="row" style="justify-content:space-between"><b>Cuidador o acudiente ${n}</b><label class="check" style="margin:0"><input type="checkbox" id="f_${pre}NA" data-f="${pre}NA" ${na ? 'checked' : ''}> <span>No aplica</span></label></div><div class="grid" ${na ? 'hidden' : ''}>${F('Nombre completo', pre + 'Nombre', p[pre + 'Nombre'])}${F('Parentesco', pre + 'Parentesco', p[pre + 'Parentesco'], { ph: n === 1 ? 'Ej.: madre' : 'Ej.: padre' })}${F('Documento de identidad', pre + 'Doc', p[pre + 'Doc'])}
  ${F('Fecha de nacimiento', pre + 'Nac', nac, { type: nac && !/^\d{4}-/.test(nac) ? 'text' : 'date', age: true })}${F('Ocupación', pre + 'Ocup', p[pre + 'Ocup'])}${telF('Teléfono', pre + 'Tel', pre + 'Ind', p)}</div>${na ? naRow().replace('class="row narow"', 'class="row narow" hidden') : naRow()}</div>`;
}
document.addEventListener('change', e => { const c = e.target.closest && e.target.closest('[data-cuid]'); if (!c || !/NA$/.test(e.target.id)) return; const g = c.querySelector('.grid'), nr = c.querySelector('.narow'); g.hidden = e.target.checked; if (nr) nr.hidden = e.target.checked; c.classList.toggle('na', e.target.checked); });
/* «Datos»: ningún campo queda en blanco. Cada apartado tiene botones para llenar sus vacíos con «No aplica» o «No responde». */
const naRow = () => `<div class="row narow"><span class="ts" style="font-family:inherit">En el campo seleccionado, escribir:</span><button type="button" class="btn sm" data-nafill="No aplica">No aplica</button><button type="button" class="btn sm" data-nafill="No responde">No responde</button></div>`;
const visibleField = el => !el.disabled && !el.closest('[hidden]') && el.type !== 'checkbox' && el.type !== 'hidden' && !/Ind$/.test(el.dataset.f);
/* Solo se llena el campo donde está el cursor (el último que se tocó dentro de ese apartado). */
let naLast = null;
document.addEventListener('focusin', e => { const el = e.target; if (el && el.dataset && el.dataset.f && el.closest('#tabbody')) naLast = el; });
document.addEventListener('mousedown', e => { if (e.target.closest('[data-nafill]')) e.preventDefault(); });  // que el campo no pierda el cursor
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nafill]'); if (!b) return;
  const box = b.closest('.card, .sec'), v = b.dataset.nafill, el = naLast;
  if (!el || !el.isConnected || !box.contains(el) || !visibleField(el)) { toast('Primero haga clic en el campo de este apartado que no aplica o que la persona no responde.'); return; }
  if (el.tagName === 'SELECT') {
    const o = [...el.options].find(x => x.value === v || (v === 'No responde' && /no respond/i.test(x.value)) || (v === 'No aplica' && /^No aplica/.test(x.value)));
    if (!o) { toast('Esta lista no tiene la opción «' + v + '»: elija una de la lista.'); return; }
    el.value = o.value;
  } else { if (el.type === 'date') el.type = 'text'; el.value = v; }
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  const f = el.closest('.fld'); if (f) f.classList.remove('miss');
  el.focus();
});
const BASE_SECS = [['contacto', 'Contacto'], ['cuidadores', 'Cuidadores o acudientes'], ['emergencia', 'Contacto de emergencia']];
const secOculta = id => ((S.profile.formatos || {}).ocultos || []).includes(id);
const datosSchema = () => (S.profile.formatos && S.profile.formatos.datos) || [];
/* Datos de identidad: una vez guardados no se pueden cambiar (el servidor también lo exige). */
const IDENT = ['nombres', 'apellidos', 'tipoDoc', 'documento', 'nacimiento', 'paisNac'];
function tabDatos(p) {
  const age = ageOf(p.nacimiento), minor = age !== null && age < 18;
  const lk = k => !S.draft && String(p[k] || '').trim() !== '';
  const cuid = `${cuidadorHTML(p, 1, 'acud')}${cuidadorHTML(p, 2, 'acud2')}`;
  return `<div class="sec"><h3>Identificación</h3>${!S.draft && IDENT.some(lk) ? '<p class="stnote">Los datos con 🔒 identifican al consultante y no se pueden cambiar después de guardados. Los demás sí, y cada cambio queda registrado.</p>' : (S.draft ? '<p class="stnote">Revise bien nombres, documento, fecha y país de nacimiento: después de guardarlos no se podrán cambiar.</p>' : '')}<div class="grid">
  ${F('Nombres', 'nombres', p.nombres, { lock: lk('nombres') })}${F('Apellidos', 'apellidos', p.apellidos, { lock: lk('apellidos') })}${F('Tipo de documento', 'tipoDoc', p.tipoDoc || 'CC', { type: 'select', opts: OPT.tipoDoc, lock: lk('tipoDoc') })}${F('Número de documento', 'documento', p.documento, { lock: lk('documento') })}
  ${F('Fecha de nacimiento', 'nacimiento', p.nacimiento, { type: 'date', lock: lk('nacimiento'), age: true })}${F('Lugar de nacimiento', 'lugarNac', p.lugarNac)}${countryF('País de nacimiento', 'paisNac', p.paisNac, lk('paisNac'))}${F('Sexo', 'sexo', p.sexo, { type: 'select', opts: OPT.sexo })}${F('Identidad de género', 'identidadGenero', p.identidadGenero || '', { type: 'select', opts: OPT.genero })}${countryF('Nacionalidad', 'nacionalidad', p.nacionalidad === undefined && S.draft ? 'Colombia' : p.nacionalidad)}${F('Pertenencia étnica', 'etnia', p.etnia, { type: 'select', opts: OPT.etnia })}${F('Pueblo o comunidad', 'etniaPueblo', p.etniaPueblo, { ph: 'Ej.: Wayuu, Nasa, Emberá' })}${F('Estado civil', 'estadoCivil', p.estadoCivil, { type: 'select', opts: OPT.estadoCivil })}${F('Escolaridad', 'escolaridad', p.escolaridad, { type: 'select', opts: OPT.escolaridad })}
  ${F('Ocupación', 'ocupacion', p.ocupacion)}${F('Discapacidad', 'discapacidad', p.discapacidad || '', { type: 'select', opts: OPT.discapacidad })}${F('Tipo de servicio', 'servicio', p.servicio || '', { type: 'select', opts: OPT.servicio })}${F('Modalidad de atención', 'modalidadAt', p.modalidadAt || '', { type: 'select', opts: OPT.modalidadAt })}${F('Estado del proceso', 'estado', p.estado || 'Activo', { type: 'select', opts: OPT.estado })}<div id="razonwrap" ${(p.estado || 'Activo') === 'Activo' ? 'hidden' : ''}>${F('Razón de inactividad', 'razonInactividad', p.razonInactividad || '', { type: 'select', opts: OPT.razon })}</div></div>${naRow()}</div>
  ${secOculta('contacto') ? '' : `<div class="sec"><h3>Contacto</h3><div class="grid">${countryF('País de residencia', 'paisRes', p.paisRes)}${cityF(p)}${F('Zona de residencia', 'zona', p.zona || '', { type: 'select', opts: OPT.zona })}${F('Localidad / comuna / barrio', 'localidad', p.localidad)}${F('Dirección', 'direccion', p.direccion)}${telF('Teléfono', 'telefono', 'telInd', p)}${F('Correo electrónico', 'correo', p.correo, { type: 'email' })}</div>${naRow()}</div>`}
  ${secOculta('cuidadores') ? '' : minor ? `<div class="sec"><h3>Cuidadores o acudientes</h3>${cuid}</div>` : `<div class="sec"><h3>Cuidadores o acudientes</h3><p class="stnote">En adultos sin cuidador, marque «No aplica».</p>${cuid}</div>`}
  ${secOculta('emergencia') ? '' : `<div class="sec"><h3>Contacto de emergencia</h3><div class="grid">${F('Nombre', 'emergNombre', p.emergNombre)}${F('Parentesco', 'emergParentesco', p.emergParentesco)}${telF('Teléfono', 'emergTelefono', 'emergInd', p)}</div>${naRow()}</div>`}
  ${datosSchema().map(([t, fs]) => `<div class="sec"><h3>${esc(t)}</h3><div class="grid">${fs.map(f => F(f[1], f[0], p[f[0]], f[1] ? {} : { wide: true, aria: t })).join('')}</div>${naRow()}</div>`).join('')}
  <p class="stnote">Solo el nombre es necesario; los demás datos son opcionales y puede completarlos cuando quiera.</p>
  <div id="dupslot"></div>${p.tipoDoc === 'Menor sin documento' || S.draft ? '<p class="stnote">Menor sin documento: elija «Menor sin documento» y escriba la cédula de la madre (o del padre) seguida del número de orden del menor en el grupo familiar, por ejemplo 52123456-2 (Res. 1995, art. 6).</p>' : ''}
  <div id="lkslot">${linksHTML(p)}</div>
  <div class="row end">${S.draft ? '<button class="btn" data-act="cancelDraft">Cancelar</button>' : ''}<button class="btn pri" data-act="savePatient">Guardar datos</button></div>
  ${S.draft ? '' : changesHTML(p)}`;
}
/* Registro de modificaciones de los datos (lo arma el servidor: fecha, hora, quién, antes y después). */
const PLABELS = { municipio: 'Ciudad o municipio', nacionalidad: 'Nacionalidad', zona: 'Zona de residencia', discapacidad: 'Discapacidad', nombres: 'Nombres', apellidos: 'Apellidos', tipoDoc: 'Tipo de documento', documento: 'Número de documento', nacimiento: 'Fecha de nacimiento', lugarNac: 'Lugar de nacimiento', paisNac: 'País de nacimiento', sexo: 'Sexo', identidadGenero: 'Identidad de género', etnia: 'Pertenencia étnica', etniaPueblo: 'Pueblo o comunidad', estadoCivil: 'Estado civil', escolaridad: 'Escolaridad', ocupacion: 'Ocupación', servicio: 'Tipo de servicio', modalidadAt: 'Modalidad de atención', estado: 'Estado del proceso', razonInactividad: 'Razón de inactividad', paisRes: 'País de residencia', ciudad: 'Ciudad', localidad: 'Localidad / barrio', direccion: 'Dirección', telefono: 'Teléfono', telInd: 'Indicativo del teléfono', correo: 'Correo', emergNombre: 'Contacto de emergencia', emergParentesco: 'Parentesco (emergencia)', emergTelefono: 'Teléfono de emergencia', emergInd: 'Indicativo (emergencia)', vinculo: 'Vínculo con otras personas', createdAt: 'Fecha de creación' };
[['acud', 'acudiente 1'], ['acud2', 'acudiente 2']].forEach(([k, n]) => Object.assign(PLABELS, { [k + 'Nombre']: 'Nombre del ' + n, [k + 'Parentesco']: 'Parentesco del ' + n, [k + 'Doc']: 'Documento del ' + n, [k + 'Nac']: 'Nacimiento del ' + n, [k + 'Ocup']: 'Ocupación del ' + n, [k + 'Tel']: 'Teléfono del ' + n, [k + 'Ind']: 'Indicativo del ' + n }));
const plabel = k => PLABELS[k] || (datosSchema().flatMap(([t, fs]) => fs.map(f => [f[0], f[1] || t])).find(f => f[0] === k) || [0, k])[1];
const shortVal = v => v === null || v === undefined || v === '' ? '(vacío)' : String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v);
const chVal = (k, v) => v;
function changesHTML(p) {
  const log = (p.cambios || []).slice().reverse();
  if (!log.length) return '';
  return `<details class="sec" id="chlog"><summary class="sum">Historial de cambios de los datos (${log.length})</summary><div class="chlog">${log.map(e => `<div class="chrow"><div class="chhead"><b>${esc(fmtDT(e.at))}</b> · ${esc(e.por || '')}${e.rol ? ` <span class="chip">${esc(e.rol)}</span>` : ''}</div>${e.creado ? '<div class="stnote">Creó la historia.</div>' : `<ul>${(e.campos || []).map(c => `<li><b>${esc(plabel(c.campo))}:</b> ${esc(shortVal(chVal(c.campo, c.antes)))} → ${esc(shortVal(chVal(c.campo, c.despues)))}</li>`).join('')}</ul>`}
  <div class="chsig">${e.firma && (p.firmasCambios || {})[e.firma] ? `<img src="${p.firmasCambios[e.firma]}" alt="Firma de ${esc(e.por || '')}">` : '<span class="stnote">Sin firma registrada</span>'}<span>${esc(e.por || '')}<br>${esc([e.cc ? 'C.C. ' + e.cc : '', e.tp ? 'T.P. ' + e.tp : (e.rol === 'Equipo' ? 'Equipo (sin registro)' : '')].filter(Boolean).join(' · '))}</span></div></div>`).join('')}</div></details>`;
}
/* Fecha en que se abrió la historia: la registra el servidor; las anteriores se toman del documento más antiguo. */
function openedAt(p) {
  if (p.abiertaEl) return p.abiertaEl;
  const ds = [...(p.consents || []).map(c => c.signedAt), (p.intake || {}).sessionAt, ...(p.incorporaciones || []).map(i => i.desde), ...S.notes.filter(n => n.patientId === p.id && n.signedAt).map(n => n.sessionAt)].filter(Boolean).sort();
  return ds[0] || p.createdAt || '';
}
ACT.newPatient = () => { S.view = 'patients'; S.draft = true; S.draftObj = { id: newId('p'), kind: 'patient', consents: [], estado: 'Activo', tipoDoc: 'CC', createdAt: nowISO() }; S.pid = S.draftObj.id; S.tab = 'datos'; render(); };
const MIN_ID = ['nombres', 'apellidos', 'tipoDoc', 'documento', 'nacimiento', 'sexo'];
const NA_VALUES = ['No aplica', 'No responde', 'No refiere', 'No se indagó'];
/* Una sola ficha por persona: aviso si ya hay un consultante con ese documento. */
const normDoc = v => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const dupOf = (doc, id) => normDoc(doc).length >= 3 ? S.patients.find(x => x.id !== id && normDoc(x.documento) === normDoc(doc)) : null;
function dupWarn(doc, id) {
  const d = dupOf(doc, id), slot = $('#dupslot'); if (!slot) return;
  slot.innerHTML = d ? `<div class="banner" role="alert"><b>Ya existe la historia de ${esc(fullName(d))}</b> con el documento ${esc(d.documento)}. Debe haber una sola historia por persona. <button class="btn sm" data-act="open" data-id="${d.id}">Abrir esa historia</button></div>` : '';
  if (d) slot.scrollIntoView({ block: 'center' });
}
document.addEventListener('change', e => { if (e.target && e.target.id === 'f_documento' && S.draft) dupWarn(e.target.value, S.pid); });
/* Documento y teléfono del paciente: al escribir o pegar solo entran números. Excepciones: los textos «No aplica» / «No responde»
   (los botones de cada apartado los ponen en el campo) y los documentos que pueden llevar letras (pasaporte, menor sin documento, otro).
   El indicativo del país admite además el «+». */
const DOC_CON_LETRAS = /^(Pasaporte|Menor sin documento|Otro)$/;
function soloNumeros(el, re) {
  const v = el.value; if (el.disabled || NA_VALUES.includes(v.trim())) return;
  const n = v.replace(re, ''); if (n === v) return;
  const c = el.selectionStart, pos = c == null ? null : v.slice(0, c).replace(re, '').length;
  el.value = n; if (pos != null) { try { el.setSelectionRange(pos, pos); } catch (_) { /* tipo sin selección */ } }
}
const docNumerico = () => { const t = $('#f_tipoDoc'); return !t || !DOC_CON_LETRAS.test(t.value); };
document.addEventListener('input', e => {
  const el = e.target, k = el && el.dataset && el.dataset.f; if (!k) return;
  if (k === 'documento') { if (docNumerico()) soloNumeros(el, /\D/g); }
  else if (/Ind$/.test(k) && el.closest('.telrow')) soloNumeros(el, /[^\d+]/g);
  else if (el.closest('.telrow')) soloNumeros(el, /\D/g);
});
document.addEventListener('change', e => { if (e.target && e.target.id === 'f_tipoDoc' && docNumerico()) { const d = $('#f_documento'); if (d) soloNumeros(d, /\D/g); } });
ACT.cancelDraft = () => { S.draft = false; S.draftObj = null; S.pid = null; render(); };
ACT.open = b => { S.view = 'patients'; S.draft = false; S.pid = b.dataset.id; S.tab = b.dataset.tab || 'datos'; S.newNote = false; S.newReport = false; S.reconsent = false; S.consentPreset = null; render(); scrollTo(0, 0); logView(); };
ACT.back = () => { S.pid = null; S.draft = false; S.homeOpen = false; render(); scrollTo(0, 0); };
ACT.tab = b => { if (S.draft) return; S.tab = b.dataset.tab; S.newNote = false; S.newReport = false; S.newSol = false; S.newIncorp = false; S.newScale = null; S.reconsent = false; S.consentPreset = null; render(); logView(); };
/* ----- Teléfono con indicativo del país ----- */
const DIAL = [['+57', 'Colombia'], ['+58', 'Venezuela'], ['+593', 'Ecuador'], ['+51', 'Perú'], ['+507', 'Panamá'], ['+52', 'México'], ['+1', 'Estados Unidos, Canadá, Puerto Rico, Rep. Dominicana'], ['+34', 'España'], ['+54', 'Argentina'], ['+56', 'Chile'], ['+591', 'Bolivia'], ['+595', 'Paraguay'], ['+598', 'Uruguay'], ['+55', 'Brasil'], ['+506', 'Costa Rica'], ['+502', 'Guatemala'], ['+503', 'El Salvador'], ['+504', 'Honduras'], ['+505', 'Nicaragua'], ['+53', 'Cuba'], ['+44', 'Reino Unido'], ['+33', 'Francia'], ['+49', 'Alemania'], ['+39', 'Italia'], ['+351', 'Portugal'], ['+31', 'Países Bajos'], ['+41', 'Suiza'], ['+32', 'Bélgica'], ['+46', 'Suecia'], ['+61', 'Australia'], ['+972', 'Israel'], ['+971', 'Emiratos Árabes Unidos'], ['+81', 'Japón'], ['+86', 'China'], ['+91', 'India']];
function telF(label, key, indKey, p) {
  if (!$('#diallist')) { const d = document.createElement('datalist'); d.id = 'diallist'; d.innerHTML = DIAL.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join(''); document.body.appendChild(d); }
  return `<div class="fld"><label for="f_${key}">${esc(label)}</label><div class="telrow"><input id="f_${indKey}" data-f="${indKey}" type="text" list="diallist" inputmode="tel" autocomplete="off" value="${esc(p[indKey] || '+57')}" aria-label="Indicativo del país" title="Indicativo del país"><input id="f_${key}" data-f="${key}" type="tel" value="${esc(p[key] || '')}"></div></div>`;
}
/* Teléfono para mostrar: indicativo + número (si el número ya trae «+», se deja como está). */
const telOf = (num, ind) => { const n = String(num || '').trim(); if (!n) return ''; return n.startsWith('+') ? n : ((ind || '+57') + ' ' + n); };

/* ----- País (lista ISO en español, con escritura libre) ----- */
const COUNTRIES = (() => { const codes = 'AF AX AL DE AD AO AI AQ AG SA DZ AR AM AW AU AT AZ BS BD BB BH BE BZ BJ BM BY BO BA BW BR BN BG BF BI BT CV KH CM CA BQ QA TD CZ CL CN CY CO KM CG CD KP KR CI CR HR CU CW DK DM EC EG SV AE ER SK SI ES US EE SZ ET PH FI FJ FR GA GM GE GH GI GD GR GL GP GU GT GF GG GN GQ GW GY HT HN HK HU IN ID IQ IR IE IS IL IT JM JP JE JO KZ KE KG KI KW LA LS LV LB LR LY LI LT LU MO MK MG MY MW MV ML MT MA MQ MU MR YT MX FM MD MC MN ME MS MZ MM NA NR NP NI NE NG NO NC NZ OM NL PK PW PS PA PG PY PE PF PL PT PR GB CF DO RE RW RO RU WS AS BL KN SM MF PM VC SH LC ST SN RS SC SL SG SX SY SO LK ZA SD SS SE CH SR SJ TH TW TZ TJ TL TG TO TT TN TM TR TV UA UG UY UZ VU VA VE VN WF YE DJ ZM ZW'.split(' ');
  let names; try { const dn = new Intl.DisplayNames(['es'], { type: 'region' }); names = codes.map(c => dn.of(c)); } catch (e) { names = ['Colombia', 'Venezuela', 'Ecuador', 'Perú', 'Panamá', 'México', 'España', 'Estados Unidos', 'Argentina', 'Chile']; }
  return ['Colombia', ...[...new Set(names)].filter(n => n && n !== 'Colombia').sort((a, b) => a.localeCompare(b, 'es'))]; })();
/* País: lista desplegable como las demás (se puede escribir la inicial para saltar al país). */
function countryF(label, key, val, lock) {
  return F(label, key, val || '', { type: 'select', opts: [''].concat(COUNTRIES, ['No responde']), lock });
}

function selPairs(label, key, val, inner) { return `<div class="fld"><label for="f_${key}">${esc(label)}</label><select id="f_${key}" data-f="${key}">${inner}</select></div>`; }
const normTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cityF = p => F('Ciudad o municipio', 'ciudad', p.ciudad);

/* ----- Personas vinculadas: pareja, familia o grupo. Cada una tiene su historia; comparten el vínculo. ----- */
const linked = p => p && p.vinculo ? S.patients.filter(x => x.id !== p.id && x.vinculo === p.vinculo) : [];
function linksHTML(p) {
  const tipo = p.servicio || '';
  if (!['Pareja', 'Familiar', 'Grupal', 'Otro'].includes(tipo) && !linked(p).length) return '';
  const ls = linked(p), others = S.patients.filter(x => x.id !== p.id && !ls.includes(x)).sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  return `<div class="sec" id="lkbox"><h3>Personas vinculadas${tipo && tipo !== 'Otro' ? ' · ' + esc(tipo.toLowerCase()) : ''}</h3>
  <p style="margin:0;font-size:13px;color:var(--muted)">Cada persona tiene su propia ficha, sus consentimientos y sus notas. El vínculo solo las relaciona para encontrarlas juntas.</p>
  ${S.draft ? '<p class="stnote">Guarde primero los datos de este consultante para poder vincularlo.</p>' : `
  ${ls.length ? `<div class="row">${ls.map(x => `<span class="lkchip"><button class="btn sm" data-act="open" data-id="${x.id}">${esc(fullName(x))}</button><button class="btn sm warn" data-act="lkDel" data-id="${x.id}" aria-label="Desvincular a ${esc(fullName(x))}">✕</button></span>`).join('')}</div>` : '<p class="stnote">Aún no hay personas vinculadas.</p>'}
  ${others.length ? `<div class="row"><select id="lk_sel" aria-label="Consultante para vincular" style="flex:1;min-width:200px"><option value="">Elegir un consultante para vincular…</option>${others.map(x => `<option value="${x.id}">${esc(fullName(x))}${x.vinculo ? ' (ya en otro vínculo)' : ''}</option>`).join('')}</select><button class="btn" data-act="lkAdd">Vincular</button></div>` : '<p class="stnote">Cree a las otras personas como consultantes para vincularlas.</p>'}`}</div>`;
}
ACT.lkAdd = async b => {
  const p = curPatient(), o = S.patients.find(x => x.id === $('#lk_sel').value); if (!o) { toast('Elija un consultante.'); return; }
  const g = p.vinculo || o.vinculo || newId('v'), move = S.patients.filter(x => x === p || x === o || (o.vinculo && x.vinculo === o.vinculo) || (p.vinculo && x.vinculo === p.vinculo));
  const tipo = $('#f_servicio') ? $('#f_servicio').value : p.servicio, snaps = move.map(x => [x, clone(x)]);
  move.forEach(x => { x.vinculo = g; if (tipo && (!x.servicio || x.servicio === 'Individual')) x.servicio = tipo; });
  if (!(await persist(move, b))) { snaps.forEach(([x, sn]) => restore(x, sn)); return; }
  toast(fullName(o) + ' quedó vinculado/a.'); $('#lkslot').innerHTML = linksHTML(p);
};
ACT.lkDel = async b => {
  const p = curPatient(), o = S.patients.find(x => x.id === b.dataset.id); if (!o) return;
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; }
  const rest = linked(o).filter(x => x.id !== o.id), ch = [o].concat(rest.length === 1 ? rest : []), snaps = ch.map(x => [x, clone(x)]);
  ch.forEach(x => { delete x.vinculo; });  // si queda una sola persona, el vínculo desaparece
  if (!(await persist(ch, b))) { snaps.forEach(([x, sn]) => restore(x, sn)); return; }
  toast('Vínculo quitado.'); $('#lkslot').innerHTML = linksHTML(p);
};
ACT.savePatient = async b => {
  const p = curPatient(), o = readForm($('#tabbody'), {});
  // Solo el nombre es necesario para identificar la ficha; los demás datos son opcionales.
  if (!String(o.nombres || '').trim()) { toast('Escriba al menos el nombre del consultante.'); const f = $('#f_nombres'); if (f) { f.closest('.fld').classList.add('miss'); f.focus(); } return; }
  if (S.draft && dupOf(o.documento, p.id)) { dupWarn(o.documento, p.id); return; }
  const snap = clone(p); Object.assign(p, o);
  if (!(await persist([p], b))) { restore(p, snap); return; }
  if (S.draft) { if (!S.patients.some(x => x.id === p.id)) S.patients.push(p); S.draft = false; S.draftObj = null; S.pid = p.id; }
  toast('Datos guardados.'); render();
};
ACT.delPatient = b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: eliminar todo el expediente'; return; }
  const p = curPatient(), ids = [p.id, ...S.notes.filter(n => n.patientId === p.id).map(n => n.id), ...S.reports.filter(r => r.patientId === p.id).map(r => r.id)];
  S.patients = S.patients.filter(x => x.id !== p.id); S.notes = S.notes.filter(n => n.patientId !== p.id); S.reports = S.reports.filter(r => r.patientId !== p.id);
  S.pid = null; ids.forEach(id => Store.remove(id)); toast('Expediente eliminado.'); render();
};
/* Antes de generar la historia completa se elige qué incluir. */
function chooseParts(p, title, go) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="box" id="partsform" style="width:min(520px,100%)"><div class="row" style="justify-content:space-between"><h3>${esc(title)}</h3><button class="btn sm" id="pt_cl">Cerrar</button></div>
  <p style="margin:0;font-size:14px">Marque lo que quiere incluir. Si quita algo, el documento lo indica al inicio como copia parcial.</p>
  <div class="sec">${FULL_PARTS.map(([k, l]) => { const n = partCount(p, k); return `<label class="check"><input type="checkbox" data-part="${k}" ${n ? 'checked' : 'disabled'}> <span>${esc(l)} <span style="color:var(--muted)">(${n})</span></span></label>`; }).join('')}</div>
  <div class="row end"><button class="btn pri" id="pt_go">Generar</button></div></div></div>`;
  $('#pt_cl').onclick = () => { root.innerHTML = ''; };
  $('#pt_go').onclick = () => { const sin = $$('#partsform [data-part]').filter(x => !x.checked).map(x => x.dataset.part); root.innerHTML = ''; go(sin); };
}
ACT.fullDoc = () => { const p = curPatient(); chooseParts(p, 'Historia completa', sin => showDoc('Ficha · ' + fullName(p), docFull(p, sin), 'historia-clinica-' + slug(fullName(p)) + (sin.length ? '-parcial' : '') + '.html')); };

/* ----- Consentimiento ----- */
function consentCard(p, c, i) {
  const r = c.revocacion;
  return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(c.tipo || 'Atención presencial')}</b><span class="row" style="gap:6px">${c.remoto ? '<span class="chip">Firmado a distancia</span>' : ''}<span class="chip ${r ? 'warn' : 'ok'}">${r ? 'Revocado' : 'Vigente'}</span></span></div>
  <span class="ts">${c.folio ? 'Folio n.º ' + c.folio + ' · ' : ''}Firmado ${esc(fmtShort(c.signedAt))} · ${esc(c.signerType === 'Acudiente' ? 'Representante' : c.signerType)}: ${esc(c.signerName)}${c.signer2Name ? ' y ' + esc(c.signer2Name) : ''}${r ? ' · revocado el ' + esc(fmtD(r.fecha)) + ' (' + esc(r.alcance.toLowerCase()) + ')' : ''}</span>
  <div class="row"><button class="btn sm pri" data-act="viewConsent" data-i="${i}">Ver y descargar</button>${c.soporte ? `<button class="btn sm" data-act="openFile" data-id="${esc(c.soporte.id)}">Ver soporte</button>` : ''}${r ? '' : `<button class="btn sm" data-act="revokeConsent" data-i="${i}">Registrar revocación</button>`}</div></div>`;
}
function repBlock(n, name, doc, par) {
  return `<div class="card"><b>Representante legal ${n}</b><div class="grid">${F('Nombre', 'r' + n + 'Name', name)}${F('Documento', 'r' + n + 'Doc', doc)}${F('Parentesco', 'r' + n + 'Par', par)}</div>
  <div class="fld"><span class="lbl">Firma</span><div class="sigbox" data-pad="consentSig${n === 1 ? '' : '2'}"></div><div class="row"><button class="btn sm" data-clear="consentSig${n === 1 ? '' : '2'}">Borrar firma</button></div></div></div>`;
}
function tabConsent(p) {
  const cs = p.consents || [];
  const dataBanner = '';
  if (cs.length && !S.reconsent) {
    const hasCare = cs.some(c => c.tipo !== DATA_TIPO && !(c.revocacion && c.revocacion.alcance === 'Total'));
    const remote = /Virtual|Mixta/.test(p.modalidadAt || ''), hasTele = cs.some(c => (/tele/i.test(c.tipo || '') || /TELETERAPIA/i.test(c.text || '')) && !(c.revocacion && c.revocacion.alcance === 'Total'));
    const teleWarn = remote && !hasTele ? `<div class="banner">En los datos, la modalidad de atención es «${esc(p.modalidadAt)}», pero ningún consentimiento vigente incluye teleterapia. Registre uno de tipo «${p.modalidadAt === 'Virtual' ? 'Teleterapia' : 'Presencial y teleterapia'}».</div>` : '';
    return `<div class="sec">${remotePending(p)}${dataBanner}${p.consentDraft ? '<div class="banner">Tiene un consentimiento en borrador (sin firmar). <button class="btn sm pri" data-act="reConsent">Continuar</button></div>' : ''}${hasCare ? '' : '<div class="banner">No hay un consentimiento de atención vigente.</div>'}${teleWarn}<div class="row" style="justify-content:space-between"><h3 style="flex:1">Consentimientos y autorizaciones (${cs.length})</h3><button class="btn" data-act="formats" data-hub="consent">Editar modelos</button><button class="btn pri" data-act="reConsent">Nuevo consentimiento</button></div>
    ${cs.map((c, i) => [c, i]).reverse().map(([c, i]) => consentCard(p, c, i)).join('')}
    <p style="margin:0;font-size:13px;color:var(--muted)">Si el consultante empieza a atenderse por videollamada, registre un consentimiento nuevo de tipo «Teleterapia».</p></div>`;
  }
  const mine = myConsents();
  const byMod = { Virtual: 'Teleterapia (atención a distancia)', 'Mixta (presencial y virtual)': 'Presencial y teleterapia' }[p.modalidadAt] || 'Atención presencial';
  const dr = p.consentDraft || {}, tipo = S.consentPreset || dr.tipo || (mine.length ? 'mio:' + mine[0].id : byMod), tpl = dr.tipo === tipo && dr.consentText ? dr.consentText : consentText(p, tipo);
  const age = ageOf(p.nacimiento), minor = age !== null && age < 18;
  const btns = `${S.reconsent ? '<button class="btn" data-act="cancelRe">Cancelar</button>' : ''}<button class="btn" data-act="saveConsentDraft" title="Guarda lo escrito de forma temporal, sin firmar">Guardar borrador</button>${S.mode === 'server' && !minor ? '<button class="btn" data-act="remoteConsent" title="El consultante lo lee y lo firma desde su celular">Enviar para firmar a distancia</button>' : ''}<button class="btn pri" data-act="signConsent">Firmar aquí</button>`;
  return `<div class="sec" id="consentform">${remotePending(p)}${S.consentPreset === DATA_TIPO ? '' : dataBanner}<div class="row" style="justify-content:space-between"><h3 style="flex:1">Nuevo consentimiento</h3><button class="btn sm" data-act="formats" data-hub="consent">Editar modelos</button></div>${sigNeeded()}<div class="row end">${btns}</div>
  <div class="grid"><div class="fld"><label for="f_consentTipo">Documento</label><select id="f_consentTipo" data-f="tipo"><optgroup label="Modelos base">${CONSENT_TIPOS.map(t => `<option value="${esc(t)}" ${t === tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</optgroup>${mine.length ? `<optgroup label="Mis consentimientos">${mine.map(c => `<option value="mio:${esc(c.id)}" ${'mio:' + c.id === tipo ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</optgroup>` : ''}</select></div></div>
  <div class="fld wide"><label for="f_consentText">Texto (editable antes de firmar)</label>${richBar('f_consentText')}<textarea id="f_consentText" data-f="consentText" rows="16" style="font-family:var(--f-doc);font-size:15px" data-auto="1">${esc(tpl)}</textarea></div>
  ${minor ? `<div class="sec" id="repsblock"><h3>Firmas de los representantes legales</h3><p style="margin:0;font-size:13px;color:var(--muted)">Para menores de edad firman ambos padres o representantes. Si alguno no firma, explique por qué.</p>
    ${repBlock(1, p.acudNombre || '', p.acudDoc || '', p.acudParentesco || '')}${repBlock(2, p.acud2Nombre || '', p.acud2Doc || '', p.acud2Parentesco || '')}
    ${F('Si alguno de los representantes no firma, ¿por qué?', 'sinFirma2', '', { type: 'area', rows: 2, wide: true })}
    ${S.mode === 'server' ? `<div class="fld"><label for="f_soporte">Si firma un solo representante: documento notarial o de soporte (opcional)</label><input type="file" id="f_soporte" accept="application/pdf,image/png,image/jpeg,image/webp">
    <span style="font-size:12px;color:var(--muted)">Por ejemplo: declaración ante notaría, sentencia o acta de custodia, registro civil, acta de defunción. PDF (máximo 8 MB) o imagen. Se comprime al subir, sin perder legibilidad.</span></div>` : ''}
    <div class="card" id="assentblock"><label class="check"><input type="checkbox" id="f_as_firma" data-f="as_firma" checked> <span>El menor (${esc(fullName(p))}) también firma el asentimiento</span></label>
    <div class="sigbox" data-pad="assentSig"></div><div class="row"><button class="btn sm" data-clear="assentSig">Borrar firma</button></div>
    ${F('Observaciones sobre el asentimiento (opcional)', 'as_obs', '', { type: 'area', rows: 2, wide: true })}</div></div>
    <div class="fld"><span class="lbl">Firma del terapeuta (guardada en su perfil)</span>${therPreview()}</div>`
  : `<div class="grid">${F('Firma quien', 'signerType', dr.signerType || 'Consultante', { type: 'select', opts: ['Consultante', 'Acudiente'] })}${F('Nombre del firmante', 'signerName', dr.signerName || fullName(p))}${F('Documento del firmante', 'signerDoc', dr.signerDoc || p.documento)}</div>
  <div class="grid"><div class="fld"><span class="lbl">Firma del consultante o acudiente</span><div class="sigbox" data-pad="consentSig"></div><div class="row"><button class="btn sm" data-clear="consentSig">Borrar firma</button></div></div>
  <div class="fld"><span class="lbl">Firma del terapeuta (guardada en su perfil)</span>${therPreview()}</div></div>`}
  <div class="grid">${F('Copia para el usuario', 'copia', dr.copia || '', { type: 'select', opts: [''].concat(COPIA), req: true })}</div>
  <label class="check"><input type="checkbox" id="c_ok"> <span><b>Quien firma leyó el documento, recibió respuestas a sus preguntas y acepta de forma libre y voluntaria.</b></span></label>
  <div class="row end">${btns}</div>
  ${S.mode === 'server' ? `<p class="stnote">${minor ? 'Para menores de edad, el consentimiento se firma en consulta (firman ambos representantes).' : '«Enviar para firmar a distancia» (teleterapia): el consultante recibe un enlace, escribe su número de documento, lee el texto y firma con el dedo. Queda con la hora del servidor, igual de inmutable.'}</p>` : ''}</div>`;
}
