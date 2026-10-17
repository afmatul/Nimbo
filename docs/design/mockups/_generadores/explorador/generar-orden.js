// Genera los estados de la spec 007 en storage/explorador: control de orden (nombre, tamaño, fecha de modificación y fecha de
// creación; ascendente o descendente; por defecto, fecha de creación, más recientes primero: RN-6, D-6) y paginación por cursor con «Cargar más». Las carpetas van siempre primero.
// Uso: node generar-orden.js <ruta-del-worktree>
// Los estados de 005 (generar.js) y 006 (generar-carpetas.js) no cambian. Marco: marco/marco.js; tabla y encabezado:
// carpetas/carpetas.js; estados comunes: mis-archivos/estados.js; barra lateral de 007 (plan Personal, tarjeta de
// cuota con su acción): espacio/espacio.js. Sin cuadrícula, filtros ni selección múltiple (spec 007 §7).
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const Q = require('../espacio/espacio.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/explorador');

const icon = S.crearIcon({ ...C.P, ...Q.P });

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + `
  /* Propio de storage/explorador (specs 005, 006 y 007) */
` + S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + Q.CSS_TARJETA + `
  :root { --file-img: #276B7A; --file-img-bg: #7EC8D820; }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }

  /* Barra de la lista: control de orden (DropdownMenu con dos grupos de radio) */
  .list-tools { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 20px; }
  .list-tools + .files { margin-top: 12px; }
  .sort { position: relative; }
  .sort-btn .ico-chev { color: var(--secondary-foreground); }
  .sort-btn[aria-expanded="true"] { background: var(--muted); color: var(--foreground); }
  .sort-btn[aria-disabled="true"] { cursor: progress; }
  .sort-pop { position: absolute; z-index: 7; top: calc(100% + 6px); right: 0; width: 280px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); padding: 6px; }
  .sort-group-t { margin: 6px 12px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); }
  .account-menu [role="menuitemradio"] { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); font: inherit; font-size: 14px; font-weight: 500; text-align: left; cursor: pointer; }
  .account-menu [role="menuitemradio"]:hover, .account-menu [role="menuitemradio"]:focus { background: var(--muted); }
  .account-menu [role="menuitemradio"]:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
  .account-menu [role="menuitemradio"] .radio-check { display: inline-flex; width: 18px; flex: none; color: var(--primary); }
  .account-menu [role="menuitemradio"][aria-checked="false"] .radio-check .ico { visibility: hidden; }
  .account-menu [role="menuitemradio"][aria-checked="true"] { font-weight: 600; }
  .sort-note { display: flex; gap: 8px; align-items: flex-start; margin: 6px 6px 2px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); font-size: 12.5px; color: var(--secondary-foreground); }
  .sort-note .ico { margin-top: 2px; color: var(--primary); }

  /* Columna ordenada: aria-sort + flecha (el texto del botón ya dice el orden; la flecha no es el único indicio) */
  .th-sort { display: inline-flex; align-items: center; gap: 4px; color: var(--secondary-foreground); }
  .th-sort .ico { color: var(--primary); }

` + E.CSS_CARGAR_MAS + `  .files + .alert { margin-top: 16px; }
  .files[aria-busy="true"] tbody { pointer-events: none; }

  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .list-tools { margin-top: 16px; }
    .sort { width: 100%; }
    .sort-btn { width: 100%; min-height: 44px; justify-content: space-between; }
    .sort-pop { left: 0; right: 0; width: auto; }
    .account-menu [role="menuitemradio"] { min-height: 44px; }
` + E.CSS_CARGAR_MAS_MQ600 + `  }
`;

