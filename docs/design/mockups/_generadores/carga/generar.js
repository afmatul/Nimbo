// Genera los estados escritos a mano de storage/carga (spec 005), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco (barra lateral, barra superior y CSS base) viene de marco/marco.js, el mismo de identity/seguridad y
// shared/layout. El panel de carga reproduce el de carga--progreso.html (propuesta p. 10) con tokens de
// ui-guidelines.md §3. carga--progreso.html (HTML empaquetado de la propuesta) NO se genera aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/carga');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const P = {
  ...M.P,
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M6 3 20 12 6 21Z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  slides: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};
const icon = (name, size = 18, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;

// ---------- Datos de ejemplo (en la app vienen de la API y de PlanLimits; catálogo de product-context §3) ----------
// Plan Equipo: 350 GB de almacenamiento y 1 GB como máximo por archivo.
const PLAN = 'EQUIPO';
const CUOTA_NORMAL = { usado: '304 GB', total: '350 GB', pct: 87 };
const CUOTA_LLENA = { usado: '349.4 GB', total: '350 GB', pct: 99.8 };

// Tipo de archivo → ícono y tokens --file-* (FileTypeChip). La extensión siempre va en el nombre.
const TIPOS = {
  docx: ['fileText', 'docx'], xlsx: ['sheet', 'xlsx'], pptx: ['slides', 'pptx'], pdf: ['fileText', 'pdf'],
  txt: ['fileText', 'other'], mp4: ['film', 'other'], zip: ['file', 'other'],
};
const tipo = (nombre) => TIPOS[nombre.split('.').pop().toLowerCase()] || ['file', 'other'];
const tile = (nombre) => { const [ic, t] = tipo(nombre); return `<span class="ftile ftile-${t}">${icon(ic, 16)}</span>`; };

// Archivos en la raíz de «Mis archivos» (el explorador de 005 solo muestra la raíz, RN-4)
const RAIZ = [
  ['Propuesta_Nimbo_v3.docx', '2.4 MB', 'hace 4 min'],
  ['Matriz_Requisitos_RF.xlsx', '860 KB', 'hoy · 09:12'],
  ['Demo_Fase3_avance.pptx', '18.7 MB', 'hace 2 h'],
  ['Modelo_ER_Nimbo.pdf', '1.1 MB', 'ayer'],
];

// ---------- CSS propio de la pantalla ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de storage/carga */
  :root {
    /* Tipos de archivo (ui-guidelines §3): texto AA; fondo = tono base al 12 % */
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --file-xlsx: #3A7560; --file-xlsx-bg: #6DB99A20;
    --file-pptx: #8A6424; --file-pptx-bg: #D4A96A20;
    --file-pdf: #A34F4F;  --file-pdf-bg: #C97B7B20;
    --file-other: #53677D; --file-other-bg: #7A90A820;
  }
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }

  /* Cuota en tramos de QuotaBar (§4): 70–89 % warning; 90–100 % destructive-soft */
  .quota-warn .quota-bar span { background: var(--warning); }
  .quota-full { border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .quota-full .quota-bar span { background: var(--destructive-soft); }
  .quota-note { margin: 8px 0 0; font-size: 11.5px; line-height: 1.45; font-weight: 500; }
  .quota-warn .quota-note { color: var(--warning-foreground); }
  .quota-full .quota-note { color: var(--destructive); }

  /* Encabezado de la página */
  .page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .page-head p { margin-top: 4px; }

  /* Tabla de archivos (explorador, vista de lista) */
  .files { margin-top: 20px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .files table { width: 100%; border-collapse: collapse; }
  .files th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); background: var(--background); border-bottom: 1px solid var(--border); }
  .files td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--secondary-foreground); }
  .files tr:last-child td { border-bottom: 0; }
  .files .c-size, .files .c-date { width: 130px; font-variant-numeric: tabular-nums; }
  .fname { display: flex; align-items: center; gap: 12px; min-width: 0; color: var(--foreground); font-weight: 500; }
  .fname-text { min-width: 0; overflow-wrap: anywhere; }
  .fmeta-m { display: none; }
  .badge-new { margin-left: 8px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--success-foreground); background: var(--success-soft); border: 1px solid color-mix(in srgb, var(--success) 40%, var(--card)); border-radius: var(--radius-sm); padding: 1px 6px; white-space: nowrap; }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: 8px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }
  .ftile-xlsx { color: var(--file-xlsx); background: var(--file-xlsx-bg); }
  .ftile-pptx { color: var(--file-pptx); background: var(--file-pptx-bg); }
  .ftile-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }
  .ftile-other { color: var(--file-other); background: var(--file-other-bg); }

  /* Panel de carga (UploadProgress) */
  .up { position: absolute; z-index: 5; right: 28px; bottom: 28px; width: 440px; max-width: calc(100% - 56px); background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); overflow: hidden; }
  .up-head { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--border); }
  .up-titles { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; }
  .up-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .up-sub { font-size: 12px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .up-head-actions { margin-left: auto; display: flex; gap: 2px; }
  .ibtn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--secondary-foreground); cursor: pointer; }
  .ibtn:hover { background: var(--muted); color: var(--foreground); }
  .ibtn-outline { border: 1px solid var(--input); background: var(--card); }
  .up-banner { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 12px 16px; background: var(--warning-soft); border-bottom: 1px solid color-mix(in srgb, var(--warning) 45%, var(--card)); font-size: 13px; line-height: 1.45; color: var(--foreground); }
  .up-banner .ico { color: var(--warning-foreground); margin-top: 1px; }
  .up-banner strong { color: var(--warning-foreground); font-weight: 600; }
  .up-list { list-style: none; margin: 0; padding: 0; max-height: 520px; overflow-y: auto; }
  /* Rejilla: ícono | nombre y datos | acciones; debajo, barra, mensaje y nota alineados con el nombre */
  .up-item { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; row-gap: 9px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--border); }
  .up-item:last-child { border-bottom: 0; }
  .up-item > .bar, .up-item > .up-msg, .up-item > .up-note { grid-column: 2 / -1; }
  .up-info { min-width: 0; }
  .up-name { margin: 0; font-size: 13.5px; font-weight: 500; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .up-meta { margin: 1px 0 0; font-size: 12px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .up-meta .st { font-weight: 600; }
  .st-warn { color: var(--warning-foreground); }
  .st-err { color: var(--destructive); }
  .st-ok { color: var(--success-foreground); }
  .up-actions { display: flex; align-items: center; gap: 6px; flex: none; }
  .done { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; color: var(--success-foreground); background: var(--success-soft); }
  .bar { height: 6px; border-radius: 999px; background: var(--muted); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 999px; background: var(--primary); }
  .bar-warn span { background: var(--warning); }
  .up-msg { margin: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md); font-size: 13px; line-height: 1.45; }
  .up-msg p { margin: 0; display: flex; align-items: flex-start; gap: 8px; }
  .up-msg p .ico { margin-top: 1px; }
  .up-msg-err { background: var(--destructive-tint); color: var(--foreground); }
  .up-msg-err p .ico { color: var(--destructive); }
  .up-msg-err strong { color: var(--destructive); font-weight: 600; }
  .up-msg-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .up-note { margin: 0; font-size: 12.5px; color: var(--secondary-foreground); }

  /* Diálogo de nombre repetido (Dialog de shadcn; no es destructivo) */
  .dialog-note { margin-top: 10px !important; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); color: var(--secondary-foreground) !important; font-size: 13px !important; overflow-wrap: anywhere; }
  .dialog-note strong { color: var(--foreground); font-weight: 600; }
  .dialog-check { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; }
  .dialog-check input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--primary); cursor: pointer; }
  .dialog-check label { display: inline-flex; align-items: center; min-height: 24px; font-size: 14px; font-weight: 600; color: var(--foreground); cursor: pointer; }
  .dialog-check p { margin: 0 !important; font-size: 13px !important; color: var(--secondary-foreground) !important; }
  .dialog .dialog-check + .dialog-actions { margin-top: 18px; }

  @media (max-width: 900px) {
    .up { right: 16px; bottom: 16px; }
  }
  @media (max-width: 600px) {
    .app { min-height: 920px; }
    .page-head h1 { font-size: 23px; }
    .files { margin-top: 16px; }
    .files thead { display: none; }
    .files .c-size, .files .c-date { display: none; }
    .files td { padding: 12px; }
    .fmeta-m { display: block; margin-top: 1px; font-size: 12px; font-weight: 400; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
    /* En móvil el panel es una hoja al pie, a todo el ancho */
    .up { left: 8px; right: 8px; bottom: 8px; width: auto; max-width: none; border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md); }
    .up-head { padding: 6px 6px 6px 14px; }
    .up-item { padding: 12px 8px 12px 14px; }
    .ibtn { width: 44px; height: 44px; }
    .dialog-check label { min-height: 28px; }
    .up-actions .btn { min-height: 44px; }
    .up-msg-actions .btn { min-height: 44px; flex: 1; }
    /* En móvil: nombre a todo el ancho; barra, mensaje y acciones debajo */
    .up-item { align-items: start; }
    .up-item > .bar, .up-item > .up-msg, .up-item > .up-note { grid-column: 1 / -1; }
    .up-item > .up-actions:has(button) { grid-column: 1 / -1; grid-row: 3; justify-content: flex-end; }
    .up-name { white-space: normal; overflow-wrap: anywhere; }
  }
