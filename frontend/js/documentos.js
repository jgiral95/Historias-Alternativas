/* Definiciones clínicas, documentos (HTML para ver y descargar) y guardado confirmado. Parte de app.html (scripts clásicos que comparten el ámbito global; el orden de carga importa). */
/* ===== Definiciones clínicas y generación de documentos ===== */
const INTAKE = [
  ['Motivo y demanda', [['motivo', 'Motivo de consulta', 3], ['remitido', 'Remitido', 1], ['historiaProblema', 'Historia de la problemática actual', 4]]],
  ['Antecedentes', [['antMedicos', 'Médicos y medicación', 3], ['antPsi', 'Psicológicos, psiquiátricos y tratamientos previos', 3], ['antFam', 'Familiares', 3], ['sustancias', 'Consumo de sustancias', 2]]],
  ['Historia personal y contexto', [['desarrollo', 'Desarrollo e historia personal', 4], ['familia', 'Dinámica y red familiar', 3], ['social', 'Área social y de pareja', 3], ['academicoLaboral', 'Área académica o laboral', 3]], 'genograma'],
  ['Examen mental', [['examenMental', 'Apariencia, conducta y estado mental', 4]]],
  ['Formulación, objetivos y plan', [['formulacion', 'Formulación del caso (del motivo y la evaluación al diagnóstico y al plan)', 4], ['objetivos', 'Objetivos terapéuticos', 3], ['plan', 'Plan de intervención: enfoque, frecuencia, participación de la familia y criterios de seguimiento', 3], ['expectativas', 'Expectativas frente a la terapia', 2], ['impresion', 'Impresión diagnóstica', 3]]]
];
/* Campos que tenían las primeras citas de versiones anteriores: se muestran si traen datos, para no perder nada. */
const INTAKE_LEGACY = [['mentalApariencia', 'Apariencia y conducta'], ['mentalAfecto', 'Ánimo y afecto'], ['mentalPensamiento', 'Pensamiento y lenguaje'], ['mentalPercepcion', 'Sensopercepción, orientación y memoria'], ['mentalJuicio', 'Juicio y conciencia del problema'], ['riesgo', 'Evaluación de riesgo'], ['nivelRiesgo', 'Nivel de riesgo']];
const legacyOf = i => INTAKE_LEGACY.filter(([k]) => i[k] && !(k === 'nivelRiesgo' && i[k] === RIESGO[0]));
const NOTE_FIELDS = [['objetivoSesion', 'Objetivo de la sesión, según el plan', 2], ['tema', 'Desarrollo y contenido relevante de la sesión', 4], ['intervenciones', 'Intervenciones realizadas y su sustento', 3], ['respuesta', 'Respuesta del consultante', 3], ['evolucionObj', 'Evolución frente a los objetivos', 2], ['riesgoNota', 'Riesgo y acciones tomadas', 2], ['tareas', 'Tareas y acuerdos', 2], ['cambiosPlan', 'Cambios al plan de manejo (si los hay)', 2], ['proxima', 'Plan para la próxima sesión', 2]];
/* Formato propio de cada terapeuta (perfil.formatos). Cada documento firmado guarda una copia (schema) del formato con el que se firmó,
   así los cambios posteriores solo afectan a documentos nuevos. */
const intakeSchema = i => (i && i.signedAt) ? (i.schema || INTAKE) : intakeNew((S.profile.formatos && S.profile.formatos.intake) || INTAKE);
/* Formatos propios hechos antes de los campos nuevos: se agregan los que faltan, sin tocar el resto. */
function intakeNew(sc) {
  if (sc.some(x => x[1].some(f => f[0] === 'formulacion'))) return sc;
  const c = clone(sc); c[c.length - 1][1].unshift(['formulacion', 'Formulación del caso (del motivo y la evaluación al diagnóstico y al plan)', 4]); return c;
}
/* Evolución: sin formato propio no trae campos clínicos; cada profesional arma el suyo en «Mis formatos» (puede partir de NOTE_FIELDS, el sugerido).
   Las notas firmadas sin copia del formato (versiones anteriores) se muestran con NOTE_FIELDS. */
const evolSchema = n => (n && n.signedAt) ? (n.schema || NOTE_FIELDS) : ((S.profile.formatos && S.profile.formatos.evol) || []);
const intakeKeys = sc => sc.flatMap(x => x[1].map(f => f[0]));
const anyFilled = (o, keys) => keys.some(k => String(o[k] || '').trim());
const RIESGO = ['Sin riesgo evidente', 'Bajo', 'Moderado', 'Alto'];
/* Campos obligatorios: se llenan o se escribe «No refiere», «No aplica» o «No se indagó». */
const NR = ['No refiere', 'No aplica', 'No se indagó'];
const REQ = new Set(['motivo', 'historiaProblema', 'antMedicos', 'antPsi', 'antFam', 'desarrollo', 'familia', 'academicoLaboral', 'examenMental', 'formulacion', 'objetivos', 'plan',
  'objetivoSesion', 'tema', 'intervenciones', 'respuesta', 'evolucionObj', 'riesgoNota', 'riesgoAcciones']);
/* Cabecera de cada atención. */
const ENTORNOS = ['Institucional (consultorio)', 'Hogar', 'Escolar', 'Laboral', 'Comunitario'];
const VIAS = ['Demanda espontánea', 'Remitido por otro profesional o institución', 'Orden de autoridad judicial o administrativa', 'Otra'];
const CAUSAS = ['Enfermedad general', 'Evento relacionado con violencia o maltrato', 'Accidente', 'Enfermedad o accidente laboral', 'Otra'];
const DESTINOS = ['Continúa en tratamiento', 'Alta del proceso', 'Remitido a otro profesional o servicio', 'Remitido a urgencias', 'No continúa (abandono o retiro voluntario)'];
const COPIA = ['Sí, en papel', 'Sí, por correo o medio digital', 'Se le ofreció y no la quiso'];
const folioTxt = r => r && r.folio ? 'Folio n.º ' + r.folio : '';
const REPORT_TYPES = ['Colegio o institución educativa', 'Empleador o trabajo', 'Adopción de mascota', 'Remisión a otro profesional', 'Constancia de asistencia', 'Otro'];

