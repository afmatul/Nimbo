// Estados comunes de las páginas de lista (Mis archivos de 005 y 006, Papelera de 006): CSS de vacío, cargando, error,
// aviso (Alert) y zona de soltar, y el script del menú ⋮ por fila. Extraído de explorador/generar.js sin cambios.
// Alert (aviso arriba de la lista), compartido con shared/layout (aviso del tope de fijados)
const CSS_ALERT = `  /* Aviso de descarga fallida (Alert de shadcn, variante destructiva), arriba de la lista */
  .alert { display: flex; align-items: flex-start; gap: 12px; margin: 20px 0 0; padding: 12px 8px 12px 16px; border: 1px solid color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); }
  .alert > .ico { margin-top: 2px; color: var(--destructive); }
  .alert-body { flex: 1; min-width: 0; }
  .alert-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--destructive); overflow-wrap: anywhere; }
  .alert-text { margin: 2px 0 0; font-size: 13.5px; color: var(--foreground); }
  .alert-actions { display: flex; align-items: center; gap: 4px; flex: none; }
  .alert .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); }
  .alert + .files { margin-top: 16px; }

`;
exports.CSS_ALERT = CSS_ALERT;

exports.CSS_ESTADOS = `  /* Vacío (StateView type="empty" de 000b): borde discontinuo, ícono, título, descripción y acción */
  .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 224px; margin-top: 20px; padding: 32px; text-align: center; background: var(--card); border: 1px dashed var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .state-empty > .ico { margin-bottom: 16px; color: var(--muted-foreground); }
  .state-empty h2 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; letter-spacing: -.01em; }
  .state-empty p { margin: 6px 0 0; max-width: 384px; font-size: 14px; color: var(--muted-foreground); }
  .state-empty .btn { margin-top: 20px; }
  .solo-tactil { display: none; }

  /* Cargando: esqueleto con la forma de la tabla (aria-hidden) y un estado con texto */
  .files-skeleton .sk-head { display: grid; grid-template-columns: minmax(0, 1fr) 130px 130px 64px; padding: 11px 16px; background: var(--background); border-bottom: 1px solid var(--border); }
  .sk-row { display: grid; grid-template-columns: minmax(0, 1fr) 130px 130px 64px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .sk-row:last-child { border-bottom: 0; }
  .sk-name { display: flex; align-items: center; gap: 12px; }
  .sk-name > div { flex: 1; }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .skeleton-line.tile { width: 30px; height: 30px; flex: none; border-radius: 8px; }
  .skeleton-line.head { height: 10px; width: 64px; background: var(--border); }
  .skeleton-line.meta { display: none; }
  .w30 { width: 30%; } .w40 { width: 40%; } .w45 { width: 45%; } .w55 { width: 55%; } .w60 { width: 60%; } .w70 { width: 70%; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Error (StateView type="error", con el tono y la estructura del error aprobado de Seguridad) */
  .state-error { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 224px; margin-top: 20px; padding: 32px; text-align: center; border: 1px dashed color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); }
  .state-error > .ico { color: var(--destructive); }
  .state-error h2 { margin: 12px 0 6px; font-size: 16px; line-height: 1.5; font-weight: 600; color: var(--destructive); }
  .state-error p { margin: 0 0 20px; max-width: 46ch; font-size: 14px; color: var(--foreground); }

${CSS_ALERT}  /* Arrastre (§5): zona de soltar sobre Mis archivos, bg-brand/5 + borde 1.5 px discontinuo brand */
  .content { position: relative; flex: 1; } /* la zona de soltar ocupa todo el área bajo la barra superior */
  .dropzone { position: absolute; inset: 10px; z-index: 4; border: 1.5px dashed var(--brand); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--brand) 5%, transparent); pointer-events: none; }
  .drop-label { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; width: max-content; max-width: calc(100% - 32px); margin: 0; padding: 12px 20px 12px 14px; border-radius: var(--radius-lg); background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-modal); }
  .drop-label-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none; border-radius: 999px; background: color-mix(in srgb, var(--primary-foreground) 16%, var(--primary)); }
  .drop-label strong { display: block; font-size: 15px; font-weight: 600; }
  .drop-label span.sub { display: block; font-size: 13px; }

`;

