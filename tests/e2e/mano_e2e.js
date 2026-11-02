// Notas de proceso escritas a mano: lápiz con presión, solo lápiz (la palma no raya), borrador, deshacer y guardado.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPad Pro 11'] }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]'); await page.waitForSelector('[data-v="cuaderno"]');
  await page.evaluate(() => api('/records/p_hw1', { method: 'PUT', body: { id: 'p_hw1', kind: 'patient', nombres: 'Tomás', apellidos: 'Rey', documento: '77', estado: 'Activo', consents: [] } }));
  await page.reload(); await page.waitForSelector('[data-v="cuaderno"]');
  await page.click('[data-v="cuaderno"]'); await page.click('.pned [data-act="pnNew"]'); await page.waitForSelector('#pn_t');
  await page.selectOption('#pn_pac', 'p_hw1'); await page.selectOption('#pn_tipo', 'Formulación de caso clínico');
  await page.click('[data-act="hwOpen"][data-i="new"]'); await page.waitForSelector('.hwmodal canvas');
  // trazos con lápiz (presión variable) usando eventos de puntero
  const draw = async (type, pts, pressure = .6) => page.evaluate(([type, pts, pressure]) => {
    const cv = document.querySelector('.hwmodal canvas'), r = cv.getBoundingClientRect();
    const ev = (t, [x, y], i) => cv.dispatchEvent(new PointerEvent(t, { pointerId: type === 'pen' ? 2 : 3, pointerType: type, clientX: r.left + x * r.width, clientY: r.top + y * r.height, pressure: type === 'pen' ? pressure * (0.6 + (i % 5) / 10) : 0.5, bubbles: true, cancelable: true, isPrimary: true }));
    pts.forEach((p, i) => ev(i ? 'pointermove' : 'pointerdown', p, i)); ev('pointerup', pts[pts.length - 1], 0);
  }, [type, pts, pressure]);
  const line = (x0, y0, x1, y1, n = 25) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1) + Math.sin(i / 2) * .004]);
  await draw('pen', line(.1, .1, .6, .1)); await draw('pen', line(.1, .15, .5, .2)); await draw('pen', line(.1, .25, .7, .25));
  ok(await page.locator('[data-hw-pen]').isChecked(), 'al usar el lápiz se activa «solo lápiz»');
  await draw('touch', line(.2, .5, .8, .6));  // la palma
  await page.click('[data-hw-do="undo"]');
  await page.click('[data-hw-color="#1f4fd1"]'); await draw('pen', line(.1, .35, .8, .4));
  await page.click('[data-hw-tool="hl"]'); await draw('pen', line(.1, .1, .6, .1));
  await page.screenshot({ path: OUT + 'mano_tablet.png' });
  await page.click('[data-hw-do="save"]'); await page.waitForSelector('.hwmodal', { state: 'detached' });
  const st = await page.evaluate(() => { const n = S.pnotes[0]; return n && n.manos && n.manos[0].trazos.map(t => ({ c: t.c, h: !!t.h, pts: t.p.length / 3, pr: [...new Set(t.p.filter((_, i) => i % 3 === 2))].length })); });
  ok(st && st.length === 4, 'la palma no rayó y deshacer quitó un trazo: ' + JSON.stringify(st && st.map(x => x.pts)));
  ok(st && st[0].pr > 1, 'el trazo guarda la presión del lápiz');
  ok(st && st[2].c === '#1f4fd1' && st[3].h, 'cambia de color y usa el resaltador');
  ok(await page.locator('#hwthumbs img').count() === 1 && await page.evaluate(() => document.querySelector('#hwthumbs img').src.startsWith('data:image/png')), 'la hoja aparece como miniatura en la nota');
  const srv = await page.evaluate(() => api('/records').then(r => r.find(x => x.kind === 'pnote')));
  ok(srv && srv.manos.length === 1 && srv.manos[0].trazos.length === 4 && srv.patientId === 'p_hw1', 'una nota solo a mano se guarda en el servidor');
  ok(/✎ 1 a mano/.test(await page.locator('#pnlist').textContent()) && /Escrita a mano/.test(await page.locator('#pnlist').textContent()), 'la lista indica que la nota tiene escritura a mano');
  // reabrir, borrar un trazo con el borrador y guardar
  await page.click('#hwthumbs .hwthumb'); await page.waitForSelector('.hwmodal canvas');
  await page.click('[data-hw-tool="erase"]'); await draw('pen', [[.45, .375], [.46, .376]]);
  await page.click('[data-hw-do="save"]'); await page.waitForSelector('.hwmodal', { state: 'detached' });
  ok(await page.evaluate(() => S.pnotes[0].manos[0].trazos.length) === 3, 'el borrador quita el trazo que toca');
  // segunda hoja, cuadriculada; cancelar con cambios pide confirmar
  await page.click('[data-act="hwOpen"][data-i="new"]'); await page.selectOption('[data-hw-bg]', 'cuadros'); await draw('pen', line(.2, .2, .4, .4));
  await page.click('[data-hw-do="close"]'); ok(await page.locator('.hwmodal').count() === 1, 'al cancelar con cambios pide confirmar');
  await page.click('[data-hw-do="save"]'); await page.waitForSelector('.hwmodal', { state: 'detached' });
  ok(await page.evaluate(() => S.pnotes[0].manos.length === 2 && S.pnotes[0].manos[1].fondo === 'cuadros'), 'se pueden tener varias hojas, con fondo distinto');
  await page.screenshot({ path: OUT + 'mano_nota.png' });
  // toques de varios dedos (iPad): cada trazo sigue a su dedo; la palma no raya; dos dedos desplazan
  await page.click('[data-act="hwOpen"][data-i="new"]'); await page.waitForSelector('.hwmodal canvas');
  const multi = seq => page.evaluate(seq => {
    const cv = document.querySelector('.hwmodal canvas'), r = cv.getBoundingClientRect();
    seq.forEach(([t, id, type, x, y]) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: type, clientX: r.left + x * r.width, clientY: r.top + y * r.height, pressure: .5, bubbles: true, cancelable: true })));
  }, seq);
  ok(!(await page.locator('[data-hw-pen]').isChecked()), 'una hoja nueva empieza sin «solo lápiz» hasta que se use el lápiz');
  // un dedo escribe; otro dedo que toca a la vez no se une a ese trazo (antes salían líneas continuas)
  await multi([['pointerdown', 11, 'touch', .1, .1], ['pointermove', 11, 'touch', .2, .1], ['pointerdown', 12, 'touch', .8, .8], ['pointermove', 12, 'touch', .8, .7], ['pointermove', 11, 'touch', .3, .1], ['pointerup', 11, 'touch', .3, .1], ['pointerup', 12, 'touch', .8, .7]]);
  await multi([['pointerdown', 13, 'touch', .1, .2], ['pointermove', 13, 'touch', .2, .2], ['pointermove', 13, 'touch', .3, .2], ['pointerup', 13, 'touch', .3, .2]]);
  // con dos dedos a la vez se desplaza y el trazo a medias se descarta
  const st0 = await page.evaluate(() => document.querySelector('.hwscroll').scrollTop);
  await multi([['pointerdown', 21, 'touch', .5, .3], ['pointerdown', 22, 'touch', .6, .3], ['pointermove', 21, 'touch', .5, .45], ['pointermove', 22, 'touch', .6, .45], ['pointermove', 21, 'touch', .5, .6], ['pointermove', 22, 'touch', .6, .6], ['pointerup', 21, 'touch', .5, .6], ['pointerup', 22, 'touch', .6, .6]]);
  const st1 = await page.evaluate(() => document.querySelector('.hwscroll').scrollTop);
  ok(st1 < st0, 'dos dedos desplazan la hoja (' + st0 + ' → ' + st1 + ')');
  // con el lápiz: la palma apoyada no raya ni desplaza
  await draw('pen', line(.1, .5, .5, .5));
  await multi([['pointerdown', 31, 'touch', .7, .6], ['pointermove', 31, 'touch', .75, .5], ['pointermove', 31, 'touch', .8, .4], ['pointerup', 31, 'touch', .8, .4]]);
  const st2 = await page.evaluate(() => document.querySelector('.hwscroll').scrollTop);
  ok(st2 === st1, 'con «solo lápiz» la palma no desplaza la hoja');
  await page.click('[data-hw-do="save"]'); await page.waitForSelector('.hwmodal', { state: 'detached' });
  const tr = await page.evaluate(() => S.pnotes[0].manos[2].trazos.map(t => [t.p.length / 3, Math.min(...t.p.filter((_, i) => i % 3 === 0)), Math.max(...t.p.filter((_, i) => i % 3 === 0))]));
  ok(tr.length === 2 && tr[0][2] <= 301 && tr[1][1] >= 99 && tr[1][2] <= 501, 'quedan el trazo de un dedo y el del lápiz; los dedos simultáneos y la palma no dejan líneas ' + JSON.stringify(tr));
  ok(await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'), 'al cerrar la hoja la página vuelve a desplazarse');
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
