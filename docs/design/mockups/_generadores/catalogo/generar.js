// Genera los mockups autocontenidos de backoffice/catalogo (spec 011: catálogo de planes), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común, distintivos,
// estados de pantalla, diálogo, formulario y página) viene de admin/area.js, el mismo de backoffice/admin y
// backoffice/alta-interna. Aquí solo van las tarjetas de planes, el formulario de nuevo plan y sus estados.
const A = require('../admin/area.js');
const C = require('../admin/corpus.js');

const OUT = A.carpetaDeSalida('backoffice', 'catalogo');

const { icon, campo, resumenErrores, badgeInactivo } = A;
const { miles, PERSONAL, PRO, EQUIPO, INSTITUCIONAL, PLAN_NUEVO } = C;

// ---------- CSS ----------
const CSS = A.CSS + A.CSS_FORM + `
  /* Propio de backoffice/catalogo (spec 011: catálogo de planes) */

  /* Regla del catálogo (el aviso .privacy de area.js, con título) y aviso de auditoría */
  .privacy strong { display: block; font-weight: 600; }
  .content > .audit-note { margin-top: 10px; }

  /* Secciones: planes activos e inactivos */
  .plans-sec { margin-top: 28px; }
  .sec-head { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; }
  .sec-head h2 { margin: 0; font-size: 17px; line-height: 1.4; font-weight: 700; }
  .sec-head p { margin: 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .plans { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 16px; margin: 14px 0 0; padding: 0; }
  .none { display: flex; align-items: flex-start; gap: 10px; margin: 14px 0 0; padding: 16px; border: 1px dashed var(--input); border-radius: var(--radius-lg); background: var(--card); font-size: 13.5px; color: var(--secondary-foreground); }
  .none .ico { margin-top: 2px; }
  .none p { margin: 0; }

  /* PlanCard (vista de administración): nombre, estado, descripción, precio, todos los límites, cuentas y acción */
  .plan { display: flex; flex-direction: column; height: 100%; padding: 18px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .plan-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .plan h3 { margin: 0; font-size: 17px; line-height: 1.35; font-weight: 700; overflow-wrap: anywhere; }
  .plan-desc { margin: 6px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  @media (min-width: 601px) { .plan-desc { min-height: 4.5em; } } /* tres líneas: los precios quedan alineados entre tarjetas */
  .plan-price { display: flex; align-items: baseline; gap: 6px; margin: 14px 0 0; }
  .amount { font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .per { font-size: 13px; color: var(--secondary-foreground); }
  .limits { margin: 12px 0 0; }
  .limits div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 7px 0; border-top: 1px solid var(--border); font-size: 13px; }
  .limits dt { color: var(--secondary-foreground); }
  .limits dd { margin: 0; font-weight: 600; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .limits .sub-dd { display: block; font-size: 12px; font-weight: 500; color: var(--secondary-foreground); }
  .plan-meta { list-style: none; display: grid; gap: 4px; margin: 4px 0 0; padding: 10px 0 0; border-top: 1px solid var(--border); }
  .plan-meta li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  .plan-foot { margin-top: auto; padding-top: 14px; }
  .plan-foot .btn { width: 100%; }
  .fixed { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--muted); font-size: 12.5px; color: var(--secondary-foreground); }
  .fixed .ico { margin-top: 1px; color: var(--primary); }
  .fixed strong { display: block; color: var(--foreground); font-weight: 600; }
  /* Inactivo: sin sombra, sobre el fondo de la página, distintivo con ícono y texto (.badge-idle, en area.js); nunca solo color */
  .plan.is-off { background: var(--background); box-shadow: none; }

  /* Esqueleto de tarjetas */
  .plan.sk { gap: 10px; }
  .sk-amount { height: 22px; width: 45%; margin: 8px 0 6px; }

  /* Éxito / desactivado (Alert de éxito) con acción */
  .alert .btn { margin-top: 10px; }

  /* Nuevo plan (formulario) */
  .page-head.form-head { margin-top: 8px; }
  .form-card { max-width: 760px; margin-top: 20px; }
  .copy-from { margin: 0 0 18px; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--muted); }
  .copy-from label { display: block; margin: 0 0 4px; font-size: 13.5px; font-weight: 600; }
  .copy-from p { margin: 0 0 8px; font-size: 13px; color: var(--secondary-foreground); }
  .select { min-height: 40px; max-width: 100%; padding: 6px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .select:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .form-sec { margin: 22px 0 0; padding: 18px 0 0; border: 0; border-top: 1px solid var(--border); min-width: 0; }
  .form-sec > legend { float: left; width: 100%; margin: 0 0 12px; padding: 0; font-size: 15px; font-weight: 700; color: var(--foreground); }
  .form-sec > legend + * { clear: both; }
  /* La leyenda flota para quedar dentro del fieldset; su margen inferior separa el primer campo (el margen de este se pierde con clear) */
  .form-sec .sec-help { clear: both; margin: 0; font-size: 13px; color: var(--secondary-foreground); }
  .text-area { max-width: none; min-height: 64px; resize: vertical; line-height: 1.5; field-sizing: content; } /* crece con el texto: no se corta a 360 px */
  .limits-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }
  .limits-grid .field { margin-top: 16px; }
  .limits-grid .text-input { max-width: 260px; }
  /* Control con prefijo o unidad (InputGroup): el borde y el foco son los del campo */
  .input-group { display: flex; align-items: stretch; width: 100%; max-width: 260px; }
  .input-group .text-input { flex: 1; min-width: 0; border-radius: 0; }
  .input-group > :first-child { border-top-left-radius: var(--radius-md); border-bottom-left-radius: var(--radius-md); }
  .input-group > :last-child { border-top-right-radius: var(--radius-md); border-bottom-right-radius: var(--radius-md); }
  .addon { display: inline-flex; align-items: center; padding: 0 12px; border: 1px solid var(--input); background: var(--muted); color: var(--secondary-foreground); font-size: 14px; font-weight: 600; white-space: nowrap; }
  .addon-before { border-right: 0; }
  .addon-after { border-left: 0; }
  .unit { min-height: 40px; padding: 0 10px; border: 1px solid var(--input); border-left: 0; background: var(--muted); color: var(--foreground); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .unit:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; position: relative; }
  .form-card .info-box { margin-top: 22px; }
  .form-card .info-box .ico { color: var(--primary); }

  @media (max-width: 600px) {
    .plans-sec { margin-top: 24px; }
    .plans { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .plan { padding: 16px; }
    .plan-foot .btn, .alert .btn { width: 100%; min-height: 44px; }
    .page-head .btn { width: 100%; min-height: 44px; }
    .page-head.form-head { margin-top: 4px; }
    .form-card { margin-top: 16px; }
    .select, .unit { min-height: 44px; }
    .select { width: 100%; }
    .limits-grid { grid-template-columns: minmax(0, 1fr); }
    .input-group { max-width: none; }
    .limits-grid .text-input { max-width: none; }
    .input-group .text-input { min-height: 44px; }
  }
`;

