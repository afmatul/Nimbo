// Piezas comunes de la spec 006 (carpetas y papelera): logo de nube, barra lateral con «Carpetas» y contador de la
// Papelera, datos de ejemplo, íconos, aviso flotante (toast), diálogo con formulario, diálogo de confirmación y CSS.
// Las usan explorador/generar-carpetas.js (Mis archivos con carpetas) y papelera/generar.js.
// El marco sigue saliendo de marco/marco.js y la tabla y la cuota de mis-archivos/mis-archivos.js (005).
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const P = {
  ...S.P,
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  folderPlus: '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderInput: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  folderX: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="m9.5 10.5 5 5"/><path d="m14.5 10.5-5 5"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  hardDrive: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  pinOff: '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
};
const icon = S.crearIcon(P);

// ---------- Logo del proyecto (docs/design/logos/nimbo-logo-recortado.svg) ----------
// Nube con destello. Los colores salen de los tokens (brand y primary-foreground), no del hex del archivo.
const LOGO_NUBE = '<svg class="logo-nube" viewBox="0 58 418 304" width="34" height="25" aria-hidden="true" focusable="false"><g class="logo-nube-cuerpo"><circle cx="258" cy="170" r="110"/><circle cx="122" cy="206" r="78"/><circle cx="348" cy="246" r="60"/><circle cx="69" cy="292" r="67"/><circle cx="351" cy="294" r="65"/><rect x="69" y="200" width="282" height="159"/></g><path class="logo-nube-destello" d="M210 122Q221 213 315 224Q221 235 210 328Q199 235 105 224Q199 213 210 122Z"/></svg>';
// El marco dibuja la «N» provisional; en 006 se reemplaza por el logo (decisión pendiente: llevarlo a todo el marco).
const conLogo = (html) => html.replace(/<span class="logo-mark" aria-hidden="true">N<\/span>/g, `<span class="logo-mark logo-mark-nube" aria-hidden="true">${LOGO_NUBE}</span>`);

// ---------- Datos de ejemplo (en la app vienen de la API y de PlanLimits) ----------
// Plan Equipo: 350 GB, 1 GB por archivo y 60 días de retención en la papelera (product-context §3, spec 006 CA-19).
const RETENCION = '60 días';
const MAX_NIVELES = 10;

// Carpetas de primer nivel en la barra lateral (solo el nombre: FolderRef no trae cantidades)
const CARPETAS_RAIZ = ['Proyecto Alpha', 'Documentos Legales', 'Finanzas'];

// accesos: HTML de «Accesos rápidos» (accesos/accesos.js, CA-27); reemplaza a «Carpetas» en la barra lateral.
function sidebar({ activo = 'Mis archivos', papelera = '6', cuota = S.CUOTA_NORMAL, tramo = 'warn', accesos = '' } = {}) {
  return M.sidebar({
    activo, plan: S.PLAN, cuota, contadorPapelera: papelera, accesos,
    carpetas: accesos ? [] : CARPETAS_RAIZ.map((n) => ['folder', n]),
  }).replace(M.cuota(cuota), S.cuota(cuota, tramo));
}

// Ítem de un menú ⋮ (DropdownMenu): ícono y texto; 'sep' lo dibuja menuFila. cls 'menu-danger': acción definitiva (rojo
// con ícono, CSS_006). crearItemMenu recibe el `icon` de quien lo usa (012 suma íconos de personas); una sola plantilla
// para 006, la papelera y 012 (Art. VI.2).
const crearItemMenu = (iconoDe) => (icono, label, cls = '') =>
  `<button role="menuitem" type="button" tabindex="-1"${cls ? ` class="${cls}"` : ''}>${iconoDe(icono)}<span>${label}</span></button>`;
const itemMenu = crearItemMenu(icon);

// <wbr> tras cada «_»: a 360 px un nombre largo se parte en los guiones bajos antes que en medio de una palabra
const partible = (nombre) => nombre.replace(/_/g, '_<wbr>');

