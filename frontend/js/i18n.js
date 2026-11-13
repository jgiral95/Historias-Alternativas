/* Idioma ES/EN. Va primero en app.html. Las claves son el texto en español; I18N.add({ 'texto': 'text' }) registra traducciones.
   Claves con {0}, {1}… coinciden por patrón. t(texto, ...args) traduce y sustituye {n}. En inglés, un observador traduce
   los textos que la app pinta (nodos de texto, placeholder, title, aria-label) y alert/confirm/prompt. Los diccionarios están en js/en-*.js. */
(function () {
  const D = new Map(), P = [];
  let lang = 'es';
  /* Páginas públicas (window.I18N_PUBLIC): el idioma viene de ?lang=en o del campo «idioma» que devuelve la API del terapeuta. */
  const PUB = !!window.I18N_PUBLIC;
  if (PUB) lang = /[?&]lang=en\b/.test(location.search) ? 'en' : 'es';
  else try {
    /* ?lang=en (enlaces de las páginas en inglés, p. ej. crear cuenta o confirmar correo) fija el idioma de este navegador */
    if (/[?&]lang=en\b/.test(location.search)) localStorage.setItem('ak_lang', 'en');
    lang = localStorage.getItem('ak_lang') === 'en' ? 'en' : 'es';
  } catch (e) { /* sin almacenamiento */ }
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function add(o) {
    for (const k in o) {
      if (/\{\d+\}/.test(k)) P.push([new RegExp('^' + norm(k).split(/\{\d+\}/).map(esc).join('(.+?)') + '$'), o[k], (k.match(/\{\d+\}/g) || []).map(x => +x.slice(1, -1))]);
      else D.set(norm(k), o[k]);
    }
  }
  function tr(s) {
    if (lang === 'es' || !s) return s;
    const k = norm(s); if (!k) return s;
    if (D.has(k)) return D.get(k);
    for (const [re, v, ord] of P) { const m = k.match(re); if (m) return v.replace(/\{(\d+)\}/g, (_, i) => { const g = m[ord.indexOf(+i) + 1] || ''; return tr(g) || g; }); }
    return s;
  }
  function t(s, ...a) { return tr(s).replace(/\{(\d+)\}/g, (_, i) => (a[+i] === undefined ? '' : a[+i])); }
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
  const ATTR = ['placeholder', 'title', 'aria-label', 'alt'];
  function node(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue; if (!v.trim() || (n.parentNode && SKIP.test(n.parentNode.nodeName))) return;
      const r = tr(v.trim()); if (r !== v.trim()) n.nodeValue = v.replace(v.trim(), r);
    } else if (n.nodeType === 1 && !SKIP.test(n.nodeName)) {
      ATTR.forEach(a => { if (n.hasAttribute(a)) { const v = n.getAttribute(a), r = tr(v); if (r !== v) n.setAttribute(a, r); } });
      if (n.nodeName === 'INPUT' && /^(button|submit)$/.test(n.type)) { const r = tr(n.value); if (r !== n.value) n.value = r; }
      /* El valor de un <option> sin value es su texto: se fija en español antes de traducir para no guardar datos en inglés. */
      if (n.nodeName === 'OPTION' && !n.hasAttribute('value')) n.setAttribute('value', n.textContent);
      n.childNodes.forEach(node);
    }
  }
  function start() {
    if (lang === 'es') return;
    document.documentElement.lang = 'en';
    document.title = tr(document.title);
    node(document.body);
    new MutationObserver(ms => ms.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(node);
      else if (m.type === 'characterData') node(m.target);
      else if (m.type === 'attributes') node(m.target);
    })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    ['alert', 'confirm', 'prompt'].forEach(f => { const o = window[f]; window[f] = (m, ...r) => o.call(window, tr(String(m)), ...r); });
  }
  function use(l) { if (l === 'en' && lang !== 'en') { lang = 'en'; start(); } }
  if (PUB && window.fetch) {
    const of = window.fetch.bind(window);
    window.fetch = async (...a) => { const r = await of(...a); try { r.clone().json().then(j => { if (j && j.idioma) use(j.idioma); }).catch(() => {}); } catch (e) { /* sin cuerpo */ } return r; };
  }
  const NOMBRES = { es: 'Español', en: 'English' };
  window.I18N = {
    add, tr, use, get lang() { return lang; }, nombres: NOMBRES, locale: () => (lang === 'en' ? 'en-US' : 'es-CO'),
    /* Cambia el idioma y recarga para repintar todo. */
    set(v) { const n = /^en/i.test(v) ? 'en' : 'es'; if (n === lang) return false; try { localStorage.setItem('ak_lang', n); } catch (e) { /* sin almacenamiento */ } location.reload(); return true; },
    /* Aplica el idioma guardado en el perfil del terapeuta (si cambia, recarga). */
    fromProfile(p) { return !!(p && p.idioma && this.set(p.idioma)); }
  };
  window.t = t;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
