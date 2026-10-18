// Genera los estados de sharing/compartido-conmigo (spec 012): la entrada de la barra lateral y la página con lo que
// otras personas compartieron con la cuenta, sus carpetas, el menú ⋮ según el nivel, «Subir nueva versión» del Editor
// (con el plan del propietario, CA-13 y CA-14) y «Salir de la compartición» (CA-16). Uso: node generar.js <worktree>
// Piezas de 012: comparticion/ (corpus y página); tabla, menú ⋮ y estados: mis-archivos/; panel de cargas:
// carga/panel.js; encabezado, «‹ Volver a…» y confirmación destructiva: carpetas/carpetas.js; aviso de poda en
// diálogo: mis-archivos/avisos.js; rótulo «Compartido conmigo»: marco/marco.js.
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const AV = require('../mis-archivos/avisos.js');
const CM = require('../mis-archivos/cargar-mas.js');
const MF = require('../mis-archivos/menu-fila.js');
const C = require('../carpetas/carpetas.js');
const U = require('../carga/panel.js');
const D = require('../explorador/desglose.js');
const K = require('../comparticion/corpus.js');
const X = require('../comparticion/piezas.js');

const { icon } = X;
const T = K.TEXTOS;

// ---------- CSS propio ----------
const CSS = X.css({
  escritorio: AV.CSS_DLG_WARN + CM.CSS_CARGAR_MAS + U.CSS_PANEL + `
  /* Compartido conmigo: columnas de propietario y nivel; encabezado con el origen de la carpeta */
  .files .c-owner { width: 190px; }
  .files .c-level { width: 120px; }
  .owner { display: inline-flex; align-items: center; gap: 8px; color: var(--foreground); }
  .owner .avatar { width: 26px; height: 26px; font-size: 10px; }
  .page-note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .page-note .ico { margin-top: 2px; color: var(--primary); }
  .state-empty h1 { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 600; }
  .row-menu { min-width: 208px; width: max-content; max-width: calc(100vw - 32px); }
  .dialog.dialog-version { width: min(500px, calc(100% - 32px)); }

  @media (max-width: 900px) {
` + U.CSS_PANEL_MQ900 + `  }
`,
  movil: `    .files .c-owner, .files .c-level { display: none; }
` + CM.CSS_CARGAR_MAS_MQ600 + U.CSS_PANEL_MQ600_HOJA + U.CSS_PANEL_MQ600_FILAS,
});

// ---------- Menú ⋮ según el nivel (RN-4) ----------
// Lector: descargar y fijar. Editor: además, «Subir nueva versión» en archivos. Con acceso directo: «Salir de la
// compartición» (definitivo para quien sale: rojo con ícono). Nunca compartir, renombrar, mover, eliminar ni historial.
function menuDestinatario(n) {
  const archivo = n.tipo === 'archivo';
  const items = [
    archivo ? X.itemMenu('download', 'Descargar') : '',
    archivo && n.nivel === 'Editor' ? X.itemMenu('upload', 'Subir nueva versión') : '',
    n.fijado ? X.itemMenu('pinOff', D.QUITAR) : X.itemMenu('pin', D.FIJAR),
  ].filter(Boolean);
  if (n.directo) items.push('sep', X.itemMenu('logout', 'Salir de la compartición', 'menu-danger'));
  return items;
}

// ---------- Tabla ----------
// En la raíz: propietario, nivel y fecha en que se compartió. Dentro de una carpeta: nivel, tamaño y modificado.
const COLUMNAS = {
  raiz: [['Propietario', 'c-owner'], ['Nivel', 'c-level'], ['Compartido', 'c-date']],
  carpeta: [['Nivel', 'c-level'], ['Tamaño', 'c-size'], ['Modificado', 'c-date']],
};
const propietario = (p) => `<span class="owner">${X.avatar(p)}<span>${p.nombre}</span></span>`;
function celdas(n, dentro) {
  if (!dentro) return [propietario(n.duenio), X.nivel(n.nivel), n.fecha];
  return [X.nivel(n.nivel), n.tipo === 'carpeta' ? C.SIN_TAMANO : n.tam, n.fecha];
}
// A 360 px las columnas se ocultan y sus datos van en texto bajo el nombre
const metaMovil = (n, dentro) => (dentro ? [n.nivel, n.tipo === 'carpeta' ? 'Carpeta' : n.tam, n.fecha] : [n.duenio.nombre, n.nivel, n.fecha]).join(' · ');