`;

// ---------- Piezas ----------
function cuota(q, tramo) {
  const nota = tramo === 'full' ? 'Espacio casi agotado' : `Tu cuota está al ${q.pct} %`;
  return M.cuota(q)
    .replace('<div class="quota">', `<div class="quota quota-${tramo}">`)
    .replace(/<\/div>\s*$/, `  <p class="quota-note">${nota}</p>\n      </div>`);
}

function sidebar(q, tramo) {
  return M.sidebar({ activo: 'Mis archivos', plan: PLAN, cuota: q }).replace(M.cuota(q), cuota(q, tramo));
}

function tabla(nuevos) {
  const filas = [...nuevos.map((n) => [...n, true]), ...RAIZ].map(([nombre, tam, fecha, nuevo]) => `
            <tr>
              <td><div class="fname">${tile(nombre)}<div class="fname-text">${nombre}${nuevo ? '<span class="badge-new">NUEVO</span>' : ''}<span class="fmeta-m">${tam} · ${fecha}</span></div></div></td>
              <td class="c-size">${tam}</td>
              <td class="c-date">${fecha}</td>
            </tr>`).join('');
  return `
        <div class="files">
          <table>
            <caption class="sr-only">Archivos en Mis archivos</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col" class="c-size">Tamaño</th><th scope="col" class="c-date">Modificado</th></tr></thead>
            <tbody>${filas}
            </tbody>
          </table>
        </div>`;
}

const btnIcon = (ic, label, outline = true) =>
  `<button class="ibtn${outline ? ' ibtn-outline' : ''}" type="button" aria-label="${label}">${icon(ic, 16)}</button>`;

// Un elemento del panel. it = { nombre, meta, st, stCls, bar, barCls, barTxt, acciones, msg, done, nota }
function item(it) {
  const st = it.st ? ` · <span class="st ${it.stCls}">${it.st}</span>` : '';
  const acciones = it.done
    ? `<span class="done" role="img" aria-label="Subido">${icon('check', 14)}</span>`
    : (it.acciones || '');
  const bar = it.bar == null ? '' : `
          <div class="bar${it.barCls ? ' ' + it.barCls : ''}" role="progressbar" aria-label="Progreso de ${it.nombre}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${it.bar}" aria-valuetext="${it.barTxt}"><span style="width: ${it.bar}%"></span></div>`;
  const msg = it.msg ? `
          <div class="up-msg up-msg-err">
            <p>${icon('alert', 16)}<span>${it.msg}</span></p>${it.msgAcciones ? `
            <div class="up-msg-actions">${it.msgAcciones}</div>` : ''}
          </div>` : '';
  const nota = it.nota ? `\n          <p class="up-note">${it.nota}</p>` : '';
  return `
        <li class="up-item">
          ${tile(it.nombre)}
          <div class="up-info">
            <p class="up-name">${it.nombre}</p>
            <p class="up-meta">${it.meta}${st}</p>
          </div>
          <div class="up-actions">${acciones}</div>${bar}${msg}${nota}
        </li>`;
}

function panel(p) {
  const cerrar = p.activas ? '' : btnIcon('x', 'Cerrar el panel de cargas', false);
  const banner = p.banner ? `
      <p class="up-banner">${icon('wifiOff', 18)}<span>${p.banner}</span></p>` : '';
  return `
      <section class="up" aria-labelledby="up-t">
        <div class="up-head">
          <div class="up-titles">
            <h2 id="up-t">${p.titulo}</h2>
            <span class="up-sub">${p.sub}</span>
          </div>
          <div class="up-head-actions">
            <button class="ibtn" type="button" aria-expanded="true" aria-controls="up-lista" aria-label="Contraer el panel de cargas">${icon('chevron', 18)}</button>${cerrar}
          </div>
        </div>${banner}
        <p class="sr-only" aria-live="polite">${p.anuncio}</p>
        <ul class="up-list" id="up-lista">${p.items.map(item).join('')}
        </ul>
      </section>`;
}

// Diálogos del panel: mismo componente (Dialog de shadcn como alertdialog), misma estructura:
// título, mensaje, nota sobre fondo muted, [casilla] y dos botones.
function dialogo(d) {
  if (!d) return '';
  const casilla = d.restantes ? `
    <div class="dialog-check">
      <input type="checkbox" id="dlg-todos" aria-describedby="dlg-todos-d">
      <div>
        <label for="dlg-todos">Aplicar a los demás</label>
        <p id="dlg-todos-d">Usaremos la misma respuesta para ${d.restantes === 1 ? 'el otro archivo' : `los otros ${d.restantes} archivos`} con nombre repetido.</p>
      </div>
    </div>` : '';
  if (d.tipo === 'cancelar') {
    return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d dlg-n">
    <h2 id="dlg-t">¿Cancelar esta carga?</h2>
    <p id="dlg-d">Ya subiste ${d.subido} de «${d.nombre}». La pausamos mientras decides.</p>
    <p id="dlg-n" class="dialog-note">Si la cancelas, se perderá lo que ya subiste y liberaremos el espacio reservado. Para subir el archivo tendrás que empezar de cero.</p>
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button" autofocus>Seguir subiendo</button>
      <button class="btn btn-destructive" type="button">Cancelar carga</button>
    </div>
  </div>`;
  }
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d dlg-n">
    <h2 id="dlg-t">¿Conservar ambos archivos?</h2>
    <p id="dlg-d">Ya tienes un archivo llamado «${d.nombre}». ¿Quieres conservar ambos o cancelar?</p>
    <p id="dlg-n" class="dialog-note">Si conservas ambos, el nuevo se guardará como <strong>«${d.nuevo}»</strong>.</p>${casilla}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button">Cancelar</button>
      <button class="btn btn-primary" type="button" autofocus>Conservar ambos</button>
    </div>
  </div>`;
}

function page(v) {
  const file = `carga--${v.estado}.html`;
  const q = v.cuota || CUOTA_NORMAL;
  const tramo = v.cuota === CUOTA_LLENA ? 'full' : 'warn';
  return `${M.cabecera({
    titulo: `Carga de archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 005: carga y descarga). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y UploadProgress.',
      'Marco generado con _generadores/marco/marco.js; panel de carga como el de carga--progreso.html (propuesta p. 10).',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">005</span> <strong>Carga de archivos</strong> <span class="file">${file}</span> <span>panel de carga sobre Mis archivos · plan Equipo · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${sidebar(q, tramo)}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'] })}
      <main class="content" id="contenido">
        <div class="page-head">
          <h1>Mis archivos</h1>
          <button class="btn btn-primary" type="button">${icon('upload', 16)}<span>Subir archivos</span></button>
        </div>${tabla(v.nuevos || [])}${panel(v.panel)}
      </main>
    </div>
  </div>${dialogo(v.dialogo)}
</div>

</body>
</html>
`;
}

// ---------- Acciones por archivo ----------
const pausar = (n) => btnIcon('pause', `Pausar la carga de ${n}`);
const cancelar = (n) => btnIcon('x', `Cancelar la carga de ${n}`);
const reanudar = (n, texto = 'Reanudar') =>
  `<button class="btn btn-primary btn-sm" type="button" aria-label="${texto} la carga de ${n}">${icon('play', 14)}<span>${texto}</span></button>`;

// ---------- Estados ----------
const VIDEO = 'Grabacion_sesion_13.mp4'; // 862 MB: cabe en el máximo de 1 GB del plan Equipo
const ZIP = 'Respaldo_encuestas_2026.zip';
const SIMPLE = 'Informe_avance_sep.docx'; // carga simple: al reanudar empieza de cero
const ANEXO = { nombre: 'Anexo_B_pgvector.pdf', meta: '3.4 MB', st: 'subido', stCls: 'st-ok', done: true };

const ESTADOS = [
  {
    estado: 'pausa',
    titulo: 'cargas en pausa (por partes y simple) y una en curso; pausar, reanudar y cancelar por archivo',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: 'Subiendo 3 archivos', sub: '2 en pausa · 54 %', activas: true,
      anuncio: `Pausaste la carga de ${SIMPLE}. Se reiniciará al reanudar.`,
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB · 8.4 MB/s · quedan 60 s', bar: 41, barTxt: '41 %, 354 MB de 862 MB',
          acciones: pausar(VIDEO) + cancelar(VIDEO) },
        { nombre: ZIP, meta: '461 MB de 640 MB', st: 'en pausa', stCls: 'st-warn', bar: 72, barCls: 'bar-warn', barTxt: '72 %, en pausa',
          acciones: reanudar(ZIP) + cancelar(ZIP) },
        { nombre: SIMPLE, meta: '1.1 MB de 2.6 MB', st: 'en pausa', stCls: 'st-warn', bar: 42, barCls: 'bar-warn', barTxt: '42 %, en pausa; se reiniciará al reanudar',
          acciones: reanudar(SIMPLE) + cancelar(SIMPLE), nota: 'Se reiniciará al reanudar.' },
        { nombre: 'Plano_laboratorio.pdf', meta: '12 MB', st: 'cancelada', stCls: '',
          nota: 'Cancelaste esta carga. Liberamos el espacio que tenía reservado.' },
        ANEXO,
      ],
    },
  },
  {
    estado: 'sin-conexion',
    titulo: 'se cortó la red; la carga se reanuda sola donde quedó (misma pestaña)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: 'Carga en espera', sub: '1 archivo · 41 %', activas: true,
      banner: '<strong>Se cortó la conexión.</strong> Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.',
      anuncio: 'Se cortó la conexión. Tu carga se reanudará donde quedó.',
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB', st: 'sin conexión', stCls: 'st-warn', bar: 41, barCls: 'bar-warn', barTxt: '41 %, sin conexión',
          acciones: reanudar(VIDEO) + cancelar(VIDEO) },
        ANEXO,
      ],
    },
  },
  {
    estado: 'rechazo-tamano',
    titulo: 'rechazo antes de subir: el archivo supera el máximo por archivo del plan (CA-3)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: '1 archivo rechazado', sub: '1 de 2 subido', activas: false,
      anuncio: 'No se subió Grabacion_sesion_14.mp4. Este archivo pesa 1.2 GB y tu plan permite hasta 1 GB por archivo.',
      items: [
        { nombre: 'Grabacion_sesion_14.mp4', meta: '1.2 GB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Este archivo pesa 1.2 GB y tu plan permite hasta 1 GB por archivo.</strong> Reduce su tamaño o cambia de plan.</span>',
          msgAcciones: '<a class="btn btn-outline btn-sm" href="#">Ver planes</a>' },
        ANEXO,
      ],
    },
  },
  {
    estado: 'rechazo-cuota',
    titulo: 'rechazo antes de subir: no queda espacio en la cuota del plan (CA-4)',
    cuota: CUOTA_LLENA,
    nuevos: [['Entrevistas_ronda2.docx', '820 KB', 'ahora']],
    panel: {
      titulo: '1 archivo rechazado', sub: '1 de 2 subido', activas: false,
      anuncio: 'No se subió Respaldo_fotos_campo.zip. Te faltan 320 MB de espacio para subir este archivo.',
      items: [
        { nombre: 'Respaldo_fotos_campo.zip', meta: '920 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Te faltan 320 MB de espacio para subir este archivo.</strong> Libera espacio o cambia de plan.</span>',
          msgAcciones: '<a class="btn btn-primary btn-sm" href="#">Liberar espacio</a><a class="btn btn-outline btn-sm" href="#">Ver planes</a>' },
        { nombre: 'Entrevistas_ronda2.docx', meta: '820 KB', st: 'subido', stCls: 'st-ok', done: true },
      ],
    },
  },
  {
    estado: 'tipo-invalido',
    titulo: 'rechazos por contenido: no coincide con la extensión, ejecutable y archivo vacío (CA-11, CA-24, CA-7)',
    nuevos: [['Acta_comite_sep.docx', '96 KB', 'ahora']],
    panel: {
      titulo: '3 archivos rechazados', sub: '1 de 4 subido', activas: false,
      anuncio: 'Se rechazaron 3 archivos. Revisa el motivo de cada uno.',
      items: [
        { nombre: 'Informe_final.docx', meta: '2.1 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Este archivo no es un .docx válido.</strong> Comprueba que sea el archivo correcto.</span>' },
        { nombre: 'Factura_septiembre.pdf', meta: '1.8 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>No se permiten archivos ejecutables.</strong> Sube otro archivo.</span>' },
        { nombre: 'Notas_reunion.txt', meta: '0 bytes', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>El archivo está vacío.</strong> Revisa que tenga contenido y súbelo de nuevo.</span>' },
        { nombre: 'Acta_comite_sep.docx', meta: '96 KB', st: 'subido', stCls: 'st-ok', done: true },
      ],
    },
  },
  {
    estado: 'nombre-repetido',
    titulo: 'ya existe un archivo con ese nombre en la raíz: conservar ambos o cancelar (CA-6)',
    dialogo: { nombre: 'Propuesta_Nimbo_v3.docx', nuevo: 'Propuesta_Nimbo_v3 (1).docx' },
    panel: {
      titulo: 'Subiendo 1 archivo', sub: 'esperando tu respuesta', activas: true,
      anuncio: 'Ya tienes un archivo llamado Propuesta_Nimbo_v3.docx.',
      items: [
        { nombre: 'Propuesta_Nimbo_v3.docx', meta: '2.4 MB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Propuesta_Nimbo_v3.docx') },
      ],
    },
  },
  {
    estado: 'nombre-repetido-varios',
    titulo: 'varios nombres repetidos: un diálogo por archivo con «Aplicar a los demás» (CA-6)',
    dialogo: { nombre: 'Matriz_Requisitos_RF.xlsx', nuevo: 'Matriz_Requisitos_RF (1).xlsx', restantes: 1 },
    panel: {
      titulo: 'Subiendo 3 archivos', sub: 'esperando tu respuesta', activas: true,
      anuncio: 'Ya tienes un archivo llamado Matriz_Requisitos_RF.xlsx.',
      items: [
        { nombre: 'Propuesta_Nimbo_v3 (1).docx', meta: '1.2 MB de 2.4 MB · 3.1 MB/s · quedan 1 s', bar: 50, barTxt: '50 %, 1.2 MB de 2.4 MB',
          acciones: pausar('Propuesta_Nimbo_v3 (1).docx') + cancelar('Propuesta_Nimbo_v3 (1).docx') },
        { nombre: 'Matriz_Requisitos_RF.xlsx', meta: '860 KB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Matriz_Requisitos_RF.xlsx') },
        { nombre: 'Modelo_ER_Nimbo.pdf', meta: '1.1 MB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Modelo_ER_Nimbo.pdf') },
      ],
    },
  },
  {
    estado: 'confirmar-cancelar',
    titulo: 'cancelar una carga con progreso mayor que 0 % pide confirmación; la carga queda en pausa mientras tanto (CA-22)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    dialogo: { tipo: 'cancelar', nombre: VIDEO, subido: '354 MB de 862 MB' },
    panel: {
      titulo: 'Subiendo 1 archivo', sub: '1 en pausa · 41 %', activas: true,
      anuncio: '',
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB', st: 'en pausa', stCls: 'st-warn', bar: 41, barCls: 'bar-warn', barTxt: '41 %, en pausa',
          acciones: reanudar(VIDEO) + cancelar(VIDEO) },
        ANEXO,
      ],
    },
  },
];

for (const v of ESTADOS) {
  const file = `carga--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
