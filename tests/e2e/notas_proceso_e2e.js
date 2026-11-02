// Notas de proceso: cuaderno del terapeuta fuera de la historia clínica, con búsqueda y seguimiento.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const PW = {};
  const login = async (email, pw = 'contraseña-segura-123') => { pw = PW[email] || pw; await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', email); await page.fill('#lg_pass', pw); await page.click('#loginform button[type=submit]');
    // cuentas creadas por otra persona: al primer ingreso eligen su propia contraseña (se usa la misma + «-2» y se recuerda)
    await page.waitForSelector('[data-act="menu"], #firstpw');
    if (await page.locator('#firstpw').count()) { const nw = pw + '-2'; await page.fill('#fp_cur', pw); await page.fill('#fp_new', nw); await page.fill('#fp_new2', nw); await page.click('#firstpw button[type=submit]'); PW[email] = nw; await page.waitForSelector('[data-act="menu"]'); } };
  const logout = async () => { await page.click('[data-act="menu"]'); await page.click('[data-act="logout"]'); await page.waitForSelector('#loginform'); };
  await login('psico@ejemplo.co');
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(async sig => {
    await api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', registro: 'TP-1', firma: sig } });
    for (const [id, n, a] of [['p_np1', 'Andrés', 'Mejía'], ['p_np2', 'Lucía', 'Pardo']]) await api('/records/' + id, { method: 'PUT', body: { id, kind: 'patient', nombres: n, apellidos: a, documento: id, estado: 'Activo', consents: [] } });
  }, SIG);
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  // desde la ficha del paciente
  await page.click('.prow:has-text("Andrés")'); await page.waitForSelector('[data-act="pnFor"]');
  await page.click('[data-act="pnFor"]'); await page.waitForSelector('#pn_q');
  ok(/no la historia clínica/.test(await page.locator('#app').textContent()), 'explica que las notas no son parte de la historia clínica');
  ok(await page.inputValue('#pn_fpac') === 'p_np1', 'llega filtrado por el paciente');
  await page.click('.pned [data-act="pnNew"]'); await page.waitForSelector('#pn_t');
  ok(await page.inputValue('#pn_pac') === 'p_np1', 'la nota nueva queda ligada al paciente');
  await page.fill('#pn_t', 'Hipótesis sobre la evitación');
  await page.fill('#pn_txt', 'Posible **evitación experiencial** ligada al duelo del padre. Explorar en la próxima sesión.');
  await page.fill('#pn_tags', 'duelo, evitación');
  await page.waitForFunction(() => /Guardada/.test(document.querySelector('#pn_stat').textContent), null, { timeout: 5000 });
  ok(await page.evaluate(() => S.pnotes.length === 1 && S.pnotes[0].titulo === 'Hipótesis sobre la evitación'), 'se guarda sola mientras escribe');
  await page.fill('#pn_seg', 'Supervisión con la Dra. Ruiz: revisar también la culpa.'); await page.click('[data-act="pnSeg"]'); await page.waitForSelector('.pnseg');
  ok(await page.inputValue('#pn_estado') === 'En seguimiento', 'al agregar seguimiento pasa a «En seguimiento»');
  // segunda nota, de supervisión, para otro paciente, con fecha de revisión hoy
  await page.click('[data-act="pnNew"]'); await page.fill('#pn_t', 'Supervisión grupal'); await page.selectOption('#pn_pac', 'p_np2'); await page.selectOption('#pn_tipo', 'Notas de supervisión');
  const today = await page.evaluate(() => dayKey(new Date())); await page.fill('#pn_rev', today);
  await page.fill('#pn_txt', 'Trabajar límites en pareja.'); await page.click('#pn_t'); await page.waitForTimeout(1500);
  // nota general
  await page.click('[data-act="pnNew"]'); await page.selectOption('#pn_pac', ''); await page.fill('#pn_t', 'Lecturas pendientes'); await page.selectOption('#pn_tipo', 'Idea'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => S.pnotes.length) === 3, 'tres notas guardadas');
  await page.selectOption('#pn_fpac', ''); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 3, 'la lista tiene las tres notas');
  const groups = (await page.locator('details.pngrp > summary .gn').allTextContents()).map(t => t.replace('●', ''));
  ok(JSON.stringify(groups) === JSON.stringify(['Notas generales', 'Andrés Mejía', 'Lucía Pardo']), 'agrupadas: primero las generales y luego por paciente: ' + JSON.stringify(groups));
  ok(await page.locator('details.pngrp[data-g="_none"]').getAttribute('open') !== null && await page.locator('details.pngrp[data-g="p_np2"]').getAttribute('open') === null, 'los grupos empiezan cerrados; queda abierto el de la nota que está editando');
  ok(/1 por revisar/.test(await page.locator('details.pngrp[data-g="p_np2"] > summary').textContent()), 'el grupo avisa cuántas notas tiene por revisar');
  ok(await page.locator('details.pngrp[data-g="p_np2"] .pnrow').isHidden(), 'las notas de un grupo cerrado no se muestran');
  await page.click('details.pngrp[data-g="p_np2"] > summary');
  ok(await page.locator('details.pngrp[data-g="p_np2"] .pnrow').isVisible(), 'al tocar el paciente se despliegan sus notas');
  await page.selectOption('#pn_fest', 'todas'); await page.waitForTimeout(100);
  ok(await page.locator('details.pngrp[data-g="p_np2"]').getAttribute('open') !== null, 'el grupo abierto se mantiene al cambiar los filtros');
  await page.selectOption('#pn_fest', 'abiertas');
  await page.screenshot({ path: OUT + 'notas_proceso_grupos.png' });
  await page.fill('#pn_q', 'evitacion'); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 1 && await page.locator('.pnrow mark').count() >= 1, 'la búsqueda ignora tildes y resalta lo encontrado');
  await page.fill('#pn_q', 'culpa'); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 1, 'también busca dentro del seguimiento');
  await page.fill('#pn_q', 'lucia'); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 1 && /Supervisión grupal/.test(await page.locator('.pnrow').textContent()), 'busca por nombre del paciente');
  await page.fill('#pn_q', ''); await page.selectOption('#pn_ftipo', 'Notas de supervisión'); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 1, 'filtra por tipo');
  await page.selectOption('#pn_ftipo', ''); await page.selectOption('#pn_fest', 'revisar'); await page.waitForTimeout(100);
  ok(await page.locator('.pnrow').count() === 1 && await page.locator('.pnrow .chip.due').count() === 1, 'muestra las notas por revisar hoy');
  await page.selectOption('#pn_fest', 'abiertas');
  if (await page.locator('details.pngrp[data-g="p_np1"]').getAttribute('open') === null) await page.click('details.pngrp[data-g="p_np1"] > summary');
  await page.locator('.pnrow:has-text("Hipótesis")').click(); await page.waitForSelector('#pn_t');
  await page.screenshot({ path: OUT + 'notas_proceso.png' });
  // no forman parte de la historia
  await page.click('[data-act="view"][data-v="patients"]'); await page.click('[data-act="home"]'); await page.waitForTimeout(200);
  if (await page.locator('[data-act="allTodo"]').count()) await page.click('[data-act="allTodo"]');
  ok(/Nota de proceso por revisar[\s\S]*Supervisión grupal/.test(await page.locator('#app').textContent()), 'Pendientes avisa las notas para revisar');
  await page.click('.prow:has-text("Andrés")'); await page.waitForSelector('[data-act="fullDoc"]');
  ok(/Notas de proceso \(1\)/.test(await page.locator('[data-act="pnFor"]').textContent()), 'la ficha muestra cuántas notas tiene el paciente');
  await page.click('[data-act="fullDoc"]'); await page.waitForTimeout(500);
  ok(!/evitación experiencial|Supervisión con la Dra/.test(await page.locator('#modal-root').textContent()), 'no aparecen en la historia completa');
  await page.keyboard.press('Escape'); await page.evaluate(() => { $('#modal-root').innerHTML = ''; });
  // editar y borrar
  await page.click('[data-act="pnFor"]'); await page.locator('.pnrow:has-text("Hipótesis")').click(); await page.waitForSelector('#pn_t');
  await page.fill('#pn_t', 'Hipótesis revisada'); await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => api('/records').then(r => r.find(x => x.id === S.pnotes.find(n => /revisada/.test(n.titulo))?.id)?.titulo)) === 'Hipótesis revisada', 'al salir del cuaderno guarda lo último escrito');
  await page.click('[data-act="view"][data-v="cuaderno"]'); await page.selectOption('#pn_fpac', ''); if (await page.locator('details.pngrp[data-g="_none"]').getAttribute('open') === null) await page.click('details.pngrp[data-g="_none"] > summary'); await page.locator('.pnrow:has-text("Lecturas")').click();
  await page.click('[data-act="pnDel"]'); await page.click('[data-act="pnDel"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => S.pnotes.length) === 2, 'se puede eliminar una nota');
  // la cuenta de equipo no las ve
  await page.click('[data-act="menu"]'); await page.click('[data-act="team"]'); await page.waitForSelector('#teamform');
  await page.fill('#f_tname', 'Luis'); await page.fill('#f_temail', 'secre2@ejemplo.co'); await page.fill('#f_tpass', 'clave-del-equipo-1'); await page.click('[data-tm2="add"]'); await page.waitForSelector('#teamform .card b:has-text("Luis")'); await page.click('[data-tm2="close"]');
  await logout(); await login('secre2@ejemplo.co', 'clave-del-equipo-1');
  ok(await page.locator('[data-v="cuaderno"]').count() === 0 && await page.evaluate(() => !S.pnotes.length), 'la cuenta de equipo no tiene notas de proceso');
  await logout();
  // celular
  const m = await b.newContext({ ...devices['iPhone 13'] }); const mp = await m.newPage();
  await m.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  await mp.goto(BASE + 'app'); await mp.fill('#lg_email', 'psico@ejemplo.co'); await mp.fill('#lg_pass', 'contraseña-segura-123'); await mp.click('#loginform button[type=submit]'); await mp.waitForSelector('[data-v="cuaderno"]');
  await mp.click('[data-v="cuaderno"]'); await mp.waitForSelector('details.pngrp'); await mp.locator('details.pngrp > summary').first().click();
  ok(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'en el celular no se sale de la pantalla');
  await mp.locator('.pnrow').first().click(); await mp.waitForSelector('#pn_t');
  ok(await mp.locator('.plist-wrap').isHidden() && await mp.locator('[data-act="pnBack"]').isVisible(), 'en el celular la nota se abre a pantalla completa con botón para volver');
  await mp.screenshot({ path: OUT + 'notas_proceso_movil.png', fullPage: true }); await m.close();
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
