// Genera los estados de storage/papelera para la spec 006.
// Uso: node generar.js <ruta-del-worktree>
// papelera.html (HTML empaquetado de la propuesta, p. 11) NO se genera aquí ni cambia.
// Marco: marco/marco.js; cuota, tabla y estados comunes: mis-archivos/; piezas de 006: carpetas/carpetas.js.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const MF = require('../mis-archivos/menu-fila.js');
const C = require('../carpetas/carpetas.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/papelera');
fs.mkdirSync(OUT, { recursive: true });

const { icon } = C;

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de storage/papelera (spec 006) */
` + S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + `
  /* Botón de acción definitiva fuera de un diálogo: outline con texto destructive (5.39:1 sobre card) */
  .btn-outline-danger { color: var(--destructive); background: var(--card); border: 1px solid var(--destructive); }
  .btn-outline-danger:hover { background: var(--destructive-tint); }
  .btn-ghost { color: var(--secondary-foreground); background: transparent; border: 1px solid transparent; }
  .btn-ghost:hover { background: var(--muted); color: var(--foreground); }

  /* Resumen: espacio que ocupa la papelera y retención del plan */
  .trash-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .stat { display: flex; gap: 14px; align-items: flex-start; padding: 16px 20px; }
  .stat + .stat { border-left: 1px solid var(--border); }
  .stat-ico { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none; border-radius: var(--radius-md); background: var(--brand-soft); color: var(--primary); }
  .stat p { margin: 0; }
  .stat-label { font-size: 12.5px; font-weight: 600; color: var(--secondary-foreground); }
  .stat-value { font-size: 20px; font-weight: 700; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .stat-help { font-size: 13px; color: var(--muted-foreground); }

  /* Aviso de purga próxima (tono warning, como ReadOnlyBanner) */
  .purge-alert { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--card)); border-radius: var(--radius-lg); background: var(--warning-soft); }
  .purge-alert > .ico { margin-top: 2px; color: var(--warning-foreground); }
  .purge-alert p { margin: 0; font-size: 14px; color: var(--foreground); }
  .purge-alert strong { color: var(--warning-foreground); font-weight: 600; }

  /* Barra de selección (encima de la tabla) */
  .selbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 16px; padding: 8px 8px 8px 16px; background: var(--brand-soft); border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--card)); border-radius: var(--radius-lg); }
  .selbar p { margin: 0 auto 0 0; font-size: 14px; font-variant-numeric: tabular-nums; }
  .selbar strong { font-weight: 600; }

  /* Tabla de la papelera */
  .trash .files { margin-top: 16px; }
  .files .c-chk { width: 48px; padding: 0 0 0 16px; }
  .chk { width: 24px; height: 24px; margin: 0; vertical-align: middle; accent-color: var(--primary); cursor: pointer; }
  .files .c-loc { width: 170px; }
  .files .c-del { width: 124px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .files .c-days { width: 124px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .files .c-size { width: 96px; }
  .files .c-act.c-act-wide { width: 168px; white-space: nowrap; }
  .c-act-wide .btn { margin-right: 4px; vertical-align: middle; }
  .c-act-wide .row-actions { vertical-align: middle; }
  .loc { color: var(--secondary-foreground); overflow-wrap: anywhere; }
  .dias-pronto { display: inline-flex; align-items: center; gap: 6px; color: var(--warning-foreground); font-weight: 600; }
  .files tr.is-selected td { background: var(--accent); color: var(--secondary-foreground); }
  .files tr.is-selected td:first-child { box-shadow: inset 3px 0 0 var(--brand); }
  .files tr.is-selected .fsub, .files tr.is-selected .fmeta-m { color: var(--secondary-foreground); }
  .menu-danger, .account-menu [role="menuitem"].menu-danger .ico { color: var(--destructive) !important; }
  .vaciando { display: inline-flex; align-items: center; gap: 6px; color: var(--secondary-foreground); font-weight: 500; }
  .busy-alert { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--card)); border-radius: var(--radius-lg); background: var(--brand-soft); }
  .busy-alert > .ico { margin-top: 2px; color: var(--primary); }
  .busy-alert p { margin: 0; font-size: 14px; color: var(--foreground); }
  .busy-alert strong { font-weight: 600; }
  .chk[disabled] { cursor: not-allowed; }
  .table-foot { margin: 10px 2px 0; font-size: 13px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }

  /* Resultado de restaurar varios (o uno con aviso): panel persistente, una línea por elemento */
  .result { margin-top: 16px; padding: 12px 8px 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .result-head { display: flex; align-items: center; gap: 10px; }
  .result-head h2 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }
  .result-head .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); }
  .result ul { list-style: none; margin: 6px 0 0; padding: 0 8px 0 0; display: grid; gap: 6px; }
  .result li { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--foreground); overflow-wrap: anywhere; }
  .result li .ico { margin-top: 2px; }
  .r-ok .ico { color: var(--success-foreground); }
  .r-aviso .ico { color: var(--warning-foreground); }
  .r-error .ico { color: var(--destructive); }
  .r-tag { font-weight: 600; }

  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .page-head .btn { width: 100%; }
    .trash-summary { grid-template-columns: minmax(0, 1fr); margin-top: 16px; }
    .stat { padding: 14px; }
    .stat + .stat { border-left: 0; border-top: 1px solid var(--border); }
    .purge-alert { padding: 12px; }
    .selbar { padding: 10px 12px; }
    .selbar p { flex-basis: 100%; }
    .selbar .btn { flex: 1; min-height: 44px; }
    .files .c-loc, .files .c-del, .files .c-days { display: none; }
    .files td.c-chk { width: 44px; padding: 6px 0 6px 10px; }
    .trash .files .ftile { display: none; } /* a 360 px el tipo se lee en la extensión o en «Carpeta ·» */
    .files .c-act-wide .btn { display: none; }
    .files td.c-act.c-act-wide { width: 56px; }
    .files tr.is-selected td { color: var(--secondary-foreground); }
    .result { padding: 12px 4px 12px 12px; }
  }
