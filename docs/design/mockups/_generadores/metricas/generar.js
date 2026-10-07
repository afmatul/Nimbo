// Genera los mockups autocontenidos de backoffice/metricas (spec 011: métricas agregadas, CA-12), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común, distintivos,
// estados de pantalla y página) viene de admin/area.js, el mismo de backoffice/admin, alta-interna y catalogo. Aquí solo
// van los totales, las dos tablas con barras y sus estados. Sin librerías de gráficos: HTML y CSS.
// El estado «operador» es la misma pantalla en el área del Operador (AREA_OPERADOR de area.js): solo «Métricas».
const A = require('../admin/area.js');
const C = require('../admin/corpus.js');

const OUT = A.carpetaDeSalida('metricas');

const { icon, badgeInactivo } = A;
const { miles, CLIENTES, INTERNAS, TOTAL_CUENTAS } = C;

// ---------- Datos de ejemplo (en la app vienen de la API; solo conteos y una suma, nunca filas) ----------
// Planes y conteos del corpus del área (admin/corpus.js), los mismos de la navegación y del catálogo: no se desvían.
// Porcentajes con un decimal, calculados en la web sobre el total de cada tabla.
const ESTADOS = [
  { nombre: 'Activas', n: TOTAL_CUENTAS - C.SUSPENDIDAS, badge: 'badge-ok', ic: 'ok' },
  { nombre: 'Suspendidas', n: C.SUSPENDIDAS, badge: 'badge-off', ic: 'ban' },
];
// Planes en el orden del catálogo (por precio). inactivo: ya no se ofrece, pero aún tiene cuentas.
const conteo = (p, inactivo = false) => ({ nombre: p.nombre, n: p.cuentas, inactivo });
const PLANES = C.PLANES.map((p) => conteo(p));
// Mismo momento que catalogo--desactivado: los activos (con el plan nuevo, aún sin cuentas) y después los inactivos.
const PLANES_CON_INACTIVO = [
  ...C.PLANES_TRAS_DESACTIVAR.activos.map((p) => conteo(p)),
  ...C.PLANES_TRAS_DESACTIVAR.inactivos.map((p) => conteo(p, true)),
];
// Suma de usuario.espacio_usado (bytes) de las cuentas de clientes, formateada en la web (potencias de 1024).
const ESPACIO = '39.4 TB';

// Porcentaje con un decimal: el mismo valor para el texto y para el ancho de la barra.
const porcentaje = (n, total) => (Math.round((n / total) * 1000) / 10).toFixed(1);
const pct = (n, total) => `${porcentaje(n, total)} %`;

// ---------- CSS ----------
const CSS = A.CSS + `
  /* Propio de backoffice/metricas (spec 011: métricas agregadas, CA-12) */
  .content > .privacy { max-width: 760px; }

  /* Totales (dl): etiqueta con ícono, cifra grande y explicación en texto */
  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0 0; }
  .kpi { display: flex; flex-direction: column; }
  .kpi dt { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--secondary-foreground); }
  .kpi dt .ico { color: var(--primary); }
  .kpi dd { margin: 0; }
  .kpi-value { margin-top: 6px !important; font-size: 32px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--foreground); }
  .kpi-sub { margin-top: 4px !important; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }

  /* Tablas con barra (el gráfico es la tabla: cada fila dice nombre, número y porcentaje; la barra es decorativa) */
  .charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; margin-top: 16px; }
  .charts .card > .sub { margin-bottom: 8px; }
  .bars { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .bars th, .bars td { padding: 10px 0; border-top: 1px solid var(--border); text-align: left; vertical-align: top; }
  .bars thead th { padding: 6px 0 8px; border-top: 0; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); }
  .bars .n { width: 1%; padding-left: 16px; text-align: right; white-space: nowrap; }
  .bars tbody th { font-weight: 600; font-size: 14px; color: var(--foreground); }
  .bars tbody td { font-size: 14px; font-weight: 600; color: var(--foreground); }
  .bars tbody td.pct { font-weight: 500; color: var(--secondary-foreground); }
  .bars tfoot th, .bars tfoot td { font-size: 13.5px; font-weight: 600; color: var(--secondary-foreground); border-top: 1px solid var(--input); }
  .row-name { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  /* Barra: relleno primary sobre pista muted (4.6:1 con la pista y 5.0:1 con card, WCAG 1.4.11); ancho = porcentaje */
  .bar { display: block; height: 8px; margin-top: 8px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .bar > span { display: block; height: 100%; border-radius: 999px; background: var(--primary); }
  .bars tr.is-off .bar > span { background: var(--muted-foreground); } /* inactivo: neutro (4.4:1 con la pista), además del distintivo con texto */
  .note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .note .ico { margin-top: 2px; }

  /* Esqueleto */
  .sk-value { height: 28px; width: 40%; margin: 10px 0 8px; }
  .sk-sub { margin: 10px 0 8px; }
  .sk-row { display: grid; gap: 10px; padding: 12px 0; border-top: 1px solid var(--border); }

  @media (max-width: 600px) {
    .kpis, .charts { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .kpis { margin-top: 16px; }
    .charts { margin-top: 12px; }
    .kpi-value { font-size: 28px; }
    .bars .n { padding-left: 12px; }
  }
`;

