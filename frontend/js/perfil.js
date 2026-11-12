/* Cuenta del equipo, mi equipo, perfil y «Mis formatos». Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ----- Cuenta de una persona del equipo: solo contraseña y verificación en dos pasos ----- */
function accountModal() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi cuenta"><div class="box" id="profform"><div class="row" style="justify-content:space-between"><h3>Mi cuenta</h3><button class="btn sm" id="pcl">Cerrar</button></div>
  <p class="stnote">${esc(S.user.name)} · ${esc(S.user.email)}<br>Cuenta de equipo de ${esc(S.user.ownerName || 'su terapeuta')}.</p>
  <div class="sec" id="tpbox"><h3>Mis datos para el historial</h3><p class="stnote">Su documento y su firma aparecen en el historial de cada cambio que haga a los datos de un consultante.</p>
  <div class="grid">${F('Documento de identidad', 'tpdoc', '')}</div><div class="fld"><span class="lbl">Su firma</span><div id="tpsigprev"></div><div class="sigbox" id="tpsig"></div><button class="btn sm" id="tpclear" type="button">Borrar trazo</button></div>
  <div class="row end"><button class="btn pri" id="tpsave" type="button">Guardar mis datos</button></div></div>
  <details class="sec" id="pwbox" open><summary class="sum">Cambiar contraseña</summary><form id="pwform" class="sec" autocomplete="on" onsubmit="return false">
    <input type="email" autocomplete="username" value="${esc(S.user.email)}" hidden aria-hidden="true" tabindex="-1">
    <div class="grid"><div class="fld"><label for="pw_cur">Contraseña actual</label><input id="pw_cur" type="password" autocomplete="current-password"></div>
    <div class="fld"><label for="pw_new">Nueva contraseña</label><input id="pw_new" type="password" autocomplete="new-password" minlength="10"></div>
    <div class="fld"><label for="pw_new2">Repita la nueva contraseña</label><input id="pw_new2" type="password" autocomplete="new-password"></div></div>
    <div class="row end"><button class="btn" id="pwsave" type="button">Cambiar contraseña</button></div></form></details>
  <details class="sec" id="tfbox"><summary class="sum">Verificación en dos pasos ${S.user.totp ? '<span class="chip ok" style="text-transform:none;letter-spacing:0">Activa</span>' : '<span class="chip warn" style="text-transform:none;letter-spacing:0">Inactiva</span>'}</summary><div id="tfbody"></div></details></div></div>`;
  $('#pcl').onclick = () => { root.innerHTML = ''; };
  $('#tfbox').addEventListener('toggle', e => { if (e.target.open) draw2fa(); });
  const tpad = makePad($('#tpsig'), 'teamSig'); let curSig = '';
  $('#tpclear').onclick = () => tpad.clear ? tpad.clear() : makePad($('#tpsig'), 'teamSig');
  api('/equipo/mi-perfil').then(d => { const f = $('#f_tpdoc'); if (f && !f.value) f.value = d.documento || ''; curSig = d.firma || ''; if (curSig) $('#tpsigprev').innerHTML = `<span class="lbl">Firma guardada</span><img class="sigimg" src="${curSig}" alt="Su firma guardada"><p class="stnote">Dibuje abajo solo si quiere reemplazarla.</p>`; }).catch(() => {});
  $('#tpsave').onclick = async () => {
    const firma = tpad.isEmpty() ? curSig : tpad.data();
    if (!firma) { toast('Dibuje su firma.'); return; }
    setBusy($('#tpsave'), true);
    try { await api('/equipo/mi-perfil', { method: 'PUT', body: { documento: $('#f_tpdoc').value.trim(), firma } }); S.user.tieneFirma = true; toast('Datos guardados.'); root.innerHTML = ''; render(); }
    catch (e) { toast(e.message); } finally { setBusy($('#tpsave'), false); }
  };
  $('#pwsave').onclick = async () => {
    const cur = $('#pw_cur').value, nw = $('#pw_new').value, nw2 = $('#pw_new2').value;
    if (!cur || !nw) { toast('Escriba la contraseña actual y la nueva.'); return; }
    if (nw.length < 10) { toast('La nueva contraseña debe tener al menos 10 caracteres.'); return; }
    if (nw !== nw2) { toast('Las contraseñas nuevas no coinciden.'); return; }
    setBusy($('#pwsave'), true);
    try { await api('/auth/password', { method: 'POST', body: { current: cur, new: nw } }); ['#pw_cur', '#pw_new', '#pw_new2'].forEach(x => { $(x).value = ''; }); toast('Contraseña cambiada.'); }
    catch (e) { toast(e.message); } finally { setBusy($('#pwsave'), false); }
  };
}
/* ----- Mi equipo: subcuentas del terapeuta ----- */
ACT.team = async () => {
  const root = $('#modal-root');
  const draw = (list, msg) => {
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi equipo"><div class="box" id="teamform"><div class="row" style="justify-content:space-between"><h3>Mi equipo</h3><button class="btn sm" data-tm2="close">Cerrar</button></div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Cuentas para su secretaría o asistentes. Cada persona entra con su propio correo y contraseña y trabaja sobre sus consultantes, pero <b>solo ve y edita los datos de los consultantes y la agenda</b>. No ve consentimientos, primera vez, sesiones, impresiones, escalas, informes ni adjuntos. Sus cambios a los datos quedan en el historial con su nombre.</p>
    ${msg ? `<div class="banner">${msg}</div>` : ''}
    ${list.length ? list.map(u => `<div class="card"><div class="row" style="justify-content:space-between"><span><b>${esc(u.name)}</b> <span class="chip ${u.active ? 'ok' : 'warn'}">${u.active ? 'Activa' : 'Inactiva'}</span>${u.totp ? ' <span class="chip">2 pasos</span>' : ''}<br><small style="color:var(--muted)">${esc(u.email)}</small></span>
      <span class="row"><button class="btn sm" data-tm2="pw" data-id="${u.id}">Nueva contraseña</button><button class="btn sm ${u.active ? 'warn' : ''}" data-tm2="${u.active ? 'off' : 'on'}" data-id="${u.id}">${u.active ? 'Desactivar' : 'Activar'}</button></span></div>
      <div class="row" id="tpw_${u.id}" hidden><input type="password" id="tpwv_${u.id}" autocomplete="new-password" placeholder="Nueva contraseña (mínimo 10)" style="flex:1;min-width:180px"><button class="btn sm pri" data-tm2="pwsave" data-id="${u.id}">Guardar</button></div></div>`).join('') : '<p class="stnote">Aún no tiene personas en su equipo.</p>'}
    <div class="card"><b>Agregar a alguien</b><div class="grid">${F('Nombre', 'tname', '')}${F('Correo', 'temail', '', { type: 'email' })}${F('Contraseña inicial (mínimo 10)', 'tpass', '', { type: 'password' })}</div>
    <p class="stnote">Entréguele la contraseña en persona y pídale que la cambie en «Mi cuenta».</p><div class="row end"><button class="btn pri" data-tm2="add">Crear cuenta</button></div></div></div></div>`;
  };
  let list = [];
  try { list = await api('/equipo'); } catch (e) { toast(e.message); return; }
  draw(list);
  root.onclick = async e => {
    const b = e.target.closest('[data-tm2]'); if (!b) return; const a = b.dataset.tm2, id = b.dataset.id;
    if (a === 'close') { root.innerHTML = ''; root.onclick = null; return; }
    if (a === 'pw') { const r = $('#tpw_' + id); r.hidden = !r.hidden; if (!r.hidden) $('#tpwv_' + id).focus(); return; }
    setBusy(b, true);
    try {
      if (a === 'add') await api('/equipo', { method: 'POST', body: { name: $('#f_tname').value.trim(), email: $('#f_temail').value.trim(), password: $('#f_tpass').value } });
      if (a === 'on' || a === 'off') await api('/equipo/' + id, { method: 'PATCH', body: { active: a === 'on' } });
      if (a === 'pwsave') await api('/equipo/' + id, { method: 'PATCH', body: { password: $('#tpwv_' + id).value } });
      list = await api('/equipo'); draw(list); toast(a === 'add' ? 'Cuenta creada.' : 'Listo.');
    } catch (err) { setBusy(b, false); toast(err.message); }
  };
};

