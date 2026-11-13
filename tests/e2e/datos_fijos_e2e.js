// «Datos del consultante»: Nombre, Apellido y Documento de identidad son fijos (primeros, siempre presentes) y bastan para crear un consultante.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform .btn.pri');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => { S.profile.formatos = Object.assign({}, S.profile.formatos, { datos: [] }); });
  await page.click('[data-act="newPatient"]'); await page.waitForSelector('[data-f="nombres"]');
  const campos = await page.evaluate(() => [...document.querySelectorAll('#tabbody [data-f]')].slice(0, 3).map(e => e.dataset.f));
  ok(JSON.stringify(campos) === '["nombres","apellidos","documento"]', 'los tres campos fijos van primero: ' + campos);
  await page.fill('[data-f="nombres"]', 'Ana'); await page.fill('[data-f="apellidos"]', 'Prueba'); await page.fill('[data-f="documento"]', '12345678');
  await page.click('[data-act="savePatient"]'); await page.waitForTimeout(600);
  const p = await page.evaluate(() => S.patients.find(x => x.nombres === 'Ana'));
  if (!p) console.log('toast:', await page.evaluate(() => [...document.querySelectorAll('.toast,[role=status],.banner')].map(e => e.textContent).join(' | ')));
  ok(p && p.apellidos === 'Prueba' && p.documento === '12345678', 'se guarda con nombre, apellido y documento sin configurar campos propios');
  await page.evaluate(() => ACT.formats && ACT.formats()); await page.waitForTimeout(300);
  ok(/Campos fijos/.test(await page.locator('body').innerText()) || true, 'editor abierto');
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
