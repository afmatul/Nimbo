// Genera los estados de storage/vista-previa (spec 017): visor de solo lectura de PDF, imagen, TXT/MD, XLSX y PPTX,
// sus estados de carga, vacío, falla y no encontrado, y la entrada desde el menú ⋮ de la fila con «Previsualizar».
// Uso: node docs/design/mockups/storage/vista-previa/generar.js <ruta-del-worktree>
// Vive junto al mockup (y no en _generadores/) porque la tarea T-05 de 017 solo toca esta carpeta. Reutiliza sin
// cambios: marco/marco.js (marco), mis-archivos/ (tipos, menú ⋮, estados), carpetas/carpetas.js (logo, encabezado de
// carpeta), espacio/espacio.js (barra lateral de 007, plan Personal) y explorador/desglose.js (tabla con el menú ⋮ de
// 006). Son referencia visual; apps/web no los importa.
const fs = require('node:fs');
const path = require('node:path');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const GEN = path.join(repo, 'docs/design/mockups/_generadores');
const M = require(path.join(GEN, 'marco/marco.js'));
const S = require(path.join(GEN, 'mis-archivos/mis-archivos.js'));
const E = require(path.join(GEN, 'mis-archivos/estados.js'));
const C = require(path.join(GEN, 'carpetas/carpetas.js'));
const Q = require(path.join(GEN, 'espacio/espacio.js'));
const D = require(path.join(GEN, 'explorador/desglose.js'));
const OUT = path.join(repo, 'docs/design/mockups/storage/vista-previa');

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const icon = S.crearIcon({
  ...C.P, ...Q.P,
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  fileX: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m14.5 12.5-5 5"/><path d="m9.5 12.5 5 5"/>',
  fileQuestion: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 17h.01"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
});

