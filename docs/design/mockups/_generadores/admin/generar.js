// Genera los mockups autocontenidos de backoffice/admin (spec 011: cuentas y ficha), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común y página) viene
// de admin/area.js, que a su vez usa el CSS del marco de marco/marco.js (el mismo de identity/seguridad, shared/layout
// y storage). Aquí solo va lo propio de cuentas y ficha.
const fs = require('node:fs');
const path = require('node:path');
const A = require('./area.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/backoffice/admin');
fs.mkdirSync(OUT, { recursive: true });

const { icon, YO, TOTAL } = A;

// ---------- Datos de ejemplo (en la app vienen de la API; planes y cuotas del catálogo, product-context §3) ----------
const PAGINAS = '129';

// [nombre, correo, rol, estado, verificada, plan, usado, total, pct, alta, extra]
// Ordenadas por fecha de alta, de la más reciente. Las internas no tienen plan ni archivos.
const CUENTAS = [
  ['Diego Coj', 'diego.coj@gmail.com', 'Cliente', 'activa', false, 'Personal', '0 B', '15 GB', 0, '02/10/2026'],
  ['Andrea Ruiz', 'andrea.ruiz@nimbo.gt', 'Soporte', 'activa', true, null, null, null, null, '28/09/2026'],
  ['Lucía Barrios', 'lucia.barrios@gmail.com', 'Cliente', 'activa', true, 'Personal', '3.2 GB', '15 GB', 21, '21/09/2026'],
  ['Juan Cortés', 'jcortes@gmail.com', 'Cliente', 'activa', true, 'Personal', '14.8 GB', '15 GB', 99, '18/09/2026'],
  ['Pablo Xicará', 'pablo.xicara@nimbo.gt', 'Operador', 'activa', true, null, null, null, null, '10/09/2026'],
  ['Sofía Marroquín', 'sofia@emarroquin.gt', 'Cliente', 'suspendida', true, 'Pro', '62 GB', '100 GB', 62, '07/09/2026'],
  ['Ana Gutiérrez', 'agutierrez@alpha.gt', 'Cliente', 'activa', true, 'Pro', '41 GB', '100 GB', 41, '03/09/2026'],
  ['Laura Barrios', 'laura.barrios@alpha.gt', 'Cliente', 'activa', true, 'Equipo', '304 GB', '350 GB', 87, '01/09/2026'],
  ['Carlos Méndez', 'ti@uvalle.edu.gt', 'Cliente', 'activa', true, 'Institucional', '1.2 TB', '2 TB', 60, '31/08/2026'],
  [YO.nombre, YO.correo, 'Administrador', 'activa', true, null, null, null, null, '28/08/2026', 'tu'],
];
const LAURA = CUENTAS.find((c) => c[0] === 'Laura Barrios');
const MONICA = CUENTAS.find((c) => c[0] === YO.nombre);