const DEFAULT_CONSENT = `CONSENTIMIENTO INFORMADO PARA ATENCIÓN PSICOLÓGICA

Yo, {paciente}, identificado/a con documento {documento}, declaro que {terapeuta} ({registro}) me ha explicado lo siguiente y que he podido hacer preguntas:

1. Naturaleza del servicio. La atención psicológica consiste en sesiones de evaluación y psicoterapia. Me explicaron los objetivos generales, la duración aproximada de las sesiones y su frecuencia.

2. Beneficios y límites. La psicoterapia puede ayudar a disminuir el malestar y a desarrollar recursos personales, pero no se me garantizan resultados específicos. En ocasiones hablar de temas difíciles puede generar malestar temporal.

3. Confidencialidad. Lo que converse en sesión es confidencial. Entiendo que el secreto profesional tiene límites: riesgo grave para mi vida o la de otras personas, sospecha de maltrato o abuso hacia menores de edad o personas en situación de vulnerabilidad, y requerimiento de autoridad competente conforme a la ley.

4. Historia clínica y datos personales. Autorizo el registro de mi atención en una historia clínica, que se conserva de forma reservada. El tratamiento de mis datos personales se rige por la autorización que firmo por separado. Puedo solicitar información sobre mi historia clínica, y no se entregarán informes a terceros sin mi autorización escrita.

5. Libertad de retiro. Mi participación es voluntaria. Puedo suspender el proceso en cualquier momento, e idealmente conversarlo con el profesional.

6. Citas y honorarios. Me informaron las condiciones de agenda, cancelación y pago acordadas.

Declaro que leí y comprendí este documento y acepto de manera libre y voluntaria la atención psicológica.`;

const DATA_TIPO = 'Autorización de tratamiento de datos personales';
const CONSENT_TIPOS = ['Atención presencial', 'Telepsicología (atención a distancia)', 'Presencial y telepsicología', DATA_TIPO];
const TELE_CLAUSE = `

ATENCIÓN A DISTANCIA (TELEPSICOLOGÍA)

7. Cómo funciona. La atención se realiza, total o parcialmente, por videollamada o llamada telefónica en la plataforma que me indicó el profesional. Tiene el mismo alcance clínico que la atención presencial, salvo los límites propios de la distancia: el profesional puede recomendarme atención presencial cuando lo considere necesario, y yo puedo pedirla.

8. Beneficios y riesgos. Me evita desplazamientos y facilita la continuidad del proceso. Sus riesgos son las fallas de conexión, la menor percepción de la comunicación no verbal y la posibilidad de que terceros vean o escuchen la sesión, o de que la información se exponga por fallas de seguridad informática.

9. Responsabilidades. El profesional usará una plataforma con cifrado y control de acceso, se identificará al iniciar y registrará cada sesión en mi historia clínica. Yo me conectaré desde un lugar privado, con una conexión y un equipo adecuados, me identificaré cuando se me pida y no permitiré que otras personas escuchen sin avisar.

10. Privacidad y grabaciones. Ninguna de las partes grabará la sesión sin la autorización expresa de la otra. Si se graba con autorización, la grabación hace parte de mi historia clínica. No se usarán WhatsApp ni redes sociales para la atención clínica.

11. Contacto. Las citas, cambios y documentos se coordinan por los canales que me indicó el profesional, en los horarios acordados. Estos canales no son para urgencias.

12. Fallas y emergencias. Si la comunicación se interrumpe, el profesional intentará restablecerla y, si no es posible, me llamará por teléfono o reprogramaremos. Informé el lugar desde el que me conecto y un contacto de emergencia; ante una situación de riesgo, el profesional podrá activar las rutas de urgencias de mi localidad. En una emergencia debo acudir al servicio de urgencias o a la línea 123.

13. Revocación. Puedo revocar este consentimiento en cualquier momento, sin que eso afecte lo ya registrado.

Este consentimiento es independiente de la autorización para el tratamiento de mis datos personales, que firmo por separado.`;
const DATA_AUTH = `AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES

Yo, {paciente}, identificado/a con documento {documento}, autorizo de manera previa, expresa e informada a {terapeuta} ({registro}), como responsable, para tratar mis datos personales, incluidos datos sensibles relativos a mi salud, con las finalidades que se describen a continuación.

1. Finalidades. Prestarme atención psicológica; elaborar, custodiar y conservar mi historia clínica durante el tiempo que sea necesario; agendar y recordar citas; emitir los informes y certificados que yo solicite o autorice; enviarme ocasionalmente, por correo o mensaje, encuestas de satisfacción sobre el servicio, que puedo no responder.

2. Datos sensibles. Me informaron que los datos de salud son sensibles y que no estoy obligado/a a responder preguntas sobre ellos. Sin embargo, sin esa información el profesional no puede prestarme una atención adecuada.

3. Seguridad y encargados. Mis datos se guardan cifrados, con acceso restringido al profesional. Pueden alojarse en servidores de terceros que actúan como encargados y están obligados a protegerlos. No se venden ni se ceden a terceros.

4. Mis derechos. Puedo conocer, actualizar y rectificar mis datos; pedir prueba de esta autorización; ser informado/a sobre su uso; y revocar esta autorización o pedir la supresión de mis datos.

5. Contacto. Puedo ejercer mis derechos escribiendo a {correo} o llamando al {telefono}.

Declaro que leí y entendí esta autorización y la otorgo de manera libre y voluntaria.`;
const REVOC_NOTE = 'El firmante fue informado de que la revocación aplica desde esta fecha hacia adelante, de que no modifica los registros ya realizados y de que el expediente se conserva de forma reservada.';
/* Modelos propios de consentimiento. El antiguo campo único del perfil se muestra como «Mi consentimiento». */
const myConsents = () => S.profile.consentimientos || (S.profile.consentimiento ? [{ id: 'mio', nombre: 'Mi consentimiento', texto: S.profile.consentimiento }] : []);
const consentName = v => v.startsWith('mio:') ? ((myConsents().find(c => 'mio:' + c.id === v) || {}).nombre || 'Consentimiento') : v;
const consentText = (p, tipo) => tipo.startsWith('mio:') ? fillTpl((myConsents().find(c => 'mio:' + c.id === tipo) || {}).texto || '', p, S.profile) : tipo === DATA_TIPO ? fillTpl(DATA_AUTH, p, S.profile).replace(/\{correo\}/g, S.profile.correo || '________').replace(/\{telefono\}/g, S.profile.telefono || '________') : fillTpl(DEFAULT_CONSENT, p, S.profile) + (/tele/i.test(tipo) ? TELE_CLAUSE : '');
/* Qué modalidades de cita cubren los consentimientos vigentes (igual que en el servidor).
   El equipo no recibe los consentimientos: el servidor le manda solo este resumen. */