// ---------- Piezas: catálogo ----------
const encabezado = (aviso = '') => `
        <div class="page-head">
          <div>
            <h1>Catálogo de planes</h1>
            <p>Los planes que se ofrecen a los clientes, con su precio y sus límites.</p>
          </div>
          <a class="btn btn-primary" href="catalogo--creando.html">${icon('plus', 16)}<span>Nuevo plan</span></a>
        </div>${aviso}${A.privacidad('<strong>Los planes no se editan: crea uno nuevo y desactiva el anterior.</strong>Así, quien ya tiene un plan conserva su precio y sus límites.', 'info')}
        <p class="audit-note">${icon('history', 15)}<span>Crear o desactivar un plan queda registrado en la auditoría.</span></p>`;

const badgeActivo = `<span class="badge badge-ok">${icon('ok', 13)}Activo</span>`;

// ---------- Tarjeta de un plan (PlanCard) ----------
function limitesPlan(p) {
  const editores = p.editores ? `${p.editores}` : `Ninguno<span class="sub-dd">Edición solo lectura</span>`;
  return `
                <dl class="limits">
                  <div><dt>Almacenamiento</dt><dd>${p.espacio}</dd></div>
                  <div><dt>Máximo por archivo</dt><dd>${p.archivo}</dd></div>
                  <div><dt>Editores simultáneos</dt><dd>${editores}</dd></div>
                  <div><dt>Consultas al agente</dt><dd>${miles(p.consultas)} al mes</dd></div>
                  <div><dt>Versiones retenidas</dt><dd>${p.versiones}</dd></div>
                  <div><dt>Días en papelera</dt><dd>${p.papelera} días</dd></div>
                </dl>`;
}