// ---------- Piezas ----------
const encabezado = `
        <div class="page-head">
          <div>
            <h1>Métricas</h1>
            <p>Cómo se usa Nimbo, en totales.</p>
          </div>
        </div>${A.privacidad('Son datos agregados: solo totales y conteos, sin información de ninguna cuenta ni de sus archivos.')}`;

const totales = `
        <dl class="kpis">
          <div class="card kpi">
            <dt>${icon('users', 16)}Cuentas en total</dt>
            <dd class="kpi-value">${miles(TOTAL_CUENTAS)}</dd>
            <dd class="kpi-sub">${miles(CLIENTES)} de clientes y ${miles(INTERNAS)} internas</dd>
          </div>
          <div class="card kpi">
            <dt>${icon('database', 16)}Espacio total usado</dt>
            <dd class="kpi-value">${ESPACIO}</dd>
            <dd class="kpi-sub">Lo que ocupan los archivos de las ${miles(CLIENTES)} cuentas de clientes</dd>
          </div>
        </dl>`;

const barra = (n, total) => `<span class="bar" aria-hidden="true"><span style="width: ${porcentaje(n, total)}%"></span></span>`;

// filas: [{ nombre (HTML), n, clase }]; col: encabezado de la primera columna; colPct: encabezado del porcentaje.
function tabla({ id, titulo, sub, caption, col, filas, total, totalEtiqueta, colPct, nota = '' }) {
  const cuerpo = filas.map((f) => `
              <tr${f.clase ? ` class="${f.clase}"` : ''}>
                <th scope="row"><span class="row-name">${f.nombre}</span>${barra(f.n, total)}</th>
                <td class="n">${miles(f.n)}</td>
                <td class="n pct">${pct(f.n, total)}</td>
              </tr>`).join('');
  return `
          <section class="card" aria-labelledby="${id}">
            <h2 id="${id}">${titulo}</h2>
            <p class="sub">${sub}</p>
            <table class="bars">
              <caption class="sr-only">${caption}</caption>
              <thead><tr><th scope="col">${col}</th><th scope="col" class="n">Cuentas</th><th scope="col" class="n">${colPct}</th></tr></thead>
              <tbody>${cuerpo}
              </tbody>
              <tfoot><tr><th scope="row">${totalEtiqueta}</th><td class="n">${miles(total)}</td><td class="n">100 %</td></tr></tfoot>
            </table>${nota}
          </section>`;
}

const porEstado = () => tabla({
  id: 'estado-t', titulo: 'Cuentas por estado', sub: `Las ${miles(TOTAL_CUENTAS)} cuentas, de clientes e internas.`,
  caption: 'Cuentas por estado: número de cuentas y porcentaje del total', col: 'Estado', colPct: '% del total',
  filas: ESTADOS.map((e) => ({ nombre: `<span class="badge ${e.badge}">${icon(e.ic, 13)}${e.nombre}</span>`, n: e.n })),
  total: TOTAL_CUENTAS, totalEtiqueta: 'Total',
});

