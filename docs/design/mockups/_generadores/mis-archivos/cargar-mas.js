// «Cargar más» (paginación por cursor, 007 RN-6): pie de una lista paginada. Separado de estados.js (Art. IV).
const { icon } = require('./mis-archivos.js');
const { aviso } = require('./avisos.js');

// Pie de una lista paginada. Extraído al tercer uso (Art. VI.2): explorador (007), layout (007) y Mi actividad (004);
// lo usa también Compartido conmigo (012). Estados: 'listo' (botón), 'cargando' (aria-disabled: sigue enfocable, con
// anuncio), 'error' (Alert con «Reintentar»; lo ya cargado no cambia) y 'fin' (no hay más páginas).
// textos: { anuncio, error: { titulo, texto, cerrar, enPie }, fin }. CSS: CSS_CARGAR_MAS y, si se usa 'fin',
// CSS_CARGAR_MAS_FIN. error.enPie: el Alert va dentro del pie, a todo el ancho y a 16 px de la lista, como
// LoadMoreFooter (Mi actividad) y LoadMore (explorador de 007) de apps/web; requiere CSS_CARGAR_MAS_ERROR_EN_PIE.
// Sin él, el Alert queda suelto.
exports.CSS_CARGAR_MAS = `  /* Pie de una lista paginada: «Cargar más» y cargando (el error es un Alert) */
  .more { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 16px; }
  .more .btn[aria-disabled="true"] { cursor: progress; }
`;
// Solo para las listas que dibujan el estado 'fin'
exports.CSS_CARGAR_MAS_FIN = `  .end-note { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 16px 0 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .end-note .ico { color: var(--success-foreground); }
`;
// Solo con error.enPie: el margen lo da el pie (gap-4 de la lista en la app), no el Alert
exports.CSS_CARGAR_MAS_ERROR_EN_PIE = `  .more > .alert { width: 100%; margin: 0; }
`;
exports.CSS_CARGAR_MAS_MQ600 = `    .more .btn { width: 100%; min-height: 44px; }
`;
const BOTON_MAS = '<button class="btn btn-outline" type="button">Cargar más</button>';
const pieMas = (contenido) => `
        <div class="more">
          ${contenido}
        </div>`;
exports.cargarMas = function cargarMas(estado = 'listo', textos = {}) {
  if (estado === 'error') {
    const alerta = aviso({ ...textos.error, accion: 'Reintentar' });
    return textos.error.enPie ? pieMas(alerta.trim()) : alerta;
  }
  if (estado === 'fin') return `
        <p class="end-note" role="status">${icon('ok', 18)}${textos.fin}</p>`;
  if (estado === 'cargando') {
    return pieMas(`<button class="btn btn-outline" type="button" aria-disabled="true">${icon('loader', 16, 'spin')}<span>Cargando más…</span></button>
          <p class="sr-only" role="status">${textos.anuncio}</p>`);
  }
  return pieMas(BOTON_MAS);
};
