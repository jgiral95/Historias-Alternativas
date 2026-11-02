/* Primera vez y sesión: cabecera de la atención, impresiones y atención a distancia. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Primera vez y sesión ===== */
function kvHTML(rec, fields) { const rows = fields.filter(f => rec[f[0]]); return rows.length ? `<dl class="kv">${rows.map(f => f[1] ? `<dt>${esc(f[1])}</dt><dd>${esc(rec[f[0]])}</dd>` : `<dd style="grid-column:1/-1">${esc(rec[f[0]])}</dd>`).join('')}</dl>` : ''; }
const addAuthor = a => [a.by, a.cc ? 'C.C. ' + a.cc : '', a.tp ? 'T.P. ' + a.tp : ''].filter(Boolean).join(' · ');
function addendumBody(a) {
  return a.tipo === 'Corrección' ? `<p style="margin:0"><b>Decía:</b> «${esc(a.dice)}»</p><p style="margin:0"><b>Debe decir:</b> «${esc(a.debe)}»</p><p style="margin:0"><b>Motivo:</b> ${esc(a.text)}</p>` : `<p style="margin:0">${esc(a.text)}</p>`;
}
function addendaHTML(rec, kind, id) {
  const list = (rec.addenda || []).map(a => `<div class="card"><span class="ts">${a.tipo === 'Corrección' ? 'Corrección' : 'Adenda'} · ${esc(fmtShort(a.at))}${a.by ? ' · ' + esc(addAuthor(a)) : ''}</span>${addendumBody(a)}</div>`).join('');
  return `${list}<details><summary style="cursor:pointer;color:var(--accent-fg);font-weight:500">Agregar adenda o corrección</summary><div class="sec" style="margin-top:8px">
  <div class="fld"><label for="adt_${id}">Tipo</label><select id="adt_${id}" data-adtipo="${id}"><option value="Adenda">Adenda (información adicional)</option><option value="Corrección">Corrección de un error</option></select></div>
  <div class="grid" id="adc_${id}" hidden><div class="fld wide"><label for="add_${id}">Qué dice el registro (texto que se corrige)</label><textarea id="add_${id}" rows="2"></textarea></div><div class="fld wide"><label for="adn_${id}">Qué debe decir</label><textarea id="adn_${id}" rows="2"></textarea></div></div>
  <p class="stnote" id="adh_${id}" hidden>El registro original no se borra: la corrección queda agregada, con fecha, hora, su nombre y su identificación.</p>
  <div class="fld"><label for="ad_${id}" id="adl_${id}">Texto de la adenda (queda con fecha y hora)</label><textarea id="ad_${id}" rows="3"></textarea></div><div class="row end"><button class="btn sm pri" data-act="addAdd" data-kind="${kind}" data-id="${id}">Guardar adenda</button></div></div></details>`;
}
document.addEventListener('change', e => {
  const s = e.target.closest && e.target.closest('[data-adtipo]'); if (!s) return;
  const id = s.dataset.adtipo, corr = s.value === 'Corrección';
  $('#adc_' + id).hidden = !corr; $('#adh_' + id).hidden = !corr; $('#adl_' + id).textContent = corr ? 'Motivo de la corrección' : 'Texto de la adenda (queda con fecha y hora)';
});
ACT.addAdd = async b => {
  const id = b.dataset.id, tipo = ($('#adt_' + id) || {}).value || 'Adenda', t = $('#ad_' + id).value.trim();
  const corr = tipo === 'Corrección', dice = corr ? $('#add_' + id).value.trim() : '', debe = corr ? $('#adn_' + id).value.trim() : '';
  if (corr && (!dice || !debe)) { toast('Escriba qué dice el registro y qué debe decir.'); return; }
  if (!t) { toast(corr ? 'Escriba el motivo de la corrección.' : 'Escriba el texto de la adenda.'); return; }
  if (!S.profile.nombre) { toast('Complete su nombre en el perfil.'); return; }
  const p = curPatient(); let rec, owner;
  if (b.dataset.kind === 'intake') { rec = p.intake; owner = p; } else if (b.dataset.kind === 'note') { rec = S.notes.find(n => n.id === b.dataset.id); owner = rec; } else { rec = S.reports.find(n => n.id === b.dataset.id); owner = rec; }
  const snap = clone(owner);
  rec.addenda = rec.addenda || []; rec.addenda.push(Object.assign({ text: t, at: nowISO(), by: S.profile.nombre }, S.profile.cedula ? { cc: S.profile.cedula } : {}, S.profile.registro ? { tp: S.profile.registro } : {}, corr ? { tipo: 'Corrección', dice, debe } : {}));
  if (!(await persist([owner], b))) { restore(owner, snap); return; }
  toast(corr ? 'Corrección agregada.' : 'Adenda agregada.'); render();
};
const toISO = v => v ? new Date(v).toISOString() : nowISO();
/* Marca los obligatorios vacíos, lleva al primero y avisa. */
function reqCheck() { $$('.fld.miss').forEach(x => x.classList.remove('miss')); return true; }  // ningún campo es obligatorio
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nr]'); if (!b) return;
  const ta = document.getElementById('f_' + b.dataset.nr); if (!ta) return;
  ta.value = b.textContent; ta.dispatchEvent(new Event('input', { bubbles: true })); const f = ta.closest('.fld'); if (f) f.classList.remove('miss');
});
/* ----- Cabecera de la atención, riesgo y destino ----- */
/* Datos de la atención: fecha y hora, modalidad y quiénes estuvieron presentes. */
function atencionBlock(r, kind, p) {
  r = r || {};
  const mod = r.modalidad && MODS.includes(r.modalidad) ? r.modalidad : 'Presencial';
  const ini = r.sessionAt ? new Date(r.sessionAt) : new Date(), hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const fin = r.horaFin || hm(new Date(ini.getTime() + (+r.duracion || 50) * 60000));
  return `<div class="sec" id="atblock"><h3>Datos de la atención</h3><div class="grid">
  ${F('Fecha y hora de inicio', 'sessionAt', localInput(ini), { type: 'datetime-local' })}
  ${F('Hora de fin', 'horaFin', fin, { type: 'time' })}
  ${F('Modalidad', 'modalidad', mod, { type: 'select', opts: MODS })}
  ${kind === 'intake' ? F('Vía de ingreso', 'viaIngreso', r.viaIngreso || VIAS[0], { type: 'select', opts: VIAS }) : ''}</div><div class="grid">
  ${F('Otras personas presentes', 'presentes', r.presentes || '', { ph: 'Ej.: la madre; practicante Ana López', req: true, nr: ['Ninguna'] })}</div>
  ${chk('presentesConsent', 'Las personas presentes (acompañantes, practicantes u observadores) aceptaron estar en la sesión y conocen la reserva de la información.', r.presentesConsent)}</div>`;
}
const riesgoSel = r => F('Nivel de alerta (si la persona podría hacerse daño, hacerle daño a otros o está en una situación vulnerable)', 'riesgoNivel', (r || {}).riesgoNivel || '', { type: 'select', opts: [''].concat(RIESGO), req: true });
function atencionChecks(o) {
  const nadie = !String(o.presentes || '').trim() || /^(ninguna|nadie|no aplica|no refiere|no se indagó)/i.test(String(o.presentes).trim());
  if (nadie) delete o.presentesConsent;
  if (!/^\d{2}:\d{2}$/.test(o.horaFin || '')) { delete o.duracion; return true; }
  const ini = new Date(o.sessionAt), min = (+o.horaFin.slice(0, 2)) * 60 + (+o.horaFin.slice(3)) - (ini.getHours() * 60 + ini.getMinutes());
  if (!(min > 0)) { toast('La hora de fin debe ser posterior a la de inicio.'); const f = $('#f_horaFin'); if (f) { f.closest('.fld').classList.add('miss'); f.focus(); } return false; }
  o.duracion = min;
  return true;
}
/* Tabla de la cabecera de la atención en los documentos. */
function atencionDoc(r) {
  const rows = [['Folio', r.folio ? 'N.º ' + r.folio : ''], ['Sesión', r.sesion ? 'N.º ' + r.sesion : ''], ['Hora de fin', r.horaFin], ['Entorno', r.entorno], ['Vía de ingreso', r.viaIngreso], ['Causa de la atención', r.causa], ['Personas presentes', r.presentes ? r.presentes + (r.presentesConsent ? ' (aceptaron estar presentes)' : '') : ''], ['Nivel de riesgo', r.riesgoNivel], ['Condición y destino al terminar', r.destino]].filter(x => x[1]);
  return rows.length ? `<table>${rows.map(x => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td></tr>`).join('')}</table>` : '';
}

/* ===== Impresiones o motivos de seguimiento: texto libre, sin clasificaciones oficiales ===== */
const DX_ESTADOS = ['Activo', 'Inactivo', 'Histórico'];
function dxNorm(d, doc) {
  doc = doc || {};
  return { nombre: d.nombre, fecha: d.fecha || doc.sessionAt || doc.signedAt || '', estado: d.estado || 'Activo' };
}
const dxActive = l => (l || []).filter(d => (d.estado || 'Activo') === 'Activo');
const Dx = { ctx: null, items: [], base: [] };
/* El cuadro se llena una vez por documento (primera vez o sesión) y sobrevive a los redibujados. */
function dxReset(ctx, seed) { if (Dx.ctx !== ctx) { Dx.ctx = ctx; Dx.base = clone(seed || []); Dx.items = clone(seed || []); } }
const dxSig = l => JSON.stringify((l || []).map(d => [d.nombre, d.estado || 'Activo']));
const dxChanged = () => dxSig(Dx.items) !== dxSig(Dx.base);
/* Impresión vigente: la de la sesión firmada más reciente que la registre; si no hay, la de la primera vez. */
function currentDx(p, exceptId) {
  const n = S.notes.filter(x => x.patientId === p.id && x.signedAt && x.id !== exceptId && Array.isArray(x.diagnosticos)).sort((a, b) => b.sessionAt.localeCompare(a.sessionAt) || String(b.signedAt).localeCompare(String(a.signedAt)))[0];
  if (n) return { items: n.diagnosticos.map(d => dxNorm(d, n)), from: 'la sesión del ' + fmtD(n.sessionAt) };
  const i = p.intake && p.intake.signedAt ? p.intake : null;
  if (i && Array.isArray(i.diagnosticos)) return { items: i.diagnosticos.map(d => dxNorm(d, i)), from: 'la primera vez del ' + fmtD(i.sessionAt) };
  return { items: [], from: '' };
}
function dxListHTML() {
  if (!Dx.items.length) return '<p style="margin:0;color:var(--muted);font-size:14px">Aún no ha agregado impresiones.</p>';
  return `<div class="dxlist">${Dx.items.map((d, k) => `<div class="dxrow ${d.estado && d.estado !== 'Activo' ? 'off' : ''}"><span class="dxname">${esc(d.nombre)}${k === 0 ? ' <span class="chip">Principal</span>' : ''}${d.fecha ? `<small class="dxmeta">registrada el ${esc(fmtD(d.fecha))}</small>` : ''}</span>
  <span class="dxctl"><select data-dx="estado:${k}" aria-label="Estado de ${esc(d.nombre)}">${DX_ESTADOS.map(t => `<option ${t === (d.estado || 'Activo') ? 'selected' : ''}>${t}</option>`).join('')}</select>${k ? `<button type="button" class="btn sm" data-dx="up:${k}">Hacer principal</button>` : ''}<button type="button" class="btn sm warn" data-dx="del:${k}" aria-label="Quitar ${esc(d.nombre)}">Quitar</button></span></div>`).join('')}</div>`;
}
function dxBlock(i, o = {}) {
  dxReset(o.ctx || 'intake:' + (curPatient() || {}).id, o.seed);
  const intro = o.from ? `Impresión vigente, tomada de ${esc(o.from)}. Modifíquela solo si cambió en esta sesión: agregue, o cambie el estado (activa, inactiva o histórica). «Quitar» es solo para corregir un error.`
    : o.note ? 'El consultante aún no tiene impresiones registradas. Puede agregarlas aquí.'
    : 'Escriba con sus propias palabras la impresión o el motivo de seguimiento y pulse «Agregar». La primera de la lista es la principal.';
  return `<div class="sec" id="dxblock" ${o.note ? 'data-note="1"' : ''}><h3>Impresión o motivo de seguimiento</h3>
  <p style="margin:0;font-size:13px;color:var(--muted)">${intro}</p><div id="dxchg">${o.note ? dxChgHTML() : ''}</div>
  <div class="row"><input id="dx_q" type="text" maxlength="300" autocomplete="off" placeholder="Ej.: ansiedad ante exámenes, duelo reciente" aria-label="Nueva impresión" style="flex:1"><button type="button" class="btn sm" data-dx="add:0">Agregar</button></div>
  <div id="dxlist">${dxListHTML()}</div>
  ${F(o.note ? 'Observaciones o motivo del cambio (opcional)' : 'Observaciones (opcional)', 'dxObs', i.dxObs || '', { type: 'area', rows: 2, wide: true, ph: '' })}</div>`;
}
function dxChgHTML() { return dxChanged() ? '<span class="chip warn">Impresión actualizada en esta sesión. Si quiere, explique el motivo abajo.</span>' : ''; }
function dxRedraw() { $('#dxlist').innerHTML = dxListHTML(); const c = $('#dxchg'); if (c && $('#dxblock').dataset.note) c.innerHTML = dxChgHTML(); }
function dxMount() {}
function dxAdd() {
  const q = $('#dx_q'), t = q.value.trim().slice(0, 300); if (!t) { q.focus(); return; }
  if (Dx.items.some(x => x.nombre.toLowerCase() === t.toLowerCase())) toast('Esa impresión ya está en la lista.');
  else if (Dx.items.length >= 12) toast('Máximo 12 impresiones.');
  else { Dx.items.push({ nombre: t, fecha: nowISO(), estado: 'Activo' }); S.dirty = true; }
  dxRedraw(); q.value = ''; q.focus();
}
function dxClick(t) {
  const [op, a] = t.dataset.dx.split(':'), k = +a;
  if (op === 'add') return dxAdd();
  if (op === 'del') Dx.items.splice(k, 1);
  if (op === 'up') Dx.items.unshift(Dx.items.splice(k, 1)[0]);
  S.dirty = true; dxRedraw();
}
function dxKey(e) { if (e.key === 'Enter') { e.preventDefault(); dxAdd(); } }
/* Impresiones de un documento firmado (en la ficha y en el documento). */
function dxTable(i) {
  const dx = (i.diagnosticos || []).map(d => dxNorm(d, i));
  const chg = i.dxCambio ? '<p style="margin:0 0 6px"><b>Impresión actualizada en esta sesión.</b></p>' : '';
  const rows = dx.length ? `<ul style="margin:0;padding-left:18px">${dx.map((d, k) => `<li>${esc(d.nombre)}${k === 0 && dx.length > 1 ? ' <i>(principal)</i>' : ''}${d.estado !== 'Activo' ? ' · ' + esc(d.estado.toLowerCase()) : ''}</li>`).join('')}</ul>` : '<p style="margin:0">Sin impresiones registradas.</p>';
  return chg + rows + (i.dxObs ? `<p style="margin:6px 0 0"><b>${i.dxCambio ? 'Motivo del cambio' : 'Observaciones'}.</b> ${esc(i.dxObs)}</p>` : '');
}
const hasDx = i => i && (i.diagnosticos !== undefined || i.dxObs);

function tabIntake(p) {
  const i = p.intake || {};
  if (i.signedAt) {
    return `<div class="sec"><h3>Primera vez</h3><div class="row"><span class="chip ok">Firmada</span><span style="font-family:var(--f-mono);font-size:13px">${esc(fmtDT(i.signedAt))}</span></div>
    <p style="margin:0;color:var(--muted);font-size:13px">Sesión: ${esc(fmtDT(i.sessionAt))}${i.folio ? ' · Folio n.º ' + i.folio + ' · Sesión n.º ' + (i.sesion || 1) : ''}</p>
    ${atencionDoc(Object.assign({}, i, { folio: '', sesion: '' })) ? `<div class="sec"><h3>Datos de la atención</h3>${atencionDoc(Object.assign({}, i, { folio: '', sesion: '' }))}</div>` : ''}${i.riesgoAcciones ? `<dl class="kv"><dt>Riesgo: hallazgos y acciones</dt><dd>${esc(i.riesgoAcciones)}</dd></dl>` : ''}
    ${intakeSchema(i).map(([t, fs, g]) => { const k = kvHTML(i, fs), gi = g === 'genograma' && i.genograma ? `<div class="fld"><span class="lbl">Genograma</span><img class="geno" src="${i.genograma}" alt="Genograma"></div>` : ''; return (k || gi) ? `<div class="sec"><h3>${esc(t)}</h3>${k}${gi}</div>` : ''; }).join('')}
    ${hasDx(i) ? `<div class="sec"><h3>Impresión o motivo de seguimiento</h3>${dxTable(i)}</div>` : ''}
    ${legacyOf(i).length ? `<div class="sec"><h3>Registros de la versión anterior</h3><dl class="kv">${legacyOf(i).map(([k, l]) => `<dt>${esc(l)}</dt><dd>${esc(i[k])}</dd>`).join('')}</dl></div>` : ''}
    <div class="fld"><span class="lbl">Firma del terapeuta · ${esc(i.therapistName)}</span><img class="sigimg" src="${i.therapistSig}" alt="Firma del terapeuta"></div>
    ${addendaHTML(i, 'intake', 'intake')}
    <div class="row"><button class="btn pri" data-act="viewIntake">Ver y descargar documento</button></div></div>`;
  }
  const consentWarn = (p.consents || []).length ? '' : '<div class="banner">Este consultante aún no tiene consentimiento informado firmado.</div>';
  return `<div id="intakeform" class="sec">${consentWarn}${sigNeeded()}<div class="row" style="justify-content:space-between"><h3 style="flex:1">Primera vez</h3><button class="btn" data-act="saveIntake" data-sign="0">Guardar borrador</button><button class="btn pri" data-act="saveIntake" data-sign="1">Firmar y guardar</button></div>${phraseHint()}
  ${atencionBlock(i, 'intake', p)}
  <div id="teleslot">${isRemote(i.modalidad) ? teleBlock(i) : ''}</div>
  <p class="stnote">Todos los campos son opcionales: llene lo que le sirva.</p>
  ${intakeSchema(i).map(([t, fs, g]) => `<div class="sec"><h3>${esc(t)}</h3><div class="grid">${fs.map(f => F(f[1], f[0], i[f[0]] !== undefined ? i[f[0]] : (f[3] || ''), { type: 'area', rows: f[2], wide: true, aria: t, req: true })).join('')}</div>${g === 'genograma' ? genoBlock() : ''}</div>`).join('')}
  <div class="sec" id="riskblock"><h3>Señales de alerta</h3><div class="grid">${riesgoSel(i)}</div>${F('Qué se observó y qué se hizo', 'riesgoAcciones', i.riesgoAcciones || '', { type: 'area', rows: 2, wide: true, req: true })}</div>
  ${dxBlock(i)}
  ${legacyOf(i).length ? `<div class="sec"><h3>Datos de la versión anterior</h3><p style="margin:0;font-size:13px;color:var(--muted)">Estos campos ya no están en el formulario. Pase lo que necesite a los apartados nuevos y vacíe el campo, o déjelo como está.</p><div class="grid">${legacyOf(i).map(([k, l]) => F(l, k, i[k], { type: 'area', rows: 2, wide: true })).join('')}</div></div>` : ''}
  <div class="fld"><span class="lbl">Firma del terapeuta (de su perfil)</span>${therPreview()}</div>
  <p class="lock-note">Al guardar, el documento queda firmado con su firma, la fecha y la hora, y <b>no podrá modificarse</b>. Solo podrá agregar adendas.</p><div class="row end"><button class="btn" data-act="saveIntake" data-sign="0">Guardar borrador</button><button class="btn pri" data-act="saveIntake" data-sign="1">Firmar y guardar</button></div></div>`;
}
ACT.viewIntake = () => { const p = curPatient(); showDoc('Primera vez · ' + fullName(p), docIntake(p), 'primera-vez-' + slug(fullName(p)) + '.html'); };
ACT.saveIntake = async b => {
  const p = curPatient(), sign = b.dataset.sign === '1', o = readForm($('#intakeform'), {});
  o.sessionAt = toISO(o.sessionAt);
  if (geno) o.genograma = geno.data();
  if (sign) {
    if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
    const sc = intakeSchema(p.intake || {});
    if (!reqCheck($('#intakeform'), o, intakeKeys(sc).concat(['riesgoAcciones', 'presentes']))) return;
    if (!atencionChecks(o)) return;
    if (!teleCheck(o)) return;
    o.diagnosticos = clone(Dx.items);
    Object.assign(o, therSnap(), { signedAt: nowISO(), addenda: [], schema: clone(sc) });
  }
  const snap = clone(p);
  p.intake = Object.assign(p.intake || {}, o);
  if (!(await persist([p], b))) { restore(p, snap); return; }
  if (sign) Dx.ctx = null;
  toast(sign ? 'Primera vez firmada y guardada.' : 'Borrador guardado.'); render();
};

/* ----- Atención a distancia ----- */
const COMUNIC = ['Sincrónica: videollamada en vivo', 'Sincrónica: llamada telefónica', 'Asincrónica interactiva: mensajes'];
const GRABA = ['No se grabó', 'Se grabó, con autorización del consultante y del terapeuta'];
const isRemote = m => m && m !== 'Presencial';
const badPlatform = v => /whats\s*app|facebook|instagram|telegram|messenger|tiktok/i.test(v || '');
function chk(key, label, val) { return `<label class="check"><input type="checkbox" id="f_${key}" data-f="${key}" ${val ? 'checked' : ''}> <span>${label}</span></label>`; }
function teleBlock(r) {
  r = r || {};
  return `<div class="sec" id="teleblock"><h3>Atención a distancia</h3><div class="grid">
  <div class="fld"><label for="f_tele_plataforma">Plataforma usada</label><input id="f_tele_plataforma" data-f="tele_plataforma" type="text" value="${esc(r.tele_plataforma || S.profile.plataforma || '')}" placeholder="Ej.: Google Meet, Zoom, Doxy.me"></div>
  ${F('Tipo de comunicación', 'tele_comunicacion', r.tele_comunicacion || COMUNIC[r.modalidad === 'Telefónica' ? 1 : 0], { type: 'select', opts: COMUNIC })}
  ${F('Lugar desde donde se conectó el consultante', 'tele_ubicacion', r.tele_ubicacion || '', { ph: 'Ciudad y tipo de lugar (casa, oficina…)' })}
  ${F('Grabación', 'tele_grabacion', r.tele_grabacion || GRABA[0], { type: 'select', opts: GRABA })}
  ${F('Fallas técnicas o incidencias (opcional)', 'tele_incidencias', r.tele_incidencias || '', { type: 'area', rows: 2, wide: true })}</div>
  <div class="banner" id="telewarn" ${badPlatform(r.tele_plataforma || S.profile.plataforma) ? '' : 'hidden'}>No se recomienda usar WhatsApp ni redes sociales para las sesiones. Use una plataforma con cifrado y control de acceso.</div>
  ${chk('tele_idPaciente', 'Verifiqué la identidad del consultante al inicio de la sesión.', r.tele_idPaciente)}
  ${chk('tele_idProfesional', 'Me identifiqué ante el consultante con mi nombre y profesión.', r.tele_idProfesional)}
  ${chk('tele_privacidad', 'El consultante confirmó estar en un lugar privado y conoce el procedimiento ante fallas o emergencias.', r.tele_privacidad)}</div>`;
}
function teleCheck(o) {
  if (!isRemote(o.modalidad)) { Object.keys(o).forEach(k => { if (k.startsWith('tele_')) delete o[k]; }); return true; }
  if (!o.tele_plataforma || !o.tele_ubicacion) { toast('En atención a distancia indique la plataforma y el lugar desde donde se conectó el consultante.'); return false; }
  if (!o.tele_idPaciente || !o.tele_idProfesional) { toast('Confirme la identificación del consultante y la suya al inicio de la sesión.'); return false; }
  return true;
}
function teleDoc(r) {
  if (!isRemote(r.modalidad) || !r.tele_plataforma) return '';
  const yes = v => v ? 'Sí' : 'No registrado';
  return `<h2>Atención a distancia</h2><table><tr><td><b>Plataforma</b></td><td>${esc(r.tele_plataforma)}</td></tr><tr><td><b>Comunicación</b></td><td>${esc(r.tele_comunicacion || '')}</td></tr><tr><td><b>Lugar del consultante</b></td><td>${esc(r.tele_ubicacion || '')}</td></tr><tr><td><b>Identidad del consultante verificada</b></td><td>${yes(r.tele_idPaciente)}</td></tr><tr><td><b>Terapeuta identificado</b></td><td>${yes(r.tele_idProfesional)}</td></tr><tr><td><b>Privacidad confirmada</b></td><td>${yes(r.tele_privacidad)}</td></tr><tr><td><b>Grabación</b></td><td>${esc(r.tele_grabacion || '')}</td></tr>${r.tele_incidencias ? `<tr><td><b>Incidencias</b></td><td>${esc(r.tele_incidencias)}</td></tr>` : ''}</table>`;
}

/* Datos que se agregan a un informe al firmarlo (código de verificación). */
const VERIF_ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'.replace('L', '');
function newVerifCode() { const b = crypto.getRandomValues(new Uint8Array(12)); const c = [...b].map(x => VERIF_ABC[x % VERIF_ABC.length]).join(''); return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8); }
function signExtrasReport(r) { return Object.assign({ therapistLogo: S.profile.logo || undefined }, S.mode === 'server' ? { verificacion: newVerifCode(), verificarEn: location.origin } : {}); }
function verifBox(r) {
  if (!r.verificacion) return '';
  const base = r.verificarEn || location.origin, url = base + '/verificar?c=' + r.verificacion;
  let qr = '';
  try { const q = qrcode(0, 'M'); q.addData(url); q.make(); qr = q.createSvgTag(3, 0); } catch (e) { /* sin librería de QR */ }
  return `<div style="display:flex;gap:14px;align-items:center;margin-top:22px;padding-top:10px;border-top:1px solid #c9d2d4;font-size:12px;line-height:1.5"><div style="flex:none;width:96px">${qr.replace('<svg ', '<svg style="width:96px;height:96px" ')}</div><div>Código de verificación: <b style="font-family:monospace;font-size:14px;letter-spacing:.05em">${esc(r.verificacion)}</b><br>Compruebe que este documento es auténtico y que su contenido no fue alterado en<br>${esc(base)}/verificar</div></div>`;
}

/* ----- Sesión ----- */
function noteForm(p, n) {
  n = n || {};
  return `<div class="card" id="noteform"><div class="row" style="justify-content:space-between"><h3 style="flex:1">${n.id ? 'Editar borrador' : 'Nueva nota de sesión'}</h3><button class="btn" data-act="cancelNote">Cancelar</button><button class="btn" data-act="saveNote" data-sign="0">Guardar borrador</button><button class="btn pri" data-act="saveNote" data-sign="1">Firmar y guardar</button></div>${sigNeeded()}${prevNoteHTML(p, n)}
  ${atencionBlock(n, 'note', p)}
  <div id="teleslot">${isRemote(n.modalidad) ? teleBlock(n) : ''}</div>
  ${evolSchema(n).length ? `${phraseHint()}<p class="stnote">Todos los campos son opcionales: llene lo que le sirva.</p><div class="grid">${evolSchema(n).map(f => F(f[1], f[0], n[f[0]] !== undefined ? n[f[0]] : (f[3] || ''), { type: 'area', rows: f[2], wide: true, req: true })).join('')}</div>`
    : `<div class="banner" id="noformat">Aún no ha creado su formato de sesión. Créelo en «Mis formatos» con los campos que usted usa (puede partir del formato sugerido). <div class="row" style="margin-top:6px"><button class="btn sm pri" data-act="formats" data-hub="evol">Crear mi formato</button></div></div>`}
  <div class="grid">${riesgoSel(n)}</div>
  ${(() => { const cur = currentDx(p, n.id); return dxBlock(n, { note: true, ctx: 'note:' + p.id + ':' + (S.newNote || 'new'), seed: cur.items, from: cur.items.length ? cur.from : '' }); })()}
  <div class="fld"><span class="lbl">Firma del terapeuta (de su perfil)</span>${therPreview()}</div>
  <p class="lock-note">Al guardar, el documento queda firmado con su firma, la fecha y la hora, y <b>no podrá modificarse</b>. Solo podrá agregar adendas.</p><div class="row end"><button class="btn" data-act="cancelNote">Cancelar</button><button class="btn" data-act="saveNote" data-sign="0">Guardar borrador</button><button class="btn pri" data-act="saveNote" data-sign="1">Firmar y guardar</button></div></div>`;
}
function prevNoteHTML(p, n) {
  const prev = S.notes.filter(x => x.patientId === p.id && x.signedAt && x.id !== n.id).sort((a, b) => b.sessionAt.localeCompare(a.sessionAt))[0];
  const i = p.intake && p.intake.signedAt ? p.intake : null;
  if (!prev && !i) return '';
  const body = prev ? kvHTML(prev, evolSchema(prev)) : intakeSchema(i).map(([t, fs]) => kvHTML(i, fs.filter(f => /objetiv|plan|impresi|motivo/i.test(f[1] + ' ' + t)))).join('') + ((i.diagnosticos || []).length ? `<dl class="kv"><dt>Impresión</dt><dd>${i.diagnosticos.map(d => esc(d.codigo + ' ' + d.nombre)).join('<br>')}</dd></dl>` : '');
  return `<details class="prevnote" open><summary>${prev ? 'Nota anterior · ' + esc(fmtShort(prev.sessionAt)) : 'Primera vez · ' + esc(fmtShort(i.sessionAt)) + ' (motivo, objetivos y plan)'}</summary><div class="prevbody">${body || '<p style="margin:0;color:var(--muted)">Sin contenido.</p>'}</div></details>`;
}
function noteCard(n) {
  return `<div class="card" id="rec-${n.id}"><div class="row" style="justify-content:space-between"><span class="ts">${esc(fmtDT(n.sessionAt))}</span><span class="row">${n.modalidad || n.duracion ? `<span class="chip">${esc([n.modalidad || '', n.duracion ? n.duracion + ' min' : ''].filter(Boolean).join(' · '))}</span>` : ''}${(() => { const rn = n.riesgoNivel || n.nivelRiesgo; return rn && rn !== RIESGO[0] ? `<span class="chip ${rn === 'Alto' ? 'danger' : 'warn'}">Riesgo ${esc(rn.toLowerCase())}</span>` : ''; })()}${n.signedAt ? `<span class="chip ok">Firmada${n.sesion ? ' · sesión n.º ' + n.sesion : ''}</span>` : '<span class="chip warn">Borrador</span>'}</span></div>
  ${n.folio || n.entorno ? `<span class="ts">${esc([folioTxt(n), n.entorno, n.causa, n.presentes ? 'Presentes: ' + n.presentes : '', n.destino].filter(Boolean).join(' · '))}</span>` : ''}
  ${kvHTML(n, evolSchema(n))}
  ${(n.diagnosticos || []).length ? `<dl class="kv"><dt>Impresión${n.dxCambio ? ' <span class="chip warn">Actualizado</span>' : ''}</dt><dd>${n.diagnosticos.map(d => dxNorm(d, n)).map((d, k) => esc(d.codigo + ' ' + d.nombre) + (k === 0 && n.diagnosticos.length > 1 ? ' (principal)' : '') + ' · ' + esc(d.tipo) + (d.estado !== 'Activo' ? ' · ' + esc(d.estado.toLowerCase()) : '')).join('<br>')}${n.dxCambio && n.dxObs ? '<br><i>Motivo: ' + esc(n.dxObs) + '</i>' : ''}</dd></dl>` : ''}
  ${n.signedAt ? `<div class="row"><img class="sigimg" style="max-width:140px" src="${n.therapistSig}" alt="Firma"><span class="ts">Firmada ${esc(fmtShort(n.signedAt))}<br>${esc(n.therapistName)}</span></div>${addendaHTML(n, 'note', n.id)}<div class="row"><button class="btn sm" data-act="viewNote" data-id="${n.id}">Ver y descargar</button></div>`
    : `<div class="row"><button class="btn sm pri" data-act="editNote" data-id="${n.id}">Continuar edición</button><button class="btn sm warn" data-act="delNote" data-id="${n.id}">Descartar borrador</button></div>`}</div>`;
}
function tabEvol(p) {
  const ns = S.notes.filter(n => n.patientId === p.id).sort((a, b) => b.sessionAt.localeCompare(a.sessionAt));
  const editing = S.newNote === 'new' ? Object.assign({}, S.noteSeed || {}) : (S.newNote ? S.notes.find(n => n.id === S.newNote) : null);
  return `<div class="sec"><div class="row" style="justify-content:space-between"><h3 style="flex:1">Notas de sesión (${ns.filter(n => n.signedAt).length})</h3>${S.newNote ? '' : '<button class="btn pri" data-act="newNote">Nueva nota</button>'}</div>
  ${S.newNote ? noteForm(p, editing) : ''}${ns.filter(n => n.id !== S.newNote).map(noteCard).join('') || (S.newNote ? '' : '<div class="empty">Aún no hay notas. Cada sesión posterior a la primera se registra aquí.</div>')}</div>`;
}
ACT.newNote = () => { S.noteSeed = null; S.newNote = 'new'; Dx.ctx = null; render(); };
ACT.cancelNote = () => { S.newNote = false; S.noteSeed = null; Dx.ctx = null; render(); };
ACT.editNote = b => { S.newNote = b.dataset.id; render(); };
ACT.delNote = b => { S.notes = S.notes.filter(n => n.id !== b.dataset.id); Store.remove(b.dataset.id); toast('Borrador descartado.'); render(); };
ACT.viewNote = b => { const p = curPatient(), n = S.notes.find(x => x.id === b.dataset.id); showDoc('Nota de sesión · ' + fullName(p), docNote(n, p), 'evolucion-' + slug(fullName(p)) + '-' + n.sessionAt.slice(0, 10) + '.html'); };
ACT.saveNote = async b => {
  const p = curPatient(), sign = b.dataset.sign === '1', o = readForm($('#noteform'), {});
  o.sessionAt = toISO(o.sessionAt);
  if (sign) {
    if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
    if (!reqCheck($('#noteform'), o, evolSchema({}).map(f => f[0]).concat(['presentes']))) return;
    if (!atencionChecks(o)) return;
    if (!teleCheck(o)) return;
    const chg = dxChanged();
    o.diagnosticos = clone(Dx.items); o.dxCambio = chg;
  }
  let n = S.newNote && S.newNote !== 'new' ? S.notes.find(x => x.id === S.newNote) : null;
  const fresh = !n, snap = n ? clone(n) : null;
  if (!n) { n = { id: newId('n'), kind: 'note', patientId: p.id }; if (S.noteSeed && S.noteSeed.apptId) n.apptId = S.noteSeed.apptId; }
  Object.assign(n, o);
  if (sign) Object.assign(n, therSnap(), { signedAt: nowISO(), addenda: [], schema: clone(evolSchema({})) });
  if (!(await persist([n], b))) { if (!fresh) restore(n, snap); return; }
  if (fresh) S.notes.push(n);
  S.newNote = false; S.noteSeed = null; Dx.ctx = null;
  const ap = sign && n.apptId && S.appts.find(a => a.id === n.apptId); if (ap && ap.estado !== 'Atendida') { ap.estado = 'Atendida'; ap.noteId = n.id; Store.save(ap); }
  toast(sign ? 'Nota firmada y guardada.' : 'Borrador guardado.'); render();
};
