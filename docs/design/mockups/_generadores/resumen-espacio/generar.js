// Genera los estados de storage/resumen-espacio (spec 007): medidor de cuota, plan, desglose por tipo y papelera.
// Uso: node generar.js <ruta-del-worktree>
// Marco: marco/marco.js; tarjeta de cuota y datos del plan Personal: espacio/espacio.js; logo y carpetas de la barra
// lateral: carpetas/carpetas.js; error y esqueleto: mis-archivos/estados.js.
// Reemplaza el paquete de la propuesta (resumen-espacio.html con consultas, renovación, «Ampliar a 1 TB», optimizador
// y actividad, fuera de 007): el default corregido conserva el nombre resumen-espacio.html.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const Q = require('../espacio/espacio.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/resumen-espacio');
fs.mkdirSync(OUT, { recursive: true });

const { icon } = Q;

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + M.CSS.TRAMOS + Q.CSS_TARJETA + E.CSS_ESTADOS + C.CSS_006 + `
  /* Propio de storage/resumen-espacio (spec 007) */
  :root {
    /* Segmentos del desglose: tonos de texto de tipo de archivo (ui-guidelines §3), ≥ 3:1 sobre card */
    --file-docx: #3F62A8; --file-img: #276B7A; --file-other: #53677D;
  }
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }
  .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 20px; margin-top: 22px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 20px 22px; }
  .card h2 { margin: 0; font-size: 15px; line-height: 1.4; font-weight: 600; }
  .card-sub { margin: 2px 0 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Medidor (QuotaBar grande) */
  .meter-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .meter-used { margin: 0; font-size: 30px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .meter-used span { font-size: 15px; font-weight: 500; color: var(--secondary-foreground); letter-spacing: 0; }
  .meter-pct { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .meter .quota-bar { height: 10px; margin: 12px 0 0; }
  .meter.quota-warn .quota-bar span { background: var(--warning); }
  .meter.quota-full .quota-bar span { background: var(--destructive-soft); }
  .meter-note-ok { margin: 10px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 18px 0 0; padding: 16px 0 0; border-top: 1px solid var(--border); }
  .stats div { min-width: 0; }
  .stats dt { font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted-foreground); }
  .stats dd { margin: 2px 0 0; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }

  /* Plan (sin precios ni ofertas: el catálogo es de 008) */
  .plan-name { display: flex; align-items: center; gap: 10px; margin: 14px 0 0; font-size: 20px; font-weight: 700; }
  .plan-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
  .plan-list li { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: var(--secondary-foreground); }
  .plan-list li .ico { margin-top: 2px; color: var(--primary); }
  .plan-list strong { color: var(--foreground); font-weight: 600; font-variant-numeric: tabular-nums; }

  /* Aviso de tramo (Alert de shadcn): warning en 70–89 %, destructive en 90–100 %; ícono + título + acción */
  .notice { display: flex; align-items: flex-start; gap: 12px; margin-top: 20px; padding: 14px 16px; border-radius: var(--radius-lg); }
  .notice > .ico { flex: none; margin-top: 1px; }
  .notice-body { flex: 1; min-width: 0; }
  .notice-title { margin: 0; font-size: 14.5px; font-weight: 600; }
  .notice-text { margin: 2px 0 0; font-size: 14px; color: var(--foreground); }
  .notice-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .notice-warn { background: var(--warning-soft); border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--card)); }
  .notice-warn > .ico, .notice-warn .notice-title { color: var(--warning-foreground); }
  .notice-full { background: var(--destructive-tint); border: 1px solid color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .notice-full > .ico, .notice-full .notice-title { color: var(--destructive); }

  /* Desglose por tipo: barra apilada (decorativa) + lista con cifras en texto */
  .breakdown { margin-top: 20px; }
  /* Pista con borde input, como QuotaBar (≥ 3:1 contra card; revisión de UI de 007) */
  .stack { display: flex; gap: 2px; height: 14px; margin-top: 16px; border-radius: 999px; overflow: hidden; background: var(--muted); border: 1px solid var(--input); }
  .stack span { display: block; height: 100%; min-width: 3px; }
  .sw-docs { background: var(--file-docx); }
  .sw-img { background: var(--file-img); }
  .sw-other { background: var(--file-other); }
  /* Papelera: rayado (no depende solo del color) */
  .sw-trash { background: repeating-linear-gradient(135deg, var(--secondary-foreground) 0 3px, var(--card) 3px 6px); }
  .sw-free { background: var(--muted); box-shadow: inset 0 0 0 1px var(--input); }
  .legend { list-style: none; margin: 16px 0 0; padding: 0; }
  .legend li { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto auto; align-items: center; column-gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
  .legend li:first-child { border-top: 0; }
  .legend .sw { width: 14px; height: 14px; border-radius: 4px; }
  .legend .lg-name { font-size: 14px; font-weight: 600; }
  .legend .lg-desc { display: block; font-size: 12.5px; font-weight: 400; color: var(--secondary-foreground); }
  .legend .lg-size { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
  .legend .lg-pct { width: 52px; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; text-align: right; }
  .legend li.lg-trash { border-top: 1px dashed var(--input); }
  .lg-trash-note { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 6px 0 0; font-size: 12.5px; color: var(--secondary-foreground); }
  .lg-trash-note a { display: inline-flex; align-items: center; min-height: 24px; font-weight: 600; }
  .legend li.lg-free .lg-name { font-weight: 500; color: var(--secondary-foreground); }

  /* Cargando: esqueleto con la forma de las tarjetas */
  .sk-card { min-height: 180px; }
  .sk-card .skeleton-line + .skeleton-line { margin-top: 14px; }
  .sk-big { height: 28px; width: 40%; }
  .sk-bar { height: 10px; width: 100%; }

  @media (max-width: 1100px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) {
` + M.CSS.MQ600_MARCO + E.CSS_ESTADOS_MQ600 + `    .grid { gap: 16px; margin-top: 16px; }
    .card { padding: 16px; }
    .meter-used { font-size: 26px; }
    .stats { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .stats div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .stats dd { font-size: 16px; }
    .notice { flex-wrap: wrap; padding: 14px; }
    .notice-actions { width: 100%; flex-direction: column; }
    .notice-actions .btn { width: 100%; min-height: 44px; }
    .legend li { grid-template-columns: 14px minmax(0, 1fr) auto; }
    .legend .lg-pct { display: none; }
    .legend .lg-size small { display: block; font-size: 12px; font-weight: 400; color: var(--secondary-foreground); }
    .lg-trash-note a { min-height: 44px; }
  }
  @media (min-width: 601px) { .legend .lg-size small { display: none; } }
`;

