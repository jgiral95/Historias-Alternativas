// Firma de consentimientos a distancia: el profesional envía el enlace y el paciente firma desde el celular.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium, devices } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1150, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]'); await page.waitForSelector('[data-act="menu"]');
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(async sig => {
    await api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', registro: 'TP-5566', cedula: '52123456', firma: sig, consultorio: 'Consultorio Prueba' } });
    await api('/records/p_fd1', { method: 'PUT', body: { id: 'p_fd1', kind: 'patient', nombres: 'Laura', apellidos: 'Gómez', tipoDoc: 'CC', documento: '1.017.555', nacimiento: '1990-03-02', telefono: '3015551234', telInd: '+57', modalidadAt: 'Virtual', estado: 'Activo', consents: [], createdAt: new Date().toISOString() } });
  }, SIG);
  await page.reload(); await page.waitForSelector('[data-act="menu"]');
  await page.click('.prow:has-text("Laura")'); await page.click('[data-act="tab"][data-tab="consent"]'); await page.waitForSelector('#consentform');
  await page.selectOption('#f_consentTipo', 'Telepsicología (atención a distancia)'); await page.waitForTimeout(200);
  ok(await page.inputValue('#f_signerDoc') === '1.017.555', 'el documento del firmante viene de los datos del paciente');
  await page.click('[data-act="remoteConsent"]'); await page.waitForSelector('#rf_txt');
  const txt = await page.inputValue('#rf_txt'), wa = await page.getAttribute('#rf_wa', 'href');
  ok(/^Hola Laura, Psicóloga Prueba le envía el documento «Telepsicología[^»]*» para que lo lea y lo firme desde su celular: http\S+\/firmar\?t=\S+ Para abrirlo se le pedirá su número de documento/.test(txt), 'mensaje con el enlace: ' + txt.slice(0, 90));
  ok(/^https:\/\/wa\.me\/573015551234\?text=/.test(wa), 'se puede enviar por WhatsApp');
  await page.screenshot({ path: OUT + 'firma_distancia_enviar.png' });
  const url = txt.match(/http\S+\/firmar\?t=\S+/)[0];
  await page.click('#rf_close'); await page.waitForTimeout(200);
  ok(/Esperando la firma/.test(await page.locator('#tabbody').textContent()), 'la pestaña muestra el consentimiento esperando la firma');
  // el paciente, en el celular
  const mctx = await b.newContext({ ...devices['iPhone 13'] }); const m = await mctx.newPage(); m.on('pageerror', e => errors.push('firmar: ' + e.message));
  await mctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  await m.goto(url); await m.waitForSelector('#doc');
  ok(!/Laura|1017555|1\.017/.test(await m.locator('body').textContent()), 'sin el documento no muestra datos del paciente');
  await m.fill('#doc', '123'); await m.click('#f button'); await m.waitForSelector('.res.bad');
  ok(/no coincide.*4 intentos/.test(await m.locator('.res.bad').textContent()), 'un documento equivocado se rechaza');
  await m.fill('#doc', '1017555'); await m.click('#f button'); await m.waitForSelector('#txt');
  ok(/TELEPSICOLOG/i.test(await m.locator('#txt').textContent()), 'con su documento (sin puntos) lee el texto completo');
  ok(await m.locator('.sigs img[alt="Firma de Psicóloga Prueba"]').count() === 1 && /T\.P\. TP-5566/.test(await m.locator('.sigs').textContent()), 'el paciente ve la firma, la cédula y la T.P. del profesional');
  await m.screenshot({ path: OUT + 'firma_distancia_celular.png', fullPage: true });
  await m.click('#sign'); await m.waitForSelector('#err');
  ok(/casilla/.test(await m.locator('#err').textContent()), 'pide marcar la aceptación');
  await m.check('#ok');
  const bb = await m.locator('#pad canvas').boundingBox(); await m.mouse.move(bb.x + 30, bb.y + 90); await m.mouse.down(); for (let i = 0; i < 12; i++) await m.mouse.move(bb.x + 30 + i * 20, bb.y + 60 + (i % 2) * 50, { steps: 2 }); await m.mouse.up();
  await m.click('#sign'); await m.waitForSelector('.res.ok');
  ok(/Documento firmado el/.test(await m.locator('.res.ok').textContent()) && await m.locator('.sigs img').count() === 2, 'su copia trae las dos firmas: la del profesional y la suya');
  await m.screenshot({ path: OUT + 'firma_distancia_firmado.png', fullPage: true });
  await m.goto(url); await m.waitForSelector('.res');
  ok(/ya fue firmado/.test(await m.locator('.res').textContent()), 'el enlace ya no sirve para firmar otra vez');
  await mctx.close();
  // el profesional lo recibe
  await page.click('[data-act="firmasSync"]'); await page.waitForSelector('.chip:has-text("Firmado a distancia")');
  ok(!/Esperando la firma/.test(await page.locator('#tabbody').textContent()), 'el consentimiento firmado llega a la historia');
  const c = await page.evaluate(() => curPatient().consents[0]);
  ok(c.remoto && c.signerDoc === '1.017.555' && /^data:image\/png/.test(c.signerSig) && c.therapistName === 'Psicóloga Prueba' && Math.abs(new Date(c.signedAt) - Date.now()) < 120000, 'queda con la firma, el profesional y la hora del servidor');
  await page.click('[data-act="viewConsent"]'); await page.waitForTimeout(400);
  ok(/Firma a distancia\.[\s\S]*número de documento[\s\S]*SHA-256/.test(await page.locator('#modal-root').textContent()), 'el documento muestra la constancia de la firma a distancia');
  await page.screenshot({ path: OUT + 'firma_distancia_documento.png' });
  // el registro sigue siendo inmutable
  ok(await page.evaluate(async () => { const p = curPatient(), r = await api('/records/' + p.id, { method: 'PUT', body: { ...p, consents: [] } }); return r.consents.length === 1 && !!r.consents[0].remoto; }), 'aunque un guardado venga sin él, el servidor lo conserva');
  ok(await page.evaluate(async () => { try { const p = curPatient(); await api('/records/' + p.id, { method: 'PUT', body: { ...p, consents: [{ ...p.consents[0], text: 'otro' }] } }); return false; } catch (e) { return e.status === 409; } }), 'no se puede modificar');
  ok(await page.evaluate(async () => { const n = S.patients.length; await Promise.all([Store.load(), Store.load(), firmasSync()]); return S.patients.length === n && new Set(S.patients.map(p => p.id)).size === n; }), 'cargas simultáneas no duplican pacientes');
  ok(!errors.length, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