// Celda «Tamaño» de una carpeta: raya visible y texto para lectores de pantalla (tablas de 006, desglose y 012)
const SIN_TAMANO = '<span aria-hidden="true">—</span><span class="sr-only">Carpeta, sin tamaño</span>';

// ---------- Aviso flotante (toast; Sonner de shadcn si se aprueba su ADR) ----------
// role="status": lo anuncian los lectores de pantalla sin mover el foco. La acción es un enlace o botón real.
function toast({ texto, accion = '', tono = 'ok' }) {
  const ic = tono === 'ok' ? icon('ok', 18) : icon('alert', 18);
  return `
  <div class="toast toast-${tono}" role="status">
    ${ic}
    <p class="toast-text">${texto}</p>
    ${accion ? `<a class="btn btn-outline btn-sm" href="#">${accion}</a>` : ''}
    <button class="icon-btn" type="button" aria-label="Cerrar aviso">${icon('x', 18)}</button>
  </div>`;
}

// ---------- Diálogo con formulario (Dialog de shadcn): crear y renombrar ----------
// d: { titulo, descripcion, etiqueta, valor, sufijo, error, alerta, confirmar }
function dialogoNombre(d) {
  const sufijo = d.sufijo ? `<span class="input-suffix" id="nombre-sufijo">${d.sufijo}</span>` : '';
  const describedby = [d.error ? 'nombre-error' : '', d.sufijo ? 'nombre-sufijo' : ''].filter(Boolean).join(' ');
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog dialog-form" role="dialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">${d.titulo}</h2>
    <p id="dlg-d">${d.descripcion}</p>
    <form novalidate>
      <div class="field">
        <label for="nombre">${d.etiqueta}</label>
        <div class="input-group${d.sufijo ? ' has-suffix' : ''}">
          <input id="nombre" name="nombre" type="text" autocomplete="off" maxlength="255" value="${d.valor}" autofocus${describedby ? ` aria-describedby="${describedby}"` : ''}${d.error ? ' aria-invalid="true"' : ''}>${sufijo}
        </div>
        ${d.error ? `<p class="field-error" id="nombre-error" role="alert">${icon('alert', 15)}<span>${d.error}</span></p>` : ''}
      </div>${d.alerta ? alertaDialogo({ texto: d.alerta }) : ''}
      <div class="dialog-actions">
        <button class="btn btn-outline" type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">${d.confirmar}</button>
      </div>
    </form>
  </div>`;
}

// Error dentro de un diálogo (Alert destructive) que no corresponde a un campo: profundidad máxima, mover inválido o
// conflicto al mover (006), restaurar sin espacio (014) y la lista de accesos que no cargó (012).
// a: { titulo (opcional, en negrita y destructive), texto, accion (opcional: HTML de un botón, p. ej. «Reintentar») }
function alertaDialogo({ titulo = '', texto, accion = '' }) {
  const p = `<p>${titulo ? `<strong>${titulo}</strong>` : ''}${texto}</p>`;
  const cuerpo = accion ? `<div>${p}\n        ${accion}</div>` : p;
  return `
      <div class="dlg-alert" role="alert">${icon('alert', 18)}${cuerpo}</div>`;
}

// ---------- Diálogo de confirmación destructiva (ConfirmDestructiveDialog, AlertDialog de shadcn) ----------
// Eliminar definitivamente es síncrono; Vaciar es diferido (202) y no deja el diálogo abierto (spec CA-18, plan §4).
const confirmar = ({ titulo, cuerpo, boton }) => M.dialog({ title: titulo, body: cuerpo, confirm: boton });

// Imágenes (007): ícono de imagen con los tokens --file-img (FileTypeChip). El resto, como en 005.
const IMAGENES = ['png', 'jpg', 'jpeg', 'webp'];
const tileArchivo = (nombre) => (IMAGENES.includes(nombre.split('.').pop().toLowerCase())
  ? `<span class="ftile ftile-img">${icon('image', 16)}</span>` : S.tile(nombre));
// Ícono de un nodo de cualquier lista (carpeta con los tokens brand o el tipo de archivo): una sola pieza para las
// tablas de 006 y 007, el desglose, la papelera y las dos pantallas de 012 (Art. VI.2).
const tileNodo = (tipo, nombre) => (tipo === 'carpeta' ? `<span class="ftile ftile-folder">${icon('folder', 16)}</span>` : tileArchivo(nombre));

// Encabezado de columna. orden: { campo, dir } (007); la columna activa lleva aria-sort y una flecha. Sin orden, el
// HTML es el de 006.
function th(campo, texto, cls, orden) {
  const c = cls ? ` class="${cls}"` : '';
  if (!orden || orden.campo !== campo) return `<th scope="col"${c}>${texto}</th>`;
  const asc = orden.dir === 'asc';
  return `<th scope="col"${c} aria-sort="${asc ? 'ascending' : 'descending'}"><span class="th-sort">${texto}${icon(asc ? 'arrowUp' : 'arrowDown', 13)}</span></th>`;
}

// ---------- Filas, tabla y encabezado de Mis archivos con carpetas (006; 007 suma el orden) ----------
const mi = itemMenu;
// «Mover a la papelera» no va en rojo: es reversible y no pide confirmación; el rojo queda para lo definitivo.
const MENU_ARCHIVO = [mi('download', 'Descargar'), mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), 'sep', mi('trash', 'Mover a la papelera')];
const MENU_CARPETA = [mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), 'sep', mi('trash', 'Mover a la papelera')];

function fila([tipo, nombre, tam, fecha], i, menuAbierto) {
  const carpeta = tipo === 'carpeta';
  const tile = tileNodo(tipo, nombre);
  const texto = carpeta ? `<a class="fname-link" href="#">${nombre}</a>` : nombre;
  return `
            <tr>
              <td><div class="fname">${tile}<div class="fname-text">${texto}<span class="fmeta-m">${carpeta ? 'Carpeta' : tam} · ${fecha}</span></div></div></td>
              <td class="c-size">${carpeta ? SIN_TAMANO : tam}</td>
              <td class="c-date">${fecha}</td>
              <td class="c-act">${S.menuFila(i, nombre, i === menuAbierto, carpeta ? MENU_CARPETA : MENU_ARCHIVO)}</td>
            </tr>`;
}

function tabla(nodos, lugar, menuAbierto = -1, { orden = null } = {}) {
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Carpetas y archivos en ${lugar}</caption>
            <thead><tr>${th('nombre', 'Nombre', '', orden)}${th('tamano', 'Tamaño', 'c-size', orden)}${th('fecha', 'Modificado', 'c-date', orden)}<th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${nodos.map((n, i) => fila(n, i, menuAbierto)).join('')}
            </tbody>
          </table>
        </div>`;
}

