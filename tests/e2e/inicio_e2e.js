// Primer ingreso: contraseña propia, bienvenida, primeros pasos y datos de ejemplo.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const go = async (email, pw) => { await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', email); await page.fill('#lg_pass', pw); await page.click('#loginform button[type=submit]'); };
  // el administrador crea la cuenta de una psicóloga
  await go('admin@ejemplo.co', 'contraseña-segura-123'); await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => api('/admin/users', { method: 'POST', body: { email: 'nueva@ejemplo.co', name: 'Marta Nueva', password: 'temporal-12345', role: 'user' } }));
  await page.click('[data-act="menu"]'); await page.click('[data-act="logout"]'); await page.waitForSelector('#loginform');
  // primer ingreso
  await go('nueva@ejemplo.co', 'temporal-12345'); await page.waitForSelector('#firstpw');
  ok(/Elija su contraseña/.test(await page.locator('#app').textContent()) && await page.locator('[data-act="menu"]').count() === 0, 'al primer ingreso pide elegir su contraseña antes de ver la app');
  await page.screenshot({ path: OUT + 'inicio_clave.png' });
  await page.fill('#fp_cur', 'temporal-12345'); await page.fill('#fp_new', 'mi-clave-propia-1'); await page.fill('#fp_new2', 'otra-cosa'); await page.click('#firstpw button[type=submit]');
  ok(/no coinciden/.test(await page.locator('#firstpw').textContent()), 'avisa si las contraseñas no coinciden');
  await page.fill('#fp_cur', 'temporal-12345'); await page.fill('#fp_new', 'mi-clave-propia-1'); await page.fill('#fp_new2', 'mi-clave-propia-1'); await page.click('#firstpw button[type=submit]');
  await page.waitForSelector('.steps');
  ok(/Bienvenido\(a\)/.test(await page.locator('.steps').textContent()) && /Primeros pasos · 0 de 6/.test(await page.locator('.steps').textContent()), 'muestra la bienvenida y los primeros pasos (0 de 6)');
  ok(/Gracias por hacer parte de nuestro equipo de prueba[\s\S]*tres meses gratis/.test(await page.locator('.steps').textContent()), 'la bienvenida agradece y menciona los tres meses gratis');
  ok(await page.locator('#fb_btn.pulse').count() === 1, 'el botón de comentarios llama la atención la primera vez');
  await page.screenshot({ path: OUT + 'inicio_pasos.png' });
  await page.click('[data-act="welcomeOk"]'); await page.waitForTimeout(300);
  ok(!/Bienvenido\(a\)/.test(await page.locator('#app').textContent()), '«Entendido» cierra la bienvenida');
  // datos de ejemplo
  await page.click('.steps [data-act="demoLoad"]'); await page.waitForSelector('.banner.demo');
  ok(await page.locator('.prow .chip:has-text("Ejemplo")').count() === 3, 'carga 3 pacientes de ejemplo, marcados «Ejemplo»');
  ok(/Primeros pasos · 1 de 6/.test(await page.locator('.steps').textContent()), 'el paso de ejemplos queda marcado');
  await page.click('.prow:has-text("Laura")'); await page.click('[data-act="tab"][data-tab="evol"]'); await page.waitForTimeout(200);
  ok((await page.locator('#tabbody').textContent()).match(/Psicoeducación|preocupación/) !== null, 'la paciente de ejemplo tiene evoluciones firmadas');
  await page.click('[data-act="tab"][data-tab="intake"]'); await page.waitForTimeout(200);
  ok(/6B00/.test(await page.locator('#tabbody').textContent()), 'y primera vez con diagnóstico CIE-11');
  await page.click('[data-act="view"][data-v="cuaderno"]'); await page.waitForSelector('details.pngrp');
  ok(await page.evaluate(() => S.pnotes.filter(n => n.demo).length) === 3, 'trae notas de proceso de ejemplo');
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.appts.filter(a => a.demo && a.estado === 'Programada').length) === 3, 'y citas programadas en la agenda');
  await page.click('[data-act="view"][data-v="patients"]'); await page.click('[data-act="home"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + 'inicio_ejemplos.png' });
  // borrar los ejemplos
  await page.click('.banner.demo [data-act="demoDel"]'); await page.click('.banner.demo [data-act="demoDel"]');
  await page.waitForSelector('.banner.demo', { state: 'detached' });
  ok(await page.evaluate(() => S.patients.length + S.notes.length + S.appts.length + S.pnotes.length) === 0, 'se borra todo lo de ejemplo, aunque estuviera firmado');
  // pasos que se marcan solos y ocultar
  await page.click('[data-act="stepsHide"]'); await page.waitForTimeout(300);
  ok(await page.locator('.steps').count() === 0, 'los primeros pasos se pueden ocultar');
  await page.click('[data-act="menu"]'); await page.click('[data-act="stepsShow"]'); await page.waitForSelector('.steps');
  ok(true, 'y se vuelven a ver desde el menú');
  await page.reload(); await page.waitForSelector('.steps');
  ok(!/Bienvenido\(a\)/.test(await page.locator('.steps').textContent()), 'la bienvenida no vuelve a salir');
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