const REMOTE_MODS = ['Virtual', 'Telefónica'];
function consentAgenda(p) {
  if (!p) return { presencial: false, distancia: false };
  if (!p.consents && p.consentAgenda) return p.consentAgenda;
  const ok = (p.consents || []).filter(c => c.tipo !== DATA_TIPO && !(c.revocacion && c.revocacion.alcance === 'Total'));
  return { presencial: ok.some(c => !String(c.tipo || '').startsWith('Telepsicología')), distancia: ok.some(c => /tele/i.test(c.tipo || '') || /TELEPSICOLOG/i.test(c.text || '')) };
}
const apptConsentMissing = (p, modalidad) => { const r = REMOTE_MODS.includes(modalidad); return consentAgenda(p)[r ? 'distancia' : 'presencial'] ? '' : r ? 'telepsicología' : 'atención presencial'; };
/* Variables de los consentimientos: datos del paciente, de sus acudientes y del profesional. */
const CONSENT_VARS = [['paciente', 'Nombre del paciente'], ['documento', 'Documento'], ['edad', 'Edad'], ['nacimiento', 'Fecha de nacimiento'], ['paciente_direccion', 'Dirección del paciente'], ['paciente_telefono', 'Teléfono del paciente'], ['paciente_correo', 'Correo del paciente'],
  ['acudiente', 'Acudiente 1'], ['acudiente_documento', 'Documento acudiente 1'], ['acudiente_parentesco', 'Parentesco acudiente 1'], ['acudiente2', 'Acudiente 2'], ['acudiente2_documento', 'Documento acudiente 2'], ['acudiente2_parentesco', 'Parentesco acudiente 2'],
  ['terapeuta', 'Su nombre'], ['cedula', 'Su cédula'], ['registro', 'Su registro'], ['consultorio', 'Consultorio'], ['ciudad', 'Su ciudad'], ['telefono', 'Su teléfono'], ['correo', 'Su correo'], ['fecha', 'Fecha de hoy']];
