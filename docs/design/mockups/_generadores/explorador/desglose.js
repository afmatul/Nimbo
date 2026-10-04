// Desglose de carpetas en la lista de Mis archivos (spec 006, CA-26) y «Fijar en la barra lateral» (CA-27, CA-28).
// Lo usa explorador/generar-carpetas.js para los estados nuevos: carpeta-desglosada, desglosando-cargando,
// desglosada-vacia, desglosada-error, menu-fila-* y tope-de-fijados. Las filas, el CSS y el script salen de aquí.
//
// Estructura: una sola tabla; las subcarpetas y archivos de una carpeta desglosada son filas `tr` con `data-padre` y
// `data-nivel` (sangría). El control de desglose es un botón con `aria-expanded` y `aria-controls` (las filas hijas)
// antes del ícono; el nombre de la carpeta sigue siendo el enlace que la abre (CA-5). Las acciones de la fila valen en
// cualquier nivel.
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');

const { icon } = C;

// ---------- Menú ⋮ de la fila (CA-27): «Fijar» o «Quitar» según el elemento ----------
const FIJAR = 'Fijar en la barra lateral';
const QUITAR = 'Quitar de la barra lateral';
function menuDe({ tipo, fijado }) {
  const mi = C.itemMenu;
  const acceso = fijado ? mi('pinOff', QUITAR) : mi('pin', FIJAR);
  return tipo === 'carpeta'
    ? [mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), acceso, 'sep', mi('trash', 'Mover a la papelera')]
    : [mi('download', 'Descargar'), mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), acceso, 'sep', mi('trash', 'Mover a la papelera')];
}

// ---------- Filas ----------
// Nodo: { tipo: 'carpeta' | 'archivo', nombre, tam, fecha, fijado, abierto, estado, hijos }
//   estado (solo carpeta abierta): 'cargando' | 'vacia' | 'error'; sin él, se dibujan `hijos`.
function celdaNombre(n, control) {
  const carpeta = n.tipo === 'carpeta';
  const tile = carpeta ? `<span class="ftile ftile-folder">${icon('folder', 16)}</span>` : S.tile(n.nombre);
  // <wbr> tras cada «_»: a 360 px el nombre se parte en los guiones bajos antes que en medio de una palabra
  const visible = n.nombre.replace(/_/g, '_<wbr>');
  const texto = carpeta ? `<a class="fname-link" href="#">${visible}</a>` : visible;
  const contexto = n.padre ? `<span class="sr-only">, dentro de ${n.padre}</span>` : '';
  return `<div class="fname">${control}${tile}<div class="fname-text">${texto}${contexto}<span class="fmeta-m">${carpeta ? 'Carpeta' : n.tam} · ${n.fecha}</span></div></div>`;
}

// Fila de estado de una carpeta desglosada (cargando, vacía o error); ocupa todo el ancho y respeta la sangría
function filaEstado({ id, padre, nivel, contenido, aria = '' }) {
  return `
            <tr id="${id}" data-padre="${padre}" data-nivel="${nivel}"><td colspan="4"><div class="sub-state"${aria}>${contenido}</div></td></tr>`;
}
function filaEsqueleto({ id, padre, nivel, ancho }) {
  return `
            <tr id="${id}" data-padre="${padre}" data-nivel="${nivel}" aria-hidden="true"><td colspan="4"><div class="fname"><span class="exp-spacer"></span><span class="skeleton-line tile"></span><span class="skeleton-line ${ancho}"></span></div></td></tr>`;
}

