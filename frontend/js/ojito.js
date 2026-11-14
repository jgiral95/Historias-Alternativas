/* «Ojito» en todas las contraseñas: muestra u oculta lo escrito. Se pone solo a cada campo de contraseña que aparezca. */
(function () {
  const OJO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const TACHADO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/></svg>';
  function poner(inp) {
    if (inp.dataset.ojito) return;
    inp.dataset.ojito = '1';
    const w = document.createElement('span'); w.className = 'pwwrap';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pwojo'; b.setAttribute('aria-label', 'Mostrar contraseña'); b.setAttribute('title', 'Mostrar contraseña'); b.innerHTML = OJO;
    b.addEventListener('click', () => {
      const ver = inp.type === 'password'; inp.type = ver ? 'text' : 'password';
      const txt = ver ? 'Ocultar contraseña' : 'Mostrar contraseña';
      b.innerHTML = ver ? TACHADO : OJO; b.setAttribute('aria-label', txt); b.setAttribute('title', txt); inp.focus();
    });
    w.appendChild(b);
  }
  const buscar = r => { if (r.querySelectorAll) r.querySelectorAll('input[type=password]:not([data-ojito])').forEach(poner); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('input[type=password]')) poner(n); else buscar(n); } }))).observe(document.documentElement, { childList: true, subtree: true });
  buscar(document);
})();
