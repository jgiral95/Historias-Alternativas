// Recordatorios de citas: configuración, envío manual por WhatsApp desde Pendientes y respuesta del paciente en /cita.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1150, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]'); await page.waitForSelector('[data-act="menu"]');
  await page.evaluate(async () => {
    const prof = (await api('/records')).find(o => o.kind === 'profile') || { id: 'profile', kind: 'profile' };
    await api('/records/profile', { method: 'PUT', body: { ...prof, id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba' } });
    await api('/records/p_rem1', { method: 'PUT', body: { id: 'p_rem1', kind: 'patient', nombres: 'Ana María', apellidos: 'Ríos', tipoDoc: 'CC', documento: '777001', telefono: '3001234567', telInd: '+57', estado: 'Activo', consents: [{ tipo: 'Presencial y telepsicología', text: 'Consiento la atención.', signedAt: new Date().toISOString() }], createdAt: new Date().toISOString() } });
    const t = h => new Date(Date.now() + h * 3600e3).toISOString();
    await api('/records/a_rem1', { method: 'PUT', body: { id: 'a_rem1', kind: 'appt', patientId: 'p_rem1', startAt: t(5), duracion: 50, modalidad: 'Virtual', estado: 'Programada' } });
    await api('/records/a_rem2', { method: 'PUT', body: { id: 'a_rem2', kind: 'appt', patientId: 'p_rem1', startAt: t(8), duracion: 50, modalidad: 'Presencial', estado: 'Programada' } });
  });
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  ok(!/Recordatorio por enviar/.test(await page.locator('#app').textContent()), 'sin recordatorios activos no aparece nada en Pendientes');
  // configuración desde la agenda
  await page.click('[data-act="view"][data-v="agenda"]'); await page.click('[data-act="remConfig"]'); await page.waitForSelector('#remform');
  ok(/aún no tiene su correo de envío/.test(await page.locator('#remform').textContent()), 'avisa que sin correo de envío se envían a mano');
  await page.check('#rc_on'); await page.selectOption('#rc_h', '24'); await page.fill('#rc_nota', 'Por favor conéctese 5 minutos antes.');
  await page.screenshot({ path: OUT + 'recordatorios_config.png' });
  await page.click('#rc_save'); await page.waitForSelector('#remform', { state: 'detached' });
  ok(await page.evaluate(() => S.profile.recordatorios.activo && S.profile.recordatorios.horas === 24), 'la configuración queda guardada en el perfil');
  // pendientes
  await page.click('[data-act="view"][data-v="patients"]'); await page.waitForTimeout(300);
  const home = await page.locator('#app').textContent();
  ok((home.match(/Recordatorio por enviar/g) || []).length === 2, 'Pendientes muestra las dos citas por recordar');
  await page.locator('[data-act="remSend"][data-id="a_rem1"]').click(); await page.waitForSelector('#rm_txt');
  const txt = await page.inputValue('#rm_txt'), wa = await page.getAttribute('#rm_wa', 'href');
  ok(/^Hola Ana, le recordamos su cita con Psicóloga Prueba el \S+ \d+ de \S+ a las .+\(virtual\)\. Por favor conéctese 5 minutos antes\. Por favor confirme .*\/cita\?t=\S+$/.test(txt), 'el mensaje tiene fecha, modalidad, nota y enlace: ' + txt);
  ok(/^https:\/\/wa\.me\/573001234567\?text=/.test(wa), 'el botón abre WhatsApp con el número e indicativo del paciente');
  await page.screenshot({ path: OUT + 'recordatorio_whatsapp.png' });
  const url1 = txt.match(/http\S+\/cita\?t=\S+/)[0];
  await page.click('#rm_sent'); await page.waitForSelector('#rm_txt', { state: 'detached' });
  ok((((await page.locator('#app').textContent()).match(/Recordatorio por enviar/g)) || []).length === 1, 'al marcarlo enviado sale de Pendientes');
  // enlace de la segunda cita
  await page.locator('[data-act="remSend"][data-id="a_rem2"]').click(); await page.waitForSelector('#rm_txt');
  const url2 = (await page.inputValue('#rm_txt')).match(/http\S+\/cita\?t=\S+/)[0]; await page.click('#rm_close');
  // el paciente responde
  const pp = await ctx.newPage(); pp.on('pageerror', e => errors.push('cita: ' + e.message));
  await pp.goto(url1); await pp.waitForSelector('button:has-text("Confirmo")');
  ok(/Psicóloga Prueba/.test(await pp.locator('body').textContent()), 'la página del paciente muestra la cita sin datos clínicos');
  await pp.screenshot({ path: OUT + 'cita_publica.png' });
  await pp.click('button:has-text("Confirmo")'); await pp.waitForTimeout(500);
  ok(/confirm/i.test(await pp.locator('body').textContent()), 'el paciente confirma');
  await pp.goto(url2); await pp.waitForSelector('button:has-text("No puedo")');
  await pp.click('button:has-text("No puedo")'); await pp.waitForTimeout(200);
  const conf = pp.locator('button:has-text("Sí, cancelar")'); if (await conf.count()) await conf.click(); await pp.waitForTimeout(500);
  ok(/cancel/i.test(await pp.locator('body').textContent()), 'el paciente cancela (con doble confirmación)');
  await pp.close();
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  const st = await page.evaluate(() => S.appts.filter(a => a.id.startsWith('a_rem')).map(a => [a.id, a.estado, a.confirmacion && a.confirmacion.estado]));
  ok(JSON.stringify(st.sort()) === JSON.stringify([['a_rem1', 'Programada', 'Confirmada'], ['a_rem2', 'Cancelada', 'Cancelada por el paciente']]), 'la respuesta llega a la cita: ' + JSON.stringify(st));
  ok(!/Recordatorio por enviar/.test(await page.locator('#app').textContent()), 'las citas respondidas no quedan en Pendientes');
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForTimeout(300);
  ok(/confirmó/.test(await page.locator('#app').textContent()), 'la agenda muestra que el paciente confirmó');
  await page.locator('[data-act="apptEdit"][data-id="a_rem1"]').first().click(); await page.waitForSelector('[data-ap="rem"]');
  ok(/Confirmada.*por el paciente[\s\S]*Recordatorio enviado por WhatsApp/.test(await page.locator('.modal').textContent()), 'la cita muestra la confirmación y el recordatorio enviado');
  await page.screenshot({ path: OUT + 'cita_confirmada.png' });
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