`;

// ---------- Datos de ejemplo (en la app vienen de GET /trash; retención de PlanLimits) ----------
// [tipo, nombre, carpeta original (TrashItem.originalFolder.name; null → «Mis archivos»), tamaño, eliminado, días restantes]
// Hoy es 30 sep 2026; retención del plan Equipo: 60 días. De lo más reciente a lo más antiguo (CA-12).
const ITEMS = [
  ['archivo', 'Borrador_propuesta_v1.docx', 'Fase 3 · RAG', '840 KB', 'hoy · 09:40', 60],
  ['archivo', 'Presupuesto_Q3_obsoleto.xlsx', 'Finanzas', '640 KB', '28 sep', 58],
  ['carpeta', 'Capturas_v1', 'Documentación', '1.4 GB', '21 sep', 51],
  ['carpeta', 'Entrevistas descartadas', 'Entrevistas', '310 MB', '10 sep', 40],
  ['archivo', 'Render_pruebas_animacion.mp4', 'Documentación', '980 MB', '5 ago', 4],
  ['archivo', 'Acta_reunion_kickoff.pdf', 'Mis archivos', '2.1 MB', '2 ago', 1],
];
const TOTAL = '2.7 GB';
const PRONTO = 7; // umbral del aviso de purga próxima (días)

const dias = (n) => (n <= PRONTO
  ? `<span class="dias-pronto">${icon('clock', 14)}${n === 1 ? '1 día' : `${n} días`}</span>`
  : `${n} días`);
const VACIANDO = `<span class="vaciando">${icon('loader', 14)}Vaciando…</span>`;
const diasTexto = (n) => { const t = n === 1 ? 'queda 1 día' : `quedan ${n} días`; return n <= PRONTO ? `<span class="dias-pronto">${icon('clock', 13)}${t}</span>` : t; };

// ---------- Piezas ----------
const mi = C.itemMenu;
const MENU = [mi('undo', 'Restaurar'), 'sep', mi('trash', 'Eliminar definitivamente', 'menu-danger')];

function fila([tipo, nombre, loc, tam, del, d], i, { sel = [], menu = -1, vaciando = false } = {}) {
  const carpeta = tipo === 'carpeta';
  const elegido = sel.includes(nombre);
  const tile = C.tileNodo(tipo, nombre);
  const sub = carpeta ? '<span class="fsub">Carpeta</span>' : '';
  return `
            <tr${elegido ? ' class="is-selected"' : ''}>
              <td class="c-chk"><input class="chk" type="checkbox" aria-label="Seleccionar ${nombre}"${elegido ? ' checked' : ''}${vaciando ? ' disabled' : ''}></td>
              <td><div class="fname">${tile}<div class="fname-text">${nombre}${sub}<span class="fmeta-m">${loc} · ${tam}</span><span class="fmeta-m">${vaciando ? VACIANDO : `Eliminado ${del === 'hoy · 09:40' ? 'hoy' : `el ${del}`} · ${diasTexto(d)}`}</span></div></div></td>
              <td class="c-loc"><span class="loc">${loc}</span></td>
              <td class="c-size">${tam}</td>
              <td class="c-del">${del}</td>
              <td class="c-days">${vaciando ? VACIANDO : dias(d)}</td>
              <td class="c-act c-act-wide">${vaciando ? '' : `<button class="btn btn-outline btn-sm" type="button" aria-label="Restaurar ${nombre}">${icon('undo', 14)}<span>Restaurar</span></button>${S.menuFila(i, nombre, i === menu, MENU)}`}</td>
            </tr>`;
}

function tabla(items, opciones = {}) {
  const todos = opciones.sel && opciones.sel.length === items.length;
  const off = opciones.vaciando ? ' disabled' : '';
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Elementos en la papelera, de lo más reciente a lo más antiguo</caption>
            <thead><tr><th scope="col" class="c-chk"><input class="chk" type="checkbox" aria-label="Seleccionar todos los elementos de esta página"${todos ? ' checked' : ''}${off}></th><th scope="col">Nombre</th><th scope="col" class="c-loc">Ubicación original</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-del">Eliminado</th><th scope="col" class="c-days">Días restantes</th><th scope="col" class="c-act c-act-wide"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${items.map((it, i) => fila(it, i, opciones)).join('')}
            </tbody>
          </table>
        </div>
        <p class="table-foot">${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}</p>`;
}

