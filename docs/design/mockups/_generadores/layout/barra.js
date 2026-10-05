// Barra lateral en tres bloques (spec 007 CA-19) para shared/layout y su cajón móvil:
//   1. arriba (.sb-arriba): logo, plan y navegación (principal y de la cuenta, con «Espacio» de 007 D-18);
//   2. región central (.sb-centro): lo que no cabe se desplaza aquí, sin mover los otros dos bloques;
//   3. pie (.sb-pie): la tarjeta de cuota de 007 (espacio/espacio.js), siempre visible.
// La región central recibe su contenido por parámetro (`central`). Hoy es «Carpetas» (regionCarpetas); la spec 006
// (CA-27, CA-28) la reemplaza por «Accesos rápidos» (fijados + recientes) pasando otro `central`, sin tocar los
// bloques 1 y 3. Los estados anteriores del layout siguen con marco.sidebar/marco.cajon y su HTML no cambia.
const M = require('../marco/marco.js');
const Q = require('../espacio/espacio.js');

const { icon } = M;

// ---------- Bloque 1: navegación (sin «Carpetas»: esa sección vive en la región central) ----------
function navegacion({ activo, contadorPapelera, idPrimerEnlace = '' }) {
  return Q.conItemEspacio(M.navegacion({ activo, carpetas: [], contadorPapelera, idPrimerEnlace }), activo);
}

// ---------- Bloque 2: contenido por defecto de la región central ----------
// nombres: carpetas de primer nivel (solo el nombre: FolderRef no trae cantidades, como en 006).
function regionCarpetas(nombres) {
  const items = nombres.map((n) => `\n            <li><a href="#">${icon('folder')}<span>${n}</span></a></li>`).join('');
  return `<nav class="sb-seccion" aria-label="Carpetas">
          <p class="nav-title" aria-hidden="true">Carpetas</p>
          <ul class="nav">${items}
          </ul>
        </nav>`;
}

const centro = (central) => `
      <div class="sb-centro">
        ${central}
      </div>`;
const pie = (q) => `
      <div class="sb-pie">
      ${Q.tarjeta(q)}
      </div>`;

// ---------- Barra lateral de escritorio ----------
// o = { activo, plan, cuota, contadorPapelera, central }
function sidebar(o) {
  return `
    <aside class="sidebar sb-bloques" aria-label="Barra lateral">
      <div class="sb-arriba">
        <div class="brand-row">
          ${M.logo()}
          <span class="plan-chip">${o.plan}</span>
        </div>
        ${navegacion(o)}
      </div>${centro(o.central)}${pie(o.cuota)}
    </aside>`;
}

// ---------- Cajón móvil (por debajo de 900 px): los mismos tres bloques dentro del diálogo ----------
function cajon(o) {
  const oculto = o.abierto ? '' : ' hidden';
  return `
  <div class="drawer-overlay" data-cerrar-cajon aria-hidden="true"${oculto}></div>
  <div class="drawer sb-bloques" id="cajon" role="dialog" aria-modal="true" aria-labelledby="cajon-t"${oculto}>
      <div class="sb-arriba">
        <div class="drawer-head">
          ${M.logo()}
          <span class="plan-chip">${o.plan}</span>
          <h2 id="cajon-t" class="sr-only">Menú de navegación</h2>
          <button class="icon-btn" type="button" data-cerrar-cajon aria-label="Cerrar menú">${icon('x', 22)}</button>
        </div>
        ${navegacion({ ...o, idPrimerEnlace: 'cajon-primero' })}
      </div>${centro(o.central)}${pie(o.cuota)}
  </div>`;
}

// ---------- CSS ----------
// La barra (y el cajón) es una columna flexible: arriba y pie con su alto natural; la región central toma el resto y
// se desplaza sola. El borde inferior difuminado aparece solo si hay más contenido debajo (clase sb-desborda).
const CSS = `
  /* Barra lateral en tres bloques (007 CA-19): navegación, región central con desplazamiento propio y cuota al pie */
  .sb-bloques { min-height: 0; }
  .sb-arriba { display: flex; flex-direction: column; gap: 14px; flex: none; }
  .sb-centro { position: relative; flex: 1 1 auto; min-height: 0; margin: 0 -6px; padding: 2px 6px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .sb-seccion .nav-title { margin-top: 0; margin-bottom: 4px; }
  .sb-pie { flex: none; }
  .sb-pie .quota { margin-top: 0; }
  .sb-desborda > .sb-centro::after { content: ""; position: sticky; bottom: -2px; display: block; height: 28px; margin-top: -28px; background: linear-gradient(transparent, var(--card)); pointer-events: none; }
  .drawer.sb-bloques { overflow: hidden; }
`;

// Marca la región central que tiene más contenido debajo (difuminado del borde inferior). ResizeObserver cubre el cajón,
// que mide 0 mientras está oculto.
const JS = `
(function () {
  Array.prototype.forEach.call(document.querySelectorAll('.sb-centro'), function (c) {
    function marcar() { c.parentNode.classList.toggle('sb-desborda', c.scrollHeight - c.clientHeight - c.scrollTop > 1); }
    c.addEventListener('scroll', marcar);
    new ResizeObserver(marcar).observe(c);
    marcar();
  });
})();
`;

module.exports = { sidebar, cajon, regionCarpetas, CSS, JS };
