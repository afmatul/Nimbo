// Genera los mockups autocontenidos de backoffice/admin (spec 011: cuentas y ficha), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común y página) viene
// de admin/area.js, que a su vez usa el CSS del marco de marco/marco.js (el mismo de identity/seguridad, shared/layout
// y storage). Aquí solo va lo propio de cuentas y ficha.
const A = require('./area.js');
const C = require('./corpus.js');
const { tramoDe } = require('../espacio/espacio.js');

const OUT = A.carpetaDeSalida('admin');

const { icon } = A;

// ---------- Datos de ejemplo (en la app vienen de la API; planes y cuotas del catálogo, admin/corpus.js) ----------
// Ordenadas por fecha de alta, de la más reciente. Las internas no tienen plan ni espacio. Las personas que aparecen en
// otras pantallas (Mónica, Andrea, Pablo, Laura y Diego) vienen del corpus; verificada: correo verificado (sí por defecto).
const cliente = (datos) => ({ rol: 'Cliente', ...datos });
const CUENTAS = [
  C.DIEGO,
  C.ANDREA,
  cliente({ nombre: 'Lucía Barrios', correo: 'lucia.barrios@gmail.com', plan: C.PERSONAL,
    usado: '3.2 GB', pct: 21, alta: '21/09/2026' }),
  cliente({ nombre: 'Juan Cortés', correo: 'jcortes@gmail.com', plan: C.PERSONAL,
    usado: '14.8 GB', pct: 99, alta: '18/09/2026' }),
  C.PABLO,
  cliente({ nombre: 'Sofía Marroquín', correo: 'sofia@emarroquin.gt', plan: C.PRO,
    usado: '62 GB', pct: 62, alta: '07/09/2026', estado: 'suspendida' }),
  cliente({ nombre: 'Ana Gutiérrez', correo: 'agutierrez@alpha.gt', plan: C.PRO,
    usado: '41 GB', pct: 41, alta: '03/09/2026' }),
  C.LAURA,
  cliente({ nombre: 'Carlos Méndez', correo: 'ti@uvalle.edu.gt', plan: C.INSTITUCIONAL,
    usado: '1.2 TB', pct: 60, alta: '31/08/2026' }),
  C.MONICA,
];
const estadoDe = (c) => c.estado || 'activa';
const verificada = (c) => c.verificada !== false;
const esInterna = (c) => !c.plan;
const esPropia = (c) => c === C.MONICA;

