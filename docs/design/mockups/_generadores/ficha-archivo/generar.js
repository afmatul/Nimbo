// Genera los estados de storage/ficha-archivo para la spec 014 (versiones y restauración): historial de versiones
// (VersionTimeline), confirmar restauración con el espacio que usará y el aviso de poda (CA-15), restaurando, éxito,
// errores (cuota, versión no encontrada, archivo no encontrado, historial que no carga) y descarga de una versión.
// Spec 019: estado de indexación (chip y aviso). Spec 021: tarjeta «Optimizar espacio» para imágenes (estimar,
// confirmar, optimizar y resultado) y el original conservado de 014b en el historial. Los estados de 014 y 019 no
// cambian: el CSS, el diálogo y los datos de 021 solo se aplican a los estados con spec '021'.
// Uso: node generar.js <ruta-del-worktree>
// Marco: marco/marco.js; barra lateral y cuota del plan Personal: espacio/espacio.js; logo, toast y CSS de 006:
// carpetas/carpetas.js; esqueleto, error y Alert: mis-archivos/estados.js.
// ficha-archivo--vision.html (paquete de diseño interno con autoría, indexación y accesos) NO se genera aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const Q = require('../espacio/espacio.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/ficha-archivo');
fs.mkdirSync(OUT, { recursive: true });

const icon = S.crearIcon({
  ...C.P,
  ...Q.P,
  history: M.P.history,
  user: M.P.user,
  info: M.P.info,
  sparkles: M.P.sparkles,
  retry: M.P.retry,
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
});

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + M.CSS.TRAMOS +
  Q.CSS_TARJETA + E.CSS_ESTADOS + C.CSS_006 + `
  /* Propio de storage/ficha-archivo (spec 014) */
  :root {
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --file-pdf: #A34F4F; --file-pdf-bg: #C97B7B20;
  }
  .ftile-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }

  /* Estado de indexación (spec 019, StatusBadge + Alert): chip con ícono y texto, y aviso con el motivo */
  .idx-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-top: 8px; }
  .idx-hint { font-size: 13px; color: var(--secondary-foreground); }
  .idx-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12.5px; font-weight: 600; white-space: nowrap; color: var(--secondary-foreground); background: var(--muted); }
  .idx-chip .ico { flex: none; }
  .idx-chip-ok { color: var(--success-foreground); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 40%, var(--card)); }
  .idx-chip-fail { color: var(--destructive); background: var(--destructive-tint); border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .idx-live .alert { margin-top: 18px; }
  .alert.alert-info { border-color: var(--border); background: var(--card); box-shadow: var(--shadow-card); }
  .alert.alert-info > .ico { color: var(--primary); }
  .alert.alert-info .alert-title { color: var(--foreground); }
  .idx-live .alert-text + .alert-text { margin-top: 6px; }

  .idx-live .alert-actions { align-self: center; }
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: none; border-radius: 10px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }

  /* Encabezado de la ficha: ícono de tipo, nombre, datos y acción principal */
  .file-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .file-head-text { flex: 1; min-width: 0; }
  .file-head h1 { margin: 0; font-size: 24px; line-height: 1.3; font-weight: 700; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .file-head .page-sub { margin-top: 2px; }

  .ficha-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; margin-top: 22px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .card-head { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
  .card-head h2 { margin: 0; font-size: 15px; line-height: 1.4; font-weight: 600; }
  .card-sub { margin: 2px 0 0; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .card-foot { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 12px 20px 14px; border-top: 1px solid var(--border); font-size: 13px; color: var(--secondary-foreground); }
  .card-foot .ico { margin-top: 2px; color: var(--primary); }

  /* Detalles */
  .details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 24px; margin: 0; padding: 16px 20px 18px; }
  .details div { min-width: 0; }
  .details dt { font-size: 12.5px; color: var(--muted-foreground); }
  .details dd { margin: 0; font-size: 13.5px; color: var(--foreground); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

  /* Historial (VersionTimeline): lista ordenada, de la más reciente a la más antigua.
     En escritorio, rejilla de columnas con un encabezado visual (aria-hidden): cada fila ya dice sus datos en texto. */
  .vt-cols, .vt-item { display: grid; grid-template-columns: 170px minmax(170px, 1fr) minmax(200px, 1.2fr) 130px 236px; column-gap: 16px; align-items: center; }
  .vt-cols { padding: 10px 20px; background: var(--background); border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); }
  .vt { list-style: none; margin: 0; padding: 0; }
  .vt-item { padding: 14px 20px; border-bottom: 1px solid var(--border); }
  .vt-item:last-child { border-bottom: 0; }
  .vt-item.is-new { background: var(--brand-soft); box-shadow: inset 3px 0 0 var(--brand); }
  .vt-num { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin: 0; font-size: 14px; font-weight: 600; color: var(--foreground); }
  .vt-when { margin: 0; font-size: 13.5px; color: var(--foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .vt-who { display: inline-flex; align-items: center; gap: 4px; color: var(--secondary-foreground); }
  .vt-who .ico { color: var(--muted-foreground); }
  .vt-origin { display: inline-flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 13px; color: var(--secondary-foreground); }
  .vt-origin .ico { margin-top: 2px; color: var(--primary); }
  .vt-size { margin: 0; font-size: 13.5px; color: var(--foreground); font-variant-numeric: tabular-nums; }
  .vt-delta { display: block; font-size: 12.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .vt-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .vt-label { display: none; }
  /* Distintivo ACTUAL: texto + ícono (no depende del color) */
  .badge-current { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--success-foreground); background: var(--success-soft); border: 1px solid color-mix(in srgb, var(--success) 40%, var(--card)); border-radius: var(--radius-sm); padding: 1px 6px; white-space: nowrap; }
  .badge-new-v { font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--primary-hover); background: var(--card); border: 1px solid var(--brand); border-radius: var(--radius-sm); padding: 1px 6px; white-space: nowrap; }
  .btn[aria-disabled="true"] { cursor: progress; color: var(--secondary-foreground); }
  .btn[aria-disabled="true"] .ico { color: var(--primary); }

  /* Historial con una sola versión: mensaje bajo la única fila */
  .vt-empty { display: flex; gap: 12px; align-items: flex-start; margin: 0; padding: 16px 20px 18px; border-top: 1px dashed var(--border); }
  .vt-empty > .ico { margin-top: 2px; color: var(--muted-foreground); }
  .vt-empty p { margin: 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .vt-empty strong { display: block; color: var(--foreground); font-weight: 600; }

  /* Aviso de poda y error dentro del diálogo (Alert warning / error de ui-guidelines §4) */
  .dlg-warn { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .dlg-warn .ico { margin-top: 1px; color: var(--warning-foreground); }
  .dlg-warn p { margin: 0 !important; font-size: 13.5px !important; color: var(--foreground) !important; }
  .dlg-warn strong { display: block; color: var(--warning-foreground) !important; font-weight: 600; }
  .dlg-alert strong { display: block; color: var(--destructive) !important; font-weight: 600; }
  .dialog-summary { margin: 14px 0 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); }
  .dialog-summary div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13px; }
  .dialog-summary dt { color: var(--secondary-foreground); }
  .dialog-summary dd { margin: 0; color: var(--foreground); font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }

  /* Alert dentro del historial (error con acción) */
  .card-alert { padding: 16px 20px 0; }
  /* Archivo no encontrado: el título del estado es el h1 de la página */
  .state-empty h1 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; letter-spacing: -.01em; }
  .card-alert .alert { margin: 0 0 16px; }

  /* Toast (Toaster, ADR-0024): arriba y al centro, debajo de la barra superior */
  .toast { top: 80px; bottom: auto; left: 50%; right: auto; transform: translateX(-50%); border-radius: var(--radius-md); }

  /* Esqueleto del historial */
  .vt-sk { padding: 16px 20px; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 150px minmax(0, 1fr) 112px; gap: 16px; }
  .vt-sk:last-child { border-bottom: 0; }
  .card .loading-text { margin: 0; padding: 12px 20px 14px; border-top: 1px solid var(--border); }
  .card .state-error { margin: 16px; box-shadow: none; }

  /* Entre 601 y 1180 px la rejilla no cabe: misma pila que en móvil, con las acciones a la derecha */
  @media (max-width: 1180px) and (min-width: 601px) {
    .vt-cols { display: none; }
    .vt-item { grid-template-columns: minmax(0, 1fr) auto; row-gap: 2px; }
    .vt-item > p { grid-column: 1; }
    .vt-actions { grid-column: 2; grid-row: 1 / span 4; }
    .vt-label { display: inline; }
    .vt-delta { display: inline; margin-left: 6px; }
  }
  @media (max-width: 600px) {
    .app { min-height: 920px; }
    .file-head { align-items: flex-start; }
    .file-head h1 { font-size: 21px; }
    .file-head > .btn { width: 100%; min-height: 44px; }
    .ficha-grid { margin-top: 16px; gap: 16px; }
    .card-head { padding: 14px 14px 12px; }
    .card-foot { padding: 12px 14px; }
    .details { padding: 4px 14px 12px; }
    .details { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .vt-delta { display: inline; margin-left: 6px; }
    .vt-cols { display: none; }
    /* Cada versión se apila: número y distintivo, fecha y autor, origen, tamaño y cambio, y las acciones a todo el ancho */
    .vt-item { grid-template-columns: minmax(0, 1fr); row-gap: 4px; padding: 14px; }
    .vt-label { display: inline; }
    .vt-actions { justify-content: stretch; margin-top: 8px; }
    .vt-actions .btn { flex: 1; min-height: 44px; }
    .vt-empty { padding: 14px; }
    .card-alert { padding: 12px 12px 0; }
` + E.CSS_ESTADOS_MQ600 + `
    .vt-sk { grid-template-columns: minmax(0, 1fr); padding: 14px; }
    .toast { top: 72px; bottom: auto; left: 8px; right: 8px; transform: none; }
    .dialog-summary div { flex-direction: column; gap: 0; }
    .dialog-summary dd { text-align: left; }
  }
`;