// Cuentas (conteo agregado, nunca nombres) y fecha de creación o de desactivación.
function metaPlan(p, off) {
  const items = off
    ? `<li>${icon('users', 14)}<span>${miles(p.cuentas)} cuentas lo conservan</span></li>
                  <li>${icon('pauseCircle', 14)}<span>Desactivado el ${off}</span></li>`
    : `<li>${icon('users', 14)}<span>${miles(p.cuentas)} cuentas con este plan</span></li>
                  <li>${icon('clock', 14)}<span>Creado el ${p.creado}</span></li>`;
  return `
                <ul class="plan-meta">
                  ${items}
                </ul>`;
}

// Inactivo: sin pie. Personal: no se desactiva (RN-4). Los demás: «Desactivar».
function piePlan(p, off) {
  if (off) return '';
  const contenido = p.porDefecto
    ? `<p class="fixed">${icon('lock', 15)}<span><strong>Plan por defecto</strong>Es el plan gratuito: no se puede desactivar.</span></p>`
    : `<button class="btn btn-destructive-outline btn-sm" type="button">${icon('power', 15)}<span>Desactivar<span class="sr-only"> el plan ${p.nombre}</span></span></button>`;
  return `
                <div class="plan-foot">${contenido}</div>`;
}

// p: plan; off: fecha de desactivación si está inactivo.
function tarjeta(p, { off = '' } = {}) {
  const t = `plan-${p.id}-t`;
  return `
            <li>
              <article class="plan${off ? ' is-off' : ''}" aria-labelledby="${t}">
                <div class="plan-top"><h3 id="${t}">${p.nombre}</h3>${off ? badgeInactivo : badgeActivo}</div>
                <p class="plan-desc">${p.descripcion}</p>
                <p class="plan-price"><span class="amount">${p.precio}</span><span class="per">al mes</span></p>${limitesPlan(p)}${metaPlan(p, off)}${piePlan(p, off)}
              </article>
            </li>`;
}

// inactivos: planes desactivados el día desactivadoEl (todos a la vez en el ejemplo).
function catalogo({ activos, inactivos = [], desactivadoEl = '' }) {
  const listaInactivos = inactivos.length
    ? `
          <ul class="plans">${inactivos.map((p) => tarjeta(p, { off: desactivadoEl })).join('')}
          </ul>`
    : `
          <div class="none">${icon('info', 16)}<p>Ningún plan está inactivo. Cuando desactives uno, aparecerá aquí con las cuentas que lo conservan.</p></div>`;
  return `
        <section class="plans-sec" aria-labelledby="activos-t">
          <div class="sec-head"><h2 id="activos-t">Planes activos (${activos.length})</h2><p>Se ofrecen a quien se registra o cambia de plan.</p></div>
          <ul class="plans">${activos.map((p) => tarjeta(p)).join('')}
          </ul>
        </section>
        <section class="plans-sec" aria-labelledby="inactivos-t">
          <div class="sec-head"><h2 id="inactivos-t">Planes inactivos (${inactivos.length})</h2><p>Ya no se ofrecen; quien los tiene los conserva.</p></div>${listaInactivos}
        </section>`;
}

