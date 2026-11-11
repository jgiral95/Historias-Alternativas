/* Mi suscripción: estado, planes (ePayco) y cancelación. Parte de app.html (scripts clásicos; se usa al hacer clic, no al cargar). */
const fmtFecha = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
async function subDraw(msg) {
  const root = $('#modal-root'); let st;
  try { st = await api('/billing'); } catch (e) { toast(e.message); return; }
  const hasta = fmtFecha(st.hasta), plan = (st.planes.find(p => p.id === st.plan) || {}).nombre || '';
  let estado;
  if (!st.exigido) estado = 'La suscripción aún no se exige: puede usar todo sin límites.';
  else if (st.activa) estado = `<b>${esc(plan || 'Suscripción')} activa</b> hasta el ${esc(hasta)}.`;
  else if (st.gracia != null) estado = `Su suscripción venció el ${esc(hasta)}. ${st.gracia > 0 ? `Por ${st.gracia} días más puede ver y descargar sus fichas, pero no modificarlas.` : 'Ya no puede abrir sus fichas hasta renovar; están guardadas.'}`;
  else estado = 'Sin suscripción puede probar con <b>un consultante</b>. Suscríbase para tener todos los que necesite y crear cuentas de ayudantes.';
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Mi suscripción"><div class="box"><div class="row" style="justify-content:space-between"><h3>Mi suscripción</h3><button class="btn sm" data-sub="close">Cerrar</button></div>
    ${msg ? `<div class="banner" role="alert">${esc(msg)}</div>` : ''}<p style="margin:0">${estado}</p>
    ${st.exigido && !st.activa ? `<div class="grid">${st.planes.map(p => `<a class="btn ${p.id === 'anual' ? 'pri' : ''}" href="${esc(p.url)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">${esc(p.nombre)}</a>`).join('')}</div>
    <p class="stnote">Tiene 5 días de prueba. Para que se active sola, pague con <b>el mismo correo de esta cuenta</b>. Luego vuelva aquí y pulse «Ya me suscribí».</p><div class="row end"><button class="btn" data-sub="refresh">Ya me suscribí</button></div>` : ''}
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
