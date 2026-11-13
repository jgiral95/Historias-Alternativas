// Clic en el fondo de una ventana emergente la cierra; arrastrar desde dentro hasta el fondo no.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform .btn.pri');
  await page.waitForSelector('[data-act="menu"]');
  const abrir = async () => { await page.evaluate(() => ACT.exportAll && ACT.exportAll()); await page.waitForSelector('.modal'); };
  await abrir();
  await page.mouse.move(600, 440); await page.mouse.down(); await page.mouse.move(5, 5); await page.mouse.up();
  ok(await page.locator('.modal').count() === 1, 'arrastrar desde dentro hasta el fondo no cierra');
  await page.mouse.click(5, 5); await page.waitForTimeout(300);
  ok(await page.locator('.modal').count() === 0, 'clic en el fondo cierra la ventana');
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