// ---------- Datos de ejemplo (plan Personal: ningún archivo pasa de 50 MB) ----------
// Carpeta «Documentación» con 3 subcarpetas y 41 archivos. Página de ejemplo: 20 elementos (el tamaño de página lo
// fija el plan, RN-6). [tipo, nombre, tamaño, modificado, bytes para ordenar, días desde la creación (para ordenar)]
const RUTA = ['Mis archivos', 'Proyecto Alpha', 'Documentación'];
const CARPETAS = [
  ['carpeta', 'Anexos', '', '29 sep', 0, 20],
  ['carpeta', 'Borradores', '', 'hace 3 h', 0, 3],
  ['carpeta', 'Revisiones del asesor', '', '24 sep', 0, 30],
];
const ARCHIVOS = [
  ['Acta_reunion_01.docx', '84 KB', '14 ago', 0.084, 60],
  ['Acta_reunion_02.docx', '91 KB', '21 ago', 0.091, 55],
  ['Arquitectura_C4_contexto.png', '1.8 MB', '2 sep', 1.8, 40],
  ['Arquitectura_C4_contenedores.png', '2.3 MB', '2 sep', 2.3, 39],
  ['Bitacora_de_decisiones.md', '36 KB', 'ayer', 0.036, 30],
  ['Casos_de_uso_completos.pdf', '6.4 MB', '10 sep', 6.4, 35],
  ['Cronograma_fases.xlsx', '212 KB', '27 sep', 0.212, 25],
  ['Diagrama_clases_M2.pdf', '3.1 MB', '18 sep', 3.1, 20],
  ['Diagrama_ER_v4.pdf', '2.7 MB', '25 sep', 2.7, 18],
  ['Encuesta_usuarios_resultados.xlsx', '1.2 MB', '5 sep', 1.2, 33],
  ['Entrevista_cliente_audio.m4a', '38.6 MB', '28 ago', 38.6, 45],
  ['Glosario.docx', '58 KB', '9 sep', 0.058, 31],
  ['Guia_de_estilo_UI.pdf', '9.8 MB', '12 sep', 9.8, 27],
  ['Informe_avance_fase1.docx', '1.4 MB', '29 sep', 1.4, 14],
  ['Manual_de_usuario_borrador.docx', '4.2 MB', 'hoy · 08:40', 4.2, 2],
  ['Mockups_explorador.pdf', '14.5 MB', '20 sep', 14.5, 15],
  ['Presentacion_avance.pptx', '22.9 MB', '26 sep', 22.9, 12],
  ['Requisitos_funcionales.docx', '742 KB', '3 sep', 0.742, 38],
].map(([n, t, f, mb, c]) => ['archivo', n, t, f, mb, c]);
// Página 1 por fecha de creación descendente (orden inicial, RN-6 y D-6): carpetas y luego los primeros 17 archivos,
// de la más reciente a la más antigua. Las columnas muestran la fecha de modificación, que no sigue este orden.
const porCreacion = (a, b) => a[5] - b[5];
const PAG_CREACION = [...CARPETAS].sort(porCreacion).concat([...ARCHIVOS].sort(porCreacion).slice(0, 17));
const porNombre = (a, b) => a[1].localeCompare(b[1], 'es');
// Página 1 por tamaño descendente: las carpetas no tienen tamaño (RN-5) y van primero por nombre; luego archivos.
const PAG_TAMANO = [...CARPETAS].sort(porNombre).concat([...ARCHIVOS].sort((a, b) => b[4] - a[4]).slice(0, 17));

// ---------- Control de orden ----------
const CAMPOS = [['nombre', 'Nombre'], ['tamano', 'Tamaño'], ['fecha', 'Fecha de modificación'], ['creacion', 'Fecha de creación']];
const DIRS = {
  nombre: { asc: 'A–Z', desc: 'Z–A' },
  tamano: { asc: 'Menor primero', desc: 'Mayor primero' },
  fecha: { asc: 'Más antiguos primero', desc: 'Más recientes primero' },
  creacion: { asc: 'Más antiguos primero', desc: 'Más recientes primero' },
};
const etiqueta = ({ campo, dir }) => `${CAMPOS.find(([c]) => c === campo)[1]}, ${DIRS[campo][dir].toLowerCase().replace('a–z', 'A–Z').replace('z–a', 'Z–A')}`;