// ---------- CSS ----------
const CSS = A.CSS + `
  /* Propio de backoffice/admin (spec 011: cuentas y ficha) */

  /* Búsqueda por correo (Input + Button) */
  .search { margin-top: 20px; }
  .search label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
  .search-row { display: flex; gap: 10px; max-width: 560px; }
  .input-wrap { position: relative; flex: 1; min-width: 0; }
  .input-wrap .ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted-foreground); pointer-events: none; }
  .input { width: 100%; min-height: 40px; padding: 8px 12px 8px 38px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .input::placeholder { color: var(--muted-foreground); }
  .input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .search-hint { margin: 6px 0 0; font-size: 12.5px; color: var(--muted-foreground); }

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

  /* StatusBadge: ícono + etiqueta (Art. XIII.4) */
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; line-height: 1.5; white-space: nowrap; border: 1px solid transparent; }
  .badge-ok { color: var(--success-foreground); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 40%, var(--card)); }
  .badge-off { color: var(--destructive); background: var(--destructive-tint); border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .badge-role { color: var(--secondary-foreground); background: var(--muted); border-color: var(--border); }

  /* Uso del espacio (QuotaBar en miniatura: tramo por color y siempre GB y % en texto) */
  .use-text { display: block; font-size: 12.5px; color: var(--secondary-foreground); white-space: nowrap; }
  .use-bar { display: block; height: 5px; margin-top: 5px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .use-bar span { display: block; height: 100%; border-radius: 999px; background: var(--success); }
  .use-warn span { background: var(--warning); }
  .use-full span { background: var(--destructive-soft); }

  /* Paginación */
  .pager { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; color: var(--secondary-foreground); }
  .pager p { margin: 0; }
  .pager-ctrl { display: flex; align-items: center; gap: 8px; }
  .pager-page { min-width: 96px; text-align: center; white-space: nowrap; }

  /* Estados de la lista (StateView): vacío, cargando y error */
  .state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; margin-top: 16px; padding: 32px; text-align: center; border-radius: var(--radius-lg); }
  .state h2 { margin: 12px 0 6px; font-size: 16px; line-height: 1.5; font-weight: 600; }
  .state p { margin: 0 0 20px; max-width: 48ch; font-size: 14px; }
  .state-empty { background: var(--card); border: 1px dashed var(--input); box-shadow: var(--shadow-card); }
  .state-empty > .ico { color: var(--muted-foreground); }
  .state-empty p { color: var(--secondary-foreground); }
  .state-error { border: 1px dashed color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .state-error > .ico, .state-error h2 { color: var(--destructive); }
  .state-error p { color: var(--foreground); }
  .sk-row { display: grid; grid-template-columns: minmax(0, 1fr) 124px 136px 100px 112px 176px 104px; gap: 0 14px; align-items: center; padding: 14px; border-bottom: 1px solid var(--border); }
  .sk-row:last-child { border-bottom: 0; }
  .sk-head { padding: 12px 14px; background: var(--background); }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .sk-head .skeleton-line { height: 10px; width: 60%; background: var(--border); }
  .sk-two .skeleton-line + .skeleton-line { margin-top: 7px; height: 10px; }
  .w30 { width: 30%; } .w40 { width: 40%; } .w50 { width: 50%; } .w60 { width: 60%; } .w70 { width: 70%; } .w80 { width: 80%; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }

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
  .btn-destructive-outline { color: var(--destructive); background: var(--card); border: 1px solid var(--destructive); }
  .btn-destructive-outline:hover { background: var(--destructive-tint); }

  /* Diálogo: lista de consecuencias */
  .dialog { top: 120px; width: min(500px, calc(100% - 32px)); }
  .dialog .who-line { margin-top: 6px; font-weight: 500; color: var(--foreground); overflow-wrap: anywhere; }
  .conseq { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
  .conseq li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--secondary-foreground); }
  .conseq .ico { margin-top: 2px; color: var(--secondary-foreground); }
  .btn-primary-dlg { color: var(--primary-foreground); background: var(--primary); border: 1px solid var(--primary); box-shadow: var(--shadow-button); }

  @media (max-width: 900px) {
    .ficha-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 1180px) and (min-width: 601px) {
    .c-verif, .c-alta { display: none; }
  }
  @media (max-width: 600px) {
    .page-head .btn { width: 100%; }
    .search-row { max-width: none; }
    .input { min-height: 44px; }
    .search .btn { min-height: 44px; }
    /* Tabla → filas apiladas: la primera celda resume todo; el resto de columnas se ocultan */
    .accounts thead { display: none; }
    .accounts td:not(.c-cuenta) { display: none; }
    .accounts td { padding: 14px 12px; }
    .acct-m { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 8px; font-size: 12.5px; color: var(--secondary-foreground); }
    .acct-m .use { flex-basis: 100%; }
    .acct-m .use-bar { max-width: 220px; }
    .pager { flex-direction: column; align-items: stretch; }
    .pager p { text-align: center; }
    .pager-ctrl { justify-content: space-between; }
    .pager-ctrl .btn { min-height: 44px; }
    .pager-page { min-width: 0; }
    .state { padding: 28px 16px; }
    .state .btn { width: 100%; }
    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 14px 12px; }
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
          <a class="btn btn-primary" href="#">${icon('userPlus', 16)}<span>Nueva cuenta interna</span></a>
        </div>${privacidad()}`;
}

