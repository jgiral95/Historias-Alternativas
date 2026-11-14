/* Vista previa interactiva de la portada: datos de ejemplo, sin llamadas al servidor.
   Arriba se elige la práctica (astrología, crianza, aromaterapia…) y el ejemplo cambia: citas, pestañas y contenido. */
(() => {
  // Cada práctica: pestañas [clave, nombre, tipo] (tipo: campos | chq | inf) y cuatro citas con su contenido por pestaña.
  const P = [
    { id: 'bienestar', n: 'Masaje y bienestar', tabs: [['ses', 'Sesión'], ['dat', 'Datos'], ['chq', 'Chequeos', 'chq'], ['inf', 'Informes', 'inf']], citas: [
      { hora: '8:00', n: 'Marta L.', st: 'Confirmó', meta: 'Presencial · Sesión 6', d: {
        ses: [['Motivo', 'Sostener la calma durante semanas de mucho trabajo.'], ['Lo trabajado', 'Masaje de espalda y una práctica de respiración de cuatro tiempos.'], ['Para la próxima', 'Caminar diez minutos después del almuerzo.']],
        dat: [['Contacto', 'marta@ejemplo.co · 300 000 0000'], ['Llegó por', 'Recomendación de una amiga'], ['Acuerdos', 'Consentimiento firmado el 12 de octubre']],
        chq: [['Descanso', 6, 10], ['Energía', 7, 10], ['Ánimo', 8, 10]], inf: ['Constancia de asistencia', 'Seis sesiones entre septiembre y noviembre.'] } },
      { hora: '10:00', n: 'Daniel R.', st: 'Primera vez', meta: 'Presencial · Sesión 1', d: {
        ses: [['Motivo', 'Busca calmar el ritmo del día y dormir mejor.'], ['Lo trabajado', 'Respiración consciente y una pausa corta antes de dormir.'], ['Para la próxima', 'Registrar cómo se siente al despertar durante una semana.']],
        dat: [['Contacto', 'daniel@ejemplo.co · 301 000 0000'], ['Llegó por', 'Búsqueda en internet'], ['Acuerdos', 'Consentimiento pendiente de firma']],
        chq: [['Descanso', 4, 10], ['Energía', 5, 10], ['Ánimo', 6, 10]], inf: ['Sin informes todavía', 'Después de la primera sesión podrás crear una constancia.'] } },
      { hora: '11:30', n: 'Inés P.', st: 'En línea', meta: 'En línea · Sesión 3', d: {
        ses: [['Motivo', 'Retomar el movimiento suave después de unas vacaciones.'], ['Lo trabajado', 'Yoga suave de veinte minutos y estiramientos guiados.'], ['Para la próxima', 'Repetir la rutina tres mañanas por semana.']],
        dat: [['Contacto', 'ines@ejemplo.co · 302 000 0000'], ['Llegó por', 'Taller en el parque'], ['Acuerdos', 'Atención en línea acordada por escrito']],
        chq: [['Descanso', 7, 10], ['Energía', 6, 10], ['Ánimo', 7, 10]], inf: ['Constancia de asistencia', 'Tres sesiones en línea en noviembre.'] } },
      { hora: '15:00', n: 'Pablo S.', st: 'Firma pendiente', meta: 'Presencial · Sesión 2', d: {
        ses: [['Motivo', 'Quiere cuidar la espalda por las horas frente al computador.'], ['Lo trabajado', 'Pausas activas cada hora y una rutina de estiramiento.'], ['Para la próxima', 'Revisar cómo le fue con las pausas.']],
        dat: [['Contacto', 'pablo@ejemplo.co · 303 000 0000'], ['Llegó por', 'Un compañero de trabajo'], ['Acuerdos', 'Se envió el consentimiento por enlace: falta su firma']],
        chq: [['Descanso', 5, 10], ['Energía', 4, 10], ['Ánimo', 6, 10]], inf: ['Nota de remisión', 'Ejemplo de remisión a otro terapeuta, con código de verificación.'] } } ] },
    { id: 'astro', n: 'Astrología', tabs: [['ses', 'Sesión'], ['nat', 'Carta natal'], ['sol', 'Revolución solar'], ['inf', 'Informes', 'inf']], citas: [
      { hora: '8:30', n: 'Lucía V.', st: 'Confirmó', meta: 'En línea · Sesión 4', d: {
        ses: [['Motivo', 'Entender un cambio de trabajo que se aproxima.'], ['Lo trabajado', 'Tránsitos de Saturno por su casa 10 y fechas posibles para decidir.'], ['Para la próxima', 'Escribir qué espera de su nuevo rol antes de la luna nueva.']],
        nat: [['Nacimiento', '14 de marzo de 1991 · 6:42 a. m. · Medellín'], ['☉ Sol · ☽ Luna · AC Ascendente', '♓ Piscis · ♋ Cáncer · ♍ Virgo'], ['Notas', '☽ en casa 4: la familia pesa en sus decisiones. ☉ △ ♄ (trígono Sol–Saturno).']],
        sol: [['Año', 'Revolución solar 2026–2027'], ['Ascendente del año', 'Escorpio'], ['Tema central', 'Cierre de un ciclo laboral y mudanza.']], inf: ['Resumen de la sesión', 'Entregado en PDF con el mapa y las fechas clave.'] } },
      { hora: '10:00', n: 'Andrés G.', st: 'Primera vez', meta: 'Presencial · Sesión 1', d: {
        ses: [['Motivo', 'Curiosidad por su carta y por una etapa de decisiones.'], ['Lo trabajado', 'Lectura general de la carta: elementos, modalidades y casas.'], ['Para la próxima', 'Confirmar la hora de nacimiento con su madre.']],
        nat: [['Nacimiento', '2 de agosto de 1988 · hora por confirmar · Bogotá'], ['☉ Sol · ☽ Luna · AC Ascendente', '♌ Leo · ♏ Escorpio · por confirmar'], ['Notas', 'Sin hora exacta: se usará un mapa solar.']],
        sol: [['Año', 'Aún sin calcular'], ['Pendiente', 'Calcular cuando confirme la hora.'], ['Tema central', 'Por definir.']], inf: ['Sin informes todavía', 'Después de la primera sesión podrás crear un resumen.'] } },
      { hora: '12:00', n: 'Camila R.', st: 'En línea', meta: 'En línea · Sesión 2', d: {
        ses: [['Motivo', 'Compatibilidad con su pareja y momento para convivir.'], ['Lo trabajado', 'Sinastría: Venus y Marte en contacto; Luna en tensión.'], ['Para la próxima', 'Conversar sobre acuerdos de convivencia.']],
        nat: [['Nacimiento', '9 de noviembre de 1993 · 11:15 p. m. · Cali'], ['☉ Sol · ☽ Luna · AC Ascendente', '♏ Escorpio · ♎ Libra · ♑ Capricornio'], ['Notas', 'Hay una carta de su pareja guardada para comparar.']],
        sol: [['Año', 'Revolución solar 2026–2027'], ['Ascendente del año', 'Géminis'], ['Tema central', 'Vínculos y compromisos.']], inf: ['Mapa de sinastría', 'Documento con la comparación de ambas cartas.'] } },
      { hora: '16:00', n: 'Jorge M.', st: 'Firma pendiente', meta: 'Presencial · Sesión 3', d: {
        ses: [['Motivo', 'Elegir fecha para abrir su negocio.'], ['Lo trabajado', 'Astrología electiva: tres fechas posibles en diciembre.'], ['Para la próxima', 'Decidir la fecha y revisar la Luna fuera de curso.']],
        nat: [['Nacimiento', '21 de enero de 1985 · 3:05 p. m. · Barranquilla'], ['☉ Sol · ☽ Luna · AC Ascendente', '♒ Acuario · ♉ Tauro · ♎ Libra'], ['Notas', '♃ Júpiter transita su casa 2.']],
        sol: [['Año', 'Revolución solar 2026–2027'], ['Ascendente del año', 'Leo'], ['Tema central', 'Ingresos y proyectos propios.']], inf: ['Fechas electivas', 'Se envió el consentimiento por enlace: falta su firma.'] } } ] },
    { id: 'crianza', n: 'Crianza', tabs: [['ses', 'Sesión'], ['fam', 'Familia'], ['acu', 'Acuerdos', 'chq'], ['inf', 'Informes', 'inf']], citas: [
      { hora: '9:00', n: 'Familia Rojas', st: 'Confirmó', meta: 'Presencial · Sesión 5', d: {
        ses: [['Motivo', 'Rabietas de Tomás (4 años) a la hora de dormir.'], ['Lo trabajado', 'Rutina de noche con pasos visuales y tiempo de conexión antes de dormir.'], ['Para la próxima', 'Probar la rutina cinco noches y anotar qué pasó.']],
        fam: [['Quiénes', 'Mamá, papá y Tomás (4 años)'], ['Ritmo de la casa', 'Papá llega tarde; mamá hace la rutina de noche casi siempre.'], ['Fortalezas', 'Mucho juego compartido los fines de semana.']],
        acu: [['Rutina de noche', 4, 5], ['Tiempo de juego', 5, 5], ['Calma en la mañana', 3, 5]], inf: ['Resumen para la familia', 'Acuerdos de la rutina y señales para ajustar.'] } },
      { hora: '11:00', n: 'Natalia C.', st: 'Primera vez', meta: 'En línea · Sesión 1', d: {
        ses: [['Motivo', 'Quiere acompañar mejor a su hija de 13 años.'], ['Lo trabajado', 'Mapa de la situación y una pregunta de curiosidad para la semana.'], ['Para la próxima', 'Observar cuándo se cierra la conversación.']],
        fam: [['Quiénes', 'Natalia y Sara (13 años)'], ['Ritmo de la casa', 'Natalia trabaja desde casa; cenan juntas.'], ['Fortalezas', 'Sara dibuja y le gusta contar sus historias.']],
        acu: [['Conversaciones', 2, 5], ['Tiempo juntas', 3, 5], ['Confianza', 3, 5]], inf: ['Sin informes todavía', 'Después de la primera sesión podrás crear un resumen.'] } },
      { hora: '14:00', n: 'Familia Duarte', st: 'En línea', meta: 'En línea · Sesión 3', d: {
        ses: [['Motivo', 'Peleas entre hermanos por los turnos de pantalla.'], ['Lo trabajado', 'Reunión familiar y un acuerdo de turnos hecho por los niños.'], ['Para la próxima', 'Revisar el acuerdo en la reunión del domingo.']],
        fam: [['Quiénes', 'Papá, mamá, Mateo (9) y Juana (6)'], ['Ritmo de la casa', 'Las pantallas se usan después de las tareas.'], ['Fortalezas', 'Los niños proponen soluciones cuando se les escucha.']],
        acu: [['Turnos de pantalla', 3, 5], ['Reunión familiar', 4, 5], ['Tareas', 4, 5]], inf: ['Resumen para la familia', 'Acuerdo de turnos en una página.'] } },
      { hora: '17:00', n: 'Diego A.', st: 'Firma pendiente', meta: 'Presencial · Sesión 2', d: {
        ses: [['Motivo', 'Ser papá separado y mantener rutinas con su hijo.'], ['Lo trabajado', 'Rutinas simples que se repiten en ambas casas.'], ['Para la próxima', 'Hablar con la mamá de Simón sobre horarios de sueño.']],
        fam: [['Quiénes', 'Diego y Simón (7 años)'], ['Ritmo de la casa', 'Simón pasa fines de semana alternos con él.'], ['Fortalezas', 'Cocinan juntos los sábados.']],
        acu: [['Rutinas', 3, 5], ['Comunicación', 3, 5], ['Tiempo de calidad', 5, 5]], inf: ['Acuerdos de crianza', 'Se envió el consentimiento por enlace: falta su firma.'] } } ] },
    { id: 'aroma', n: 'Aromaterapia', tabs: [['ses', 'Sesión'], ['mez', 'Mezclas'], ['chq', 'Chequeos', 'chq'], ['inf', 'Informes', 'inf']], citas: [
      { hora: '9:30', n: 'Valentina H.', st: 'Confirmó', meta: 'Presencial · Sesión 4', d: {
        ses: [['Motivo', 'Dormir mejor en época de mucho trabajo.'], ['Lo trabajado', 'Masaje suave con aceite de almendras y aroma de lavanda.'], ['Para la próxima', 'Seguir con el difusor una hora antes de acostarse.']],
        mez: [['Mezcla para dormir', 'Lavanda y mandarina, 3 gotas en el difusor.'], ['Dilución en piel', '1 % en aceite de almendras, solo en la espalda.'], ['Precauciones anotadas', 'Prueba en el antebrazo antes de usar.']],
        chq: [['Descanso', 6, 10], ['Calma', 7, 10], ['Ánimo', 7, 10]], inf: ['Constancia de asistencia', 'Cuatro sesiones en noviembre.'] } },
      { hora: '11:00', n: 'Esteban L.', st: 'Primera vez', meta: 'Presencial · Sesión 1', d: {
        ses: [['Motivo', 'Quiere un aroma para concentrarse al estudiar.'], ['Lo trabajado', 'Prueba de aromas cítricos y de romero con él.'], ['Para la próxima', 'Probar el difusor en el escritorio toda la semana.']],
        mez: [['Mezcla para estudiar', 'Limón y romero, 2 gotas cada uno.'], ['Dilución en piel', 'No se aplicará en la piel por ahora.'], ['Precauciones anotadas', 'Prueba de olor primero, sin contacto con la piel.']],
        chq: [['Concentración', 4, 10], ['Calma', 5, 10], ['Ánimo', 6, 10]], inf: ['Sin informes todavía', 'Después de la primera sesión podrás crear una constancia.'] } },
      { hora: '13:00', n: 'Rosa T.', st: 'En línea', meta: 'En línea · Sesión 3', d: {
        ses: [['Motivo', 'Un aroma para la rutina de la mañana.'], ['Lo trabajado', 'Mezcla cítrica y un momento de respiración al despertar.'], ['Para la próxima', 'Contar cómo se siente a media mañana.']],
        mez: [['Mezcla de la mañana', 'Naranja dulce y menta, 3 gotas en total.'], ['Dilución en piel', 'Solo uso en el aire.'], ['Precauciones anotadas', 'No usar cerca de su gato.']],
        chq: [['Energía', 6, 10], ['Calma', 7, 10], ['Ánimo', 8, 10]], inf: ['Constancia de asistencia', 'Tres sesiones en línea en noviembre.'] } },
      { hora: '16:30', n: 'Mario P.', st: 'Firma pendiente', meta: 'Presencial · Sesión 2', d: {
        ses: [['Motivo', 'Aliviar la tensión del cuello por trabajo de escritorio.'], ['Lo trabajado', 'Automasaje de cuello y aroma de eucalipto en el ambiente.'], ['Para la próxima', 'Repetir el automasaje dos veces por día.']],
        mez: [['Mezcla para el cuello', 'Aceite portador con 1 % de lavanda.'], ['Dilución en piel', '1 %, en el cuello y los hombros.'], ['Precauciones anotadas', 'Piel sensible: probar primero.']],
        chq: [['Tensión', 5, 10], ['Calma', 6, 10], ['Ánimo', 6, 10]], inf: ['Nota de remisión', 'Se envió el consentimiento por enlace: falta su firma.'] } } ] },
    { id: 'coaching', n: 'Coaching', tabs: [['ses', 'Sesión'], ['met', 'Metas'], ['chq', 'Rueda de la vida', 'chq'], ['inf', 'Informes', 'inf']], citas: [
      { hora: '8:00', n: 'Carolina F.', st: 'Confirmó', meta: 'En línea · Sesión 6', d: {
        ses: [['Tema', 'Organizar su semana para tener tiempo propio.'], ['Lo trabajado', 'Bloques de agenda y tres límites que quiere poner en el trabajo.'], ['Compromiso', 'Reservar dos tardes por semana sin reuniones.']],
        met: [['Meta del trimestre', 'Terminar su proyecto de emprendimiento.'], ['Primer paso', 'Hablar con tres posibles clientes este mes.'], ['Obstáculo', 'Le cuesta decir que no.']],
        chq: [['Trabajo', 7, 10], ['Salud', 6, 10], ['Relaciones', 8, 10]], inf: ['Resumen del proceso', 'Seis sesiones: avances y compromisos.'] } },
      { hora: '10:30', n: 'Felipe O.', st: 'Primera vez', meta: 'Presencial · Sesión 1', d: {
        ses: [['Tema', 'Quiere un cambio de rumbo profesional.'], ['Lo trabajado', 'Mapa de valores y fortalezas.'], ['Compromiso', 'Conversar con dos personas cuyo trabajo admira.']],
        met: [['Meta del trimestre', 'Tener claro su próximo paso laboral.'], ['Primer paso', 'Lista de diez cosas que disfruta hacer.'], ['Obstáculo', 'Miedo a empezar de cero.']],
        chq: [['Trabajo', 4, 10], ['Salud', 6, 10], ['Relaciones', 7, 10]], inf: ['Sin informes todavía', 'Después de la primera sesión podrás crear un resumen.'] } },
      { hora: '12:30', n: 'Sandra B.', st: 'En línea', meta: 'En línea · Sesión 3', d: {
        ses: [['Tema', 'Hablar en público con más seguridad.'], ['Lo trabajado', 'Ensayo de su presentación y respiración antes de empezar.'], ['Compromiso', 'Grabarse dos veces y revisar el video.']],
        met: [['Meta del trimestre', 'Presentar en la reunión general de marzo.'], ['Primer paso', 'Pedir diez minutos en la reunión de enero.'], ['Obstáculo', 'Se pone nerviosa al inicio.']],
        chq: [['Confianza', 5, 10], ['Preparación', 6, 10], ['Calma', 5, 10]], inf: ['Constancia de asistencia', 'Tres sesiones en línea en noviembre.'] } },
      { hora: '17:00', n: 'Iván K.', st: 'Firma pendiente', meta: 'Presencial · Sesión 2', d: {
        ses: [['Tema', 'Equilibrar el trabajo con la vida familiar.'], ['Lo trabajado', 'Rueda de la vida y dos hábitos para empezar.'], ['Compromiso', 'Salir a las 6:00 p. m. tres días por semana.']],
        met: [['Meta del trimestre', 'Cenar en familia cuatro noches por semana.'], ['Primer paso', 'Avisar a su equipo del nuevo horario.'], ['Obstáculo', 'Las reuniones de última hora.']],
        chq: [['Trabajo', 8, 10], ['Familia', 4, 10], ['Salud', 5, 10]], inf: ['Acuerdo de coaching', 'Se envió el consentimiento por enlace: falta su firma.'] } } ] }
  ];
  const $ = id => document.getElementById(id);
  const lista = $('d-citas'), tabs = $('d-tabs'), panel = $('d-panel'), prof = $('d-prof');
  if (!lista || !tabs || !panel) return;
  let pr = P[0], cita = pr.citas[1], tab = 'ses';
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
  const rueda = () => { const n = 'http://www.w3.org/2000/svg', g = '♈♉♊♋♌♍♎♏♐♑♒♓', v = document.createElementNS(n, 'svg'); v.setAttribute('viewBox', '0 0 100 100'); v.setAttribute('width', 64); v.setAttribute('height', 64); v.setAttribute('aria-hidden', 'true');
    const add = (t, a) => { const e = document.createElementNS(n, t); for (const k in a) e.setAttribute(k, a[k]); v.append(e); return e; };
    add('circle', { cx: 50, cy: 50, r: 47, fill: '#fff', stroke: '#2F4F3E', 'stroke-width': 2 }); add('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: '#7C9A86' });
    [...g].forEach((c, i) => { const a = (i * 30 + 15) * Math.PI / 180, t = add('text', { x: 50 + 38.5 * Math.cos(a), y: 50 + 38.5 * Math.sin(a) + 3, 'text-anchor': 'middle', 'font-size': 8, fill: '#2F4F3E' }); t.textContent = c; });
    [[20, 62], [75, 35], [55, 78], [40, 28]].forEach(([x, y]) => add('circle', { cx: x, cy: y, r: 2, fill: '#C0654A' })); add('path', { d: 'M20 62L75 35L55 78Z', fill: 'none', stroke: '#C0654A', 'stroke-width': .8 }); return v; };
  const adjuntos = () => { const d = el('div', 'demo-field'), r = el('div', 'demo-adj'), f = el('figure'); f.append(rueda(), el('figcaption', '', 'carta-natal.png'));
    const f2 = el('figure'); f2.append(rueda(), el('figcaption', '', 'transitos-2026.jpg')); const b = el('span', 'demo-subir', '＋ Subir imagen'); r.append(f, f2, b);
    d.append(el('b', '', 'Imágenes adjuntas'), r, el('p', 'demo-hint', 'Puedes subir la carta de tu programa de astrología u otras imágenes y verlas junto a la ficha.')); return d; };
  const campo = (t, v) => { const d = el('div', 'demo-field'); d.append(el('b', '', t), el('p', '', v)); return d; };
  function pintaProf() {
    if (!prof) return;
    prof.replaceChildren(el('span', 'demo-prof-l', 'Elige tu práctica:'), ...P.map(x => {
      const b = el('button', '', x.n); b.type = 'button'; b.setAttribute('aria-pressed', x === pr);
      b.onclick = () => { if (x === pr) return; pr = x; cita = pr.citas[1]; tab = 'ses'; pinta(); };
      return b;
    }));
  }
  function pintaCitas() {
    lista.replaceChildren(...pr.citas.map(c => {
      const li = el('li', c === cita ? 'on' : ''), b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', c === cita);
      b.append(el('span', '', c.hora + ' · ' + c.n), el('i', '', c.st));
      b.onclick = () => { cita = c; pinta(); };
      li.append(b); return li;
    }));
  }
  function pintaTabs() {
    const T = pr.tabs;
    tabs.replaceChildren(...T.map(([k, l]) => {
      const b = el('button', '', l); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === tab); b.tabIndex = k === tab ? 0 : -1;
      b.onclick = () => { tab = k; pinta(); };
      b.onkeydown = e => { const i = T.findIndex(x => x[0] === tab), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (j == null) return; tab = T[(j + T.length) % T.length][0]; pinta(); tabs.querySelector('[aria-selected="true"]').focus(); };
      return b;
    }));
  }
  function pintaPanel() {
    const tp = (pr.tabs.find(x => x[0] === tab) || [])[2], dat = cita.d[tab];
    if (tp === 'chq') {
      const nodes = dat.map(([t, v, m]) => { const d = el('div', 'demo-field'), r = el('div', 'row2'); r.append(el('b', '', t), el('span', '', v + ' / ' + m));
        const bar = el('div', 'barra'), i = el('i'); i.style.width = (v / m * 100) + '%'; bar.append(i); d.append(r, bar); return d; });
      nodes.push(el('p', 'demo-hint', 'Chequeos sencillos: cada vez se guardan para comparar el recorrido.'));
      panel.replaceChildren(...nodes);
    } else if (tp === 'inf') panel.replaceChildren(campo(dat[0], dat[1]));
    else { const n = dat.map(([t, v]) => campo(t, v)); if (pr.id === 'astro' && tab === 'nat') n.push(adjuntos()); panel.replaceChildren(...n); }
  }
  function pinta() { $('d-nombre').textContent = cita.n; $('d-meta').textContent = cita.hora + ' · ' + cita.meta + ' · datos de ejemplo'; pintaProf(); pintaCitas(); pintaTabs(); pintaPanel(); }
  pinta();
})();
