/* Formularios de datos: el terapeuta envía un enlace para que el consultante registre sus datos antes de la primera atención.
   Lo recibido queda pendiente de revisión; «Revisar y crear consultante» abre «Nuevo consultante» ya llenado (se guarda con las reglas de siempre). */
const FORMS = { n: 0, at: 0 };
const FORM_ESTADO = { pendiente: ['warn', 'Esperando al consultante'], recibido: ['ok', 'Recibido'], creado: ['', 'Consultante creado'], anulado: ['', 'Anulado'], vencido: ['danger', 'Vencido'] };
const formUrl = f => location.origin + '/formulario?t=' + f.enlace;

function formsBadge() {
  const b = $('#formsbtn'); if (!b) return;
  b.innerHTML = 'Enviar formulario a nuevo consultante' + (FORMS.n ? ` <span class="chip ok">${FORMS.n} recibido${FORMS.n === 1 ? '' : 's'}</span>` : '');
}
async function formsPoll() {
  if (!S.user || S.mode !== 'server' || TEAM() || Date.now() - FORMS.at < 120000) return;
  FORMS.at = Date.now();
  try { const l = await api('/formularios'); const n = l.filter(f => f.estado === 'recibido').length; if (n !== FORMS.n) { FORMS.n = n; formsBadge(); } } catch (e) { /* sin aviso: se reintenta */ }
}
setInterval(formsPoll, 5000);

function formRow(f) {
  const [cls, lab] = FORM_ESTADO[f.estado] || ['', f.estado];
  const who = f.nombre || f.para || 'Sin nombre';
  const acts = f.estado === 'pendiente' ? `<button class="btn sm" data-fm="copy" data-ref="${f.ref}">Copiar enlace</button>${f.para ? `<button class="btn sm" data-fm="mail" data-ref="${f.ref}">Reenviar correo</button>` : ''}<button class="btn sm warn" data-fm="cancel" data-ref="${f.ref}">Anular</button>`
    : f.estado === 'recibido' ? `<button class="btn sm pri" data-fm="review" data-ref="${f.ref}">Revisar y crear consultante</button><button class="btn sm warn" data-fm="cancel" data-ref="${f.ref}">Descartar</button>`
    : f.estado === 'anulado' ? `<button class="btn sm warn" data-fm="del" data-ref="${f.ref}">Eliminar</button>` : '';
  const when = f.estado === 'recibido' ? 'Recibido ' + fmtShort(f.recibido) : f.estado === 'pendiente' ? 'Vence ' + fmtShort(f.vence) : 'Enviado ' + fmtShort(f.creado);
  return `<div class="card"><div class="row" style="justify-content:space-between"><span><b>${esc(who)}</b>${f.nombre && f.para ? `<br><span class="ts">${esc(f.para)}</span>` : ''}<br><span class="ts">${esc(when)}${f.correoEnviado ? ' · correo enviado' : ''}</span></span><span class="chip ${cls}">${lab}</span></div>${acts ? `<div class="row">${acts}</div>` : ''}</div>`;
}