const botonNuevaCarpeta = () => `<button class="btn btn-outline" type="button">${icon('folderPlus', 16)}<span>Nueva carpeta</span></button>`;

// En móvil (sin migas en la barra superior) se ve «‹ {anterior}» con el nombre real y el nombre accesible
// «Volver a {anterior}»: carpetas (006), ficha de un archivo (014) y carpeta compartida (012).
const volverA = (anterior) => `
        <a class="back-link" href="#" aria-label="Volver a ${anterior}">${icon('chevronLeft', 18)}<span>${anterior}</span></a>`;

// ruta: [Mis archivos, …, carpeta abierta] («‹ Mis archivos» en el primer nivel). o: { acciones (HTML; por defecto
// «Nueva carpeta» y «Subir archivos»; '' sin acciones, como en 012), sub (línea bajo el título) }.
function encabezado(ruta, { acciones = botonNuevaCarpeta() + S.botonSubir(), sub = '' } = {}) {
  const anterior = ruta[ruta.length - 2];
  const linea = sub ? `
            <p class="page-sub">${sub}</p>` : '';
  return `${anterior ? volverA(anterior) : ''}
        <div class="page-head">
          <div>
            <h1>${ruta[ruta.length - 1]}</h1>${linea}
          </div>${acciones ? `
          <div class="head-actions">${acciones}</div>` : ''}
        </div>`;
}

