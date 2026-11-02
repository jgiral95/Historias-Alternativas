/* Informes, plantillas de informe y recordatorios de citas. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Informes, perfil y arranque ===== */
function reportForm(p, r) {
  r = r || {};
  const sel = r.plantilla || (r.tipo && REPORT_TYPES.includes(r.tipo) ? 'base:' + r.tipo : 'base:' + REPORT_TYPES[0]);
  const tipo = r.tipo || tplName(sel), tpl = reportTemplate(sel, p, S.profile);
  return `<div class="card" id="reportform"><h3>${r.id ? 'Editar borrador' : 'Nuevo informe'}</h3>${sigNeeded()}
  <div class="grid"><div class="fld"><label for="f_plantilla">Plantilla</label><select id="f_plantilla" data-f="plantilla">${tplOptions(sel)}</select></div>
  <div class="fld"><label for="f_tipo">Título del informe</label><input id="f_tipo" data-f="tipo" type="text" value="${esc(tipo)}" data-auto="${esc(r.tipo ? '' : tipo)}"></div>
  ${F('Dirigido a', 'destinatario', r.destinatario, { ph: 'Ej.: Coordinación académica, Colegio…' })}${F('Asunto', 'asunto', r.asunto, { wide: true })}</div>
  <div class="fld"><label for="f_contenido">Contenido (revíselo y ajústelo: comparta solo lo necesario)</label>${richBar('f_contenido')}<textarea id="f_contenido" data-f="contenido" data-tpl="${esc(r.contenido ? '' : tpl)}" rows="14">${esc(r.contenido || tpl)}</textarea></div>
  <div class="row"><button class="btn sm" data-act="regenReport">Regenerar desde plantilla</button><button class="btn sm" data-act="formats" data-hub="informes">Editar plantillas</button><button class="btn sm" data-act="tplManage">Mis plantillas</button></div>
  <div class="grid">${F('Divulgación autorizada por', 'autorizaPor', r.autorizaPor || (ageOf(p.nacimiento) !== null && ageOf(p.nacimiento) < 18 && p.acudNombre ? 'Acudiente: ' + p.acudNombre : 'El consultante'))}</div>
  <label class="check"><input type="checkbox" id="r_ok" data-f="autoriza" ${r.autoriza ? 'checked' : ''}> <span>Cuento con autorización escrita del consultante o su acudiente para entregar este informe y su contenido.</span></label>
  <div class="fld"><span class="lbl">Firma del terapeuta (de su perfil)</span>${therPreview()}</div>
  <p class="lock-note">Al guardar, el documento queda firmado con su firma, la fecha y la hora, y <b>no podrá modificarse</b>. Solo podrá agregar adendas.</p><div class="row end"><button class="btn" data-act="cancelReport">Cancelar</button><button class="btn pri" data-act="saveReport" data-sign="1">Firmar y guardar</button></div></div>`;
}
function reportCard(r) {
  return `<div class="card" id="rec-${r.id}"><div class="row" style="justify-content:space-between"><span><b>${esc(r.tipo)}</b>${r.destinatario ? ' · ' + esc(r.destinatario) : ''}</span><span class="chip ${r.signedAt ? 'ok' : 'warn'}">${r.signedAt ? 'Firmado' : 'Borrador'}</span></div>
  <span class="ts">${r.folio ? 'Folio n.º ' + r.folio + ' · ' : ''}${esc(fmtDT(r.signedAt || r.updatedAt))}</span>
  ${r.signedAt ? `${r.verificacion ? `<span class="ts">Código de verificación: <b>${esc(r.verificacion)}</b></span>` : ''}${addendaHTML(r, 'report', r.id)}<div class="row"><button class="btn sm pri" data-act="viewReport" data-id="${r.id}">Ver y descargar</button></div>`
    : `<div class="row"><button class="btn sm pri" data-act="editReport" data-id="${r.id}">Continuar edición</button><button class="btn sm warn" data-act="delReport" data-id="${r.id}">Descartar borrador</button></div>`}</div>`;
}
/* Para emitir informes el consultante debe tener consentimiento de atención vigente y primera vez firmada
   (o una constancia de historia en papel incorporada). */
