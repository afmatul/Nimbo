// Marco del área de administración (spec 011): íconos, persona, barra lateral, cajón, barra superior, CSS común del
// área, comportamiento y página. Lo usan admin/generar.js (cuentas y ficha), alta-interna/generar.js (alta interna),
// catalogo/generar.js (catálogo de planes), metricas/generar.js (métricas agregadas) y soporte/generar.js (metadatos de
// los archivos de un cliente, vistos por Soporte).
// El área es configurable (AREA_ADMIN por defecto, AREA_SOPORTE, AREA_OPERADOR): etiqueta, distintivo, persona, navegación
// e inicio. Soporte y Operador usan el mismo marco con otra persona y una navegación con solo lo que pueden hacer (CA-14).
// Los enlaces de la navegación, del logo y de las migas apuntan a los HTML de los otros mockups (rutas relativas).
// El CSS del marco de la aplicación (tokens, barra lateral, barra superior, botones, diálogo, cajón y cortes 900/600 px)
// viene de marco/marco.js; aquí solo se agrega lo propio del área (otra navegación y otra persona) con las mismas clases.
// También viven aquí las piezas que usan dos o más pantallas del área: distintivos de estado, estados de pantalla
// (vacío, error, esqueleto), diálogo de confirmación con consecuencias, botón destructivo con borde y el formulario
// (campos, resumen de errores, aviso de auditoría y acciones; CSS_FORM, campo y resumenErrores).
// Regla: los enlaces no cambian el aspecto de ninguna pantalla.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const C = require('./corpus.js');

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
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
  headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  pauseCircle: '<circle cx="12" cy="12" r="10"/><path d="M10 15V9"/><path d="M14 15V9"/>',
};
const icon = (name, size = 18, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;

// ---------- Datos del área (en la app vienen de la API) ----------
const YO = C.MONICA;
// Ícono de cada rol (persona de la barra lateral, alta interna y ficha de una cuenta).
const ICONO_ROL = { Administrador: 'shield', Soporte: 'headset', Operador: 'server', Cliente: 'users' };
const TOTAL = C.miles(C.TOTAL_CUENTAS);
const AVISO_PRIVACIDAD = 'La administración muestra metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.';

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

  /* StatusBadge: ícono + etiqueta (Art. XIII.4) */
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; line-height: 1.5; white-space: nowrap; border: 1px solid transparent; }
  .badge-ok { color: var(--success-foreground); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 40%, var(--card)); }
  .badge-off { color: var(--destructive); background: var(--destructive-tint); border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .badge-role { color: var(--secondary-foreground); background: var(--muted); border-color: var(--border); }
  /* Plan inactivo (catálogo y métricas): contorno neutro, nunca rojo (no es un error) */
  .badge-idle { color: var(--secondary-foreground); background: var(--card); border-color: var(--input); }

  /* Estados de pantalla (StateView): vacío, cargando y error */
  .state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; margin-top: 16px; padding: 32px; text-align: center; border-radius: var(--radius-lg); }
  .state h2 { margin: 12px 0 6px; font-size: 16px; line-height: 1.5; font-weight: 600; }
  .state p { margin: 0 0 20px; max-width: 48ch; font-size: 14px; }
  .state-empty { background: var(--card); border: 1px dashed var(--input); box-shadow: var(--shadow-card); }
  .state-empty > .ico { color: var(--muted-foreground); }
  .state-empty p { color: var(--secondary-foreground); }
  .state-error { border: 1px dashed color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .state-error > .ico, .state-error h2 { color: var(--destructive); }
  .state-error p { color: var(--foreground); }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .w30 { width: 30%; } .w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Botón destructivo con borde (acción que abre una confirmación) */
  .btn-destructive-outline { color: var(--destructive); background: var(--card); border: 1px solid var(--destructive); }
  .btn-destructive-outline:hover { background: var(--destructive-tint); }

  /* Diálogo de confirmación con lista de consecuencias */
  .dialog { top: 120px; width: min(500px, calc(100% - 32px)); }
  .dialog .who-line { margin-top: 6px; font-weight: 500; color: var(--foreground); overflow-wrap: anywhere; }
  .conseq { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
  .conseq li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--secondary-foreground); }
  .conseq .ico { margin-top: 2px; color: var(--secondary-foreground); }
  .btn-primary-dlg { color: var(--primary-foreground); background: var(--primary); border: 1px solid var(--primary); box-shadow: var(--shadow-button); }

  @media (max-width: 900px) {
    .who { margin-top: 8px; }
  }
  @media (max-width: 600px) {
    .app { min-height: 0; }
    .privacy { padding: 12px; margin-top: 16px; }
    .card { padding: 16px; }
    .back { min-height: 44px; }
    .alert { padding: 12px; }
    .state { padding: 28px 16px; }
    .state .btn { width: 100%; }
  }
