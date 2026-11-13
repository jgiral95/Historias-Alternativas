// «virgo» encuentra ♍ y ♍ encuentra «virgo» en la búsqueda de notas (lista de consultantes).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#lg_pass ~ button, #loginform button[type=submit], #loginform .btn.pri');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => {
    S.patients.push({ id: 'p_sim', kind: 'patient', nombres: 'Ana', apellidos: 'Prueba' }); render();
    const pid = 'p_sim';
    S.reports.push({ id: 'r_sim1', patientId: pid, signedAt: new Date().toISOString(), tipo: 'Informe', contenido: 'Luna en ♍︎ casa 6, revisar ciclo.' });
    S.reports.push({ id: 'r_sim2', patientId: pid, signedAt: new Date().toISOString(), tipo: 'Informe', contenido: 'El ascendente es Virgo y el sol en Leo.' });
  });
  const buscar = async q => { await page.fill('#q', q); await page.dispatchEvent('#q', 'input'); await page.waitForTimeout(300); return page.evaluate(() => [...document.querySelectorAll('.hits .snip')].map(e => e.textContent)); };
  const w = await buscar('virgo');
  ok(w.some(t => t.includes('♍')) && w.some(t => /Virgo/.test(t)), 'virgo encuentra el símbolo y la palabra: ' + JSON.stringify(w));
  const s = await buscar('♍');
  ok(s.some(t => t.includes('♍')) && s.some(t => /Virgo/.test(t)), '♍ encuentra el símbolo y la palabra: ' + JSON.stringify(s));
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