// ---------- Datos de ejemplo por estado (bytes exactos en la API; aquí ya formateados) ----------
// La suma de Documentos + Imágenes + Otros + Papelera es el espacio usado (CA-2, CA-3).
const D = {
  ok: { q: Q.CUOTAS.ok, libre: '10.2 GB', docs: ['3.1 GB'], img: ['1.3 GB'], other: ['0.4 GB'], trash: ['0 B'] },
  warn: { q: Q.CUOTAS.warn, libre: '2.7 GB', docs: ['6.8 GB'], img: ['3.9 GB'], other: ['1.1 GB'], trash: ['0.5 GB'] },
  full: { q: Q.CUOTAS.full, libre: '0.9 GB', docs: ['7.6 GB'], img: ['4.4 GB'], other: ['1.3 GB'], trash: ['0.8 GB'] },
  llena: { q: Q.CUOTAS.llena, libre: '0 B', docs: ['8.1 GB'], img: ['4.6 GB'], other: ['1.5 GB'], trash: ['0.8 GB'] },
  papelera: { q: { usado: '7.4 GB', total: Q.CUOTA_TOTAL, pct: 49 }, libre: '7.6 GB', docs: ['3.2 GB'], img: ['1.2 GB'], other: ['0.4 GB'], trash: ['2.6 GB'] },
};
// Porcentaje de cada segmento sobre el espacio usado (texto de la lista)
const pctUsado = (gb, usado) => (parseFloat(gb) === 0 ? '0 %' : `${Math.round((parseFloat(gb) / parseFloat(usado)) * 100)} %`);

// ---------- Piezas ----------
function encabezado() {
  return `
        <div class="page-head">
          <div>
            <h1>Espacio de almacenamiento</h1>
            <p>Cuánto usas de tu plan y en qué se va.</p>
          </div>
        </div>`;
}

