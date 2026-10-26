// Genera los estados de la spec 018 en storage/busqueda: búsqueda por NOMBRE con filtros de TIPO y FECHA de última
// modificación (RF-15 parcial). La búsqueda por contenido es de 018b: `busqueda--resultados.html` es el paquete de la
// propuesta (p. 13), queda como referencia de 018b y no se genera.
// Uso: node generar.js <ruta-del-worktree>
// Entrada: ítem «Buscar» de la navegación (barra lateral y cajón móvil) que abre /buscar, con su propio campo; no hay
// campo fijo en la barra superior (spec 018 §7, CA-12). Sin resaltado de la coincidencia ni total de coincidencias.
// Reutiliza: marco (marco/marco.js), tabla y fila del explorador (carpetas/carpetas.js, mis-archivos/mis-archivos.js),
// estados de lista (mis-archivos/estados.js), barra lateral de 007 (espacio/espacio.js) y el patrón de filtros de
// audit/mi-actividad (actividad/generar.js: segmentos, rango Desde/Hasta y error de rango). El CSS de los filtros se
// copia de actividad/generar.js y «Cargar más» de explorador/generar-orden.js (segundo uso de cada uno); si aparece un
// tercero, se extraen a un módulo (constitución, Art. VI.2).
// Fuera de alcance de 018 (no aparece): «En comentarios», OCR, «Preguntar al agente», «Resumir con citas», «Incluir
// papelera», «Solo indexados», % de relevancia, «Ámbito de la búsqueda», fragmentos de contenido, resaltado, total de
// coincidencias y orden elegible.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const Q = require('../espacio/espacio.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/busqueda');
fs.mkdirSync(OUT, { recursive: true });