// Reglas por debajo de 600 px (van dentro del @media de cada generador)
const CSS_ALERT_MQ600 = `    /* Aviso en móvil: la X arriba a la derecha (44 px) y «Reintentar» a todo el ancho debajo del texto */
    .alert { position: relative; flex-wrap: wrap; margin-top: 16px; padding: 12px 52px 12px 12px; }
    .alert-actions { width: calc(100% + 40px); padding-left: 30px; }
    .alert-actions .btn { flex: 1; min-height: 44px; }
    .alert .icon-btn { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; }
`;
exports.CSS_ALERT_MQ600 = CSS_ALERT_MQ600;
// Solo si se usa aviso({ cerrar: false }): sin la X no se reserva su hueco
exports.CSS_ALERT_SIN_CERRAR_MQ600 = `    .alert:not(:has(.icon-btn)) { padding-right: 12px; }
    .alert:not(:has(.icon-btn)) .alert-actions { width: 100%; }
`;

exports.CSS_ESTADOS_MQ600 = `    .state-empty { margin-top: 16px; padding: 32px 16px; }
    .state-empty .btn, .state-error .btn { width: 100%; }
    .state-error { margin-top: 16px; padding: 32px 16px; }
${CSS_ALERT_MQ600}    .solo-escritorio { display: none; }
    .solo-tactil { display: inline; }
    .files-skeleton .sk-head { display: none; }
    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 12px; }
    .sk-row > .sk-col { display: none; }
    .skeleton-line.meta { display: block; margin-top: 8px; height: 10px; }
    .dropzone { inset: 6px; }
    .drop-label { bottom: 20px; padding: 10px 14px 10px 10px; }
`;

// Menú ⋮ por fila: mismo comportamiento de teclado que el menú de la cuenta (shared/layout)
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

// ---------- Piezas de estado (HTML), parametrizadas por texto ----------
const { icon } = require('./mis-archivos.js');

// Cargando: esqueleto con la forma de la tabla (aria-hidden) y un texto role="status".
// Filas del esqueleto: anchos distintos para que no parezca una tabla real
const SK = [['w60', 'w45', 'w55'], ['w45', 'w30', 'w60'], ['w70', 'w40', 'w45'], ['w55', 'w45', 'w70'], ['w40', 'w30', 'w55']];
exports.esqueleto = function esqueleto(texto) {
  const fila = ([n, t, f]) => `
            <div class="sk-row"><div class="sk-name"><span class="skeleton-line tile"></span><div><span class="skeleton-line ${n}"></span><span class="skeleton-line meta w40"></span></div></div><div class="sk-col"><span class="skeleton-line ${t}"></span></div><div class="sk-col"><span class="skeleton-line ${f}"></span></div><div class="sk-col"></div></div>`;
  return `
        <div aria-busy="true">
          <div class="files files-skeleton" aria-hidden="true">
            <div class="sk-head"><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span></span></div>${SK.map(fila).join('')}
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}${texto}</p>
        </div>`;
};

// Error de pantalla (StateView type="error" con «Reintentar» outline)
exports.errorEstado = function errorEstado(titulo, texto) {
  return `
        <div class="state-error" role="alert">
          ${icon('alert', 40)}
          <h2>${titulo}</h2>
          <p>${texto}</p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;
};

// Aviso arriba de la lista (Alert de shadcn, variante destructiva) con una acción y «Cerrar aviso».
// `texto` y `accion` son opcionales; tono 'warn' (límite alcanzado, no es una falla) usa los tokens warning.
// cerrar: false omite «Cerrar aviso» (un aviso que se va solo al reintentar, como el error de «Cargar más» de 004).
exports.aviso = function aviso({ titulo, texto = '', accion = '', tono = '', cerrar = true }) {
  return `
        <div class="alert${tono ? ` alert-${tono}` : ''}" role="${tono === 'warn' ? 'status' : 'alert'}">
          ${icon('alert', 18)}
          <div class="alert-body">
            <p class="alert-title">${titulo}</p>${texto ? `
            <p class="alert-text">${texto}</p>` : ''}
          </div>
          <div class="alert-actions">${accion ? `
            <button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}<span>${accion}</span></button>` : ''}${cerrar ? `
            <button class="icon-btn" type="button" aria-label="Cerrar aviso">${icon('x', 18)}</button>` : ''}
          </div>
        </div>`;
};

// Variante de aviso «warn» = `Alert variant="warning"` de ui-guidelines.md §4 (border-warning bg-warning/10 text-warning-foreground):
// el tope de fijados no es una falla del sistema; warning-foreground sobre warning al 10 %: 4.66 como mínimo (sobre background)
exports.CSS_ALERT_WARN = `  .alert.alert-warn { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); }
  .alert.alert-warn { align-items: center; }
  .alert.alert-warn > .ico { margin-top: 0; }
  .alert.alert-warn > .ico, .alert.alert-warn .alert-title { color: var(--warning-foreground); }
