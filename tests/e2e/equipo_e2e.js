// Datos de identidad inamovibles, historial de cambios, fecha de apertura, identidad de género y cuentas de equipo.
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };
(async () => {
  const b = await chromium.launch(); global.BR = b; const ctx = await b.newContext({ viewport: { width: 1150, height: 950 } }); const page = require('./autofill')(await ctx.newPage());
  await ctx.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const PW = {};
  const login = async (email, pw) => { pw = PW[email] || pw; await page.goto(BASE + 'app'); await page.waitForSelector('#loginform'); await page.fill('#lg_email', email); await page.fill('#lg_pass', pw); await page.click('#loginform button[type=submit]');
    // cuentas creadas por otra persona: al primer ingreso eligen su propia contraseña (se usa la misma + «-2» y se recuerda)
    await page.waitForSelector('[data-act="menu"], #firstpw');
    if (await page.locator('#firstpw').count()) { const nw = pw + '-2'; await page.fill('#fp_cur', pw); await page.fill('#fp_new', nw); await page.fill('#fp_new2', nw); await page.click('#firstpw button[type=submit]'); PW[email] = nw; await page.waitForSelector('[data-act="menu"]'); } };
  const logout = async () => { await page.click('[data-act="menu"]'); await page.click('[data-act="logout"]'); await page.waitForSelector('#loginform'); };
  await login('psico@ejemplo.co', 'contraseña-segura-123');
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(sig => api('/records/profile', { method: 'PUT', body: { id: 'profile', kind: 'profile', nombre: 'Psicóloga Prueba', registro: 'TP-5566', cedula: '52123456', firma: sig } }), SIG); await page.reload(); await page.waitForSelector('[data-act="newPatient"]');
  // paciente nuevo
  await page.click('[data-act="newPatient"]'); await page.waitForSelector('#f_nombres');
  ok(/no se podrán cambiar/.test(await page.locator('#tabbody').textContent()), 'al crear el paciente avisa que la identidad no se podrá cambiar');
  await page.fill('#f_nombres', 'Sofía'); await page.fill('#f_apellidos', 'Martínez'); await page.fill('#f_documento', '1001001001'); await page.fill('#f_nacimiento', '1995-06-15'); await page.selectOption('#f_paisNac', 'Colombia');
  await page.fill('#f_telefono', '3001112233'); await page.selectOption('#f_identidadGenero', 'No binario');
  await page.click('[data-act="savePatient"]'); await page.waitForSelector('.file-head h2:has-text("Sofía")');
  ok(/Historia abierta el \d+ de \w+ de 20\d\d/.test(await page.locator('.file-head').textContent()), 'el encabezado dice cuándo se abrió la historia');
  for (const k of ['nombres', 'apellidos', 'tipoDoc', 'documento', 'nacimiento', 'paisNac']) ok(await page.locator('#f_' + k).isDisabled(), `«${k}» queda bloqueado`);
  ok(!(await page.locator('#f_telefono').isDisabled()) && (await page.inputValue('#f_identidadGenero')) === 'No binario', 'los demás datos se pueden editar; la identidad de género queda guardada');
  ok(await page.evaluate(async () => { try { const p = curPatient(); await api('/records/' + p.id, { method: 'PUT', body: { ...p, documento: '999' } }); return false; } catch (e) { return e.status === 409; } }), 'el servidor rechaza cambiar el documento aunque se intente por fuera de la pantalla');
  await page.fill('#f_telefono', '3009998877'); await page.selectOption('#f_municipio', '05001'); await page.click('[data-act="savePatient"]'); await page.waitForSelector('#chlog');
  await page.click('#chlog summary');
  const log = await page.locator('#chlog').textContent();
  ok(/Psicóloga Prueba[\s\S]*Profesional/.test(log) && /Teléfono:\s*3001112233 → 3009998877/.test(log) && /Ciudad:\s*(\(vacío\)|No responde) → Medellín/.test(log) && /Creó la historia/.test(log), 'el historial muestra fecha, hora, quién y qué cambió (antes → después)');
  ok(/C\.C\. 52123456 · T\.P\. TP-5566/.test(log) && await page.locator('#chlog .chsig img').count() >= 2, 'cada cambio muestra la firma, la cédula y la tarjeta profesional de quien lo hizo');
  await page.locator('#chlog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'datos_historial.png', fullPage: true });
  // Mi equipo
  await page.click('[data-act="menu"]'); await page.click('[data-act="team"]'); await page.waitForSelector('#teamform');
  await page.fill('#f_tname', 'Luis Secretario'); await page.fill('#f_temail', 'secre@ejemplo.co'); await page.fill('#f_tpass', 'clave-del-equipo-1');
  await page.click('[data-tm2="add"]'); await page.waitForSelector('#teamform .card b:has-text("Luis Secretario")');
  ok(/Activa/.test(await page.locator('#teamform').textContent()), 'el profesional crea una cuenta para su equipo');
  await page.screenshot({ path: OUT + 'mi_equipo.png' });
  await page.click('[data-tm2="close"]');
  await page.evaluate(() => api('/records/n_eq1', { method: 'PUT', body: { id: 'n_eq1', kind: 'note', patientId: curPatient().id, tema: 'Contenido clínico reservado', signedAt: new Date().toISOString(), addenda: [] } }));
  await logout();
  // la cuenta de equipo
  await login('secre@ejemplo.co', 'clave-del-equipo-1');
  ok(/Cuenta de equipo de Psicóloga Prueba/.test(await page.locator('#app').textContent()), 'la cuenta de equipo entra al resumen de su profesional');
  ok(/Registre su documento y su firma/.test(await page.locator('#app').textContent()), 'le pide registrar su documento y su firma');
  await page.click('[data-act="menu"]'); await page.click('[data-act="profile"]'); await page.waitForSelector('#tpsig canvas');
  await page.fill('#f_tpdoc', '80123456');
  const bb = await page.locator('#tpsig canvas').boundingBox(); await page.mouse.move(bb.x + 30, bb.y + 80); await page.mouse.down(); for (let i = 0; i < 10; i++) await page.mouse.move(bb.x + 30 + i * 15, bb.y + 50 + (i % 2) * 40, { steps: 2 }); await page.mouse.up();
  await page.screenshot({ path: OUT + 'mi_cuenta_equipo.png' });
  await page.click('#tpsave'); await page.waitForSelector('#profform', { state: 'detached' });
  ok(!/Registre su documento y su firma/.test(await page.locator('#app').textContent()), 'la persona del equipo registra su documento y su firma');
  ok(await page.locator('[data-act="homeTab"]').count() === 0 && await page.locator('.ntable').count() === 0, 'no ve estadísticas, encuestas ni notas de sesión');
  await page.click('[data-act="menu"]');
  const menu = await page.locator('#acmenu').textContent();
  ok(/Mi cuenta/.test(menu) && !/Mis formatos|Mi equipo|encuesta|Respaldo|perfil y firma/.test(menu), 'el menú solo tiene su cuenta');
  await page.keyboard.press('Escape');
  await page.click('.prow:has-text("Sofía")'); await page.waitForSelector('#f_telefono');
  ok(await page.locator('[data-act="tab"]').count() === 1 && await page.locator('[data-act="fullDoc"]').count() === 0, 'en la ficha solo ve la pestaña Datos');
  ok(await page.evaluate(() => !JSON.stringify([S.patients, S.notes, S.reports]).includes('reservado') && !S.notes.length), 'no recibe nada clínico');
  await page.fill('#f_localidad', 'El Poblado'); await page.click('[data-act="savePatient"]'); await page.waitForTimeout(500);
  await logout();
  // el profesional ve el cambio hecho por su equipo
  await login('psico@ejemplo.co', 'contraseña-segura-123');
  await page.click('.prow:has-text("Sofía")'); await page.waitForSelector('#chlog'); await page.click('#chlog summary');
  ok(/Luis Secretario[\s\S]*Equipo[\s\S]*Localidad \/ barrio:\s*(\(vacío\)|No responde) → El Poblado[\s\S]*C\.C\. 80123456 · Equipo \(sin tarjeta profesional\)/.test(await page.locator('#chlog').textContent()), 'el cambio del equipo queda con su nombre, documento y firma en el historial');
  ok(await page.locator('#chlog .chrow').first().locator('.chsig img').count() === 1, 'la firma de la persona del equipo se ve en su cambio');
  await page.locator('#chlog').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'historial_firmas.png' });
  ok(await page.evaluate(() => S.notes.some(n => n.tema === 'Contenido clínico reservado')), 'lo clínico del profesional sigue intacto');
  ok(errors.length === 0, 'sin errores de JavaScript ' + errors.join(' | '));
  await b.close(); console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(async e => { console.error('ERROR', e.message); try { const pg = global.BR.contexts()[0].pages()[0]; await pg.screenshot({ path: OUT + 'error_equipo.png' }); } catch (x) {} process.exit(1); });