// Devuelve el HTML de las filas del nodo y de sus descendientes. `ctx`: { n: contador de ids, menuEn }
function filas(n, ctx, nivel = 0, padre = '', nombrePadre = '') {
  const id = `r-${ctx.n++}`;
  const i = ctx.n; // índice único del menú ⋮ de la fila
  const carpeta = n.tipo === 'carpeta';
  const hijos = carpeta && n.abierto ? hijasDe(n, ctx, nivel + 1, id) : { html: '', ids: [] };
  const ctl = !carpeta ? '<span class="exp-spacer"></span>'
    : `<button class="exp-btn" type="button" aria-expanded="${!!n.abierto}"${hijos.ids.length ? ` aria-controls="${hijos.ids.join(' ')}"` : ''} aria-label="Mostrar contenido de ${n.nombre}"${n.estado === 'cargando' ? ' aria-busy="true"' : ''}>${icon(n.estado === 'cargando' ? 'loader' : 'chevronRight', 16, n.estado === 'cargando' ? 'spin' : '')}</button>`;
  const dato = { ...n, padre: nombrePadre };
  const attrs = `id="${id}"${padre ? ` data-padre="${padre}"` : ''} data-nivel="${nivel}"`;
  return `
            <tr ${attrs}>
              <td>${celdaNombre(dato, ctl)}</td>
              <td class="c-size">${carpeta ? '<span aria-hidden="true">—</span><span class="sr-only">Carpeta, sin tamaño</span>' : n.tam}</td>
              <td class="c-date">${n.fecha}</td>
              <td class="c-act">${S.menuFila(i, n.nombre, ctx.menuEn === n.nombre, menuDe(n))}</td>
            </tr>${hijos.html}`;
}

function hijasDe(n, ctx, nivel, padreId) {
  const base = { padre: padreId, nivel };
  if (n.estado === 'cargando') {
    const id = `r-${ctx.n++}`, a = `r-${ctx.n++}`, b = `r-${ctx.n++}`;
    return {
      ids: [id, a, b],
      html: filaEstado({ ...base, id, aria: ' role="status"', contenido: `${icon('loader', 16, 'spin')}<span>Cargando el contenido de ${n.nombre}…</span>` })
        + filaEsqueleto({ ...base, id: a, ancho: 'w55' }) + filaEsqueleto({ ...base, id: b, ancho: 'w40' }),
    };
  }
  if (n.estado === 'vacia' || n.estado === 'error') {
    const id = `r-${ctx.n++}`;
    const contenido = n.estado === 'vacia'
      ? `${icon('folderOpen', 18)}<span>Esta carpeta está vacía</span>`
      : `${icon('alert', 18)}<span>No pudimos cargar el contenido de ${n.nombre}.</span><button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}<span>Reintentar</span></button>`;
    return { ids: [id], html: filaEstado({ ...base, id, aria: n.estado === 'error' ? ' role="alert"' : '', contenido }) };
  }
  const partes = (n.hijos || []).map((h) => filas(h, ctx, nivel, padreId, n.nombre));
  const ids = [...partes.join('').matchAll(new RegExp(`<tr id="(r-\\d+)" data-padre="${padreId}"`, 'g'))].map((m) => m[1]);
  return { ids, html: partes.join('') };
}