function busqueda(valor = '') {
  return `
        <form class="search" role="search" aria-label="Buscar cuentas" onsubmit="return false">
          <label for="q">Buscar por correo</label>
          <div class="search-row">
            <div class="input-wrap">${icon('search', 16)}<input class="input" id="q" name="q" type="search" inputmode="email" autocomplete="off" placeholder="nombre@dominio.com" value="${valor}"></div>
            <button class="btn btn-outline" type="submit">Buscar</button>
          </div>
        </form>`;
}

const tramo = (pct) => (pct >= 90 ? 'use-full' : pct >= 70 ? 'use-warn' : 'use-ok');
const estadoBadge = (e) => (e === 'suspendida'
  ? `<span class="badge badge-off">${icon('ban', 13)}Suspendida</span>`
  : `<span class="badge badge-ok">${icon('ok', 13)}Activa</span>`);
const verif = (v) => `<span class="yesno">${icon(v ? 'check' : 'minus', 14)}${v ? 'Sí' : 'No'}</span>`;
const uso = (usado, total, pct) => `<span class="use"><span class="use-text">${usado} de ${total} · ${pct} %</span><span class="use-bar ${tramo(pct)}" aria-hidden="true"><span style="width: ${Math.max(pct, 0)}%"></span></span></span>`;
const NA = '<span class="na" aria-hidden="true">—</span><span class="sr-only">No aplica: cuenta interna</span>';