// ---------- Datos de ejemplo (en la app vienen de GET /files/:id/versions y de PlanLimits) ----------
// Plan Personal (product-context §3): 15 GB, 50 MB por archivo, conserva 3 versiones (incluye la actual, D-2).
// (let: los estados de 019 cambian de archivo y, para «demasiado grande», de plan; 014 siempre usa estos valores)
let PLAN = 'Personal';
let RETENIDAS = 3;
let ARCHIVO = 'Informe_avance_sep.docx';
let TIPO = 'Documento de Word (.docx)';
let TILE = 'docx';
// 021: con la cuenta en solo lectura (010 CA-13) no se ofrece «Restaurar»; 014 y 019 nunca lo activan
let SOLO_LECTURA = false;
const CARPETA = 'Proyecto Alpha';

// Una versión: [número, cuándo, origen, de (restauración), tamaño, cambio frente a la anterior retenida]
// cambio: ['mas'|'menos', texto visible, texto para lectores] o null (sin versión anterior que comparar).
const V = (numero, cuando, origen, tam, cambio, extra = {}) => ({ numero, cuando, origen, tam, cambio, ...extra });
const MAS = (t, ant) => ['mas', `+${t}`, `${t} más que la versión ${ant}`];
const MENOS = (t, ant) => ['menos', `−${t}`, `${t} menos que la versión ${ant}`];

// Archivo en el límite de su plan: 3 de 3 (las versiones 1 y 2 ya se podaron; los números no se reutilizan, RN-4)
const EN_LIMITE = [
  V(5, 'hoy, 10:42', 'carga', '2.6 MB', MAS('200 KB', 4)),
  V(4, 'ayer, 17:20', 'restauracion', '2.4 MB', MENOS('100 KB', 3), { de: 2 }),
  V(3, '2 oct 2026, 09:15', 'carga', '2.5 MB', null),
];
// Archivo por debajo del límite: 2 de 3
const DOS = [
  V(2, 'hoy, 10:42', 'carga', '2.6 MB', MAS('200 KB', 1)),
  V(1, '28 sep 2026, 16:05', 'carga', '2.4 MB', null, { primera: true }),
];
const UNA = [V(1, 'hoy, 10:42', 'carga', '2.6 MB', null, { primera: true })];
// Después de restaurar la versión 4 en el archivo en el límite: nace la 6 y se poda la 3
const RESTAURADA = [
  V(6, 'ahora', 'restauracion', '2.4 MB', MENOS('200 KB', 5), { de: 4, nueva: true }),
  V(5, 'hoy, 10:42', 'carga', '2.6 MB', MAS('200 KB', 4)),
  V(4, 'ayer, 17:20', 'restauracion', '2.4 MB', MENOS('100 KB', 3), { de: 2 }),
];

const ORIGEN = {
  carga: ['upload', 'Carga'],
  restauracion: ['undo', 'Restauración'],
  edicion: ['pencil', 'Edición'], // llega con 016
  optimizacion: ['sparkles', 'Optimización'], // llega con 021
};

// ---------- Piezas ----------
function cambio(v) {
  if (v.cambio) {
    const [, txt, sr] = v.cambio;
    return `<span class="vt-delta"><span aria-hidden="true">${txt}</span><span class="sr-only">${sr}</span></span>`;
  }
  // La primera versión no tiene con qué compararse; la más antigua retenida tampoco si su anterior ya se podó
  if (v.primera) return '<span class="vt-delta">Primera versión</span>';
  return `<span class="vt-delta"><span aria-hidden="true">Sin comparación</span><span class="sr-only">Sin comparación: la versión ${v.numero - 1} ya no se conserva</span></span>`;
}

