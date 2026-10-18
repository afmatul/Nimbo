// Piezas comunes de los mockups de billing escritos a mano (spec 010: renovación, vencimiento y cambio de plan):
// datos de ejemplo, íconos, CSS de tarjetas, avisos (Alert info/warning/error), interruptor (Switch), diálogo de
// confirmación con resumen y aviso, y la página con el marco (barra lateral + barra superior) o sin barra lateral (pago).
// Las usan billing/generar-suscripcion.js, billing/generar-planes.js y billing/generar-pago.js.
// El marco sale de marco/marco.js; la barra lateral y el logo, de carpetas/carpetas.js. Los HTML empaquetados de la
// propuesta (suscripcion--propuesta.html, planes--plan-actual.html, pago.html) NO se generan aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const C = require('../carpetas/carpetas.js');

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const P = {
  ...C.P,
  ...M.P,
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  calendarClock: '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
};
const icon = S.crearIcon(P);

// ---------- Datos de ejemplo (en la app vienen de la API: catálogo 008, PlanLimits y la suscripción) ----------
// Catálogo de product-context §3. Los textos de cada plan son los de la propuesta (planes--plan-actual.html).
const PLANES = {
  personal: { nombre: 'Personal', desc: 'Para una persona que quiere su archivo ordenado y buscable.', precio: 'Q0.00', almac: '15 GB', archivo: '50 MB', docx: 'Solo lectura', editores: '—', agente: '20 / mes', versiones: 3, papelera: '7 días' },
  pro: { nombre: 'Pro', desc: 'Para profesionales con muchos documentos y consultas diarias.', precio: 'Q45.00', almac: '100 GB', archivo: '500 MB', docx: 'Sí', editores: '3', agente: '500 / mes', versiones: 30, papelera: '30 días' },
  equipo: { nombre: 'Equipo', desc: 'Para equipos que trabajan sobre el mismo corpus documental.', precio: 'Q110.00', almac: '350 GB', archivo: '1 GB', docx: 'Sí', editores: '5', agente: '2 000 / mes', versiones: 60, papelera: '60 días' },
  institucional: { nombre: 'Institucional', desc: 'Para organizaciones con volumen alto y requisitos de retención.', precio: 'Q450.00', almac: '2 TB', archivo: '2 GB', docx: 'Sí', editores: '5', agente: '10 000 / mes', versiones: 100, papelera: '90 días' },
};
const ACTUAL = PLANES.equipo;
// Tarjeta guardada del último pago aprobado: solo marca y últimos 4, para mostrar (RN-2, RN-9 de la 009)
const TARJETA = { marca: 'VISA', ultimos: '4242' };
const CORREO = M.CUENTA.correo;
// Uso de Lucía: cabe en Pro (100 GB) y no en Personal (15 GB)
const CUOTA = { usado: '64.2 GB', total: '350 GB', pct: 18 };

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + C.CSS_006_MQ600 + '  }\n' + M.EXTRA + C.CSS_006 + `
  /* Propio de billing (spec 010). Solo valores de ui-guidelines.md §3; las mezclas son las de Alert y StatusBadge. */
  .app { min-height: 900px; }
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  a.btn-outline:hover { color: var(--foreground); }
  .num { font-variant-numeric: tabular-nums; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .card h2 { margin: 0; font-size: 15px; line-height: 1.4; font-weight: 600; }
  .bill .readonly { margin: 0; }
  .stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

  /* Plan y facturación: columna de la cuenta y columna «Pagos y facturas» (plan-and-billing.tsx de la 009) */
  .bill { display: flex; flex-direction: column; gap: 16px; max-width: 1152px; margin: 0 auto; }
  .bill-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 24rem); gap: 16px; align-items: start; }
  .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

  /* CurrentPlanCard */
  .plan-card { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
  .plan-top { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; }
  .plan-name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .plan-card h2 { font-size: 20px; }
  .price { margin: 4px 0 0; font-size: 30px; font-weight: 700; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .price span { margin-left: 8px; font-size: 14px; font-weight: 400; color: var(--secondary-foreground); }
  .limits { margin: 4px 0 0; font-size: 14px; color: var(--secondary-foreground); }
  .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0; padding-top: 16px; border-top: 1px solid var(--border); }
  .facts.f2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .facts dt { font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted-foreground); }
  .facts dd { margin: 4px 0 0; font-size: 14px; color: var(--foreground); font-variant-numeric: tabular-nums; }

  /* Badge (secondary) y StatusBadge (ícono + texto, nunca solo color) */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--accent); color: var(--secondary-foreground); font-size: 12px; font-weight: 600; white-space: nowrap; }
  .badge-warn { color: var(--warning-foreground); background: var(--warning-soft); border: 1px solid var(--warning); }
  .badge-info { color: var(--primary-hover); background: var(--card); border: 1px solid var(--brand); }
  .brand-chip { display: inline-flex; padding: 2px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: .02em; color: var(--foreground); }

  /* «Próximo cobro» con el interruptor de renovación automática (next-charge-card + auto-renew-switch) */
  .next { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  .next-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .next-text { margin: 0; font-size: 14px; color: var(--foreground); }
  .next-note { margin: 0; font-size: 13px; color: var(--secondary-foreground); }
  .switch-row { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; padding-top: 16px; border-top: 1px solid var(--border); }
  .switch-label { margin: 0; font-size: 14px; font-weight: 600; }
  .switch-help { margin: 2px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .switch { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 4px; border: 0; background: transparent; color: var(--foreground); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; border-radius: var(--radius-md); flex: none; }
  .switch-track { position: relative; width: 44px; height: 24px; border-radius: 999px; border: 1px solid var(--input); background: var(--card); flex: none; }
  .switch-thumb { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 999px; background: var(--input); transition: left .15s ease; }
  .switch[aria-checked="true"] .switch-track { background: var(--primary); border-color: var(--primary); }
  .switch[aria-checked="true"] .switch-thumb { left: 23px; background: var(--primary-foreground); }
  .switch[disabled] { opacity: .45; cursor: not-allowed; }
  .switch-busy .switch-state { display: inline-flex; align-items: center; gap: 6px; }
  @media (prefers-reduced-motion: reduce) { .switch-thumb { transition: none; } }
  .next-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding-top: 16px; border-top: 1px solid var(--border); }
  .next-foot p { flex: 1; min-width: 220px; }

  /* Alert (components/ui/alert): info, warning y error, arriba del contenido al que se refieren */
  .al { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); }
  .al > .ico { margin-top: 2px; color: var(--primary); }
  .al-body { flex: 1; min-width: 0; }
  .al-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--foreground); }
  .al-text { margin: 2px 0 0; font-size: 13.5px; color: var(--foreground); }
  .al-actions { display: flex; flex-wrap: wrap; gap: 8px; flex: none; align-self: center; }
  .al-warn { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .al-warn > .ico, .al-warn .al-title { color: var(--warning-foreground); }
  .al-error { border-color: var(--destructive); }
  .al-error > .ico, .al-error .al-title { color: var(--destructive); }
  .card .al { box-shadow: none; }

  /* Método de pago, datos de facturación y «Pagos y facturas» (billing-account-cards + invoice-history) */
  .acc { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .acc p { margin: 0; font-size: 14px; }
  .muted2 { color: var(--secondary-foreground); }
  .pm { display: flex; align-items: center; gap: 12px; }
  .inv { list-style: none; margin: 0; padding: 0; }
  .inv li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
  .inv li:first-child { border-top: 0; }
  .inv p { margin: 0; }
  .inv .d { font-size: 14px; }
  .inv .s { font-size: 12px; color: var(--secondary-foreground); }
  .inv .r { font-size: 12px; color: var(--muted-foreground); }
  .inv .amt { display: flex; align-items: center; gap: 4px; font-size: 14px; font-variant-numeric: tabular-nums; }
  .inv .icon-btn { color: var(--secondary-foreground); }
  .inv-foot { margin: 0; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--secondary-foreground); }
  .usage-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: 14px; }
  .bar { height: 8px; border-radius: 999px; background: var(--muted); border: 1px solid var(--input); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--success); }
  .facts.plain dt { text-transform: none; letter-spacing: 0; font-weight: 400; }

  /* Diálogo de confirmación (AlertDialog): resumen y aviso (estilo de ficha-archivo--aviso-de-poda) */
  .dialog { top: 110px; width: min(520px, calc(100% - 32px)); }
  .dialog-summary { margin: 14px 0 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); }
  .dialog-summary div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13px; }
  .dialog-summary dt { color: var(--secondary-foreground); }
  .dialog-summary dd { margin: 0; color: var(--foreground); font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
  .dlg-warn { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--warning); border-radius: var(--radius-md); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .dlg-warn > .ico { margin-top: 1px; color: var(--warning-foreground); }
  .dlg-warn p, .dlg-warn li { margin: 0 !important; font-size: 13.5px !important; color: var(--foreground) !important; }
  .dlg-warn strong { display: block; color: var(--warning-foreground) !important; font-weight: 600; }
  .dlg-warn ul { margin: 4px 0 0; padding-left: 18px; display: grid; gap: 4px; }
  .dlg-alert strong { display: block; color: var(--destructive); font-weight: 600; }

  /* Página sin barra lateral (pago, como /planes/contratar de la 009) */
  .app.solo { grid-template-columns: minmax(0, 1fr); }
  .back { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font-size: 14px; }
  .sub-head h1 { margin: 0; font-size: 24px; line-height: 1.3; font-weight: 700; }
  .sub-head p { margin: 4px 0 0; max-width: 72ch; color: var(--secondary-foreground); font-size: 14px; }

  @media (max-width: 1100px) {
    .bill-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 900px) {
    .app.solo .topbar .logo { display: inline-flex; }
    /* El nombre se oculta solo a la vista: sigue en el nombre accesible del botón */
    .app.solo .account-btn .account-name { display: inline; position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
  }
  @media (max-width: 600px) {
    .two, .facts, .facts.f2 { grid-template-columns: minmax(0, 1fr); }
    .plan-card, .next { padding: 16px; }
    .plan-top { flex-direction: column; }
    .plan-top .btn, .next-foot .btn { width: 100%; min-height: 44px; }
    .al { flex-wrap: wrap; }
    .al-actions { width: 100%; padding-left: 30px; }
    .al-actions .btn { flex: 1; min-height: 44px; }
    .switch-row { flex-direction: column; gap: 8px; }
    .dialog { top: 72px; }
    .dialog-summary div { flex-direction: column; gap: 0; }
    .dialog-summary dd { text-align: left; }
    .sub-head h1 { font-size: 21px; }
  }
`;

