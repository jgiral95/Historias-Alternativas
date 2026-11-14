/* Modelos para coaches: pestañas propias listas para instalar desde Mis formatos → Pestañas. Parte de app.html (script clásico; se usa al hacer clic, no al cargar). */
const CK = (...a) => a.map(([k, l, r]) => [k, l, r || 2]);
const CK_ATENCION = ['Datos de la atención', CK(['c_ini', 'Inicio (fecha y hora)', 1], ['c_fin', 'Hora de fin', 1], ['c_mod', 'Modalidad (Presencial · Virtual · Telefónica)', 1], ['c_ses', 'Sesión (ej.: 4 de 10)', 1])];
const CK_ANT = ['Compromisos anteriores', CK(['c_ant', 'Compromisos de la sesión anterior: Cumplido · Parcial · No cumplido · Ya no aplica', 3], ['c_apr', '¿Qué aprendió al intentarlo?', 3])];
const CK_CIERRE = ['Cierre de la nota', CK(['c_com', 'Compromisos nuevos (acción · fecha límite · quién lo verifica: el coachee, el coach u otra persona)', 4], ['c_avance', 'Avance hacia el objetivo, de 1 (lejos) a 10 (logrado)', 1], ['c_priv', 'Notas privadas del coach (solo para ti: no las compartas ni las incluye en informes)', 4], ['c_rem', '¿Requiere remisión? No · Psicología · Salud · Otro. Si no es «No»: motivo y a quién se remite', 2])];
const COACH_MODELOS = [
  { id: 'x_coach_acuerdo', nombre: 'Acuerdo', modo: 'unica', base: 1, secs: [
    ['El proceso', CK(['c_tipo', 'Tipo de coaching (Vida · Ejecutivo · Ontológico · Sistémico · PNL · Salud y bienestar · Otro)', 1], ['c_quien', '¿Quién contrata? (El coachee · Una empresa (sponsor) · Otra persona)', 1], ['c_spon', 'Sponsor: nombre, cargo, empresa y correo', 2], ['c_nses', 'Sesiones pactadas', 1], ['c_frec', 'Frecuencia (Semanal · Quincenal · Mensual · Variable)', 1], ['c_dur', 'Duración por sesión (minutos)', 1], ['c_pago', 'Valor y forma de pago', 1])],
    ['Objetivo', CK(['c_obj', 'Lo que quiere lograr, en sus palabras', 3], ['c_ind', '¿Cómo sabremos que lo logró? (indicadores observables)', 3], ['c_ini0', 'Punto de partida, de 1 (muy lejos) a 10 (logrado)', 1])],
    ['Acuerdos', CK(['c_conf', 'Expliqué la confidencialidad y sus límites (Sí/No)', 1], ['c_terap', 'Sabe que el coaching no reemplaza la terapia ni la atención en salud (Sí/No)', 1], ['c_canc', 'Política de cancelación', 2], ['c_grab', 'Autoriza grabar sesiones (Sí/No)', 1])]] },
  { id: 'x_coach_grow', nombre: 'Sesión (GROW)', modo: 'sesion', base: 1, secs: [CK_ATENCION, CK_ANT,
    ['La conversación (GROW)', CK(['c_g', 'G · Meta de la sesión: ¿qué quiere llevarse hoy?', 3], ['c_r', 'R · Realidad: hechos, intentos y obstáculos', 3], ['c_o', 'O · Opciones exploradas', 3], ['c_w', 'W · Voluntad: qué decide', 3], ['c_apre', 'Aprendizaje en palabras del coachee', 2])], CK_CIERRE] },
  { id: 'x_coach_rueda', nombre: 'Rueda de la vida', modo: 'sesion', base: 1, secs: [
    ['Momento', CK(['c_mom', 'Momento (Inicio · Mitad · Cierre · Otro)', 1])],
    ['Rueda: satisfacción hoy / deseada, de 1 a 10', CK(['c_salud', 'Salud (hoy / deseada)', 1], ['c_trab', 'Trabajo y carrera', 1], ['c_din', 'Dinero', 1], ['c_fam', 'Familia', 1], ['c_par', 'Pareja', 1], ['c_ami', 'Amistades', 1], ['c_cre', 'Crecimiento personal', 1], ['c_ocio', 'Ocio y descanso', 1])],
    ['Valores y visión', CK(['c_val', 'Valores más importantes (hasta 5: Libertad, Familia, Seguridad, Aprendizaje, Reconocimiento, Salud, Servicio, Otro)', 2], ['c_vis', 'Tu vida plena se vería así', 3], ['c_pal', 'Área palanca: la que, si mejora, mueve a las demás', 1], ['c_paso', 'Primer paso y fecha', 2])]] },
  { id: 'x_coach_cierre', nombre: 'Cierre', modo: 'unica', base: 1, secs: [
    ['Resultados', CK(['c_av', 'Avance: punto de partida → hoy (1 a 10)', 1], ['c_indc', 'Indicadores del acuerdo: ¿se cumplieron? (Sí · En parte · No, con comentario)', 4], ['c_log', 'Logros (pueden ir a la empresa)', 3], ['c_apc', 'Aprendizajes clave, en palabras del coachee', 3], ['c_abi', 'Lo que queda abierto', 2], ['c_rec', 'Recomendaciones y próximos pasos (pueden ir a la empresa)', 3])],
    ['Evaluación y destino', CK(['c_val2', 'Valoración del proceso por el coachee (1 a 10) y comentario', 2], ['c_dest', 'Informe para: solo el coachee · el coachee y la empresa', 1])]] },
  { id: 'x_coach_ontologico', nombre: 'Ontológico', modo: 'sesion', secs: [CK_ATENCION, CK_ANT,
    ['Quiebre', CK(['c_q', '¿Qué quiebre trae? (lo que dejó de funcionar o la posibilidad que se abre)', 3], ['c_qt', 'Tipo de quiebre (Negativo · Positivo)', 1], ['c_qi', '¿Qué le importa de esto?', 2])],
    ['Lenguaje', CK(['c_af', 'Afirmaciones: hechos verificables', 2], ['c_ju', 'Juicios que aparecen y su estado (Fundado · Infundado · Por revisar)', 3], ['c_de', 'Declaraciones pendientes (No · Sí · No sé · Gracias · Perdón · Basta · Otra)', 2], ['c_pe', 'Pedidos y ofertas que necesita hacer', 2])],
    ['Emoción y cuerpo', CK(['c_em', 'Emoción o estado de ánimo predominante', 2], ['c_co', 'Corporalidad observada: postura, respiración, gestos, tono de voz', 2], ['c_pr', 'Práctica corporal propuesta', 2])],
    ['Aprendizaje', CK(['c_nv', 'Nivel de aprendizaje (Primer orden: nueva acción · Segundo orden: nuevo observador)', 1], ['c_ac', '¿Qué acciones son posibles ahora que antes no veía?', 3])], CK_CIERRE] },
  { id: 'x_coach_ejecutivo', nombre: 'Ejecutivo', modo: 'sesion', secs: [CK_ATENCION, CK_ANT,
    ['Contexto', CK(['c_comp', 'Competencia en foco (Liderazgo · Comunicación · Delegación · Manejo del conflicto · Toma de decisiones · Gestión del tiempo · Otra)', 1], ['c_360', 'Resultados 360° por competencia: autoevaluación y evaluación de otros (1 a 10). Se llena una vez', 4])],
    ['Conversación', CK(['c_g', 'Meta', 3], ['c_r', 'Realidad', 3], ['c_o', 'Opciones', 3], ['c_w', 'Voluntad', 3])],
    ['Aplicación', CK(['c_sit', 'Situación real donde lo aplicará (próximas 2 semanas)', 2], ['c_neg', 'Indicador de negocio relacionado', 1], ['c_spo', 'Resumen compartible con la empresa: avances generales, nunca el contenido de la conversación', 3])], CK_CIERRE] },
  { id: 'x_coach_sistemico', nombre: 'Sistémico', modo: 'sesion', secs: [CK_ATENCION, CK_ANT,
    ['Tema', CK(['c_t', 'Tema que trae', 3], ['c_s', '¿En qué sistema se juega? (Familia de origen · Familia actual · Pareja · Equipo · Organización · Otro)', 1])],
    ['Mapa', CK(['c_mi', 'Miembros del sistema: nombre o rol, relación con el coachee, nota', 4], ['c_he', 'Herramienta usada (Muñecos · Anclas en el piso · Dibujo · Hojas · Otra)', 1])],
    ['Principios', CK(['c_pe', 'Pertenencia: ¿alguien está excluido u olvidado? (En orden · Tensión · No se exploró)', 2], ['c_or', 'Orden: ¿cada quien ocupa su lugar?', 2], ['c_eq', 'Equilibrio entre dar y recibir', 2], ['c_le', 'Lealtades observadas', 2])],
    ['Solución', CK(['c_fr', 'Frases o movimientos de solución', 3], ['c_im', 'Imagen de solución: cómo quedó el mapa al final', 2])], CK_CIERRE] },
  { id: 'x_coach_pnl', nombre: 'PNL', modo: 'sesion', secs: [CK_ATENCION, CK_ANT,
    ['Estados', CK(['c_ea', 'Estado actual', 3], ['c_ed', 'Estado deseado, en positivo', 3], ['c_ev', 'Evidencias: qué verá, oirá y sentirá', 3])],
    ['Niveles neurológicos', CK(['c_ni', 'Entorno · Conducta · Capacidades · Creencias y valores · Identidad · Propósito (una línea por nivel)', 6], ['c_nb', 'Nivel donde está el bloqueo', 1], ['c_ca', 'Canal preferente (Visual · Auditivo · Kinestésico · Mixto)', 1])],
    ['Creencias y recursos', CK(['c_cr', 'Creencia limitante → creencia potenciadora', 3], ['c_re', 'Recurso que necesita (calma, seguridad, claridad…)', 1], ['c_an', 'Ancla instalada (kinestésica · visual · auditiva) y descripción del gesto o señal', 2])],
    ['Chequeo ecológico', CK(['c_ec', '¿Qué gana y qué pierde? · ¿A quién afecta? · ¿Depende de él o ella?', 3])], CK_CIERRE] },
  { id: 'x_coach_bienestar', nombre: 'Bienestar', modo: 'sesion', secs: [CK_ATENCION, CK_ANT,
    ['Foco y hábitos', CK(['c_ar', 'Área de trabajo (Sueño · Alimentación · Movimiento · Estrés · Hidratación · Pantallas · Otra)', 1], ['c_ha', 'Hábitos en seguimiento: hábito, meta por semana y registro de 7 días', 4])],
    ['Cambio', CK(['c_et', 'Etapa de cambio (Precontemplación · Contemplación · Preparación · Acción · Mantenimiento · Recaída)', 1], ['c_im', 'Importancia del cambio (1 a 10)', 1], ['c_cf', 'Confianza en lograrlo (1 a 10)', 1])],
    ['Meta', CK(['c_sm', 'Meta SMART: qué · cuánto · para cuándo · cómo lo medirá', 3], ['c_ob', 'Obstáculos y plan B', 2], ['c_al', 'Mencionó síntomas o condiciones que requieren un profesional de salud (Sí/No). Si es «Sí», completa la remisión; no registres diagnósticos', 2])], CK_CIERRE] }
];
/* Agrega a TM.extra los modelos pedidos (base o escuelas) sin repetir los ya instalados. */
function coachAdd(grupo) {
  const have = new Set(TM.extra.map(x => x.id)), add = COACH_MODELOS.filter(m => (grupo === 'base' ? m.base : !m.base) && !have.has(m.id));
  if (!add.length) return toast('Esos modelos ya están instalados.');
  if (TM.extra.length + add.length > 30) return toast('Máximo 30 pestañas nuevas.');
  add.forEach(m => TM.extra.push({ id: m.id, nombre: m.nombre, modo: m.modo, secs: clone(m.secs) }));
  toast(add.length + (add.length === 1 ? ' pestaña agregada' : ' pestañas agregadas') + '. Pulsa Guardar.');
}