function aviso(d) {
  const tramo = Q.tramoDe(d.q.pct);
  if (tramo === 'ok') return '';
  const llena = d.q.pct >= 100;
  const titulo = Q.notaDe(d.q.pct);
  const texto = llena
    ? `Usas ${d.q.usado} de ${d.q.total}. No podrás subir archivos hasta que liberes espacio.`
    : `Te quedan ${d.libre}. Elimina archivos que ya no necesites para seguir subiendo.`;
  const papelera = parseFloat(d.trash[0]) > 0
    ? `<a class="btn btn-outline" href="#">${icon('trash', 16)}<span>Ver papelera (${d.trash[0]})</span></a>` : '';
  return `
        <section class="notice notice-${tramo}" role="${tramo === 'full' ? 'alert' : 'status'}" aria-labelledby="aviso-t">
          ${icon(tramo === 'full' ? 'alert' : 'warn', 20)}
          <div class="notice-body">
            <h2 class="notice-title" id="aviso-t">${titulo}</h2>
            <p class="notice-text">${texto} Lo que está en la papelera sigue ocupando espacio hasta que se elimina definitivamente.</p>
            <div class="notice-actions">
              <a class="btn btn-primary" href="#">Liberar espacio</a>${papelera}
            </div>
          </div>
        </section>`;
}

// El texto del tramo va una sola vez en la pantalla: en el aviso de arriba. El medidor solo dice «Tienes espacio de
// sobra.» en 0–69 % (revisión de UI de 007).
function medidor(d) {
  const tramo = Q.tramoDe(d.q.pct);
  const nota = tramo === 'ok' ? `<p class="meter-note-ok">Tienes espacio de sobra.</p>` : '';
  return `
          <section class="card meter${tramo === 'ok' ? '' : ` quota-${tramo}`}" aria-labelledby="medidor-t">
            <h2 id="medidor-t">Espacio usado</h2>
            <div class="meter-top">
              <p class="meter-used">${d.q.usado} <span>de ${d.q.total}</span></p>
              <span class="meter-pct">${d.q.pct} %</span>
            </div>
            <div class="quota-bar" role="progressbar" aria-labelledby="medidor-t" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${d.q.pct}" aria-valuetext="${d.q.usado} de ${d.q.total} (${d.q.pct} %)"><span style="width: ${d.q.pct}%"></span></div>
            ${nota}
            <dl class="stats">
              <div><dt>Usado</dt><dd>${d.q.usado}</dd></div>
              <div><dt>Disponible</dt><dd>${d.libre}</dd></div>
              <div><dt>Cuota del plan</dt><dd>${d.q.total}</dd></div>
            </dl>
          </section>`;
}

// Plan: nombre y límites (CA-6). Sin precio, sin «Ampliar» y sin «Ver planes» (oculto hasta 008, spec 007 §6).
function plan() {
  return `
          <section class="card" aria-labelledby="plan-t">
            <h2 id="plan-t">Tu plan</h2>
            <p class="plan-name">${Q.PLAN_NOMBRE}</p>
            <ul class="plan-list">
              <li>${icon('hardDrive', 16)}<span><strong>${Q.CUOTA_TOTAL}</strong> de almacenamiento</span></li>
              <li>${icon('file', 16)}<span>Hasta <strong>${Q.MAX_POR_ARCHIVO}</strong> por archivo</span></li>
              <li>${icon('trash', 16)}<span>La papelera guarda lo eliminado <strong>${Q.RETENCION}</strong></span></li>
            </ul>
          </section>`;
}

function desglose(d) {
  const seg = [
    ['docs', 'Documentos', '.docx, .pdf, .txt, .md, .xlsx y .pptx', d.docs],
    ['img', 'Imágenes', 'Fotos, capturas y otras imágenes', d.img],
    ['other', 'Otros', 'Videos, comprimidos y demás formatos', d.other],
  ];
  // Barra apilada sobre la cuota total (lo que queda es «Disponible»); aria-hidden: las cifras están en la lista
  const sobreCuota = (gb) => Math.round((parseFloat(gb) / parseFloat(d.q.total)) * 1000) / 10;
  const barras = [...seg.map(([k, , , [gb]]) => [k, sobreCuota(gb)]), ['trash', sobreCuota(d.trash[0])]]
    .filter(([, p]) => p > 0).map(([k, p]) => `<span class="sw-${k}" style="width: ${p}%"></span>`).join('');
  const fila = ([k, nombre, desc, [gb]]) => `
              <li><span class="sw sw-${k}" aria-hidden="true"></span><span class="lg-name">${nombre}<span class="lg-desc">${desc}</span></span><span class="lg-size">${gb}<small>${pctUsado(gb, d.q.usado)} del usado</small></span><span class="lg-pct">${pctUsado(gb, d.q.usado)}</span></li>`;
  const conPapelera = parseFloat(d.trash[0]) > 0;
  const notaPapelera = conPapelera
    ? `Cuenta en tu cuota hasta que la vacías o pasan ${Q.RETENCION} desde que moviste cada elemento. <a href="#">Ver papelera</a>`
    : 'Está vacía.';
  return `
        <section class="card breakdown" aria-labelledby="desglose-t">
          <h2 id="desglose-t">En qué se va tu espacio</h2>
          <p class="card-sub">Por tipo de archivo, sobre el espacio usado.</p>
          <div class="stack" aria-hidden="true">${barras}</div>
          <ul class="legend">${seg.map(fila).join('')}
              <li class="lg-trash"><span class="sw sw-trash" aria-hidden="true"></span><span class="lg-name">Papelera<span class="lg-desc">Archivos y carpetas que eliminaste</span></span><span class="lg-size">${d.trash[0]}<small>${pctUsado(d.trash[0], d.q.usado)} del usado</small></span><span class="lg-pct">${pctUsado(d.trash[0], d.q.usado)}</span><p class="lg-trash-note">${notaPapelera}</p></li>
              <li class="lg-free"><span class="sw sw-free" aria-hidden="true"></span><span class="lg-name">Disponible</span><span class="lg-size">${d.libre}</span><span class="lg-pct"></span></li>
          </ul>
        </section>`;
}