function radio(grupo, valor, texto, marcado) {
  return `<li role="none"><button role="menuitemradio" type="button" tabindex="-1" data-${grupo}="${valor}" aria-checked="${marcado}"><span class="radio-check">${icon('check', 16)}</span><span>${texto}</span></button></li>`;
}

// abierto: menú desplegado; ocupado: se pidió un orden nuevo y la lista visible se conserva (CA-12)
function controlOrden(orden, { abierto = false, ocupado = false } = {}) {
  const btn = ocupado
    ? `<button class="btn btn-outline btn-sm sort-btn" type="button" id="orden-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="orden-menu" aria-disabled="true">${icon('loader', 16, 'spin')}<span>Ordenando…</span></button>`
    : `<button class="btn btn-outline btn-sm sort-btn" type="button" id="orden-btn" aria-haspopup="menu" aria-expanded="${abierto}" aria-controls="orden-menu">${icon('arrowUpDown', 16)}<span>Ordenar: ${etiqueta(orden)}</span>${icon('chevron', 16, 'ico-chev')}</button>`;
  const campos = CAMPOS.map(([c, t]) => radio('campo', c, t, c === orden.campo)).join('');
  const dirs = ['asc', 'desc'].map((d) => radio('dir', d, DIRS[orden.campo][d], d === orden.dir)).join('');
  return `
        <div class="list-tools">
          <div class="sort">
            ${btn}
            <div class="sort-pop" id="orden-pop"${abierto ? '' : ' hidden'}>
              <ul class="account-menu" id="orden-menu" role="menu" aria-labelledby="orden-btn" aria-describedby="orden-nota">
                <li role="none"><p class="sort-group-t" id="g-campo">Ordenar por</p></li>
                <li role="none"><ul class="account-menu" role="group" aria-labelledby="g-campo">${campos}</ul></li>
                <li role="separator" class="account-sep"></li>
                <li role="none"><p class="sort-group-t" id="g-dir">Orden</p></li>
                <li role="none"><ul class="account-menu" role="group" aria-labelledby="g-dir">${dirs}</ul></li>
              </ul>
              <p class="sort-note" id="orden-nota">${icon('info', 14)}<span>Las carpetas siempre van primero. El tamaño ordena solo los archivos.</span></p>
            </div>
          </div>
        </div>${ocupado ? `
        <p class="sr-only" role="status">Ordenando por ${etiqueta(orden).toLowerCase()}…</p>` : ''}`;
}

// Teclado del menú de orden (menu button con menuitemradio): Enter, Espacio o ↓ abren; ↑ ↓ Inicio Fin recorren;
// Enter o Espacio marcan; Esc cierra y devuelve el foco. Al marcar, en la app se pide la primera página con el orden
// nuevo (la lista visible se conserva hasta que llega) y el orden queda en la URL (?orden=tamano&dir=desc).
const JS_ORDEN = `
(function () {
  var btn = document.getElementById('orden-btn'), pop = document.getElementById('orden-pop');
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
  var items = Array.prototype.slice.call(pop.querySelectorAll('[role="menuitemradio"]'));
  function abrir(i) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); items[(i + items.length) % items.length].focus(); }
  function cerrar(foco) { if (pop.hidden) return; pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (foco) btn.focus(); }
  function marcar(it) {
    var g = it.hasAttribute('data-campo') ? 'data-campo' : 'data-dir';
    items.forEach(function (x) { if (x.hasAttribute(g)) x.setAttribute('aria-checked', String(x === it)); });
  }
  btn.addEventListener('click', function () { if (pop.hidden) abrir(0); else cerrar(true); });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); abrir(0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); abrir(-1); }
  });
  pop.addEventListener('keydown', function (e) {
    var i = items.indexOf(document.activeElement), n = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % n].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + n) % n].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[n - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(true); }
    else if (e.key === 'Tab') { cerrar(false); }
  });
  items.forEach(function (it) { it.addEventListener('click', function () { marcar(it); cerrar(true); }); });
  document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) cerrar(false); });
  if (!pop.hidden) { var m = items.filter(function (x) { return x.getAttribute('aria-checked') === 'true'; })[0]; (m || items[0]).focus(); }
})();
`;

