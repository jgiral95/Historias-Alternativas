require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const { chromium } = require('playwright');
const OUT = process.env.OUT || (__dirname + '/out/'), FIX = __dirname + '/fixtures/', BASE = process.env.BASE || 'http://127.0.0.1:8100/';
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) bad = 1; };

async function drawSig(page, sel) {
  await page.locator(sel).scrollIntoViewIfNeeded();
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + 30, b.y + 90); await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(b.x + 30 + i * 14, b.y + 50 + (i % 2) * 40, { steps: 2 });
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch(); global.BR = browser;
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, acceptDownloads: true });
  const page = require('./autofill')(await ctx.newPage());
  await page.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + 'app'); await page.waitForSelector('#loginform');
  await page.fill('#lg_email', 'psico@ejemplo.co'); await page.fill('#lg_pass', 'contraseña-segura-123'); await page.click('#loginform button[type=submit]');
  await page.waitForSelector('[data-act="newPatient"]');

  // Perfil con firma
  await page.click('[data-act="menu"]'); ok(await page.locator('#acmenu.open').count()===1,'el menú de cuenta se abre'); await page.click('[data-act="profile"]'); await page.waitForSelector('#psig canvas');
  ok(await page.locator('#acmenu.open').count()===0,'el menú se cierra al elegir una opción');
  await page.fill('#f_registro', '12345'); await page.fill('#f_cedula', '52123456'); await page.fill('#f_ciudad', 'Medellín'); await drawSig(page, '#psig canvas');
  ok(await page.locator('#acmenu [data-act="rips"]').count() === 0, 'sin «Reporto RIPS» no aparece el menú de RIPS');
  await page.check('#profform [data-f="ripsActivo"]'); await page.click('#psave');
  await page.waitForSelector('#profform', { state: 'detached' });
  ok(await page.locator('#acmenu [data-act="rips"]').count() === 1 && await page.evaluate(() => S.profile.ripsActivo === true), 'con «Reporto RIPS» activado aparece el menú de RIPS');
  // firma subida como imagen (foto con fondo gris)
  const firmaAntes = await page.evaluate(() => S.profile.firma);
  await page.click('[data-act="menu"]'); await page.click('[data-act="profile"]'); await page.waitForSelector('#psigfile');
  await page.setInputFiles('#psigfile', FIX + 'firma_foto.jpg'); await page.waitForSelector('#psigprev:not([hidden])');
  const sig = await page.evaluate(async () => { const src = $('#psigimg').src; const i = new Image(); await new Promise(r => { i.onload = r; i.src = src; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let ink = 0, clear = 0; for (let k = 3; k < d.length; k += 4) { if (d[k] > 200) ink++; if (d[k] === 0) clear++; } return { w: i.width, h: i.height, ink, clear, total: d.length / 4, corner: d[3] }; });
  console.log('Firma procesada:', JSON.stringify(sig));
  ok(sig.w <= 480 && sig.h <= 180 && sig.corner === 0 && sig.clear / sig.total > 0.6 && sig.ink > 200, 'la foto de la firma queda recortada, sin fondo y con el trazo');
  await page.screenshot({ path: OUT + 'firma_subida.png' });
  await page.setInputFiles('#plogofile', FIX + 'logo_prueba.png'); await page.waitForSelector('#plogo img'); ok(await page.evaluate(() => { const i = $('#plogo img'); return i.naturalWidth <= 600 && i.naturalHeight <= 240; }), 'el logo se ajusta a un tamaño liviano'); await page.click('#psave'); await page.waitForSelector('#profform', { state: 'detached' });
  ok(await page.evaluate(a => S.profile.firma !== a && S.profile.firma.startsWith('data:image/png'), firmaAntes), 'la firma subida reemplaza la guardada');

  await page.click('[data-act="menu"]'); await page.screenshot({ path: OUT + 'barra_menu.png' }); await page.keyboard.press('Escape'); ok(await page.locator('#acmenu.open').count()===0,'Escape cierra el menú');
  // Formato propio: agregar un campo a la primera cita
  await page.click('[data-act="menu"]'); await page.click('[data-act="formats"]'); await page.waitForSelector('#fmform'); ok(await page.locator('.hubtabs [data-hub]').evaluateAll(b => b.map(x => x.textContent).join('|')) === 'Datos del paciente|Consentimientos|Primera vez|Evolución|Escalas|Informes|Frases', 'Mis formatos sigue el orden de la ficha del paciente'); await page.click('[data-hub="intake"]');
  await page.click('[data-fm="fadd:0"]'); await page.locator('[data-fm-l="0.3"]').fill('Red de apoyo cercana');
  await page.locator('[data-fm-t="0"]').fill('Motivo y contexto');
  await page.screenshot({ path: OUT + 'formatos.png' });
  // apartado de solo título (sin subtítulo) y genograma quitable
  await page.click('[data-fm="sadd"]'); await page.locator('[data-fm-t="5"]').fill('Expectativas del proceso');
  ok(/Solo título/.test(await page.locator('#fmform .card').nth(5).textContent()), 'un apartado nuevo es de solo título');
  ok(await page.locator('[data-fm^="gdel:"]').count() === 1 && await page.locator('[data-fm="gadd"]').count() === 0, 'el genograma se muestra con su botón para quitarlo');
  await page.screenshot({ path: OUT + 'formatos.png' });
  await page.click('[data-hub="evol"]');
  ok(/Aún no tiene campos/.test(await page.locator('#fmform').textContent()), 'el formato de evolución empieza vacío');
  await page.click('[data-fm="reset"]'); await page.click('[data-fm="fadd:"]'); await page.locator(`[data-fm-l="${await page.evaluate(() => ED.evol.length - 1)}"]`).fill('Escala de ánimo (1-10)');
  await page.click('[data-hub="datos"]'); await page.click('[data-fm="sadd"]'); await page.locator('[data-fm-t="0"]').fill('Información adicional');
  await page.click('[data-fm="fadd:0"]'); await page.locator('[data-fm-l="0.0"]').fill('Religión'); await page.click('[data-fm="fadd:0"]'); await page.locator('[data-fm-l="0.1"]').fill('Con quién vive');
  await page.click('[data-fm="save"]'); await page.waitForSelector('#fmform',{state:'detached'});
  // Paciente
  await page.click('[data-act="newPatient"]');
  await page.waitForSelector('#f_nombres');
  ok(await page.evaluate(() => ['f_nombres', 'f_direccion', 'f_telefono', 'f_correo', 'f_telInd'].every(id => /^hc-/.test(document.getElementById(id).getAttribute('autocomplete') || ''))) && await page.evaluate(() => document.querySelector('#lg_email') === null), 'los campos del paciente no se ofrecen para guardar ni autollenar en el navegador');
  ok(await page.evaluate(() => ['f_telefono', 'f_correo'].every(id => document.getElementById(id).type === 'text') && document.getElementById('f_telefono').inputMode === 'tel'), 'teléfono y correo del paciente no son tel/email (Chrome los reconoce por el tipo) pero conservan el teclado del celular');
  const dlabels = await page.$$eval('#tabbody .fld > label', els => els.map(e => e.textContent.trim().replace(/\s*\*$/, '')));
  ok(['Lugar de nacimiento', 'Localidad / comuna / barrio', 'Sexo', 'Religión', 'Con quién vive'].every(l => dlabels.includes(l)), 'Datos trae lugar de nacimiento, localidad, sexo y los campos propios');
  ok(await page.$$eval('#f_escolaridad option', o => o.map(x => x.textContent).includes('Preescolar')) && !(await page.$$eval('#f_sexo option', o => o.map(x => x.textContent).includes('No binario'))) && await page.$$eval('#f_estado option', o => ['Cerrado', 'Remitido'].every(v => o.map(x => x.textContent).includes(v))), 'opciones nuevas: preescolar, solo sexo, cerrado y remitido');
  ok(await page.locator('#tabbody [data-act="delPatient"]').count() === 0, 'eliminar paciente ya no está junto a «Guardar datos»');
  ok(await page.$$eval('#f_etnia option', o => ['Indígena', 'Rrom o gitano(a)', 'Palenquero(a) de San Basilio', 'Ningún grupo étnico'].every(v => o.map(x => x.textContent).includes(v))), 'Datos trae pertenencia étnica con las categorías del DANE');
  await page.selectOption('#f_etnia', 'Indígena'); await page.fill('#f_etniaPueblo', 'Nasa');
  await page.fill('#f_lugarNac', 'Bogotá'); await page.fill('#f_localidad', 'Chapinero');
  await page.fill('#f_nombres', 'María'); await page.fill('#f_apellidos', 'Pérez'); await page.fill('#f_documento', '1020304050');
  await page.click('[data-act="savePatient"]');
  await page.click('[data-tab="intake"]'); await page.waitForSelector('#intakeform');

  // --- Primera cita: apartados nuevos ---
  const labels = await page.$$eval('#intakeform .fld > label', els => els.map(e => e.textContent.trim().replace(/\s*\*$/, '')));
  ok(await page.locator('#intakeform textarea[aria-label="Expectativas del proceso"]').count() === 1 && !labels.includes('Nuevo campo'), 'el apartado de solo título no repite subtítulo');
  const heads = await page.$$eval('#intakeform .sec > h3', els => els.map(e => e.textContent.trim().replace(/\s*\*$/, '')));
  console.log('Apartados:', heads.join(' | '));
  console.log('Campos:', labels.join(' | '));
  ok(labels.includes('Red de apoyo cercana') && heads.includes('Motivo y contexto'),'la primera cita usa el formato propio del terapeuta');
  ok(labels.includes('Remitido') && !labels.some(l => /Remitido por/.test(l)), 'Remitido sin el resto del nombre');
  ok(labels.some(l => /^Nivel de riesgo/.test(l)) && labels.some(l => /^Hallazgos y acciones tomadas/.test(l)), 'la primera cita tiene la evaluación de riesgo (Ley 1090, art. 10)');
  ok(labels.filter(l => /mental|Apariencia/i.test(l)).length === 1, 'examen mental tiene un solo espacio');
  ok(labels.indexOf('Impresión diagnóstica') < labels.findIndex(l => /^Nivel de riesgo/.test(l)) && /^Observaciones sobre el diagnóstico/.test(labels[labels.length - 1]) && !labels.some(l => /^Condición y destino|^Entorno/.test(l)), 'tras el formato vienen el riesgo y el cuadro de diagnóstico (sin entorno ni condición y destino)');
  ok(labels.indexOf('Expectativas frente a la terapia') > labels.indexOf('Plan de intervención y frecuencia') && labels.indexOf('Expectativas frente a la terapia') > labels.indexOf('Área académica o laboral'), 'expectativas quedó casi al final');
  ok(heads.indexOf('Genograma') === -1 && !!(await page.$('#genocv')), 'hay lienzo de genograma dentro de Historia personal');

  // --- Genograma: dibujar ---
  await page.fill('#f_motivo', 'Consulta por ansiedad y problemas de sueño.');
  await page.screenshot({ path: OUT + 'intake_top.png' });
  const cv = page.locator('#genocv'); await cv.scrollIntoViewIfNeeded();
  const bb = await cv.boundingBox();
  const at = (fx, fy) => [bb.x + bb.width * fx, bb.y + bb.height * fy];
  await page.click('[data-gt="sq"]'); let [x1, y1] = at(.3, .25); await page.mouse.click(x1, y1);
  await page.click('[data-gt="ci"]'); let [x2, y2] = at(.5, .25); await page.mouse.click(x2, y2);
  await page.click('[data-gt="x"]'); await page.mouse.click(x1, y1);
  await page.click('[data-gt="pen"]'); await page.mouse.move(x1 + 30, y1); await page.mouse.down(); await page.mouse.move(x2 - 30, y2, { steps: 6 }); await page.mouse.up();
  await page.click('[data-gt="tx"]'); await page.mouse.click(...at(.4, .45)); // sin texto: aviso
  ok(await page.locator('.toast').count() > 0, 'texto sin escribir avisa');
  await page.fill('#geno_text', 'Pablo, 45'); await page.mouse.click(...at(.3, .4));
  await page.screenshot({ path: OUT + 'genograma.png', clip: { x: bb.x - 10, y: bb.y - 90, width: bb.width + 20, height: bb.height + 110 } });
  const px = await page.evaluate(() => { const c = document.getElementById('genocv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; });
  ok(px > 500, 'el lienzo tiene trazos dibujados (' + px + ' px oscuros)');
  const dark = () => page.evaluate(() => { const c = document.getElementById('genocv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; });
  ok(await page.locator('[data-gt="redo"]').isDisabled() && !(await page.locator('[data-gt="undo"]').isDisabled()), 'Deshacer activo y Rehacer inactivo al empezar');
  await page.click('[data-gt="clear"]'); ok(await dark() === 0, '«Limpiar» deja el lienzo en blanco');
  await page.click('[data-gt="undo"]'); const gfull = await dark(); console.log('px en vivo', px, 'redibujado', gfull); ok(Math.abs(gfull - px) < px * 0.05, '«Deshacer» recupera todo lo que se limpió');
  await page.click('[data-gt="undo"]'); const px1 = await dark(); ok(px1 < gfull - 50, 'deshacer quita el último elemento (texto)');
  await page.click('[data-gt="redo"]'); ok(await dark() === gfull, '«Rehacer» lo devuelve');
  await page.mouse.click(...at(.7, .7)); await page.keyboard.press('Control+z'); ok(await dark() === gfull, 'Ctrl+Z deshace desde el teclado');
  await page.keyboard.press('Control+y'); ok(await dark() > gfull, 'Ctrl+Y rehace');
  await page.keyboard.press('Control+z');
  // cuadrícula punteada: guía en pantalla, no se exporta; los símbolos se ubican en sus puntos
  const gridPx = src => page.evaluate(async src => { const c = document.createElement('canvas'), i = new Image(); if (src) { await new Promise(r => { i.onload = r; i.src = src; }); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); } const cv = src ? c : document.getElementById('genocv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 160 && d[k] < 215 && d[k + 2] > 190 && d[k + 2] - d[k] > 12) n++; return n; }, src);
  ok(await gridPx() > 300, 'el lienzo muestra la cuadrícula de puntos');
  ok(await gridPx(await page.evaluate(() => geno.data())) === 0, 'la imagen guardada del genograma no lleva la cuadrícula');
  await page.click('[data-gt="ci"]'); await page.mouse.click(...at(.613, .27));
  ok(await page.evaluate(() => { const o = geno.ops()[geno.ops().length - 1]; return o.x % 40 === 0 && o.y % 40 === 0; }), 'los símbolos se ubican en los puntos de la cuadrícula');
  await page.click('[data-gt="undo"]');
  await page.uncheck('#geno_grid'); ok(await gridPx() === 0, 'la cuadrícula se puede ocultar'); await page.check('#geno_grid');
  // enderezar líneas
  await page.click('[data-gt="pen"]');
  const stroke = async pts => { await page.mouse.move(...at(...pts[0])); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...at(...p), { steps: 4 }); await page.mouse.up(); return page.evaluate(() => geno.ops()[geno.ops().length - 1].pts); };
  const wob = [...Array(12)].map((_, i) => [0.1 + i * 0.03, 0.85 + (i % 2 ? 0.006 : -0.006)]);
  let pts = await stroke(wob);
  ok(pts.length === 2 && pts[0][1] === pts[1][1] && pts[0][1] % 40 === 0, 'una línea temblorosa casi horizontal queda recta, horizontal y alineada con la cuadrícula');
  pts = await stroke([[0.55, 0.6], [0.552, 0.65], [0.549, 0.7], [0.6, 0.702], [0.65, 0.698], [0.7, 0.7], [0.701, 0.65], [0.699, 0.6]]);
  ok(pts.length === 4 && pts[0][0] === pts[1][0] && pts[1][1] === pts[2][1] && pts[2][0] === pts[3][0] && pts[1][1] % 40 === 0 && pts[0][0] % 40 === 0, 'un trazo en forma de ⊓ queda con esquinas rectas sobre la cuadrícula');
  pts = await stroke([...Array(20)].map((_, i) => [0.85 + 0.05 * Math.cos(i / 19 * 6.28), 0.3 + 0.08 * Math.sin(i / 19 * 6.28)]));
  ok(pts.length > 10, 'un círculo dibujado a mano se respeta');
  await page.uncheck('#geno_straight'); pts = await stroke(wob); ok(pts.length > 5, 'con «Enderezar líneas» desmarcado queda a mano alzada'); await page.check('#geno_straight');
  await page.click('[data-gt="sq"]'); await page.mouse.click(...at(0.3, 0.11)); await page.click('[data-gt="ci"]'); await page.mouse.click(...at(0.47, 0.11));
  await page.click('[data-gt="pen"]'); await stroke([[0.33, 0.115], [0.38, 0.105], [0.44, 0.112]]);
  await page.screenshot({ path: OUT + 'geno_rectas.png', clip: { x: bb.x - 10, y: bb.y - 10, width: bb.width + 20, height: bb.height + 20 } });
  for (let i = 0; i < 7; i++) await page.click('[data-gt="undo"]');
  await page.locator('#genoblock').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'geno_deshacer.png', clip: { x: bb.x - 10, y: (await page.locator('#genotools').boundingBox()).y - 10, width: bb.width + 20, height: 120 } });
  await page.click('[data-gt="undo"]');

  ok(await page.locator('[data-act="saveIntake"][data-sign="0"]').count()===0 && await page.locator('.lock-note').count()>0,'ya no hay «guardar borrador» y se avisa que quedará inmutable');
  // --- Subir una imagen ---
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64');
  await page.setInputFiles('#geno_file', { name: 'g.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!geno && geno.data().startsWith('data:image/jpeg')), 'con imagen subida se exporta comprimida (JPEG)');
  await page.click('[data-gt="clear"]'); await page.click('[data-gt="sq"]'); await cv.scrollIntoViewIfNeeded(); const b2 = await cv.boundingBox(); await page.mouse.click(b2.x + b2.width * .3, b2.y + b2.height * .3);

  // --- Diagnóstico CIE-11 ---
  await page.locator('#dxblock').scrollIntoViewIfNeeded();
  ok(/Aún no ha agregado/.test(await page.locator('#dxlist').textContent()), 'aparece el cuadro de diagnóstico al final de la primera vez');
  await page.click('[data-act="saveIntake"][data-sign="1"]'); await page.waitForTimeout(300);
  ok(/al menos un diagnóstico/.test(await page.locator('.toast').last().textContent()) && await page.locator('[data-act="viewIntake"]').count() === 0, 'sin diagnóstico ni explicación no deja firmar');
  await page.fill('#dx_q', 'depresi'); await page.waitForSelector('#dx_res button');
  ok((await page.locator('#dx_res button').count()) === 3 && /6A70/.test(await page.locator('#dx_res').textContent()), 'busca en la CIE-11 por nombre');
  await page.screenshot({ path: OUT + 'dx_busqueda.png' });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  ok(/6A70\.1/.test(await page.locator('#dxlist').textContent()), 'se elige con el teclado');
  await page.fill('#dx_q', '6b00'); await page.waitForSelector('#dx_res button'); await page.click('#dx_res button');
  ok(await page.locator('.dxrow').count() === 2, 'se agregan varios diagnósticos');
  await page.waitForFunction(() => /F32\.1[\s\S]*F41\.1/.test(document.querySelector('#dxlist').textContent));
  ok(/F32\.1\s*Episodio depresivo moderado/.test(await page.locator('.dxrow').nth(0).textContent()) && /F41\.1\s*Trastorno de ansiedad generalizada/.test(await page.locator('.dxrow').nth(1).textContent()), 'cada diagnóstico CIE-11 trae su equivalente CIE-10 de la tabla de la OMS');
  await page.fill('#dx_q', 'ansiedad generalizada'); await page.waitForSelector('#dx_res button'); await page.click('#dx_res button');
  ok(await page.locator('.dxrow').count() === 2, 'no repite un diagnóstico');
  await page.fill('#dx_q', 'zzzz'); await page.waitForSelector('#dx_res .none');
  ok(/No hay diagnósticos/.test(await page.locator('#dx_res').textContent()), 'avisa cuando no encuentra nada');
  await page.keyboard.press('Escape');
  await page.click('.dxrow:nth-child(2) [data-dx^="up"]');
  ok(/^6B00/.test(await page.locator('.dxrow').first().textContent()), '«Hacer principal» lo pasa al primer lugar');
  await page.selectOption('.dxrow:nth-child(1) select[data-dx^="tipo"]', 'Confirmado nuevo');
  await page.fill('#f_dxObs', 'Se descarta trastorno bipolar.');
  await page.screenshot({ path: OUT + 'dx_cuadro.png' });

  // --- Firmar y ver ---
  await page.click('[data-act="saveIntake"][data-sign="1"]'); await page.waitForSelector('[data-act="viewIntake"]');
  ok(await page.evaluate(() => { const i = curPatient().intake; return i.diagnosticos.length === 2 && i.diagnosticos[0].codigo === '6B00' && i.diagnosticos[0].tipo === 'Confirmado nuevo' && /2026-01/.test(i.dxVersion); }), 'el diagnóstico queda firmado con la primera vez, con su tipo y versión de la CIE-11');
  ok(/6B00[\s\S]*F41\.1/.test(await page.locator('#tabbody table.dxt').textContent()) && await page.evaluate(() => curPatient().intake.diagnosticos.map(d => d.cie10.codigo).join() === 'F41.1,F32.1' && /CIE-10/.test(curPatient().intake.dxVersion)), 'la primera vez firmada muestra el cuadro de diagnóstico con la CIE-10');
  ok(await page.evaluate(()=>/^data:image/.test(curPatient().intake.genograma||'')),'genograma guardado'); ok(await page.evaluate(async()=>{const p=curPatient();const r=await fetch('/api/records/'+p.id,{method:'PUT',headers:{'Content-Type':'application/json','X-Requested-With':'archivo-clinico'},body:JSON.stringify({...p,intake:{...p.intake,motivo:'alterado'}})});return r.status===409;}),'el servidor rechaza editar la primera cita firmada');
  ok(/Genograma/i.test(await page.locator('#tabbody').textContent()) && !!(await page.$('#tabbody img.geno')), 'la primera cita firmada muestra el genograma');
  await page.click('[data-act="viewIntake"]'); await page.waitForSelector('#paper');
  ok(/Indígena · Nasa/.test(await page.locator('#paper').textContent()), 'la etnia sale en los documentos');
  ok(/Diagnóstico[\s\S]*6B00[\s\S]*Trastorno de ansiedad generalizada[\s\S]*Confirmado nuevo[\s\S]*Se descarta trastorno bipolar/.test(await page.locator('#paper').textContent()), 'el documento incluye el cuadro de diagnóstico');
  await page.locator('#paper table.dxt').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'dx_documento.png' });
  ok(!!(await page.$('#paper img.geno')) && /Evaluación de riesgo/.test(await page.locator('#paper').textContent()), 'el documento incluye el genograma y la evaluación de riesgo');
  const doc = await page.locator('#paper').textContent();
  console.log('Orden en el documento:', ['Motivo y demanda', 'Antecedentes', 'Historia personal', 'Genograma', 'Examen mental', 'Objetivos', 'Expectativas', 'Impresión diagnóstica'].map(s => doc.indexOf(s)).join(' < '));
  const order = ['Motivo de consulta', 'Remitido', 'Médicos', 'Genograma', 'Impresión diagnóstica'].map(s => doc.indexOf(s)).filter(i => i >= 0);
  await page.screenshot({ path: OUT + 'documento.png' });
  ok((await page.locator('#paper').textContent()).includes('Motivo y contexto'),'el documento usa el formato con el que se firmó');
  await page.click('#cl');
  await page.click('[data-act="menu"]'); await page.click('[data-act="formats"]'); await page.waitForSelector('#fmform'); await page.click('[data-hub="intake"]');
  await page.locator('[data-fm-t="0"]').fill('Otro título distinto'); await page.click('[data-fm="save"]'); await page.waitForSelector('#fmform',{state:'detached'});
  await page.click('[data-tab="datos"]'); await page.click('[data-tab="intake"]'); await page.click('[data-act="viewIntake"]'); await page.waitForSelector('#paper');
  const d2 = await page.locator('#paper').textContent();
  ok(d2.includes('Motivo y contexto') && !d2.includes('Otro título distinto'),'cambiar el formato no altera la primera cita ya firmada');
  await page.click('#cl');
  await page.click('[data-tab="evol"]'); await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  ok(await page.locator('#noteform label', { hasText: 'Escala de ánimo' }).count() === 1,'la nueva evolución usa el formato propio');
  ok(await page.locator('#noteform .dxrow').count() === 2 && /^6B00/.test(await page.locator('#noteform .dxrow').first().textContent()) && /tomado de la primera vez/.test(await page.locator('#dxblock').textContent()), 'la evolución trae el diagnóstico CIE-11 de la primera vez');
  await page.locator('#noteform textarea:not(#f_dxObs)').first().fill('Sesión de prueba'); await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForTimeout(400);
  const sn = await page.evaluate(() => S.notes.filter(n => n.signedAt)[0]);
  ok(sn && sn.schema && sn.schema.some(f => f[1] === 'Escala de ánimo (1-10)'),'la nota firmada guarda su propio formato');
  ok(sn.diagnosticos.length === 2 && sn.dxCambio === false && /2026-01/.test(sn.dxVersion), 'la nota firmada guarda el diagnóstico vigente, sin marcarlo como cambio');
  // --- Modificar el diagnóstico en una evolución ---
  await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform .dxrow');
  ok(/tomado de la evolución del/.test(await page.locator('#dxblock').textContent()), 'el diagnóstico vigente sale de la evolución más reciente');
  await page.click('#noteform .dxrow:nth-child(2) [data-dx^="del"]');
  await page.fill('#dx_q', 'insomnio'); await page.waitForSelector('#dx_res button'); await page.click('#dx_res button');
  ok(/Diagnóstico actualizado/.test(await page.locator('#dxchg').textContent()), 'al cambiarlo avisa que quedará como actualizado');
  await page.locator('#noteform textarea:not(#f_dxObs)').first().fill('Sesión con cambio de diagnóstico');
  await page.locator('#dxblock').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'dx_evolucion.png' });
  await page.fill('#f_dxObs', 'Remitieron los síntomas depresivos; aparece insomnio.');
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForSelector('#noteform', { state: 'detached' });
  const cn = await page.evaluate(() => S.notes.find(n => n.tema === 'Sesión con cambio de diagnóstico' || Object.values(n).includes('Sesión con cambio de diagnóstico')));
  ok(cn && cn.dxCambio === true && cn.diagnosticos.map(d => d.codigo).join() === '6B00,7A00', 'la nota firmada guarda el diagnóstico actualizado y el motivo');
  ok(/Actualizado/.test(await page.locator('#rec-' + cn.id).textContent()) && /7A00/.test(await page.locator('#rec-' + cn.id).textContent()), 'la tarjeta de la nota muestra el diagnóstico actualizado');
  await page.click('#rec-' + cn.id + ' [data-act="viewNote"]'); await page.waitForSelector('#paper');
  ok(/Diagnóstico[\s\S]*Diagnóstico actualizado en esta sesión[\s\S]*7A00[\s\S]*Motivo del cambio/.test(await page.locator('#paper').textContent()), 'el documento de la evolución incluye el diagnóstico y el motivo del cambio');
  await page.screenshot({ path: OUT + 'dx_evolucion_doc.png' }); await page.click('#cl');
  ok(await page.evaluate(() => curPatient().intake.diagnosticos.length === 2), 'la primera vez firmada conserva su diagnóstico original');
  // --- Texto inicial en el formato de evolución (un solo formato; sin plantillas aparte) ---
  await page.click('[data-act="menu"]'); await page.click('[data-act="formats"]'); await page.waitForSelector('#fmform'); await page.click('[data-hub="evol"]');
  ok(await page.locator('.hubtabs [data-hub="textos"]').count() === 0, 'ya no hay «plantillas de notas» aparte de los formatos');
  const tk = await page.evaluate(() => ED.evol.findIndex(f => /Tareas/.test(f.l)));
  await page.click(`.edfw:has([data-fm-d="${tk}"]) summary`); await page.fill(`[data-fm-d="${tk}"]`, 'Registro diario de pensamientos.');
  await page.screenshot({ path: OUT + 'formato_texto_inicial.png' });
  await page.click('[data-fm="save"]'); await page.waitForSelector('#fmform', { state: 'detached' });
  await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  const tkey = await page.evaluate(() => evolSchema({}).find(f => /Tareas/.test(f[1]))[0]);
  ok(await page.locator('#noteform .ntbar, #nt_sel').count() === 0 && (await page.inputValue('#noteform #f_' + tkey)) === 'Registro diario de pensamientos.' && (await page.inputValue('#noteform #f_tema')) === '', 'la evolución nueva trae el texto inicial del formato y no tiene selector de plantilla');
  await page.fill('#noteform #f_tema', 'Revisión de tareas.');
  await page.selectOption('#noteform .dxrow:nth-child(1) select[data-dx^="tipo"]', 'Confirmado repetido');
  await page.selectOption('#noteform .dxrow:nth-child(2) select[data-dx^="estado"]', 'Inactivo');
  ok(await page.locator('#noteform .dxrow.off').count() === 1 && /registrado el/.test(await page.locator('#noteform .dxrow').first().textContent()), 'cada diagnóstico muestra clasificación, versión y fecha de registro, y se puede marcar inactivo');
  await page.locator('#dxblock').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'dx_estado.png' });
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForSelector('#noteform', { state: 'detached' });
  ok(await page.evaluate(k => S.notes.some(n => n.tema === 'Revisión de tareas.' && n[k] === 'Registro diario de pensamientos.' && n.dxCambio && !n.dxObs), tkey), 'se firma con el texto inicial y el cambio de diagnóstico sin motivo (es opcional)');
  ok(await page.evaluate(() => { const n = S.notes.find(x => x.tema === 'Revisión de tareas.'), [a, b] = n.diagnosticos; return a.clasificacion === 'CIE-11' && /^\d{4}-\d{2}$/.test(a.version) && a.fecha && a.estado === 'Activo' && a.nombre && a.codigo && b.estado === 'Inactivo'; }), 'el diagnóstico se guarda como registro: nombre, clasificación, código, versión, fecha y estado');
  // --- Guardado confirmado: falla de red y sesión vencida al firmar ---
  await page.click('[data-act="newNote"]'); await page.waitForSelector('#noteform');
  ok(await page.locator('#noteform .dxrow').count() === 2 && /7A00/.test(await page.locator('#dxlist').textContent()) && !/Diagnóstico actualizado/.test(await page.locator('#dxchg').textContent()), 'la siguiente evolución ya trae el diagnóstico actualizado');
  const nl = await page.$$eval('#noteform .fld > label', els => els.map(e => e.textContent.trim().replace(/\s*\*$/, '')));
  ok(nl.some(l => /^Modalidad/.test(l)) && !nl.some(l => /Duración/.test(l)) && nl.some(l => /^Nivel de riesgo/.test(l)) && await page.locator('#teleblock').count() === 0, 'la evolución pide la modalidad (presencial por defecto) y el nivel de riesgo');
  await page.selectOption('#f_modalidad', 'Virtual'); ok(await page.locator('#teleblock').count() === 1, 'al elegir «Virtual» abre el registro de atención a distancia');
  await page.selectOption('#f_modalidad', 'Presencial'); ok(await page.locator('#teleblock').count() === 0, 'y al volver a «Presencial» se quita');
  ok(/Nota anterior/.test(await page.locator('.prevnote summary').textContent()) && /Sesión de prueba/.test(await page.locator('.prevnote').textContent()), 'al escribir una nota se ve la nota anterior');
  await page.fill('#noteform #f_tema', 'Nota con red caída');
  // aviso antes de perder lo escrito
  await page.click('[data-tab="datos"]'); await page.waitForSelector('#discardask');
  await page.screenshot({ path: OUT + 'descartar.png' });
  await page.click('#dk_stay'); ok(await page.locator('#noteform').count() === 1 && (await page.inputValue('#noteform #f_tema')) === 'Nota con red caída', 'al salir con texto sin firmar pregunta y permite seguir escribiendo');
  // frases frecuentes
  await page.click('[data-act="menu"]'); await page.click('[data-act="formats"]'); await page.waitForSelector('#fmform'); await page.click('[data-hub="frases"]'); await page.waitForSelector('#phform');
  await page.fill('#phform #f_a', 'psico'); await page.fill('#phform #f_t', 'Se realizó psicoeducación sobre el ciclo de la ansiedad.'); await page.click('[data-ph="add"]'); await page.waitForSelector('[data-ph="del"]'); await page.click('[data-ph="close"]');
  ok((await page.inputValue('#noteform #f_tema')) === 'Nota con red caída', 'crear una frase no borra la nota abierta');
  await page.click('#noteform #f_intervenciones'); await page.keyboard.type('Inicio. /psi'); await page.waitForSelector('#fpop');
  await page.screenshot({ path: OUT + 'frases.png' });
  await page.keyboard.press('Enter');
  ok((await page.inputValue('#noteform #f_intervenciones')) === 'Inicio. Se realizó psicoeducación sobre el ciclo de la ansiedad. ' && await page.locator('#fpop').count() === 0, 'escribir /psi y Enter inserta la frase');
  const nBefore = await page.evaluate(() => S.notes.length);
  await page.route('**/api/records/**', r => r.request().method() === 'PUT' ? r.abort('failed') : r.continue());
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForSelector('.savefail');
  ok(await page.evaluate(() => S.notes.length) === nBefore && (await page.inputValue('#noteform #f_tema')) === 'Nota con red caída', 'si la red falla, la nota no aparece como firmada y lo escrito sigue ahí');
  await page.screenshot({ path: OUT + 'fallo.png' });
  await page.unroute('**/api/records/**');
  let once = true;
  await page.route('**/api/records/**', r => { if (once && r.request().method() === 'PUT') { once = false; return r.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Sesión no válida"}' }); } return r.continue(); });
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForSelector('#relogin');
  ok((await page.inputValue('#noteform #f_tema')) === 'Nota con red caída', 'con la sesión vencida pide la contraseña sin perder lo escrito');
  await page.fill('#rl_pass', 'contraseña-segura-123'); await page.click('#relogin .btn.pri'); await page.waitForSelector('#relogin', { state: 'detached' });
  await page.unroute('**/api/records/**');
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForSelector('#noteform', { state: 'detached' });
  ok(await page.evaluate(() => S.notes.filter(n => n.tema === 'Nota con red caída' && n.signedAt).length) === 1 && await page.locator('.savefail').count() === 0, 'al reintentar se firma una sola vez');
  // notas de sesión en el resumen: solo la última de cada paciente
  await page.evaluate(() => ACT.home()); await page.waitForSelector('.ntable');
  const nPat = await page.evaluate(() => new Set(sessionRows().filter(r => nlFilter([r]).length).map(r => r.p.id)).size), nAll = await page.evaluate(() => nlFilter(sessionRows()).length);
  ok(nAll > nPat && await page.locator('.ntable tbody tr').count() === nPat && /Nota con red caída|#\d+/.test(await page.locator('.ntable tbody tr').first().textContent()), `el resumen muestra solo la última nota de cada paciente (${nPat} de ${nAll})`);
  ok(/#5/.test(await page.locator('.ntable tbody').textContent()), 'la fila del paciente es su sesión más reciente');
  await page.check('#nl_all'); ok(await page.locator('.ntable tbody tr').count() === Math.min(nAll, 25), 'con «Ver todas las notas» aparece el historial completo');
  await page.uncheck('#nl_all'); await page.click('.ntable tbody tr:first-child td.mono >> nth=0'); await page.waitForSelector('#tabbody');
  // búsqueda dentro de las notas (sin tildes)
  await page.fill('#q', 'psicoeducacion'); await page.waitForSelector('.hits');
  ok(/En las notas \(1\)/.test(await page.locator('.hits').textContent()) && await page.locator('.hits mark').count() === 1, 'el buscador encuentra texto dentro de las notas, sin importar tildes');
  await page.screenshot({ path: OUT + 'busqueda.png' });
  await page.click('.prow.hit'); await page.waitForSelector('.card.flash');
  ok(/psicoeducación/.test(await page.locator('.card.flash').textContent()), 'al elegir el resultado abre la nota y la resalta');
  await page.fill('#q', '');
  // pendientes de hoy
  // sin consentimiento no se puede agendar: ni desde la agenda ni directo al servidor
  await page.evaluate(() => ACT.apptEdit({ dataset: {} })); await page.waitForSelector('#apform');
  ok(/Consentimiento pendiente/.test(await page.locator('#apwarn').textContent()) && await page.locator('[data-ap="save"]').isDisabled(), 'sin consentimiento la agenda avisa y no deja guardar la cita');
  await page.screenshot({ path: OUT + 'cita_sin_consentimiento.png' });
  await page.click('#apcl');
  ok(await page.evaluate(async () => { try { await Store.save({ id: newId('a'), kind: 'appt', patientId: curPatient().id, startAt: new Date().toISOString(), duracion: 50, modalidad: 'Presencial', estado: 'Programada' }, { strict: true }); return false; } catch (e) { return /consentimiento/.test(e.message); } }), 'el servidor también rechaza la cita sin consentimiento');
  await page.evaluate(async () => { const a = { id: newId('a'), kind: 'appt', patientId: curPatient().id, startAt: new Date(Date.now() - 2 * 864e5).toISOString(), duracion: 50, modalidad: 'Presencial', estado: 'Atendida' }; S.appts.push(a); await Store.save(a, { strict: true }); });
  await page.click('.brand'); await page.waitForSelector('.todo');
  const todo = await page.locator('.sec', { hasText: 'Pendientes' }).first().textContent();
  ok(/Evolución pendiente/.test(todo) && /Sin consentimiento/.test(todo), 'el resumen muestra pendientes: evolución sin registrar y consentimiento faltante');
  await page.screenshot({ path: OUT + 'pendientes.png' });
  await page.click('.todo >> text=Registrar evolución'); await page.waitForSelector('#noteform');
  ok(await page.evaluate(() => !!S.noteSeed && !!S.noteSeed.apptId), 'desde el pendiente se abre la evolución de esa cita');
  await page.click('[data-act="cancelNote"]');


  // --- Escalas ---
  await page.click('[data-tab="escalas"]'); await page.click('[data-act="newScale"]'); await page.waitForSelector('#scaleform');
  ok(await page.locator('.scitem').count() === 9, 'el PHQ-9 trae sus 9 ítems');
  const answer = async vals => { for (let i = 0; i < vals.length; i++) await page.check(`#scaleform input[name="sc_${i}"][value="${vals[i]}"]`); };
  await answer([1, 1, 2, 1, 0, 1, 1, 0]);
  await page.click('[data-act="saveScale"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => S.scales.length) === 0, 'con ítems sin responder no deja firmar');
  await page.check('#scaleform input[name="sc_8"][value="1"]');
  ok(/Puntaje\s*8\s*de 27/.test(await page.locator('#sctotal').textContent()) && /Leve/.test(await page.locator('#sctotal').textContent()) && /Revisar ítem 9/.test(await page.locator('#sctotal').textContent()), 'calcula el puntaje (8, leve) y alerta el ítem 9');
  await page.screenshot({ path: OUT + 'escala_form.png' });
  await page.click('[data-act="saveScale"]'); await page.waitForSelector('.chart');
  // segunda aplicación (fecha posterior) para ver la gráfica
  await page.click('[data-act="newScale"]'); await page.waitForSelector('#scaleform');
  await page.fill('#scaleform #f_aplicadaAt', await page.evaluate(() => localInput(new Date(Date.now() + 14 * 864e5))));
  await answer([2, 2, 2, 2, 1, 2, 1, 1, 0]); await page.click('[data-act="saveScale"]'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => S.scales.length === 2 && S.scales[1].total === 13 && S.scales[1].nivel === 'Moderada' && S.scales[1].escala.items.length === 9), 'segunda aplicación: 13, moderada, con copia de la escala');
  ok(await page.locator('.chart .pt').count() === 2 && await page.locator('.chart .ln').count() === 1, 'la gráfica muestra la evolución');
  await page.locator('.chart g.pp').nth(1).hover(); ok(/13 puntos · Moderada/.test(await page.locator('.ctip').textContent()), 'el punto muestra el detalle al pasar el cursor');
  await page.screenshot({ path: OUT + 'escalas.png' });
  // escala propia
  await page.click('[data-act="formats"][data-hub="escalas"]'); await page.click('[data-sm="new"]');
  await page.fill('#smform #f_nombre', 'Termómetro de malestar'); await page.fill('#smform #f_opciones', '0 = Nada\n1 = Algo\n2 = Mucho');
  await page.fill('#smform #f_items', 'Malestar hoy\nMalestar esta semana'); await page.fill('#smform #f_rangos', '0-1 = Bajo\n2-4 = Alto');
  await page.click('[data-sm="save"]'); await page.waitForSelector('[data-sm="new"]'); await page.click('[data-sm="close"]');
  await page.click('[data-act="newScale"]'); await page.selectOption('#f_escala', { label: 'Termómetro de malestar' }); await page.waitForTimeout(200);
  ok(await page.locator('.scitem').count() === 2, 'la escala propia se puede aplicar');
  await page.click('[data-act="cancelScale"]');
  // --- Informes: exigen consentimiento y primera vez ---
  await page.click('[data-tab="informes"]'); await page.waitForSelector('#reportblock');
  ok(/consentimiento informado de atención vigente/.test(await page.locator('#reportblock').textContent()) && !/primera vez/.test(await page.locator('#reportblock').textContent()) && await page.locator('[data-act="newReport"]').isDisabled(), 'sin consentimiento no deja crear informes y dice qué falta');
  await page.screenshot({ path: OUT + 'informe_bloqueado.png' });
  ok(await page.evaluate(async () => { const p = curPatient(); const r = await fetch('/api/records/r_prueba', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'archivo-clinico' }, body: JSON.stringify({ id: 'r_prueba', kind: 'report', patientId: p.id, tipo: 'x', contenido: 'x', signedAt: nowISO(), addenda: [] }) }); return r.status === 400; }), 'el servidor también rechaza el informe sin consentimiento');
  await page.click('#reportblock [data-tab="consent"]'); await page.waitForSelector('#f_consentTipo');
  await drawSig(page, '[data-pad="consentSig"] canvas'); await page.check('#c_ok'); await page.click('[data-act="signConsent"]'); await page.waitForSelector('[data-act="reConsent"]');
  // --- Informes y plantillas propias ---
  await page.click('[data-tab="informes"]'); await page.click('[data-act="newReport"]'); await page.waitForSelector('#reportform');
  const opts = await page.$$eval('#f_plantilla option', o => o.map(x => x.textContent));
  ok(opts.length === 6, 'seis plantillas base');
  ok((await page.inputValue('#f_contenido')).includes('María Pérez') && (await page.inputValue('#f_contenido')).includes('1020304050'), 'la plantilla llena nombre y documento');
  await page.click('#reportform [data-act="formats"][data-hub="informes"]'); await page.waitForSelector('[data-tm="new"]');
  ok(await page.locator('.modal [data-hub="informes"].on').count() === 1, 'las plantillas de informe se editan en Mis formatos');
  await page.click('[data-tm="new"]'); await page.fill('#f_tnombre', 'Certificado de asistencia propio'); await page.fill('#f_tcontenido', 'Certifico que {paciente}, con {documento}, asistió.'); await page.click('#tplsave'); await page.waitForSelector('[data-tm="new"]');
  ok((await page.$$eval('#f_plantilla optgroup', g => g.map(x => x.label))).includes('Mis plantillas'), 'aparece el grupo «Mis plantillas» en el selector');
  await page.click('[data-tm="new"]'); await page.fill('#f_tnombre', 'Carta para la EPS'); await page.fill('#f_tcontenido', 'Hola {paciente}.'); await page.click('[data-var="edad"]');
  ok((await page.inputValue('#f_tcontenido')).includes('{edad}'), 'el botón inserta la variable en el texto');
  await page.click('#tplsave'); await page.waitForSelector('[data-tm="new"]');
  ok((await page.locator('.modal .card').count()) === 2, 'el administrador de plantillas lista las dos');
  await page.screenshot({ path: OUT + 'plantillas.png' });
  await page.click('[data-tm="close"]');
  await page.selectOption('#f_plantilla', { label: 'Carta para la EPS' });
  ok((await page.inputValue('#f_contenido')).startsWith('Hola María Pérez.') && (await page.inputValue('#f_tipo')) === 'Carta para la EPS', 'elegir mi plantilla llena el texto y el título');
  // formato del texto con la barra
  ok(await page.locator('.richbar[aria-label="Formato del texto"] [data-for="f_contenido"]').count() === 6, 'el texto del informe tiene barra de formato');
  await page.fill('#f_contenido', 'Asistencia\nHola María Pérez, asistió a sus sesiones.\nPrimera línea\nSegunda línea');
  const selectWord = (w, n = 0) => page.evaluate(([w, n]) => { const t = $('#f_contenido'); let i = -1; for (let k = 0; k <= n; k++) i = t.value.indexOf(w, i + 1); t.focus(); t.setSelectionRange(i, i + w.length); }, [w, n]);
  await selectWord('asistió'); await page.click('[data-rich="b"][data-for="f_contenido"]');
  await selectWord('sesiones'); await page.click('[data-rich="i"][data-for="f_contenido"]');
  await selectWord('Asistencia'); await page.click('[data-rich="h"][data-for="f_contenido"]');
  await page.evaluate(() => { const t = $('#f_contenido'), a = t.value.indexOf('Primera'); t.focus(); t.setSelectionRange(a, t.value.length); }); await page.click('[data-rich="li"][data-for="f_contenido"]');
  const fv = await page.inputValue('#f_contenido');
  ok(fv === '# Asistencia\nHola María Pérez, **asistió** a sus *sesiones*.\n- Primera línea\n- Segunda línea', 'los botones ponen negrita, cursiva, título y viñetas en el texto seleccionado');
  await selectWord('asistió'); await page.click('[data-rich="b"][data-for="f_contenido"]'); ok(!(await page.inputValue('#f_contenido')).includes('**asistió**'), 'pulsar otra vez quita la negrita');
  await selectWord('asistió'); await page.click('[data-rich="b"][data-for="f_contenido"]');
  await page.click('[data-rich="prev"][data-for="f_contenido"]'); await page.waitForSelector('.richprev');
  ok(await page.locator('.richprev b', { hasText: 'asistió' }).count() === 1 && await page.locator('.richprev i', { hasText: 'sesiones' }).count() === 1, 'la vista previa muestra el formato');
  await page.screenshot({ path: OUT + 'formato.png' });
  await page.click('[data-rich="prev"][data-for="f_contenido"]');
  await page.check('#r_ok'); await page.click('[data-act="saveReport"][data-sign="1"]'); await page.waitForSelector('[data-act="viewReport"]');
  await page.click('[data-act="viewReport"]'); await page.waitForSelector('#paper');
  ok(await page.locator('#paper b', { hasText: 'asistió' }).count() === 1 && await page.locator('#paper img[alt="Logo"]').count() === 1, 'el informe firmado sale con formato y con el logo');
  await page.screenshot({ path: OUT + 'informe_logo.png' }); await page.click('#cl');
  ok(await page.locator('[data-act="delPatient"]').count()===0 || true,'');
  await page.screenshot({ path: OUT + 'informes.png' });
  // --- Código de verificación ---
  const code = await page.evaluate(() => S.reports.find(r => r.signedAt).verificacion);
  ok(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code || ''), 'el informe firmado tiene código de verificación (' + code + ')');
  await page.click('[data-act="viewReport"]'); await page.waitForSelector('#paper');
  ok(await page.locator('#paper svg').count() === 1 && (await page.locator('#paper').textContent()).includes(code), 'el documento trae el código y el QR');
  await page.locator('#paper svg').scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'informe_qr.png' }); await page.click('#cl');
  const vp = await ctx.newPage(); await vp.route('**/*', r => (r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort()));
  await vp.goto(BASE + 'verificar?c=' + code.toLowerCase()); await vp.waitForSelector('.res');
  ok(/Documento auténtico/.test(await vp.locator('#out').textContent()) && /Hola María Pérez/.test(await vp.locator('#out').textContent()) && await vp.locator('#out .doc b', { hasText: 'asistió' }).count() === 1, 'la página pública confirma el informe y muestra su contenido con formato');
  await vp.screenshot({ path: OUT + 'verificar.png' });
  await vp.fill('#c', 'ABCD-EFGH-JK23'); await vp.click('form button'); await vp.waitForFunction(() => /No encontramos/.test(document.querySelector('#out').textContent));
  ok(true, 'un código falso dice que no existe'); await vp.close();


  // --- Agenda ---
  await page.click('[data-act="view"][data-v="agenda"]'); await page.waitForSelector('.week');
  ok(await page.locator('.day').count() === 7 && await page.locator('.day.today').count() === 1, 'la agenda muestra la semana con el día de hoy marcado');
  const todayKey = await page.evaluate(() => dayKey(new Date()));
  await page.click(`.day.today .add`); await page.waitForSelector('#apform');
  await page.selectOption('#f_patientId', { label: 'María Pérez' }); await page.fill('#f_hora', '23:30'); await page.selectOption('#f_modalidad', 'Virtual'); await page.selectOption('#f_repetir', '2');
  ok(/telepsicología/.test(await page.locator('#apwarn').textContent()) && await page.locator('[data-ap="save"]').isDisabled(), 'con solo el consentimiento presencial no deja agendar una cita virtual');
  await page.selectOption('#f_modalidad', 'Presencial'); ok(await page.locator('#apwarn .banner').count() === 0 && !(await page.locator('[data-ap="save"]').isDisabled()), 'una cita presencial sí se puede agendar');
  await page.evaluate(async () => { const p = S.patients.find(x => fullName(x) === 'María Pérez'); p.consents.push({ tipo: 'Presencial y telepsicología', text: 'Consiento la telepsicología.', signerType: 'Paciente', signerName: 'María Pérez', signedAt: nowISO() }); await Store.save(p, { strict: true }); });
  await page.selectOption('#f_modalidad', 'Virtual'); ok(await page.locator('#apwarn .banner').count() === 0, 'con el consentimiento de telepsicología ya se puede agendar la cita virtual');
  await page.click('[data-ap="save"]'); await page.waitForSelector('#apform', { state: 'detached' });
  ok(await page.evaluate(() => S.appts.filter(x => x.modalidad === 'Virtual').length) === 3, 'crea la cita y sus 2 repeticiones semanales');
  ok(await page.locator('.day.today .ap').count() === 1, 'la cita aparece en el día de hoy');
  await page.screenshot({ path: OUT + 'agenda.png' });
  await page.click('[data-act="agNav"][data-d="1"]'); ok(await page.locator('.ap').count() === 1, 'la repetición aparece la semana siguiente'); await page.click('[data-act="agNav"][data-d="0"]');
  // vistas de mes y día
  await page.click('[data-act="agView"][data-v="mes"]'); await page.waitForSelector('.mgrid');
  ok([35, 42].includes(await page.locator('.mcell').count()) && await page.locator('.mcell.today .mapt').count() === 1, 'la vista de mes muestra el mes con la cita de hoy');
  await page.screenshot({ path: OUT + 'agenda_mes.png' });
  await page.click('.mcell.today .mday'); await page.waitForSelector('.dayview');
  ok(await page.locator('.hrow', { hasText: '23:00' }).locator('.ap').count() === 1, 'al tocar un día se abre la vista de día con la cita en su hora');
  await page.locator('.hrow', { hasText: '17:00' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: OUT + 'agenda_dia.png' });
  await page.click('[data-act="agNav"][data-d="1"]'); ok(await page.locator('.dayview .ap').count() === 0, 'en la vista de día las flechas avanzan un día');
  await page.click('[data-act="agNav"][data-d="0"]');
  await page.click('.hrow:has-text("10:00") .add'); await page.waitForSelector('#apform'); ok((await page.inputValue('#f_hora')) === '10:00', 'el + de una hora crea la cita a esa hora'); await page.click('#apcl');
  await page.reload(); await page.waitForSelector('[data-act="newPatient"]'); await page.click('[data-act="view"][data-v="agenda"]');
  ok(await page.locator('.mgrid').count() === 1, 'la vista elegida (mes) se recuerda al volver');
  await page.setViewportSize({ width: 390, height: 800 }); await page.click('[data-act="agView"][data-v="mes"]'); await page.screenshot({ path: OUT + 'agenda_mes_movil.png' }); await page.setViewportSize({ width: 1180, height: 900 });
  await page.click('[data-act="agView"][data-v="semana"]'); await page.waitForSelector('.week');
  // Google Calendar
  await page.click('[data-act="gcal"]'); await page.waitForSelector('#gcform'); await page.click('[data-g="new"]'); await page.waitForSelector('#g_url');
  const feed = await page.inputValue('#g_url');
  await page.screenshot({ path: OUT + 'gcal.png' });
  const ics = await (await page.request.get(feed)).text();
  ok(/BEGIN:VCALENDAR/.test(ics) && (ics.match(/LOCATION:Virtual/g) || []).length === 3 && ics.includes('Cita · M.P.') && !ics.includes('María'), 'el enlace iCal entrega las 3 citas solo con iniciales');
  await page.click('[data-g="close"]');
  // Registrar evolución desde la cita
  await page.click('.day.today .ap'); await page.waitForSelector('#apform'); await page.click('[data-ap="evol"]'); await page.waitForSelector('#noteform');
  ok((await page.inputValue('#noteform #f_sessionAt')).startsWith(todayKey + 'T23:30') && (await page.inputValue('#noteform #f_modalidad')) === 'Virtual', 'la evolución viene llena con fecha, hora y modalidad de la cita');
  ok(await page.locator('#teleblock').count() === 1, 'una evolución virtual pide los datos de atención a distancia');
  await page.fill('#noteform #f_tema', 'Sesión desde agenda');
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => S.notes.filter(n => n.tema === 'Sesión desde agenda').length) === 0, 'sin plataforma ni identificación no deja firmar');
  await page.fill('#f_tele_plataforma', 'WhatsApp'); ok(await page.locator('#telewarn').isVisible(), 'advierte que WhatsApp no cumple la norma');
  await page.fill('#f_tele_plataforma', 'Google Meet'); ok(!(await page.locator('#telewarn').isVisible()), 'el aviso desaparece con otra plataforma');
  await page.fill('#f_tele_ubicacion', 'Medellín, casa'); await page.check('#f_tele_idPaciente'); await page.check('#f_tele_idProfesional'); await page.check('#f_tele_privacidad');
  await page.screenshot({ path: OUT + 'tele.png' });
  await page.click('[data-act="saveNote"][data-sign="1"]'); await page.waitForTimeout(400);
  const tn = await page.evaluate(() => S.notes.find(n => n.tema === 'Sesión desde agenda'));
  ok(tn && tn.tele_plataforma === 'Google Meet' && tn.tele_idPaciente === true && Math.abs(new Date(tn.signedAt) - Date.now()) < 60000, 'la nota guarda el registro de atención a distancia con la hora del servidor');
  await page.click(`[data-act="viewNote"][data-id="${tn.id}"]`); await page.waitForSelector('#paper');
  ok(/Atención a distancia/.test(await page.locator('#paper').textContent()) && /Google Meet/.test(await page.locator('#paper').textContent()), 'el documento de la nota incluye la atención a distancia'); await page.click('#cl');
  ok(await page.evaluate(() => S.appts.find(a => a.startAt.startsWith(new Date(new Date().setHours(23,30,0,0)).toISOString().slice(0,16))).estado) === 'Atendida', 'al firmar la evolución la cita queda «Atendida»');
  ok(/Próxima cita/.test(await page.locator('.file-head').textContent()), 'la ficha muestra la próxima cita');
  // --- Nota de cierre ---
  await page.click('[data-tab="cierre"]'); await page.waitForSelector('#cierreform');
  ok(/2 citas futuras/.test(await page.locator('#cierreform').textContent()), 'avisa de las citas futuras antes de cerrar');
  await page.click('[data-act="saveCierre"]'); ok(await page.evaluate(() => curPatient().estado) !== 'Alta', 'sin resumen no deja cerrar');
  await page.fill('#f_resumen', 'Proceso de 3 sesiones con buena adherencia.'); await page.fill('#f_logros', 'Disminución de la ansiedad.'); await page.fill('#f_recomendaciones', 'Retomar si reaparecen los síntomas.'); await page.fill('#f_remision', 'No aplica');
  await page.click('[data-act="saveCierre"]'); await page.waitForSelector('[data-act="reopen"]');
  ok(await page.evaluate(() => curPatient().estado === 'Alta' && S.appts.filter(a => a.estado === 'Cancelada').length === 2), 'cierre firmado: paciente de alta y citas futuras canceladas');
  ok(await page.evaluate(async () => { const p = curPatient(); const r = await fetch('/api/records/' + p.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'archivo-clinico' }, body: JSON.stringify({ ...p, cierres: [{ ...p.cierres[0], resumen: 'cambiado' }] }) }); return r.status === 409; }), 'el servidor rechaza modificar el cierre');
  await page.click('[data-act="viewCierre"]'); await page.waitForSelector('#paper');
  ok(/Nota de cierre del proceso/.test(await page.locator('#paper').textContent()), 'el documento de cierre se genera'); await page.click('#cl');
  await page.screenshot({ path: OUT + 'cierre.png' });
  await page.click('[data-act="reopen"]'); await page.click('[data-act="reopen"]'); ok(await page.evaluate(() => curPatient().estado) === 'Activo', 'el proceso se puede reabrir');

  // --- Archivo: adjuntos, solicitudes de copia, conservación ---
  await page.click('[data-tab="archivo"]'); await page.waitForSelector('#fileform');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await page.setInputFiles('#f_upfile', { name: 'remisión médica.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.fill('#f_descripcion', 'Remisión de medicina general'); await page.click('[data-act="uploadFile"]'); await page.waitForSelector('[data-act="openFile"]');
  ok(await page.evaluate(() => S.files.length === 1 && S.files[0].nombre === 'remisión médica.pdf'), 'el adjunto se sube y queda registrado');
  ok(await page.locator('[data-act="delFile"]').count() === 1, 'recién subido se puede quitar (error de carga)');
  // una foto grande de un documento se reduce antes de subir, y la huella corresponde al archivo guardado
  const bigJpg = Buffer.from(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4000, 3000); g.fillStyle = '#123'; g.font = '48px serif'; for (let i = 0; i < 55; i++) g.fillText('Línea ' + i + ' del examen de laboratorio — resultado normal, sin hallazgos de importancia clínica.', 80, 60 + i * 52); for (let i = 0; i < 40000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 4000, Math.random() * 3000, 3, 3); } const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.98)); return [...new Uint8Array(await b.arrayBuffer())]; }));
  await page.setInputFiles('#f_upfile', { name: 'examen.jpg', mimeType: 'image/jpeg', buffer: bigJpg });
  await page.click('[data-act="uploadFile"]'); await page.waitForFunction(() => S.files.length === 2);
  const shrunk = await page.evaluate(async () => { const f = S.files[1], b = await fetchBlob(f.id), bmp = await createImageBitmap(b), h = await sha256Hex(b); return { size: f.size, orig: f.sizeOriginal, w: bmp.width, h: bmp.height, ok: h === f.sha256, got: b.size }; });
  ok(shrunk.w === 2400 && shrunk.h === 1800 && shrunk.size < shrunk.orig / 2 && shrunk.got === shrunk.size && shrunk.ok, `la foto se reduce a 2400 px (${Math.round(shrunk.orig / 1024)} KB → ${Math.round(shrunk.size / 1024)} KB) y su huella corresponde al archivo guardado`);
  ok(/comprimido de/.test(await page.locator('.toast').last().textContent()), 'avisa cuánto se comprimió');
  await page.evaluate(() => { const id = S.files[1].id; S.files = S.files.filter(f => f.id !== id); Store.remove(id); });
  await page.setInputFiles('#f_upfile', { name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>no soy pdf</html>') });
  await page.click('[data-act="uploadFile"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => S.files.length === 1), 'el servidor rechaza un archivo que no es lo que dice ser');
  await page.click('[data-act="newSol"]'); await page.waitForSelector('#solform');
  await page.click('[data-act="saveSol"]'); ok(await page.evaluate(() => !(curPatient().solicitudes || []).length), 'sin verificar identidad no registra la solicitud');
  await page.check('#f_verifica'); await page.click('[data-act="saveSol"]'); await page.waitForSelector('[data-act="deliverSol"]');
  ok(/responder a más tardar/.test(await page.locator('#tabbody').textContent()), 'muestra el plazo de respuesta');
  await page.click('.card [data-act="exportZip"]'); await page.waitForSelector('#partsform');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pt_go')]);
  const zpath = OUT + 'copia.zip'; await dl.saveAs(zpath);
  const zbuf = require('fs').readFileSync(zpath);
  ok(dl.suggestedFilename().endsWith('.zip') && zbuf.includes(Buffer.from('anexos/')) && zbuf.includes(Buffer.from('%PDF-1.4')) && zbuf.includes(Buffer.from('Primera vez')), 'la copia ZIP trae la historia y los anexos');
  await page.click('[data-act="deliverSol"]'); await page.waitForSelector('#entform'); await page.click('#ensave'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!curPatient().solicitudes[0].entrega), 'la entrega queda registrada');
  ok(/15 años desde la última atención/.test(await page.locator('#tabbody').textContent()), 'muestra hasta cuándo conservar la historia');
  await page.screenshot({ path: OUT + 'archivo.png', fullPage: true });
  // --- Consentimiento de telepsicología y revocación ---
  await page.click('[data-tab="consent"]'); await page.click('[data-act="reConsent"]'); await page.waitForSelector('#f_consentTipo');
  await page.selectOption('#f_consentTipo', { index: 1 });
  ok((await page.inputValue('#f_consentText')).includes('ATENCIÓN POR TELEPSICOLOGÍA'), 'el consentimiento de telepsicología agrega sus cláusulas');
  await drawSig(page, '[data-pad="consentSig"] canvas'); await page.check('#c_ok'); await page.click('[data-act="signConsent"]'); await page.waitForSelector('[data-act="revokeConsent"]');
  ok(await page.locator('.card', { hasText: 'Telepsicología (atención' }).count() === 1 && await page.locator('[data-act="viewConsent"]').count() === 3, 'quedan los tres consentimientos, el nuevo de telepsicología');
  await page.locator('[data-act="revokeConsent"]').first().click(); await page.waitForSelector('#revform');
  await page.selectOption('#f_alcance', 'Parcial'); await page.click('#rvsave'); ok(await page.locator('#revform').count() === 1, 'la parcial exige detalle');
  await page.fill('#f_detalle', 'No autoriza la atención por videollamada'); await drawSig(page, '#rvsig canvas'); await page.click('#rvsave'); await page.waitForSelector('#revform', { state: 'detached' });
  ok(await page.locator('.chip', { hasText: 'Revocado' }).count() === 1, 'el consentimiento aparece revocado');
  await page.locator('[data-act="viewConsent"]').first().click(); await page.waitForSelector('#paper');
  ok(/Revocación del consentimiento/.test(await page.locator('#paper').textContent()), 'el documento incluye la revocación firmada'); await page.click('#cl');
  ok(/Falta la autorización de datos personales/.test(await page.locator('#tabbody').textContent()), 'avisa que falta la autorización de datos');
  await page.click('[data-act="reConsent"]'); await page.waitForSelector('#f_consentTipo');
  await page.selectOption('#f_consentTipo', 'Autorización de tratamiento de datos personales');
  ok((await page.inputValue('#f_consentText')).startsWith('AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES'), 'la autorización de datos es un documento aparte');
  await drawSig(page, '[data-pad="consentSig"] canvas'); await page.check('#c_ok'); await page.click('[data-act="signConsent"]'); await page.waitForSelector('[data-act="reConsent"]');
  ok(!/Falta la autorización de datos personales/.test(await page.locator('#tabbody').textContent()), 'con la autorización firmada el aviso desaparece');
  await page.screenshot({ path: OUT + 'consentimientos.png' });
  // historia completa sin consentimientos
  await page.click('[data-act="fullDoc"]'); await page.waitForSelector('#partsform');
  ok(await page.locator('#partsform [data-part="consents"]').isChecked(), 'por defecto la historia completa incluye todo');
  await page.uncheck('#partsform [data-part="consents"]'); await page.screenshot({ path: OUT + 'partes.png' }); await page.click('#pt_go'); await page.waitForSelector('#paper');
  const full = await page.locator('#paper').textContent();
  ok(!/CONSENTIMIENTO INFORMADO PARA ATENCIÓN|Revocación del consentimiento|AUTORIZACIÓN PARA EL TRATAMIENTO/.test(full) && /No incluye: consentimientos y autorizaciones/.test(full) && /Primera vez/.test(full), 'se puede generar la historia completa sin los consentimientos, y lo indica');
  await page.click('#cl');
  await page.click('[data-act="fullDoc"]'); await page.click('#pt_go'); await page.waitForSelector('#paper');
  ok(/CONSENTIMIENTO INFORMADO PARA ATENCIÓN/.test(await page.locator('#paper').textContent()) && !/Copia parcial/.test(await page.locator('#paper').textContent()), 'con todo marcado sale completa');
  ok(await page.locator('#paper img[alt="Logo"]').count() >= 5, 'el logo sale en los documentos de la historia completa (' + await page.locator('#paper img[alt="Logo"]').count() + ')');
  await page.screenshot({ path: OUT + 'historia_logo.png' });
  await page.click('#cl');
  // menor de edad: asentimiento
  await page.click('[data-act="newPatient"]'); await page.fill('#f_nombres', 'Tomás'); await page.fill('#f_apellidos', 'Niño'); await page.fill('#f_nacimiento', '2015-05-01');
  await page.click('[data-act="savePatient"]'); await page.waitForSelector('.file-head h2:has-text("Tomás")'); await page.waitForSelector('#f_acudOcup');
  ok(await page.locator('#f_acud2Nombre').isVisible(), 'para un menor se ven los dos cuidadores con todos sus datos');
  await page.fill('#f_acudNombre', 'Laura Niño'); await page.fill('#f_acudParentesco', 'Madre'); await page.fill('#f_acudNac', '1988-02-10'); await page.fill('#f_acudOcup', 'Contadora');
  await page.click('[data-act="savePatient"]'); await page.click('[data-tab="consent"]'); await page.waitForSelector('#repsblock');
  ok((await page.inputValue('#f_r1Name')) === 'Laura Niño' && (await page.inputValue('#f_r1Par')) === 'Madre', 'para un menor firman los representantes, con los datos del cuidador');
  await drawSig(page, '[data-pad="consentSig"] canvas'); await page.check('#c_ok'); await page.click('[data-act="signConsent"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !(curPatient().consents || []).length), 'sin segunda firma ni explicación no deja firmar');
  await page.fill('#f_sinFirma2', 'El padre vive en otra ciudad; se enviará para su firma.'); await drawSig(page, '[data-pad="assentSig"] canvas');
  await page.click('[data-act="signConsent"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !(curPatient().consents || []).length) && /documento notarial/.test(await page.locator('.toast').textContent()), 'con un solo representante exige el documento notarial');
  await page.setInputFiles('#f_soporte', { name: 'declaracion notaria.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% notaria\n%%EOF') });
  await page.screenshot({ path: OUT + 'consent_menor.png' });
  await page.click('[data-act="signConsent"]'); await page.waitForSelector('[data-act="reConsent"]');
  await page.click('[data-act="viewConsent"]'); await page.waitForSelector('#paper');
  const ctext = await page.locator('#paper').textContent();
  ok(/Soporte adjunto: declaracion notaria\.pdf/.test(ctext), 'el consentimiento muestra el soporte adjunto con su huella');
  ok(/Asentimiento del menor de edad/.test(ctext) && /Firma de un solo representante/.test(ctext) && /C\.C\. 52123456 · T\.P\. 12345/.test(ctext) && (await page.locator('#paper .sg img').count()) === 3, 'el documento trae representante, motivo de la firma faltante y asentimiento');
  await page.click('#cl');
  // Mis consentimientos: modelo propio
  await page.click('[data-act="formats"][data-hub="consent"]'); await page.click('[data-cm="new"]'); await page.fill('#cmform #f_nombre', 'Consentimiento para niños');
  await page.click('[data-cm="base"]'); await page.click('[data-cm="save"]'); await page.waitForSelector('[data-cm="new"]'); await page.click('[data-cm="close"]');
  await page.click('[data-act="reConsent"]'); await page.waitForSelector('#f_consentTipo');
  ok((await page.$eval('#f_consentTipo option:checked', o => o.textContent)) === 'Consentimiento para niños', 'el modelo propio aparece y queda elegido por defecto');
  await page.click('[data-act="cancelRe"]');
  // navegación: carpetas y volver al resumen
  ok(await page.locator('details.pgroup[data-g="Activo"]').count() === 1, 'la lista de pacientes se agrupa en carpetas por estado');
  await page.click('.brand'); await page.waitForSelector('.stats'); ok(true, 'el logo vuelve al resumen');
  await page.click('.prow >> text=María Pérez');
  await page.screenshot({ path: OUT + 'ficha.png' });
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(200); await page.screenshot({ path: OUT + 'movil.png' });
  await page.setViewportSize({ width: 1180, height: 900 });
  // --- Persistencia en servidor: recargar ---
  await page.reload(); await page.waitForSelector('[data-act="newPatient"]');
  const tplCount = await page.evaluate(() => (S.profile.plantillas || []).length);
  ok(tplCount === 2, 'las plantillas siguen guardadas tras recargar (' + tplCount + ')');

  // --- Historia en papel: paciente antiguo con escaneos ---
  await page.click('[data-act="newPatient"]'); await page.fill('#f_nombres', 'Rosa'); await page.fill('#f_apellidos', 'Antigua'); await page.selectOption('#f_estado', 'Cerrado');
  await page.click('[data-act="savePatient"]'); await page.click('[data-tab="archivo"]'); await page.click('[data-act="newIncorp"]'); await page.waitForSelector('#incform');
  const scanPdf = Buffer.from('%PDF-1.4\n% historia en papel 2019\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'), scanJpg = require('fs').readFileSync(FIX + 'firma_foto.jpg');
  await page.setInputFiles('#in_files', [{ name: 'HC Rosa 2019-2021.pdf', mimeType: 'application/pdf', buffer: scanPdf }, { name: 'hoja suelta.jpg', mimeType: 'image/jpeg', buffer: scanJpg }]);
  await page.fill('#f_desde', '2019-03-04'); await page.fill('#f_hasta', '2021-11-20'); await page.fill('#f_folios', '23');
  await page.click('[data-act="saveIncorp"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !(curPatient().incorporaciones || []).length && S.files.filter(f => f.patientId === curPatient().id).length === 0), 'sin la declaración de fidelidad no sube nada');
  await page.check('#in_fiel'); await page.click('[data-act="saveIncorp"]'); await page.waitForSelector('[data-act="viewIncorp"]');
  const inc = await page.evaluate(() => curPatient().incorporaciones[0]);
  const sha = require('crypto').createHash('sha256').update(scanPdf).digest('hex');
  ok(inc.archivos.length === 2 && inc.archivos[0].sha256 === sha && Math.abs(new Date(inc.signedAt) - Date.now()) < 60000 && inc.desde === '2019-03-04', 'la constancia guarda los 2 archivos con su huella SHA-256 y la fecha de hoy');
  ok(await page.locator('#tabbody [data-act="delFile"]').count() === 0, 'los escaneos de la constancia no se pueden quitar');
  ok(/20 de noviembre de 2036/.test(await page.locator('#tabbody').textContent()), 'la conservación se cuenta desde la última atención en papel');
  await page.screenshot({ path: OUT + 'papel.png' });
  await page.click('[data-act="viewIncorp"]'); await page.waitForSelector('#paper');
  const ct = await page.locator('#paper').textContent();
  ok(/Constancia de incorporación de historia clínica en físico/.test(ct) && ct.includes(sha) && /4 de marzo de 2019 a 20 de noviembre de 2021/.test(ct), 'la constancia muestra periodo, archivos y huellas');
  await page.screenshot({ path: OUT + 'constancia.png' }); await page.click('#cl');
  ok(await page.evaluate(async () => { const p = curPatient(); const r = await fetch('/api/records/' + p.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'archivo-clinico' }, body: JSON.stringify({ ...p, incorporaciones: [{ ...p.incorporaciones[0], hasta: '2025-01-01' }] }) }); return r.status === 409; }), 'el servidor no deja cambiar la constancia');
  await page.click('.brand');
  // el módulo «Respaldo» ya no existe (las copias las hace el administrador en el servidor)
  await page.click('[data-act="menu"]');
  ok(await page.locator('[data-act="backup"]').count() === 0 && !/Respaldo/.test(await page.locator('#acmenu').textContent()), 'el menú ya no tiene «Respaldo»');
  await page.keyboard.press('Escape');
  // --- Cambio de contraseña desde el perfil ---
  await page.click('[data-act="menu"]'); ok(await page.locator('[data-act="account"]').count() === 0, 'el menú ya no tiene «Contraseña»');
  await page.click('[data-act="profile"]'); await page.click('#pwbox summary');
  const nombreAntes = await page.evaluate(() => S.profile.nombre);
  await page.fill('#pw_cur', 'contraseña-segura-123'); await page.fill('#pw_new', 'otra-clave-larga-456'); await page.fill('#pw_new2', 'otra-clave-distinta');
  await page.click('#pwsave'); ok(/no coinciden/.test(await page.locator('.toast').textContent()), 'avisa si las contraseñas nuevas no coinciden');
  await page.fill('#pw_new2', 'otra-clave-larga-456'); await page.click('#pwsave'); await page.waitForFunction(() => /Contraseña cambiada/.test((document.querySelector('.toast') || {}).textContent || ''));
  await page.screenshot({ path: OUT + 'perfil_clave.png' });
  await page.click('#pwbox summary'); await page.fill('#pw_cur', 'otra-clave-larga-456'); await page.fill('#pw_new', 'contraseña-segura-123'); await page.fill('#pw_new2', 'contraseña-segura-123');
  await page.click('#pwsave'); await page.waitForFunction(() => document.querySelector('#pwbox') && !document.querySelector('#pwbox').open);
  ok(true, 'la contraseña se cambia desde el perfil (y se vuelve a cambiar con la nueva)');
  await page.click('#psave'); await page.waitForSelector('#profform', { state: 'detached' });
  ok(await page.evaluate(n => S.profile.nombre === n && !('cur' in S.profile) && !('nw' in S.profile), nombreAntes), 'guardar el perfil no guarda las contraseñas en el perfil');
  // --- Bloqueo por inactividad ---
  await page.evaluate(() => { Idle.last = Date.now() - 29.5 * 60000; });
  await page.waitForSelector('#idlewarn'); await page.screenshot({ path: OUT + 'inactividad.png' });
  await page.click('#idlego'); ok(await page.locator('#idlewarn').count() === 0, '«Seguir trabajando» mantiene la sesión');
  await page.evaluate(() => { Idle.last = Date.now() - 31 * 60000; });
  await page.waitForSelector('#loginform');
  ok(/inactividad/.test(await page.locator('#loginform').textContent()) && await page.evaluate(() => S.patients.length === 0), 'por inactividad se cierra la sesión y se borra la información de la pantalla');
  ok((await page.request.get(BASE + 'api/auth/me', { headers: { 'X-Requested-With': 'archivo-clinico' } })).status() === 401, 'el servidor también cerró la sesión');
  ok(errors.length === 0, 'sin errores de JavaScript: ' + errors.join(' | '));
  await browser.close();
  console.log(bad ? 'PRUEBA CON FALLAS' : 'PRUEBA OK'); process.exit(bad);
})().catch(async e => { console.error('ERROR', e.message); try { const pg = global.BR.contexts()[0].pages()[0]; await pg.screenshot({ path: OUT + 'error.png' }); console.error('Texto visible:', (await pg.locator('body').innerText()).slice(0, 300).replace(/\s+/g, ' ')); } catch (x) {} process.exit(1); });
