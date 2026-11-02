/* Notas de proceso y escritura a mano. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Notas de proceso: cuaderno del terapeuta, fuera de la ficha ===== */
const PN_TIPOS = ['Idea', 'Mirada del caso', 'Consejos de colegas', 'Pendiente', 'Recordatorio', 'Otra'];
const PN_ESTADOS = ['Abierta', 'En seguimiento', 'Cerrada'];
const fold = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plainRich = t => String(t || '').replace(/^#\s+/gm, '').replace(/^[-•]\s+/gm, '• ').replace(/\*\*|__|\*/g, '');
const pnCur = () => S.pnotes.find(n => n.id === S.pn.sel) || (S.pn.draft && S.pn.draft.id === S.pn.sel ? S.pn.draft : null);
const pnPat = n => n.patientId ? S.patients.find(p => p.id === n.patientId) : null;
function pnMatch(n, q) {
  if (!q) return true;
  const pp = pnPat(n), hay = fold([n.titulo, n.tipo, n.texto, (n.etiquetas || []).join(' '), (n.seguimiento || []).map(x => x.texto).join(' '), pp ? fullName(pp) : ''].join(' \n '));
  return fold(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
function pnFiltered() {
  const F = S.pn;
  return S.pnotes.filter(n => (!F.pid || (F.pid === '_none' ? !n.patientId : n.patientId === F.pid)) && (!F.tipo || n.tipo === F.tipo)
    && (F.estado === 'todas' ? true : F.estado === 'abiertas' ? n.estado !== 'Cerrada' : F.estado === 'revisar' ? n.revisar && n.revisar <= dayKey(new Date()) && n.estado !== 'Cerrada' : n.estado === F.estado) && pnMatch(n, F.q))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}
/* Resalta las palabras buscadas en un texto ya escapado. */
function pnMark(text, q) {
  let h = esc(text); const ws = fold(q).split(/\s+/).filter(w => w.length > 1); if (!ws.length) return h;
  const f = fold(text); const hits = [];
  ws.forEach(w => { let i = f.indexOf(w); while (i >= 0) { hits.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
  if (!hits.length) return h;
  hits.sort((a, b) => a[0] - b[0]); let out = '', at = 0;
  hits.forEach(([a, z]) => { if (a < at) return; out += esc(text.slice(at, a)) + '<mark>' + esc(text.slice(a, z)) + '</mark>'; at = z; });
  return out + esc(text.slice(at));
}
function pnExcerpt(n, q) {
  const all = plainRich([n.texto, ...(n.seguimiento || []).map(x => x.texto)].filter(Boolean).join(' · ')).replace(/\s+/g, ' ').trim();
  const w = fold(q).split(/\s+/).filter(Boolean)[0], i = w ? fold(all).indexOf(w) : -1;
  const cut = i > 60 ? '…' + all.slice(i - 50, i + 130) : all.slice(0, 180);
  return pnMark(cut, q) || ((n.manos || []).length ? '<i>Escrita a mano</i>' : '<i>Sin texto</i>');
}
function pnRowHTML(n, q, today) {
  const due = n.revisar && n.revisar <= today && n.estado !== 'Cerrada';
  return `<button class="pnrow ${n.id === S.pn.sel ? 'on' : ''}" data-act="pnOpen" data-id="${n.id}"><span class="tt">${pnMark(n.titulo || 'Sin título', q)}</span>
    <span class="mt"><span class="chip">${esc(n.tipo || 'Otra')}</span>${n.estado === 'Cerrada' ? '<span class="chip warn">Cerrada</span>' : n.estado === 'En seguimiento' ? '<span class="chip ok">En seguimiento</span>' : ''}${n.revisar && n.estado !== 'Cerrada' ? `<span class="chip ${due ? 'due' : ''}">Revisar ${esc(fmtD(n.revisar))}</span>` : ''}</span>
    <span class="ex">${pnExcerpt(n, q)}</span><span class="mt">${(n.manos || []).length ? `<span class="chip">✎ ${n.manos.length} a mano</span>` : ''}${(n.etiquetas || []).map(t => '#' + pnMark(t, q)).join(' ')}<span>· ${esc(fmtShort(n.updatedAt || n.createdAt))}</span></span></button>`;
}
/* Grupos: primero las notas generales y luego un grupo por consultante (orden alfabético). Cerrados por defecto. */
function pnGroups(list) {
  const g = new Map();
  list.forEach(n => { const k = n.patientId || '_none'; if (!g.has(k)) g.set(k, []); g.get(k).push(n); });
  const name = k => k === '_none' ? 'Notas generales' : (S.patients.find(p => p.id === k) ? fullName(S.patients.find(p => p.id === k)) : 'Consultante eliminado');
  return [...g.entries()].map(([k, ns]) => ({ k, name: name(k), ns })).sort((a, b) => a.k === '_none' ? -1 : b.k === '_none' ? 1 : a.name.localeCompare(b.name, 'es'));
}
function pnListHTML() {
  const list = pnFiltered(), q = S.pn.q, today = dayKey(new Date());
  if (!S.pnotes.length) return '<div class="empty" style="padding:24px 16px">Aún no tiene notas de proceso. Use «+ Nueva nota» para anotar una hipótesis, una formulación de caso o una supervisión.</div>';
  if (!list.length) return '<div class="empty" style="padding:24px 16px">Ninguna nota coincide con la búsqueda o los filtros.</div>';
  const cur = pnCur(), groups = pnGroups(list);
  return groups.map(g => {
    const due = g.ns.filter(n => n.revisar && n.revisar <= today && n.estado !== 'Cerrada').length;
    const open = S.pn.open.has(g.k) || !!q || groups.length === 1 || (cur && (cur.patientId || '_none') === g.k);
    return `<details class="pngrp" data-g="${esc(g.k)}" ${open ? 'open' : ''}><summary><span class="gn">${g.k === '_none' ? '' : '<span class="ico" aria-hidden="true">●</span>'}${pnMark(g.name, q)}</span><span class="row" style="gap:6px">${due ? `<span class="chip due" title="Notas por revisar">${due} por revisar</span>` : ''}<span class="cnt">${g.ns.length}</span></span></summary>${g.ns.map(n => pnRowHTML(n, q, today)).join('')}</details>`;
  }).join('');
}
function pnEditorHTML(n) {
  if (!n) return `<div class="pned"><h3 style="margin:0">Notas de proceso</h3><div class="banner" style="margin:0"><b>Son sus notas de trabajo, no la ficha.</b> Aquí van hipótesis, formulaciones, lo que habló en supervisión e ideas para el caso. No se firman, no salen en la historia completa ni en copias o informes, y su equipo no las ve. Puede editarlas y borrarlas cuando quiera.</div>
    <p class="stnote" style="margin:0">Lo que haga parte de la atención (lo ocurrido en la sesión, el impresión, las decisiones del proceso) debe quedar en la sesión de la historia.</p>
    <div class="row"><button class="btn pri" data-act="pnNew">+ Nueva nota</button></div></div>`;
  const pts = S.patients.slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  const pp = pnPat(n), segs = (n.seguimiento || []).map((x, i) => [x, i]).reverse();
  return `<div class="pned" id="pnedit"><div class="row" style="justify-content:space-between"><button class="btn sm back" data-act="pnBack">← Notas</button><span class="pnstat" id="pn_stat" aria-live="polite">${S.pnotes.includes(n) ? 'Guardada' : 'Nueva: se guarda sola al escribir'}</span></div>
    <input id="pn_t" class="ttl" type="text" value="${esc(n.titulo || '')}" placeholder="Título (ej.: Hipótesis sobre la evitación)" aria-label="Título de la nota" maxlength="200">
    <div class="grid"><div class="fld"><label for="pn_pac">Consultante</label><select id="pn_pac"><option value="">— Nota general (sin consultante) —</option>${pts.map(x => `<option value="${x.id}" ${x.id === n.patientId ? 'selected' : ''}>${esc(fullName(x))}</option>`).join('')}${n.patientId && !pp ? `<option value="${esc(n.patientId)}" selected>(consultante eliminado)</option>` : ''}</select></div>
      <div class="fld"><label for="pn_tipo">Tipo</label><select id="pn_tipo">${PN_TIPOS.map(t => `<option ${t === n.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="pn_estado">Estado</label><select id="pn_estado">${PN_ESTADOS.map(t => `<option ${t === (n.estado || 'Abierta') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="pn_rev">Revisar el (opcional)</label><input id="pn_rev" type="date" value="${esc(n.revisar || '')}"></div></div>
    <div class="fld"><label for="pn_tags">Etiquetas (separadas por coma)</label><input id="pn_tags" type="text" value="${esc((n.etiquetas || []).join(', '))}" placeholder="ej.: apego, duelo, supervisión con Dra. X"></div>
    <div class="fld"><label for="pn_txt">Nota</label>${richBar('pn_txt')}<textarea id="pn_txt" rows="12" style="font-family:var(--f-doc);font-size:15px" placeholder="Hipótesis, preguntas abiertas, lo conversado en supervisión…">${esc(n.texto || '')}</textarea></div>
    <div class="fld"><span class="lbl">A mano${(n.manos || []).length ? ' (' + n.manos.length + (n.manos.length === 1 ? ' hoja' : ' hojas') + ')' : ''}</span>
      <div class="hwthumbs" id="hwthumbs">${(n.manos || []).map((h, i) => `<button class="hwthumb" data-act="hwOpen" data-i="${i}" aria-label="Abrir hoja a mano ${i + 1}"><img data-hw="${i}" alt=""><span>Hoja ${i + 1} · ${esc(fmtShort(h.at))}</span></button>`).join('')}</div>
      <div class="row"><button class="btn sm" data-act="hwOpen" data-i="new">✎ Escribir a mano</button><span class="hwhint">Con lápiz en tablet o con el dedo. La escritura a mano no entra en la búsqueda: póngale un título a la nota.</span></div></div>
    <div class="sec" style="margin:0"><h3 style="margin:0">Seguimiento${segs.length ? ' (' + segs.length + ')' : ''}</h3>
      <p class="stnote" style="margin:0">Agregue cómo evoluciona la idea: qué confirmó o descartó, qué le dijeron en supervisión, qué probar en la próxima sesión.</p>
      <div class="fld"><label for="pn_seg" class="sr-only">Nuevo seguimiento</label><textarea id="pn_seg" rows="3" placeholder="Nuevo seguimiento…"></textarea></div>
      <div class="row end"><button class="btn sm pri" data-act="pnSeg">Agregar seguimiento</button></div>
      ${segs.map(([x, i]) => `<div class="pnseg"><span class="ts">${esc(fmtShort(x.at))} <button class="btn sm" data-act="pnSegDel" data-i="${i}" style="padding:0 6px;margin-left:4px" aria-label="Quitar este seguimiento">Quitar</button></span><p>${pnMark(x.texto, S.pn.q)}</p></div>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><span class="ts">${n.createdAt ? 'Creada ' + esc(fmtShort(n.createdAt)) : ''}${pp ? ` · <button class="btn sm" data-act="open" data-id="${pp.id}">Abrir historia de ${esc(fullName(pp))}</button>` : ''}</span>${S.pnotes.includes(n) ? '<button class="btn sm warn" data-act="pnDel">Eliminar nota</button>' : ''}</div></div>`;
}
function pnHTML() {
  const F = S.pn, pts = S.patients.filter(p => S.pnotes.some(n => n.patientId === p.id)).sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  if (F.pid && F.pid !== '_none' && !pts.some(p => p.id === F.pid)) { const x = S.patients.find(p => p.id === F.pid); if (x) pts.unshift(x); }
  return `<div class="layout pnl ${F.sel ? 'in-file' : ''}"><div class="plist-wrap"><div class="panel">
    <div class="pnfil"><input type="search" id="pn_q" value="${esc(F.q)}" placeholder="Buscar en mis notas" aria-label="Buscar en las notas de proceso">
      <div class="row"><select id="pn_fpac" aria-label="Filtrar por consultante"><option value="">Todos los consultantes</option><option value="_none" ${F.pid === '_none' ? 'selected' : ''}>Notas generales</option>${pts.map(p => `<option value="${p.id}" ${p.id === F.pid ? 'selected' : ''}>${esc(fullName(p))}</option>`).join('')}</select></div>
      <div class="row"><select id="pn_ftipo" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>${PN_TIPOS.map(t => `<option ${t === F.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="pn_fest" aria-label="Filtrar por estado">${[['abiertas', 'Abiertas y en seguimiento'], ['revisar', 'Por revisar hoy'], ['Cerrada', 'Cerradas'], ['todas', 'Todas']].map(([v, l]) => `<option value="${v}" ${v === F.estado ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <span class="ts" id="pn_count"></span></div>
    <div id="pnlist">${pnListHTML()}</div></div></div>
  <div class="file-wrap"><div class="panel">${pnEditorHTML(pnCur())}</div></div></div>`;
}
let pnTimer = null, pnPending = false;
function pnCount() { const c = $('#pn_count'); if (c) { const n = pnFiltered().length; c.textContent = n + ' de ' + S.pnotes.length + ' nota' + (S.pnotes.length === 1 ? '' : 's'); } }
function pnMount() {
  pnCount();
  const relist = () => { const l = $('#pnlist'); if (l) l.innerHTML = pnListHTML(); pnCount(); };
  const q = $('#pn_q'); if (q) q.oninput = () => { S.pn.q = q.value; relist(); };
  const lst = $('#pnlist'); if (lst) lst.addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details.pngrp') || S.pn.q) return; if (d.open) S.pn.open.add(d.dataset.g); else S.pn.open.delete(d.dataset.g); }, true);
  [['pn_fpac', 'pid'], ['pn_ftipo', 'tipo'], ['pn_fest', 'estado']].forEach(([id, k]) => { const e = $('#' + id); if (e) e.onchange = () => { S.pn[k] = e.value; relist(); }; });
  const ed = $('#pnedit'); if (!ed) return;
  hwThumbs();
  const touch = e => { if (e.target.id === 'pn_seg') return; pnPending = true; const st = $('#pn_stat'); if (st) st.textContent = 'Sin guardar…'; clearTimeout(pnTimer); pnTimer = setTimeout(pnSave, 900); };
  ed.addEventListener('input', touch); ed.addEventListener('change', touch);
  ed.addEventListener('focusout', e => { if (pnPending && e.target.id !== 'pn_seg') { clearTimeout(pnTimer); pnSave(); } });
}
function pnRead(n) {
  n.titulo = $('#pn_t').value.trim().slice(0, 200); n.patientId = $('#pn_pac').value || null; n.tipo = $('#pn_tipo').value; n.estado = $('#pn_estado').value;
  n.revisar = $('#pn_rev').value || ''; n.etiquetas = $('#pn_tags').value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20); n.texto = $('#pn_txt').value;
}
/* Los guardados van en fila: dos a la vez agregaban la nota nueva dos veces a la lista. */
let pnChain = Promise.resolve();
function pnSave() { pnChain = pnChain.then(pnSaveNow, pnSaveNow); return pnChain; }
async function pnSaveNow() {
  clearTimeout(pnTimer); const n = pnCur(); if (!n || !$('#pnedit')) { pnPending = false; return; }
  const snap = clone(n); pnRead(n); pnPending = false;
  const isNew = !S.pnotes.includes(n);
  if (isNew && !n.titulo && !n.texto.trim() && !(n.seguimiento || []).length && !(n.manos || []).length) return;
  n.updatedAt = nowISO();
  if (isNew) { S.pnotes.push(n); S.pn.draft = null; }
  const st = $('#pn_stat'); if (st) st.textContent = 'Guardando…';
  try {
    await Store.save(n, { strict: true });
    if (isNew && !$('#pnedit [data-act="pnDel"]')) { const row = $('#pnedit > .row:last-child'); if (row) row.insertAdjacentHTML('beforeend', '<button class="btn sm warn" data-act="pnDel">Eliminar nota</button>'); }
    const s2 = $('#pn_stat'); if (s2) s2.textContent = 'Guardada ' + new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    const l = $('#pnlist'); if (l) l.innerHTML = pnListHTML(); pnCount();
  } catch (e) {
    restore(n, snap); pnPending = true;
    if (isNew) { S.pnotes = S.pnotes.filter(x => x !== n); S.pn.draft = n; }
    const s2 = $('#pn_stat'); if (s2) s2.textContent = 'No se pudo guardar: ' + e.message;
  }
}
async function pnLeave() { if (pnPending) await pnSave(); else await pnChain; }
ACT.pnNew = async () => {
  await pnLeave();
  const pid = S.pn.pid && S.pn.pid !== '_none' ? S.pn.pid : null;
  S.pn.draft = { id: newId('pn'), kind: 'pnote', patientId: pid, titulo: '', tipo: 'Hipótesis', estado: 'Abierta', revisar: '', etiquetas: [], texto: '', seguimiento: [], createdAt: nowISO() };
  S.view = 'cuaderno'; S.pn.sel = S.pn.draft.id; render(); const t = $('#pn_t'); if (t) t.focus();
};
ACT.pnOpen = async b => { await pnLeave(); S.view = 'cuaderno'; S.pn.sel = b.dataset.id; S.pn.draft = null; render(); if (innerWidth <= 820) scrollTo(0, 0); };
ACT.pnBack = async () => { await pnLeave(); S.pn.sel = null; S.pn.draft = null; render(); };
ACT.pnFor = b => { S.view = 'cuaderno'; S.pn.pid = b.dataset.id; S.pn.open.add(b.dataset.id); S.pn.estado = 'todas'; S.pn.sel = null; S.pn.q = ''; render(); scrollTo(0, 0); };
ACT.pnSeg = async b => {
  const n = pnCur(), t = $('#pn_seg').value.trim(); if (!n) return;
  if (!t) { toast('Escriba el seguimiento.'); $('#pn_seg').focus(); return; }
  pnRead(n); n.seguimiento = (n.seguimiento || []).concat([{ at: nowISO(), texto: t.slice(0, 5000) }]);
  if (n.estado === 'Abierta') n.estado = 'En seguimiento';
  await pnChain; clearTimeout(pnTimer);
  const wasNew = !S.pnotes.includes(n); n.updatedAt = nowISO(); setBusy(b, true);
  if (wasNew) { S.pnotes.push(n); S.pn.draft = null; }
  try { await Store.save(n, { strict: true }); pnPending = false; render(); toast('Seguimiento agregado.'); }
  catch (e) { n.seguimiento.pop(); if (wasNew) { S.pnotes = S.pnotes.filter(x => x !== n); S.pn.draft = n; } toast(e.message); setBusy(b, false); }
};
ACT.pnSegDel = async b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Quitar?'; return; }
  const n = pnCur(); if (!n) return; pnRead(n);
  const old = n.seguimiento.slice(); n.seguimiento.splice(+b.dataset.i, 1); n.updatedAt = nowISO();
  if (!(await persist([n], b))) { n.seguimiento = old; return; } render();
};
ACT.pnDel = b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: eliminar la nota'; return; }
  const n = pnCur(); if (!n) return; clearTimeout(pnTimer); pnPending = false;
  S.pnotes = S.pnotes.filter(x => x.id !== n.id); Store.remove(n.id); S.pn.sel = null; toast('Nota eliminada.'); render();
};

/* ===== Escritura a mano: hojas con trazos vectoriales (presión del lápiz, borrador, deshacer) ===== */
const HW_W = 1000, HW_H = 1400, HW_COLORS = ['#1d1b26', '#1f4fd1', '#c62828', '#2e7d32'], HW_SIZES = [2.2, 3.4, 5.5];
/* Cada trazo: { c: color, w: grosor, h: 1 si es resaltador, p: [x, y, presión(0-100), x, y, presión, …] } en una hoja de 1000 × 1400. */
/* Trazo con aspecto de tinta: se suaviza el recorrido, el grosor sigue la presión del lápiz (o la velocidad,
   con el dedo o el mouse) y se dibuja como una forma rellena, con extremos redondeados y un leve afinamiento. */
function hwShape(st) {
  const p = st.p, n = p.length / 3, pts = [];
  for (let i = 0; i < n; i++) pts.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2] / 100]);
  // suavizado del recorrido (promedio móvil exponencial), conservando el último punto
  const sm = [pts[0]];
  for (let i = 1; i < n; i++) { const a = sm[i - 1], q = pts[i]; sm.push([a[0] + (q[0] - a[0]) * .55, a[1] + (q[1] - a[1]) * .55, q[2]]); }
  if (n > 2) sm.push(pts[n - 1]);
  const sim = st.f || pts.every(q => Math.abs(q[2] - .5) < .001);  // sin presión real: se simula con la velocidad
  const out = []; let pr = sim ? .55 : Math.pow(sm[0][2], .65), total = 0;
  for (let i = 1; i < sm.length; i++) total += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  let run = 0;
  for (let i = 0; i < sm.length; i++) {
    const a = sm[Math.max(0, i - 1)], c = sm[Math.min(sm.length - 1, i + 1)], q = sm[i];
    const d = i ? Math.hypot(q[0] - sm[i - 1][0], q[1] - sm[i - 1][1]) : 0; run += d;
    const target = sim ? Math.max(.25, Math.min(1, 1 - (d - 2) / (st.w * 6))) : Math.pow(Math.max(.02, q[2]), .65);
    pr += (target - pr) * (sim ? .25 : .45);
    let r = st.w * (.28 + .9 * pr) / 2;
    const taper = Math.min(1, (run + 2) / (st.w * 2.5), (total - run + 2) / (st.w * 3.5));  // punta al empezar y al terminar
    r *= .55 + .45 * Math.max(0, taper);
    let dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy) || 1;
    out.push([q[0], q[1], r, -dy / L, dx / L]);
  }
  return out;
}
function hwDrawStroke(g, st, k) {
  const p = st.p; if (!p || p.length < 3) return;
  g.save(); g.fillStyle = st.c; g.strokeStyle = st.c;
  if (st.h) {  // resaltador: trazo ancho y translúcido que no tapa la tinta
    g.globalAlpha = .32; g.globalCompositeOperation = 'multiply'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = st.w * 4.5 * k;
    g.beginPath(); g.moveTo(p[0] * k, p[1] * k);
    for (let i = 3; i < p.length - 3; i += 3) g.quadraticCurveTo(p[i] * k, p[i + 1] * k, (p[i] + p[i + 3]) / 2 * k, (p[i + 1] + p[i + 4]) / 2 * k);
    g.lineTo(p[p.length - 3] * k, p[p.length - 2] * k); g.stroke(); g.restore(); return;
  }
  const o = hwShape(st);
  if (o.length === 1) { g.beginPath(); g.arc(o[0][0] * k, o[0][1] * k, Math.max(.7, o[0][2] * 1.2) * k, 0, 7); g.fill(); g.restore(); return; }
  const L = o.map(q => [q[0] + q[3] * q[2], q[1] + q[4] * q[2]]), R = o.map(q => [q[0] - q[3] * q[2], q[1] - q[4] * q[2]]).reverse();
  const curve = pts => { for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, (pts[i][0] + pts[i + 1][0]) / 2 * k, (pts[i][1] + pts[i + 1][1]) / 2 * k); g.lineTo(pts[pts.length - 1][0] * k, pts[pts.length - 1][1] * k); };
  g.beginPath(); g.moveTo(L[0][0] * k, L[0][1] * k); curve(L);
  const e = o[o.length - 1], sA = o[0];
  g.arc(e[0] * k, e[1] * k, e[2] * k, Math.atan2(e[4], e[3]), Math.atan2(-e[4], -e[3]), false);  // punta redonda al final
  g.lineTo(R[0][0] * k, R[0][1] * k); curve(R);
  g.arc(sA[0] * k, sA[1] * k, sA[2] * k, Math.atan2(-sA[4], -sA[3]), Math.atan2(sA[4], sA[3]), false);  // y al inicio
  g.closePath(); g.fill();
  g.restore();
}
function hwBackground(g, bg, k, W, H) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  if (bg === 'rayas') { g.strokeStyle = '#d9e3f0'; g.lineWidth = 1 * k; for (let y = 90; y < HW_H; y += 45) { g.beginPath(); g.moveTo(0, y * k); g.lineTo(W, y * k); g.stroke(); } g.strokeStyle = '#f2c4c4'; g.beginPath(); g.moveTo(80 * k, 0); g.lineTo(80 * k, H); g.stroke(); }
  else if (bg === 'cuadros') { g.strokeStyle = '#e4e8ee'; g.lineWidth = 1 * k; for (let x = 40; x < HW_W; x += 40) { g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, H); g.stroke(); } for (let y = 40; y < HW_H; y += 40) { g.beginPath(); g.moveTo(0, y * k); g.lineTo(W, y * k); g.stroke(); } }
}
function hwRender(canvas, page, width) {
  const k = width / HW_W, W = Math.round(width), H = Math.round(HW_H * k);
  canvas.width = W; canvas.height = H; const g = canvas.getContext('2d');
  hwBackground(g, page.fondo, k, W, H); (page.trazos || []).forEach(st => hwDrawStroke(g, st, k));
}
function hwThumbs() {
  const n = pnCur(); if (!n) return;
  $$('#hwthumbs img[data-hw]').forEach(img => { const pg = (n.manos || [])[+img.dataset.hw]; if (!pg) return; const c = document.createElement('canvas'); hwRender(c, pg, 240); img.src = c.toDataURL('image/png'); });
}
ACT.hwOpen = b => { const n = pnCur(); if (!n) return; if ($('#pn_t')) pnRead(n); hwEditor(n, b.dataset.i === 'new' ? -1 : +b.dataset.i); };
function hwEditor(n, idx) {
  const orig = idx >= 0 ? n.manos[idx] : null;
  const page = orig ? JSON.parse(JSON.stringify(orig)) : { id: newId('hw'), fondo: 'rayas', trazos: [], at: nowISO() };
  const T = { tool: 'pen', color: HW_COLORS[0], size: 1, penOnly: false, undo: [], redo: [], changed: false };
  const host = document.createElement('div'); host.className = 'hwmodal'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', 'Escribir a mano');
  const btn = (k, v, label, extra = '') => `<button class="btn sm" data-hw-${k}="${v}" ${extra}>${label}</button>`;
  host.innerHTML = `<div class="hwbar">
    ${btn('tool', 'pen', '✎ Lápiz', 'aria-pressed="true"')}${btn('tool', 'hl', 'Resaltador')}${btn('tool', 'erase', 'Borrador')}<span class="sep"></span>
    ${HW_COLORS.map((c, i) => `<button class="hwsw" data-hw-color="${c}" style="background:${c}" aria-label="Color ${['negro', 'azul', 'rojo', 'verde'][i]}" aria-pressed="${i ? 'false' : 'true'}"></button>`).join('')}<span class="sep"></span>
    ${HW_SIZES.map((s, i) => btn('size', i, ['Fino', 'Medio', 'Grueso'][i], `aria-pressed="${i === 1}"`)).join('')}<span class="sep"></span>
    ${btn('do', 'undo', '↶ Deshacer')}${btn('do', 'redo', '↷ Rehacer')}<span class="sep"></span>
    <select data-hw-bg aria-label="Fondo de la hoja" style="width:auto">${[['rayas', 'Rayada'], ['cuadros', 'Cuadriculada'], ['liso', 'Lisa']].map(([v, l]) => `<option value="${v}" ${v === page.fondo ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="check hwhint" style="margin:0"><input type="checkbox" data-hw-pen> Solo lápiz (la mano no raya)</label><span class="hwhint">Desplace la hoja con dos dedos</span>
    <span style="flex:1"></span>${orig ? btn('do', 'del', 'Eliminar hoja', 'class="btn sm warn"') : ''}${btn('do', 'close', 'Cancelar')}${btn('do', 'save', 'Guardar hoja', 'class="btn sm pri"')}</div>
    <div class="hwscroll"><div class="hwpage"><canvas aria-label="Hoja para escribir a mano"></canvas></div></div>`;
  document.body.appendChild(host);
  const cv = host.querySelector('canvas'), pageEl = host.querySelector('.hwpage'), g = cv.getContext('2d');
  let W = 0, k = 1, dpr = 1;
  const size = () => { dpr = Math.min(3, Math.max(2, devicePixelRatio || 1)); W = pageEl.clientWidth; k = W / HW_W; cv.width = Math.round(W * dpr); cv.height = Math.round(HW_H * k * dpr); cv.style.height = Math.round(HW_H * k) + 'px'; redraw(); };
  const base = document.createElement('canvas'), bg = base.getContext('2d');
  const redraw = () => { base.width = cv.width; base.height = cv.height; hwBackground(bg, page.fondo, k * dpr, base.width, base.height); page.trazos.forEach(st => { if (st !== cur) hwDrawStroke(bg, st, k * dpr); }); paint(); };
  let raf = 0;
  const paint = () => { raf = 0; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0); if (cur && !cur.erase) hwDrawStroke(g, cur, k * dpr); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * HW_W * 10) / 10, Math.round((e.clientY - r.top) / r.height * HW_H * 10) / 10]; };  // décimas de punto: precisión de sobra
  const snap = () => page.trazos.slice();
  const press = e => e.pointerType === 'pen' ? Math.round(Math.max(.05, e.pressure || .5) * 100) : 50;
  /* Punteros: cada trazo sigue solo al lápiz o dedo que lo empezó. Con «Solo lápiz», un dedo o la palma no hacen nada
     y dos dedos desplazan la hoja. Sin «Solo lápiz», un dedo escribe y dos dedos desplazan (el trazo a medias se descarta). */
  let cur = null, curId = null, last = null;
  const touches = new Map(), scroller = host.querySelector('.hwscroll');
  const eraseAt = ([x, y]) => {
    const r = 14, before = page.trazos.length;
    page.trazos = page.trazos.filter(st => { for (let i = 0; i < st.p.length; i += 3) if (Math.abs(st.p[i] - x) < r + st.w && Math.abs(st.p[i + 1] - y) < r + st.w) return false; return true; });
    if (page.trazos.length !== before) { T.changed = true; redraw(); }
  };
  const startStroke = e => {
    T.undo.push(snap()); if (T.undo.length > 100) T.undo.shift(); T.redo = [];
    curId = e.pointerId; const pt = pos(e);
    if (T.tool === 'erase') { cur = { erase: true }; eraseAt(pt); return; }
    cur = { c: T.color, w: HW_SIZES[T.size], p: [pt[0], pt[1], press(e)] }; if (T.tool === 'hl') cur.h = 1; if (e.pointerType !== 'pen') cur.f = 1;
    last = pt; page.trazos.push(cur); T.changed = true; schedule();
  };
  const dropStroke = () => { const c = cur; cur = null; curId = null; if (c && !c.erase) { page.trazos = T.undo.pop() || page.trazos; redraw(); } };
  const endStroke = () => { const c = cur; cur = null; curId = null; if (c && !c.erase) hwDrawStroke(bg, c, k * dpr); paint(); };
  host.addEventListener('pointerdown', e => {
    if (!e.target.closest('.hwscroll')) return;  // la barra funciona normal
    e.preventDefault();
    if (e.pointerType === 'pen' && !T.penOnly) { T.penOnly = true; host.querySelector('[data-hw-pen]').checked = true; }
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size >= 2 && cur && touches.has(curId)) dropStroke();  // eran dos dedos: es para desplazar
      if (T.penOnly || touches.size > 1 || cur || e.target !== cv) return;
    } else if (cur || e.target !== cv) return;  // ya hay un trazo en curso
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* puntero sin captura */ }
    startStroke(e);
  });
  host.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      const prev = touches.get(e.pointerId); touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size >= 2 && e.pointerId !== curId) { e.preventDefault(); scroller.scrollTop -= (e.clientY - prev[1]) / touches.size; scroller.scrollLeft -= (e.clientX - prev[0]) / touches.size; }
    }
    if (!cur || e.pointerId !== curId) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const pt = pos(ev);
      if (cur.erase) { eraseAt(pt); continue; }
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < .8) continue;
      cur.p.push(pt[0], pt[1], press(ev)); last = pt;
    }
    schedule();
  });
  const up = e => { touches.delete(e.pointerId); if (e.pointerId === curId) endStroke(); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => host.addEventListener(t, up));
  addEventListener('pointerup', up);
  // iPad: que la página de atrás no se desplace ni haga zoom mientras se escribe
  const block = e => { if (e.target.closest && e.target.closest('.hwbar')) return; e.preventDefault(); };
  host.addEventListener('touchmove', block, { passive: false });
  host.querySelector('.hwscroll').addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  host.addEventListener('gesturestart', e => e.preventDefault());
  const html = document.documentElement, prevOv = [html.style.overflow, document.body.style.overflow];
  html.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
  const close = () => { removeEventListener('resize', size); removeEventListener('pointerup', up); html.style.overflow = prevOv[0]; document.body.style.overflow = prevOv[1]; host.remove(); };
  host.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.hwTool) { T.tool = b.dataset.hwTool; host.querySelectorAll('[data-hw-tool]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (b.dataset.hwColor) { T.color = b.dataset.hwColor; if (T.tool === 'erase') { T.tool = 'pen'; host.querySelectorAll('[data-hw-tool]').forEach(x => x.setAttribute('aria-pressed', x.dataset.hwTool === 'pen')); } host.querySelectorAll('[data-hw-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (b.dataset.hwSize !== undefined) { T.size = +b.dataset.hwSize; host.querySelectorAll('[data-hw-size]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    const a = b.dataset.hwDo;
    if (a === 'undo' && T.undo.length) { T.redo.push(snap()); page.trazos = T.undo.pop(); T.changed = true; redraw(); }
    else if (a === 'redo' && T.redo.length) { T.undo.push(snap()); page.trazos = T.redo.pop(); T.changed = true; redraw(); }
    else if (a === 'close') { if (T.changed && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Salir sin guardar?'; return; } close(); }
    else if (a === 'del') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: eliminar'; return; } const old = n.manos.slice(); n.manos.splice(idx, 1); n.updatedAt = nowISO(); if (!(await hwPersist(n, b))) { n.manos = old; return; } close(); render(); toast('Hoja eliminada.'); }
    else if (a === 'save') {
      if (!page.trazos.length && !orig) { close(); return; }
      page.at = nowISO(); const old = (n.manos || []).slice(); n.manos = old.slice();
      if (idx >= 0) n.manos[idx] = page; else n.manos.push(page);
      n.updatedAt = nowISO();
      if (JSON.stringify(n).length > 1_800_000) { n.manos = old; toast('La nota quedó muy grande: cree una nota nueva para seguir escribiendo a mano.'); return; }
      if (!(await hwPersist(n, b))) { n.manos = old; return; }
      close(); render(); toast('Hoja guardada.');
    }
  });
  host.querySelector('[data-hw-bg]').onchange = e => { page.fondo = e.target.value; T.changed = true; redraw(); };
  host.querySelector('[data-hw-pen]').onchange = e => { T.penOnly = e.target.checked; };
  host.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); host.querySelector(e.shiftKey ? '[data-hw-do="redo"]' : '[data-hw-do="undo"]').click(); } });
  addEventListener('resize', size); size();
}
/* Guarda la nota (nueva o existente) después de agregar o quitar una hoja. */
async function hwPersist(n, b) {
  await pnChain; clearTimeout(pnTimer); pnPending = false;
  const isNew = !S.pnotes.includes(n); if (isNew) { S.pnotes.push(n); S.pn.draft = null; }
  if (await persist([n], b)) return true;
  if (isNew) { S.pnotes = S.pnotes.filter(x => x !== n); S.pn.draft = n; }
  return false;
}

