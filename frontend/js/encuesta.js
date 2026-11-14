/* Encuesta de satisfacción y estadísticas. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Encuesta de satisfacción ===== */
/* Mismos tipos y puntajes que el servidor (app/survey.py). */
const SV_TYPES = {
  escala: [['Excelente', 4], ['Bueno', 3], ['Regular', 2], ['Malo', 1]],
  dias: [['1 a 3 días', 5], ['4 a 7 días', 4], ['8 a 15 días', 3], ['16 a 30 días', 2], ['Más de 30 días', 1]],
  sino: [['Sí', 1], ['No', 0]],
  recomienda: [['Definitivamente sí', 4], ['Probablemente sí', 3], ['Probablemente no', 2], ['Definitivamente no', 1]],
  texto: []
};
const SV_TIPO_LBL = { escala: 'Excelente · Bueno · Regular · Malo', dias: 'Días para asignar la cita', sino: 'Sí · No', recomienda: 'Definitivamente sí … definitivamente no', texto: 'Respuesta abierta (sin puntaje)' };
const SV_DEFAULT = [
  ['op1', 'Oportunidad de consulta', 'Cuando solicitaste tu cita, te la asignaron en:', 'dias'],
  ['op2', 'Oportunidad de consulta', 'La hora en que te asignaron tu cita coincidió con el momento de la atención', 'sino'],
  ['pf1', 'Planta física', '¿Cómo encontraste el estado de aseo del consultorio?', 'escala'],
  ['pf2', 'Planta física', '¿Cómo calificas las comodidades del consultorio?', 'escala'],
  ['pf3', 'Planta física', '¿Cómo calificas el ambiente de las instalaciones?', 'escala'],
  ['at1', 'Atención', 'El trato que recibiste en la recepción o al agendar fue:', 'escala'],
  ['cp1', 'Características del terapeuta', 'La puntualidad del terapeuta al iniciar las sesiones fue:', 'escala'],
  ['cp2', 'Características del terapeuta', 'La forma en que el terapeuta escuchó lo que querías expresar fue:', 'escala'],
  ['cp3', 'Características del terapeuta', 'La claridad con que te explicó tu proceso y las actividades propuestas fue:', 'escala'],
  ['cp4', 'Características del terapeuta', 'El respeto y el trato digno que recibiste del terapeuta fueron:', 'escala'],
  ['cp5', 'Características del terapeuta', 'La confianza y la confidencialidad que te transmitió el terapeuta fueron:', 'escala'],
  ['cp6', 'Características del terapeuta', 'La información que recibiste sobre tus derechos, deberes y el consentimiento informado fue:', 'escala'],
  ['cp7', 'Características del terapeuta', 'La utilidad de las sesiones para tu situación ha sido:', 'escala'],
  ['eg1', 'Experiencia general', 'En general, ¿cómo calificas tu experiencia con el servicio?', 'escala'],
  ['eg2', 'Experiencia general', '¿Recomendarías este servicio a tus familiares y amigos?', 'recomienda'],
  ['com', 'Comentarios', '¿Qué podríamos mejorar? (opcional)', 'texto']
].map(([id, dim, texto, tipo]) => ({ id, dim, texto, tipo }));
const SV_INTRO = 'Queremos conocer tu opinión sobre la atención que recibiste. Son unos 2 minutos y tus respuestas se guardan sin tu nombre.';
const svCfg = () => Object.assign({ activa: false, cadaDias: 30, cantidad: 3, intro: SV_INTRO, incluirAnteriores: false }, clone(S.profile.encuesta || {}), { preguntas: clone((S.profile.encuesta && S.profile.encuesta.preguntas && S.profile.encuesta.preguntas.length) ? S.profile.encuesta.preguntas : SV_DEFAULT) });
async function svLoad() { if (S.mode !== 'server' || TEAM()) return;  // el equipo no tiene encuestas: pedirlas quedaría como intento sin permiso
 try { S.sv = await api('/encuestas'); } catch (e) { S.sv = null; } }
const svUrl = t => location.origin + '/encuesta?t=' + t;
const waPhone = (t, ind) => { const raw = String(t || '').trim(); if (!raw) return ''; const d = raw.startsWith('+') ? raw.replace(/\D/g, '') : String(ind || '+57').replace(/\D/g, '') + raw.replace(/\D/g, '').replace(/^0+/, ''); return d.length >= 8 ? d : ''; };