function reportBlockers(p) { return []; }  // el consentimiento y la primera vez son opcionales
function tabInformes(p) {
  const rs = S.reports.filter(r => r.patientId === p.id).sort((a, b) => (b.signedAt || b.updatedAt || '').localeCompare(a.signedAt || a.updatedAt || ''));
  const editing = S.newReport === 'new' ? {} : (S.newReport ? S.reports.find(r => r.id === S.newReport) : null);
  const blk = reportBlockers(p);
  if (blk.length) S.newReport = false;
  const blkHTML = blk.length ? `<div class="banner" id="reportblock"><b>Aún no puede emitir informes para este consultante.</b> Falta ${blk.map(b => b[1]).join(' y ')}.<div class="row" style="margin-top:6px">${blk.map(([t, l]) => `<button class="btn sm" data-act="tab" data-tab="${t}">${t === 'consent' ? 'Ir a Consentimiento' : 'Ir a Primera vez'}</button>`).join('')}</div></div>` : '';
  return `<div class="sec">${blkHTML}<div class="row" style="justify-content:space-between"><h3 style="flex:1">Informes y certificados (${rs.filter(r => r.signedAt).length})</h3>${S.newReport ? '' : `<span class="row"><button class="btn pri" data-act="newReport" ${blk.length ? 'disabled title="Falta consentimiento o primera vez"' : ''}>Nuevo informe</button></span>`}</div>
  ${S.newReport ? reportForm(p, editing) : ''}${rs.filter(r => r.id !== S.newReport).map(reportCard).join('') || (S.newReport ? '' : '<div class="empty">Aún no hay informes. Genere constancias para colegios, empleadores, adopción de mascotas o remisiones.</div>')}</div>`;
}
ACT.newReport = () => { const blk = reportBlockers(curPatient()); if (blk.length) { toast('Falta ' + blk.map(b => b[1]).join(' y ') + '.'); return; } S.newReport = 'new'; render(); };
ACT.cancelReport = () => { S.newReport = false; render(); };
ACT.editReport = b => { S.newReport = b.dataset.id; render(); };
ACT.delReport = b => { S.reports = S.reports.filter(r => r.id !== b.dataset.id); Store.remove(b.dataset.id); toast('Borrador descartado.'); render(); };
ACT.regenReport = () => {
  const key = $('#f_plantilla').value, ta = $('#f_contenido'), ti = $('#f_tipo'), txt = reportTemplate(key, curPatient(), S.profile);
  ta.value = txt; ta.dataset.tpl = txt;
  if (!ti.value.trim() || ti.value === ti.dataset.auto) { ti.value = tplName(key); ti.dataset.auto = ti.value; }
  toast('Texto regenerado desde la plantilla.');
};
ACT.viewReport = b => { const p = curPatient(), r = S.reports.find(x => x.id === b.dataset.id); showDoc(r.tipo + ' · ' + fullName(p), docReport(r, p), 'informe-' + slug(r.tipo) + '-' + slug(fullName(p)) + '.html'); };
ACT.saveReport = async b => {
  const p = curPatient(), sign = b.dataset.sign === '1', o = readForm($('#reportform'), {});
  if (sign) {
    if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
    if (!o.contenido) { toast('El informe no tiene contenido.'); return; }
    if (!o.autoriza) { toast('Confirme que cuenta con la autorización de divulgación.'); return; }
  }
  let r = S.newReport && S.newReport !== 'new' ? S.reports.find(x => x.id === S.newReport) : null;
  const fresh = !r, snap = r ? clone(r) : null;
  if (!r) r = { id: newId('r'), kind: 'report', patientId: p.id };
  Object.assign(r, o, { updatedAt: nowISO() });
  if (sign) Object.assign(r, therSnap(), { signedAt: nowISO(), addenda: [] }, signExtrasReport(r));
  if (!(await persist([r], b))) { if (!fresh) restore(r, snap); return; }
  if (fresh) S.reports.push(r);
  S.newReport = false; toast(sign ? 'Informe firmado.' : 'Borrador guardado.'); render();
};