// ---------- Datos de ejemplo (en la app salen de PreviewUrlResponse.file y del lector del navegador) ----------
const RUTA = ['Mis archivos', 'Proyecto Alpha', 'Documentación'];
const CARPETA = RUTA[RUTA.length - 1];
// kind: el de archivo.tipo (FileSummary.kind); chip: rótulo de FileTypeChip
const ARCH = {
  pdf: { nombre: 'Casos_de_uso_completos.pdf', tam: '6.4 MB', fecha: '10 sep', chip: 'PDF', tile: 'pdf', ic: 'fileText' },
  img: { nombre: 'Arquitectura_C4_contexto.png', tam: '1.8 MB', fecha: '2 sep', chip: 'PNG', tile: 'img', ic: 'image' },
  txt: { nombre: 'Bitacora_de_decisiones.md', tam: '36 KB', fecha: 'ayer', chip: 'TEXTO', tile: 'other', ic: 'fileText' },
  xlsx: { nombre: 'Cronograma_fases.xlsx', tam: '212 KB', fecha: '27 sep', chip: 'XLSX', tile: 'xlsx', ic: 'sheet' },
  pptx: { nombre: 'Presentacion_avance.pptx', tam: '22.9 MB', fecha: '26 sep', chip: 'PPTX', tile: 'pptx', ic: 'slides' },
  vacio: { nombre: 'Plantilla_defensa_final.pptx', tam: '31 KB', fecha: 'hoy · 07:50', chip: 'PPTX', tile: 'pptx', ic: 'slides' },
  docx: { nombre: 'Informe_avance_fase1.docx', tam: '1.4 MB', fecha: '29 sep', chip: 'DOCX', tile: 'docx', ic: 'fileText' },
};
// Admiten vista previa: pdf, imagen (PNG/JPG/JPEG/GIF/WebP), texto (TXT/MD), xlsx y pptx (RN-1)
const ADMITIDOS = /\.(pdf|png|jpe?g|gif|webp|txt|md|xlsx|pptx)$/i;
const partir = (n) => n.replace(/_/g, '_<wbr>');

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + `
  /* Propio de storage/vista-previa (spec 017) */
` + S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + Q.CSS_TARJETA + D.CSS + `
  :root { --file-img: #276B7A; --file-img-bg: #7EC8D820; }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }

  /* Encabezado del visor: «Volver», nombre, chip de tipo, metadatos, «Solo lectura» y «Descargar» */
  .pv-back { margin: -6px 0 12px -4px; }
  .pv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
  .pv-title { display: flex; align-items: flex-start; gap: 14px; min-width: 0; flex: 1 1 420px; }
  .pv-title .ftile { width: 40px; height: 40px; border-radius: 10px; margin-top: 2px; }
  .pv-title h1 { margin: 0; font-size: 24px; line-height: 1.3; font-weight: 700; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .pv-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 6px 0 0; font-size: 13.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .ftchip { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
  .ftchip-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }
  .ftchip-img { color: var(--file-img); background: var(--file-img-bg); }
  .ftchip-other { color: var(--file-other); background: var(--file-other-bg); }
  .ftchip-xlsx { color: var(--file-xlsx); background: var(--file-xlsx-bg); }
  .ftchip-pptx { color: var(--file-pptx); background: var(--file-pptx-bg); }
  .badge-ro { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 6px; border-radius: 999px; background: var(--muted); border: 1px solid var(--border); color: var(--secondary-foreground); font-size: 12px; font-weight: 600; }
  .pv-actions { display: flex; gap: 10px; flex: none; }
  .sk-title { width: min(420px, 70%); height: 22px; }
  .sk-meta { width: 180px; height: 12px; margin-top: 10px; }

  /* Visor: tarjeta con barra de herramientas y lienzo (bg-muted). Sobre muted el texto va en secondary-foreground */
  .viewer { margin-top: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .vw-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; min-height: 56px; padding: 8px 12px 8px 16px; border-bottom: 1px solid var(--border); }
  .vw-info { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .vw-info strong { color: var(--foreground); font-weight: 600; }
  .vw-info .ico { color: var(--primary); }
  .vw-body { padding: 24px; background: var(--muted); }
  .vw-body:focus-visible { outline-offset: -2px; }
  .pager { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .pager .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); border: 1px solid var(--input); background: var(--card); }
  .pager .icon-btn[aria-disabled="true"] { opacity: .45; cursor: default; }
  .pager input { width: 52px; min-height: 36px; padding: 4px 6px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-variant-numeric: tabular-nums; text-align: center; }
  .pager input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .pager label { font-weight: 500; }

  /* PDF: páginas apiladas (canvas + capa de texto en la app); las siguientes se cargan al acercarse */
  .pdf-pages { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px; justify-items: center; }
  .pdf-page { width: 100%; max-width: 720px; }
  .pdf-sheet { aspect-ratio: 210 / 297; padding: 8% 9%; background: var(--card); border: 1px solid var(--border); border-radius: 4px; box-shadow: var(--shadow-card); color: var(--foreground); font-size: 13px; line-height: 1.55; }
  .pdf-sheet h2 { margin: 0 0 4px; font-size: 22px; line-height: 1.25; font-weight: 700; }
  .pdf-sheet h3 { margin: 18px 0 6px; font-size: 14.5px; font-weight: 700; }
  .pdf-sheet p { margin: 0 0 8px; }
  .pdf-sheet .pdf-sub { color: var(--secondary-foreground); }
  .pdf-sheet ol, .pdf-sheet ul { margin: 0 0 8px; padding-left: 20px; }
  .pdf-sheet table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12.5px; }
  .pdf-sheet th, .pdf-sheet td { padding: 6px 8px; border: 1px solid var(--border); text-align: left; vertical-align: top; }
  .pdf-sheet th { width: 32%; background: var(--background); font-weight: 600; }
  .pdf-cover { display: flex; flex-direction: column; justify-content: space-between; }
  .pdf-toc { margin-top: 28px !important; }
  .pdf-toc li { display: flex; gap: 8px; }
  .pdf-toc li span:nth-child(2) { flex: 1; border-bottom: 1px dotted var(--input); transform: translateY(-4px); }
  .pdf-num { margin: 8px 0 0; text-align: center; font-size: 12.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .pdf-sheet-sk { display: flex; flex-direction: column; gap: 12px; }
  .pdf-sheet-sk .skeleton-line { background: var(--border); }

  /* Imagen: tal cual, ajustada al ancho disponible, sobre el lienzo */
  .img-stage { display: flex; justify-content: center; }
  .img-stage svg { display: block; width: 100%; max-width: 960px; height: auto; background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow-card); }
  .c4-box { fill: var(--card); stroke: var(--primary); stroke-width: 2; }
  .c4-main { fill: var(--brand-soft); stroke: var(--primary); stroke-width: 2.5; }
  .c4-ext { fill: var(--muted); stroke: var(--input); stroke-width: 2; stroke-dasharray: 6 4; }
  .c4-t { fill: var(--foreground); font: 600 17px Inter, system-ui, sans-serif; }
  .c4-s { fill: var(--secondary-foreground); font: 400 13px Inter, system-ui, sans-serif; }
  .c4-line { stroke: var(--secondary-foreground); stroke-width: 1.6; fill: none; }
  .c4-head { fill: var(--secondary-foreground); }

  /* Texto: literal, sin convertir Markdown; misma familia Inter (no hay font-mono) */
  .txt-doc { max-width: 880px; margin: 0 auto; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
  .txt-doc pre { margin: 0; padding: 20px 24px; font: inherit; font-size: 14px; line-height: 1.65; color: var(--foreground); white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font-variant-numeric: tabular-nums; }

  /* XLSX: pestañas de hojas (tablist) y cuadrícula con valores guardados */
  .sheet-tabs { display: flex; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
  .sheet-tabs [role="tab"] { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; border: 1px solid transparent; border-radius: var(--radius-md); background: transparent; color: var(--secondary-foreground); font: inherit; font-size: 13.5px; font-weight: 500; white-space: nowrap; cursor: pointer; }
  .sheet-tabs [role="tab"]:hover { background: var(--muted); color: var(--foreground); }
  .sheet-tabs [role="tab"][aria-selected="true"] { background: var(--accent); color: var(--foreground); font-weight: 600; box-shadow: inset 0 -3px 0 var(--primary); }
  .vw-alert { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 16px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); font-size: 13.5px; color: var(--foreground); }
  .vw-alert .ico { margin-top: 2px; color: var(--primary); }
  .vw-alert p { margin: 0; }
  .vw-alert strong { font-weight: 600; }
  .grid-wrap { overflow: auto; max-height: 560px; background: var(--card); border: 1px solid var(--input); border-radius: var(--radius-md); }
  .grid-wrap:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .xl { border-collapse: separate; border-spacing: 0; font-size: 13.5px; font-variant-numeric: tabular-nums; min-width: 100%; }
  .xl th, .xl td { padding: 8px 12px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); white-space: nowrap; text-align: left; }
  .xl thead th { position: sticky; top: 0; z-index: 1; background: var(--background); color: var(--secondary-foreground); font-size: 12px; font-weight: 600; text-align: center; }
  .xl tbody th { position: sticky; left: 0; background: var(--background); color: var(--secondary-foreground); font-size: 12px; font-weight: 600; text-align: center; min-width: 44px; }
  .xl thead th:first-child { left: 0; z-index: 2; }
  .xl td { color: var(--foreground); }
  .xl td.num { text-align: right; }
  .xl tr.xl-head td { font-weight: 600; background: var(--muted); }
  .xl td.nv { color: var(--secondary-foreground); font-style: italic; }
  .xl td.nv .ico { vertical-align: -2px; margin-right: 4px; color: var(--primary); }

  /* PPTX: texto de cada diapositiva en orden, en tarjetas 16:9 (crecen si el texto no cabe) */
  .slides { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px; justify-items: center; }
  .slide { width: 100%; max-width: 680px; }
  .slide-card { aspect-ratio: 16 / 9; display: flex; flex-direction: column; padding: 28px 36px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); color: var(--foreground); }
  .slide-card h2 { margin: 0 0 12px; font-size: 22px; line-height: 1.3; font-weight: 700; }
  .slide-card p { margin: 0 0 6px; font-size: 15px; color: var(--secondary-foreground); }
  .slide-card ul { margin: 0; padding-left: 20px; font-size: 15px; line-height: 1.6; }
  .slide-title { justify-content: center; text-align: center; }
  .slide-title h2 { font-size: 28px; }
  .slide-num { margin: 8px 0 0; text-align: center; font-size: 12.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }

  /* Espera larga (> 2 s): barra indeterminada + texto en aria-live; respeta prefers-reduced-motion */
  .wait { display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 460px; margin: 32px auto; padding: 28px 24px; text-align: center; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .wait > .ico { color: var(--primary); }
  .wait h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .wait p { margin: 0; font-size: 14px; color: var(--secondary-foreground); }
  .wait .btn { margin-top: 8px; }
  .indet { position: relative; width: 100%; height: 6px; margin: 6px 0 2px; border-radius: 999px; background: var(--muted); border: 1px solid var(--input); overflow: hidden; }
  .indet span { position: absolute; top: 0; bottom: 0; width: 35%; border-radius: 999px; background: var(--primary); animation: indet 1.6s ease-in-out infinite; }
  @keyframes indet { 0% { left: -35%; } 100% { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .indet span { animation: none; left: 0; width: 100%; opacity: .35; } }

  /* Estados del visor (StateView): neutro (borde discontinuo) o error (destructive-tint); dos acciones */
  .vw-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 320px; padding: 40px 24px; text-align: center; }
  .vw-state > .ico { margin-bottom: 14px; color: var(--secondary-foreground); }
  .vw-state h2 { margin: 0; font-size: 17px; line-height: 1.45; font-weight: 600; }
  .vw-state p { margin: 6px 0 0; max-width: 52ch; font-size: 14px; color: var(--secondary-foreground); }
  .vw-state .btn-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 22px; }
  .vw-state .vw-ref { margin-top: 14px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .vw-body-state { background: var(--card); }
  .vw-state-error { background: var(--destructive-tint); }
  .vw-state-error > .ico, .vw-state-error h2 { color: var(--destructive); }
  .vw-state-error p { color: var(--foreground); }
  .vw-state-warn > .ico, .vw-state-warn h2 { color: var(--warning-foreground); }

  /* Volver: el foco regresa al control ⋮ de la fila de origen (anillo visible) */
  .row-btn.foco { outline: 2px solid var(--ring); outline-offset: 2px; background: var(--muted); color: var(--foreground); }
  .files tr.fila-origen td { background: color-mix(in srgb, var(--accent) 45%, var(--card)); }
  .files tr.fila-origen .fmeta-m { color: var(--secondary-foreground); } /* muted-foreground no llega a 4.5 sobre la fila marcada */

  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .pv-back { min-height: 44px; margin: -4px 0 8px -4px; }
    .pv-title { flex-basis: 100%; gap: 12px; }
    .pv-title .ftile { width: 34px; height: 34px; }
    .pv-title h1 { font-size: 20px; }
    .pv-actions { width: 100%; }
    .pv-actions .btn { flex: 1; min-height: 44px; }
    .viewer { margin-top: 16px; border-radius: var(--radius-md); }
    .vw-bar { padding: 8px 10px; }
    .vw-body { padding: 12px; }
    .pager .icon-btn { width: 44px; height: 44px; }
    .pager input { min-height: 44px; width: 56px; font-size: 16px; }
    .pdf-sheet { padding: 7% 7%; font-size: 9.5px; line-height: 1.45; }
    .pdf-sheet h2 { font-size: 15px; }
    .pdf-sheet h3 { margin-top: 10px; font-size: 11px; }
    .pdf-sheet table { font-size: 9px; }
    .pdf-sheet th, .pdf-sheet td { padding: 3px 4px; }
    .sheet-tabs { width: 100%; }
    .sheet-tabs [role="tab"] { min-height: 44px; }
    .txt-doc pre { padding: 14px; font-size: 13.5px; }
    .slide-card { padding: 16px 18px; }
    .slide-card h2 { font-size: 16px; margin-bottom: 8px; }
    .slide-title h2 { font-size: 19px; }
    .slide-card p, .slide-card ul { font-size: 13px; line-height: 1.5; }
    .wait { margin: 12px auto; padding: 22px 16px; }
    .wait .btn, .vw-state .btn-row .btn { width: 100%; min-height: 44px; }
    .vw-state { min-height: 280px; padding: 32px 16px; }
    .vw-state .btn-row { width: 100%; flex-direction: column; }
  }
`;