// acciones: { descarga: 'preparando' } marca «Preparando…» en esa versión
function item(v, { preparando = false } = {}) {
  const actual = v === v.__actual;
  const [ic, origen] = ORIGEN[v.origen];
  const de = v.de ? ` de la versión ${v.de}` : '';
  const badge = actual ? `<span class="badge-current">${icon('check', 11)}ACTUAL</span>` : '';
  const nueva = v.nueva ? '<span class="badge-new-v">NUEVA</span>' : '';
  const descargar = preparando
    ? `<button class="btn btn-outline btn-sm" type="button" aria-disabled="true">${icon('loader', 14, 'spin')}<span>Preparando…</span></button>`
    : `<button class="btn btn-outline btn-sm" type="button" aria-label="Descargar la versión ${v.numero}">${icon('download', 14)}<span>Descargar</span></button>`;
  // La versión actual no se restaura (sería 409 STORAGE_VERSION_ALREADY_CURRENT): no se ofrece el botón
  const restaurar = actual || SOLO_LECTURA ? '' : `<button class="btn btn-outline btn-sm" type="button" aria-label="Restaurar la versión ${v.numero}">${icon('undo', 14)}<span>Restaurar</span></button>`;
  const anuncio = preparando ? `<p class="sr-only" role="status">Preparando la descarga de la versión ${v.numero}…</p>` : '';
  // 021 (014b): la versión anterior a una optimización queda como original conservado, fuera de la cuota
  const conservado = v.conservado ? `
              <p class="vt-kept">${icon('archive', 14)}<span>Original conservado hasta ${v.conservado} · no ocupa tu espacio</span></p>` : '';
  return `
            <li class="vt-item${v.nueva ? ' is-new' : ''}">
              <p class="vt-num">Versión ${v.numero}${badge}${nueva}</p>
              <p class="vt-when">${v.cuando}<span aria-hidden="true"> · </span><span class="vt-who">${icon('user', 13)}<span class="sr-only">, por </span>Tú</span></p>
              <p class="vt-origin">${icon(ic, 14)}<span><span class="vt-label">Origen: </span>${origen}${de}</span></p>
              <p class="vt-size"><span class="vt-label">Tamaño: </span>${v.tam} ${cambio(v)}</p>
              <div class="vt-actions">${descargar}${restaurar}</div>${conservado}${anuncio}
            </li>`;
}

function historial(versiones, { preparando = 0, unaSola = false, alerta = '' } = {}) {
  const lista = versiones.map((v) => Object.assign(v, { __actual: versiones[0] }));
  const n = lista.length;
  const sub = `${n === 1 ? '1 versión' : `${n} versiones`} · tu plan ${PLAN} conserva ${RETENIDAS}, contando la actual`;
  const vacio = unaSola ? `
          <div class="vt-empty">
            ${icon('history', 20)}
            <p><strong>Aún no hay versiones anteriores.</strong>Cuando subas un archivo con el mismo nombre y elijas «Reemplazar», o restaures una versión, aquí verás el historial.</p>
          </div>` : '';
  const pie = unaSola ? '' : `
          <p class="card-foot">${icon('info', 15)}<span>Restaurar crea una versión nueva; solo se elimina la más antigua cuando pasas el límite de tu plan.</span></p>`;
  return `
        <section class="card" aria-labelledby="vt-t">
          <div class="card-head">
            <h2 id="vt-t">Historial de versiones</h2>
            <p class="card-sub">${sub}</p>
          </div>${alerta}
          <div class="vt-cols" aria-hidden="true"><span>Versión</span><span>Fecha y autor</span><span>Origen</span><span>Tamaño</span><span></span></div>
          <ol class="vt" aria-labelledby="vt-t">${lista.map((v) => item(v, { preparando: v.numero === preparando })).join('')}
          </ol>${vacio}${pie}
        </section>`;
}

function detalles(versiones, { filas = '', lector = false } = {}) {
  const actual = versiones[0];
  // Todas las versiones cuentan en la cuota (D-1): suma de los tamaños del historial (salvo el original conservado, 014b)
  const total = `${Math.round(versiones.filter((v) => !v.conservado).reduce((t, v) => t + parseFloat(v.tam), 0) * 10) / 10} MB`;
  return `
        <section class="card" aria-labelledby="det-t">
          <div class="card-head"><h2 id="det-t">Detalles</h2></div>
          <dl class="details">
            <div><dt>Tipo</dt><dd>${TIPO}</dd></div>
            <div><dt>Tamaño</dt><dd>${actual.tam} (versión actual)</dd></div>
            <div><dt>Con versiones</dt><dd>${total} de tu espacio</dd></div>
            <div><dt>${lector ? 'Compartido por' : 'Ubicación'}</dt><dd>${lector ? 'Mónica Pérez' : CARPETA}</dd></div>
            <div><dt>Creado</dt><dd>28 sep 2026</dd></div>
            <div><dt>Modificado</dt><dd>${actual.cuando === 'ahora' ? 'ahora' : actual.cuando}</dd></div>${filas}
          </dl>
        </section>`;
}

function encabezado(versiones, { linea = '', lector = false } = {}) {
  const actual = versiones && versiones[0];
  const donde = lector ? 'Compartidos conmigo' : CARPETA;
  const sub = actual
    ? `${actual.tam} · versión ${actual.numero} · ${lector ? 'compartido por Mónica Pérez · solo lectura' : `en ${CARPETA}`}`
    : `en ${CARPETA}`;
  return `
        <a class="back-link" href="#" aria-label="Volver a ${donde}">${icon('chevronLeft', 18)}<span>${donde}</span></a>
        <div class="file-head">
          <span class="ftile ftile-${TILE}">${icon(TILE === 'img' ? 'image' : 'fileText', 20)}</span>
          <div class="file-head-text">
            <h1>${ARCHIVO}</h1>
            <p class="page-sub">${sub}</p>${linea}
          </div>
          <button class="btn btn-primary" type="button">${icon('download', 16)}<span>Descargar</span></button>
        </div>`;
}

function ficha(versiones, opciones = {}) {
  return `${encabezado(versiones)}
        <div class="ficha-grid">${historial(versiones, opciones)}${detalles(versiones)}
        </div>`;
}

