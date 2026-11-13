/* Núcleo: utilidades, estado, almacenamiento, firma en lienzo, formularios y genograma. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Núcleo: utilidades, almacenamiento, firma ===== */
/* Tema claro por defecto; la preferencia (solo claro u oscuro) se recuerda en este navegador. */
try { document.documentElement.setAttribute('data-theme', localStorage.getItem('ac_theme') === 'dark' ? 'dark' : 'light'); } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
/* Hora de firma: la del servidor (sincronizado con la hora legal), corregida por la diferencia con este equipo. */
let CLOCK_SKEW = 0;
const nowISO = () => new Date(Date.now() + CLOCK_SKEW).toISOString();
async function syncClock() { try { const t0 = Date.now(), r = await fetch('/api/time', { credentials: 'same-origin' }); if (!r.ok) return; const j = await r.json(), t1 = Date.now(); CLOCK_SKEW = new Date(j.now).getTime() - (t0 + t1) / 2; } catch (e) { /* sin servidor */ } }
const fmtDT = iso => iso ? new Date(iso).toLocaleString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const fmtShort = iso => iso ? new Date(iso).toLocaleString(I18N.locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fmtD = iso => { if (!iso) return ''; const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso); return d.toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'long', year: 'numeric' }); };
const localInput = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
/* Edad para mostrar junto a una fecha de nacimiento: «41 años», «1 año», «8 meses» (bebés) o vacío si la fecha no sirve. */
const ageTxt = b => { const a = ageOf(b); if (a === null || a > 130) return ''; if (a > 0) return a + (a === 1 ? ' año' : ' años');
  const d = new Date(b + 'T12:00:00'), n = new Date(); let m = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth() - (n.getDate() < d.getDate() ? 1 : 0);
  return m <= 0 ? 'menos de 1 mes' : m + (m === 1 ? ' mes' : ' meses'); };
// Las casillas con edad (F(..., {age: true})) la recalculan mientras se escribe o se elige la fecha
['input', 'change'].forEach(ev => document.addEventListener(ev, e => { const t = e.target, out = t && t.id && document.getElementById('age_' + (t.dataset || {}).f);
  if (out && t.id === 'f_' + t.dataset.f) out.textContent = ageTxt(t.value); }, true));
const ageOf = b => { if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null; const d = new Date(b + 'T12:00:00'), n = new Date(); let a = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a >= 0 ? a : null; };
const fullName = p => [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || 'Consultante sin nombre';

function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* Logotipo: una hoja dentro de un círculo. */
const logoSVG = (px = 32) => `<svg class="logo" width="${px}" height="${px}" viewBox="0 0 120 120" role="img" aria-label="Alter-Karute"><circle cx="60" cy="60" r="56" fill="#E4EBE2"/><path d="M60 24C88.8 39.6 88.8 75.6 60 96C31.2 75.6 31.2 39.6 60 24Z" fill="#7C9A83"/><path d="M60 98V43" stroke="#2F4A3A" stroke-width="4.2" fill="none" stroke-linecap="round"/><path d="M60 67L45.6 55M60 77L74.4 62" stroke="#2F4A3A" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="60" cy="60" r="56" fill="none" stroke="#2F4A3A" stroke-width="3"/></svg>`;

/* ===== Estado ===== */
const S = { user: null, profile: null, patients: [], notes: [], reports: [], pnotes: [], pagos: [], pn: { q: '', pid: '', tipo: '', estado: 'abiertas', sel: null, draft: null, open: new Set() }, appts: [], files: [], scales: [], view: 'patients', newSol: false, newIncorp: false, newScale: null, week: null, noteSeed: null, pid: null, draft: false, tab: 'datos', q: '', mode: 'local', loading: true, newNote: false, newReport: false };

/* ===== Almacenamiento: privado por usuario en db; respaldo local si db no está disponible ===== */
/* Llamadas a la API propia (modo servidor). */
async function api(path, opt = {}) {
  const r = await fetch('/api' + path, {
    method: opt.method || 'GET', credentials: 'same-origin',
    headers: Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'archivo-clinico' }, opt.headers || {}),
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined
  });
  if (r.status === 401 && !opt.noRedirect && S.user) { S.user = null; S.patients = []; S.notes = []; S.reports = []; S.appts = []; S.pagos = []; S.files = []; S.scales = []; S.pid = null; hideIdleWarn(); renderLogin('Su sesión terminó. Ingrese de nuevo.'); throw new Error('Sesión terminada'); }
  if (!r.ok) {
    let m = 'Error ' + r.status;
    let det = null;
    try { const j = await r.json(); if (typeof j.detail === 'string') m = j.detail; else det = j.detail; } catch (e) { /* sin cuerpo */ }
    const err = new Error(m); err.status = r.status; err.detail = det; throw err;
  }
  return r.status === 204 ? null : r.json();
}