// ---------- Piezas ----------
// a: { tono: 'info' | 'warn' | 'error', titulo, texto, acciones: [{ texto, href, clase }] }
function alerta(a) {
  const ic = a.tono === 'info' ? (a.icono || 'info') : 'alert';
  const rol = a.tono === 'error' ? 'alert' : 'status';
  const acciones = (a.acciones || []).map((x) => x.boton
    ? `<button class="btn ${x.clase || 'btn-outline'} btn-sm" type="button">${x.icono ? icon(x.icono, 14) : ''}<span>${x.texto}</span></button>`
    : `<a class="btn ${x.clase || 'btn-outline'} btn-sm" href="${x.href || '#'}">${x.texto}</a>`).join('');
  return `
        <div class="al al-${a.tono}" role="${rol}">
          ${icon(ic, 20)}
          <div class="al-body">
            <p class="al-title">${a.titulo}</p>${a.texto ? `
            <p class="al-text">${a.texto}</p>` : ''}
          </div>${acciones ? `
          <div class="al-actions">${acciones}</div>` : ''}
        </div>`;
}

const tarjetaTexto = (t = TARJETA) => `<span class="brand-chip">${t.marca}</span> <span class="num">···· ${t.ultimos}</span>`;

// Diálogo (AlertDialog de shadcn). d: { titulo, descripcion, resumen: [[dt, dd]], aviso: { titulo, items }, error,
// confirmar, cancelar = 'Cancelar', foco: 'cancelar' | 'confirmar' }
function dialogo(d) {
  const ids = ['dlg-d', d.resumen ? 'dlg-n' : '', d.aviso ? 'dlg-p' : ''].filter(Boolean).join(' ');
  const resumen = d.resumen ? `
    <dl id="dlg-n" class="dialog-summary">${d.resumen.map(([t, v]) => `
      <div><dt>${t}</dt><dd>${v}</dd></div>`).join('')}
    </dl>` : '';
  const aviso = d.aviso ? `
    <div id="dlg-p" class="dlg-warn">${icon('warn', 18)}<div><strong>${d.aviso.titulo}</strong><ul>${d.aviso.items.map((i) => `
      <li>${i}</li>`).join('')}
    </ul></div></div>` : '';
  const error = d.error ? `
    <div class="dlg-alert" role="alert">${icon('alert', 18)}<p><strong>${d.error.titulo}</strong>${d.error.texto}</p></div>` : '';
  const focoCancelar = d.foco !== 'confirmar' ? ' autofocus' : '';
  const confirmar = d.confirmar ? `
      <button class="btn btn-primary" type="button"${d.foco === 'confirmar' ? ' autofocus' : ''}>${d.confirmar}</button>` : '';
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="${ids}">
    <h2 id="dlg-t">${d.titulo}</h2>
    <p id="dlg-d">${d.descripcion}</p>${resumen}${aviso}${error}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button"${focoCancelar}>${d.cancelar || 'Cancelar'}</button>${confirmar}
    </div>
  </div>`;
}

// Barra superior sin barra lateral (pago): logo y cuenta, como el paquete pago.html y /planes/contratar.
const topbarSolo = () => `
      <header class="topbar">
        <div class="topbar-left">${M.logo()}</div>
        <button class="account-btn" type="button" aria-haspopup="menu" aria-expanded="false">
          <span class="account-name">${M.CUENTA.nombre}</span><span class="sr-only">, menú de la cuenta</span><span class="avatar" aria-hidden="true">${M.CUENTA.iniciales}</span>
        </button>
      </header>`;

// p: { carpeta, archivo, chip, pantalla, rotulo, titulo, crumbs, cuerpo, dialogo, sinBarra, generador }
function pagina(p) {
  const html = `${M.cabecera({
    titulo: `${p.pantalla} · Nimbo — ${p.rotulo}`,
    comentarios: [
      `Mockup de referencia (spec 010: renovación, vencimiento y cambio de plan). Estado: ${p.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      `Generado con _generadores/billing/${p.generador} (marco, carpetas y billing). No editar a mano.`,
    ],
    css: CSS + (p.css || ''),
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">010</span> <strong>${p.pantalla}</strong> <span class="file">${p.archivo}</span> <span>plan Equipo · estado: ${p.rotulo}</span></aside>

<div class="canvas">
  <div class="app${p.sinBarra ? ' solo' : ''}"${p.dialogo ? ' inert' : ''}>${p.sinBarra ? '' : `
    ${C.sidebar({ activo: '', cuota: CUOTA, tramo: 'ok' })}`}
    <div class="main">${p.sinBarra ? topbarSolo() : `
      ${M.topbar({ crumbs: p.crumbs })}`}
      <main class="content" id="contenido">${p.cuerpo}
      </main>
    </div>
  </div>${p.dialogo || ''}
</div>

</body>
</html>
`;
  return C.conLogo(html);
}

function escribir(repo, carpeta, archivo, html) {
  const out = path.join(repo, 'docs/design/mockups/billing', carpeta);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, archivo), html, 'utf8');
  console.log(`billing/${carpeta}/${archivo}`);
}

module.exports = { P, icon, PLANES, ACTUAL, TARJETA, CORREO, CUOTA, CSS, alerta, tarjetaTexto, dialogo, pagina, escribir };

// ---------- CSS de la lista de planes (PlanCard de 008 + PlanComparisonTable de 009) ----------
module.exports.CSS_PLANES = `
  .plans { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
  .pc { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .pc.is-current { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary), var(--shadow-card); }
  .pc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .pc h2 { font-size: 16px; }
  .pc-desc { margin: 0; min-height: 40px; font-size: 13px; color: var(--muted-foreground); }
  .pc-price { margin: 0; display: flex; align-items: baseline; gap: 4px; font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pc-price span { font-size: 12px; font-weight: 400; color: var(--muted-foreground); }
  .pc dl { margin: 0; padding-top: 10px; border-top: 1px solid var(--border); display: grid; gap: 8px; font-size: 13px; }
  .pc dl div { display: flex; justify-content: space-between; gap: 8px; }
  .pc dt { color: var(--muted-foreground); }
  .pc dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
  .pc-action { margin-top: auto; padding-top: 4px; }
  .pc-action .btn { width: 100%; }
  .pc-current { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; margin: 0; font-size: 13.5px; font-weight: 600; color: var(--primary-hover); }
  .cmp { margin-top: 20px; overflow-x: auto; }
  .cmp table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cmp th, .cmp td { padding: 12px 16px; border-bottom: 1px solid var(--border); text-align: center; white-space: nowrap; }
  .cmp thead th { font-weight: 600; background: var(--muted); }
  .cmp tbody th { text-align: left; font-weight: 500; color: var(--secondary-foreground); }
  .cmp tbody tr:last-child > * { border-bottom: 0; }
  .cmp td { font-variant-numeric: tabular-nums; }
  @media (max-width: 1180px) { .plans { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 600px) { .plans { grid-template-columns: minmax(0, 1fr); } .pc-desc { min-height: 0; } .pc-action .btn { min-height: 44px; } }
`;