function listo(d) {
  return () => encabezado() + aviso(d) + `
        <div class="grid">${medidor(d)}${plan()}
        </div>` + desglose(d);
}

function cargando() {
  const sk = (cls = '') => `
          <div class="card sk-card${cls}"><span class="skeleton-line w30"></span><span class="skeleton-line sk-big"></span><span class="skeleton-line sk-bar"></span><span class="skeleton-line w60"></span></div>`;
  return encabezado() + `
        <div aria-busy="true">
          <div class="grid" aria-hidden="true">${sk()}${sk()}
          </div>
          <div class="card sk-card breakdown" aria-hidden="true"><span class="skeleton-line w30"></span><span class="skeleton-line sk-bar"></span><span class="skeleton-line w70"></span><span class="skeleton-line w55"></span><span class="skeleton-line w45"></span></div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Calculando tu espacio…</p>
        </div>`;
}

// ---------- Página ----------
function page(v) {
  const file = v.estado === 'default' ? 'resumen-espacio.html' : `resumen-espacio--${v.estado}.html`;
  const q = v.datos ? v.datos.q : Q.CUOTAS.ok;
  return C.conLogo(`${M.cabecera({
    titulo: `Espacio de almacenamiento · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 007: cuota y explorador). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo (QuotaBar).',
      'Generado con _generadores/resumen-espacio/generar.js (marco, espacio, carpetas y estados). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">007</span> <strong>Resumen de espacio</strong> <span class="file">${file}</span> <span>plan Personal (ejemplo) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${Q.sidebar({ q, estado: v.tarjeta || 'listo', enlace: false, activo: 'Espacio' })}
    <div class="main">
      ${M.topbar({ crumbs: ['Cuenta', 'Espacio de almacenamiento'] })}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>
</div>

</body>
</html>
`);
}

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'default', titulo: 'uso al 32 % con la papelera vacía', datos: D.ok, cuerpo: listo(D.ok) },
  { estado: 'cargando', titulo: 'calculando el espacio (esqueleto)', tarjeta: 'cargando', cuerpo: cargando },
  {
    estado: 'error', titulo: 'no se pudo calcular el espacio: causa y «Reintentar»', tarjeta: 'error',
    cuerpo: () => encabezado() + E.errorEstado('No pudimos calcular tu espacio.', 'Tus archivos siguen guardados. Inténtalo de nuevo en unos segundos.'),
  },
  { estado: 'tramo-70', titulo: 'tramo 70–89 %: «Tu cuota está al 82 %.» con «Liberar espacio»', datos: D.warn, cuerpo: listo(D.warn) },
  { estado: 'tramo-90', titulo: 'tramo 90–99 %: «Espacio casi agotado.» con «Liberar espacio»', datos: D.full, cuerpo: listo(D.full) },
  { estado: 'cuota-llena', titulo: 'cuota llena (100 %): «Espacio agotado.», no se puede subir más', datos: D.llena, cuerpo: listo(D.llena) },
  { estado: 'con-papelera', titulo: 'la papelera ocupa 2.6 GB y cuenta en la cuota', datos: D.papelera, cuerpo: listo(D.papelera) },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'resumen-espacio.html' : `resumen-espacio--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