const porPlan = (planes) => tabla({
  id: 'plan-t', titulo: 'Cuentas por plan',
  sub: `Las ${miles(CLIENTES)} cuentas de clientes. Incluye los planes inactivos que aún tienen cuentas.`,
  caption: 'Cuentas por plan: número de cuentas de clientes y porcentaje de los clientes', col: 'Plan', colPct: '% de clientes',
  filas: planes.map((p) => ({ nombre: p.inactivo ? `${p.nombre}${badgeInactivo}` : p.nombre, n: p.n, clase: p.inactivo ? 'is-off' : '' })),
  total: CLIENTES, totalEtiqueta: 'Total de clientes',
  nota: `
            <p class="note">${icon('info', 15)}<span>Las ${miles(INTERNAS)} cuentas internas no tienen plan; con ellas suman las ${miles(TOTAL_CUENTAS)} cuentas.</span></p>`,
});

const tablas = (planes) => `
        <div class="charts">${porEstado()}${porPlan(planes)}
        </div>`;

function cargando() {
  const kpi = '<div class="card"><span class="skeleton-line w40"></span><span class="skeleton-line sk-value"></span><span class="skeleton-line w70"></span></div>';
  const fila = '<div class="sk-row"><span class="skeleton-line w30"></span><span class="skeleton-line w80"></span></div>';
  const tarjeta = (n) => `<div class="card"><span class="skeleton-line w40"></span><span class="skeleton-line w70 sk-sub"></span>${fila.repeat(n)}</div>`;
  return `
        <div aria-busy="true">
          <div aria-hidden="true">
            <div class="kpis">${kpi}${kpi}</div>
            <div class="charts">${tarjeta(2)}${tarjeta(4)}</div>
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando las métricas…</p>
        </div>`;
}

const error = () => A.estadoError('No pudimos cargar las métricas.', 'Revisa tu conexión e inténtalo de nuevo.');

// ---------- Estados ----------
const VARIANTES = [
  { estado: 'default', titulo: 'totales, cuentas por estado y por plan; ningún plan inactivo con cuentas',
    cuerpo: () => encabezado + totales + tablas(PLANES) },
  { estado: 'cargando', titulo: 'esqueleto de los totales y las tablas mientras llegan las métricas',
    cuerpo: () => encabezado + cargando() },
  { estado: 'error', titulo: 'falló la carga de las métricas: error con «Reintentar»',
    cuerpo: () => encabezado + error() },
  { estado: 'operador', titulo: 'vista del Operador: las mismas métricas, en solo lectura, en su área (solo «Métricas»)',
    area: A.AREA_OPERADOR, crumbs: ['Operación', 'Métricas'],
    cuerpo: () => encabezado + totales + tablas(PLANES) },
  { estado: 'con-plan-inactivo', titulo: `${C.EQUIPO.nombre} desactivado con ${C.EQUIPO.cuentas} cuentas: aparece con su marca «Inactivo» (como catalogo--desactivado)`,
    cuerpo: () => encabezado + totales + tablas(PLANES_CON_INACTIVO) },
];

for (const v of VARIANTES) {
  const file = A.archivoDe('metricas', v.estado);
  A.escribir(OUT, file, A.pagina({
    titulo: `Métricas · ${(v.area || A.AREA_ADMIN).etiqueta} · Nimbo — ${v.estado}`,
    comentarios: A.comentariosDe('administración, métricas agregadas, CA-12', v.estado, 'metricas'),
    css: CSS,
    rotulo: 'Métricas',
    file,
    estado: v.titulo,
    crumbs: v.crumbs || ['Administración', 'Métricas'],
    cuerpo: v.cuerpo(),
    actual: 'Métricas',
    area: v.area || A.AREA_ADMIN,
  }));
}