ACT.forms = async () => {
  const root = $('#modal-root'); let list = [];
  const close = () => { root.innerHTML = ''; root.onclick = null; };
  const draw = () => {
    FORMS.n = list.filter(f => f.estado === 'recibido').length; FORMS.at = Date.now(); formsBadge();
    const an = list.filter(f => f.estado === 'anulado').length;
    $('#fm_list').innerHTML = (an > 1 ? '<div class="row end"><button class="btn sm warn" data-fm="delall">Eliminar anulados (' + an + ')</button></div>' : '') + (list.map(formRow).join('') || '<p class="stnote">Aún no ha enviado formularios.</p>');
  };
  const load = async () => { try { list = await api('/formularios'); return true; } catch (e) { toast(e.message); return false; } };
  if (!(await load())) return;
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Formularios de datos"><div class="box" id="fmform" style="width:min(680px,100%)"><div class="row" style="justify-content:space-between"><h3>Formularios de datos</h3><button class="btn sm" data-fm="close">Cerrar</button></div>
    <p style="margin:0;font-size:14px">Envía un formulario para que el consultante registre tus datos antes de la primera atención. Lo que responda queda pendiente de tu revisión: tú decides cuándo crear tu ficha. El enlace se usa una vez y vence en 7 días.</p>
    <div class="card"><div class="grid">${F('Nombre del consultante (opcional)', 'fm_nombre', '')}${F('Correo del consultante', 'fm_correo', '', { type: 'email' })}</div>
      <div class="row end"><button class="btn" data-fm="new" data-send="0">Crear enlace para copiar</button><button class="btn pri" data-fm="new" data-send="1">Enviar por correo</button></div></div>
    <div id="fm_list"></div></div></div>`;
  draw();
  root.onclick = async e => {
    const b = e.target.closest('[data-fm]'); if (!b) return;
    const k = b.dataset.fm, ref = b.dataset.ref, f = list.find(x => x.ref === ref);
    try {
      if (k === 'close') return close();
      if (k === 'new') {
        const send = b.dataset.send === '1', o = readForm($('#fmform'), {});
        const r = await api('/formularios', { method: 'POST', body: { nombre: o.fm_nombre || '', correo: o.fm_correo || '', enviar: send } });
        if (send) toast(r.correoEnviado ? 'Formulario enviado por correo.' : (r.motivo || 'No se pudo enviar el correo.') + ' El enlace quedó creado: puedes copiarlo.');
        else { try { await navigator.clipboard.writeText(formUrl(r)); toast('Enlace copiado. Envíalo por correo o mensaje de texto.'); } catch (err) { toast('Enlace creado: usa «Copiar enlace» en la lista.'); } }
        ['fm_nombre', 'fm_correo'].forEach(id => { $('#f_' + id).value = ''; });
      } else if (k === 'copy') { try { await navigator.clipboard.writeText(formUrl(f)); toast('Enlace copiado.'); } catch (err) { toast('No se pudo copiar: ' + formUrl(f)); } return; }
      else if (k === 'mail') { const r = await api('/formularios/' + ref + '/correo', { method: 'POST' }); toast(r.correoEnviado ? 'Correo enviado.' : r.motivo || 'No se pudo enviar el correo.'); }
      else if (k === 'cancel') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; } await api('/formularios/' + ref + '/anular', { method: 'POST' }); toast(f.estado === 'recibido' ? 'Formulario descartado y datos borrados.' : 'Enlace anulado.'); }
      else if (k === 'del') { await api('/formularios/' + ref, { method: 'DELETE' }); toast('Formulario eliminado.'); }
      else if (k === 'delall') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; } for (const x of list.filter(z => z.estado === 'anulado')) await api('/formularios/' + x.ref, { method: 'DELETE' }); toast('Formularios anulados eliminados.'); }
      else if (k === 'review') { close(); S.view = 'patients'; S.draft = true; S.formRef = ref; S.draftObj = Object.assign({ id: newId('p'), kind: 'patient', consents: [], estado: 'Activo', tipoDoc: 'CC', createdAt: nowISO() }, f.datos); S.pid = S.draftObj.id; S.tab = 'datos'; render(); scrollTo(0, 0); toast('Datos del formulario cargados: revísalos y pulsa «Guardar datos».'); return; }
      if (await load()) draw();
    } catch (err) { toast(err.message); }
  };
};
/* Al guardar el consultante creado desde un formulario, el formulario se marca como atendido y sus datos se borran. */
{
  const save = ACT.savePatient, create = ACT.newPatient, cancel = ACT.cancelDraft;
  ACT.savePatient = async b => {
    const ref = S.draft ? S.formRef : null, id = S.draftObj && S.draftObj.id;
    await save(b);
    if (ref && !S.draft && S.patients.some(x => x.id === id)) { S.formRef = null; FORMS.at = 0; try { await api('/formularios/' + ref + '/creado', { method: 'POST', body: { patientId: id } }); } catch (e) { /* queda como recibido: puede descartarlo */ } 
    }
  };
  ACT.newPatient = (...a) => { S.formRef = null; return create(...a); };
  if (cancel) ACT.cancelDraft = (...a) => { S.formRef = null; return cancel(...a); };
}
