/* Chequeos de bienestar, y frases frecuentes. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Chequeos de bienestar (no son pruebas médicas ni psicológicas) ===== */
const SCALES_BASE = [
  { id: 'bienestar', nombre: 'Chequeo de bienestar', instruccion: 'Pensando en las últimas 2 semanas, ¿con qué frecuencia te pasó lo siguiente?', opciones: [[0, 'Nunca'], [1, 'A veces'], [2, 'Casi siempre'], [3, 'Siempre']],
    items: ['Me sentí con energía', 'Dormí y descansé bien', 'Me sentí en calma', 'Disfruté de mis actividades', 'Me sentí acompañado(a)', 'Pude hacer pausas para cuidarme'],
    rangos: [[0, 6, 'Por cuidar'], [7, 12, 'En camino'], [13, 18, 'Bien']], alertas: [] },
  { id: 'equilibrio', nombre: 'Rueda del equilibrio', instruccion: 'Del 1 (muy bajo) al 5 (muy alto), ¿cómo sientes hoy cada área de tu vida?', opciones: [[1, 'Muy bajo'], [2, 'Bajo'], [3, 'Medio'], [4, 'Alto'], [5, 'Muy alto']],
    items: ['Cuerpo y movimiento', 'Descanso', 'Alimentación', 'Emociones', 'Relaciones', 'Trabajo o estudio', 'Tiempo para sí mismo(a) y espiritualidad'],
    rangos: [[7, 17, 'Por cuidar'], [18, 27, 'En camino'], [28, 35, 'Bien']], alertas: [] }
];
const myScales = () => S.profile.escalas || [];
const allScales = () => SCALES_BASE.concat(myScales());
const scaleMax = sc => sc.items.length * Math.max(...sc.opciones.map(o => o[0]));
const scaleMin = sc => sc.items.length * Math.min(...sc.opciones.map(o => o[0]));
const levelOf = (sc, t) => { const r = (sc.rangos || []).find(x => t >= x[0] && t <= x[1]); return r ? r[2] : ''; };
function scaleForm(p) {
  const sc = allScales().find(x => x.id === S.newScale) || SCALES_BASE[0];
  return `<div class="card" id="scaleform"><h3>Aplicar chequeo</h3>${sigNeeded()}
  <div class="grid"><div class="fld"><label for="f_escala">Escala</label><select id="f_escala">${allScales().map(x => `<option value="${esc(x.id)}" ${x.id === sc.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
  ${F('Fecha y hora de aplicación', 'aplicadaAt', localInput(), { type: 'datetime-local' })}${F('Forma de aplicación', 'modo', 'Autoaplicada', { type: 'select', opts: ['Autoaplicada', 'Heteroaplicada (la diligencia el terapeuta)', 'Aplicada a un informante'] })}</div>
  ${sc.instruccion ? `<p style="margin:0;font-weight:500">${esc(sc.instruccion)}</p>` : ''}
  <div>${sc.items.map((it, i) => `<div class="scitem" role="radiogroup" aria-label="${esc(it)}"><p>${i + 1}. ${esc(it)}</p><div class="opts">${sc.opciones.map(([v, l]) => `<label><input type="radio" name="sc_${i}" value="${v}"> ${esc(l)}</label>`).join('')}</div></div>`).join('')}</div>
  ${sc.funcional ? `<div class="fld"><label for="f_funcional" style="text-transform:none;letter-spacing:0;font-size:14px;font-weight:500;color:var(--ink)">${esc(sc.funcional[0])}</label><select id="f_funcional" data-f="funcional">${[''].concat(sc.funcional[1]).map(x => `<option>${esc(x)}</option>`).join('')}</select></div>` : ''}
  <div class="sctotal" id="sctotal" aria-live="polite"></div>
  <div class="grid">${F('Versión y baremo usados', 'version', sc.version || '', { ph: 'Ej.: versión en español para Colombia; baremo de población adulta', req: true, nr: ['No aplica'] })}</div>
  ${F('Motivo de la aplicación', 'motivo', '', { type: 'area', rows: 2, wide: true, req: true })}
  ${F('Condiciones de aplicación y observaciones de conducta', 'observaciones', '', { type: 'area', rows: 2, wide: true, req: true })}
  ${F('Resultados e interpretación', 'interpretacion', '', { type: 'area', rows: 3, wide: true, req: true })}
  <details class="sec"><summary class="sum">Protocolo adjunto y entrega del informe (opcional)</summary><div class="grid">
    ${F('Protocolo o planilla de respuestas (de la pestaña Archivo)', 'protocolo', '', { type: 'select', opts: [''].concat(S.files.filter(f => f.patientId === p.id).map(f => f.nombre)) })}
    ${F('Informe entregado a', 'entregaA', '', { ph: 'Ej.: el consultante; otro terapeuta, con autorización' })}${F('Fecha de entrega', 'entregaFecha', '', { type: 'date' })}</div></details>
  ${sc.fuente ? `<p style="margin:0;font-size:12px;color:var(--muted)">${esc(sc.fuente)}</p>` : ''}
  <p class="lock-note">La aplicación queda firmada con fecha y hora y no podrá modificarse.</p>
  <div class="row end"><button class="btn" data-act="cancelScale">Cancelar</button><button class="btn pri" data-act="saveScale">Firmar y guardar</button></div></div>`;
}
function readScale() {
  const sc = allScales().find(x => x.id === $('#f_escala').value);
  const resp = sc.items.map((_, i) => { const r = $(`#scaleform input[name="sc_${i}"]:checked`); return r ? +r.value : null; });
  const done = resp.filter(v => v !== null).length, total = resp.reduce((a, v) => a + (v || 0), 0);
  const alertas = [];
  return { sc, resp, done, total, nivel: done === sc.items.length ? levelOf(sc, total) : '', alertas };
}
function updateScaleTotal() {
  const box = $('#sctotal'); if (!box) return;
  const r = readScale();
  box.innerHTML = `<span>Puntaje</span><b>${r.total}</b><span>de ${scaleMax(r.sc)}</span>${r.nivel ? `<span class="chip">${esc(r.nivel)}</span>` : `<span style="color:var(--muted);font-size:13px">${r.done} de ${r.sc.items.length} respondidas</span>`}${r.alertas.length ? `<span class="chip danger">Revisar ítem ${r.alertas.map(i => i + 1).join(', ')}: evalúe el riesgo</span>` : ''}`;
}
function scaleChart(sc, list) {
  const W = 680, H = 220, L = 34, R = 196, T = 12, B = 30, lo = scaleMin(sc), hi = scaleMax(sc);
  const x = i => list.length < 2 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (list.length - 1);
  const y = v => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  const bands = (sc.rangos || []).map((r, i, a) => { const y1 = y(Math.min(hi, r[1] + (i < a.length - 1 ? .5 : 0))), y0 = y(Math.max(lo, r[0] - (i ? .5 : 0))); return `<rect class="band" x="${L}" y="${y1}" width="${W - L - R}" height="${Math.max(0, y0 - y1)}" fill-opacity="${(0.05 + 0.25 * i / Math.max(1, a.length - 1)).toFixed(2)}"/><text class="bandlbl" x="${W - R + 8}" y="${(y0 + y1) / 2 + 4}">${esc(r[2])} (${r[0]}–${r[1]})</text>`; }).join('');
  const ticks = [lo, Math.round((lo + hi) / 2), hi].map(v => `<text class="axl" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const pts = list.map((e, i) => [x(i), y(e.total), e]);
  const line = pts.length > 1 ? `<path class="ln" d="M${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L')}"/>` : '';
  const fd = iso => new Date(iso).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
  const xl = list.length ? [0, list.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text class="axl" x="${x(i)}" y="${H - 8}" text-anchor="${list.length > 1 ? (i ? 'end' : 'start') : 'middle'}">${esc(fd(list[i].aplicadaAt))}</text>`).join('') : '';
  const dots = pts.map(([px, py, e]) => `<g class="pp" tabindex="0" data-tip="${esc(fd(e.aplicadaAt) + ' · ' + e.total + ' puntos' + (e.nivel ? ' · ' + e.nivel : ''))}"><circle class="hit" cx="${px}" cy="${py}" r="14"/><circle class="pt" cx="${px}" cy="${py}" r="5"/></g>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntaje de ${esc(sc.nombre)} en el tiempo">${bands}<line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>${ticks}${xl}${line}${dots}</svg>`;
}
function tabEscalas(p) {
  const apps = S.scales.filter(e => e.patientId === p.id && e.signedAt).sort((a, b) => a.aplicadaAt.localeCompare(b.aplicadaAt));
  const groups = [...new Set(apps.map(e => e.escala.id))].map(id => apps.filter(e => e.escala.id === id));
  return `<div class="sec"><div class="row" style="justify-content:space-between"><h3 style="flex:1">Chequeos de bienestar</h3>${S.newScale ? '' : '<button class="btn" data-act="formats" data-hub="escalas">Editar escalas</button><button class="btn pri" data-act="newScale">Aplicar chequeo</button>'}</div>
  ${S.newScale ? scaleForm(p) : ''}
  ${groups.map(g => { const sc = g[g.length - 1].escala, last = g[g.length - 1];
    return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(sc.nombre)}</b><span>Último: <b style="font-family:var(--f-mono)">${last.total}</b>${last.nivel ? ` <span class="chip">${esc(last.nivel)}</span>` : ''}</span></div>
    ${scaleChart(sc, g)}
    <dl class="kv">${g.slice().reverse().map(e => `<dt>${esc(fmtShort(e.aplicadaAt))}</dt><dd>${e.total} puntos${e.nivel ? ' · ' + esc(e.nivel) : ''} · <button class="btn sm" data-act="viewScale" data-id="${e.id}">Ver</button></dd>`).join('')}</dl></div>`; }).join('') || (S.newScale ? '' : '<div class="empty">Aún no hay escalas aplicadas. Incluye PHQ-9 (depresión) y GAD-7 (ansiedad); puedes agregar las tuyas en «Mis chequeos».</div>')}</div>`;
}
ACT.newScale = () => { S.newScale = SCALES_BASE[0].id; render(); updateScaleTotal(); };
ACT.cancelScale = () => { S.newScale = null; render(); };
ACT.saveScale = async b => {
  const p = curPatient(), r = readScale(), o = readForm($('#scaleform'), {});
  if (!canSign()) { toast('Primero guarda tu nombre y firma en «Mi perfil».'); return; }
  if (r.done < r.sc.items.length) { toast(r.sc.items.length - r.done === 1 ? 'Falta 1 ítem por responder.' : `Faltan ${r.sc.items.length - r.done} ítems por responder.`); return; }
  if (!reqCheck($('#scaleform'), o, ['version', 'motivo', 'observaciones', 'interpretacion'])) return;
  const fileRef = o.protocolo ? S.files.find(f => f.patientId === p.id && f.nombre === o.protocolo) : null;
  const e = { id: newId('e'), kind: 'scale', patientId: p.id, escala: clone(r.sc), respuestas: r.resp, total: r.total, nivel: r.nivel, alertas: r.alertas, funcional: o.funcional || '', aplicadaAt: toISO(o.aplicadaAt), modo: o.modo, observaciones: o.observaciones,
    version: o.version || '', motivo: o.motivo, interpretacion: o.interpretacion, protocolo: fileRef ? { id: fileRef.id, nombre: fileRef.nombre, sha256: fileRef.sha256 } : undefined, entregaA: o.entregaA || '', entregaFecha: o.entregaFecha || '', ...therSnap(), signedAt: nowISO(), addenda: [] };
  if (!(await persist([e], b))) return;
  S.scales.push(e); S.newScale = null;
  toast('Escala guardada.'); render();
};
function docScale(e, p) {
  const sc = e.escala, pr = { nombre: e.therapistName, registro: e.therapistReg, consultorio: e.consultorio };
  const lab = v => (sc.opciones.find(o => o[0] === v) || [v, ''])[1];
  return `<div class="docpage">${letterhead(pr)}<h2>${esc(sc.nombre)}</h2>${patientTable(p)}<p>${e.folio ? `<b>Folio n.º ${e.folio}</b><br>` : ''}<b>Aplicada:</b> ${esc(fmtDT(e.aplicadaAt))} · ${esc(e.modo || '')}${e.version ? '<br><b>Versión y baremo:</b> ' + esc(e.version) : ''}${e.motivo ? '<br><b>Motivo de la aplicación:</b> ' + esc(e.motivo) : ''}</p>
  ${sc.instruccion ? `<p><i>${esc(sc.instruccion)}</i></p>` : ''}<table>${sc.items.map((it, i) => `<tr><td>${i + 1}. ${esc(it)}</td><td>${esc(lab(e.respuestas[i]))} (${e.respuestas[i]})</td></tr>`).join('')}</table>
  <p><b>Puntaje total:</b> ${e.total} de ${scaleMax(sc)}${e.nivel ? ' · <b>Severidad:</b> ' + esc(e.nivel) : ''}</p>
  ${(e.alertas || []).length ? `<p><b>Para conversar:</b> respuesta destacada en el ítem ${e.alertas.map(i => i + 1).join(', ')}.</p>` : ''}${e.funcional ? `<p><b>Dificultad funcional:</b> ${esc(e.funcional)}</p>` : ''}${e.observaciones ? `<p><b>${e.motivo ? 'Condiciones de aplicación y observaciones de conducta' : 'Observaciones'}.</b> ${esc(e.observaciones)}</p>` : ''}${e.interpretacion ? `<p><b>Resultados e interpretación.</b> ${esc(e.interpretacion)}</p>` : ''}${e.protocolo ? `<p><b>Protocolo adjunto:</b> ${esc(e.protocolo.nombre)}${e.protocolo.sha256 ? ` <span style="font-family:monospace;font-size:11px;word-break:break-all">(SHA-256: ${esc(e.protocolo.sha256)})</span>` : ''}</p>` : ''}${e.entregaA ? `<p><b>Informe entregado a:</b> ${esc(e.entregaA)}${e.entregaFecha ? ', el ' + esc(fmtD(e.entregaFecha)) : ''}</p>` : ''}
  ${sc.fuente ? `<p style="font-size:12px">${esc(sc.fuente)}</p>` : ''}${adendas(e.addenda)}${sigBlock([therSig(e, e.signedAt)])}</div>`;
}
ACT.viewScale = b => { const p = curPatient(), e = S.scales.find(x => x.id === b.dataset.id); showDoc(e.escala.nombre + ' · ' + fullName(p), docScale(e, p), 'escala-' + slug(e.escala.nombre) + '-' + dayKey(new Date(e.aplicadaAt)) + '.html'); };
/* Mis chequeos: el terapeuta escribe las suyas (bajo su licencia si el instrumento tiene derechos de autor). */
ACT.scaleManage = () => {
  const root = $('#modal-root');
  const draw = (edit) => {
    const list = myScales();
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis chequeos"><div class="box" id="smform"><div class="row mfhead" style="justify-content:space-between"><h3 style="flex:1">Mis formatos</h3><button class="btn sm" data-sm="close">Cerrar</button></div>${hubTabs('escalas')}<b>Escalas propias</b>
    ${edit ? `<div class="grid">${F('Nombre', 'nombre', edit.nombre || '')}${F('Instrucción para el consultante', 'instruccion', edit.instruccion || '', { wide: true })}
      ${F('Opciones de respuesta (una por línea: puntaje = texto)', 'opciones', (edit.opciones || FREQ4).map(o => o[0] + ' = ' + o[1]).join('\n'), { type: 'area', rows: 4 })}
      ${F('Rangos de interpretación (una por línea: mínimo-máximo = nivel)', 'rangos', (edit.rangos || []).map(r => r[0] + '-' + r[1] + ' = ' + r[2]).join('\n'), { type: 'area', rows: 4 })}
      ${F('Ítems (uno por línea)', 'items', (edit.items || []).join('\n'), { type: 'area', rows: 8, wide: true })}</div>
      <p style="margin:0;font-size:13px;color:var(--muted)">Si la escala tiene derechos de autor (por ejemplo BDI-II o BAI), úsala solo si tienes la licencia. Cada aplicación guarda una copia de la escala tal como estaba, así que editarla después no cambia lo ya aplicado.</p>
      <div class="row end"><button class="btn" data-sm="list">Volver</button><button class="btn pri" data-sm="save" data-id="${esc(edit.id || '')}">Guardar escala</button></div>`
    : `${list.map(x => `<div class="card"><div class="row" style="justify-content:space-between"><b><span class="dragh" draggable="true" data-dk="esc" data-dv="${x.id}" title="Arrastra para cambiar el orden" aria-hidden="true">⠿</span> ${esc(x.nombre)}</b><span class="row"><button class="btn sm" data-sm="edit" data-id="${x.id}">Editar</button><button class="btn sm warn" data-sm="del" data-id="${x.id}">Quitar</button></span></div><span class="ts">${x.items.length} ítems · puntaje ${scaleMin(x)} a ${scaleMax(x)}</span></div>`).join('') || '<p style="margin:0;color:var(--muted)">Aún no tienes escalas propias. PHQ-9 y GAD-7 ya vienen incluidas.</p>'}
      <div class="row end"><button class="btn pri" data-sm="new">Nueva escala</button></div>`}</div></div>`;
  };
  draw(null);
  root.onclick = async e => {
    const b = e.target.closest('[data-sm]'); if (!b) return;
    const a = b.dataset.sm, list = myScales();
    if (a === 'close') { root.innerHTML = ''; root.onclick = null; if (S.tab === 'escalas' && !S.dirty) render(); else hubClosed(); return; }
    if (a === 'list') return draw(null);
    if (a === 'new') return draw({});
    if (a === 'edit') return draw(list.find(x => x.id === b.dataset.id));
    const snap = clone(S.profile);
    if (a === 'del') {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; }
      S.profile.escalas = list.filter(x => x.id !== b.dataset.id);
      if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
      return draw(null);
    }
    if (a === 'save') {
      const o = readForm($('#smform'), {});
      const opciones = o.opciones.split('\n').map(l => l.match(/^\s*(-?\d+)\s*=\s*(.+)$/)).filter(Boolean).map(m => [+m[1], m[2].trim()]);
      const rangos = o.rangos.split('\n').map(l => l.match(/^\s*(-?\d+)\s*-\s*(-?\d+)\s*=\s*(.+)$/)).filter(Boolean).map(m => [+m[1], +m[2], m[3].trim()]);
      const items = o.items.split('\n').map(x => x.trim()).filter(Boolean);
      if (!o.nombre || items.length < 1 || opciones.length < 2) { toast('Escribe el nombre, al menos un ítem y al menos dos opciones con tu puntaje («0 = Nunca»).'); return; }
      if (items.length > 120) { toast('Máximo 120 ítems.'); return; }
      const sc = { id: b.dataset.id || 'mi_' + Math.random().toString(36).slice(2, 9), nombre: o.nombre.slice(0, 120), instruccion: o.instruccion, opciones, rangos, items, propia: true };
      S.profile.escalas = b.dataset.id ? list.map(x => x.id === sc.id ? sc : x) : list.concat([sc]);
      if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
      toast('Escala guardada.'); draw(null);
    }
  };
};
/* Tooltip de los puntos de la gráfica */
document.addEventListener('pointerover', e => { const g = e.target.closest && e.target.closest('g.pp'); if (!g) return; let t = $('.ctip'); if (!t) { t = document.createElement('div'); t.className = 'ctip'; document.body.appendChild(t); } t.textContent = g.dataset.tip; const r = g.getBoundingClientRect(); t.style.left = Math.min(innerWidth - t.offsetWidth - 8, r.left + r.width / 2 - t.offsetWidth / 2) + 'px'; t.style.top = (r.top - 34) + 'px'; });
document.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('g.pp')) { const t = $('.ctip'); if (t) t.remove(); } });