const Store = {
  col: null,
  chain: Promise.resolve(),
  async init() {
    try {
      if (window.claude && claude.use) {
        const user = await claude.use('user');
        const uid = user ? await user.id() : null;
        const db = await claude.use('db');
        if (db && uid) { this.col = db.collection('data/users/' + uid); S.mode = 'cloud'; }
      }
    } catch (e) { /* sigue */ }
    if (!this.col) {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { 'X-Requested-With': 'archivo-clinico' } });
        const isJson = (r.headers.get('content-type') || '').includes('json');
        if (isJson && r.status === 200) { S.user = await r.json(); S.mode = 'server'; }
        else if (isJson && r.status === 401) { S.user = null; S.mode = 'server'; }
        else if (r.status >= 500 || isJson) S.mode = 'down'; // hay servidor, pero la API no responde: no caer en modo local
      } catch (e) { if (location.protocol !== 'file:') S.mode = 'down'; /* abierto como archivo: modo local */ }
    }
  },
  localRead() { try { return JSON.parse(localStorage.getItem('archivo_clinico') || 'null'); } catch (e) { return null; } },
  localWrite() {
    if (S.mode !== 'local') return; // en modo servidor o nube no se deja información de las sesiones en el navegador
    try { localStorage.setItem('archivo_clinico', JSON.stringify({ profile: S.profile, patients: S.patients, notes: S.notes, reports: S.reports, appts: S.appts, scales: S.scales, pnotes: S.pnotes })); } catch (e) { /* sin almacenamiento */ }
  },
  /* Carga todo y lo reemplaza de una vez. Si ya hay una carga en curso, se espera esa misma:
     dos cargas a la vez duplicaban los consultantes en la lista. */
  load() {
    if (!this._loading) this._loading = this._load().finally(() => { this._loading = null; });
    return this._loading;
  },
  async _load() {
    const D = { profile: null, patients: [], notes: [], reports: [], appts: [], files: [], scales: [], pnotes: [], pagos: [] };
    const put = o => {
      if (!o || !o.kind) return;
      if (o.kind === 'profile') { D.profile = o; return; }
      const k = { patient: 'patients', note: 'notes', report: 'reports', appt: 'appts', file: 'files', scale: 'scales', pnote: 'pnotes', pago: 'pagos' }[o.kind];
      if (k && !D[k].some(x => x.id === o.id)) D[k].push(o);
    };
    if (S.mode === 'server') (await api('/records')).forEach(put);
    else if (this.col) (await this.col.limit(1000).get()).docs.forEach(d => { const o = JSON.parse(JSON.stringify(d.data() || {})); if (o.kind !== 'file') put(o); });
    else {
      const l = this.localRead();
      if (l) { D.profile = l.profile || null; ['patients', 'notes', 'reports', 'appts', 'scales', 'pnotes'].forEach(k => (l[k] || []).forEach(put)); }
    }
    Object.assign(S, D);
    if (!S.profile) S.profile = { id: 'profile', kind: 'profile', nombre: (S.user && S.user.name) || '', titulo: 'Terapeuta', registro: '', consultorio: '', ciudad: '', telefono: '', correo: (S.user && S.user.email) || '', firma: '', consentimiento: '' };
  },
  save(obj, opt = {}) {
    if (S.mode !== 'server' && obj.kind === 'patient' && !obj.abiertaEl) obj.abiertaEl = nowISO();  // en el servidor la pone el servidor
    const o = clone(obj);
    this.localWrite();
    let p;
    if (S.mode === 'server') p = this.chain.then(() => api('/records/' + encodeURIComponent(o.id), { method: 'PUT', body: o, headers: opt.import ? { 'X-Import': '1' } : undefined, noRedirect: !!opt.strict }))
      .then(r => { if (r && obj.kind === 'patient') { obj.abiertaEl = r.abiertaEl; obj.cambios = r.cambios; obj.firmasCambios = r.firmasCambios; if (r.consents) obj.consents = r.consents; if (r.cierres) obj.cierres = r.cierres; if (r.intake) obj.intake = r.intake; }
        else if (r && r.folio) { obj.folio = r.folio; if (r.sesion) obj.sesion = r.sesion; } return r; });
    else if (this.col) p = this.chain.then(() => this.col.doc(o.id).set(o));
    else return Promise.resolve();
    this.chain = p.catch(() => { });
    if (opt.strict) return p; // quien llama decide qué hacer si falla
    return p.catch(e => { toast('No se pudo guardar: ' + (e && e.message || 'error')); });
  },
  remove(id) {
    this.localWrite();
    if (S.mode === 'server') {
      this.chain = this.chain.then(() => api('/records/' + encodeURIComponent(id), { method: 'DELETE' })).catch(e => { toast('No se pudo eliminar en el servidor: ' + (e && e.message || 'error')); });
      return this.chain;
    }
    if (!this.col) return Promise.resolve();
    this.chain = this.chain.then(() => this.col.doc(id).delete()).catch(() => { });
    return this.chain;
  }
};

