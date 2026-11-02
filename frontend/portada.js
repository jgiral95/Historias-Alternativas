/* Página de inicio pública: vista previa interactiva de la app (agenda y pestañas). Datos de ejemplo, sin pacientes reales. */
(function () {
  'use strict';
  var PAC = {
    maria: {
      nombre: 'María P.', meta: '8:00 · Presencial · Sesión 6', mujer: true, hermano: 'Hermano', firma: false,
      motivo: 'Crisis de angustia en el transporte público y evitación de salir sola.',
      examen: 'Alerta y orientada. Afecto ansioso que se modula durante la entrevista; pensamiento coherente.',
      plan: 'Exposición gradual a los trayectos y práctica de respiración diafragmática.',
      phq: 5, gad: 8, escNota: 'Sesión 6: el GAD-7 bajó de 15 a 8 desde la primera vez.',
      dx: ['Trastorno de pánico', 'Impresión inicial']
    },
    andres: {
      nombre: 'Andrés G.', meta: '10:00 · Presencial · Sesión 1', mujer: false, hermano: 'Hermana', firma: false,
      motivo: 'Dificultad para dormir y estrés por la carga de trabajo desde hace tres meses.',
      examen: 'Alerta y orientado. Afecto ansioso, discurso coherente, sin alteraciones de la percepción.',
      plan: 'Psicoeducación sobre higiene del sueño y registro de pensamientos durante dos semanas.',
      phq: 6, gad: 11, escNota: 'Primera aplicación. Los puntajes quedan en la historia para comparar sesión a sesión.',
      dx: ['Trastorno de ansiedad generalizada', 'Impresión inicial']
    },
    lucia: {
      nombre: 'Lucía R.', meta: '11:30 · Telesalud · Sesión 3', mujer: true, hermano: 'Hermano', firma: false,
      motivo: 'Tristeza persistente y pérdida de interés desde un cambio de ciudad.',
      examen: 'Por videollamada: afecto triste, discurso lento, juicio conservado.',
      plan: 'Activación conductual y seguimiento semanal por telesalud.',
      phq: 13, gad: 6, escNota: 'Respondió las escalas durante la sesión por videollamada.',
      dx: ['Trastorno depresivo de episodio único', 'Impresión inicial']
    },
    camilo: {
      nombre: 'Camilo T.', meta: '15:00 · Presencial · Sesión 2', mujer: false, hermano: 'Hermana', firma: true,
      motivo: 'Irritabilidad y problemas de concentración desde un cambio familiar hace dos meses.',
      examen: 'Alerta y orientado. Afecto irritable, pensamiento coherente, buena disposición.',
      plan: 'Manejo de emociones y una sesión con la familia.',
      phq: 8, gad: 9, escNota: 'Segunda aplicación: puntajes estables respecto a la primera sesión.',
      dx: ['Trastorno de adaptación', 'Impresión inicial']
    }
  };
  var $ = function (id) { return document.getElementById(id); };
  var set = function (id, txt) { var el = $(id); if (el) el.textContent = txt; };
  var nivelPHQ = function (n) { return n < 5 ? 'Mínima' : n < 10 ? 'Leve' : n < 15 ? 'Moderada' : n < 20 ? 'Moderadamente severa' : 'Severa'; };
  var nivelGAD = function (n) { return n < 5 ? 'Mínima' : n < 10 ? 'Leve' : n < 15 ? 'Moderada' : 'Severa'; };

  function mostrarPaciente(key) {
    var p = PAC[key]; if (!p) return;
    document.querySelectorAll('.cita').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.p === key)); });
    set('d-nombre', p.nombre); set('d-meta', p.meta);
    $('d-firma').hidden = !p.firma;
    set('d-motivo', p.motivo); set('d-examen', p.examen); set('d-plan', p.plan);
    set('d-geno-lab', p.nombre.split(' ')[0]); set('d-geno-her-lab', p.hermano);
    $('d-geno-pac').style.display = p.mujer ? 'none' : '';
    $('d-geno-pac-m').style.display = p.mujer ? '' : 'none';
    var herMujer = p.hermano === 'Hermana';
    $('d-geno-her').style.display = herMujer ? '' : 'none';
    $('d-geno-her-h').style.display = herMujer ? 'none' : '';
    set('d-phq', p.phq); set('d-phq-lab', nivelPHQ(p.phq)); $('d-phq-bar').style.width = Math.round(p.phq / 27 * 100) + '%';
    set('d-gad', p.gad); set('d-gad-lab', nivelGAD(p.gad)); $('d-gad-bar').style.width = Math.round(p.gad / 21 * 100) + '%';
    set('d-esc-nota', p.escNota);
    set('d-dx-name', p.dx[0]); set('d-dx-tipo', p.dx[1]);
    var main = document.querySelector('.demo-main');
    main.classList.remove('demo-flash'); void main.offsetWidth; main.classList.add('demo-flash');
  }

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.demo-tabs [role="tab"]'));
  function mostrarPestana(tab, enfocar) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (enfocar) tab.focus();
  }

  document.querySelectorAll('.cita').forEach(function (b) {
    b.addEventListener('click', function () { mostrarPaciente(b.dataset.p); });
  });
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { mostrarPestana(t, false); });
    t.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
      if (j === null) return;
      e.preventDefault();
      mostrarPestana(tabs[(j + tabs.length) % tabs.length], true);
    });
  });
})();

/* Preguntas frecuentes: al abrir una, se cierran las demás (respaldo para navegadores sin <details name>). */
(function () {
  'use strict';
  var items = document.querySelectorAll('.faq details');
  Array.prototype.forEach.call(items, function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      Array.prototype.forEach.call(items, function (o) { if (o !== d && o.open) o.open = false; });
    });
  });
})();
