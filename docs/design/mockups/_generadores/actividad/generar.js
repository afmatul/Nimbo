// Genera los mockups autocontenidos de audit/mi-actividad (spec 004, RF-07), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// Reutiliza el marco (marco/marco.js) y los patrones de identity/seguridad: encabezado de página sin migas, tarjetas,
// alertas, esqueleto, estado de error con correlationId y botones.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const E = require('../mis-archivos/estados.js');
const { icon } = M;

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/audit/mi-actividad');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Datos de ejemplo (hora de Guatemala; hoy es lunes 5 oct 2026). Nunca nombres de archivo (CA-14). ----------
const TU = { quien: 'Tú', ic: 'user', interno: false };
const SOPORTE = { quien: 'Soporte de Nimbo', ic: 'headset', interno: true };
const ADMIN = { quien: 'Administración de Nimbo', ic: 'shieldcheck', interno: true };

const EVENTOS = [
  { iso: '2026-10-05T09:15', fecha: '5 oct 2026', hora: '09:15', origen: SOPORTE, ic: 'undo', accion: 'Soporte de Nimbo restauró 3 elementos', recurso: '3 elementos',
    motivo: 'Restauración pedida por ti en el caso 4821 después de enviar elementos a la papelera por error.' },
  { iso: '2026-10-05T08:02', fecha: '5 oct 2026', hora: '08:02', origen: TU, ic: 'upload', accion: 'Subiste un archivo', recurso: '1 archivo, 12 MB' },
  { iso: '2026-10-04T17:40', fecha: '4 oct 2026', hora: '17:40', origen: TU, ic: 'download', accion: 'Descargaste un archivo', recurso: '1 archivo, 3.4 MB' },
  { iso: '2026-10-04T11:05', fecha: '4 oct 2026', hora: '11:05', origen: TU, ic: 'trash2', accion: 'Moviste 3 elementos a la papelera', recurso: '3 elementos' },
  { iso: '2026-10-02T14:30', fecha: '2 oct 2026', hora: '14:30', origen: ADMIN, ic: 'drive', accion: 'Administración de Nimbo ajustó la cuota de tu cuenta', recurso: 'Cuenta',
    motivo: 'Ampliación temporal de 2 GB aprobada en el caso 4790 para terminar de migrar tus documentos. Se revisará el 30 de octubre.' },
  { iso: '2026-10-01T14:12', fecha: '1 oct 2026', hora: '14:12', origen: TU, ic: 'trash2', accion: 'Vaciaste la papelera', recurso: '14 elementos' },
  { iso: '2026-09-30T10:45', fecha: '30 sept 2026', hora: '10:45', origen: SOPORTE, ic: 'logout', accion: 'Soporte de Nimbo cerró tus sesiones abiertas', recurso: '4 sesiones',
    motivo: 'Reportaste que no reconocías un dispositivo en tu cuenta. Cerramos todas las sesiones y te pedimos cambiar tu contraseña.' },
  { iso: '2026-09-28T13:20', fecha: '28 sept 2026', hora: '13:20', origen: TU, ic: 'circlex', accion: 'Eliminaste definitivamente 2 elementos', recurso: '2 elementos' },
  { iso: '2026-09-27T15:08', fecha: '27 sept 2026', hora: '15:08', origen: TU, ic: 'undo', accion: 'Restauraste 1 archivo', recurso: '1 archivo, 8 MB' },
];
const SOLO_INTERNOS = EVENTOS.filter((e) => e.origen.interno);
const CORRELATION_ID = '2b8d4f60-91c7-4e3a-b5d2-6a0c7e19f3d8';
const CONTEO_TODO = 'Mostrando 9 eventos, del más reciente al más antiguo';