// ---------- Piezas del encabezado ----------
// En móvil y escritorio «Volver» es visible: regresa a la carpeta de origen (file.folderId o la raíz) y devuelve el
// foco al control ⋮ de esa fila (plan §2.5). El nombre accesible incluye el texto visible.
function volver(destino = CARPETA) {
  return `
        <a class="btn btn-outline btn-sm pv-back" href="#" aria-label="Volver a ${destino}">${icon('arrowLeft', 16)}<span>Volver</span></a>`;
}

const tileDe = (a, size = 20) => `<span class="ftile ftile-${a.tile}" aria-hidden="true">${icon(a.ic, size)}</span>`;
const botonDescargar = (cls = 'btn-outline') => `<button class="btn ${cls}" type="button">${icon('download', 16)}<span>Descargar</span></button>`;

// conDescargar: «Descargar» del encabezado (en los estados de falla las acciones van en el cuerpo, sin duplicarlas)
function encabezado(a, { conDescargar = true } = {}) {
  return volver() + `
        <div class="pv-head">
          <div class="pv-title">${tileDe(a)}
            <div>
              <h1>${partir(a.nombre)}</h1>
              <p class="pv-meta"><span class="ftchip ftchip-${a.tile}">${a.chip}</span><span>${a.tam} · Modificado el ${a.fecha}</span><span class="badge-ro">${icon('eye', 14)}Solo lectura</span></p>
            </div>
          </div>${conDescargar ? `
          <div class="pv-actions">${botonDescargar()}</div>` : ''}
        </div>`;
}

