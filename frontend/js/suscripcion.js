/* Mi suscripción: estado, planes (ePayco) y cancelación. Parte de app.html (scripts clásicos; se usa al hacer clic, no al cargar). */
const fmtFecha = iso => iso ? new Date(iso).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const SUB_INFO = { mensual: { precio: '$80.000', per: 'COP / mes', prueba: '5 días' }, anual: { precio: '$800.000', per: 'COP / año', prueba: '15 días' } };
async function subDraw(msg) {
  const root = $('#modal-root'); let st;
  try { st = await api('/billing'); } catch (e) { toast(e.message); return; }
  const hasta = fmtFecha(st.hasta), plan = (st.planes.find(p => p.id === st.plan) || {}).nombre || '';
  let estado;
  if (!st.exigido) estado = 'La suscripción aún no se exige: puedes usar todo sin límites.';
  else if (st.activa) estado = `<b>${esc(plan || 'Suscripción')} activa</b> hasta el ${esc(hasta)}.`;
  else if (st.gracia != null) estado = `Tu suscripción venció el ${esc(hasta)}. ${st.gracia > 0 ? `Por ${st.gracia} días más puedes ver y descargar tus fichas, pero no modificarlas.` : 'Ya no puedes abrir tus fichas hasta renovar; están guardadas.'}`;
  else estado = 'Sin suscripción puedes probar con <b>un consultante</b>. Suscríbete para tener todos los que necesites y crear cuentas de ayudantes.';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi suscripción"><div class="box"><div class="row" style="justify-content:space-between"><h3>Mi suscripción</h3><button class="btn sm" data-sub="close">Cerrar</button></div>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}<p style="margin:0">${estado}</p>
    ${st.exigido && !st.activa ? `<div class="subplanes">${st.planes.map(p => { const an = p.id === 'anual', d = SUB_INFO[p.id] || {}; return `<div class="subcard ${an ? 'f' : ''}">${an ? '<span class="subahorro">Ahorra 2 meses</span>' : ''}<h4>${esc(p.nombre)}</h4><div class="subprecio">${esc(d.precio || '')} <small>${esc(d.per || '')}</small></div><ul><li>Acceso completo a la plataforma</li><li>Fichas cifradas y notas de sesión</li><li>Acuerdos, consentimientos e informes</li><li>Agenda con recordatorios</li><li>${esc(d.prueba || '')} de prueba gratis</li></ul><a class="btn ${an ? 'pri' : ''}" href="${esc(p.url)}" target="_blank" rel="noopener">Suscribirme</a></div>`; }).join('')}</div>
    <p class="stnote">Para que se active sola, paga con <b>el mismo correo de esta cuenta</b>. Luego vuelve aquí y pulsa «Ya me suscribí».</p><div class="row end"><button class="btn" data-sub="refresh">Ya me suscribí</button></div>` : ''}
    ${st.activa && st.puedeCancelar && st.exigido ? '<div class="row end"><button class="btn warn" data-sub="cancel">Cancelar mi suscripción</button></div><p class="stnote">Al cancelar, conserva el acceso hasta el fin del periodo pagado.</p>' : ''}</div></div>`;
  root.onclick = async e => {
    const b = e.target.closest('[data-sub]'); if (!b) return;
    if (b.dataset.sub === 'close') { root.innerHTML = ''; root.onclick = null; return; }
    if (b.dataset.sub === 'refresh') { await subDraw(); if (S.pid === null) { try { await Store.load(); render(); } catch (err) { /* sigue */ } } return; }
    if (b.dataset.sub === 'cancel') {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar cancelación'; return; }
      try { await api('/billing/cancelar', { method: 'POST' }); subDraw('Suscripción cancelada. Conserva el acceso hasta el fin del periodo.'); } catch (err) { toast(err.message); }
    }
  };
}
ACT.suscripcion = () => subDraw();
