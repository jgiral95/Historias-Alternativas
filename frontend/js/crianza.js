/* Modelos para asesoras de crianza: pestañas propias listas para instalar desde Mis formatos → Pestañas. Parte de app.html (script clásico; se usa al hacer clic, no al cargar). */
const KK = (...a) => a.map(([k, l, r]) => [k, l, r || 2]);
const KK_ATENCION = ['Datos de la atención', KK(['k_ini', 'Inicio (fecha y hora)', 1], ['k_fin', 'Hora de fin', 1], ['k_mod', 'Modalidad (Presencial · Virtual · Visita al hogar · Mensajería)', 1], ['k_asi', 'Quiénes asistieron (cuidadores · el niño o niña estuvo presente)', 1], ['k_ses', 'Sesión (ej.: 4 de 8)', 1], ['k_ninos', 'Niño o niños de los que trata (nombre y edad en años y meses)', 1])];
const KK_ANT = ['Acuerdos anteriores', KK(['k_ant', 'Acuerdos de la sesión anterior: Lo hicimos · A medias · No pudimos · Lo cambiamos', 3], ['k_casa', '¿Qué pasó en casa?', 3])];
const KK_CIERRE = ['Cierre de la nota', KK(['k_acu', 'Acuerdos para casa (acción · quién la hace · hasta cuándo)', 4], ['k_mat', 'Material enviado (título y enlace: guías, tablas de rutinas, cuentos)', 2], ['k_priv', 'Notas privadas de la asesora (solo para usted: no salen en informes)', 3])];
const CRIANZA_MODELOS = [
  { id: 'x_cri_acuerdo', nombre: 'Acuerdo', modo: 'unica', base: 1, secs: [
    ['Servicio', KK(['k_tipo', 'Tipo de asesoría (Crianza general · Sueño · Alimentación · Rutinas y límites · Disciplina positiva · Otra)', 1], ['k_fmt', 'Formato (Sesiones individuales · Plan cerrado · Taller grupal · Acompañamiento por mensajería)', 1], ['k_nses', 'Número de sesiones y duración (por defecto 60 min)', 1], ['k_entre', 'Acompañamiento entre sesiones (No incluye · Mensajes en horario · Chat diario por N días) y horario de respuesta', 2], ['k_quien', '¿Quién contrata? (La familia · Un jardín o colegio · Una empresa · Otro). Si no es la familia: datos de la institución', 2], ['k_pago', 'Valor y forma de pago', 1])],
    ['Acuerdos', KK(['k_firman', 'Cuidadores que firman (recomendado: todos los que ejercen la patria potestad)', 2], ['k_datos', 'Autorización para guardar los datos del niño o niña (Sí/No)', 1], ['k_noreem', 'Saben que la asesoría no reemplaza la atención pediátrica, psicológica ni terapéutica (Sí/No)', 1], ['k_conf', 'Conocen los límites de la confidencialidad (Sí/No)', 1], ['k_inst', 'Autorizan compartir informes con la institución (Sí/No/No aplica)', 1], ['k_fotos', 'Autorizan fotos o videos de rutinas, solo para uso de la asesora (Sí/No)', 1])]] },
  { id: 'x_cri_entrevista', nombre: 'Entrevista inicial', modo: 'unica', base: 1, secs: [KK_ATENCION,
    ['Motivo', KK(['k_mot', 'Motivo de consulta, en palabras de la familia', 4], ['k_temas', 'Temas (Sueño · Alimentación · Rabietas · Límites · Rutinas · Control de esfínteres · Pantallas · Celos o llegada de un hermano · Adaptación al jardín · Separación de los padres · Otro)', 2], ['k_desde', '¿Desde cuándo? ¿Qué han intentado?', 3])],
    ['Familia', KK(['k_viven', 'Con quién vive el niño o niña (nombre o rol, parentesco)', 2], ['k_cuida', 'Quién lo cuida en el día y en qué horarios', 2], ['k_camb', 'Cambios recientes (Mudanza · Nacimiento · Separación · Duelo · Regreso al trabajo · Cambio de cuidador · Otro)', 2], ['k_estilos', 'Estilos de crianza: ¿en qué coinciden y en qué no los cuidadores?', 3])],
    ['Niño o niña', KK(['k_rut', 'Rutina de un día típico (despertar, comidas, siestas, jardín, juego, pantallas, baño, dormir)', 4], ['k_temp', 'Temperamento según la familia: cómo lo describen, qué lo calma, qué lo altera', 3], ['k_salud', 'Lo que la familia cuenta sobre su salud (alergias, medicamentos). Solo lo que refieren; privado', 2], ['k_pedi', '¿Tiene seguimiento pediátrico al día? (Sí · No · No sabe)', 1])],
    ['Expectativas', KK(['k_exp', '¿Qué tendría que cambiar para sentir que la asesoría valió la pena?', 3], ['k_cans', 'Nivel de cansancio o estrés de cada cuidador, de 1 a 10 (primer valor del seguimiento)', 1], ['k_priv', 'Notas privadas de la asesora', 3])]] },
  { id: 'x_cri_plan', nombre: 'Plan', modo: 'unica', base: 1, secs: [
    ['Objetivos', KK(['k_obj', 'Objetivos del plan: objetivo · para qué niño · cómo sabremos que se logró', 4])],
    ['Estrategias', KK(['k_est', 'Estrategias acordadas: estrategia · quién la aplica · cuándo · qué hacer si no funciona', 5], ['k_rutina', 'Rutina propuesta (hora y actividad)', 4], ['k_acu', 'Acuerdos entre cuidadores, para que todos respondan igual', 3])],
    ['Material y fechas', KK(['k_mat', 'Material enviado (título y enlace)', 2], ['k_fechas', 'Fechas de seguimiento', 2])]] },
  { id: 'x_cri_sesion', nombre: 'Sesión', modo: 'sesion', base: 1, secs: [KK_ATENCION, KK_ANT,
    ['Revisión', KK(['k_fun', '¿Qué funcionó y qué no?', 3], ['k_dif', 'Situación difícil de la semana: qué pasó, qué hizo el adulto, cómo reaccionó el niño', 3])],
    ['Trabajo', KK(['k_tema', 'Tema de hoy', 1], ['k_trab', 'Lo que se trabajó con los cuidadores (explicación, juego de roles, revisión de video…)', 4], ['k_ajus', 'Ajustes al plan', 3])],
    ['Seguimiento', KK(['k_avance', 'Avance hacia los objetivos del plan, de 1 a 10 por objetivo', 2], ['k_cans', 'Cansancio o estrés de los cuidadores, de 1 a 10', 1])], KK_CIERRE] },
  { id: 'x_cri_cierre', nombre: 'Informe de cierre', modo: 'unica', base: 1, secs: [
    ['Resumen', KK(['k_res', 'Sesiones realizadas, fechas y niños incluidos', 3], ['k_motivo', 'Motivo de consulta (copia de la entrevista)', 3])],
    ['Resultados', KK(['k_cumpl', 'Objetivos del plan: ¿se cumplieron? (Sí · En parte · No, con comentario por objetivo)', 4], ['k_cambios', 'Cambios que notan los cuidadores', 3])],
    ['Continuidad', KK(['k_mant', 'Estrategias para mantener', 3], ['k_sig', 'Qué esperar en la siguiente etapa del desarrollo (orientación anticipatoria)', 3], ['k_rem', 'Otros apoyos sugeridos', 2])],
    ['Evaluación y destino', KK(['k_val', 'Valoración de la familia, de 1 a 10, y comentario', 2], ['k_dest', '¿Para quién es? (Familia · Familia e institución)', 1])]] },
  { id: 'x_cri_disciplina', nombre: 'Disciplina positiva', modo: 'sesion', secs: [KK_ATENCION, KK_ANT,
    ['Situación', KK(['k_sit', 'Situación que se repite: qué hace el niño, cuándo y dónde', 3], ['k_sien', '¿Qué siente el adulto cuando pasa? (Molestia · Enojo o reto · Dolor · Impotencia o desesperanza · Otro)', 1], ['k_hoy', '¿Qué hace hoy el adulto?', 3])],
    ['Creencia', KK(['k_meta', 'Meta detrás del comportamiento (Atención indebida · Poder mal dirigido · Revancha · Insuficiencia asumida · No está claro)', 1], ['k_msj', 'Mensaje que el niño necesita recibir (pertenencia e importancia)', 1])],
    ['Herramientas', KK(['k_her', 'Herramientas elegidas (Conexión antes que corrección · Preguntas de curiosidad · Tiempo fuera positivo · Consecuencias lógicas · Rutinas · Opciones limitadas · Reunión familiar · Tiempo especial · Aliento · Reparar errores)', 3], ['k_ap', 'Cómo la aplicará en esta familia', 3])],
    ['Equilibrio', KK(['k_ama', 'Amabilidad hoy, de 1 a 10', 1], ['k_fir', 'Firmeza hoy, de 1 a 10', 1], ['k_reu', 'Reunión familiar: temas y acuerdos', 3])], KK_CIERRE] },
  { id: 'x_cri_emociones', nombre: 'Emociones y rabietas', modo: 'sesion', secs: [KK_ATENCION, KK_ANT,
    ['Episodios', KK(['k_epi', 'Registro de episodios: fecha · qué pasó antes · qué hizo el niño · qué hizo el adulto · cómo terminó · duración · intensidad 1 a 10', 5], ['k_det', 'Detonantes frecuentes (Hambre · Sueño · Transiciones · Un «no» · Pantallas · Sobreestimulación · Separación · Hermanos · Otro)', 2])],
    ['Adulto', KK(['k_est', 'Estado del adulto en el momento (Calmado · Cansado · Con prisa · Enojado · Desbordado)', 1], ['k_reg', 'Estrategia de autorregulación: qué hará para calmarse primero', 2])],
    ['Acompañamiento', KK(['k_acomp', 'Estrategia (Presencia y contención · Nombrar la emoción · Rincón de la calma · Sostener el límite sin castigo · Anticipar transiciones · Otra)', 2], ['k_rep', 'Reparación: cómo se reconectan y hablan cuando ya pasó', 3], ['k_con', 'Tiempo de conexión diario: quién, cuánto, qué actividad', 2])], KK_CIERRE] },
  { id: 'x_cri_sueno', nombre: 'Sueño', modo: 'sesion', secs: [KK_ATENCION, KK_ANT,
    ['Situación', KK(['k_preo', 'Qué preocupa (Le cuesta dormirse · Despierta mucho de noche · Siestas cortas · Madruga mucho · Solo se duerme con pecho, brazos o tetero · Miedos o pesadillas · Otro)', 2], ['k_dond', 'Dónde y con quién duerme (Colecho · Cuna junto a la cama · Su cuarto · Comparte cuarto · Otro)', 1], ['k_como', 'Cómo se duerme hoy', 2])],
    ['Diario de sueño', KK(['k_diario', 'Por día: hora de despertar, siestas (inicio y fin), hora de acostarse, minutos para dormirse, despertares (número y duración) y cómo volvió a dormirse', 8])],
    ['Plan', KK(['k_vent', 'Ventanas de vigilia propuestas (orientativas según la edad)', 2], ['k_antes', 'Rutina antes de dormir: pasos y hora', 3], ['k_met', 'Método acordado (Ajuste de horarios · Gradual con presencia del adulto · Retiro progresivo · Otro)', 2], ['k_amb', 'Ambiente (Oscuridad · Temperatura · Ruido · Sin pantallas 1 h antes)', 1], ['k_seg', 'Sueño seguro, solo menores de 1 año (Boca arriba · Superficie firme · Sin almohadas ni peluches · Sin humo)', 1], ['k_segui', 'Seguimiento: horas de sueño y despertares, inicio frente a hoy', 2])], KK_CIERRE] },
  { id: 'x_cri_alimentacion', nombre: 'Alimentación', modo: 'sesion', secs: [KK_ATENCION, KK_ANT,
    ['Etapa', KK(['k_etapa', 'Etapa (Lactancia · Alimentación complementaria · Comida familiar)', 1], ['k_intro', 'Forma de introducir alimentos (Purés · Trozos · Mixta)', 1], ['k_preo', 'Qué preocupa (Come poco · Rechaza alimentos nuevos · Peleas en la mesa · Come con pantallas · Picoteo · Comidas muy largas · Otro)', 2])],
    ['Mesa', KK(['k_mesa', 'Cómo es una comida hoy: dónde, con quién, cuánto dura, pantallas, qué dice el adulto', 3], ['k_acepta', 'Alimentos que acepta', 2], ['k_rechaza', 'Alimentos que rechaza', 2])],
    ['Acuerdos', KK(['k_quien', 'Quién decide qué: el adulto decide qué, cuándo y dónde se come; el niño decide si come y cuánto', 2], ['k_amb', 'Cambios en el ambiente de la mesa', 3])], KK_CIERRE] },
  { id: 'x_cri_autonomia', nombre: 'Autonomía y transiciones', modo: 'sesion', secs: [KK_ATENCION, KK_ANT,
    ['Tema', KK(['k_tema', 'Tema (Dejar el pañal · Pantallas · Llegada de un hermano · Adaptación al jardín o colegio · Separación de los padres · Mudanza · Otro)', 1])],
    ['Pañal', KK(['k_listo', 'Señales de que está listo (Avisa · Se mantiene seco ratos largos · Muestra interés · Se baja la ropa solo)', 2], ['k_esc', 'Registro de escapes y logros por día', 3])],
    ['Pantallas', KK(['k_pant', 'Acuerdo de uso: cuánto, cuándo, qué contenido, dónde', 3])],
    ['Transición', KK(['k_fecha', 'Fecha del cambio (llegada del bebé, primer día de jardín…)', 1], ['k_prep', 'Cómo se preparó al niño (cuentos, visitas, anticipación)', 3], ['k_obs', 'Cambios observados desde entonces (sueño, apetito, regresiones, apego)', 3], ['k_casas', 'Separación: acuerdos de crianza entre las dos casas, solo lo que ambos cuidadores aceptan registrar', 3])], KK_CIERRE] }
];
function crianzaGid(base) {
  const id = base ? 'g_cri_base' : 'g_cri_enf';
  if (!TM.grupos.some(g => g.id === id)) TM.grupos.push({ id, nombre: base ? 'Crianza: modelos base' : 'Crianza: enfoques y temas' });
  return id;
}
function crianzaAdd(grupo) {
  const have = new Set(TM.extra.map(x => x.id)), add = CRIANZA_MODELOS.filter(m => (grupo === 'base' ? m.base : !m.base) && !have.has(m.id));
  if (!add.length) return toast('Esos modelos ya están instalados.');
  if (TM.extra.length + add.length > 30) return toast('Máximo 30 pestañas nuevas.');
  const gid = crianzaGid(grupo === 'base' ? 1 : 0);
  add.forEach(m => TM.extra.push({ id: m.id, nombre: m.nombre, modo: m.modo, secs: clone(m.secs), gid }));
  toast(add.length + (add.length === 1 ? ' pestaña agregada' : ' pestañas agregadas') + '. Pulse Guardar.');
}