const icon = S.crearIcon({
  ...C.P, ...Q.P,
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  searchX: '<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
});

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + `
  /* Propio de storage/busqueda (spec 018); la lista es la del explorador (005, 006 y 007) */
` + S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + Q.CSS_TARJETA + `
  :root { --file-img: #276B7A; --file-img-bg: #7EC8D820; }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }

  /* Campo de búsqueda dentro de la página /buscar (la entrada es «Buscar» en la navegación, no la barra superior) */
  .search { margin: 18px 0 0; max-width: 720px; }
  .search > label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--foreground); }
  .search-row { display: flex; gap: 8px; }
  .search-box { position: relative; flex: 1; min-width: 0; }
  .search-box .search-ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--secondary-foreground); pointer-events: none; }
  .search input { width: 100%; min-height: 44px; padding: 8px 44px 8px 40px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 16px; }
  .search input::placeholder { color: var(--muted-foreground); opacity: 1; }
  .search input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .search input:disabled { background: var(--muted); color: var(--secondary-foreground); }
  .search input::-webkit-search-cancel-button { display: none; }
  .search .search-clear { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; color: var(--secondary-foreground); }
  .search-row .btn { min-height: 44px; }
  .search .search-hint { margin: 6px 0 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Entrada: invitación a escribir (StateView empty sin acción) */
  .state-empty.state-start { min-height: 180px; }

  /* Encabezado de la página de resultados */
  .page-head .page-sub { margin-top: 6px; font-size: 14px; color: var(--secondary-foreground); }
  .q { font-weight: 700; }

  /* Filtros (patrón de audit/mi-actividad, spec 004): tipo en segmentos y fecha de modificación con rango opcional */
  .card { margin-top: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 16px 20px; }
  .filters { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px 28px; align-items: start; margin: 0; }
  .filters fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .filters legend, .filters .flabel { display: block; padding: 0; margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--foreground); }
  .segments { display: inline-flex; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); overflow: hidden; }
  .segments label { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 6px 14px; font-size: 13.5px; font-weight: 500; color: var(--secondary-foreground); cursor: pointer; }
  .segments label + label { border-left: 1px solid var(--input); }
  .segments label:hover { background: var(--muted); }
  .segments input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .segments label:has(input:checked) { background: var(--accent); color: var(--foreground); font-weight: 600; box-shadow: inset 0 -3px 0 var(--primary); }
  .segments label .ico { display: none; }
  .segments label:has(input:checked) .ico { display: inline-block; color: var(--primary); }
  .segments label:has(input:focus-visible) { outline: 2px solid var(--ring); outline-offset: -2px; }
  .segments label:has(input:disabled) { opacity: .45; cursor: default; }
  .hint { display: flex; gap: 6px; align-items: flex-start; margin: 8px 0 0; font-size: 12.5px; color: var(--secondary-foreground); }
  .hint .ico { margin-top: 2px; color: var(--primary); }
  .when-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .when-row > div { min-width: 0; flex: 1 1 150px; max-width: 220px; }
  .when-row label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 500; color: var(--secondary-foreground); }
  .when-row .preset label { font-weight: 600; color: var(--foreground); }
  .when-row select, .when-row input { width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; }
  .when-row .preset { flex: 1 1 200px; max-width: 240px; }
  .when-row select:focus-visible, .when-row input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .when-row input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .when-row select:disabled, .when-row input:disabled { background: var(--muted); color: var(--secondary-foreground); }
  .filters .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 0 !important; font-size: 13px !important; color: var(--destructive) !important; grid-column: 1 / -1; }
  .filters-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 16px; min-height: 36px; padding-top: 12px; border-top: 1px solid var(--border); }
  .btn-link { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 4px 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--primary); font: inherit; font-size: 13.5px; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .btn-link:hover { background: var(--muted); color: var(--primary-hover); }

  /* Resultados: la fila del explorador + columna «Ubicación» (carpeta que lo contiene); sin resaltado (spec 018 §7) */
  .results-t { margin: 24px 0 0; font-size: 16px; font-weight: 600; line-height: 1.5; }
  .results-t + .files, .results-t + div { margin-top: 12px; }
  .files .c-loc { width: 30%; }
  .files thead th.c-size, .files thead th.c-date { width: 120px; }
  .fname-text a.fname-link { display: inline-block; padding: 2px 0; } /* objetivo de 24 px */
  a.loc { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; color: var(--secondary-foreground); text-decoration: none; overflow-wrap: anywhere; }
  a.loc .ico { color: var(--muted-foreground); }
  a.loc:hover { color: var(--foreground); text-decoration: underline; }
  .floc-m { display: none; }
  .files caption { text-align: left; }

  /* Paginación por cursor: «Cargar más» debajo de la lista (copiado de explorador/generar-orden.js, 007; segundo uso) */
  .more { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 16px; }
  .more .btn[aria-disabled="true"] { cursor: progress; }
  .files + .alert { margin-top: 16px; }

  @media (max-width: 760px) { .filters { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .card { margin-top: 16px; padding: 14px; }
    .segments { display: flex; width: 100%; }
    .segments label { flex: 1 1 auto; justify-content: center; text-align: center; padding: 6px 8px; min-height: 44px; font-size: 13px; }
    .segments label .ico { display: none !important; }
    .when-row > div, .when-row .preset { flex: 1 1 100%; max-width: none; }
    .when-row select, .when-row input { min-height: 44px; }
    .filters-foot { align-items: flex-start; flex-direction: column; }
    .filters-foot .btn-link { min-height: 44px; margin-left: -8px; }
    .files .c-loc { display: none; }
    .floc-m { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; }
    .floc-m a.loc { min-height: 24px; }
    .more .btn { width: 100%; min-height: 44px; }
    .search-row .btn { padding: 8px 14px; }
  }
`;