// ---------- CSS ----------
const CSS = A.CSS + `
  /* Propio de backoffice/admin (spec 011: cuentas y ficha) */

${A.CSS_BUSQUEDA}
  /* Tabla de cuentas */
  .accounts { margin-top: 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .accounts table { width: 100%; border-collapse: collapse; }
  .accounts th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); background: var(--background); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .accounts td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--secondary-foreground); vertical-align: middle; }
  .accounts tr:last-child td { border-bottom: 0; }
  .accounts tbody tr:hover { background: var(--muted); }
  .c-rol { width: 124px; } .c-estado { width: 136px; } .c-verif { width: 100px; } .c-plan { width: 112px; } .c-uso { width: 176px; } .c-alta { width: 104px; }
  .c-alta, .c-uso { font-variant-numeric: tabular-nums; }
  .acct { min-width: 0; }
  .acct-link { display: inline-flex; align-items: center; min-height: 24px; color: var(--foreground); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
  .acct-link:hover { color: var(--primary-hover); text-decoration: underline; }
  .acct-mail { display: block; font-size: 12.5px; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .you { margin-left: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--secondary-foreground); background: var(--muted); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1px 6px; white-space: nowrap; }
  .acct-m { display: none; }
  .na { color: var(--muted-foreground); }
  .yesno { display: inline-flex; align-items: center; gap: 6px; }
  .yesno .ico { color: var(--secondary-foreground); }

  /* Uso del espacio (QuotaBar en miniatura: tramo por color y siempre GB y % en texto) */
  .use-text { display: block; font-size: 12.5px; color: var(--secondary-foreground); white-space: nowrap; }
  .use-bar { display: block; height: 5px; margin-top: 5px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .use-bar span { display: block; height: 100%; border-radius: 999px; background: var(--success); }
  .use-warn span { background: var(--warning); }
  .use-full span { background: var(--destructive-soft); }

${A.CSS_PAGINACION}
  /* Esqueleto de la lista (StateView y skeleton-line en area.js) */
  .sk-row { display: grid; grid-template-columns: minmax(0, 1fr) 124px 136px 100px 112px 176px 104px; gap: 0 14px; align-items: center; padding: 14px; border-bottom: 1px solid var(--border); }
  .sk-row:last-child { border-bottom: 0; }
  .sk-head { padding: 12px 14px; background: var(--background); }
  .sk-head .skeleton-line { height: 10px; width: 60%; background: var(--border); }
  .sk-two .skeleton-line + .skeleton-line { margin-top: 7px; height: 10px; }

  /* Ficha de la cuenta */
  .profile-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; margin-top: 8px; }
  .profile-head h1 { margin: 0; font-size: 26px; line-height: 1.25; font-weight: 700; letter-spacing: -.01em; }
  .profile-head .mail { margin: 4px 0 0; color: var(--secondary-foreground); font-size: 14.5px; overflow-wrap: anywhere; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 6px; }
  .ficha-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; margin-top: 20px; align-items: start; }
  .facts { display: grid; grid-template-columns: 170px minmax(0, 1fr); margin: 0; }
  .facts dt, .facts dd { padding: 11px 0; border-top: 1px solid var(--border); font-size: 14px; }
  .facts dt { color: var(--secondary-foreground); }
  .facts dd { margin: 0; color: var(--foreground); font-weight: 500; min-width: 0; }
  .facts dd .use-bar { max-width: 260px; height: 6px; }
  .facts dd .use-text { font-size: 14px; color: var(--foreground); white-space: normal; }
  .facts .note { display: block; margin-top: 2px; font-size: 12.5px; font-weight: 400; color: var(--muted-foreground); }
  .action { padding: 16px 0; border-top: 1px solid var(--border); }
  .action:first-of-type { border-top: 0; padding-top: 4px; }
  .action h3 { margin: 0; font-size: 14px; font-weight: 600; }
  .action p { margin: 4px 0 12px; font-size: 13.5px; color: var(--secondary-foreground); }
  .action .info-box p { margin: 0; font-size: 13.5px; } /* el recuadro de area.js no hereda el margen de .action p */
  a.btn-destructive-outline, a.btn-destructive-outline:hover { color: var(--destructive); } /* «Suspender cuenta» enlaza la confirmación */

  @media (max-width: 900px) {
    .ficha-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 1180px) and (min-width: 601px) {
    .c-verif, .c-alta { display: none; }
  }
  @media (max-width: 600px) {
    .page-head .btn { width: 100%; }
${A.CSS_BUSQUEDA_MQ600}    /* Tabla → filas apiladas: la primera celda resume todo; el resto de columnas se ocultan */
    .accounts thead { display: none; }
    .accounts td:not(.c-cuenta) { display: none; }
    .accounts td { padding: 14px 12px; }
    .acct-m { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 8px; font-size: 12.5px; color: var(--secondary-foreground); }
    .acct-m .use, .acct-m .linea { flex-basis: 100%; }
    .acct-m .use-bar { max-width: 220px; }
${A.CSS_PAGINACION_MQ600}    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 14px 12px; }
    .sk-row > .sk-col, .sk-head { display: none; }
    .profile-head h1 { font-size: 23px; }
    .facts { grid-template-columns: minmax(0, 1fr); }
    .facts dt { padding-bottom: 0; font-size: 13px; }
    .facts dd { border-top: 0; padding-top: 2px; }
    .action .btn { width: 100%; min-height: 44px; }
  }
`;

// ---------- Piezas de la pantalla ----------
const privacidad = A.privacidad;

function encabezadoLista() {
  return `
        <div class="page-head">
          <div>
            <h1>Cuentas</h1>
            <p>Clientes y cuentas internas. Abre una ficha para suspenderla o reactivarla.</p>
          </div>
          <a class="btn btn-primary" href="../alta-interna/alta-interna.html">${icon('userPlus', 16)}<span>Nueva cuenta interna</span></a>
        </div>${privacidad()}`;
}

const busqueda = (valor = '') => A.busqueda({ valor });

const estadoBadge = (e) => (e === 'suspendida'
  ? `<span class="badge badge-off">${icon('ban', 13)}Suspendida</span>`
  : `<span class="badge badge-ok">${icon('ok', 13)}Activa</span>`);
const verif = (v) => `<span class="yesno">${icon(v ? 'check' : 'minus', 14)}${v ? 'Sí' : 'No'}</span>`;
// Barra de uso (QuotaBar en miniatura): el tramo 70/90 es el de la spec 007 (espacio/espacio.js), sin repetirlo aquí.
const barraUso = (pct) => `<span class="use-bar use-${tramoDe(pct)}" aria-hidden="true"><span style="width: ${pct}%"></span></span>`;
const uso = (usado, total, pct) => `<span class="use"><span class="use-text">${usado} de ${total} · ${pct} %</span>${barraUso(pct)}</span>`;
const NA = '<span class="na" aria-hidden="true">—</span><span class="sr-only">No aplica: cuenta interna</span>';

