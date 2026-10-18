// Script del menú ⋮ por fila: mismo comportamiento de teclado que el menú de la cuenta (shared/layout). Separado de
// estados.js (Art. IV); el CSS del menú es CSS_MENU_FILA de mis-archivos.js.
exports.JS_MENU = `
(function () {
  var botones = Array.prototype.slice.call(document.querySelectorAll('.row-btn'));
  function partes(btn) {
    var menu = document.getElementById(btn.getAttribute('aria-controls'));
    return { menu: menu, items: Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]')) };
  }
  function cerrar(btn, devolverFoco) {
    var p = partes(btn);
    if (p.menu.hidden) return;
    p.menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btn.focus();
  }
  function abrir(btn, i) {
    botones.forEach(function (b) { if (b !== btn) cerrar(b, false); });
    var p = partes(btn);
    p.menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    p.items[(i + p.items.length) % p.items.length].focus();
  }
  botones.forEach(function (btn) {
    var p = partes(btn);
    btn.addEventListener('click', function () { if (p.menu.hidden) abrir(btn, 0); else cerrar(btn, true); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); abrir(btn, 0); }
      if (e.key === 'ArrowUp') { e.preventDefault(); abrir(btn, -1); }
    });
    p.menu.addEventListener('keydown', function (e) {
      var i = p.items.indexOf(document.activeElement), n = p.items.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); p.items[(i + 1) % n].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); p.items[(i - 1 + n) % n].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); p.items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); p.items[n - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrar(btn, true); }
      else if (e.key === 'Tab') { cerrar(btn, false); }
    });
    // En la app, «Descargar» pide la URL firmada (POST /files/:id/download-url) y el navegador descarga el archivo.
    p.items.forEach(function (it) { it.addEventListener('click', function () { cerrar(btn, true); }); });
    if (btn.getAttribute('aria-expanded') === 'true') p.items[0].focus();
  });
  document.addEventListener('click', function (e) {
    botones.forEach(function (btn) {
      var p = partes(btn);
      if (!p.menu.hidden && !p.menu.contains(e.target) && !btn.contains(e.target)) cerrar(btn, false);
    });
  });
})();
`;