function encabezado(n, { vaciar = true, vaciando = false } = {}) {
  return `
        <div class="page-head">
          <div>
            <h1>Papelera</h1>${n ? `\n            <p class="page-sub">${n} ${n === 1 ? 'elemento' : 'elementos'}</p>` : ''}
          </div>${vaciar ? `
          <button class="btn btn-outline-danger" type="button"${vaciando ? ' disabled' : ''}>${icon('trash', 16)}<span>Vaciar papelera</span></button>` : ''}
        </div>`;
}

function resumen(total) {
  return `
        <section class="trash-summary" aria-label="Resumen de la papelera">
          <div class="stat"><span class="stat-ico">${icon('hardDrive', 18)}</span><div><p class="stat-label">Espacio que ocupa</p><p class="stat-value">${total}</p><p class="stat-help">Cuenta contra tu cuota hasta que se elimine definitivamente.</p></div></div>
          <div class="stat"><span class="stat-ico">${icon('clock', 18)}</span><div><p class="stat-label">Retención de tu plan</p><p class="stat-value">${C.RETENCION}</p><p class="stat-help">Después, cada elemento se elimina definitivamente.</p></div></div>
        </section>`;
}

function avisoPurga(items) {
  const n = items.filter((x) => x[5] <= PRONTO).length;
  if (!n) return '';
  return `
        <div class="purge-alert" role="note">
          ${icon('warn', 18)}
          <p><strong>${n === 1 ? '1 elemento se eliminará' : `${n} elementos se eliminarán`} definitivamente en los próximos ${PRONTO} días.</strong> Restáuralos antes de esa fecha si los necesitas.</p>
        </div>`;
}

