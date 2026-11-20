/* Empresa: el administrador de una empresa tiene dos vistas. «Terapeuta» es la app de siempre con sus propios consultantes; «Administrador» (S.view === 'empresa')
   usa la misma pantalla de la app: a la izquierda los terapeutas (como la lista de consultantes) y a la derecha, de cada uno, Datos, Agenda, Finanzas y
   Notas; sin elegir a nadie, el resumen de toda la empresa. Desde ahí puedes «trabajar en nombre» de un
   terapeuta (S.actuar): ve y edita su agenda, pagos y datos de consultantes como lo haría su equipo. Parte de app.html. */
const EMPRESA_ADMIN = () => !!(S.user && S.user.companyAdmin);
/* Apoyo administrativo de la empresa: ve la vista de administrador, solo en las secciones que el administrador le deja (S.user.secPermisos). */
const EMPRESA_SEC = () => !!(S.user && S.user.companySecretary);
const SECP = k => !EMPRESA_SEC() || !S.user.secPermisos || S.user.secPermisos[k] !== false;
const empMoney = n => '$' + Number(n || 0).toLocaleString('es-CO');
const empISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const empChip = (t, c) => `<span class="chip ${c || ''}">${esc(t)}</span>`;
const empFold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const EMP_TAB_NOM = { datos: 'Datos', agenda: 'Agenda', consultantes: 'Pacientes', fin: 'Finanzas', stats: 'Estadísticas', notas: 'Notas' };
/* sel: null (resumen de la empresa), el id de un terapeuta o 'nuevo'. */
const EMP = { sec: 'pros', sel: null, tab: 'datos', data: {}, filtro: {}, cargando: false, error: '', q: '', cerrados: new Set(['arch']), cons: null, ctab: 'agenda' };
EMP.finEmb = null; EMP.finListo = null; EMP.finSel = null;  // finEmb: terapeuta cuyas finanzas normales se muestran dentro de la vista de empresa
const empPro = () => ((EMP.data.pros || {}).profesionales || []).find(u => u.id === EMP.sel) || null;
const EMP_SECS = [['pros', 'Profesionales'], ['agenda', 'Agenda'], ['cons', 'Consultorios'], ['fin', 'Finanzas'], ['stats', 'Estadísticas'], ['notas', 'Notas']];
const EMP_NAV_ICO = { pros: 'patients', agenda: 'agenda', cons: 'consultorios', fin: 'finanzas', stats: 'estadisticas', notas: 'cuaderno' };
/* En celular (≤640 px) van abajo Terapeutas, Agenda, Finanzas y «Más»; el resto sale en una hoja que abre «Más». En escritorio se ven las 7 en su orden (order). */
const empPrimera = () => (EMP_SECS.find(([k]) => SECP(k)) || EMP_SECS[0])[0];
const empNavHTML = () => {
  const btn = ([k, n], i) => `<button class="${EMP.sec === k ? 'on' : ''}" style="order:${i + 1}" data-act="empSec" data-s="${k}">${NAV_ICO[EMP_NAV_ICO[k]]}<span>${n}</span></button>`;
  const extra = ['cons', 'stats', 'notas'], todas = EMP_SECS.map((x, i) => [x, i]).filter(([x]) => SECP(x[0]));
  return todas.filter(([x]) => !extra.includes(x[0])).map(([x, i]) => btn(x, i)).join('')
    + `<button class="mas${extra.includes(EMP.sec) ? ' on' : ''}" style="order:99" data-act="empMas" aria-haspopup="true">${NAV_ICO.mas}<span>Más</span></button>`
    + `<div class="massheet">${todas.filter(([x]) => extra.includes(x[0])).map(([x, i]) => btn(x, i)).join('')}</div>`;
};
ACT.empMas = b => { const n = b.closest('.nav'); n.classList.toggle('abierto'); };

function empRango(tab) {
  const f = EMP.filtro[tab], hoy = new Date();
  if (f) return f;
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1), fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  if (tab === 'fin') return { desde: empISO(ini), hasta: empISO(fin) };
  if (tab === 'stats') return { desde: empISO(new Date(hoy.getTime() - 89 * 864e5)), hasta: empISO(hoy) };
  return { desde: empISO(hoy), hasta: empISO(new Date(hoy.getTime() + 14 * 864e5)) };
}

/* Carga la lista de terapeutas (siempre visible) y lo que pide la pestaña actual; luego vuelve a dibujar. */
/* Finanzas normales de un terapeuta dentro de la vista de empresa: se cargan sus datos en nombre suyo (mientras se ven) y se sueltan al salir. */
async function empFinEmbed(id) {
  const u = ((EMP.data.pros || {}).profesionales || []).find(x => x.id === id); if (!u) return;
  S.actuar = { id, name: u.name }; EMP.finEmb = id; EMP.finListo = null;
  try { await Store.load(); EMP.finListo = id; } catch (e) { S.actuar = null; EMP.finEmb = null; EMP.error = e.message; }
}
async function empFinOff() {
  EMP.finEmb = null; EMP.finListo = null; if (!S.actuar) return;
  S.actuar = null; S.pid = null; try { await Store.load(); } catch (e) { /* el administrador no tiene datos propios */ }
}
/* Dibuja sin borrar las fechas que la persona alcanzó a escribir en el filtro (una carga que termina justo entonces las perdía). */
function empRender() {
  const d = $('#emp_desde'), h = $('#emp_hasta'), v = d && h ? [d.value, h.value] : null;
  render();
  if (v) { const d2 = $('#emp_desde'), h2 = $('#emp_hasta'); if (d2 && h2 && v[0] && v[1]) { d2.value = v[0]; h2.value = v[1]; } }
}
async function empLoad(forzar) {
  const t = EMP.tab; EMP.error = ''; EMP.cargando = true;
  const mi = (EMP.seq = (EMP.seq || 0) + 1), vigente = () => EMP.seq === mi;  // si se pide otra carga (otro rango, otra pestaña) mientras esta viaja, la respuesta vieja no pisa a la nueva
  const quiere = t === 'fin' && EMP.sec === 'pros' ? (typeof EMP.sel === 'number' ? EMP.sel : null) : t === 'fin' ? EMP.finSel : null;
  if (S.actuar && EMP.finEmb && EMP.finEmb !== quiere) await empFinOff();
  try {
    if (quiere && EMP.finEmb !== quiere) { if (!EMP.data.pros) EMP.data.pros = (await api('/empresa')).empresa; await empFinEmbed(quiere); }
    if (forzar || !EMP.data.pros) EMP.data.pros = (await api('/empresa')).empresa;
    if (t === 'agenda') { try { EMP.data.cons = await api('/empresa/consultorios'); } catch (e) { /* sin consultorios: no se marcan */ } }  // para marcar las horas con consultorio libre
    if (t === 'cons') { EMP.data.cons = await api('/empresa/consultorios'); const r = agRango(); const ag = await api(`/empresa/agenda?desde=${r.desde}&hasta=${r.hasta}&tz=${new Date().getTimezoneOffset()}`); if (vigente()) EMP.data.agenda = ag; }
    else if (t === 'pacientes') EMP.data.pacientes = await api('/empresa/pacientes');
    else if (t === 'notas') EMP.data.notas = await api('/empresa/notas');
    else if (t !== 'datos') { const r = t === 'agenda' ? agRango() : empRango(t), q = `?desde=${r.desde}&hasta=${r.hasta}&tz=${new Date().getTimezoneOffset()}`; const res = await api('/empresa/' + ({ agenda: 'agenda', fin: 'finanzas', stats: 'estadisticas' })[t] + q); if (vigente()) EMP.data[t] = res; }
  } catch (e) { if (vigente()) EMP.error = e.message; }
  if (!vigente()) return;  // otra carga más reciente ya está en camino y es la que dibuja
  EMP.cargando = false;
  if (S.view === 'empresa') empRender();
  empPrefetch();
}
/* Al entrar, las demás pestañas se cargan en segundo plano (una tras otra) para que al abrirlas ya estén listas; si el usuario está justo en una que llega, se dibuja. */
let EMP_PREF = null;
async function empPrefetch() {
  const d = EMP.data; if (EMP_PREF === d || !d.pros || !EMPRESA_ADMIN()) return; EMP_PREF = d;
  const permitido = k => SECP(k);
  const tz = '&tz=' + new Date().getTimezoneOffset(), ag = () => { const r = agRango(); return `?desde=${r.desde}&hasta=${r.hasta}${tz}`; };
  const tareas = [['agenda', () => api('/empresa/agenda' + ag())], ['fin', () => api('/empresa/finanzas' + `?desde=${empRango('fin').desde}&hasta=${empRango('fin').hasta}${tz}`)],
    ['stats', () => api('/empresa/estadisticas' + `?desde=${empRango('stats').desde}&hasta=${empRango('stats').hasta}${tz}`)],
    ['cons', () => api('/empresa/consultorios')], ['notas', () => api('/empresa/notas')]];
  for (const [k, f] of tareas) {
    if (EMP.data !== d) return;
    if (d[k] || !permitido(k)) continue;
    try { const r = await f(); if (EMP.data !== d || d[k]) continue; d[k] = r; /* si la pestaña ya se está cargando, ella misma dibuja */ if (S.view === 'empresa' && !EMP.cargando && (EMP.tab === k || EMP.sec === k)) empRender(); } catch (e) { /* se pedirá al abrir la pestaña */ }
  }
}
/* Barra superior: Terapeutas (lista + panel de cada uno) o Agenda / Finanzas / Estadísticas / Notas de toda la empresa. */
ACT.empSec = async b => { await ntLeave(); NT.sel = null; NT.draft = null; const k = b.dataset.s; EMP.sec = k; EMP.sel = null; EMP.cons = null; EMP.tab = k === 'pros' ? 'datos' : k; render(); if (k !== 'pros' || EMP.finEmb) empLoad(); scrollTo(0, 0); };
ACT.empSel = async b => { await ntLeave(); NT.sel = null; NT.draft = null; const id = b.dataset.id; EMP.sec = 'pros'; EMP.sel = id ? +id : null; EMP.tab = 'datos'; render(); empLoad(); scrollTo(0, 0); };
ACT.empNuevo = () => { EMP.sec = 'pros'; EMP.sel = 'nuevo'; EMP.tab = 'datos'; render(); if (EMP.finEmb) empLoad(); scrollTo(0, 0); };
ACT.empFinPro = b => { EMP.finSel = b.dataset.id ? +b.dataset.id : null; render(); empLoad(); };
ACT.empTab = async b => { await ntLeave(); NT.sel = null; NT.draft = null; EMP.tab = b.dataset.t; render(); empLoad(); };
ACT.empVer = () => {
  const d = $('#emp_desde'), h = $('#emp_hasta'); if (!d || !h || !d.value || !h.value) { toast('Elige las dos fechas.'); return; }
  if (d.value > h.value) { toast('La fecha inicial no puede ser posterior a la final.'); return; }
  EMP.filtro[EMP.tab] = { desde: d.value, hasta: h.value }; empLoad();
};

/* Terapeutas: crear, activar, restablecer la clave, sacar de la empresa y trabajar en su nombre. */
ACT.empNuevoPro = async () => {
  const b = { name: $('#f_emp_n').value.trim(), email: $('#f_emp_e').value.trim() };
  if (!b.name || !b.email) { toast('Escribe el nombre y el correo.'); return; }
  try { const r = await api('/empresa/profesionales', { method: 'POST', body: b }); toast(r.correoEnviado ? 'Profesional creado. Le enviamos un correo para confirmar su acceso.' : 'Profesional creado, pero el envío de correos no está disponible: no podrá ingresar hasta que Alter-Karute lo habilite.'); EMP.sel = r.id; EMP.tab = 'datos'; await empLoad(true); }
  catch (e) { toast(e.message); }
};
ACT.empPro = async b => {
  const id = b.dataset.id, k = b.dataset.k, body = {};
  if (k === 'toggle') body.active = b.dataset.active !== '1';
  else if (k === 'archivar') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: archivar'; return; } body.archivar = true; }
  else if (k === 'desarchivar') body.archivar = false;
  try {
    if (k === 'correo') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: enviar correo'; return; } await api('/empresa/profesionales/' + id + '/restablecer', { method: 'POST' }); toast('Le enviamos al terapeuta un correo para elegir una nueva contraseña.'); return; }
    await api('/empresa/profesionales/' + id, { method: 'PATCH', body }); toast('Listo.'); await empLoad(true);
  }
  catch (e) { toast(e.message); }
};
ACT.empActuar = async b => {
  EMP.finEmb = null; EMP.finListo = null;
  S.actuar = { id: +b.dataset.id, name: b.dataset.name }; S.pid = null; S.draft = false; S.view = ['patients', 'agenda', 'finanzas'].includes(b.dataset.v) ? b.dataset.v : 'agenda'; S.loading = true;
  try { await Store.load(); } catch (e) { S.actuar = null; toast(e.message); }
  S.loading = false; render();
};
ACT.empSalir = async () => {
  EMP.finEmb = null; EMP.finListo = null;
  const id = S.actuar && S.actuar.id; S.actuar = null; S.pid = null; S.draft = false; S.view = 'empresa'; EMP.sec = id ? 'pros' : 'agenda'; EMP.sel = id || null; EMP.tab = id ? 'datos' : 'agenda';
  try { await Store.load(); } catch (e) { toast(e.message); }
  render(); empLoad();
};

