/* Firma de consentimientos a distancia. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Firma de consentimientos a distancia ===== */
function remoteEvidence(c) {
  const m = c.remoto;
  return `<p style="font-size:12px"><b>Firma a distancia.</b> El profesional envió este documento el ${esc(fmtDT(m.enviadoAt))} mediante un enlace personal. ${esc(m.verificacion || '')}, leyó el texto, declaró aceptarlo de forma libre y voluntaria y firmó el ${esc(fmtDT(m.firmadoAt))} (hora del servidor).${m.ip ? ' Dirección IP: ' + esc(m.ip) + '.' : ''}${m.navegador ? ' Dispositivo: ' + esc(m.navegador) + '.' : ''} Huella SHA-256 del texto: <span style="font-family:monospace;word-break:break-all">${esc(m.sha256)}</span>.</p>`;
}
async function firmasSync() {
  if (S.mode !== 'server' || TEAM()) return;
  try { S.firmas = await api('/firmas'); } catch (e) { return; }
  const have = new Set(S.patients.flatMap(p => (p.consents || []).map(c => c.remoto && c.remoto.id).filter(Boolean)));
  if (S.firmas.some(f => f.estado === 'firmado' && !have.has(f.ref)) && !S.dirty && !$('.modal')) {
    const pid = S.pid, tab = S.tab;
    try { await Store.load(); } catch (e) { return; }
    S.pid = pid; S.tab = tab; render(); toast('Llegó un consentimiento firmado a distancia.');
  }
}
setInterval(() => { if (S.user && S.mode === 'server' && (S.firmas || []).some(f => f.estado === 'pendiente') && !document.hidden) firmasSync(); }, 60000);
function remotePending(p) {
  const list = (S.firmas || []).filter(f => f.patientId === p.id && f.estado !== 'firmado' && f.estado !== 'anulado' && Date.now() - new Date(f.creado).getTime() < 30 * 864e5);
  return list.map(f => `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(f.tipo)}</b><span class="chip ${f.estado === 'pendiente' ? '' : 'warn'}">${f.estado === 'pendiente' ? 'Esperando la firma' : f.estado === 'vencido' ? 'Enlace vencido' : 'Enlace bloqueado'}</span></div>
    <span class="ts">Enviado para firmar a distancia el ${esc(fmtShort(f.creado))} a ${esc(f.signerName)}${f.estado === 'pendiente' ? ' · vence ' + esc(fmtShort(f.vence)) : ''}${f.correo ? ' · correo enviado' : ''}</span>
    <div class="row">${f.estado === 'pendiente' ? `<button class="btn sm pri" data-act="remoteResend" data-ref="${f.ref}">Enviar el enlace</button><button class="btn sm" data-act="firmasSync">Revisar si ya firmó</button>` : ''}<button class="btn sm warn" data-act="remoteCancel" data-ref="${f.ref}">${f.estado === 'pendiente' ? 'Anular' : 'Quitar'}</button></div></div>`).join('');
}
ACT.firmasSync = async () => { await firmasSync(); render(); };
function remoteMsg(p, f) {
  const who = (S.profile && S.profile.nombre) || 'su psicólogo(a)', first = (p.nombres || '').split(' ')[0];
  return `Hola${first ? ' ' + first : ''}, ${who} le envía el documento «${f.tipo}» para que lo lea y lo firme desde su celular: ${location.origin}/firmar?t=${f.enlace} Para abrirlo se le pedirá su número de documento. El enlace vence en 7 días.`;
}
function remoteModal(f) {
  const p = S.patients.find(x => x.id === f.patientId) || {}, root = $('#modal-root'), text = remoteMsg(p, f), ph = waPhone(p.telefono, p.telInd);
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Enviar consentimiento"><div class="box" style="max-width:560px"><h3>Enviar para firmar a distancia</h3>
  <p class="stnote">${esc(f.tipo)} · firma ${esc(f.signerName)}. El enlace es personal: para abrirlo, quien firma escribe su número de documento. Vence el ${esc(fmtShort(f.vence))}.</p>
  ${f.correoEnviado ? `<p class="chip ok">Enviado al correo del paciente</p>` : f.motivo ? `<p class="stnote">No se envió por correo: ${esc(f.motivo)}</p>` : ''}
  <div class="fld"><label for="rf_txt">Mensaje</label><textarea id="rf_txt" rows="5">${esc(text)}</textarea></div>
  <div class="row">${ph ? `<a class="btn pri" id="rf_wa" href="https://wa.me/${ph}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Abrir en WhatsApp</a>` : '<span class="chip warn">El paciente no tiene teléfono</span>'}${p.correo ? `<button class="btn" id="rf_mail">Enviar por correo</button>` : ''}<button class="btn" id="rf_copy">Copiar mensaje</button></div>
  <div class="row end"><button class="btn" id="rf_close">Listo</button></div></div></div>`;
  $('#rf_txt').oninput = () => { const w = $('#rf_wa'); if (w) w.href = `https://wa.me/${ph}?text=${encodeURIComponent($('#rf_txt').value)}`; };
  $('#rf_close').onclick = () => { root.innerHTML = ''; render(); };
  $('#rf_copy').onclick = async () => { try { await navigator.clipboard.writeText($('#rf_txt').value); toast('Mensaje copiado.'); } catch (e) { $('#rf_txt').select(); toast('Copie el mensaje seleccionado.'); } };
  if ($('#rf_mail')) $('#rf_mail').onclick = async () => {
    setBusy($('#rf_mail'), true);
    try { const r = await api('/firmas/' + f.ref + '/correo', { method: 'POST' }); if (r.correoEnviado) { toast('Enviado al correo del paciente.'); await firmasSync(); } else toast(r.motivo); }
    catch (e) { toast(e.message); } finally { const b = $('#rf_mail'); if (b) setBusy(b, false); }
  };
}
ACT.remoteConsent = async b => {
  const p = curPatient();
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
  const o = readForm($('#tabbody'), {});
  if (!o.signerName) { toast('Escriba el nombre de quien firma.'); return; }
  if (!o.signerDoc) { toast('Escriba el documento de quien firma: se le pedirá para abrir el enlace.'); return; }
  if (!(o.consentText || '').trim()) { toast('El documento está vacío.'); return; }
  setBusy(b, true);
  try {
    const tipoN = consentName(o.tipo || 'Atención presencial');
    for (const old of (S.firmas || []).filter(x => x.patientId === p.id && x.tipo === tipoN && x.estado === 'pendiente')) await api('/firmas/' + old.ref + '/anular', { method: 'POST' });  // un solo envío pendiente por documento
    const f = await api('/firmas', { method: 'POST', body: { patientId: p.id, tipo: tipoN, plantilla: o.tipo && o.tipo.startsWith('mio:') ? o.tipo.slice(4) : null, text: o.consentText, signerType: o.signerType || 'Paciente', signerName: o.signerName, signerDoc: o.signerDoc, correo: !!p.correo } });
    S.reconsent = false; S.consentPreset = null; S.dirty = false;
    if (p.consentDraft) { delete p.consentDraft; await persist([p]); }
    await firmasSync(); render(); remoteModal(f);
  } catch (e) { toast(e.message); } finally { setBusy(b, false); }
};
ACT.remoteResend = b => { const f = (S.firmas || []).find(x => x.ref === b.dataset.ref); if (f) remoteModal(f); };
ACT.remoteCancel = async b => {
  const f = (S.firmas || []).find(x => x.ref === b.dataset.ref); if (!f) return;
  if (f.estado === 'pendiente' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Anular el enlace? Clic otra vez'; return; }
  try { await api('/firmas/' + f.ref + '/anular', { method: 'POST' }); await firmasSync(); render(); toast(f.estado === 'pendiente' ? 'Enlace anulado: ya no sirve para firmar.' : 'Quitado.'); } catch (e) { toast(e.message); }
};
ACT.newDataAuth = () => { S.reconsent = true; S.consentPreset = DATA_TIPO; render(); };
ACT.reConsent = () => { S.reconsent = true; S.consentPreset = null; render(); };
ACT.cancelRe = () => { S.reconsent = false; S.consentPreset = null; render(); };
ACT.viewConsent = b => { const p = curPatient(), c = p.consents[+(b && b.dataset.i !== undefined ? b.dataset.i : p.consents.length - 1)]; showDoc('Consentimiento informado · ' + fullName(p), docConsent(p, c), 'consentimiento-' + slug(fullName(p)) + '.html'); };
/* Borrador temporal: guarda lo escrito (sin firmas ni aceptación) para continuar después; no es un consentimiento. */
ACT.saveConsentDraft = async b => {
  const p = curPatient(), o = readForm($('#tabbody'), {}), snap = clone(p);
  p.consentDraft = { tipo: o.tipo, consentText: o.consentText, signerType: o.signerType, signerName: o.signerName, signerDoc: o.signerDoc, copia: o.copia, savedAt: nowISO() };
  if (!(await persist([p], b))) { restore(p, snap); return; }
  S.dirty = false; toast('Borrador guardado. Aún no es un consentimiento firmado.'); render();
};
ACT.signConsent = async b => {
  const p = curPatient();
  if (!canSign()) { toast('Primero guarde su nombre y firma en «Mi perfil y firma».'); return; }
  const o = readForm($('#tabbody'), {});
  if (!$('#c_ok').checked) { toast('Marque la confirmación de lectura y aceptación.'); return; }
  if (!o.copia) { toast('Indique si se le entregó copia al usuario.'); const f = $('#f_copia'); if (f) { f.closest('.fld').classList.add('miss'); f.focus(); } return; }
  const rec = { tipo: consentName(o.tipo || 'Atención presencial'), plantilla: o.tipo && o.tipo.startsWith('mio:') ? o.tipo.slice(4) : undefined, text: o.consentText, copia: o.copia };
  if ($('#repsblock')) {
    if (!o.r1Name) { toast('Escriba el nombre del representante legal 1.'); return; }
    if (pads.consentSig.isEmpty()) { toast('Falta la firma del representante legal 1.'); return; }
    const second = !pads.consentSig2.isEmpty();
    if (second && !o.r2Name) { toast('Escriba el nombre del representante legal 2.'); return; }
    if (!second && !o.sinFirma2) { toast('Falta la firma del representante legal 2, o explique por qué no firma.'); return; }
    const sop = $('#f_soporte') && $('#f_soporte').files[0];
    if (!second && $('#f_soporte') && !sop) { toast('Con un solo representante debe adjuntar el documento notarial o de soporte.'); return; }
    if (!second && sop && (!FILE_TYPES[sop.type] || upTooBig(sop))) { toast('El soporte debe ser PDF (máximo 8 MB) o imagen (máximo 40 MB).'); return; }
    if (o.as_firma && pads.assentSig.isEmpty()) { toast('Falta la firma del menor, o desmarque la casilla del asentimiento.'); return; }
    Object.assign(rec, { signerType: 'Acudiente', signerName: o.r1Name, signerDoc: o.r1Doc, signerParentesco: o.r1Par, signerSig: pads.consentSig.data(),
      signer2Name: second ? o.r2Name : undefined, signer2Doc: second ? o.r2Doc : undefined, signer2Parentesco: second ? o.r2Par : undefined, signer2Sig: second ? pads.consentSig2.data() : undefined,
      sinFirma2: second ? undefined : o.sinFirma2,
      asentimiento: { nombre: fullName(p), estado: o.as_firma ? 'El menor firma el asentimiento' : 'El menor no firmó el asentimiento', valoracion: o.as_obs || '', firma: o.as_firma ? pads.assentSig.data() : '' } });
  } else {
    if (!o.signerName) { toast('Escriba el nombre del firmante.'); return; }
    if (pads.consentSig.isEmpty()) { toast('Falta la firma del paciente o acudiente.'); return; }
    Object.assign(rec, { signerType: o.signerType, signerName: o.signerName, signerDoc: o.signerDoc, signerSig: pads.consentSig.data() });
  }
  const sopFile = rec.sinFirma2 && $('#f_soporte') && $('#f_soporte').files[0];
  if (sopFile) {
    setBusy(b, true); b.textContent = 'Subiendo soporte…';
    try {
      const id = newId('f'), up = await shrinkImage(sopFile);
      if (up.size > MAX_UP) throw new Error('El soporte supera 8 MB.');
      const j = await uploadBlob(id, up), sha = j.sha256;
      const fr = { id, kind: 'file', patientId: p.id, nombre: up.name.slice(0, 200), mime: up.type, size: j.size, sizeOriginal: sopFile.size, categoria: 'Soporte de representación legal', descripcion: 'Soporte de la firma de un solo representante', uploadedAt: nowISO(), sha256: sha, soporteConsent: true, therapistName: S.profile.nombre };
      await Store.save(fr, { strict: true }); S.files.push(fr);
      rec.soporte = { id, nombre: fr.nombre, size: fr.size, sha256: sha };
    } catch (e) { setBusy(b, false); saveError(e); return; }
    setBusy(b, false);
  }
  const snap = clone(p);
  p.consents = p.consents || [];
  p.consents.push(Object.assign(rec, { signedAt: nowISO() }, therSnap()));
  delete p.consentDraft;
  if (!(await persist([p], b))) { restore(p, snap); if (sopFile) toast('El soporte quedó como adjunto sin consentimiento; puede quitarlo en los próximos 15 minutos desde Archivo.'); return; }
  S.reconsent = false; S.consentPreset = null; toast('Documento firmado y guardado.'); render();
};
/* Mis consentimientos: modelos propios del terapeuta (adultos, familia, niños…). */
ACT.consentManage = () => {
  const root = $('#modal-root');
  const draw = edit => {
    const list = myConsents();
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis consentimientos"><div class="box" id="cmform"><div class="row" style="justify-content:space-between"><h3>Mis formatos</h3><button class="btn sm" data-cm="close">Cerrar</button></div>${hubTabs('consent')}
    ${edit ? `${F('Nombre del modelo', 'nombre', edit.nombre || '', { ph: 'Ej.: Consentimiento para niños' })}
      <div class="fld"><label for="f_texto">Texto</label>${richBar('f_texto')}<textarea id="f_texto" data-f="texto" rows="16" style="font-family:var(--f-doc);font-size:15px">${esc(edit.texto || '')}</textarea></div>
      <div class="fld"><span class="lbl">Insertar dato en el cursor (se llena solo con los datos de cada paciente)</span><div class="row">${CONSENT_VARS.map(([k, l]) => `<button type="button" class="btn sm" data-var="${k}" title="{${k}}">${esc(l)}</button>`).join('')}</div></div>
      <details class="sec"><summary>Vista previa con un paciente</summary><div class="row" style="margin-top:6px"><select id="cm_pv" aria-label="Paciente para la vista previa">${S.patients.map(x => `<option value="${x.id}" ${x.id === S.pid ? 'selected' : ''}>${esc(fullName(x))}</option>`).join('') || '<option value="">(sin pacientes)</option>'}</select><button type="button" class="btn sm" data-cm="pv">Ver</button></div><div id="cm_pvout" class="doc-prev" style="white-space:pre-wrap;font-family:var(--f-doc);margin-top:8px"></div></details>
      <div class="row"><button class="btn sm" data-cm="base">Cargar el texto base</button><button class="btn sm" data-cm="tele">Agregar cláusulas de telepsicología</button></div>
      <div class="row end"><button class="btn" data-cm="list">Volver</button><button class="btn pri" data-cm="save" data-id="${esc(edit.id || '')}">Guardar modelo</button></div>`
    : `${list.map(c => `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(c.nombre)}</b><span class="row"><button class="btn sm" data-cm="edit" data-id="${esc(c.id)}">Editar</button><button class="btn sm warn" data-cm="del" data-id="${esc(c.id)}">Quitar</button></span></div></div>`).join('') || '<p style="margin:0;color:var(--muted)">Aún no tiene modelos propios. Puede crear uno por tipo de atención: adultos, familia, niños, pareja…</p>'}
      <p style="margin:0;font-size:13px;color:var(--muted)">Editar o quitar un modelo no cambia los consentimientos ya firmados.</p><div class="row end"><button class="btn pri" data-cm="new">Nuevo modelo</button></div>`}</div></div>`;
  };
  draw(null);
  root.onclick = async e => {
    const v = e.target.closest('[data-var]');
    if (v) { const ta = $('#f_texto'); ta.focus(); ta.setRangeText('{' + v.dataset.var + '}', ta.selectionStart, ta.selectionEnd, 'end'); return; }
    const b = e.target.closest('[data-cm]'); if (!b) return;
    const a = b.dataset.cm, list = myConsents();
    if (a === 'pv') { const px = S.patients.find(x => x.id === $('#cm_pv').value); $('#cm_pvout').innerHTML = px ? fmtRich(fillTpl($('#f_texto').value, px, S.profile)) : 'Cree un paciente para ver la vista previa.'; return; }
    if (a === 'close') { root.innerHTML = ''; root.onclick = null; if (S.tab === 'consent' && !S.dirty) render(); else hubClosed(); return; }
    if (a === 'list') return draw(null);
    if (a === 'new') return draw({});
    if (a === 'edit') return draw(list.find(c => c.id === b.dataset.id));
    if (a === 'base') { $('#f_texto').value = DEFAULT_CONSENT; return; }
    if (a === 'tele') { const t = $('#f_texto'); if (!t.value.includes('TELEPSICOLOGÍA')) t.value = t.value.trimEnd() + TELE_CLAUSE; return; }
    const snap = clone(S.profile);
    if (a === 'del') {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; }
      S.profile.consentimientos = list.filter(c => c.id !== b.dataset.id); delete S.profile.consentimiento;
      if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
      return draw(null);
    }
    if (a === 'save') {
      const o = readForm($('#cmform'), {});
      if (!o.nombre || !o.texto) { toast('Escriba el nombre y el texto del modelo.'); return; }
      if (list.length >= 20 && !b.dataset.id) { toast('Máximo 20 modelos.'); return; }
      const c = { id: b.dataset.id || Math.random().toString(36).slice(2, 9), nombre: o.nombre.slice(0, 120), texto: o.texto.slice(0, 30000) };
      S.profile.consentimientos = b.dataset.id ? list.map(x => x.id === c.id ? c : x) : list.concat([c]); delete S.profile.consentimiento;
      if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
      toast('Modelo guardado.'); draw(null);
    }
  };
};