// ---------- CSS: marco compartido + piezas propias ----------
const CSS = '\n' + M.CSS.MARCO + `  .stack { max-width: 880px; display: grid; gap: 16px; margin-top: 22px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 18px 20px; }

` + M.CSS.BOTONES + `
  /* Filtros: origen (grupo de radios en forma de segmentos) y rango de fechas */
  .filters { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px 28px; align-items: start; }
  .filters fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .filters legend { display: block; padding: 0; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
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
  .dates { display: flex; flex-wrap: wrap; gap: 12px; }
  .dates > div { min-width: 0; flex: 1 1 150px; max-width: 220px; }
  .dates label { display: block; margin: 0 0 4px; font-size: 13px; font-weight: 500; color: var(--secondary-foreground); }
  .dates input { width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; }
  .dates input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .dates input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .dates input:disabled { background: var(--muted); color: var(--secondary-foreground); }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 13px; color: var(--destructive); grid-column: 1 / -1; }
  .field-error .ico { margin-top: 2px; }
  .filters-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-height: 36px; }
  .result-count { margin: 0; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .btn-link { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 4px 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--primary); font: inherit; font-size: 13.5px; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .btn-link:hover { background: var(--muted); color: var(--primary-hover); }

  /* Lista cronológica */
  .events { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--card); box-shadow: var(--shadow-card); }
  .event { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 4px 14px; align-items: start; padding: 14px 16px 14px 13px; background: var(--card); border-left: 3px solid transparent; }
  .event + .event { border-top: 1px solid var(--border); }
  .event.is-internal { background: var(--background); border-left-color: var(--primary); }
  .tile { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--brand-soft); color: var(--primary-hover); }
  .is-internal .tile { background: var(--primary-hover); color: var(--primary-foreground); }
  .ev-title { margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.4; }
  .ev-meta { margin: 4px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 13px; color: var(--muted-foreground); }
  .is-internal .ev-meta { color: var(--secondary-foreground); }
  .ev-meta .src { display: inline-flex; align-items: center; gap: 6px; }
  .ev-meta .src b { font-weight: 600; color: var(--secondary-foreground); }
  .ev-meta .res { font-variant-numeric: tabular-nums; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; line-height: 1.5; background: var(--brand-soft); color: var(--primary-hover); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 35%, var(--card)); }
  .reason { margin: 10px 0 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card); }
  .reason .reason-label { display: flex; align-items: center; gap: 6px; margin: 0 0 2px; font-size: 12px; font-weight: 600; color: var(--primary-hover); }
  .reason p:last-child { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--foreground); overflow-wrap: anywhere; }
  .when { margin: 0; text-align: right; font-size: 13px; line-height: 1.4; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .when .d { display: block; font-weight: 600; color: var(--foreground); }
  .when .h { display: block; color: var(--muted-foreground); }
  .is-internal .when .h { color: var(--secondary-foreground); }

` + E.CSS_CARGAR_MAS + E.CSS_CARGAR_MAS_FIN + E.CSS_ALERT + `
  /* Esqueleto y estados de pantalla */
  .skeleton-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 90px; gap: 14px; align-items: center; padding: 16px; background: var(--card); }
  .skeleton-row + .skeleton-row { border-top: 1px solid var(--border); }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .skeleton-line.box { height: 40px; border-radius: var(--radius-md); }
  .skeleton-line.w60 { width: 60%; } .skeleton-line.w40 { width: 40%; margin-top: 8px; height: 10px; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .state { padding: 36px 20px; border: 1px dashed var(--input); border-radius: var(--radius-lg); background: var(--card); text-align: center; }
  .state > .ico { color: var(--brand); }
  .state h2 { margin: 10px 0 4px; font-size: 16px; font-weight: 600; }
  .state p { margin: 0 auto 16px; max-width: 52ch; color: var(--secondary-foreground); font-size: 13.5px; }
  .state p:last-child { margin-bottom: 0; }
  .state-error { border-color: color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .state-error > .ico { color: var(--destructive); }
  .state-error h2 { color: var(--destructive); }
  .state-error p { color: var(--foreground); }
  code { font-family: inherit; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

  /* Menú de la cuenta abierto (DropdownMenu de shadcn); mismo CSS que shared/layout */
` + M.EXTRA.slice(M.EXTRA.indexOf('  .topbar { position: relative; }'), M.EXTRA.indexOf('  /* Cajón móvil')) + M.CSS.MQ_900 + `
  @media (max-width: 1180px) { .stack { max-width: 720px; } }
  @media (max-width: 760px) { .filters { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) {
` + M.CSS.MQ600_MARCO + `    .stack { margin-top: 16px; }
    .card { padding: 14px; }
    .segments { display: flex; width: 100%; }
    .segments label { flex: 1 1 0; justify-content: center; text-align: center; padding: 6px 4px; min-height: 44px; font-size: 13px; }
    .dates > div { flex: 1 1 100%; max-width: none; }
    .dates input { min-height: 44px; }
    .event { grid-template-columns: 40px minmax(0, 1fr); padding: 14px 12px 14px 9px; }
    .event .tile { grid-row: 1 / span 2; }
    .event .when { grid-column: 2; grid-row: 1; text-align: left; white-space: normal; }
    .event .when .d, .event .when .h { display: inline; }
    .event .when .h::before { content: " · "; }
    .event .body { grid-column: 2; grid-row: 2; }
    .skeleton-row { grid-template-columns: 40px minmax(0, 1fr); }
    .skeleton-row .w-date { display: none; }
` + E.CSS_ALERT_MQ600 + E.CSS_ALERT_SIN_CERRAR_MQ600 + E.CSS_CARGAR_MAS_MQ600 + `    .state .btn { width: 100%; }
    .account { position: static; }
    .account-pop { top: calc(100% - 2px); right: 8px; width: min(272px, calc(100% - 16px)); }
    .account-menu [role="menuitem"] { min-height: 44px; }
  }
  .account-menu [aria-current="page"] { background: var(--accent); font-weight: 600; }
  [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { .skeleton-line, .spin { animation: none !important; } }
`;