// ---------- Datos de ejemplo (hoy: lunes 26 oct 2026, hora de Guatemala; plan Personal: 50 MB por archivo) ----------
// [tipo, nombre, carpeta que lo contiene (o «Mis archivos»), tamaño, modificado, días desde la modificación, categoría]
// Orden fijo (CA-2): carpetas primero y después archivos, cada grupo del modificado más reciente al más antiguo.
// Categorías de FileCategory (spec 007 CA-2): documents (docx, pdf, xlsx, pptx, txt, md), images y other.
const RESULTADOS = [
  ['carpeta', 'Camiones', 'Logística', '', '22 oct', 4, null],
  ['carpeta', 'Seguro del camión', 'Finanzas', '', '30 sep', 26, null],
  ['archivo', 'Camión_Ventas.xlsx', 'Reportes 2026', '1.2 MB', 'hoy · 08:40', 0, 'documents'],
  ['archivo', 'Mantenimiento_camion_C-12.docx', 'Camiones', '96 KB', 'ayer', 1, 'documents'],
  ['archivo', 'Checklist_salida_camión.txt', 'Mis archivos', '4 KB', '20 oct', 6, 'documents'],
  ['archivo', 'Ruta_CAMIONES_zona_norte.pdf', 'Logística', '2.4 MB', '15 oct', 11, 'documents'],
  ['archivo', 'Foto_camión_entrega.jpg', 'Camiones', '3.8 MB', '9 oct', 17, 'images'],
  ['archivo', 'Cotizacion_camion_usado.pdf', 'Finanzas', '640 KB', '3 sep', 53, 'documents'],
  ['archivo', 'Recorrido_camion_ruta_sur.mp4', 'Camiones', '38.6 MB', '12 jun', 136, 'other'],
  ['archivo', 'Inventario_camiones_2025.xlsx', 'Logística', '214 KB', '14 nov 2025', 346, 'documents'],
];
const CONSULTA = 'camion';
const SIN_COINCIDENCIAS = 'presupuesto bodega';

// ---------- Navegación: ítem «Buscar» (CA-12) ----------
// Va después de «Mis archivos» en la barra lateral y en el cajón móvil; aria-current="page" en /buscar.
// En la app es una entrada más de DEFAULT_NAV_ITEMS de AppLayout (la navegación interna no la recibe, CA-14).
const ITEM_MIS_ARCHIVOS = /(<li><a href="#"[^>]*>(?:(?!<li>)[\s\S])*?<span>Mis archivos<\/span><\/a><\/li>)/;
const conItemBuscar = (html) =>
  html.replace(ITEM_MIS_ARCHIVOS, `$1\n          <li><a href="busqueda--entrada.html" aria-current="page">${icon('search')}<span>Buscar</span></a></li>`);

const CARPETAS_NAV = C.CARPETAS_RAIZ.map((n) => ['folder', n]);
const barraLateral = () => conItemBuscar(Q.sidebar({ activo: '', q: Q.CUOTAS.ok }));

// Cajón móvil (por debajo de 900 px): la misma navegación que la barra lateral, con «Buscar» activo.
function cajonMovil() {
  const q = Q.CUOTAS.ok;
  const html = M.cajon({ abierto: true, carpetas: CARPETAS_NAV, cuota: q })
    .replace(M.cuota(q), Q.tarjeta(q))
    .replace('<span>Papelera</span><span class="meta">3</span>', '<span>Papelera</span><span class="meta">6</span>');
  return conItemBuscar(Q.conItemEspacio(html, ''));
}
// Estático: con el cajón abierto (menos de 900 px) el resto de la app queda inerte (en la app, el foco va al primer enlace).
const JS_CAJON = `
(function () {
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  document.querySelector('.app').inert = true;
})();
`;

// ---------- Piezas ----------
const IMAGENES = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const tileDe = (tipo, nombre) => {
  if (tipo === 'carpeta') return `<span class="ftile ftile-folder">${icon('folder', 16)}</span>`;
  if (IMAGENES.includes(nombre.split('.').pop().toLowerCase())) return `<span class="ftile ftile-img">${icon('image', 16)}</span>`;
  return S.tile(nombre);
};

// Ubicación: la carpeta que contiene el elemento, o «Mis archivos» en la raíz (CA-2); el enlace la abre en el explorador.
const ubicacion = (carpeta) => `<a class="loc" href="#">${icon('folder', 14)}<span>${carpeta}</span></a>`;

