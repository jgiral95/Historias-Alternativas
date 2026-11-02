require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), FIX = __dirname + '/fixtures/', BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1100, height: 900 } });
  let googleUrl = '';
  await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith('https://accounts.google.com/')) { googleUrl = u; return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google (simulado)</p>' }); } return u.startsWith('http://127.0.0.1') ? r.continue() : r.abort(); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="newPatient"]'); await page.click('[data-act="view"][data-v="agenda"]'); await page.click('[data-act="gcal"]'); await page.waitForSelector('#gcform');
  const conf = !!(await page.$('[data-g="gconnect"]'));
  console.log('Configurado:', conf);
  if (!process.env.SIN_GOOGLE) {
    ok(conf && /Conexión directa \(recomendada\)/.test(await page.locator('#gcform').textContent()), 'con Google configurado ofrece «Conectar con Google»');
    await page.screenshot({ path: OUT + 'gcal_conectar.png' });
    await page.selectOption('#gd_detail', 'oculto'); await page.click('[data-g="gconnect"]'); await page.waitForURL(/accounts\.google\.com/);
    const q = new URL(googleUrl).searchParams;
    ok(q.get('scope') === 'https://www.googleapis.com/auth/calendar.app.created' && q.get('redirect_uri') === 'http://127.0.0.1:8100/api/google/callback' && q.get('client_id') === 'cid-prueba' && q.get('access_type') === 'offline' && !!q.get('state'), 'lleva a Google con el permiso limitado y la dirección de regreso correcta');
    await page.goto(BASE + 'api/google/callback?state=' + q.get('state') + '&error=access_denied'); await page.waitForTimeout(1500); console.log('URL', page.url()); await page.screenshot({ path: OUT + 'gcal_vuelta.png' }); await page.waitForSelector('[data-act="newPatient"]');
    ok(/No se concedió/.test(await page.locator('.toast').textContent()) && !/google=/.test(page.url()), 'si se niega el permiso, vuelve a la agenda con un aviso y limpia la dirección');
  } else {
    ok(!conf && /no configuró/.test(await page.locator('#gcform').textContent()) && await page.locator('[data-g="new"]').isVisible(), 'sin configurar explica y deja el enlace iCal disponible');
    await page.screenshot({ path: OUT + 'gcal_sin_config.png' });
  }
  ok(errors.length === 0, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