`;

// ---------- CSS del formulario del área (alta interna, nuevo plan) ----------
// Tercer uso de las reglas de campo (identity/seguridad, alta-interna y catalogo): se extraen aquí para el área. Las de
// identity/seguridad no se tocan (su marco es otro y sus medidas difieren; cambiarlas movería capturas aprobadas).
const CSS_FORM = `
  /* Formulario del área (Input y Label de shadcn): ayuda bajo la etiqueta y error bajo el control, con ícono y texto */
  .req-note { margin: 0; font-size: 13px; color: var(--secondary-foreground); }
  .field { margin-top: 20px; }
  .field > label, .legend { display: block; margin: 0 0 4px; padding: 0; font-size: 13.5px; font-weight: 600; color: var(--foreground); }
  .field-help { margin: 0 0 8px; font-size: 13px; color: var(--secondary-foreground); }
  .text-input { width: 100%; max-width: 440px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .text-input.short { max-width: 220px; }
  .text-input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .text-input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .text-input[readonly] { background: var(--muted); color: var(--secondary-foreground); }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 0; font-size: 13px; font-weight: 500; color: var(--destructive); }
  .field-error .ico { margin-top: 2px; }
  .field-error a { display: inline-flex; align-items: center; min-height: 24px; color: var(--destructive); }
  .field-error a:hover { color: var(--foreground); }

  /* Aviso de auditoría y acciones del formulario */
  .audit-note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .audit-note .ico { margin-top: 2px; }
  .form-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }

  /* Resumen de errores (Alert destructivo): cuántos campos y enlaces a cada uno */
  .form-card .alert { margin: 0 0 16px; }
  .alert-error { border: 1px solid color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .alert-error > .ico, .alert-error .alert-title { color: var(--destructive); }
  .alert-list { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--destructive); }
  .alert-list a { display: inline-flex; align-items: center; min-height: 24px; color: var(--destructive); font-weight: 500; }
  .alert-list a:hover { color: var(--foreground); }

  /* Diálogo con formulario (ajustar cuota, extender vigencia y motivo de restauración) */
  .form-dialog { top: 72px; width: min(560px, calc(100% - 32px)); max-height: calc(100vh - 144px); overflow: auto; }
  .form-dialog .sub { margin: 4px 0 0; color: var(--secondary-foreground); font-size: 13.5px; }
  .form-dialog .field { margin-top: 16px; }
  .form-dialog .field > label { font-size: 13.5px; }
  .form-dialog .text-input { max-width: none; }
  .form-dialog .text-input.short { max-width: 220px; }

  @media (max-width: 600px) {
    .text-input, .text-input.short { max-width: none; min-height: 44px; }
    .form-dialog { top: 16px; max-height: calc(100vh - 32px); }
    .form-dialog .dialog-actions { flex-direction: column-reverse; align-items: stretch; }
    .form-dialog .dialog-actions .btn { width: 100%; min-height: 44px; }
    .form-actions { flex-direction: column; align-items: stretch; }
    .form-actions .btn { width: 100%; min-height: 44px; }
    .alert-list a { min-height: 32px; }
  }