/* ----- Mis plantillas de informe ----- */
function refreshTplSelect(key) { const s = $('#f_plantilla'); if (s) s.innerHTML = tplOptions(key || s.value); }
ACT.tplManage = () => {
  const root = $('#modal-root'), list = myTemplates();
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis plantillas"><div class="box"><div class="row" style="justify-content:space-between"><h3>Mis formatos</h3><button class="btn sm" data-tm="close">Cerrar</button></div>${hubTabs('informes')}<b>Plantillas de informe</b>
  <p style="margin:0;font-size:13px;color:var(--muted)">Son solo suyas: ningún otro terapeuta las ve. Use variables como {paciente} para que se llenen solas con cada consultante. Nunca escriba datos de un consultante concreto en una plantilla.</p>
  ${list.length ? list.map(m => `<div class="card"><b>${esc(m.nombre)}</b><span class="ts">${esc((m.contenido || '').replace(/\s+/g, ' ').slice(0, 110))}…</span><div class="row"><button class="btn sm" data-tm="edit" data-id="${esc(m.id)}">Editar</button><button class="btn sm warn" data-tm="del" data-id="${esc(m.id)}">Eliminar</button></div></div>`).join('') : '<div class="empty">Aún no tiene plantillas propias. Cree la primera o guarde el texto de un informe como plantilla.</div>'}
  <div class="row end"><button class="btn pri" data-tm="new">Nueva plantilla</button></div></div></div>`;
  root.onclick = e => {
    const b = e.target.closest('[data-tm]'); if (!b) return; const k = b.dataset.tm;
    if (k === 'close') root.innerHTML = '';
    else if (k === 'new') openTplEditor({ from: 'manager' });
    else if (k === 'edit') openTplEditor({ id: b.dataset.id, from: 'manager' });
    else if (k === 'del') {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: eliminar'; return; }
      S.profile.plantillas = myTemplates().filter(m => m.id !== b.dataset.id); Store.save(S.profile); refreshTplSelect(); toast('Plantilla eliminada.'); ACT.tplManage();
    }
  };
};
function openTplEditor({ id, nombre = '', contenido = '', from, notice }) {
  const root = $('#modal-root'), cur = id ? myTemplates().find(m => m.id === id) : null;
  if (cur) { nombre = cur.nombre; contenido = cur.contenido; }
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Plantilla de informe"><div class="box" id="tplform"><div class="row" style="justify-content:space-between"><h3>${cur ? 'Editar plantilla' : 'Nueva plantilla'}</h3><button class="btn sm" id="tplx">Cancelar</button></div>
  ${notice ? `<div class="banner" role="alert">${esc(notice)}</div>` : ''}
  ${F('Nombre de la plantilla', 'tnombre', nombre, { ph: 'Ej.: Certificado para el colegio' })}
  <div class="fld"><label for="f_tcontenido">Texto</label>${richBar('f_tcontenido')}<textarea id="f_tcontenido" data-f="tcontenido" rows="14">${esc(contenido)}</textarea></div>
  <div class="fld"><span class="lbl">Insertar variable en el cursor</span><div class="row">${TPL_VARS.map(([k, l]) => `<button type="button" class="btn sm" data-var="${k}" title="{${k}}">${esc(l)}</button>`).join('')}</div></div>
  <div class="row end"><button class="btn pri" id="tplsave">Guardar plantilla</button></div></div></div>`;
  const back = () => { if (from === 'manager') ACT.tplManage(); else root.innerHTML = ''; };
  $('#tplx').onclick = back;
  root.onclick = e => { const v = e.target.closest('[data-var]'); if (!v) return; const ta = $('#f_tcontenido'); ta.focus(); ta.setRangeText('{' + v.dataset.var + '}', ta.selectionStart, ta.selectionEnd, 'end'); };
  $('#tplsave').onclick = () => {
    const o = readForm($('#tplform'), {}), name = (o.tnombre || '').slice(0, 80), body = o.tcontenido || '';
    if (!name) { toast('Escriba un nombre para la plantilla.'); return; }
    if (!body) { toast('La plantilla no tiene texto.'); return; }
    if (body.length > 20000) { toast('La plantilla es demasiado larga.'); return; }
    const list = myTemplates().slice(); let key;
    if (cur) { cur.nombre = name; cur.contenido = body; key = 'mia:' + cur.id; }
    else { if (list.length >= 30) { toast('Puede tener hasta 30 plantillas. Elimine alguna.'); return; } const nu = { id: newId('t'), nombre: name, contenido: body }; list.push(nu); key = 'mia:' + nu.id; }
    S.profile.plantillas = list; Store.save(S.profile); refreshTplSelect(from === 'form' ? key : undefined);
    toast('Plantilla guardada.'); back();
  };
}
ACT.saveAsTpl = () => {
  const ta = $('#f_contenido'); if (!ta || !ta.value.trim()) { toast('El informe no tiene texto para guardar.'); return; }
  const key = $('#f_plantilla').value, nm = $('#f_tipo').value.trim();
  openTplEditor({ from: 'form', nombre: nm && nm !== tplName(key) ? nm : '', contenido: unfill(ta.value, curPatient(), S.profile), notice: 'Revise el texto antes de guardar: los datos del consultante se cambiaron por variables, pero verifique que no queden nombres, fechas ni información de las sesiones de esta persona.' });
};