// ---------- Diálogo de restaurar (AlertDialog de shadcn) ----------
// d: { v, tam, poda, pendiente, error }
function dialogoRestaurar(d) {
  const poda = d.poda ? `
    <div id="dlg-p" class="dlg-warn" role="status">${icon('warn', 18)}<p><strong>Se eliminará la versión ${d.poda}.</strong>Tu plan conserva ${RETENIDAS} versiones. Al continuar se eliminará la versión ${d.poda}, la más antigua.</p></div>` : '';
  const error = d.error ? `
    <div class="dlg-alert" role="alert">${icon('alert', 18)}<p><strong>No pudimos restaurar la versión ${d.v}.</strong>${d.error}</p></div>` : '';
  const ids = ['dlg-d', 'dlg-n', d.poda ? 'dlg-p' : ''].filter(Boolean).join(' ');
  const pendiente = d.pendiente ? ' disabled' : '';
  const confirmar = d.pendiente
    ? `<button class="btn btn-primary btn-busy" type="button" disabled>${icon('loader', 16, 'spin')}<span>Restaurando…</span></button>`
    : d.error
      ? '<a class="btn btn-primary" href="#">Liberar espacio</a>'
      : `<button class="btn btn-primary" type="button"${d.poda ? '' : ' autofocus'}>Restaurar versión ${d.v}</button>`;
  const cancelar = `<button class="btn btn-outline" type="button"${pendiente}${d.poda && !d.pendiente && !d.error ? ' autofocus' : ''}${d.error ? ' autofocus' : ''}>${d.error ? 'Cerrar' : 'Cancelar'}</button>`;
  const anuncio = d.pendiente ? `\n    <p class="sr-only" role="status">Restaurando la versión ${d.v}…</p>` : '';
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="${ids}"${d.pendiente ? ' aria-busy="true"' : ''}>
    <h2 id="dlg-t">¿Restaurar la versión ${d.v}?</h2>
    <p id="dlg-d">Se creará una versión nueva con el contenido de la versión ${d.v}. Usará ${d.tam} de tu espacio.</p>
    <dl id="dlg-n" class="dialog-summary">
      <div><dt>Versión ${d.v}</dt><dd>${d.cuando} · Tú</dd></div>
      <div><dt>Versión actual</dt><dd>${d.actual} · se conserva en el historial</dd></div>
    </dl>${poda}${error}
    <div class="dialog-actions">
      ${cancelar}
      ${confirmar}
    </div>${anuncio}
  </div>`;
}

// ---------- Página ----------
const SPEC_TXT = {
  '019': '019: estado de indexación sobre la ficha de 014',
  '021': '021: optimizar una imagen desde la ficha, sobre 014 y 014b',
};
// 021 (P-3, decisión de Adrián): la optimización vive en la ficha; no hay pantalla global ni ítem «Optimizador» en la
// navegación. Se quita solo en los estados de 021 para no cambiar los de 014 y 019 (el ítem viene de marco/marco.js).
const ITEM_OPTIMIZADOR = /\n\s*<li><a href="#"><svg[^>]*>(?:(?!<li>)[\s\S])*?<\/svg><span>Optimizador<\/span><\/a><\/li>/;
function barra(v, q) {
  const html = Q.sidebar({ q, activo: v.activo || 'Mis archivos' });
  return v.spec === '021' ? html.replace(ITEM_OPTIMIZADOR, '') : html;
}
function page(v) {
  const file = v.estado === 'default' ? 'ficha-archivo.html' : `ficha-archivo--${v.estado}.html`;
  const q = v.cuota || Q.CUOTAS.ok;
  return C.conLogo(`${M.cabecera({
    titulo: `Ficha de archivo · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec ${v.spec ? SPEC_TXT[v.spec] : '014: versiones y restauración'}). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo (VersionTimeline).',
      'Generado con _generadores/ficha-archivo/generar.js (marco, espacio, carpetas y estados). No editar a mano.',
    ],
    css: v.spec === '021' ? CSS + CSS_021 : CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">${v.spec || '014'}</span> <strong>Ficha de archivo</strong> <span class="file">${file}</span> <span>plan ${PLAN} (conserva ${RETENIDAS} versiones) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo || v.dialogoOpt ? ' inert' : ''}>
    ${barra(v, q)}
    <div class="main">
      ${M.topbar({ crumbs: v.crumbs || ['Mis archivos', CARPETA, ARCHIVO] })}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>${v.dialogo ? dialogoRestaurar(v.dialogo) : ''}${v.dialogoOpt ? dialogoOptimizar(v.dialogoOpt) : ''}${v.toast || ''}
</div>${v.cuerpo().includes('data-foco') ? `
<script>document.querySelector('[data-foco]').focus();</script>` : ''}

</body>
</html>
`);
}

// ---------- Estados ----------
const esqueleto = () => {
  const fila = (a, b, c) => `<div class="vt-sk"><span class="skeleton-line ${a}"></span><span class="skeleton-line ${b}"></span><span class="skeleton-line ${c}"></span></div>`;
  return `${encabezado(null)}
        <div class="ficha-grid">
          <section class="card" aria-labelledby="vt-t" aria-busy="true">
            <div class="card-head"><h2 id="vt-t">Historial de versiones</h2></div>
            <div aria-hidden="true">${fila('w45', 'w60', 'w70')}${fila('w40', 'w55', 'w60')}${fila('w45', 'w45', 'w70')}</div>
            <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando el historial…</p>
          </section>
          <section class="card" aria-labelledby="det-t" aria-busy="true">
            <div class="card-head"><h2 id="det-t">Detalles</h2></div>
            <div class="details" aria-hidden="true"><span class="skeleton-line w70"></span><br><span class="skeleton-line w55"></span><br><span class="skeleton-line w60"></span></div>
          </section>
        </div>`;
};

const errorCarga = () => `${encabezado(null)}
        <div class="ficha-grid">
          <section class="card" aria-labelledby="vt-t">
            <div class="card-head"><h2 id="vt-t">Historial de versiones</h2></div>${E.errorEstado('No pudimos cargar el historial.', 'Tus versiones siguen guardadas. Inténtalo de nuevo en unos segundos.')}
          </section>${detalles(EN_LIMITE)}
        </div>`;

const noEncontrado = () => `
        <div class="state-empty" role="alert">
          ${icon('folderX', 40)}
          <h1>No encontramos este archivo.</h1>
          <p>Puede que lo hayas movido a la papelera o que ya no exista.</p>
          <a class="btn btn-primary" href="#">Ir a Mis archivos</a>
        </div>`;

const alertaNoEncontrada = E.aviso({
  titulo: 'No encontramos la versión 3.',
  texto: 'Puede que se haya eliminado al superar las versiones que conserva tu plan. Actualiza el historial para ver las disponibles.',
  accion: 'Actualizar historial',
});

const ESTADOS = [
  { estado: 'default', titulo: 'historial en el límite del plan (3 de 3): número, fecha, autor, tamaño, cambio, origen y versión actual', cuerpo: () => ficha(EN_LIMITE) },
  { estado: 'una-version', titulo: 'historial con una sola versión: solo «Descargar» y cómo nacen las versiones', cuerpo: () => ficha(UNA, { unaSola: true }) },
  { estado: 'cargando', titulo: 'cargando el historial (esqueleto)', cuerpo: esqueleto },
  { estado: 'error', titulo: 'el historial no cargó: causa y «Reintentar»', cuerpo: errorCarga },
  {
    estado: 'confirmar-restauracion', titulo: 'confirmar restaurar la versión 1 con el espacio que usará (2 de 3, sin poda)',
    cuerpo: () => ficha(DOS),
    dialogo: { v: 1, tam: '2.4 MB', cuando: '28 sep 2026, 16:05', actual: 'Versión 2' },
  },
  {
    estado: 'aviso-de-poda', titulo: 'confirmar restaurar en el límite del plan: avisa qué versión se eliminará (CA-15)',
    cuerpo: () => ficha(EN_LIMITE),
    dialogo: { v: 4, tam: '2.4 MB', cuando: 'ayer, 17:20', actual: 'Versión 5', poda: 3 },
  },
  {
    estado: 'restaurando', titulo: 'restaurando (> 2 s): botones deshabilitados, indicador y anuncio',
    cuerpo: () => ficha(EN_LIMITE),
    dialogo: { v: 4, tam: '2.4 MB', cuando: 'ayer, 17:20', actual: 'Versión 5', poda: 3, pendiente: true },
  },
  {
    estado: 'restaurada', titulo: 'éxito: la versión 6 nace de la 4 y pasa a ser la actual; la 3 se eliminó por el límite',
    cuerpo: () => ficha(RESTAURADA),
    // La poda corre después del commit y es de mejor esfuerzo (plan 014 §1): el toast no la afirma; el historial recargado la muestra
    toast: C.toast({ texto: 'Restauraste la versión 4 como versión 6.' }),
  },
  {
    estado: 'error-cuota', titulo: 'no cabe en la cuota: «Te faltan 1.6 MB…» con «Liberar espacio» (CA-12)',
    cuota: Q.CUOTAS.llena,
    cuerpo: () => ficha(EN_LIMITE),
    dialogo: { v: 4, tam: '2.4 MB', cuando: 'ayer, 17:20', actual: 'Versión 5', poda: 3, error: 'Te faltan 1.6 MB de espacio para restaurar esta versión. Libera espacio o cambia de plan.' },
  },
  {
    estado: 'error-version-no-encontrada', titulo: 'la versión ya no existe (podada o restaurada desde otra pestaña): «Actualizar historial» (CA-11)',
    cuerpo: () => `${encabezado(EN_LIMITE)}
        <div class="ficha-grid">${historial(EN_LIMITE, { alerta: `<div class="card-alert">${alertaNoEncontrada}</div>` })}${detalles(EN_LIMITE)}
        </div>`,
  },
  {
    estado: 'no-encontrado', titulo: 'el archivo está en la papelera, no existe o no es tuyo: 404 sin detalles (CA-16, CA-17)',
    crumbs: ['Mis archivos'],
    cuerpo: noEncontrado,
  },
  {
    estado: 'descarga-preparando', titulo: 'descarga de la versión 4 (> 2 s): «Preparando…» y anuncio (CA-8)',
    cuerpo: () => ficha(EN_LIMITE, { preparando: 4 }),
  },
];

// ---------- Spec 019: estado de indexación en la ficha (chip + aviso con el motivo, solo aquí: P-3) ----------
// idx: { e: 'indexando'|'indexado'|'no-indexable'|'fallido', motivo, lector, reintentando, errorReintento, foco }
const CHIP = {
  indexando: ['', 'loader', 'Indexando…', 'Ya puedes seguir trabajando'],
  indexado: ['ok', 'check', 'Indexado', 'Listo para consultar con el agente'],
  'no-indexable': ['', 'info', 'No se indexa', 'Se busca solo por nombre'],
  fallido: ['fail', 'alert', 'No se pudo indexar', ''],
};
function lineaIdx(idx) {
  const [tono, ic, texto, pista] = CHIP[idx.e];
  const chip = `<span class="idx-chip${tono ? ` idx-chip-${tono}` : ''}">${icon(ic, 14, idx.e === 'indexando' ? 'spin' : '')}<span class="sr-only">Estado de indexación: </span>${texto}</span>`;
  return `
            <div class="idx-line">${chip}${pista ? `<span class="idx-hint">${pista}</span>` : ''}</div>`;
}

const MOTIVO = {
  'sin-texto': ['No pudimos leer el texto de este PDF.', 'Se busca solo por nombre. Parece un documento escaneado, sin texto que se pueda seleccionar. Puedes descargarlo y compartirlo como siempre.', 'Si tienes una copia con texto, súbela con el mismo nombre y elige «Reemplazar».'],
  formato: ['No pudimos leer el contenido de este archivo.', 'Su contenido no corresponde a un documento de Word, aunque el nombre termine en .docx. Se busca solo por nombre; puedes descargarlo y compartirlo como siempre.'],
  grande: ['Este archivo es demasiado grande para indexarlo.', 'Nimbo indexa archivos de hasta 50 MB y este pesa 120 MB. Se busca solo por nombre; puedes descargarlo y compartirlo como siempre.'],
};

// El contenedor role="status" existe siempre (también vacío): así el cambio de estado en vivo (015) se anuncia sin mover el foco.
function avisoIdx(idx) {
  const parrafos = (ts) => ts.map((t) => `<p class="alert-text">${t}</p>`).join('');
  const caja = (tono, ic, titulo, textos, accion = '') => `
        <div class="alert alert-${tono}">
          ${icon(ic, 18, ic === 'loader' ? 'spin' : '')}
          <div class="alert-body">
            <p class="alert-title">${titulo}</p>${parrafos(textos)}
          </div>${accion ? `
          <div class="alert-actions">${accion}</div>` : ''}
        </div>`;
  let cuerpo = '';
  if (idx.e === 'indexando') {
    cuerpo = caja('info', 'loader', 'Indexando… ya puedes seguir trabajando.', ['Estamos leyendo este archivo para que puedas consultarlo con el agente. Descargarlo, editarlo y compartirlo funciona con normalidad. Este aviso se actualiza solo cuando termine.']);
  } else if (idx.e === 'no-indexable') {
    const [t, ...ps] = MOTIVO[idx.motivo];
    cuerpo = caja('info', 'info', t, ps);
  } else if (idx.e === 'fallido' && idx.lector) {
    cuerpo = caja('fail', 'alert', 'No pudimos indexar este archivo.', ['Solo quien puede editarlo puede reintentarlo. Mientras tanto, el archivo sigue disponible para descargar.']);
  } else if (idx.e === 'fallido') {
    const btn = idx.reintentando
      ? `<button class="btn btn-outline btn-sm" type="button" aria-disabled="true" data-foco>${icon('loader', 14, 'spin')}<span>Reintentando…</span></button>`
      : `<button class="btn btn-outline btn-sm" type="button"${idx.foco ? ' data-foco' : ''}>${icon('retry', 14)}<span>Reintentar</span></button>`;
    const titulo = idx.errorReintento ? 'No pudimos reintentar la indexación.' : 'No pudimos indexar este archivo.';
    const texto = idx.errorReintento
      ? 'Tu archivo no cambió. Revisa tu conexión y vuelve a intentarlo en unos segundos.'
      : 'Lo intentamos varias veces y no fue posible. Tu archivo está a salvo y puedes seguir trabajando. Reintenta ahora o inténtalo más tarde.';
    cuerpo = caja('fail', 'alert', titulo, [texto], btn)
      + (idx.reintentando ? '\n        <p class="sr-only">Reintentando la indexación…</p>' : '');
  }
  return `
        <div class="idx-live" role="status">${cuerpo}
        </div>`;
}

const FILA_IDX = {
  indexando: 'En curso · versión 1',
  indexado: 'hoy, 10:44 · versión 1',
  'no-indexable': 'No aplica: se busca solo por nombre',
  fallido: 'Falló hoy, 10:44 · versión 1',
};
const filaIdx = (idx) => `<div><dt>Indexación</dt><dd>${FILA_IDX[idx.e]}</dd></div>`;

function fichaIdx(versiones, idx) {
  const l = !!idx.lector;
  const grid = l ? detalles(versiones, { filas: filaIdx(idx), lector: true }) : `${historial(versiones, { unaSola: true })}${detalles(versiones, { filas: filaIdx(idx) })}`;
  return `${encabezado(versiones, { linea: lineaIdx(idx), lector: l })}${avisoIdx(idx)}
        <div class="ficha-grid">${grid}
        </div>`;
}

// Archivo de ejemplo de cada estado de 019: [nombre, tipo, ícono de tile, tamaño]
const ARCH = {
  docx: ['Informe_avance_sep.docx', 'Documento de Word (.docx)', 'docx', '2.6 MB'],
  pdf: ['Contrato_arrendamiento_escaneado.pdf', 'Documento PDF (.pdf)', 'pdf', '4.1 MB'],
  falso: ['Plano_oficina.docx', 'Documento de Word (.docx)', 'docx', '1.2 MB'],
  grande: ['Manual_operaciones_completo.pdf', 'Documento PDF (.pdf)', 'pdf', '120 MB'],
};
const UNICA = (tam) => [V(1, 'hoy, 10:42', 'carga', tam, null, { primera: true })];
const E19 = (estado, titulo, arch, idx, extra = {}) => ({
  estado, titulo, spec: '019', arch, idx, ...extra,
  crumbs: extra.crumbs || ['Mis archivos', CARPETA, ARCH[arch][0]],
  cuerpo: () => fichaIdx(UNICA(ARCH[arch][3]), idx),
});

ESTADOS.push(
  E19('indexando', 'indexando (pendiente o en curso): «Indexando… ya puedes seguir trabajando»', 'docx', { e: 'indexando' }),
  E19('indexado', 'indexado: listo para consultar con el agente', 'docx', { e: 'indexado' }),
  E19('indexado-aviso', 'indexado en vivo: aviso al terminar mientras la miras, sin recargar', 'docx', { e: 'indexado' }, {
    toast: C.toast({ texto: 'Listo para consultar con el agente: Informe_avance_sep.docx.' }),
  }),
  E19('no-indexable', 'no indexable por falta de texto (PDF escaneado): se busca solo por nombre', 'pdf', { e: 'no-indexable', motivo: 'sin-texto' }),
  E19('no-indexable-formato', 'no indexable por formato no soportado (el contenido no coincide con la extensión)', 'falso', { e: 'no-indexable', motivo: 'formato' }),
  E19('no-indexable-grande', 'no indexable por tamaño (supera el tope de indexación; plan Pro)', 'grande', { e: 'no-indexable', motivo: 'grande' }, { plan: ['Pro', 30] }),
  E19('fallido', 'indexación fallida: motivo y «Reintentar» para propietario y editor', 'docx', { e: 'fallido', foco: true }),
  E19('fallido-reintentando', 'reintentando (> 2 s): botón deshabilitado con indicador y anuncio, el foco no se pierde', 'docx', { e: 'fallido', reintentando: true }),
  E19('fallido-error-reintento', 'no se pudo reintentar (red): dice qué hacer y «Reintentar» sigue disponible', 'docx', { e: 'fallido', errorReintento: true, foco: true }),
  E19('solo-lectura-lector', 'vista de lector (solo lectura): ve el estado y el motivo, sin «Reintentar» ni historial', 'docx', { e: 'fallido', lector: true }, {
    activo: 'Compartidos conmigo', crumbs: ['Compartidos conmigo', 'Informe_avance_sep.docx'],
  }),
);

// ---------- Spec 021: optimizar una imagen desde la ficha (tarjeta «Optimizar espacio») ----------
// Solo imágenes (png, jpg/jpeg, gif estático, webp; RN-1). Para un PDF, un .docx u otro tipo la tarjeta no se dibuja.
// El estado se consulta periódicamente (sin tiempo real): el contenedor role="status" existe siempre y su contenido cambia.
// Umbral marginal (P-2) y límites de tamaño y resolución (P-11) aún sin medir: la UI no muestra cifras de límite.
const CSS_021 = `
  /* Propio de la spec 021: tarjeta «Optimizar espacio», original conservado en el historial y diálogo de optimizar */
  :root { --file-img: #276B7A; --file-img-bg: #7EC8D820; }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }
  .opt-body { padding: 16px 20px 18px; }
  .opt-body > p { margin: 0; max-width: 68ch; font-size: 13.5px; color: var(--secondary-foreground); }
  .opt-body .alert { margin: 0; }
  .opt-body .alert + .opt-actions, .opt-saving + .alert { margin-top: 14px; }
  .opt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .opt-actions .btn-primary { min-height: 36px; padding: 6px 14px; font-size: 13px; }

  /* Cifras de la estimación: tamaño actual y estimado, barra comparativa (decorativa) y ahorro en texto */
  .opt-figs { display: flex; flex-wrap: wrap; gap: 6px 40px; margin: 0; }
  .opt-figs dt { font-size: 12.5px; color: var(--muted-foreground); }
  .opt-figs dd { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 600; color: var(--foreground); font-variant-numeric: tabular-nums; }
  .opt-bar { display: block; max-width: 360px; height: 8px; margin-top: 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--muted); overflow: hidden; }
  .opt-bar span { display: block; height: 100%; border-radius: 999px; background: var(--primary); }
  .opt-saving { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; font-size: 14px; font-weight: 600; color: var(--success-foreground); font-variant-numeric: tabular-nums; }
  .opt-saving.is-min { color: var(--secondary-foreground); }
  .opt-note { display: flex; gap: 8px; align-items: flex-start; margin: 8px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .opt-note .ico { margin-top: 2px; color: var(--primary); flex: none; }

  /* En curso (estimando u optimizando, > 2 s, RNF-14): texto, indicador indeterminado y botón ocupado (el foco no se pierde) */
  .opt-busy { display: flex; gap: 10px; align-items: flex-start; }
  .opt-busy > .ico { margin-top: 2px; color: var(--primary); flex: none; }
  .opt-busy p { margin: 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .opt-busy strong { display: block; color: var(--foreground); font-weight: 600; }
  .opt-progress { position: relative; max-width: 360px; height: 6px; margin-top: 12px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .opt-progress span { position: absolute; top: 0; bottom: 0; left: 0; width: 35%; border-radius: 999px; background: var(--primary); animation: opt-indet 1.6s ease-in-out infinite; }
  @keyframes opt-indet { from { left: -35%; } to { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .opt-progress span { animation: none; width: 100%; background: color-mix(in srgb, var(--primary) 35%, var(--muted)); } }

  /* Resultado: texto de la tarjeta, con los estilos del ahorro y de la nota (sin variante de Alert nueva) */
  .opt-body > .opt-saving:first-child { margin-top: 0; }

  /* Solo lectura (010): «Optimizar» deshabilitado (aria-disabled, sigue enfocable), descrito por el ReadOnlyBanner de la vista */
  .opt-actions .btn-primary[aria-disabled="true"] { opacity: .45; cursor: not-allowed; color: var(--primary-foreground); box-shadow: none; }
  .opt-actions .btn-primary[aria-disabled="true"] .ico { color: var(--primary-foreground); }

  /* Original conservado (014b): marca de texto con ícono a lo ancho de la fila del historial */
  .vt-item > .vt-kept { grid-column: 1 / -1; justify-self: start; display: inline-flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--muted); font-size: 12.5px; font-weight: 600; color: var(--secondary-foreground); }
  .vt-kept .ico { flex: none; margin-top: 2px; color: var(--primary); }

  @media (max-width: 600px) {
    .opt-body { padding: 14px; }
    .opt-body .alert { padding: 12px; }
    .opt-actions .btn, .opt-actions .btn-primary { flex: 1; min-height: 44px; }
    .opt-figs { gap: 6px 28px; }
    .vt-item > .vt-kept { margin-top: 6px; }
  }
`;

// Datos de ejemplo: JPEG del plan Personal con 3 de 3 versiones; la optimización se registra hoy (25 oct 2026) y el
// original se conserva 7 días (retención en papelera del plan Personal): hasta el 1 nov 2026.
const OPT = { actual: '4.8 MB', estimado: '2.9 MB', ahorro: '1.9 MB', pct: '40 %', resto: 60, hasta: '1 nov 2026', poda: 1 };
const OPT_MIN = { actual: '4.8 MB', estimado: '4.7 MB', ahorro: '100 KB', pct: '2 %', resto: 98 };
const IMG = [
  V(3, 'hoy, 09:30', 'carga', '4.8 MB', MAS('300 KB', 2)),
  V(2, '12 oct 2026, 11:05', 'carga', '4.5 MB', MENOS('100 KB', 1)),
  V(1, '28 sep 2026, 16:20', 'carga', '4.6 MB', null, { primera: true }),
];
// Después de optimizar: nace la 4 (optimización, actual); la 3 queda como original conservado y se poda la 1
const IMG_OPT = [
  V(4, 'ahora', 'optimizacion', '2.9 MB', MENOS('1.9 MB', 3), { nueva: true }),
  V(3, 'hoy, 09:30', 'carga', '4.8 MB', MAS('300 KB', 2), { conservado: OPT.hasta }),
  V(2, '12 oct 2026, 11:05', 'carga', '4.5 MB', null),
];
Object.assign(ARCH, {
  img: ['Foto_inventario.jpg', 'Imagen JPEG (.jpg)', 'img', '4.8 MB'],
  'img-grande': ['Plano_bodega_alta_resolucion.png', 'Imagen PNG (.png)', 'img', '32 MB'],
  'img-mpx': ['Panoramica_bodega.jpg', 'Imagen JPEG (.jpg)', 'img', '18.4 MB'],
  gif: ['Demo_etiquetado.gif', 'Imagen GIF (.gif)', 'img', '6.2 MB'],
});
// Cuota antes y después: la bajada de 1.9 MB cruza el redondeo a un decimal (4.85 GB → 4.9 GB; después, 4.8 GB)
const CUOTA_ANTES = { usado: '4.9 GB', total: Q.CUOTA_TOTAL, pct: 32 };

const btnCalcular = () => `<button class="btn btn-outline btn-sm" type="button">${icon('sparkles', 14)}<span>Calcular ahorro</span></button>`;
const btnOcupado = (t) => `<button class="btn btn-outline btn-sm" type="button" aria-disabled="true">${icon('loader', 14, 'spin')}<span>${t}</span></button>`;
const acciones = (b) => `
            <div class="opt-actions">${b}</div>`;

function cifras(c, { minimo = false } = {}) {
  return `
            <dl class="opt-figs">
              <div><dt>Tamaño actual</dt><dd>${c.actual}</dd></div>
              <div><dt>Tamaño estimado</dt><dd>${c.estimado}</dd></div>
            </dl>
            <span class="opt-bar" aria-hidden="true"><span style="width: ${c.resto}%"></span></span>
            <p class="opt-saving${minimo ? ' is-min' : ''}">${icon('arrowDown', 16)}<span>Ahorrarías ${c.ahorro} (${c.pct})</span></p>`;
}

function optAviso(tono, ic, titulo, texto = '') {
  return `
            <div class="alert alert-${tono}">
              ${icon(ic, 18)}
              <div class="alert-body">
                <p class="alert-title">${titulo}</p>${texto ? `
                <p class="alert-text">${texto}</p>` : ''}
              </div>
            </div>`;
}

const enCurso = (titulo, texto) => `
            <div class="opt-busy">${icon('loader', 18, 'spin')}<p><strong>${titulo}</strong> ${texto}</p></div>
            <div class="opt-progress" role="progressbar" aria-label="${titulo.replace('…', '')}"><span></span></div>`;

const NO_DISPONIBLE = {
  grande: 'Esta imagen supera el tamaño máximo permitido para optimizarla.',
  mpx: 'Esta imagen supera la resolución máxima permitida para optimizarla.',
  animado: 'La optimización no está disponible para GIF animados.',
};

const CUERPO_OPT = {
  sin: () => `
            <p>Calcula cuánto espacio recuperarías al optimizar esta imagen sin cambiar su formato ni sus dimensiones.</p>${acciones(btnCalcular())}`,
  estimando: () => `${enCurso('Calculando el ahorro…', 'Puedes seguir usando la ficha mientras tanto.')}${acciones(btnOcupado('Calculando…'))}`,
  conviene: (o) => `${cifras(OPT)}
            <p class="opt-note">${icon('info', 14)}<span>Se creará una versión optimizada. El original se conserva 7 días y no ocupa tu espacio.</span></p>${acciones(`<button class="btn btn-primary" type="button"${o.soloLectura ? ' aria-disabled="true" aria-describedby="ro-t"' : ''}>${icon('sparkles', 14)}<span>Optimizar</span></button>`)}`,
  'no-conviene': () => `${cifras(OPT_MIN, { minimo: true })}${optAviso('info', 'info', 'El ahorro sería mínimo; no vale la pena optimizar esta imagen.')}`,
  'no-disponible': (o) => optAviso('info', 'info', NO_DISPONIBLE[o.motivo]),
  optimizando: () => `${enCurso('Optimizando…', 'Puedes seguir usando Nimbo; te mostramos el resultado aquí.')}${acciones(btnOcupado('Optimizando…'))}`,
  completada: () => `
            <p class="opt-saving">${icon('check', 16)}<span>Optimizamos tu imagen: ahorraste ${OPT.ahorro} (${OPT.pct}).</span></p>
            <p class="opt-note">${icon('info', 14)}<span>El original se conserva hasta el ${OPT.hasta} y no ocupa tu espacio. Si lo necesitas, restáuralo desde el historial.</span></p>`,
  descartada: () => optAviso('info', 'info', 'El ahorro real fue mínimo. Tu archivo no cambió.'),
  'error-integridad': () => optAviso('fail', 'alert', 'No pudimos optimizar este archivo sin dañarlo.', 'Tu archivo no cambió y puedes seguir usándolo como está.'),
  'error-servicio': () => `${optAviso('fail', 'alert', 'El optimizador no está disponible ahora.', 'Tu archivo no cambió; vuelve a intentarlo más tarde.')}${acciones(btnCalcular())}`,
};

function tarjetaOpt(o) {
  return `
        <section class="card" aria-labelledby="opt-t">
          <div class="card-head"><h2 id="opt-t">Optimizar espacio</h2></div>
          <div class="opt-body" role="status">${CUERPO_OPT[o.e](o)}
          </div>
        </section>`;
}

// Solo lectura (010 CA-13): el ReadOnlyBanner del marco, una sola vez, arriba de la vista (como layout--solo-lectura)
const BANNER_SOLO_LECTURA = {
  titulo: 'Tu suscripción venció y tu cuenta está en solo lectura.',
  cuerpo: 'Renueva tu plan para volver a subir, editar y compartir.',
};
function fichaOpt(versiones, o, { filas = '' } = {}) {
  const hist = historial(versiones, versiones.length === 1 ? { unaSola: true } : {});
  return `${o.soloLectura ? M.avisoSoloLectura(BANNER_SOLO_LECTURA) : ''}${encabezado(versiones)}
        <div class="ficha-grid">${tarjetaOpt(o)}${hist}${detalles(versiones, { filas })}
        </div>`;
}

// Diálogo de optimizar (AlertDialog): mismo patrón que restaurar; en 3 de 3 avisa qué versión se eliminará (CA-12)
function dialogoOptimizar(d) {
  const poda = d.poda ? `
    <div id="dlg-p" class="dlg-warn" role="status">${icon('warn', 18)}<p><strong>Se eliminará la versión ${d.poda}.</strong>Tu plan conserva ${RETENIDAS} versiones. Al continuar se eliminará la versión ${d.poda}, la más antigua.</p></div>` : '';
  const ids = ['dlg-d', 'dlg-n', d.poda ? 'dlg-p' : ''].filter(Boolean).join(' ');
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="${ids}">
    <h2 id="dlg-t">¿Optimizar esta imagen?</h2>
    <p id="dlg-d">Se creará una versión optimizada. El original se conserva hasta el ${OPT.hasta} y no ocupa tu espacio.</p>
    <dl id="dlg-n" class="dialog-summary">
      <div><dt>Tamaño actual</dt><dd>${OPT.actual} · versión 3</dd></div>
      <div><dt>Tamaño estimado</dt><dd>${OPT.estimado} · ahorras ${OPT.ahorro} (${OPT.pct})</dd></div>
    </dl>${poda}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button"${d.poda ? ' autofocus' : ''}>Cancelar</button>
      <button class="btn btn-primary" type="button"${d.poda ? '' : ' autofocus'}>Optimizar</button>
    </div>
  </div>`;
}

const E21 = (estado, titulo, o, extra = {}) => {
  const arch = extra.arch || 'img';
  const versiones = extra.versiones || (arch === 'img' ? IMG : UNICA(ARCH[arch][3]));
  return {
    estado: `optimizar-${estado}`, titulo, spec: '021', arch, cuota: CUOTA_ANTES, ...extra,
    crumbs: ['Mis archivos', CARPETA, ARCH[arch][0]],
    cuerpo: () => fichaOpt(versiones, o, extra),
  };
};

ESTADOS.push(
  E21('sin-estimacion', 'imagen sin estimación: «Calcular ahorro» (CA-1)', { e: 'sin' }),
  E21('estimando', 'calculando el ahorro (> 2 s): progreso indeterminado y anuncio; la ficha sigue usable (CA-1, RNF-14)', { e: 'estimando' }),
  E21('conviene', 'el ahorro conviene: tamaño actual, estimado, ahorro en bytes y % y «Optimizar» (CA-1)', { e: 'conviene' }),
  E21('confirmar', 'confirmar optimizar en 3 de 3: avisa qué versión se eliminará (CA-6, CA-13)', { e: 'conviene' }, { dialogoOpt: { poda: OPT.poda } }),
  E21('no-conviene', 'ahorro mínimo: se explica y no aparece «Optimizar» (CA-2)', { e: 'no-conviene' }),
  E21('no-disponible', 'no disponible por tamaño: supera el máximo permitido, sin cifra en la UI (CA-5)', { e: 'no-disponible', motivo: 'grande' }, { arch: 'img-grande' }),
  E21('no-disponible-megapixeles', 'no disponible por resolución: supera el máximo permitido, sin cifra en la UI (CA-5)', { e: 'no-disponible', motivo: 'mpx' }, { arch: 'img-mpx' }),
  E21('no-disponible-animado', 'no disponible: GIF animado (CA-5; el WebP animado sí se optimiza)', { e: 'no-disponible', motivo: 'animado' }, { arch: 'gif' }),
  E21('optimizando', 'optimizando en segundo plano: progreso indeterminado y anuncio; Nimbo sigue usable (CA-6, RNF-14)', { e: 'optimizando' }),
  E21('completada', 'completada: versión 4 «Optimización» actual, la 3 como original conservado y la cuota baja (CA-7, CA-15)', { e: 'completada' }, {
    versiones: IMG_OPT, cuota: Q.CUOTAS.ok,
    filas: `<div><dt>Original conservado</dt><dd>${OPT.actual} · versión 3, hasta el ${OPT.hasta}; no ocupa tu espacio</dd></div>`,
  }),
  E21('descartada', 'descartada: el ahorro real fue mínimo y el archivo no cambió (CA-10; CA-11 como variante de texto)', { e: 'descartada' }),
  E21('error-integridad', 'el resultado no pasó la verificación: el archivo no cambió, sin invitar a repetir (CA-9)', { e: 'error-integridad' }),
  E21('error-servicio', 'optimizador no disponible: el archivo no cambió y «Calcular ahorro» sigue disponible (CA-14)', { e: 'error-servicio' }),
  E21('solo-lectura', 'cuenta en solo lectura: banner de 010 arriba; ve la estimación y «Optimizar» queda deshabilitado (CA-17)', { e: 'conviene', soloLectura: true }, { soloLectura: true }),
);

for (const v of ESTADOS) {
  // Cada estado fija su archivo y su plan (los de 014 usan los valores por defecto)
  const a = v.arch ? ARCH[v.arch] : ['Informe_avance_sep.docx', 'Documento de Word (.docx)', 'docx'];
  [ARCHIVO, TIPO, TILE] = a;
  [PLAN, RETENIDAS] = v.plan || ['Personal', 3];
  SOLO_LECTURA = !!v.soloLectura;
  const file = v.estado === 'default' ? 'ficha-archivo.html' : `ficha-archivo--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