/* ===== Firma manuscrita en canvas ===== */
const pads = {};
function makePad(host, name) {
  host.innerHTML = '<canvas></canvas><div class="hint">Firme aquí con el dedo o el mouse</div>';
  const c = host.firstElementChild, hint = host.lastElementChild;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(240, host.clientWidth), h = 140;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#10222a';
  let drawing = false, empty = true, last = null;
  const pos = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (w / r.width), y: (e.clientY - r.top) * (h / r.height) }; };
  c.addEventListener('pointerdown', e => { drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(last.x + .1, last.y + .1); x.stroke(); empty = false; hint.style.display = 'none'; e.preventDefault(); });
  c.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; e.preventDefault(); });
  const end = () => { drawing = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', end);
  const api = {
    isEmpty: () => empty,
    clear() { x.clearRect(0, 0, w, h); empty = true; hint.style.display = ''; },
    data() {
      const t = document.createElement('canvas'), tw = 360, th = Math.round(h * tw / w);
      t.width = tw; t.height = th; t.getContext('2d').drawImage(c, 0, 0, tw, th);
      return t.toDataURL('image/png');
    }
  };
  pads[name] = api; return api;
}
function mountPads() { $$('[data-pad]').forEach(h => makePad(h, h.dataset.pad)); $$('[data-clear]').forEach(b => b.onclick = () => pads[b.dataset.clear] && pads[b.dataset.clear].clear()); }