// Ficha de cada fila: solo Laura Barrios (ficha) y la propia cuenta (propia-cuenta) tienen una ficha dibujada sin diálogo
// ni aviso (c.ficha). Las demás quedan en «#»: llevarlas a la ficha de Laura mostraría a otra persona con otros datos.

// Resumen de la fila a 360 px (la tabla oculta las demás columnas): estado, rol, verificación y uso o «cuenta interna».
function filaMovil(c) {
  const comun = `${estadoBadge(estadoDe(c))}<span>${c.rol}</span><span aria-hidden="true">·</span><span>${verificada(c) ? 'Correo verificado' : 'Correo sin verificar'}</span>`;
  if (esInterna(c)) return `${comun}<span class="num linea">Cuenta interna · alta: ${c.alta}</span>`;
  return `${comun}<span class="use"><span class="use-text">${c.plan.nombre} · ${c.usado} de ${c.plan.espacio} · ${c.pct} %</span>${barraUso(c.pct)}</span><span class="num">Alta: ${c.alta}</span>`;
}

function fila(c) {
  const tu = esPropia(c) ? '<span class="you">TÚ</span>' : '';
  return `
            <tr>
              <td class="c-cuenta"><div class="acct"><a class="acct-link" href="${c.ficha || '#'}">${c.nombre}</a>${tu}<span class="acct-mail">${c.correo}</span><div class="acct-m">${filaMovil(c)}</div></div></td>
              <td class="c-rol">${c.rol}</td>
              <td class="c-estado">${estadoBadge(estadoDe(c))}</td>
              <td class="c-verif">${verif(verificada(c))}</td>
              <td class="c-plan">${esInterna(c) ? NA : c.plan.nombre}</td>
              <td class="c-uso">${esInterna(c) ? NA : uso(c.usado, c.plan.espacio, c.pct)}</td>
              <td class="c-alta">${c.alta}</td>
            </tr>`;
}

function tabla() {
  return `
        <div class="accounts">
          <table>
            <caption class="sr-only">Cuentas, ordenadas por fecha de alta, de la más reciente</caption>
            <thead><tr><th scope="col" class="c-cuenta">Cuenta</th><th scope="col" class="c-rol">Rol</th><th scope="col" class="c-estado">Estado</th><th scope="col" class="c-verif">Verificada</th><th scope="col" class="c-plan">Plan</th><th scope="col" class="c-uso">Espacio usado</th><th scope="col" class="c-alta">Alta</th></tr></thead>
            <tbody>${CUENTAS.map(fila).join('')}
            </tbody>
          </table>
        </div>${A.paginacion({ aria: 'Paginación de cuentas', total: C.TOTAL_CUENTAS, cosas: 'cuentas' })}`;
}

function vacio(q) {
  return `
        <section class="state state-empty" aria-labelledby="vacio-t" role="status">
          ${icon('search', 36)}
          <h2 id="vacio-t">No encontramos ninguna cuenta con «${q}».</h2>
          <p>Revisa que el correo esté bien escrito o vuelve a la lista completa.</p>
          <button class="btn btn-outline" type="button">${icon('x', 16)}Limpiar búsqueda</button>
        </section>`;
}

const SK = [['w60', 'w70', 'w50', 'w30', 'w60', 'w80', 'w70'], ['w50', 'w60', 'w50', 'w30', 'w50', 'w70', 'w70'],
  ['w70', 'w80', 'w60', 'w30', 'w60', 'w80', 'w70'], ['w40', 'w60', 'w50', 'w30', 'w50', 'w60', 'w70'],
  ['w60', 'w70', 'w60', 'w30', 'w60', 'w80', 'w70'], ['w50', 'w60', 'w50', 'w30', 'w40', 'w70', 'w70']];
function cargando() {
  const filaSk = (r) => `
            <div class="sk-row"><div class="sk-two"><span class="skeleton-line ${r[0]}"></span><span class="skeleton-line ${r[1]}"></span></div>${r.slice(2).map((w) => `<div class="sk-col"><span class="skeleton-line ${w}"></span></div>`).join('')}<div class="sk-col"><span class="skeleton-line w70"></span></div></div>`;
  return `
        <div aria-busy="true">
          <div class="accounts" aria-hidden="true">
            <div class="sk-row sk-head">${'<span class="skeleton-line"></span>'.repeat(7)}</div>${SK.map(filaSk).join('')}
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando cuentas…</p>
        </div>`;
}

