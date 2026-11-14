// Pestaña «Recordatorio» del popup de la cita: días de anticipación y frecuencia se guardan en la cita (a.rec).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const page = await ctx.newPage();
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform .btn.pri');
  await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(() => { S.patients.push({ id: 'p_rc', kind: 'patient', nombres: 'Rita', apellidos: 'Recuerda', documento: '555', correo: 'r@x.co', estado: 'Activo', consents: [] }); S.appts.push({ id: 'a_rc', kind: 'appt', patientId: 'p_rc', startAt: new Date(Date.now() + 864e5 * 9).toISOString(), duracion: 50, modalidad: 'Virtual', estado: 'Programada' }); ACT.apptEdit({ dataset: { id: 'a_rc' } }); });
  await page.waitForSelector('#aptabs');
  await page.click('[data-aptab="2"]');
  ok(await page.locator('#ap_p2').isVisible() && !(await page.locator('#ap_p1').isVisible()), 'la pestaña Recordatorio se abre y oculta la de la cita');
  ok(!(await page.locator('#rc_n').isVisible()), 'los cuadros no se ven hasta marcar la casilla');
  await page.check('#f_recActivo'); ok(await page.locator('#rc_n').isVisible(), 'al marcar la casilla aparecen los cuadros');
  await page.fill('#rc_n', '3'); await page.dispatchEvent('#rc_n', 'input');
  ok(await page.locator('.recrow').count() === 3, 'el número de recordatorios define cuántos espacios hay');
  await page.click('[data-ap="save"]'); await page.waitForTimeout(300);
  ok(await page.locator('#ap_p2').isVisible() && await page.locator('[data-rn="0"].bad').count() === 1 && !(await page.evaluate(() => (S.appts.find(x => x.id === 'a_rc') || {}).rec)), 'con un espacio vacío marca el campo y no guarda');
  await page.fill('[data-rn="0"]', '2'); await page.selectOption('[data-ru="0"]', 'semanas'); await page.fill('[data-rn="1"]', '1x'); await page.selectOption('[data-ru="1"]', 'días'); await page.fill('[data-rn="2"]', '3'); await page.selectOption('[data-ru="2"]', 'horas');
  ok(await page.inputValue('[data-rn="1"]') === '1', 'solo admite números');
  await page.evaluate(() => { Store.save = async x => x; });
  await page.click('[data-ap="save"]'); await page.waitForTimeout(500);
  const rec = await page.evaluate(() => S.appts.find(x => x.id === 'a_rc').rec);
  ok(rec && rec.activo && JSON.stringify(rec.items) === JSON.stringify([{ n: 2, u: 'semanas' }, { n: 1, u: 'días' }, { n: 3, u: 'horas' }]), 'guarda días y frecuencia en la cita: ' + JSON.stringify(rec));
  ok(errors.length === 0, 'sin errores de JavaScript' + (errors.length ? ': ' + errors[0] : ''));
  await b.close(); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
