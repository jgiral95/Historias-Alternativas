// Arrastrar para ordenar en Mis formatos (campos, apartados y pestañas propias).
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1150, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', formatos: {
    datos: [['Uno', [['xa', 'A', 1], ['xb', 'B', 1], ['xc', 'C', 1], ['xd', 'D', 1]]], ['Dos', [['xe', 'E', 1]]], ['Tres', [['xf', 'F', 1]]]],
    pestanas: { extra: [{ id: 'x_1', nombre: 'P1', modo: 'unica', secs: [] }, { id: 'x_2', nombre: 'P2', modo: 'unica', secs: [] }, { id: 'x_3', nombre: 'P3', modo: 'unica', secs: [] }] } } } }));
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  const campos = () => page.$$eval('[data-fm-l]', els => els.map(e => e.value).join(''));
  const secs = () => page.$$eval('[data-fm-t]', els => els.map(e => e.value).join(','));
  const handle = (kind, v) => page.locator(`.dragh[data-dk="${kind}"][data-dv="${v}"]`);
  await page.evaluate(() => ACT.formats({ dataset: { hub: 'datos' } })); await page.waitForSelector('.dragh');
  ok(await page.locator('[data-fm^="fup"],[data-fm^="fdn"],[data-fm^="sup"],[data-fm^="sdn"]').count() === 0, 'ya no hay flechas ↑ ↓ en los campos ni apartados');
  ok(await campos() === 'ABCDEF', 'orden inicial');
  await handle('f', '0.0').dragTo(handle('f', '0.2')); ok(await campos() === 'BCADEF', 'A pasa después de C (' + await campos() + ')');
  await handle('f', '0.3').dragTo(handle('f', '0.0')); ok(await campos() === 'DBCAEF', 'D pasa al inicio (' + await campos() + ')');
  await handle('f', '0.1').dragTo(handle('f', '0.2')); ok(await campos() === 'DCBAEF', 'B baja un lugar (' + await campos() + ')');
  await handle('s', '2').dragTo(handle('s', '0')); ok(await secs() === 'Tres,Uno,Dos', 'apartado Tres sube al inicio (' + await secs() + ')');
  await page.click('[data-fm="save"] >> nth=0'); await page.waitForTimeout(600);
  const g = await page.evaluate(() => S.profile.formatos.datos.map(s => s[0] + ':' + s[1].map(f => f[0]).join('')).join('|'));
  ok(g === 'Tres:xf|Uno:xdxcxbxa|Dos:xe', 'se guarda el orden (' + g + ')');
  await page.evaluate(() => openHub('pestanas')); await page.waitForSelector('.dragh[data-dk="t"]');
  const tabs = () => page.$$eval('[data-tm-n]', els => els.map(e => e.value).join(','));
  await handle('t', 'x_1').dragTo(handle('t', 'x_3')); ok(await tabs() === 'P2,P3,P1', 'pestaña P1 pasa al final (' + await tabs() + ')');
  await handle('t', 'x_1').dragTo(handle('t', 'x_2')); ok(await tabs() === 'P1,P2,P3' || await tabs() === 'P2,P1,P3', 'otra pestaña (' + await tabs() + ')');
  await page.evaluate(() => { S.profile.frases = [{ a: 'uno', t: '1' }, { a: 'dos', t: '2' }, { a: 'tres', t: '3' }]; S.profile.plantillas = [{ id: 'm1', nombre: 'M1', contenido: 'a' }, { id: 'm2', nombre: 'M2', contenido: 'b' }, { id: 'm3', nombre: 'M3', contenido: 'c' }]; return Store.save(S.profile); });
  await page.evaluate(() => ACT.phrases()); await page.waitForSelector('.dragh[data-dk="fra"]');
  await handle('fra', '0').dragTo(handle('fra', '2')); await page.waitForTimeout(500);
  ok((await page.evaluate(() => S.profile.frases.map(f => f.a).join(','))) === 'dos,tres,uno', 'frases: «uno» pasa al final y queda guardado');
  await page.evaluate(() => ACT.tplManage()); await page.waitForSelector('.dragh[data-dk="plt"]');
  await handle('plt', 'm3').dragTo(handle('plt', 'm1')); await page.waitForTimeout(500);
  ok((await page.evaluate(() => S.profile.plantillas.map(f => f.id).join(','))) === 'm3,m1,m2', 'plantillas: M3 pasa al inicio y queda guardado');
  ok(errors.length === 0, 'sin errores de página' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})();