// ---------- Piezas ----------
function eventRow(e) {
  const o = e.origen;
  const badge = o.interno ? `<span class="badge">${icon('shieldcheck', 13)}Acción interna</span>` : '';
  const motivo = e.motivo
    ? `<div class="reason"><p class="reason-label">${icon('message', 14)}Motivo escrito por ${o.quien}</p><p>${e.motivo}</p></div>`
    : '';
  return `
          <li class="event${o.interno ? ' is-internal' : ''}">
            <span class="tile">${icon(e.ic, 20)}</span>
            <div class="body">
              <p class="ev-title">${e.accion}</p>
              <p class="ev-meta">${badge}<span class="src">${icon(o.ic, 14)}<span>Origen: <b>${o.quien}</b></span></span><span class="res">${e.recurso}</span></p>
              ${motivo}
            </div>
            <p class="when"><time datetime="${e.iso}-06:00"><span class="d">${e.fecha}</span><span class="h">${e.hora}</span></time></p>
          </li>`;
}

function filtros(f, { conteo = '', deshabilitado = false } = {}) {
  const dis = deshabilitado ? ' disabled' : '';
  const radio = (v, label) =>
    `<label><input type="radio" name="origen" value="${v}"${f.origen === v ? ' checked' : ''}${dis}>${icon('check', 14)}${label}</label>`;
  const inval = f.error ? ' aria-invalid="true" aria-describedby="err-rango"' : '';
  const limpiar = f.activo ? `<button class="btn-link" type="button">${icon('x', 14)}Limpiar filtros</button>` : '';
  return `
      <section class="card" aria-labelledby="t-filtros">
        <h2 id="t-filtros" class="sr-only">Filtros</h2>
        <form class="filters" novalidate>
          <fieldset>
            <legend>Origen</legend>
            <div class="segments">
              ${radio('todo', 'Todo')}${radio('yo', 'Yo')}${radio('nimbo', 'Personal de Nimbo')}
            </div>
          </fieldset>
          <fieldset>
            <legend>Fechas</legend>
            <div class="dates">
              <div><label for="desde">Desde</label><input id="desde" name="desde" type="date" value="${f.desde || ''}"${inval}${dis}></div>
              <div><label for="hasta">Hasta</label><input id="hasta" name="hasta" type="date" value="${f.hasta || ''}"${inval}${dis}></div>
            </div>
          </fieldset>
          ${f.error ? `<p class="field-error" id="err-rango" role="alert">${icon('alert', 15)}<span>${f.error}</span></p>` : ''}
          <div class="filters-foot">
            <p class="result-count" role="status">${conteo}</p>${limpiar}
          </div>
        </form>
      </section>`;
}

// Pie de la lista: «Cargar más» de mis-archivos/estados.js con los textos de Mi actividad
const TEXTOS_MAS = {
  anuncio: 'Cargando más actividad…',
  error: { titulo: 'No pudimos cargar más actividad.', texto: 'Intenta de nuevo; lo que ya ves no cambió.', cerrar: false },
  fin: 'Llegaste al final: no hay actividad más antigua.',
};
const PIES = { 'cargar-mas': 'listo', 'cargando-mas': 'cargando', 'cargar-mas-error': 'error', fin: 'fin' };
const pieDe = (pie) => (PIES[pie] ? E.cargarMas(PIES[pie], TEXTOS_MAS) : '');

function lista(eventos, pie) {
  return `
      <section aria-labelledby="t-lista"${pie === 'cargando-mas' ? ' aria-busy="true"' : ''}>
        <h2 id="t-lista" class="sr-only">Eventos, del más reciente al más antiguo</h2>
        <ol class="events">${eventos.map(eventRow).join('')}
        </ol>${pieDe(pie)}
      </section>`;
}

function esqueleto() {
  const row = '<div class="skeleton-row"><span class="skeleton-line box"></span><div><span class="skeleton-line w60"></span><span class="skeleton-line w40"></span></div><span class="skeleton-line w-date"></span></div>';
  return `
      <section aria-labelledby="t-lista" aria-busy="true">
        <h2 id="t-lista" class="sr-only">Eventos, del más reciente al más antiguo</h2>
        <div class="events" aria-hidden="true">${row.repeat(5)}</div>
        <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando tu actividad…</p>
      </section>`;
}