function fila(n, i, ctx) {
  const carpeta = n.tipo === 'carpeta';
  const tile = C.tileNodo(n.tipo, n.nombre);
  const nombre = carpeta ? `<a class="fname-link" href="#">${C.partible(n.nombre)}</a>` : C.partible(n.nombre);
  const td = celdas(n, ctx.dentro).map((c, j) => `<td class="${ctx.cols[j][1]}">${c}</td>`).join('');
  return `
            <tr>
              <td><div class="fname">${tile}<div class="fname-text">${nombre}<span class="fmeta-m">${metaMovil(n, ctx.dentro)}</span></div></div></td>
              ${td}
              <td class="c-act">${S.menuFila(i, n.nombre, n.nombre === ctx.menuEn, menuDestinatario(n))}</td>
            </tr>`;
}
// o: { lugar, dentro, menuEn }
function tabla(nodos, o = {}) {
  const ctx = { ...o, cols: COLUMNAS[o.dentro ? 'carpeta' : 'raiz'] };
  const ths = ctx.cols.map(([t, cls]) => `<th scope="col" class="${cls}">${t}</th>`).join('');
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Archivos y carpetas en ${o.lugar || M.COMPARTIDO}</caption>
            <thead><tr><th scope="col">Nombre</th>${ths}<th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${nodos.map((n, i) => fila(n, i, ctx)).join('')}
            </tbody>
          </table>
        </div>`;
}

// ---------- Encabezados (C.encabezado sin «Subir archivos» ni «Nueva carpeta»: CA-15) ----------
const encabezadoRaiz = () => C.encabezado([M.COMPARTIDO], { acciones: '', sub: 'Lo que otras personas compartieron contigo. No ocupa tu espacio.' });
// Carpeta abierta: las migas empiezan en «Compartido conmigo» (CA-11); en móvil, «‹ {carpeta anterior}»
const encabezadoCarpeta = (ruta, duenio, nivel) => C.encabezado(ruta, { acciones: '', sub: `Compartida por ${duenio.nombre} · Tu nivel: ${nivel}` }) + `
        <p class="page-note">${icon('info', 16)}<span>Solo ${duenio.nombre} puede subir archivos nuevos, crear carpetas, renombrar, mover o eliminar aquí.</span></p>`;

// ---------- Cuerpos ----------
// Paginación por cursor (CA-10): «Cargar más» de mis-archivos/cargar-mas.js debajo de la lista
const TEXTOS_MAS = { anuncio: 'Cargando más elementos compartidos contigo…' };
// o: { menuEn, pie: 'listo' | 'cargando' }
const lista = ({ menuEn = '', pie = 'listo' } = {}) => () => encabezadoRaiz() + tabla(K.COMPARTIDO, { menuEn }) + CM.cargarMas(pie, TEXTOS_MAS);
const carpetaAbierta = () => encabezadoCarpeta(K.RUTA_ENTREGABLES, K.DUENIA_BETA, K.NIVEL_BETA)
  + tabla(K.EN_ENTREGABLES, { lugar: 'Entregables', dentro: true });
const vacio = () => `${encabezadoRaiz()}
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('users', 40)}
          <h2 id="vacio-t">${T.vacioTitulo}</h2>
          <p>${T.vacioTexto}</p>
        </section>`;
// 404 idéntico (revocado, en la papelera del propietario, suspendido o inexistente): un solo mensaje (CA-8, CA-21, CA-23)
const yaNoDisponible = () => `
        <section class="state-empty" aria-labelledby="nd-t">
          ${icon('folderX', 40)}
          <h1 id="nd-t">${T.noDisponibleTitulo}</h1>
          <p>${T.noDisponibleTexto}</p>
          <a class="btn btn-primary" href="compartido-conmigo--lista.html">${icon('chevronLeft', 16)}<span>${T.volver}</span></a>
        </section>`;

// ---------- Nueva versión del Editor (CA-13, CA-14) ----------
const V = K.VERSION_NUEVA;
const DUENIO_Q3 = K.COMPARTIDO.find((n) => n.nombre === K.INFORME_Q3).duenio;
// Confirmación con aviso de poda (014 CA-15 con el plan del propietario). El Editor no ve el historial (CA-15) ni datos
// del plan del propietario (§5): el aviso es el texto exacto de CA-13, sin número de versión ni cuántas conserva su plan.
// Sin poda, el mismo diálogo sin el aviso.
function dialogoVersion() {
  const poda = AV.avisoDialogo({ titulo: T.poda });
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog dialog-form dialog-version" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d dlg-n dlg-p">
    <h2 id="dlg-t">¿Subir una nueva versión de «${C.partible(K.INFORME_Q3)}»?</h2>
    <p id="dlg-d">Pasará a ser la versión actual y el archivo conservará su nombre. Usará ${V.tam} del espacio de ${DUENIO_Q3.nombre}, a quien pertenece el archivo.</p>
    <p id="dlg-n" class="dialog-note">Elegiste <strong>${C.partible(V.local)}</strong> (${V.tam}).</p>${poda}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button" autofocus>Cancelar</button>
      <button class="btn btn-primary" type="button">${icon('upload', 16)}<span>Subir nueva versión</span></button>
    </div>
  </div>`;
}

