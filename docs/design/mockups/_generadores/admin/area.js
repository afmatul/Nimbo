// Marco del área de administración (spec 011): íconos, persona, barra lateral, cajón, barra superior, CSS común del
// área, comportamiento y página. Lo usan admin/generar.js (cuentas y ficha) y alta-interna/generar.js (alta interna).
// El CSS del marco de la aplicación (tokens, barra lateral, barra superior, botones, diálogo, cajón y cortes 900/600 px)
// viene de marco/marco.js; aquí solo se agrega lo propio del área (otra navegación y otra persona) con las mismas clases.
const M = require('../marco/marco.js');

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const P = {
  ...M.P,
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
  minus: '<path d="M5 12h14"/>',
  fileSearch: '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M4.27 21a2 2 0 0 0 1.73 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="m9 18-1.5-1.5"/><circle cx="5" cy="14" r="3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  badgeId: '<rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.2 1.7-2 3-2s2.5.8 3 2"/><path d="M15 10h3"/><path d="M15 14h3"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
};
const icon = (name, size = 18, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;

// ---------- Datos del área (en la app vienen de la API) ----------
const YO = { nombre: 'Mónica Herrera', iniciales: 'MH', rol: 'Administrador', correo: 'monica.herrera@nimbo.gt' };
const TOTAL = '1 284';
const AVISO_PRIVACIDAD = 'La administración muestra metadatos de los archivos (nombre, tipo, tamaño, fechas), nunca su contenido.';

// ---------- CSS ----------
// Marco de la aplicación + piezas comunes del área. Cada pantalla agrega el suyo después.
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Común del área de administración (spec 011) */
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }
  .num { font-variant-numeric: tabular-nums; }

  /* Barra lateral del área de administración: persona abajo en lugar de la cuota */
  .area-chip { color: var(--primary-foreground); background: var(--secondary-foreground); }
  .who { margin-top: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 14px; background: var(--card); }
  .who p { margin: 0; }
  .who-name { font-size: 13.5px; font-weight: 600; }
  .who-role { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; color: var(--secondary-foreground); }
  .who-role .ico { color: var(--primary); }

  /* Encabezado de página */
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; }
  .page-head p { margin-top: 4px; }

  /* Aviso de privacidad (Alert de shadcn, variante informativa): ícono + texto, nunca solo color */
  .privacy { display: flex; align-items: flex-start; gap: 10px; margin: 20px 0 0; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--card)); border-radius: var(--radius-lg); background: var(--brand-soft); font-size: 13.5px; color: var(--foreground); }
  .privacy .ico { margin-top: 2px; color: var(--primary); }
  .privacy p { margin: 0; }

  /* Volver, tarjeta, recuadro informativo y avisos (Alert de shadcn) */
  .crumbs a { display: inline-flex; align-items: center; min-height: 24px; } /* objetivo táctil de 24 px (WCAG 2.5.8) */
  .back { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; font-size: 13.5px; font-weight: 500; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 20px; }
  .card h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  .card > .sub { margin: 0 0 12px; font-size: 13px; color: var(--muted-foreground); }
  .info-box { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--muted); font-size: 13.5px; color: var(--secondary-foreground); }
  .info-box .ico { margin-top: 2px; color: var(--secondary-foreground); }
  .info-box p { margin: 0; }
  .info-box strong { display: block; color: var(--foreground); font-weight: 600; }
  .alert { display: flex; align-items: flex-start; gap: 12px; margin: 20px 0 0; padding: 14px 16px; border-radius: var(--radius-lg); }
  .alert > .ico { margin-top: 2px; flex: none; }
  .alert p { margin: 0; }
  .alert-title { font-size: 14px; font-weight: 600; }
  .alert-text { margin-top: 2px !important; font-size: 13.5px; color: var(--foreground); }
  .alert-ok { border: 1px solid color-mix(in srgb, var(--success) 45%, var(--card)); background: var(--success-soft); }
  .alert-ok > .ico, .alert-ok .alert-title { color: var(--success-foreground); }

  @media (max-width: 900px) {
    .who { margin-top: 8px; }
  }
  @media (max-width: 600px) {
    .app { min-height: 0; }
    .privacy { padding: 12px; margin-top: 16px; }
    .card { padding: 16px; }
    .back { min-height: 44px; }
    .alert { padding: 12px; }
  }