/* ===== Recordatorios de citas ===== */
async function remLoad() { if (S.mode !== 'server') return; try { S.rem = await api('/recordatorios'); } catch (e) { S.rem = null; } }
/* Citas dentro del plazo cuyo recordatorio no salió por correo: se envían a mano desde Pendientes. */
function remDue() {
  const r = S.rem; if (!r || !r.activo) return [];
  const now = Date.now(), lim = now + r.horas * 3600e3;
  return S.appts.filter(a => (a.estado || 'Programada') === 'Programada' && !(a.confirmacion && a.confirmacion.estado) && (() => { const t = new Date(a.startAt).getTime(); return t > now && t <= lim; })() && !((r.items[a.id] || {}).enviado))
    .filter(a => { const p = S.patients.find(x => x.id === a.patientId) || {}; return !(r.correo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.correo || '') && !(r.items[a.id] || {}).error); })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
function remApptHTML(a) {
  const c = a.confirmacion, r = S.rem && S.rem.items && S.rem.items[a.id];
  if (!c && !r) return '';
  return `<p class="stnote">${c ? `<b>${esc(c.estado)}</b> por el consultante el ${esc(fmtDT(c.at))}<br>` : ''}${r && r.enviado ? ` Recordatorio enviado por ${r.canal === 'correo' ? 'correo' : 'WhatsApp'} el ${esc(fmtDT(r.enviado))}` : ''}</p>`;
}
const DIAS_TXT = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function remText(a, p, url) {
  const d = new Date(a.startAt), h = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const who = (S.profile && S.profile.nombre) || (S.user && S.user.ownerName) || 'su terapeuta', nota = (S.rem && S.rem.nota) || '';
  return `Hola ${(p.nombres || '').split(' ')[0]}, le recordamos su cita con ${who} el ${DIAS_TXT[d.getDay()]} ${d.getDate()} de ${d.toLocaleDateString('es-CO', { month: 'long' })} a las ${h} (${(a.modalidad || 'Presencial').toLowerCase()}). ${nota ? nota + ' ' : ''}Por favor confirme o avísenos si no puede asistir: ${url}`;
}
async function remSend(id) {
  const a = S.appts.find(x => x.id === id); if (!a) return;
  const p = S.patients.find(x => x.id === a.patientId) || {}, root = $('#modal-root');
  let tok; try { tok = (await api('/recordatorios/' + id + '/enlace', { method: 'POST' })).enlace; } catch (e) { toast(e.message); return; }
  const url = location.origin + '/cita?t=' + tok, text = remText(a, p, url), ph = waPhone(p.telefono, p.telInd);
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Recordatorio de cita"><div class="box" style="max-width:560px"><h3>Recordatorio para ${esc(fullName(p))}</h3>
  <p class="stnote">Cita: ${esc(fmtDT(a.startAt))} — el consultante puede confirmar o cancelar con el enlace; su respuesta aparece en la agenda.</p>
  <div class="fld"><label for="rm_txt">Mensaje</label><textarea id="rm_txt" rows="5">${esc(text)}</textarea></div>
  <div class="row">${ph ? `<a class="btn pri" id="rm_wa" href="https://wa.me/${ph}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Abrir en WhatsApp</a>` : '<span class="chip warn">El consultante no tiene teléfono</span>'}${p.correo ? `<a class="btn" href="mailto:${esc(p.correo)}?subject=${encodeURIComponent('Recordatorio de su cita')}&body=${encodeURIComponent(text)}">Correo</a>` : ''}<button class="btn" id="rm_copy">Copiar mensaje</button></div>
  <div class="row end"><button class="btn" id="rm_close">Cerrar</button><button class="btn pri" id="rm_sent">Ya lo envié</button></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('#rm_txt').oninput = () => { const w = $('#rm_wa'); if (w) w.href = `https://wa.me/${ph}?text=${encodeURIComponent($('#rm_txt').value)}`; };
  $('#rm_close').onclick = close;
  $('#rm_copy').onclick = async () => { try { await navigator.clipboard.writeText($('#rm_txt').value); toast('Mensaje copiado.'); } catch (e) { $('#rm_txt').select(); toast('Copie el mensaje seleccionado.'); } };
  $('#rm_sent').onclick = async () => { try { await api('/recordatorios/' + id + '/enviado', { method: 'POST' }); await remLoad(); close(); render(); toast('Recordatorio marcado como enviado.'); } catch (e) { toast(e.message); } };
}
ACT.remSend = b => remSend(b.dataset.id);
ACT.remConfig = async () => {
  await remLoad();
  const r = S.rem || { activo: false, horas: 24, nota: '', correo: false }, root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Recordatorios de citas"><div class="box" id="remform" style="max-width:600px"><div class="row" style="justify-content:space-between"><h3>Recordatorios de citas</h3><button class="btn sm" id="rc_close">Cerrar</button></div>
  <p class="stnote">Antes de cada cita programada, el consultante recibe un recordatorio con un enlace para confirmar o cancelar. Su respuesta aparece en la agenda. El mensaje no lleva información de las sesiones: solo fecha, hora, modalidad y su nombre.</p>
  <label class="check"><input type="checkbox" id="rc_on" ${r.activo ? 'checked' : ''}> <span><b>Enviar recordatorios</b></span></label>
  <div class="grid"><div class="fld"><label for="rc_h">Cuándo</label><select id="rc_h">${[[2, '2 horas antes'], [12, '12 horas antes'], [24, '24 horas antes'], [48, '2 días antes']].map(([v, l]) => `<option value="${v}" ${r.horas === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="fld"><label for="rc_nota">Nota para todos los recordatorios (opcional)</label><input id="rc_nota" type="text" maxlength="300" value="${esc(r.nota || '')}" placeholder="Ej.: Por favor llegue 10 minutos antes."></div>
  <div class="card"><b>Cómo se envían</b><p class="stnote">${r.correo ? '<b>Correo:</b> automático, desde su correo de envío, a los consultantes que tengan correo.' : '<b>Correo:</b> aún no tiene su correo de envío configurado (está en «Mi encuesta de satisfacción» → «Correo de envío»). Sin él, todos los recordatorios se envían a mano.'}<br><b>WhatsApp:</b> los demás aparecen en Pendientes con un botón que abre WhatsApp con el mensaje listo; su equipo también puede enviarlos.</p></div>
  <div class="row end"><button class="btn pri" id="rc_save">Guardar</button></div></div></div>`;
  $('#rc_close').onclick = () => { root.innerHTML = ''; };
  $('#rc_save').onclick = async () => {
    const snap = clone(S.profile);
    S.profile.recordatorios = { activo: $('#rc_on').checked, horas: +$('#rc_h').value, nota: $('#rc_nota').value.trim().slice(0, 300) };
    if (!(await persist([S.profile], $('#rc_save')))) { restore(S.profile, snap); return; }
    await remLoad(); root.innerHTML = ''; render(); toast('Recordatorios guardados.');
  };
};

