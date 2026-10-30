// Genera los estados de sharing/compartidos-conmigo para la spec 012b (CA-8 a CA-11).
// Uso: node generar.js <ruta-del-worktree>
// Marco: marco/marco.js; tabla, menú ⋮ y estados comunes: mis-archivos/; logo, toast y barra lateral: carpetas/.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/sharing/compartidos-conmigo');
fs.mkdirSync(OUT, { recursive: true });

const { icon } = C;

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de sharing/compartidos-conmigo (spec 012b) */
` + S.CSS_LISTA + E.CSS_ESTADOS + E.CSS_ALERT_WARN + C.CSS_006 + `
  .files .c-by { width: 200px; }
  .files .c-level { width: 120px; }
  .files .c-date { width: 124px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .by { color: var(--secondary-foreground); overflow-wrap: anywhere; }
  /* Nivel de acceso: ícono + texto, tono neutral (como StatusBadge neutral); el color nunca es el diferenciador */
  .nivel { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--card); color: var(--secondary-foreground); font-size: 13px; font-weight: 500; white-space: nowrap; }
  .table-foot { margin: 10px 2px 0; font-size: 13px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .files .menu-danger, .account-menu [role="menuitem"].menu-danger .ico { color: var(--destructive) !important; }
  .dialog .dlg-alert { margin-top: 16px; }
  .dialog-state { margin: 14px 0 0; display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--secondary-foreground); }
  .page-head .page-sub { margin-top: 4px; }

  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600 + `    .files .c-by, .files .c-level, .files .c-date { display: none; }
    .fmeta-m .nivel { padding: 0 8px; font-size: 12px; vertical-align: middle; }
  }
`;

// ---------- Datos de ejemplo (en la app vienen de GET /shares/received, 012 CA-22) ----------
// [tipo, nombre, compartido por (nombre visible, nunca correo), nivel, fecha]. Más reciente primero (S-3). Hoy: 30 oct 2026.
const ITEMS = [
  ['carpeta', 'Contratos 2026', 'Laura Méndez', 'Editor', 'hoy · 09:40'],
  ['archivo', 'Informe_trimestral_Q3.docx', 'Andrea Morales', 'Editor', '28 oct'],
  ['archivo', 'Presupuesto_marketing.xlsx', 'Pablo Ixcoy', 'Lector', '22 oct'],
  ['archivo', 'Manual_de_marca.pdf', 'Mónica Reyes', 'Lector', '15 oct'],
  ['carpeta', 'Fotos del evento', 'Diego Cifuentes', 'Lector', '2 oct'],
];

// ---------- Piezas ----------
const mi = (ic, label, cls = '') => `<button role="menuitem" type="button" tabindex="-1"${cls ? ` class="${cls}"` : ''}>${icon(ic)}<span>${label}</span></button>`;
// Sin «Compartir», «Accesos», «Renombrar», «Mover» ni «Mover a la papelera» (CA-6). «Salir» no es rojo: no borra nada del propietario.
const menuDe = (carpeta) => [mi(carpeta ? 'folderOpen' : 'eye', 'Abrir'), ...(carpeta ? [] : [mi('download', 'Descargar')]), 'sep', mi('logout', 'Salir')];
const nivel = (n) => `<span class="nivel">${icon(n === 'Editor' ? 'pencil' : 'eye', 14)}${n}</span>`;

function fila([tipo, nombre, por, niv, fecha], i, menu) {
  const carpeta = tipo === 'carpeta';
  const tile = carpeta ? `<span class="ftile ftile-folder">${icon('folder', 16)}</span>` : S.tile(nombre);
  return `
            <tr>
              <td><div class="fname">${tile}<div class="fname-text"><a class="fname-link" href="#">${nombre}</a>${carpeta ? '<span class="fsub">Carpeta</span>' : ''}<span class="fmeta-m">De ${por}</span><span class="fmeta-m">${nivel(niv)} · ${fecha}</span></div></div></td>
              <td class="c-by"><span class="by">${por}</span></td>
              <td class="c-level">${nivel(niv)}</td>
              <td class="c-date">${fecha}</td>
              <td class="c-act">${S.menuFila(i, nombre, i === menu, menuDe(carpeta))}</td>
            </tr>`;
}

function tabla(items, menu = -1) {
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Archivos y carpetas compartidos contigo, del más reciente al más antiguo</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-by">Compartido por</th><th scope="col" class="c-level">Tu nivel</th><th scope="col" class="c-date">Fecha</th><th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
            <tbody>${items.map((it, i) => fila(it, i, menu)).join('')}
            </tbody>
          </table>
        </div>
        <p class="table-foot">${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}</p>`;
}

function encabezado(n) {
  return `
        <div class="page-head">
          <div>
            <h1>Compartidos conmigo</h1>${n ? `
            <p class="page-sub">${n} ${n === 1 ? 'elemento' : 'elementos'}</p>` : ''}
          </div>
        </div>`;
}

const vacia = () => `
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('share', 40)}
          <h2 id="vacio-t">Todavía no te han compartido nada</h2>
          <p>Lo que compartan contigo aparecerá aquí. Para recibirlo, la otra persona debe compartir con el correo de tu cuenta.</p>
          <a class="btn btn-outline" href="#">${icon('folder', 16)}<span>Ir a Mis archivos</span></a>
        </section>`;

// AlertDialog de «Salir»: acción primaria, no destructiva (no borra nada; el propietario puede volver a compartir).
function dialogoSalir(nombre, { pendiente = false, error = '' } = {}) {
  const off = pendiente ? ' disabled' : '';
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d"${pendiente ? ' aria-busy="true"' : ''}>
    <h2 id="dlg-t">¿Salir de «${nombre}»?</h2>
    <p id="dlg-d">Dejarás de verlo. Quien lo compartió puede volver a compartírtelo.</p>${error ? C.alertaDialogo(error) : ''}${pendiente ? `
    <p class="dialog-state" role="status">${icon('loader', 16, 'spin')}Saliendo de «${nombre}»…</p>` : ''}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button"${off}${pendiente ? '' : ' autofocus'}>Cancelar</button>
      <button class="btn btn-primary" type="button"${off}>${pendiente ? `${icon('loader', 16, 'spin')}<span>Saliendo…</span>` : `<span>${error ? 'Reintentar' : 'Salir'}</span>`}</button>
    </div>
  </div>`;
}

