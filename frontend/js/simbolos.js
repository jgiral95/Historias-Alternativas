/* Banco de símbolos: mientras se escribe en cualquier campo de texto, el botón «✦ Símbolos» abre un panel (signos zodiacales,
   planetas, aspectos y otros) y pone el símbolo donde está el cursor. */
const SIMBOLOS = [
  ['Signos zodiacales', [['♈', 'Aries'], ['♉', 'Tauro'], ['♊', 'Géminis'], ['♋', 'Cáncer'], ['♌', 'Leo'], ['♍', 'Virgo'], ['♎', 'Libra'], ['♏', 'Escorpio'], ['♐', 'Sagitario'], ['♑', 'Capricornio'], ['♒', 'Acuario'], ['♓', 'Piscis']]],
  ['Planetas y puntos', [['☉', 'Sol'], ['☽', 'Luna'], ['☿', 'Mercurio'], ['♀', 'Venus'], ['♂', 'Marte'], ['♃', 'Júpiter'], ['♄', 'Saturno'], ['♅', 'Urano'], ['♆', 'Neptuno'], ['♇', 'Plutón'], ['⚷', 'Quirón'], ['☊', 'Nodo norte'], ['☋', 'Nodo sur'], ['⚸', 'Lilith']]],
  ['Aspectos', [['☌', 'Conjunción'], ['⚹', 'Sextil'], ['□', 'Cuadratura'], ['△', 'Trígono'], ['☍', 'Oposición'], ['℞', 'Retrógrado']]],
  ['Otros', [['✦', 'Estrella'], ['☯', 'Yin yang'], ['☀', 'Sol radiante'], ['☾', 'Luna creciente'], ['❂', 'Rueda'], ['✿', 'Flor'], ['☘', 'Trébol'], ['→', 'Flecha'], ['✓', 'Listo']]],
];
const SIM = { campo: null, abierto: false };
const SIM_ICO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14.2A7.5 7.5 0 1 1 9.8 5a6 6 0 0 0 9.2 9.2z"/><path d="M17.5 3.5v3M16 5h3" stroke-width="1.5"/></svg>';
const simCampo = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', ''].includes(el.type) && !el.readOnly)) && !el.disabled && !el.closest('#simpanel');
function simUI() {
  let b = $('#simbtn'); if (!b) { b = document.createElement('button'); b.id = 'simbtn'; b.type = 'button'; b.className = 'simcir'; b.innerHTML = SIM_ICO; b.title = 'Símbolos'; b.setAttribute('aria-label', 'Símbolos'); b.setAttribute('aria-haspopup', 'dialog'); b.hidden = true; document.body.appendChild(b); }
  let p = $('#simpanel'); if (!p) { p = document.createElement('div'); p.id = 'simpanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Banco de símbolos'); p.hidden = true;
    p.innerHTML = SIMBOLOS.map(([t, l]) => `<div class="simt">${t}</div><div class="simg">${l.map(([c, n]) => `<button type="button" class="simb" data-sim="${c}" title="${n}" aria-label="${n}">${c}</button>`).join('')}</div>`).join(''); document.body.appendChild(p); }
  return [b, p];
}
function simPos() {  // el botón circular va a la derecha del campo que se edita; el panel se abre debajo (o arriba si no cabe)
  const [b, p] = simUI(), el = SIM.campo, on = el && document.body.contains(el);
  document.querySelectorAll('.simcampo').forEach(x => { if (x !== el) x.classList.remove('simcampo'); });
  if (!on) { b.hidden = true; p.hidden = true; return; }
  const r = el.getBoundingClientRect(), vh = (window.visualViewport && visualViewport.height) || innerHeight, tam = 30;
  if (r.bottom < 0 || r.top > vh) { b.hidden = true; p.hidden = true; return; }
  el.classList.add('simcampo'); b.hidden = false;
  const top = el.tagName === 'TEXTAREA' || r.height > 60 ? Math.max(r.top, 0) + 8 : r.top + (r.height - tam) / 2;
  b.style.left = Math.max(4, r.right - tam - 8) + 'px'; b.style.top = Math.max(4, top) + 'px';
  if (!p.hidden && simMovil()) { p.style.cssText = 'left:8px;right:8px;top:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));width:auto;max-height:44vh'; }
  else if (!p.hidden) {
    p.style.right = ''; p.style.bottom = '';
    const w = Math.min(340, innerWidth - 16), h = Math.min(p.scrollHeight + 2, vh * 0.5), debajo = vh - r.bottom - 8 >= h || r.top < h + 8;
    p.style.width = w + 'px'; p.style.maxHeight = vh * 0.5 + 'px';
    p.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) + 'px';
    p.style.top = debajo ? Math.min(r.bottom + 6, vh - h - 8) + 'px' : Math.max(8, r.top - h - 6) + 'px';
  }
}
const simMovil = () => innerWidth <= 640;
function simAbrir() {  // en celular el panel va abajo, en lugar del teclado: se oculta el teclado sin perder el campo ni el cursor
  const [, p] = simUI(), el = SIM.campo; if (!el) return;
  p.hidden = false;
  if (simMovil()) {
    SIM.im = el.getAttribute('inputmode'); el.setAttribute('inputmode', 'none'); document.body.classList.add('simabierto');
    el.blur(); el.focus({ preventScroll: true }); setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
  simShow();
}
function simCerrar(volver) {
  const p = $('#simpanel'), el = SIM.campo; if (!p || p.hidden) return;
  p.hidden = true; document.body.classList.remove('simabierto');
  if (el && el.getAttribute('inputmode') === 'none') { if (SIM.im == null) el.removeAttribute('inputmode'); else el.setAttribute('inputmode', SIM.im); if (volver && document.body.contains(el)) { el.blur(); el.focus(); } }
  simShow();
}
let simRaf = 0;
const simShow = () => { cancelAnimationFrame(simRaf); simRaf = requestAnimationFrame(simPos); };
['scroll', 'resize'].forEach(ev => window.addEventListener(ev, simShow, true));
if (window.visualViewport) visualViewport.addEventListener('resize', simShow);
document.addEventListener('input', e => { if (e.target === SIM.campo) simShow(); });
document.addEventListener('focusin', e => { if (simCampo(e.target)) { if (SIM.campo !== e.target) simCerrar(false); SIM.campo = e.target; simShow(); } else if (!e.target.closest('#simbtn, #simpanel')) { simCerrar(false); SIM.campo = null; simShow(); } });
document.addEventListener('mousedown', e => { if (e.target.closest('#simbtn, #simpanel')) e.preventDefault(); });  // no quita el foco del campo
document.addEventListener('click', e => {
  const [b, p] = simUI();
  if (e.target.closest('#simbtn')) { if (p.hidden) simAbrir(); else simCerrar(true); return; }
  const s = e.target.closest('[data-sim]'); if (s && SIM.campo) {
    const el = SIM.campo, c = s.dataset.sim + (/[♈-♓]/.test(s.dataset.sim) ? '︎' : '');
    const i = el.selectionStart ?? el.value.length, j = el.selectionEnd ?? i;
    if (el.maxLength > 0 && el.value.length - (j - i) + c.length > el.maxLength) return;
    el.setRangeText(c, i, j, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); if (!simMovil()) el.focus(); return;
  }
  if (!p.hidden && !e.target.closest('#simpanel')) simCerrar(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#simpanel') && !$('#simpanel').hidden) { simCerrar(true); e.stopPropagation(); } }, true);

/* Atajos con barra invertida: al escribir «\virgo» (o «\virgo» + espacio) el texto se cambia por ♍. Sirve con el nombre en español
   (sin tildes ni espacios: \nodonorte, \luna) y con los signos y planetas en inglés (\scorpio, \moon). Si el nombre es el comienzo de otro
   más largo (\sol, \luna), se cambia al escribir un espacio o un salto de línea. */
const SIM_AL = (() => {
  const n = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''), m = {};
  SIMBOLOS.forEach(([, l]) => l.forEach(([c, nom]) => { m[n(nom)] = c; }));
  const en = { aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
    sun: '☉', moon: '☽', mercury: '☿', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', chiron: '⚷', northnode: '☊' };
  return Object.assign(m, en);
})();
document.addEventListener('input', e => {
  const el = e.target; if (!simCampo(el) || !/^insert/.test(e.inputType || '')) return;
  const i = el.selectionStart; if (i == null || i !== el.selectionEnd) return;
  const q = el.value.slice(Math.max(0, i - 24), i).match(/\\([A-Za-zÁÉÍÓÚáéíóúÑñ]+)([ \n]?)$/); if (!q) return;
  const k = q[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), c0 = SIM_AL[k]; if (!c0) return;
  if (!q[2] && Object.keys(SIM_AL).some(x => x !== k && x.startsWith(k))) return;
  const c = c0 + (/[♈-♓]/.test(c0) ? '︎' : '') + q[2], j = i - q[0].length;
  el.setRangeText(c, j, i, 'end'); el.dispatchEvent(new Event('input', { bubbles: true }));
});
