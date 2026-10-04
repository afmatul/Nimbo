// Genera los estados de la spec 006 en storage/explorador: Mis archivos con carpetas (migas, crear, renombrar,
// mover a…, mover a la papelera, subir a la carpeta abierta) y, desde la revisión de Adrián del 2026-10-03, el desglose de
// carpetas en la lista (CA-26) y «Fijar en la barra lateral» con el tope de fijados (CA-27, CA-28): ver desglose.js.
// Uso: node generar-carpetas.js <ruta-del-worktree>
// Los estados de 005 siguen saliendo de generar.js y no cambian. Marco: marco/marco.js; tabla, cuota y estados comunes:
// mis-archivos/; piezas de 006 (logo, barra lateral con «Carpetas», toast, diálogos): carpetas/carpetas.js.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const A = require('../accesos/accesos.js');
const D = require('./desglose.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/explorador');
fs.mkdirSync(OUT, { recursive: true });

const { icon } = C;
const MAX = S.MAX_POR_ARCHIVO.replace(' ', '&nbsp;');

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de storage/explorador (spec 005) */
` + S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + `
  .crumb-more { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; min-height: 28px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--secondary-foreground); font: inherit; cursor: pointer; }
  .crumb-more:hover { background: var(--muted); color: var(--foreground); }
  .state-empty .btn-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 20px; }
  .state-empty .btn-row .btn { margin-top: 0; }
  .state-empty h1.state-title { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 600; }

  /* «Mover a…»: «Nueva carpeta» en el pie y campo en línea dentro del árbol */
  .dialog-actions-move .btn-new-folder { margin-right: auto; }
  .tree [aria-level="4"][aria-selected="true"] > .tree-row { padding-left: 73px; }
  .tree [aria-level="5"] > .tree-row { padding-left: 98px; }
  .tree [aria-level="5"][aria-selected="true"] > .tree-row { padding-left: 95px; }
  .tree-row-new { align-items: flex-start; cursor: default; }
  .tree-row-new:hover { background: transparent; }
  .tree-row-new > .ico { margin-top: 11px; color: var(--primary); }
  .tree-field { flex: 1; min-width: 0; }
  .tree-input { display: flex; align-items: center; gap: 4px; }
  .tree-input input { flex: 1; min-width: 0; min-height: 40px; padding: 8px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .tree-input input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .tree-input input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .tree-btn { width: 40px; height: 40px; flex: none; color: var(--secondary-foreground); }
  .tree-btn-ok { color: var(--primary); }
  .tree-btn:hover { background: var(--muted); color: var(--foreground); }
  .tree-help { margin: 4px 0 0 !important; font-size: 12.5px !important; color: var(--secondary-foreground) !important; }
  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .state-empty .btn-row { width: 100%; flex-direction: column; }
    .dialog-actions-move .btn-new-folder { margin-right: 0; }
    .tree .tree-new[aria-level] > .tree-row { padding-left: 10px; }
    .tree-new .tw { display: none; }
    .tree-row-new > .ico { margin-top: 13px; }
    .tree-input input { min-height: 44px; font-size: 16px; }
    .tree-btn { width: 44px; height: 44px; }
  }
`;

// ---------- Datos de ejemplo ----------
// [tipo, nombre, tamaño (las carpetas no tienen), modificado]
const RAIZ = [
  ['carpeta', 'Proyecto Alpha', '', 'hace 1 h'],
  ['carpeta', 'Documentos Legales', '', '18 sep'],
  ['carpeta', 'Finanzas', '', 'ayer'],
  ...S.RAIZ.map(([n, t, f]) => ['archivo', n, t, f]),
];
const FASE3 = [
  ['carpeta', 'Prompts', '', 'hace 1 h'],
  ['carpeta', 'Pruebas de recuperación', '', 'ayer'],
  ['archivo', 'Informe_avance_RAG.docx', '1.2 MB', 'hace 20 min'],
  ['archivo', 'Resultados_evaluacion.xlsx', '312 KB', 'hoy · 08:05'],
  ['archivo', 'Casos_de_uso_RF25-33.docx', '640 KB', '25 sep'],
  ['archivo', 'Benchmark_pgvector.pdf', '4.9 MB', '22 sep'],
];
const PROFUNDA = [
  ['archivo', 'Respuestas_revisadas.docx', '96 KB', 'hace 3 h'],
  ['archivo', 'Observaciones_tribunal.pdf', '1.4 MB', 'ayer'],
];
const RUTA_FASE3 = ['Mis archivos', 'Proyecto Alpha', 'Fase 3 · RAG'];

// ---------- Piezas ----------
const mi = C.itemMenu;
// «Mover a la papelera» no va en rojo: es reversible y no pide confirmación; el rojo queda para lo definitivo.
const MENU_ARCHIVO = [mi('download', 'Descargar'), mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), 'sep', mi('trash', 'Mover a la papelera')];
const MENU_CARPETA = [mi('pencil', 'Renombrar'), mi('folderInput', 'Mover a…'), 'sep', mi('trash', 'Mover a la papelera')];

function fila([tipo, nombre, tam, fecha], i, menuAbierto) {
  const carpeta = tipo === 'carpeta';
  const tile = carpeta ? `<span class="ftile ftile-folder">${icon('folder', 16)}</span>` : S.tile(nombre);
  const texto = carpeta ? `<a class="fname-link" href="#">${nombre}</a>` : nombre;
  return `
            <tr>
              <td><div class="fname">${tile}<div class="fname-text">${texto}<span class="fmeta-m">${carpeta ? 'Carpeta' : tam} · ${fecha}</span></div></div></td>
              <td class="c-size">${carpeta ? '<span aria-hidden="true">—</span><span class="sr-only">Carpeta, sin tamaño</span>' : tam}</td>
              <td class="c-date">${fecha}</td>
              <td class="c-act">${S.menuFila(i, nombre, i === menuAbierto, carpeta ? MENU_CARPETA : MENU_ARCHIVO)}</td>
            </tr>`;
}

function tabla(nodos, lugar, menuAbierto = -1) {
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Carpetas y archivos en ${lugar}</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-date">Modificado</th><th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${nodos.map((n, i) => fila(n, i, menuAbierto)).join('')}
            </tbody>
          </table>
        </div>`;
}

