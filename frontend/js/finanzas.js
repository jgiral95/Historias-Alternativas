/* ===== Finanzas: tarifas, cobro por cita, pagos, saldo, recibo y resumen =====
   Un pago es un registro `pago` (pa_): monto, fecha y medio no cambian; solo se anula con motivo. El estado de cada cita
   sale de repartir los pagos del paciente, de la más antigua a la más nueva (lo que sobra es saldo a favor). Cobran las citas
   «Atendida» que no sean cortesía. El equipo (asistentes) también registra y anula pagos; las tarifas solo las fija el profesional. */
if (!S.pagos) S.pagos = [];  // por si el navegador aún tiene un core.js anterior en caché
/* Dinero en pesos: «$ 80.000», campo con puntos de miles */
const cop = v => (v === '' || v == null || isNaN(+v)) ? '' : String(Math.max(0, Math.round(+v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const parseCop = s => { const d = String(s ?? '').replace(/\D/g, ''); return d === '' ? '' : +d; };
const money = v => '$ ' + (cop(v || 0) || '0');
const moneyInput = (id, v, attrs = '') => `<input type="text" inputmode="numeric" autocomplete="off" data-money="1" ${id ? `id="${id}"` : ''} value="${cop(v)}" ${attrs}>`;
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.money) return;
  const before = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length, f = cop(parseCop(el.value));
  if (f === el.value) return;
  el.value = f; let pos = 0, n = 0; while (pos < f.length && n < before) { if (/\d/.test(f[pos])) n++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (err) { /* sin cursor */ }
}, true);
const pacientes = () => S.patients.filter(p => !p.esGrupo);
const PAGO_MEDIOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Otro'];
const MODS_TARIFA = ['Presencial', 'Virtual', 'Telefónica'];
const finMesActual = () => nowISO().slice(0, 7);
const finMes = () => S.finMes || finMesActual();
const finOn = () => S.mode === 'server' && !S.gratis;

/* Cobrable: la cita atendida, o la inasistencia que el profesional decidió cobrar (cobrarInasistencia). Cortesía no cobra. */
const cobrable = a => !a.evento && (a.estado === 'Atendida' || (a.estado === 'No asistió' && a.cobrarInasistencia));
let finMemo = {};
const finMemoReset = () => { finMemo = {}; };
/* Estado de pago de una cita para la agenda ('' si no cobra o no hay finanzas); usa un caché que la agenda reinicia en cada dibujo. */
function finEstadoCita(a) {
  if (!finOn() || !cobrable(a) || !S.patients.some(x => x.id === a.patientId)) return '';
  const c = finMemo[a.patientId] || (finMemo[a.patientId] = cuentaDe(a.patientId)), x = c.citas.find(y => y.a.id === a.id);
  return x ? x.estado : '';
}
function valorCita(a, p) {
  if (typeof a.valor === 'number') return a.valor;
  const t = (S.profile && S.profile.tarifas) || {};
  return +(p && p.tarifa) || +t[a.modalidad] || 0;
}
function cuentaDe(pid) {
  const p = S.patients.find(x => x.id === pid), pagos = S.pagos.filter(x => x.patientId === pid && !x.anulado);
  const pagado = pagos.reduce((s, x) => s + x.monto, 0);
  const base = S.appts.filter(a => a.patientId === pid && cobrable(a)).sort((a, b) => a.startAt.localeCompare(b.startAt)).map(a => ({ a, valor: a.cortesia ? 0 : valorCita(a, p), cubre: 0 }));
  // 1) pagos ligados a una cita cubren esa cita (lo que sobra de su valor pasa al conjunto general); 2) lo demás, de la cita más antigua a la más nueva
  let resto = 0;
  pagos.forEach(x => {
    if (x.sinCita) return;  // anticipo o saldo a favor: no se aplica a ninguna cita
    const t = x.citaId && base.find(y => y.a.id === x.citaId), puesto = t ? Math.min(x.monto, t.valor - t.cubre) : 0;
    if (t) t.cubre += puesto;
    resto += x.monto - puesto;
  });
  const citas = base.map(({ a, valor, cubre }) => {
    const extra = Math.min(valor - cubre, resto); resto -= extra; cubre += extra;
    return { a, valor, cubre, pend: valor - cubre, estado: a.cortesia ? 'Cortesía' : !valor ? 'Sin valor' : cubre >= valor ? 'Pagada' : cubre > 0 ? 'Abonada' : 'Pendiente' };
  });
  const total = citas.reduce((s, c) => s + c.valor, 0), cubierto = citas.reduce((s, c) => s + c.cubre, 0);
  return { citas, total, pagado, saldo: Math.max(0, total - cubierto), favor: Math.max(0, pagado - cubierto) };
}
const citaTxt = id => { const a = S.appts.find(x => x.id === id); return a ? fmtD(a.startAt) : ''; };
/* Piezas visuales: tarjeta de cifra, tarjeta con tabla y estado vacío */
const finK = (label, val, cls = '', sub = '') => `<div class="fk ${cls}"><span class="fkl">${label}</span><b class="fkv">${val}</b>${sub ? `<span class="fks">${sub}</span>` : ''}</div>`;
/* Cada tarjeta se puede minimizar (se recuerda mientras la sesión siga abierta). */
const FIN_CERRADAS = new Set();
const finCard = (titulo, n, cuerpo, extra = '') => `<section class="fcard${FIN_CERRADAS.has(titulo) ? ' min' : ''}" data-ft="${esc(titulo)}"><header><h4>${titulo}${n != null ? ` <span class="fcn">${n}</span>` : ''}</h4><span class="row" style="gap:8px;flex-wrap:nowrap">${extra}<button type="button" class="fchev" aria-label="Minimizar o mostrar" aria-expanded="${FIN_CERRADAS.has(titulo) ? 'false' : 'true'}">▾</button></span></header>${cuerpo}</section>`;
document.addEventListener('click', e => {
  const h = e.target.closest('.fcard > header'); if (!h || e.target.closest('button:not(.fchev), a, input, select, label')) return;  // toda la barra minimiza, salvo sus propios botones
  const b = h.querySelector('.fchev'); if (!b) return;
  const c = h.closest('.fcard'), min = c.classList.toggle('min'), t = c.dataset.ft;
  b.setAttribute('aria-expanded', String(!min)); if (min) FIN_CERRADAS.add(t); else FIN_CERRADAS.delete(t);
});
const finVacio = t => `<div class="fempty">${t}</div>`;
const finMediosBar = por => {
  const es = Object.entries(por).sort((a, b) => b[1] - a[1]), tot = es.reduce((s, x) => s + x[1], 0); if (!tot) return '';
  return `<div class="fmed"><div class="fbar">${es.map(([m, v], i) => `<i style="width:${(v / tot * 100).toFixed(1)}%;background:var(--c${(i % 8) + 1})" title="${esc(m)}: ${money(v)}"></i>`).join('')}</div><div class="fleg">${es.map(([m, v], i) => `<span><i style="background:var(--c${(i % 8) + 1})"></i>${esc(m)} <b>${money(v)}</b></span>`).join('')}</div></div>`;
};
const pagoSesion = x => x.citaId ? ' · cita ' + esc(citaTxt(x.citaId)) : x.sinCita ? (x.citaFecha ? ' · sesión del ' + esc(fmtD(x.citaFecha)) : ' · sin cita (a favor)') : '';
const finChip = e => `<span class="chip ${e === 'Pagada' ? 'ok' : e === 'Pendiente' || e === 'Abonada' ? 'warn' : ''}">${esc(e)}</span>`;
const finQuien = x => x.registradoPor ? `${esc(x.registradoPor.por)}${x.registradoPor.rol === 'Equipo' ? ' (equipo)' : ''}` : '';

/* ----- Pestaña del paciente ----- */
function tabFinanzas(p) {
  if (S.mode !== 'server') return '<div class="sec"><div class="banner">Las finanzas se usan con la cuenta en el servidor.</div></div>';
  if (S.gratis) return '<div class="sec"><div class="banner">Las finanzas se activan con la suscripción. <button class="btn sm pri" data-act="suscripcion" style="margin-left:6px">Suscribirme</button></div></div>';
  const c = cuentaDe(p.id), pagos = S.pagos.filter(x => x.patientId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt));
  const tar = (S.profile.tarifas || {}), pr = TEAM() ? '' : `<button class="btn sm" data-act="finTarifaPac" title="Reemplaza la tarifa general para este consultante">Tarifa de este consultante${p.tarifa ? ': ' + money(p.tarifa) : ''}</button>`;
  const noAsis = S.appts.filter(a => a.patientId === p.id && a.estado === 'No asistió' && !a.evento && !a.cobrarInasistencia).sort((a, b) => b.startAt.localeCompare(a.startAt));
  const inasist = noAsis.length ? finCard('Inasistencias sin cobrar', noAsis.length, `<table class="sttab"><tbody>${noAsis.map(a => `<tr><td>${esc(fmtD(a.startAt))}</td><td>${esc(a.modalidad || '')}</td><td class="r">${TEAM() ? '' : `<button class="btn sm" data-act="finCita" data-id="${a.id}">Cobrar</button>`}</td></tr>`).join('')}</tbody></table>`) : '';
  const citasT = c.citas.length ? `<table class="sttab"><thead><tr><th>Fecha</th><th>Modalidad</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>${c.citas.map(x => `<tr><td>${esc(fmtD(x.a.startAt))}</td><td>${esc(x.a.modalidad || '')}${x.a.estado === 'No asistió' ? ' · inasistencia' : ''}</td><td class="n">${money(x.valor)}</td><td>${finChip(x.estado)}</td><td class="r"><button class="btn sm" data-act="finCita" data-id="${x.a.id}">Valor</button></td></tr>`).join('')}</tbody></table>` : finVacio('Las citas aparecen aquí cuando se marcan como «Atendida» en la agenda.');
  const pagosT = pagos.length ? `<table class="sttab"><thead><tr><th>Fecha</th><th>Monto</th><th>Detalle</th><th>Registró</th><th></th></tr></thead><tbody>${pagos.map(x => `<tr${x.anulado ? ' class="anul"' : ''}><td>${esc(fmtD(x.fecha))}</td><td class="n">${x.anulado ? '<s>' + money(x.monto) + '</s>' : '<b>' + money(x.monto) + '</b>'}</td><td>${esc(x.medio)}${pagoSesion(x)}${x.nota ? ' · ' + esc(x.nota) : ''}</td><td>${finQuien(x)}${x.anulado ? '<br><small>Anulado: ' + esc(x.anuladoMotivo || '') + '</small>' : ''}</td><td class="r">${x.anulado ? '' : `<button class="btn sm" data-act="finRecibo" data-id="${x.id}">Recibo</button> <button class="btn sm warn" data-act="finAnular" data-id="${x.id}">Anular</button>`}</td></tr>`).join('')}</tbody></table>` : finVacio('Todavía no hay pagos registrados.');
  return `<div class="sec fin"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Finanzas</h3><span class="row"><button class="btn pri" data-act="finPago" data-id="${p.id}">+ Registrar pago</button>${pr}</span></div>
  <div class="fk-grid">${finK('Atendido', money(c.total))}${finK('Pagado', money(c.pagado), 'ok')}${finK('Saldo', money(c.saldo), c.saldo ? 'warn' : 'ok', c.saldo ? 'Por cobrar' : 'Al día')}${c.favor ? finK('A favor', money(c.favor), 'fav') : ''}</div>
  ${!p.tarifa && !Object.values(tar).some(Boolean) ? `<p class="stnote">Aún no hay tarifas.${TEAM() ? ' El profesional las define en Finanzas → Tarifas.' : ' Defínalas en Finanzas → Tarifas, o ponga el valor en cada cita.'}</p>` : ''}
  ${finCard('Citas cobradas', c.citas.length, citasT)}
  ${inasist}
  ${finCard('Pagos', pagos.length, pagosT)}</div>`;
}
function finModal(titulo, cuerpo, ok, onOk) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="box"><div class="row" style="justify-content:space-between"><h3>${esc(titulo)}</h3><button class="btn sm" data-fm="close">Cerrar</button></div>${cuerpo}<div class="row end"><button class="btn" data-fm="close">Cancelar</button><button class="btn pri" data-fm="ok">${esc(ok)}</button></div></div></div>`;
  root.onclick = async e => {
    const t = e.target.closest('[data-fm]'); if (!t) return;
    if (t.dataset.fm === 'close') { root.innerHTML = ''; root.onclick = null; return; }
    if (await onOk(t)) { root.innerHTML = ''; root.onclick = null; render(); }
  };
}
/* Opciones de «Aplicar a» según el paciente (sin paciente elegido solo están las dos generales). */
const citaOpts = pid => `<option value="">Automático: las citas más antiguas primero</option><option value="-">Sin ligar a ninguna cita (saldo a favor)</option>${(pid ? cuentaDe(pid).citas : []).filter(x => x.pend > 0).map(x => `<option value="${esc(x.a.id)}" data-pend="${x.pend}">${esc(fmtD(x.a.startAt))} · ${esc(x.a.modalidad || '')}${x.a.estado === 'No asistió' ? ' · inasistencia' : ''} · debe ${money(x.pend)}</option>`).join('')}`;
/* Registrar pago: desde la ficha del paciente (data-id) o desde la vista general (sin data-id: se elige el paciente en el mismo formulario). */
ACT.finPago = b => {
  const elegir = !b.dataset.id, p = elegir ? null : S.patients.find(x => x.id === b.dataset.id), c = p ? cuentaDe(p.id) : null;
  const ps = pacientes().slice().sort((x, y) => fullName(x).localeCompare(fullName(y), 'es'));
  if (elegir && !ps.length) { toast('Aún no hay consultantes.'); return; }
  finModal(elegir ? 'Nuevo pago' : 'Registrar pago · ' + fullName(p), `${elegir ? `<div class="fld"><label for="fn_pac">Consultante</label><select id="fn_pac"><option value="">Elija un paciente…</option>${ps.map(x => `<option value="${esc(x.id)}">${esc(fullName(x))}</option>`).join('')}</select></div>` : ''}<div class="grid">
    <div class="fld"><label for="fp_monto">Monto (pesos)</label>${moneyInput('fp_monto', c ? c.saldo || '' : '')}</div>${F('Fecha del pago', 'fpFecha', nowISO().slice(0, 10), { type: 'date' })}
    ${F('Medio de pago', 'fpMedio', 'Efectivo', { type: 'select', opts: PAGO_MEDIOS })}${F('Nota (opcional)', 'fpNota', '', { ph: 'Ej.: abono, 3 sesiones' })}</div>
    <div class="fld"><label for="fp_cita">Aplicar a</label><select id="fp_cita">${citaOpts(p && p.id)}</select></div>
    <div id="fp_cf" hidden>${F('Fecha de la sesión que paga (opcional)', 'fpCitaFecha', '', { type: 'date' })}<p class="stnote">Para quien no usa la agenda: queda anotada junto al pago.</p></div>
    <p class="stnote">Con «Sin ligar» el pago queda como saldo a favor y no cubre ninguna cita. Si el monto supera lo que debe la cita elegida, lo que sobra se aplica a las demás de la más antigua a la más nueva. El monto, la fecha, el medio y la cita no se pueden cambiar después; si hay un error, anule el pago y registre otro.</p>`, 'Registrar pago', async btn => {
    const pat = elegir ? S.patients.find(x => x.id === $('#fn_pac').value) : p;
    if (!pat) { toast('Elija el consultante.'); return false; }
    const monto = parseCop($('#fp_monto').value), fecha = $('#f_fpFecha').value;
    if (!monto || monto < 1) { toast('Escriba el monto del pago.'); return false; }
    if (!fecha || fecha > nowISO().slice(0, 10)) { toast('La fecha del pago no puede ser futura.'); return false; }
    const o = { id: newId('pa'), kind: 'pago', patientId: pat.id, monto, fecha, medio: $('#f_fpMedio').value, nota: $('#f_fpNota').value.trim().slice(0, 300), createdAt: nowISO() };
    if ($('#fp_cita').value === '-') { o.sinCita = true; const cf = $('#f_fpCitaFecha').value; if (cf) o.citaFecha = cf; } else if ($('#fp_cita').value) o.citaId = $('#fp_cita').value;
    if (!(await persist([o], btn))) return false;
    o.registradoPor = { por: (S.user && S.user.name) || '', rol: TEAM() ? 'Equipo' : 'Profesional' }; S.pagos.push(o);
    toast('Pago registrado.'); return true;
  });
};
ACT.finPagoNuevo = () => ACT.finPago({ dataset: {} });
// Al cambiar de paciente en «Nuevo pago»: las citas y el monto sugerido son los de ese paciente
document.addEventListener('change', e => {
  if (e.target.id !== 'fn_pac') return;
  const id = e.target.value, c = id ? cuentaDe(id) : null;
  $('#fp_cita').innerHTML = citaOpts(id); $('#fp_cf').hidden = true; $('#fp_monto').value = c && c.saldo ? cop(c.saldo) : '';
});
ACT.finAnular = b => {
  const o = S.pagos.find(x => x.id === b.dataset.id);
  finModal('Anular pago', `<p style="margin:0">Pago de <b>${money(o.monto)}</b> del ${esc(fmtD(o.fecha))} (${esc(o.medio)}). No se borra: queda marcado como anulado y en la bitácora.</p>${F('Motivo de la anulación', 'faMotivo', '', { ph: 'Ej.: error de digitación' })}`, 'Anular pago', async btn => {
    const motivo = $('#f_faMotivo').value.trim();
    if (!motivo) { toast('Escriba el motivo de la anulación.'); return false; }
    const snap = clone(o); o.anulado = true; o.anuladoMotivo = motivo.slice(0, 300); o.updatedAt = nowISO();
    if (!(await persist([o], btn))) { restore(o, snap); return false; }
    toast('Pago anulado.'); return true;
  });
};
ACT.finCita = b => {
  const a = S.appts.find(x => x.id === b.dataset.id), p = S.patients.find(x => x.id === a.patientId);
  finModal('Cobro de la cita · ' + fmtD(a.startAt), `<div class="fld"><label for="fc_valor">Valor de esta cita (pesos)</label>${moneyInput('fc_valor', typeof a.valor === 'number' ? a.valor : '')}</div>
    <p class="stnote">Vacío = tarifa vigente (${money(valorCita({ modalidad: a.modalidad }, p))}). Si escribe un valor, queda fijo aunque cambie la tarifa.</p>
    ${a.estado === 'No asistió' ? `<label class="check"><input type="checkbox" id="fc_inas" ${a.cobrarInasistencia ? 'checked' : ''}> <span>Cobrar esta inasistencia</span></label>` : ''}
    <label class="check"><input type="checkbox" id="fc_cortesia" ${a.cortesia ? 'checked' : ''}> <span>Cortesía (no se cobra)</span></label>`, 'Guardar', async btn => {
    const v = parseCop($('#fc_valor').value), snap = clone(a);
    if (v === '') delete a.valor; else a.valor = v;
    if ($('#fc_cortesia').checked) a.cortesia = true; else delete a.cortesia;
    if ($('#fc_inas')) { if ($('#fc_inas').checked) a.cobrarInasistencia = true; else delete a.cobrarInasistencia; }
    a.updatedAt = nowISO();
    if (!(await persist([a], btn))) { restore(a, snap); return false; }
    return true;
  });
};
ACT.finTarifaPac = () => {
  const p = curPatient();
  finModal('Tarifa de ' + fullName(p), `<p class="stnote">Cuánto cobra por sesión a este consultante.</p>
    <div class="ftar" style="grid-template-columns:minmax(0,260px);justify-content:center"><div class="ftc"><span class="fti"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span><label for="ft_valor">Valor por sesión</label><div class="ftin"><span>$</span>${moneyInput('ft_valor', p.tarifa || '')}</div></div></div>
    <div class="fnote">Reemplaza la tarifa general en las citas de este consultante que no tengan un valor propio. Vacío = usar la tarifa general.</div>`, 'Guardar', async btn => {
    const v = parseCop($('#ft_valor').value), snap = clone(p);
    if (v) p.tarifa = v; else delete p.tarifa;
    if (!(await persist([p], btn))) { restore(p, snap); return false; }
    return true;
  });
  const box = $('#modal-root .box'); if (box) box.classList.add('notop', 'tarbox');
};
const TAR_ICO = {
  Presencial: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/></svg>',
  Virtual: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10l6-3v10l-6-3"/></svg>',
  Telefónica: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>'
};
ACT.finTarifas = () => {
  const t = S.profile.tarifas || {}, vals = MODS_TARIFA.map(m => t[m] || 0), igual = vals[0] > 0 && vals.every(v => v === vals[0]);
  finModal('Tarifas generales', `<p class="stnote">Cuánto cobra por sesión según el tipo de consulta.</p>
    <div class="ftar">${MODS_TARIFA.map(m => `<div class="ftc"><span class="fti">${TAR_ICO[m] || ''}</span><label for="fm_${m}">${m}</label><div class="ftin"><span>$</span>${moneyInput('fm_' + m, t[m] || '')}</div></div>`).join('')}</div>
    <label class="fsw"><input type="checkbox" id="fm_same" ${igual ? 'checked' : ''}><span class="fsg"></span>Usar el mismo valor en las tres</label>
    <div class="fnote">Las citas atendidas sin valor propio toman la tarifa vigente. Puede fijar otro valor por consultante o por cita.</div>`, 'Guardar', async btn => {
    const snap = clone(S.profile), nt = {};
    MODS_TARIFA.forEach(m => { const v = parseCop($('#fm_' + m).value); if (v) nt[m] = v; });
    S.profile.tarifas = nt;
    if (!(await persist([S.profile], btn))) { restore(S.profile, snap); return false; }
    return true;
  });
  const box = $('#modal-root .box'); if (box) box.classList.add('notop', 'tarbox');  // un solo «Guardar», al pie
};
// «Mismo valor en las tres»: lo que se escribe en una se copia a las otras
const tarSync = from => { const v = from.value; MODS_TARIFA.forEach(m => { const el = $('#fm_' + m); if (el && el !== from) el.value = v; }); };
document.addEventListener('input', e => { if (e.target.id && e.target.id.startsWith('fm_') && e.target.id !== 'fm_same' && $('#fm_same') && $('#fm_same').checked) tarSync(e.target); });
document.addEventListener('change', e => { if (e.target.id === 'fm_same' && e.target.checked) tarSync($('#fm_' + MODS_TARIFA[0])); });

/* ----- Recibo ----- */
ACT.finRecibo = b => {
  const o = S.pagos.find(x => x.id === b.dataset.id), p = S.patients.find(x => x.id === o.patientId), pr = S.profile || {};
  const row = (l, v) => `<tr><td style="width:34%"><b>${esc(l)}</b></td><td>${esc(v || '')}</td></tr>`;
  const body = `<div class="docpage">${letterhead(pr)}<h2>Recibo de pago N.º R-${esc(o.id.slice(-5).toUpperCase())}</h2><table>
    ${row('Recibí de', fullName(p))}${row('Documento', [p.tipoDoc, p.documento].filter(Boolean).join(' '))}${row('Valor recibido', money(o.monto))}${row('Fecha del pago', fmtD(o.fecha))}${row('Medio de pago', o.medio)}${row('Concepto', 'Honorarios por atención' + (o.nota ? ' · ' + o.nota : ''))}${row('Recibió', o.registradoPor ? o.registradoPor.por : pr.nombre)}</table>
    <p style="font-size:11px;color:#4a5a5e">Este recibo constata el pago recibido. No reemplaza la factura o el documento equivalente cuando la ley los exija.</p></div>`;
  showDoc('Recibo de pago · ' + fullName(p), body, 'recibo-' + slug(fullName(p)) + '-' + o.fecha + '.html');
};

/* ----- Vista general: resumen del mes, cartera y exportación ----- */
function finanzasHTML() {
  if (S.mode !== 'server') return '<div class="sec"><div class="banner">Las finanzas se usan con la cuenta en el servidor.</div></div>';
  if (S.gratis) return '<div class="sec"><div class="banner">Las finanzas se activan con la suscripción. <button class="btn sm pri" data-act="suscripcion" style="margin-left:6px">Suscribirme</button></div></div>';
  const mes = finMes(), pagos = S.pagos.filter(x => !x.anulado && x.fecha.slice(0, 7) === mes).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = pagos.reduce((s, x) => s + x.monto, 0), porMedio = {};
  pagos.forEach(x => { porMedio[x.medio] = (porMedio[x.medio] || 0) + x.monto; });
  const atendidas = S.appts.filter(a => cobrable(a) && !a.cortesia && (a.startAt || '').slice(0, 7) === mes);
  const facturado = atendidas.reduce((s, a) => s + valorCita(a, S.patients.find(x => x.id === a.patientId)), 0);
  const cartera = pacientes().map(p => ({ p, c: cuentaDe(p.id) })).filter(x => x.c.saldo > 0).sort((a, b) => b.c.saldo - a.c.saldo);
  const ahora = nowISO(), sinMarcar = S.appts.filter(a => !a.evento && (a.estado || 'Programada') === 'Programada' && a.startAt < ahora).sort((a, b) => b.startAt.localeCompare(a.startAt));
  const nombres = pid => { const p = S.patients.find(x => x.id === pid); return p ? fullName(p) : ''; };
  const totCartera = cartera.reduce((s, x) => s + x.c.saldo, 0);
  const sinT = sinMarcar.length ? `<div class="fwarn"><b>${sinMarcar.length} ${sinMarcar.length === 1 ? 'cita pasada sin marcar' : 'citas pasadas sin marcar'}.</b> Márquelas como «Atendida» o «No asistió» para que se cobren.</div><table class="sttab"><thead><tr><th>Fecha</th><th>Consultante</th><th></th></tr></thead><tbody>${sinMarcar.slice(0, 30).map(a => `<tr><td>${esc(fmtD(a.startAt))}</td><td>${esc(nombres(a.patientId) || (a.nuevo && a.nuevo.nombre) || '')}</td><td class="r"><button class="btn sm" data-act="apptEdit" data-id="${a.id}">Abrir</button></td></tr>`).join('')}</tbody></table>${sinMarcar.length > 30 ? `<p class="stnote" style="padding:8px 14px">Se muestran las 30 más recientes.</p>` : ''}` : '';
  const carT = cartera.length ? `<table class="sttab"><thead><tr><th>Consultante</th><th>Saldo</th><th></th></tr></thead><tbody>${cartera.map(x => `<tr><td><b>${esc(fullName(x.p))}</b></td><td class="n">${money(x.c.saldo)}</td><td class="r"><button class="btn sm" data-act="finAbrir" data-id="${x.p.id}">Abrir</button></td></tr>`).join('')}</tbody></table>` : finVacio('Nadie debe nada por ahora.');
  const pagT = pagos.length ? `<table class="sttab"><thead><tr><th>Fecha</th><th>Consultante</th><th>Monto</th><th>Medio</th><th>Registró</th></tr></thead><tbody>${pagos.map(x => `<tr><td>${esc(fmtD(x.fecha))}</td><td>${esc(nombres(x.patientId))}</td><td class="n"><b>${money(x.monto)}</b></td><td>${esc(x.medio)}${pagoSesion(x)}</td><td>${finQuien(x)}</td></tr>`).join('')}</tbody></table>` : finVacio('No hay pagos en este mes.');
  return `<div class="sec fin" style="max-width:940px;margin:0 auto"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Finanzas</h3><span class="row"><div class="fld" style="margin:0"><input type="month" id="fin_mes" value="${esc(mes)}" aria-label="Mes"></div>${TEAM() ? '' : '<button class="btn" data-act="finTarifas">Tarifas</button>'}<button class="btn" data-act="finCSV">Exportar CSV</button><button class="btn pri" data-act="finPagoNuevo">+ Nuevo pago</button></span></div>
  <div class="fk-grid">${finK('Cobrado en el mes', money(total), 'ok', pagos.length + (pagos.length === 1 ? ' pago' : ' pagos'))}${finK('Atendido en el mes', money(facturado), '', atendidas.length + (atendidas.length === 1 ? ' cita' : ' citas'))}${finK('Por cobrar (total)', money(totCartera), cartera.length ? 'warn' : 'ok', cartera.length ? cartera.length + (cartera.length === 1 ? ' consultante' : ' consultantes') : 'Al día')}</div>
  ${finMediosBar(porMedio)}
  ${sinMarcar.length ? finCard('Citas pasadas sin marcar', sinMarcar.length, sinT) : ''}
  ${finCard('Consultantes con saldo', cartera.length, carT)}
  ${finCard('Pagos del mes', pagos.length, pagT)}</div>`;
}
ACT.finAbrir = b => { S.view = 'patients'; S.pid = b.dataset.id; S.tab = 'finanzas'; S.draft = false; render(); scrollTo(0, 0); };
ACT.finCSV = () => {
  const mes = finMes(), q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = S.pagos.filter(x => x.fecha.slice(0, 7) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(x => {
    const p = S.patients.find(y => y.id === x.patientId) || {};
    return [x.fecha, fullName(p), [p.tipoDoc, p.documento].filter(Boolean).join(' '), x.monto, x.medio, x.nota || '', x.anulado ? 'Anulado: ' + (x.anuladoMotivo || '') : 'Vigente', x.registradoPor ? x.registradoPor.por : ''].map(q).join(',');
  });
  const head = ['Fecha', 'Consultante', 'Documento', 'Monto', 'Medio', 'Nota', 'Estado', 'Registró'].map(q).join(',');
  downloadFile('pagos-' + mes + '.csv', new Blob(['﻿' + [head].concat(rows).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
};
document.addEventListener('change', e => {
  if (e.target.id === 'fp_cita') { const o = e.target.selectedOptions[0], m = $('#fp_monto'); $('#fp_cf').hidden = e.target.value !== '-'; if (o && o.dataset.pend && m) m.value = cop(+o.dataset.pend); return; }  // al elegir una cita, el monto sugerido es lo que debe
  if (e.target.id === 'fin_mes' && e.target.value) { S.finMes = e.target.value; render(); } });
