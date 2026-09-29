// Genera los estados escritos a mano de storage/explorador para la spec 005 (vacio, cargando y arrastre).
// Uso: node generar.js <ruta-del-worktree>
// El marco (barra lateral, barra superior y CSS base) viene de marco/marco.js y la página «Mis archivos»
// (encabezado, tabla de la raíz, cuota por tramos) de mis-archivos/mis-archivos.js, los mismos de storage/carga.
// explorador--cuadricula.html y explorador--lista.html (HTML empaquetado de la propuesta) NO se generan aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/explorador');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const P = {
  ...S.P,
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
};
const icon = S.crearIcon(P);

// Cuenta sin archivos: 0 B usados del plan Equipo (tramo 0–69 % de QuotaBar, sin nota)
// «1 GB» sin partir entre líneas
const MAX = S.MAX_POR_ARCHIVO.replace(' ', '&nbsp;');

const CUOTA_VACIA = { usado: '0 B', total: '350 GB', pct: 0 };

// ---------- CSS propio de la pantalla ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + `
  /* Propio de storage/explorador (spec 005) */
` + S.CSS_LISTA + `
  /* Vacío (StateView type="empty" de 000b): borde discontinuo, ícono, título, descripción y acción */
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

  /* Aviso de descarga fallida (Alert de shadcn, variante destructiva), arriba de la lista */
  .alert { display: flex; align-items: flex-start; gap: 12px; margin: 20px 0 0; padding: 12px 8px 12px 16px; border: 1px solid color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); }
  .alert > .ico { margin-top: 2px; color: var(--destructive); }
  .alert-body { flex: 1; min-width: 0; }
  .alert-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--destructive); overflow-wrap: anywhere; }
  .alert-text { margin: 2px 0 0; font-size: 13.5px; color: var(--foreground); }
  .alert-actions { display: flex; align-items: center; gap: 4px; flex: none; }
  .alert .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); }
  .alert + .files { margin-top: 16px; }

  /* Arrastre (§5): zona de soltar sobre Mis archivos, bg-brand/5 + borde 1.5 px discontinuo brand */
  .content { position: relative; flex: 1; } /* la zona de soltar ocupa todo el área bajo la barra superior */
  .dropzone { position: absolute; inset: 10px; z-index: 4; border: 1.5px dashed var(--brand); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--brand) 5%, transparent); pointer-events: none; }
  .drop-label { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; width: max-content; max-width: calc(100% - 32px); margin: 0; padding: 12px 20px 12px 14px; border-radius: var(--radius-lg); background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-modal); }
  .drop-label-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none; border-radius: 999px; background: color-mix(in srgb, var(--primary-foreground) 16%, var(--primary)); }
  .drop-label strong { display: block; font-size: 15px; font-weight: 600; }
  .drop-label span.sub { display: block; font-size: 13px; }

  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + `    .state-empty { margin-top: 16px; padding: 32px 16px; }
    .state-empty .btn, .state-error .btn { width: 100%; }
    .state-error { margin-top: 16px; padding: 32px 16px; }
    /* Aviso en móvil: la X arriba a la derecha (44 px) y «Reintentar» a todo el ancho debajo del texto */
    .alert { position: relative; flex-wrap: wrap; margin-top: 16px; padding: 12px 52px 12px 12px; }
    .alert-actions { width: calc(100% + 40px); padding-left: 30px; }
    .alert-actions .btn { flex: 1; min-height: 44px; }
    .alert .icon-btn { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; }
    .solo-escritorio { display: none; }
    .solo-tactil { display: inline; }
    .files-skeleton .sk-head { display: none; }
    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 12px; }
    .sk-row > .sk-col { display: none; }
    .skeleton-line.meta { display: block; margin-top: 8px; height: 10px; }
    .dropzone { inset: 6px; }
    .drop-label { bottom: 20px; padding: 10px 14px 10px 10px; }
  }
`;

