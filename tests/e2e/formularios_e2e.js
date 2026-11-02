// Ajustes de formularios del manual: obligatorios con «No refiere», datos mínimos, duplicados, folio y sesión,
// cabecera de la atención, riesgo y destino, copia entregada, pruebas (F5) y corrección (F12).
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const toast = async () => (await page.locator('.toast').last().textContent().catch(() => '')) || '';
  await page.goto(BASE + 'app'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]'); await page.waitForSelector('[data-act="menu"]');
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(sig => api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', ripsActivo: true, nombre: 'Psicóloga Prueba', registro: 'TP-5566', cedula: '52123456', firma: sig, pasos: { oculto: '1', bienvenida: '1' } } }), SIG);
  await page.reload(); await page.waitForSelector('[data-act="newPatient"]');
  // datos mínimos
  await page.click('[data-act="newPatient"]'); await page.fill('#f_nombres', 'Elena'); await page.fill('#f_apellidos', 'Duarte'); await page.fill('#f_documento', '1.098.765');
  ok((await page.inputValue('#f_documento')) === '1098765', 'el documento (CC) solo admite números'); await page.fill('#f_telefono', '300 123-4567x'); ok((await page.inputValue('#f_telefono')) === '3001234567', 'el teléfono solo admite números'); await page.selectOption('#f_tipoDoc', 'Pasaporte'); await page.fill('#f_documento', 'AB-123456'); ok((await page.inputValue('#f_documento')) === 'AB-123456', 'el pasaporte admite letras'); await page.selectOption('#f_tipoDoc', 'CC'); await page.fill('#f_documento', '1098765');
  await page.click('[data-act="savePatient"]'); await page.waitForTimeout(200);
  ok(/obligatorio/.test(await toast()) && await page.locator('.fld.miss #f_nacimiento').count() === 1 && await page.locator('.fld.miss #f_sexo').count() === 1 && await page.locator('.fld.miss').count() > 5, 'con datos en blanco (incluidos fecha de nacimiento y sexo) no deja crear la historia');
  ok(/«No aplica» o «No responde»/.test(await toast()) && await page.locator('#tabbody [data-nafill]').count() >= 10, 'cada apartado de Datos ofrece «No aplica» y «No responde»');
  await page.screenshot({ path: OUT + 'datos_obligatorios.png' });
  ok((await page.$$eval('#f_tipoDoc option', o => o.map(x => x.textContent))).includes('Menor sin documento') && /cédula de la madre/.test(await page.locator('#tabbody').textContent()), 'opción y ayuda para el menor sin documento');
  await page.fill('#f_nacimiento', '1988-03-04');
  { const n = new Date(), esp = n.getFullYear() - 1988 - ((n.getMonth() < 2 || (n.getMonth() === 2 && n.getDate() < 4)) ? 1 : 0);
    ok(await page.textContent('#age_nacimiento') === esp + ' años', 'junto a la fecha de nacimiento aparece la edad, sola, al escribirla'); }
  await page.fill('#f_nacimiento', new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10));
  ok(/^[23] meses$/.test(await page.textContent('#age_nacimiento')), 'en bebés la edad va en meses');
  await page.fill('#f_nacimiento', '1988-03-04'); await page.selectOption('#f_sexo', 'Femenino'); await page.selectOption('#f_vinculacion', 'Contributivo'); await page.selectOption('#f_zona', 'Urbana');
  await page.fill('#f_lugarNac', 'Bogotá'); await page.fill('#f_telefono', '3001234567');
  await page.click('#f_direccion'); await page.click('.sec:has(#f_direccion) [data-nafill="No responde"]');
  ok(await page.inputValue('#f_direccion') === 'No responde' && await page.inputValue('#f_localidad') === '' && await page.inputValue('#f_lugarNac') === 'Bogotá', '«No responde» se escribe solo en el campo donde está el cursor');
  await page.click('#f_estadoCivil'); await page.keyboard.press('Escape'); await page.click('.sec:has(#f_estadoCivil) [data-nafill="No aplica"]');
  ok(await page.inputValue('#f_estadoCivil') === 'No aplica (menor de edad)' && await page.inputValue('#f_escolaridad') === '', 'en una lista elige la opción que corresponde, solo en esa lista');
  await page.click('#f_nombres'); await page.click('.sec:has(#f_nombres) [data-nafill="No responde"]');
  ok(await page.inputValue('#f_nombres') === 'Elena' && /identidad/.test(await toast()), 'no deja poner «No responde» en un dato de identidad');
  // el resto, campo por campo (con el cursor en cada uno)
  const ids = await page.$$eval('#tabbody input[data-f], #tabbody textarea[data-f]', els => els.filter(e => !e.disabled && e.type !== 'checkbox' && !e.closest('[hidden]') && !/Ind$/.test(e.dataset.f) && !e.value.trim()).map(e => e.id));
  for (const id of ids) { await page.click('#' + id); await page.locator(`#tabbody :is(.card, .sec):has(> .narow):has(#${id}) > .narow [data-nafill="No responde"]`).last().click(); }
  ok(await page.$$eval('#tabbody input[data-f], #tabbody textarea[data-f]', els => els.filter(e => !e.disabled && e.type !== 'checkbox' && !e.closest('[hidden]')).every(e => e.value.trim())), 'campo por campo quedan todos llenos');
  await page.check('#f_acud2NA'); ok(await page.locator('[data-cuid="acud2"] .grid').isHidden(), '«No aplica» en un cuidador oculta sus campos');
  for (const sel of await page.locator('#tabbody select[data-f]').all()) if (await sel.isVisible() && !(await sel.inputValue())) await sel.selectOption({ index: 1 });
  await page.click('[data-act="savePatient"]'); await page.waitForSelector('.file-head h2:has-text("Elena")');
  ok(await page.evaluate(() => curPatient().vinculacion === 'Contributivo' && curPatient().zona === 'Urbana' && curPatient().nacionalidad === 'Colombia'), 'guarda vinculación, zona y nacionalidad');
  // duplicado
  await page.click('[data-act="newPatient"]'); await page.fill('#f_nombres', 'Otra'); await page.fill('#f_apellidos', 'Persona'); await page.fill('#f_documento', '1098765'); await page.press('#f_documento', 'Tab');
  ok(/Ya existe la historia de Elena Duarte/.test(await page.locator('#dupslot').textContent()), 'avisa apenas se escribe un documento que ya tiene historia');
  await page.fill('#f_nacimiento', '1990-01-01'); await page.selectOption('#f_sexo', 'Femenino'); await page.click('[data-act="savePatient"]'); await page.waitForTimeout(300);
  ok(/Ya existe la historia/.test(await page.locator('#dupslot').textContent()) || /obligatorio/.test(await toast()), 'no se guarda');
  ok(await page.evaluate(() => S.patients.length) === 1, 'no deja crear una segunda historia con el mismo documento');
  ok(await page.evaluate(async () => { try { await api('/records/p_dupx', { method: 'PUT', body: { id: 'p_dupx', kind: 'patient', nombres: 'X', documento: '1098765' } }); return false; } catch (e) { return e.status === 409; } }), 'el servidor también lo impide');
  await page.click('[data-act="open"][data-id]'); await page.waitForSelector('.file-head h2:has-text("Elena")');
  // consentimiento: copia entregada y folio
  await page.click('[data-act="tab"][data-tab="consent"]'); await page.waitForSelector('#consentform');
  const pad = async sel => { await page.locator(sel).scrollIntoViewIfNeeded(); const bb = await page.locator(sel).boundingBox(); await page.mouse.move(bb.x + 30, bb.y + 60); await page.mouse.down(); for (let i = 0; i < 8; i++) await page.mouse.move(bb.x + 40 + i * 20, bb.y + 40 + (i % 2) * 40, { steps: 2 }); await page.mouse.up(); };
  await pad('[data-pad="consentSig"] canvas'); await page.check('#c_ok'); await page.click('[data-act="signConsent"]'); await page.waitForTimeout(200);
  ok(/copia/.test(await toast()), 'pide indicar si se entregó copia al usuario');
  await page.selectOption('#f_copia', 'Sí, en papel'); await page.click('[data-act="signConsent"]'); await page.waitForSelector('#consentform', { state: 'detached' });
  ok(/Folio n\.º 1/.test(await page.locator('#tabbody').textContent()) && await page.evaluate(() => curPatient().consents[0].copia === 'Sí, en papel' && curPatient().consents[0].folio === 1), 'el consentimiento queda con folio 1 y la copia entregada');
  // primera vez
  await page.click('[data-act="tab"][data-tab="intake"]'); await page.waitForSelector('#intakeform');
  ok(await page.locator('#intakeform .req').count() >= 10 && await page.locator('#intakeform .nrq').count() >= 10, 'los obligatorios están marcados con * y tienen «No refiere / No aplica / No se indagó»');
  ok(await page.locator('#f_sessionAt').count() && await page.inputValue('#f_modalidad') === 'Presencial' && await page.inputValue('#f_ripsCups') === '890208' && await page.inputValue('#f_ripsFinalidad') === '15' && await page.inputValue('#f_ripsCausa') === '38' && await page.locator('#f_viaIngreso').count() && await page.locator('#f_presentes').count() && await page.locator('#f_formulacion').count() && await page.locator('#f_riesgoNivel').count(), 'trae fecha, modalidad, CUPS, finalidad, causa, vía de ingreso, personas presentes, formulación y riesgo');
  ok(await page.locator('#f_entorno').count() === 0 && await page.locator('#f_destino').count() === 0, 'ya no trae entorno ni condición y destino');
  await page.fill('#f_motivo', 'Ansiedad en el trabajo.');
  await page.click('[data-act="saveIntake"]'); await page.waitForTimeout(200);
  ok(/Faltan \d+ campos obligatorios/.test(await toast()) && await page.locator('#intakeform .fld.miss').count() > 5, 'sin los obligatorios no deja firmar y los marca');
  await page.screenshot({ path: OUT + 'formularios_obligatorios.png' });
  // «No refiere» con un clic en cada uno
  for (const nq of await page.locator('#intakeform .nrq').all()) { const ta = nq.locator('xpath=..').locator('textarea, input'); if (!(await ta.inputValue())) await nq.locator('button').first().click(); }
  ok(await page.inputValue('#f_antFam') === 'No refiere', '«No refiere» llena el campo con un clic');
  await page.fill('#f_presentes', 'La madre'); await page.click('[data-act="saveIntake"]'); await page.waitForTimeout(200);
  ok(/nivel de riesgo/.test(await toast()), 'pide elegir el nivel de riesgo');
  await page.selectOption('#f_riesgoNivel', 'Bajo'); await page.click('[data-act="saveIntake"]'); await page.waitForTimeout(200);
  ok(/personas presentes/.test(await toast()), 'si hay personas presentes, pide su consentimiento');
  await page.check('#f_presentesConsent'); await page.selectOption('#f_ripsCausa', '31'); await page.fill('#f_dxObs', 'Diagnóstico en evaluación.');
  await page.click('[data-act="saveIntake"]'); await page.waitForSelector('[data-act="viewIntake"]');
  ok(/Folio n\.º 1 · Sesión n\.º 1/.test(await page.locator('#tabbody').textContent()) && /violencia/.test(await page.locator('#tabbody').textContent()), 'la primera vez queda con folio 1, sesión 1 y la cabecera de la atención');
  await page.click('[data-act="viewIntake"]'); await page.waitForSelector('#paper');
  ok(/CUPS[\s\S]*890208[\s\S]*Finalidad[\s\S]*Diagnóstico[\s\S]*Vía de ingreso[\s\S]*Causa de la atención[\s\S]*violencia psicológica[\s\S]*Personas presentes[\s\S]*La madre[\s\S]*Evaluación de riesgo[\s\S]*Bajo/.test(await page.locator('#paper').textContent()), 'el documento trae la cabecera con CUPS, finalidad y causa, y el riesgo');
  await page.click('#cl');
  // evolución
  await page.click('[data-act="tab"][data-tab="evol"]'); await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  ok(await page.locator('#noformat').count() === 1 && await page.locator('#noteform textarea:not(#f_dxObs)').count() === 0 && await page.inputValue('#f_ripsCups') === '890308' && await page.inputValue('#f_ripsFinalidad') === '16' && await page.locator('#f_modalidad option').count() === 3, 'sin formato propio, la evolución solo trae los datos de la atención (fecha, modalidad, CUPS, finalidad, causa), el diagnóstico y el riesgo');
  await page.screenshot({ path: OUT + 'evolucion_sin_formato.png' });
  await page.click('#noformat [data-act="formats"]'); await page.waitForSelector('#fmform'); await page.click('[data-fm="reset"]'); await page.click('[data-fm="save"]'); await page.waitForSelector('#fmform', { state: 'detached' });
  if (!(await page.locator('#noteform').count())) { await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform'); }
  ok(await page.locator('#f_objetivoSesion').count() && await page.locator('#f_evolucionObj').count() && await page.locator('#f_cambiosPlan').count(), 'con el formato sugerido trae objetivo de la sesión, evolución frente a objetivos y cambios al plan');
  ok(await page.evaluate(() => { const f = document.querySelector('#noteform'), pos = el => [...f.querySelectorAll('*')].indexOf(el); return pos(f.querySelector('#dxblock')) > pos(f.querySelector('#f_riesgoNivel')) && pos(f.querySelector('#dxblock')) > pos(f.querySelector('#f_objetivoSesion')); }), 'en la evolución el diagnóstico va al final, después del formato y del riesgo');
  await page.fill('#f_tema', 'Exposición a reuniones.');
  await page.click('[data-act="saveNote"]'); await page.waitForTimeout(200);
  ok(/Faltan \d+ campos obligatorios/.test(await toast()), 'la evolución también exige los obligatorios');
  for (const nq of await page.locator('#noteform .nrq').all()) { const ta = nq.locator('xpath=..').locator('textarea, input'); if (!(await ta.inputValue())) await nq.locator('button').last().click(); }
  await page.selectOption('#f_riesgoNivel', 'Sin riesgo evidente'); await page.click('[data-act="saveNote"]'); await page.waitForSelector('#noteform', { state: 'detached' });
  const n = await page.evaluate(() => S.notes[0]);
  ok(n.folio === 1 && n.sesion === 2 && /sesión n\.º 2/.test(await page.locator('#tabbody').textContent()), 'la evolución queda con folio 1 y sesión n.º 2 (la primera vez fue la 1)');
  // corrección (F12)
  await page.click(`#rec-${n.id} details summary`); await page.selectOption(`#adt_${n.id}`, 'Corrección');
  await page.fill(`#add_${n.id}`, 'Exposición a reuniones.'); await page.fill(`#adn_${n.id}`, 'Exposición gradual a reuniones de equipo.'); await page.fill(`#ad_${n.id}`, 'Faltó precisar el tipo de exposición.');
  await page.click(`[data-act="addAdd"][data-id="${n.id}"]`); await page.waitForTimeout(400);
  const card = await page.locator('#rec-' + n.id).textContent();
  ok(/Corrección[\s\S]*Psicóloga Prueba · C\.C\. 52123456 · T\.P\. TP-5566[\s\S]*Decía: «Exposición a reuniones\.»[\s\S]*Debe decir: «Exposición gradual[\s\S]*Motivo: Faltó precisar/.test(card), 'la corrección guarda qué decía, qué debe decir, el motivo y quién la hizo (nombre, C.C. y T.P.)');
  ok(await page.evaluate(() => S.notes[0].tema) === 'Exposición a reuniones.', 'el registro original no se borra');
  ok(await page.evaluate(() => api('/records').then(r => r.find(x => x.kind === 'note').folio)) === 1, 'el folio se conserva al agregar la corrección');
  await page.screenshot({ path: OUT + 'formularios_correccion.png' });
  // pruebas (F5)
  await page.click('[data-act="tab"][data-tab="escalas"]'); await page.click('[data-act="newScale"]'); await page.waitForSelector('#scaleform');
  for (let i = 0; i < 9; i++) await page.check(`#scaleform input[name="sc_${i}"][value="1"]`);
  await page.click('[data-act="saveScale"]'); await page.waitForTimeout(200);
  ok(/obligatorio/.test(await toast()), 'la escala exige motivo, condiciones e interpretación');
  await page.fill('#f_version', 'Versión colombiana; baremo adultos'); await page.fill('#f_motivo', 'Seguimiento de síntomas depresivos.'); await page.fill('#f_observaciones', 'Autoaplicada en consultorio, sin interrupciones; colaboradora.'); await page.fill('#f_interpretacion', 'Puntaje en rango leve.');
  await page.click('[data-act="saveScale"]'); await page.waitForSelector('#scaleform', { state: 'detached' });
  await page.click('[data-act="viewScale"]'); await page.waitForSelector('#paper');
  ok(/Folio n\.º 1[\s\S]*Versión y baremo[\s\S]*Motivo de la aplicación[\s\S]*Condiciones de aplicación[\s\S]*Resultados e interpretación/.test(await page.locator('#paper').textContent()), 'el documento de la escala trae folio, versión, motivo, condiciones e interpretación');
  await page.click('#cl');
  // comentarios: «apartado del programa»
  await page.click('#fb_btn'); await page.waitForSelector('#fb_panel');
  ok(/Apartado del programa/.test(await page.locator('#fb_panel').textContent()), 'el panel de comentarios pide el apartado del programa');
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
