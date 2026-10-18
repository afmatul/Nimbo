// Genera los estados de billing/planes para el cambio de plan de la spec 010 (/suscripcion/cambiar-plan): lista de los
// planes activos con el actual marcado (PlanCard de 008), tabla comparativa (PlanComparisonTable de 009) y la
// confirmación «Cambiar a <plan> el <fecha>» con el aviso de versiones y de espacio (CA-21; estilo de
// storage/ficha-archivo/ficha-archivo--aviso-de-poda), la bajada a Personal y el error.
// Uso: node generar-planes.js <ruta-del-worktree>
// planes--plan-actual.html (paquete de la propuesta, 008) NO se genera aquí.
const M = require('../marco/marco.js');
const B = require('./billing.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const { icon, PLANES, ACTUAL, TARJETA, CUOTA, tarjetaTexto } = B;
const VENCE = '4 de noviembre de 2026';
const ORDEN = ['personal', 'pro', 'equipo', 'institucional'];

// ---------- Lista ----------
function tarjetaPlan(clave) {
  const p = PLANES[clave];
  const actual = p === ACTUAL;
  const accion = actual
    ? `<p class="pc-current">${icon('check', 16)}Es tu plan actual</p>`
    : `<button class="btn btn-outline" type="button">Cambiar a ${p.nombre}</button>`;
  return `
            <section class="card pc${actual ? ' is-current' : ''}" aria-labelledby="pc-${clave}">
              <div class="pc-head"><h2 id="pc-${clave}">${p.nombre}</h2>${actual ? '<span class="badge">Plan actual</span>' : ''}</div>
              <p class="pc-desc">${p.desc}</p>
              <p class="pc-price">${p.precio}<span>al mes</span></p>
              <dl>
                <div><dt>Almacenamiento</dt><dd>${p.almac}</dd></div>
                <div><dt>Archivo máx.</dt><dd>${p.archivo}</dd></div>
                <div><dt>Edición .docx</dt><dd>${p.docx}</dd></div>
              </dl>
              <div class="pc-action">${accion}</div>
            </section>`;
}

const FILAS = [
  ['Precio mensual', 'precio'], ['Almacenamiento', 'almac'], ['Tamaño máximo por archivo', 'archivo'],
  ['Edición .docx', 'docx'], ['Editores simultáneos', 'editores'], ['Consultas al agente', 'agente'],
  ['Versiones retenidas', 'versiones'], ['Retención en papelera', 'papelera'],
];
const tabla = () => `
          <div class="card cmp" role="region" aria-label="Comparación de planes" tabindex="0">
            <table>
              <caption class="sr-only">Comparación de planes</caption>
              <thead><tr><th scope="col">Característica</th>${ORDEN.map((k) => `<th scope="col">${PLANES[k].nombre}</th>`).join('')}</tr></thead>
              <tbody>${FILAS.map(([t, campo]) => `
                <tr><th scope="row">${t}</th>${ORDEN.map((k) => `<td>${PLANES[k][campo]}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>`;

function lista({ soloLectura = false } = {}) {
  const intro = soloLectura
    ? 'Tu suscripción venció. Si eliges Personal, el cambio se aplica de inmediato y sin cobro. Si eliges un plan de pago, se aplica cuando renueves.'
    : `El cambio se aplica el ${VENCE}, cuando termina tu periodo. Hasta entonces conservas ${ACTUAL.nombre} y sus límites. No hay cobro proporcional.`;
  const banner = soloLectura ? M.avisoSoloLectura({
    titulo: 'Tu suscripción venció.',
    cuerpo: 'Puedes ver y descargar tus archivos, pero no subir ni editar. Renueva tu plan.',
    href: '../pago/pago--renovacion.html',
  }) : '';
  return `${banner}
        <a class="back" href="../suscripcion/suscripcion--${soloLectura ? 'vencida' : 'vigente'}.html">${icon('arrowLeft', 16)}Volver a Plan y facturación</a>
        <div class="sub-head">
          <h1>Cambiar de plan</h1>
          <p>${intro}</p>
        </div>
        <div class="plans">${ORDEN.map(tarjetaPlan).join('')}
        </div>${tabla()}`;
}

// ---------- Avisos de la confirmación (CA-21) ----------
const avisoVersiones = (p) =>
  `Versiones: ${p.nombre} guarda ${p.versiones} por archivo y ${ACTUAL.nombre} guarda ${ACTUAL.versiones}. Cuando subas la siguiente versión de un archivo, se eliminarán sus versiones anteriores que pasen de ${p.versiones}. La versión actual nunca se borra.`;
const avisoEspacio = (p) =>
  `Espacio: ${p.nombre} incluye ${p.almac} y usas ${CUOTA.usado}. No perderás archivos ni carpetas, pero no podrás subir hasta liberar espacio.`;
const avisoDocx = 'Edición: en Personal los .docx se abren solo en lectura.';

const P = PLANES.pro;
const PER = PLANES.personal;

const ESTADOS = [
  {
    estado: 'cambiar-plan', rotulo: 'planes activos con el actual marcado; el cambio se aplica al vencer (CA-16, CA-17)',
    cuerpo: lista(),
  },
  {
    estado: 'confirmar-cambio', rotulo: `confirmar el cambio a Pro el ${VENCE}: precio del próximo cobro y aviso de versiones (CA-16, CA-20, CA-21)`,
    cuerpo: lista(),
    dialogo: B.dialogo({
      titulo: `¿Cambiar a ${P.nombre} el ${VENCE}?`,
      descripcion: `Hasta esa fecha conservas ${ACTUAL.nombre} y sus límites. Hoy no se cobra nada.`,
      resumen: [
        ['Plan actual', `${ACTUAL.nombre} · hasta el ${VENCE}`],
        ['Plan nuevo', `${P.nombre} · desde el ${VENCE}`],
        ['Cobro al renovar', `${P.precio} con ${tarjetaTexto(TARJETA)}`],
      ],
      aviso: { titulo: `${P.nombre} guarda menos versiones que tu plan actual.`, items: [avisoVersiones(P)] },
      confirmar: `Programar cambio a ${P.nombre}`,
    }),
  },
  {
    estado: 'confirmar-personal', rotulo: `bajar a Personal el ${VENCE}: sin cobro, avisos de versiones, espacio y edición (CA-21, CA-28)`,
    cuerpo: lista(),
    dialogo: B.dialogo({
      titulo: `¿Cambiar a ${PER.nombre} el ${VENCE}?`,
      descripcion: `Hasta esa fecha conservas ${ACTUAL.nombre}. Ese día pasas a Personal, que es gratis y no vence. Mientras el cambio esté programado no podrás renovar por adelantado.`,
      resumen: [
        ['Plan actual', `${ACTUAL.nombre} · hasta el ${VENCE}`],
        ['Plan nuevo', `${PER.nombre} · desde el ${VENCE}`],
        ['Cobro', 'Ninguno'],
      ],
      aviso: { titulo: 'Personal incluye menos que tu plan actual.', items: [avisoVersiones(PER), avisoEspacio(PER), avisoDocx] },
      confirmar: `Programar cambio a ${PER.nombre}`,
    }),
  },
  {
    estado: 'confirmar-personal-solo-lectura', rotulo: 'cuenta en solo lectura: el cambio a Personal es inmediato y sin cobro, y termina la solo lectura (CA-27)',
    cuerpo: lista({ soloLectura: true }),
    dialogo: B.dialogo({
      titulo: `¿Cambiar a ${PER.nombre} ahora?`,
      descripcion: 'Tu suscripción venció. El cambio se aplica de inmediato, sin cobro, y tu cuenta deja de estar en solo lectura.',
      resumen: [['Plan nuevo', `${PER.nombre} · desde hoy`], ['Cobro', 'Ninguno']],
      aviso: { titulo: 'Personal incluye menos que tu plan actual.', items: [avisoVersiones(PER), avisoEspacio(PER), avisoDocx] },
      confirmar: `Cambiar a ${PER.nombre} ahora`,
    }),
  },
  {
    estado: 'cambio-error', rotulo: 'el plan elegido se desactivó mientras confirmabas: error con la acción correctiva (CA-17)',
    cuerpo: lista(),
    dialogo: B.dialogo({
      titulo: `¿Cambiar a ${P.nombre} el ${VENCE}?`,
      descripcion: `Hasta esa fecha conservas ${ACTUAL.nombre} y sus límites. Hoy no se cobra nada.`,
      error: { titulo: 'No pudimos programar el cambio.', texto: 'Ese plan ya no está disponible. Cierra este aviso y elige otro plan de la lista.' },
      cancelar: 'Cerrar',
    }),
  },
];

for (const v of ESTADOS) {
  const archivo = `planes--${v.estado}.html`;
  B.escribir(repo, 'planes', archivo, B.pagina({
    generador: 'generar-planes.js', pantalla: 'Cambiar de plan', estado: v.estado, archivo, rotulo: v.rotulo,
    crumbs: ['Cuenta', 'Plan y facturación', 'Cambiar de plan'], cuerpo: v.cuerpo, dialogo: v.dialogo, css: B.CSS_PLANES,
  }));
}