function fila(c) {
  const [nombre, correo, rol, estado, verificada, plan, usado, total, pct, alta, extra] = c;
  const tu = extra === 'tu' ? '<span class="you">TÚ</span>' : '';
  const movil = plan
    ? `${estadoBadge(estado)}<span>${rol}</span><span aria-hidden="true">·</span><span>${verificada ? 'Correo verificado' : 'Correo sin verificar'}</span><span class="use"><span class="use-text">${plan} · ${usado} de ${total} · ${pct} %</span><span class="use-bar ${tramo(pct)}" aria-hidden="true"><span style="width: ${pct}%"></span></span></span><span class="num">Alta: ${alta}</span>`
    : `${estadoBadge(estado)}<span>${rol}</span><span aria-hidden="true">·</span><span>${verificada ? 'Correo verificado' : 'Correo sin verificar'}</span><span class="num" style="flex-basis: 100%">Cuenta interna · alta: ${alta}</span>`;
  return `
            <tr>
              <td class="c-cuenta"><div class="acct"><a class="acct-link" href="#">${nombre}</a>${tu}<span class="acct-mail">${correo}</span><div class="acct-m">${movil}</div></div></td>
              <td class="c-rol">${rol}</td>
              <td class="c-estado">${estadoBadge(estado)}</td>
              <td class="c-verif">${verif(verificada)}</td>
              <td class="c-plan">${plan || NA}</td>
              <td class="c-uso">${plan ? uso(usado, total, pct) : NA}</td>
              <td class="c-alta">${alta}</td>
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
        </div>
        <nav class="pager" aria-label="Paginación de cuentas">
          <p class="num">Mostrando 1–10 de ${TOTAL} cuentas</p>
          <div class="pager-ctrl">
            <button class="btn btn-outline btn-sm" type="button" disabled>${icon('chevLeft', 16)}Anterior</button>
            <span class="pager-page num" aria-current="page">Página 1 de ${PAGINAS}</span>
            <button class="btn btn-outline btn-sm" type="button">Siguiente${icon('chevRight', 16)}</button>
          </div>
        </nav>`;
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

function error() {
  return `
        <div class="state state-error" role="alert">
          ${icon('alert', 36)}
          <h2>No pudimos cargar las cuentas.</h2>
          <p>Ninguna cuenta cambió. Revisa tu conexión e inténtalo de nuevo.</p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;
}

// Ficha de una cuenta. c: fila de CUENTAS; estado puede sobrescribirse (tras suspender).
function ficha(c, { estado = c[3], exito = '', propia = false } = {}) {
  const [nombre, correo, rol, , verificada, plan, usado, total, pct, alta] = c;
  const interna = !plan;
  const datos = `
          <section class="card" aria-labelledby="datos-t">
            <h2 id="datos-t">Datos de la cuenta</h2>
            <p class="sub">Solo datos de la cuenta y de su uso; sin archivos.</p>
            <dl class="facts">
              <dt>Rol</dt><dd>${rol}${interna ? '<span class="note">Cuenta interna</span>' : ''}</dd>
              <dt>Estado</dt><dd>${estadoBadge(estado)}</dd>
              <dt>Correo verificado</dt><dd>${verif(verificada)}</dd>
              ${interna
    ? `<dt>Código de empleado</dt><dd class="num">EMP-0001</dd>
              <dt>Plan y espacio</dt><dd>No aplica<span class="note">Las cuentas internas no guardan archivos.</span></dd>`
    : `<dt>Plan</dt><dd>${plan}</dd>
              <dt>Espacio usado</dt><dd><span class="use-text num">${usado} de ${total} (${pct} %)</span><span class="use-bar ${tramo(pct)}" aria-hidden="true"><span style="width: ${pct}%"></span></span></dd>`}
              <dt>Fecha de alta</dt><dd class="num">${alta}</dd>
            </dl>
          </section>`;
  const metadatos = interna ? '' : `
            <div class="action">
              <h3>Metadatos de archivos</h3>
              <p>Nombre, tipo, tamaño, fechas y estado de sus archivos. La consulta queda en la auditoría que ve ${nombre.split(' ')[0]}.</p>
              <a class="btn btn-outline" href="#">${icon('fileSearch', 16)}<span>Ver metadatos de archivos</span></a>
            </div>`;
  let cambio;
  if (propia) {
    cambio = `
            <div class="action">
              <div class="info-box">${icon('info', 16)}<p><strong>No puedes suspender tu propia cuenta.</strong>Si necesitas hacerlo, pídeselo a otro Administrador.</p></div>
            </div>`;
  } else if (estado === 'suspendida') {
    cambio = `
            <div class="action">
              <h3>Reactivar cuenta</h3>
              <p>Podrá iniciar sesión de nuevo y sus comparticiones y enlaces vuelven como estaban. Las sesiones cerradas no vuelven.</p>
              <button class="btn btn-primary" type="button">${icon('userCheck', 16)}Reactivar cuenta</button>
            </div>`;
  } else {
    cambio = `
            <div class="action">
              <h3>Suspender cuenta</h3>
              <p>Cierra sus sesiones y pausa sus comparticiones y enlaces mientras esté suspendida. No borra nada.</p>
              <button class="btn btn-destructive-outline" type="button">${icon('ban', 16)}Suspender cuenta</button>
            </div>`;
  }
  return `
        <a class="back" href="admin.html">${icon('arrowLeft', 16)}Volver a cuentas</a>
        <div class="profile-head">
          <div>
            <h1>${nombre}${propia ? ' <span class="you">TÚ</span>' : ''}</h1>
            <p class="mail">${correo}</p>
          </div>
          <div class="badges">${estadoBadge(estado)}<span class="badge badge-role">${icon(interna ? 'shield' : 'users', 13)}${rol}</span></div>
        </div>${exito}${privacidad()}
        <div class="ficha-grid">${datos}
          <section class="card" aria-labelledby="acciones-t">
            <h2 id="acciones-t">Acciones</h2>
            ${propia ? "" : `<p class="sub">Cada acción queda en la auditoría de la cuenta con tu nombre y rol.</p>`}${metadatos}${cambio}
          </section>
        </div>`;
}

const exitoSuspension = `
        <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Esta cuenta quedó suspendida y se cerraron sus sesiones.</p><p class="alert-text">Sus comparticiones y enlaces públicos están en pausa hasta que la reactives. No se borró nada.</p></div></div>`;

function dialogo({ titulo, quienLinea, items, confirmar, clase, ic }) {
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">${titulo}</h2>
    <div id="dlg-d">
      <p class="who-line">${quienLinea}</p>
      <ul class="conseq">${items.map(([i, t]) => `\n        <li>${icon(i, 16)}<span>${t}</span></li>`).join('')}
      </ul>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button" autofocus>Cancelar</button>
      <button class="btn ${clase}" type="button">${icon(ic, 16)}${confirmar}</button>
    </div>
  </div>`;
}

const DLG_SUSPENDER = dialogo({
  titulo: '¿Suspender la cuenta de Laura Barrios?',
  quienLinea: 'laura.barrios@alpha.gt no podrá iniciar sesión hasta que la reactives.',
  items: [
    ['logout', 'Se cerrarán sus sesiones abiertas en todos sus dispositivos.'],
    ['link', 'Sus comparticiones y enlaces públicos dejarán de funcionar mientras esté suspendida.'],
    ['database', 'No se borra nada: al reactivarla, sus archivos, comparticiones y enlaces vuelven como estaban.'],
    ['history', 'La acción queda en su auditoría con tu nombre y rol.'],
  ],
  confirmar: 'Suspender cuenta', clase: 'btn-destructive', ic: 'ban',
});

const DLG_REACTIVAR = dialogo({
  titulo: '¿Reactivar la cuenta de Laura Barrios?',
  quienLinea: 'laura.barrios@alpha.gt podrá volver a iniciar sesión.',
  items: [
    ['link', 'Sus comparticiones y enlaces públicos vuelven a funcionar como estaban.'],
    ['logout', 'Las sesiones que se cerraron al suspenderla no vuelven: tendrá que iniciar sesión de nuevo.'],
    ['history', 'La acción queda en su auditoría con tu nombre y rol.'],
  ],
  confirmar: 'Reactivar cuenta', clase: 'btn-primary-dlg', ic: 'userCheck',
});

// ---------- Página ----------
function page(v) {
  const file = v.estado === 'default' ? 'admin.html' : `admin--${v.estado}.html`;
  return A.pagina({
    titulo: `${v.ficha ? v.ficha : 'Cuentas'} · Administración · Nimbo — ${v.estado}`,
    comentarios: [
      `Mockup de referencia (spec 011: administración, cuentas y ficha). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/admin/generar.js (marco del área en admin/area.js y CSS del marco en marco/marco.js). No editar a mano.',
    ],
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
  { estado: 'confirmar-suspender', titulo: 'ficha de una clienta activa con la confirmación de suspender', ficha: 'Laura Barrios',
    cuerpo: () => ficha(LAURA), dialogo: DLG_SUSPENDER },
  { estado: 'suspendida', titulo: 'ficha tras suspender: aviso de éxito y «Reactivar cuenta»', ficha: 'Laura Barrios',
    cuerpo: () => ficha(LAURA, { estado: 'suspendida', exito: exitoSuspension }) },
  { estado: 'confirmar-reactivar', titulo: 'ficha suspendida con la confirmación de reactivar', ficha: 'Laura Barrios',
    cuerpo: () => ficha(LAURA, { estado: 'suspendida' }), dialogo: DLG_REACTIVAR },
  { estado: 'propia-cuenta', titulo: 'ficha propia: sin «Suspender» (CA-4, RN-7)', ficha: YO.nombre,
    cuerpo: () => ficha(MONICA, { propia: true }) },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'admin.html' : `admin--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
