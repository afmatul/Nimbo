// «Accesos rápidos» de la barra lateral (spec 006, CA-27 y CA-28, RF-38): Fijados (hasta 5) y Recientes (3 visibles,
// P-15), carpetas y archivos mezclados con su ícono, sin desglose, con «Ver más» (lleva a Mis archivos, raíz) si hay más
// recientes que los visibles. Cada fijado lleva un menú ⋮ con «Quitar de la barra lateral».
// Lo usan shared/layout (layout/generar.js) y storage/explorador (explorador/generar-carpetas.js). La sección entra al
// marco por la opción `accesos` de marco/marco.js; con '' la barra queda como la de 005.
const C = require('../carpetas/carpetas.js');
const S = require('../mis-archivos/mis-archivos.js');
const AV = require('../mis-archivos/avisos.js');

const { icon } = C;

// ---------- Datos de ejemplo ([tipo, nombre]); en la app vienen de la API por cuenta ----------
const FIJADOS_MAX = 5;
const RECIENTES_VISIBLES = 3; // P-15: configurable en el plan; la barra muestra 3 y «Ver más» lleva a Mis archivos
const FIJADOS_5 = [
  ['carpeta', 'Proyecto Alpha'], ['archivo', 'Propuesta_Nimbo_v3.docx'], ['carpeta', 'Finanzas'],
  ['archivo', 'Matriz_Requisitos_RF.xlsx'], ['carpeta', 'Documentos Legales'],
];
// Los recientes nunca repiten un fijado (CA-27). Son los 5 más recientes de la cuenta; la barra solo dibuja los 3 primeros.
const RECIENTES = [
  ['carpeta', 'Fase 3 · RAG'], ['archivo', 'Informe_avance_RAG.docx'], ['archivo', 'Modelo_ER_Nimbo.pdf'],
  ['carpeta', 'Actas'], ['archivo', 'Demo_Fase3_avance.pptx'],
];
const TOPE_MENSAJE = 'Ya fijaste 5 elementos. Quita uno para fijar otro.';
const QUITAR = 'Quitar de la barra lateral';

// ---------- Piezas ----------
function contenido([tipo, nombre]) {
  const carpeta = tipo === 'carpeta';
  const ic = carpeta ? icon('folder', 16, 'q-folder') : icon(S.tipo(nombre)[0], 16);
  const para = carpeta ? ', carpeta' : ', archivo, se descarga';
  // El nombre se corta con «…» en medio: la extensión (.docx, .pdf) queda siempre visible
  const punto = nombre.lastIndexOf('.');
  const nodo = carpeta || punto < 1 ? `<span class="q-stem">${nombre}</span>`
    : `<span class="q-stem">${nombre.slice(0, punto)}</span><span class="q-ext">${nombre.slice(punto)}</span>`;
  return `<a href="#" title="${nombre}">${ic}<span class="q-name">${nodo}</span><span class="sr-only">${para}</span></a>`;
}

// Recientes: solo el enlace. Fijados: el enlace y el menú ⋮ («Quitar de la barra lateral»); `idp-n` mantiene únicos los ids
// del botón y del menú entre la barra y el cajón. `menuEn`: nombre del fijado con el menú abierto.
const enlace = (n) => `<li>${contenido(n)}</li>`;
function fijado(n, idp, i, menuEn) {
  const menu = S.menuFila(`q-${idp}-${i}`, n[1], n[1] === menuEn, [C.itemMenu('pinOff', QUITAR)]);
  return `<li class="quick-item">${contenido(n)}${menu}</li>`;
}

// La lista se nombra con la sección y el grupo («Accesos rápidos Fijados»); `idp` evita ids repetidos entre la barra y el cajón;
// el título es `${idp}-accesos` (no `-t`: `cajon-t` ya es el título del cajón del marco).
function grupo(idp, id, titulo, ic, nodos) {
  return `
        <p class="nav-title quick-group" id="${idp}-${id}">${icon(ic, 13)}<span>${titulo}</span></p>
        <ul class="nav quick-list" aria-labelledby="${idp}-accesos ${idp}-${id}">${nodos.map((n) => `\n          ${n}`).join('')}
        </ul>`;
}

// datos: { fijados, recientes, verMas, menuEn }. `recientes` puede traer más de 3: se dibujan los 3 primeros.
// Sin fijados ni recientes la sección se oculta (devuelve '').
function seccion({ fijados = [], recientes = [], verMas = false, menuEn = '' } = {}, idp = 'acc') {
  if (!fijados.length && !recientes.length) return '';
  const visibles = recientes.slice(0, RECIENTES_VISIBLES);
  const verMasHtml = verMas && visibles.length
    ? `
        <a class="quick-more" href="#"><span>Ver más<span class="sr-only"> en Mis archivos</span></span>${icon('chevronRight', 14)}</a>` : '';
  const vivo = `
        <p class="sr-only" role="status" id="${idp}-vivo"></p>`;
  return `
        <div class="quick">
        <p class="nav-title" id="${idp}-accesos">Accesos rápidos</p>${fijados.length ? grupo(idp, 'f', 'Fijados', 'pin', fijados.map((n, i) => fijado(n, idp, i, menuEn))) : ''}${visibles.length ? grupo(idp, 'r', 'Recientes', 'clock', visibles.map(enlace)) : ''}${verMasHtml}${vivo}
        </div>`;
}

