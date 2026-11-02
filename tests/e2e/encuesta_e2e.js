// Encuesta de satisfacción y estadísticas: configurar, sortear, responder como paciente y ver los resultados.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform');
  await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="newPatient"]');
  // datos de prueba por la API, como los dejaría la app
  await page.evaluate(async () => {
    const now = new Date().toISOString(), put = o => api('/records/' + o.id, { method: 'PUT', body: o });
    const auth = { tipo: DATA_TIPO, text: 'Autorizo ... enviarme ocasionalmente encuestas de satisfacción ...', signedAt: now };
    await put({ id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', consultorio: 'Consultorio Prueba' });
    const dx = c => ({ signedAt: now, sessionAt: now, motivo: 'm', addenda: [], diagnosticos: [{ codigo: c, nombre: c === '6B00' ? 'Trastorno de ansiedad generalizada' : 'Trastorno depresivo recurrente', tipo: 'Impresión diagnóstica' }] });
    const pats = [
      { id: 'p_e1', kind: 'patient', nombres: 'Laura', apellidos: 'Gómez', sexo: 'Femenino', estado: 'Activo', telefono: '3001234567', tipoDoc: 'CC', documento: '1020304050', acudNombre: 'Marta Gómez', acudParentesco: 'madre', modalidadAt: 'Virtual', consents: [auth], intake: dx('6B00') },
      { id: 'p_e2', kind: 'patient', nombres: 'Carlos', apellidos: 'Ruiz', sexo: 'Masculino', modalidadAt: 'Presencial', estado: 'En pausa', razonInactividad: 'Factor económico', intake: dx('6A71') },
      { id: 'p_e3', kind: 'patient', nombres: 'Ana', apellidos: 'Díaz', sexo: 'Femenino', estado: 'Alta', razonInactividad: 'Se siente mejor', intake: dx('6B00') }];
    for (const p of pats) await put(p);
  });
  await page.reload(); await page.waitForSelector('[data-act="newPatient"]');
  // notas de sesión en el resumen
  await page.waitForSelector('.ntable');
  ok(await page.locator('.ntable tbody tr').count() === 3 && /Primera vez/.test(await page.locator('.ntable').textContent()) && /#1/.test(await page.locator('.ntable').textContent()), 'el resumen lista las notas de sesión con número y tipo');
  await page.locator('.ntable').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'notas_sesion.png' });
  await page.click('[data-fold="pend"] > summary'); await page.click('[data-fold="hoy"] > summary');
  ok(!(await page.locator('.tlist').first().isVisible().catch(() => false)) && await page.locator('[data-fold="pend"]').evaluate(d => !d.open), 'cada subtítulo del resumen se puede retraer');
  await page.screenshot({ path: OUT + 'resumen_retraido.png' });
  await page.reload(); await page.waitForSelector('[data-fold="pend"]');
  ok(await page.locator('[data-fold="pend"]').evaluate(d => !d.open) && await page.locator('[data-fold="notas"]').evaluate(d => d.open), 'recuerda qué secciones dejó cerradas');
  await page.click('[data-fold="pend"] > summary'); await page.click('[data-fold="hoy"] > summary');
  ok(await page.locator('[data-fold="pend"]').evaluate(d => d.open), 'y se vuelven a expandir');
  await page.selectOption('#nl_tipo', 'Evolución'); ok(/No hay notas con esos filtros/.test(await page.locator('#ntbody').textContent()), 'filtra por tipo');
  await page.selectOption('#nl_tipo', ''); await page.fill('#nl_q', 'laura');
  ok(await page.locator('.ntable tbody tr').count() === 1 && await page.locator('#nl_q').evaluate(e => e === document.activeElement), 'busca por paciente sin perder el foco');
  await page.fill('#nl_q', ''); await page.click('[data-act="nlSort"][data-k="paciente"]');
  ok(/^Ana/.test((await page.locator('.ntable tbody tr').first().textContent()).replace(/^\s*[A-Z]{1,2}/, '').trim()), 'ordena por paciente');
  await page.click('.ntable tbody tr:first-child td.mono >> nth=0'); await page.waitForSelector('[data-act="viewIntake"]');
  ok(/Ana Díaz/.test(await page.locator('.file-head').textContent()), 'al tocar una fila abre la nota del paciente');
  await page.click('[data-act="home"]'); await page.waitForSelector('.ntable');
  // configurar y sortear
  await page.click('[data-act="menu"]'); await page.click('[data-act="survey"]'); await page.waitForSelector('#svform');
  await page.waitForSelector('#ml_mail');
  ok(/Sin configurar/.test(await page.locator('#mailslot').textContent()) && /aparecen en Pendientes/.test(await page.locator('#mailslot').textContent()), 'sin correo propio explica que el envío será a mano');
  await page.fill('#ml_mail', 'psico@consultorio.test'); await page.fill('#ml_pw', 'clave-de-aplicacion'); await page.fill('#ml_host', '127.0.0.1');
  await page.click('[data-sv="mailsave"]'); await page.waitForSelector('#ml_out .banner');
  ok(/no aceptó el ingreso/.test(await page.locator('#ml_out').textContent()), 'si el correo no funciona, lo dice y no lo guarda');
  await page.screenshot({ path: OUT + 'encuesta_correo.png' });
  ok(await page.locator('.svq').count() === 16, 'trae las preguntas sugeridas (oportunidad, planta física, atención, profesional, experiencia)');
  await page.click('[data-sv="preview"]'); ok(await page.locator('#svform fieldset').count() === 16, 'se puede ver como la verá el paciente'); await page.click('[data-sv="preview"]');
  await page.click('#svtest summary'); await page.fill('#sv_tmail', 'yo@prueba.co'); await page.click('[data-sv="test"]'); await page.waitForSelector('#sv_tout .banner');
  ok(/No se envió el correo[\s\S]*no ha configurado su correo/.test(await page.locator('#sv_tout').textContent()), 'la prueba explica que falta configurar el correo');
  const tl = await page.locator('#sv_tout a').getAttribute('href'); const tp = await ctx.newPage(); await tp.goto(tl); await tp.waitForSelector('#f');
  ok(/encuesta de prueba/.test(await tp.locator('main').textContent()), 'la encuesta de prueba se abre y avisa que es de prueba');
  for (let k = 0, n = await tp.locator('fieldset').count(); k < n; k++) { const r = tp.locator(`#q_${k} input[type=radio]`); if (await r.count()) await r.nth(3 % await r.count()).check(); }
  await tp.fill('textarea', 'Comentario de prueba'); await tp.click('#send'); await tp.waitForSelector('.res.ok'); await tp.close();
  await page.screenshot({ path: OUT + 'encuesta_prueba.png' });
  await page.locator('.svq [data-q="texto"]').nth(5).fill('El trato al agendar la cita fue:');
  await page.check('#sv_activa'); await page.selectOption('#sv_cada', '30'); await page.fill('#sv_cant', '5');
  await page.screenshot({ path: OUT + 'encuesta_config.png' });
  await page.click('[data-sv="draw"]'); await page.waitForSelector('#svform', { state: 'detached' });
  ok(/Se sortearon 1/.test(await page.locator('.toast').last().textContent()), 'sortea solo al paciente atendido y con autorización que menciona encuestas');
  await page.waitForSelector('[data-act="svSend"]');
  ok(/Encuesta por enviar[\s\S]*Laura Gómez/.test(await page.locator('.tlist').textContent()), 'la encuesta sin correo aparece en Pendientes');
  await page.click('[data-act="svSend"]'); await page.waitForSelector('#sv_link');
  const link = await page.inputValue('#sv_link');
  ok(/\/encuesta\?t=/.test(link) && /wa\.me\/573001234567\?text=/.test(await page.locator('a.btn', { hasText: 'WhatsApp' }).getAttribute('href')), 'ofrece enlace y WhatsApp con el número del paciente');
  await page.screenshot({ path: OUT + 'encuesta_enviar.png' });
  await page.click('#sv_sent'); await page.waitForSelector('#sv_link', { state: 'detached' });
  ok(await page.locator('[data-act="svSend"]').count() === 0, 'al marcarla enviada sale de Pendientes');
  // el paciente responde
  const pp = await ctx.newPage(); pp.on('pageerror', e => errors.push('encuesta: ' + e.message));
  await pp.goto(link); await pp.waitForSelector('#f');
  ok(/Consultorio Prueba/.test(await pp.locator('main').textContent()) && !/Laura|Gómez/.test(await pp.locator('main').textContent()), 'la encuesta muestra el consultorio y no datos del paciente');
  ok(/El trato al agendar la cita fue/.test(await pp.locator('main').textContent()), 'usa las preguntas editadas por el terapeuta');
  await pp.click('#send'); await pp.waitForSelector('.res.bad');
  ok(/Falta responder/.test(await pp.locator('#err').textContent()), 'pide responder las preguntas obligatorias');
  const n = await pp.locator('fieldset').count();
  for (let k = 0; k < n; k++) { const r = pp.locator(`#q_${k} input[type=radio]`); if (await r.count()) await r.nth(k === 2 ? 1 : 0).check(); }
  await pp.fill('textarea', 'Me gustaría más horarios en la tarde.');
  await pp.screenshot({ path: OUT + 'encuesta_paciente.png', fullPage: true });
  await pp.click('#send'); await pp.waitForSelector('.res.ok');
  ok(/Gracias/.test(await pp.locator('main').textContent()), 'el paciente envía sus respuestas');
  await pp.reload(); await pp.waitForSelector('.res');
  ok(/ya fue respondida/.test(await pp.locator('main').textContent()), 'el enlace no se puede usar dos veces');
  await pp.setViewportSize({ width: 380, height: 800 }); await pp.goto(link + '&baja=1'); await pp.waitForSelector('#yes');
  await pp.screenshot({ path: OUT + 'encuesta_baja_movil.png' }); await pp.close();
  // estadísticas (pacientes)
  await page.click('[data-act="homeTab"][data-t="stats"]'); await page.waitForSelector('.sttab');
  let t = await page.locator('#app').innerText();
  ok(!/Resultado encuesta de satisfacción/i.test(t), 'Estadísticas ya no mezcla la encuesta');
  ok(/Mujeres\s+66,7 %\s+2/.test(t) && /Hombres\s+33,3 %\s+1/.test(t), 'estadística por sexo');
  ok(/6B00 · Trastorno de ansiedad generalizada\s+66,7 %\s+2/.test(t), 'prevalencia de diagnósticos (CIE-11 vigente)');
  ok(/Casos finalizados\s+33,3 %\s+1/.test(t) && /Casos activos\s+33,3 %\s+1/.test(t), 'estado de los casos');
  ok(/Factor económico\s+50 %\s+1/.test(t) && /Se siente mejor\s+50 %\s+1/.test(t), 'razón de inactividad');
  ok(/Presencial\s+33,3 %\s+1/.test(t) && /Virtual\s+33,3 %\s+1/.test(t) && /Sin registrar\s+33,3 %\s+1/.test(t), 'estadística de modalidad de atención');
  await page.screenshot({ path: OUT + 'estadisticas.png', fullPage: true });
  await page.click('[data-act="statsDoc"]'); await page.waitForSelector('#paper');
  ok(/Prevalencia de diagnósticos/.test(await page.locator('#paper').textContent()) && !/Laura|Resultado encuesta/.test(await page.locator('#paper').textContent()), 'Estadísticas se imprime sin nombres y sin la encuesta');
  await page.click('#cl');
  // encuesta de satisfacción (pestaña propia)
  await page.click('[data-act="homeTab"][data-t="enc"]');
  await page.waitForFunction(() => /tasa de respuesta/.test(document.body.innerText) && S.svRes && S.svRes.filter(r => !r.prueba).length === 1 && document.querySelector('#st_test'));
  ok(/Incluir las respuestas de prueba \(1\)/.test(await page.locator('#app').innerText()) && !(await page.isChecked('#st_test')), 'con respuestas reales, las de prueba quedan ocultas y se pueden incluir');
  await page.check('#st_test'); await page.waitForFunction(() => /Comentario de prueba/.test(document.body.innerText));
  ok(/Incluye pruebas/i.test(await page.locator('#app').innerText()), 'al marcar la casilla se ven las respuestas de prueba');
  await page.click('[data-act="svDelTests"]'); await page.click('[data-act="svDelTests"]'); await page.waitForFunction(() => !document.querySelector('#st_test'));
  ok(!/Comentario de prueba/.test(await page.locator('#app').innerText()), 'se borran las pruebas');
  t = await page.locator('#app').innerText();
  ok(!/Prevalencia de diagnósticos/.test(t), 'la pestaña de la encuesta no mezcla las estadísticas de pacientes');
  ok(/Oportunidad de consulta[\s\S]*Planta física[\s\S]*Características del profesional/.test(t), 'tabla de resultados por dimensión e ítem');
  ok(/75 %/.test(t), 'calcula el porcentaje por ítem (Bueno = 3 de 4 → 75 %)');
  ok(/Me gustaría más horarios en la tarde/.test(t), 'muestra los comentarios sin nombre');
  ok(/Respondieron/.test(t) && /tasa de respuesta/.test(t), 'cantidad de personas encuestadas y tasa de respuesta');
  await page.fill('#acc_txt', 'Abrir agenda los martes en la tarde'); await page.click('[data-act="accAdd"]');
  await page.waitForFunction(() => /Abrir agenda los martes/.test(document.body.innerText));
  ok(true, 'registra acciones de mejora');
  await page.screenshot({ path: OUT + 'encuesta_resultados.png', fullPage: true });
  await page.click('[data-act="statsDoc"]'); await page.waitForSelector('#paper');
  ok(/Resultado encuesta de satisfacción[\s\S]*Acciones de mejora/.test(await page.locator('#paper').textContent()) && !/Laura|Prevalencia/.test(await page.locator('#paper').textContent()), 'la encuesta se imprime aparte, sin nombres');
  await page.click('#cl');
  // modelo propio de consentimiento con datos que se llenan solos
  await page.click('[data-act="open"][data-id="p_e1"]'); await page.click('[data-act="tab"][data-tab="consent"]'); await page.click('[data-act="formats"][data-hub="consent"]');
  await page.click('[data-cm="new"]'); await page.fill('#cmform #f_nombre', 'Consentimiento con acudiente');
  await page.fill('#f_texto', 'Yo, '); await page.click('[data-var="acudiente"]'); await page.keyboard.type(', en calidad de '); await page.click('[data-var="acudiente_parentesco"]');
  await page.keyboard.type(' de '); await page.click('[data-var="paciente"]'); await page.keyboard.type(' ('); await page.click('[data-var="documento"]'); await page.keyboard.type('), autorizo la atención con '); await page.click('[data-var="terapeuta"]'); await page.keyboard.type('.');
  ok((await page.inputValue('#f_texto')) === 'Yo, {acudiente}, en calidad de {acudiente_parentesco} de {paciente} ({documento}), autorizo la atención con {terapeuta}.', 'los botones insertan los datos en el cursor');
  await page.click('#cmform details summary'); await page.click('[data-cm="pv"]');
  ok(/Yo, Marta Gómez, en calidad de madre de Laura Gómez \(CC 1020304050\), autorizo la atención con Psicóloga Prueba\./.test(await page.locator('#cm_pvout').textContent()), 'la vista previa llena los datos del paciente');
  await page.screenshot({ path: OUT + 'consentimiento_variables.png' });
  await page.click('[data-cm="save"]'); await page.waitForSelector('[data-cm="new"]'); await page.click('[data-cm="close"]');
  ok(/modalidad de atención es «Virtual»[\s\S]*Telepsicología/.test(await page.locator('#tabbody').textContent()), 'avisa si la modalidad es virtual y no hay consentimiento de telepsicología');
  if (await page.locator('[data-act="reConsent"]').count()) await page.click('[data-act="reConsent"]');
  await page.waitForSelector('#f_consentTipo'); const opt = await page.locator('#f_consentTipo option', { hasText: 'Consentimiento con acudiente' }).getAttribute('value');
  await page.selectOption('#f_consentTipo', opt);
  ok((await page.inputValue('#f_consentText')).startsWith('Yo, Marta Gómez, en calidad de madre de Laura Gómez (CC 1020304050)'), 'al elegir el modelo, el consentimiento sale con los datos llenos');
  await page.click('[data-act="home"]').catch(() => {});
  if (await page.locator('#discardask').count()) await page.click('#dk_go');
  await page.waitForSelector('[data-act="homeTab"]');
  // razón de inactividad en los datos del paciente
  await page.click('[data-act="homeTab"][data-t="resumen"]');
  await page.click('[data-act="open"][data-id="p_e1"]'); await page.waitForSelector('#f_estado');
  ok(await page.locator('#razonwrap').isHidden(), 'la razón de inactividad no aparece en un paciente activo');
  ok((await page.inputValue('#f_modalidadAt')) === 'Virtual', 'los datos del paciente tienen la modalidad de atención');
  // indicativo, países y personas vinculadas
  ok((await page.inputValue('#f_telInd')) === '+57' && (await page.inputValue('#f_acudInd')) === '+57', 'el teléfono trae el indicativo de Colombia por defecto');
  ok(await page.evaluate(() => { const s = document.querySelector('#f_paisNac'), v = [...s.options].map(o => o.value); return s.tagName === 'SELECT' && v.includes('Colombia') && v.includes('Venezuela') && v.includes('Alemania'); }), 'lista de países en español');
  await page.selectOption('#f_paisNac', 'Venezuela'); await page.selectOption('#f_paisRes', 'Colombia');
  ok(await page.locator('#lkbox').count() === 0, 'un servicio individual no muestra vínculos');
  await page.selectOption('#f_servicio', 'Pareja'); await page.waitForSelector('#lkbox');
  await page.selectOption('#lk_sel', 'p_e2'); await page.click('[data-act="lkAdd"]'); await page.waitForSelector('.lkchip');
  ok(/Carlos Ruiz/.test(await page.locator('#lkbox').textContent()), 'se vincula a otra persona como pareja');
  await page.click('[data-act="savePatient"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const a = S.patients.find(x => x.id === 'p_e1'), b = S.patients.find(x => x.id === 'p_e2'); return a.vinculo && a.vinculo === b.vinculo && b.servicio === 'Pareja' && a.paisNac === 'Venezuela' && a.paisRes === 'Colombia'; }), 'cada persona guarda el vínculo, el tipo de servicio y los países');
  ok(/Pareja · con Carlos/.test(await page.locator('.file-head').textContent()), 'la ficha muestra con quién está vinculada');
  await page.screenshot({ path: OUT + 'vinculos.png' });
  await page.click('.lkchip [data-act="open"]'); await page.waitForSelector('#lkbox');
  ok(/Laura Gómez/.test(await page.locator('#lkbox').textContent()) && /Carlos Ruiz/.test(await page.locator('.file-head h2').textContent()), 'desde la otra persona se ve el vínculo de vuelta');
  await page.click('.lkchip [data-act="lkDel"]'); await page.click('.lkchip [data-act="lkDel"]'); await page.waitForFunction(() => !document.querySelector('.lkchip'));
  ok(await page.evaluate(() => !S.patients.find(x => x.id === 'p_e1').vinculo && !S.patients.find(x => x.id === 'p_e2').vinculo), 'al desvincular a una pareja, el vínculo desaparece en ambos');
  await page.selectOption('#f_estado', 'En pausa'); ok(await page.locator('#razonwrap').isVisible(), 'aparece al cambiar el estado');
  ok(errors.length === 0, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