const botonNuevaCarpeta = () => `<button class="btn btn-outline" type="button">${icon('folderPlus', 16)}<span>Nueva carpeta</span></button>`;

// ruta: [Mis archivos, …, carpeta abierta]. En móvil (sin migas en la barra superior) se ve «‹ {carpeta anterior}»
// con el nombre real («‹ Mis archivos» en el primer nivel) y el nombre accesible «Volver a {nombre}».
function encabezado(ruta) {
  const actual = ruta[ruta.length - 1];
  const anterior = ruta[ruta.length - 2];
  const volver = anterior ? `
        <a class="back-link" href="#" aria-label="Volver a ${anterior}">${icon('chevronLeft', 18)}<span>${anterior}</span></a>` : '';
  return `${volver}
        <div class="page-head">
          <div>
            <h1>${actual}</h1>
          </div>
          <div class="head-actions">${botonNuevaCarpeta()}${S.botonSubir()}</div>
        </div>`;
}

function carpetaVacia() {
  return `
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('folderOpen', 40)}
          <h2 id="vacio-t">Esta carpeta está vacía</h2>
          <p><span class="solo-escritorio">Sube documentos con el botón o arrástralos aquí, o crea una subcarpeta.</span><span class="solo-tactil">Sube documentos desde tu dispositivo o crea una subcarpeta.</span> Tu plan permite hasta ${MAX} por archivo.</p>
          ${S.botonSubir()}
        </section>`;
}

function noEncontrada() {
  return `
        <section class="state-empty" aria-labelledby="nf-t">
          ${icon('folderX', 40)}
          <h1 id="nf-t" class="state-title">No encontramos esta carpeta</h1>
          <p>Puede que la hayas movido a la papelera o que el enlace ya no sea válido.</p>
          <div class="btn-row">
            <a class="btn btn-primary" href="#">${icon('folder', 16)}<span>Ir a Mis archivos</span></a>
            <a class="btn btn-outline" href="#">${icon('trash', 16)}<span>Ver papelera</span></a>
          </div>
        </section>`;
}

// ---------- Diálogo «Mover a…» con el árbol de carpetas ----------
// Nodo: [nombre, { nivel, abierto, sel, off, nota, hijos, raiz, nueva }]. `nueva` abre el campo «Nueva carpeta» en
// línea como primer hijo del nodo (el destino elegido): { valor, error }.
function nodo([nombre, o]) {
  const expandible = o.hijos !== undefined;
  const attrs = [
    'role="treeitem"', `aria-level="${o.nivel}"`, `aria-selected="${!!o.sel}"`,
    expandible ? `aria-expanded="${!!o.abierto}"` : '',
    o.off ? 'aria-disabled="true"' : '',
    `tabindex="${o.sel ? 0 : -1}"`,
  ].filter(Boolean).join(' ');
  const campo = o.nueva ? campoNueva({ nivel: o.nivel + 1, padre: nombre, ...o.nueva }) : '';
  const hijos = expandible && o.abierto && (o.hijos.length || campo) ? `<ul role="group">${campo}${o.hijos.map(nodo).join('')}</ul>` : '';
  return `
          <li ${attrs}><span class="tree-row"><span class="tw">${expandible ? icon('chevronRight', 16) : ''}</span>${icon(o.raiz ? 'house' : 'folder', 18)}<span class="tree-name">${nombre}</span>${o.nota ? `<span class="tree-note">${o.nota}</span>` : ''}<span class="tree-check">${icon('check', 16)}</span></span>${hijos}</li>`;
}