// ---------- Página ----------
function page(v) {
  const file = `compartidos-conmigo--${v.estado}.html`;
  return C.conLogo(`${M.cabecera({
    titulo: `Compartidos conmigo · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 012b: Compartidos conmigo, CA-8 a CA-11). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/compartidos-conmigo/generar.js (marco, mis-archivos y carpetas). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">012b</span> <strong>Compartidos conmigo</strong> <span class="file">${file}</span> <span>ruta /compartidos · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${C.sidebar({ activo: 'Compartidos conmigo' })}
    <div class="main">
      ${M.topbar({ crumbs: ['Compartidos conmigo'] })}
      <main class="content" id="contenido">${v.cuerpo()}
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
const NOMBRE_SALIDA = 'Informe_trimestral_Q3.docx';
const sin = (n) => ITEMS.filter((x) => x[1] !== n);
const lista = () => encabezado(ITEMS.length) + tabla(ITEMS);

const ESTADOS = [
  { estado: 'cargando', titulo: 'esqueleto mientras llega GET /shares/received', cuerpo: () => encabezado(0) + E.esqueleto('Cargando lo que te compartieron…') },
  { estado: 'con-elementos', titulo: 'lista con nombre, tipo, quién compartió, tu nivel y fecha', cuerpo: lista },
  { estado: 'vacia', titulo: 'sin accesos directos: explica cómo llegan los elementos', cuerpo: () => encabezado(0) + vacia() },
  {
    estado: 'error-carga', titulo: 'falló la carga de la lista: error con «Reintentar»',
    cuerpo: () => encabezado(0) + E.errorEstado('No pudimos cargar lo que te compartieron.', 'Revisa tu conexión e inténtalo de nuevo. Tus accesos siguen igual.'),
  },
  { estado: 'menu-fila', titulo: 'menú ⋮ de un archivo con nivel Lector: Abrir, Descargar y Salir', js: E.JS_MENU, cuerpo: () => encabezado(ITEMS.length) + tabla(ITEMS, 2) },
  { estado: 'confirmar-salir', titulo: 'confirmación de «Salir» (consecuencia explícita)', cuerpo: lista, dialogo: dialogoSalir(NOMBRE_SALIDA) },
  { estado: 'saliendo', titulo: 'saliendo: botones deshabilitados y progreso anunciado', cuerpo: lista, dialogo: dialogoSalir(NOMBRE_SALIDA, { pendiente: true }) },
  {
    estado: 'salio', titulo: 'saliste: el elemento desaparece sin recargar y se anuncia',
    cuerpo: () => encabezado(ITEMS.length - 1) + tabla(sin(NOMBRE_SALIDA)),
    toast: C.toast({ texto: `Saliste de «${NOMBRE_SALIDA}».` }),
  },
  {
    estado: 'error-salir-inexistente', titulo: 'salir falló: el acceso ya no existe (SHARING_SHARE_NOT_FOUND), con «Actualizar lista»',
    cuerpo: () => encabezado(ITEMS.length) + E.aviso({
      titulo: 'Ese acceso ya no existe.',
      texto: `Es posible que quien compartió «${NOMBRE_SALIDA}» lo haya quitado. Actualiza la lista para ver tus accesos vigentes.`,
      accion: 'Actualizar lista',
    }) + tabla(ITEMS),
  },
  {
    estado: 'error-salir-sin-conexion', titulo: 'salir falló por red: el diálogo sigue abierto con «Reintentar»',
    cuerpo: lista, dialogo: dialogoSalir(NOMBRE_SALIDA, { error: `No pudimos salir de «${NOMBRE_SALIDA}». Revisa tu conexión e inténtalo de nuevo; seguirás viéndolo hasta entonces.` }),
  },
  {
    estado: 'solo-lectura', titulo: 'cuenta en solo lectura: puede abrir, descargar y salir',
    js: E.JS_MENU,
    cuerpo: () => M.avisoSoloLectura({ cuerpo: 'Puedes ver y descargar lo que te compartieron, y salir de ello. Para editar o subir archivos, renueva tu plan.' }) +
      encabezado(ITEMS.length) + tabla(ITEMS, 1),
  },
];

for (const v of ESTADOS) {
  const file = `compartidos-conmigo--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
