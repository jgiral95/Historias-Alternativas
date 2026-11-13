// Páginas públicas en inglés: ?lang=en traduce textos estáticos y mensajes de error de la API.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'verificar?lang=en'); await page.waitForTimeout(500);
  ok(/Verify a document/i.test(await page.innerText('body')) && await page.evaluate(() => document.documentElement.lang) === 'en', 'verificar en inglés con ?lang=en');
  await page.goto(BASE + 'verificar'); await page.waitForTimeout(300);
  ok(/Verificar un documento/.test(await page.innerText('body')), 'verificar sigue en español sin ?lang');
  await page.goto(BASE + 'cita?t=nulo&lang=en'); await page.waitForTimeout(800);
  const t = await page.innerText('body'); ok(!/enlace/i.test(t) || /link/i.test(t), 'cita muestra el error en inglés: ' + t.replace(/\s+/g, ' ').slice(0, 90));
  await page.goto(BASE + 'encuesta?t=nulo&lang=en'); await page.waitForTimeout(800);
  ok(/link/i.test(await page.innerText('body')), 'encuesta muestra el error en inglés');
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
