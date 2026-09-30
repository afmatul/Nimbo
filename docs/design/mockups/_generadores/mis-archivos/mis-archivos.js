// Piezas comunes de la página «Mis archivos» (spec 005): íconos de tipo, datos de ejemplo, cuota lateral por tramos,
// encabezado de la página y tabla de la raíz. Las usan carga/generar.js (panel de cargas sobre Mis archivos) y
// explorador/generar.js (estados vacio, cargando y arrastre). El marco sigue saliendo de marco/marco.js.
// Decisiones de Adrián (2026-09-28): en todos los estados de 005 la barra lateral no muestra «Carpetas» ni el contador
// de la Papelera (llegan con 006), y cada fila tiene el menú ⋮ de acciones con «Descargar» como única acción.
const M = require('../marco/marco.js');

// ---------- Íconos de archivo y de carga (trazos de Lucide, 24 × 24) ----------
const P = {
  ...M.P,
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  slides: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
};

// Crea la función icon() sobre un juego de trazos (cada generador puede sumar los suyos).
const crearIcon = (trazos) => (name, size = 18, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${trazos[name]}</svg>`;
const icon = crearIcon(P);

// ---------- Datos de ejemplo (en la app vienen de la API y de PlanLimits; catálogo de product-context §3) ----------
// Plan Equipo: 350 GB de almacenamiento y 1 GB como máximo por archivo.
const PLAN = 'EQUIPO';
const MAX_POR_ARCHIVO = '1 GB';
const CUOTA_NORMAL = { usado: '304 GB', total: '350 GB', pct: 87 };
const CUOTA_LLENA = { usado: '349.4 GB', total: '350 GB', pct: 99.8 };

// Tipo de archivo → ícono y tokens --file-* (FileTypeChip). La extensión siempre va en el nombre.
const TIPOS = {
  docx: ['fileText', 'docx'], xlsx: ['sheet', 'xlsx'], pptx: ['slides', 'pptx'], pdf: ['fileText', 'pdf'],
  txt: ['fileText', 'other'], mp4: ['film', 'other'], zip: ['file', 'other'],
};
const tipo = (nombre) => TIPOS[nombre.split('.').pop().toLowerCase()] || ['file', 'other'];
const tile = (nombre) => { const [ic, t] = tipo(nombre); return `<span class="ftile ftile-${t}">${icon(ic, 16)}</span>`; };

// Archivos en la raíz de «Mis archivos» (el explorador de 005 solo muestra la raíz, RN-4)
const RAIZ = [
  ['Propuesta_Nimbo_v3.docx', '2.4 MB', 'hace 4 min'],
  ['Matriz_Requisitos_RF.xlsx', '860 KB', 'hoy · 09:12'],
  ['Demo_Fase3_avance.pptx', '18.7 MB', 'hace 2 h'],
  ['Modelo_ER_Nimbo.pdf', '1.1 MB', 'ayer'],
];

// ---------- CSS de Mis archivos (tokens de tipo, cuota por tramos, encabezado y tabla) ----------
const CSS_LISTA = `  :root {
    /* Tipos de archivo (ui-guidelines §3): texto AA; fondo = tono base al 12 % */
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --file-xlsx: #3A7560; --file-xlsx-bg: #6DB99A20;
    --file-pptx: #8A6424; --file-pptx-bg: #D4A96A20;
    --file-pdf: #A34F4F;  --file-pdf-bg: #C97B7B20;
    --file-other: #53677D; --file-other-bg: #7A90A820;
  }
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }

  /* Cuota en tramos de QuotaBar (§4): 70–89 % warning; 90–100 % destructive-soft */
  .quota-warn .quota-bar span { background: var(--warning); }
  .quota-full { border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .quota-full .quota-bar span { background: var(--destructive-soft); }
  .quota-note { margin: 8px 0 0; font-size: 11.5px; line-height: 1.45; font-weight: 500; }
  .quota-warn .quota-note { color: var(--warning-foreground); }
  .quota-full .quota-note { color: var(--destructive); }

  /* Encabezado de la página */
  .page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .page-head p { margin-top: 4px; }

  /* Tabla de archivos (explorador, vista de lista) */
  .files { margin-top: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .files table { width: 100%; border-collapse: collapse; }
  .files th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); background: var(--background); border-bottom: 1px solid var(--border); }
  .files td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--secondary-foreground); }
  .files tr:last-child td { border-bottom: 0; }
  .files .c-size, .files .c-date { width: 130px; font-variant-numeric: tabular-nums; }
  .fname { display: flex; align-items: center; gap: 12px; min-width: 0; color: var(--foreground); font-weight: 500; }
  .fname-text { min-width: 0; overflow-wrap: anywhere; }
  .fmeta-m { display: none; }
  .badge-new { margin-left: 8px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--success-foreground); background: var(--success-soft); border: 1px solid color-mix(in srgb, var(--success) 40%, var(--card)); border-radius: var(--radius-sm); padding: 1px 6px; white-space: nowrap; }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: 8px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }
  .ftile-xlsx { color: var(--file-xlsx); background: var(--file-xlsx-bg); }
  .ftile-pptx { color: var(--file-pptx); background: var(--file-pptx-bg); }
  .ftile-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }
  .ftile-other { color: var(--file-other); background: var(--file-other-bg); }

  /* Acciones por fila (DropdownMenu de shadcn, como el menú de la cuenta): botón ⋮ y menú con «Descargar» */
  .files .c-act { width: 64px; padding: 6px 14px 6px 0; text-align: right; }
  .row-actions { position: relative; display: inline-flex; }
  .row-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--secondary-foreground); cursor: pointer; }
  .row-btn:hover, .row-btn[aria-expanded="true"] { background: var(--muted); color: var(--foreground); }
  .account-menu [role="menuitem"][aria-disabled="true"] { cursor: progress; color: var(--secondary-foreground); background: transparent; }
  .account-menu [role="menuitem"][aria-disabled="true"] .ico { color: var(--primary); }
  .row-menu { position: absolute; z-index: 6; top: calc(100% + 4px); right: 0; width: 208px; text-align: left; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); padding: 6px; }