const ESTADO = {
  vacio: `
      <section class="state" aria-labelledby="t-vacio">
        ${icon('history', 36)}
        <h2 id="t-vacio">Aún no hay actividad en tu cuenta</h2>
        <p>Cuando subas, descargues o elimines archivos, o el personal de Nimbo haga algo en tu cuenta, lo verás aquí.</p>
      </section>`,
  vacioFiltros: `
      <section class="state" aria-labelledby="t-vacio">
        ${icon('calendar', 36)}
        <h2 id="t-vacio">No hay actividad con estos filtros</h2>
        <p>Prueba con otro rango de fechas u otro origen.</p>
        <button class="btn btn-outline" type="button">${icon('x', 16)}Limpiar filtros</button>
      </section>`,
  error: `
      <section class="state state-error" role="alert" aria-labelledby="t-error">
        ${icon('alert', 36)}
        <h2 id="t-error">No pudimos cargar tu actividad</h2>
        <p>Intenta de nuevo. Si el problema sigue, comparte este código con soporte: <code>${CORRELATION_ID}</code></p>
        <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
      </section>`,
};

function page(v) {
  const file = v.estado === 'default' ? 'mi-actividad.html' : `mi-actividad--${v.estado}.html`;
  return `${M.cabecera({
    titulo: `Mi actividad · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 004, RF-07: página «Mi actividad»). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa tokens y components/ui.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">${v.chip}</span> <strong>Mi actividad</strong> <span class="file">${file}</span> <span>en la aplicación · con sesión · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${M.sidebar()}
    <div class="main">
      ${M.topbar({ crumbs: [], conMenu: true, actividad: 'actual', menuAbierto: !!v.menu })}
      <main class="content" id="contenido">
        <div class="page-head">
          <h1>Mi actividad</h1>
          <p>Lo que se hizo en tu cuenta, por ti y por el personal de Nimbo. Solo ves el tipo y la cantidad de elementos, nunca sus nombres, y nadie puede modificar ni borrar este registro.</p>
        </div>
        <div class="stack">${v.cuerpo}
        </div>
      </main>
    </div>
  </div>
</div>

</body>
</html>
`;
}

// ---------- Estados ----------
const F0 = { origen: 'todo' };
const F_NIMBO = { origen: 'nimbo', desde: '2026-09-01', hasta: '2026-10-05', activo: true };
const F_VACIO = { origen: 'nimbo', desde: '2026-08-01', hasta: '2026-08-31', activo: true };
const F_INVAL = { origen: 'todo', desde: '2026-10-05', hasta: '2026-09-01', activo: true, error: 'La fecha final debe ser igual o posterior a la inicial. Corrige el rango para ver tu actividad.' };
const conLista = (f, eventos, pie, conteo = CONTEO_TODO) => filtros(f, { conteo }) + lista(eventos, pie);

const ESTADOS = [
  { estado: 'default', chip: 'CA-7', titulo: 'default (con «Cargar más»)', cuerpo: conLista(F0, EVENTOS, 'cargar-mas') },
  { estado: 'cargando', chip: 'CA-15', titulo: 'cargando (esqueleto)', cuerpo: filtros(F0, { deshabilitado: true }) + esqueleto() },
  { estado: 'vacio', chip: 'CA-11', titulo: 'vacío (la cuenta no tiene actividad)', cuerpo: ESTADO.vacio },
  { estado: 'vacio-filtros', chip: 'CA-10', titulo: 'vacío con filtros', cuerpo: filtros(F_VACIO, { conteo: '0 eventos' }) + ESTADO.vacioFiltros },
  { estado: 'error', chip: 'CA-15', titulo: 'error al cargar, con reintento', cuerpo: filtros(F0) + ESTADO.error },
  { estado: 'filtrado', chip: 'CA-10', titulo: 'filtrado por «Personal de Nimbo» y fechas', cuerpo: conLista(F_NIMBO, SOLO_INTERNOS, 'fin', 'Mostrando 3 eventos, del 1 sept al 5 oct 2026') },
  { estado: 'rango-invalido', chip: 'CA-10', titulo: 'rango de fechas inválido', cuerpo: conLista(F_INVAL, EVENTOS, 'cargar-mas') },
  { estado: 'cargando-mas', chip: 'CA-9', titulo: 'cargando más (siguiente página)', cuerpo: conLista(F0, EVENTOS, 'cargando-mas') },
  { estado: 'cargar-mas-error', chip: 'CA-9', titulo: 'error al cargar más', cuerpo: conLista(F0, EVENTOS, 'cargar-mas-error') },
  { estado: 'fin-de-lista', chip: 'CA-9', titulo: 'fin de la lista', cuerpo: conLista(F0, EVENTOS, 'fin') },
  { estado: 'menu-cuenta-abierto', chip: 'D-4', titulo: 'entrada «Mi actividad» en el menú de la cuenta', menu: true, cuerpo: conLista(F0, EVENTOS, 'cargar-mas') },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'mi-actividad.html' : `mi-actividad--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