`;

// Aviso `warning` dentro de un diálogo (Alert variant="warning" de ui-guidelines.md §4, sin «Cerrar aviso»: vive y muere
// con el diálogo). Extraído al tercer uso (Art. VI.2): poda al reemplazar (storage/carga, 014), poda al restaurar
// (storage/ficha-archivo, 014) y poda al subir una versión como Editor (sharing/compartido-conmigo, 012).
// warning-foreground sobre warning al 10 % sobre card: 4.86; el texto en foreground: 12.69.
exports.CSS_DLG_WARN = `  .dlg-warn { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .dlg-warn .ico { margin-top: 1px; color: var(--warning-foreground); }
  .dlg-warn p { margin: 0 !important; font-size: 13.5px !important; color: var(--foreground) !important; }
  .dlg-warn strong { display: block; color: var(--warning-foreground) !important; font-weight: 600; }
`;
// role="status": se anuncia sin interrumpir; el id va en el aria-describedby del diálogo.
exports.avisoDialogo = ({ id = 'dlg-p', titulo, texto }) => `
    <div id="${id}" class="dlg-warn" role="status">${icon('warn', 18)}<p><strong>${titulo}</strong>${texto}</p></div>`;

// ---------- «Cargar más» (paginación por cursor, 007 RN-6) ----------
// Pie de una lista paginada. Extraído al tercer uso (Art. VI.2): explorador (007), layout (007) y Mi actividad (004);
// lo usa también Compartido conmigo (012). Estados: 'listo' (botón), 'cargando' (aria-disabled: sigue enfocable, con
// anuncio), 'error' (Alert con «Reintentar»; lo ya cargado no cambia) y 'fin' (no hay más páginas).
// textos: { anuncio, error: { titulo, texto, cerrar }, fin }. CSS: CSS_CARGAR_MAS y, si se usa 'fin', CSS_CARGAR_MAS_FIN.
exports.CSS_CARGAR_MAS = `  /* Pie de una lista paginada: «Cargar más» y cargando (el error es un Alert) */
  .more { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 16px; }
  .more .btn[aria-disabled="true"] { cursor: progress; }
`;
// Solo para las listas que dibujan el estado 'fin'
exports.CSS_CARGAR_MAS_FIN = `  .end-note { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 16px 0 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .end-note .ico { color: var(--success-foreground); }
`;
exports.CSS_CARGAR_MAS_MQ600 = `    .more .btn { width: 100%; min-height: 44px; }
`;
const BOTON_MAS = '<button class="btn btn-outline" type="button">Cargar más</button>';
const pieMas = (contenido) => `
        <div class="more">
          ${contenido}
        </div>`;
exports.cargarMas = function cargarMas(estado = 'listo', textos = {}) {
  if (estado === 'error') return exports.aviso({ ...textos.error, accion: 'Reintentar' });
  if (estado === 'fin') return `
        <p class="end-note" role="status">${icon('ok', 18)}${textos.fin}</p>`;
  if (estado === 'cargando') {
    return pieMas(`<button class="btn btn-outline" type="button" aria-disabled="true">${icon('loader', 16, 'spin')}<span>Cargando más…</span></button>
          <p class="sr-only" role="status">${textos.anuncio}</p>`);
  }
  return pieMas(BOTON_MAS);
};

// Zona de soltar sobre el área de contenido; destino: «Mis archivos» o el nombre de la carpeta abierta
exports.arrastre = function arrastre(destino, max) {
  return `
        <div class="dropzone" aria-hidden="true"></div>
        <p class="drop-label" role="status"><span class="drop-label-icon">${icon('upload', 20)}</span><span><strong>Suelta para subir</strong><span class="sub">Se guardarán en ${destino} · hasta ${max} por archivo</span></span></p>`;
};