// ---------- CSS propio de 006 ----------
const CSS_006 = `
  /* Spec 006: logo, carpetas, menú con varias acciones, diálogos con formulario, árbol de destino y toast */
  .logo-mark-nube { width: 34px; height: 28px; background: none; box-shadow: none; border-radius: 0; }
  .logo-nube-cuerpo { fill: var(--brand); }
  .logo-nube-destello { fill: var(--primary-foreground); }

  .head-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .page-sub { margin: 4px 0 0; font-size: 13.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .back-link { display: none; }

  /* Carpetas en la tabla: ícono de carpeta (brand sobre brand-soft) y nombre como enlace que abre la carpeta */
  .ftile-folder { color: var(--primary); background: var(--brand-soft); }
  a.fname-link { display: inline-flex; align-items: center; min-height: 24px; color: var(--foreground); text-decoration: none; }
  .crumbs a { display: inline-flex; align-items: center; min-height: 24px; }
  a.fname-link:hover { text-decoration: underline; color: var(--foreground); }
  .fsub { display: block; font-size: 12px; font-weight: 400; color: var(--muted-foreground); }

  /* El menú de 4 ítems no cabe dentro de la tabla: sin recorte (en la app, Radix lo monta en un portal) */
  .files { overflow: visible; }
  .files th:first-child { border-top-left-radius: var(--radius-lg); }
  .files th:last-child { border-top-right-radius: var(--radius-lg); }

  /* Menú ⋮ con varias acciones; «Eliminar» en destructive con ícono (el color no es el único indicio) */
  .account-menu [role="menuitem"].menu-danger, .account-menu [role="menuitem"].menu-danger .ico { color: var(--destructive); }

  /* Diálogo con formulario (Dialog de shadcn) */
  .dialog-form { width: min(480px, calc(100% - 32px)); }
  .dialog-form form { margin: 0; }
  .dialog p strong { color: var(--foreground); font-weight: 600; }
  .field { margin-top: 18px; }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .input-group { display: flex; align-items: stretch; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); }
  .input-group:focus-within { outline: 2px solid var(--ring); outline-offset: 1px; }
  .input-group:has(input[aria-invalid="true"]) { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .input-group input { flex: 1; min-width: 0; min-height: 44px; padding: 10px 14px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); font: inherit; font-size: 15px; }
  .input-group input:focus-visible { outline: none; }
  .input-suffix { display: inline-flex; align-items: center; padding: 0 14px; border-left: 1px solid var(--border); border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--muted); color: var(--secondary-foreground); font-size: 14px; font-weight: 500; }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 0 !important; font-size: 13px !important; color: var(--destructive) !important; }
  .field-error .ico { margin-top: 2px; }
  .dlg-alert { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); border-radius: var(--radius-md); background: var(--destructive-tint); }
  .dlg-alert .ico { margin-top: 1px; color: var(--destructive); }
  .dlg-alert p { margin: 0 !important; color: var(--foreground) !important; font-size: 13.5px !important; }
  .dlg-alert strong { display: block; color: var(--destructive) !important; font-weight: 600; }
  .dlg-hint { display: flex; gap: 8px; align-items: flex-start; font-size: 13px !important; }
  .dlg-hint .ico { margin-top: 2px; color: var(--primary); }
  .dialog-note { margin-top: 14px !important; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); color: var(--secondary-foreground) !important; font-size: 13px !important; overflow-wrap: anywhere; }

  /* Árbol de destino de «Mover a…» (patrón tree de WAI-ARIA, una sola selección) */
  .dialog-move { width: min(520px, calc(100% - 32px)); top: 110px; }
  .tree, .tree [role="group"] { list-style: none; margin: 0; padding: 0; }
  .tree { margin-top: 14px; max-height: 300px; overflow-y: auto; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); }
  .tree [role="treeitem"] { outline: none; }
  .tree-row { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 10px; border-radius: var(--radius-md); color: var(--foreground); font-size: 14px; cursor: pointer; }
  .tree-row:hover { background: var(--muted); }
  .tree [role="treeitem"]:focus-visible > .tree-row { outline: 2px solid var(--ring); outline-offset: -2px; }
  .tree-row .ico { color: var(--secondary-foreground); }
  .tree-row .tw { display: inline-flex; width: 18px; flex: none; color: var(--secondary-foreground); }
  .tree [aria-expanded="true"] > .tree-row .tw .ico { transform: rotate(90deg); }
  .tree [aria-level="2"] > .tree-row { padding-left: 32px; }
  .tree [aria-level="3"] > .tree-row { padding-left: 54px; }
  .tree [aria-level="4"] > .tree-row { padding-left: 76px; }
  .tree [aria-selected="true"] > .tree-row { background: var(--accent); border-left: 3px solid var(--brand); padding-left: 7px; font-weight: 600; }
  .tree [aria-level="2"][aria-selected="true"] > .tree-row { padding-left: 29px; }
  .tree [aria-level="3"][aria-selected="true"] > .tree-row { padding-left: 51px; }
  .tree [aria-selected="true"] > .tree-row .tree-check { display: inline-flex; color: var(--primary); }
  .tree-check { display: none; margin-left: auto; }
  .tree [aria-disabled="true"] > .tree-row { cursor: not-allowed; color: var(--muted-foreground); background: transparent; }
  .tree-note { margin-left: auto; font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }

  /* Aviso flotante (toast) abajo a la derecha del área de la app */
  .toast { position: absolute; z-index: 8; right: 24px; bottom: 24px; display: flex; align-items: center; gap: 12px; width: min(440px, calc(100% - 48px)); padding: 10px 8px 10px 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); }
  .toast > .ico { color: var(--success-foreground); }
  .toast-error > .ico { color: var(--destructive); }
  .toast-text { flex: 1; min-width: 0; margin: 0; font-size: 14px; color: var(--foreground); overflow-wrap: anywhere; }
  .toast .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); }

  @media (max-width: 900px) {
    .back-link { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin: -8px 0 2px -6px; padding: 0 6px; border-radius: var(--radius-md); color: var(--secondary-foreground); text-decoration: none; font-size: 14px; font-weight: 500; }
    .back-link:hover { color: var(--foreground); background: var(--muted); }
  }
`;

const CSS_006_MQ600 = `    .page-head { align-items: flex-start; }
    .head-actions { width: 100%; }
    .head-actions .btn { flex: 1; padding: 8px 10px; }
    .tree-row { min-height: 44px; }
    .tree-row { flex-wrap: wrap; row-gap: 0; }
    .tree-note { flex-basis: 100%; margin: -2px 0 2px 52px; white-space: normal; }
    .dialog-move { top: 72px; }
    .toast { left: 8px; right: 8px; bottom: 12px; width: auto; flex-wrap: wrap; padding: 10px 52px 10px 12px; }
    .toast-text { flex-basis: calc(100% - 30px); }
    .toast .btn { min-height: 44px; margin-left: 30px; }
    .toast .icon-btn { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; }
`;

module.exports = {
  P, icon, LOGO_NUBE, conLogo, RETENCION, MAX_NIVELES, CARPETAS_RAIZ,
  sidebar, crearItemMenu, itemMenu, partible, SIN_TAMANO, tileNodo, toast, dialogoNombre, alertaDialogo, confirmar, CSS_006, CSS_006_MQ600,
  MENU_ARCHIVO, MENU_CARPETA, fila, tabla, botonNuevaCarpeta, volverA, encabezado,
};