// Panel de cargas de 005 con un solo elemento: la versión nueva (conserva el nombre del archivo compartido)
const ITEM_Q3 = { nombre: K.INFORME_Q3 };
// Rechazo (CA-14): un mensaje por causa, la versión actual no cambia y nada revela el plan del propietario (§5)
const rechazo = (meta, msg) => ({ ...ITEM_Q3, meta, st: 'no se subió', stCls: 'st-err', msg, nota: 'La versión actual no cambió.' });
const ITEMS_VERSION = {
  subiendo: { ...ITEM_Q3, meta: `${V.subido} de ${V.tam}`, st: 'nueva versión', stCls: '', bar: V.pct, barTxt: `${V.pct} %`, acciones: U.btnIcon('x', `Cancelar la carga de ${K.INFORME_Q3}`) },
  subida: { ...ITEM_Q3, meta: V.tam, st: 'nueva versión subida', stCls: 'st-ok', done: true },
  sinEspacio: rechazo(V.tam, T.espacioDuenio),
  tamano: rechazo(K.VERSION_GRANDE.tam, T.tamanoDuenio),
  tipo: rechazo(V.tam, T.tipoInvalido('.docx')),
};
const TITULOS_VERSION = { subiendo: 'Subiendo 1 archivo', subida: '1 archivo subido' };
function panelVersion(etapa) {
  const titulo = TITULOS_VERSION[etapa] || '1 archivo no se subió';
  const anuncio = etapa === 'subiendo' ? `Subiendo la nueva versión de ${K.INFORME_Q3}: ${V.pct} %` : '';
  return U.panel({ titulo, sub: '1 de 1', activas: etapa === 'subiendo', anuncio, items: [ITEMS_VERSION[etapa]] });
}

// ---------- Estados ----------
const base = { activo: M.COMPARTIDO, crumbs: [M.COMPARTIDO], js: MF.JS_MENU };
const conLista = (e) => ({ ...base, cuerpo: lista(), ...e });
const PANTALLA = {
  nombre: 'compartido-conmigo', rotulo: M.COMPARTIDO, css: CSS,
  contexto: 'página de la destinataria · lo compartido no ocupa su espacio',
};