// Campo en línea para crear una carpeta dentro del destino elegido. Mismas validaciones y textos que el diálogo
// «Nueva carpeta» (400, 409, 422); el error va debajo del campo con role="alert". Enter crea; Esc cancela.
function campoNueva({ nivel, padre, valor = '', error = '' }) {
  const describedby = ['nueva-ayuda', error ? 'nueva-error' : ''].filter(Boolean).join(' ');
  return `
          <li role="treeitem" aria-level="${nivel}" aria-selected="false" tabindex="-1" class="tree-new" aria-label="Nueva carpeta en ${padre}"><div class="tree-row tree-row-new"><span class="tw"></span>${icon('folderPlus', 18)}<div class="tree-field">
            <div class="tree-input">
              <label class="sr-only" for="nueva-nombre">Nombre de la nueva carpeta</label>
              <input id="nueva-nombre" type="text" autocomplete="off" maxlength="255" value="${valor}" autofocus aria-describedby="${describedby}"${error ? ' aria-invalid="true"' : ''}>
              <button class="icon-btn tree-btn tree-btn-ok" type="button" aria-label="Crear carpeta">${icon('check', 18)}</button>
              <button class="icon-btn tree-btn tree-btn-no" type="button" aria-label="Cancelar la nueva carpeta">${icon('x', 18)}</button>
            </div>
            <p class="tree-help" id="nueva-ayuda">Se creará en ${padre}.</p>${error ? `
            <p class="field-error" id="nueva-error" role="alert">${icon('alert', 15)}<span>${error}</span></p>` : ''}
          </div></div></li>`;
}