/* ===== Frases frecuentes: al escribir «/» en un campo de texto se sugieren y se insertan ===== */
const myPhrases = () => S.profile.frases || [];
const phraseHint = () => `<p class="phint">${myPhrases().length ? 'Escribe <b>/</b> en cualquier campo para insertar una de tus frases frecuentes.' : 'Consejo: guarda tus frases frecuentes en «Mis formatos» → Frases y escríbelas con <b>/</b>.'}</p>`;
const Ph = { ta: null, start: 0, list: [], sel: 0 };
function phraseClose() { const x = $('#fpop'); if (x) x.remove(); Ph.ta = null; }
function phraseMatch(ta) {
  const before = ta.value.slice(0, ta.selectionStart), m = before.match(/(^|\s)\/([^\s/]{0,30})$/);
  if (!m || !myPhrases().length) return phraseClose();
  const q = norm(m[2]);
  Ph.list = myPhrases().filter(f => !q || norm(f.a).startsWith(q) || norm(f.t).includes(q)).slice(0, 6);
  if (!Ph.list.length) return phraseClose();
  Ph.ta = ta; Ph.start = ta.selectionStart - m[2].length - 1; Ph.sel = Math.min(Ph.sel, Ph.list.length - 1);
  let pop = $('#fpop'); if (!pop) { pop = document.createElement('div'); pop.id = 'fpop'; pop.setAttribute('role', 'listbox'); document.body.appendChild(pop); }
  pop.innerHTML = Ph.list.map((f, i) => `<div class="fopt ${i === Ph.sel ? 'on' : ''}" role="option" data-i="${i}"><b>/${esc(f.a)}</b><span>${esc(f.t.length > 90 ? f.t.slice(0, 88) + '…' : f.t)}</span></div>`).join('') + '<small>Enter o Tab para insertar · Esc para cerrar</small>';
  const r = ta.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 380)) + 'px'; pop.style.top = Math.min(r.bottom + 4, innerHeight - pop.offsetHeight - 8) + 'px';
  pop.onmousedown = e => { const o = e.target.closest('.fopt'); if (o) { e.preventDefault(); phraseInsert(+o.dataset.i); } };
}
function phraseInsert(i) {
  const ta = Ph.ta, f = Ph.list[i]; if (!ta || !f) return;
  const end = ta.selectionStart, txt = f.t + ' ';
  ta.value = ta.value.slice(0, Ph.start) + txt + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = Ph.start + txt.length;
  S.dirty = true; phraseClose(); ta.focus();
}
document.addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA' && e.target.closest('#app')) { Ph.sel = 0; phraseMatch(e.target); } });
document.addEventListener('keydown', e => {
  if (!Ph.ta || e.target !== Ph.ta) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); Ph.sel = (Ph.sel + (e.key === 'ArrowDown' ? 1 : Ph.list.length - 1)) % Ph.list.length; phraseMatch(Ph.ta); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); phraseInsert(Ph.sel); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); phraseClose(); }
}, true);
document.addEventListener('focusout', e => { if (e.target === Ph.ta) setTimeout(() => { if (document.activeElement !== Ph.ta) phraseClose(); }, 150); });
ACT.phrases = () => {
  const root = $('#modal-root');
  const draw = () => {
    const list = myPhrases();
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis frases"><div class="box" id="phform"><div class="row mfhead" style="justify-content:space-between"><h3 style="flex:1">Mis formatos</h3><button class="btn sm" data-ph="close">Cerrar</button></div>${hubTabs('frases')}<b>Frases frecuentes</b>
    <p style="margin:0;font-size:13px;color:var(--muted)">En cualquier campo de texto de una nota, escribe <b>/</b> y el atajo (por ejemplo <b>/psico</b>) y pulsa Enter: se inserta la frase completa.</p>
    ${list.map((f, i) => `<div class="card"><div class="row" style="justify-content:space-between"><b><span class="dragh" draggable="true" data-dk="fra" data-dv="${i}" title="Arrastra para cambiar el orden" aria-hidden="true">⠿</span> /${esc(f.a)}</b><button class="btn sm warn" data-ph="del" data-i="${i}">Quitar</button></div><p>${esc(f.t)}</p></div>`).join('') || '<p style="margin:0;color:var(--muted)">Aún no tienes frases.</p>'}
    <div class="card"><div class="grid">${F('Atajo (una palabra)', 'a', '', { ph: 'Ej.: psico' })}${F('Frase', 't', '', { type: 'area', rows: 3, wide: true })}</div><div class="row end"><button class="btn pri" data-ph="add">Agregar frase</button></div></div></div></div>`;
  };
  draw();
  root.onclick = async e => {
    const b = e.target.closest('[data-ph]'); if (!b) return;
    if (b.dataset.ph === 'close') { root.innerHTML = ''; root.onclick = null; $$('.phint').forEach(x => { x.outerHTML = phraseHint(); }); return; }
    const snap = clone(S.profile), list = myPhrases().slice();
    if (b.dataset.ph === 'del') list.splice(+b.dataset.i, 1);
    if (b.dataset.ph === 'add') {
      const o = readForm($('#phform'), {}), a = (o.a || '').replace(/^\/+/, '').replace(/\s+/g, '').slice(0, 30);
      if (!a || !o.t) { toast('Escribe el atajo y la frase.'); return; }
      if (list.some(f => norm(f.a) === norm(a))) { toast('Ya tienes una frase con ese atajo.'); return; }
      if (list.length >= 100) { toast('Máximo 100 frases.'); return; }
      list.push({ a, t: o.t.slice(0, 2000) });
    }
    S.profile.frases = list;
    if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
    draw();
  };
};