// Fila de resultado: el nombre es el enlace (carpeta → explorador, 006; archivo → su ficha, 014; CA-10). Sin resaltado.
function filaResultado([tipo, nombre, carpeta, tam, fecha]) {
  const esCarpeta = tipo === 'carpeta';
  const meta = esCarpeta ? `Carpeta · ${fecha}` : `${tam} · ${fecha}`;
  return `
            <tr>
              <td><div class="fname">${tileDe(tipo, nombre)}<div class="fname-text"><a class="fname-link" href="#">${nombre}</a><span class="floc-m"><span class="sr-only">Ubicación: </span>${ubicacion(carpeta)}</span><span class="fmeta-m">${meta}</span></div></div></td>
              <td class="c-loc">${ubicacion(carpeta)}</td>
              <td class="c-size">${esCarpeta ? '<span aria-hidden="true">—</span><span class="sr-only">Carpeta, sin tamaño</span>' : tam}</td>
              <td class="c-date">${fecha}</td>
            </tr>`;
}

// Lista de resultados con su título (sin total de coincidencias, RN-6). busy: «Cargar más» en curso.
function resultados(items, { consulta = CONSULTA, busy = false } = {}) {
  return `
        <h2 class="results-t" id="t-resultados">Resultados para «<span class="q">${consulta}</span>»</h2>
        <div class="files"${busy ? ' aria-busy="true"' : ''}>
          <table aria-labelledby="t-resultados">
            <caption class="sr-only">Carpetas primero y luego archivos, del modificado más reciente al más antiguo</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-loc">Ubicación</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-date">Modificado</th></tr></thead>
            <tbody>${items.map(filaResultado).join('')}
            </tbody>
          </table>
        </div>`;
}

// «Cargar más» (patrón de 007: cursor, sin total; el botón desaparece cuando no hay nextCursor)
function cargarMas(estado = 'listo') {
  if (estado === 'error') {
    return E.aviso({ titulo: 'No pudimos cargar más resultados.', texto: 'Revisa tu conexión y vuelve a intentarlo. Lo que ya ves sigue aquí.', accion: 'Reintentar' });
  }
  if (estado === 'cargando') {
    return `
        <div class="more">
          <button class="btn btn-outline" type="button" aria-disabled="true">${icon('loader', 16, 'spin')}<span>Cargando más…</span></button>
          <p class="sr-only" role="status">Cargando más resultados…</p>
        </div>`;
  }
  return `
        <div class="more">
          <button class="btn btn-outline" type="button">Cargar más</button>
        </div>`;
}

// Encabezado y formulario de la página (role="search"). Se busca al enviar (Enter o «Buscar»), no mientras se escribe.
// entrada: campo vacío con foco y la invitación a escribir (CA-6, CA-12). maxlength=255 (RN-5).
function cabeceraBuscar({ valor = '', entrada = false, deshabilitado = false } = {}) {
  const dis = deshabilitado ? ' disabled' : '';
  const borrar = valor && !deshabilitado ? `
                <button class="icon-btn search-clear" type="button" aria-label="Borrar el texto">${icon('x', 18)}</button>` : '';
  return `
        <div class="page-head">
          <div>
            <h1>Buscar</h1>
            <p class="page-sub">Encuentra archivos y carpetas por su nombre, en cualquier carpeta. Sin distinguir mayúsculas ni acentos.</p>
          </div>
        </div>
        <form class="search" role="search" action="#" aria-label="Buscar por nombre">
          <label for="q">Nombre del archivo o carpeta</label>
          <div class="search-row">
            <div class="search-box">
              ${icon('search', 18, 'search-ico')}
              <input id="q" name="q" type="search" value="${valor}" maxlength="255" placeholder="informe camión" autocomplete="off" enterkeyhint="search" spellcheck="false" aria-describedby="q-ayuda"${entrada ? ' autofocus' : ''}${dis}>${borrar}
            </div>
            <button class="btn btn-primary" type="submit"${dis}>Buscar</button>
          </div>
          <p class="search-hint" id="q-ayuda">Se buscan todas las palabras que escribas, en cualquier orden.</p>
        </form>`;
}

