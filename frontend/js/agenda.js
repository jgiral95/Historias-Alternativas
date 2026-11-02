/* Agenda, nota de cierre y bloqueo por inactividad. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Agenda ===== */
const APPT_EST = ['Programada', 'Atendida', 'No asistió', 'Cancelada'];
const MODS = ['Presencial', 'Virtual', 'Telefónica'];
const dayKey = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const mondayOf = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hhmm = iso => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const patName = id => { const p = S.patients.find(x => x.id === id); return p ? fullName(p) : 'Consultante eliminado'; };
const apptsOn = key => S.appts.filter(a => dayKey(new Date(a.startAt)) === key).sort((a, b) => a.startAt.localeCompare(b.startAt));
const remChip = a => { const c = a.confirmacion && a.confirmacion.estado, r = S.rem && S.rem.items && S.rem.items[a.id]; return c === 'Confirmada' ? ' · ✓ confirmó' : c ? ' · canceló' : r && r.enviado ? ' · recordada' : ''; };
function apptBtn(a) {
  return `<button class="ap ${esc((a.estado || 'Programada').replace(/\s/g, '-'))}" data-act="apptEdit" data-id="${a.id}"><b>${esc(hhmm(a.startAt))}</b><span>${esc(patName(a.patientId))}</span><small>${esc(remChip(a).replace(/^ · /, '') ? remChip(a).replace(/^ · /, '') + ' · ' : '')}${esc([a.duracion ? a.duracion + ' min' : '', a.modalidad, a.estado && a.estado !== 'Programada' ? a.estado : ''].filter(Boolean).join(' · '))}</small></button>`;
}
/* Vista de la agenda (día, semana o mes): preferencia de este navegador. */
const AG_VIEWS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];
function agView() { if (!S.agView) { try { S.agView = localStorage.getItem('ac_agview') || 'semana'; } catch (e) { S.agView = 'semana'; } } return AG_VIEWS.some(v => v[0] === S.agView) ? S.agView : 'semana'; }
const agAnchor = () => S.agDate ? new Date(S.agDate + 'T12:00:00') : (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
function agendaHTML() {
  const v = agView(), anchor = agAnchor(), today = dayKey(new Date());
  const fmt = d => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  let title, body;
  if (v === 'dia') {
    const k = dayKey(anchor), list = apptsOn(k);
    title = anchor.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const hours = [...new Set([...Array(16)].map((_, i) => i + 6).concat(list.map(a => new Date(a.startAt).getHours())))].sort((a, b) => a - b);
    body = `<div class="dayview">${hours.map(h => { const at = list.filter(a => new Date(a.startAt).getHours() === h); return `<div class="hrow"><span class="hlbl">${String(h).padStart(2, '0')}:00</span><div class="hcell">${at.map(apptBtn).join('')}<button class="add" data-act="apptEdit" data-date="${k}" data-hour="${h}" aria-label="Nueva cita a las ${h}:00">+</button></div></div>`; }).join('')}</div>`;
  } else if (v === 'mes') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12), start = mondayOf(first), month = anchor.getMonth();
    title = anchor.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const cells = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    const weeks = cells[35].getMonth() !== month ? cells.slice(0, 35) : cells;
    const wd = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString('es-CO', { weekday: 'short' }); });
    body = `<div class="month"><div class="mhead">${wd.map(x => `<span>${esc(x)}</span>`).join('')}</div><div class="mgrid">${weeks.map(d => { const k = dayKey(d), l = apptsOn(k).filter(a => a.estado !== 'Cancelada');
      return `<div class="mcell ${d.getMonth() !== month ? 'out' : ''} ${k === today ? 'today' : ''}"><button class="mday" data-act="agDay" data-date="${k}" aria-label="Ver el ${esc(fmt(d))}">${d.getDate()}</button>
      ${l.slice(0, 3).map(a => `<button class="mapt" data-act="apptEdit" data-id="${a.id}" title="${esc(hhmm(a.startAt) + ' · ' + patName(a.patientId))}"><b>${esc(hhmm(a.startAt))}</b> ${esc(patName(a.patientId))}</button>`).join('')}
      ${l.length > 3 ? `<button class="mmore" data-act="agDay" data-date="${k}">+${l.length - 3} más</button>` : ''}${l.length ? `<span class="mdots" aria-hidden="true">${'•'.repeat(Math.min(l.length, 5))}</span>` : ''}</div>`; }).join('')}</div></div>`;
  } else {
    const mon = mondayOf(anchor), days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; });
    title = `${fmt(days[0])} – ${fmt(days[6])} ${days[6].getFullYear()}`;
    body = `<div class="week">${days.map(d => { const k = dayKey(d); return `<div class="day ${k === today ? 'today' : ''}"><h4><button class="mday" data-act="agDay" data-date="${k}"><span>${esc(d.toLocaleDateString('es-CO', { weekday: 'short' }))}</span><b>${d.getDate()}</b></button></h4>${apptsOn(k).map(apptBtn).join('')}<button class="add" data-act="apptEdit" data-date="${k}" aria-label="Nueva cita el ${esc(fmt(d))}">+</button></div>`; }).join('')}</div>`;
  }
  const unit = { dia: 'Día', semana: 'Semana', mes: 'Mes' }[v];
  return `<div class="panel"><div class="ag-head"><div><h2>Agenda</h2><span style="font-size:13px;color:var(--muted)">${esc(title)}</span></div>
  <div class="row"><div class="seg" role="group" aria-label="Vista">${AG_VIEWS.map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-act="agView" data-v="${k}" aria-pressed="${k === v}">${l}</button>`).join('')}</div>
  <button class="btn sm" data-act="agNav" data-d="-1" aria-label="${unit} anterior">←</button><button class="btn sm" data-act="agNav" data-d="0">Hoy</button><button class="btn sm" data-act="agNav" data-d="1" aria-label="${unit} siguiente">→</button>
  ${S.mode === 'server' && !TEAM() ? '<button class="btn sm" data-act="remConfig">Recordatorios</button><button class="btn sm" data-act="gcal">Google Calendar</button>' : ''}<button class="btn pri" data-act="apptEdit">+ Nueva cita</button></div></div>
  ${body}</div>`;
}
ACT.agView = b => { S.agView = b.dataset.v; try { localStorage.setItem('ac_agview', S.agView); } catch (e) { /* sin almacenamiento */ } render(); };
ACT.agDay = b => { S.agView = 'dia'; S.agDate = b.dataset.date; render(); };
ACT.agNav = b => {
  const d = +b.dataset.d; if (!d) { S.agDate = null; render(); return; }
  const a = agAnchor(), v = agView();
  if (v === 'dia') a.setDate(a.getDate() + d); else if (v === 'semana') a.setDate(a.getDate() + 7 * d); else { a.setDate(1); a.setMonth(a.getMonth() + d); }
  S.agDate = dayKey(a); render();
};
/* Secciones del resumen que se pueden retraer; se recuerda cuáles cerró (solo en este navegador). */
const FOLD = (() => { try { return new Set(JSON.parse(localStorage.getItem('hc_fold') || '[]')); } catch (e) { return new Set(); } })();
const foldOpen = k => FOLD.has(k) ? '' : 'open';
function foldSave(k, open) { if (open) FOLD.delete(k); else FOLD.add(k); try { localStorage.setItem('hc_fold', JSON.stringify([...FOLD])); } catch (e) { /* sin almacenamiento */ } }
function todayHTML() {
  const l = apptsOn(dayKey(new Date())).filter(a => a.estado !== 'Cancelada');
  return `<details class="sec fold" data-fold="hoy" ${foldOpen('hoy')}><summary><h3>Citas de hoy</h3></summary>${l.length ? `<div class="tlist">${l.map(apptBtn).join('')}</div>` : '<p style="margin:0;color:var(--muted)">No hay citas programadas para hoy.</p>'}<div class="row"><button class="btn sm" data-act="view" data-v="agenda">Ver agenda</button></div></details>`;
}
function nextApptHTML(p) {
  const now = nowISO(), n = S.appts.filter(a => a.patientId === p.id && a.estado === 'Programada' && a.startAt >= now).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return n ? `<span>Próxima cita: ${esc(fmtShort(n.startAt))}</span>` : '';
}
ACT.view = async b => { await pnLeave(); S.view = b.dataset.v; if (S.view === 'patients') { S.newNote = false; } render(); scrollTo(0, 0); };
ACT.apptEdit = b => {
  const a = b && b.dataset.id ? S.appts.find(x => x.id === b.dataset.id) : null;
  const pats = [...S.patients].filter(p => !isClosed(p) || (a && a.patientId === p.id)).sort((x, y) => fullName(x).localeCompare(fullName(y)));
  if (!a && !pats.length) { toast('Primero cree un consultante.'); return; }
  const start = a ? new Date(a.startAt) : (() => { const d = b && b.dataset.date ? new Date(b.dataset.date + 'T' + String(b.dataset.hour || 9).padStart(2, '0') + ':00:00') : new Date(); if (!(b && b.dataset.date)) { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); } return d; })();
  const t = localInput(start), pre = a ? a.patientId : (b && b.dataset.patient) || (S.pid && !S.draft ? S.pid : '');
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Cita"><div class="box" id="apform" style="width:min(560px,100%)"><div class="row" style="justify-content:space-between"><h3>${a ? 'Cita' : 'Nueva cita'}</h3><button class="btn sm" id="apcl">Cerrar</button></div>
  <div class="grid"><div class="fld wide"><label for="f_patientId">Consultante</label><select id="f_patientId" data-f="patientId"><option value="">Elija un consultante…</option>${pats.map(p => `<option value="${p.id}" ${p.id === pre ? 'selected' : ''}>${esc(fullName(p))}</option>`).join('')}</select></div>
  ${F('Fecha', 'fecha', t.slice(0, 10), { type: 'date' })}<div class="fld"><label for="f_hora">Hora</label><input id="f_hora" data-f="hora" type="time" value="${t.slice(11, 16)}"></div>
  ${F('Duración (min)', 'duracion', a ? a.duracion : 50, { type: 'number' })}${F('Modalidad', 'modalidad', a ? a.modalidad : 'Presencial', { type: 'select', opts: MODS })}
  ${a ? F('Estado', 'estado', a.estado || 'Programada', { type: 'select', opts: APPT_EST }) : F('Repetir cada semana', 'repetir', '0', { type: 'select', opts: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] })}</div>
  ${a ? '' : '<p style="margin:-4px 0 0;font-size:12px;color:var(--muted)">«Repetir» crea esa cantidad de citas adicionales, una por semana.</p>'}
  <div id="apwarn"></div>${a ? remApptHTML(a) : ''}<div class="row" style="justify-content:space-between">${a ? `<span class="row">${TEAM() ? '' : a.noteId ? `<button class="btn sm" data-ap="note">Ver sesión</button>` : `<button class="btn sm pri" data-ap="evol">Registrar sesión</button>`}${a.estado === 'Programada' || !a.estado ? `<button class="btn sm" data-ap="rem">Enviar recordatorio</button>` : ''}<button class="btn sm" data-ap="open">Abrir consultante</button><button class="btn sm warn" data-ap="del">Eliminar cita</button></span>` : '<span></span>'}<button class="btn pri" data-ap="save">Guardar cita</button></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('#apcl').onclick = close;
  /* Sin el consentimiento que corresponde a la modalidad no se puede programar la cita (el servidor también lo exige). */
  const missing = () => {
    const pid = $('#f_patientId').value, mod = $('#f_modalidad').value, est = a ? $('#f_estado').value : 'Programada';
    if (!pid || est !== 'Programada') return '';
    if (a && (a.estado || 'Programada') === 'Programada' && a.patientId === pid && a.modalidad === mod) return '';
    return apptConsentMissing(S.patients.find(p => p.id === pid), mod);
  };
  const warn = () => {
    const m = missing(), pid = $('#f_patientId').value;
    $('#apwarn').innerHTML = m ? `<div class="banner"><b>Consentimiento pendiente.</b> El consultante no tiene un consentimiento informado vigente de ${esc(m)}, que es el que corresponde a una cita ${esc($('#f_modalidad').value.toLowerCase())}. Fírmelo (o envíelo para firmar a distancia) antes de agendar.${TEAM() ? ' Pídale al terapeuta que lo registre.' : `<div class="row" style="margin-top:6px"><button class="btn sm pri" data-ap="consent" data-pid="${esc(pid)}" data-need="${esc(m)}">Ir al consentimiento</button></div>`}</div>` : '';
    const sv = root.querySelector('[data-ap="save"]'); if (sv) sv.disabled = !!m;
  };
  ['#f_patientId', '#f_modalidad', '#f_estado'].forEach(s => { const el = root.querySelector(s); if (el) el.addEventListener('change', warn); });
  warn();
  root.querySelector('#apform').onclick = async e => {
    const k = e.target.closest('[data-ap]'); if (!k) return;
    const go = (tab, seed) => { close(); S.view = 'patients'; S.draft = false; S.pid = a.patientId; S.tab = tab; S.newReport = false; S.noteSeed = seed || null; S.newNote = seed ? 'new' : false; render(); scrollTo(0, 0); };
    if (k.dataset.ap === 'consent') { close(); S.view = 'patients'; S.draft = false; S.pid = k.dataset.pid; S.tab = 'consent'; S.newNote = false; S.newReport = false; S.reconsent = true; S.consentPreset = k.dataset.need === 'teleterapia' ? 'Teleterapia (atención a distancia)' : null; render(); scrollTo(0, 0); return; }
    if (k.dataset.ap === 'open') return go('datos');
    if (k.dataset.ap === 'rem') return remSend(a.id);
    if (k.dataset.ap === 'note') return go('evol');
    if (k.dataset.ap === 'evol') return go('evol', { sessionAt: a.startAt, modalidad: a.modalidad, duracion: a.duracion, apptId: a.id });
    if (k.dataset.ap === 'del') {
      if (!k.dataset.sure) { k.dataset.sure = 1; k.textContent = 'Confirmar eliminación'; return; }
      S.appts = S.appts.filter(x => x.id !== a.id); Store.remove(a.id); close(); toast('Cita eliminada.'); render(); return;
    }
    const o = readForm($('#apform'), {});
    if (!o.patientId) { toast('Elija el consultante.'); return; }
    if (missing()) { toast('Falta el consentimiento de ' + missing() + ' de este consultante.'); warn(); return; }
    if (!o.fecha || !o.hora) { toast('Indique fecha y hora.'); return; }
    const st = new Date(o.fecha + 'T' + o.hora), dur = Math.max(5, Math.min(600, +o.duracion || 50));
    if (isNaN(st)) { toast('La fecha no es válida.'); return; }
    const rep = a ? 0 : +o.repetir || 0, made = [], snap = a ? clone(a) : null;
    setBusy(k, true);
    for (let i = 0; i <= rep; i++) {
      const d = new Date(st); d.setDate(d.getDate() + 7 * i);
      const x = a ? a : { id: newId('a'), kind: 'appt', createdAt: nowISO() };
      Object.assign(x, { patientId: o.patientId, startAt: d.toISOString(), duracion: dur, modalidad: o.modalidad, estado: a ? o.estado : 'Programada', updatedAt: nowISO() });
      try { await Store.save(x, { strict: true }); } catch (err) { if (a) restore(a, snap); setBusy(k, false); saveError(err); if (made.length) { render(); toast(made.length + ' de ' + (rep + 1) + ' citas alcanzaron a guardarse.'); } return; }
      if (!a) S.appts.push(x);
      made.push(x);
    }
    setBusy(k, false);
    const clash = made.some(m => { const s0 = new Date(m.startAt), e0 = s0.getTime() + m.duracion * 60000; return m.estado !== 'Cancelada' && S.appts.some(y => y.id !== m.id && y.estado !== 'Cancelada' && new Date(y.startAt).getTime() < e0 && new Date(y.startAt).getTime() + (y.duracion || 50) * 60000 > s0.getTime()); });
    close(); toast(clash ? 'Cita guardada. Ojo: se cruza con otra cita.' : made.length > 1 ? made.length + ' citas guardadas.' : 'Cita guardada.'); render();
  };
};
const DETAILS = [['iniciales', 'Solo las iniciales del consultante (recomendado)'], ['oculto', 'Solo «Cita de terapia», sin consultante'], ['nombre', 'Nombre completo del consultante']];
ACT.gcal = async () => {
  const root = $('#modal-root');
  let st, gs; try { [st, gs] = await Promise.all([api('/calendar/feed'), api('/google/status')]); } catch (e) { toast(e.message); return; }
  const direct = () => !gs.enabled ? `<p style="margin:0;font-size:14px;color:var(--muted)">El administrador del servidor aún no configuró la conexión directa con Google. Mientras tanto puede usar el enlace iCal de abajo.</p>`
    : gs.connected ? `<div class="banner ok">Conectado. Cada cita que cree, mueva o cancele se copia al instante al calendario «${esc(gs.calendar)}» de su cuenta de Google.${gs.last_sync ? ' Última sincronización: ' + esc(fmtShort(gs.last_sync)) + '.' : ''}</div>
      ${gs.last_error ? `<div class="banner"><b>Problema con Google:</b> ${esc(gs.last_error)}. <button class="btn sm" data-g="gconnect">Reconectar</button></div>` : ''}
      <div class="row" style="align-items:flex-end"><div class="fld" style="flex:1"><label for="gd_detail">Qué verá Google de cada cita</label><select id="gd_detail">${DETAILS.map(([v, l]) => `<option value="${v}" ${gs.detail === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><button class="btn" data-g="gdetail">Guardar</button></div>
      <div class="row" style="justify-content:space-between"><button class="btn warn" data-g="gdisc">Desconectar</button><button class="btn" data-g="gsync">Sincronizar ahora</button></div>`
    : `<p style="margin:0">Conecte su cuenta de Google y sus citas aparecerán <b>al instante</b> en un calendario nuevo, «${esc(gs.calendar)}». La app solo puede ver y cambiar ese calendario, no los demás.</p>
      <div class="fld"><label for="gd_detail">Qué verá Google de cada cita</label><select id="gd_detail">${DETAILS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <p style="margin:0;font-size:13px;color:var(--muted)">Vea qué datos se envían en la <a href="privacidad" target="_blank" rel="noopener">política de privacidad</a>. Google mostrará «Google no ha verificado esta app»: pulse <b>Avanzado</b> y luego <b>Ir a…</b> para continuar.</p>
      <div class="row end"><button class="btn pri" data-g="gconnect">Conectar con Google</button></div>`;
  const draw = (token) => {
    const url = token ? location.origin + '/api/calendar/' + token + '.ics' : '';
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Google Calendar"><div class="box" id="gcform" style="width:min(620px,100%)"><div class="row" style="justify-content:space-between"><h3>Google Calendar</h3><button class="btn sm" data-g="close">Cerrar</button></div>
    <div class="sec"><h3>Conexión directa${gs.enabled && !gs.connected ? ' (recomendada)' : ''}</h3>${direct()}</div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Nunca se envían notas ni datos de las sesiones: solo la hora, la duración, la modalidad y lo que elija.</p>
    <details class="sec" ${!gs.enabled || token ? 'open' : ''}><summary class="sum">${gs.enabled ? 'Alternativa: enlace iCal (se actualiza cada pocas horas)' : 'Enlace iCal'}</summary>
    <p style="margin:0;font-size:14px">La app crea un <b>enlace privado</b> con sus citas al que Google Calendar se suscribe. Google lo actualiza cada pocas horas.</p>
    <div class="fld"><label for="g_detail">Qué verá Google de cada cita</label><select id="g_detail">${[['iniciales', 'Solo las iniciales del consultante (recomendado)'], ['oculto', 'Solo «Cita de terapia», sin consultante'], ['nombre', 'Nombre completo del consultante']].map(([v, l]) => `<option value="${v}" ${st.detail === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${url ? `<div class="banner ok">Copie este enlace ahora: por seguridad no se vuelve a mostrar.</div><div class="row"><input type="text" id="g_url" readonly value="${esc(url)}" style="flex:1"><button class="btn" data-g="copy">Copiar</button></div>
      <ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.7"><li>Abra Google Calendar en el computador.</li><li>A la izquierda, junto a «Otros calendarios», pulse <b>+</b> y luego <b>Desde URL</b>.</li><li>Pegue el enlace y pulse <b>Agregar calendario</b>.</li></ol>`
      : st.active ? `<div class="banner ok">Hay un enlace activo desde ${esc(fmtShort(st.created_at))}. Si lo perdió, cree uno nuevo: el anterior deja de funcionar.</div>` : ''}
    <p style="margin:0;font-size:13px;color:var(--muted)">Quien tenga el enlace puede ver sus horarios. No lo comparta; si cree que se filtró, cree uno nuevo o desactívelo.</p>
    <div class="row" style="justify-content:space-between">${st.active || url ? '<button class="btn warn" data-g="off">Desactivar enlace</button>' : '<span></span>'}<button class="btn ${gs.connected ? '' : 'pri'}" data-g="new">${st.active || url ? 'Crear enlace nuevo' : 'Crear enlace'}</button></div></details></div></div>`;
  };
  draw('');
  root.onclick = async e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = b.dataset.g;
    if (g === 'close') { root.innerHTML = ''; root.onclick = null; return; }
    if (g === 'copy') { const i = $('#g_url'); i.select(); try { await navigator.clipboard.writeText(i.value); toast('Enlace copiado.'); } catch (err) { document.execCommand && document.execCommand('copy'); toast('Enlace seleccionado: cópielo con Ctrl+C.'); } return; }
    try {
      if (g === 'gconnect') { const r = await api('/google/connect', { method: 'POST', body: { detail: ($('#gd_detail') || {}).value || gs.detail } }); location.href = r.url; return; }
      if (g === 'gdetail') { setBusy(b, true); gs = await api('/google/detail', { method: 'POST', body: { detail: $('#gd_detail').value } }); toast('Guardado. Actualizando las citas en Google…'); draw(''); return; }
      if (g === 'gsync') { setBusy(b, true); gs = await api('/google/sync', { method: 'POST' }); toast(gs.last_error ? 'Google respondió con un problema.' : gs.synced + ' citas sincronizadas.'); draw(''); return; }
      if (g === 'gdisc') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: desconectar'; return; } await api('/google', { method: 'DELETE' }); gs = Object.assign({}, gs, { connected: false, last_error: '' }); toast('Desconectado. El calendario «' + gs.calendar + '» queda en su Google; puede borrarlo allí si quiere.'); draw(''); return; }
      if (g === 'off') { await api('/calendar/feed', { method: 'DELETE' }); st = { active: false, detail: st.detail }; draw(''); toast('Enlace desactivado.'); }
      if (g === 'new') { const r = await api('/calendar/feed', { method: 'POST', body: { detail: $('#g_detail').value } }); st = { active: true, detail: r.detail, created_at: nowISO() }; draw(r.token); }
    } catch (err) { toast(err.message); }
  };
};

/* ===== Nota de cierre ===== */
const CIERRE_MOT = ['Cumplimiento de objetivos', 'Decisión del consultante', 'Remisión a otro terapeuta o servicio', 'Inasistencia o abandono', 'Cambio de ciudad o de condiciones', 'Otro'];
const CIERRE_FIELDS = [['resumen', 'Resumen del proceso', 4], ['logros', 'Logros y estado al cierre', 3], ['recomendaciones', 'Recomendaciones', 3], ['remision', 'Remisión (si aplica)', 2]];
function docCierre(p, c) {
  const pr = { nombre: c.therapistName, registro: c.therapistReg, consultorio: c.consultorio };
  const ns = S.notes.filter(n => n.patientId === p.id && n.signedAt).length + (p.intake && p.intake.signedAt ? 1 : 0);
  let h = `<div class="docpage">${letterhead(pr)}<h2>Nota de cierre del proceso</h2>${patientTable(p)}<p><b>Fecha de cierre:</b> ${esc(fmtD(c.fecha))}<br><b>Motivo:</b> ${esc(c.motivo)}<br><b>Sesiones registradas:</b> ${ns}</p>`;
  CIERRE_FIELDS.forEach(f => { if (c[f[0]]) h += `<p><b>${esc(f[1])}.</b> ${esc(c[f[0]])}</p>`; });
  return h + sigBlock([therSig(c, c.signedAt)]) + '</div>';
}
function tabCierre(p) {
  const cs = p.cierres || [];
  const list = cs.map((c, i) => `<div class="card"><div class="row" style="justify-content:space-between"><b>Cierre del ${esc(fmtD(c.fecha))}</b><span class="chip ok">Firmado</span></div><span class="ts">${esc(c.motivo)} · firmado ${esc(fmtShort(c.signedAt))}</span><div class="row"><button class="btn sm pri" data-act="viewCierre" data-i="${i}">Ver y descargar</button></div></div>`).join('');
  if (isClosed(p)) {
    return `<div class="sec"><h3>Cierre del proceso</h3><div class="banner ok">Este proceso está cerrado. Estado: ${esc(p.estado)}.</div>${list}
    <div class="row"><button class="btn" data-act="reopen">Reabrir proceso</button><span style="font-size:13px;color:var(--muted)">Úselo si el consultante vuelve a consulta. Las notas de cierre anteriores se conservan.</span></div></div>`;
  }
  const fut = S.appts.filter(a => a.patientId === p.id && a.estado === 'Programada' && a.startAt >= nowISO()).length;
  return `<div class="sec">${list ? `<h3>Cierres anteriores</h3>${list}` : ''}<div id="cierreform" class="sec"><h3>Nota de cierre</h3>${sigNeeded()}
  ${fut ? `<div class="banner">Este consultante tiene ${fut} cita${fut > 1 ? 's' : ''} futura${fut > 1 ? 's' : ''} programada${fut > 1 ? 's' : ''}. Al cerrar el proceso se marcarán como canceladas.</div>` : ''}
  <div class="grid">${F('Fecha de cierre', 'fecha', localInput().slice(0, 10), { type: 'date' })}${F('Motivo de cierre', 'motivo', CIERRE_MOT[0], { type: 'select', opts: CIERRE_MOT })}${F('Estado del consultante al cerrar', 'estadoFinal', 'Alta', { type: 'select', opts: CLOSED })}</div>
  <div class="grid">${CIERRE_FIELDS.map(f => F(f[1], f[0], '', { type: 'area', rows: f[2], wide: true, req: true })).join('')}</div>
  <div class="fld"><span class="lbl">Firma del terapeuta (de su perfil)</span>${therPreview()}</div>
  <p class="lock-note">Al guardar, la nota de cierre queda firmada y <b>no podrá modificarse</b>, y el consultante pasa al estado que elija arriba.</p>
  <div class="row end"><button class="btn pri" data-act="saveCierre">Firmar cierre</button></div></div></div>`;
}
ACT.saveCierre = async b => {
  const p = curPatient(), o = readForm($('#cierreform'), {});
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
  if (!o.fecha) { toast('Indique la fecha del cierre.'); return; }
  if (!reqCheck($('#cierreform'), o, CIERRE_FIELDS.map(f => f[0]))) return;
  const snap = clone(p);
  p.cierres = (p.cierres || []).concat([Object.assign(o, therSnap(), { signedAt: nowISO() })]);
  p.estado = CLOSED.includes(o.estadoFinal) ? o.estadoFinal : 'Alta';
  if (!(await persist([p], b))) { restore(p, snap); return; }
  const now = nowISO();
  S.appts.filter(a => a.patientId === p.id && a.estado === 'Programada' && a.startAt >= now).forEach(a => { a.estado = 'Cancelada'; a.updatedAt = now; Store.save(a); });
  toast('Nota de cierre firmada. Estado del paciente: ' + p.estado + '.'); render();
};
ACT.reopen = b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: reabrir proceso'; return; }
  const p = curPatient(); const prevEstado = p.estado; p.estado = 'Activo';
  persist([p], b).then(ok => { if (!ok) { p.estado = prevEstado; return; } toast('Proceso reabierto.'); render(); });
};
ACT.viewCierre = b => { const p = curPatient(), c = p.cierres[+b.dataset.i]; showDoc('Nota de cierre · ' + fullName(p), docCierre(p, c), 'cierre-' + slug(fullName(p)) + '-' + c.fecha + '.html'); };

/* ===== Bloqueo por inactividad (solo con servidor) ===== */
const Idle = { last: Date.now(), ping: Date.now(), timer: null };
function hideIdleWarn() { const w = $('#idlewarn'); if (w) w.remove(); }
function idleActivity() {
  if (!S.user || S.mode !== 'server') return;
  if ($('#idlewarn')) return; // con el aviso visible, solo el botón cuenta como actividad
  Idle.last = Date.now();
  if (Date.now() - Idle.ping > 5 * 60000) { Idle.ping = Date.now(); api('/auth/me').catch(() => { }); }
}
function idleTick() {
  if (!S.user || S.mode !== 'server') { hideIdleWarn(); return; }
  const lim = (S.user.idle_minutes || 30) * 60000, left = lim - (Date.now() - Idle.last);
  if (left <= 0) { doLogout('Su sesión se cerró por inactividad. Ingrese de nuevo.'); return; }
  if (left <= 60000) {
    let w = $('#idlewarn');
    if (!w) {
      w = document.createElement('div'); w.id = 'idlewarn'; w.className = 'idle';
      w.innerHTML = '<div class="box" role="alertdialog" aria-live="assertive"><b>¿Sigue ahí?</b><p style="margin:0">Por seguridad, su sesión se cerrará en <span id="idlesec">60</span> segundos.</p><button class="btn pri" id="idlego">Seguir trabajando</button></div>';
      document.body.appendChild(w);
      $('#idlego').onclick = () => { hideIdleWarn(); Idle.last = Date.now(); Idle.ping = Date.now(); api('/auth/me').catch(() => { }); };
      $('#idlego').focus();
    }
    $('#idlesec').textContent = Math.max(0, Math.ceil(left / 1000));
  }
}
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, idleActivity, { passive: true, capture: true }));
setInterval(idleTick, 1000);

