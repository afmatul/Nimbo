// Avisos (Alert de shadcn): el aviso arriba de una lista (variantes destructiva y «warn», con o sin «Cerrar aviso») y el
// aviso `warning` dentro de un diálogo. Separado de estados.js (una responsabilidad por módulo, Art. IV).
const { icon } = require('./mis-archivos.js');

// Alert (aviso arriba de la lista), compartido con shared/layout (aviso del tope de fijados)
const CSS_ALERT = `  /* Aviso de descarga fallida (Alert de shadcn, variante destructiva), arriba de la lista */
  .alert { display: flex; align-items: flex-start; gap: 12px; margin: 20px 0 0; padding: 12px 8px 12px 16px; border: 1px solid color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); }
  .alert > .ico { margin-top: 2px; color: var(--destructive); }
  .alert-body { flex: 1; min-width: 0; }
  .alert-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--destructive); overflow-wrap: anywhere; }
  .alert-text { margin: 2px 0 0; font-size: 13.5px; color: var(--foreground); }
  .alert-actions { display: flex; align-items: center; gap: 4px; flex: none; }
  .alert .icon-btn { width: 36px; height: 36px; color: var(--secondary-foreground); }
  .alert + .files { margin-top: 16px; }

`;
exports.CSS_ALERT = CSS_ALERT;

// Reglas por debajo de 600 px (van dentro del @media de cada generador)
const CSS_ALERT_MQ600 = `    /* Aviso en móvil: la X arriba a la derecha (44 px) y «Reintentar» a todo el ancho debajo del texto */
    .alert { position: relative; flex-wrap: wrap; margin-top: 16px; padding: 12px 52px 12px 12px; }
    .alert-actions { width: calc(100% + 40px); padding-left: 30px; }
    .alert-actions .btn { flex: 1; min-height: 44px; }
    .alert .icon-btn { position: absolute; top: 4px; right: 4px; width: 44px; height: 44px; }
`;
exports.CSS_ALERT_MQ600 = CSS_ALERT_MQ600;
// Solo si se usa aviso({ cerrar: false }): sin la X no se reserva su hueco
exports.CSS_ALERT_SIN_CERRAR_MQ600 = `    .alert:not(:has(.icon-btn)) { padding-right: 12px; }
    .alert:not(:has(.icon-btn)) .alert-actions { width: 100%; }
`;

// Aviso arriba de la lista (Alert de shadcn, variante destructiva) con una acción y «Cerrar aviso».
// `texto` y `accion` son opcionales; tono 'warn' (límite alcanzado, no es una falla) usa los tokens warning.
// cerrar: false omite «Cerrar aviso» (un aviso que se va solo al reintentar, como el error de «Cargar más» de 004).
exports.aviso = function aviso({ titulo, texto = '', accion = '', tono = '', cerrar = true }) {
  return `
        <div class="alert${tono ? ` alert-${tono}` : ''}" role="${tono === 'warn' ? 'status' : 'alert'}">
          ${icon('alert', 18)}
          <div class="alert-body">
            <p class="alert-title">${titulo}</p>${texto ? `
            <p class="alert-text">${texto}</p>` : ''}
          </div>
          <div class="alert-actions">${accion ? `
            <button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}<span>${accion}</span></button>` : ''}${cerrar ? `
            <button class="icon-btn" type="button" aria-label="Cerrar aviso">${icon('x', 18)}</button>` : ''}
          </div>
        </div>`;
};

// Variante de aviso «warn» = `Alert variant="warning"` de ui-guidelines.md §4 (border-warning bg-warning/10 text-warning-foreground):
// el tope de fijados no es una falla del sistema; warning-foreground sobre warning al 10 %: 4.66 como mínimo (sobre background)
exports.CSS_ALERT_WARN = `  .alert.alert-warn { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); }
  .alert.alert-warn { align-items: center; }
  .alert.alert-warn > .ico { margin-top: 0; }
  .alert.alert-warn > .ico, .alert.alert-warn .alert-title { color: var(--warning-foreground); }
`;

// Aviso `warning` dentro de un diálogo (Alert variant="warning" de ui-guidelines.md §4, sin «Cerrar aviso»: vive y muere
// con el diálogo). Extraído al tercer uso (Art. VI.2): poda al reemplazar (storage/carga, 014), poda al restaurar
// (storage/ficha-archivo, 014) y poda al subir una versión como Editor (sharing/compartido-conmigo, 012).
// warning-foreground sobre warning al 10 % sobre card: 4.86; el texto en foreground: 12.69.
exports.CSS_DLG_WARN = `  .dlg-warn { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .dlg-warn .ico { margin-top: 1px; color: var(--warning-foreground); }
  .dlg-warn p { margin: 0 !important; font-size: 13.5px !important; color: var(--foreground) !important; }
  .dlg-warn strong { display: block; color: var(--warning-foreground) !important; font-weight: 600; }
`;
// role="status": se anuncia sin interrumpir; el id va en el aria-describedby del diálogo. texto: opcional, tras el título.
exports.avisoDialogo = ({ id = 'dlg-p', titulo, texto = '' }) => `
    <div id="${id}" class="dlg-warn" role="status">${icon('warn', 18)}<p><strong>${titulo}</strong>${texto}</p></div>`;