// Tabla de «Mis archivos» con filas desglosables. menuEn: nombre de la fila con el menú ⋮ abierto.
function tabla(nodos, { lugar = 'Mis archivos', menuEn = '' } = {}) {
  const ctx = { n: 1, menuEn };
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Carpetas y archivos en ${lugar}</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-date">Modificado</th><th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${nodos.map((n) => filas(n, ctx)).join('')}
            </tbody>
          </table>
        </div>`;
}

// ---------- CSS ----------
// Sangría de 28 px por nivel (16 px a 360 px). El control mide 32 px (44 px a 360 px, con margen negativo para no
// ensanchar la fila). Guías verticales de `border` bajo el control de cada ancestro: decorativas.
const GUIA = 'linear-gradient(var(--border), var(--border))';
const CSS = `
  /* Desglose de carpetas (spec 006, CA-26) */
  .exp-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: none; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--secondary-foreground); cursor: pointer; }
  .exp-btn:hover { background: var(--muted); color: var(--foreground); }
  .exp-btn[aria-expanded="true"] .ico:not(.spin) { transform: rotate(90deg); }
  .exp-spacer { width: 32px; height: 32px; flex: none; }
  .files .fname { padding-left: calc(var(--nivel, 0) * 28px); }
  tr[data-nivel="1"] { --nivel: 1; } tr[data-nivel="2"] { --nivel: 2; } tr[data-nivel="3"] { --nivel: 3; }
  tr[data-nivel="1"] > td:first-child { background: ${GUIA} 31px 0 / 1px 100% no-repeat; }
  tr[data-nivel="2"] > td:first-child { background: ${GUIA} 31px 0 / 1px 100% no-repeat, ${GUIA} 59px 0 / 1px 100% no-repeat; }
  .files tr[aria-hidden="true"] .fname { gap: 12px; }
  .files tr[aria-hidden="true"] .skeleton-line:not(.tile) { height: 12px; }

  /* Filas de estado de la carpeta desglosada: cargando, vacía y error (con «Reintentar» solo en la fila) */
  .sub-state { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 32px; padding-left: calc(var(--nivel, 0) * 28px + 44px); font-size: 13.5px; color: var(--secondary-foreground); }
  .sub-state .ico { color: var(--secondary-foreground); }
  .sub-state > span { flex: 1 1 12ch; min-width: 0; }
  .sub-state[role="alert"] { color: var(--foreground); }
  .sub-state[role="alert"] .ico { color: var(--destructive); }

  /* Menú ⋮ con «Quitar de la barra lateral»: el texto más largo no cabe en 208 px */
  .row-menu { min-width: 208px; width: max-content; max-width: calc(100vw - 32px); }

  @media (max-width: 600px) {
    .exp-btn { width: 44px; height: 44px; margin-left: -8px; }
    .exp-spacer { width: 36px; height: 44px; }
    .files .fname { gap: 10px; padding-left: min(calc(var(--nivel, 0) * 16px), 48px); } /* la sangría se detiene en el nivel 3 */
    tr[data-nivel="1"] > td:first-child { background-position: 25px 0; }
    tr[data-nivel="2"] > td:first-child { background-position: 25px 0, 41px 0; }
    .sub-state { padding-left: calc(min(calc(var(--nivel, 0) * 16px), 48px) + 36px); min-height: 44px; }
    .sub-state .btn { min-height: 44px; }
    .files tr[aria-hidden="true"] .exp-spacer { height: 30px; }
  }
`;

// Teclado y ratón: el control abre y cierra; al contraer se ocultan también los descendientes. En la app, abrir pide
// GET /folders/contents de esa carpeta y muestra cargando, vacía o error en la fila. Aquí, una carpeta sin filas de
// ejemplo se abre «vacía».
const T_VACIA = JSON.stringify(filaEstado({ id: '__ID__', padre: '__PADRE__', nivel: '__NIVEL__', contenido: `${icon('folderOpen', 18)}<span>Esta carpeta está vacía</span>` }));
const JS = `
(function () {
  var T_VACIA = ${T_VACIA}, n = 900;
  function fila(id) { return document.getElementById(id); }
  function visible(tr) { var p = tr.getAttribute('data-padre'); if (!p) return true; var pr = fila(p); return pr.querySelector('.exp-btn').getAttribute('aria-expanded') === 'true' && visible(pr); }
  function refrescar() { Array.prototype.forEach.call(document.querySelectorAll('tr[data-padre]'), function (tr) { tr.hidden = !visible(tr); }); }
  Array.prototype.forEach.call(document.querySelectorAll('.exp-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var tr = btn.closest('tr'), abierto = btn.getAttribute('aria-expanded') === 'true';
      if (!abierto && !document.querySelector('tr[data-padre="' + tr.id + '"]')) {
        var id = 'r-' + (n++), html = T_VACIA.replace('__ID__', id).replace('__PADRE__', tr.id).replace('__NIVEL__', +tr.getAttribute('data-nivel') + 1);
        tr.insertAdjacentHTML('afterend', html); btn.setAttribute('aria-controls', id);
      }
      btn.setAttribute('aria-expanded', String(!abierto)); refrescar();
    });
  });
})();
`;

module.exports = { FIJAR, QUITAR, menuDe, tabla, CSS, JS, JS_MENU: E.JS_MENU };