// Vaciar es diferido (DELETE /trash → 202): los elementos siguen con «Vaciando…» y sin acciones hasta que el worker
// los borra; el espacio baja al terminar (CA-18). La página vuelve a leer GET /trash/summary.
function avisoVaciando() {
  return `
        <div class="busy-alert" role="status">
          ${icon('loader', 18, 'spin')}
          <p><strong>Estamos vaciando la papelera.</strong> Liberaremos ${TOTAL} cuando termine; puedes seguir usando Nimbo mientras tanto.</p>
        </div>`;
}

function selbar(nombres, tam) {
  return `
        <div class="selbar" role="region" aria-label="Selección">
          <p><strong>${nombres.length} seleccionados</strong> · ${tam}</p>
          <button class="btn btn-primary btn-sm" type="button">${icon('undo', 14)}<span>Restaurar ${nombres.length}</span></button>
          <button class="btn btn-ghost btn-sm" type="button">Quitar selección</button>
        </div>`;
}

function vacia() {
  return `
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('trash', 40)}
          <h2 id="vacio-t">La papelera está vacía</h2>
          <p>Lo que elimines aparecerá aquí durante ${C.RETENCION}, la retención de tu plan.</p>
          <a class="btn btn-outline" href="#">${icon('folder', 16)}<span>Ir a Mis archivos</span></a>
        </section>`;
}

// Resultado por elemento al restaurar (CA-14, CA-15, CA-17)
const LINEA = {
  ok: (t) => `<li class="r-ok">${icon('ok', 16)}<span><span class="r-tag">Restaurado.</span> ${t}</span></li>`,
  aviso: (t) => `<li class="r-aviso">${icon('info', 16)}<span><span class="r-tag">Restaurado con cambios.</span> ${t}</span></li>`,
  error: (t) => `<li class="r-error">${icon('xCircle', 16)}<span><span class="r-tag">No restaurado.</span> ${t}</span></li>`,
};
function resultado(titulo, lineas) {
  return `
        <section class="result" role="status" aria-labelledby="res-t">
          <div class="result-head"><h2 id="res-t">${titulo}</h2><button class="icon-btn" type="button" aria-label="Cerrar resultado">${icon('x', 18)}</button></div>
          <ul>${lineas.map(([k, t]) => `\n            ${LINEA[k](t)}`).join('')}
          </ul>
        </section>`;
}

function contenido(items, { sel = [], selTam = '', menu = -1, antes = '', total = TOTAL, vaciando = false } = {}) {
  return encabezado(items.length, { vaciando }) + resumen(total) + antes + (vaciando ? avisoVaciando() : avisoPurga(items)) +
    (sel.length ? selbar(sel, selTam) : '') + tabla(items, { sel, menu, vaciando });
}

