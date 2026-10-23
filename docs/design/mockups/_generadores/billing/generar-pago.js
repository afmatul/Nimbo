// Genera los estados de billing/pago para la renovación manual de la spec 010 (/suscripcion/renovar) sobre el
// formulario que implementó la 009 (payment-form.tsx y payment-summary.tsx): número con la marca dentro del campo,
// vencimiento con su ayuda, CVC oculto y NIT; resumen con el periodo nuevo «del … al …» (CA-8), rechazado (CA-9) y
// aprobado. Sin «Nombre en la tarjeta» (la 009 no lo tiene). Página sin barra lateral, como /planes/contratar.
// Uso: node generar-pago.js <ruta-del-worktree>
// pago.html (paquete de la 009) NO se genera aquí.
const B = require('./billing.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const { icon, ACTUAL, CORREO, alerta } = B;

// Subtotal e IVA desde el precio, con la regla de packages/contracts/src/billing/breakdown.ts (RN-2 de la 009):
// subtotal = precio × 100 / 112 redondeado al centavo (mitades hacia arriba); IVA = precio − subtotal.
function importes(precio) {
  const total = Math.round(Number(precio.replace('Q', '')) * 100);
  const subtotal = Math.floor((total * 100 + 56) / 112);
  const q = (centavos) => `Q${(centavos / 100).toFixed(2)}`;
  return { subtotal: q(subtotal), iva: q(total - subtotal) };
}
const IMPORTES = importes(ACTUAL.precio);

const CSS_PAGO = `
  .pay { max-width: 1024px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .pay-grid { display: grid; grid-template-columns: minmax(0, 1fr) 22rem; gap: 24px; align-items: start; }
  .pay-card { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .pay-card h1 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 20px; font-weight: 700; }
  .pay-sub { margin: 4px 0 0; font-size: 14px; color: var(--muted-foreground); }
  .badge-sim { color: var(--warning-foreground); background: var(--warning-soft); border: 1px solid var(--warning); text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  form { display: flex; flex-direction: column; gap: 16px; margin: 0; }
  .f label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
  .f-ctl { position: relative; }
  .f input { width: 100%; min-height: 44px; padding: 10px 14px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; }
  .f input.pr { padding-right: 72px; }
  .f-adorn { position: absolute; right: 12px; top: 0; height: 44px; display: flex; align-items: center; pointer-events: none; }
  .f-hint { margin: 6px 0 0; font-size: 12px; color: var(--muted-foreground); }
  .row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .pay-card .btn-primary { width: 100%; min-height: 44px; }
  .test-cards { margin: 0; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); font-size: 12px; color: var(--secondary-foreground); }
  .test-cards ul { margin: 4px 0 0; padding-left: 18px; }
  .sum { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .sum-k { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted-foreground); }
  .sum-plan { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .sum-plan h2 { display: flex; align-items: center; gap: 8px; font-size: 16px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--primary); }
  .sum ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 14px; }
  .period { margin: 0; padding: 12px; border-radius: var(--radius-md); background: var(--brand-soft); border-left: 3px solid var(--brand); }
  .period dl { margin: 0; }
  .period dt { font-size: 12px; font-weight: 600; color: var(--secondary-foreground); }
  .period dd { margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--foreground); }
  .period p { margin: 6px 0 0; font-size: 12.5px; color: var(--secondary-foreground); }
  .amounts { margin: 0; padding-top: 12px; border-top: 1px solid var(--border); display: grid; gap: 4px; font-size: 14px; }
  .amounts div { display: flex; justify-content: space-between; }
  .amounts dt { color: var(--muted-foreground); }
  .amounts dd { margin: 0; font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin: 0; padding-top: 12px; border-top: 1px solid var(--border); }
  .total span:first-child { font-size: 14px; font-weight: 600; }
  .total span:last-child { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .ok-card { padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  .ok-card > .ico { color: var(--success-foreground); }
  .ok-card h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .ok-card p { margin: 0; font-size: 14px; }
  .ok-card dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; font-size: 14px; }
  .ok-card dt { color: var(--muted-foreground); }
  .ok-card dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
  @media (max-width: 900px) { .pay-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) { .row2 { grid-template-columns: minmax(0, 1fr); } .pay-card, .ok-card { padding: 16px; } .ok-card .btn { width: 100%; min-height: 44px; } }
`;

// ---------- Escenarios ----------
// Por vencer (19 oct): el periodo nuevo empieza en el vencimiento actual (RN-1, CA-8).
// Solo lectura (venció el 15 oct; hoy 17 oct): empieza en el momento del pago (CA-10).
const PERIODOS = {
  anticipada: {
    rango: 'del 19 de octubre al 18 de noviembre de 2026',
    nota: 'Empieza cuando termina tu periodo actual: no pierdes días pagados.',
    vence: '18 de noviembre de 2026',
  },
  soloLectura: {
    rango: 'del 17 de octubre al 16 de noviembre de 2026',
    nota: 'Empieza hoy, al aprobarse el pago, y tu cuenta deja de estar en solo lectura.',
    vence: '16 de noviembre de 2026',
  },
};

function campo({ id, label, valor, tipo = 'text', modo = 'numeric', auto, hint, adorno, extra = '' }) {
  return `
            <div class="f">
              <label for="${id}">${label}</label>
              <div class="f-ctl"><input id="${id}" type="${tipo}" inputmode="${modo}" autocomplete="${auto}" value="${valor}"${adorno ? ' class="pr"' : ''}${hint ? ` aria-describedby="${id}-ayuda"` : ''}${extra}>${adorno ? `<span class="f-adorn"><span class="badge">${adorno}</span></span>` : ''}</div>${hint ? `
              <p class="f-hint" id="${id}-ayuda">${hint}</p>` : ''}
            </div>`;
}

function formulario({ numero, rechazado = false }) {
  const fallo = rechazado ? alerta({
    tono: 'error', titulo: 'La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.',
    texto: 'Tu plan y su vencimiento no cambiaron.',
  }) : '';
  return `
          <section class="card pay-card" aria-labelledby="pago-t">
            <header>
              <h1 id="pago-t">Renovar tu plan <span class="badge badge-sim">Simulado</span></h1>
              <p class="pay-sub">Es un pago de prueba. No se hace ningún cargo real.</p>
            </header>${fallo}
            <form novalidate>${campo({ id: 'pago-number', label: 'Número de tarjeta', valor: numero, auto: 'cc-number', adorno: 'VISA' })}
              <div class="row2">${campo({ id: 'pago-expiry', label: 'Vencimiento', valor: '12/28', auto: 'cc-exp', hint: 'Mes y año, como 12/28.' })}${campo({ id: 'pago-cvc', label: 'CVC', valor: '123', tipo: 'password', auto: 'cc-csc' })}
              </div>${campo({ id: 'pago-nit', label: 'NIT para la factura', valor: '4527913-6', modo: 'text', auto: 'off' })}
              <button class="btn btn-primary" type="submit">Pagar ${ACTUAL.precio}</button>
            </form>
            <div class="test-cards">Tarjetas de prueba:
              <ul>
                <li><span class="num">4242 4242 4242 4242</span> aprueba siempre.</li>
                <li><span class="num">4000 0000 0000 0341</span> aprueba ahora y se rechaza en el cobro automático.</li>
                <li><span class="num">4000 0000 0000 0002</span> rechaza siempre.</li>
              </ul>
            </div>
          </section>`;
}

const resumen = (per) => `
          <section class="card sum" aria-labelledby="resumen-pago">
            <p class="sum-k" id="resumen-pago">Resumen</p>
            <div class="sum-plan"><h2><span class="dot" aria-hidden="true"></span>Plan ${ACTUAL.nombre}</h2><span class="pay-sub">mensual</span></div>
            <ul>
              <li>${ACTUAL.almac} de almacenamiento</li>
              <li>${ACTUAL.archivo} por archivo</li>
              <li>${ACTUAL.versiones} versiones por archivo</li>
              <li>${ACTUAL.agente.replace(' / mes', '')} consultas al agente al mes</li>
            </ul>
            <div class="period">
              <dl><dt>Periodo nuevo</dt><dd>${per.rango}</dd></dl>
              <p>${per.nota}</p>
            </div>
            <dl class="amounts">
              <div><dt>Subtotal</dt><dd>${IMPORTES.subtotal}</dd></div>
              <div><dt>IVA (12 %)</dt><dd>${IMPORTES.iva}</dd></div>
            </dl>
            <p class="total"><span>Total hoy</span><span>${ACTUAL.precio}</span></p>
          </section>`;

const aprobado = (per, { soloLectura = false } = {}) => `
          <section class="card ok-card" aria-labelledby="ok-t" role="status">
            ${icon('ok', 32)}
            <h1 id="ok-t">Pago aprobado</h1>
            <p>Renovaste tu plan ${ACTUAL.nombre} hasta el ${per.vence}. Te enviamos el comprobante a ${CORREO}.${soloLectura ? ' Tu cuenta ya no está en solo lectura: puedes volver a subir y editar.' : ''}</p>
            <dl>
              <dt>Referencia</dt><dd>SIM-8K2M4T</dd>
              <dt>Periodo nuevo</dt><dd>${per.rango}</dd>
            </dl>
            <a class="btn btn-primary" href="../suscripcion/suscripcion--vigente.html">Ir a Plan y facturación</a>
          </section>`;

const layoutPago = (izq, per) => `
        <div class="pay">
          <a class="back" href="../suscripcion/suscripcion--por-vencer.html">${icon('arrowLeft', 16)}Volver a Plan y facturación</a>
          <div class="pay-grid">${izq}${resumen(per)}
          </div>
        </div>`;

const A = PERIODOS.anticipada;
const ESTADOS = [
  {
    estado: 'renovacion', rotulo: `renovar por adelantado (vence el 19 de octubre): el resumen muestra el periodo nuevo ${A.rango} (CA-8)`,
    cuerpo: layoutPago(formulario({ numero: '4242 4242 4242 4242' }), A),
  },
  {
    estado: 'renovacion-rechazado', rotulo: 'tarjeta 4000 0000 0000 0002 rechazada: nada cambia (CA-9)',
    cuerpo: layoutPago(formulario({ numero: '4000 0000 0000 0002', rechazado: true }), A),
  },
  {
    estado: 'renovacion-exito', rotulo: 'pago aprobado: referencia y periodo nuevo (CA-8)',
    cuerpo: layoutPago(aprobado(A), A),
  },
  {
    estado: 'renovacion-solo-lectura', rotulo: 'renovar desde solo lectura: el periodo nuevo empieza hoy (CA-10)',
    cuerpo: layoutPago(formulario({ numero: '4242 4242 4242 4242' }), PERIODOS.soloLectura),
  },
];

for (const v of ESTADOS) {
  const archivo = `pago--${v.estado}.html`;
  B.escribir(repo, 'pago', archivo, B.pagina({
    generador: 'generar-pago.js', pantalla: 'Pago de la renovación', estado: v.estado, archivo, rotulo: v.rotulo,
    cuerpo: v.cuerpo, sinBarra: true, css: CSS_PAGO,
  }));
}