`;

// ---------- CSS de la búsqueda por correo y de la paginación ----------
// Se extraen al segundo uso (backoffice/admin y backoffice/soporte) porque son el mismo componente (Input + Button de
// búsqueda y Pagination de shadcn), no texto parecido (Art. VI.1): cambiar uno debe cambiar el otro. Las tablas de cuentas
// y de metadatos, en cambio, se parecen pero tienen columnas y anchos propios: se quedan en cada pantalla (Art. VI.2).
// Las reglas de 600 px van aparte porque viven dentro del @media de cada pantalla.
const CSS_BUSQUEDA = `  /* Búsqueda por correo (Input + Button) */
  .search { margin-top: 20px; }
  .search label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
  .search-row { display: flex; gap: 10px; max-width: 560px; }
  .input-wrap { position: relative; flex: 1; min-width: 0; }
  .input-wrap .ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted-foreground); pointer-events: none; }
  .input { width: 100%; min-height: 40px; padding: 8px 12px 8px 38px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .input::placeholder { color: var(--muted-foreground); }
  .input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .search-hint { margin: 6px 0 0; font-size: 12.5px; color: var(--muted-foreground); }
`;
const CSS_BUSQUEDA_MQ600 = `    .search-row { max-width: none; }
    .input { min-height: 44px; }
    .search .btn { min-height: 44px; }
`;
const CSS_PAGINACION = `  /* Paginación */
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; color: var(--secondary-foreground); }
  .pager p { margin: 0; }
  .pager-ctrl { display: flex; align-items: center; gap: 8px; }
  .pager-page { min-width: 96px; text-align: center; white-space: nowrap; }
`;
const CSS_PAGINACION_MQ600 = `    .pager { flex-direction: column; align-items: stretch; }
    .pager p { text-align: center; }
    .pager-ctrl { justify-content: space-between; }
    .pager-ctrl .btn { min-height: 44px; }
    .pager-page { min-width: 0; }
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
// Enlaces entre mockups: rutas relativas a los HTML de backoffice/<pantalla>/ (todas las carpetas son hermanas).
const NAV = [
  { icono: 'users', etiqueta: 'Cuentas', meta: TOTAL, href: '../admin/admin.html' },
  { icono: 'grid', etiqueta: 'Catálogo de planes', href: '../catalogo/catalogo.html' },
  { icono: 'chart', etiqueta: 'Métricas', href: '../metricas/metricas.html' },
];

// Áreas internas que comparten el marco. etiqueta: nombre del área (logo, navegación y rótulo); chip: distintivo junto al
// logo; yo: persona de la barra lateral y de la barra superior (de admin/corpus.js); nav: entradas { icono, etiqueta,
// meta (opcional), href }; inicio: destino del logo y de la primera miga (la pantalla de inicio del área).
const AREA_ADMIN = { etiqueta: 'Administración', chip: 'ADMIN', yo: YO, nav: NAV, inicio: '../admin/admin.html' };
// Soporte (specs 011 y 011b): metadatos (011, CA-14) y papelera con restauración (011b, CA-10). Bitácoras y trabajos
// (022b) no aparecen hasta su spec.
const AREA_SOPORTE = {
  etiqueta: 'Soporte', chip: 'SOPORTE', yo: C.ANDREA,
  nav: [
    { icono: 'fileSearch', etiqueta: 'Metadatos de archivos', href: '../soporte/soporte--inicial.html' },
    { icono: 'trash', etiqueta: 'Papelera', href: '../soporte/soporte--papelera.html' },
  ],
  inicio: '../soporte/soporte--inicial.html',
};
// Operador (product-context §2: «Ver métricas agregadas»): solo «Métricas», en solo lectura; sin Cuentas, Catálogo ni
// Soporte. Sus métricas técnicas (colas, trabajos, bitácoras) llegan con 022b.
const AREA_OPERADOR = {
  etiqueta: 'Operación', chip: 'OPERADOR', yo: C.PABLO,
  nav: [{ icono: 'chart', etiqueta: 'Métricas', href: '../metricas/metricas--operador.html' }],
  inicio: '../metricas/metricas--operador.html',
};

// idPrimero: id del primer enlace (el cajón le pasa el foco); actual: entrada marcada con aria-current.
function navegacion(idPrimero, actual, area) {
  let primero = !!idPrimero;
  const items = area.nav.map(({ icono, etiqueta, meta, href }) => {
    const id = primero ? ` id="${idPrimero}"` : '';
    primero = false;
    const cur = etiqueta === actual ? ' aria-current="page"' : '';
    return `\n          <li><a href="${href}"${id}${cur}>${icon(icono)}<span>${etiqueta}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</a></li>`;
  }).join('');
  return `<nav aria-label="Navegación de ${area.etiqueta.toLowerCase()}">
        <ul class="nav">${items}
        </ul>
      </nav>`;
}

