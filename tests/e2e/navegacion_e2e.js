// Botón «Atrás» del navegador: vuelve a la pantalla anterior dentro de la app, cierra ventanas y protege lo escrito.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1150, height: 900 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // una página «anterior» fuera de la app, como el buscador
  await page.goto(BASE + 'verificar.html');
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]'); await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => api('/records/p_nav1', { method: 'PUT', body: { id: 'p_nav1', kind: 'patient', nombres: 'Lucía', apellidos: 'Navarro', documento: '880011', estado: 'Activo', consents: [] } }));
  await page.reload(); await page.waitForSelector('.prow');
  const back = async () => { await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(250); };
  const where = () => page.evaluate(() => ({ url: location.pathname, view: S.view, pid: S.pid, tab: S.tab, newNote: !!S.newNote, modal: !!document.querySelector('#modal-root .modal') }));

  await page.click('.prow:has-text("Lucía")'); await page.waitForSelector('#tabbody');
  await page.click('[data-act="tab"][data-tab="evol"]'); await page.waitForTimeout(150);
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForSelector('.week');
  await back(); let w = await where();
  ok(w.url === '/app' && w.view === 'patients' && w.pid === 'p_nav1' && w.tab === 'evol', 'desde la agenda, «Atrás» vuelve a la pestaña Evolución del paciente');
  await back(); w = await where();
  ok(w.pid === 'p_nav1' && w.tab === 'datos', 'otra vez «Atrás» vuelve a la pestaña Datos');
  await back(); w = await where();
  ok(w.url === '/app' && !w.pid && w.view === 'patients', 'y luego a la lista / resumen, sin salir de la app');
  await page.goForward({ waitUntil: 'commit' }).catch(() => {}); await page.waitForTimeout(250); w = await where();
  ok(w.pid === 'p_nav1' && w.tab === 'datos', '«Adelante» también funciona');

  // un formulario abierto: «Atrás» lo cierra y se queda en el paciente
  await page.click('[data-act="tab"][data-tab="evol"]'); await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  await back(); w = await where();
  ok(w.pid === 'p_nav1' && w.tab === 'evol' && !w.newNote && await page.locator('#noteform').count() === 0, '«Atrás» con una nota vacía la cierra y se queda en Evolución');
  // con texto sin firmar pregunta antes
  await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform'); await page.fill('#noteform #f_presentes', 'Texto importante');
  await back();
  ok(await page.locator('#discardask').count() === 1 && await page.inputValue('#noteform #f_presentes') === 'Texto importante', 'con texto sin firmar pregunta antes de salir y no pierde lo escrito');
  await page.click('#dk_stay'); w = await where();
  ok(w.newNote && w.url === '/app', 'al elegir quedarse sigue en la nota');
  await back(); await page.click('#dk_go'); await page.waitForTimeout(250); w = await where();
  ok(!w.newNote && w.pid === 'p_nav1', 'al aceptar salir, vuelve a la pantalla anterior');

  // ventanas: «Atrás» las cierra
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForSelector('.week');
  await page.click('[data-act="apptEdit"] >> nth=0'); await page.waitForSelector('#apform');
  await back(); w = await where();
  ok(!w.modal && w.view === 'agenda', '«Atrás» con una ventana abierta la cierra y se queda en la agenda');
  await back(); w = await where();
  ok(w.view === 'patients' && w.pid === 'p_nav1', 'y después vuelve a la pantalla anterior');

  ok(!errors.length, 'sin errores de JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.log('ERROR', e.message); process.exit(1); });
