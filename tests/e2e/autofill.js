// Ayuda para las pruebas que no tratan de los campos obligatorios: antes de guardar o firmar, llena con
// «No refiere» (o la primera opción) lo obligatorio que quedó vacío. formularios_e2e.js prueba la validación sin esto.
const fill = () => {
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  if (typeof S !== 'undefined' && (S.draft || document.getElementById('f_nacimiento'))) {
    const v = { f_tipoDoc: 'CC', f_documento: 'T' + Math.floor(Math.random() * 1e9), f_nacimiento: '1990-01-01', f_sexo: 'Femenino', f_nombres: 'Prueba', f_apellidos: 'Paciente' };
    Object.entries(v).forEach(([id, x]) => { const el = document.getElementById(id); if (el && !el.disabled && !el.value) set(el, x); });
  }
  document.querySelectorAll('.nrq').forEach(n => { const ta = n.parentElement.querySelector('textarea, input'); if (ta && !ta.value.trim()) set(ta, n.querySelector('button').textContent); });
  // Datos: los vacíos de cada apartado con «No responde»; las listas sin esa opción, con la primera
  if (document.getElementById('f_nombres')) document.querySelectorAll('#tabbody [data-f]').forEach(el => { if (el.disabled || el.closest('[hidden]') || el.type === 'checkbox' || /Ind$/.test(el.dataset.f) || el.tagName === 'SELECT' || String(el.value || '').trim()) return; if (el.type === 'date') el.type = 'text'; set(el, 'No responde'); });
  if (document.getElementById('f_nombres')) document.querySelectorAll('#tabbody select[data-f]').forEach(el => { if (!el.value && !el.disabled && !el.closest('[hidden]') && el.options.length > 1) set(el, el.options[1].value); });
  ['f_riesgoNivel', 'f_copia'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) set(el, el.options[1].value); });
};
module.exports = page => {
  const click = page.click.bind(page);
  page.click = async (sel, o) => { if (/savePatient|saveIntake|saveNote|saveScale|signConsent/.test(sel)) await page.evaluate(fill).catch(() => { }); return click(sel, o); };
  return page;
};