function fillTpl(t, p, pr) {
  const b = v => v || '________', v = Object.assign(tplValues(p, pr), {
    nacimiento: p.nacimiento ? fmtD(p.nacimiento + 'T12:00:00') : '________', paciente_direccion: b([p.direccion, p.localidad, p.ciudad].filter(Boolean).join(', ')), paciente_telefono: b(telOf(p.telefono, p.telInd)), paciente_correo: b(p.correo),
    acudiente: b(p.acudNombre), acudiente_documento: b(p.acudDoc), acudiente_parentesco: b(p.acudParentesco), acudiente2: b(p.acud2Nombre), acudiente2_documento: b(p.acud2Doc), acudiente2_parentesco: b(p.acud2Parentesco),
    cedula: b(pr.cedula), consultorio: b(pr.consultorio), telefono: b(pr.telefono), correo: b(pr.correo), ciudad: b(pr.ciudad) });
  return t.replace(/\{([a-z_0-9]+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
}

function sessionStats(p) {
  const ns = S.notes.filter(n => n.patientId === p.id && n.signedAt).sort((a, b) => a.sessionAt.localeCompare(b.sessionAt));
  const first = (p.intake && p.intake.signedAt && p.intake.sessionAt) || (ns[0] && ns[0].sessionAt) || '';
  const all = ns.map(n => n.sessionAt); if (p.intake && p.intake.signedAt) all.unshift(p.intake.sessionAt);
  return { count: all.length, first, last: all[all.length - 1] || '' };
}

/* Variables que se pueden usar en las plantillas de informe. */
const TPL_VARS = [['paciente', 'Nombre del paciente'], ['documento', 'Documento'], ['edad', 'Edad'], ['resumen_asistencia', 'Sesiones y fechas'], ['n_sesiones', 'Número de sesiones'], ['primera_sesion', 'Primera sesión'], ['ultima_sesion', 'Última sesión'], ['terapeuta', 'Su nombre'], ['registro', 'Su registro'], ['ciudad', 'Su ciudad'], ['fecha', 'Fecha de hoy']];
function tplValues(p, pr) {
  const st = sessionStats(p), a = ageOf(p.nacimiento);
  return {
    paciente: fullName(p), documento: [p.tipoDoc, p.documento].filter(Boolean).join(' ') || '________', edad: a !== null ? a + ' años' : '____',
    resumen_asistencia: st.count ? `${st.count} sesión(es) realizadas entre el ${fmtD(st.first)} y el ${fmtD(st.last)}` : '[número de sesiones y fechas]',
    n_sesiones: st.count || '____', primera_sesion: st.first ? fmtD(st.first) : '____', ultima_sesion: st.last ? fmtD(st.last) : '____',
    terapeuta: pr.nombre || '________', registro: pr.registro ? 'T.P. ' + pr.registro : 'registro profesional', ciudad: pr.ciudad || '____', fecha: fmtD(new Date().toISOString())
  };
}
const fillVars = (text, p, pr) => { const v = tplValues(p, pr); return text.replace(/\{([a-z_]+)\}/g, (m, k) => (k in v ? v[k] : m)); };
const ATT = 'Por medio de la presente certifico que {paciente}, identificado/a con {documento}, ha asistido a atención psicológica conmigo, con {resumen_asistencia}.';
const CLOSE = '\n\nSe expide a solicitud del interesado/a y con su autorización, para ser presentado ante la entidad indicada. La información se limita a lo estrictamente necesario; el contenido de las sesiones es confidencial.';
const BASE_TPL = {
  'Colegio o institución educativa': ATT + '\n\nAspectos que el consultante o su acudiente autorizan compartir:\n[Describa solo lo necesario: asistencia, proceso en curso, estado general.]\n\nRecomendaciones para la institución:\n[Ajustes razonables, acompañamiento en el aula, comunicación con la familia.]' + CLOSE,
  'Empleador o trabajo': ATT + '\n\nAspectos autorizados para compartir con el empleador:\n[Asistencia, recomendaciones laborales generales. Evite diagnósticos o contenido de sesión salvo autorización expresa.]\n\nRecomendaciones:\n[Horarios, pausas, ajustes del puesto, seguimiento.]' + CLOSE,
  'Adopción de mascota': ATT + '\n\nCon base en el proceso realizado, y desde el ámbito psicológico:\n[Complete según su criterio clínico: estabilidad emocional actual, disponibilidad de tiempo y rutina, motivación para la adopción, red de apoyo.]\n\nEste documento refleja una opinión profesional sobre el momento actual de la persona. No es un diagnóstico y no certifica a un animal como de soporte emocional.' + CLOSE,
  'Remisión a otro profesional': 'Remito a {paciente}, identificado/a con {documento}, para valoración por [especialidad].\n\nMotivo de la remisión:\n[Describa el motivo.]\n\nResumen clínico pertinente (autorizado por el paciente):\n[Síntomas relevantes, tiempo de evolución, intervenciones realizadas.]\n\nQuedo atento/a a la contrarreferencia.' + CLOSE,
  'Constancia de asistencia': ATT + '\n\nLa asistencia a las sesiones se registra en mi historia clínica.' + CLOSE,
  'Otro': ATT + '\n\n[Escriba el contenido del informe.]' + CLOSE
};
const myTemplates = () => (S.profile && S.profile.plantillas) || [];
function tplRaw(key) {
  if (key.startsWith('mia:')) { const m = myTemplates().find(x => x.id === key.slice(4)); return m ? m.contenido : ''; }
  return BASE_TPL[key.replace(/^base:/, '')] || BASE_TPL['Otro'];
}
function tplName(key) {
  if (key.startsWith('mia:')) { const m = myTemplates().find(x => x.id === key.slice(4)); return m ? m.nombre : 'Informe'; }
  return key.replace(/^base:/, '');
}
const reportTemplate = (key, p, pr) => fillVars(tplRaw(key), p, pr);
function tplOptions(sel) {
  const mine = myTemplates();
  return `<optgroup label="Plantillas base">${REPORT_TYPES.map(x => `<option value="base:${esc(x)}" ${sel === 'base:' + x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>` +
    (mine.length ? `<optgroup label="Mis plantillas">${mine.map(m => `<option value="mia:${esc(m.id)}" ${sel === 'mia:' + m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</optgroup>` : '');
}
/* Devuelve el texto de un informe a su forma de plantilla: cambia los datos del paciente por variables. */
function unfill(text, p, pr) {
  const v = tplValues(p, pr), swaps = [[v.resumen_asistencia, '{resumen_asistencia}'], [v.documento, '{documento}'], [p.documento, '{documento}'], [v.paciente, '{paciente}'], [[p.nombres, p.apellidos].filter(Boolean).join(' '), '{paciente}'], [pr.nombre, '{terapeuta}']];
  swaps.forEach(([val, tag]) => { if (val && String(val).length >= 3 && !/^_+$/.test(val)) text = text.split(String(val)).join(tag); });
  return text;
}

/* ----- HTML de documentos ----- */
/* Formato sencillo en textos de plantillas, informes y consentimientos:
   **negrita**, *cursiva*, __subrayado__, líneas que empiezan con «# » (título) y con «- » (viñeta). */
function fmtRich(t) {
  return esc(t).split('\n').map(l => {
    let h = /^#\s+/.test(l) ? 'h' : /^[-•]\s+/.test(l) ? 'li' : '';
    l = l.replace(/^#\s+/, '').replace(/^[-•]\s+/, '');
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
    return h === 'h' ? `<b style="font-size:1.12em">${l}</b>` : h === 'li' ? `<span style="display:inline-block;padding-left:1.3em;text-indent:-1em">•&nbsp; ${l}</span>` : l;
  }).join('\n');
}
const RICH = [['b', '<b>N</b>', 'Negrita', '**'], ['i', '<i>C</i>', 'Cursiva', '*'], ['u', '<u>S</u>', 'Subrayado', '__'], ['h', 'Título', 'Título', '# '], ['li', '• Lista', 'Lista con viñetas', '- ']];
function richBar(id) {
  return `<div class="richbar" role="toolbar" aria-label="Formato del texto">${RICH.map(([k, lab, t]) => `<button type="button" class="btn sm" data-rich="${k}" data-for="${id}" title="${t}" aria-label="${t}">${lab}</button>`).join('')}<button type="button" class="btn sm" data-rich="prev" data-for="${id}" aria-pressed="false">Vista previa</button></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rich]'); if (!b) return;
  const ta = document.getElementById(b.dataset.for); if (!ta) return;
  e.preventDefault();
  if (b.dataset.rich === 'prev') {
    let pv = ta.nextElementSibling && ta.nextElementSibling.classList.contains('richprev') ? ta.nextElementSibling : null;
    if (pv) { pv.remove(); ta.hidden = false; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Vista previa'; return; }
    pv = document.createElement('div'); pv.className = 'richprev'; pv.innerHTML = fmtRich(ta.value); ta.after(pv); ta.hidden = true; b.setAttribute('aria-pressed', 'true'); b.textContent = 'Editar texto'; return;
  }
  if (ta.hidden) return;
  const [, , , mk] = RICH.find(r => r[0] === b.dataset.rich), a = ta.selectionStart, z = ta.selectionEnd, v = ta.value;
  if (mk.endsWith(' ')) { // título o viñeta: al comienzo de cada línea seleccionada
    const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', z) < 0 ? v.length : v.indexOf('\n', z);
    const lines = v.slice(ls, le).split('\n'), all = lines.every(l => l.startsWith(mk));
    const out = lines.map(l => all ? l.slice(mk.length) : (l.startsWith(mk) ? l : mk + l.replace(/^(#|-|•)\s+/, ''))).join('\n');
    ta.setRangeText(out, ls, le, 'select');
  } else {
    const sel = v.slice(a, z);
    if (sel.startsWith(mk) && sel.endsWith(mk) && sel.length >= mk.length * 2) ta.setRangeText(sel.slice(mk.length, -mk.length), a, z, 'select');
    else if (v.slice(a - mk.length, a) === mk && v.slice(z, z + mk.length) === mk) { ta.setRangeText(sel, a - mk.length, z + mk.length, 'select'); }
    else { ta.setRangeText(mk + (sel || 'texto') + mk, a, z, 'select'); ta.selectionStart = a + mk.length; ta.selectionEnd = a + mk.length + (sel || 'texto').length; }
  }
  ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
});
function letterhead(pr) {
  const l2 = [pr.nombre, pr.titulo, pr.registro ? 'T.P. ' + pr.registro : ''].filter(Boolean).join(' · ');
  const l3 = [pr.ciudad, pr.telefono, pr.correo].filter(Boolean).join(' · ');
  // los informes usan el logo guardado al firmarlos; los demás documentos, el logo actual del perfil
  const logo = pr.logo !== undefined ? pr.logo : (S.profile && S.profile.logo);
  return `${logo ? `<div style="text-align:center;margin-bottom:6px"><img src="${logo}" alt="Logo" style="max-height:80px;max-width:260px"></div>` : ''}<h1>${esc(pr.consultorio || 'Consulta psicológica')}</h1><div class="lh">${esc(l2)}${l3 ? '<br>' + esc(l3) : ''}</div>`;
}
function patientTable(p) {
  const a = ageOf(p.nacimiento), r = [
    ['Paciente', fullName(p)], ['Documento', [p.tipoDoc, p.documento].filter(Boolean).join(' ')],
    [p.nacimiento ? 'Nacimiento' : 'Lugar de nacimiento', p.nacimiento ? fmtD(p.nacimiento) + (a !== null ? ` (${a} años)` : '') + (p.lugarNac ? ', ' + p.lugarNac : '') : p.lugarNac], ['Sexo', p.sexo], ['Identidad de género', p.identidadGenero], ['Pertenencia étnica', [p.etnia, p.etniaPueblo].filter(Boolean).join(' · ')],
    ['Estado civil', p.estadoCivil], ['Escolaridad', p.escolaridad], ['Ocupación', p.ocupacion],
    ['Dirección', [p.direccion, p.localidad, p.ciudad].filter(Boolean).join(', ')], ['Teléfono', telOf(p.telefono, p.telInd)], ['Correo', p.correo],
    ['Contacto de emergencia', [p.emergNombre, p.emergParentesco, telOf(p.emergTelefono, p.emergInd)].filter(Boolean).join(' · ')],
    ['Cuidador 1', [p.acudNombre, p.acudParentesco, p.acudDoc && 'doc. ' + p.acudDoc, telOf(p.acudTel, p.acudInd)].filter(Boolean).join(' · ')],
    ['Cuidador 2', [p.acud2Nombre, p.acud2Parentesco, p.acud2Doc && 'doc. ' + p.acud2Doc, telOf(p.acud2Tel, p.acud2Ind)].filter(Boolean).join(' · ')]
  ].concat(datosSchema().flatMap(([t, fs]) => fs.map(f => [f[1] || t, p[f[0]]]))).filter(x => x[1]);
  return `<table>${r.map(x => `<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1])}</td></tr>`).join('')}</table>`;
}
function sigBlock(items) {
  return `<div class="sigs">${items.map(i => `<div class="sg">${i.img ? `<img src="${i.img}" alt="Firma de ${esc(i.name)}">` : '<div style="height:64px"></div>'}<div class="ln"><b>${esc(i.name)}</b><br>${esc(i.role)}${i.extra ? '<br>' + esc(i.extra) : ''}${i.extra2 ? '<br>' + esc(i.extra2) : ''}<br>${esc(i.when)}</div></div>`).join('')}</div>`;
}
function therSig(rec, when) { return { img: rec.therapistSig, name: rec.therapistName || '', role: 'Psicólogo/a tratante', extra: [rec.therapistDocId ? 'C.C. ' + rec.therapistDocId : '', rec.therapistReg ? 'T.P. ' + rec.therapistReg : ''].filter(Boolean).join(' · '), when: 'Firmado: ' + fmtDT(when) }; }

function docConsent(p, c) {
  c = c || (p.consents || []).slice(-1)[0]; if (!c) return '<p>Sin consentimiento registrado.</p>';
  const pr = { nombre: c.therapistName, titulo: '', registro: c.therapistReg, consultorio: c.consultorio };
  const role = t => t === 'Acudiente' ? 'Acudiente / representante legal' : 'Paciente';
  let h = `<div class="docpage">${letterhead(pr)}${patientTable(p)}<h2>Consentimiento informado${c.tipo ? ' · ' + esc(c.tipo) : ''}</h2>${c.folio ? `<p style="font-size:12px"><b>Folio n.º ${c.folio}</b></p>` : ''}<p>${fmtRich(c.text)}</p>${c.copia ? `<p style="font-size:13px"><b>Copia para el usuario:</b> ${esc(c.copia)}</p>` : ''}
  ${sigBlock([{ img: c.signerSig, name: c.signerName, role: c.signer2Name || c.sinFirma2 ? 'Representante legal' + (c.signerParentesco ? ' (' + c.signerParentesco + ')' : '') : role(c.signerType), extra: c.signerDoc ? 'Doc. ' + c.signerDoc : '', when: 'Firmado: ' + fmtDT(c.signedAt) }]
    .concat(c.signer2Name ? [{ img: c.signer2Sig, name: c.signer2Name, role: 'Representante legal' + (c.signer2Parentesco ? ' (' + c.signer2Parentesco + ')' : ''), extra: c.signer2Doc ? 'Doc. ' + c.signer2Doc : '', when: 'Firmado: ' + fmtDT(c.signedAt) }] : [])
    .concat([therSig(c, c.remoto ? c.remoto.enviadoAt : c.signedAt)]))}${c.remoto ? remoteEvidence(c) : ''}${c.sinFirma2 ? `<p><b>Firma de un solo representante.</b> ${esc(c.sinFirma2)}${c.soporte ? `<br><b>Soporte adjunto:</b> ${esc(c.soporte.nombre)}${c.soporte.sha256 ? ` <span style="font-family:monospace;font-size:11px;word-break:break-all">(SHA-256: ${esc(c.soporte.sha256)})</span>` : ''}` : ''}</p>` : ''}`;
  const a = c.asentimiento;
  if (a) h += `<h2>Asentimiento del menor de edad</h2><p><b>${esc(a.nombre)}:</b> ${esc(a.estado)}.${a.valoracion ? '<br>' + esc(a.valoracion) : ''}</p>${a.firma ? sigBlock([{ img: a.firma, name: a.nombre, role: 'Menor de edad (asentimiento)', when: 'Firmado: ' + fmtDT(c.signedAt) }]) : ''}`;
  const r = c.revocacion;
  if (r) h += `<h2>Revocación del consentimiento</h2><p><b>Fecha:</b> ${esc(fmtD(r.fecha))}<br><b>Alcance:</b> ${esc(r.alcance)}${r.detalle ? '<br><b>Detalle:</b> ' + esc(r.detalle) : ''}${r.motivo ? '<br><b>Motivo expresado:</b> ' + esc(r.motivo) : ''}</p><p>${esc(REVOC_NOTE)}</p>
  ${sigBlock([{ img: r.signerSig, name: r.signerName, role: role(r.signerType), extra: r.signerDoc ? 'Doc. ' + r.signerDoc : '', when: 'Firmado: ' + fmtDT(r.signedAt) }, therSig(r, r.signedAt)])}`;
  return h + '</div>';
}
function adendas(list) { return (list && list.length) ? `<h2>Adendas y correcciones</h2>${list.map(a => `<div style="margin:0 0 10px"><p style="margin:0"><b>${a.tipo === 'Corrección' ? 'Corrección' : 'Adenda'} · ${esc(fmtDT(a.at))}${a.by ? ' · ' + esc(addAuthor(a)) : ''}</b></p>${addendumBody(a)}</div>`).join('')}` : ''; }
function docIntake(p) {
  const i = p.intake; if (!i || !i.signedAt) return '<p>Primera vez sin firmar.</p>';
  const pr = { nombre: i.therapistName, registro: i.therapistReg, consultorio: i.consultorio };
  let h = `<div class="docpage">${letterhead(pr)}<h2>Historia clínica · Primera vez</h2>${patientTable(p)}<p><b>Fecha y hora de la sesión:</b> ${esc(fmtDT(i.sessionAt))}${i.modalidad ? '<br><b>Modalidad:</b> ' + esc(i.modalidad) : ''}</p>${atencionDoc(i)}${teleDoc(i)}`;
  intakeSchema(i).forEach(([t, fs, g]) => {
    const rows = fs.filter(f => i[f[0]]);
    if (rows.length) h += `<h2>${esc(t)}</h2>` + rows.map(f => f[1] ? `<p><b>${esc(f[1])}.</b> ${esc(i[f[0]])}</p>` : `<p>${esc(i[f[0]])}</p>`).join('');
    if (g === 'genograma' && i.genograma) h += `<h2>Genograma</h2><img class="geno" src="${i.genograma}" alt="Genograma">`;
  });
  if (i.riesgoAcciones) h += `<h2>Evaluación de riesgo</h2><p>${i.riesgoNivel ? '<b>Nivel:</b> ' + esc(i.riesgoNivel) + '. ' : ''}${esc(i.riesgoAcciones)}</p>`;
  if (hasDx(i)) h += `<h2>Diagnóstico</h2>` + dxTable(i);
  const lg = legacyOf(i); if (lg.length) h += `<h2>Registros de la versión anterior</h2>` + lg.map(([k, l]) => `<p><b>${esc(l)}.</b> ${esc(i[k])}</p>`).join('');
  return h + adendas(i.addenda) + sigBlock([therSig(i, i.signedAt)]) + '</div>';
}
function docNote(n, p) {
  const pr = { nombre: n.therapistName, registro: n.therapistReg, consultorio: n.consultorio };
  let h = `<div class="docpage">${letterhead(pr)}<h2>Nota de evolución</h2><table><tr><td><b>Paciente</b></td><td>${esc(fullName(p))}</td></tr><tr><td><b>Sesión</b></td><td>${esc(fmtDT(n.sessionAt))}${n.sesion ? ' · sesión n.º ' + n.sesion : ''}</td></tr>${n.modalidad ? `<tr><td><b>Modalidad</b></td><td>${esc(n.modalidad)}</td></tr>` : ''}${n.duracion ? `<tr><td><b>Duración</b></td><td>${esc(n.duracion)} min</td></tr>` : ''}${n.nivelRiesgo && !n.riesgoNivel ? `<tr><td><b>Riesgo</b></td><td>${esc(n.nivelRiesgo)}</td></tr>` : ''}</table>${atencionDoc(Object.assign({}, n, { sesion: '' }))}`;
  h += teleDoc(n);
  evolSchema(n).forEach(f => { if (n[f[0]]) h += `<p><b>${esc(f[1])}.</b> ${esc(n[f[0]])}</p>`; });
  if (hasDx(n)) h += `<h2>Diagnóstico</h2>` + dxTable(n);
  return h + adendas(n.addenda) + sigBlock([therSig(n, n.signedAt)]) + '</div>';
}
function docReport(r, p) {
  const pr = { logo: r.therapistLogo, nombre: r.therapistName, titulo: S.profile.titulo, registro: r.therapistReg, consultorio: r.consultorio, ciudad: S.profile.ciudad, telefono: S.profile.telefono, correo: S.profile.correo };
  return `<div class="docpage">${letterhead(pr)}<p style="text-align:right">${esc([S.profile.ciudad, fmtD(r.signedAt)].filter(Boolean).join(', '))}</p>
  <h2>${esc(r.tipo)}</h2>${r.folio ? `<p style="font-size:12px"><b>Folio n.º ${r.folio}</b></p>` : ''}<p><b>Dirigido a:</b> ${esc(r.destinatario || 'A quien corresponda')}</p>${r.asunto ? `<p><b>Asunto:</b> ${esc(r.asunto)}</p>` : ''}
  <p>${fmtRich(r.contenido)}</p><p style="font-size:13px"><i>Divulgación autorizada por: ${esc(r.autorizaPor || '')}.</i></p>${adendas(r.addenda)}${sigBlock([therSig(r, r.signedAt)])}${verifBox(r)}</div>`;
}
/* Partes de la historia completa; el profesional puede excluir algunas al generarla. */
const FULL_PARTS = [['consents', 'Consentimientos y autorizaciones'], ['intake', 'Primera vez'], ['notes', 'Evoluciones'], ['scales', 'Escalas'], ['reports', 'Informes'], ['cierres', 'Notas de cierre'], ['incorp', 'Constancias de historia en papel'], ['anexos', 'Anexos (lista y archivos)']];
function partCount(p, k) {
  return { consents: (p.consents || []).length, intake: p.intake && p.intake.signedAt ? 1 : 0, notes: S.notes.filter(n => n.patientId === p.id && n.signedAt).length, scales: S.scales.filter(e => e.patientId === p.id && e.signedAt).length,
    reports: S.reports.filter(r => r.patientId === p.id && r.signedAt).length, cierres: (p.cierres || []).length, incorp: (p.incorporaciones || []).length, anexos: S.files.filter(f => f.patientId === p.id).length }[k];
}
function docFull(p, sin = []) {
  let h = '';
  const no = k => sin.includes(k), sep = () => h ? '<div class="pb"></div>' : '';
  const omit = FULL_PARTS.filter(([k]) => no(k) && partCount(p, k)).map(([, l]) => l.toLowerCase());
  if (omit.length) h += `<p style="font-size:13px"><i>Copia parcial de la historia clínica de ${esc(fullName(p))}, generada el ${esc(fmtDT(nowISO()))}. No incluye: ${esc(omit.join(', '))}.</i></p>`;
  if (!no('consents')) (p.consents || []).forEach(c => { h += sep() + docConsent(p, c); });
  if (!no('intake') && p.intake && p.intake.signedAt) h += sep() + docIntake(p);
  if (!no('notes')) S.notes.filter(n => n.patientId === p.id && n.signedAt).sort((a, b) => a.sessionAt.localeCompare(b.sessionAt)).forEach(n => { h += sep() + docNote(n, p); });
  if (!no('scales')) S.scales.filter(e => e.patientId === p.id && e.signedAt).sort((a, b) => a.aplicadaAt.localeCompare(b.aplicadaAt)).forEach(e => { h += sep() + docScale(e, p); });
  if (!no('reports')) S.reports.filter(r => r.patientId === p.id && r.signedAt).sort((a, b) => a.signedAt.localeCompare(b.signedAt)).forEach(r => { h += sep() + docReport(r, p); });
  if (!no('cierres')) (p.cierres || []).forEach(c => { h += sep() + docCierre(p, c); });
  if (!no('incorp')) (p.incorporaciones || []).forEach(c => { h += sep() + docIncorp(p, c); });
  const fs = no('anexos') ? [] : S.files.filter(f => f.patientId === p.id);
  if (fs.length) h += '<div class="pb"></div><div class="docpage"><h2>Anexos de la historia clínica</h2><table>' + fs.map(f => `<tr><td>${esc(fmtShort(f.uploadedAt))}</td><td>${esc(f.categoria)}</td><td>${esc(f.nombre)}${f.descripcion ? ' · ' + esc(f.descripcion) : ''}</td></tr>`).join('') + '</table></div>';
  return h || '<p>Aún no hay registros firmados.</p>';
}

const DOC_CSS = `body{font-family:"Source Serif 4",Georgia,serif;color:#1B2326;line-height:1.6;font-size:15px;max-width:780px;margin:24px auto;padding:0 20px}
h1{font-size:20px;text-align:center;margin:0 0 4px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 4px;border-bottom:1px solid #c9d2d4;padding-bottom:2px}
.lh{text-align:center;font-size:13px;color:#4a5a5e;margin-bottom:14px}p{margin:6px 0;white-space:pre-wrap}table{border-collapse:collapse;width:100%;font-size:14px}td{padding:3px 8px 3px 0;vertical-align:top}
.sigs{display:flex;gap:30px;flex-wrap:wrap;margin-top:22px}.sg{min-width:200px;flex:1}.sg img{height:64px;display:block}.sg .ln{border-top:1px solid #1B2326;margin-top:2px;padding-top:3px;font-size:13px}
img.geno{max-width:100%;height:auto;border:1px solid #c9d2d4}.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{border:1px solid #c9d2d4;padding:6px 10px;min-width:130px}.stat b{display:block;font-size:20px}.stat span{font-size:12px}.sec h3{font-size:15px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 4px;border-bottom:1px solid #c9d2d4}.stnote{font-size:13px;color:#4a5a5e}.stgrid{display:block}table.sttab th,table.sttab td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid #c9d2d4;vertical-align:top}table.sttab th{font-size:12px;color:#4a5a5e}tr.tot td{font-weight:bold}.bars{margin:8px 0}.bar{display:grid;grid-template-columns:38% 1fr auto;gap:8px;align-items:center;font-size:13px;margin:3px 0}.bar .bt{height:10px;background:#eef0f1}.bar .bt i{display:block;height:100%;background:#4E6B58;-webkit-print-color-adjust:exact;print-color-adjust:exact}.btn{display:none}table.dxt th,table.dxt td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid #c9d2d4}table.dxt th{font-size:12px;color:#4a5a5e}.pb{page-break-after:always;height:1px}@media print{body{margin:0}}`;
function standalone(title, body) { return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${DOC_CSS}</style></head><body>${body}</body></html>`; }
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'documento';

async function downloadFile(filename, data) {
  try {
    const d = window.claude && claude.use ? await claude.use('downloads') : null;
    if (!d) {
      const type = filename.endsWith('.json') ? 'application/json' : 'text/html';
      const url = URL.createObjectURL(new Blob([data], { type: type + ';charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Archivo descargado.'); return;
    }
    await d.save({ filename, data }); toast('Archivo guardado.');
  } catch (e) { if (!e || e.code !== 'declined') toast('No se pudo descargar el archivo.'); }
}
/* Imprime un documento solo (sin la app alrededor): lo carga en un marco oculto con los estilos de documento y abre el diálogo
   de impresión del navegador, donde también se puede «Guardar como PDF». */
function printDoc(title, body) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('No se pudo abrir la impresión: use «Descargar».'); } setTimeout(() => f.remove(), 60000); };
  f.srcdoc = standalone(title, body); document.body.appendChild(f);
}
function showDoc(title, body, filename) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="box"><div class="row" style="justify-content:space-between"><h3>${esc(title)}</h3><div class="row"><button class="btn pri" id="pr">Imprimir</button><button class="btn" id="dl">Descargar (abre e imprime como PDF)</button><button class="btn" id="cp">Copiar texto</button><button class="btn" id="cl">Cerrar</button></div></div><div class="paper" id="paper">${body}</div></div></div>`;
  $('#cl').onclick = () => root.innerHTML = '';
  $('#dl').onclick = () => downloadFile(filename, standalone(title, body));
  $('#pr').onclick = () => printDoc(title, body);
  $('#cp').onclick = async () => { const t = $('#paper').innerText; try { await navigator.clipboard.writeText(t); toast('Texto copiado.'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#paper')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Texto seleccionado; cópielo con Ctrl+C.'); } };
}

/* ===== Guardado confirmado =====
   Lo firmado solo se muestra como guardado cuando el servidor lo confirma. Si falla, se deshace el cambio
   en memoria, el formulario queda como estaba y aparece un aviso que no se borra solo. */
const restore = (o, snap) => { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, snap); };
function setBusy(btn, on) {
  if (!btn || !btn.tagName) return;
  if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
}
function saveError(e) {
  $$('.savefail').forEach(x => x.remove());
  if (e && e.status === 401) { relogin(); return; }
  const off = navigator.onLine === false;
  const d = document.createElement('div'); d.className = 'savefail'; d.setAttribute('role', 'alert');
  d.innerHTML = `<div><b>No se guardó.</b> ${esc(off ? 'No hay conexión a internet.' : (e instanceof TypeError || /fetch|network|load failed/i.test(e && e.message || '')) ? 'No se pudo conectar con el servidor.' : (e && e.message) || 'El servidor no respondió.')} Lo que escribió sigue en pantalla: revise la conexión y vuelva a intentarlo.</div><button class="btn sm">Cerrar</button>`;
  d.querySelector('button').onclick = () => d.remove();
  document.body.appendChild(d);
}
function relogin() {
  if ($('#relogin')) return;
  const d = document.createElement('div'); d.className = 'idle'; d.id = 'relogin';
  d.innerHTML = `<form class="box" style="text-align:left"><b>Su sesión terminó</b><p style="margin:0">Ingrese su contraseña para continuar. Lo que escribió sigue en pantalla; después vuelva a pulsar el botón de guardar.</p>
  <div class="fld"><label for="rl_pass">Contraseña de ${esc(S.user ? S.user.email : '')}</label><input id="rl_pass" type="password" autocomplete="current-password" required></div>
  <div class="row end"><button type="button" class="btn" id="rl_out">Salir</button><button class="btn pri">Continuar</button></div></form>`;
  document.body.appendChild(d);
  const f = d.querySelector('form'); $('#rl_pass').focus();
  $('#rl_out').onclick = () => { d.remove(); doLogout(); };
  let ticket = null;
  f.onsubmit = async ev => {
    ev.preventDefault();
    try {
      let r;
      if (!ticket) {
        r = await api('/auth/login', { method: 'POST', body: { email: S.user.email, password: $('#rl_pass').value }, noRedirect: true });
        if (r.need_2fa) { ticket = r.ticket; $('#rl_pass').closest('.fld').outerHTML = `<div class="fld"><label for="rl_code">Código de su app autenticadora (o de recuperación)</label>${CODE_INPUT('rl_code')}</div>`; $('#rl_code').focus(); return; }
      } else r = await api('/auth/2fa/login', { method: 'POST', body: { ticket, code: $('#rl_code').value.trim() }, noRedirect: true });
      S.user = r; Idle.last = Idle.ping = Date.now(); d.remove(); toast('Sesión renovada. Vuelva a guardar.');
    } catch (err) { toast(err.message); }
  };
}
async function persist(list, btn) {
  setBusy(btn, true);
  try { for (const o of list) await Store.save(o, { strict: true }); $$('.savefail').forEach(x => x.remove()); return true; }
  catch (e) { saveError(e); return false; }
  finally { setBusy(btn, false); }
}