const logo = (cls, area) =>
  `<a class="${cls}" href="${area.inicio}"><span class="logo-mark">N</span><span>NIMBO</span><span class="sr-only">, ${area.etiqueta}</span></a>`;
const chip = (area) => `<span class="plan-chip area-chip">${area.chip}</span>`;
const quien = (area) => `<div class="who">
        <p class="who-name">${area.yo.nombre}</p>
        <p class="who-role">${icon(ICONO_ROL[area.yo.rol], 14)}<span>${area.yo.rol}</span></p>
      </div>`;

const sidebar = (actual, area) => `
    <aside class="sidebar" aria-label="Barra lateral">
      <div class="brand-row">
        ${logo('logo', area)}
        ${chip(area)}
      </div>
      ${navegacion('', actual, area)}
      ${quien(area)}
    </aside>`;

const cajon = (actual, area) => `
  <div class="drawer-overlay" data-cerrar-cajon aria-hidden="true" hidden></div>
  <div class="drawer" id="cajon" role="dialog" aria-modal="true" aria-labelledby="cajon-t" hidden>
      <div class="drawer-head">
        ${logo('logo', area)}
        ${chip(area)}
        <h2 id="cajon-t" class="sr-only">Menú de navegación</h2>
        <button class="icon-btn" type="button" data-cerrar-cajon aria-label="Cerrar menú">${icon('x', 22)}</button>
      </div>
      ${navegacion('cajon-primero', actual, area)}
      ${quien(area)}
  </div>`;

// crumbs: etiquetas o { etiqueta, href }. Sin href, la primera miga va al inicio del área y las demás a la entrada de la
// navegación con la misma etiqueta; si no hay ninguna, «#».
function hrefMiga(c, i, area) {
  if (c.href) return c.href;
  if (i === 0) return area.inicio;
  const entrada = area.nav.find(({ etiqueta }) => etiqueta === c);
  return entrada ? entrada.href : '#';
}
function topbar(crumbs, area) {
  const persona = area.yo;
  const items = crumbs.map((c, i) => {
    const label = c.etiqueta || c;
    return i === crumbs.length - 1 ? `<li><span aria-current="page">${label}</span></li>` : `<li><a href="${hrefMiga(c, i, area)}">${label}</a></li>`;
  }).join('');
  return `
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-btn" type="button" aria-label="Abrir menú de navegación" aria-expanded="false" aria-controls="cajon">${icon('menu', 22)}</button>
          ${logo('logo logo-mobile', area)}
          <nav class="crumbs" aria-label="Ruta">
            <ol>${items}</ol>
          </nav>
        </div>
        <button class="account-btn" type="button" aria-haspopup="menu" aria-expanded="false">
          <span class="account-name">${persona.nombre}</span><span class="avatar" aria-hidden="true">${persona.iniciales}</span><span class="sr-only">Menú de la cuenta</span>
        </button>
      </header>`;
}

// Aviso informativo (Alert de shadcn): por defecto, el de privacidad del área; el catálogo lo usa para su regla.
const privacidad = (texto = AVISO_PRIVACIDAD, ic = 'lock') => `
        <div class="privacy">${icon(ic, 16)}<p>${texto}</p></div>`;

// Búsqueda por correo (Input + Button). Sin opciones es exactamente la de backoffice/admin. ayuda: texto bajo el campo
// (search-hint, enlazado con aria-describedby); boton: variante del botón.
function busqueda({ valor = '', aria = 'Buscar cuentas', etiqueta = 'Buscar por correo', boton = 'btn-outline', ayuda = '',
  id = 'q' } = {}) {
  const desc = ayuda ? ` aria-describedby="${id}-ayuda"` : '';
  return `
        <form class="search" role="search" aria-label="${aria}" onsubmit="return false">
          <label for="${id}">${etiqueta}</label>
          <div class="search-row">
            <div class="input-wrap">${icon('search', 16)}<input class="input" id="${id}" name="${id}" type="search" inputmode="email" autocomplete="off" placeholder="nombre@dominio.com" value="${valor}"${desc}></div>
            <button class="btn ${boton}" type="submit">Buscar</button>
          </div>${ayuda ? `
          <p class="search-hint" id="${id}-ayuda">${ayuda}</p>` : ''}
        </form>`;
}