/* ===== Lista de la izquierda: igual que la de consultantes (resumen arriba, grupos plegables, filas con nombre y detalle) ===== */
const EMP_ICO_CASA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/></svg>';
const EMP_ICO_PERSONA = '<svg class="dot" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';
function empRowHTML(u) {
  return `<button class="prow ${u.id === EMP.sel ? 'on' : ''}" data-act="empSel" data-id="${u.id}">${EMP_ICO_PERSONA}<span><div class="nm">${esc(u.name)}${u.active ? '' : ' ' + empChip('Inactiva', 'danger')}</div><div class="sub">${esc(u.email)}${u.ultimoIngreso ? ' · ingresó ' + esc(fmtD(u.ultimoIngreso).replace(/ de /g, ' ')) : ' · nunca ha ingresado'}</div></span></button>`;
}
function empRowsHTML() {
  const e = EMP.data.pros; if (!e) return '<p class="stnote" style="padding:0 10px">Cargando…</p>';
  const ps = (e.profesionales || []).filter(u => !EMP.q || empFold(u.name + ' ' + u.email + ' ' + (u.equipo || []).map(m => m.name + ' ' + m.email).join(' ')).includes(empFold(EMP.q)));
  const ord = (a, b) => (b.ultimoIngreso || '').localeCompare(a.ultimoIngreso || '') || a.name.localeCompare(b.name, 'es');
  const pros = ps.filter(u => !u.admin && !u.archivado).sort(ord), arch = ps.filter(u => u.archivado).sort(ord);
  const grupo = (id, titulo, arr) => arr.length ? `<details class="pgroup" data-g="emp-${id}" ${EMP.cerrados.has(id) && !EMP.q ? '' : 'open'}><summary><span>${titulo}</span><span class="cnt">${arr.length}</span></summary>${arr.map(empRowHTML).join('')}</details>` : '';
  return (grupo('con', 'Con suscripción', pros.filter(u => u.suscripcion && u.suscripcion.activa)) + grupo('sin', 'Sin suscripción', pros.filter(u => !(u.suscripcion && u.suscripcion.activa)))
    + grupo('adm', 'Administración', ps.filter(u => u.admin)) + grupo('arch', 'Profesionales archivados', arch)) || '<p class="stnote" style="padding:0 10px">Ningún terapeuta coincide con la búsqueda.</p>';
}
function empListHTML() {
  const e = EMP.data.pros, n = e ? (e.profesionales || []).filter(u => !u.admin && !u.archivado).length : 0;
  return `<div class="panel plist"><div class="plist-head"><span>Terapeutas${e ? ' - ' + esc(e.name) : ''}</span><span>${n}</span></div>
  <div style="padding:8px 10px"><input type="search" id="emp_q" value="${esc(EMP.q)}" placeholder="Buscar por nombre o correo" aria-label="Buscar profesionales" style="width:100%"></div>
  <div id="emp_rows">${empRowsHTML()}</div></div>`;
}
/* El buscador solo redibuja las filas (no pierde el foco); los grupos plegados se recuerdan sin tocar las preferencias de la lista de consultantes. */
document.addEventListener('input', e => { if (e.target.id !== 'emp_q') return; EMP.q = e.target.value.trim(); const l = $('#emp_rows'); if (l) l.innerHTML = empRowsHTML(); });
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.matches || !d.matches('details.pgroup') || !$('#emp_rows') || !$('#emp_rows').contains(d)) return;
  e.stopPropagation();  // la lista de consultantes guarda sus propios grupos abiertos: estos no van allí
  const g = d.dataset.g.replace(/^emp-/, ''); if (EMP.q) return; if (d.open) EMP.cerrados.delete(g); else EMP.cerrados.add(g);
}, true);

