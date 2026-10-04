// Genera los mockups autocontenidos de backoffice/metricas (spec 011: métricas agregadas, CA-12), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común, distintivos,
// estados de pantalla y página) viene de admin/area.js, el mismo de backoffice/admin, alta-interna y catalogo. Aquí solo
// van los totales, las dos tablas con barras y sus estados. Sin librerías de gráficos: HTML y CSS.
const fs = require('node:fs');
const path = require('node:path');
const A = require('../admin/area.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/backoffice/metricas');
fs.mkdirSync(OUT, { recursive: true });

const { icon, badgeInactivo } = A;

// ---------- Datos de ejemplo (en la app vienen de la API; solo conteos y una suma, nunca filas) ----------
// Cuadran con los mockups aprobados: 1 284 cuentas en la navegación (A.TOTAL) = 1 272 clientes + 12 internas, y por plan
// los conteos del catálogo (1 012 + 186 + 52 + 22 = 1 272). Por estado: 1 275 activas + 9 suspendidas = 1 284.
// Porcentajes con un decimal, calculados en la web sobre el total de cada tabla.
const CLIENTES = 1272;
const INTERNAS = 12;
const TOTAL = CLIENTES + INTERNAS; // 1 284
const ESTADOS = [
  { id: 'activa', nombre: 'Activas', n: 1275, badge: 'badge-ok', ic: 'ok' },
  { id: 'suspendida', nombre: 'Suspendidas', n: 9, badge: 'badge-off', ic: 'ban' },
];
// Planes en el orden del catálogo (por precio). inactivo: ya no se ofrece, pero aún tiene cuentas.
const PLANES = [
  { nombre: 'Personal', n: 1012 },
  { nombre: 'Pro', n: 186 },
  { nombre: 'Equipo', n: 52 },
  { nombre: 'Institucional', n: 22 },
];
// Mismo momento que catalogo--desactivado: Equipo inactivo con sus 52 cuentas y Equipo 2027 activo, aún sin cuentas.
const PLANES_CON_INACTIVO = [
  { nombre: 'Personal', n: 1012 },
  { nombre: 'Pro', n: 186 },
  { nombre: 'Equipo 2027', n: 0 },
  { nombre: 'Institucional', n: 22 },
  { nombre: 'Equipo', n: 52, inactivo: true },
];
// Suma de usuario.espacio_usado (bytes) de las cuentas de clientes, formateada en la web (potencias de 1024).
const ESPACIO = '39.4 TB';

if (ESTADOS.reduce((s, e) => s + e.n, 0) !== TOTAL) throw new Error('Los estados no suman el total');
for (const l of [PLANES, PLANES_CON_INACTIVO]) if (l.reduce((s, p) => s + p.n, 0) !== CLIENTES) throw new Error('Los planes no suman los clientes');

// Formato de la web: miles separados por un espacio que no se parte (como «1 284» de la navegación) y un decimal.
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (n, total) => `${(Math.round((n / total) * 1000) / 10).toFixed(1)} %`;

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
        </div>
        <div class="privacy">${icon('lock', 16)}<p>Son datos agregados: solo totales y conteos, sin información de ninguna cuenta ni de sus archivos.</p></div>`;

const totales = `
        <dl class="kpis">
          <div class="card kpi">
            <dt>${icon('users', 16)}Cuentas en total</dt>
            <dd class="kpi-value">${miles(TOTAL)}</dd>
            <dd class="kpi-sub">${miles(CLIENTES)} de clientes y ${miles(INTERNAS)} internas</dd>
          </div>
          <div class="card kpi">
            <dt>${icon('database', 16)}Espacio total usado</dt>
            <dd class="kpi-value">${ESPACIO}</dd>
            <dd class="kpi-sub">Lo que ocupan los archivos de las ${miles(CLIENTES)} cuentas de clientes</dd>
          </div>
        </dl>`;

const barra = (n, total) => `<span class="bar" aria-hidden="true"><span style="width: ${((n / total) * 100).toFixed(1)}%"></span></span>`;

// filas: [{ nombre (HTML), n, clase }]; columna: encabezado del porcentaje.
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
  id: 'estado-t', titulo: 'Cuentas por estado', sub: `Las ${miles(TOTAL)} cuentas, de clientes e internas.`,
  caption: 'Cuentas por estado: número de cuentas y porcentaje del total', col: 'Estado', colPct: '% del total',
  filas: ESTADOS.map((e) => ({ nombre: `<span class="badge ${e.badge}">${icon(e.ic, 13)}${e.nombre}</span>`, n: e.n })),
  total: TOTAL, totalEtiqueta: 'Total',
});

const porPlan = (planes) => tabla({
  id: 'plan-t', titulo: 'Cuentas por plan',
  sub: `Las ${miles(CLIENTES)} cuentas de clientes. Incluye los planes inactivos que aún tienen cuentas.`,
  caption: 'Cuentas por plan: número de cuentas de clientes y porcentaje de los clientes', col: 'Plan', colPct: '% de clientes',
  filas: planes.map((p) => ({ nombre: p.inactivo ? `${p.nombre}${badgeInactivo}` : p.nombre, n: p.n, clase: p.inactivo ? 'is-off' : '' })),
  total: CLIENTES, totalEtiqueta: 'Total de clientes',
  nota: `
            <p class="note">${icon('info', 15)}<span>Las ${miles(INTERNAS)} cuentas internas no tienen plan; con ellas suman las ${miles(TOTAL)} cuentas.</span></p>`,
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
  { estado: 'con-plan-inactivo', titulo: 'Equipo desactivado con 52 cuentas: aparece con su marca «Inactivo» (como catalogo--desactivado)',
    cuerpo: () => encabezado + totales + tablas(PLANES_CON_INACTIVO) },
];

for (const v of VARIANTES) {
  const file = v.estado === 'default' ? 'metricas.html' : `metricas--${v.estado}.html`;
  const html = A.pagina({
    titulo: `Métricas · Administración · Nimbo — ${v.estado}`,
    comentarios: [
      `Mockup de referencia (spec 011: administración, métricas agregadas, CA-12). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/metricas/generar.js (marco del área en admin/area.js y CSS del marco en marco/marco.js). No editar a mano.',
    ],
    css: CSS,
    rotulo: 'Métricas',
    file,
    estado: v.titulo,
    crumbs: ['Administración', 'Métricas'],
    cuerpo: v.cuerpo(),
    actual: 'Métricas',
  });
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  console.log(file);
}