// Paginación «Anterior / Página N de M / Siguiente» con el total en texto (primera página: «Anterior» deshabilitado).
// total: elementos de la lista; cosas: su nombre en plural («cuentas», «archivos»). Las páginas se calculan del total.
const POR_PAGINA = 10;
const paginacion = ({ aria, total, cosas }) => `
        <nav class="pager" aria-label="${aria}">
          <p class="num">Mostrando 1–${POR_PAGINA} de ${C.miles(total)} ${cosas}</p>
          <div class="pager-ctrl">
            <button class="btn btn-outline btn-sm" type="button" disabled>${icon('chevLeft', 16)}Anterior</button>
            <span class="pager-page num" aria-current="page">Página 1 de ${Math.ceil(total / POR_PAGINA)}</span>
            <button class="btn btn-outline btn-sm" type="button">Siguiente${icon('chevRight', 16)}</button>
          </div>
        </nav>`;

// ---------- Piezas compartidas por las pantallas del área ----------
// Distintivo «Inactivo» de un plan (catálogo y métricas).
const badgeInactivo = `<span class="badge badge-idle">${icon('pauseCircle', 13)}Inactivo</span>`;

// Error de carga (ErrorState) con «Reintentar».
const estadoError = (titulo, texto) => `
        <div class="state state-error" role="alert">
          ${icon('alert', 36)}
          <h2>${titulo}</h2>
          <p>${texto}</p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;

// Diálogo de confirmación (ConfirmDestructiveDialog) con la lista de consecuencias. cancelar: href opcional del mockup
// al que vuelve «Cancelar» (en la app cierra el diálogo sin cambiar nada); sin él, «Cancelar» es un botón. quienLinea:
// opcional (quitar el extra no la lleva).
function dialogo({ titulo, quienLinea, items, confirmar, clase, ic, cancelar = '' }) {
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">${titulo}</h2>
    <div id="dlg-d">${quienLinea ? `
      <p class="who-line">${quienLinea}</p>` : ''}
      <ul class="conseq">${items.map(([i, t]) => `\n        <li>${icon(i, 16)}<span>${t}</span></li>`).join('')}
      </ul>
    </div>
    <div class="dialog-actions">
      ${cancelar ? `<a class="btn btn-outline" href="${cancelar}" autofocus>Cancelar</a>` : '<button class="btn btn-outline" type="button" autofocus>Cancelar</button>'}
      <button class="btn ${clase}" type="button">${icon(ic, 16)}${confirmar}</button>
    </div>
  </div>`;
}

// Campo de formulario (Input o Textarea + Label). err: mensaje (HTML) o ''; ro: solo lectura mientras se envía.
// antes/despues: adornos del control (prefijo «Q», sufijo o selector de unidad); multilinea: Textarea. Sin esas
// opciones el HTML es exactamente el de alta-interna.
function campo({ id, label, help, type = 'text', value = '', err = '', ro = false, extra = '', short = false,
  antes = '', despues = '', multilinea = false }) {
  const desc = [`${id}-ayuda`, ...(err ? [`${id}-error`] : [])].join(' ');
  const inv = err ? ' aria-invalid="true"' : '';
  let control = multilinea
    ? `<textarea class="text-input text-area" id="${id}" name="${id}" rows="2" required aria-describedby="${desc}"${inv}${ro ? ' readonly' : ''} ${extra}>${value}</textarea>`
    : `<input class="text-input${short ? ' short' : ''}" id="${id}" name="${id}" type="${type}" value="${value}" required aria-describedby="${desc}"${inv}${ro ? ' readonly' : ''} ${extra}>`;
  if (antes || despues) control = `<div class="input-group">${antes}${control}${despues}</div>`;
  return `
          <div class="field">
            <label for="${id}">${label}</label>
            <p class="field-help" id="${id}-ayuda">${help}</p>
            ${control}${err ? `
            <p class="field-error" id="${id}-error">${icon('alert', 15)}<span>${err}</span></p>` : ''}
          </div>`;
}

// Resumen de errores sobre el formulario (role="alert"), con un enlace a cada campo.
function resumenErrores({ titulo, texto, items }) {
  return `
          <div class="alert alert-error" role="alert" tabindex="-1" id="errores">${icon('alert', 18)}<div><p class="alert-title">${titulo}</p><p class="alert-text">${texto}</p>
            <ul class="alert-list">${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ul></div></div>`;
}