const error = () => A.estadoError('No pudimos cargar las cuentas.', 'Ninguna cuenta cambió. Revisa tu conexión e inténtalo de nuevo.');

// ---------- Ficha de una cuenta ----------
// c: cuenta de CUENTAS; estado puede sobrescribirse (tras suspender). Las internas no tienen plan ni archivos.
function datosPlan(c) {
  if (esInterna(c)) {
    return `<dt>Código de empleado</dt><dd class="num">${c.codigo}</dd>
              <dt>Plan y espacio</dt><dd>No aplica<span class="note">Las cuentas internas no guardan archivos.</span></dd>`;
  }
  return `<dt>Plan</dt><dd>${c.plan.nombre}</dd>
              <dt>Espacio usado</dt><dd><span class="use-text num">${c.usado} de ${c.plan.espacio} (${c.pct} %)</span>${barraUso(c.pct)}</dd>`;
}

function datosCuenta(c, estado) {
  return `
          <section class="card" aria-labelledby="datos-t">
            <h2 id="datos-t">Datos de la cuenta</h2>
            <p class="sub">Solo datos de la cuenta y de su uso; sin archivos.</p>
            <dl class="facts">
              <dt>Rol</dt><dd>${c.rol}${esInterna(c) ? '<span class="note">Cuenta interna</span>' : ''}</dd>
              <dt>Estado</dt><dd>${estadoBadge(estado)}</dd>
              <dt>Correo verificado</dt><dd>${verif(verificada(c))}</dd>
              ${datosPlan(c)}
              <dt>Fecha de alta</dt><dd class="num">${c.alta}</dd>
            </dl>
          </section>`;
}

// Bloque de una acción de la ficha: título, explicación y control.
const accion = (titulo, texto, control) => `
            <div class="action">
              <h3>${titulo}</h3>
              <p>${texto}</p>
              ${control}
            </div>`;

const accionMetadatos = (c) => (esInterna(c) ? '' : accion('Metadatos de archivos',
  `Nombre, tipo, tamaño, fechas y estado de sus archivos. La consulta queda en la auditoría que ve ${c.nombre.split(' ')[0]}.`,
  `<a class="btn btn-outline" href="../soporte/soporte--desde-admin.html">${icon('fileSearch', 16)}<span>Ver metadatos de archivos</span></a>`));

// Suspender, reactivar o, en la cuenta propia, el aviso de que no se puede (CA-4).
function accionCambio(estado, propia) {
  if (propia) {
    return `
            <div class="action">
              <div class="info-box">${icon('info', 16)}<p><strong>No puedes suspender tu propia cuenta.</strong>Si necesitas hacerlo, pídeselo a otro Administrador.</p></div>
            </div>`;
  }
  if (estado === 'suspendida') {
    return accion('Reactivar cuenta',
      'Podrá iniciar sesión de nuevo y sus comparticiones y enlaces vuelven como estaban. Las sesiones cerradas no vuelven.',
      `<button class="btn btn-primary" type="button">${icon('userCheck', 16)}Reactivar cuenta</button>`);
  }
  return accion('Suspender cuenta',
    'Cierra sus sesiones y pausa sus comparticiones y enlaces mientras esté suspendida. No borra nada.',
    `<a class="btn btn-destructive-outline" href="admin--confirmar-suspender.html">${icon('ban', 16)}Suspender cuenta</a>`);
}

function encabezadoFicha(c, estado, propia) {
  return `
        <a class="back" href="admin.html">${icon('arrowLeft', 16)}Volver a cuentas</a>
        <div class="profile-head">
          <div>
            <h1>${c.nombre}${propia ? ' <span class="you">TÚ</span>' : ''}</h1>
            <p class="mail">${c.correo}</p>
          </div>
          <div class="badges">${estadoBadge(estado)}<span class="badge badge-role">${icon(A.ICONO_ROL[c.rol], 13)}${c.rol}</span></div>
        </div>`;
}

function ficha(c, { estado = estadoDe(c), exito = '', propia = false } = {}) {
  const nota = propia ? '' : '<p class="sub">Cada acción queda en la auditoría de la cuenta con tu nombre y rol.</p>';
  return `${encabezadoFicha(c, estado, propia)}${exito}${privacidad()}
        <div class="ficha-grid">${datosCuenta(c, estado)}
          <section class="card" aria-labelledby="acciones-t">
            <h2 id="acciones-t">Acciones</h2>
            ${nota}${accionMetadatos(c)}${accionCambio(estado, propia)}
          </section>
        </div>`;
}

