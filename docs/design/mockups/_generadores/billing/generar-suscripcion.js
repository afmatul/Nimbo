// Genera los estados de billing/suscripcion («Plan y facturación», /suscripcion) para la spec 010 sobre la pantalla
// que implementó la 009 (plan-and-billing.tsx): plan actual, «Próximo cobro» con el interruptor de renovación
// automática, «Consumo del plan», método de pago, datos de facturación y «Pagos y facturas».
// Uso: node generar-suscripcion.js <ruta-del-worktree>
// suscripcion--propuesta.html (paquete de la propuesta, p. 17) NO se genera aquí.
const M = require('../marco/marco.js');
const B = require('./billing.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const { icon, ACTUAL, PLANES, TARJETA, VENCE, AVISO_VENCIDA, CORREO, alerta, tarjetaTexto, tarjetaEnFrase } = B;
const PAGO = '../pago/pago--renovacion.html';
const CAMBIAR = '../planes/planes--cambiar-plan.html';

// ---------- Ciclos de ejemplo (hoy: 17 de octubre de 2026) ----------
const pagada = (fecha, factura, ref, plan, monto) => ({ fecha, factura, ref, plan, monto });
const CICLOS = {
  // Periodo del 5 de octubre al 4 de noviembre
  vigente: {
    vence: VENCE, tarjeta: TARJETA,
    pagos: [
      pagada('5 de octubre de 2026', 'NB-2026-0131', 'SIM-7F3K2Q', 'Equipo', 'Q110.00'),
      pagada('5 de septiembre de 2026', 'NB-2026-0098', 'SIM-4H8N1C', 'Equipo', 'Q110.00'),
      pagada('6 de agosto de 2026', 'NB-2026-0064', 'SIM-2B6P9X', 'Pro', 'Q45.00'),
    ],
  },
  // Vence en 2 días (dentro de N = 3, RN-8)
  porVencer: {
    vence: '19 de octubre de 2026', tarjeta: TARJETA,
    pagos: [
      pagada('19 de septiembre de 2026', 'NB-2026-0112', 'SIM-9D2R5V', 'Equipo', 'Q110.00'),
      pagada('20 de agosto de 2026', 'NB-2026-0079', 'SIM-3J7L8M', 'Equipo', 'Q110.00'),
      pagada('21 de julio de 2026', 'NB-2026-0041', 'SIM-6Q1W4E', 'Pro', 'Q45.00'),
    ],
  },
  // Venció el 15 de octubre: el cobro automático con la tarjeta 0341 se rechazó (CA-2, RN-2)
  vencida: {
    vence: '15 de octubre de 2026', tarjeta: { marca: 'VISA', ultimos: '0341' },
    pagos: [
      { fecha: '15 de octubre de 2026', factura: null, ref: 'SIM-5T8Y2U', plan: 'Equipo', monto: 'Q110.00' },
      pagada('15 de septiembre de 2026', 'NB-2026-0105', 'SIM-1A4S7D', 'Equipo', 'Q110.00'),
      pagada('16 de agosto de 2026', 'NB-2026-0071', 'SIM-8G3H6K', 'Equipo', 'Q110.00'),
    ],
  },
};

// ---------- Tarjetas de la pantalla ----------
function planActual(c, { vencida = false } = {}) {
  const badge = vencida
    ? `<span class="badge badge-warn">${icon('lock', 13)}Vencida</span>`
    : '<span class="badge">Plan actual</span>';
  return `
            <section class="card plan-card" aria-labelledby="plan-actual-titulo">
              <div class="plan-top">
                <div>
                  <div class="plan-name"><h2 id="plan-actual-titulo">Nimbo ${ACTUAL.nombre}</h2>${badge}</div>
                  <p class="price">${ACTUAL.precio}<span>al mes</span></p>
                  <p class="limits">${ACTUAL.almac} · ${ACTUAL.archivo} por archivo · ${ACTUAL.editores} editores simultáneos por documento</p>
                </div>
                <a class="btn btn-outline" href="${CAMBIAR}">Cambiar de plan</a>
              </div>
              <dl class="facts f2">
                <div><dt>${vencida ? 'Venció el' : 'Activo hasta'}</dt><dd>${c.vence}</dd></div>
                <div><dt>Importe</dt><dd>${ACTUAL.precio}</dd></div>
              </dl>
            </section>`;
}

// Interruptor (Switch de shadcn, role="switch"): el estado también va en texto («Activada»/«Desactivada»)
function interruptor({ on, disabled = false, ayuda, ocupado = false }) {
  const estado = ocupado ? `${icon('loader', 14, 'spin')}Guardando…` : on ? 'Activada' : 'Desactivada';
  return `
              <div class="switch-row">
                <div>
                  <p class="switch-label" id="ar-l">Renovación automática</p>
                  <p class="switch-help" id="ar-d">${ayuda}</p>
                </div>
                <button class="switch${ocupado ? ' switch-busy' : ''}" type="button" role="switch" aria-checked="${on}" aria-labelledby="ar-l" aria-describedby="ar-d"${disabled ? ' disabled' : ''}${ocupado ? ' aria-busy="true"' : ''}><span class="switch-track"><span class="switch-thumb"></span></span><span class="switch-state">${estado}</span></button>
              </div>`;
}

const datosCobro = (c, plan) => `
              <dl class="facts">
                <div><dt>Fecha</dt><dd>${c.vence}</dd></div>
                <div><dt>Monto</dt><dd>${plan.precio} · plan ${plan.nombre}</dd></div>
                <div><dt>Tarjeta</dt><dd>${tarjetaTexto(c.tarjeta)}</dd></div>
              </dl>`;

const pie = (nota, boton = '') => `
              <div class="next-foot">${boton}
                <p class="next-note">${nota}</p>
              </div>`;

const AYUDA_ON = (c) => `Cobraremos tu plan con la tarjeta de tu último pago aprobado. Si la desactivas, conservas tu plan hasta el ${c.vence}.`;
const RENOVAR_AHORA = `<a class="btn btn-outline" href="${PAGO}">Renovar ahora</a>`;

// modo: 'auto' | 'off' | 'cambio-pago' | 'cambio-personal' | 'vencida'
function proximoCobro(c, modo, { error = false, ocupado = false } = {}) {
  const cuerpos = {
    auto: () => datosCobro(c, ACTUAL) + interruptor({ on: true, ayuda: AYUDA_ON(c), ocupado }) +
      pie('Pagas el siguiente periodo por adelantado: empieza cuando termine el actual y no pierdes días.', RENOVAR_AHORA),
    off: () => `
              <p class="next-text">No habrá cobro automático. Tu plan vence el ${c.vence}.</p>` +
      interruptor({ on: false, ayuda: `Actívala para renovar con ${tarjetaTexto(c.tarjeta)}, la tarjeta de tu último pago.` }),
    'cambio-pago': () => datosCobro(c, PLANES.pro) + `
              <p class="next-note">Es el precio completo del plan Pro: no hay cobro proporcional.</p>` +
      interruptor({ on: true, ayuda: AYUDA_ON(c) }) +
      pie('Con un cambio de plan programado no puedes renovar por adelantado. Si quieres renovar ahora, primero cancela el cambio.'),
    'cambio-personal': () => `
              <p class="next-text">Sin cobro: el ${c.vence} pasas a Personal, que es gratis.</p>
              <p class="next-note">La renovación automática no aplica mientras esté programado el cambio a Personal. Con un cambio de plan programado no puedes renovar por adelantado.</p>`,
    vencida: () => `
              <p class="next-text">Sin cobro programado. Tu suscripción venció el ${c.vence} y el cobro automático con ${tarjetaTexto(c.tarjeta)} fue rechazado.</p>` +
      interruptor({ on: false, disabled: true, ayuda: 'Podrás activarla cuando renueves tu plan.' }) +
      pie('Al renovar, el periodo nuevo de 30 días empieza el día del pago y tu cuenta deja de estar en solo lectura.'),
  };
  const fallo = error ? alerta({
    tono: 'error', titulo: 'No pudimos desactivar la renovación automática.',
    texto: 'Tu renovación sigue activada y tu plan no cambió. Inténtalo de nuevo en unos segundos.',
    acciones: [{ texto: 'Reintentar', boton: true, icono: 'retry' }],
  }) : '';
  return `
            <section class="card next" aria-labelledby="cobro-t">
              <div class="next-head"><h2 id="cobro-t">Próximo cobro</h2></div>${fallo}${cuerpos[modo]()}
            </section>`;
}

const consumo = () => `
            <section class="card acc" aria-labelledby="consumo-titulo">
              <h2 id="consumo-titulo">Consumo del plan</h2>
              <div class="usage-row"><span>Almacenamiento</span><span class="num muted2">${B.CUOTA.usado} de ${B.CUOTA.total} (${B.CUOTA.pct} %)</span></div>
              <div class="bar" role="progressbar" aria-label="Almacenamiento" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${B.CUOTA.pct}" aria-valuetext="${B.CUOTA.usado} de ${B.CUOTA.total} (${B.CUOTA.pct} %)"><span style="width: ${B.CUOTA.pct}%"></span></div>
              <dl class="facts plain">
                <div><dt>Tamaño máximo por archivo</dt><dd>${ACTUAL.archivo}</dd></div>
                <div><dt>Retención en papelera</dt><dd>${ACTUAL.papelera}</dd></div>
                <div><dt>Edición colaborativa de .docx</dt><dd>Activa</dd></div>
              </dl>
            </section>`;

const cuentas = (c) => `
            <div class="two">
              <section class="card acc" aria-labelledby="metodo-pago-titulo">
                <h2 id="metodo-pago-titulo">Método de pago</h2>
                <p class="pm">${tarjetaTexto(c.tarjeta).replace('····', '···· ···· ····')}</p>
              </section>
              <section class="card acc" aria-labelledby="datos-facturacion-titulo">
                <h2 id="datos-facturacion-titulo">Datos de facturación</h2>
                <div><p>NIT 4527913-6</p><p class="muted2">${CORREO}</p></div>
              </section>
            </div>`;

function facturas(c) {
  const fila = (p) => `
                <li>
                  <div>
                    <p class="d">${p.fecha}</p>
                    <p class="s">${p.factura ? `${p.factura} · Pagada` : 'Pago rechazado'}</p>
                    <p class="r">${p.plan} · ${p.ref}</p>
                  </div>
                  <div class="amt"><span>${p.monto}</span>${p.factura ? `<button class="icon-btn" type="button" aria-label="Descargar factura ${p.factura}">${icon('download', 16)}</button>` : ''}</div>
                </li>`;
  return `
          <section class="card acc" aria-labelledby="facturas-titulo">
            <h2 id="facturas-titulo">Pagos y facturas</h2>
            <ul class="inv">${c.pagos.map(fila).join('')}
            </ul>
            <p class="inv-foot">Las facturas se envían a ${CORREO}.</p>
          </section>`;
}

function pantalla(v) {
  const c = CICLOS[v.ciclo];
  return `
        <h1 class="sr-only">Plan y facturación</h1>
        <div class="bill">${v.aviso || ''}
          <div class="bill-grid">
            <div class="stack">${planActual(c, { vencida: v.modo === 'vencida' })}${proximoCobro(c, v.modo, v)}${consumo()}${cuentas(c)}
            </div>${facturas(c)}
          </div>
        </div>`;
}

// ---------- Estados ----------
const V = CICLOS.vigente.vence;
const ESTADOS = [
  {
    estado: 'vigente', ciclo: 'vigente', modo: 'auto',
    rotulo: 'vigente con renovación automática: «Próximo cobro», interruptor activado, «Renovar ahora» y «Cambiar de plan» (CA-25)',
  },
  {
    estado: 'por-vencer', ciclo: 'porVencer', modo: 'auto',
    rotulo: 'vence en 2 días con renovación automática: aviso informativo con la tarjeta que se cobrará (§6, CA-5)',
    aviso: alerta({ tono: 'info', icono: 'calendarClock', titulo: `Tu plan ${ACTUAL.nombre} vence el ${CICLOS.porVencer.vence}. Se renovará con ${tarjetaEnFrase()}.` }),
  },
  {
    estado: 'renovacion-desactivada', ciclo: 'vigente', modo: 'off',
    rotulo: 'renovación automática desactivada: no habrá cobro; aviso con «Renovar ahora» (§6, CA-6, CA-7)',
    aviso: alerta({
      tono: 'warn', titulo: `Tu plan vence el ${V} y no se renovará. Renueva ahora para no quedar en solo lectura.`,
      acciones: [{ texto: 'Renovar ahora', href: PAGO, clase: 'btn-primary' }],
    }),
  },
  {
    estado: 'cambio-programado', ciclo: 'vigente', modo: 'cambio-pago',
    rotulo: 'cambio programado a Pro: aviso con «Cancelar cambio»; el próximo cobro es el precio de Pro y no hay «Renovar ahora» (CA-16, CA-19, CA-28)',
    aviso: alerta({
      tono: 'info', icono: 'calendarClock', titulo: `Tu plan cambiará a Pro el ${V}.`,
      texto: `Hasta entonces conservas ${ACTUAL.nombre} y sus límites.`,
      acciones: [{ texto: 'Cancelar cambio', boton: true }],
    }),
  },
  {
    estado: 'cambio-a-personal', ciclo: 'vigente', modo: 'cambio-personal',
    rotulo: 'cambio programado a Personal: sin cobro, sin «Renovar ahora», aviso de cuota con «Cancelar cambio» (CA-21, CA-28)',
    aviso: alerta({
      tono: 'info', icono: 'calendarClock', titulo: `Tu plan cambiará a Personal el ${V}.`,
      texto: `Ese día no se cobra nada. Usas ${B.CUOTA.usado} y Personal incluye ${PLANES.personal.almac}: no perderás archivos, pero no podrás subir hasta liberar espacio.`,
      acciones: [{ texto: 'Cancelar cambio', boton: true }],
    }),
  },
  {
    estado: 'vencida', ciclo: 'vencida', modo: 'vencida',
    rotulo: 'vencida, en solo lectura: aviso de solo lectura del layout con «Renovar plan»; interruptor deshabilitado (§6, CA-2, CA-14)',
    aviso: M.avisoSoloLectura({ ...AVISO_VENCIDA, href: PAGO }),
  },
  {
    estado: 'confirmar-desactivar', ciclo: 'vigente', modo: 'auto',
    rotulo: 'apagar el interruptor pide confirmación con la consecuencia (plan 010, auto-renew-switch)',
    dialogo: B.dialogo({
      titulo: '¿Desactivar la renovación automática?',
      descripcion: `Tu plan ${ACTUAL.nombre} sigue activo hasta el ${V}. Si no renuevas antes, tu cuenta quedará en solo lectura: podrás ver y descargar tus archivos, pero no subir ni editar.`,
      confirmar: 'Desactivar renovación',
    }),
  },
  {
    estado: 'error-renovacion', ciclo: 'vigente', modo: 'auto', error: true,
    rotulo: 'falló el cambio del interruptor: Alert de error con «Reintentar»; nada cambió',
  },
];

for (const v of ESTADOS) {
  const archivo = `suscripcion--${v.estado}.html`;
  B.escribir(repo, 'suscripcion', archivo, B.pagina({
    generador: 'generar-suscripcion.js', pantalla: 'Plan y facturación', estado: v.estado, archivo, rotulo: v.rotulo,
    crumbs: ['Cuenta', 'Plan y facturación'], cuerpo: pantalla(v), dialogo: v.dialogo,
  }));
}