// Sin nombre: mientras llega la respuesta de la API (cargando) y en «no encontrado» (ajeno = inexistente, CA-5)
function encabezadoSinNombre({ esqueleto = false, destino = CARPETA } = {}) {
  const titulo = esqueleto
    ? `<div aria-hidden="true"><span class="skeleton-line sk-title"></span><span class="skeleton-line sk-meta"></span></div><h1 class="sr-only">Vista previa</h1>`
    : `<div><h1>Vista previa</h1></div>`;
  return volver(destino) + `
        <div class="pv-head">
          <div class="pv-title">${esqueleto ? '<span class="skeleton-line tile" aria-hidden="true"></span>' : ''}
            ${titulo}
          </div>
        </div>`;
}

function visor(a, { barra = '', cuerpo, claseCuerpo = '', etiqueta } = {}) {
  return `
        <section class="viewer" aria-label="${etiqueta || `Vista previa de ${a.nombre}`}">${barra ? `
          <div class="vw-bar">${barra}
          </div>` : ''}
          <div class="vw-body${claseCuerpo ? ` ${claseCuerpo}` : ''}">${cuerpo}
          </div>
        </section>`;
}
const info = (ic, html) => `
            <p class="vw-info">${icon(ic, 16)}<span>${html}</span></p>`;

// ---------- PDF (multipágina) ----------
function pdf() {
  const a = ARCH.pdf;
  const barra = `
            <div class="pager" role="group" aria-label="Páginas">
              <button class="icon-btn" type="button" aria-label="Página anterior" aria-disabled="true">${icon('chevronLeft', 18)}</button>
              <label for="pag">Página</label><input id="pag" type="text" inputmode="numeric" value="1" aria-describedby="pag-total"><span id="pag-total">de 24</span>
              <button class="icon-btn" type="button" aria-label="Página siguiente">${icon('chevronRight', 18)}</button>
            </div>` + info('info', 'Texto seleccionable · sin ejecutar scripts del PDF');
  const portada = `
              <li class="pdf-page"><div class="pdf-sheet pdf-cover">
                <div>
                  <p class="pdf-sub">Universidad Rafael Landívar · Ingeniería de Software I · 2026</p>
                  <h2>Casos de uso completos</h2>
                  <p class="pdf-sub">Nimbo: almacenamiento como servicio. Versión 3, 10 de septiembre de 2026.</p>
                  <ol class="pdf-toc">
                    <li><span>1. Actores del sistema</span><span></span><span>2</span></li>
                    <li><span>2. CU-01 a CU-08: cuenta y acceso</span><span></span><span>3</span></li>
                    <li><span>3. CU-09 a CU-18: archivos y carpetas</span><span></span><span>9</span></li>
                    <li><span>4. CU-19 a CU-24: planes y pagos</span><span></span><span>16</span></li>
                    <li><span>5. CU-25 a CU-33: edición e inteligencia</span><span></span><span>20</span></li>
                  </ol>
                </div>
                <p class="pdf-sub">Documento de requisitos · uso interno del equipo</p>
              </div><p class="pdf-num" aria-hidden="true">Página 1 de 24</p></li>`;
  const pagina2 = `
              <li class="pdf-page"><div class="pdf-sheet">
                <h3>CU-12 Subir un archivo</h3>
                <table>
                  <tr><th scope="row">Actor</th><td>Cliente con sesión iniciada</td></tr>
                  <tr><th scope="row">Precondición</th><td>El archivo no supera el límite por archivo de su plan y queda espacio en su cuota.</td></tr>
                  <tr><th scope="row">Resultado</th><td>El archivo queda guardado en la carpeta elegida y aparece en la lista.</td></tr>
                </table>
                <h3>Flujo principal</h3>
                <ol>
                  <li>El cliente elige «Subir archivos» o arrastra los archivos a la lista.</li>
                  <li>El sistema valida el tipo, el tamaño y la cuota disponible.</li>
                  <li>El sistema sube el archivo por partes y muestra el progreso.</li>
                  <li>Al terminar, el archivo aparece con la marca «NUEVO».</li>
                </ol>
                <h3>Flujos alternos</h3>
                <ul>
                  <li><strong>3a.</strong> Se pierde la conexión: la carga se pausa y se reanuda al volver.</li>
                  <li><strong>2a.</strong> No queda espacio: se informa la causa y se ofrece «Liberar espacio».</li>
                </ul>
              </div><p class="pdf-num" aria-hidden="true">Página 2 de 24</p></li>`;
  const pagina3 = `
              <li class="pdf-page" aria-hidden="true"><div class="pdf-sheet pdf-sheet-sk"><span class="skeleton-line w40"></span><span class="skeleton-line w70"></span><span class="skeleton-line w60"></span><span class="skeleton-line w55"></span><span class="skeleton-line w45"></span></div><p class="pdf-num">Página 3 de 24</p></li>`;
  return encabezado(a) + visor(a, {
    barra,
    cuerpo: `
            <ol class="pdf-pages" aria-label="Páginas de ${a.nombre}">${portada}${pagina2}${pagina3}
            </ol>
            <p class="sr-only" role="status">Página 1 de 24. Las páginas siguientes se cargan al desplazarte.</p>`,
  });
}

