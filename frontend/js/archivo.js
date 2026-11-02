/* Archivo: adjuntos, solicitudes de copia, exportación e historia en papel. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Archivo: adjuntos, solicitudes de copia y exportación ===== */
const FILE_CATS = ['Remisión u orden médica', 'Resultado de prueba o examen', 'Documento firmado en papel', 'Autorización', 'Informe de otro terapeuta', 'Otro'];
const SOL_CALIDAD = ['Consultante', 'Representante legal o acudiente', 'Tercero autorizado por el consultante', 'Autoridad judicial o de salud', 'Familiar de consultante fallecido'];
const SOL_MEDIO = ['Correo electrónico', 'Copia impresa', 'Medio digital (USB u otro)'];
const FILE_TYPES = { 'application/pdf': 'PDF', 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WEBP' };
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const addBusinessDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return dayKey(d); };
function lastAttention(p) {
  const l = [];
  if (p.intake && p.intake.signedAt) l.push(p.intake.sessionAt);
  S.notes.forEach(n => { if (n.patientId === p.id && n.signedAt) l.push(n.sessionAt); });
  S.appts.forEach(a => { if (a.patientId === p.id && a.estado === 'Atendida') l.push(a.startAt); });
  (p.cierres || []).forEach(c => l.push(c.fecha + 'T12:00:00'));
  (p.incorporaciones || []).forEach(c => { if (c.hasta) l.push(c.hasta + 'T12:00:00'); });
  return l.filter(Boolean).sort().pop() || '';
}
function tabArchivo(p) {
  const fs = S.files.filter(f => f.patientId === p.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const undo = f => !(f.incorporacion && (p.incorporaciones || []).some(c => c.id === f.incorporacion)) && !(p.consents || []).some(c => c.soporte && c.soporte.id === f.id) && Date.now() - new Date(f.uploadedAt).getTime() < 14 * 60000;
  const files = S.mode !== 'server' ? '<div class="banner">Los adjuntos solo están disponibles cuando la app funciona con el servidor.</div>' : `
    <div class="card" id="fileform"><div class="grid"><div class="fld wide"><label for="f_upfile">Archivo (PDF hasta 8 MB, o imagen PNG, JPG o WEBP). Se comprime al subir, sin perder legibilidad.</label><input type="file" id="f_upfile" accept="application/pdf,image/png,image/jpeg,image/webp"></div>
    ${F('Tipo de documento', 'categoria', FILE_CATS[0], { type: 'select', opts: FILE_CATS })}${F('Descripción (opcional)', 'descripcion', '')}</div>
    <div class="row end"><span class="lock-note" style="margin-right:auto;text-align:left">Un adjunto no se puede modificar. Solo se puede quitar en los 15 minutos siguientes a subirlo, por si hubo un error.</span><button class="btn pri" data-act="uploadFile">Subir adjunto</button></div></div>
    ${fs.map(f => `<div class="card"><div class="row" style="justify-content:space-between"><b style="overflow-wrap:anywhere">${esc(f.nombre)}</b><span class="chip">${esc(FILE_TYPES[f.mime] || '')} · ${esc(fmtSize(f.size))}</span></div>
      <span class="ts">${esc(f.categoria)} · subido ${esc(fmtShort(f.uploadedAt))}${f.descripcion ? ' · ' + esc(f.descripcion) : ''}</span>
      <div class="row"><button class="btn sm pri" data-act="openFile" data-id="${f.id}">Ver</button><button class="btn sm" data-act="openFile" data-id="${f.id}" data-dl="1">Descargar</button>${undo(f) ? `<button class="btn sm warn" data-act="delFile" data-id="${f.id}">Quitar (error de carga)</button>` : ''}</div></div>`).join('') || '<p style="margin:0;color:var(--muted)">Aún no hay adjuntos.</p>'}`;
  const sols = (p.solicitudes || []).map((r, i) => [r, i]).reverse();
  const today = dayKey(new Date());
  const solList = sols.map(([r, i]) => { const lim = addBusinessDays(r.fecha, 10), late = !r.entrega && today > lim;
    return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(r.solicitante)}</b><span class="chip ${r.entrega ? 'ok' : late ? 'danger' : 'warn'}">${r.entrega ? 'Entregada' : late ? 'Vencida' : 'Pendiente'}</span></div>
    <span class="ts">${esc(r.calidad)}${r.documento ? ' · doc. ' + esc(r.documento) : ''} · solicitada ${esc(fmtD(r.fecha))}${r.entrega ? ' · entregada ' + esc(fmtD(r.entrega.fecha)) + ' por ' + esc(r.entrega.medio.toLowerCase()) : ' · responder a más tardar el ' + esc(fmtD(lim))}</span>
    ${r.observaciones ? `<p>${esc(r.observaciones)}</p>` : ''}
    <div class="row"><button class="btn sm" data-act="exportZip">Descargar copia (ZIP)</button>${r.entrega ? '' : `<button class="btn sm pri" data-act="deliverSol" data-i="${i}">Registrar entrega</button>`}</div></div>`; }).join('');
  const solForm = S.newSol ? `<div class="card" id="solform"><h3>Nueva solicitud de copia</h3><div class="grid">
    ${F('Fecha de la solicitud', 'fecha', today, { type: 'date' })}${F('Quién la solicita', 'calidad', SOL_CALIDAD[0], { type: 'select', opts: SOL_CALIDAD })}${F('Nombre del solicitante', 'solicitante', fullName(p))}${F('Documento del solicitante', 'documento', p.documento || '')}
    ${F('Medio de entrega preferido', 'medio', SOL_MEDIO[0], { type: 'select', opts: SOL_MEDIO })}${F('Observaciones (alcance, dirección de envío…)', 'observaciones', '', { type: 'area', rows: 2, wide: true })}</div>
    <label class="check"><input type="checkbox" id="f_verifica" data-f="verificado"> <span>Verifiqué la identidad del solicitante y, si no es el consultante, el soporte que lo autoriza (poder, autorización escrita, orden judicial, registro de defunción y parentesco).</span></label>
    <div class="row end"><button class="btn" data-act="cancelSol">Cancelar</button><button class="btn pri" data-act="saveSol">Registrar solicitud</button></div></div>` : '';
  const last = lastAttention(p);
  return `${incorpHTML(p)}<div class="sec"><h3>Adjuntos</h3>${files}</div>
  <div class="sec"><div class="row" style="justify-content:space-between"><h3 style="flex:1">Solicitudes de copia de la historia</h3>${S.newSol ? '' : '<button class="btn" data-act="newSol">Registrar solicitud</button>'}</div>
  <p style="margin:0;font-size:13px;color:var(--muted)">La ficha es reservada: solo se entrega al consultante, a su representante, a terceros con autorización del consultante y a las autoridades cuando corresponda. El plazo que se muestra es de 10 días hábiles (sin descontar festivos).</p>
  ${solForm}${solList || (S.newSol ? '' : '<p style="margin:0;color:var(--muted)">No hay solicitudes registradas.</p>')}</div>
  <div class="sec"><h3>Exportación</h3><dl class="kv"><dt>Última atención</dt><dd>${last ? esc(fmtD(last)) : 'Sin atenciones firmadas'}</dd></dl>
  <p style="margin:0;font-size:13px;color:var(--muted)">La copia completa incluye consentimientos, primera vez, sesiones, informes, cierres y adjuntos. Sirve para entregar copia al consultante o para trasladar la historia si deja de usar esta plataforma.</p>
  <div class="row"><button class="btn pri" data-act="exportZip">Descargar historia completa (ZIP)</button></div></div>
  <details class="sec"><summary class="sum">Eliminar el expediente</summary>${hasDocs(p) ? '<p style="margin:0;font-size:13px;color:var(--muted)">Este expediente tiene documentos firmados, así que no se puede eliminar: conviene conservar el expediente. Si el proceso terminó, use la pestaña «Cierre».</p>' : '<p style="margin:0;font-size:13px;color:var(--muted)">Como este consultante aún no tiene documentos firmados, puede eliminar su registro (por ejemplo, si lo creó por error). Se borra del servidor y no se puede recuperar.</p><div class="row"><button class="btn warn" data-act="delPatient">Eliminar consultante</button></div>'}</details>`;
}
ACT.uploadFile = async b => {
  const p = curPatient(), inp = $('#f_upfile'), f = inp && inp.files[0], o = readForm($('#fileform'), {});
  if (!f) { toast('Elija un archivo.'); return; }
  if (!FILE_TYPES[f.type]) { toast('Solo se admiten PDF, PNG, JPG o WEBP.'); return; }
  if (upTooBig(f)) { toast('El archivo supera ' + (/^image\//.test(f.type) ? '40' : '8') + ' MB.'); return; }
  const id = newId('f'); b.disabled = true; b.textContent = 'Comprimiendo…';
  try {
    const up = await shrinkImage(f);
    if (up.size > MAX_UP) throw new Error('el archivo sigue superando 8 MB');
    b.textContent = 'Subiendo…';
    const j = await uploadBlob(id, up);
    const rec = { id, kind: 'file', patientId: p.id, nombre: up.name.slice(0, 200), mime: up.type, size: j.size, sizeOriginal: f.size, sha256: j.sha256, categoria: o.categoria, descripcion: o.descripcion, uploadedAt: nowISO(), therapistName: S.profile.nombre };
    await Store.save(rec, { strict: true }); S.files.push(rec); toast('Adjunto guardado' + savedNote(f.size, j.size) + '.'); render();
  } catch (e) { toast('No se pudo subir: ' + e.message); b.disabled = false; b.textContent = 'Subir adjunto'; }
};
async function fetchBlob(id) {
  const r = await fetch('/api/blobs/' + encodeURIComponent(id), { credentials: 'same-origin', headers: { 'X-Requested-With': 'archivo-clinico' } });
  if (!r.ok) throw new Error(r.status === 404 ? 'El archivo no está en el servidor.' : 'Error ' + r.status);
  return r.blob();
}
ACT.openFile = async b => {
  const f = S.files.find(x => x.id === b.dataset.id);
  const w = b.dataset.dl ? null : window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await fetchBlob(f.id));
    if (w) w.location.href = url; else { const a = document.createElement('a'); a.href = url; a.download = f.nombre; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { if (w) w.close(); toast(e.message); }
};
ACT.delFile = b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: quitar adjunto'; return; }
  const id = b.dataset.id; S.files = S.files.filter(f => f.id !== id); Store.remove(id); toast('Adjunto quitado.'); render();
};
ACT.newSol = () => { S.newSol = true; render(); };
ACT.cancelSol = () => { S.newSol = false; render(); };
ACT.saveSol = async b => {
  const p = curPatient(), o = readForm($('#solform'), {});
  if (!o.solicitante || !o.fecha) { toast('Indique el solicitante y la fecha.'); return; }
  if (!o.verificado) { toast('Confirme que verificó la identidad y la autorización del solicitante.'); return; }
  const snap = clone(p);
  p.solicitudes = (p.solicitudes || []).concat([{ id: newId('s'), fecha: o.fecha, calidad: o.calidad, solicitante: o.solicitante, documento: o.documento, medio: o.medio, observaciones: o.observaciones, verificado: true, registradoAt: nowISO(), registradoPor: S.profile.nombre }]);
  if (!(await persist([p], b))) { restore(p, snap); return; }
  S.newSol = false; toast('Solicitud registrada.'); render();
};
ACT.deliverSol = b => {
  const p = curPatient(), i = +b.dataset.i, r = p.solicitudes[i], root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Registrar entrega"><div class="box" id="entform" style="width:min(520px,100%)"><div class="row" style="justify-content:space-between"><h3>Registrar entrega</h3><button class="btn sm" id="encl">Cerrar</button></div>
  <p style="margin:0">Copia solicitada por <b>${esc(r.solicitante)}</b> el ${esc(fmtD(r.fecha))}.</p>
  <div class="grid">${F('Fecha de entrega', 'fecha', dayKey(new Date()), { type: 'date' })}${F('Medio', 'medio', r.medio || SOL_MEDIO[0], { type: 'select', opts: SOL_MEDIO })}${F('Observaciones (opcional)', 'nota', '', { type: 'area', rows: 2, wide: true })}</div>
  <p class="lock-note">La entrega queda registrada y no se puede modificar.</p><div class="row end"><button class="btn pri" id="ensave">Registrar entrega</button></div></div></div>`;
  $('#encl').onclick = () => { root.innerHTML = ''; };
  $('#ensave').onclick = async () => {
    const o = readForm($('#entform'), {}); if (!o.fecha) { toast('Indique la fecha.'); return; }
    p.solicitudes[i] = Object.assign({}, r, { entrega: { fecha: o.fecha, medio: o.medio, nota: o.nota, registradoAt: nowISO(), registradoPor: S.profile.nombre } });
    if (!(await persist([p], $('#ensave')))) { p.solicitudes[i] = r; return; }
    root.innerHTML = ''; toast('Entrega registrada.'); render();
  };
};
ACT.revokeConsent = b => {
  const p = curPatient(), i = +b.dataset.i, c = p.consents[i], root = $('#modal-root');
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Revocación"><div class="box" id="revform" style="width:min(640px,100%)"><div class="row" style="justify-content:space-between"><h3>Revocación del consentimiento</h3><button class="btn sm" id="rvcl">Cerrar</button></div>
  <p style="margin:0;font-size:14px">Consentimiento de ${esc(c.tipo || 'atención presencial').toLowerCase()} firmado el ${esc(fmtD(c.signedAt))}.</p>
  <div class="grid">${F('Fecha', 'fecha', dayKey(new Date()), { type: 'date' })}${F('Alcance', 'alcance', 'Total', { type: 'select', opts: ['Total', 'Parcial'] })}${F('Detalle (si es parcial)', 'detalle', '', { ph: 'Ej.: no autoriza la atención por videollamada' })}
  ${F('Firma quien', 'signerType', c.signerType || 'Consultante', { type: 'select', opts: ['Consultante', 'Acudiente'] })}${F('Nombre del firmante', 'signerName', c.signerName)}${F('Documento', 'signerDoc', c.signerDoc || '')}${F('Motivo expresado (opcional)', 'motivo', '', { type: 'area', rows: 2, wide: true })}</div>
  <p style="margin:0;font-size:13px">${esc(REVOC_NOTE)}</p>
  <div class="fld"><span class="lbl">Firma de quien revoca</span><div class="sigbox" id="rvsig"></div><div class="row"><button class="btn sm" id="rvclr">Borrar firma</button></div></div>
  <p class="lock-note">La revocación queda firmada y no se puede modificar.</p><div class="row end"><button class="btn pri" id="rvsave">Firmar revocación</button></div></div></div>`;
  const pad = makePad($('#rvsig'), 'revSig');
  $('#rvclr').onclick = () => pad.clear(); $('#rvcl').onclick = () => { root.innerHTML = ''; };
  $('#rvsave').onclick = async () => {
    const o = readForm($('#revform'), {});
    if (!o.signerName || !o.fecha) { toast('Indique la fecha y el nombre de quien revoca.'); return; }
    if (o.alcance === 'Parcial' && !o.detalle) { toast('Describa el alcance de la revocación parcial.'); return; }
    if (pad.isEmpty()) { toast('Falta la firma de quien revoca.'); return; }
    p.consents[i] = Object.assign({}, c, { revocacion: Object.assign(o, { signerSig: pad.data(), signedAt: nowISO() }, therSnap()) });
    if (!(await persist([p], $('#rvsave')))) { p.consents[i] = c; return; }
    root.innerHTML = '';
    toast(o.alcance === 'Total' ? 'Revocación registrada. Si el proceso termina, registre la nota de cierre.' : 'Revocación parcial registrada.'); render();
  };
};

/* ===== Historia en papel: incorporar documentos antiguos escaneados =====
   Los escaneos se suben como adjuntos y el terapeuta firma una constancia con la fecha y hora del servidor
   y la huella SHA-256 de cada archivo, para poder demostrar después que no fueron cambiados. */
async function sha256Hex(file) {
  try { const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { return ''; }
}
/* Sube un adjunto. Las imágenes se reducen antes (máximo 2400 px de lado, JPEG de alta calidad) y el servidor
   optimiza los PDF y guarda todo comprimido. Devuelve tamaño y huella SHA-256 del archivo tal como queda guardado. */
async function uploadBlob(id, file) {
  const r = await fetch('/api/blobs/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-Requested-With': 'archivo-clinico' }, body: file });
  if (!r.ok) { let m = 'Error ' + r.status; try { m = (await r.json()).detail || m; } catch (e) { /* sin cuerpo */ } const err = new Error(m); err.status = r.status; throw err; }
  try { return await r.json(); } catch (e) { return { size: file.size, sha256: await sha256Hex(file) }; }
}
const IMG_MAX = 2400, IMG_Q = 0.85;
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', IMG_Q));
    if (!blob || blob.size > file.size * 0.9) return file;
    return new File([blob], file.name.replace(/\.(png|jpe?g|webp)$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) { return file; }
}
/* Tipos y tamaños: las imágenes grandes se aceptan porque se reducen antes de subir. */
const MAX_UP = 8 * 1048576, MAX_IMG_IN = 40 * 1048576;
const upTooBig = f => f.size > (/^image\//.test(f.type) ? MAX_IMG_IN : MAX_UP);
const savedNote = (orig, size) => orig > size * 1.1 ? ` (comprimido de ${fmtSize(orig)} a ${fmtSize(size)})` : '';
function docIncorp(p, c) {
  const pr = { nombre: c.therapistName, registro: c.therapistReg, consultorio: c.consultorio };
  return `<div class="docpage">${letterhead(pr)}<h2>Constancia de incorporación de ficha en físico</h2>${patientTable(p)}
  <p>El ${esc(fmtDT(c.signedAt))} incorporé a la ficha electrónica de ${esc(fullName(p))} la copia digitalizada, mediante escaneo, de los documentos en físico que se relacionan a continuación.</p>
  <table><tr><td><b>Periodo de atención que cubren</b></td><td>${esc([c.desde && fmtD(c.desde), c.hasta && fmtD(c.hasta)].filter(Boolean).join(' a ') || 'No indicado')}</td></tr>
  <tr><td><b>Elaborados por</b></td><td>${esc(c.autor || '')}</td></tr><tr><td><b>Folios en físico</b></td><td>${esc(c.folios || 'No indicado')}</td></tr>
  <tr><td><b>Ubicación de los originales</b></td><td>${esc(c.originales || '')}</td></tr></table>
  <h2>Archivos digitalizados</h2><table>${c.archivos.map((f, i) => `<tr><td>${i + 1}. ${esc(f.nombre)} (${esc(fmtSize(f.size))})</td><td style="font-family:monospace;font-size:11px;word-break:break-all">${f.sha256 ? 'SHA-256: ' + esc(f.sha256) : ''}</td></tr>`).join('')}</table>
  ${c.observaciones ? `<p><b>Observaciones.</b> ${esc(c.observaciones)}</p>` : ''}
  <p>Declaro que las copias digitales corresponden fielmente a los documentos originales. La huella SHA-256 de cada archivo permite comprobar que no ha sido modificado desde su incorporación.</p>
  ${sigBlock([therSig(c, c.signedAt)])}</div>`;
}
function incorpHTML(p) {
  if (S.mode !== 'server') return '';
  const list = (p.incorporaciones || []).map((c, i) => [c, i]).reverse().map(([c, i]) => `<div class="card"><div class="row" style="justify-content:space-between"><b>Constancia del ${esc(fmtD(c.signedAt))}</b><span class="chip ok">Firmada</span></div>
    <span class="ts">${c.archivos.length} archivo${c.archivos.length > 1 ? 's' : ''}${c.desde || c.hasta ? ' · atenciones ' + esc([c.desde && fmtD(c.desde), c.hasta && fmtD(c.hasta)].filter(Boolean).join(' a ')) : ''}${c.folios ? ' · ' + esc(c.folios) + ' folios' : ''}</span>
    <div class="row"><button class="btn sm pri" data-act="viewIncorp" data-i="${i}">Ver constancia</button>${c.archivos.map(f => `<button class="btn sm" data-act="openFile" data-id="${esc(f.id)}">${esc(f.nombre.length > 28 ? f.nombre.slice(0, 26) + '…' : f.nombre)}</button>`).join('')}</div></div>`).join('');
  const form = S.newIncorp ? `<div class="card" id="incform"><h3>Incorporar historia en papel</h3>${sigNeeded()}
    <div class="fld"><label for="in_files">Archivos escaneados (PDF hasta 8 MB o imágenes; puede elegir varios). Se comprimen al subir, sin perder legibilidad.</label><input type="file" id="in_files" multiple accept="application/pdf,image/png,image/jpeg,image/webp"></div>
    <div class="grid">${F('Fecha de la primera atención', 'desde', '', { type: 'date' })}${F('Fecha de la última atención', 'hasta', '', { type: 'date' })}${F('Elaborados por', 'autor', S.profile.nombre || '')}${F('Número de folios en físico', 'folios', '', { type: 'number' })}
    ${F('Ubicación o destino de los originales', 'originales', 'Archivo físico del consultorio', { wide: true })}${F('Observaciones (opcional)', 'observaciones', '', { type: 'area', rows: 2, wide: true })}</div>
    <label class="check"><input type="checkbox" id="in_fiel" data-f="fiel"> <span>Declaro que las copias digitales corresponden fielmente a los documentos originales.</span></label>
    <p class="lock-note">Se firmará una constancia con la fecha y hora de hoy y la huella de cada archivo. No se podrá modificar.</p>
    <div class="row end"><button class="btn" data-act="cancelIncorp">Cancelar</button><button class="btn pri" data-act="saveIncorp">Subir y firmar constancia</button></div></div>` : '';
  return `<div class="sec"><div class="row" style="justify-content:space-between"><h3 style="flex:1">Historia en papel</h3>${S.newIncorp ? '' : '<button class="btn" data-act="newIncorp">Incorporar documentos en físico</button>'}</div>
  ${list || S.newIncorp ? '' : '<p style="margin:0;font-size:13px;color:var(--muted)">Si este consultante tiene ficha en papel de antes de usar la app, escanéela y súbala aquí. Queda una constancia firmada de la fecha en que se incorporó.</p>'}${form}${list}</div>`;
}
ACT.newIncorp = () => { S.newIncorp = true; render(); };
ACT.cancelIncorp = () => { S.newIncorp = false; render(); };
ACT.viewIncorp = b => { const p = curPatient(), c = p.incorporaciones[+b.dataset.i]; showDoc('Constancia de incorporación · ' + fullName(p), docIncorp(p, c), 'constancia-incorporacion-' + slug(fullName(p)) + '-' + dayKey(new Date(c.signedAt)) + '.html'); };
ACT.saveIncorp = async b => {
  const p = curPatient(), files = [...($('#in_files').files || [])], o = readForm($('#incform'), {});
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
  if (!files.length) { toast('Elija los archivos escaneados.'); return; }
  if (files.length > 30) { toast('Máximo 30 archivos por constancia.'); return; }
  const badf = files.find(f => !FILE_TYPES[f.type] || upTooBig(f));
  if (badf) { toast('«' + badf.name + '» no es PDF o imagen, o es demasiado grande (PDF hasta 8 MB, imágenes hasta 40 MB).'); return; }
  if (o.desde && o.hasta && o.desde > o.hasta) { toast('La primera atención no puede ser posterior a la última.'); return; }
  if (!o.fiel) { toast('Marque la declaración de que las copias corresponden a los originales.'); return; }
  const incId = newId('i'), recs = [];
  setBusy(b, true);
  try {
    for (const [n, f] of files.entries()) {
      b.textContent = `Subiendo ${n + 1} de ${files.length}…`;
      const id = newId('f'), up = await shrinkImage(f);
      if (up.size > MAX_UP) throw new Error('«' + f.name + '» sigue superando 8 MB.');
      const j = await uploadBlob(id, up), sha = j.sha256;
      const rec = { id, kind: 'file', patientId: p.id, nombre: up.name.slice(0, 200), mime: up.type, size: j.size, sizeOriginal: f.size, categoria: 'Ficha en físico (digitalizada)', descripcion: 'Incorporada con constancia firmada', uploadedAt: nowISO(), sha256: sha, incorporacion: incId, therapistName: S.profile.nombre };
      await Store.save(rec, { strict: true }); S.files.push(rec); recs.push(rec);
    }
    b.textContent = 'Firmando…';
    const snap = clone(p);
    p.incorporaciones = (p.incorporaciones || []).concat([Object.assign({ id: incId, archivos: recs.map(r => ({ id: r.id, nombre: r.nombre, size: r.size, sha256: r.sha256 })), desde: o.desde, hasta: o.hasta, autor: o.autor, folios: o.folios, originales: o.originales, observaciones: o.observaciones }, therSnap(), { signedAt: nowISO() })]);
    try { await Store.save(p, { strict: true }); } catch (e) { restore(p, snap); throw e; }
  } catch (e) {
    setBusy(b, false); saveError(e);
    if (recs.length) toast(recs.length + ' archivo(s) quedaron subidos como adjuntos sin constancia. Puede quitarlos en los próximos 15 minutos desde «Adjuntos».');
    render(); return;
  }
  setBusy(b, false); S.newIncorp = false; toast('Documentos incorporados y constancia firmada.'); render();
};

/* ZIP sin compresión (método «store»), suficiente para PDF e imágenes que ya vienen comprimidos. */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : enc.encode(f.data), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
ACT.exportZip = b => { const p = curPatient(); chooseParts(p, 'Descargar historia (ZIP)', sin => buildZip(b, p, sin)); };
async function buildZip(b, p, sin) {
  const name = slug(fullName(p)), stamp = dayKey(new Date());
  const old = b.textContent; b.disabled = true; b.textContent = 'Preparando…';
  try {
    const files = [{ name: 'historia-clinica-' + name + '.html', data: standalone('Ficha · ' + fullName(p), docFull(p, sin)) }];
    const used = new Set();
    for (const f of sin.includes('anexos') ? [] : S.files.filter(x => x.patientId === p.id)) {
      let fn = 'anexos/' + dayKey(new Date(f.uploadedAt)) + '-' + f.nombre.replace(/[\\/:*?"<>|]+/g, '_');
      while (used.has(fn)) fn = fn.replace(/(\.[^.]*)?$/, '-1$1'); used.add(fn);
      files.push({ name: fn, data: new Uint8Array(await (await fetchBlob(f.id)).arrayBuffer()) });
    }
    files.push({ name: 'LEAME.txt', data: `Copia de la ficha de ${fullName(p)}\nGenerada el ${fmtDT(nowISO())} por ${S.profile.nombre || ''}.\n\nAbra el archivo .html en un navegador; desde allí puede imprimirlo o guardarlo como PDF.\nLa carpeta «anexos» contiene los documentos adjuntos.\n\nInformación reservada. Entréguela solo a quien tiene derecho a recibirla.\n` });
    const zip = makeZip(files), url = URL.createObjectURL(zip), a = document.createElement('a');
    a.href = url; a.download = 'historia-clinica-' + name + (sin.length ? '-parcial' : '') + '-' + stamp + '.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (S.mode === 'server') api('/audit/export', { method: 'POST', body: { patientId: p.id } }).catch(() => { });
    toast('Historia descargada.');
  } catch (e) { toast('No se pudo preparar la copia: ' + e.message); }
  b.disabled = false; b.textContent = old;
};

