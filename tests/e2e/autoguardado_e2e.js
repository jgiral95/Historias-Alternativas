// Guardado automático de borradores mientras se escribe.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1150, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="menu"]');
  await page.waitForSelector('[data-act="menu"]');
  const n0 = await page.evaluate(async () => { const p = { id: newId('p'), kind: 'patient', nombres: 'Auto', apellidos: 'Guardado', consents: [], estado: 'Activo', createdAt: nowISO() }; await persist([p]); S.patients.push(p); ACT.open({ dataset: { id: p.id, tab: 'evol' } }); ACT.newNote(); return S.notes.length; });

  const ta = page.locator('#f_presentes').first();
  await ta.click(); await ta.type('Primera parte');
  await page.waitForTimeout(5500);
  let r = await page.evaluate(() => ({ n: S.notes.length, sig: S.notes.map(x => !!x.signedAt), dirty: S.dirty, form: !!document.querySelector('#noteform') }));
  ok(r.n === n0 + 1 && !r.sig[r.n - 1], 'se guardó un borrador sin firmar solo');
  ok(r.form && (await ta.inputValue()) === 'Primera parte', 'el formulario sigue abierto y con el texto');
  await ta.type(' y segunda'); await page.waitForTimeout(5500);
  r = await page.evaluate(() => ({ n: S.notes.length, txt: JSON.stringify(S.notes[S.notes.length - 1]) }));
  ok(r.n === n0 + 1 && r.txt.includes('segunda'), 'el segundo guardado actualiza el mismo borrador (sin duplicar)');
  ok(errors.length === 0, 'sin errores de página' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})();