function cargando() {
  const sk = `
            <li><div class="plan sk"><span class="skeleton-line w50"></span><span class="skeleton-line w80"></span><span class="skeleton-line sk-amount"></span>${'<span class="skeleton-line w70"></span>'.repeat(6)}<span class="skeleton-line w60"></span></div></li>`;
  return `
        <div aria-busy="true">
          <ul class="plans plans-sec" aria-hidden="true">${sk.repeat(4)}
          </ul>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando el catálogo…</p>
        </div>`;
}

const error = () => A.estadoError('No pudimos cargar el catálogo.',
  'Ningún plan cambió. Revisa tu conexión e inténtalo de nuevo.');

const ACTIVOS_CON_NUEVO = [PERSONAL, PRO, EQUIPO, PLAN_NUEVO, INSTITUCIONAL];

const exitoCreado = `
        <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Creamos el plan ${PLAN_NUEVO.nombre}. Ya se ofrece a contrataciones nuevas.</p><p class="alert-text">Lo creaste a partir de ${EQUIPO.nombre}. Si lo reemplaza, desactiva ${EQUIPO.nombre} para que deje de ofrecerse; quien lo tiene lo conserva.</p>
          <button class="btn btn-destructive-outline btn-sm" type="button">${icon('power', 15)}Desactivar ${EQUIPO.nombre}</button></div></div>`;

const exitoDesactivado = `
        <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Desactivamos el plan ${EQUIPO.nombre}. Ya no se ofrece a contrataciones nuevas.</p><p class="alert-text">Las ${miles(EQUIPO.cuentas)} cuentas que lo tienen lo conservan con el mismo precio y los mismos límites.</p></div></div>`;

const DLG_DESACTIVAR = A.dialogo({
  titulo: `¿Desactivar el plan ${EQUIPO.nombre}?`,
  quienLinea: `${EQUIPO.precio} al mes · ${EQUIPO.espacio} · ${miles(EQUIPO.cuentas)} cuentas lo tienen.`,
  items: [
    ['pauseCircle', 'Deja de ofrecerse: no aparecerá al registrarse ni al cambiar de plan.'],
    ['users', `Las ${miles(EQUIPO.cuentas)} cuentas que lo tienen lo conservan con el mismo precio y los mismos límites.`],
    ['lock', 'No se puede volver a activar. Si lo necesitas otra vez, crea un plan nuevo con sus valores.'],
    ['history', 'La acción queda registrada en la auditoría.'],
  ],
  confirmar: 'Desactivar plan', clase: 'btn-destructive', ic: 'power',
});

// ---------- Piezas: nuevo plan ----------
const volver = `
        <a class="back" href="catalogo.html">${icon('arrowLeft', 16)}Volver al catálogo</a>`;

const encabezadoForm = `
        <div class="page-head form-head">
          <div>
            <h1>Nuevo plan</h1>
            <p>Se ofrecerá a contrataciones nuevas en cuanto lo crees.</p>
          </div>
        </div>`;

const addonAntes = (t) => `<span class="addon addon-before" aria-hidden="true">${t}</span>`;
const addonDespues = (t) => `<span class="addon addon-after" aria-hidden="true">${t}</span>`;
// Selector de unidad junto al campo (InputGroup).
const unidad = ({ id, nombre, opciones, elegida }) =>
  `<select class="unit" id="${id}-unidad" name="${id}-unidad" aria-label="Unidad de ${nombre}">${opciones.map((o) => `<option${o === elegida ? ' selected' : ''}>${o}</option>`).join('')}</select>`;

const OPCIONES_COPIA = [['', 'No, empezar vacío'], ...C.PLANES.map((p) => [p.id, `${p.nombre} (${p.precio} al mes)`])];
const NUMERICO = 'inputmode="numeric" autocomplete="off"';

