// Piezas comunes de la spec 007 (cuota y explorador): datos de ejemplo del plan Personal, tarjeta de cuota de la barra
// lateral con sus tramos (QuotaBar, ui-guidelines §4) y su acción, y la barra lateral de las pantallas de 007.
// Las usan resumen-espacio/generar.js, explorador/generar-orden.js y layout/generar.js (estados de tramo).
// Datos: plan Personal de product-context §3 y 006a RN-1 (15 GB, 50 MB por archivo, 7 días en la papelera).
// En la app salen de la API (resumen de 007 y PlanLimits); aquí son solo ejemplo. No hay cifras de otros planes.
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const P = {
  ...S.P,
  arrowUpDown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  hardDrive: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
};
const icon = S.crearIcon(P);

// ---------- Plan Personal (ejemplo) ----------
const PLAN = 'PERSONAL';
const PLAN_NOMBRE = 'Personal';
const CUOTA_TOTAL = '15 GB';
const MAX_POR_ARCHIVO = '50 MB';
const RETENCION = '7 días';

// Cuota de la barra lateral por tramo (mismas cifras que el resumen de cada estado)
const CUOTAS = {
  ok: { usado: '4.8 GB', total: CUOTA_TOTAL, pct: 32 },
  warn: { usado: '12.3 GB', total: CUOTA_TOTAL, pct: 82 },
  full: { usado: '14.1 GB', total: CUOTA_TOTAL, pct: 94 },
  llena: { usado: '15 GB', total: CUOTA_TOTAL, pct: 100 },
};
const tramoDe = (pct) => (pct >= 90 ? 'full' : pct >= 70 ? 'warn' : 'ok');
// Textos del tramo de QuotaBar (ui-guidelines §4, spec 007 RN-4): con punto final y «Espacio agotado.» al 100 %.
const notaDe = (pct) => {
  if (pct >= 100) return 'Espacio agotado.';
  return pct >= 90 ? 'Espacio casi agotado.' : `Tu cuota está al ${pct} %.`;
};

// ---------- Tarjeta de cuota (QuotaBar compacto de la barra lateral) ----------
// estado: 'listo' | 'cargando' | 'error'. enlace: false en el propio resumen (ya es el destino).
// 0–69 %: «Ver detalle»; 70–89 % y 90–100 %: texto del tramo con ícono + «Liberar espacio». Ambos llevan al resumen.
function tarjeta(q, { estado = 'listo', enlace = true, drawer = false } = {}) {
  if (estado === 'cargando') {
    return `<div class="quota" aria-busy="true">
        <div class="quota-head"><span>Almacenamiento</span></div>
        <div class="quota-bar quota-bar-sk" aria-hidden="true"></div>
        <p class="quota-meta" role="status">Calculando tu espacio…</p>
      </div>`;
  }
  if (estado === 'error') {
    return `<div class="quota">
        <div class="quota-head"><span>Almacenamiento</span></div>
        <p class="quota-meta quota-meta-error">${icon('alert', 14)}<span>No pudimos calcular tu espacio.</span></p>
      </div>`;
  }
  const tramo = tramoDe(q.pct);
  const nota = notaDe(q.pct);
  const notaHtml = tramo === 'ok' ? '' : `
        <p class="quota-note">${icon(tramo === 'full' ? 'alert' : 'warn', 14)}<span>${nota}</span></p>`;
  const accion = tramo === 'ok' ? 'Ver detalle' : 'Liberar espacio';
  const enlaceHtml = enlace ? `
        <a class="quota-link" href="#">${accion}${icon('chevronRight', 14)}</a>` : '';
  return `<div class="quota${tramo === 'ok' ? '' : ` quota-${tramo}`}">
        <div class="quota-head"><span>Almacenamiento</span><span>${q.pct} %</span></div>
        <div class="quota-bar" role="progressbar" aria-label="Almacenamiento usado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${q.pct}" aria-valuetext="${q.usado} de ${q.total} (${q.pct} %)"><span style="width: ${q.pct}%"></span></div>
        <div class="quota-meta">${q.usado} de ${q.total}</div>${notaHtml}${enlaceHtml}
      </div>`;
}

// Decisión (e) de 007 (plan D-18): el ítem «Espacio» (/espacio) reemplaza a «Plan y facturación» hasta que 008
// entregue los planes. activo: 'Espacio' lo marca con aria-current="page" (en el propio resumen).
const ITEM_PLAN = /<li><a href="#"><svg[^>]*>(?:(?!<li>)[\s\S])*?<\/svg><span>Plan y facturación<\/span><\/a><\/li>/;
function conItemEspacio(html, activo) {
  const actual = activo === 'Espacio' ? ' aria-current="page"' : '';
  return html.replace(ITEM_PLAN, `<li><a href="#"${actual}>${icon('hardDrive')}<span>Espacio</span></a></li>`);
}

// Barra lateral de 007: la de 006 (carpetas de primer nivel y contador de la Papelera) con plan Personal, el ítem
// «Espacio» y la tarjeta de 007. carpetas/contador por defecto: los de carpetas/carpetas.js.
function sidebar({ activo = '', q = CUOTAS.ok, estado = 'listo', enlace = true, carpetas, papelera = '6' } = {}) {
  const C = require('../carpetas/carpetas.js');
  const lista = (carpetas || C.CARPETAS_RAIZ).map((n) => ['folder', n]);
  const html = M.sidebar({ activo, plan: PLAN, cuota: q, carpetas: lista, contadorPapelera: papelera })
    .replace(M.cuota(q), tarjeta(q, { estado, enlace }));
  return conItemEspacio(html, activo);
}

// ---------- CSS de la tarjeta (se suma a M.CSS.TRAMOS) ----------
const CSS_TARJETA = `
  /* Tarjeta de cuota de 007: ícono en el texto del tramo, acción y estados de carga y error */
  :root { --warning: #D4A96A; --warning-foreground: #8A6424; }
  .quota-bar span { transition: width .3s ease; }
  .quota-note { display: flex; align-items: flex-start; gap: 6px; }
  .quota-note .ico { margin-top: 2px; }
  .quota-link { display: inline-flex; align-items: center; gap: 2px; min-height: 24px; margin-top: 6px; font-size: 12.5px; font-weight: 600; }
  .quota-bar-sk { background: var(--muted); }
  .quota-meta-error { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; color: var(--secondary-foreground); }
  .quota-meta-error .ico { margin-top: 2px; color: var(--destructive); }
  .quota p.quota-meta { margin: 0; }
  .drawer .quota-link { min-height: 44px; font-size: 14px; }
  @media (prefers-reduced-motion: reduce) { .quota-bar span { transition: none; } }
`;

module.exports = {
  P, icon, PLAN, PLAN_NOMBRE, CUOTA_TOTAL, MAX_POR_ARCHIVO, RETENCION, CUOTAS, tramoDe, notaDe,
  tarjeta, sidebar, conItemEspacio, CSS_TARJETA,
};