/* ===== Panel de la derecha ===== */
function empFiltroHTML() {
  const r = empRango(EMP.tab);
  return `<div class="row" style="flex-wrap:wrap;align-items:flex-end"><div class="fld"><label for="emp_desde">Desde</label><input type="date" id="emp_desde" value="${r.desde}"></div><div class="fld"><label for="emp_hasta">Hasta</label><input type="date" id="emp_hasta" value="${r.hasta}"></div><button class="btn" data-act="empVer">Ver</button></div>${EMP.tab === 'fin' || EMP.tab === 'stats' ? empPresetsHTML() : ''}`;
}
const empAbrir = (u, v, t) => `<button class="btn sm pri" data-act="empActuar" data-id="${u.id}" data-name="${esc(u.name)}" data-v="${v}">${t}</button>`;
const empPrueba = () => { const p = (EMP.data.pros || {}).prueba; return p && p.activa ? p : null; };
/* Permisos propios de un terapeuta: sobre el general de «Mi cuenta». Valores: '' = como el general, '1' = permitir, '0' = no permitir. */
function empColorHTML(u) {  // color del terapeuta en la agenda: lo fija el administrador; sin elegir, es automático
  const act = (u.color || '').toUpperCase();
  return `<h3 style="margin:14px 0 6px">Color en la agenda</h3><div class="row" role="group" aria-label="Color de ${esc(u.name.split(' ')[0])} en la agenda" style="gap:8px;flex-wrap:wrap;align-items:center">`
    + AG_COLORES.map(c => `<button type="button" class="agsw${act === c.toUpperCase() ? ' on' : ''}" data-emp-color="${c}" data-id="${u.id}" aria-label="Color ${c}" aria-pressed="${act === c.toUpperCase()}" style="width:26px;height:26px;border-radius:50%;border:2px solid ${act === c.toUpperCase() ? 'var(--ink)' : 'transparent'};background:${c};cursor:pointer;padding:0"></button>`).join('')
    + `<input type="color" data-emp-color-libre data-id="${u.id}" value="${act || agColor(u)}" aria-label="Otro color" style="width:34px;height:28px;padding:0;border:0;background:none;cursor:pointer"><button type="button" class="btn sm" data-emp-color="" data-id="${u.id}"${act ? '' : ' disabled'}>Automático</button></div>`;
}
document.addEventListener('click', async e => {
  const el = e.target.closest && e.target.closest('[data-emp-color]'); if (!el) return;
  try { await api('/empresa/profesionales/' + el.dataset.id, { method: 'PATCH', body: { color: el.dataset.empColor } }); toast('Color guardado.'); await empLoad(true); }
  catch (err) { toast(err.message); }
});
document.addEventListener('change', async e => {
  const el = e.target.closest && e.target.closest('[data-emp-color-libre]'); if (!el) return;
  try { await api('/empresa/profesionales/' + el.dataset.id, { method: 'PATCH', body: { color: el.value } }); toast('Color guardado.'); await empLoad(true); }
  catch (err) { toast(err.message); }
});
function empPermProHTML(u) {
  const gen = ((EMP.data.pros || {}).permisos) || {}, pro = u.permisosPro || {};
  const fila = ([k, t]) => { const v = pro[k] === true ? '1' : pro[k] === false ? '0' : ''; return `<div class="fld"><label for="emp_pp_${k}_${u.id}">${t}</label><select id="emp_pp_${k}_${u.id}" data-emp-perm="${k}" data-id="${u.id}"><option value="" ${v === '' ? 'selected' : ''}>Como el general (${gen[k] === false ? 'no permitido' : 'permitido'})</option><option value="1" ${v === '1' ? 'selected' : ''}>Permitir</option><option value="0" ${v === '0' ? 'selected' : ''}>No permitir</option></select></div>`; };
  return `<h3 style="margin:14px 0 6px">Permisos de ${esc(u.name.split(' ')[0])}</h3><div class="grid">${[['citas', 'Crear, mover y cancelar citas (y recibir reservas)'], ['pagos', 'Gestionar cobros y pagos']].map(fila).join('')}</div><p class="ts" style="margin:0">Aplican solo a este terapeuta y a su equipo; si elige «Como el general», sigue lo que haya en Mi cuenta → Permisos.</p>`;
}
document.addEventListener('change', async e => {
  const el = e.target.closest && e.target.closest('[data-emp-perm]'); if (!el) return;
  try { await api('/empresa/profesionales/' + el.dataset.id, { method: 'PATCH', body: { permisos: { [el.dataset.empPerm]: el.value === '' ? null : el.value === '1' } } }); toast('Permiso guardado.'); await empLoad(true); }
  catch (err) { toast(err.message); }
});
function empDatosHTML(u) {
  const sus = u.suscripcion, eq = u.equipo || [];
  const chips = `${empChip(u.admin ? 'Administrador' : 'Terapeuta', u.admin ? '' : 'warn')}${empChip(u.active ? 'Activa' : 'Inactiva', u.active ? 'ok' : 'danger')}${u.totp ? empChip('2 pasos', 'ok') : ''}`
    + (sus ? (sus.activa ? empChip('Suscrito' + (sus.hasta ? ' hasta ' + new Date(sus.hasta).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''), 'ok') : empChip(sus.hasta ? 'Suscripción vencida' : 'Sin suscripción', 'warn')) : '')
    + (u.cambiarClave ? empChip('Debe cambiar la contraseña', 'warn') : '');
  const html = `<div class="sec"><div class="row" style="flex-wrap:wrap">${chips}</div>
    <p class="ts" style="margin:6px 0">${esc(u.email)} · Último ingreso: ${u.ultimoIngreso ? esc(fmtShort(u.ultimoIngreso)) : 'nunca'}</p>
    ${u.admin ? '<p class="stnote">Es el administrador de la empresa: sus propios consultantes están en la vista terapeuta.</p>' : `
    ${u.archivado ? `<p class="stnote">Terapeuta archivado: no puede ingresar, no aparece en la agenda ni en las reservas, y sus cifras pasadas se conservan.</p><div class="row" style="flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="empPro" data-k="desarchivar" data-id="${u.id}">Reactivar terapeuta</button></div>` : `
    ${u.active ? `<div class="row" style="flex-wrap:wrap"><span class="ts">Trabajar en su nombre:</span>${empAbrir(u, 'patients', 'Datos de sus pacientes')}${empAbrir(u, 'agenda', 'Agenda')}${empAbrir(u, 'finanzas', 'Finanzas')}</div>` : ''}
    <div class="row" style="flex-wrap:wrap;margin-top:8px"><button class="btn sm" data-act="empPro" data-k="toggle" data-id="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'Desactivar' : 'Reactivar'}</button>${u.active ? `<button class="btn sm" data-act="empPro" data-k="correo" data-id="${u.id}">Enviar correo para restablecer contraseña</button>` : ''}<button class="btn sm warn" data-act="empPro" data-k="archivar" data-id="${u.id}">Archivar</button></div>`}`}
    ${empColorHTML(u)}
    ${empPermProHTML(u)}
    ${eq.length ? `<h3 style="margin:14px 0 6px">Equipo de ${esc(u.name.split(' ')[0])} (${eq.length})</h3>${eq.map(m => `<div class="card usub"><div class="row" style="justify-content:space-between"><span><b>${esc(m.name)}</b><br><span class="ts">${esc(m.email)}</span></span><span class="row">${empChip('Equipo')}${empChip(m.active ? 'Activa' : 'Inactiva', m.active ? 'ok' : 'danger')}</span></div></div>`).join('')}` : ''}</div>`;
  const pr = empPrueba();
  return pr ? html.replace(/data-act="empPro"/g, 'data-act="empPro" disabled').replace('<div class="sec">', `<div class="sec"><p class="stnote">Plan de prueba: este terapeuta no se puede modificar (desactivar, archivar ni enviarle el correo de contraseña) hasta que se suscriba.</p>`) : html;
}
function empNuevoHTML() {
  const pr = empPrueba(), n = ((EMP.data.pros || {}).profesionales || []).filter(u => !u.archivado).length;
  if (pr && n >= pr.max) return `<div class="sec"><h3>Nuevo terapeuta</h3><p class="stnote">El plan de prueba permite crear ${pr.max} terapeutas y ya los creó. Suscríbase en «Mi suscripción» para agregar más.</p></div>`;
  return `<div class="sec"><h3>Nuevo terapeuta</h3><div class="grid">${F('Nombre', 'emp_n', '')}${F('Correo', 'emp_e', '', { type: 'email' })}</div>
    <div class="row"><button class="btn pri" data-act="empNuevoPro">Crear terapeuta</button></div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Le enviaremos un correo para que confirme su acceso al equipo y elige su contraseña. Cada terapeuta ve únicamente sus propios consultantes e fichas; tú ves y gestionas sus datos de consultantes, su agenda y sus finanzas, y las fechas de los documentos que firma, nunca lo que escribe en ellos. Cada terapeuta tiene su propia suscripción.</p></div>`;
}
function empAgendaHTML(u) {
  const L = EMP.data.agenda; if (!L) return '';
  return agGridHTML(L, u) + (u && u.active && !u.admin ? `<div class="row" style="margin-top:10px">${empAbrir(u, 'agenda', 'Abrir su agenda')}</div>` : '');
}
function empPacientesHTML(u) {
  const L = EMP.data.pacientes; if (!L) return '';
  const f = L.filter(p => p.proId === u.id), dia = x => x ? esc(fmtShort(x)) : '—';
  return `<div class="sec">${f.length ? `<table class="sttab"><thead><tr><th>Consultante</th><th>Documento</th><th>Citas atendidas</th><th>Citas con evolución</th><th>Última atención</th><th>Próxima cita</th></tr></thead><tbody>${f.map(p => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.documento || '—')}</td><td>${p.atendidas}</td><td>${p.conEvolucion || 0}</td><td>${dia(p.ultima)}</td><td>${dia(p.proxima)}</td></tr>`).join('')}</tbody></table>` : '<p class="stnote">Este terapeuta aún no tiene consultantes.</p>'}
    <p style="margin:0;font-size:13px;color:var(--muted)">Solo se muestran la identificación del consultante y las fechas de sus citas. La ficha es confidencial y únicamente la ve el terapeuta.</p></div>`;
}
/* ===== Piezas visuales compartidas por Finanzas y Estadísticas ===== */
const empN = n => Number(n || 0).toLocaleString('es-CO');
const empPct = (a, b) => b ? Math.round(100 * a / b) : 0;
const empKpis = L => `<div class="stats empk">${L.map(([t, v, sub, tono, tipo]) => { const in_ = `<span>${esc(t)}</span><b>${v}</b>${sub ? `<em>${esc(sub)}</em>` : ''}`; return tipo ? `<button type="button" class="stat ${tono || ''} click" data-act="empStatDet" data-t="${tipo}" title="Ver quiénes son">${in_}</button>` : `<div class="stat ${tono || ''}">${in_}</div>`; }).join('')}</div>`;
const empVer = (v, tipo, pro) => `<button type="button" class="aplink" data-act="empStatDet" data-t="${tipo}" ${pro ? `data-pro="${pro}"` : ''} title="Ver quiénes son">${v}</button>`;
const empBarras = (L, fmt) => { const mx = Math.max(1, ...L.map(x => x[1])); return L.length ? `<div class="empbars">${L.map(([t, v, extra]) => `<div class="bar"><span class="bl">${esc(t)}</span><span class="bt"><i style="width:${Math.round(100 * v / mx)}%"></i></span><span class="bv">${(fmt || empN)(v)}${extra ? ` · ${esc(extra)}` : ''}</span></div>`).join('')}</div>` : '<p class="stnote">Sin datos en este periodo.</p>'; };
const empEtiqueta = k => k.length === 7 ? new Date(+k.slice(0, 4), +k.slice(5) - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }).replace('.', '') : k.slice(8) + '/' + k.slice(5, 7);
/* Columnas apiladas en SVG: serie = [{k, …campos}], cols = [[campo, color, nombre]]. */
function empColumnas(serie, cols, fmt) {
  if (!serie.length) return '<p class="stnote">Sin datos en este periodo.</p>';
  const W = 640, H = 190, pl = 44, pb = 22, pt = 8, n = serie.length, bw = Math.min(46, (W - pl) / n * .66), paso = (W - pl) / n;
  const mx = Math.max(1, ...serie.map(s => cols.reduce((a, c) => a + (s[c[0]] || 0), 0))), y = v => pt + (H - pb - pt) * (1 - v / mx), cada = Math.ceil(n / 12);
  const f = fmt || empN, guias = [0, .5, 1].map(r => mx * r);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico" style="width:100%;height:auto;display:block">
    ${guias.map(g => `<line x1="${pl}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(g) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(f(Math.round(g)))}</text>`).join('')}
    ${serie.map((s, i) => { let acc = 0; const x = pl + paso * i + (paso - bw) / 2;
      return cols.map(c => { const v = s[c[0]] || 0; if (!v) return ''; const y0 = y(acc + v), h = y(acc) - y0; acc += v; return `<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(1, h)}" rx="2" fill="${c[1]}"><title>${esc(empEtiqueta(s.k) + ' · ' + c[2] + ': ' + f(v))}</title></rect>`; }).join('')
        + (i % cada === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(empEtiqueta(s.k))}</text>` : ''); }).join('')}
  </svg>${cols.length > 1 ? `<div class="emplg">${cols.map(c => `<span><i style="background:${c[1]}"></i>${esc(c[2])}</span>`).join('')}</div>` : ''}`;
}
const empTarjeta = (t, cuerpo, sub) => `<section class="empcard"><h3>${esc(t)}</h3>${sub ? `<p class="ts" style="margin:0 0 8px">${esc(sub)}</p>` : ''}${cuerpo}</section>`;
/* Periodos rápidos para Finanzas y Estadísticas. */
function empPeriodoRango(p) {
  const h = new Date(), mes = (m, f) => ({ desde: empISO(new Date(h.getFullYear(), m, 1)), hasta: empISO(f) });
  if (p === 'mes') return mes(h.getMonth(), new Date(h.getFullYear(), h.getMonth() + 1, 0));
  if (p === 'pasado') return mes(h.getMonth() - 1, new Date(h.getFullYear(), h.getMonth(), 0));
  if (p === '90') return { desde: empISO(new Date(h.getTime() - 89 * 864e5)), hasta: empISO(h) };
  return { desde: empISO(new Date(h.getFullYear(), 0, 1)), hasta: empISO(h) };
}
ACT.empPeriodo = b => { EMP.filtro[EMP.tab] = empPeriodoRango(b.dataset.p); empLoad(); };
const empPresetsHTML = () => `<div class="row empper" style="flex-wrap:wrap">${[['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['90', 'Últimos 90 días'], ['anio', 'Este año']].map(([k, n]) => `<button class="btn sm" data-act="empPeriodo" data-p="${k}">${n}</button>`).join('')}</div>`;

const empFinChips = () => `<div class="row empper" style="flex-wrap:wrap"><span class="ts">Ver:</span><button class="btn sm ${EMP.finSel ? '' : 'pri'}" data-act="empFinPro" data-id="">Resumen de la empresa</button>${agPros().map(x => `<button class="btn sm ${EMP.finSel === x.id ? 'pri' : ''}" data-act="empFinPro" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
function empFinHTML(u) {
  const id = u ? u.id : EMP.finSel;
  if (id) return `<div class="sec empfin">${u ? '' : empFinChips()}${EMP.finListo === id ? finanzasHTML() : '<p class="stnote">Cargando las finanzas…</p>'}</div>`;  // la vista normal de finanzas del terapeuta: citas, cobros y pagos
  const d = EMP.data.fin; if (!d) return '';
  const f = (u ? d.profesionales.filter(o => o.proId === u.id) : d.profesionales).slice().sort((a, b) => b.cobrado - a.cobrado), total = f.reduce((s, o) => s + o.cobrado, 0);
  const sum = k => f.reduce((s, o) => s + (o[k] || 0), 0), cit = k => f.reduce((s, o) => s + (o.citas[k] || 0), 0), pagos = sum('pagos');
  const kp = empKpis([['Cobrado', empMoney(total), 'en el periodo', 'ok'], ['Pagos recibidos', empN(pagos), sum('anulados') ? sum('anulados') + ' anulado' + (sum('anulados') === 1 ? '' : 's') : ''], ['Valor promedio por pago', empMoney(pagos ? Math.round(total / pagos) : 0)],
    ['Citas atendidas', empN(cit('Atendida')), pagos && cit('Atendida') ? empMoney(Math.round(total / cit('Atendida'))) + ' por cita atendida' : ''], ['Inasistencias', empN(cit('No asistió')), empPct(cit('No asistió'), cit('Atendida') + cit('No asistió')) + '% de las citas pasadas', cit('No asistió') ? 'warn' : '']]);
  const por = u ? '' : empTarjeta('Cobrado por profesional', empBarras(f.map(o => [o.proNombre, o.cobrado, empPct(o.cobrado, total) + '%']), empMoney));
  const tabla = `<table class="sttab"><thead><tr>${u ? '' : '<th>Terapeuta</th>'}<th>Citas atendidas</th><th>Inasistencias</th><th>Pagos</th><th>Cobrado</th></tr></thead><tbody>${f.map(o => `<tr>${u ? '' : `<td>${esc(o.proNombre)}</td>`}<td>${o.citas.Atendida || 0}</td><td>${o.citas['No asistió'] || 0}</td><td>${o.pagos}${o.anulados ? ` <span class="ts">(${o.anulados} anulado${o.anulados === 1 ? '' : 's'})</span>` : ''}</td><td><b>${empMoney(o.cobrado)}</b></td></tr>`).join('')}</tbody><tfoot><tr><th colspan="${u ? 3 : 4}">Total cobrado</th><th>${empMoney(total)}</th></tr></tfoot></table>`;
  return `<div class="sec empfin">${u ? '' : empFinChips()}${empFiltroHTML()}${kp}${por}${empTarjeta('Detalle', tabla)}
    ${u && u.active && !u.admin ? `<div class="row">${empAbrir(u, 'finanzas', 'Abrir sus finanzas')}</div>` : u ? '' : '<p style="margin:0;font-size:13px;color:var(--muted)">Para ver el detalle, la cartera o las tarifas de un terapeuta, elígelo en la lista y usa «Abrir sus finanzas». Para más indicadores, ve a «Estadísticas».</p>'}</div>`;
}

/* Quiénes componen una estadística: consultantes, citas o pagos (solo identificación y fechas). */
const EMP_DET = {
  citas: ['Citas del periodo', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Modalidad', 'Estado']], atendidas: ['Citas atendidas', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Modalidad', 'Estado']],
  canceladas: ['Citas canceladas', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Modalidad', 'Estado']], noasistio: ['Citas con inasistencia', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Modalidad', 'Estado']],
  programadas: ['Citas por atender', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Modalidad', 'Estado']], pagos: ['Pagos recibidos', ['Fecha', 'Paciente', 'Documento', 'Profesional', 'Monto', 'Medio']],
  nuevos: ['Pacientes nuevos', ['Paciente', 'Documento', 'Profesional', 'Apertura de historia']], activos: ['Pacientes atendidos o agendados', ['Paciente', 'Documento', 'Profesional', 'Citas']],
  recurrentes: ['Pacientes recurrentes', ['Paciente', 'Documento', 'Profesional', 'Citas atendidas']], sinvolver: ['Pacientes que no han vuelto (+60 días)', ['Paciente', 'Documento', 'Profesional', 'Última atención']]
};
ACT.empStatDet = async b => {
  const e = EMP.data.stats, t = b.dataset.t, pro = b.dataset.pro ? +b.dataset.pro : null, root = $('#modal-root'); if (!e || !EMP_DET[t]) return;
  let r; try { r = await api(`/empresa/estadisticas/detalle?tipo=${t}&desde=${e.desde}&hasta=${e.hasta}&tz=${new Date().getTimezoneOffset()}${pro ? '&pro=' + pro : ''}`); } catch (x) { toast(x.message); return; }
  const pn = pro ? (agPros().find(u => u.id === pro) || {}).name : '', dh = x => x ? new Date(x).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—', d = x => x ? esc(fmtShort(x)) : '—';
  const cita = ['citas', 'atendidas', 'canceladas', 'noasistio', 'programadas'].includes(t);
  const fila = f => '<tr>' + (cita ? `<td>${esc(dh(f.fecha))}</td><td>${esc(f.paciente)}</td><td>${esc(f.documento || '—')}</td><td>${esc(f.pro)}</td><td>${esc(f.a || '—')}</td><td>${esc(f.b)}</td>`
    : t === 'pagos' ? `<td>${d(f.fecha)}</td><td>${esc(f.paciente)}</td><td>${esc(f.documento || '—')}</td><td>${esc(f.pro)}</td><td>${empMoney(f.a)}</td><td>${esc(f.b || '—')}</td>`
    : `<td>${esc(f.paciente)}</td><td>${esc(f.documento || '—')}</td><td>${esc(f.pro)}</td><td>${t === 'nuevos' || t === 'sinvolver' ? d(f.fecha) : f.a}</td>`) + '</tr>';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(EMP_DET[t][0])}"><div class="box notop" style="width:min(860px,100%);max-height:90vh;display:flex;flex-direction:column"><div class="row" style="justify-content:space-between"><h3>${esc(EMP_DET[t][0])}${pn ? ' · ' + esc(pn) : ''}</h3><button class="btn sm mx" id="sd_x" aria-label="Cerrar">✕</button></div>
    <p class="ts" style="margin:0 0 8px">${esc(fmtShort(e.desde))} a ${esc(fmtShort(e.hasta))} · ${r.total} ${r.total === 1 ? 'registro' : 'registros'}${r.total > r.filas.length ? ` (se muestran ${r.filas.length})` : ''}</p>
    <div style="overflow:auto">${r.filas.length ? `<table class="sttab"><thead><tr>${EMP_DET[t][1].map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${r.filas.map(fila).join('')}</tbody></table>` : '<p class="stnote">No hay registros.</p>'}</div>
    <div class="row end"><button class="btn" id="sd_c">Cerrar</button></div></div></div>`;
  $('#sd_x').onclick = $('#sd_c').onclick = () => { root.innerHTML = ''; };
};
function empStatsHTML() {
  const e = EMP.data.stats; if (!e) return '';
  const P = e.profesionales.slice().sort((a, b) => b.citas.Atendida - a.citas.Atendida), mod = {};
  P.forEach(p => Object.entries(p.modalidad).forEach(([k, v]) => { mod[k] = (mod[k] || 0) + v; }));
  const nom = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], lapso = e.agrupa === 'mes' ? 'por mes' : 'por semana (lunes)';
  const fr = Object.entries(e.franjas).map(([h, v]) => [String(h).padStart(2, '0') + ':00', v]);
  const kp1 = empKpis([['Citas en el periodo', empN(e.totalCitas), empN(e.citas.Programada) + ' por atender', '', 'citas'], ['Atendidas', empN(e.citas.Atendida), empN(e.horasAtendidas) + ' h atendidas', 'ok', 'atendidas'], ['Cancelaciones', e.tasaCancelacion + '%', empN(e.citas.Cancelada) + ' citas', e.tasaCancelacion >= 20 ? 'warn' : '', 'canceladas'], ['Inasistencias', e.tasaInasistencia + '%', empN(e.citas['No asistió']) + ' citas', e.tasaInasistencia >= 15 ? 'warn' : '', 'noasistio']]);
  const kp2 = empKpis([['Pacientes atendidos o agendados', empN(e.pacientesActivos), '', '', 'activos'], ['Pacientes nuevos', empN(e.nuevos), 'abrieron ficha en el periodo', '', 'nuevos'], ['Pacientes recurrentes', empN(e.recurrentes), '2 o más citas atendidas', '', 'recurrentes'], ['Sin volver (+60 días)', empN(e.sinVolver), 'sin cita próxima', e.sinVolver ? 'warn' : '', 'sinvolver']]);
  const kp3 = empKpis([['Cobrado', empMoney(e.cobrado), empN(e.pagos) + ' pagos', 'ok', 'pagos'], ['Valor promedio por pago', empMoney(e.ticket)], ['Cobrado por hora atendida', empMoney(e.horasAtendidas ? Math.round(e.cobrado / e.horasAtendidas) : 0)], ['Horas agendadas', empN(e.horasAgendadas), 'sin contar canceladas']]);
  const tabla = `<table class="sttab"><thead><tr><th>Terapeuta</th><th>Atendidas</th><th>Canceladas</th><th>No asistió</th><th>Horas atendidas</th><th>Consultantes</th><th>Nuevos</th><th>Cobrado</th></tr></thead><tbody>${P.map(p => `<tr><td>${esc(p.proNombre)}</td><td>${empVer(p.citas.Atendida, 'atendidas', p.proId)}</td><td>${empVer(p.citas.Cancelada, 'canceladas', p.proId)}</td><td>${empVer(p.citas['No asistió'], 'noasistio', p.proId)}</td><td>${empN(p.horasAtendidas)}</td><td>${empVer(p.pacientesActivos, 'activos', p.proId)}</td><td>${empVer(p.nuevos, 'nuevos', p.proId)}</td><td>${empVer('<b>' + empMoney(p.cobrado) + '</b>', 'pagos', p.proId)}</td></tr>`).join('')}</tbody></table>`;
  const cons = e.consultorios.length ? empTarjeta('Ocupación de consultorios', empBarras(e.consultorios.map(c => [c.name, c.pct == null ? 0 : c.pct, c.pct == null ? 'sin horario' : empN(c.horasUsadas) + ' de ' + empN(c.horasDisponibles) + ' h']), v => v + '%'), 'Horas con cita presencial sobre las horas de su horario.') : '';
  const orig = e.origen.enlace + e.origen.profesional;
  return `<div class="sec empstats">${empFiltroHTML()}
    ${empTarjeta('Citas', kp1 + empColumnas(e.serie, [['atendidas', 'var(--ok)', 'Atendidas'], ['noAsistio', 'var(--warn)', 'No asistió'], ['canceladas', 'var(--danger)', 'Canceladas']]), 'Citas ' + lapso)}
    ${empTarjeta('Pacientes', kp2)}
    ${empTarjeta('Ingresos', kp3 + empColumnas(e.serie, [['cobrado', 'var(--accent)', 'Cobrado']], empMoney), 'Cobrado ' + lapso)}
    ${empTarjeta('Por profesional', tabla)}
    <div class="empgrid">
      ${empTarjeta('Horas por profesional', empBarras(P.map(p => [p.proNombre, p.horasAtendidas, 'de ' + empN(p.horasAgendadas) + ' agendadas']), v => empN(v) + ' h'), 'Atendidas frente a las agendadas (sin canceladas).')}
      ${cons}
      ${empTarjeta('Cobrado por profesional', empBarras(P.slice().sort((a, b) => b.cobrado - a.cobrado).map(p => [p.proNombre, p.cobrado, empPct(p.cobrado, e.cobrado) + '%']), empMoney))}
      ${empTarjeta('Citas por día de la semana', empBarras(nom.map((n, i) => [n, e.diaSemana[i]])))}
      ${empTarjeta('Citas por hora del día', empBarras(fr))}
      ${empTarjeta('Modalidad', empBarras(Object.entries(mod).sort((a, b) => b[1] - a[1])))}
      ${empTarjeta('Cómo llegan las citas', empBarras([['Reservadas por el consultante (enlace)', e.origen.enlace, empPct(e.origen.enlace, orig) + '%'], ['Agendadas por el equipo', e.origen.profesional, empPct(e.origen.profesional, orig) + '%']]))}
      ${empTarjeta('Medios de pago', empBarras(Object.entries(e.medios).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, empPct(v, e.cobrado) + '%']), empMoney))}
    </div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Son cifras agregadas de la empresa: no incluyen nada clínico. «Sin volver» cuenta consultantes cuya última atención fue hace más de 60 días y no tienen cita próxima.</p></div>`;
}
/* Notas privadas del administrador: mismo cuaderno que las notas de proceso de un terapeuta (lista con filtros y grupos a la izquierda, editor a la derecha),
   generales o sobre un terapeuta. Se guardan solas al escribir; nadie más las ve. */
const NT_TIPOS = ['Seguimiento', 'Acuerdo', 'Pendiente', 'Idea', 'Otra'], NT_ESTADOS = ['Abierta', 'En seguimiento', 'Cerrada'];
const NT = { q: '', pro: '', tipo: '', estado: 'abiertas', sel: null, draft: null, open: new Set(), pend: false, timer: null, chain: Promise.resolve() };
const ntSolo = () => EMP.sec === 'pros' && typeof EMP.sel === 'number' ? EMP.sel : null;  // dentro de la ficha de un terapeuta solo se ven sus notas
const ntNombre = id => id ? ((((EMP.data.pros || {}).profesionales || []).find(u => u.id === id) || {}).name || 'Profesional') : 'Notas generales';
const ntCur = () => (EMP.data.notas || []).find(n => n.id === NT.sel) || (NT.draft && NT.draft.id === NT.sel ? NT.draft : null);
function ntFiltered() {
  const solo = ntSolo(), hoy = empISO(new Date()), q = NT.q;
  return (EMP.data.notas || []).filter(n => (solo ? n.proId === solo : !NT.pro || (NT.pro === '_none' ? !n.proId : String(n.proId) === NT.pro)) && (!NT.tipo || n.tipo === NT.tipo)
    && (NT.estado === 'todas' ? true : NT.estado === 'abiertas' ? n.estado !== 'Cerrada' : NT.estado === 'revisar' ? n.revisar && n.revisar <= hoy && n.estado !== 'Cerrada' : n.estado === NT.estado)
    && (!q || fold(q).split(/\s+/).filter(Boolean).every(w => fold([n.titulo, n.tipo, n.texto, (n.etiquetas || []).join(' '), (n.seguimiento || []).map(x => x.texto).join(' '), ntNombre(n.proId)].join(' \n ')).includes(w))));
}
function ntRowHTML(n, hoy) {
  const q = NT.q, due = n.revisar && n.revisar <= hoy && n.estado !== 'Cerrada', all = plainRich([n.texto, ...(n.seguimiento || []).map(x => x.texto)].filter(Boolean).join(' · ')).replace(/\s+/g, ' ').trim();
  return `<button class="pnrow ${n.id === NT.sel ? 'on' : ''}" data-act="empNtOpen" data-id="${n.id}"><span class="tt">${pnMark(n.titulo || 'Sin título', q)}</span>
    <span class="mt"><span class="chip">${esc(n.tipo || 'Otra')}</span>${n.estado === 'Cerrada' ? '<span class="chip warn">Cerrada</span>' : n.estado === 'En seguimiento' ? '<span class="chip ok">En seguimiento</span>' : ''}${n.revisar && n.estado !== 'Cerrada' ? `<span class="chip ${due ? 'due' : ''}">Revisar ${esc(fmtShort(n.revisar))}</span>` : ''}</span>
    <span class="ex">${pnMark(all.slice(0, 180), q) || '<i>Sin texto</i>'}</span><span class="mt">${(n.etiquetas || []).map(t => '#' + pnMark(t, q)).join(' ')}<span>· ${esc(fmtShort(n.editada || n.creada))}</span></span></button>`;
}
function ntListHTML() {
  const L = EMP.data.notas || [], list = ntFiltered(), hoy = empISO(new Date()), q = NT.q;
  if (!L.length) return '<div class="empty" style="padding:24px 16px">Aún no tienes notas. Usa «+ Nueva nota» para anotar un acuerdo, un seguimiento o un pendiente.</div>';
  if (!list.length) return '<div class="empty" style="padding:24px 16px">Ninguna nota coincide con la búsqueda o los filtros.</div>';
  const g = new Map(); list.forEach(n => { const k = n.proId ? String(n.proId) : '_none'; if (!g.has(k)) g.set(k, []); g.get(k).push(n); });
  const groups = [...g.entries()].map(([k, ns]) => ({ k, name: ntNombre(k === '_none' ? null : +k), ns })).sort((a, b) => a.k === '_none' ? -1 : b.k === '_none' ? 1 : a.name.localeCompare(b.name, 'es')), cur = ntCur();
  return groups.map(gr => {
    const due = gr.ns.filter(n => n.revisar && n.revisar <= hoy && n.estado !== 'Cerrada').length, open = NT.open.has(gr.k) || !!q || groups.length === 1 || (cur && String(cur.proId || '_none') === gr.k);
    return `<details class="pngrp" data-g="${esc(gr.k)}" ${open ? 'open' : ''}><summary><span class="gn">${gr.k === '_none' ? '' : '<span class="ico" aria-hidden="true">●</span>'}${pnMark(gr.name, q)}</span><span class="row" style="gap:6px">${due ? `<span class="chip due" title="Notas por revisar">${due} por revisar</span>` : ''}<span class="cnt">${gr.ns.length}</span></span></summary>${gr.ns.map(n => ntRowHTML(n, hoy)).join('')}</details>`;
  }).join('');
}
function ntEditorHTML(n) {
  if (!n) return `<div class="pned"><h3 style="margin:0">Notas</h3><div class="banner" style="margin:0"><b>Son tus notas privadas como administrador.</b> Aquí van acuerdos, seguimientos, pendientes e ideas sobre la empresa o sobre un terapeuta. Los terapeutas y su equipo no las ven, y puedes editarlas y borrarlas cuando quiera.</div>
    <div class="row"><button class="btn pri" data-act="empNtNew">+ Nueva nota</button></div></div>`;
  const solo = ntSolo(), pros = ((EMP.data.pros || {}).profesionales || []).filter(u => !u.admin).slice().sort((a, b) => a.name.localeCompare(b.name, 'es')), segs = (n.seguimiento || []).map((x, i) => [x, i]).reverse(), guardada = (EMP.data.notas || []).includes(n);
  return `<div class="pned" id="ntedit"><div class="row" style="justify-content:space-between"><button class="btn sm back" data-act="empNtBack">← Notas</button><span class="pnstat" id="nt_stat" aria-live="polite">${guardada ? 'Guardada' : 'Nueva: se guarda sola al escribir'}</span></div>
    <input id="nt_t" class="ttl" type="text" value="${esc(n.titulo || '')}" placeholder="Título (ej.: Acuerdo de horarios con Ana)" aria-label="Título de la nota" maxlength="200">
    <div class="grid">${solo ? '' : `<div class="fld"><label for="nt_pro">Sobre</label><select id="nt_pro"><option value="">— Nota general de la empresa —</option>${pros.map(u => `<option value="${u.id}" ${u.id === n.proId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>`}
      <div class="fld"><label for="nt_tipo">Tipo</label><select id="nt_tipo">${NT_TIPOS.map(t => `<option ${t === n.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="nt_estado">Estado</label><select id="nt_estado">${NT_ESTADOS.map(t => `<option ${t === (n.estado || 'Abierta') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="nt_rev">Revisar el (opcional)</label><input id="nt_rev" type="date" value="${esc(n.revisar || '')}"></div></div>
    <div class="fld"><label for="nt_tags">Etiquetas (separadas por coma)</label><input id="nt_tags" type="text" value="${esc((n.etiquetas || []).join(', '))}" placeholder="ej.: horarios, tarifas, evaluación"></div>
    <div class="fld"><label for="nt_txt">Nota</label>${richBar('nt_txt')}<textarea id="nt_txt" rows="12" style="font-family:var(--f-doc);font-size:15px" placeholder="Lo que quiere recordar o acordar…">${esc(n.texto || '')}</textarea></div>
    <div class="sec" style="margin:0"><h3 style="margin:0">Seguimiento${segs.length ? ' (' + segs.length + ')' : ''}</h3>
      <p class="stnote" style="margin:0">Agrega cómo evoluciona el tema: qué se acordó, qué quedó pendiente, qué revisar la próxima vez.</p>
      <div class="fld"><label for="nt_seg" class="sr-only">Nuevo seguimiento</label><textarea id="nt_seg" rows="3" placeholder="Nuevo seguimiento…"></textarea></div>
      <div class="row end"><button class="btn sm pri" data-act="empNtSeg">Agregar seguimiento</button></div>
      ${segs.map(([x, i]) => `<div class="pnseg"><span class="ts">${esc(fmtShort(x.at))} <button class="btn sm" data-act="empNtSegDel" data-i="${i}" style="padding:0 6px;margin-left:4px" aria-label="Quitar este seguimiento">Quitar</button></span><p>${pnMark(x.texto, NT.q)}</p></div>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><span class="ts">${n.creada ? 'Creada ' + esc(fmtShort(n.creada)) : ''}</span>${guardada ? '<button class="btn sm warn" data-act="empNtDel">Eliminar nota</button>' : ''}</div></div>`;
}
function empNotasHTML(u) {
  if (!EMP.data.notas) return '';
  const pros = ((EMP.data.pros || {}).profesionales || []).filter(x => !x.admin && (EMP.data.notas || []).some(n => n.proId === x.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const fil = `<div class="pnfil"><input type="search" id="nt_q" value="${esc(NT.q)}" placeholder="Buscar en mis notas" aria-label="Buscar en las notas">
      <div class="row">${ntSolo() ? '' : `<select id="nt_fpro" aria-label="Filtrar por profesional"><option value="">Todos los terapeutas</option><option value="_none" ${NT.pro === '_none' ? 'selected' : ''}>Notas generales</option>${pros.map(x => `<option value="${x.id}" ${String(x.id) === NT.pro ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}</div>
      <div class="row"><select id="nt_ftipo" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>${NT_TIPOS.map(t => `<option ${t === NT.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="nt_fest" aria-label="Filtrar por estado">${[['abiertas', 'Abiertas y en seguimiento'], ['revisar', 'Por revisar hoy'], ['Cerrada', 'Cerradas'], ['todas', 'Todas']].map(([v, l]) => `<option value="${v}" ${v === NT.estado ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <span class="ts" id="nt_count"></span></div>`;
  return `<div class="layout pnl ${NT.sel ? 'in-file' : ''}" style="${u ? 'margin:0' : ''}"><div class="plist-wrap"><div class="panel">${fil}<div id="ntlist">${ntListHTML()}</div></div></div><div class="file-wrap"><div class="panel">${ntEditorHTML(ntCur())}</div></div></div>`;
}
function ntCount() { const c = $('#nt_count'); if (c) { const solo = ntSolo(), t = (EMP.data.notas || []).filter(n => !solo || n.proId === solo).length, n = ntFiltered().length; c.textContent = n + ' de ' + t + ' nota' + (t === 1 ? '' : 's'); } }
function ntMount() {
  ntCount();
  const relist = () => { const l = $('#ntlist'); if (l) l.innerHTML = ntListHTML(); ntCount(); };
  const q = $('#nt_q'); if (q) q.oninput = () => { NT.q = q.value; relist(); };
  const lst = $('#ntlist'); if (lst) lst.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details.pngrp') || NT.q) return; if (d.open) NT.open.add(d.dataset.g); else NT.open.delete(d.dataset.g); }, true);
  [['nt_fpro', 'pro'], ['nt_ftipo', 'tipo'], ['nt_fest', 'estado']].forEach(([id, k]) => { const e = $('#' + id); if (e) e.onchange = () => { NT[k] = e.value; relist(); }; });
  const ed = $('#ntedit'); if (!ed) return;
  const touch = e => { if (e.target.id === 'nt_seg') return; NT.pend = true; const st = $('#nt_stat'); if (st) st.textContent = 'Sin guardar…'; clearTimeout(NT.timer); NT.timer = setTimeout(ntSave, 900); };
  ed.addEventListener('input', touch); ed.addEventListener('change', touch);
  ed.addEventListener('focusout', e => { if (NT.pend && e.target.id !== 'nt_seg') { clearTimeout(NT.timer); ntSave(); } });
}
function ntRead(n) {
  if (!$('#ntedit')) return;
  n.titulo = $('#nt_t').value.trim(); n.texto = $('#nt_txt').value.trim(); n.tipo = $('#nt_tipo').value; n.estado = $('#nt_estado').value; n.revisar = $('#nt_rev').value;
  n.etiquetas = $('#nt_tags').value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean); if ($('#nt_pro')) n.proId = $('#nt_pro').value ? +$('#nt_pro').value : null; else if (ntSolo()) n.proId = ntSolo();
}
const ntBody = n => ({ titulo: n.titulo, texto: n.texto, tipo: n.tipo, estado: n.estado, revisar: n.revisar || '', etiquetas: n.etiquetas || [], seguimiento: n.seguimiento || [], proId: n.proId || null });
function ntSave() { NT.chain = NT.chain.then(ntSaveNow, ntSaveNow); return NT.chain; }
async function ntSaveNow() {
  const n = ntCur(); if (!n) { NT.pend = false; return; }
  ntRead(n); NT.pend = false; const st = $('#nt_stat');
  if (!n.titulo && !n.texto) { if (st) st.textContent = 'Escribe el título o el texto para guardarla'; return; }
  try {
    const nuevo = NT.draft === n, r = await api('/empresa/notas' + (nuevo ? '' : '/' + n.id), { method: nuevo ? 'POST' : 'PATCH', body: ntBody(n) });
    if (nuevo) { EMP.data.notas.unshift(r); NT.draft = null; NT.sel = r.id; } else Object.assign(n, r);
    if (st) st.textContent = 'Guardada'; const l = $('#ntlist'); if (l) l.innerHTML = ntListHTML(); ntCount();
  } catch (e) { if (st) st.textContent = 'No se pudo guardar'; toast(e.message); }
}
async function ntLeave() { clearTimeout(NT.timer); if (NT.pend) await ntSave(); else await NT.chain; }
ACT.empNtNew = async () => { await ntLeave(); NT.draft = { id: 'nuevo', titulo: '', texto: '', tipo: 'Seguimiento', estado: 'Abierta', revisar: '', etiquetas: [], seguimiento: [], proId: ntSolo() || (NT.pro && NT.pro !== '_none' ? +NT.pro : null) }; NT.sel = 'nuevo'; render(); const t = $('#nt_t'); if (t) t.focus(); };
ACT.empNtOpen = async b => { await ntLeave(); NT.sel = +b.dataset.id; NT.draft = null; render(); if (innerWidth <= 820) scrollTo(0, 0); };
ACT.empNtBack = async () => { await ntLeave(); NT.sel = null; NT.draft = null; render(); };
ACT.empNtSeg = async () => {
  const n = ntCur(), t = $('#nt_seg').value.trim(); if (!n) return; if (!t) { toast('Escribe el seguimiento.'); $('#nt_seg').focus(); return; }
  ntRead(n); n.seguimiento = (n.seguimiento || []).concat([{ at: new Date().toISOString(), texto: t.slice(0, 5000) }]); if (n.estado === 'Abierta') n.estado = 'En seguimiento';
  await ntSaveNow(); render();
};
ACT.empNtSegDel = async b => { const n = ntCur(); if (!n) return; ntRead(n); n.seguimiento = (n.seguimiento || []).filter((_, i) => i !== +b.dataset.i); await ntSaveNow(); render(); };
ACT.empNtDel = async b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: eliminar la nota'; return; }
  const n = ntCur(); if (!n) return; clearTimeout(NT.timer); NT.pend = false;
  try { await api('/empresa/notas/' + n.id, { method: 'DELETE' }); } catch (e) { toast(e.message); return; }
  EMP.data.notas = EMP.data.notas.filter(x => x.id !== n.id); NT.sel = null; toast('Nota eliminada.'); render();
};
function empFileHTML() {
  const e = EMP.data.pros, u = empPro(), nuevo = EMP.sel === 'nuevo';
  const gen = EMP.sec !== 'pros' && !nuevo && !u;  // sección general: Agenda, Finanzas, Estadísticas o Notas de toda la empresa
  const tabs = nuevo || gen ? [] : u ? ['datos', 'agenda', 'pacientes', 'fin', 'notas'] : [];
  if (gen) EMP.tab = EMP.sec; else if (u && !tabs.includes(EMP.tab)) EMP.tab = 'datos';
  const titulo = nuevo ? 'Nuevo profesional' : u ? u.name : gen ? ({ agenda: 'Agenda', fin: 'Finanzas', stats: 'Estadísticas', notas: 'Notas' })[EMP.sec] + ' de la empresa' : 'Profesionales';
  const meta = nuevo ? '' : u ? `<span class="mono">${esc(u.email)}</span>${u.admin ? '' : `<span>Último ingreso: ${u.ultimoIngreso ? esc(fmtD(u.ultimoIngreso)) : 'nunca'}</span>`}` : (e ? `<span>${esc(e.name)} · ${(e.profesionales || []).filter(x => !x.admin).length} terapeutas</span>` : '');
  const cuerpo = EMP.error ? `<div class="banner" role="alert">${esc(EMP.error)}</div>`
    : nuevo ? empNuevoHTML() : !u && !gen ? '<p class="stnote">Elige un terapeuta de la lista para ver sus datos, agenda y finanzas.</p>' : !e || (EMP.tab !== 'datos' && !EMP.data[EMP.tab]) ? '<p class="stnote">Cargando…</p>'
    : EMP.tab === 'datos' ? empDatosHTML(u) : EMP.tab === 'agenda' ? empAgendaHTML(u) : EMP.tab === 'pacientes' ? empPacientesHTML(u) : EMP.tab === 'fin' ? empFinHTML(u) : EMP.tab === 'stats' ? empStatsHTML() : empNotasHTML(u);
  return `<div class="panel file"><div class="file-head"><div>${gen ? '' : '<button class="btn sm back" data-act="empSel" data-id="">← Terapeutas</button>'}<h2>${esc(titulo)}</h2><div class="meta">${meta}</div></div></div>
    ${tabs.length ? `<div class="tabwrap"><div class="tabs" role="tablist">${tabs.map(k => `<button class="tab ${EMP.tab === k ? 'on' : ''}" role="tab" data-act="empTab" data-t="${k}">${EMP_TAB_NOM[k]}</button>`).join('')}</div></div>` : ''}
    <div class="body" id="tabbody">${cuerpo}</div></div>`;
}
function empresaHTML() {
  if (EMP.sec === 'agenda' && !EMP.sel) {  // la agenda general lleva su propio encabezado (como la agenda normal)
    const e = EMP.error ? `<div class="banner" role="alert">${esc(EMP.error)}</div>` : EMP.data.agenda ? empAgendaHTML(null) : '<div class="panel"><p class="stnote" style="padding:16px">Cargando…</p></div>';
    return `<div class="file-wrap" style="display:block">${e}</div>`;
  }
  if (EMP.sec === 'notas' && !EMP.sel) return EMP.error ? `<div class="file-wrap" style="display:block"><div class="banner" role="alert">${esc(EMP.error)}</div></div>` : EMP.data.notas ? empNotasHTML(null) : '<div class="panel"><p class="stnote" style="padding:16px">Cargando…</p></div>';  // el cuaderno de notas ocupa toda la pantalla, como el de un terapeuta
  if (EMP.sec === 'cons') return `<div class="layout ${EMP.cons ? 'in-file' : ''}"><div class="plist-wrap">${empConsListHTML()}</div><div class="file-wrap">${empConsFileHTML()}</div></div>`;
  if (EMP.sec !== 'pros' && !EMP.sel) return `<div class="file-wrap" style="display:block">${empFileHTML()}</div>`;
  return `<div class="layout ${EMP.sel ? 'in-file' : ''}"><div class="plist-wrap">${empListHTML()}</div><div class="file-wrap">${empFileHTML()}</div></div>`;
}

/* ===== Agenda general: una columna por terapeuta en cada día (como el calendario de Google con varios calendarios) ===== */
const AG_COLORES = ['#4A3F9E', '#B5472D', '#1F7A5C', '#8A5A00', '#9B2C6F', '#1F5F99', '#5B6B1F', '#6B4A9E'];
const AG_ALTO_HORA = 48, AG_ANCHO_COL = 110;
const AG = { fecha: empISO(new Date()), modo: 'semana', ocultos: new Set() };
try { (JSON.parse(localStorage.getItem('hc_emp_ocultos') || '[]') || []).forEach(x => AG.ocultos.add(+x)); } catch (e) { /* sin almacenamiento */ }
const agGuardar = () => { try { localStorage.setItem('hc_emp_ocultos', JSON.stringify([...AG.ocultos])); } catch (e) { /* sin almacenamiento */ } };
const agFecha = () => new Date(AG.fecha + 'T12:00:00');
function agDias() {
  const f = agFecha(); if (AG.modo === 'dia') return [AG.fecha];
  if (AG.modo === 'mes') {  // semanas completas (lunes a domingo) que cubren el mes, como en la agenda normal
    const p = new Date(f.getFullYear(), f.getMonth(), 1, 12), ini = new Date(p.getTime() - ((p.getDay() + 6) % 7) * 864e5), fin = new Date(f.getFullYear(), f.getMonth() + 1, 0, 12);
    const n = Math.ceil(((fin - ini) / 864e5 + 1) / 7) * 7; return [...Array(n)].map((_, i) => empISO(new Date(ini.getTime() + i * 864e5)));
  }
  const lunes = new Date(f.getTime() - ((f.getDay() + 6) % 7) * 864e5);
  return [0, 1, 2, 3, 4, 5, 6].map(i => empISO(new Date(lunes.getTime() + i * 864e5)));
}
const agRango = () => { const d = agDias(); return { desde: d[0], hasta: d[d.length - 1] }; };
const agPros = () => ((EMP.data.pros || {}).profesionales || []).filter(u => u.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const agColor = u => u.color || AG_COLORES[agPros().findIndex(x => x.id === u.id) % AG_COLORES.length];
const agIni = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const agAvatar = u => `<span class="agav" style="background:${agColor(u)}" aria-hidden="true">${esc(agIni(u.name))}</span>`;
const agHM = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
/* El administrador abre el comprobante de pago que un consultante subió al agendar con un terapeuta de su empresa. */
async function empComprobante(proId, bid) {
  const r = await fetch(`/api/empresa/comprobante/${proId}/${encodeURIComponent(bid)}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'archivo-clinico' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'El comprobante no está en el servidor.' : 'Error ' + r.status);
  return r.blob();
}
/* Muestra un comprobante (foto o PDF) en una ventana sobre la misma página, sin salir de ella. */
function verComprobante(blob) {
  const url = URL.createObjectURL(blob), pop = document.createElement('div'), cerrar = () => { pop.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') cerrar(); };
  pop.className = 'modal'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', 'Comprobante de pago'); pop.style.zIndex = 1000;
  pop.innerHTML = `<div class="box" style="width:min(820px,100%);max-height:92vh;display:flex;flex-direction:column"><div class="row" style="justify-content:space-between"><h3>Comprobante de pago</h3><button class="btn sm mx" aria-label="Cerrar">✕</button></div>
    ${blob.type === 'application/pdf' ? `<iframe src="${url}" title="Comprobante de pago" style="width:100%;height:75vh;border:0"></iframe>` : `<div style="overflow:auto;text-align:center"><img src="${url}" alt="Comprobante de pago" style="max-width:100%;max-height:75vh"></div>`}
    <div class="row end"><a class="btn sm" href="${url}" download="comprobante-de-pago">Descargar</a></div></div>`;
  pop.querySelector('.mx').onclick = cerrar; pop.onclick = e => { if (e.target === pop) cerrar(); }; document.addEventListener('keydown', esc_); document.body.appendChild(pop);
}
ACT.empComp = async b => { try { verComprobante(await empComprobante(b.dataset.pro, b.dataset.id)); } catch (e) { toast(e.message); } };
function agEvento(a, u, min) {
  const ini = new Date(a.startAt), dur = a.duracion || 50, m = ini.getHours() * 60 + ini.getMinutes(), fin = new Date(ini.getTime() + dur * 60000);
  const nom = a.evento || a.paciente || (a.nuevo ? [a.nuevo.nombres, a.nuevo.apellidos].filter(Boolean).join(' ') + ' (nuevo)' : 'Sin paciente');
  const est = a.estado || 'Programada', top = (m - min) * AG_ALTO_HORA / 60, alto = Math.max(20, dur * AG_ALTO_HORA / 60 - 2);
  return `<div class="agev${modCls(a)} ${est === 'Cancelada' ? 'canc' : est === 'No asistió' ? 'noas' : ''}" style="top:${top}px;height:${alto}px;cursor:pointer" title="${esc(u.name + ' · ' + nom + ' · ' + agHM(ini) + ' a ' + agHM(fin) + ' · ' + est + (a.modalidad ? ' · ' + a.modalidad : ''))}" data-act="empCitaVer" data-id="${esc(a.id)}" data-pro="${a.proId}"><b>${esc(nom)}</b><span>${agHM(ini)} – ${agHM(fin)}</span>${a.comprobanteId ? `<button class="aplink" data-act="empComp" data-pro="${a.proId}" data-id="${esc(a.comprobanteId)}" title="Ver comprobante de pago">📎 Comprobante</button>` : ''}</div>`;
}
function agGridHTML(L, solo, cons) {
  const todos = solo ? [solo] : agPros(), vis = todos.filter(u => solo || !AG.ocultos.has(u.id)), dias = agDias();
  const citas = L.filter(a => vis.some(u => u.id === a.proId));
  const diaCorto = d => { const t = new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  const etDia = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const f = agFecha(), hoy = empISO(new Date());
  const titulo = AG.modo === 'semana' ? etDia(dias[0]) + ' – ' + etDia(dias[6]) + ' ' + new Date(dias[6] + 'T12:00:00').getFullYear() : AG.modo === 'mes' ? f.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) : f.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const unidad = { dia: 'Día', semana: 'Semana', mes: 'Mes' }[AG.modo];
  const cab = `<div class="ag-head"><div><h2>${cons ? 'Agenda · ' + esc(cons.name) : 'Agenda'}</h2><span style="font-size:13px;color:var(--muted)">${esc(titulo)}</span></div>
    <div class="row"><div class="seg" role="group" aria-label="Vista">${[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, l]) => `<button class="${k === AG.modo ? 'on' : ''}" data-act="empAgModo" data-v="${k}" aria-pressed="${k === AG.modo}">${l}</button>`).join('')}</div>
    <button class="btn sm" data-act="empAgNav" data-d="-1" aria-label="${unidad} anterior">←</button><button class="btn sm" data-act="empAgNav" data-d="0">Hoy</button><button class="btn sm" data-act="empAgNav" data-d="1" aria-label="${unidad} siguiente">→</button>${cons ? '' : `${solo ? '' : '<button class="btn sm" data-act="empReservas">Reservas</button>'}${solo || EMPRESA_SEC() ? '' : '<button class="btn sm" data-act="empGcal">Google Calendar</button>'}<button class="btn pri sm" data-act="empCita" ${solo ? `data-pro="${solo.id}"` : vis.length === 1 ? `data-pro="${vis[0].id}"` : ''}>+ Nueva cita</button>`}</div></div>
    <div class="aglegend" aria-label="Colores por tipo de consulta"><span class="mp">Presencial</span><span class="mv">Virtual</span><span class="mt">Telefónica</span></div>`;
  const quien = solo ? '' : `<div class="row" style="flex-wrap:wrap;align-items:center;padding:8px 16px 0"><span class="ts">Ver:</span>${todos.map(u => `<button class="agchip ${AG.ocultos.has(u.id) ? '' : 'on'}" data-act="empAgTog" data-id="${u.id}" aria-pressed="${AG.ocultos.has(u.id) ? 'false' : 'true'}">${agAvatar(u)}${esc(u.name.split(' ')[0])}</button>`).join('')}
    <button class="btn sm" data-act="empAgTodos" data-k="todos">Todos</button><button class="btn sm" data-act="empAgTodos" data-k="ninguno">Ninguno</button></div>`;
  const pie = citas.length ? '' : '<p class="stnote" style="padding:8px 16px">No hay citas en este rango' + (solo ? '.' : ' para los terapeutas elegidos.') + '</p>';
  if (!vis.length) return `<div class="panel">${cab}${quien}<p class="stnote" style="padding:8px 16px">Elige al menos un terapeuta para ver su agenda.</p></div>`;
  if (AG.modo === 'mes') {
    const mes = f.getMonth(), wd = dias.slice(0, 7).map(d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short' }));
    const celdas = dias.map(d => {
      const l = citas.filter(a => a.estado !== 'Cancelada' && empISO(new Date(a.startAt)) === d).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)), dd = new Date(d + 'T12:00:00');
      return `<div class="mcell ${dd.getMonth() !== mes ? 'out' : ''} ${d === hoy ? 'today' : ''}" data-act="empAgDia" data-date="${d}"><button class="mday" data-act="empAgDia" data-date="${d}">${dd.getDate()}</button>
        ${l.slice(0, 3).map(a => { const u = vis.find(x => x.id === a.proId), nom = a.evento || a.paciente || 'Sin paciente'; return `<span class="mapt${modCls(a)}" data-act="empCitaVer" data-id="${esc(a.id)}" data-pro="${a.proId}" title="${esc((u ? u.name + ' · ' : '') + agHM(new Date(a.startAt)) + ' ' + nom)}"><b>${agHM(new Date(a.startAt))}</b> ${esc(nom)}${solo ? '' : ' · ' + esc(agIni(u && u.name))}</span>`; }).join('')}
        ${l.length > 3 ? `<button class="mmore" data-act="empAgDia" data-date="${d}">+${l.length - 3} más</button>` : ''}${l.length ? `<span class="mdots" aria-hidden="true">${'•'.repeat(Math.min(l.length, 5))}</span>` : ''}</div>`;
    }).join('');
    return `<div class="panel">${cab}${quien}<div class="month"><div class="mhead">${wd.map(x => `<span>${esc(x)}</span>`).join('')}</div><div class="mgrid">${celdas}</div></div>${pie}</div>`;
  }
  const disp = d => cons ? ((cons.horario || {})[(new Date(d + 'T12:00:00').getDay() + 6) % 7] || []).map(([a, b]) => [+a.slice(0, 2) * 60 + +a.slice(3), +b.slice(0, 2) * 60 + +b.slice(3)]) : [];
  let min = 6 * 60, max = 19 * 60;
  dias.forEach(d => disp(d).forEach(([a, b]) => { min = Math.min(min, Math.floor(a / 60) * 60); max = Math.max(max, Math.ceil(b / 60) * 60); }));
  citas.forEach(a => { const d = new Date(a.startAt), m = d.getHours() * 60 + d.getMinutes(); min = Math.min(min, Math.floor(m / 60) * 60); max = Math.max(max, Math.ceil((m + (a.duracion || 50)) / 60) * 60); });
  max = Math.min(max, 24 * 60);
  const alto = (max - min) / 60 * AG_ALTO_HORA, nDia = Math.max(vis.length, 1), ancho = 48 + dias.length * nDia * AG_ANCHO_COL;
  const horas = []; for (let h = min / 60; h < max / 60; h++) horas.push(`<div class="aghora" style="height:${AG_ALTO_HORA}px">${h === 0 ? '12 a. m.' : h < 12 ? h + ' a. m.' : h === 12 ? '12 p. m.' : (h - 12) + ' p. m.'}</div>`);
  const cols = dias.map(d => `<div class="agdia" style="flex:${nDia} 1 ${nDia * AG_ANCHO_COL}px">${dias.length > 1 ? `<div class="agdiah ${d === hoy ? 'hoy' : ''}"><small>${esc(diaCorto(d))}</small><b>${+d.slice(8)}</b></div>` : ''}<div class="agcols">${vis.map(u => {
    if (dias.length > 1) return `<div class="agcol agcolh" title="${esc(u.name)}">${agAvatar(u)}<span>${esc(u.name.split(' ')[0])}</span></div>`;
    const dd = citas.filter(a => a.proId === u.id && empISO(new Date(a.startAt)) === d && !a.evento && a.estado !== 'Cancelada'), h = dd.reduce((t, a) => t + (a.duracion || 50), 0) / 60;
    return `<div class="agcol agcolh" title="${esc(u.name)}">${agAvatar(u)}<span class="agnm"><b>${esc(u.name.split(' ')[0])}</b><small>${dd.length ? dd.length + (dd.length === 1 ? ' cita' : ' citas') + ' · ' + String(Math.round(h * 10) / 10).replace('.', ',') + ' h' : 'Sin citas'}</small></span></div>`; }).join('')}</div></div>`).join('');
  const mins = x => +x.slice(0, 2) * 60 + +x.slice(3), ahora = Date.now(), consAct = cons ? [] : (EMP.data.cons || []).filter(c => c.activo);
  const solapa = (a, d, i, f) => { const x = new Date(a.startAt); return a.estado !== 'Cancelada' && empISO(x) === d && x.getHours() * 60 + x.getMinutes() < f && x.getHours() * 60 + x.getMinutes() + (a.duracion || 50) > i; };
  /* Casillas (una por hora) donde se puede agendar: «+» suave; con círculo si algún consultorio está libre esa hora */
  const casillas = (u, d) => cons ? '' : Array.from({ length: (max - min) / 60 }, (_, k) => { const i = min + k * 60, f = i + 60;
    if (new Date(d + 'T12:00:00').setHours(0, f, 0, 0) < ahora || citas.some(a => a.proId === u.id && solapa(a, d, i, f))) return '';
    const dow = (new Date(d + 'T12:00:00').getDay() + 6) % 7, libre = consAct.some(c => ((c.horario || {})[dow] || []).some(([a, b]) => mins(a) <= i && mins(b) >= f) && !L.some(a => a.consultorioId === c.id && solapa(a, d, i, f)));
    return `<div class="agslot${libre ? ' cons' : ''}" style="top:${k * AG_ALTO_HORA}px;height:${AG_ALTO_HORA}px" title="${libre ? 'Agendar · hay consultorio disponible para presencial' : 'Agendar una cita'}"><span>+</span></div>`; }).join('');
  const pista = cons || AG.modo === 'mes' ? '' : `<div class="agpista"><span><i>+</i> Agendar</span>${consAct.length ? '<span><i class="c">+</i> Consultorio disponible para presencial</span>' : ''}</div>`;
  const cuerpo = dias.map(d => `<div class="agdia${d === hoy ? ' hoyc' : ''}" style="flex:${nDia} 1 ${nDia * AG_ANCHO_COL}px"><div class="agcols">${vis.map(u => `<div class="agcol" style="height:${alto}px"${cons ? '' : ` data-act="empAgHueco" data-pro="${u.id}" data-date="${d}" data-min="${min}" title="Clic para agendar una cita aquí"`}>${casillas(u, d)}${disp(d).map(([a, b]) => `<div class="agdisp" style="top:${(a - min) * AG_ALTO_HORA / 60}px;height:${(b - a) * AG_ALTO_HORA / 60}px" title="Horario del consultorio"></div>`).join('')}${citas.filter(a => a.proId === u.id && empISO(new Date(a.startAt)) === d).map(a => agEvento(a, u, min)).join('')}</div>`).join('')}</div></div>`).join('');
  return `<div class="panel">${cab}${quien}${pista}<div class="agg${dias.length === 1 ? ' un' : ' sem'}"><div class="agin" style="min-width:${ancho}px"><div class="aghead"><div class="aggut"></div>${cols}</div><div class="agbody"><div class="aggut">${horas.join('')}</div>${cuerpo}</div></div></div>${pie}</div>`;
}
/* Clic en un hueco de la agenda: abre «Nueva cita» con ese terapeuta, día y hora (a la media hora anterior). */
ACT.empAgHueco = (b, e) => {
  const y = e.clientY - b.getBoundingClientRect().top, m = Math.floor((+b.dataset.min + y / AG_ALTO_HORA * 60) / 30) * 30;
  ACT.empCita({ dataset: { pro: b.dataset.pro, fecha: b.dataset.date, hora: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'), mod: e.target.closest && e.target.closest('.agslot.cons') ? 'Presencial' : 'Virtual' } });
};
ACT.empGcal = () => ACT.gcal();  // el calendario de toda la empresa: lo conecta el administrador con su Google
ACT.empAgNav = b => {
  const d = +b.dataset.d, f = agFecha();
  AG.fecha = d === 0 ? empISO(new Date()) : AG.modo === 'mes' ? empISO(new Date(f.getFullYear(), f.getMonth() + d, 1, 12)) : empISO(new Date(f.getTime() + d * (AG.modo === 'semana' ? 7 : 1) * 864e5)); empLoad();
};
ACT.empAgModo = b => { AG.modo = b.dataset.v; empLoad(); };
ACT.empAgDia = b => { AG.fecha = b.dataset.date; AG.modo = 'dia'; empLoad(); };
ACT.empAgTog = b => { const id = +b.dataset.id; if (AG.ocultos.has(id)) AG.ocultos.delete(id); else AG.ocultos.add(id); agGuardar(); render(); };
ACT.empAgTodos = b => { AG.ocultos = new Set(b.dataset.k === 'ninguno' ? agPros().map(u => u.id) : []); agGuardar(); render(); };

/* ===== Consultorios: el administrador los crea y marca cuándo se pueden usar; el terapeuta elige uno al agendar una cita presencial ===== */
const EMP_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const empCons = () => ((EMP.data.cons || []).find(c => c.id === EMP.cons)) || null;
function empConsListHTML() {
  const L = EMP.data.cons;
  return `<div class="panel plist"><div class="plist-head"><span>Consultorios</span><span>${L ? L.length : ''}</span></div>
  <div style="padding:8px 10px"><button class="btn pri sm" data-act="empConsNuevo">+ Nuevo consultorio</button></div>
  ${!L ? '<p class="stnote" style="padding:0 10px">Cargando…</p>' : L.length ? L.map(c => `<button class="prow ${c.id === EMP.cons ? 'on' : ''}" data-act="empConsSel" data-id="${c.id}"><span><div class="nm">${esc(c.name)}${c.activo ? '' : ' ' + empChip('Inactivo', 'danger')}</div><div class="sub">${Object.keys(c.horario || {}).length ? Object.keys(c.horario).length + ' día(s) con horario' : 'Sin horario'}</div></span></button>`).join('') : '<p class="stnote" style="padding:0 10px">Aún no hay consultorios.</p>'}</div>`;
}
function empConsHorarioHTML(c) {
  const fila = d => { const fr = (c.horario || {})[d] || []; return `<tr><td>${EMP_DIAS[d]}</td>${[0, 1].map(i => `<td><input type="time" id="ch_${d}_${i}_a" value="${esc((fr[i] || [])[0] || '')}" aria-label="${EMP_DIAS[d]} desde"> – <input type="time" id="ch_${d}_${i}_b" value="${esc((fr[i] || [])[1] || '')}" aria-label="${EMP_DIAS[d]} hasta"></td>`).join('')}</tr>`; };
  const acc = `<div class="row"><button class="btn pri" data-act="empConsGuardar" data-id="${c.id}">Guardar</button><button class="btn" data-act="empConsActivo" data-id="${c.id}">${c.activo ? 'Desactivar consultorio' : 'Reactivar consultorio'}</button></div>`;
  return `<div class="sec">${acc}<div class="grid">${F('Nombre', 'ch_nombre', c.name)}${F('Dirección (sale en los correos de citas presenciales)', 'ch_direccion', c.direccion || '', { ph: 'Calle 10 # 20-30, consultorio 301' })}</div>
    <h3>Horario en que se puede usar</h3><p class="ts" style="margin:0 0 6px">Deja en blanco los días y franjas en que no se usa. Cada semana se repite igual.</p>
    <table class="sttab"><thead><tr><th>Día</th><th>Franja 1</th><th>Franja 2</th></tr></thead><tbody>${[0, 1, 2, 3, 4, 5, 6].map(fila).join('')}</tbody></table>
    ${acc}
    <p style="margin:0;font-size:13px;color:var(--muted)">Los terapeutas eligen el consultorio al agendar una cita presencial y solo les aparecen los que están libres a esa hora.</p></div>`;
}
function empConsFileHTML() {
  const c = empCons(), nuevo = EMP.cons === 'nuevo';
  if (EMP.error) return `<div class="panel file"><div class="body"><div class="banner" role="alert">${esc(EMP.error)}</div></div></div>`;
  if (nuevo) return `<div class="panel file"><div class="file-head"><div><button class="btn sm back" data-act="empConsSel" data-id="">← Consultorios</button><h2>Nuevo consultorio</h2></div></div><div class="body"><div class="sec"><div class="grid">${F('Nombre', 'ch_nuevo', '')}${F('Dirección (opcional; sale en los correos de citas presenciales)', 'ch_dir_nuevo', '')}</div><div class="row"><button class="btn pri" data-act="empConsCrear">Crear consultorio</button></div><p style="margin:0;font-size:13px;color:var(--muted)">Después de crearlo, marca el horario en que se puede usar.</p></div></div></div>`;
  if (!c) return `<div class="panel file"><div class="body"><p class="stnote">${EMP.data.cons ? 'Elige un consultorio de la lista o cree uno nuevo.' : 'Cargando…'}</p></div></div>`;
  const cuerpo = EMP.ctab === 'horario' ? empConsHorarioHTML(c) : EMP.data.agenda ? agGridHTML(EMP.data.agenda.filter(a => a.consultorioId === c.id), null, c) : '<p class="stnote">Cargando…</p>';
  return `<div class="panel file"><div class="file-head"><div><button class="btn sm back" data-act="empConsSel" data-id="">← Consultorios</button><h2>${esc(c.name)}</h2><div class="meta">${c.activo ? '' : empChip('Inactivo', 'danger')}</div></div></div>
    <div class="tabwrap"><div class="tabs" role="tablist">${[['agenda', 'Agenda'], ['horario', 'Horario']].map(([k, n]) => `<button class="tab ${EMP.ctab === k ? 'on' : ''}" role="tab" data-act="empConsTab" data-t="${k}">${n}</button>`).join('')}</div></div>
    <div class="body" id="tabbody">${cuerpo}</div></div>`;
}
ACT.empConsSel = b => { EMP.cons = b.dataset.id ? +b.dataset.id : null; EMP.ctab = 'agenda'; render(); scrollTo(0, 0); };
ACT.empConsNuevo = () => { EMP.cons = 'nuevo'; render(); scrollTo(0, 0); };
ACT.empConsTab = b => { EMP.ctab = b.dataset.t; render(); };
ACT.empConsCrear = async () => {
  const name = $('#f_ch_nuevo').value.trim(); if (!name) { toast('Escribe el nombre del consultorio.'); return; }
  try { const c = await api('/empresa/consultorios', { method: 'POST', body: { name, direccion: $('#f_ch_dir_nuevo').value.trim() } }); EMP.cons = c.id; EMP.ctab = 'horario'; await empLoad(); toast('Consultorio creado. Marca su horario.'); } catch (e) { toast(e.message); }
};
ACT.empConsGuardar = async b => {
  const horario = {};
  for (let d = 0; d < 7; d++) { const fr = []; for (let i = 0; i < 2; i++) { const x = $(`#ch_${d}_${i}_a`).value, y = $(`#ch_${d}_${i}_b`).value; if (x || y) { if (!x || !y) { toast(`${EMP_DIAS[d]}: completa la hora de inicio y la de fin.`); return; } fr.push([x, y]); } } if (fr.length) horario[d] = fr; }
  try { await api('/empresa/consultorios/' + b.dataset.id, { method: 'PATCH', body: { name: $('#f_ch_nombre').value.trim(), direccion: $('#f_ch_direccion').value.trim(), horario } }); await empLoad(); toast('Consultorio guardado.'); } catch (e) { toast(e.message); }
};
ACT.empConsActivo = async b => {
  const c = empCons(); if (!c) return;
  try { await api('/empresa/consultorios/' + c.id, { method: 'PATCH', body: { activo: !c.activo } }); await empLoad(); toast(c.activo ? 'Consultorio desactivado.' : 'Consultorio reactivado.'); } catch (e) { toast(e.message); }
};

/* Perfil del administrador (Ajustas): qué pueden hacer sus terapeutas. Se guarda al marcar; el servidor lo exige. */
const EMP_PERMISOS = [['citas', 'Crear, mover y cancelar citas', 'Si lo desactiva, solo podrán marcar si atendieron las citas que tú u otra persona les cree, y no recibirán reservas por enlace. Puedes cambiarlo por persona en cada terapeuta.'], ['pagos', 'Gestionar cobros y pagos', 'Si lo desactiva, no verán la pestaña Finanzas ni podrán registrar ni anular cobros y pagos.'],
  ['comprobante', 'Exigir comprobante de pago antes de agendar', 'Si lo activa, el consultante debe subir el comprobante de pago de la cita para poder agendar por los enlaces de reservas.']];
async function empPermisos() {
  const box = $('#emp_perm_box'), comp = $('#emp_comp_box'); if (!box) return;
  let p, eslogan = '', colorRes = '', tCorreo = '', tReservas = ''; try { const em = (await api('/empresa')).empresa; p = em.permisos; eslogan = em.eslogan || ''; tCorreo = em.textoCorreo || ''; tReservas = em.textoReservas || ''; colorRes = em.colorReservas || ''; } catch (e) { box.innerHTML = '<p class="stnote" style="margin:0">No se pudieron cargar los permisos.</p>'; return; }
  const logoHTML = l => `<b>Logo de la empresa</b><div class="row" style="align-items:center"><span id="emp_logo_prev">${l ? `<img class="logoprev" src="${l}" alt="Logo de la empresa">` : '<span style="font-size:13px;color:var(--muted)">Sin logo</span>'}</span><input type="file" id="emp_logo_file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Subir logo de la empresa">${l ? '<button class="btn sm warn" id="emp_logo_del" type="button">Quitar logo</button>' : ''}</div><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Sale en el encabezado de los documentos de todos sus terapeutas, en el enlace de reservas y en los correos que ellos envían (se ajusta solo a un tamaño adecuado). Ellos no pueden subir un logo propio. PNG con fondo transparente se ve mejor.</p>
  <b>Eslogan de la empresa</b><div class="row" style="align-items:center"><input id="emp_eslogan" type="text" maxlength="160" placeholder="Ej.: Cuidamos tu bienestar" value="${esc(eslogan)}" aria-label="Eslogan de la empresa" style="flex:1;min-width:200px"><button class="btn sm pri" id="emp_eslogan_go" type="button">Guardar eslogan</button></div><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Sale junto al logo en el enlace de reservas y en los correos. Déjelo vacío para quitarlo.</p>
  <b>Texto en los correos</b><textarea id="emp_t_correo" rows="3" maxlength="600" placeholder="Ej.: Si necesita reprogramar, escríbanos con 24 horas de anticipación." aria-label="Texto que se agrega a los correos" style="width:100%">${esc(tCorreo)}</textarea><div class="row"><button class="btn sm pri" id="emp_t_correo_go" type="button">Guardar texto de los correos</button></div><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Se agrega al final de los correos que envían sus terapeutas a los consultantes (citas, recordatorios, formularios), antes de la firma.</p>`;
  const resHTML = `<b>Color de fondo del enlace de reservas</b><div class="row" style="align-items:center"><input id="emp_color" type="color" value="${colorRes || '#f1f0f6'}" aria-label="Color de fondo" style="width:56px;height:40px;padding:2px"><button class="btn sm pri" id="emp_color_go" type="button">Guardar color</button><button class="btn sm" id="emp_color_off" type="button">Quitar</button></div><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Es el fondo de la página donde tus consultantes agendan; la tarjeta sigue en blanco y el logo pequeño de Alter-Karute siempre aparece.</p>
  <b>Texto en el enlace de reservas</b><textarea id="emp_t_reservas" rows="3" maxlength="600" placeholder="Ej.: Atendemos de lunes a viernes. Pagos por transferencia." aria-label="Texto del enlace de reservas" style="width:100%">${esc(tReservas)}</textarea><div class="row"><button class="btn sm pri" id="emp_t_reservas_go" type="button">Guardar texto de reservas</button></div><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Se muestra bajo el logo en la página donde el consultante agenda. Es independiente del texto de los correos.</p>`
  const logoSet = async l => { try { const r = await api('/empresa/logo', { method: 'PUT', body: { logo: l } }); S.user.companyLogo = r.logo || undefined; toast(l ? 'Logo guardado.' : 'Logo quitado.'); empLogoDraw(); } catch (e) { toast(e.message); } };
  const empLogoDraw = () => { const l = S.user.companyLogo || ''; $('#emp_logo_box').innerHTML = logoHTML(l);
    $('#emp_logo_file').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { await logoSet(await logoFromImage(f)); } catch (err) { toast(err.message); ev.target.value = ''; } };
    if ($('#emp_logo_del')) $('#emp_logo_del').onclick = () => logoSet('');
    [['correo', 'emp_t_correo'], ['reservas', 'emp_t_reservas']].forEach(([k, id]) => { $('#' + id + '_go').onclick = async () => { try { const r = await api('/empresa/textos', { method: 'PUT', body: { [k]: $('#' + id).value } }); toast(r[k] ? 'Texto guardado.' : 'Texto quitado.'); } catch (e) { toast(e.message); } }; });
    const colSave = async c => { try { const r = await api('/empresa/color', { method: 'PUT', body: { color: c } }); colorRes = r.color; if (!c) $('#emp_color').value = '#f1f0f6'; toast(c ? 'Color guardado.' : 'Color quitado.'); } catch (e) { toast(e.message); } };
    $('#emp_color_go').onclick = () => colSave($('#emp_color').value); $('#emp_color_off').onclick = () => colSave('');
    $('#emp_eslogan_go').onclick = async () => { try { const r = await api('/empresa/eslogan', { method: 'PUT', body: { eslogan: $('#emp_eslogan').value } }); eslogan = r.eslogan; toast(r.eslogan ? 'Eslogan guardado.' : 'Eslogan quitado.'); } catch (e) { toast(e.message); } }; };
  const chk = ks => EMP_PERMISOS.filter(x => ks.includes(x[0])).map(([k, t, d]) => `<label class="check"><input type="checkbox" id="emp_perm_${k}" ${p[k] ? 'checked' : ''}> <span>${t}</span></label><p style="margin:0 0 6px 26px;font-size:13px;color:var(--muted)">${d}</p>`).join('');
  box.innerHTML = '<b>Permisos de mis terapeutas</b>' + chk(['citas', 'pagos']);
  comp.innerHTML = '<b>Reservas por enlace</b>' + chk(['comprobante']) + resHTML;
  empLogoDraw();
  EMP_PERMISOS.forEach(([k]) => { $('#emp_perm_' + k).onchange = async () => {
    try { await api('/empresa/permisos', { method: 'PUT', body: { citas: $('#emp_perm_citas').checked, pagos: $('#emp_perm_pagos').checked, comprobante: $('#emp_perm_comprobante').checked } }); toast('Permisos guardados.'); } catch (e) { toast(e.message); }
  }; });
}

/* Agendar una cita a un terapeuta de la empresa desde la agenda global. Se guarda como la guardaría su equipo (cabecera X-Empresa-Pro). */
/* El administrador abre una cita de la agenda general: cambia estado, fecha, hora, duración, modalidad o consultorio. Al cancelar, el servidor avisa al consultante por correo. */
ACT.empCitaVer = b => {
  const a0 = (EMP.data.agenda || []).find(x => x.id === b.dataset.id && String(x.proId) === b.dataset.pro); if (!a0) return;
  const pro = a0.proId, root = $('#modal-root'), cerrar = () => { root.innerHTML = ''; };
  const ini = new Date(a0.startAt), p2 = n => String(n).padStart(2, '0');
  const nom = a0.evento || a0.paciente || (a0.nuevo ? [a0.nuevo.nombres, a0.nuevo.apellidos].filter(Boolean).join(' ') + ' (nuevo)' : 'Sin paciente');
  const ev = !!a0.evento, est0 = a0.estado || 'Programada';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Cita"><div class="box notop" style="width:min(520px,100%)"><div class="row" style="justify-content:space-between"><h3>${esc(nom)}</h3><button class="btn sm mx" id="ev_x" aria-label="Cerrar">✕</button></div>
    <p class="ts" style="margin:0 0 8px">Terapeuta: ${esc(a0.proNombre || '')}</p>
    <div class="grid">
      <div class="fld wide"><label for="ev_est">Estado</label><select id="ev_est">${['Programada', 'Atendida', 'Cancelada', 'No asistió'].map(e => `<option ${e === est0 ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="fld"><label for="ev_f">Fecha</label><input id="ev_f" type="date" value="${ini.getFullYear()}-${p2(ini.getMonth() + 1)}-${p2(ini.getDate())}"></div>
      <div class="fld"><label for="ev_h">Hora</label><input id="ev_h" type="time" value="${p2(ini.getHours())}:${p2(ini.getMinutes())}"></div>
      <div class="fld"><label for="ev_d">Duración (min)</label><input id="ev_d" type="number" min="5" max="600" value="${a0.duracion || 50}"></div>
      ${ev ? '' : `<div class="fld"><label for="ev_m">Modalidad</label><select id="ev_m">${['Presencial', 'Virtual', 'Telefónica'].map(m => `<option ${m === a0.modalidad ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="fld wide" id="ev_cw" style="display:none"><label for="ev_c">Consultorio</label><select id="ev_c"></select></div>`}
    </div>
    <div class="fld wide" id="ev_mw" style="display:none"><label for="ev_mot">Motivo de la cancelación</label><textarea id="ev_mot" rows="2" maxlength="300" placeholder="Se le avisa al terapeuta; el consultante no ve el motivo."></textarea></div>
    <p class="ts" id="ev_aviso" style="display:none;margin:6px 0 0">Se avisará al consultante por correo (si tiene uno registrado) de la cancelación o del cambio de fecha u hora.</p>
    <div class="row end"><button class="btn" id="ev_n">Cerrar</button>${est0 !== 'Cancelada' ? '<button class="btn" id="ev_cn" style="color:var(--danger,#b42318)">Cancelar cita</button>' : ''}<button class="btn pri" id="ev_go">Guardar</button></div></div></div>`;
  $('#ev_x').onclick = $('#ev_n').onclick = cerrar;
  const aviso = () => { const cambia = new Date($('#ev_f').value + 'T' + $('#ev_h').value).getTime() !== ini.getTime(); $('#ev_aviso').style.display = !ev && est0 !== 'Cancelada' && ($('#ev_est').value === 'Cancelada' || (est0 === 'Programada' && $('#ev_est').value === 'Programada' && cambia)) ? '' : 'none'; };
  const motivo = () => { $('#ev_mw').style.display = !ev && est0 !== 'Cancelada' && $('#ev_est').value === 'Cancelada' ? '' : 'none'; };
  $('#ev_est').onchange = () => { aviso(); motivo(); }; $('#ev_f').oninput = $('#ev_h').oninput = aviso; aviso();
  if ($('#ev_cn')) $('#ev_cn').onclick = () => { if ($('#ev_est').value === 'Cancelada') { $('#ev_go').click(); return; }  /* segundo clic: confirma y guarda (pide el motivo si falta) */
    $('#ev_est').value = 'Cancelada'; aviso(); motivo(); if (!ev) $('#ev_mot').focus(); };
  const cons = async () => {
    if (ev) return; const w = $('#ev_cw'), i = new Date($('#ev_f').value + 'T' + $('#ev_h').value), dur = Math.max(5, +$('#ev_d').value || 50);
    if ($('#ev_m').value !== 'Presencial' || isNaN(i)) { w.style.display = 'none'; $('#ev_c').innerHTML = ''; return; }
    let L; try { L = await api('/consultorios?inicio=' + encodeURIComponent(i.toISOString()) + '&duracion=' + dur + '&excluir=' + encodeURIComponent(a0.id), { pro }); } catch (e) { return; }
    const cur = $('#ev_c').value || (a0.consultorioId || ''); w.style.display = L.length ? '' : 'none';
    $('#ev_c').innerHTML = '<option value="">Sin consultorio</option>' + L.map(c => `<option value="${c.id}" ${c.libre ? '' : 'disabled'} ${String(c.id) === String(cur) ? 'selected' : ''}>${esc(c.name)}${c.libre ? '' : ' — no disponible (' + esc(c.motivo.toLowerCase()) + ')'}</option>`).join('');
  };
  if (!ev) { $('#ev_f').onchange = $('#ev_h').onchange = $('#ev_d').onchange = $('#ev_m').onchange = cons; cons(); }
  $('#ev_go').onclick = async () => {
    const f = $('#ev_f').value, h = $('#ev_h').value, i = new Date(f + 'T' + h); if (!f || !h || isNaN(i)) { toast('Indica fecha y hora válidas.'); return; }
    if (!ev && est0 !== 'Cancelada' && $('#ev_est').value === 'Cancelada' && !$('#ev_mot').value.trim()) { toast('Escribe el motivo de la cancelación.'); $('#ev_mot').focus(); return; }
    const x = { ...a0 }; delete x.proId; delete x.proNombre; delete x.paciente;
    x.estado = $('#ev_est').value; if (!ev && est0 !== 'Cancelada' && x.estado === 'Cancelada') x.motivoCancelacion = $('#ev_mot').value.trim(); x.startAt = i.toISOString(); x.duracion = Math.max(5, Math.min(600, +$('#ev_d').value || 50));
    if (!ev) { x.modalidad = $('#ev_m').value; const c = $('#ev_cw').style.display !== 'none' && x.modalidad === 'Presencial' ? $('#ev_c').value : ''; if (c) x.consultorioId = +c; else delete x.consultorioId; if (x.modalidad === 'Presencial' && $('#ev_cw').style.display !== 'none' && !c) { toast('Elige un consultorio para la cita presencial.'); return; } }
    const bt = $('#ev_go'); bt.disabled = true;
    try { await api('/records/' + encodeURIComponent(x.id), { method: 'PUT', body: x, pro }); }
    catch (e) { bt.disabled = false; toast(e.message); return; }
    cerrar(); toast(x.estado === 'Cancelada' && est0 !== 'Cancelada' && !ev ? 'Cita cancelada. Si el consultante tiene correo registrado, se le avisó.' : !ev && est0 === 'Programada' && x.estado === 'Programada' && x.startAt !== a0.startAt ? 'Cita guardada. Si el consultante tiene correo registrado, se le avisó del cambio.' : 'Cita guardada.'); empLoad();
  };
};
ACT.empCita = async b => {
  const pros = agPros(), root = $('#modal-root'); if (!pros.length) { toast('Aún no hay terapeutas activos.'); return; }
  let pro = +(b && b.dataset.pro) || pros[0].id, pats = [], citas = [];
  const cerrar = () => { root.innerHTML = ''; };
  const hoy = (b && b.dataset.fecha) || AG.fecha || empISO(new Date()), hora0 = (b && b.dataset.hora) || '08:00', mod0 = (b && b.dataset.mod) || 'Presencial';
  const pintar = () => {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Nueva cita"><div class="box notop" id="ecform" style="width:min(560px,100%)"><div class="row" style="justify-content:space-between"><h3>Nueva cita</h3><button class="btn sm mx" id="ec_x" aria-label="Cerrar">✕</button></div>
    <div class="grid">
      <div class="fld wide"><label for="ec_pro">Terapeuta</label><select id="ec_pro">${pros.map(u => `<option value="${u.id}" ${u.id === pro ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="fld wide"><div class="seg" id="ec_tipo"><button type="button" data-t="pac" class="on">Consultante</button><button type="button" data-t="nuevo">Consultante nuevo</button><button type="button" data-t="ev">Evento</button></div></div>
      <div class="fld wide" id="ec_pacw"><label for="ec_pac">Consultante</label><select id="ec_pac"><option value="">Elige un consultante…</option>${pats.map(p => `<option value="${esc(p.id)}">${esc(fullName(p))}</option>`).join('')}</select></div>
      <div id="ec_nuw" class="wide" style="display:none"><div class="grid"><div class="fld"><label for="ec_nn">Nombres</label><input id="ec_nn" type="text" maxlength="80"></div><div class="fld"><label for="ec_na">Apellidos</label><input id="ec_na" type="text" maxlength="80"></div><div class="fld"><label for="ec_nc">Correo (opcional)</label><input id="ec_nc" type="email" maxlength="120"></div><div class="fld"><label for="ec_nt">Teléfono (opcional)</label><input id="ec_nt" type="tel" maxlength="30"></div></div><p class="ts" style="margin:4px 0 0">Aún no tiene ficha: el terapeuta la crea cuando lo atienda.</p></div>
      <div class="fld wide" id="ec_evw" style="display:none"><label for="ec_ev">Título del evento</label><input id="ec_ev" type="text" placeholder="Ej.: Almuerzo, Capacitación"></div>
      <div class="fld"><label for="ec_fecha">Fecha</label><input id="ec_fecha" type="date" value="${hoy}"></div>
      <div class="fld"><label for="ec_hora">Hora</label><input id="ec_hora" type="time" value="${hora0}"></div>
      <div class="fld"><label for="ec_dur">Duración (min)</label><input id="ec_dur" type="number" min="5" max="600" value="60"></div>
      <div class="fld"><label for="ec_mod">Modalidad</label><select id="ec_mod">${['Presencial', 'Virtual', 'Telefónica'].map(m => `<option ${m === mod0 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="fld wide" id="ec_consw" style="display:none"><label for="ec_cons">Consultorio</label><select id="ec_cons"></select></div>
    </div>
    <div class="row end"><button class="btn" id="ec_c">Cancelar</button><button class="btn pri" id="ec_go">Guardar cita</button></div></div></div>`;
    $('#ec_x').onclick = $('#ec_c').onclick = cerrar;
    $('#ec_pro').onchange = e => { pro = +e.target.value; cargar(); };
    $('#ec_tipo').onclick = e => { const t = e.target.closest('[data-t]'); if (!t) return; document.querySelectorAll('#ec_tipo button').forEach(x => x.classList.toggle('on', x === t)); $('#ec_pacw').style.display = t.dataset.t === 'pac' ? '' : 'none'; $('#ec_nuw').style.display = t.dataset.t === 'nuevo' ? '' : 'none'; $('#ec_evw').style.display = t.dataset.t === 'ev' ? '' : 'none'; };
    $('#ec_go').onclick = guardar;
    $('#ec_fecha').onchange = $('#ec_hora').onchange = $('#ec_dur').onchange = $('#ec_mod').onchange = consultorios; $('#ec_tipo').addEventListener('click', consultorios); consultorios();
  };
  const consultorios = async () => {
    const w = $('#ec_consw'); if (!w) return;
    const ev = $('#ec_tipo .on').dataset.t === 'ev', ini = new Date($('#ec_fecha').value + 'T' + $('#ec_hora').value), dur = Math.max(5, +$('#ec_dur').value || 60);
    if (ev || $('#ec_mod').value !== 'Presencial' || isNaN(ini)) { w.style.display = 'none'; $('#ec_cons').innerHTML = ''; return; }
    let L; try { L = await api('/consultorios?inicio=' + encodeURIComponent(ini.toISOString()) + '&duracion=' + dur, { pro }); } catch (e) { return; }
    const cur = $('#ec_cons').value; w.style.display = L.length ? '' : 'none';
    $('#ec_cons').innerHTML = '<option value="">Sin consultorio</option>' + L.map(c => `<option value="${c.id}" ${c.libre ? '' : 'disabled'} ${String(c.id) === cur ? 'selected' : ''}>${esc(c.name)}${c.libre ? '' : ' — no disponible (' + esc(c.motivo.toLowerCase()) + ')'}</option>`).join('');
  };
  const cargar = async () => {
    try { const r = await api('/records', { pro }); pats = r.filter(o => o.kind === 'patient' && !o.esGrupo).sort((a, c) => fullName(a).localeCompare(fullName(c), 'es')); citas = r.filter(o => o.kind === 'appt'); }
    catch (e) { toast(e.message); pats = []; citas = []; }
    const v = { f: $('#ec_fecha') && $('#ec_fecha').value, h: $('#ec_hora') && $('#ec_hora').value, d: $('#ec_dur') && $('#ec_dur').value, m: $('#ec_mod') && $('#ec_mod').value };
    pintar(); if (v.f) { $('#ec_fecha').value = v.f; $('#ec_hora').value = v.h; $('#ec_dur').value = v.d; $('#ec_mod').value = v.m; }
  };
  const guardar = async () => {
    const tipo = $('#ec_tipo .on').dataset.t, ev = tipo === 'ev', nuevo = tipo === 'nuevo', f = $('#ec_fecha').value, h = $('#ec_hora').value, dur = Math.max(5, Math.min(600, +$('#ec_dur').value || 60));
    const pid = $('#ec_pac').value, tit = $('#ec_ev').value.trim();
    const nn = nuevo ? { nombres: $('#ec_nn').value.trim(), apellidos: $('#ec_na').value.trim(), correo: $('#ec_nc').value.trim(), telefono: $('#ec_nt').value.trim() } : null;
    if (ev ? !tit : nuevo ? !nn.nombres || !nn.apellidos : !pid) { toast(ev ? 'Escribe el título del evento.' : nuevo ? 'Escribe los nombres y apellidos del consultante nuevo.' : 'Elige un consultante.'); return; }
    const ini = new Date(f + 'T' + h); if (!f || !h || isNaN(ini)) { toast('Indica fecha y hora válidas.'); return; }
    if (!ev && $('#ec_mod').value === 'Presencial' && $('#ec_consw').style.display !== 'none' && !$('#ec_cons').value) { toast('Elige un consultorio para la cita presencial.'); return; }
    const fin = ini.getTime() + dur * 60000, cruza = citas.some(a => a.estado !== 'Cancelada' && new Date(a.startAt).getTime() < fin && new Date(a.startAt).getTime() + (a.duracion || 50) * 60000 > ini.getTime());
    const x = { id: newId('a'), kind: 'appt', createdAt: nowISO(), ...(ev ? { evento: tit } : nuevo ? { nuevo: nn } : { patientId: pid }), startAt: ini.toISOString(), duracion: dur, modalidad: $('#ec_mod').value, estado: 'Programada', ...(!ev && $('#ec_mod').value === 'Presencial' && $('#ec_cons').value ? { consultorioId: +$('#ec_cons').value } : {}) };
    const bt = $('#ec_go'); bt.disabled = true;
    try { await api('/records/' + encodeURIComponent(x.id), { method: 'PUT', body: x, pro }); }
    catch (e) { bt.disabled = false; toast(e.message); return; }
    cerrar(); AG.fecha = f; toast(cruza ? 'Cita guardada. Ojo: se cruza con otra cita del terapeuta.' : 'Cita guardada.'); empLoad();
  };
  await cargar();
};

/* Reservas de la empresa: un solo enlace en el que el consultante elige terapeuta y agenda en su horario. */
ACT.empReservas = async () => {
  const root = $('#modal-root'); let r;
  try { r = await api('/empresa/reservas'); } catch (e) { toast(e.message); return; }
  const url = () => location.origin + '/reservar?e=' + r.slug;
  const guardar = async (o) => { try { r = await api('/empresa/reservas', { method: 'PUT', body: Object.assign({ activo: r.activo, renovar: false }, o) }); pintar(); } catch (e) { toast(e.message); } };
  const pintar = () => {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Reservas de la empresa"><div class="box" style="width:min(620px,100%)"><div class="row" style="justify-content:space-between"><h3>Reservas de la empresa</h3><button class="btn sm mx" id="er_x" aria-label="Cerrar">✕</button></div>
    <p style="margin:0">Con este enlace, tus consultantes eligen un terapeuta de la empresa, ven su horario libre y agendan. Cada terapeuta marca su horario en su propia cuenta (Agenda → Reservas).</p>
    <label class="check"><input type="checkbox" id="er_on" ${r.activo ? 'checked' : ''}> <span>Enlace activo</span></label>
    ${r.slug ? `<div class="row"><input type="text" id="er_url" readonly value="${esc(url())}" style="flex:1"><button class="btn" id="er_copy">Copiar</button></div><div class="row"><button class="btn sm" id="er_ren">Generar un enlace nuevo</button><span class="ts">El enlace anterior deja de funcionar.</span></div>` : ''}
    <div class="sec"><h3>Terapeutas en el enlace</h3>${r.profesionales.length ? `<table class="sttab"><tbody>${r.profesionales.map(u => `<tr><td>${esc(u.name)}</td><td>${!u.active ? 'Desactivado' : !u.suscrito ? 'Sin suscripción: no aparece' : u.horario ? '<b>Aparece</b> en el enlace' : 'Sin horario: debe activarlo en Agenda → Reservas'}</td></tr>`).join('')}</tbody></table>` : '<p class="stnote">Aún no hay terapeutas.</p>'}
    <p style="margin:0;font-size:13px;color:var(--muted)">Los correos de confirmación salen de la cuenta de cada terapeuta; si no tiene correo de envío configurado, no aparece.</p></div></div></div>`;
    $('#er_x').onclick = () => { root.innerHTML = ''; };
    $('#er_on').onchange = e => guardar({ activo: e.target.checked });
    if ($('#er_copy')) $('#er_copy').onclick = async () => { try { await navigator.clipboard.writeText(url()); toast('Enlace copiado.'); } catch (e) { $('#er_url').select(); toast('Copie el enlace con Ctrl+C.'); } };
    if ($('#er_ren')) $('#er_ren').onclick = () => { if (confirm('El enlace actual dejará de funcionar. ¿Generar uno nuevo?')) guardar({ renovar: true }); };
  };
  pintar();
};

/* ===== Secretarios de la empresa (solo el administrador): los crea por correo y decide a qué secciones entra cada uno ===== */
const EMP_SEC_SECS = [['pros', 'Profesionales y sus pacientes'], ['agenda', 'Agenda'], ['cons', 'Consultorios'], ['fin', 'Finanzas'], ['stats', 'Estadísticas'], ['notas', 'Notas del administrador (privadas)']];
async function empSecretarios() {
  const box = $('#emp_sec_box'); if (!box) return;
  const pintar = async () => {
    let L; try { L = (await api('/empresa')).empresa.secretarios || []; } catch (e) { box.innerHTML = '<p class="stnote" style="margin:0">No se pudo cargar el apoyo administrativo.</p>'; return; }
    box.innerHTML = `<b>Apoyo administrativo</b><p style="margin:0 0 10px;font-size:13px;color:var(--muted)">La empresa puede tener una persona de apoyo administrativo, que entra a la vista de administrador y trabaja en las secciones que tú le dejes. No cambia permisos, logo ni apoyo administrativo, y no ve contenido clínico. Recibe un correo para elegir su contraseña.</p>
      ${L.length ? '' : `<div class="row"><input id="sec_nombre" placeholder="Nombre" aria-label="Nombre de la persona de apoyo" style="flex:1;min-width:120px"><input id="sec_correo" type="email" placeholder="correo@ejemplo.com" aria-label="Correo de la persona de apoyo" style="flex:1;min-width:160px"><button class="btn pri sm" id="sec_crear" type="button">Crear apoyo administrativo</button></div>`}
      ${L.map(x => `<div class="card" data-sec="${x.id}" style="margin-top:10px"><div class="row" style="justify-content:space-between;align-items:center"><span><b>${esc(x.name)}</b><br><small class="muted">${esc(x.email)}</small></span><span>${!x.active ? empChip('Desactivado', 'danger') : x.pendiente ? empChip('Aún no eligió su contraseña') : empChip('Activo', 'ok')}</span></div>
        ${EMP_SEC_SECS.map(([k, t]) => `<label class="check"><input type="checkbox" data-sk="${k}" ${x.permisos[k] ? 'checked' : ''}> <span>${t}</span></label>`).join('')}
        <div class="row" style="margin-top:6px"><button class="btn sm" data-sa="invitar" type="button">Enviar correo de acceso</button><button class="btn sm ${x.active ? 'warn' : ''}" data-sa="${x.active ? 'off' : 'on'}" type="button">${x.active ? 'Desactivar' : 'Activar'}</button></div></div>`).join('')}`;
    if ($('#sec_crear')) $('#sec_crear').onclick = async () => {
      const name = $('#sec_nombre').value.trim(), email = $('#sec_correo').value.trim();
      if (!name || !email) { toast('Escribe el nombre y el correo.'); return; }
      try { const r = await api('/empresa/secretarios', { method: 'POST', body: { name, email } }); toast(r.correoEnviado ? 'Apoyo administrativo creado. Le llegó un correo para elegir su contraseña.' : 'Apoyo administrativo creado. El envío de correos no está disponible: usa «Enviar correo de acceso» luego.'); pintar(); } catch (e) { toast(e.message); }
    };
    box.querySelectorAll('[data-sec]').forEach(c => {
      const id = c.dataset.sec;
      c.querySelectorAll('[data-sk]').forEach(i => { i.onchange = async () => { try { await api('/empresa/secretarios/' + id, { method: 'PATCH', body: { permisos: { [i.dataset.sk]: i.checked } } }); toast('Permisos guardados.'); } catch (e) { toast(e.message); i.checked = !i.checked; } }; });
      c.querySelectorAll('[data-sa]').forEach(b => { b.onclick = async () => {
        try {
          if (b.dataset.sa === 'invitar') { await api(`/empresa/secretarios/${id}/invitar`, { method: 'POST' }); toast('Correo enviado.'); }
          else { await api('/empresa/secretarios/' + id, { method: 'PATCH', body: { active: b.dataset.sa === 'on' } }); pintar(); }
        } catch (e) { toast(e.message); } }; });
    });
  };
  pintar();
}