// Los seis límites del plan, en el orden de la tarjeta. unidad o sufijo: adorno del control.
const LIMITES = [
  { id: 'espacio', label: 'Almacenamiento', help: 'Espacio total de la cuenta.',
    unidad: { nombre: 'almacenamiento', opciones: ['GB', 'TB'], defecto: 'GB' } },
  { id: 'archivo', label: 'Máximo por archivo', help: 'Hasta 2 GB y nunca más que el almacenamiento.',
    unidad: { nombre: 'máximo por archivo', opciones: ['MB', 'GB'], defecto: 'MB' } },
  { id: 'editores', label: 'Editores simultáneos', help: 'Personas que editan un mismo .docx a la vez.' },
  { id: 'consultas', label: 'Consultas al agente', help: 'Preguntas al agente por mes.', sufijo: 'al mes' },
  { id: 'versiones', label: 'Versiones retenidas', help: 'Versiones que se guardan de cada archivo.' },
  { id: 'papelera', label: 'Días en papelera', help: 'Días antes de borrar para siempre lo eliminado.', sufijo: 'días' },
];

function adornoLimite(l, v) {
  if (l.unidad) return unidad({ id: l.id, ...l.unidad, elegida: v[`${l.id}U`] || l.unidad.defecto });
  return l.sufijo ? addonDespues(l.sufijo) : '';
}

const campoLimite = (l, v, e) => campo({
  id: l.id, label: l.label, help: l.help, value: v[l.id] || '', err: e[l.id], extra: NUMERICO, despues: adornoLimite(l, v),
});

const copiarDe = (copia = '') => `
          <div class="copy-from">
            <label for="copiar">Partir de un plan activo (opcional)</label>
            <p id="copiar-ayuda">Llena el formulario con sus valores y cambia solo lo que necesites. El plan de origen no cambia.</p>
            <select class="select" id="copiar" name="copiar" aria-describedby="copiar-ayuda">${OPCIONES_COPIA.map(([val, t]) => `<option value="${val}"${val === copia ? ' selected' : ''}>${t}</option>`).join('')}</select>
          </div>`;

const seccionPlan = (v, e) => `
          <fieldset class="form-sec">
            <legend>Plan</legend>${campo({
  id: 'nombre', label: 'Nombre', help: 'Lo ven los clientes al elegir plan. Usa uno distinto de los planes activos.',
  value: v.nombre || '', err: e.nombre, extra: 'autocomplete="off" maxlength="40"',
})}${campo({
  id: 'descripcion', label: 'Descripción', help: 'Una frase sobre para quién es el plan.', value: v.descripcion || '', err: e.descripcion,
  multilinea: true, extra: 'maxlength="160"',
})}
          </fieldset>`;

const seccionPrecio = (v, e) => `
          <fieldset class="form-sec">
            <legend>Precio</legend>${campo({
  id: 'precio', label: 'Precio al mes, en quetzales', help: 'Con centavos. Escribe 0.00 si el plan es gratuito.',
  value: v.precio || '', err: e.precio, extra: 'inputmode="decimal" autocomplete="off"', antes: addonAntes('Q'),
})}
          </fieldset>`;

const seccionLimites = (v, e) => `
          <fieldset class="form-sec">
            <legend>Límites</legend>
            <p class="sec-help">Cada cuenta con este plan recibe estos límites.</p>
            <div class="limits-grid">${LIMITES.map((l) => campoLimite(l, v, e)).join('')}
            </div>
          </fieldset>`;

// f: valores, errores y resumen del formulario. Los valores van como los escribe la persona.
function formulario(f = {}) {
  const v = f.valores || {};
  const e = f.errores || {};
  return `
        <form class="card form-card" aria-labelledby="form-t" novalidate onsubmit="return false">
          <h2 id="form-t" class="sr-only">Datos del nuevo plan</h2>${f.resumen ? resumenErrores(f.resumen) : ''}${copiarDe(v.copia)}
          <p class="req-note">Los demás campos son obligatorios.</p>${seccionPlan(v, e)}${seccionPrecio(v, e)}${seccionLimites(v, e)}
          <div class="info-box">${icon('lock', 16)}<p><strong>Después de crearlo, el precio y los límites no cambian.</strong>Revísalos bien: para cambiarlos más adelante tendrás que crear otro plan.</p></div>
          <p class="audit-note">${icon('history', 15)}<span>La creación queda registrada en la auditoría.</span></p>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${icon('plus', 16)}Crear plan</button>
            <a class="btn btn-outline" href="catalogo.html">Cancelar</a>
          </div>
        </form>`;
}