/* ----- Perfil del terapeuta ----- */
ACT.profile = () => {
  if (TEAM()) return accountModal();
  const pr = S.profile, root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi perfil"><div class="box" id="profform"><div class="row" style="justify-content:space-between"><h3>Mi perfil y firma</h3><button class="btn sm" id="pcl">Cerrar</button></div>
  <div class="grid">${F('Nombre completo', 'nombre', pr.nombre)}${F('Cédula (documento de identidad)', 'cedula', pr.cedula || '')}${F('Título', 'titulo', pr.titulo)}${F('Registro (si lo tiene)', 'registro', pr.registro)}${F('Lugar de práctica', 'consultorio', pr.consultorio)}${F('Plataforma habitual de teleterapia', 'plataforma', pr.plataforma || '', { ph: 'Ej.: Google Meet' })}${F('Ciudad', 'ciudad', pr.ciudad)}${F('Teléfono', 'telefono', pr.telefono, { type: 'tel' })}${F('Correo', 'correo', pr.correo, { type: 'email' })}</div>
  <div class="fld"><span class="lbl">Logo para sus informes (opcional)</span>
  <div class="row" style="align-items:center"><span id="plogo">${pr.logo ? `<img class="logoprev" src="${pr.logo}" alt="Logo guardado">` : '<span style="font-size:13px;color:var(--muted)">Sin logo</span>'}</span>
  <input type="file" id="plogofile" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Subir logo">${pr.logo ? '<button class="btn sm warn" id="plogodel" type="button">Quitar logo</button>' : ''}</div>
  <span style="font-size:12px;color:var(--muted)">Sale en el encabezado de los informes que firme desde ahora. PNG con fondo transparente se ve mejor.</span></div>
  <div class="fld"><span class="lbl">Firma manuscrita</span>${pr.firma ? `<img class="sigimg" src="${pr.firma}" alt="Firma guardada">` : '<span class="chip warn">Aún no hay firma guardada</span>'}
  <div class="sigbox" id="psig" style="margin-top:6px"></div><div class="row"><button class="btn sm" id="pclr">Borrar trazo</button><span style="font-size:12px;color:var(--muted)">Dibuje una firma nueva solo si desea reemplazar la guardada. Los documentos ya firmados conservan la firma con la que se firmaron.</span></div>
  <div class="card" style="margin-top:8px"><div class="fld"><label for="psigfile">O suba una imagen de su firma (foto o escaneo, PNG o JPG)</label><input type="file" id="psigfile" accept="image/png,image/jpeg,image/webp"></div>
  <label class="check"><input type="checkbox" id="psigbg" checked> <span>Quitar el fondo y recortar los bordes</span></label>
  <div id="psigprev" hidden><span class="lbl">Así quedará su firma</span><img class="sigimg" id="psigimg" alt="Vista previa de la firma subida"><div class="row"><button class="btn sm" id="psigdrop">Descartar imagen</button></div></div>
  <p style="margin:0;font-size:12px;color:var(--muted)">Para un mejor resultado, firme con tinta oscura sobre papel blanco y tome la foto con buena luz.</p></div></div>
  <p style="margin:0;font-size:13px;color:var(--muted)">Sus modelos de consentimiento (adultos, familia, niños…) se administran en «Mis consentimientos», desde la pestaña Consentimiento de cualquier consultante.</p>
  <div class="row end"><button class="btn pri" id="psave">Guardar perfil</button></div>
  ${S.mode === 'server' ? `<details class="sec" id="pwbox"><summary class="sum">Cambiar contraseña</summary><form id="pwform" class="sec" autocomplete="on" onsubmit="return false">
    <input type="email" autocomplete="username" value="${esc(S.user ? S.user.email : '')}" hidden aria-hidden="true" tabindex="-1">
    <div class="grid"><div class="fld"><label for="pw_cur">Contraseña actual</label><input id="pw_cur" type="password" autocomplete="current-password"></div>
    <div class="fld"><label for="pw_new">Nueva contraseña</label><input id="pw_new" type="password" autocomplete="new-password" minlength="10"></div>
    <div class="fld"><label for="pw_new2">Repita la nueva contraseña</label><input id="pw_new2" type="password" autocomplete="new-password"></div></div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Mínimo 10 caracteres. Este cambio se guarda aparte de los datos del perfil.</p>
    <div class="row end"><button class="btn" id="pwsave" type="button">Cambiar contraseña</button></div></form></details>
  <details class="sec" id="tfbox"><summary class="sum">Verificación en dos pasos ${S.user && S.user.totp ? '<span class="chip ok" style="text-transform:none;letter-spacing:0">Activa</span>' : '<span class="chip warn" style="text-transform:none;letter-spacing:0">Inactiva</span>'}</summary><div id="tfbody" class="sec"></div></details>` : ''}</div></div>`;
  if ($('#tfbox')) $('#tfbox').addEventListener('toggle', e => { if (e.target.open) draw2fa(); });
  const pad = makePad($('#psig'), 'profSig');
  if ($('#pwsave')) $('#pwsave').onclick = async () => {
    const cur = $('#pw_cur').value, nw = $('#pw_new').value, nw2 = $('#pw_new2').value;
    if (!cur || !nw) { toast('Escriba la contraseña actual y la nueva.'); return; }
    if (nw.length < 10) { toast('La nueva contraseña debe tener al menos 10 caracteres.'); return; }
    if (nw !== nw2) { toast('Las contraseñas nuevas no coinciden.'); return; }
    setBusy($('#pwsave'), true);
    try { await api('/auth/password', { method: 'POST', body: { current: cur, new: nw } }); ['#pw_cur', '#pw_new', '#pw_new2'].forEach(x => { $(x).value = ''; }); $('#pwbox').open = false; toast('Contraseña cambiada.'); }
    catch (e) { toast(e.message); }
    finally { setBusy($('#pwsave'), false); }
  };
  let upFirma = null, upFile = null, newLogo;
  $('#plogofile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { newLogo = await logoFromImage(f); $('#plogo').innerHTML = `<img class="logoprev" src="${newLogo}" alt="Nuevo logo">`; }
    catch (err) { toast(err.message); e.target.value = ''; }
  };
  if ($('#plogodel')) $('#plogodel').onclick = () => { newLogo = ''; $('#plogo').innerHTML = '<span style="font-size:13px;color:var(--muted)">Sin logo (se quitará al guardar)</span>'; };
  const showUp = d => { upFirma = d; $('#psigprev').hidden = !d; if (d) { $('#psigimg').src = d; pad.clear(); } };
  const processUp = async () => { if (!upFile) return; try { showUp(await sigFromImage(upFile, $('#psigbg').checked)); } catch (e) { showUp(null); toast(e.message); } };
  $('#psigfile').onchange = e => { upFile = e.target.files[0] || null; processUp(); };
  $('#psigbg').onchange = processUp;
  $('#psigdrop').onclick = () => { upFile = null; $('#psigfile').value = ''; showUp(null); };
  $('#psig canvas').addEventListener('pointerdown', () => { if (upFirma) { upFile = null; $('#psigfile').value = ''; showUp(null); } });
  $('#pclr').onclick = () => pad.clear();
  $('#pcl').onclick = () => root.innerHTML = '';
  $('#psave').onclick = async () => {
    const o = readForm($('#profform'), {});
    if (!o.nombre) { toast('Escriba su nombre completo.'); return; }
    const snap = clone(S.profile);
    Object.assign(S.profile, o); if (upFirma) S.profile.firma = upFirma; else if (!pad.isEmpty()) S.profile.firma = pad.data();
    if (newLogo !== undefined) { if (newLogo) S.profile.logo = newLogo; else delete S.profile.logo; }
    if (!(await persist([S.profile], $('#psave')))) { restore(S.profile, snap); return; }
    root.innerHTML = ''; toast('Perfil guardado.'); render();
  };
};

/* Convierte una foto o escaneo de la firma en una imagen limpia: fondo transparente, bordes recortados y tamaño acotado. */
async function sigFromImage(file, clean) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use una imagen PNG, JPG o WEBP.');
  if (file.size > 10 * 1048576) throw new Error('La imagen supera 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo leer la imagen.')); i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
    let box = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
    if (clean) {
      const d = x.getImageData(0, 0, w, h), px = d.data;
      // umbral relativo al papel: el fondo es el tono claro más común (percentil 90 de luminosidad)
      const lum = new Float32Array(w * h); for (let i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      const sorted = Array.from(lum.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b), paper = sorted[Math.floor(sorted.length * 0.9)] || 255;
      const hi = paper - 18, lo = paper - 90;
      box = { x0: w, y0: h, x1: -1, y1: -1 };
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const i = y * w + xx, l = lum[i], a = px[i * 4 + 3] / 255;
        const ink = l >= hi ? 0 : l <= lo ? 1 : (hi - l) / (hi - lo);
        const alpha = Math.round(255 * ink * a);
        px[i * 4] = 16; px[i * 4 + 1] = 34; px[i * 4 + 2] = 42; px[i * 4 + 3] = alpha;
        if (alpha > 60) { if (xx < box.x0) box.x0 = xx; if (xx > box.x1) box.x1 = xx; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
      }
      if (box.x1 < 0) throw new Error('No se encontró la firma en la imagen. Pruebe con más luz o desmarque «Quitar el fondo».');
      x.putImageData(d, 0, 0);
    }
    const pad = Math.round(Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.04) + 4;
    const sx = Math.max(0, box.x0 - pad), sy = Math.max(0, box.y0 - pad), sw = Math.min(w, box.x1 + pad + 1) - sx, sh = Math.min(h, box.y1 + pad + 1) - sy;
    const f = Math.min(1, 480 / sw, 180 / sh), o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(sw * f)); o.height = Math.max(1, Math.round(sh * f));
    o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

/* Ajusta el logo a un tamaño liviano para los documentos (máximo 600×240), conservando la transparencia. */
async function logoFromImage(file) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error('Use una imagen PNG, JPG, WEBP o SVG.');
  if (file.size > 5 * 1048576) throw new Error('La imagen supera 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo leer la imagen.')); i.src = url; });
    const w0 = img.naturalWidth || 600, h0 = img.naturalHeight || 240, k = Math.min(1, 600 / w0, 240 / h0);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/png');
    if (out.length > 300000) { const j = document.createElement('canvas'); j.width = c.width; j.height = c.height; const jx = j.getContext('2d'); jx.fillStyle = '#fff'; jx.fillRect(0, 0, j.width, j.height); jx.drawImage(c, 0, 0); out = j.toDataURL('image/jpeg', 0.88); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/* Verificación en dos pasos: activar con QR, ver códigos de recuperación, desactivar. */
async function draw2fa(step, data) {
  const box = $('#tfbody'); if (!box) return;
  let st; try { st = await api('/auth/2fa'); } catch (e) { box.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const codesHTML = codes => `<div class="banner ok"><b>Guarde estos códigos de recuperación</b> en un lugar seguro (impresos o en su gestor de contraseñas). Cada uno sirve una sola vez si pierde el teléfono. No se volverán a mostrar.</div>
    <div class="card" style="font-family:var(--f-mono);font-size:15px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px" id="tfcodes">${codes.map(c => `<span>${esc(c)}</span>`).join('')}</div>
    <div class="row"><button class="btn sm" type="button" id="tfcopy">Copiar</button><button class="btn sm" type="button" id="tfdl">Descargar .txt</button></div>`;
  if (step === 'codes') {
    box.innerHTML = codesHTML(data) + '<div class="row end"><button class="btn pri" type="button" id="tfdone">Ya los guardé</button></div>';
    $('#tfcopy').onclick = async () => { try { await navigator.clipboard.writeText(data.join('\n')); toast('Códigos copiados.'); } catch (e) { toast('No se pudo copiar; selecciónelos y cópielos.'); } };
    $('#tfdl').onclick = () => downloadFile('codigos-recuperacion-alter-karute.txt', 'Códigos de recuperación de Alter-Karute (' + (S.user && S.user.email) + ')\nCada código sirve una sola vez.\n\n' + data.join('\n') + '\n');
    $('#tfdone').onclick = () => draw2fa();
    return;
  }
  if (step === 'setup') {
    let qr = ''; try { const q = qrcode(0, 'M'); q.addData(data.uri); q.make(); qr = q.createSvgTag(4, 2); } catch (e) { /* sin QR */ }
    box.innerHTML = `<ol style="margin:0;padding-left:20px;line-height:1.7"><li>Instale en su teléfono una app autenticadora: Google Authenticator, Microsoft Authenticator o Authy.</li><li>En la app, agregue una cuenta y escanee este código QR.</li><li>Escriba abajo el código de 6 dígitos que aparece.</li></ol>
      <div class="row" style="align-items:center"><div style="background:#fff;padding:6px;border-radius:8px;border:1px solid var(--line)">${qr.replace('<svg ', '<svg style="width:180px;height:180px" ')}</div>
      <div style="font-size:13px;color:var(--muted);max-width:260px">Si no puede escanear, escriba esta clave en la app:<br><b style="font-family:var(--f-mono);color:var(--ink);word-break:break-all">${esc(data.secret.replace(/(.{4})/g, '$1 ').trim())}</b></div></div>
      <div class="row" style="align-items:flex-end"><div class="fld" style="max-width:220px"><label for="tf_code">Código de la app</label>${CODE_INPUT('tf_code')}</div><button class="btn pri" type="button" id="tfenable">Activar</button><button class="btn" type="button" id="tfcancel">Cancelar</button></div>`;
    $('#tfcancel').onclick = () => draw2fa();
    $('#tfenable').onclick = async () => {
      setBusy($('#tfenable'), true);
      try { const r = await api('/auth/2fa/enable', { method: 'POST', body: { code: $('#tf_code').value.trim() } }); S.user.totp = true; $('#tfbox summary').innerHTML = 'Verificación en dos pasos <span class="chip ok" style="text-transform:none;letter-spacing:0">Activa</span>'; toast('Verificación en dos pasos activada.'); draw2fa('codes', r.recovery_codes); }
      catch (e) { setBusy($('#tfenable'), false); toast(e.message); }
    };
    $('#tf_code').focus();
    return;
  }
  if (!st.enabled) {
    box.innerHTML = `<p style="margin:0">Al ingresar, además de la contraseña se pide un código que cambia cada 30 segundos en su teléfono. Así, aunque alguien conozca su contraseña, no puede entrar a sus fichas.</p>
      <div class="row end"><button class="btn pri" type="button" id="tfstart">Activar verificación en dos pasos</button></div>`;
    $('#tfstart').onclick = async () => { try { draw2fa('setup', await api('/auth/2fa/setup', { method: 'POST' })); } catch (e) { toast(e.message); } };
    return;
  }
  box.innerHTML = `<div class="banner ok">Activa. Le quedan <b>${st.recovery_left}</b> códigos de recuperación.</div>
    <div class="grid"><div class="fld"><label for="tf_pw">Contraseña</label><input id="tf_pw" type="password" autocomplete="current-password"></div><div class="fld"><label for="tf_c2">Código de la app (o de recuperación)</label>${CODE_INPUT('tf_c2')}</div></div>
    <div class="row" style="justify-content:space-between"><button class="btn warn" type="button" id="tfoff">Desactivar</button><button class="btn" type="button" id="tfnew">Generar nuevos códigos de recuperación</button></div>
    <p style="margin:0;font-size:12px;color:var(--muted)">Para desactivar se piden la contraseña y un código. Para generar códigos nuevos basta un código de la app; los anteriores dejan de servir.</p>
    ${st.remember_days ? `<div class="sec" style="margin-top:6px"><b style="font-size:14px">Dispositivos recordados</b>
    <p style="margin:4px 0;font-size:13px;color:var(--muted)">En estos dispositivos no se pide el código mientras se usen al menos una vez cada ${st.remember_days} días. Cambiar la contraseña también los olvida.</p>
    ${(st.devices || []).length ? `<ul style="margin:4px 0 8px;padding-left:18px;font-size:14px">${st.devices.map(d => `<li>${esc(d.label)} · último uso ${esc(fmtDT(d.last_used))}</li>`).join('')}</ul>
    <div class="row end"><button class="btn sm" type="button" id="tfforget">Olvidar todos los dispositivos</button></div>` : '<p style="margin:0;font-size:13px">Ninguno por ahora.</p>'}</div>` : ''}`;
  $('#tfoff').onclick = async () => {
    try { await api('/auth/2fa/disable', { method: 'POST', body: { password: $('#tf_pw').value, code: $('#tf_c2').value.trim() } }); S.user.totp = false; $('#tfbox summary').innerHTML = 'Verificación en dos pasos <span class="chip warn" style="text-transform:none;letter-spacing:0">Inactiva</span>'; toast('Verificación en dos pasos desactivada.'); draw2fa(); }
    catch (e) { toast(e.message); }
  };
  if ($('#tfforget')) $('#tfforget').onclick = async () => {
    try { await api('/auth/2fa/devices/forget', { method: 'POST' }); toast('Listo: la próxima vez se pedirá el código en todos los dispositivos.'); draw2fa(); }
    catch (e) { toast(e.message); }
  };
  $('#tfnew').onclick = async () => {
    try { const r = await api('/auth/2fa/recovery', { method: 'POST', body: { code: $('#tf_c2').value.trim() } }); draw2fa('codes', r.recovery_codes); }
    catch (e) { toast(e.message); }
  };
}

/* ----- Mis formatos: único lugar para estructuras, plantillas, modelos y frases ----- */
/* Mismo orden que las pestañas de la ficha del consultante; luego lo que se usa en varias partes. */
const HUB = [['pestanas', 'Pestañas'], ['datos', 'Datos del consultante'], ['consent', 'Consentimientos']];
/* Barra de Mis formatos: sin las pestañas ocultas, con los nombres propios y con las pestañas nuevas. */
const hubList = () => { const c = tabsConf(), oc = c.ocultas || [], nm = c.nombres || {};
  return HUB.filter(([k]) => !oc.includes(k)).map(([k, l]) => [k, nm[k] || l]).concat((c.extra || []).map(x => [x.id, x.nombre])); };
const hubTabs = active => `<div class="tabs hubtabs" role="tablist" aria-label="Secciones de Mis formatos">${hubList().map(([k, l]) => `<button type="button" class="tab ${active === k ? 'on' : ''}" role="tab" aria-selected="${active === k}" data-hub="${k}">${l}</button>`).join('')}</div>`;
const isFmt = k => ['intake', 'evol', 'datos'].includes(k) || String(k).startsWith('x_');
function openHub(k) {
  if (ED && isFmt(k)) { ED.which = k; return drawFormats(); }  // conserva lo no guardado
  const root = $('#modal-root'); root.onclick = root.oninput = root.onchange = null; ED = null;
  if (isFmt(k)) return ACT.formats({ dataset: { hub: k } });
  if (k === 'pestanas') return tabsManage();
  if (k === 'consent') return ACT.consentManage();
  if (k === 'informes') return ACT.tplManage();
  if (k === 'escalas') return ACT.scaleManage();
}
/* Al cerrar Mis formatos, lo que esté abierto debajo se actualiza (selectores de plantilla, modelos, frases). */
function hubClosed() {
  if ($('#f_plantilla')) refreshTplSelect();
  $$('.phint').forEach(x => { x.outerHTML = phraseHint(); });
}

/* ----- Mis formatos de primera vez y sesión ----- */
let ED = null;
/* Un apartado sin campos es «solo título»: se guarda como un único campo sin nombre (no repite subtítulo). */
const secFrom = ([t, fs, g]) => { const solo = fs.length === 1 && !fs[0][1]; return { t, g: g === 'genograma', img: g === 'imagen', soloKey: solo ? fs[0][0] : null, soloR: solo ? fs[0][2] : 4, soloD: solo ? fs[0][3] || '' : '', fs: solo ? [] : fs.map(([k, l, r, d]) => ({ k, l, r, d: d || '' })) }; };
const edFrom = (intake, evol, datos) => ({ intake: intake.map(secFrom), evol: evol.map(([k, l, r, d]) => ({ k, l, r, d: d || '' })), datos: (datos || []).map(secFrom) });
const newKey = () => 'c' + Math.random().toString(36).slice(2, 8);
const ROWS = [[2, 'Corto'], [3, 'Medio'], [5, 'Largo']];
const secList = () => ED[ED.which === 'datos' ? 'datos' : String(ED.which).startsWith('x_') ? ED.which : 'intake'];
/* Texto inicial: lo que el campo trae escrito en cada nota nueva (se puede borrar o cambiar al escribir). */
const edInit = (val, attr, label) => `<details class="edinit" ${val ? 'open' : ''}><summary>Texto inicial${val ? '' : ' (opcional)'}</summary><textarea ${attr} rows="2" aria-label="Texto inicial de ${esc(label)}" placeholder="Lo que este campo trae escrito en cada nota nueva">${esc(val || '')}</textarea></details>`;
function edField(f, path, noSize) {
  return `<div class="edfw"><div class="edf"><input type="text" data-fm-l="${path}" value="${esc(f.l)}" maxlength="120" aria-label="Nombre del campo">${noSize ? '' : `<select data-fm-r="${path}" aria-label="Tamaño">${ROWS.map(([v, n]) => `<option value="${v}" ${[2, 3, 5].reduce((a, x) => Math.abs(x - (+f.r || 3)) < Math.abs(a - (+f.r || 3)) ? x : a, 3) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`}
  <button class="btn sm" data-fm="fup:${path}" aria-label="Subir">↑</button><button class="btn sm" data-fm="fdn:${path}" aria-label="Bajar">↓</button><button class="btn sm warn" data-fm="fdel:${path}" aria-label="Quitar campo">✕</button></div>${noSize ? '' : edInit(f.d, `data-fm-d="${path}"`, f.l)}</div>`;
}
function secCard(sc, si, isDatos) {
  const head = `<div class="edf"><input type="text" data-fm-t="${si}" value="${esc(sc.t)}" maxlength="120" aria-label="Título del apartado" style="font-weight:600"><button class="btn sm" data-fm="sup:${si}" aria-label="Subir apartado">↑</button><button class="btn sm" data-fm="sdn:${si}" aria-label="Bajar apartado">↓</button><button class="btn sm warn" data-fm="sdel:${si}" aria-label="Quitar apartado">✕</button></div>`;
  if (sc.img) return `<div class="card">${head}<p style="margin:0;font-size:13px;color:var(--muted)">Apartado de imagen: el terapeuta sube una imagen de su computador en cada ficha. Quítelo con ✕ si no lo usa.</p></div>`;
  if (sc.g && !sc.fs.length) return `<div class="card">${head}<p style="margin:0;font-size:13px;color:var(--muted)">Apartado de genograma: espacio para dibujarlo o subir una imagen. Quítelo con ✕ si no lo usa.</p></div>`;
  const body = sc.fs.length ? sc.fs.map((f, fi) => edField(f, si + '.' + fi, isDatos)).join('') : `<p style="margin:0;font-size:13px;color:var(--muted)">Solo título: se escribe en un único espacio, sin subtítulos. Use «+ Campo» si quiere dividirlo.</p>${isDatos ? '' : edInit(sc.soloD, `data-fm-sd="${si}"`, sc.t)}`;
  const geno = sc.g ? `<div class="row"><span class="chip">Incluye el genograma al final</span><button class="btn sm warn" data-fm="gdel:${si}">Quitar genograma</button></div>` : '';
  return `<div class="card">${head}${body}${geno}<div class="row"><button class="btn sm" data-fm="fadd:${si}">+ Campo</button></div></div>`;
}
/* Clave final de un campo propio de Datos (al guardar se les antepone «x»). */
const fkey = k => (String(k).startsWith('x') ? k : 'x' + k);
/* Campos del formulario que se envía al consultante nuevo: los base y los propios de este formato. */
function formCard() {
  ED.datos.forEach(sc => { if (!sc.g && !sc.fs.length && !sc.soloKey) sc.soloKey = 'x' + newKey(); });
  const own = ED.datos.flatMap(sc => sc.g ? [] : sc.fs.length ? sc.fs.map(f => [fkey(f.k), sc.t + ': ' + (f.l || '…')]) : [[sc.soloKey, sc.t]]);
  const row = (k, n, fixed) => `<div class="row"><span style="flex:1">${esc(n)}</span>${fixed ? '<span class="chip">Siempre</span>' : `<button class="btn sm ${ED.formulario.includes(k) ? 'pri' : ''}" data-fm="fo:${k}">${ED.formulario.includes(k) ? 'Incluido · quitar' : 'Agregar'}</button>`}</div>`;
  return `<div class="card"><b>Formulario del consultante nuevo</b><p class="stnote" style="margin:4px 0">Elija qué datos le pide a quien recibe el formulario. Los campos propios aparecen aquí cuando los guarda en este formato.</p>${FORM_BASE.map(([k, n]) => row(k, n, k === 'nombres')).join('')}${own.length ? '<b style="font-size:13px">Mis campos</b>' + own.map(([k, n]) => row(k, n)).join('') : ''}</div>`;
}
function drawFormats() {
  const root = $('#modal-root'), prev = root.querySelector('.modal'), top = prev ? prev.scrollTop : 0, w = ED.which;
  const isX = String(w).startsWith('x_'), hasGeno = (isX ? ED[w] : ED.intake).some(sc => sc.g);
  const intro = {  intake: 'Los cambios solo se aplican a las <b>nuevas</b> consultas de primera vez. Las ya firmadas conservan el formato con el que se firmaron.', evol: 'Los cambios solo se aplican a las <b>nuevas</b> sesiones. Las ya firmadas conservan el formato con el que se firmaron.', datos: 'Agregue los datos sociodemográficos que usted toma y que no vienen en la pestaña Datos. Aparecen al final de esa pestaña para todos sus consultantes.' }[w] || 'Arme los apartados y campos de esta pestaña. Los cambios se aplican a todas las fichas; lo ya escrito se conserva.';
  const body = w === 'evol'
    ? `<p class="stnote" style="margin:0">La fecha y hora, la modalidad, las personas presentes van siempre en la sesión: aquí arma el resto.</p><div class="card">${ED.evol.map((f, fi) => edField(f, String(fi))).join('') || '<p style="margin:0;color:var(--muted)">Aún no tiene campos. Agréguelos uno por uno o use el formato sugerido.</p>'}<div class="row"><button class="btn sm" data-fm="fadd:">+ Campo</button>${ED.evol.length ? '' : '<button class="btn sm" data-fm="reset">Usar el formato sugerido</button>'}</div></div>`
    : (w === 'datos' ? `<div class="card"><b>Apartados de la ficha</b><p class="stnote" style="margin:4px 0">Identificación siempre se muestra. Muestre solo los que quiera usar; los datos ya escritos no se borran.</p>${BASE_SECS.map(([id, n]) => `<div class="row"><span style="flex:1">${n}</span><button class="btn sm ${ED.ocultos.includes(id) ? '' : 'pri'}" data-fm="oc:${id}">${ED.ocultos.includes(id) ? 'Mostrar' : 'Visible · ocultar'}</button></div>`).join('')}</div>` : '') + secList().map((sc, si) => secCard(sc, si, w === 'datos')).join('') + `<div class="row"><button class="btn" data-fm="sadd">+ Apartado</button>${(w === 'intake' || isX) && !hasGeno ? '<button class="btn" data-fm="gadd">+ Genograma</button>' : ''}${isX ? '<button class="btn" data-fm="iadd">+ Imagen</button>' : ''}</div>` + (w === 'datos' ? formCard() : '');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis formatos"><div class="box" id="fmform"><div class="row mfhead" style="justify-content:space-between"><h3 style="flex:1">Mis formatos</h3><button class="btn sm pri" data-fm="save">Guardar</button><button class="btn sm" data-fm="close">Cerrar</button></div>
  ${hubTabs(w)}
  <p style="margin:0;font-size:13px;color:var(--muted)">${intro}</p>
  ${body || ''}
  <div class="row" style="justify-content:space-between">${w === 'evol' ? '<span></span>' : '<button class="btn warn" data-fm="reset">Restaurar formato base</button>'}<button class="btn pri" data-fm="save">Guardar formato</button></div></div></div>`;
  const m = root.querySelector('.modal'); m.scrollTop = top;
}
const edList = (path) => path.includes('.') ? secList()[+path.split('.')[0]].fs : ED.evol;
const edIdx = path => +path.split('.').pop();
const edMove = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
ACT.formats = b => {
  stepDone('formatos');
  const hub = b && b.dataset && b.dataset.hub;
  if (!hub) return openHub('pestanas');
  if (!isFmt(hub)) return openHub(hub);
  const pf = S.profile.formatos || {};
  ED = Object.assign({ which: hub || 'datos', ocultos: [...(pf.ocultos || BASE_SECS.map(s => s[0]))], formulario: [...(pf.formulario || FORM_DEFAULT)] }, Object.fromEntries(((pf.pestanas || {}).extra || []).map(x => [x.id, (x.secs || []).map(secFrom)])), edFrom(clone(pf.intake || INTAKE), clone(pf.evol || []), clone(pf.datos || [])));
  drawFormats();
  const root = $('#modal-root');
  root.oninput = e => {
    const t = e.target;
    if (!ED) return;
    if (t.dataset.fmT !== undefined) secList()[+t.dataset.fmT].t = t.value;
    else if (t.dataset.fmL !== undefined) edList(t.dataset.fmL)[edIdx(t.dataset.fmL)].l = t.value;
    else if (t.dataset.fmR !== undefined) edList(t.dataset.fmR)[edIdx(t.dataset.fmR)].r = +t.value;
    else if (t.dataset.fmD !== undefined) edList(t.dataset.fmD)[edIdx(t.dataset.fmD)].d = t.value;
    else if (t.dataset.fmSd !== undefined) secList()[+t.dataset.fmSd].soloD = t.value;
  };
  root.onchange = null;
  root.onclick = e => {
    const b = e.target.closest('[data-fm]'); if (!b || !ED) return;
    const [op, arg = ''] = b.dataset.fm.split(':');
    const L = secList();
    if (op === 'close') { ED = null; root.innerHTML = ''; root.onclick = root.oninput = root.onchange = null; return; }
    if (op === 'tab') ED.which = arg;
    else if (op === 'oc') { const i = ED.ocultos.indexOf(arg); if (i < 0) ED.ocultos.push(arg); else ED.ocultos.splice(i, 1); }
    else if (op === 'fo') { const i = ED.formulario.indexOf(arg); if (i < 0) ED.formulario.push(arg); else ED.formulario.splice(i, 1); }
    else if (op === 'sadd') { if (L.length >= 15) return toast('Máximo 15 apartados.'); L.push({ t: 'Nuevo apartado', g: false, fs: [], soloKey: null, soloR: 4 }); }
    else if (op === 'gadd') { if (ED.which === 'intake' || !L) ED.intake.push({ t: 'Genograma', g: true, fs: [] }); else L.push({ t: 'Genograma', g: true, fs: [] }); }
    else if (op === 'iadd') { if (L.length >= 15) return toast('Máximo 15 apartados.'); L.push({ t: 'Imagen', g: false, img: true, fs: [], soloKey: 'i' + newKey(), soloR: 1 }); }
    else if (op === 'gdel') { const sc = L[+arg]; sc.g = false; }
    else if (op === 'sup') edMove(L, +arg, -1);
    else if (op === 'sdn') edMove(L, +arg, 1);
    else if (op === 'sdel') { L.splice(+arg, 1); }
    else if (op === 'fadd') { const l = arg === '' ? ED.evol : L[+arg].fs; if (l.length >= 25) return toast('Máximo 25 campos.'); l.push({ k: newKey(), l: 'Nuevo campo', r: 3 }); }
    else if (op === 'fup') edMove(edList(arg), edIdx(arg), -1);
    else if (op === 'fdn') edMove(edList(arg), edIdx(arg), 1);
    else if (op === 'fdel') { const l = edList(arg); if (l.length < 2 && arg !== '' && arg.includes('.') === false) return toast('Debe quedar al menos un campo.'); l.splice(edIdx(arg), 1); }
    else if (op === 'reset') { const d = edFrom(clone(INTAKE), clone(NOTE_FIELDS), []); ED[ED.which] = d[ED.which] || []; }
    else if (op === 'save') return saveFormats();
    drawFormats();
  };
};
function secTo(sc, isDatos) {
  if (sc.img) return [sc.t.trim(), [[sc.soloKey || 'i' + newKey(), '', 1]], 'imagen'];
  if (!sc.fs.length) {
    if (sc.g) return [sc.t.trim(), [], 'genograma'];
    const solo = [sc.soloKey || (isDatos ? 'x' : '') + newKey(), '', isDatos ? 1 : (sc.soloR || 4)];
    if (!isDatos && (sc.soloD || '').trim()) solo.push(sc.soloD.slice(0, 20000));
    return [sc.t.trim(), [solo]];
  }
  const out = [sc.t.trim(), sc.fs.map(f => { const x = [f.k.startsWith('x') || !isDatos ? f.k : 'x' + f.k, f.l.trim(), +f.r || 3]; if (!isDatos && (f.d || '').trim()) x.push(f.d.slice(0, 20000)); return x; })];
  if (sc.g) out.push('genograma');
  return out;
}
function saveFormats() {
  const bad = m => { toast(m); return false; };
  const intake = ED.intake.map(sc => secTo(sc, false)), datos = ED.datos.map(sc => secTo(sc, true));
  const evol = ED.evol.map(f => { const x = [f.k, f.l.trim(), +f.r || 3]; if ((f.d || '').trim()) x.push(f.d.slice(0, 20000)); return x; });
  if (intake.concat(datos).some(sc => !sc[0])) return bad('Cada apartado necesita un título.');
  if (intake.concat(datos).some(sc => sc[1].length > 1 && sc[1].some(f => !f[1]))) return bad('Cada campo necesita un nombre.');
  if (evol.some(f => !f[1])) return bad('Cada campo de la sesión necesita un nombre.');
  if (intake.filter(sc => sc[2] === 'genograma').length > 1) return bad('Solo puede haber un genograma.');
  const pc = (S.profile.formatos || {}).pestanas || {}, extra = (pc.extra || []).map(x => ({ ...x, secs: (ED[x.id] || x.secs || []).map(sc => secTo(sc, false)) }));
  if (extra.some(x => x.secs.some(sc => !sc[0]))) return bad('Cada apartado necesita un título.');
  if (extra.some(x => x.secs.filter(sc => sc[2] === 'genograma').length > 1)) return bad('Solo puede haber un genograma por pestaña.');
  const snap = clone(S.profile);
  S.profile.formatos = Object.assign({}, S.profile.formatos, { intake, evol, datos, ocultos: ED.ocultos || [], formulario: ED.formulario.filter(k => k === 'nombres' || FORM_BASE.some(b => b[0] === k) || datos.some(sc => (sc[1] || []).some(f => f[0] === k))), pestanas: Object.assign({}, pc, { extra }) });
  persist([S.profile], $('[data-fm="save"]')).then(ok => { if (!ok) { restore(S.profile, snap); return; } finishFormats(); });
}
/* Pestañas de la ficha: renombrar, ocultar y crear propias (texto libre por consultante). */
let TM = null;
const grp = x => (TM.grupos.some(g => g.id === x.gid) ? x.gid : '');
const tabsDraw = () => {
  const root = $('#modal-root'), prevM = root.querySelector('.modal'), top = prevM ? prevM.scrollTop : 0, row = (id, n, hid, ex) => `<div class="edf"><input type="text" data-tm-n="${id}" value="${esc(n)}" maxlength="60" placeholder="Nueva pestaña" aria-label="Nombre de la pestaña">${id === 'datos' ? '<span class="chip">Siempre visible</span>' : ex ? `<button class="btn sm" data-tm="mod:${id}" title="Una sola vez: datos que casi no cambian. Por sesión: se agrega una entrada con fecha en cada encuentro.">${(TM.extra.find(y => y.id === id) || {}).modo === 'sesion' ? 'Por sesión' : 'Una sola vez'} · cambiar</button>${TM.grupos.length ? `<select class="btn sm" data-tm-s="${id}" aria-label="Grupo de la pestaña"><option value="">Sin grupo</option>${TM.grupos.map(g => `<option value="${esc(g.id)}" ${(TM.extra.find(y => y.id === id) || {}).gid === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select>` : ''}<button class="btn sm warn" data-tm="del:${id}">Borrar</button>` : `<button class="btn sm ${hid ? '' : 'pri'}" data-tm="hid:${id}">${hid ? 'Oculta · mostrar' : 'Visible · ocultar'}</button>`}</div>`;
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mis formatos"><div class="box"><div class="row mfhead" style="justify-content:space-between"><h3 style="flex:1">Mis formatos</h3><button class="btn sm pri" data-tm="save">Guardar</button><button class="btn sm" data-tm="close">Cerrar</button></div>${hubTabs('pestanas')}
  <p style="margin:0;font-size:13px;color:var(--muted)">Cambie el nombre, oculte o cree las pestañas de la ficha del consultante. Ocultar no borra lo ya escrito. Para cada pestaña nueva elija «Una sola vez» (datos que casi no cambian, como los del consultante) o «Por sesión» (una entrada con fecha en cada encuentro).</p>
  <h4 style="margin:12px 0 4px">Pestañas de la ficha</h4><div class="card">${TABS.filter(t => t[0] !== 'archivo').map(([k, l]) => row(k, TM.nombres[k] || l, TM.ocultas.includes(k), false)).join('')}</div>
  <div class="row" style="justify-content:space-between;margin:12px 0 4px"><span></span><button class="btn sm" data-tm="add:">+ Pestaña nueva</button></div><div class="card">${TM.extra.filter(x => !grp(x)).map(x => row(x.id, x.nombre, false, true)).join('') || '<p style="margin:0;color:var(--muted);font-size:13px">Aún no ha creado pestañas propias. Use «+ Pestaña nueva».</p>'}</div>
  ${TM.grupos.map(g => `<div class="row" style="justify-content:space-between;margin:12px 0 4px"><input type="text" data-tm-g="${esc(g.id)}" value="${esc(g.nombre)}" maxlength="60" aria-label="Nombre del grupo" style="flex:1;font-weight:600"><button class="btn sm" data-tm="add:${esc(g.id)}">+ Pestaña nueva</button><button class="btn sm warn" data-tm="delg:${esc(g.id)}" title="Borra el grupo y todas sus pestañas">Quitar grupo</button></div><div class="card">${TM.extra.filter(x => grp(x) === g.id).map(x => row(x.id, x.nombre, false, true)).join('') || '<p style="margin:0;color:var(--muted);font-size:13px">Sin pestañas en este grupo.</p>'}</div>`).join('')}
  <div class="row"><button class="btn" data-tm="addg">+ Grupo nuevo</button><button class="btn" data-tm="coach:base">+ Coaching: modelos base (4)</button><button class="btn" data-tm="coach:escuelas">+ Coaching: escuelas (5)</button><button class="btn" data-tm="cria:base">+ Crianza: modelos base (5)</button><button class="btn" data-tm="cria:enfoques">+ Crianza: enfoques y temas (5)</button></div>
  <h4 style="margin:12px 0 4px">Al final</h4><div class="card">${TABS.filter(t => t[0] === 'archivo').map(([k, l]) => row(k, TM.nombres[k] || l, TM.ocultas.includes(k), false)).join('')}</div>
  <div class="row end"><button class="btn pri" data-tm="save">Guardar</button></div></div></div>`;
  const nm = root.querySelector('.modal'); if (nm) nm.scrollTop = top;
};
function tabsManage() {
  const c = tabsConf(), root = $('#modal-root'); ED = null;
  TM = { nombres: { ...(c.nombres || {}) }, ocultas: [...(c.ocultas || [])], extra: clone(c.extra || []), grupos: clone(c.grupos || []) };
  coachGroups();
  tabsDraw();
  root.oninput = e => { const gs = e.target.dataset.tmS; if (gs && TM) { const x = TM.extra.find(y => y.id === gs); if (x) { x.gid = e.target.value; tabsDraw(); } return; } const gi = e.target.dataset.tmG; if (gi && TM) { const g = TM.grupos.find(y => y.id === gi); if (g) g.nombre = e.target.value; return; } const id = e.target.dataset.tmN; if (!id || !TM) return; const x = TM.extra.find(y => y.id === id); if (x) x.nombre = e.target.value; else TM.nombres[id] = e.target.value; };
  root.onclick = e => {
    const h = e.target.closest('[data-hub]'); if (h) return openHub(h.dataset.hub);
    const b = e.target.closest('[data-tm]'); if (!b || !TM) return;
    const [op, arg = ''] = b.dataset.tm.split(':');
    if (op === 'close') { TM = null; root.innerHTML = ''; root.onclick = root.oninput = null; return; }
    if (op === 'hid') { const i = TM.ocultas.indexOf(arg); if (i < 0) TM.ocultas.push(arg); else TM.ocultas.splice(i, 1); }
    else if (op === 'mod') { const x = TM.extra.find(y => y.id === arg); if (x) x.modo = x.modo === 'sesion' ? 'unica' : 'sesion'; }
    else if (op === 'coach') coachAdd(arg);
    else if (op === 'cria') crianzaAdd(arg);
    else if (op === 'del') TM.extra = TM.extra.filter(x => x.id !== arg);
    else if (op === 'add') { if (TM.extra.length >= 30) return toast('Máximo 30 pestañas nuevas.'); TM.extra.push({ id: 'x_' + newKey(), nombre: '', modo: 'unica', secs: [], gid: arg }); }
    else if (op === 'addg') { if (TM.grupos.length >= 10) return toast('Máximo 10 grupos.'); TM.grupos.push({ id: 'g_' + newKey(), nombre: 'Grupo nuevo' }); }
    else if (op === 'delg') { TM.extra = TM.extra.filter(x => x.gid !== arg); TM.grupos = TM.grupos.filter(g => g.id !== arg); }
    else if (op === 'save') {
      const nombres = Object.fromEntries(Object.entries(TM.nombres).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      if (TM.extra.some(x => !x.nombre.trim())) return toast('Cada pestaña necesita un nombre.');
      if (TM.grupos.some(g => !g.nombre.trim())) return toast('Cada grupo necesita un nombre.');
      const orden = [''].concat(TM.grupos.map(g => g.id)), extraOrd = TM.extra.slice().sort((x, y) => orden.indexOf(grp(x)) - orden.indexOf(grp(y)));
      const snap = clone(S.profile); S.profile.formatos = Object.assign({}, S.profile.formatos, { pestanas: { nombres, ocultas: TM.ocultas, grupos: TM.grupos.map(g => ({ id: g.id, nombre: g.nombre.trim() })), extra: extraOrd.map(x => ({ id: x.id, nombre: x.nombre.trim(), modo: x.modo === 'sesion' ? 'sesion' : 'unica', secs: x.secs || [], gid: grp(x) || undefined })) } });
      const t = tabsList().map(x => x[0]); if (!t.includes(S.tab)) S.tab = 'datos';
      return persist([S.profile], b).then(ok => { if (!ok) { restore(S.profile, snap); return; } toast('Pestañas guardadas.'); render(); tabsDraw(); });
    }
    tabsDraw();
  };
}
/* Pestaña propia: texto libre guardado en la ficha. */
const extraFields = (x, vo) => (x.secs || []).length
  ? x.secs.map(([t, fs, g]) => g === 'genograma' ? `<div class="sec"><h3>${esc(t)}</h3>${genoBlock()}</div>` : g === 'imagen' ? `<div class="sec"><h3>${esc(t)}</h3>${genoBlock(fs[0][0])}</div>` : `<div class="sec"><h3>${esc(t)}</h3><div class="grid">${fs.map(f => F(f[1], f[0], vo[f[0]] || f[3] || '', { type: 'area', rows: f[2] || 3, wide: true, aria: t })).join('')}</div></div>`).join('')
  : `<div class="sec"><div class="fld"><textarea id="f_extra" data-f="extra" rows="10" aria-label="${esc(x.nombre)}">${esc(typeof vo === 'string' ? vo : (vo.extra || ''))}</textarea></div></div>`;
const extraOf = x => (x.secs || []).length ? (o => o) : (o => ({ extra: o.extra || '' }));
function tabExtra(p) {
  const x = (tabsConf().extra || []).find(y => y.id === S.tab); if (!x) return '';
  const v = (p.extras || {})[x.id];
  if (x.modo !== 'sesion') {
    const vo = v && typeof v === 'object' ? v : { extra: typeof v === 'string' ? v : '' };
    return `<div class="sec"><h3>${esc(x.nombre)}</h3><p class="stnote">Datos de una sola vez: se actualizan cuando cambian.</p></div>${extraFields(x, vo)}<div class="row end"><button class="btn pri" data-act="saveExtra">Guardar</button></div>`;
  }
  const list = (Array.isArray(v) ? v : []).slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const ed = S.extraEd && S.extraEd.tab === x.id ? S.extraEd.id : null;
  if (ed) {
    const cur = ed === 'new' ? { at: nowISO().slice(0, 10), v: {} } : (list.find(e => e.id === ed) || { at: nowISO().slice(0, 10), v: {} });
    return `<div class="sec"><h3>${ed === 'new' ? 'Nueva entrada' : 'Editar entrada'} · ${esc(x.nombre)}</h3><div class="grid">${F('Fecha', 'extraAt', (cur.at || '').slice(0, 10), { type: 'date' })}${F('Hora', 'extraHora', cur.hora || '', { type: 'time' })}${F('Lugar', 'extraLugar', cur.lugar || '', { ph: 'Ej.: consultorio, domicilio, en línea' })}</div></div>${extraFields(x, cur.v || {})}<div class="row end"><button class="btn" data-act="extraCancel">Cancelar</button><button class="btn pri" data-act="extraSave">Guardar entrada</button></div>`;
  }
  const show = e => (x.secs || []).length ? x.secs.map(([t, fs, g]) => g === 'genograma' ? (e.v || {}).genograma ? `<p style="margin:4px 0"><b>${esc(t)}:</b></p><img class="geno" src="${esc(e.v.genograma)}" alt="Genograma">` : '' : g === 'imagen' ? (e.v || {})[fs[0][0]] ? `<p style="margin:4px 0"><b>${esc(t)}:</b></p><img class="geno" src="${esc(e.v[fs[0][0]])}" alt="${esc(t)}">` : '' : fs.map(f => (e.v || {})[f[0]] ? `<p style="margin:4px 0"><b>${esc(f[1] || t)}:</b> ${esc(e.v[f[0]])}</p>` : '').join('')).join('') : `<p style="margin:4px 0">${esc((e.v || {}).extra || '')}</p>`;
  return `<div class="sec"><div class="row" style="justify-content:space-between"><h3 style="flex:1">${esc(x.nombre)} (${list.length})</h3><button class="btn pri" data-act="extraNew">Nueva entrada</button></div>
  ${list.length ? list.map(e => `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc((e.at || '').slice(0, 10))}${e.hora ? ' · ' + esc(e.hora) : ''}${e.lugar ? ' · ' + esc(e.lugar) : ''}</b><span><button class="btn sm" data-act="extraEdit" data-id="${e.id}">Editar</button> <button class="btn sm warn" data-act="extraDel" data-id="${e.id}">Borrar</button></span></div>${show(e)}</div>`).join('') : '<p class="stnote" style="text-align:center">Aún no hay entradas. Cada sesión se agrega aquí.</p>'}</div>`;
}
const extraCur = () => (tabsConf().extra || []).find(y => y.id === S.tab);
ACT.saveExtra = async b => {
  const p = curPatient(), snap = clone(p), o = readForm($('#tabbody'), {}), x = extraCur();
  if (geno) o.genograma = geno.data();
  Object.keys(genos).filter(Boolean).forEach(k => { o[k] = genos[k].data(); });
  p.extras = Object.assign({}, p.extras, { [S.tab]: extraOf(x)(o) });
  if (!(await persist([p], b))) { restore(p, snap); return; } toast('Guardado.');
};
ACT.extraNew = () => { S.extraEd = { tab: S.tab, id: 'new' }; render(); };
ACT.extraEdit = b => { S.extraEd = { tab: S.tab, id: b.dataset.id }; render(); };
ACT.extraCancel = () => { S.extraEd = null; render(); };
ACT.extraSave = async b => {
  const p = curPatient(), snap = clone(p), x = extraCur(), o = readForm($('#tabbody'), {}), id = S.extraEd && S.extraEd.id;
  if (geno) o.genograma = geno.data();
  Object.keys(genos).filter(Boolean).forEach(k => { o[k] = genos[k].data(); });
  const at = o.extraAt || nowISO().slice(0, 10), hora = o.extraHora || '', lugar = (o.extraLugar || '').trim(); delete o.extraAt; delete o.extraHora; delete o.extraLugar;
  const list = Array.isArray((p.extras || {})[S.tab]) ? clone(p.extras[S.tab]) : [], v = extraOf(x)(o);
  if (id && id !== 'new' && list.some(e => e.id === id)) Object.assign(list.find(e => e.id === id), { at, hora, lugar, v }); else list.push({ id: newId('e'), at, hora, lugar, v });
  p.extras = Object.assign({}, p.extras, { [S.tab]: list });
  if (!(await persist([p], b))) { restore(p, snap); return; } S.extraEd = null; toast('Entrada guardada.'); render();
};
ACT.extraDel = async b => {
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; }
  const p = curPatient(), snap = clone(p);
  p.extras = Object.assign({}, p.extras, { [S.tab]: (p.extras[S.tab] || []).filter(e => e.id !== b.dataset.id) });
  if (!(await persist([p], b))) { restore(p, snap); return; } render();
};
function finishFormats() {
  toast('Formato guardado.'); if (!S.dirty) render(); else hubClosed();
  drawFormats();  // el panel sigue abierto para seguir editando
}

