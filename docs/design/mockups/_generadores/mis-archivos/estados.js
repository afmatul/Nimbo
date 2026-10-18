// Estados comunes de las páginas de lista (Mis archivos de 005 y 006, Papelera de 006): CSS de vacío, cargando, error y
// zona de soltar, y sus piezas de HTML. Extraído de explorador/generar.js sin cambios. Los avisos (Alert) viven en
// avisos.js, pero CSS_ESTADOS y CSS_ESTADOS_MQ600 ya incluyen su CSS_ALERT y CSS_ALERT_MQ600 (quien usa estos estados
// no los agrega aparte); el pie «Cargar más» vive en cargar-mas.js y el script del menú ⋮ en menu-fila.js.
const { icon } = require('./mis-archivos.js');
const { CSS_ALERT, CSS_ALERT_MQ600 } = require('./avisos.js');

exports.CSS_ESTADOS = `  /* Vacío (StateView type="empty" de 000b): borde discontinuo, ícono, título, descripción y acción */
  .state-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 224px; margin-top: 20px; padding: 32px; text-align: center; background: var(--card); border: 1px dashed var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .state-empty > .ico { margin-bottom: 16px; color: var(--muted-foreground); }
  .state-empty h2 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; letter-spacing: -.01em; }
  .state-empty p { margin: 6px 0 0; max-width: 384px; font-size: 14px; color: var(--muted-foreground); }
  .state-empty .btn { margin-top: 20px; }
  .solo-tactil { display: none; }

  /* Cargando: esqueleto con la forma de la tabla (aria-hidden) y un estado con texto */
  .files-skeleton .sk-head { display: grid; grid-template-columns: minmax(0, 1fr) 130px 130px 64px; padding: 11px 16px; background: var(--background); border-bottom: 1px solid var(--border); }
  .sk-row { display: grid; grid-template-columns: minmax(0, 1fr) 130px 130px 64px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .sk-row:last-child { border-bottom: 0; }
  .sk-name { display: flex; align-items: center; gap: 12px; }
  .sk-name > div { flex: 1; }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .skeleton-line.tile { width: 30px; height: 30px; flex: none; border-radius: 8px; }
  .skeleton-line.head { height: 10px; width: 64px; background: var(--border); }
  .skeleton-line.meta { display: none; }
  .w30 { width: 30%; } .w40 { width: 40%; } .w45 { width: 45%; } .w55 { width: 55%; } .w60 { width: 60%; } .w70 { width: 70%; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Error (StateView type="error", con el tono y la estructura del error aprobado de Seguridad) */
  .state-error { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 224px; margin-top: 20px; padding: 32px; text-align: center; border: 1px dashed color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); }
  .state-error > .ico { color: var(--destructive); }
  .state-error h2 { margin: 12px 0 6px; font-size: 16px; line-height: 1.5; font-weight: 600; color: var(--destructive); }
  .state-error p { margin: 0 0 20px; max-width: 46ch; font-size: 14px; color: var(--foreground); }

${CSS_ALERT}  /* Arrastre (§5): zona de soltar sobre Mis archivos, bg-brand/5 + borde 1.5 px discontinuo brand */
  .content { position: relative; flex: 1; } /* la zona de soltar ocupa todo el área bajo la barra superior */
  .dropzone { position: absolute; inset: 10px; z-index: 4; border: 1.5px dashed var(--brand); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--brand) 5%, transparent); pointer-events: none; }
  .drop-label { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; width: max-content; max-width: calc(100% - 32px); margin: 0; padding: 12px 20px 12px 14px; border-radius: var(--radius-lg); background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-modal); }
  .drop-label-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex: none; border-radius: 999px; background: color-mix(in srgb, var(--primary-foreground) 16%, var(--primary)); }
  .drop-label strong { display: block; font-size: 15px; font-weight: 600; }
  .drop-label span.sub { display: block; font-size: 13px; }

`;

// Reglas por debajo de 600 px (van dentro del @media de cada generador)
exports.CSS_ESTADOS_MQ600 = `    .state-empty { margin-top: 16px; padding: 32px 16px; }
    .state-empty .btn, .state-error .btn { width: 100%; }
    .state-error { margin-top: 16px; padding: 32px 16px; }
${CSS_ALERT_MQ600}    .solo-escritorio { display: none; }
    .solo-tactil { display: inline; }
    .files-skeleton .sk-head { display: none; }
    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 12px; }
    .sk-row > .sk-col { display: none; }
    .skeleton-line.meta { display: block; margin-top: 8px; height: 10px; }
    .dropzone { inset: 6px; }
    .drop-label { bottom: 20px; padding: 10px 14px 10px 10px; }
`;

// ---------- Piezas de estado (HTML), parametrizadas por texto ----------
// Cargando: esqueleto con la forma de la tabla (aria-hidden) y un texto role="status".
// Filas del esqueleto: anchos distintos para que no parezca una tabla real
const SK = [['w60', 'w45', 'w55'], ['w45', 'w30', 'w60'], ['w70', 'w40', 'w45'], ['w55', 'w45', 'w70'], ['w40', 'w30', 'w55']];
exports.esqueleto = function esqueleto(texto) {
  const fila = ([n, t, f]) => `
            <div class="sk-row"><div class="sk-name"><span class="skeleton-line tile"></span><div><span class="skeleton-line ${n}"></span><span class="skeleton-line meta w40"></span></div></div><div class="sk-col"><span class="skeleton-line ${t}"></span></div><div class="sk-col"><span class="skeleton-line ${f}"></span></div><div class="sk-col"></div></div>`;
  return `
        <div aria-busy="true">
          <div class="files files-skeleton" aria-hidden="true">
            <div class="sk-head"><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span class="skeleton-line head"></span><span></span></div>${SK.map(fila).join('')}
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}${texto}</p>
        </div>`;
};

// Error de pantalla (StateView type="error" con «Reintentar» outline)
exports.errorEstado = function errorEstado(titulo, texto) {
  return `
        <div class="state-error" role="alert">
          ${icon('alert', 40)}
          <h2>${titulo}</h2>
          <p>${texto}</p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;
};

// Zona de soltar sobre el área de contenido; destino: «Mis archivos» o el nombre de la carpeta abierta
exports.arrastre = function arrastre(destino, max) {
  return `
        <div class="dropzone" aria-hidden="true"></div>
        <p class="drop-label" role="status"><span class="drop-label-icon">${icon('upload', 20)}</span><span><strong>Suelta para subir</strong><span class="sub">Se guardarán en ${destino} · hasta ${max} por archivo</span></span></p>`;
};
