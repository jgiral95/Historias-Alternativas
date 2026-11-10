/* Modo servidor (ingreso, cuenta, usuarios) y arranque de la app: va de último. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ----- Modo servidor: acceso, cuenta y usuarios ----- */
async function startApp() {
  if (S.mode === 'server' && S.user && S.user.cambiarClave) { renderFirstPassword(); return; }
  if (S.mode === 'server') await syncClock();
  S.pid = null; S.draft = false; S.tab = 'datos'; S.view = 'patients'; Idle.last = Idle.ping = Date.now();
  try { await Store.load(); } catch (e) { toast('No se pudieron cargar los datos guardados.'); if (!S.profile) S.profile = { id: 'profile', kind: 'profile' }; }
  S.loading = false; render(); fbMount(); welcome();
  Promise.all([svLoad(), remLoad(), firmasSync()]).then(() => { if (S.view === 'patients' && !S.pid && !$('.modal') && !S.dirty && !$('#acmenu.open') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) render(); });
}
/* El servidor web responde pero la API no: nunca pasar a modo local con datos de consultantes. */
function renderDown() {
  $('#modal-root').innerHTML = '';
  $('#app').innerHTML = `<div class="panel" style="max-width:440px;margin:8vh auto 0"><div class="body">
    <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div>
    <div class="banner" role="alert"><b>El servidor no responde.</b> La página cargó, pero el servicio de la aplicación no está disponible en este momento. Puede estar reiniciándose después de una actualización.</div>
    <p style="margin:0;color:var(--muted);font-size:14px">Espere un minuto y pulse «Reintentar». Si sigue igual, avise al administrador.</p>
    <button class="btn pri" id="dn_retry">Reintentar</button></div></div>`;
  $('#dn_retry').onclick = () => location.reload();
  clearTimeout(renderDown.t); renderDown.t = setTimeout(() => location.reload(), 30000);
}
/* Cuenta nueva con correo: se envía un enlace para confirmarlo y la cuenta se crea al abrirlo. */
function renderRegistro(msg, v) {
  v = v || {};
  $('#app').innerHTML = `<div class="panel" style="max-width:400px;margin:8vh auto 0"><form class="body" id="regform" autocomplete="on">
    <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div><p style="margin:0;color:var(--muted)">Cree su cuenta para empezar.</p>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}
    <div class="fld"><label for="rg_name">Nombre completo</label><input id="rg_name" autocomplete="name" value="${esc(v.name || '')}" required></div>
    <div class="fld"><label for="rg_email">Correo</label><input id="rg_email" type="email" autocomplete="username" value="${esc(v.email || '')}" required></div>
    <div class="fld"><label for="rg_pass">Contraseña</label><input id="rg_pass" type="password" autocomplete="new-password" minlength="10" required></div>
    <div class="fld"><label for="rg_pass2">Confirmar contraseña</label><input id="rg_pass2" type="password" autocomplete="new-password" minlength="10" required></div>
    <button class="btn pri" type="submit">Crear cuenta</button>
    <button class="btn" type="button" id="rg_back">Ya tengo cuenta</button>
    <a class="btn" href="/" style="display:flex;align-items:center;justify-content:center;text-decoration:none">← Volver al inicio</a></form></div>`;
  $('#rg_back').onclick = () => renderLogin();
  $('#regform').onsubmit = async ev => {
    ev.preventDefault();
    const b = { name: $('#rg_name').value.trim(), email: $('#rg_email').value.trim(), password: $('#rg_pass').value };
    if (b.password !== $('#rg_pass2').value) { renderRegistro('Las contraseñas no coinciden.', b); return; }
    try {
      await api('/auth/register', { method: 'POST', body: b, noRedirect: true });
      $('#app').innerHTML = `<div class="panel" style="max-width:400px;margin:8vh auto 0"><div class="body">
        <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div><h2 style="margin:0">Revise su correo</h2>
        <p style="margin:0">Enviamos un enlace de confirmación a <b>${esc(b.email)}</b>. Ábralo para activar su cuenta (vale 24 horas). Si no lo ve, revise la carpeta de spam.</p>
        <button class="btn" id="rg_ok">Volver al ingreso</button></div></div>`;
      $('#rg_ok').onclick = () => renderLogin('', b.email);
    } catch (err) { renderRegistro(err.message, b); }
  };
}
function renderLogin(msg, email) {
  $('#modal-root').innerHTML = ''; $('#fb-root').innerHTML = '';
  $('#app').innerHTML = `<div class="panel" style="max-width:400px;margin:8vh auto 0"><form class="body" id="loginform" autocomplete="on">
    <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div><p style="margin:0;color:var(--muted)">Ingrese con su cuenta para ver sus fichas.</p><p style="margin:6px 0 0;color:var(--muted);font-size:12px">Seguimiento de bienestar con terapias alternativas: no es una herramienta clínica ni sus usuarios son profesionales de la salud.</p>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}
    <div class="fld"><label for="lg_email">Correo</label><input id="lg_email" type="email" autocomplete="username" value="${esc(email || '')}" required></div>
    <div class="fld"><label for="lg_pass">Contraseña</label><input id="lg_pass" type="password" autocomplete="current-password" required></div>
    <button class="btn pri" type="submit">Ingresar</button><button class="btn" type="button" id="lg_reg">Crear cuenta</button><p style="margin:0;font-size:13px;text-align:center"><a href="privacidad" target="_blank" rel="noopener" style="color:var(--muted)">Política de privacidad</a></p></form></div>`;
  $('#lg_reg').onclick = () => renderRegistro();
  $('#loginform').onsubmit = async ev => {
    ev.preventDefault();
    const em = $('#lg_email').value.trim(), pw = $('#lg_pass').value;
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: em, password: pw }, noRedirect: true });
      if (r.need_2fa) { renderCode(r.ticket, em, '', r.remember_days); return; }
      S.user = r; await startApp();
    } catch (err) { renderLogin(err.message, em); }
  };
  if (!TOUCH()) (email ? $('#lg_pass') : $('#lg_email')).focus();  // en celular, el foco abriría el teclado y acercaría la página
}
/* Segundo paso del ingreso: código de la app autenticadora o un código de recuperación. */
const CODE_INPUT = id => `<input id="${id}" type="text" inputmode="text" autocomplete="one-time-code" maxlength="12" placeholder="123456" required style="font-family:var(--f-mono);font-size:20px;letter-spacing:.15em;text-align:center">`;
function renderCode(ticket, email, msg, days, keep) {
  $('#app').innerHTML = `<div class="panel" style="max-width:400px;margin:8vh auto 0"><form class="body" id="codeform" autocomplete="off">
    <div class="brand">${logoSVG(60)}<b>Alter-Karute</b></div>
    <p style="margin:0"><b>Verificación en dos pasos.</b> Escriba el código de 6 dígitos que muestra su app autenticadora para ${esc(email)}.</p>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}
    <div class="fld"><label for="lg_code">Código</label>${CODE_INPUT('lg_code')}</div>
    ${days ? `<label class="chk" style="display:flex;gap:8px;align-items:flex-start;font-size:14px"><input type="checkbox" id="lg_remember" ${keep === false ? '' : 'checked'} style="margin-top:3px;accent-color:var(--accent)"><span>Recordar este dispositivo: no volver a pedir el código aquí mientras se use al menos una vez cada ${days} días. No lo marque en un equipo compartido.</span></label>` : ''}
    <button class="btn pri" type="submit">Verificar</button>
    <p style="margin:0;font-size:13px;color:var(--muted)">¿No tiene el teléfono? Escriba uno de sus códigos de recuperación (por ejemplo <span style="font-family:var(--f-mono)">abcd-2345</span>). Si los perdió, pida al administrador que quite la verificación de su cuenta.</p>
    <button class="btn sm" type="button" id="lg_back">Volver</button></form></div>`;
  $('#lg_back').onclick = () => renderLogin('', email);
  $('#codeform').onsubmit = async ev => {
    ev.preventDefault();
    const b = $('#codeform button[type=submit]'); setBusy(b, true);
    const remember = !!($('#lg_remember') && $('#lg_remember').checked);
    try { S.user = await api('/auth/2fa/login', { method: 'POST', body: { ticket, code: $('#lg_code').value.trim(), remember }, noRedirect: true }); await startApp(); }
    catch (err) { if (err.status === 401 && /venció/.test(err.message)) renderLogin(err.message, email); else renderCode(ticket, email, err.message, days, remember); }
  };
  if (!TOUCH()) $('#lg_code').focus();
}
function hasLocal() { const l = Store.localRead(); return !!(l && ((l.patients || []).length || (l.notes || []).length)); }
async function doLogout(msg) {
  try { await api('/auth/logout', { method: 'POST', noRedirect: true }); } catch (e) { /* igual se cierra en pantalla */ }
  S.user = null; S.profile = null; S.patients = []; S.notes = []; S.reports = []; S.appts = []; S.files = []; S.scales = []; S.pid = null; S.view = 'patients'; hideIdleWarn(); renderLogin(msg);
}
ACT.logout = () => doLogout();
ACT.importLocal = async () => {
  const l = Store.localRead(); if (!l) return;
  let n = 0;
  const put = o => { if (o && o.id) { n++; return Store.save(o, { import: true }); } };
  (l.patients || []).forEach(put); (l.notes || []).forEach(put); (l.reports || []).forEach(put); (l.appts || []).forEach(put); (l.scales || []).forEach(put);
  if (l.profile && !S.profile.nombre) { S.profile = l.profile; put(S.profile); }
  (l.patients || []).forEach(o => { if (!S.patients.some(x => x.id === o.id)) S.patients.push(o); });
  (l.notes || []).forEach(o => { if (!S.notes.some(x => x.id === o.id)) S.notes.push(o); });
  (l.reports || []).forEach(o => { if (!S.reports.some(x => x.id === o.id)) S.reports.push(o); });
  (l.appts || []).forEach(o => { if (!S.appts.some(x => x.id === o.id)) S.appts.push(o); });
  (l.scales || []).forEach(o => { if (!S.scales.some(x => x.id === o.id)) S.scales.push(o); });
  await Store.chain; toast(n + ' registros enviados al servidor.'); render();
};
ACT.dropLocal = b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: borrar copia local'; return; }
  try { localStorage.removeItem('archivo_clinico'); } catch (e) { /* nada */ }
  toast('Copia local borrada de este navegador.'); render();
};
/* Usuarios (administrador): buscador y, dentro de cada terapeuta, las cuentas de su equipo. */
function userCard(u, sub) {
  const role = u.role === 'admin' ? 'Administrador' : u.role === 'asistente' ? 'Equipo' : 'Terapeuta';
  return `<div class="card ${sub ? 'usub' : ''}"><div class="row" style="justify-content:space-between"><span><b>${esc(u.name)}</b><br><span class="ts">${esc(u.email)}</span></span><span class="row"><span class="chip ${u.role === 'admin' ? '' : 'warn'}">${role}</span><span class="chip ${u.active ? 'ok' : 'danger'}">${u.active ? 'Activa' : 'Inactiva'}</span>${u.totp ? '<span class="chip ok">2 pasos</span>' : ''}${u.cambiarClave ? '<span class="chip warn">Debe cambiar la contraseña</span>' : ''}</span></div>
    <div class="row"><button class="btn sm" data-u="toggle" data-id="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'Desactivar' : 'Reactivar'}</button>${u.role === 'asistente' ? '' : `<button class="btn sm" data-u="role" data-id="${u.id}" data-role="${u.role}">${u.role === 'admin' ? 'Quitar administrador' : 'Hacer administrador'}</button>`}
    <input type="password" id="rp_${u.id}" placeholder="Nueva contraseña (mín. 10)" aria-label="Nueva contraseña de ${esc(u.name)}" style="max-width:220px;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:5px 8px"><button class="btn sm" data-u="reset" data-id="${u.id}">Restablecer contraseña</button>${u.totp ? `<button class="btn sm warn" data-u="no2fa" data-id="${u.id}">Quitar verificación en dos pasos</button>` : ''}</div></div>`;
}
ACT.users = async () => {
  const root = $('#modal-root'); let list = [], q = '';
  const open = new Set();
  const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const drawList = () => {
    const hit = u => !q || fold(u.name + ' ' + u.email).includes(fold(q));
    const team = {}; list.filter(u => u.role === 'asistente').forEach(u => { (team[u.ownerId] = team[u.ownerId] || []).push(u); });
    const pros = list.filter(u => u.role !== 'asistente').sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const orphans = list.filter(u => u.role === 'asistente' && !pros.some(p => p.id === u.ownerId));
    const shown = pros.filter(p => hit(p) || (team[p.id] || []).some(hit));
    const html = shown.map(p => {
      const t = (team[p.id] || []).sort((a, b) => a.name.localeCompare(b.name, 'es')), tm = q ? t.filter(hit) : t, showOpen = open.has(p.id) || (q && tm.length && !hit(p));
      return `<div class="ugroup">${userCard(p)}${t.length ? `<details class="uteam" data-owner="${p.id}" ${showOpen || (q && tm.length) ? 'open' : ''}><summary>Equipo de ${esc(p.name.split(' ')[0])} (${t.length})${q && tm.length !== t.length ? ` · ${tm.length} coincide${tm.length === 1 ? '' : 'n'}` : ''}</summary>${(q && !hit(p) ? tm : t).map(u => userCard(u, true)).join('')}</details>` : ''}</div>`;
    }).join('') + (orphans.filter(hit).length ? `<div class="ugroup"><b class="ts">Cuentas de equipo sin terapeuta</b>${orphans.filter(hit).map(u => userCard(u, true)).join('')}</div>` : '');
    $('#u_list').innerHTML = html || '<p class="stnote">Ningún usuario coincide con la búsqueda.</p>';
    $('#u_count').textContent = `${pros.length} terapeuta${pros.length === 1 ? '' : 'es'} · ${list.length - pros.length} cuenta${list.length - pros.length === 1 ? '' : 's'} de equipo`;
  };
  const load = async () => { try { list = await api('/admin/users'); } catch (e) { toast(e.message); return false; } return true; };
  if (!(await load())) return;
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Usuarios"><div class="box" id="uform" style="max-width:820px"><div class="row" style="justify-content:space-between"><h3>Usuarios</h3><button class="btn sm" id="ucl">Cerrar</button></div>
    <div class="row"><input type="search" id="u_q" placeholder="Buscar por nombre o correo (también en los equipos)" aria-label="Buscar usuarios" style="flex:1;min-width:220px"><span class="ts" id="u_count"></span></div>
    <div id="u_list" class="ulist"></div>
    <div class="card"><h3>Nuevo usuario</h3><div class="grid">${F('Nombre', 'uname', '')}${F('Correo', 'uemail', '', { type: 'email' })}${F('Contraseña inicial (mín. 10)', 'upass', '', { type: 'password' })}${F('Rol', 'urole', 'Terapeuta', { type: 'select', opts: ['Terapeuta', 'Administrador'] })}</div><div class="row end"><button class="btn pri" data-u="create">Crear usuario</button></div></div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Cada terapeuta ve únicamente sus propios consultantes. Las cuentas de equipo (asistentes, secretarias) las crea cada terapeuta y aparecen dentro de su usuario. Los usuarios no se eliminan: se desactivan, y sus registros se conservan.</p></div></div>`;
  $('#ucl').onclick = () => { root.innerHTML = ''; root.onclick = null; };
  $('#u_q').oninput = e => { q = e.target.value.trim(); drawList(); };
  $('#u_list').addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.uteam') && !q) { if (d.open) open.add(+d.dataset.owner); else open.delete(+d.dataset.owner); } }, true);
  root.onclick = async e => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.u;
    try {
      if (act === 'toggle') await api('/admin/users/' + id, { method: 'PATCH', body: { active: b.dataset.active !== '1' } });
      else if (act === 'role') await api('/admin/users/' + id, { method: 'PATCH', body: { role: b.dataset.role === 'admin' ? 'user' : 'admin' } });
      else if (act === 'no2fa') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: quitar 2 pasos'; return; } await api('/admin/users/' + id, { method: 'PATCH', body: { reset_2fa: true } }); toast('Verificación en dos pasos quitada. El usuario puede volver a activarla.'); }
      else if (act === 'reset') { const pw = $('#rp_' + id).value; if (!pw) { toast('Escriba la nueva contraseña.'); return; } await api('/admin/users/' + id, { method: 'PATCH', body: { password: pw } }); toast('Contraseña restablecida. Deberá cambiarla al entrar.'); }
      else if (act === 'create') { const o = readForm($('#uform'), {}); await api('/admin/users', { method: 'POST', body: { name: o.uname, email: o.uemail, password: o.upass, role: o.urole === 'Administrador' ? 'admin' : 'user' } }); toast('Usuario creado. Deberá elegir su contraseña al entrar.'); ['uname', 'uemail', 'upass'].forEach(k => { $('#f_' + k).value = ''; }); }
      if (await load()) drawList();
    } catch (err) { toast(err.message); }
  };
  drawList(); $('#u_q').focus();
};

/* ----- Arranque ----- */
/* Que el navegador no ofrezca guardar (ni llenar) los datos de los consultantes como si fueran los del usuario
   («¿Guardar dirección?», «¿Guardar datos de contacto?»). Chrome ignora autocomplete="off", pero no llena ni ofrece guardar
   campos con un valor de autocomplete que no reconoce; los gestores de contraseñas respetan sus propias marcas.
   Se aplica a todo campo sin autocomplete propio (el ingreso y las contraseñas sí lo tienen); un «off» cuenta como sin
   autocomplete, porque Chrome lo ignora. Los campos tel y email se vuelven texto (con inputmode, para conservar el teclado
   del celular): Chrome los reconoce como teléfono o correo por el tipo, aunque el autocomplete no sea conocido. */
const NOFILL_SKIP = /^(password|hidden|checkbox|radio|file|submit|button|range|color)$/;
function noAutofill(root) {
  (root.querySelectorAll ? root.querySelectorAll('input, textarea, select') : []).forEach(el => {
    const ac = el.getAttribute('autocomplete');
    if ((ac && ac.toLowerCase() !== 'off') || NOFILL_SKIP.test(el.type) || el.closest('#loginform')) return;
    // Opaco a propósito: Chrome busca palabras como «direccion» o «telefono» en el name y el autocomplete.
    const tok = 'hc-' + [...(el.dataset.f || el.id || 'campo')].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);
    if (el.type === 'tel' || el.type === 'email') { el.setAttribute('inputmode', el.type === 'tel' ? 'tel' : 'email'); el.type = 'text'; }
    if (!el.name) el.name = tok;
    el.setAttribute('autocomplete', tok);
    el.setAttribute('data-1p-ignore', ''); el.setAttribute('data-lpignore', 'true'); el.setAttribute('data-bwignore', ''); el.setAttribute('data-form-type', 'other');
  });
}
new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { noAutofill(n); if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName)) noAutofill(n.parentNode); } }))).observe(document.documentElement, { childList: true, subtree: true });
(async function boot() {
  const app = $('#app');
  const NAV = ['open', 'openHit', 'tab', 'home', 'view', 'newPatient', 'back', 'cancelNote', 'cancelReport', 'cancelScale', 'cancelRe', 'cancelSol', 'cancelIncorp', 'cancelDraft', 'newNote', 'newReport', 'newScale', 'reConsent', 'newDataAuth', 'newSol', 'newIncorp', 'apptEvol', 'editNote', 'editReport', 'logout', 'profile', 'scaleManage'];
  app.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && S.dirty && NAV.includes(t.dataset.act) && !t.dataset.hub) { e.stopImmediatePropagation(); askDiscard(() => { S.dirty = false; t.click(); }); } }, true);
  app.addEventListener('input', e => { if (e.target.closest(DIRTY_SEL)) S.dirty = true; }, true);
  app.addEventListener('pointerdown', e => { if (e.target.closest('.sigbox') && e.target.closest(DIRTY_SEL)) S.dirty = true; }, true);
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  app.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!e.target.closest('.avwrap')) closeMenu(); else if (b && b.dataset.act !== 'menu' && b.dataset.act !== 'theme') closeMenu(); if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b, e); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('#acmenu'); if (m && m.classList.contains('open')) { closeMenu(); const t = $('[data-act="menu"]'); if (t) t.focus(); return; }
    if (e.defaultPrevented) return;
    const mo = $('#modal-root .modal'); if (!mo) return;
    const x = [...mo.querySelectorAll('button, a.btn')].find(b => /^(Cerrar|Cancelar|Listo)$/.test(b.textContent.trim()));
    if (x) { e.preventDefault(); x.click(); } } });
  $('#modal-root').addEventListener('click', e => { const h = e.target.closest('[data-hub]'); if (!h) return; e.stopPropagation(); e.preventDefault(); openHub(h.dataset.hub); }, true);
  app.addEventListener('click', e => { const t = e.target.closest('[data-dx]'); if (t && t.tagName === 'BUTTON') { e.preventDefault(); dxClick(t); } else if (!e.target.closest('#dxsearch')) { const b = $('#dx_res'); if (b && !b.hidden) dxShow([]); } });
  app.addEventListener('keydown', e => { if (e.target.id === 'dx_q') dxKey(e); });
  app.addEventListener('input', e => {
    if (e.target.id === 'nl_q') { NL.q = e.target.value; NL.n = 25; nlRedraw(); return; }
    if (e.target.id === 'f_tele_plataforma') { const w = $('#telewarn'); if (w) w.hidden = !badPlatform(e.target.value); }
    if (e.target.id !== 'q') return;
    S.q = e.target.value;
    if (!$('#rows')) { S.view = 'patients'; S.pid = null; S.draft = false; render(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    else $('#rows').innerHTML = rowsHTML();
  });
  app.addEventListener('toggle', e => { const d = e.target; if (d.classList && d.classList.contains('fold')) foldSave(d.dataset.fold, d.open); }, true);
  app.addEventListener('toggle', e => {
    const d = e.target; if (!d.classList || !d.classList.contains('pgroup') || S.q) return;
    S.openGroups = (S.openGroups || ['Activo']).filter(k => k !== d.dataset.g).concat(d.open ? [d.dataset.g] : []);
  }, true);
  app.addEventListener('change', e => {
    if (e.target.id === 'f_modalidad' && $('#teleslot') && e.target.closest('#noteform, #intakeform')) {
      const slot = $('#teleslot');
      if (!isRemote(e.target.value)) slot.innerHTML = '';
      else if (!$('#teleblock')) slot.innerHTML = teleBlock({ modalidad: e.target.value });
    }
    if (e.target.id === 'f_estado' && $('#razonwrap')) $('#razonwrap').hidden = e.target.value === 'Activo';
    if (e.target.id === 'f_paisRes' && $('[data-city]')) { const col = inCol({ paisRes: e.target.value }); $('[data-city="co"]').hidden = !col; $('[data-city="ext"]').hidden = col; }
    if (e.target.id === 'f_servicio' && $('#lkslot')) { const p = curPatient(); $('#lkslot').innerHTML = linksHTML(Object.assign({}, p, { servicio: e.target.value })); }
    if (e.target.id === 'st_per') { S.stPer = e.target.value; render(); return; }
    if (e.target.id === 'st_test') { S.stTest = e.target.checked; render(); return; }
    if (e.target.id === 'nl_all') { NL.all = e.target.checked; NL.n = 25; nlRedraw(); return; }
    if (e.target.id === 'nl_per' || e.target.id === 'nl_tipo') { NL[e.target.id === 'nl_per' ? 'per' : 'tipo'] = e.target.value; NL.n = 25; nlRedraw(); return; }
    if (e.target.dataset && e.target.dataset.dx && /^(tipo|estado):/.test(e.target.dataset.dx)) { const [f, k] = e.target.dataset.dx.split(':'), d = Dx.items[+k]; if (d) { d[f] = e.target.value; S.dirty = true; dxRedraw(); } }
    if (e.target.name && e.target.name.startsWith('sc_')) updateScaleTotal();
    if (e.target.id === 'f_escala') { S.newScale = e.target.value; render(); return; }
    if (e.target.id === 'f_consentTipo') {
      const ta = $('#f_consentText'), want = consentText(curPatient(), e.target.value);
      if (ta.dataset.auto === '1' || ta.value === ta.dataset.last) { ta.value = want; ta.dataset.last = want; ta.dataset.auto = '1'; }
      else toast('El texto ya tiene cambios: agregue a mano las cláusulas de la nueva modalidad.');
    }
    if (e.target.id === 'f_consentText') e.target.dataset.auto = '0';
    if (e.target.id === 'f_plantilla' && $('#f_contenido')) {
      const ta = $('#f_contenido'), ti = $('#f_tipo'), key = e.target.value;
      if (!ta.value.trim() || ta.value === ta.dataset.tpl) { const txt = reportTemplate(key, curPatient(), S.profile); ta.value = txt; ta.dataset.tpl = txt; }
      else toast('El texto ya tiene cambios. Use «Regenerar desde plantilla» para reemplazarlo.');
      if (!ti.value.trim() || ti.value === ti.dataset.auto) { ti.value = tplName(key); ti.dataset.auto = ti.value; }
    }
  });
  await Store.init();
  if (S.mode === 'down') { renderDown(); return; }
  const qs = new URLSearchParams(location.search), vt = qs.get('verificar');
  if (S.mode === 'server' && !S.user && vt) {
    history.replaceState(null, '', location.pathname);
    try { S.user = await api('/auth/verify', { method: 'POST', body: { token: vt }, noRedirect: true }); }
    catch (err) { renderLogin(err.message); return; }
  }
  if (S.mode === 'server' && !S.user) { if (qs.get('registro')) renderRegistro(); else renderLogin(); return; }
  await startApp();
  const gq = new URLSearchParams(location.search).get('google');
  if (gq && S.user) {
    history.replaceState(null, '', location.pathname);
    S.view = 'agenda'; render();
    toast(gq === 'ok' ? 'Google Calendar conectado. Sus citas se están copiando.' : gq === 'cancel' ? 'No se concedió el permiso en Google.' : 'No se pudo conectar con Google. Intente de nuevo.');
    if (gq === 'ok') ACT.gcal();
  }
})();