`;

// Reglas de la tabla por debajo de 600 px (van dentro del @media de cada generador)
const CSS_LISTA_MQ600 = `    .app { min-height: 920px; }
    .page-head h1 { font-size: 23px; }
    .files { margin-top: 16px; }
    .files thead { display: none; }
    .files .c-size, .files .c-date { display: none; }
    .files td { padding: 12px; }
    .fmeta-m { display: block; margin-top: 1px; font-size: 12px; font-weight: 400; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
    .files td.c-act { width: 56px; padding: 6px 8px 6px 0; }
    .row-btn { width: 44px; height: 44px; }
`;

// ---------- Piezas ----------
// tramo: 'ok' (0–69 %, sin nota), 'warn' (70–89 %) o 'full' (90–100 %), como QuotaBar.
function cuota(q, tramo) {
  if (tramo === 'ok') return M.cuota(q);
  const nota = tramo === 'full' ? 'Espacio casi agotado' : `Tu cuota está al ${q.pct} %`;
  return M.cuota(q)
    .replace('<div class="quota">', `<div class="quota quota-${tramo}">`)
    .replace(/<\/div>\s*$/, `  <p class="quota-note">${nota}</p>\n      </div>`);
}

// 005: sin «Carpetas» ni contador de la Papelera (llegan con 006).
function sidebar(q, tramo) {
  return M.sidebar({ activo: 'Mis archivos', plan: PLAN, cuota: q, carpetas: [], contadorPapelera: '' })
    .replace(M.cuota(q), cuota(q, tramo));
}

const botonSubir = () => `<button class="btn btn-primary" type="button">${icon('upload', 16)}<span>Subir archivos</span></button>`;

function encabezado() {
  return `
        <div class="page-head">
          <h1>Mis archivos</h1>
          ${botonSubir()}
        </div>`;
}

// Menú ⋮ de una fila. El botón tiene nombre accesible completo; el menú (role="menu") se etiqueta con el botón.
// preparando: la URL firmada tarda más de 2 s; «Descargar» queda deshabilitado (aria-disabled, sigue enfocable) con
// «Preparando…» y un anuncio para lectores de pantalla.
function acciones(i, nombre, abierto, preparando = false) {
  const item = preparando
    ? `<button role="menuitem" type="button" tabindex="-1" aria-disabled="true">${icon('loader', 18, 'spin')}<span>Preparando…</span></button>`
    : `<button role="menuitem" type="button" tabindex="-1">${icon('download')}<span>Descargar</span></button>`;
  const anuncio = preparando ? `<p class="sr-only" role="status">Preparando la descarga de ${nombre}…</p>` : '';
  return `<div class="row-actions"><button class="row-btn" type="button" id="acc-btn-${i}" aria-haspopup="menu" aria-expanded="${abierto}" aria-controls="acc-menu-${i}" aria-label="Acciones de ${nombre}">${icon('more', 18)}</button><div class="row-menu" id="acc-menu-${i}"${abierto ? '' : ' hidden'}><ul class="account-menu" role="menu" aria-labelledby="acc-btn-${i}"><li role="none">${item}</li></ul>${anuncio}</div></div>`;
}

// nuevos: filas recién subidas (con «NUEVO»); menuAbierto: índice de la fila con el menú ⋮ abierto (o -1);
// preparando: ese menú muestra «Preparando…» en lugar de «Descargar».
function tabla(nuevos, { menuAbierto = -1, preparando = false } = {}) {
  const filas = [...nuevos.map((n) => [...n, true]), ...RAIZ].map(([nombre, tam, fecha, nuevo], i) => `
            <tr>
              <td><div class="fname">${tile(nombre)}<div class="fname-text">${nombre}${nuevo ? '<span class="badge-new">NUEVO</span>' : ''}<span class="fmeta-m">${tam} · ${fecha}</span></div></div></td>
              <td class="c-size">${tam}</td>
              <td class="c-date">${fecha}</td>
              <td class="c-act">${acciones(i, nombre, i === menuAbierto, preparando && i === menuAbierto)}</td>
            </tr>`).join('');
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Archivos en Mis archivos</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-date">Modificado</th><th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${filas}
            </tbody>
          </table>
        </div>`;
}

module.exports = {
  P, crearIcon, icon, PLAN, MAX_POR_ARCHIVO, CUOTA_NORMAL, CUOTA_LLENA, RAIZ, tile,
  CSS_LISTA, CSS_LISTA_MQ600, cuota, sidebar, botonSubir, encabezado, tabla,
};