`;

// ---------- Comportamiento: cajón móvil (sin el resto del marco del cliente) ----------
const JS = `
(function () {
  var app = document.querySelector('.app');
  var btn = document.querySelector('.menu-btn');
  var cajon = document.getElementById('cajon');
  var velo = document.querySelector('.drawer-overlay');
  var primero = document.getElementById('cajon-primero');
  var conDialogo = !!document.querySelector('.dialog');
  function abrir() { cajon.hidden = false; velo.hidden = false; btn.setAttribute('aria-expanded', 'true'); app.inert = true; primero.focus(); }
  function cerrar() { cajon.hidden = true; velo.hidden = true; btn.setAttribute('aria-expanded', 'false'); app.inert = conDialogo; btn.focus(); }
  btn.addEventListener('click', abrir);
  Array.prototype.forEach.call(document.querySelectorAll('[data-cerrar-cajon]'), function (el) { el.addEventListener('click', cerrar); });
  cajon.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); cerrar(); } });
  // Diálogo: el foco empieza en «Cancelar» (autofocus); en la app, Escape o «Cancelar» lo cierran sin cambiar nada.
  var dlg = document.querySelector('.dialog');
  if (dlg) dlg.querySelector('[autofocus]').focus();
})();
`;

// ---------- Piezas del marco del área ----------
const NAV = [['users', 'Cuentas', TOTAL], ['grid', 'Catálogo de planes'], ['chart', 'Métricas']];

function navegacion(idPrimero = '') {
  let primero = !!idPrimero;
  const items = NAV.map(([ic, label, meta]) => {
    const id = primero ? ` id="${idPrimero}"` : '';
    primero = false;
    const cur = label === 'Cuentas' ? ' aria-current="page"' : '';
    return `\n          <li><a href="#"${id}${cur}>${icon(ic)}<span>${label}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</a></li>`;
  }).join('');
  return `<nav aria-label="Navegación de administración">
        <ul class="nav">${items}
        </ul>
      </nav>`;
}

const logo = (cls = 'logo') =>
  `<a class="${cls}" href="#" aria-label="Nimbo, Administración"><span class="logo-mark" aria-hidden="true">N</span><span>NIMBO</span></a>`;
const chip = '<span class="plan-chip area-chip">ADMIN</span>';
const quien = `<div class="who">
        <p class="who-name">${YO.nombre}</p>
        <p class="who-role">${icon('shield', 14)}<span>${YO.rol}</span></p>
      </div>`;

const sidebar = () => `
    <aside class="sidebar" aria-label="Barra lateral">
      <div class="brand-row">
        ${logo()}
        ${chip}
      </div>
      ${navegacion()}
      ${quien}
    </aside>`;

const cajon = () => `
  <div class="drawer-overlay" data-cerrar-cajon aria-hidden="true" hidden></div>
  <div class="drawer" id="cajon" role="dialog" aria-modal="true" aria-labelledby="cajon-t" hidden>
      <div class="drawer-head">
        ${logo()}
        ${chip}
        <h2 id="cajon-t" class="sr-only">Menú de navegación</h2>
        <button class="icon-btn" type="button" data-cerrar-cajon aria-label="Cerrar menú">${icon('x', 22)}</button>
      </div>
      ${navegacion('cajon-primero')}
      ${quien}
  </div>`;

function topbar(crumbs) {
  const items = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<li><span aria-current="page">${c}</span></li>` : `<li><a href="#">${c}</a></li>`).join('');
  return `
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-btn" type="button" aria-label="Abrir menú de navegación" aria-expanded="false" aria-controls="cajon">${icon('menu', 22)}</button>
          ${logo('logo logo-mobile')}
          <nav class="crumbs" aria-label="Ruta">
            <ol>${items}</ol>
          </nav>
        </div>
        <button class="account-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Menú de la cuenta de ${YO.nombre}">
          <span class="account-name">${YO.nombre}</span><span class="avatar" aria-hidden="true">${YO.iniciales}</span>
        </button>
      </header>`;
}

const privacidad = () => `
        <div class="privacy">${icon('lock', 16)}<p>${AVISO_PRIVACIDAD}</p></div>`;

// ---------- Página ----------
// titulo: <title>; rotulo: pantalla en el rótulo de la hoja; estado: descripción del estado; cuerpo: HTML de <main>.
function pagina({ titulo, comentarios, css, rotulo, file, estado, crumbs, cuerpo, dialogo = '' }) {
  return `${M.cabecera({ titulo, comentarios, css })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">011</span> <strong>Administración · ${rotulo}</strong> <span class="file">${file}</span> <span>sin acceso al contenido de los archivos · estado: ${estado}</span></aside>

<div class="canvas">
  <div class="app"${dialogo ? ' inert' : ''}>
    ${sidebar()}
    <div class="main">
      ${topbar(crumbs)}
      <main class="content" id="contenido">${cuerpo}
      </main>
    </div>
  </div>${cajon()}${dialogo}
</div>

<script>${JS}</script>
</body>
</html>
`;
}

module.exports = { P, icon, YO, TOTAL, AVISO_PRIVACIDAD, CSS, JS, sidebar, cajon, topbar, privacidad, pagina };
