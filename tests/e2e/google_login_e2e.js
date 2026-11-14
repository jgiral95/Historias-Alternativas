// Ingreso con Google: botón en el ingreso y en «Crear cuenta», y mensaje al volver de Google con un error.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform');
  ok(await page.locator('#loginform a[href="/api/auth/google/start"]').count() === 1, 'el ingreso tiene «Ingresar con Google»');
  await page.click('#lg_reg'); await page.waitForSelector('#regform');
  ok(await page.locator('#regform a[href="/api/auth/google/start"]').count() === 1, 'crear cuenta tiene «Crear cuenta con Google»');
  await page.goto(BASE + 'app?gl=cancel'); await page.waitForSelector('#loginform .banner');
  ok(/No se concedió el permiso/.test(await page.locator('#loginform .banner').innerText()), 'muestra el aviso cuando Google se cancela');
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