// ---------- Página ----------
function page(v) {
  const file = `papelera--${v.estado}.html`;
  return C.conLogo(`${M.cabecera({
    titulo: `Papelera · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 006: carpetas y papelera). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/papelera/generar.js (marco, mis-archivos y carpetas). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">006</span> <strong>Papelera</strong> <span class="file">${file}</span> <span>plan Equipo · retención de ${C.RETENCION} · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${C.sidebar({ activo: 'Papelera', papelera: v.papelera === undefined ? '6' : v.papelera })}
    <div class="main">
      ${M.topbar({ crumbs: ['Papelera'] })}
      <main class="content trash" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>${v.dialogo || ''}${v.toast || ''}
</div>
${v.js ? `
<script>${v.js}</script>
` : ''}
</body>
</html>
`);
}

// ---------- Estados ----------
const sin = (...nombres) => ITEMS.filter((x) => !nombres.includes(x[1]));

const ESTADOS = [
  {
    estado: 'con-elementos', titulo: 'lista con resumen de espacio, retención y aviso de purga próxima',
    cuerpo: () => contenido(ITEMS),
  },
  {
    estado: 'vacia', titulo: 'papelera sin elementos', papelera: '',
    cuerpo: () => encabezado(0, { vaciar: false }) + vacia(),
  },
  {
    estado: 'cargando', titulo: 'esqueleto mientras llega GET /trash',
    cuerpo: () => encabezado(0, { vaciar: false }) + E.esqueleto('Cargando la papelera…'),
  },
  {
    estado: 'error', titulo: 'falló el listado de la papelera: error con «Reintentar»',
    cuerpo: () => encabezado(0, { vaciar: false }) + E.errorEstado('No pudimos cargar la papelera.', 'Lo que eliminaste sigue a salvo. Inténtalo de nuevo.'),
  },
  {
    estado: 'seleccion', titulo: 'dos elementos seleccionados: restaurar la selección',
    cuerpo: () => contenido(ITEMS, { sel: ['Borrador_propuesta_v1.docx', 'Presupuesto_Q3_obsoleto.xlsx'], selTam: '1.5 MB' }),
  },
  {
    estado: 'acciones', titulo: 'menú ⋮ de una fila: restaurar o eliminar definitivamente',
    js: MF.JS_MENU,
    cuerpo: () => contenido(ITEMS, { menu: 4 }),
  },
  {
    estado: 'restaurado', titulo: 'se restauró un elemento a su ubicación original: aviso con «Abrir carpeta»',
    papelera: '5',
    cuerpo: () => contenido(sin('Borrador_propuesta_v1.docx')),
    toast: C.toast({ texto: 'Restauramos «Borrador_propuesta_v1.docx» en Fase 3 · RAG.', accion: 'Abrir carpeta' }),
  },
  {
    estado: 'restaurado-con-avisos', titulo: 'resultado por elemento: restaurado, renombrado, a la raíz y uno rechazado por profundidad (422)',
    papelera: '3',
    cuerpo: () => contenido(sin('Presupuesto_Q3_obsoleto.xlsx', 'Entrevistas descartadas', 'Render_pruebas_animacion.mp4'), {
      total: '1.4 GB',
      antes: resultado('Restauramos 3 de 4 elementos', [
        ['ok', '«Render_pruebas_animacion.mp4» volvió a Documentación.'],
        ['aviso', 'Restauramos «Presupuesto_Q3_obsoleto.xlsx» como «Presupuesto_Q3_obsoleto (1).xlsx» porque ya existía uno con ese nombre.'],
        ['aviso', 'La carpeta original ya no está disponible. Restauramos «Entrevistas descartadas» en Mis archivos.'],
        ['error', 'No podemos restaurar «Capturas_v1» aquí porque superaría 10 niveles de carpetas. Mueve la carpeta original a un nivel más alto y vuelve a intentarlo.'],
      ]),
    }),
  },
  {
    estado: 'confirmar-eliminar', titulo: 'confirmación de «Eliminar definitivamente» un elemento',
    cuerpo: () => contenido(ITEMS),
    dialogo: C.confirmar({ titulo: '¿Eliminar definitivamente «Render_pruebas_animacion.mp4»?', cuerpo: 'Esta acción no se puede deshacer. Liberarás 980 MB de espacio.', boton: 'Eliminar definitivamente' }),
  },
  {
    estado: 'confirmar-vaciar', titulo: 'confirmación de «Vaciar papelera»',
    cuerpo: () => contenido(ITEMS),
    dialogo: C.confirmar({ titulo: '¿Vaciar la papelera?', cuerpo: `Se eliminarán definitivamente los ${ITEMS.length} elementos. Esta acción no se puede deshacer. Liberarás ${TOTAL} de espacio.`, boton: 'Vaciar papelera' }),
  },
  {
    estado: 'vaciando', titulo: 'vaciado diferido en curso (202): elementos con «Vaciando…» y sin acciones',
    cuerpo: () => contenido(ITEMS, { vaciando: true }),
  },
  {
    estado: 'vaciada', titulo: 'papelera vaciada: aviso con el espacio liberado', papelera: '',
    cuerpo: () => encabezado(0, { vaciar: false }) + vacia(),
    toast: C.toast({ texto: `Vaciaste la papelera. Liberaste ${TOTAL} de espacio.` }),
  },
];

for (const v of ESTADOS) {
  const file = `papelera--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