// Aviso del tope (CA-28): `Alert` variante `warning` (ui-guidelines.md §4) arriba de la lista; no es una falla del
// sistema ni una confirmación, así que no va en toast (ADR-0024). El texto es el de la spec.
const avisoTope = () => AV.aviso({ titulo: TOPE_MENSAJE, tono: 'warn' });

// ---------- CSS ----------
const CSS = `
  /* Accesos rápidos (spec 006, CA-27): grupos Fijados y Recientes; ítems de 32 px en escritorio y 44 px en el cajón */
  .quick { display: grid; gap: 2px; }
  .quick .nav-title { margin-top: 6px; }
  .quick-group { display: flex; align-items: center; gap: 6px; margin: 8px 12px 0; text-transform: none; letter-spacing: 0; font-size: 12px; }
  .quick-group .ico { color: var(--muted-foreground); }
  .quick-list { grid-template-columns: minmax(0, 1fr); } /* sin esto el nombre largo ensancha la columna y no se corta */
  .quick-list a { min-height: 32px; padding: 4px 12px; gap: 10px; font-size: 13px; }
  .quick-list .ico { color: var(--secondary-foreground); }
  .quick-list .q-folder { color: var(--primary); }
  .q-name { display: flex; flex: 1; min-width: 0; white-space: nowrap; }
  .q-stem { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .q-ext { flex: none; }
  .quick-more { display: flex; align-items: center; gap: 4px; min-height: 32px; padding: 4px 12px; border-radius: var(--radius-md); color: var(--primary); font-size: 13px; font-weight: 600; text-decoration: none; }
  .quick-more:hover { background: var(--muted); color: var(--primary-hover); }
  .drawer .quick-more { min-height: 44px; font-size: 15px; }

  /* Menú ⋮ de cada fijado («Quitar de la barra lateral»): en escritorio aparece al pasar el puntero o al enfocar la
     fila (o con el menú abierto) y en pantallas sin puntero y en el cajón se ve siempre; el botón mide 28 px (44 px en el cajón) */
  .quick-item { position: relative; }
  .quick-item > a { padding-right: 36px; }
  .quick-item .row-actions { position: static; display: block; }
  .quick-item .row-btn { position: absolute; top: 50%; right: 2px; width: 28px; height: 28px; transform: translateY(-50%); opacity: 0; }
  .quick-item:hover .row-btn, .quick-item:focus-within .row-btn, .quick-item .row-btn[aria-expanded="true"] { opacity: 1; }
  .quick-item .row-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 0; }
  .quick-item .row-menu { left: 0; right: auto; width: max-content; min-width: 208px; max-width: calc(100vw - 32px); }
  @media (hover: none) { .quick-item .row-btn { opacity: 1; } }
  .drawer .quick-item > a { padding-right: 48px; }
  .drawer .quick-item .row-btn { top: 0; right: 0; width: 44px; height: 44px; transform: none; opacity: 1; }
  .drawer .quick-item .row-menu { max-width: 100%; }
` + AV.CSS_ALERT_WARN;

// Quitar un fijado (demo): el elemento sale de la lista, el foco pasa al ítem siguiente (o al anterior) y un mensaje
// role="status" lo anuncia. En la app, el elemento sigue en Mis archivos y el acceso se borra en el servidor.
const JS_QUITAR = `
(function () {
  document.addEventListener('click', function (e) {
    var it = e.target.closest('.quick .row-menu [role="menuitem"]');
    if (!it) return;
    var li = it.closest('li.quick-item'), lista = li.parentElement, quick = li.closest('.quick');
    var otro = li.nextElementSibling || li.previousElementSibling;
    var nombre = li.querySelector('a').getAttribute('title');
    li.remove();
    quick.querySelector('[role="status"]').textContent = '«' + nombre + '» ya no está en la barra lateral.';
    if (otro) { otro.querySelector('a').focus(); return; }
    var titulo = document.getElementById(lista.getAttribute('aria-labelledby').split(' ')[1]);
    lista.remove(); titulo.remove();
    var sig = quick.querySelector('a');
    (sig || document.querySelector('.nav a')).focus();
  });
})();
`;

module.exports = {
  FIJADOS_MAX, RECIENTES_VISIBLES, FIJADOS_5, RECIENTES, TOPE_MENSAJE, QUITAR, seccion, avisoTope, CSS, JS_QUITAR,
};