// ---------- «Cargar más» (cursor: no hay total; el botón desaparece cuando no hay nextCursor): mis-archivos/estados.js ----------
const TEXTOS_MAS = {
  anuncio: 'Cargando más elementos de Documentación…',
  error: { titulo: 'No pudimos cargar más elementos.', texto: 'Revisa tu conexión e inténtalo de nuevo. Lo que ya ves sigue aquí.' },
};
const cargarMas = (estado) => E.cargarMas(estado, TEXTOS_MAS);

// ---------- Página ----------
function page(v) {
  const file = `explorador--${v.estado}.html`;
  return C.conLogo(`${M.cabecera({
    titulo: `Mis archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 007: orden y paginación del explorador). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/explorador/generar-orden.js (marco, carpetas, estados y espacio). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">007</span> <strong>Explorador · orden y «Cargar más»</strong> <span class="file">${file}</span> <span>plan Personal (ejemplo) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${Q.sidebar({ activo: '', q: Q.CUOTAS.ok })}
    <div class="main">
      ${M.topbar({ crumbs: RUTA })}
      <main class="content" id="contenido">${C.encabezado(RUTA)}${controlOrden(v.orden, v.control || {})}${v.cuerpo()}
      </main>
    </div>
  </div>
</div>

<script>${JS_ORDEN}${E.JS_MENU}</script>
</body>
</html>
`);
}

const CREACION = { campo: 'creacion', dir: 'desc' };
const TAMANO = { campo: 'tamano', dir: 'desc' };
const lista = (nodos, orden, ocupado = false) => C.tabla(nodos, 'Documentación', -1, { orden })
  .replace('<div class="files">', ocupado ? '<div class="files" aria-busy="true">' : '<div class="files">');

const ESTADOS = [
  {
    estado: 'orden-menu', titulo: 'menú «Ordenar» abierto: nombre, tamaño, fecha de modificación o de creación; ascendente o descendente',
    orden: CREACION, control: { abierto: true },
    cuerpo: () => lista(PAG_CREACION, CREACION) + cargarMas(),
  },
  {
    estado: 'ordenando', titulo: 'se pidió otro orden: la lista visible se conserva mientras llega (CA-12)',
    orden: TAMANO, control: { ocupado: true },
    cuerpo: () => lista(PAG_CREACION, CREACION, true) + cargarMas(),
  },
  {
    estado: 'ordenado', titulo: 'ordenado por tamaño, mayor primero: carpetas primero y luego archivos',
    orden: TAMANO,
    cuerpo: () => lista(PAG_TAMANO, TAMANO) + cargarMas(),
  },
  {
    estado: 'mas-paginas', titulo: 'primera página (orden inicial: fecha de creación, más recientes primero) con «Cargar más»',
    orden: CREACION,
    cuerpo: () => lista(PAG_CREACION, CREACION) + cargarMas(),
  },
  {
    estado: 'cargando-mas', titulo: '«Cargar más» en curso: la lista visible se conserva',
    orden: CREACION,
    cuerpo: () => lista(PAG_CREACION, CREACION) + cargarMas('cargando'),
  },
  {
    estado: 'cargar-mas-error', titulo: 'falló la página siguiente: aviso con «Reintentar» debajo de la lista',
    orden: CREACION,
    cuerpo: () => lista(PAG_CREACION, CREACION) + cargarMas('error'),
  },
];

for (const v of ESTADOS) {
  const file = `explorador--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