const ESTADOS = [
  conLista({ estado: 'lista', titulo: 'lista: nombre, tipo, propietario, nivel y fecha, de lo más reciente a lo más antiguo, con «Cargar más» (CA-10)' }),
  conLista({ estado: 'cargando-mas', titulo: '«Cargar más» en curso: la lista visible se conserva (CA-10)', cuerpo: lista({ pie: 'cargando' }) }),
  {
    ...base, estado: 'carpeta-abierta', titulo: 'carpeta compartida abierta: migas desde «Compartido conmigo», sin carpetas superiores del propietario (CA-11)',
    crumbs: K.RUTA_ENTREGABLES, cuerpo: carpetaAbierta,
  },
  { ...base, estado: 'vacio', titulo: 'nadie le ha compartido nada todavía', cuerpo: vacio },
  { ...base, estado: 'cargando', titulo: 'cargando la lista (esqueleto)', cuerpo: () => encabezadoRaiz() + E.esqueleto('Cargando lo que compartieron contigo…') },
  {
    ...base, estado: 'error', titulo: 'la lista no cargó: causa y «Reintentar»',
    cuerpo: () => encabezadoRaiz() + E.errorEstado('No pudimos cargar lo que compartieron contigo.', 'Lo compartido sigue igual. Inténtalo de nuevo en unos segundos.'),
  },
  { ...base, estado: 'ya-no-disponible', titulo: 'el elemento ya no está compartido, está en la papelera, la cuenta de quien lo compartió está suspendida o no existe: el mismo mensaje (CA-8, CA-21, CA-23)', cuerpo: yaNoDisponible },
  conLista({ estado: 'menu-fila-lector', titulo: 'menú ⋮ de un archivo como Lector: descargar, fijar y salir (RN-4)', cuerpo: lista({ menuEn: K.CONTRATO }) }),
  conLista({ estado: 'menu-fila-editor', titulo: 'menú ⋮ de un archivo como Editor: además, «Subir nueva versión» (CA-13)', cuerpo: lista({ menuEn: K.INFORME_Q3 }) }),
  conLista({ estado: 'aviso-de-poda', titulo: 'confirmar la versión nueva: usa el espacio del propietario y avisa de la poda (CA-13; 014 CA-15)', modal: true, capa: dialogoVersion() }),
  conLista({ estado: 'subiendo-version', titulo: 'subiendo la versión nueva: panel de cargas con progreso y anuncio (CA-13)', capa: panelVersion('subiendo') }),
  conLista({ estado: 'version-subida', titulo: 'éxito: la versión nueva es la actual y el archivo conserva su nombre (CA-13)', capa: panelVersion('subida') }),
  conLista({ estado: 'error-espacio-propietario', titulo: 'la cuenta de quien lo compartió no tiene espacio: sin mostrar su espacio libre (CA-14)', capa: panelVersion('sinEspacio') }),
  conLista({ estado: 'error-tamano-propietario', titulo: 'supera el máximo por archivo del plan de quien lo compartió: sin mostrar la cifra (CA-14)', capa: panelVersion('tamano') }),
  conLista({ estado: 'error-tipo', titulo: 'el contenido no corresponde a la extensión: el mensaje de 005 tal cual, como 014 CA-3 (CA-14)', capa: panelVersion('tipo') }),
  conLista({
    estado: 'confirmar-salir', titulo: '«Salir de la compartición»: consecuencia explícita y foco en «Cancelar» (CA-16)', modal: true,
    capa: C.confirmar({ titulo: '¿Salir de la compartición?', cuerpo: T.salir(K.CONTRATO), boton: 'Salir de la compartición' }),
  }),
  conLista({ estado: 'cajon-abierto', titulo: 'entrada «Compartido conmigo» en el cajón de navegación (solo por debajo de 900 px)', cajon: true }),
];

X.generar(PANTALLA, ESTADOS);
