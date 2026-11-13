/* Agenda, nota de cierre y bloqueo por inactividad. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Agenda ===== */
const APPT_EST = ['Programada', 'Atendida', 'No asistió', 'Cancelada'];
const MODS = ['Presencial', 'Virtual', 'Telefónica'];
const dayKey = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const mondayOf = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hhmm = iso => new Date(iso).toLocaleTimeString(I18N.locale(), { hour: 'numeric', minute: '2-digit' });
const patName = id => { const p = S.patients.find(x => x.id === id); return p ? fullName(p) : 'Consultante eliminado'; };
const apName = a => a.evento ? a.evento : a.patientId ? patName(a.patientId) : a.nuevo ? [a.nuevo.nombres, a.nuevo.apellidos].join(' ') + ' (nuevo)' : 'Sin consultante';
const apptsOn = key => S.appts.filter(a => dayKey(new Date(a.startAt)) === key).sort((a, b) => a.startAt.localeCompare(b.startAt));
const remChip = a => { const c = a.confirmacion && a.confirmacion.estado, r = S.rem && S.rem.items && S.rem.items[a.id]; return c === 'Confirmada' ? ' · ✓ confirmó' : c ? ' · canceló' : r && r.enviado ? ' · recordada' : ''; };
function apptBtn(a) {
  const fe = typeof finEstadoCita === 'function' ? finEstadoCita(a) : '', impaga = fe === 'Pendiente' || fe === 'Abonada';
  return `<button class="ap ${esc((a.estado || 'Programada').replace(/\s/g, '-'))}${a.evento ? ' evento' : ''}${impaga ? ' impaga' : ''}" data-act="apptEdit" data-id="${a.id}"><b>${esc(hhmm(a.startAt))}</b><span>${esc(apName(a))}</span><small>${esc(remChip(a).replace(/^ · /, '') ? remChip(a).replace(/^ · /, '') + ' · ' : '')}${esc([a.duracion ? a.duracion + ' min' : '', a.modalidad, a.estado && a.estado !== 'Programada' ? a.estado : ''].filter(Boolean).join(' · '))}</small></button>`;
}
/* Vista de la agenda (día, semana o mes): preferencia de este navegador. */
const AG_VIEWS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];
function agView() { if (!S.agView) { try { S.agView = localStorage.getItem('ac_agview') || 'semana'; } catch (e) { S.agView = 'semana'; } } return AG_VIEWS.some(v => v[0] === S.agView) ? S.agView : 'semana'; }
const agAnchor = () => S.agDate ? new Date(S.agDate + 'T12:00:00') : (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
function agendaHTML() {
  if (typeof finMemoReset === 'function') finMemoReset();
  const v = agView(), anchor = agAnchor(), today = dayKey(new Date());
  const fmt = d => d.toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
  let title, body;
  if (v === 'dia') {
    const k = dayKey(anchor), list = apptsOn(k);
    title = anchor.toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const hours = [...new Set([...Array(16)].map((_, i) => i + 6).concat(list.map(a => new Date(a.startAt).getHours())))].sort((a, b) => a - b);
    body = `<div class="dayview">${hours.map(h => { const at = list.filter(a => new Date(a.startAt).getHours() === h); return `<div class="hrow"><span class="hlbl">${String(h).padStart(2, '0')}:00</span><div class="hcell">${at.map(apptBtn).join('')}<button class="add" data-act="apptEdit" data-date="${k}" data-hour="${h}" aria-label="Nueva cita a las ${h}:00">+</button></div></div>`; }).join('')}</div>`;
  } else if (v === 'mes') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12), start = mondayOf(first), month = anchor.getMonth();
    title = anchor.toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' });
    const cells = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    const weeks = cells[35].getMonth() !== month ? cells.slice(0, 35) : cells;
    const wd = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString(I18N.locale(), { weekday: 'short' }); });
    body = `<div class="month"><div class="mhead">${wd.map(x => `<span>${esc(x)}</span>`).join('')}</div><div class="mgrid">${weeks.map(d => { const k = dayKey(d), l = apptsOn(k).filter(a => a.estado !== 'Cancelada');
      return `<div class="mcell ${d.getMonth() !== month ? 'out' : ''} ${k === today ? 'today' : ''}"><button class="mday" data-act="agDay" data-date="${k}" aria-label="Ver el ${esc(fmt(d))}">${d.getDate()}</button>
      ${l.slice(0, 3).map(a => `<button class="mapt" data-act="apptEdit" data-id="${a.id}" title="${esc(hhmm(a.startAt) + ' · ' + apName(a))}"><b>${esc(hhmm(a.startAt))}</b> ${esc(apName(a))}</button>`).join('')}
      ${l.length > 3 ? `<button class="mmore" data-act="agDay" data-date="${k}">+${l.length - 3} más</button>` : ''}${l.length ? `<span class="mdots" aria-hidden="true">${'•'.repeat(Math.min(l.length, 5))}</span>` : ''}</div>`; }).join('')}</div></div>`;
  } else {
    const mon = mondayOf(anchor), days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; });
    title = `${fmt(days[0])} – ${fmt(days[6])} ${days[6].getFullYear()}`;
    body = `<div class="week">${days.map(d => { const k = dayKey(d); return `<div class="day ${k === today ? 'today' : ''}"><h4><button class="mday" data-act="agDay" data-date="${k}"><span>${esc(d.toLocaleDateString(I18N.locale(), { weekday: 'short' }))}</span><b>${d.getDate()}</b></button></h4>${apptsOn(k).map(apptBtn).join('')}<button class="add" data-act="apptEdit" data-date="${k}" aria-label="Nueva cita el ${esc(fmt(d))}">+</button></div>`; }).join('')}</div>`;
  }
  const unit = { dia: 'Día', semana: 'Semana', mes: 'Mes' }[v];
  return `<div class="panel"><div class="ag-head"><div><h2>Agenda</h2><span style="font-size:13px;color:var(--muted)">${esc(title)}</span></div>
  <div class="row"><div class="seg" role="group" aria-label="Vista">${AG_VIEWS.map(([k, l]) => `<button class="${k === v ? 'on' : ''}" data-act="agView" data-v="${k}" aria-pressed="${k === v}">${l}</button>`).join('')}</div>
  <button class="btn sm" data-act="agNav" data-d="-1" aria-label="${unit} anterior">←</button><button class="btn sm" data-act="agNav" data-d="0">Hoy</button><button class="btn sm" data-act="agNav" data-d="1" aria-label="${unit} siguiente">→</button>
  ${S.mode === 'server' && !TEAM() ? '<button class="btn sm" data-act="remConfig">Recordatorios</button><button class="btn sm" data-act="gcal">Google Calendar</button><button class="btn sm" data-act="reservas">Reservas</button>' : ''}<button class="btn pri" data-act="apptEdit">+ Nueva cita</button></div></div>
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
  
  const start = a ? new Date(a.startAt) : (() => { const d = b && b.dataset.date ? new Date(b.dataset.date + 'T' + String(b.dataset.hour || 9).padStart(2, '0') + ':00:00') : new Date(); if (!(b && b.dataset.date)) { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); } return d; })();
  const t = localInput(start), pre = a ? a.patientId : (b && b.dataset.patient) || (S.pid && !S.draft ? S.pid : '');
  const root = $('#modal-root'), mv = a ? a.modalidad : 'Presencial', mods = MODS.includes(mv) ? MODS : MODS.concat([mv]);
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Cita"><div class="box" id="apform" style="width:min(560px,100%)"><div class="row aphd"><div><h3>${a ? esc(apName(a)) : 'Nueva cita'}</h3>${a ? '' : '<p class="apsub">Elija consultante, día y hora</p>'}</div><button class="apx" id="apcl" aria-label="Cerrar" title="Cerrar">✕</button></div>
  ${a && a.nuevo ? `<div class="apnew"><div><b>Consultante nuevo${a.origen === 'enlace' ? ' · agendó por su enlace' : ''}</b><br><span class="ts">${esc([a.nuevo.correo, a.nuevo.telefono].filter(Boolean).join(' · '))}${a.nuevo.correo || a.nuevo.telefono ? ' · ' : ''}Aún no tiene ficha.</span></div></div>` : ''}
  ${a ? `<div class="apsum"><div class="row" style="justify-content:space-between"><b class="apwhen">${esc(start.toLocaleString(I18N.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</b><span class="chip">${esc(a.estado || 'Programada')}</span></div><span class="ts">${esc(a.duracion || 50)} min · ${esc(a.modalidad || '')}</span></div>
  <div class="row">${TEAM() || a.evento ? '' : a.noteId ? `<button class="btn sm" data-ap="note">Ver sesión</button>` : `<button class="btn sm pri" data-ap="evol">Registrar sesión</button>`}${a.patientId ? '<button class="btn sm" data-ap="open">Abrir consultante</button>' : ''}${(a.estado === 'Programada' || !a.estado) && !a.evento ? `<button class="btn sm" data-ap="rem">Enviar recordatorio</button>` : ''}<button class="btn sm warn" data-ap="del">${a.evento ? 'Eliminar evento' : 'Eliminar cita'}</button></div>
  <p class="k2">Reprogramar o cambiar</p>` : ''}
  <div class="grid">${a ? '' : '<div class="fld wide"><div class="seg" id="pnseg"><button type="button" data-pn="0" class="on">Consultante existente</button><button type="button" data-pn="1">Consultante nuevo</button><button type="button" data-pn="2">Evento</button></div></div>'}<div class="fld wide" id="pn_ev" ${a && a.evento ? '' : 'style="display:none"'}>${F('Título del evento (ej.: Almuerzo, Capacitación)', 'evTitulo', a && a.evento || '')}</div><div class="fld wide" id="pn_ex" ${a && (a.patientId || a.nuevo || a.evento) ? 'style="display:none"' : ''}><label for="f_patientId">Consultante</label><select id="f_patientId" data-f="patientId"><option value="">Elija un consultante…</option>${pats.map(p => `<option value="${p.id}" ${p.id === pre ? 'selected' : ''}>${esc(fullName(p))}</option>`).join('')}</select></div>
  ${a ? '' : `<div id="pn_new" style="display:none">${F('Nombres', 'nnNombres', '')}${F('Apellidos', 'nnApellidos', '')}${F('Correo', 'nnCorreo', '', { type: 'email' })}${F('Teléfono', 'nnTelefono', '')}</div>`}
  ${F('Fecha', 'fecha', t.slice(0, 10), { type: 'date' })}<div class="fld"><label for="f_hora">Hora</label><input id="f_hora" data-f="hora" type="time" value="${t.slice(11, 16)}"></div>
  ${F('Duración (en minutos)', 'duracion', a ? a.duracion : 50, { ph: 'Minutos' })}
  ${a ? F('Estado', 'estado', a.estado || 'Programada', { type: 'select', opts: APPT_EST }) : `<div class="fld"><label for="f_repetir">Repetir cada semana</label><div class="stp"><button type="button" data-st="-1" aria-label="Menos semanas">−</button><input id="f_repetir" data-f="repetir" type="text" value="0" readonly aria-live="polite"><button type="button" data-st="1" aria-label="Más semanas">+</button></div></div>`}
  <div class="fld wide" id="apmod" ${a && a.evento ? 'style="display:none"' : ''}><span class="lbl">Modalidad</span><div class="seg" id="apseg">${mods.map(m => `<button type="button" data-mod="${esc(m)}" class="${m === mv ? 'on' : ''}">${esc(m)}</button>`).join('')}</div><select id="f_modalidad" data-f="modalidad" hidden aria-label="Modalidad">${mods.map(m => `<option ${m === mv ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
  <div style="margin-top:10px">${F('Enlace de la videollamada (opcional)', 'enlace', a && a.enlace || '', { ph: 'https://meet.google.com/…  o  https://zoom.us/j/…' })}</div></div></div>
  ${a ? '' : '<p class="aphint">«Repetir cada semana» es la cantidad de semanas adicionales en las que se agendarán citas, en este mismo día y horario.</p>'}
  <div id="apwarn"></div>${a || S.mode !== 'server' ? '' : '<label class="check" id="apmail" style="display:none"><input type="checkbox" id="ap_mail"> <span>Enviar la cita por correo al consultante, con botón para agregarla a su Google Calendar (y el enlace de la videollamada, si lo puso)</span></label><p class="stnote" id="apmail_no" style="display:none;margin:0">Este consultante no tiene correo en sus datos: no se le puede enviar la cita.</p>'}${a ? remApptHTML(a) : ''}<div class="row" style="justify-content:${a ? 'flex-end' : 'space-between'}">${a ? '' : '<span></span>'}<span class="row">${a ? '' : '<button class="btn" id="apcn">Cancelar</button>'}<button class="btn pri" data-ap="save">${a ? 'Guardar cambios' : 'Guardar cita'}</button></span></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('#apcl').onclick = close; if ($('#apcn')) $('#apcn').onclick = close;
  let pnew = false, evt = !!(a && a.evento);  // evento: sin paciente, solo ocupa el horario
  root.querySelectorAll('#pnseg [data-pn]').forEach(bt => bt.onclick = () => { pnew = bt.dataset.pn === '1'; evt = bt.dataset.pn === '2'; root.querySelectorAll('#pnseg button').forEach(x => x.classList.toggle('on', x === bt)); $('#pn_ex').style.display = pnew || evt ? 'none' : ''; $('#pn_new').style.display = pnew ? 'contents' : 'none'; $('#pn_ev').style.display = evt ? '' : 'none'; $('#apmod').style.display = evt ? 'none' : ''; warn(); });
  root.querySelectorAll('#apseg [data-mod]').forEach(bt => bt.onclick = () => { const s = $('#f_modalidad'); s.value = bt.dataset.mod; root.querySelectorAll('#apseg button').forEach(x => x.classList.toggle('on', x === bt)); s.dispatchEvent(new Event('change')); });
  const du = $('#f_duracion'); du.setAttribute('inputmode', 'numeric'); du.maxLength = 3; du.oninput = () => { du.value = du.value.replace(/\D/g, ''); };
  root.querySelectorAll('[data-st]').forEach(bt => bt.onclick = () => { const r = $('#f_repetir'); r.value = Math.max(0, Math.min(12, (+r.value || 0) + +bt.dataset.st)); });
  const missing = () => '';  // el consentimiento es opcional
  const warn = () => {};
  const mailOpt = () => {  // la casilla solo aplica a una cita nueva de un paciente existente
    if (!$('#apmail')) return;
    const p = pnew || evt ? null : S.patients.find(x => x.id === $('#f_patientId').value);
    $('#apmail').style.display = p && p.correo ? '' : 'none'; $('#apmail_no').style.display = p && !p.correo ? '' : 'none';
    if (!p || !p.correo) $('#ap_mail').checked = false;
  };
  root.querySelectorAll('#pnseg [data-pn]').forEach(bt => bt.addEventListener('click', mailOpt)); $('#f_patientId').addEventListener('change', mailOpt); mailOpt();
  ['#f_patientId', '#f_modalidad', '#f_estado'].forEach(s => { const el = root.querySelector(s); if (el) el.addEventListener('change', warn); });
  warn();
  root.querySelector('#apform').onclick = async e => {
    const k = e.target.closest('[data-ap]'); if (!k) return;
    const go = (tab, seed) => { close(); S.view = 'patients'; S.draft = false; S.pid = a.patientId; S.tab = tab; S.newReport = false; S.noteSeed = seed || null; S.newNote = seed ? 'new' : false; render(); scrollTo(0, 0); };
    if (k.dataset.ap === 'open') return go('datos');
    if (k.dataset.ap === 'rem') return remSend(a.id);
    if (k.dataset.ap === 'note') return go('evol');
    if (k.dataset.ap === 'evol') return go('evol', { sessionAt: a.startAt, modalidad: a.modalidad, duracion: a.duracion, apptId: a.id });
    if (k.dataset.ap === 'del') {
      if (!k.dataset.sure) { k.dataset.sure = 1; k.textContent = 'Confirmar eliminación'; return; }
      S.appts = S.appts.filter(x => x.id !== a.id); Store.remove(a.id); close(); toast('Cita eliminada.'); render(); return;
    }
    const o = readForm($('#apform'), {});
    const ev = evt ? (o.evTitulo || '').trim() : '';
    if (evt && !ev) { toast('Escriba el título del evento.'); return; }
    const nn = pnew ? { nombres: (o.nnNombres || '').trim(), apellidos: (o.nnApellidos || '').trim(), correo: (o.nnCorreo || '').trim(), telefono: (o.nnTelefono || '').trim() } : null;
    const keepNuevo = !nn && a && a.nuevo && !a.patientId && !o.patientId;  // paciente nuevo: la cita se vincula sola cuando se crea su historia
    if (!evt && (nn ? !nn.nombres || !nn.apellidos : !o.patientId && !keepNuevo)) { toast(nn ? 'Escriba los nombres y apellidos del consultante nuevo.' : 'Elija el consultante.'); return; }
    const enl = evt ? '' : (o.enlace || '').trim();
    if (enl && !/^https?:\/\/\S{4,500}$/.test(enl)) { toast('El enlace de la videollamada debe empezar por https://'); return; }
    if (!o.fecha || !o.hora) { toast('Indique fecha y hora.'); return; }
    const st = new Date(o.fecha + 'T' + o.hora), dur = Math.max(5, Math.min(600, +o.duracion || 50));
    if (isNaN(st)) { toast('La fecha no es válida.'); return; }
    const rep = a ? 0 : +o.repetir || 0, made = [], snap = a ? clone(a) : null; const serie = nn && rep ? newId('s') : '';
    setBusy(k, true);
    for (let i = 0; i <= rep; i++) {
      const d = new Date(st); d.setDate(d.getDate() + 7 * i);
      const x = a ? a : { id: newId('a'), kind: 'appt', createdAt: nowISO() };
      Object.assign(x, evt ? { evento: ev } : nn ? { nuevo: nn, ...(serie ? { nuevoSerie: serie } : {}) } : keepNuevo ? {} : { patientId: o.patientId, ...(i === 0 && !a && $('#ap_mail') && $('#ap_mail').checked ? { avisarCorreo: true } : {}) }, { startAt: d.toISOString(), duracion: dur, modalidad: evt ? '' : o.modalidad, ...(enl || x.enlace ? { enlace: enl } : {}), estado: a ? o.estado : 'Programada', updatedAt: nowISO() });
      try { await Store.save(x, { strict: true }); } catch (err) { if (a) restore(a, snap); setBusy(k, false); saveError(err); if (made.length) { render(); toast(made.length + ' de ' + (rep + 1) + ' citas alcanzaron a guardarse.'); } return; }
      if (!a) S.appts.push(x);
      made.push(x);
    }
    setBusy(k, false);
    const clash = made.some(m => { const s0 = new Date(m.startAt), e0 = s0.getTime() + m.duracion * 60000; return m.estado !== 'Cancelada' && S.appts.some(y => y.id !== m.id && y.estado !== 'Cancelada' && new Date(y.startAt).getTime() < e0 && new Date(y.startAt).getTime() + (y.duracion || 50) * 60000 > s0.getTime()); });
    close(); toast(evt ? (clash ? 'Evento guardado. Ojo: se cruza con otra cita.' : 'Evento guardado.') : clash ? 'Cita guardada. Ojo: se cruza con otra cita.' : made.length > 1 ? made.length + ' citas guardadas.' : 'Cita guardada.'); render();
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

const MODS_R = ['Presencial', 'Virtual', 'Telefónica'];
const isoR = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
ACT.reservas = async () => {
  const root = $('#modal-root'); let r;
  try { r = await api('/reserva'); } catch (e) { toast(e.message); return; }
  const rg = v => v && typeof v[0] === 'string' ? [v] : (v || []), url = slug => location.origin + '/reservar?c=' + slug, hoy = isoR(new Date());
  const st = { activo: r.activo, duracion: r.config.duracion, descanso: r.config.descanso || 0, aviso: r.config.aviso, cancelacion: r.config.cancelacion || 0, horizonte: r.config.horizonte, fechas: {}, mes: hoy.slice(0, 7), sel: '' };
  if (r.config.fechas) Object.keys(r.config.fechas).forEach(k => { const f = r.config.fechas[k]; st.fechas[k] = { modalidades: (f.modalidades || [f.modalidad]).filter(Boolean), franjas: f.franjas.map(x => x.slice()) }; });
  else Object.keys(r.config.dias || {}).forEach(k => {  // horario semanal anterior: se pasa al calendario, día por día, para los próximos días
    for (let i = 0; i <= r.config.horizonte; i++) { const d = new Date(); d.setDate(d.getDate() + i); if ((d.getDay() + 6) % 7 === +k) st.fechas[isoR(d)] = { modalidades: (r.config.modalidades || []).length ? r.config.modalidades.slice() : ['Presencial'], franjas: rg(r.config.dias[k]).map(x => x.slice()) }; }
  });
  const limite = () => isoR(new Date(Date.now() + st.horizonte * 864e5));
  const sync = () => {
    if (!$('#rs_dur')) return;
    st.activo = $('#rs_on').checked; st.duracion = +$('#rs_dur').value; st.descanso = +$('#rs_des').value || 0; st.aviso = +$('#rs_avi').value; st.cancelacion = +$('#rs_can').value || 0; st.horizonte = +$('#rs_hor').value;
    const ms = [...root.querySelectorAll('[data-dm]:checked')].map(k => k.dataset.dm); if (ms.length && st.fechas[st.sel]) st.fechas[st.sel].modalidades = ms;
    root.querySelectorAll('[data-t]').forEach(i => { const [d, j, x] = i.dataset.t.split('|'); const f = st.fechas[d]; if (f && f.franjas[j]) f.franjas[j][+x] = i.value; });
  };
  const calHTML = () => {
    const [Y, M] = st.mes.split('-').map(Number), n = new Date(Y, M, 0).getDate(), off = (new Date(Y, M - 1, 1).getDay() + 6) % 7, lim = limite();
    const nom = new Date(Y, M - 1, 1).toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' });
    let c = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(w => `<span style="text-align:center;font-size:12px;color:var(--muted)">${w}</span>`).join('') + '<span></span>'.repeat(off);
    for (let k = 1; k <= n; k++) {
      const ds = `${st.mes}-${String(k).padStart(2, '0')}`, f = st.fechas[ds], on = ds === st.sel;
      c += `<button type="button" class="btn sm${on ? ' pri' : ''}" data-c="${ds}" ${ds < hoy ? 'disabled' : ''} aria-pressed="${on}" aria-label="${k} de ${esc(nom)}${f ? ', atiende ' + f.modalidades.join(' y ').toLowerCase() : ''}" style="display:flex;flex-direction:column;align-items:center;min-height:46px;padding:4px 0;${f && !on ? 'background:var(--accent-soft);color:var(--accent-fg);' : ''}${ds > lim ? 'opacity:.55;' : ''}"><span>${k}</span><span style="font-size:10px;min-height:12px">${f ? f.modalidades.map(m => m[0]).join('') : ''}</span></button>`;
    }
    return `<div class="row" style="justify-content:space-between;align-items:center"><button type="button" class="btn sm" data-r="mv" data-v="-1" aria-label="Mes anterior" ${st.mes <= hoy.slice(0, 7) ? 'disabled' : ''}>‹</button><b>${esc(nom)}</b><button type="button" class="btn sm" data-r="mv" data-v="1" aria-label="Mes siguiente" ${st.mes >= lim.slice(0, 7) ? 'disabled' : ''}>›</button></div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${c}</div>
    <p style="margin:0;font-size:12px;color:var(--muted)">P = presencial · V = virtual · T = telefónica (puede marcar varias por día). Los consultantes ven hasta ${st.horizonte} días adelante (los días más lejanos se ven atenuados).</p>`;
  };
  const diaHTML = () => {
    if (!st.sel) return '<p style="margin:0;font-size:13px;color:var(--muted)">Elija un día del calendario para marcar su horario y el tipo de consulta.</p>';
    const f = st.fechas[st.sel], tit = new Date(st.sel + 'T12:00:00').toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long' }), dia = tit.split(',')[0].split(' ')[0];
    return `<div class="card" role="group" aria-label="${esc(tit)}"><div class="row" style="justify-content:space-between;align-items:center"><b>${esc(tit)}</b><label><input type="checkbox" id="rs_atiendo" ${f ? 'checked' : ''}> Atiendo este día</label></div>
    ${f ? `<div class="card" role="group" aria-labelledby="rs_tipos"><b id="rs_tipos">Tipos de consulta de este día</b><div class="row">${MODS_R.map(m => `<label><input type="checkbox" data-dm="${m}" ${f.modalidades.includes(m) ? 'checked' : ''}> ${m}</label>`).join('')}</div></div>
    ${f.franjas.map((x, j) => `<div class="row" style="align-items:center"><input type="time" data-t="${st.sel}|${j}|0" value="${esc(x[0])}" aria-label="Desde"><span>a</span><input type="time" data-t="${st.sel}|${j}|1" value="${esc(x[1])}" aria-label="Hasta"><button type="button" class="btn sm" data-r="del" data-j="${j}" aria-label="Quitar franja">×</button></div>`).join('')}
    ${f.franjas.length < 6 ? '<div><button type="button" class="btn sm" data-r="add">+ Agregar franja</button></div>' : ''}
    <div class="row" style="align-items:center;flex-wrap:wrap"><label for="rs_rep">Repetir este horario y tipo de consulta los próximos</label><input id="rs_rep" type="text" inputmode="numeric" value="4" style="width:64px"><span>${esc(dia.endsWith('s') ? dia : dia + 's')}</span><button type="button" class="btn sm" data-r="rep">Repetir</button></div>
    <p class="stnote" style="margin:6px 0 0"><b>Importante:</b> poner el número no basta. Para que el horario se copie a los siguientes ${esc(dia.endsWith('s') ? dia : dia + 's')}, pulse el botón «Repetir».</p>` : ''}</div>`;
  };
  const draw = () => {
    const m0 = root.querySelector('.modal'), b0 = root.querySelector('.box'), sm = m0 ? m0.scrollTop : 0, sb = b0 ? b0.scrollTop : 0;  // al redibujar se conserva el desplazamiento
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Reservas"><div class="box" id="rsform" style="width:min(620px,100%)"><div class="row" style="justify-content:space-between"><h3>Reservas por enlace</h3><button class="btn sm" data-r="close">Cerrar</button></div>
    ${r.correo ? '' : '<div class="banner"><b>Falta el correo de envío.</b> Sin él no se pueden enviar las confirmaciones y el enlace no funciona.</div>'}
    <div class="sec"><h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">1 · Su enlace<label class="chk" style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)"><input type="checkbox" id="rs_on" ${st.activo ? 'checked' : ''}> Enlace activo</label></h3>
    <p style="margin:0;font-size:14px">Comparta un enlace para que sus consultantes agenden solos en los horarios que defina. Cada cita llega a su agenda y se envía un correo de confirmación al consultante y a usted.</p>
    ${r.slug ? `<div class="row"><input type="text" id="rs_url" readonly value="${esc(url(r.slug))}" style="flex:1"><button class="btn" data-r="copy">Copiar</button><button class="btn" data-r="new">Crear enlace nuevo</button></div>` : '<p style="margin:0;font-size:13px;color:var(--muted)">El enlace se crea al guardar.</p>'}</div>
    <div class="sec"><h3>2 · Calendario de atención</h3><p style="margin:0;font-size:13px;color:var(--muted)">Haga clic en cada día en que atiende y escriba sus horas (por ejemplo, 8:00 a 12:00 y 15:00 a 19:00) y los tipos de consulta de ese día (presencial, virtual o telefónica; puede marcar varios). Los días sin marcar no se ofrecen a los consultantes.</p><div id="rs_cal" style="display:flex;flex-direction:column;gap:12px">${calHTML()}${diaHTML()}</div></div>
    <div class="sec"><h3>3 · Reglas de reserva</h3>
    <div class="grid">${[['rs_dur', 'Duración de cada cita (min)', st.duracion], ['rs_des', 'Descanso entre citas (min)', st.descanso], ['rs_avi', 'Anticipación mínima (horas)', st.aviso], ['rs_can', 'Cancelar hasta (horas antes)', st.cancelacion], ['rs_hor', 'Hasta cuántos días adelante', st.horizonte]].map(([id, l, v]) => `<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="text" inputmode="numeric" value="${esc(v)}"></div>`).join('')}</div>
    <p style="margin:0;font-size:13px;color:var(--muted)"><b>Anticipación mínima:</b> con cuántas horas de antelación como mínimo pueden reservar (con 24, hoy no verán horarios que empiecen dentro de menos de un día).</p>
    <p style="margin:0;font-size:13px;color:var(--muted)"><b>Hasta cuántos días adelante:</b> qué tan lejos en el futuro pueden agendar (con 30, solo verán horarios de los próximos 30 días).</p>
    <p style="margin:0;font-size:13px;color:var(--muted)"><b>Cancelar hasta:</b> cuántas horas antes de la cita pueden cancelarla ellos mismos (0 = sin límite); después deben comunicarse con usted.</p>
    <p style="margin:0;font-size:13px;color:var(--muted)">El descanso es tiempo que queda reservado después de cada cita (para sus notas) y no se ofrece a los consultantes. Use 0 si no lo necesita.</p>
    <p style="margin:0;font-size:13px;color:var(--muted)">Los consultantes nuevos agendan sin que se cree su ficha; los que ya tienen ficha se identifican con documento y correo.</p>
    </div>
    <div class="row end"><button class="btn pri" data-r="save">Guardar</button></div></div></div>`;
    const m1 = root.querySelector('.modal'), b1 = root.querySelector('.box'); if (m1) m1.scrollTop = sm; if (b1) b1.scrollTop = sb;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (b1) b1.scrollTop = sb; if (m1) m1.scrollTop = sm; }));  // la ✕ de la ventana se agrega un instante después y mueve el diseño
  };
  const drawCal = () => { const c = $('#rs_cal'); if (c) c.innerHTML = calHTML() + diaHTML(); };  // solo el calendario: no mueve el desplazamiento de la ventana
  draw();
  root.onchange = e => {
    if (e.target.id === 'rs_atiendo') { sync(); if (e.target.checked) st.fechas[st.sel] = { modalidades: ['Presencial'], franjas: [['09:00', '17:00']] }; else delete st.fechas[st.sel]; drawCal(); }
    else if (e.target.dataset.dm) { const f = st.fechas[st.sel], ms = [...root.querySelectorAll('[data-dm]:checked')].map(k => k.dataset.dm); if (!ms.length) toast('Elija al menos un tipo de consulta.'); else if (f) f.modalidades = ms; sync(); drawCal(); }
    else if (e.target.id === 'rs_hor') { sync(); const l = limite().slice(0, 7); if (st.mes > l) st.mes = l; drawCal(); }
  };
  root.onclick = async e => {
    const c = e.target.closest('[data-c]'); if (c) { sync(); st.sel = c.dataset.c; drawCal(); return; }
    const b = e.target.closest('[data-r]'); if (!b) return;
    const g = b.dataset.r;
    if (g === 'close') { root.innerHTML = ''; root.onclick = root.onchange = null; return; }
    if (g === 'copy') { const i = $('#rs_url'); i.select(); try { await navigator.clipboard.writeText(i.value); toast('Enlace copiado.'); } catch (err) { toast('Enlace seleccionado: cópielo con Ctrl+C.'); } return; }
    if (g === 'mv') { sync(); const [y, m] = st.mes.split('-').map(Number), n = new Date(y, m - 1 + +b.dataset.v, 1); st.mes = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); drawCal(); return; }
    if (g === 'add') { sync(); const rs = st.fechas[st.sel].franjas, last = rs[rs.length - 1]; const h = +last[1].slice(0, 2); rs.push([last[1], h < 23 ? String(h + 1).padStart(2, '0') + last[1].slice(2) : '23:59']); drawCal(); return; }
    if (g === 'rep') {
      sync(); const n = parseInt($('#rs_rep').value, 10), f = st.fechas[st.sel], lim = limite();
      if (!(n >= 1 && n <= 52)) { toast('Escriba cuántas semanas repetir (de 1 a 52).'); return; }
      let k = 0;
      for (; k < n; k++) { const d = new Date(st.sel + 'T12:00:00'); d.setDate(d.getDate() + 7 * (k + 1)); const ds = isoR(d); if (ds > lim) break; st.fechas[ds] = { modalidades: f.modalidades.slice(), franjas: f.franjas.map(x => x.slice()) }; }
      toast(k ? 'Horario repetido en ' + k + (k === 1 ? ' semana más.' : ' semanas más.') + (k < n ? ' Se detuvo en el límite de «Hasta cuántos días adelante».' : '') : 'Esa fecha ya queda fuera de «Hasta cuántos días adelante»: súbalo para repetir más.');
      drawCal(); return;
    }
    if (g === 'del') { sync(); const f = st.fechas[st.sel]; f.franjas.splice(+b.dataset.j, 1); if (!f.franjas.length) delete st.fechas[st.sel]; drawCal(); return; }
    try {
      if (g === 'new' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: el anterior dejará de funcionar'; return; }
      sync();
      r = await api('/reserva', { method: 'PUT', body: Object.assign({ activo: st.activo, dias: {}, fechas: st.fechas, duracion: st.duracion, descanso: st.descanso, aviso: st.aviso, cancelacion: st.cancelacion, horizonte: st.horizonte }, g === 'new' ? { renovar: true } : {}) });
      draw(); toast(g === 'new' ? 'Enlace nuevo creado.' : 'Guardado.');
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
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil».'); return; }
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
const Idle = { last: Date.now(), ping: Date.now(), timer: null, saved: false, draftSaved: false };
const draftBtn = () => document.querySelector('#intakeform [data-act="saveIntake"][data-sign="0"], #noteform [data-act="saveNote"][data-sign="0"], #reportform [data-act="saveReport"][data-sign="0"], [data-act="saveConsentDraft"], #tabbody [data-act="saveExtra"], #tabbody [data-act="extraSave"]');
/* Guardado automático: 4 s después de dejar de escribir se guarda el borrador, sin avisos ni redibujar. */
function autoDraft() {
  clearTimeout(AUTO.t);
  AUTO.t = setTimeout(async () => {
    if (!S.dirty || AUTO.busy || $('.modal') || !S.user) return;
    const db = draftBtn(); if (!db) return;
    AUTO.busy = AUTO.on = true;
    try { await ACT[db.dataset.act](db); } catch (e) { /* se reintenta con la próxima edición */ }
    AUTO.busy = AUTO.on = false;
    if (!S.dirty) { let s = $('#autosaved'); if (!s) { s = document.createElement('div'); s.id = 'autosaved'; s.setAttribute('role', 'status'); s.style.cssText = 'position:fixed;right:14px;bottom:10px;font-size:12px;color:var(--muted,#6b7a70);background:var(--card,#fff);padding:4px 10px;border-radius:99px;box-shadow:0 1px 4px #0002;z-index:50'; document.body.append(s); }
      s.textContent = 'Borrador guardado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); clearTimeout(s._t); s._t = setTimeout(() => s.remove(), 4000); }
  }, 4000);
}
/* Al aparecer el aviso (la sesión sigue vigente) se guarda como borrador lo que el usuario estaba escribiendo. */
async function idleAutosave() {
  Idle.saved = true;
  if (!S.dirty) return;
  const db = draftBtn();
  if (!db) return;
  try { await ACT[db.dataset.act](db); } catch (e) { /* si falla, la sesión se cierra igual */ }
  Idle.draftSaved = !S.dirty;
}
function hideIdleWarn() { const w = $('#idlewarn'); if (w) w.remove(); }
function idleActivity() {
  if (!S.user || S.mode !== 'server') return;
  if ($('#idlewarn')) return; // con el aviso visible, solo el botón cuenta como actividad
  Idle.last = Date.now(); Idle.saved = false; Idle.draftSaved = false;
  if (Date.now() - Idle.ping > 5 * 60000) { Idle.ping = Date.now(); api('/auth/me').catch(() => { }); }
}
function idleTick() {
  if (!S.user || S.mode !== 'server') { hideIdleWarn(); return; }
  const lim = (S.user.idle_minutes || 30) * 60000, left = lim - (Date.now() - Idle.last);
  if (left <= 0) { doLogout('Su sesión se cerró por inactividad.' + (Idle.draftSaved ? ' Lo que estaba escribiendo quedó guardado como borrador.' : '') + ' Ingrese de nuevo.'); return; }
  if (left <= 60000) {
    if (!Idle.saved) idleAutosave();
    let w = $('#idlewarn');
    if (!w) {
      w = document.createElement('div'); w.id = 'idlewarn'; w.className = 'idle';
      w.innerHTML = '<div class="box" role="alertdialog" aria-live="assertive"><b>¿Sigue ahí?</b><p style="margin:0">Por seguridad, su sesión se cerrará en <span id="idlesec">60</span> segundos.</p><button class="btn pri" id="idlego">Seguir trabajando</button></div>';
      document.body.appendChild(w);
      $('#idlego').onclick = () => { hideIdleWarn(); Idle.last = Date.now(); Idle.saved = false; Idle.draftSaved = false; Idle.ping = Date.now(); api('/auth/me').catch(() => { }); };
      $('#idlego').focus();
    }
    $('#idlesec').textContent = Math.max(0, Math.ceil(left / 1000));
  }
}
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, idleActivity, { passive: true, capture: true }));
setInterval(idleTick, 1000);