// Valores del nuevo plan tal como se escriben (sin separador de miles en los campos).
const VALORES_NUEVO = { copia: 'equipo', nombre: PLAN_NUEVO.nombre, descripcion: PLAN_NUEVO.descripcion, precio: '125.00', espacio: '500', espacioU: 'GB',
  archivo: '1', archivoU: 'GB', editores: '5', consultas: '3000', versiones: '60', papelera: '60' };

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'default', titulo: 'los cuatro planes oficiales activos; ninguno inactivo',
    cuerpo: () => encabezado() + catalogo({ activos: C.PLANES }) },
  { estado: 'cargando', titulo: 'esqueleto de las tarjetas mientras llega el catálogo',
    cuerpo: () => encabezado() + cargando() },
  { estado: 'error', titulo: 'falló la carga del catálogo: error con «Reintentar»',
    cuerpo: () => encabezado() + error() },
  { estado: 'creando', titulo: 'formulario de nuevo plan a partir de Equipo, listo para crear', form: true,
    cuerpo: () => volver + encabezadoForm + formulario({ valores: VALORES_NUEVO }) },
  { estado: 'error-campos', titulo: 'validación: precio negativo, máximo por archivo mayor que 2 GB y 0 versiones; no se creó nada', form: true,
    cuerpo: () => volver + encabezadoForm + formulario({
      valores: { ...VALORES_NUEVO, precio: '-125.00', archivo: '3', versiones: '0' },
      errores: {
        precio: 'El precio no puede ser negativo. Escribe 0.00 si el plan es gratuito.',
        archivo: 'El máximo por archivo no puede superar 2 GB. Escribe 2 GB o menos.',
        versiones: 'Escribe al menos 1 versión retenida.',
      },
      resumen: {
        titulo: 'Revisa 3 campos para crear el plan.',
        texto: 'Todavía no creamos nada.',
        items: [['precio', 'Corrige el precio'], ['archivo', 'Baja el máximo por archivo'], ['versiones', 'Escribe al menos 1 versión']],
      },
    }) },
  { estado: 'exito', titulo: 'plan creado: aviso con «Desactivar Equipo» y el plan nuevo entre los activos',
    cuerpo: () => encabezado(exitoCreado) + catalogo({ activos: ACTIVOS_CON_NUEVO }) },
  { estado: 'confirmar-desactivar', titulo: 'confirmación de desactivar Equipo, con las consecuencias',
    cuerpo: () => encabezado() + catalogo({ activos: ACTIVOS_CON_NUEVO }), dialogo: DLG_DESACTIVAR },
  { estado: 'desactivado', titulo: 'Equipo desactivado: aviso y Equipo entre los inactivos, con las cuentas que lo conservan',
    cuerpo: () => encabezado(exitoDesactivado) + catalogo({
      activos: C.PLANES_TRAS_DESACTIVAR.activos,
      inactivos: C.PLANES_TRAS_DESACTIVAR.inactivos,
      desactivadoEl: C.PLANES_TRAS_DESACTIVAR.fecha,
    }) },
];

for (const v of ESTADOS) {
  const file = A.archivoDe('catalogo', v.estado);
  A.escribir(OUT, file, A.pagina({
    titulo: `${v.form ? 'Nuevo plan' : 'Catálogo de planes'} · Administración · Nimbo — ${v.estado}`,
    comentarios: A.comentariosDe('administración, catálogo de planes', v.estado, 'catalogo'),
    css: CSS,
    rotulo: v.form ? 'Nuevo plan' : 'Catálogo de planes',
    file,
    estado: v.titulo,
    crumbs: v.form ? ['Administración', 'Catálogo de planes', 'Nuevo plan'] : ['Administración', 'Catálogo de planes'],
    cuerpo: v.cuerpo(),
    dialogo: v.dialogo || '',
    actual: 'Catálogo de planes',
  }));
}
