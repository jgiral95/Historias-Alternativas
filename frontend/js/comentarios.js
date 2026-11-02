/* Comentarios de la versión beta. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Comentarios de la versión beta ===== */
const FB = { open: false, temas: [], tipos: ['Error', 'Sugerencia', 'Duda'], items: [], img: '', draft: { tema: '', tipo: 'Error', texto: '' } };
const FB_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>';
/* Tema sugerido según dónde está la persona (lo puede cambiar). */
function fbGuess() {
  const m = $('#modal-root .modal'), lab = m ? m.getAttribute('aria-label') || '' : '';
  if (/formato|consentimientos/i.test(lab)) return 'Mis formatos';
  if (/recordatorio/i.test(lab)) return 'Recordatorios';
  if (/encuesta/i.test(lab)) return 'Encuesta de satisfacción';
  if (/perfil|cuenta|equipo|usuarios|dos pasos/i.test(lab)) return /perfil/i.test(lab) ? 'Mi perfil y firma' : 'Cuenta, equipo y acceso';
  if (/firmar a distancia|enviar consentimiento/i.test(lab)) return 'Firma a distancia';
  if (S.view === 'agenda' || /cita/i.test(lab)) return 'Agenda y calendario';
  if (S.pid) return { datos: 'Datos del consultante', consent: 'Consentimiento', intake: 'Primera vez', evol: 'Evolución', escalas: 'Escalas', informes: 'Informes', cierre: 'Cierre', archivo: 'Archivo y adjuntos' }[S.tab] || '';
  return S.homeTab === 'stats' ? 'Estadísticas' : S.homeTab === 'enc' ? 'Encuesta de satisfacción' : 'Resumen y pendientes';
}
/* Dónde estaba la persona: sin nombres ni datos de consultantes. */
function fbContext() {
  const m = $('#modal-root .modal'), ua = navigator.userAgent;
  const nav = (/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro') + ' · ' + (/iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro');
  const tabs = Object.fromEntries(TABS);
  return { vista: S.view === 'agenda' ? 'Agenda' : S.pid ? (S.draft ? 'Consultante nuevo' : 'Ficha del consultante') : 'Inicio', 'pestaña': S.view === 'agenda' ? '' : S.pid ? tabs[S.tab] || S.tab : ({ stats: 'Estadísticas', enc: 'Encuesta de satisfacción' }[S.homeTab] || 'Resumen'),
    ventana: m ? m.getAttribute('aria-label') || '' : '', pantalla: innerWidth + '×' + innerHeight, navegador: nav, rol: TEAM() ? 'Equipo' : 'Terapeuta', modo: document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches) ? 'oscuro' : 'claro' };
}
function fbMount() {
  const root = $('#fb-root'); if (!root) return;
  if (S.mode !== 'server' || !S.user || S.user.comentarios === false) { root.innerHTML = ''; return; }
  FB.open = false; fbDraw();
}
function fbDraw() {
  const root = $('#fb-root');
  let seen = true; try { seen = !!localStorage.getItem('fb_seen'); } catch (e) { /* sin almacenamiento */ }
  if (!FB.open) { root.innerHTML = `<button class="fbbtn ${seen ? '' : 'pulse'}" id="fb_btn" aria-expanded="false" aria-controls="fb_panel" title="Enviar un comentario sobre la versión beta">${FB_ICON}<span class="fbl">Comentarios</span><span class="beta">Beta</span></button>`; $('#fb_btn').onclick = fbOpen; return; }
  const d = FB.draft, mine = FB.items;
  root.innerHTML = `<div class="fbpanel" id="fb_panel" role="dialog" aria-label="Comentarios de la beta">
    <div class="row" style="justify-content:space-between"><h3>Comentarios · Beta</h3><button class="btn sm" id="fb_close" aria-label="Cerrar comentarios">Cerrar</button></div>
    <p class="stnote" style="margin:0">Cuéntenos qué falla, qué no entiende o qué mejoraría. <b>No escriba datos reales de consultantes.</b></p>
    <div class="fld"><label for="fb_tema">Apartado del programa</label><select id="fb_tema"><option value="">Elija el apartado al que se refiere…</option>${FB.temas.map(t => `<option ${t === d.tema ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="fbtipos" role="radiogroup" aria-label="Tipo de comentario">${FB.tipos.map(t => `<label><input type="radio" name="fb_tipo" value="${t}" ${t === d.tipo ? 'checked' : ''}> ${t === 'Error' ? 'Algo falla' : t === 'Duda' ? 'Tengo una duda' : 'Sugerencia'}</label>`).join('')}</div>
    <div class="fld"><label for="fb_txt">Comentario</label><textarea id="fb_txt" maxlength="5000" placeholder="Qué hizo, qué esperaba que pasara y qué pasó.">${esc(d.texto)}</textarea></div>
    <div class="fbshot">${FB.img ? `<img src="${FB.img}" alt="Captura adjunta"><button class="btn sm" id="fb_noimg">Quitar captura</button>` : `<label class="btn sm" for="fb_file" style="cursor:pointer">Adjuntar captura</label><input type="file" id="fb_file" accept="image/png,image/jpeg,image/webp" hidden><span>opcional · también puede pegarla en el comentario</span>`}</div>
    <p class="stnote" style="margin:0">Se envía también en qué parte de la app estaba (sin datos de consultantes), para ubicar el problema.</p>
    <div class="row end"><button class="btn pri" id="fb_send">Enviar comentario</button></div>
    ${mine.length ? `<details id="fb_mine"><summary class="sum">Mis comentarios (${mine.length})</summary>${mine.map(i => `<div class="fbitem"><span class="ts">#${i.id} · ${esc(fmtShort(i.creado))} · ${esc(i.tema)} · ${esc(i.tipo)} · <b>${esc(i.estado)}</b></span><p>${esc(i.texto)}</p>${i.respuesta ? `<p class="fbreply"><b>Respuesta:</b> ${esc(i.respuesta)}</p>` : ''}</div>`).join('')}</details>` : ''}
  </div>`;
  const keep = () => { d.tema = $('#fb_tema').value; d.texto = $('#fb_txt').value; const r = $('input[name="fb_tipo"]:checked'); if (r) d.tipo = r.value; };
  $('#fb_close').onclick = () => { keep(); FB.open = false; fbDraw(); const b = $('#fb_btn'); if (b) b.focus(); };
  $('#fb_panel').onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); $('#fb_close').click(); } };
  $('#fb_panel').oninput = keep; $('#fb_panel').onchange = keep;
  if ($('#fb_noimg')) $('#fb_noimg').onclick = () => { keep(); FB.img = ''; fbDraw(); };
  if ($('#fb_file')) $('#fb_file').onchange = e => { keep(); const f = e.target.files[0]; if (f) fbImage(f); };
  $('#fb_txt').onpaste = e => { const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => /^image\//.test(x.type)); if (it) { e.preventDefault(); keep(); fbImage(it.getAsFile()); } };
  $('#fb_send').onclick = fbSend;
}
async function fbImage(f) {
  if (!f || !/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > MAX_IMG_IN) { toast('La captura debe ser una imagen PNG o JPG.'); return; }
  const small = await shrinkImage(f);
  if (small.size > 3 * 1048576) { toast('La captura es muy grande (máximo 3 MB).'); return; }
  FB.img = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(small); });
  fbDraw(); const t = $('#fb_txt'); if (t) t.focus();
}
async function fbOpen() {
  try { localStorage.setItem('fb_seen', '1'); } catch (e) { /* sin almacenamiento */ }
  try { const r = await api('/comentarios'); FB.temas = r.temas; FB.tipos = r.tipos; FB.items = r.items; } catch (e) { toast(e.message); return; }
  if (!FB.draft.texto) FB.draft.tema = fbGuess();
  FB.ctx = fbContext();  // dónde estaba al abrir el panel
  FB.open = true; fbDraw();
  const t = $('#fb_txt'); if (t) t.focus();
}
async function fbSend() {
  const d = FB.draft;
  if (!d.tema) { toast('Elija el apartado del programa al que se refiere su comentario.'); $('#fb_tema').focus(); return; }
  if (!d.texto.trim()) { toast('Escriba el comentario.'); $('#fb_txt').focus(); return; }
  setBusy($('#fb_send'), true);
  try {
    await api('/comentarios', { method: 'POST', body: { tema: d.tema, tipo: d.tipo, texto: d.texto.trim(), contexto: FB.ctx || fbContext(), imagen: FB.img || null } });
    FB.draft = { tema: '', tipo: 'Error', texto: '' }; FB.img = ''; FB.open = false; fbDraw();
    toast('¡Gracias! Su comentario quedó enviado.'); stepDone('comentario'); try { localStorage.setItem('fb_seen', '1'); } catch (e) { /* sin almacenamiento */ }
  } catch (e) { toast(e.message); const b = $('#fb_send'); if (b) setBusy(b, false); }
}
/* Bandeja del administrador */
async function fbRaw(path) {
  const r = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'X-Requested-With': 'archivo-clinico' } });
  if (!r.ok) throw new Error('Error ' + r.status);
  return r;
}
ACT.fbAdmin = async () => {
  closeMenu();
  const root = $('#modal-root'); let filtro = 'abiertos';
  const draw = async () => {
    let data; try { data = await api('/admin/comentarios'); } catch (e) { toast(e.message); return; }
    const open = x => x.estado === 'Nuevo' || x.estado === 'En revisión';
    const list = data.items.filter(x => filtro === 'todos' ? true : filtro === 'abiertos' ? open(x) : x.estado === filtro);
    const nOpen = data.items.filter(open).length;
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Comentarios de la beta (administración)"><div class="box" id="fbadm" style="max-width:820px"><div class="row" style="justify-content:space-between"><h3>Comentarios de la beta</h3><button class="btn sm" data-fa="close">Cerrar</button></div>
    <div class="card"><b>Para pasárselos a Claude</b><p class="stnote" style="margin:0">Descargue el .zip (trae <code>comentarios.md</code> con todos los comentarios abiertos, agrupados por tema y con instrucciones, y la carpeta de capturas) y adjúntelo en el chat. O copie el texto y péguelo directamente.</p>
      <div class="row"><button class="btn pri" data-fa="zip" ${nOpen ? '' : 'disabled'}>Descargar abiertos (.zip)</button><button class="btn" data-fa="copy" ${nOpen ? '' : 'disabled'}>Copiar texto de los abiertos</button><span class="ts">${nOpen} abierto(s) de ${data.items.length}</span></div></div>
    <div class="row"><label for="fa_f" class="ts">Mostrar</label><select id="fa_f" style="width:auto">${[['abiertos', 'Abiertos (nuevos y en revisión)'], ['todos', 'Todos'], ...data.estados.map(e => [e, e])].map(([v, l]) => `<option value="${v}" ${v === filtro ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    ${list.length ? list.map(x => `<div class="card" data-id="${x.id}"><div class="row" style="justify-content:space-between"><span><b>#${x.id} · ${esc(x.tema)}</b> <span class="chip ${x.tipo === 'Error' ? 'warn' : ''}">${esc(x.tipo)}</span></span><select data-fa="estado" style="width:auto" aria-label="Estado del comentario ${x.id}">${data.estados.map(e => `<option ${e === x.estado ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <span class="ts">${esc(fmtShort(x.creado))} · ${esc(x.autor)} (${esc(x.correo)})${x.rol === 'asistente' ? ' · equipo' : ''}</span>
      <p style="margin:0;white-space:pre-wrap">${esc(x.texto)}</p>
      <span class="ts">${esc(Object.entries(x.contexto || {}).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · '))}</span>
      <div class="row">${x.captura ? `<button class="btn sm" data-fa="img">Ver captura</button>` : ''}<input type="text" data-fa="resp" value="${esc(x.respuesta)}" placeholder="Respuesta para quien lo envió (opcional)" aria-label="Respuesta al comentario ${x.id}" style="flex:1;min-width:200px"><button class="btn sm" data-fa="save">Guardar respuesta</button></div></div>`).join('') : '<p class="stnote">No hay comentarios aquí.</p>'}
    </div></div>`;
    $('#fa_f').onchange = e => { filtro = e.target.value; draw(); };
  };
  root.onclick = async e => {
    const b = e.target.closest('[data-fa]'); if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.fa, card = b.closest('[data-id]'), id = card && card.dataset.id;
    try {
      if (a === 'close') { root.innerHTML = ''; root.onclick = null; root.onchange = null; return; }
      if (a === 'zip') {
        const r = await fbRaw('/admin/comentarios/exportar'), blob = await r.blob(), name = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
        const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = name ? name[1] : 'comentarios-beta-' + dayKey(new Date()) + '.zip'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return;
      }
      if (a === 'copy') { const t = (await api('/admin/comentarios/texto')).texto; try { await navigator.clipboard.writeText(t); toast('Texto copiado: péguelo en el chat con Claude.'); } catch (err) { showDoc('Comentarios de la beta', `<pre style="white-space:pre-wrap">${esc(t)}</pre>`, 'comentarios-beta.md'); } return; }
      if (a === 'img') { const u = URL.createObjectURL(await (await fbRaw('/comentarios/' + id + '/captura')).blob()); window.open(u, '_blank', 'noopener'); return; }
      if (a === 'save') { await api('/admin/comentarios/' + id, { method: 'PATCH', body: { respuesta: card.querySelector('[data-fa="resp"]').value } }); toast('Respuesta guardada.'); }
    } catch (err) { toast(err.message); }
  };
  root.onchange = async e => {
    const s = e.target.closest('select[data-fa="estado"]'); if (!s) return;
    try { await api('/admin/comentarios/' + s.closest('[data-id]').dataset.id, { method: 'PATCH', body: { estado: s.value } }); toast('Estado: ' + s.value + '.'); draw(); } catch (err) { toast(err.message); }
  };
  draw();
};