// ---------- Menú ⋮ por fila: mismo comportamiento de teclado que el menú de la cuenta (shared/layout) ----------
// Enter, Espacio o flecha abajo abren en el primer ítem; flechas, Inicio y Fin recorren; Escape cierra y devuelve el
// foco al botón; Tab cierra. En el estado «acciones» el menú de la primera fila empieza abierto y con el foco.
const JS = `
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

// ---------- Piezas ----------
function vacio() {
  return `
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('folderOpen', 40)}
          <h2 id="vacio-t">Aún no tienes archivos</h2>
          <p><span class="solo-escritorio">Sube tus documentos con el botón o arrástralos a esta página.</span><span class="solo-tactil">Sube tus documentos desde tu dispositivo.</span> Tu plan permite hasta ${MAX} por archivo.</p>
          ${S.botonSubir()}
        </section>`;
}

// Filas del esqueleto: anchos distintos para que no parezca una tabla real
const SK = [['w60', 'w45', 'w55'], ['w45', 'w30', 'w60'], ['w70', 'w40', 'w45'], ['w55', 'w45', 'w70'], ['w40', 'w30', 'w55']];
function cargando() {
  const fila = ([n, t, f]) => `
            <div class="sk-row"><div class="sk-name"><span class="skeleton-line tile"></span><div><span class="skeleton-line ${n}"></span><span class="skeleton-line meta w40"></span></div></div><div class="sk-col"><span class="skeleton-line ${t}"></span></div><div class="sk-col"><span class="skeleton-line ${f}"></span></div><div class="sk-col"></div></div>`;
  return `
        <div aria-busy="true">
          <div class="files files-skeleton" aria-hidden="true">
            <div class="sk-head"><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span></span></div>${SK.map(fila).join('')}
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando tus archivos…</p>
        </div>`;
}

function error() {
  return `
        <div class="state-error" role="alert">
          ${icon('alert', 40)}
          <h2>No pudimos cargar tus archivos.</h2>
          <p>Tus archivos siguen guardados. Inténtalo de nuevo.</p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;
}

// Aviso de descarga fallida. Textos por código (catálogo de errores del frontend); el mockup dibuja el 429.
const AVISOS_DESCARGA = {
  429: (n) => ({ titulo: `No pudimos preparar la descarga de «${n}».`, texto: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', accion: 'Reintentar' }),
  404: (n) => ({ titulo: `No encontramos «${n}».`, texto: 'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.', accion: 'Actualizar lista' }),
};
function avisoDescarga(codigo, nombre) {
  const a = AVISOS_DESCARGA[codigo](nombre);
  return `
        <div class="alert" role="alert">
          ${icon('alert', 18)}
          <div class="alert-body">
            <p class="alert-title">${a.titulo}</p>
            <p class="alert-text">${a.texto}</p>
          </div>
          <div class="alert-actions">
            <button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}<span>${a.accion}</span></button>
            <button class="icon-btn" type="button" aria-label="Cerrar aviso">${icon('x', 18)}</button>
          </div>
        </div>`;
}

function arrastre() {
  return `
        <div class="dropzone" aria-hidden="true"></div>
        <p class="drop-label" role="status"><span class="drop-label-icon">${icon('upload', 20)}</span><span><strong>Suelta para subir</strong><span class="sub">Se guardarán en Mis archivos · hasta ${MAX} por archivo</span></span></p>`;
}

function page(v) {
  const file = `explorador--${v.estado}.html`;
  return `${M.cabecera({
    titulo: `Mis archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 005: explorador mínimo de la raíz). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y StateView.',
      'Marco generado con _generadores/marco/marco.js; página Mis archivos con _generadores/mis-archivos/mis-archivos.js (igual que storage/carga).',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">005</span> <strong>Explorador · Mis archivos</strong> <span class="file">${file}</span> <span>raíz de Mis archivos · plan Equipo · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${S.sidebar(v.cuota, v.tramo)}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'] })}
      <main class="content" id="contenido">${S.encabezado()}${v.cuerpo()}
      </main>
    </div>
  </div>
</div>
${v.js ? `
<script>${JS}</script>
` : ''}
</body>
</html>
`;
}

// ---------- Estados ----------
const ESTADOS = [
  {
    estado: 'vacio',
    titulo: 'raíz sin archivos: invitación a subir con el botón o arrastrando',
    cuota: CUOTA_VACIA, tramo: 'ok',
    cuerpo: vacio,
  },
  {
    estado: 'cargando',
    titulo: 'esqueleto de la lista mientras llega GET /files',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: cargando,
  },
  {
    estado: 'arrastre',
    titulo: 'archivos arrastrados sobre Mis archivos: zona de soltar resaltada',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: () => S.tabla([]) + arrastre(),
  },
  {
    estado: 'error',
    titulo: 'falló el listado de la raíz: error con código y «Reintentar»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: error,
  },
  {
    estado: 'acciones',
    titulo: 'menú ⋮ de la fila abierto con «Descargar», la única acción de 005',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => S.tabla([], { menuAbierto: 0 }),
  },
  {
    estado: 'descarga-preparando',
    titulo: 'la URL firmada tarda más de 2 s: «Descargar» deshabilitado con «Preparando…»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => S.tabla([], { menuAbierto: 0, preparando: true }),
  },
  {
    estado: 'descarga-fallida',
    titulo: 'falló la descarga (429): aviso arriba de la lista con «Reintentar»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => avisoDescarga(429, 'Propuesta_Nimbo_v3.docx') + S.tabla([]),
  },
];

for (const v of ESTADOS) {
  const file = `explorador--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