// Diálogo de formulario breve (011b): título, descripción, campos, errores, cálculo/resumen y acciones. No es una
// confirmación destructiva; el foco inicial va al primer campo y «Cancelar» vuelve al mockup de origen. `nota` es el
// aviso de auditoría (por defecto, el de un ajuste de cuenta; la restauración pasa el suyo).
function formDialog({ titulo, descripcion, campos, resumen = '', errores = '', nota = 'El ajuste queda en la auditoría del cliente; verá la acción y tu rol, no tu nombre.', confirmar, cancelar, cargando = false, clase = 'form-dialog' }) {
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog ${clase}" role="dialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">${titulo}</h2>
    <p class="sub" id="dlg-d">${descripcion}</p>
    <form onsubmit="return false">
      ${errores}${campos}${resumen}
      <p class="audit-note">${icon('history', 15)}<span>${nota}</span></p>
      <div class="dialog-actions">
        <a class="btn btn-outline" href="${cancelar}">Cancelar</a>
        <button class="btn btn-primary" type="button"${cargando ? ' disabled aria-disabled="true"' : ''}>${cargando ? icon('loader', 16, 'spin') : ''}${confirmar}</button>
      </div>
    </form>
  </div>`;
}

// ---------- Archivos generados ----------
// Carpeta de salida de una pantalla de backoffice (la crea si no existe). Uso de cada generador: node generar.js <worktree>.
function carpetaDeSalida(pantalla) {
  const repo = process.argv[2];
  if (!repo) throw new Error('Falta la ruta del worktree');
  const dir = path.join(repo, 'docs/design/mockups/backoffice', pantalla);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const archivoDe = (pantalla, estado) => (estado === 'default' ? `${pantalla}.html` : `${pantalla}--${estado}.html`);
// Cabecera de cada HTML generado. referencia: qué pantalla de la spec 011 es; generador: su carpeta en _generadores.
const comentariosDe = (referencia, estado, generador, spec = '011') => [
  `Mockup de referencia (spec ${spec}: ${referencia}). Estado: ${estado}.`,
  'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
  `Generado con _generadores/${generador}/generar.js (marco del área en admin/area.js y CSS del marco en marco/marco.js). No editar a mano.`,
];
function escribir(dir, file, html) {
  fs.writeFileSync(path.join(dir, file), html, 'utf8');
  console.log(file);
}

// ---------- Página ----------
// titulo: <title>; rotulo: pantalla en el rótulo de la hoja; estado: descripción del estado; cuerpo: HTML de <main>.
// actual: entrada de la navegación de la pantalla (por defecto «Cuentas»); area: AREA_ADMIN (por defecto), AREA_SOPORTE
// o AREA_OPERADOR.
function pagina({ titulo, comentarios, css, rotulo, file, estado, crumbs, cuerpo, dialogo = '', actual = 'Cuentas', area = AREA_ADMIN, spec = '011' }) {
  return `${M.cabecera({ titulo, comentarios, css })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">${spec}</span> <strong>${area.etiqueta} · ${rotulo}</strong> <span class="file">${file}</span> <span>sin acceso al contenido de los archivos · estado: ${estado}</span></aside>

<div class="canvas">
  <div class="app"${dialogo ? ' inert' : ''}>
    ${sidebar(actual, area)}
    <div class="main">
      ${topbar(crumbs, area)}
      <main class="content" id="contenido">${cuerpo}
      </main>
    </div>
  </div>${cajon(actual, area)}${dialogo}
</div>

<script>${JS}</script>
</body>
</html>
`;
}

module.exports = {
  P, icon, ICONO_ROL, CSS, CSS_FORM, privacidad, pagina,
  carpetaDeSalida, archivoDe, comentariosDe, escribir,
  estadoError, dialogo, campo, resumenErrores, formDialog, badgeInactivo,
  AREA_ADMIN, AREA_SOPORTE, AREA_OPERADOR, busqueda, paginacion, CSS_BUSQUEDA, CSS_BUSQUEDA_MQ600, CSS_PAGINACION, CSS_PAGINACION_MQ600,
};