/* ===== Valores de formularios ===== */
function readForm(root, obj) { $$('[data-f]', root).forEach(el => { obj[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.type === 'password' ? el.value : el.value.trim(); }); return obj; }
/* Campos numéricos: sin flechas; solo se aceptan dígitos, un signo «-» al inicio y separador decimal. */
document.addEventListener('input', e => { const el = e.target; if (!el || !el.hasAttribute || !el.hasAttribute('data-num')) return; const v = el.value, n = v.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, ''); if (n !== v) el.value = n; });
function F(label, key, val, o = {}) {
  const t = o.type || 'text', cls = 'fld' + (o.wide ? ' wide' : '') + (o.lock ? ' locked' : '');
  const lab = label ? `<label for="f_${key}">${esc(label)}${o.lock ? ' <span class="lockico" title="Dato de identidad: no se puede cambiar">🔒</span>' : ''}${o.age ? ` <span class="agehint" id="age_${key}" aria-live="polite">${ageTxt(val)}</span>` : ''}</label>` : '', aria = (label ? '' : ` aria-label="${esc(o.aria || key)}"`) + (o.lock ? ' disabled' : '');
  if (t === 'area') return `<div class="${cls}">${lab}<textarea id="f_${key}" data-f="${key}" rows="${o.rows || 3}"${aria}>${esc(val)}</textarea>${o.req ? `<div class="nrq">${NR.map(v => `<button type="button" class="btn sm" data-nr="${key}">${v}</button>`).join('')}</div>` : ''}</div>`;
  if (t === 'select') { const opts = val && !o.opts.includes(val) ? o.opts.concat([val]) : o.opts; return `<div class="${cls}">${lab}<select id="f_${key}" data-f="${key}"${aria}>${opts.map(x => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`; }
  return `<div class="${cls}">${lab}<input id="f_${key}" data-f="${key}" type="${t === 'number' ? 'text' : t}"${t === 'number' ? ' inputmode="decimal" data-num="1"' : ''} value="${esc(val)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}${aria}>${o.req && o.nr ? `<div class="nrq">${o.nr.map(v => `<button type="button" class="btn sm" data-nr="${key}">${v}</button>`).join('')}</div>` : ''}</div>`;
}
/* ===== Genograma: lienzo con trazos vectoriales sobre una imagen opcional ===== */
let geno = null;
/* Genograma ya guardado de la pantalla abierta: en la primera vez, el de la ficha; en una pestaña propia, el de su entrada. */
function genoSaved(k = '') {
  const p = curPatient(); if (!p) return '';
  if (String(S.tab).startsWith('x_')) { const v = (p.extras || {})[S.tab], e = Array.isArray(v) ? (v.find(z => S.extraEd && z.id === S.extraEd.id) || {}).v : v; return (e && e[k || 'genograma']) || ''; }
  return (p.intake || {}).genograma || '';
}
/* k = '' para el genograma; con una clave, un apartado de imagen editable (sube una imagen y se dibuja o escribe encima). */
function genoBlock(k = '') {
  const img = !!k, sfx = img ? '_' + k : '', tools = [['pen', 'Lápiz'], ['erase', 'Borrador'], ['sq', 'Hombre'], ['ci', 'Mujer'], ['x', 'Fallecido'], ['tx', 'Texto']].filter(t => !img || ['pen', 'erase', 'tx'].includes(t[0]));
  return `<div class="genowrap" id="genoblock${sfx}" data-gk="${k}"><span class="lbl">${img ? 'Imagen' : 'Genograma'}</span>
  <div class="row" id="genotools${sfx}">${tools.map(([k, l]) => `<button type="button" class="btn sm${k === 'pen' ? ' on' : ''}" data-gt="${k}" aria-pressed="${k === 'pen'}">${l}</button>`).join('')}
  <input type="text" id="geno_text${sfx}" placeholder="Nombre o texto a colocar" aria-label="Texto para colocar en el genograma" style="max-width:210px">
  <button type="button" class="btn sm" data-gt="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>↶ Deshacer</button><button type="button" class="btn sm" data-gt="redo" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled>↷ Rehacer</button><button type="button" class="btn sm" data-gt="clear">Limpiar</button>${img ? '' : `<label class="check" style="font-size:13px"><input type="checkbox" id="geno_straight${sfx}" checked> <span>Enderezar líneas</span></label><label class="check" style="font-size:13px"><input type="checkbox" id="geno_grid${sfx}" checked> <span>Cuadrícula</span></label>`}<button type="button" class="btn sm" data-gt="upload">Subir imagen</button><input type="file" id="geno_file${sfx}" accept="image/*" style="display:none"></div>
  <div class="genobox"><canvas id="genocv${sfx}" aria-label="${img ? 'Lienzo de la imagen' : 'Lienzo del genograma'}"></canvas></div>
  <span style="font-size:12px;color:var(--muted)">${img ? 'Suba una imagen de su computador y escriba o dibuje encima. Para escribir, ponga el texto en la casilla, elija «Texto» y toque el lugar.' : 'Dibuje con el dedo o el mouse, o suba la foto de un genograma hecho a mano y complételo encima. Hombre es un cuadrado, mujer un círculo y fallecido una X que se coloca sobre el símbolo. Para un nombre, escríbalo en la casilla, elija «Texto» y toque el lugar.'}</span></div>`;
}
/* Monta el lienzo de cada bloque de la pantalla: el del genograma (geno) y los de imagen (genos[clave]). */
const genos = {};
function mountGeno() {
  geno = null; Object.keys(genos).forEach(k => delete genos[k]);
  document.querySelectorAll('.genowrap').forEach(b => mountOneGeno(b.dataset.gk || ''));
}
function mountOneGeno(gk) {
  const sfx = gk ? '_' + gk : '', sel = s => s.replace(/#(geno\w*)/g, '#$1' + sfx);
  const $ = (s, r) => (r || document).querySelector(sel(s)), $$ = (s, r) => [...(r || document).querySelectorAll(sel(s))];
  const cv = $('#genocv'); if (!cv) return;
  const W = 1200, H = 720; cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const st = { ops: [], bg: null, tool: 'pen', cur: null, dirty: false, png: true, saved: genoSaved(gk), grid: !gk };
  const G = 40; // separación de la cuadrícula (unidades del lienzo)
  const style = o => { x.strokeStyle = o.t === 'erase' ? '#fff' : '#10222a'; x.fillStyle = '#10222a'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = o.t === 'erase' ? 28 : 3; };
  const drawOp = o => {
    style(o);
    if (o.t === 'pen' || o.t === 'erase') { x.beginPath(); x.moveTo(o.pts[0][0], o.pts[0][1]); o.pts.forEach(p => x.lineTo(p[0] + .01, p[1] + .01)); x.stroke(); }
    else if (o.t === 'sq') x.strokeRect(o.x - 24, o.y - 24, 48, 48);
    else if (o.t === 'ci') { x.beginPath(); x.arc(o.x, o.y, 26, 0, Math.PI * 2); x.stroke(); }
    else if (o.t === 'x') { x.beginPath(); x.moveTo(o.x - 34, o.y - 34); x.lineTo(o.x + 34, o.y + 34); x.moveTo(o.x + 34, o.y - 34); x.lineTo(o.x - 34, o.y + 34); x.stroke(); }
    else if (o.t === 'tx') { x.font = '500 24px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.s, o.x, o.y); }
  };
  const redraw = () => {
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    if (st.bg) { const r = Math.min(W / st.bg.width, H / st.bg.height), w = st.bg.width * r, h = st.bg.height * r; x.drawImage(st.bg, (W - w) / 2, (H - h) / 2, w, h); }
    if (st.grid) { x.fillStyle = '#b9b4cc'; for (let gy = G; gy < H; gy += G) for (let gx = G; gx < W; gx += G) { x.beginPath(); x.arc(gx, gy, 1.6, 0, Math.PI * 2); x.fill(); } }
    st.ops.forEach(drawOp);
  };
  // con la cuadrícula activa, los símbolos y textos se ubican en el punto más cercano
  const snapPt = (px, py) => st.grid ? [Math.min(W - G, Math.max(G, Math.round(px / G) * G)), Math.min(H - G, Math.max(G, Math.round(py / G) * G))] : [px, py];
  const loadImg = (src, done, fail) => { const im = new Image(); im.onload = () => done(im); im.onerror = fail || (() => { }); im.src = src; };
  redraw();
  if (st.saved) { st.png = /^data:image\/png/.test(st.saved); loadImg(st.saved, im => { st.bg = im; redraw(); }); }
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  /* Historial: cada cambio guarda antes una foto del estado; Deshacer y Rehacer van y vuelven entre fotos. */
  const undoS = [], redoS = [];
  const snap = () => ({ ops: st.ops.slice(), bg: st.bg, png: st.png, saved: st.saved, dirty: st.dirty });
  const put = sn => { st.ops = sn.ops.slice(); st.bg = sn.bg; st.png = sn.png; st.saved = sn.saved; st.dirty = sn.dirty; redraw(); };
  const btns = () => { const u = $('#genoblock [data-gt="undo"]'), r = $('#genoblock [data-gt="redo"]'); if (u) u.disabled = !undoS.length; if (r) r.disabled = !redoS.length; };
  const checkpoint = () => { undoS.push(snap()); if (undoS.length > 200) undoS.shift(); redoS.length = 0; S.dirty = true; btns(); };
  const undo = () => { if (!undoS.length) return; redoS.push(snap()); put(undoS.pop()); btns(); };
  const redo = () => { if (!redoS.length) return; undoS.push(snap()); put(redoS.pop()); btns(); };
  const add = o => { checkpoint(); st.ops.push(o); st.dirty = true; drawOp(o); };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); const [px, py] = pos(e);
    if (st.tool === 'pen' || st.tool === 'erase') { st.cur = { t: st.tool, pts: [[px, py]] }; add(st.cur); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ } }
    else if (st.tool === 'tx') { const s = ($('#geno_text').value || '').trim(); if (!s) { toast('Escriba el texto en la casilla y toque el lugar donde va.'); return; } const [sx, sy] = snapPt(px, py); add({ t: 'tx', x: sx, y: sy, s }); }
    else { const [sx, sy] = snapPt(px, py); add({ t: st.tool, x: sx, y: sy }); }
  });
  cv.addEventListener('pointermove', e => {
    if (!st.cur) return; const [px, py] = pos(e), l = st.cur.pts[st.cur.pts.length - 1]; st.cur.pts.push([px, py]);
    style(st.cur); x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(px, py); x.stroke(); e.preventDefault();
  });
  /* Al soltar, un trazo del lápiz se simplifica a segmentos rectos (Ramer-Douglas-Peucker) y los que están
     casi horizontales o verticales se alinean. Si el trazo es una curva de verdad, se deja como está. */
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let mi = 0, md = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > md) { md = d; mi = i; } }
    return md > eps ? rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps)) : [a, b];
  };
  const straighten = o => {
    if (o.t !== 'pen' || o.pts.length < 3 || !$('#geno_straight') || !$('#geno_straight').checked) return false;
    const len = o.pts.reduce((t, p, i) => i ? t + Math.hypot(p[0] - o.pts[i - 1][0], p[1] - o.pts[i - 1][1]) : 0, 0);
    if (len < 25) return false; // un punto o una marca pequeña
    let q = rdp(o.pts, Math.max(8, Math.min(18, len * 0.06)));
    if (q.length > 5) return false; // curva o garabato: se respeta
    q = q.map(p => p.slice());
    for (let i = 1; i < q.length; i++) {
      const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1], ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
      if (ang < 12 || ang > 168) q[i][1] = q[i - 1][1]; else if (Math.abs(ang - 90) < 12) q[i][0] = q[i - 1][0];
    }
    // une tramos que quedaron en la misma recta horizontal o vertical
    q = q.filter((p, i) => i === 0 || i === q.length - 1 || !((q[i - 1][1] === p[1] && p[1] === q[i + 1][1]) || (q[i - 1][0] === p[0] && p[0] === q[i + 1][0])));
    // con cuadrícula, cada tramo horizontal o vertical se alinea con una fila o columna de puntos (sin cambiar su largo)
    if (st.grid) {
      const dir = q.map((p, i) => i ? (p[1] === q[i - 1][1] ? 'h' : p[0] === q[i - 1][0] ? 'v' : '') : '');
      for (let i = 1; i < q.length; i++) {
        if (dir[i] === 'h') { const y = Math.round(q[i][1] / G) * G; q[i][1] = q[i - 1][1] = y; }
        else if (dir[i] === 'v') { const gx = Math.round(q[i][0] / G) * G; q[i][0] = q[i - 1][0] = gx; }
      }
    }
    o.pts = q; return true;
  };
  const end = () => { if (st.cur && straighten(st.cur)) redraw(); st.cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  // Ctrl+Z / Ctrl+Y (o Cmd en Mac) mientras se trabaja en el genograma
  let active = false;
  const onDown = e => { if (!document.body.contains(cv)) { document.removeEventListener('pointerdown', onDown, true); return; } active = !!(e.target.closest && e.target.closest('#genoblock' + sfx)); };
  document.addEventListener('pointerdown', onDown, true);
  const onKey = e => {
    if (!document.body.contains(cv)) { document.removeEventListener('keydown', onKey); return; }
    if (!active || !(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  };
  document.addEventListener('keydown', onKey);
  $('#genoblock').addEventListener('click', e => {
    const b = e.target.closest('[data-gt]'); if (!b) return; const k = b.dataset.gt;
    if (k === 'undo') undo();
    else if (k === 'redo') redo();
    else if (k === 'clear') { if (!st.ops.length && !st.bg) return; checkpoint(); st.ops = []; st.bg = null; st.dirty = true; st.saved = ''; st.png = true; redraw(); toast('Lienzo limpio. Puede recuperarlo con «Deshacer».'); }
    else if (k === 'upload') $('#geno_file').click();
    else { st.tool = k; $$('#genotools [data-gt]').forEach(t => { const on = t.dataset.gt === k; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); }); }
  });
  if ($('#geno_grid')) $('#geno_grid').addEventListener('change', e => { st.grid = e.target.checked; redraw(); });
  $('#geno_file').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Elija un archivo de imagen.'); return; }
    const url = URL.createObjectURL(f);
    loadImg(url, im => { checkpoint(); st.bg = im; st.png = false; st.dirty = true; redraw(); URL.revokeObjectURL(url); toast('Imagen cargada. Puede dibujar encima.'); }, () => { URL.revokeObjectURL(url); toast('No se pudo leer la imagen.'); });
  });
  genos[gk] = {
    ops: () => st.ops,
    data() {
      if (!st.dirty) return st.saved;
      if (!st.bg && !st.ops.length) return '';
      // la cuadrícula es solo una guía: se exporta sin ella
      const g = st.grid; st.grid = false; redraw();
      const out = st.png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88);
      st.grid = g; redraw();
      return out;
    }
  };
  if (!gk) geno = genos[''];
}


