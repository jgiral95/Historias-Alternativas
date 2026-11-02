// Si nginx responde pero la API no (502), la app no debe pasar a modo local: muestra «El servidor no responde».
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1000, height: 700 } });
  let down = true;
  await page.route('**/*', r => { const u = r.request().url(); if (!u.startsWith('http://127.0.0.1')) return r.abort(); if (down && u.includes('/api/')) return r.fulfill({ status: 502, contentType: 'text/html', body: '<h1>502 Bad Gateway</h1>' }); return r.continue(); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#dn_retry');
  ok(/El servidor no responde/.test(await page.locator('#app').textContent()), 'con la API caída avisa que el servidor no responde');
  const bt = await page.locator('#app').innerText(), np = await page.locator('[data-act="newPatient"]').count(); ok(!/Modo local/.test(bt) && np === 0, 'no entra en modo local ni deja crear pacientes');
  await page.screenshot({ path: OUT + 'servidor_caido.png' });
  down = false; await page.click('#dn_retry'); await page.waitForSelector('#loginform');
  ok(true, 'al volver el servidor, «Reintentar» lleva al ingreso');
  ok(errors.length === 0, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
