// Prueba i18n: cambia el idioma a inglés desde el perfil, recorre pantallas y lista el español que queda sin traducir.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
const ES = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|que|con|para|por|una?|su|sus|se|en|no|es|y|o)\b/i;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const left = new Map();
  const scan = async tag => { const xs = await page.evaluate(() => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const v = n.nodeValue.trim(); if (v && !/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) && n.parentNode.offsetParent !== null) o.push(v); } document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e => ['placeholder', 'title', 'aria-label'].forEach(a => { const v = e.getAttribute(a); if (v) o.push(v); })); return o; }); xs.forEach(x => { if (x.length > 2 && ES.test(x) && !left.has(x)) left.set(x, tag); }); };
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', cedula: '123', titulo: 'Terapeuta', registro: 'X-1', ciudad: 'Bogotá', telefono: '3000000000', correo: 'psico@ejemplo.co', idioma: 'en' } }));
  await page.reload(); await page.waitForSelector('[data-act="menu"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => I18N.lang) === 'en' && await page.evaluate(() => document.documentElement.lang) === 'en', 'el idioma del perfil (en) se aplica al ingresar');
  await scan('inicio');
  await page.click('.steps [data-act="demoLoad"]').catch(() => {});
  await page.waitForSelector('.prow', { timeout: 8000 }); await scan('lista');
  ok(/Clients/.test(await page.locator('body').innerText()), 'la interfaz aparece en inglés');
  await page.click('.prow:has-text("Laura")'); await page.waitForTimeout(200);
  for (const t of ['datos', 'consent', 'intake', 'evol', 'informes', 'archivo']) { await page.click(`[data-act="tab"][data-tab="${t}"]`).catch(() => {}); await page.waitForTimeout(250); await scan('ficha:' + t); }
  await page.click('[data-act="tab"][data-tab="evol"]').catch(() => {}); await page.click('[data-act="newNote"]').catch(() => {}); await page.waitForTimeout(250); await scan('nueva nota');
  for (const v of ['agenda', 'pnotes', 'finanzas', 'encuesta', 'stats']) { await page.evaluate(x => { S.pid = null; S.view = x; render(); }, v).catch(() => {}); await page.waitForTimeout(250); await scan('vista:' + v); }
  await page.evaluate(() => { S.pid = null; S.view = 'patients'; render(); }); await page.click('[data-act="apptNew"]').catch(() => {}); await page.waitForTimeout(250); await scan('nueva cita'); await page.evaluate(() => { document.querySelector('#modal-root').innerHTML = ''; });
  await page.click('.prow:has-text("Laura")'); await page.click('[data-act="tab"][data-tab="consent"]').catch(() => {}); await page.click('[data-act="newConsent"]').catch(() => {}); await page.waitForTimeout(250); await scan('nuevo consentimiento'); await page.evaluate(() => { S.pid = null; render(); });
  await page.click('[data-act="menu"]').catch(() => {}); await page.waitForTimeout(200); await scan('menu');
  await page.evaluate(() => ACT.profile()); await page.waitForTimeout(250); await scan('perfil');
  // los <option> conservan su valor en español aunque se vean en inglés
  const vals = await page.evaluate(() => [...document.querySelectorAll('select option')].filter(o => o.value !== o.getAttribute('value')).length);
  ok(vals === 0, 'las opciones de listas guardan su valor original');
  const sel = await page.evaluate(() => { const s = document.querySelector('#f_idioma'); return s ? s.value : null; });
  ok(sel === 'English', 'el selector de idioma está en el perfil (' + sel + ')');
  console.log('--- Español sin traducir (' + left.size + ') ---'); [...left].slice(0, 400).forEach(([k, v]) => console.log(v + ' | ' + k.slice(0, 140)));
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
