// Panel de cargas (UploadProgress) de storage/carga (spec 005), extraído de carga/generar.js sin cambios para que
// shared/layout (estado aviso-arriba-centro de 007, CA-18) lo reutilice. Reproduce el de carga--progreso.html
// (propuesta p. 10) con tokens de ui-guidelines.md §3. Necesita S.CSS_LISTA (ícono de tipo de archivo).
const S = require('../mis-archivos/mis-archivos.js');

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const P = {
  ...S.P,
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M6 3 20 12 6 21Z"/>',
  wifiOff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};
const icon = S.crearIcon(P);
const { tile } = S;

// ---------- CSS (va después de S.CSS_LISTA) ----------
const CSS_PANEL = `
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
`;
// Dentro de @media (max-width: 900px)
const CSS_PANEL_MQ900 = `    .up { right: 16px; bottom: 16px; }
`;
// Dentro de @media (max-width: 600px): el panel pasa a hoja al pie (HOJA) y sus filas se apilan (FILAS)
const CSS_PANEL_MQ600_HOJA = `    /* En móvil el panel es una hoja al pie, a todo el ancho */
    .up { left: 8px; right: 8px; bottom: 8px; width: auto; max-width: none; border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md); }
    .up-head { padding: 6px 6px 6px 14px; }
    .up-item { padding: 12px 8px 12px 14px; }
    .ibtn { width: 44px; height: 44px; }
`;
const CSS_PANEL_MQ600_FILAS = `    .up-actions .btn { min-height: 44px; }
    .up-msg-actions .btn { min-height: 44px; flex: 1; }
    /* En móvil: nombre a todo el ancho; barra, mensaje y acciones debajo */
    .up-item { align-items: start; }
    .up-item > .bar, .up-item > .up-msg, .up-item > .up-note { grid-column: 1 / -1; }
    .up-item > .up-actions:has(button) { grid-column: 1 / -1; grid-row: 3; justify-content: flex-end; }
    .up-name { white-space: normal; overflow-wrap: anywhere; }
`;

// ---------- Piezas ----------
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

module.exports = { P, icon, btnIcon, item, panel, CSS_PANEL, CSS_PANEL_MQ900, CSS_PANEL_MQ600_HOJA, CSS_PANEL_MQ600_FILAS };
