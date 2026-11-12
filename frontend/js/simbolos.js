/* Banco de símbolos: mientras se escribe en cualquier campo de texto, el botón «✦ Símbolos» abre un panel (signos zodiacales,
   planetas, aspectos y otros) y pone el símbolo donde está el cursor. */
const SIMBOLOS = [
  ['Signos zodiacales', [['♈', 'Aries'], ['♉', 'Tauro'], ['♊', 'Géminis'], ['♋', 'Cáncer'], ['♌', 'Leo'], ['♍', 'Virgo'], ['♎', 'Libra'], ['♏', 'Escorpio'], ['♐', 'Sagitario'], ['♑', 'Capricornio'], ['♒', 'Acuario'], ['♓', 'Piscis']]],
  ['Planetas y puntos', [['☉', 'Sol'], ['☽', 'Luna'], ['☿', 'Mercurio'], ['♀', 'Venus'], ['♂', 'Marte'], ['♃', 'Júpiter'], ['♄', 'Saturno'], ['♅', 'Urano'], ['♆', 'Neptuno'], ['♇', 'Plutón'], ['⚷', 'Quirón'], ['☊', 'Nodo norte'], ['☋', 'Nodo sur'], ['⚸', 'Lilith']]],
  ['Aspectos', [['☌', 'Conjunción'], ['⚹', 'Sextil'], ['□', 'Cuadratura'], ['△', 'Trígono'], ['☍', 'Oposición'], ['℞', 'Retrógrado']]],
  ['Otros', [['✦', 'Estrella'], ['☯', 'Yin yang'], ['☀', 'Sol radiante'], ['☾', 'Luna creciente'], ['❂', 'Rueda'], ['✿', 'Flor'], ['☘', 'Trébol'], ['→', 'Flecha'], ['✓', 'Listo']]],
];
const SIM = { campo: null, abierto: false };
const simCampo = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', ''].includes(el.type) && !el.readOnly)) && !el.disabled && !el.closest('#simpanel');
function simUI() {
  let b = $('#simbtn'); if (!b) { b = document.createElement('button'); b.id = 'simbtn'; b.type = 'button'; b.className = 'btn'; b.textContent = '✦ Símbolos'; b.setAttribute('aria-haspopup', 'dialog'); b.hidden = true; document.body.appendChild(b); }
  let p = $('#simpanel'); if (!p) { p = document.createElement('div'); p.id = 'simpanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Banco de símbolos'); p.hidden = true;
    p.innerHTML = SIMBOLOS.map(([t, l]) => `<div class="simt">${t}</div><div class="simg">${l.map(([c, n]) => `<button type="button" class="simb" data-sim="${c}" title="${n}" aria-label="${n}">${c}</button>`).join('')}</div>`).join(''); document.body.appendChild(p); }
  return [b, p];
}
function simShow() { const [b, p] = simUI(), on = SIM.campo && document.body.contains(SIM.campo); b.hidden = !on; if (!on) p.hidden = true; }
document.addEventListener('focusin', e => { if (simCampo(e.target)) { SIM.campo = e.target; simShow(); } else if (!e.target.closest('#simbtn, #simpanel')) { SIM.campo = null; simShow(); } });
document.addEventListener('mousedown', e => { if (e.target.closest('#simbtn, #simpanel')) e.preventDefault(); });  // no quita el foco del campo
document.addEventListener('click', e => {
  const [b, p] = simUI();
  if (e.target.closest('#simbtn')) { p.hidden = !p.hidden; return; }
  const s = e.target.closest('[data-sim]'); if (s && SIM.campo) {
    const el = SIM.campo, c = s.dataset.sim + (/[♈-♓]/.test(s.dataset.sim) ? '︎' : '');
    const i = el.selectionStart ?? el.value.length, j = el.selectionEnd ?? i;
    if (el.maxLength > 0 && el.value.length - (j - i) + c.length > el.maxLength) return;
    el.setRangeText(c, i, j, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return;
  }
  if (!p.hidden && !e.target.closest('#simpanel')) p.hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#simpanel') && !$('#simpanel').hidden) { $('#simpanel').hidden = true; e.stopPropagation(); } }, true);
