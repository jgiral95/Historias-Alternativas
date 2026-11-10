/* Vista previa interactiva de la portada: datos de ejemplo, sin llamadas al servidor. */
(() => {
  const C = [
    { id: 'marta', hora: '8:00', n: 'Marta L.', st: 'Confirmó', meta: '8:00 · Presencial · Sesión 6',
      ses: [['Motivo', 'Sostener la calma durante semanas de mucho trabajo.'], ['Lo trabajado', 'Masaje de espalda y una práctica de respiración de cuatro tiempos.'], ['Para la próxima', 'Caminar diez minutos después del almuerzo.']],
      dat: [['Contacto', 'marta@ejemplo.co · 300 000 0000'], ['Llegó por', 'Recomendación de una amiga'], ['Acuerdos', 'Consentimiento firmado el 12 de octubre']],
      chq: [['Descanso', 6, 10], ['Energía', 7, 10], ['Ánimo', 8, 10]], inf: ['Constancia de asistencia', 'Seis sesiones entre septiembre y noviembre.'] },
    { id: 'daniel', hora: '10:00', n: 'Daniel R.', st: 'Primera vez', meta: '10:00 · Presencial · Sesión 1',
      ses: [['Motivo', 'Busca calmar el ritmo del día y dormir mejor.'], ['Lo trabajado', 'Respiración consciente y una pausa corta antes de dormir.'], ['Para la próxima', 'Registrar cómo se siente al despertar durante una semana.']],
      dat: [['Contacto', 'daniel@ejemplo.co · 301 000 0000'], ['Llegó por', 'Búsqueda en internet'], ['Acuerdos', 'Consentimiento pendiente de firma']],
      chq: [['Descanso', 4, 10], ['Energía', 5, 10], ['Ánimo', 6, 10]], inf: ['Sin informes todavía', 'Después de la primera sesión podrá crear una constancia.'] },
    { id: 'ines', hora: '11:30', n: 'Inés P.', st: 'En línea', meta: '11:30 · En línea · Sesión 3',
      ses: [['Motivo', 'Retomar el movimiento suave después de unas vacaciones.'], ['Lo trabajado', 'Yoga suave de veinte minutos y estiramientos guiados.'], ['Para la próxima', 'Repetir la rutina tres mañanas por semana.']],
      dat: [['Contacto', 'ines@ejemplo.co · 302 000 0000'], ['Llegó por', 'Taller en el parque'], ['Acuerdos', 'Atención en línea acordada por escrito']],
      chq: [['Descanso', 7, 10], ['Energía', 6, 10], ['Ánimo', 7, 10]], inf: ['Constancia de asistencia', 'Tres sesiones en línea en noviembre.'] },
    { id: 'pablo', hora: '15:00', n: 'Pablo S.', st: 'Firma pendiente', meta: '15:00 · Presencial · Sesión 2',
      ses: [['Motivo', 'Quiere cuidar la espalda por las horas frente al computador.'], ['Lo trabajado', 'Aromaterapia con lavanda y pausas activas cada hora.'], ['Para la próxima', 'Revisar cómo le fue con las pausas.']],
      dat: [['Contacto', 'pablo@ejemplo.co · 303 000 0000'], ['Llegó por', 'Un compañero de trabajo'], ['Acuerdos', 'Se envió el consentimiento por enlace: falta su firma']],
      chq: [['Descanso', 5, 10], ['Energía', 4, 10], ['Ánimo', 6, 10]], inf: ['Nota de remisión', 'Ejemplo de remisión a otro terapeuta, con código de verificación.'] }
  ];
  const T = [['ses', 'Sesión'], ['dat', 'Datos'], ['chq', 'Chequeos'], ['inf', 'Informes']];
  const $ = id => document.getElementById(id);
  const lista = $('d-citas'), tabs = $('d-tabs'), panel = $('d-panel');
  if (!lista || !tabs || !panel) return;
  let cita = C[1], tab = 'ses';
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
  const campo = (t, v) => { const d = el('div', 'demo-field'); d.append(el('b', '', t), el('p', '', v)); return d; };
  function pintaCitas() {
    lista.replaceChildren(...C.map(c => {
      const li = el('li', c === cita ? 'on' : ''), b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', c === cita);
      b.append(el('span', '', c.hora + ' · ' + c.n), el('i', '', c.st));
      b.onclick = () => { cita = c; pinta(); };
      li.append(b); return li;
    }));
  }
  function pintaTabs() {
    tabs.replaceChildren(...T.map(([k, l]) => {
      const b = el('button', '', l); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === tab); b.tabIndex = k === tab ? 0 : -1;
      b.onclick = () => { tab = k; pinta(); };
      b.onkeydown = e => { const i = T.findIndex(x => x[0] === tab), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (j == null) return; tab = T[(j + T.length) % T.length][0]; pinta(); tabs.querySelector('[aria-selected="true"]').focus(); };
      return b;
    }));
  }
  function pintaPanel() {
    if (tab === 'chq') {
      const nodes = cita.chq.map(([t, v, m]) => { const d = el('div', 'demo-field'), r = el('div', 'row2'); r.append(el('b', '', t), el('span', '', v + ' / ' + m));
        const bar = el('div', 'barra'), i = el('i'); i.style.width = (v / m * 100) + '%'; bar.append(i); d.append(r, bar); return d; });
      nodes.push(el('p', 'demo-hint', 'Chequeos de bienestar sencillos: cada vez se guardan para comparar el recorrido.'));
      panel.replaceChildren(...nodes);
    } else if (tab === 'inf') panel.replaceChildren(campo(cita.inf[0], cita.inf[1]));
    else panel.replaceChildren(...cita[tab].map(([t, v]) => campo(t, v)));
  }
  function pinta() { $('d-nombre').textContent = cita.n; $('d-meta').textContent = cita.meta + ' · datos de ejemplo'; pintaCitas(); pintaTabs(); pintaPanel(); }
  pinta();
})();
