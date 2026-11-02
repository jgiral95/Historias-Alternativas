// Prueba humo: datos de ejemplo, impresiones en texto libre y ausencia de RIPS/CIE.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', cedula: '123', titulo: 'Terapeuta', registro: 'X-1', ciudad: 'Bogotá', telefono: '3000000000', correo: 'a@b.co', firma: 'data:image/png;base64,iVBORw0KGgo=' } }));
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => { S.profile.firma = S.profile.firma || demoSig('x'); return demoLoad ? 0 : 0; }).catch(() => {});
  await page.click('.steps [data-act="demoLoad"]').catch(() => {});
  await page.waitForSelector('.prow', { timeout: 8000 });
  await page.click('.prow:has-text("Laura")');
  await page.click('[data-act="tab"][data-tab="intake"]'); await page.waitForTimeout(200);
  const t = await page.locator('#tabbody').textContent();
  ok(/Impresión o motivo de seguimiento/.test(t) && /ansiedad generalizada/i.test(t), 'la primera vez muestra la impresión en texto libre');
  ok(!/CIE|CUPS|RIPS/.test(t), 'sin CIE/CUPS/RIPS en la primera vez');
  await page.click('[data-act="tab"][data-tab="evol"]'); await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  ok(await page.locator('#noteform #dxblock').count() === 1 && await page.locator('#f_ripsCups').count() === 0, 'la evolución trae impresiones y no CUPS');
  await page.fill('#dx_q', 'Duelo reciente'); await page.press('#dx_q', 'Enter');
  ok(await page.locator('.dxrow').count() === 2 || /Duelo reciente/.test(await page.locator('#dxlist').textContent()), 'agrega una impresión con Enter');
  const menu = await page.evaluate(() => (document.querySelector('#acmenu') || document.body).innerHTML);
  ok(!/RIPS|Conservaci/.test(menu), 'el menú ya no tiene RIPS ni Conservación');
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