// ---------- Imagen ----------
function imagen() {
  const a = ARCH.img;
  const caja = (x, y, w, h, cls, t, s) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="c4-t" x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle">${t}</text><text class="c4-s" x="${x + w / 2}" y="${y + h / 2 + 18}" text-anchor="middle">${s}</text>`;
  const svg = `<svg viewBox="0 0 960 600" role="img" aria-label="${a.nombre}" xmlns="http://www.w3.org/2000/svg">
              <defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="c4-head" d="M0 0L10 5L0 10z"/></marker></defs>
              <text class="c4-t" x="40" y="48">Diagrama de contexto (C4, nivel 1)</text>
              <text class="c4-s" x="40" y="72">Nimbo · Proyecto Final de Ingeniería de Software I</text>
              ${caja(380, 110, 200, 90, 'c4-box', 'Cliente', 'Persona: guarda y edita')}
              ${caja(340, 260, 280, 110, 'c4-main', 'Nimbo', 'Almacenamiento como servicio')}
              ${caja(60, 450, 220, 90, 'c4-ext', 'ONLYOFFICE Docs', 'Edición de .docx')}
              ${caja(370, 450, 220, 90, 'c4-ext', 'Proveedor de LLM', 'Respuestas con citas')}
              ${caja(680, 450, 220, 90, 'c4-ext', 'Servidor de correo', 'Verificación y avisos')}
              ${caja(700, 110, 200, 90, 'c4-box', 'Soporte', 'Persona: solo metadatos')}
              <path class="c4-line" d="M480 200V256" marker-end="url(#fl)"/>
              <path class="c4-line" d="M800 200L620 290" marker-end="url(#fl)"/>
              <path class="c4-line" d="M400 370L200 446" marker-end="url(#fl)"/>
              <path class="c4-line" d="M480 370V446" marker-end="url(#fl)"/>
              <path class="c4-line" d="M560 370L760 446" marker-end="url(#fl)"/>
            </svg>`;
  return encabezado(a) + visor(a, {
    barra: info('image', '<strong>PNG</strong> · 1600 × 1000 px · ajustada al ancho'),
    cuerpo: `
            <div class="img-stage">
              ${svg}
            </div>`,
  });
}

// ---------- Texto (TXT/MD literal) ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TEXTO_MD = `# Bitácora de decisiones

Proyecto Nimbo · Ingeniería de Software I (URL, 2026)

## 2026-09-12 — Cola de trabajos
- **Decisión:** usar BullMQ sobre Redis para el worker.
- **Motivo:** reintentos, prioridades y panel de estado sin otra pieza.
- Ver [ADR-0009](../adr/0009-cola-de-trabajos.md).

## 2026-09-20 — Vista previa en el navegador
- **Decisión:** el visor lee los bytes con fetch y los dibuja él mismo.
- **Motivo:** la URL temporal conserva \`Content-Disposition: attachment\`.
- Pendiente: medir memoria con PDF de más de 300 páginas.

> Nota: este archivo se muestra tal cual; <b>las etiquetas</b> no se interpretan.

| Fecha      | Responsable | Estado    |
|------------|-------------|-----------|
| 2026-09-12 | Adrián      | Aceptada  |
| 2026-09-20 | Abel        | Propuesta |
`;
function texto() {
  const a = ARCH.txt;
  const lineas = TEXTO_MD.trimEnd().split('\n').length;
  return encabezado(a) + visor(a, {
    barra: info('fileText', `<strong>Texto sin formato</strong> · ${lineas} líneas · UTF-8`) + info('info', 'Se muestra tal cual: el Markdown no se convierte'),
    cuerpo: `
            <div class="txt-doc"><pre>${esc(TEXTO_MD.trimEnd())}</pre></div>`,
  });
}

