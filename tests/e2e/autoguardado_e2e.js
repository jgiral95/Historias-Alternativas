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
  // Cierre: lo escrito se guarda solo en la ficha y se recupera al volver a abrir
  await page.evaluate(() => { ACT.open({ dataset: { id: S.patients[S.patients.length - 1].id, tab: 'cierre' } }); });
  await page.waitForSelector('#cierreform [data-f="resumen"]');
  await page.locator('#cierreform [data-f="resumen"]').type('Resumen del cierre'); await page.waitForTimeout(5500);
  ok(await page.evaluate(() => { const p = S.patients[S.patients.length - 1]; return !!(p.borradores && p.borradores.cierreform && p.borradores.cierreform.v.resumen === 'Resumen del cierre') && !(p.cierres || []).length; }), 'el cierre se guarda como borrador en la ficha (sin cerrar el proceso)');
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => { ACT.open({ dataset: { id: S.patients[S.patients.length - 1].id, tab: 'cierre' } }); });
  await page.waitForSelector('#cierreform [data-f="resumen"]');
  ok((await page.locator('#cierreform [data-f="resumen"]').inputValue()) === 'Resumen del cierre', 'al volver a abrir, el cierre recupera el borrador');
  await page.locator('#cierreform [data-f="logros"]').fill('Logros'); await page.click('#cierreform [data-act="saveBorrador"]'); await page.waitForTimeout(800);
  ok(await page.locator('#autosaved').isVisible() && await page.evaluate(() => S.patients[S.patients.length - 1].borradores.cierreform.v.logros === 'Logros'), 'botón «Guardar borrador» del cierre guarda y muestra el aviso');
  // Pestañas propias (Mis formatos): botón «Guardar borrador», guardado solo y marca «Borrador»
  await page.evaluate(async () => { const pf = clone(S.profile); pf.formatos = Object.assign({}, pf.formatos, { pestanas: { extra: [{ id: 'x_s', nombre: 'Sesiones propias', modo: 'sesion', secs: [] }, { id: 'x_u', nombre: 'Datos propios', modo: 'unica', secs: [] }] } }); S.profile = pf; await persist([pf]); ACT.open({ dataset: { id: S.patients[S.patients.length - 1].id, tab: 'x_s' } }); ACT.extraNew(); });
  await page.waitForSelector('#f_extra'); await page.fill('#f_extra', 'texto uno'); await page.click('[data-act="extraSave"][data-draft="1"]'); await page.waitForTimeout(700);
  const ent = () => page.evaluate(() => { const l = S.patients[S.patients.length - 1].extras.x_s; return l.length + ':' + !!l[0].borrador; });
  ok(await ent() === '1:true', 'pestaña por sesión: «Guardar borrador» crea la entrada marcada como borrador (' + await ent() + ')');
  await page.fill('#f_extra', 'texto dos'); await page.waitForTimeout(5500);
  ok(await ent() === '1:true', 'se actualiza sola, sin duplicar (' + await ent() + ')');
  await page.click('[data-act="extraSave"]:not([data-draft])'); await page.waitForTimeout(700);
  ok(await ent() === '1:false', 'al guardar la entrada deja de ser borrador (' + await ent() + ')');
  await page.evaluate(() => { S.tab = 'x_u'; S.extraEd = null; render(); }); await page.waitForSelector('#f_extra'); await page.fill('#f_extra', 'dato'); await page.waitForTimeout(5500);
  ok(await page.evaluate(() => { const v = S.patients[S.patients.length - 1].extras.x_u; return !!v && v.borrador === true && v.extra === 'dato'; }), 'pestaña de una sola vez: se guarda sola como borrador');
  // Datos del consultante: se guarda solo y tiene botón «Guardar borrador»
  await page.evaluate(async () => { const pf = clone(S.profile); pf.formatos = Object.assign({}, pf.formatos, { datos: [['General', [['xciudad', 'Ciudad', 1]]]] }); S.profile = pf; await persist([pf]); S.tab = 'datos'; S.extraEd = null; ACT.open({ dataset: { id: S.patients[S.patients.length - 1].id, tab: 'datos' } }); });
  await page.waitForSelector('#f_xciudad'); await page.fill('#f_xciudad', 'Bogotá'); await page.waitForTimeout(5500);
  ok(await page.evaluate(() => S.patients[S.patients.length - 1].xciudad === 'Bogotá'), 'Datos: se guarda solo');
  ok(await page.locator('[data-act="savePatient"][data-draft="1"]').count() === 1, 'Datos: botón «Guardar borrador»');
  await page.fill('#f_xciudad', 'Cali'); await page.click('[data-act="savePatient"][data-draft="1"]'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => S.patients[S.patients.length - 1].xciudad === 'Cali') && await page.locator('#autosaved').isVisible(), 'Datos: «Guardar borrador» guarda y avisa');
  const np = await page.evaluate(() => S.patients.length);
  await page.evaluate(() => ACT.newPatient()); await page.waitForSelector('#f_xciudad'); await page.fill('#f_xciudad', 'Pasto'); await page.waitForTimeout(5500);
  ok(await page.evaluate(n => S.patients.length === n + 1 && S.patients[n].xciudad === 'Pasto', np), 'consultante nuevo sin nombre: se guarda solo como borrador');
  // Campo numérico: sin flechas (type text) y solo acepta números
  await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', F('Num', 'zz_num', '', { type: 'number' })); });
  const nu = page.locator('#f_zz_num'); await nu.type('a1b2,5-x'); 
  ok((await nu.getAttribute('type')) === 'text' && (await nu.inputValue()) === '12,5', 'campo numérico sin flechas y solo acepta números (' + await nu.inputValue() + ')');
  ok(errors.length === 0, 'sin errores de página' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})();