function dialogoMover({ titulo, arbol, destino, hint = '', alerta = '' }) {
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog dialog-form dialog-move" role="dialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">${titulo}</h2>
    <p id="dlg-d">Elige la carpeta de destino.</p>${hint ? `
    <p class="dlg-hint">${icon('info', 16)}<span>${hint}</span></p>` : ''}
    <ul class="tree" role="tree" aria-label="Carpetas de destino">${arbol.map(nodo).join('')}
    </ul>
    <p class="dialog-note" aria-live="polite">Se moverá a <strong>${destino}</strong>.</p>${alerta ? C.alertaDialogo(alerta) : ''}
    <div class="dialog-actions dialog-actions-move">
      <button class="btn btn-outline btn-new-folder" type="button">${icon('folderPlus', 16)}<span>Nueva carpeta</span></button>
      <button class="btn btn-outline" type="button">Cancelar</button>
      <button class="btn btn-primary" type="button">Mover aquí</button>
    </div>
  </div>`;
}

const cerrada = (n, nivel, extra = {}) => [n, { nivel, hijos: [], ...extra }];
const hoja = (n, nivel, extra = {}) => [n, { nivel, ...extra }];
// Árbol para mover un archivo de Fase 3 · RAG (ubicación actual deshabilitada). `nueva`: { en, valor, error } abre el
// campo «Nueva carpeta» dentro de la carpeta `en`, que es el destino elegido.
function arbolArchivo(sel, nueva = null) {
  const o = (n, extra = {}) => ({ sel: sel === n, ...extra, ...(nueva && nueva.en === n ? { abierto: true, nueva } : {}) });
  return [['Mis archivos', { nivel: 1, raiz: true, ...o('Mis archivos', { abierto: true }), hijos: [
    ['Proyecto Alpha', { nivel: 2, ...o('Proyecto Alpha', { abierto: true }), hijos: [
      hoja('Actas', 3, o('Actas')),
      cerrada('Documentación', 3, o('Documentación')),
      cerrada('Fase 0 · Requisitos', 3),
      cerrada('Fase 3 · RAG', 3, { off: true, nota: 'Ubicación actual' }),
    ] }],
    cerrada('Documentos Legales', 2),
    cerrada('Finanzas', 2),
  ] }]];
}
// Árbol para mover la carpeta Fase 3 · RAG: ella y sus descendientes quedan deshabilitados
function arbolCarpeta() {
  return [['Mis archivos', { nivel: 1, raiz: true, abierto: true, sel: true, hijos: [
    ['Proyecto Alpha', { nivel: 2, abierto: true, off: true, nota: 'Ubicación actual', hijos: [
      hoja('Actas', 3),
      cerrada('Documentación', 3),
      cerrada('Fase 0 · Requisitos', 3),
      ['Fase 3 · RAG', { nivel: 3, abierto: true, off: true, nota: 'Carpeta que mueves', hijos: [
        hoja('Prompts', 4, { off: true, nota: 'Dentro de la carpeta' }),
        cerrada('Pruebas de recuperación', 4, { off: true, nota: 'Dentro de la carpeta' }),
      ] }],
    ] }],
    cerrada('Documentos Legales', 2),
    cerrada('Finanzas', 2),
  ] }]];
}

// Teclado del árbol (WAI-ARIA tree, selección única): flechas arriba y abajo recorren los visibles; derecha abre o
// entra; izquierda cierra o sube; Inicio y Fin; Enter o Espacio eligen (si no está deshabilitado). También con clic.
// «Nueva carpeta» (pie del diálogo) abre un campo en línea dentro del destino elegido; Enter o ✓ crean (mismas
// validaciones y textos que el diálogo «Nueva carpeta»), Esc o ✕ cancelan. La carpeta creada queda elegida.
// El campo se alcanza con Tab (no entra en el recorrido con flechas para que las flechas sigan sirviendo al texto).
const T_CAMPO = JSON.stringify(campoNueva({ nivel: '__NIVEL__', padre: '__PADRE__' }));
const T_NODO = JSON.stringify(nodo(['__NOMBRE__', { nivel: '__NIVEL__' }]));
const ICO_ERROR = JSON.stringify(icon('alert', 15));
const JS_ARBOL = `
(function () {
  var tree = document.querySelector('[role="tree"]');
  if (!tree) return;
  var MAX = ${C.MAX_NIVELES}, T_CAMPO = ${T_CAMPO}, T_NODO = ${T_NODO}, ICO_ERROR = ${ICO_ERROR};
  var nota = document.querySelector('.dialog-note strong');
  var nuevaBtn = document.querySelector('.btn-new-folder');
  function nombre(n) { return n.querySelector(':scope > .tree-row > .tree-name').textContent; }
  function visibles() { return Array.prototype.slice.call(tree.querySelectorAll('[role="treeitem"]:not(.tree-new)')).filter(function (n) { return n.offsetParent !== null; }); }
  function mover(n) { visibles().forEach(function (v) { v.tabIndex = -1; }); n.tabIndex = 0; n.focus(); }
  function ruta(n) { var p = []; while (n && n.getAttribute && n.getAttribute('role') === 'treeitem') { p.unshift(nombre(n)); n = n.parentElement.closest('[role="treeitem"]'); } return p.length > 1 ? p.slice(1).join(' / ') : p[0]; }
  function elegido() { return tree.querySelector('[aria-selected="true"]'); }
  function elegir(n) {
    if (n.getAttribute('aria-disabled') === 'true' || n.classList.contains('tree-new')) return;
    tree.querySelectorAll('[aria-selected="true"]').forEach(function (s) { s.setAttribute('aria-selected', 'false'); });
    n.setAttribute('aria-selected', 'true'); if (nota) nota.textContent = ruta(n);
  }
  function html(t) { var d = document.createElement('template'); d.innerHTML = t.trim(); return d.content.firstElementChild; }

  // ----- Nueva carpeta en línea -----
  function campo() { return tree.querySelector('.tree-new'); }
  function abrir() {
    var c = campo();
    if (c) { c.querySelector('input').focus(); return; }
    var padre = elegido(); if (!padre) return;
    var g = padre.querySelector(':scope > [role="group"]');
    if (!g) { g = document.createElement('ul'); g.setAttribute('role', 'group'); padre.appendChild(g); }
    padre.setAttribute('aria-expanded', 'true');
    var li = html(T_CAMPO.replace('__NIVEL__', +padre.getAttribute('aria-level') + 1).split('__PADRE__').join(nombre(padre)));
    g.insertBefore(li, g.firstChild);
    li.querySelector('input').focus();
  }
  function cerrar(c) { var padre = c.parentElement.closest('[role="treeitem"]'); c.remove(); if (padre) mover(padre); }
  function error(c, texto) {
    var input = c.querySelector('input'), p = c.querySelector('#nueva-error');
    if (!texto) { if (p) p.remove(); input.removeAttribute('aria-invalid'); input.setAttribute('aria-describedby', 'nueva-ayuda'); return; }
    if (!p) { p = document.createElement('p'); p.className = 'field-error'; p.id = 'nueva-error'; p.setAttribute('role', 'alert'); c.querySelector('.tree-field').appendChild(p); }
    p.innerHTML = ICO_ERROR + '<span></span>'; p.querySelector('span').textContent = texto;
    input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'nueva-ayuda nueva-error');
    input.focus();
  }
  function validar(c, valor) {
    var padre = c.parentElement.closest('[role="treeitem"]');
    if (!valor) return 'Escribe un nombre para la carpeta.';
    if (valor.length > 255) return 'El nombre puede tener hasta 255 caracteres.';
    if (valor.indexOf('/') >= 0 || valor.indexOf(String.fromCharCode(92)) >= 0) return 'El nombre no puede contener «/» ni «' + String.fromCharCode(92) + '». Quítalos o usa un guion.';
    var hermanas = Array.prototype.slice.call(c.parentElement.children).filter(function (h) { return h !== c; });
    for (var i = 0; i < hermanas.length; i++) { var h = nombre(hermanas[i]); if (h.toLowerCase() === valor.toLowerCase()) return 'Ya existe una carpeta llamada «' + h + '» aquí. Elige otro nombre.'; }
    if (+padre.getAttribute('aria-level') > MAX) return 'Llegaste al máximo de ' + MAX + ' niveles de carpetas. Crea la carpeta en otro lugar.';
    return '';
  }
  function crear(c) {
    var valor = c.querySelector('input').value.trim(), e = validar(c, valor);
    if (e) { error(c, e); return; }
    var li = html(T_NODO.replace('__NIVEL__', c.getAttribute('aria-level')));
    li.querySelector('.tree-name').textContent = valor;
    c.replaceWith(li); elegir(li); mover(li);
  }
  if (nuevaBtn) nuevaBtn.addEventListener('click', abrir);
  tree.addEventListener('keydown', function (e) {
    var c = e.target.closest('.tree-new');
    if (c) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); crear(c); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(c); }
      return;
    }
    var v = visibles(), n = document.activeElement, i = v.indexOf(n);
    if (i < 0) return;
    if (e.key === 'ArrowDown' && i < v.length - 1) { e.preventDefault(); mover(v[i + 1]); }
    else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); mover(v[i - 1]); }
    else if (e.key === 'Home') { e.preventDefault(); mover(v[0]); }
    else if (e.key === 'End') { e.preventDefault(); mover(v[v.length - 1]); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); var p = n.parentElement.closest('[role="treeitem"]'); if (n.getAttribute('aria-expanded') === 'true') n.setAttribute('aria-expanded', 'false'); else if (p) mover(p); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (n.getAttribute('aria-expanded') === 'false') n.setAttribute('aria-expanded', 'true'); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(n); }
  });
  tree.addEventListener('input', function (e) { var c = e.target.closest('.tree-new'); if (c) error(c, ''); });
  tree.addEventListener('click', function (e) {
    var c = e.target.closest('.tree-new');
    if (c) { if (e.target.closest('.tree-btn-ok')) crear(c); else if (e.target.closest('.tree-btn-no')) cerrar(c); return; }
    var n = e.target.closest('[role="treeitem"]'); if (n) { mover(n); elegir(n); }
  });
})();
`;
const CSS_ARBOL_CERRADO = '  .tree [aria-expanded="false"] > [role="group"] { display: none; }\n';

// ---------- Página ----------
function page(v) {
  const file = `explorador--${v.estado}.html`;
  let crumbs = M.topbar({ crumbs: v.crumbs || v.ruta });
  if (v.crumbsOcultas) crumbs = crumbs.replace('<li><a href="#">…</a></li>', `<li><button class="crumb-more" type="button" aria-label="Mostrar ${v.crumbsOcultas} carpetas intermedias">…</button></li>`);
  const capa = v.dialogo || '';
  return C.conLogo(`${M.cabecera({
    titulo: `Mis archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 006: carpetas y papelera). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/explorador/generar-carpetas.js (marco, mis-archivos y carpetas). No editar a mano.',
    ],
    css: CSS + (v.dialogo ? CSS_ARBOL_CERRADO : '') + (v.nuevo ? A.CSS + D.CSS : ''),
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">006</span> <strong>Explorador · Mis archivos con carpetas</strong> <span class="file">${file}</span> <span>plan Equipo · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${C.sidebar({ papelera: v.papelera || '6', accesos: v.nuevo ? (v.accesos || ACCESOS) : '' })}
    <div class="main">
      ${crumbs}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>${capa}${v.toast || ''}
</div>
${v.js ? `
<script>${v.js}${v.nuevo ? A.JS_QUITAR : ''}</script>
` : ''}
</body>
</html>
`);
}

// ---------- Desglose de carpetas y accesos rápidos (CA-26 a CA-28) ----------
// Los estados anteriores conservan la barra lateral con «Carpetas» y las filas sin control de desglose; los nuevos
// (`nuevo: true`) llevan «Accesos rápidos» y el control de desglose en cada carpeta.
const ACCESOS = A.seccion({
  fijados: [['carpeta', 'Proyecto Alpha'], ['archivo', 'Propuesta_Nimbo_v3.docx'], ['carpeta', 'Finanzas']],
  recientes: A.RECIENTES, verMas: true, // la barra dibuja los 3 primeros y «Ver más» (P-15)
}, 'barra');
const ACCESOS_TOPE = A.seccion({ fijados: A.FIJADOS_5, recientes: A.RECIENTES, verMas: true }, 'barra');
const carp = (nombre, fecha, extra = {}) => ({ tipo: 'carpeta', nombre, tam: '', fecha, ...extra });
const arch = (nombre, tam, fecha, extra = {}) => ({ tipo: 'archivo', nombre, tam, fecha, ...extra });
// Raíz con «Proyecto Alpha» desglosada en dos niveles. `sobre` cambia nodos por nombre (estado, abierto…).
function raizDesglosada(sobre = {}) {
  const n = (nombre, base) => ({ ...base, ...(sobre[nombre] || {}) });
  const rag = n('Fase 3 · RAG', carp('Fase 3 · RAG', 'hace 20 min', { abierto: true, hijos: [
    n('Prompts', carp('Prompts', 'hace 1 h')),
    n('Informe_avance_RAG.docx', arch('Informe_avance_RAG.docx', '1.2 MB', 'hace 20 min')),
    n('Benchmark_pgvector.pdf', arch('Benchmark_pgvector.pdf', '4.9 MB', '22 sep')),
  ] }));
  const alpha = n('Proyecto Alpha', carp('Proyecto Alpha', 'hace 1 h', { fijado: true, abierto: true, hijos: [
    n('Actas', carp('Actas', '2 ago')), n('Documentación', carp('Documentación', '27 sep')), rag,
    n('Plan_de_trabajo.docx', arch('Plan_de_trabajo.docx', '210 KB', '30 sep')),
  ] }));
  return [alpha, n('Documentos Legales', carp('Documentos Legales', '18 sep')), n('Finanzas', carp('Finanzas', 'ayer', { fijado: true })),
    ...S.RAIZ.map(([nombre, tam, fecha]) => n(nombre, arch(nombre, tam, fecha, { fijado: nombre === 'Propuesta_Nimbo_v3.docx' })))];
}
const desglosada = (sobre, opciones) => () => encabezado(['Mis archivos']) + D.tabla(raizDesglosada(sobre), opciones);

// ---------- Estados ----------
const enFase3 = (cuerpo, nodos = FASE3) => () => encabezado(RUTA_FASE3) + cuerpo(nodos);
const listaFase3 = (nodos) => tabla(nodos, 'Fase 3 · RAG');
const sinArchivo = (n) => FASE3.filter((x) => x[1] !== n);
const RUTA_PROFUNDA = ['Mis archivos', 'Proyecto Alpha', 'Fase 3 · RAG', 'Pruebas de recuperación', 'Lote septiembre', 'Consultas', 'Por módulo', 'Storage', 'Casos límite', 'Respuestas', 'Revisión final'];

const ESTADOS = [
  {
    estado: 'raiz-carpetas', titulo: 'raíz con carpetas primero y luego archivos',
    ruta: ['Mis archivos'],
    cuerpo: () => encabezado(['Mis archivos']) + tabla(RAIZ, 'Mis archivos'),
  },
  {
    estado: 'carpeta', titulo: 'carpeta abierta con migas, subcarpetas y archivos',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
  },
  {
    estado: 'carpeta-vacia', titulo: 'carpeta sin contenido: invitación a subir o crear una subcarpeta',
    ruta: ['Mis archivos', 'Proyecto Alpha', 'Actas'],
    cuerpo: () => encabezado(['Mis archivos', 'Proyecto Alpha', 'Actas']) + carpetaVacia(),
  },
  {
    estado: 'carpeta-cargando', titulo: 'esqueleto mientras llega el contenido de la carpeta',
    ruta: RUTA_FASE3,
    cuerpo: () => encabezado(RUTA_FASE3) + E.esqueleto('Cargando el contenido de Fase 3 · RAG…'),
  },
  {
    estado: 'carpeta-error', titulo: 'falló el listado de la carpeta: error con «Reintentar»',
    ruta: RUTA_FASE3,
    cuerpo: () => encabezado(RUTA_FASE3) + E.errorEstado('No pudimos abrir esta carpeta.', 'Tus archivos siguen guardados. Inténtalo de nuevo.'),
  },
  {
    estado: 'carpeta-no-encontrada', titulo: 'carpeta inexistente, ajena o en la papelera (404)',
    ruta: ['Mis archivos'],
    cuerpo: noEncontrada,
  },
  {
    estado: 'carpeta-arrastre', titulo: 'archivos arrastrados sobre la carpeta abierta: se suben a ella',
    ruta: RUTA_FASE3,
    cuerpo: () => enFase3(listaFase3)() + E.arrastre('Fase 3 · RAG', MAX),
  },
  {
    estado: 'acciones-archivo', titulo: 'menú ⋮ de un archivo: descargar, renombrar, mover a… y mover a la papelera',
    ruta: RUTA_FASE3, js: E.JS_MENU,
    cuerpo: enFase3((n) => tabla(n, 'Fase 3 · RAG', 2)),
  },
  {
    estado: 'acciones-carpeta', titulo: 'menú ⋮ de una carpeta: renombrar, mover a… y mover a la papelera',
    ruta: RUTA_FASE3, js: E.JS_MENU,
    cuerpo: enFase3((n) => tabla(n, 'Fase 3 · RAG', 1)),
  },
  {
    estado: 'nueva-carpeta', titulo: 'diálogo «Nueva carpeta» en la carpeta abierta',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
    dialogo: C.dialogoNombre({ titulo: 'Nueva carpeta', descripcion: 'Se creará en <strong>Fase 3 · RAG</strong>.', etiqueta: 'Nombre de la carpeta', valor: 'Resultados finales', confirmar: 'Crear carpeta' }),
  },
  {
    estado: 'nombre-invalido', titulo: 'nombre con separador de ruta: error en el campo (400)',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
    dialogo: C.dialogoNombre({ titulo: 'Nueva carpeta', descripcion: 'Se creará en <strong>Fase 3 · RAG</strong>.', etiqueta: 'Nombre de la carpeta', valor: 'Resultados/finales', error: 'El nombre no puede contener «/» ni «\\». Quítalos o usa un guion.', confirmar: 'Crear carpeta' }),
  },
  {
    estado: 'nombre-repetido-carpeta', titulo: 'ya existe una carpeta con ese nombre aquí: error en el campo (409)',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
    dialogo: C.dialogoNombre({ titulo: 'Nueva carpeta', descripcion: 'Se creará en <strong>Fase 3 · RAG</strong>.', etiqueta: 'Nombre de la carpeta', valor: 'prompts', error: 'Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.', confirmar: 'Crear carpeta' }),
  },
  {
    estado: 'limite-niveles', titulo: `carpeta en el nivel ${C.MAX_NIVELES}: no se pueden crear más niveles (422)`,
    ruta: RUTA_PROFUNDA, crumbs: ['Mis archivos', '…', 'Respuestas', 'Revisión final'], crumbsOcultas: 8,
    cuerpo: () => encabezado(RUTA_PROFUNDA) + tabla(PROFUNDA, 'Revisión final'),
    dialogo: C.dialogoNombre({ titulo: 'Nueva carpeta', descripcion: 'Se creará en <strong>Revisión final</strong>.', etiqueta: 'Nombre de la carpeta', valor: 'Anexos', alerta: `Llegaste al máximo de ${C.MAX_NIVELES} niveles de carpetas. Crea la carpeta en otro lugar.`, confirmar: 'Crear carpeta' }),
  },
  {
    estado: 'renombrar', titulo: 'renombrar un archivo: la extensión se conserva',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
    dialogo: C.dialogoNombre({ titulo: 'Renombrar archivo', descripcion: 'Cambia el nombre de <strong>Informe_avance_RAG.docx</strong>.', etiqueta: 'Nombre', valor: 'Informe_avance_RAG_septiembre', sufijo: '.docx', confirmar: 'Guardar nombre' }),
  },
  {
    estado: 'renombrar-repetido', titulo: 'renombrar una carpeta con un nombre que ya existe: error en el campo (409)',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3),
    dialogo: C.dialogoNombre({ titulo: 'Renombrar carpeta', descripcion: 'Cambia el nombre de <strong>Pruebas de recuperación</strong>.', etiqueta: 'Nombre', valor: 'Prompts', error: 'Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.', confirmar: 'Guardar nombre' }),
  },
  {
    estado: 'mover', titulo: '«Mover a…» un archivo: árbol de carpetas con la ubicación actual deshabilitada',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3), js: JS_ARBOL,
    dialogo: dialogoMover({ titulo: 'Mover «Informe_avance_RAG.docx»', arbol: arbolArchivo('Documentación'), destino: 'Proyecto Alpha / Documentación' }),
  },
  {
    estado: 'mover-carpeta', titulo: '«Mover a…» una carpeta: ella y sus subcarpetas no se pueden elegir',
    ruta: ['Mis archivos', 'Proyecto Alpha'], js: JS_ARBOL,
    cuerpo: () => encabezado(['Mis archivos', 'Proyecto Alpha']) + tabla([
      ['carpeta', 'Actas', '', '2 ago'], ['carpeta', 'Documentación', '', '27 sep'],
      ['carpeta', 'Fase 0 · Requisitos', '', '12 sep'], ['carpeta', 'Fase 3 · RAG', '', 'hace 20 min'],
    ], 'Proyecto Alpha'),
    dialogo: dialogoMover({ titulo: 'Mover la carpeta «Fase 3 · RAG»', arbol: arbolCarpeta(), destino: 'Mis archivos', hint: 'No puedes mover una carpeta dentro de sí misma ni de sus subcarpetas.' }),
  },
  {
    estado: 'mover-conflicto', titulo: 'el destino ya tiene una carpeta con ese nombre (409)',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3), js: JS_ARBOL,
    dialogo: dialogoMover({ titulo: 'Mover la carpeta «Prompts»', arbol: arbolArchivo('Documentación'), destino: 'Proyecto Alpha / Documentación', alerta: 'Ya existe una carpeta llamada «Prompts» en Documentación. Elige otro destino o cambia el nombre de la carpeta.' }),
  },
  {
    estado: 'mover-nueva-carpeta', titulo: '«Nueva carpeta» desde «Mover a…»: campo en línea dentro del destino elegido',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3), js: JS_ARBOL,
    dialogo: dialogoMover({ titulo: 'Mover «Informe_avance_RAG.docx»', arbol: arbolArchivo('Documentación', { en: 'Documentación', valor: 'Entregables finales' }), destino: 'Proyecto Alpha / Documentación' }),
  },
  {
    estado: 'mover-nueva-carpeta-error', titulo: 'la carpeta nueva del árbol repite un nombre: error en el campo (409)',
    ruta: RUTA_FASE3, cuerpo: enFase3(listaFase3), js: JS_ARBOL,
    dialogo: dialogoMover({ titulo: 'Mover «Informe_avance_RAG.docx»', arbol: arbolArchivo('Proyecto Alpha', { en: 'Proyecto Alpha', valor: 'actas', error: 'Ya existe una carpeta llamada «Actas» aquí. Elige otro nombre.' }), destino: 'Proyecto Alpha' }),
  },
  {
    estado: 'eliminado', titulo: 'se movió a la papelera sin confirmar: aviso con «Ver papelera»',
    ruta: RUTA_FASE3, papelera: '7',
    cuerpo: enFase3(listaFase3, sinArchivo('Resultados_evaluacion.xlsx')),
    toast: C.toast({ texto: 'Movimos «Resultados_evaluacion.xlsx» a la papelera.', accion: 'Ver papelera' }),
  },
  {
    estado: 'eliminar-fallido', titulo: 'no se pudo mover a la papelera: aviso arriba de la lista con «Reintentar»',
    ruta: RUTA_FASE3,
    cuerpo: () => encabezado(RUTA_FASE3) + E.aviso({ titulo: 'No pudimos mover «Resultados_evaluacion.xlsx» a la papelera.', texto: 'Revisa tu conexión e inténtalo de nuevo. El archivo sigue en esta carpeta.', accion: 'Reintentar' }) + listaFase3(FASE3),
  },
  // Desglose de carpetas (CA-26) y accesos rápidos (CA-27, CA-28)
  {
    estado: 'carpeta-desglosada', titulo: 'carpeta desglosada a dos niveles, con sangría, sin salir de Mis archivos (CA-26)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS, cuerpo: desglosada(),
  },
  {
    estado: 'desglosada-ver-mas', titulo: 'carpetas con más de una página: «Ver más» al final de su nivel, lleva a la carpeta (Q-2)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ 'Proyecto Alpha': { verMas: true }, 'Fase 3 · RAG': { verMas: true } }),
  },
  {
    estado: 'desglosando-cargando', titulo: 'se desglosa «Documentación»: cargando en su fila (CA-26)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ 'Documentación': { abierto: true, estado: 'cargando' }, 'Fase 3 · RAG': { abierto: false } }),
  },
  {
    estado: 'desglosada-vacia', titulo: 'carpeta desglosada sin contenido: fila «Esta carpeta está vacía» (CA-26)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ Actas: { abierto: true, estado: 'vacia' }, 'Fase 3 · RAG': { abierto: false } }),
  },
  {
    estado: 'desglosada-error', titulo: 'falló el contenido de «Documentación»: error con «Reintentar» solo en su fila (CA-26)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ 'Documentación': { abierto: true, estado: 'error' }, 'Fase 3 · RAG': { abierto: false } }),
  },
  {
    estado: 'menu-fila-carpeta', titulo: 'menú ⋮ de una subcarpeta (nivel 2): «Fijar en la barra lateral» (CA-27)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ 'Fase 3 · RAG': { abierto: false } }, { menuEn: 'Fase 3 · RAG' }),
  },
  {
    estado: 'menu-fila-archivo', titulo: 'menú ⋮ de un archivo anidado (nivel 3): «Fijar en la barra lateral» (CA-27)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({}, { menuEn: 'Informe_avance_RAG.docx' }),
  },
  {
    estado: 'menu-fila-quitar', titulo: 'menú ⋮ de un elemento ya fijado: «Quitar de la barra lateral» (CA-27)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS,
    cuerpo: desglosada({ 'Proyecto Alpha': { abierto: false } }, { menuEn: 'Propuesta_Nimbo_v3.docx' }),
  },
  {
    estado: 'tope-de-fijados', titulo: 'sexto fijado: aviso «Ya fijaste 5 elementos…» y no cambia nada (CA-28)',
    ruta: ['Mis archivos'], nuevo: true, js: D.JS_MENU + D.JS, accesos: ACCESOS_TOPE,
    cuerpo: () => encabezado(['Mis archivos']) + A.avisoTope() + D.tabla(raizDesglosada({ 'Proyecto Alpha': { abierto: false } })),
  },
];

for (const v of ESTADOS) {
  const file = `explorador--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