ACT.survey = () => {
  const root = $('#modal-root'); let cfg = svCfg(), preview = false, testOpen = false, testMail = S.profile.correo || (S.user && S.user.email) || '', mailInfo = null;
  api('/correo').then(m => { mailInfo = m; const sl = $('#mailslot'); if (sl) sl.innerHTML = mailHTML(m); }).catch(() => {});
  const sync = () => {
    const f = $('#svform'); if (!f) return;
    cfg.activa = $('#sv_activa').checked; cfg.incluirAnteriores = $('#sv_old').checked;
    cfg.cadaDias = +$('#sv_cada').value; cfg.cantidad = Math.min(50, Math.max(1, +$('#sv_cant').value || 1)); cfg.intro = $('#sv_intro').value.trim();
    $$('.svq', f).forEach((r, k) => { const q = cfg.preguntas[k]; if (!q) return; q.dim = $('[data-q="dim"]', r).value.trim(); q.texto = $('[data-q="texto"]', r).value.trim(); q.tipo = $('[data-q="tipo"]', r).value; });
  };
  const st = S.sv || {};
  const draw = () => {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi encuesta de satisfacción"><div class="box" id="svform" style="max-width:820px">
    <div class="row" style="justify-content:space-between"><h3>Mi encuesta de satisfacción</h3><button class="btn sm" data-sv="close">Cerrar</button></div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Cada cierto tiempo se sortean al azar consultantes atendidos en ese periodo y se les envía el enlace de la encuesta. Las respuestas son anónimas: aquí y en Estadísticas solo verás los resultados agregados. A un mismo consultante no se le vuelve a invitar antes de 6 meses, y puede pedir no recibir más encuestas.</p>
    <div id="mailslot">${mailHTML(mailInfo)}</div>
    <label class="check"><input type="checkbox" id="sv_activa" ${cfg.activa ? 'checked' : ''}> <span><b>Enviar encuestas automáticamente</b></span></label>
    <div class="grid"><div class="fld"><label for="sv_cada">Hacer un sorteo cada</label><select id="sv_cada">${[15, 30, 60, 90, 180].map(d => `<option value="${d}" ${+cfg.cadaDias === d ? 'selected' : ''}>${d} días</option>`).join('')}</select></div>
    <div class="fld"><label for="sv_cant">Consultantes por sorteo</label><input id="sv_cant" type="number" min="1" max="50" value="${cfg.cantidad}"></div></div>
    <label class="check"><input type="checkbox" id="sv_old" ${cfg.incluirAnteriores ? 'checked' : ''}> <span>Incluir consultantes cuya autorización de datos es anterior y no menciona encuestas. <small style="color:var(--muted)">Por defecto solo se invita a quienes autorizaron las encuestas en su autorización de uso de datos (el modelo nuevo ya lo incluye).</small></span></label>
    <div class="fld"><label for="sv_intro">Texto de bienvenida</label><textarea id="sv_intro" rows="2">${esc(cfg.intro)}</textarea></div>
    <div class="row" style="justify-content:space-between"><b>Preguntas (${cfg.preguntas.length})</b><span class="row"><button class="btn sm" data-sv="preview">${preview ? 'Editar preguntas' : 'Ver como consultante'}</button><button class="btn sm" data-sv="reset">Restaurar sugeridas</button></span></div>
    ${preview ? svFormHTML(cfg.preguntas, true) : cfg.preguntas.map((q, k) => `<div class="card svq"><div class="row" style="margin:0"><span class="dragh" draggable="true" data-dk="q" data-dv="${k}" title="Arrastra para cambiar el orden" aria-hidden="true">⠿</span><span class="stnote" style="margin:0">Arrastra para cambiar el orden</span></div><div class="grid"><div class="fld"><label>Dimensión</label><input data-q="dim" value="${esc(q.dim)}"></div><div class="fld"><label>Tipo de respuesta</label><select data-q="tipo">${Object.keys(SV_TYPES).map(t => `<option value="${t}" ${q.tipo === t ? 'selected' : ''}>${SV_TIPO_LBL[t]}</option>`).join('')}</select></div><div class="fld wide"><label>Pregunta ${k + 1}</label><input data-q="texto" value="${esc(q.texto)}"></div></div>
      <div class="row end"><button class="btn sm warn" data-sv="del" data-k="${k}">Quitar</button></div></div>`).join('') + '<div class="row"><button class="btn" data-sv="add">+ Pregunta</button></div>'}
    <p style="margin:0;font-size:13px;color:var(--muted)">Los cambios en las preguntas aplican a las encuestas que se envíen desde ahora. Último sorteo: ${st.ultimoSorteo ? esc(fmtDT(st.ultimoSorteo)) : 'ninguno'}.</p>
    <details class="sec" id="svtest" ${testOpen ? 'open' : ''}><summary>Enviar una encuesta de prueba</summary>
      <p style="margin:6px 0;font-size:13px;color:var(--muted)">Llega al correo que escribas, enviada desde tu correo de envío, con las preguntas guardadas. Puedes responderla para ver cómo funciona: en Estadísticas aparece solo si marcas «Incluir las respuestas de prueba». Guarda antes los cambios a las preguntas.</p>
      <div class="row"><input id="sv_tmail" type="email" style="flex:1;min-width:220px" value="${esc(testMail)}" placeholder="correo@ejemplo.com" aria-label="Correo para la prueba"><button class="btn" data-sv="test">Enviar prueba</button></div><div id="sv_tout" aria-live="polite"></div></details>
    <div class="row end"><button class="btn" data-sv="draw">Guardar y sortear ahora</button><button class="btn pri" data-sv="save">Guardar</button></div></div></div>`;
  };
  draw();
  window.__svMove = (i, j) => { if (!root.querySelector('.svq') || i === j || !cfg.preguntas[i] || !cfg.preguntas[j]) return; sync(); cfg.preguntas.splice(j, 0, cfg.preguntas.splice(i, 1)[0]); draw(); };  // arrastrar para ordenar
  root.onclick = async e => {
    const b = e.target.closest('[data-sv]'); if (!b) return;
    const a = b.dataset.sv, k = +b.dataset.k;
    if (a === 'close') { root.innerHTML = ''; root.onclick = null; return; }
    if (!preview) sync();
    if (a === 'mailsave' || a === 'maildel') {
      const out = $('#ml_out'); b.disabled = true;
      try {
        if (a === 'maildel') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: quitar'; b.disabled = false; return; } await api('/correo', { method: 'DELETE' }); mailInfo = await api('/correo'); }
        else { out.innerHTML = '<p class="stnote">Probando el ingreso al correo…</p>'; mailInfo = await api('/correo', { method: 'PUT', body: { correo: $('#ml_mail').value.trim(), password: $('#ml_pw').value, host: ($('#ml_host') || {}).value || '', port: +(($('#ml_port') || {}).value || 0) } }); }
        await svLoad(); $('#mailslot').innerHTML = mailHTML(mailInfo, a === 'mailsave' ? 'Listo: el correo funciona. Tus encuestas saldrán desde ' + mailInfo.correo + '.' : 'Correo quitado.');
      } catch (err) { if (out) out.innerHTML = `<div class="banner">${esc(err.message)}</div>`; b.disabled = false; }
      return;
    }
    if (a === 'mailcancel') { $('#mailslot').innerHTML = mailHTML(mailInfo); return; }
    if (a === 'mailedit') { $('#mailslot').innerHTML = mailHTML(Object.assign({}, mailInfo, { editar: true })); return; }
    if (a === 'test') {
      testOpen = true; testMail = $('#sv_tmail').value.trim(); const out = $('#sv_tout');
      b.disabled = true; out.innerHTML = '<p class="stnote">Enviando…</p>';
      try {
        const r = await api('/encuestas/prueba', { method: 'POST', body: { correo: testMail } }), url = svUrl(r.enlace);
        out.innerHTML = r.enviado ? `<div class="banner" style="background:var(--ok-soft,#DDF0E4);color:var(--ok,#2B7A4B)">Correo enviado a ${esc(testMail)}. Revisa también la carpeta de spam. <a href="${esc(url)}" target="_blank" rel="noopener">Abrir la encuesta aquí</a></div>`
          : `<div class="banner"><b>No se envió el correo.</b> ${esc(r.motivo)}<br>Mientras tanto puedes ver la encuesta: <a href="${esc(url)}" target="_blank" rel="noopener">abrir la encuesta de prueba</a></div>`;
      } catch (err) { out.innerHTML = `<div class="banner">${esc(err.message)}</div>`; }
      b.disabled = false; return;
    }
    if (a === 'preview') { preview = !preview; return draw(); }
    if (a === 'reset') { cfg.preguntas = clone(SV_DEFAULT); return draw(); }
    if (a === 'add') { cfg.preguntas.push({ id: 'q' + Math.random().toString(36).slice(2, 8), dim: 'General', texto: '', tipo: 'escala' }); draw(); const ins = $$('[data-q="texto"]'); ins[ins.length - 1].focus(); return; }
    if (a === 'del') { cfg.preguntas.splice(k, 1); return draw(); }
    if (a === 'save' || a === 'draw') {
      cfg.preguntas = cfg.preguntas.filter(q => q.texto);
      if (!cfg.preguntas.some(q => q.tipo !== 'texto')) { toast('La encuesta necesita al menos una pregunta con opciones.'); return; }
      if (a === 'draw' && !cfg.activa) { toast('Activa «Enviar encuestas automáticamente» para sortear.'); return; }
      const snap = clone(S.profile); S.profile.encuesta = clone(cfg);
      if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; }
      if (a === 'draw') { try { const r = await api('/encuestas/sortear', { method: 'POST' }); toast(r.creadas ? `Se sortearon ${r.creadas} consultante(s).` : 'No hay consultantes para invitar ahora: deben haber sido atendidos en el periodo, tener la autorización de datos y no haber sido invitados en los últimos 6 meses.'); } catch (err) { toast(err.message); } }
      else toast('Encuesta guardada.');
      await svLoad(); root.innerHTML = ''; root.onclick = null; render();
    }
  };
};
/* Correo de envío: cada terapeuta envía sus encuestas desde su propio correo. */
function mailHTML(m, okMsg) {
  if (!m) return '<p class="stnote">Cargando el correo de envío…</p>';
  const known = /@(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|zoho)\./i;
  const head = `<b>Correo de envío</b> ${m.propio ? `<span class="chip ok">${esc(m.correo)}</span>` : '<span class="chip warn">Sin configurar</span>'}`;
  if (m.propio && !m.editar) return `<div class="card">${head}${okMsg ? `<div class="banner" style="background:var(--ok-soft,#DDF0E4);color:var(--ok,#2B7A4B)">${esc(okMsg)}</div>` : ''}<p class="stnote">Las encuestas salen desde este correo, con tu nombre, y las respuestas de los consultantes te llegan ahí. A los consultantes sin correo la encuesta te aparece en Pendientes para enviarla por WhatsApp.</p><div class="row"><button type="button" class="btn sm" data-sv="mailedit">Cambiar</button><button type="button" class="btn sm warn" data-sv="maildel">Quitar</button></div></div>`;
  const mail = m.correo || S.profile.correo || (S.user && S.user.email) || '';
  return `<div class="card">${head}${okMsg ? `<p class="stnote">${esc(okMsg)}</p>` : ''}
  <p class="stnote">Las encuestas se envían desde tu propio correo. ${m.servidor ? 'Mientras no lo configures, se usa el correo general del servidor.' : 'Mientras no lo configures, las encuestas sorteadas aparecen en Pendientes para enviarlas a mano.'}</p>
  <div class="grid"><div class="fld"><label for="ml_mail">Tu correo</label><input id="ml_mail" type="email" value="${esc(mail)}" autocomplete="off"></div>
  <div class="fld"><label for="ml_pw">Contraseña de aplicación</label><input id="ml_pw" type="password" autocomplete="new-password" placeholder="16 letras, p. ej. abcd efgh ijkl mnop"></div></div>
  <details><summary style="font-size:13px">¿Qué es la contraseña de aplicación y cómo la saco?</summary><div class="stnote" style="margin-top:6px">Es una clave especial que da tu proveedor para que una aplicación envíe correos en tu nombre, sin usar tu contraseña normal. Se puede borrar cuando quieras.<br><b>Gmail:</b> activa la verificación en dos pasos y entra a myaccount.google.com/apppasswords; crea una con el nombre «Alter-Karute» y copia las 16 letras.<br><b>Outlook/Hotmail:</b> account.microsoft.com → Seguridad → Opciones de seguridad avanzadas → Contraseñas de aplicación.<br><b>Yahoo:</b> Configuración de la cuenta → Seguridad → Generar contraseña de aplicación.<br><b>iCloud:</b> appleid.apple.com → Contraseñas específicas de apps.</div></details>
  <details ${mail && !known.test(mail) ? 'open' : ''}><summary style="font-size:13px">Servidor de correo (solo si no es Gmail, Outlook, Yahoo, iCloud o Zoho)</summary><div class="grid" style="margin-top:6px"><div class="fld"><label for="ml_host">Servidor SMTP</label><input id="ml_host" type="text" placeholder="Ej.: smtp.miconsultorio.co" value="${esc(m.host && !known.test(mail) ? m.host : '')}"></div><div class="fld"><label for="ml_port">Puerto</label><select id="ml_port"><option value="0">Automático</option><option value="587">587 (STARTTLS)</option><option value="465">465 (SSL)</option></select></div></div></details>
  <div id="ml_out"></div><div class="row end">${m.propio ? '<button type="button" class="btn sm" data-sv="mailcancel">Cancelar</button>' : ''}<button type="button" class="btn sm pri" data-sv="mailsave">Guardar y probar</button></div></div>`;
}
/* Formulario de la encuesta (vista previa del terapeuta; la página pública usa el mismo diseño). */
function svFormHTML(qs, disabled) {
  let dim = '';
  return qs.map((q, k) => { const h = q.dim !== dim ? `<h4 style="margin:10px 0 0">${esc(dim = q.dim)}</h4>` : '';
    return h + `<fieldset class="card svpv" style="margin:0"><legend style="font-weight:600;font-size:14px">${k + 1}. ${esc(q.texto)}</legend>${q.tipo === 'texto' ? `<textarea rows="2" ${disabled ? 'disabled' : ''}></textarea>` : `<div class="row">${SV_TYPES[q.tipo].map(o => `<label class="check"><input type="radio" name="pv_${k}" ${disabled ? 'disabled' : ''}> <span>${esc(o[0])}</span></label>`).join('')}</div>`}</fieldset>`; }).join('');
}
ACT.svSend = b => {
  const i = ((S.sv && S.sv.invitaciones) || []).find(x => x.id === b.dataset.id); if (!i) return;
  const p = S.patients.find(x => x.id === i.patientId) || {}, url = svUrl(i.enlace), who = S.profile.nombre || 'tu terapeuta';
  const text = `Hola ${(p.nombres || '').split(' ')[0]}, ${who} te invita a responder una encuesta corta y anónima sobre la atención que recibiste (unos 2 minutos): ${url}`;
  const ph = waPhone(p.telefono, p.telInd), root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Enviar encuesta"><div class="box" style="max-width:560px"><h3>Enviar encuesta a ${esc(fullName(p))}</h3>
  ${i.error ? `<div class="banner">No se pudo enviar por correo: ${esc(i.error)}</div>` : ''}
  <p style="margin:0;font-size:14px">Envíale este enlace por el medio que prefierass. Vence el ${esc(fmtD(i.vence))}. Después de enviarlo, márcalo como enviado.</p>
  <div class="fld"><label for="sv_link">Enlace</label><input id="sv_link" readonly value="${esc(url)}"></div>
  <div class="row">${ph ? `<a class="btn" href="https://wa.me/${ph}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${p.correo ? `<a class="btn" href="mailto:${esc(p.correo)}?subject=${encodeURIComponent('Encuesta de satisfacción')}&body=${encodeURIComponent(text)}">Correo</a>` : ''}<button class="btn" id="sv_copy">Copiar mensaje</button></div>
  <div class="row end"><button class="btn warn" id="sv_cancel">No enviar</button><button class="btn" id="sv_close">Cerrar</button><button class="btn pri" id="sv_sent">Ya la envié</button></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('#sv_close').onclick = close;
  $('#sv_copy').onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Mensaje copiado.'); } catch (e) { $('#sv_link').select(); toast('Copia el enlace seleccionado.'); } };
  $('#sv_sent').onclick = async () => { try { await api('/encuestas/' + i.id + '/enviada', { method: 'POST' }); await svLoad(); close(); render(); toast('Marcada como enviada.'); } catch (e) { toast(e.message); } };
  $('#sv_cancel').onclick = async () => { try { await api('/encuestas/' + i.id, { method: 'DELETE' }); await svLoad(); close(); render(); toast('Invitación quitada.'); } catch (e) { toast(e.message); } };
};

/* ===== Estadísticas de la cuenta ===== */
ACT.homeTab = async b => {
  S.homeTab = b.dataset.t; render();
  if (S.homeTab === 'enc' && S.mode === 'server') { await svLoad(); try { S.svRes = await api('/encuestas/resultados'); } catch (e) { S.svRes = []; } if (S.homeTab === 'enc' && !S.pid) render(); }
};
const pct = (n, t) => t ? Math.round(n * 1000 / t) / 10 : 0;
const fmtPct = v => String(v).replace('.', ',') + ' %';
/* Barras horizontales de un solo color, con el valor escrito (la tabla al lado da los mismos datos). */
function barsHTML(rows, total) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="bars">${rows.map(r => `<div class="bar" title="${esc(r.label)}: ${r.n} (${fmtPct(pct(r.n, total))})"><span class="bl">${esc(r.label)}</span><span class="bt"><i style="width:${r.n ? Math.max(2, r.n * 100 / max) : 0}%"></i></span><span class="bv">${r.n} · ${fmtPct(pct(r.n, total))}</span></div>`).join('')}</div>`;
}
function countTable(title, rows, total, head = 'Total') {
  return `<table class="sttab"><thead><tr><th>${esc(title)}</th><th>%</th><th>${esc(head)}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${fmtPct(pct(r.n, total))}</td><td class="n">${r.n}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td class="n">${total ? '100 %' : '0 %'}</td><td class="n">${total}</td></tr></tbody></table>`;
}
const stBlock = (title, note, rows, total, head) => `<div class="sec stsec"><h3>${esc(title)}</h3>${note ? `<p class="stnote">${note}</p>` : ''}${total ? `<div class="stgrid">${countTable(title, rows, total, head)}${barsHTML(rows, total)}</div>` : '<p class="stnote">Sin datos en este periodo.</p>'}</div>`;
const attendedIn = (p, y) => [p.intake && p.intake.signedAt ? p.intake.sessionAt : null, ...S.notes.filter(n => n.patientId === p.id && n.signedAt).map(n => n.sessionAt)].some(t => t && t.startsWith(y));
function svAggregate(responses) {
  const items = new Map(), comments = [];
  const order = svCfg().preguntas.map(q => q.dim + '|' + q.texto);
  responses.forEach(r => (r.preguntas || []).forEach(q => {
    const v = (r.respuestas || {})[q.id]; if (v === undefined) return;
    if (q.tipo === 'texto') { if (String(v).trim()) comments.push(String(v)); return; }
    const opts = SV_TYPES[q.tipo]; if (!opts || !opts[v]) return;
    const key = q.dim + '|' + q.texto, it = items.get(key) || { dim: q.dim, texto: q.texto, max: Math.max(...opts.map(o => o[1])), sum: 0, n: 0 };
    it.sum += opts[v][1]; it.n++; items.set(key, it);
  }));
  const list = [...items.entries()].sort((a, b) => { const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); }).map(([, v]) => Object.assign(v, { prom: v.sum / v.n, pc: v.sum / v.n / v.max * 100 }));
  const dims = []; list.forEach(it => { let d = dims.find(x => x.dim === it.dim); if (!d) dims.push(d = { dim: it.dim, items: [] }); d.items.push(it); });
  dims.forEach(d => { d.pc = d.items.reduce((a, b) => a + b.pc, 0) / d.items.length; });
  return { dims, comments, global: dims.length ? dims.reduce((a, b) => a + b.pc, 0) / dims.length : null };
}
const r1 = v => (Math.round(v * 10) / 10).toLocaleString(I18N.locale());
function statsHTML(forDoc, part) {
  const enc_ = part === 'enc';
  const years = [...new Set((enc_ ? [...((S.sv && S.sv.invitaciones) || []).map(i => i.creada.slice(0, 4)), ...(S.svRes || []).map(r => (r.mes || '').slice(0, 4)), ...(S.profile.acciones || []).map(a => (a.fecha || '').slice(0, 4))]
    : [...S.notes.map(n => (n.sessionAt || '').slice(0, 4)), ...S.patients.map(p => ((p.intake || {}).sessionAt || '').slice(0, 4))]).filter(Boolean))].sort().reverse();
  const per = S.stPer && (S.stPer === 'todo' || years.includes(S.stPer)) ? S.stPer : 'todo';
  const pats = per === 'todo' ? S.patients : S.patients.filter(p => attendedIn(p, per));
  const perTxt = per === 'todo' ? 'todos los consultantes registrados' : `consultantes atendidos en ${per}`;
  const group = (list, fn, labels) => { const m = new Map(labels.map(l => [l, 0])); list.forEach(p => { const k = fn(p); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].map(([label, n]) => ({ label, n })).filter(r => r.n || labels.includes(r.label)); };
  // Sexo
  const sexo = group(pats, p => ({ Femenino: 'Mujeres', Masculino: 'Hombres', Intersexual: 'Intersexual' })[p.sexo] || 'Sin registrar', ['Mujeres', 'Hombres']);
  // Estado de los casos
  const est = group(pats, p => isClosed(p) ? 'Casos finalizados' : (!p.estado || p.estado === 'Activo') ? 'Casos activos' : 'Otros (en pausa)', ['Casos finalizados', 'Casos activos', 'Otros (en pausa)']);
  // Modalidad de atención
  const moda = group(pats, p => ({ Presencial: 'Presencial', Virtual: 'Virtual', 'Mixta (presencial y virtual)': 'Mixta' })[p.modalidadAt] || 'Sin registrar', ['Presencial', 'Virtual', 'Mixta']);
  // Tipo de servicio
  const serv = group(pats, p => p.servicio || 'Sin registrar', ['Individual', 'Pareja', 'Familiar', 'Grupal']);
  // Razón de inactividad
  const inact = pats.filter(p => p.estado && p.estado !== 'Activo');
  const raz = group(inact, p => p.razonInactividad || 'Sin registrar', []).sort((a, b) => b.n - a.n);
  // Impresiones frecuentes (impresión principal vigente)
  const withDx = pats.map(p => dxActive(currentDx(p).items)[0]).filter(Boolean);
  const dxc = new Map(); withDx.forEach(d => { const k = d.nombre; dxc.set(k, (dxc.get(k) || 0) + 1); });
  let dxRows = [...dxc.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  if (dxRows.length > 6) { const rest = dxRows.slice(5).reduce((a, b) => a + b.n, 0); dxRows = dxRows.slice(0, 5).concat([{ label: 'Otros', n: rest }]); }
  const sinDx = pats.length - withDx.length;
  // Encuestas
  const nTest = (S.svRes || []).filter(r => r.prueba).length, nTestInv = ((S.sv && S.sv.invitaciones) || []).filter(i => i.prueba).length, incT = S.stTest !== undefined ? S.stTest : !(S.svRes || []).some(r => !r.prueba);
  const invs = ((S.sv && S.sv.invitaciones) || []).filter(i => (per === 'todo' || i.creada.startsWith(per)) && (incT || !i.prueba));
  const enc = [{ label: 'Respondieron', n: invs.filter(i => i.estado === 'respondida').length }, { label: 'Abstención (no respondieron a tiempo)', n: invs.filter(i => i.estado === 'vencida').length }];
  const pend = invs.filter(i => i.estado === 'abierta').length, closedN = enc[0].n + enc[1].n;
  const res = (S.svRes || []).filter(r => (per === 'todo' || (r.mes || '').startsWith(per)) && (incT || !r.prueba));
  const ag = svAggregate(res);
  const acciones = (S.profile.acciones || []).filter(a => per === 'todo' || (a.fecha || '').startsWith(per));
  const svTable = ag.dims.length ? `<div class="tscroll"><table class="sttab"><thead><tr><th rowspan="2">Dimensión</th><th rowspan="2">Ítem</th><th colspan="3">Resultado grupal por ítem</th><th rowspan="2">Nivel de cumplimiento</th></tr><tr><th>Promedio</th><th>Puntaje máx.</th><th>%</th></tr></thead><tbody>${ag.dims.map(d => d.items.map((it, k) => `<tr>${k ? '' : `<td rowspan="${d.items.length}"><b>${esc(d.dim)}</b></td>`}<td>${esc(it.texto)}</td><td class="n">${r1(it.prom)}</td><td class="n">${it.max}</td><td class="n">${r1(it.pc)} %</td>${k ? '' : `<td class="n" rowspan="${d.items.length}"><b>${r1(d.pc)} %</b></td>`}</tr>`).join('')).join('')}<tr class="tot"><td colspan="5">Satisfacción global (promedio de las dimensiones)</td><td class="n">${r1(ag.global)} %</td></tr></tbody></table></div>` : '<p class="stnote">Aún no hay respuestas en este periodo.</p>';
  const dimBars = ag.dims.length ? `<div class="bars">${ag.dims.map(d => `<div class="bar" title="${esc(d.dim)}: ${r1(d.pc)} %"><span class="bl">${esc(d.dim)}</span><span class="bt"><i style="width:${d.pc}%"></i></span><span class="bv">${r1(d.pc)} %</span></div>`).join('')}</div>` : '';
  const head = forDoc ? '' : `<div class="row" style="justify-content:space-between;align-items:flex-end"><h2 style="font-family:var(--f-doc);font-size:22px;margin:0">${enc_ ? 'Encuesta de satisfacción' : 'Estadísticas'}</h2><span class="row"><span class="fld" style="min-width:160px"><label for="st_per">Periodo</label><select id="st_per"><option value="todo" ${per === 'todo' ? 'selected' : ''}>Todo</option>${years.map(y => `<option ${per === y ? 'selected' : ''}>${y}</option>`).join('')}</select></span>${enc_ ? '<button class="btn" data-act="survey">Configurar encuesta</button>' : ''}<button class="btn" data-act="statsDoc" data-part="${enc_ ? 'enc' : 'stats'}">Imprimir o guardar PDF</button></span></div>`;
  if (!enc_) return `${head}
  <div class="stats"><div class="stat"><b>${pats.length}</b><span>${per === 'todo' ? 'consultantes registrados' : 'consultantes atendidos en ' + per}</span></div><div class="stat"><b>${est[1].n}</b><span>casos activos</span></div><div class="stat"><b>${est[0].n}</b><span>casos finalizados</span></div><div class="stat"><b>${withDx.length}</b><span>con impresión registrada</span></div></div>
  ${stBlock('Sexo', 'Sexo registrado en los datos de ' + perTxt + '.', sexo, pats.length)}
  ${stBlock('Impresiones frecuentes', 'Impresión principal activa de ' + perTxt + '. Se muestran los 5 más frecuentes.' + (sinDx ? ` ${sinDx} consultante(s) sin impresión registrada no se cuentan.` : ''), dxRows, withDx.length)}
  ${stBlock('Tipo de servicio', 'Tipo de servicio registrado en los datos de ' + perTxt + '. En pareja, familia o grupo cada persona cuenta por separado.', serv, pats.length, '# Total')}
  ${stBlock('Modalidad de atención', 'Modalidad registrada en los datos de ' + perTxt + '.', moda, pats.length, '# Total')}
  ${stBlock('Estado de los casos', 'Finalizados: alta, cerrado o remitido. Otros: en pausa.', est, pats.length, '# Total')}
  ${stBlock('Razón de inactividad de los consultantes', 'Consultantes que no están activos. La razón se registra en Datos → Estado del proceso.', raz, inact.length, '# Total')}`;
  if (S.mode !== 'server') return head + '<p class="stnote">La encuesta de satisfacción requiere el servidor.</p>';
  const sent = invs.length;
  return `${head}
  <div class="stats"><div class="stat"><b>${sent}</b><span>encuestas enviadas</span></div><div class="stat"><b>${res.length}</b><span>respondidas</span></div><div class="stat"><b>${closedN ? fmtPct(pct(enc[0].n, closedN)) : '—'}</b><span>tasa de respuesta</span></div><div class="stat"><b>${ag.global === null ? '—' : r1(ag.global) + ' %'}</b><span>satisfacción global</span></div></div>
  ${(S.sv && !S.sv.invitaciones.length && !(S.profile.encuesta || {}).activa && !forDoc) ? '<div class="banner">La encuesta aún no está activa. Actívala y pruébala con «Configurar encuesta».</div>' : ''}
  <div class="sec stsec"><h3>Resultado encuesta de satisfacción al usuario${incT && nTest ? ' <span class="chip warn">Incluye pruebas</span>' : ''}</h3>${!forDoc && (nTest || nTestInv) ? `<div class="row" style="justify-content:space-between">${nTest ? `<label class="check"><input type="checkbox" id="st_test" ${incT ? 'checked' : ''}> <span>Incluir las respuestas de prueba (${nTest})</span></label>` : '<span></span>'}<button class="btn sm warn" data-act="svDelTests">Borrar las pruebas</button></div>` : ''}${!forDoc && enc[0].n > res.length ? `<div class="banner">${enc[0].n - res.length} encuesta(s) aparecen como respondidas pero no tienen respuestas guardadas. Pasa con las encuestas de prueba respondidas antes de la actualización que empezó a guardarlas. Usa «Borrar las pruebas» y envía una prueba nueva.</div>` : ''}${`${svTable}${dimBars}${ag.comments.length ? `<h4 style="margin:6px 0 0">Comentarios (${ag.comments.length})</h4><ul class="stcom">${ag.comments.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`}</div>
  ${stBlock('Cantidad de personas encuestadas', `Encuestas enviadas en el periodo${pend ? `; además hay ${pend} pendiente(s) de respuesta, que no se cuentan aún` : ''}.`, enc, closedN)}
  <div class="sec stsec"><h3>Acciones de mejora</h3>${acciones.length ? `<ul class="stcom">${acciones.map(a => `<li><b>${esc(fmtD(a.fecha))}:</b> ${esc(a.texto)}${forDoc ? '' : ` <button class="btn sm warn" data-act="accDel" data-id="${esc(a.id)}">Quitar</button>`}</li>`).join('')}</ul>` : '<p class="stnote">Aún no has registrado acciones de mejora.</p>'}${forDoc ? '' : `<div class="row" id="accform"><input id="acc_txt" style="flex:1;min-width:220px" placeholder="Ej.: Enviar recordatorio de cita el día anterior" aria-label="Nueva acción de mejora"><button class="btn" data-act="accAdd">Agregar</button></div>`}</div>`;
}
ACT.statsDoc = b => { const part = b.dataset.part, per = S.stPer && S.stPer !== 'todo' ? S.stPer : 'todo', t = part === 'enc' ? 'Encuesta de satisfacción' : 'Estadísticas'; showDoc(t, `<div class="docpage">${letterhead(S.profile)}<h2>${t} · ${per === 'todo' ? 'todo el periodo' : per}</h2><p style="font-size:13px">Generado el ${esc(fmtDT(nowISO()))}. Datos agregados, sin información de consultantes individuales.</p>${statsHTML(true, part)}</div>`, (part === 'enc' ? 'encuesta-' : 'estadisticas-') + per + '.html'); };
ACT.svDelTests = async b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar: borrar todas las pruebas'; return; }
  try { await api('/encuestas/borrar-pruebas', { method: 'POST' }); S.stTest = false; await svLoad(); S.svRes = await api('/encuestas/resultados'); toast('Encuestas de prueba borradas.'); render(); } catch (e) { toast(e.message); }
};
ACT.accAdd = async b => {
  const t = ($('#acc_txt').value || '').trim(); if (!t) { toast('Escribe la acción de mejora.'); return; }
  const snap = clone(S.profile); S.profile.acciones = (S.profile.acciones || []).concat([{ id: newId('m'), fecha: nowISO(), texto: t.slice(0, 500) }]);
  if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; } render();
};
ACT.accDel = async b => { const snap = clone(S.profile); S.profile.acciones = (S.profile.acciones || []).filter(a => a.id !== b.dataset.id); if (!(await persist([S.profile], b))) { restore(S.profile, snap); return; } render(); };

