// «Accesos rápidos» de la barra lateral (spec 006, CA-27 y CA-28, RF-38): Fijados (hasta 5) y Recientes (5), carpetas y
// archivos mezclados con su ícono, sin desglose, con «Ver más» si hay más recientes que los visibles.
// Lo usan shared/layout (layout/generar.js) y storage/explorador (explorador/generar-carpetas.js). La sección entra al
// marco por la opción `accesos` de marco/marco.js; con '' la barra queda como la de 005.
const C = require('../carpetas/carpetas.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');

const { icon } = C;

// ---------- Datos de ejemplo ([tipo, nombre]); en la app vienen de la API por cuenta ----------
const FIJADOS_5 = [
  ['carpeta', 'Proyecto Alpha'], ['archivo', 'Propuesta_Nimbo_v3.docx'], ['carpeta', 'Finanzas'],
  ['archivo', 'Matriz_Requisitos_RF.xlsx'], ['carpeta', 'Documentos Legales'],
];
// Los recientes nunca repiten un fijado (CA-27)
const RECIENTES_5 = [
  ['carpeta', 'Fase 3 · RAG'], ['archivo', 'Informe_avance_RAG.docx'], ['archivo', 'Modelo_ER_Nimbo.pdf'],
  ['carpeta', 'Actas'], ['archivo', 'Demo_Fase3_avance.pptx'],
];
const TOPE_MENSAJE = 'Ya fijaste 5 elementos. Quita uno para fijar otro.';

// ---------- Piezas ----------
function enlace([tipo, nombre]) {
  const carpeta = tipo === 'carpeta';
  const ic = carpeta ? icon('folder', 16, 'q-folder') : icon(S.tipo(nombre)[0], 16);
  const para = carpeta ? ', carpeta' : ', archivo, se descarga';
  // El nombre se corta con «…» en medio: la extensión (.docx, .pdf) queda siempre visible
  const punto = nombre.lastIndexOf('.');
  const nodo = carpeta || punto < 1 ? `<span class="q-stem">${nombre}</span>`
    : `<span class="q-stem">${nombre.slice(0, punto)}</span><span class="q-ext">${nombre.slice(punto)}</span>`;
  return `<li><a href="#" title="${nombre}">${ic}<span class="q-name">${nodo}</span><span class="sr-only">${para}</span></a></li>`;
}

// La lista se nombra con la sección y el grupo («Accesos rápidos Fijados»); `idp` evita ids repetidos entre la barra y el cajón.
function grupo(idp, id, titulo, ic, nodos) {
  return `
        <p class="nav-title quick-group" id="${idp}-${id}">${icon(ic, 13)}<span>${titulo}</span></p>
        <ul class="nav quick-list" aria-labelledby="${idp}-t ${idp}-${id}">${nodos.map((n) => `\n          ${enlace(n)}`).join('')}
        </ul>`;
}

// datos: { fijados, recientes, verMas }. Sin fijados ni recientes la sección se oculta (devuelve '').
function seccion({ fijados = [], recientes = [], verMas = false } = {}, idp = 'acc') {
  if (!fijados.length && !recientes.length) return '';
  const verMasHtml = verMas && recientes.length
    ? `
        <a class="quick-more" href="#"><span>Ver más<span class="sr-only"> en Mis archivos</span></span>${icon('chevronRight', 14)}</a>` : '';
  return `
        <div class="quick">
        <p class="nav-title" id="${idp}-t">Accesos rápidos</p>${fijados.length ? grupo(idp, 'f', 'Fijados', 'pin', fijados) : ''}${recientes.length ? grupo(idp, 'r', 'Recientes', 'clock', recientes) : ''}${verMasHtml}
        </div>`;
}

// Aviso del tope (CA-28): Alert en tono warning arriba de la lista; no es una falla del sistema ni una confirmación,
// así que no va en toast (ADR-0024). El texto es el de la spec.
const avisoTope = () => E.aviso({ titulo: TOPE_MENSAJE, tono: 'warn' });

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
` + E.CSS_ALERT_WARN;

module.exports = { FIJADOS_5, RECIENTES_5, TOPE_MENSAJE, seccion, avisoTope, CSS };