/* Ventanas emergentes con el formato de Karute: encabezado fijo (título, «Guardar» y ✕) que no se mueve al desplazar.
   · La ✕ cierra con el botón Cancelar/Cerrar/Volver de la ventana (el «Cerrar» se oculta; Cancelar/Volver se quedan junto a la acción).
   · El «Guardar» principal de abajo recibe una copia en el encabezado: solo pulsa el original (sin id ni data-*), así no cambia ninguna lógica. */
(() => {
  const DISMISS = /^(cancelar|cerrar|volver|salir)\b/i;
  const run = () => document.querySelectorAll('.modal > .box:not(.idle):not(#apform)').forEach(box => {
    const hd = box.querySelector(':scope > .row:first-child');
    const hasHd = !!(hd && hd.querySelector(':scope > h3, :scope > div > h3'));
    const btns = () => [...box.querySelectorAll('button')].filter(b => DISMISS.test(b.textContent.trim()) && !b.classList.contains('mx'));
    if (btns().length && !box.querySelector(':scope > .mx, :scope > .row:first-child > .mx')) {
      const x = document.createElement('button'); x.type = 'button'; x.className = 'apx mx'; x.setAttribute('aria-label', 'Cerrar'); x.textContent = '✕';
      x.onclick = () => { const b = btns()[0]; if (b) b.click(); };
      (hasHd ? hd : box).appendChild(x);
    }
    btns().forEach(b => { if (/^cerrar/i.test(b.textContent.trim())) b.style.display = 'none'; });
    if (box.querySelector('.topsave, .mfhead .btn.pri')) return;
    const b = [...box.querySelectorAll('button.btn.pri:not(.sm):not([type=submit])')].find(e => /^Guardar/.test(e.textContent.trim()));
    if (!b) return;
    const t = document.createElement('button'); t.type = 'button'; t.className = 'btn pri sm topsave'; t.textContent = b.textContent.trim();
    t.onclick = () => b.click();
    const sync = () => { t.disabled = b.disabled; };
    sync(); new MutationObserver(sync).observe(b, { attributes: true, attributeFilter: ['disabled'] });
    if (hasHd) hd.insertBefore(t, hd.querySelector(':scope > .mx'));
    else { const bar = document.createElement('div'); bar.className = 'row end topsave'; bar.appendChild(t); box.insertBefore(bar, box.firstChild); }
  });
  let q = 0;
  new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; run(); }); }).observe(document.documentElement, { childList: true, subtree: true });
})();