// ---------- XLSX (varias hojas, valores guardados, «Sin valor guardado») ----------
const NV = `${icon('info', 14)}Sin valor guardado`;
const FILAS_XL = [
  ['Fase', 'Inicio', 'Fin', 'Días', 'Avance', 'Entrega'],
  ['0 · Requisitos y diseño', '28/08/2026', '10/09/2026', '14', '100 %', '11/09/2026'],
  ['1 · Auth, almacenamiento y cuotas', '11/09/2026', '29/09/2026', '19', '100 %', '30/09/2026'],
  ['2 · Planes, compartición y edición', '01/10/2026', '13/10/2026', NV, '35 %', '14/10/2026'],
  ['3 · Indexación y agente', '09/10/2026', '22/10/2026', NV, '0 %', '23/10/2026'],
  ['4 · Pulido y exposición', '23/10/2026', '06/11/2026', NV, '0 %', '06/11/2026'],
  ['Total', '', '', '33', '47 %', ''],
];
function hoja() {
  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  const num = (j) => j >= 3 && j <= 4;
  const filas = FILAS_XL.map((f, i) => `
                  <tr${i === 0 ? ' class="xl-head"' : ''}><th scope="row">${i + 1}</th>${f.map((c, j) => `<td${c === NV ? ' class="nv"' : num(j) && i > 0 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('');
  return `
              <table class="xl">
                <caption class="sr-only">Hoja Cronograma: valores guardados en el archivo</caption>
                <thead><tr><th scope="col"><span class="sr-only">Fila</span></th>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
                <tbody>${filas}
                </tbody>
              </table>`;
}
function xlsx() {
  const a = ARCH.xlsx;
  const hojas = ['Cronograma', 'Responsables', 'Supuestos'];
  const tabs = hojas.map((h, i) => `<button role="tab" type="button" id="tab-${i}" aria-selected="${i === 0}" aria-controls="hoja-${i}"${i === 0 ? '' : ' tabindex="-1"'}>${icon('sheet', 15)}<span>${h}</span></button>`).join('');
  return encabezado(a) + visor(a, {
    barra: `
            <div class="sheet-tabs" role="tablist" aria-label="Hojas de ${a.nombre}">${tabs}</div>` + info('info', 'Hoja 1 de 3 · valores guardados'),
    cuerpo: `
            <div role="tabpanel" id="hoja-0" aria-labelledby="tab-0">
              <div class="vw-alert" role="note">${icon('info', 18)}<p><strong>3 celdas tienen una fórmula sin valor guardado.</strong> Nimbo muestra los valores que guardó el archivo y no recalcula fórmulas. Para ver el resultado, abre el archivo en tu hoja de cálculo y guárdalo de nuevo.</p></div>
              <div class="grid-wrap" tabindex="0" role="region" aria-label="Celdas de la hoja Cronograma">${hoja()}
              </div>
            </div>`,
  });
}

// ---------- PPTX (texto de cada diapositiva en orden) ----------
const DIAPOS = [
  { titulo: 'Nimbo: avance de la Fase 2', texto: ['Proyecto Final · Ingeniería de Software I', 'Universidad Rafael Landívar · 26 de septiembre de 2026'], portada: true },
  { titulo: 'Qué entregamos en la Fase 1', lista: ['Registro, verificación e inicio de sesión con sesiones por dispositivo', 'Carga por partes con pausa y reanudación', 'Carpetas, papelera y cuota por plan', 'Bitácora de actividad del cliente'] },
  { titulo: 'En qué estamos ahora', lista: ['Planes y pago simulado en quetzales', 'Compartir con otras cuentas y enlaces públicos', 'Edición colaborativa de .docx con ONLYOFFICE', 'Vista previa de PDF, imágenes, texto, hojas y presentaciones'] },
  { titulo: 'Riesgos', lista: ['Memoria del navegador con archivos muy grandes', 'Tiempo de integración de ONLYOFFICE', 'Cuotas de la API del modelo de lenguaje'] },
  { titulo: 'Próximos pasos', lista: ['Indexación y agente con citas (Fase 3)', 'Pruebas de carga y de aislamiento', 'Ensayo de la demo con datos sintéticos'] },
];
function pptx() {
  const a = ARCH.pptx;
  const n = DIAPOS.length;
  const slide = (d, i) => `
              <li class="slide" aria-label="Diapositiva ${i + 1} de ${n}">
                <div class="slide-card${d.portada ? ' slide-title' : ''}">
                  <h2>${d.titulo}</h2>${d.texto ? d.texto.map((t) => `
                  <p>${t}</p>`).join('') : ''}${d.lista ? `
                  <ul>${d.lista.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
                </div>
                <p class="slide-num" aria-hidden="true">Diapositiva ${i + 1} de ${n}</p>
              </li>`;
  return encabezado(a) + visor(a, {
    barra: info('slides', `<strong>${n} diapositivas</strong>`) + info('info', 'Solo el texto de cada diapositiva: sin imágenes, animaciones ni notas'),
    cuerpo: `
            <ol class="slides" aria-label="Diapositivas de ${a.nombre}">${DIAPOS.map(slide).join('')}
            </ol>`,
  });
}

// ---------- Cargando (< 2 s) y espera larga (> 2 s) ----------
function cargando() {
  return encabezadoSinNombre({ esqueleto: true }) + `
        <section class="viewer" aria-busy="true" aria-label="Vista previa">
          <div class="vw-bar" aria-hidden="true"><span class="skeleton-line w30"></span></div>
          <div class="vw-body">
            <ol class="pdf-pages" aria-hidden="true"><li class="pdf-page"><div class="pdf-sheet pdf-sheet-sk"><span class="skeleton-line w40"></span><span class="skeleton-line w70"></span><span class="skeleton-line w60"></span><span class="skeleton-line w55"></span></div></li></ol>
            <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Abriendo la vista previa…</p>
          </div>
        </section>`;
}

function esperaLarga() {
  const a = ARCH.pptx;
  return encabezado(a) + visor(a, {
    cuerpo: `
            <div class="wait" role="status" aria-live="polite">
              ${icon('loader', 28, 'spin')}
              <h2>Preparando la vista previa…</h2>
              <div class="indet" role="progressbar" aria-label="Preparando la vista previa"><span></span></div>
              <p>Es un archivo grande (${a.tam}) y puede tardar un poco más. Puedes seguir esperando, volver a tus archivos o descargarlo.</p>
            </div>`,
  });
}

// ---------- Vacío válido y fallas (CA-1, CA-2) ----------
// tono: '' (neutro), 'error' (role="alert") o 'warn'. acciones: HTML de los botones.
function estadoVista({ tono = '', ic, titulo, texto, acciones, ref = '' }) {
  const rol = tono === 'error' ? 'alert' : 'status';
  return `
            <div class="vw-state${tono ? ` vw-state-${tono}` : ''}" role="${rol}">
              ${icon(ic, 40)}
              <h2>${titulo}</h2>
              <p>${texto}</p>
              <div class="btn-row">${acciones}</div>${ref ? `
              <p class="vw-ref">${ref}</p>` : ''}
            </div>`;
}
const reintentar = (cls = 'btn-outline') => `<button class="btn ${cls}" type="button">${icon('retry', 16)}<span>Reintentar</span></button>`;
// Orden: la acción que más probablemente resuelve va primero y en primario (decisión de UX del README)
const accionesFalla = (primero = 'descargar') => (primero === 'reintentar'
  ? reintentar('btn-primary') + botonDescargar()
  : botonDescargar('btn-primary') + reintentar());

function falla(a, e) {
  return encabezado(a, { conDescargar: false }) + visor(a, {
    claseCuerpo: 'vw-body-state', cuerpo: estadoVista(e),
  });
}

function vacio() {
  const a = ARCH.vacio;
  return encabezado(a, { conDescargar: false }) + visor(a, {
    claseCuerpo: 'vw-body-state',
    cuerpo: estadoVista({
      ic: 'slides', titulo: 'Este archivo no tiene contenido para mostrar.',
      texto: 'La presentación no tiene diapositivas. Descárgala si quieres revisarla en tu equipo.',
      acciones: botonDescargar('btn-primary'),
    }),
  });
}

function noEncontrado() {
  return encabezadoSinNombre({ destino: 'Mis archivos' }) + `
        <section class="viewer" aria-label="Vista previa">
          <div class="vw-body vw-body-state">${estadoVista({
    ic: 'fileQuestion', titulo: 'No encontramos este archivo.',
    texto: 'Puede que esté en la papelera, que ya no tengas acceso o que el enlace no sea correcto.',
    acciones: `<a class="btn btn-primary" href="#">${icon('folder', 16)}<span>Ir a Mis archivos</span></a>`,
  })}
          </div>
        </section>`;
}

// ---------- Entrada desde el explorador: menú ⋮ con «Previsualizar» primero ----------
const NODOS = [
  { tipo: 'carpeta', nombre: 'Anexos', fecha: '29 sep' },
  { tipo: 'carpeta', nombre: 'Borradores', fecha: 'hace 3 h' },
  { tipo: 'archivo', nombre: ARCH.pdf.nombre, tam: ARCH.pdf.tam, fecha: ARCH.pdf.fecha },
  { tipo: 'archivo', nombre: ARCH.img.nombre, tam: ARCH.img.tam, fecha: ARCH.img.fecha },
  { tipo: 'archivo', nombre: ARCH.txt.nombre, tam: ARCH.txt.tam, fecha: ARCH.txt.fecha },
  { tipo: 'archivo', nombre: ARCH.docx.nombre, tam: ARCH.docx.tam, fecha: ARCH.docx.fecha },
  { tipo: 'archivo', nombre: 'Entrevista_cliente_audio.m4a', tam: '38.6 MB', fecha: '28 ago' },
  { tipo: 'archivo', nombre: ARCH.xlsx.nombre, tam: ARCH.xlsx.tam, fecha: ARCH.xlsx.fecha },
  { tipo: 'archivo', nombre: ARCH.pptx.nombre, tam: ARCH.pptx.tam, fecha: ARCH.pptx.fecha },
];
const ITEM_PREVISUALIZAR = `<li role="none">${C.itemMenu('eye', 'Previsualizar')}</li>`;
// La tabla de 006 (desglose.js) con el menú ⋮ de cada archivo; a los admitidos se les antepone «Previsualizar»
// (slot firstAction de file-row-menu.tsx, plan §2.5). DOCX y «otros» no lo muestran.
function tablaConVista(opciones) {
  let html = D.tabla(NODOS, { lugar: CARPETA, ...opciones });
  for (const n of NODOS) {
    if (n.tipo !== 'archivo' || !ADMITIDOS.test(n.nombre)) continue;
    const re = new RegExp(`(aria-label="Acciones de ${n.nombre.replace(/\./g, '\\.')}">[\\s\\S]*?role="menu"[^>]*>)`);
    html = html.replace(re, `$1${ITEM_PREVISUALIZAR}`);
  }
  // Imágenes con el chip de imagen (FileTypeChip), como en generar-orden.js
  return html.replace(/<span class="ftile ftile-other">(<svg[^>]*>[\s\S]*?<\/svg>)<\/span>(<div class="fname-text">Arquitectura)/, `<span class="ftile ftile-img">${icon('image', 16)}</span>$2`);
}
const explorador = (opciones) => () => C.encabezado(RUTA) + tablaConVista(opciones);
function volverFoco() {
  return C.encabezado(RUTA) + tablaConVista({})
    .replace(/<tr ([^>]*)>(\s*<td class="tree-guides"><div class="fname tree-indent">(?:(?!<\/tr>)[\s\S])*?Casos_<wbr>de_<wbr>uso)/, '<tr $1 class="fila-origen">$2')
    .replace(/class="row-btn"([^>]*aria-label="Acciones de Casos_de_uso_completos\.pdf")/, 'class="row-btn foco" autofocus$1')
    + `
        <p class="sr-only" role="status">Volviste a ${CARPETA}.</p>`;
}

// Teclado de las pestañas de hojas (patrón tabs de WAI-ARIA, activación manual): ← → Inicio Fin mueven el foco.
const JS_TABS = `
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  tabs.forEach(function (t, i) {
    t.addEventListener('keydown', function (e) {
      var n = tabs.length, j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % n; else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
      if (j === null) return; e.preventDefault(); tabs[j].focus();
    });
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); x.tabIndex = x === t ? 0 : -1; });
    });
  });
})();
`;

// ---------- Página ----------
function page(v) {
  const file = `vista-previa--${v.estado}.html`;
  const crumbs = v.crumbs || [...RUTA, (v.archivo || {}).nombre || 'Vista previa'];
  return C.conLogo(`${M.cabecera({
    titulo: `${v.archivo ? v.archivo.nombre : 'Vista previa'} · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 017: previsualización). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con storage/vista-previa/generar.js (marco, mis-archivos, carpetas, espacio y desglose). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">017</span> <strong>Vista previa</strong> <span class="file">${file}</span> <span>plan Personal (ejemplo) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${Q.sidebar({ activo: '', q: Q.CUOTAS.ok })}
    <div class="main">
      ${M.topbar({ crumbs })}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>
</div>

<script>${E.JS_MENU}${D.JS}${JS_TABS}</script>
</body>
</html>
`);
}

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'menu-fila', titulo: 'menú ⋮ de un PDF: «Previsualizar» es el primer ítem', crumbs: RUTA, cuerpo: explorador({ menuEn: ARCH.pdf.nombre }) },
  { estado: 'menu-fila-sin-vista', titulo: 'menú ⋮ de un .docx: sin «Previsualizar» (fuera de 017)', crumbs: RUTA, cuerpo: explorador({ menuEn: ARCH.docx.nombre }) },
  { estado: 'volver-foco', titulo: '«Volver»: la carpeta de origen con el foco en el control de la fila', crumbs: RUTA, cuerpo: volverFoco },
  { estado: 'cargando', titulo: 'abriendo la vista previa (antes de 2 s): esqueleto, sin nombre todavía', crumbs: [...RUTA, 'Vista previa'], cuerpo: cargando },
  { estado: 'espera-larga', titulo: 'más de 2 s: progreso visible y anunciado (CA-9)', archivo: ARCH.pptx, cuerpo: esperaLarga },
  { estado: 'pdf', titulo: 'PDF de 24 páginas: todas navegables, carga bajo demanda', archivo: ARCH.pdf, cuerpo: pdf },
  { estado: 'imagen', titulo: 'imagen PNG tal cual', archivo: ARCH.img, cuerpo: imagen },
  { estado: 'texto', titulo: 'Markdown mostrado literal, sin convertir', archivo: ARCH.txt, cuerpo: texto },
  { estado: 'xlsx', titulo: 'XLSX con 3 hojas y fórmulas «Sin valor guardado»', archivo: ARCH.xlsx, cuerpo: xlsx },
  { estado: 'pptx', titulo: 'PPTX con 5 diapositivas: texto de cada una', archivo: ARCH.pptx, cuerpo: pptx },
  { estado: 'vacio', titulo: 'archivo válido sin diapositivas: «Este archivo no tiene contenido para mostrar.»', archivo: ARCH.vacio, cuerpo: vacio },
  {
    estado: 'no-disponible', titulo: 'el navegador no pudo abrir la vista previa: causa, «Descargar» y «Reintentar»', archivo: ARCH.pdf,
    cuerpo: () => falla(ARCH.pdf, {
      ic: 'eyeOff', titulo: 'La vista previa no está disponible para este archivo.',
      texto: 'Tu navegador no pudo abrirlo; puede ser demasiado grande para mostrarlo aquí. El archivo no cambió: descárgalo para abrirlo en tu equipo.',
      acciones: accionesFalla('descargar'),
    }),
  },
  {
    estado: 'protegido', titulo: 'protegido con contraseña: Nimbo no la pide', archivo: ARCH.xlsx,
    cuerpo: () => falla(ARCH.xlsx, {
      ic: 'lock', titulo: 'Este archivo está protegido con contraseña.',
      texto: 'La vista previa no abre archivos con contraseña y Nimbo no te la pedirá. Descárgalo y ábrelo en tu equipo con su contraseña.',
      acciones: accionesFalla('descargar'),
    }),
  },
  {
    estado: 'corrupto', titulo: 'dañado o con contenido que no coincide con su tipo', archivo: ARCH.pdf,
    cuerpo: () => falla(ARCH.pdf, {
      tono: 'error', ic: 'fileX', titulo: 'No pudimos leer este archivo.',
      texto: 'Puede estar dañado o su contenido no corresponde a un PDF. El original no cambió: descárgalo para revisarlo en tu equipo.',
      acciones: accionesFalla('descargar'),
    }),
  },
  {
    estado: 'expirado', titulo: 'el acceso temporal venció: «Reintentar» lo renueva', archivo: ARCH.pdf,
    cuerpo: () => falla(ARCH.pdf, {
      ic: 'clock', titulo: 'La vista previa caducó.',
      texto: 'Por seguridad, el acceso a la vista previa dura unos minutos. Reintenta para abrirla de nuevo.',
      acciones: accionesFalla('reintentar'),
    }),
  },
  {
    estado: 'error', titulo: 'falla de red: causa, «Reintentar» y «Descargar»', archivo: ARCH.pptx,
    cuerpo: () => falla(ARCH.pptx, {
      tono: 'error', ic: 'alert', titulo: 'No pudimos cargar la vista previa.',
      texto: 'Revisa tu conexión e inténtalo de nuevo. Tus archivos siguen guardados y puedes descargar este mientras tanto.',
      acciones: accionesFalla('reintentar'), ref: 'Código de referencia: 7f3a2c91',
    }),
  },
  {
    estado: 'demasiadas-solicitudes', titulo: '429: «Hiciste demasiadas solicitudes…» (CA-12)', archivo: ARCH.img,
    cuerpo: () => falla(ARCH.img, {
      tono: 'warn', ic: 'hourglass', titulo: 'Hiciste demasiadas solicitudes.',
      texto: 'Espera un momento e inténtalo de nuevo.',
      acciones: accionesFalla('reintentar'),
    }),
  },
  { estado: 'no-encontrado', titulo: '404: ajeno o inexistente, sin nombre (CA-5)', crumbs: ['Mis archivos', 'Vista previa'], cuerpo: noEncontrado },
];

for (const v of ESTADOS) {
  const file = `vista-previa--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