// Filtros. f: { tipo: 'todos'|'documents'|'images'|'other', fecha: 'cualquiera'|'7'|'30'|'anio'|'rango', desde, hasta,
// error, deshabilitado }. Cambiar un filtro repite la búsqueda; «Quitar filtros» solo si hay alguno activo.
const TIPOS = [['todos', 'Todos'], ['documents', 'Documentos'], ['images', 'Imágenes'], ['other', 'Otros']];
const FECHAS = [['cualquiera', 'Cualquier fecha'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['anio', 'Este año'], ['rango', 'Rango personalizado']];
function filtros(f) {
  const dis = f.deshabilitado ? ' disabled' : '';
  const radio = ([v, t]) => `<label><input type="radio" name="tipo" value="${v}"${f.tipo === v ? ' checked' : ''}${dis}>${icon('check', 14)}${t}</label>`;
  const opcion = ([v, t]) => `<option value="${v}"${f.fecha === v ? ' selected' : ''}>${t}</option>`;
  const inval = f.error ? ' aria-invalid="true" aria-describedby="err-rango"' : '';
  const rango = f.fecha === 'rango' ? `
              <div><label for="desde">Desde</label><input id="desde" name="desde" type="date" value="${f.desde || ''}"${inval}${dis}></div>
              <div><label for="hasta">Hasta</label><input id="hasta" name="hasta" type="date" value="${f.hasta || ''}"${inval}${dis}></div>` : '';
  const activos = f.tipo !== 'todos' || f.fecha !== 'cualquiera';
  const hint = f.tipo !== 'todos' ? `
            <p class="hint" id="tipo-nota">${icon('info', 14)}<span>Con un tipo elegido solo ves archivos: las carpetas no tienen tipo.</span></p>` : '';
  return `
        <section class="card" aria-labelledby="t-filtros">
          <h2 id="t-filtros" class="sr-only">Filtros de la búsqueda</h2>
          <form class="filters" novalidate>
            <fieldset${hint ? ' aria-describedby="tipo-nota"' : ''}>
              <legend>Tipo</legend>
              <div class="segments">
                ${TIPOS.map(radio).join('')}
              </div>${hint}
            </fieldset>
            <div class="when-row">
              <div class="preset"><label for="fecha">Modificado</label><select id="fecha" name="fecha"${dis}>${FECHAS.map(opcion).join('')}</select></div>${rango}
            </div>
            ${f.error ? `<p class="field-error" id="err-rango" role="alert">${icon('alert', 15)}<span>${f.error}</span></p>` : ''}${activos && !f.deshabilitado ? `
            <div class="filters-foot">
              <button class="btn-link" type="button">${icon('x', 14)}Quitar filtros</button>
            </div>` : ''}
          </form>
        </section>`;
}

// Entrada (CA-6): la web no busca sin texto y pide escribir algo
const invitacion = () => `
        <section class="state-empty state-start" aria-labelledby="t-inicio">
          ${icon('search', 36)}
          <h2 id="t-inicio">Escribe qué quieres buscar.</h2>
          <p>Lo que está en la papelera no aparece en la búsqueda.</p>
        </section>`;

// Sin resultados (CA-11, §6). conFiltros: la acción es «Quitar filtros»; sin filtros no hay filtros que quitar.
function sinResultados(consulta, conFiltros) {
  return `
        <div class="state-empty" role="status" aria-labelledby="t-vacio">
          ${icon('searchX', 36)}
          <h2 id="t-vacio">No encontramos nada con «${consulta}».</h2>
          <p>${conFiltros ? 'Revisa lo que escribiste o quita los filtros.' : 'Revisa lo que escribiste.'}</p>${conFiltros ? `
          <button class="btn btn-outline" type="button">${icon('x', 16)}Quitar filtros</button>` : ''}
        </div>`;
}

// ---------- Página ----------
// Sin script propio salvo el del cajón abierto: los filtros son estáticos (en la app, elegir «Rango personalizado»
// muestra Desde y Hasta, como mi-actividad de 004).
function page(v) {
  const file = `busqueda--${v.estado}.html`;
  return C.conLogo(`${M.cabecera({
    titulo: `Buscar · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 018: búsqueda por nombre, tipo y fecha; RF-15 parcial). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA; botón primario #4A6FA5, DF-41). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/busqueda/generar.js (marco, carpetas, estados y espacio). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">018</span> <strong>Búsqueda por nombre, tipo y fecha</strong> <span class="file">${file}</span> <span>plan Personal (ejemplo) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${barraLateral()}
    <div class="main">
      ${M.topbar({ crumbs: ['Buscar'], conMenu: !!v.cajon, cajonAbierto: !!v.cajon })}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>${v.cajon ? cajonMovil() : ''}
</div>

${v.cajon ? `<script>${JS_CAJON}</script>` : ''}
</body>
</html>
`);
}

// ---------- Estados ----------
const TODO = { tipo: 'todos', fecha: 'cualquiera' };
const DOCS_30 = RESULTADOS.filter((r) => r[6] === 'documents' && r[5] <= 30);
const conTexto = (o = {}) => cabeceraBuscar({ valor: CONSULTA, ...o });

const ESTADOS = [
  {
    estado: 'entrada',
    titulo: '/buscar recién abierta desde «Buscar» de la navegación: campo vacío con foco',
    cuerpo: () => cabeceraBuscar({ entrada: true }) + invitacion(),
  },
  {
    estado: 'resultados-por-nombre',
    titulo: '«camion» encuentra «Camión» y «CAMIONES»: carpetas primero, luego archivos, con su ubicación',
    cuerpo: () => conTexto() + filtros(TODO) + resultados(RESULTADOS),
  },
  {
    estado: 'filtros',
    titulo: 'tipo Documentos y modificados en los últimos 30 días: sin carpetas',
    cuerpo: () => conTexto() + filtros({ tipo: 'documents', fecha: '30' }) + resultados(DOCS_30),
  },
  {
    estado: 'rango-invalido',
    titulo: 'rango personalizado con la fecha final antes de la inicial: no se consulta y se conserva la lista anterior',
    cuerpo: () => conTexto() + filtros({
      tipo: 'todos', fecha: 'rango', desde: '2026-10-20', hasta: '2026-10-01',
      error: 'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para buscar.',
    }) + resultados(RESULTADOS),
  },
  {
    estado: 'sin-resultados',
    titulo: 'sin resultados con filtros activos: acción «Quitar filtros»',
    cuerpo: () => conTexto() + filtros({ tipo: 'other', fecha: '7' }) + sinResultados(CONSULTA, true),
  },
  {
    estado: 'sin-resultados-sin-filtros',
    titulo: 'sin resultados y sin filtros: revisar lo escrito',
    cuerpo: () => cabeceraBuscar({ valor: SIN_COINCIDENCIAS }) + filtros(TODO) + sinResultados(SIN_COINCIDENCIAS, false),
  },
  {
    estado: 'cargando',
    titulo: 'buscando: campo y filtros deshabilitados, esqueleto con la forma de la lista',
    cuerpo: () => conTexto({ deshabilitado: true }) + filtros({ ...TODO, deshabilitado: true }) + E.esqueleto(`Buscando «${CONSULTA}»…`),
  },
  {
    estado: 'error',
    titulo: 'la búsqueda falló: error con «Reintentar»',
    cuerpo: () => conTexto() + filtros(TODO) + E.errorEstado('No pudimos buscar.', 'Revisa tu conexión y vuelve a intentarlo.'),
  },
  {
    estado: 'cargando-mas',
    titulo: '«Cargar más» en curso (patrón de 007): la lista visible se conserva',
    cuerpo: () => conTexto() + filtros(TODO) + resultados(RESULTADOS, { busy: true }) + cargarMas('cargando'),
  },
  {
    estado: 'cargar-mas-error',
    titulo: 'falló la página siguiente (patrón de 007): aviso con «Reintentar» debajo de la lista',
    cuerpo: () => conTexto() + filtros(TODO) + resultados(RESULTADOS) + cargarMas('error'),
  },
  {
    estado: 'menu-movil', cajon: true,
    titulo: 'menú móvil abierto en /buscar: «Buscar» activo en la navegación',
    cuerpo: () => conTexto() + filtros(TODO) + resultados(RESULTADOS),
  },
];

for (const v of ESTADOS) {
  const file = `busqueda--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
