// Recorre la app con ancho de celular y avisa de cualquier elemento que se salga de la pantalla.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
const W = 375;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform');
  await page.waitForSelector('#loginform');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#lg_email')).fontSize === '16px' && document.activeElement.id !== 'lg_email' && document.documentElement.scrollWidth <= innerWidth), 'en el celular el ingreso abre sin acercarse (letra de 16 px y sin poner el cursor en el correo)');
  await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="newPatient"]');
  await page.evaluate(async () => {
    const now = new Date().toISOString(), put = o => api('/records/' + o.id, { method: 'PUT', body: o });
    await put({ id: 'profile', kind: 'profile', nombre: 'Juanita Lascano Molina', registro: '123456', cedula: '52123456', consultorio: 'Consultorio de psicología', firma: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
    const dx = [{ nombre: 'Trastorno de adaptación con síntomas mixtos de ansiedad y estado de ánimo deprimido', clasificacion: 'CIE-11', codigo: '6B43', version: '2026-01', fecha: now, estado: 'Activo', tipo: 'Impresión diagnóstica' },
      { nombre: 'Insomnio crónico', clasificacion: 'CIE-11', codigo: '7A00', version: '2026-01', fecha: now, estado: 'Inactivo', tipo: 'Confirmado nuevo' }];
    const auth = { tipo: DATA_TIPO, text: 'Autorizo ... encuestas de satisfacción', signedAt: now };
    const care = { tipo: 'Presencial y telepsicología', text: 'Consentimiento informado para atención psicológica.\n\n1. Objetivo. Texto largo de consentimiento con palabrasmuylargassinespaciosqueaveceslasescribenlosusuariosyrompenlosmargenes.', signedAt: now, signerType: 'Paciente', signerName: 'María Fernanda Pérez Rodríguez', signerSig: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', therapistName: 'Juanita Lascano Molina', therapistSig: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
    await put({ id: 'p_m1', kind: 'patient', nombres: 'María Fernanda', apellidos: 'Pérez Rodríguez', tipoDoc: 'CC', documento: '17312731873', sexo: 'Femenino', estado: 'Activo', servicio: 'Pareja', modalidadAt: 'Mixta (presencial y virtual)', correo: 'maria.fernanda.perez.rodriguez@correo-muy-largo.com', telefono: '3001234567', consents: [care, auth],
      intake: { signedAt: now, sessionAt: now, motivo: 'Consulta por ansiedad y dificultades para dormir desde hace seis meses.', expectativas: 'shfjkshfkjs', diagnosticos: dx, dxVersion: 'CIE-11 MMS (OMS), versión 2026-01', addenda: [], therapistName: 'Juanita Lascano Molina', therapistSig: care.therapistSig } });
    await put({ id: 'p_m2', kind: 'patient', nombres: 'Carlos', apellidos: 'Ruiz', sexo: 'Masculino', estado: 'En pausa', razonInactividad: 'Factor económico' });
    await put({ id: 'n_m1', kind: 'note', patientId: 'p_m1', sessionAt: now, signedAt: now, tema: 'Sesión de seguimiento', diagnosticos: dx, dxCambio: true, dxObs: 'Mejora el sueño.', addenda: [], therapistName: 'Juanita Lascano Molina', therapistSig: care.therapistSig });
    const s = new Date(); s.setHours(15, 0, 0, 0);
    await put({ id: 'a_m1', kind: 'appt', patientId: 'p_m1', startAt: s.toISOString(), duracion: 50, modalidad: 'Virtual', estado: 'Programada' });
  });
  await page.reload(); await page.waitForSelector('[data-act="newPatient"]');
  // qué se sale de la pantalla
  const overflow = () => page.evaluate(w => {
    const out = [], doc = document.documentElement;
    if (doc.scrollWidth > w + 1) out.push('página: ancho ' + doc.scrollWidth);
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.position === 'fixed') return;
      let p = el.parentElement, clipped = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } p = p.parentElement; }
      if (!clipped && (r.right > w + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} [${Math.round(r.left)}–${Math.round(r.right)}] ${(el.textContent || el.value || '').trim().slice(0, 40)}`);
    });
    return out.filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);
  }, W);
  const check = async (name, shot) => { await page.waitForTimeout(250); const o = await overflow(); ok(!o.length, name + (o.length ? ' → ' + o.join(' | ') : '')); if (shot || o.length) await page.screenshot({ path: OUT + 'movil_' + name.replace(/\W+/g, '_') + '.png', fullPage: true }); };
  await check('lista de pacientes', true);
  await page.click('.prow.home'); await page.waitForSelector('[data-act="homeTab"]');
  ok(await page.locator('[data-act="homeTab"][data-t="stats"]').isVisible() && await page.locator('.file-wrap .back').isVisible(), 'en el celular «Resumen» abre el resumen, con botón para volver');
  await check('resumen', true);
  for (const t of ['stats', 'enc']) { await page.click(`[data-act="homeTab"][data-t="${t}"]`); await check('resumen ' + t); }
  await page.click('[data-act="homeTab"][data-t="resumen"]'); await page.click('.file-wrap .back');
  await page.click('[data-act="open"][data-id="p_m1"]'); await page.waitForSelector('.file-head');
  for (const t of ['datos', 'consent', 'intake', 'evol', 'escalas', 'informes', 'cierre', 'archivo']) { await page.click(`[data-act="tab"][data-tab="${t}"]`); await check('paciente ' + t, t === 'datos' || t === 'intake'); }
  await page.click('[data-act="tab"][data-tab="evol"]'); await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform'); await check('nueva evolución');
  await page.click('[data-act="cancelNote"]');
  await page.click('[data-act="tab"][data-tab="intake"]'); await page.click('[data-act="viewIntake"]'); await page.waitForSelector('#paper'); await check('documento primera vez', true); await page.click('#cl');
  await page.click('[data-act="tab"][data-tab="consent"]'); await page.click('[data-act="reConsent"]').catch(() => {}); await check('nuevo consentimiento');
  await page.click('[data-act="tab"][data-tab="informes"]'); await page.click('[data-act="newReport"]').catch(() => {}); await check('nuevo informe');
  await page.click('[data-act="tab"][data-tab="datos"]');
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForTimeout(300);
  for (const v of ['dia', 'semana', 'mes']) { const bt = page.locator(`[data-act="agView"][data-v="${v}"]`); if (await bt.count()) await bt.click(); await check('agenda ' + v); }
  await page.click('[data-act="view"][data-v="patients"]');
  const modal = async (act, name, sel) => { await page.click('[data-act="menu"]'); await page.click(`[data-act="${act}"]`); await page.waitForSelector(sel); await check(name); };
  await modal('profile', 'perfil', '#profform'); await page.click('#pcl');
  await modal('formats', 'mis formatos', '#fmform');
  for (const h of ['consent', 'intake', 'evol', 'escalas', 'informes', 'frases']) { await page.click(`[data-hub="${h}"]`); await page.waitForTimeout(200); await check('mis formatos ' + h); }
  await page.keyboard.press('Escape'); await page.evaluate(() => { $('#modal-root').innerHTML = ''; });
  await modal('survey', 'encuesta config', '#svform'); await page.evaluate(() => { $('#modal-root').innerHTML = ''; });
  ok(errors.length === 0, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