const exitoSuspension = `
        <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Esta cuenta quedó suspendida y se cerraron sus sesiones.</p><p class="alert-text">Sus comparticiones y enlaces públicos están en pausa hasta que la reactives. No se borró nada.</p></div></div>`;

const { dialogo } = A;

const DLG_SUSPENDER = dialogo({
  titulo: `¿Suspender la cuenta de ${C.LAURA.nombre}?`,
  quienLinea: `${C.LAURA.correo} no podrá iniciar sesión hasta que la reactives.`,
  items: [
    ['logout', 'Se cerrarán sus sesiones abiertas en todos sus dispositivos.'],
    ['link', 'Sus comparticiones y enlaces públicos dejarán de funcionar mientras esté suspendida.'],
    ['database', 'No se borra nada: al reactivarla, sus archivos, comparticiones y enlaces vuelven como estaban.'],
    ['history', 'La acción queda en su auditoría con tu nombre y rol.'],
  ],
  confirmar: 'Suspender cuenta', clase: 'btn-destructive', ic: 'ban', cancelar: C.LAURA.ficha,
});

const DLG_REACTIVAR = dialogo({
  titulo: `¿Reactivar la cuenta de ${C.LAURA.nombre}?`,
  quienLinea: `${C.LAURA.correo} podrá volver a iniciar sesión.`,
  items: [
    ['link', 'Sus comparticiones y enlaces públicos vuelven a funcionar como estaban.'],
    ['logout', 'Las sesiones que se cerraron al suspenderla no vuelven: tendrá que iniciar sesión de nuevo.'],
    ['history', 'La acción queda en su auditoría con tu nombre y rol.'],
  ],
  confirmar: 'Reactivar cuenta', clase: 'btn-primary-dlg', ic: 'userCheck',
});

// ---------- Página ----------
function page(v, file) {
  return A.pagina({
    titulo: `${v.ficha ? v.ficha : 'Cuentas'} · Administración · Nimbo — ${v.estado}`,
    comentarios: A.comentariosDe('administración, cuentas y ficha', v.estado, 'admin'),
    css: CSS,
    rotulo: v.ficha ? 'Ficha de cuenta' : 'Cuentas',
    file,
    estado: v.titulo,
    crumbs: v.ficha ? ['Administración', 'Cuentas', v.ficha] : ['Administración', 'Cuentas'],
    cuerpo: v.cuerpo(),
    dialogo: v.dialogo || '',
  });
}

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'default', titulo: 'lista paginada de cuentas (clientes e internas)',
    cuerpo: () => encabezadoLista() + busqueda() + tabla() },
  { estado: 'vacio', titulo: 'búsqueda por correo sin resultados',
    cuerpo: () => encabezadoLista() + busqueda('maria.lopez@gmail.com') + vacio('maria.lopez@gmail.com') },
  { estado: 'cargando', titulo: 'esqueleto de la lista mientras llega GET de cuentas',
    cuerpo: () => encabezadoLista() + busqueda() + cargando() },
  { estado: 'error', titulo: 'falló la lista: error con «Reintentar»',
    cuerpo: () => encabezadoLista() + busqueda() + error() },
  { estado: 'ficha', titulo: 'ficha de una clienta activa, sin diálogo ni aviso', ficha: C.LAURA.nombre,
    cuerpo: () => ficha(C.LAURA) },
  { estado: 'confirmar-suspender', titulo: 'ficha de una clienta activa con la confirmación de suspender', ficha: C.LAURA.nombre,
    cuerpo: () => ficha(C.LAURA), dialogo: DLG_SUSPENDER },
  { estado: 'suspendida', titulo: 'ficha tras suspender: aviso de éxito y «Reactivar cuenta»', ficha: C.LAURA.nombre,
    cuerpo: () => ficha(C.LAURA, { estado: 'suspendida', exito: exitoSuspension }) },
  { estado: 'confirmar-reactivar', titulo: 'ficha suspendida con la confirmación de reactivar', ficha: C.LAURA.nombre,
    cuerpo: () => ficha(C.LAURA, { estado: 'suspendida' }), dialogo: DLG_REACTIVAR },
  { estado: 'propia-cuenta', titulo: 'ficha propia: sin «Suspender» (CA-4, RN-7)', ficha: C.MONICA.nombre,
    cuerpo: () => ficha(C.MONICA, { propia: true }) },
];

for (const v of ESTADOS) {
  const file = A.archivoDe('admin', v.estado);
  A.escribir(OUT, file, page(v, file));
}
