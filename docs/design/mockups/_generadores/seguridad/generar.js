// Genera los mockups autocontenidos de identity/seguridad (spec 002), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
const fs = require('node:fs');
const path = require('node:path');

const M = require('../marco/marco.js');
const { icon } = M;

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/identity/seguridad');
fs.mkdirSync(OUT, { recursive: true });

// Íconos, barra lateral, barra superior, diálogo y <head>: marco/marco.js (compartidos con shared/layout).

// ---------- Datos de ejemplo (hora de Guatemala; hoy es sábado 26 sep 2026) ----------
const SESIONES = [
  { id: 'actual', device: 'monitor', name: 'Chrome · Windows', inicio: '24 sep 2026', actividad: 'Activa ahora', actual: true },
  { id: 'safari', device: 'phone', name: 'Safari · iOS', inicio: '21 sep 2026', actividad: 'Última actividad: hace 2 horas' },
  { id: 'firefox', device: 'laptop', name: 'Firefox · Ubuntu', inicio: '14 sep 2026', actividad: 'Última actividad: hace 3 días' },
  { id: 'edge', device: 'monitor', name: 'Edge · Windows', inicio: '2 sep 2026', actividad: 'Última actividad: hace 6 días' },
];
const CORRELATION_ID = '7f3c9a12-4b6e-4d21-9c0a-2e5f8b1d6a44';

// ---------- CSS: marco compartido + piezas propias de Seguridad ----------
const CSS = '\n' + M.CSS.MARCO + `  .grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; margin-top: 22px; align-items: start; }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 22px 24px 24px; }
  .card-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title action" "desc desc"; align-items: center; gap: 4px 16px; }
  .card-head h2 { grid-area: title; }
  .card-head .card-desc { grid-area: desc; }
  .card-head .btn { grid-area: action; }
  .card-head h2 { margin: 0; font-size: 17px; line-height: 1.35; font-weight: 700; display: flex; align-items: baseline; gap: 8px; }
  .card-head .count { font-size: 12.5px; font-weight: 500; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .card-desc { margin: 0; color: var(--secondary-foreground); font-size: 13.5px; max-width: 64ch; }
  .card-note { display: flex; gap: 8px; margin: 10px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .card-note .ico { margin-top: 2px; color: var(--primary); }

` + M.CSS.BOTONES + `
  /* Alertas (patrón de 000b: ícono + texto, nunca solo color) */
  .alert { display: flex; gap: 10px; margin: 16px 0 0; padding: 12px 14px; border-radius: var(--radius-md); font-size: 13.5px; line-height: 1.5; border: 1px solid; }
  .alert .ico { margin-top: 1px; }
  .alert p { margin: 0; }
  .alert strong { font-weight: 600; }
  .alert-success { background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 45%, var(--card)); color: var(--foreground); }
  .alert-success .ico, .alert-success strong { color: var(--success-foreground); }
  .alert-error { background: var(--destructive-tint); border-color: color-mix(in srgb, var(--destructive-soft) 55%, var(--card)); color: var(--foreground); }
  .alert-error .ico, .alert-error strong { color: var(--destructive); }
  .alert a { font-weight: 600; }

  /* Lista de sesiones */
  .sessions { list-style: none; margin: 16px 0 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .session { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; padding: 14px 16px; background: var(--card); }
  .session + .session { border-top: 1px solid var(--border); }
  .session.is-current { background: var(--background); }
  .device { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--brand-soft); color: var(--primary-hover); }
  .session-name { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-weight: 600; font-size: 14.5px; }
  .session-meta { margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted-foreground); }
  .session-meta span { display: block; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; line-height: 1.5; }
  .badge-current { background: var(--brand-soft); color: var(--primary-hover); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 35%, var(--card)); }

  /* Cargando y error de la lista */
  .skeleton { margin: 16px 0 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
  .skeleton-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) 110px; gap: 14px; align-items: center; padding: 16px; }
  .skeleton-row + .skeleton-row { border-top: 1px solid var(--border); }
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  .skeleton-line.box { height: 40px; border-radius: var(--radius-md); }
  .skeleton-line.btn-line { height: 36px; border-radius: var(--radius-md); }
  .skeleton-line.w60 { width: 60%; } .skeleton-line.w40 { width: 40%; margin-top: 8px; height: 10px; }
  @keyframes pulse { 50% { opacity: .55; } }
  .loading-text { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .state-error { margin: 16px 0 0; padding: 28px 20px; border: 1px dashed color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); border-radius: var(--radius-lg); background: var(--destructive-tint); text-align: center; }
  .state-error > .ico { color: var(--destructive); }
  .state-error h3 { margin: 10px 0 4px; font-size: 15px; color: var(--destructive); }
  .state-error p { margin: 0 auto 16px; max-width: 46ch; color: var(--foreground); font-size: 13.5px; }
  code { font-family: inherit; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .empty-note { display: flex; gap: 10px; align-items: flex-start; margin: 12px 0 0; padding: 12px 14px; border-radius: var(--radius-md); background: var(--muted); color: var(--secondary-foreground); font-size: 13.5px; }
  .empty-note .ico { color: var(--primary); margin-top: 1px; }

  /* Formulario de contraseña */
  form { margin: 0; }
  .field { margin-top: 16px; }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .control { position: relative; }
  .control input { width: 100%; min-height: 44px; padding: 10px 48px 10px 14px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 15px; letter-spacing: .08em; }
  .control input::placeholder { letter-spacing: 0; color: var(--muted-foreground); }
  .control input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .control input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .control input[readonly] { background: var(--muted); color: var(--secondary-foreground); }
  .reveal { position: absolute; top: 4px; right: 4px; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--secondary-foreground); cursor: pointer; }
  .reveal:hover { background: var(--muted); color: var(--foreground); }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 0; font-size: 13px; color: var(--destructive); }
  .field-error .ico { margin-top: 2px; }
  .field-help { margin: 4px 0 0; font-size: 13px; }
  .field-help a, .crumbs a { display: inline-flex; align-items: center; min-height: 24px; }
  .reqs { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; font-size: 13px; }
  .reqs li { display: flex; align-items: center; gap: 6px; color: var(--secondary-foreground); }
  .reqs .is-ok .ico { color: var(--success-foreground); }
  .reqs .is-fail { color: var(--destructive); }
  .reqs .is-pending .ico { color: var(--muted-foreground); }
  .form-foot { margin-top: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }

` + M.CSS.DIALOGO + `
  /* Tableta: la barra lateral se oculta (AppLayout: menú en cajón) y las tarjetas se apilan */
  @media (max-width: 1180px) { .grid { grid-template-columns: minmax(0, 1fr); max-width: 720px; } }
` + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + `    .grid { gap: 16px; margin-top: 16px; }
    .card { padding: 18px 14px 18px; }
    .card-head { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "desc" "action"; }
    .card-head .btn { width: 100%; margin-top: 10px; }
    .session { grid-template-columns: 40px minmax(0, 1fr); align-items: start; padding: 14px 12px; }
    .session .btn { grid-column: 2; justify-self: start; margin-top: 8px; }
    .skeleton-row { grid-template-columns: 40px minmax(0, 1fr); }
    .skeleton-row .btn-line { display: none; }
    .reqs { grid-template-columns: minmax(0, 1fr); }
    .form-foot .btn { width: 100%; }
` + M.CSS.MQ600_DIALOGO + '  }\n';

// ---------- Piezas ----------
const sidebar = () => M.sidebar();
const topbar = () => M.topbar();
const dialog = (d) => M.dialog(d);

function sessionRow(s) {
  const extra = s.actual ? ' en este dispositivo' : ` en ${s.name}`;
  const badge = s.actual ? `<span class="badge badge-current">${icon('check', 13)}Este dispositivo</span>` : '';
  return `
          <li class="session${s.actual ? ' is-current' : ''}">
            <span class="device">${icon(s.device, 20)}</span>
            <div>
              <p class="session-name"><span>${s.name}</span>${badge}</p>
              <p class="session-meta"><span>${s.actividad}</span><span>Iniciada el ${s.inicio}</span></p>
            </div>
            <button class="btn btn-outline btn-sm" type="button">Cerrar sesión<span class="sr-only">${extra}</span></button>
          </li>`;
}

function alertBox(a) {
  if (!a) return '';
  const role = a.type === 'success' ? 'role="status"' : 'role="alert"';
  const ic = a.type === 'success' ? 'ok' : 'alert';
  return `<div class="alert alert-${a.type}" ${role}>${icon(ic, 18)}<p>${a.title ? `<strong>${a.title}</strong> ` : ''}${a.body}</p></div>`;
}

function sessionsCard(v) {
  const list = v.sesiones;
  const others = Array.isArray(list) ? list.filter((s) => !s.actual).length : 0;
  const count = Array.isArray(list)
    ? `<span class="count">${list.length} ${list.length === 1 ? 'abierta' : 'abiertas'}</span>`
    : '';
  const closeOthers = Array.isArray(list) && others > 0
    ? `<button class="btn btn-outline" type="button">Cerrar las demás sesiones</button>`
    : '';
  let body;
  if (list === 'cargando') {
    const row = `<div class="skeleton-row"><span class="skeleton-line box"></span><div><span class="skeleton-line w60"></span><span class="skeleton-line w40"></span></div><span class="skeleton-line btn-line"></span></div>`;
    body = `
        <div class="skeleton" aria-hidden="true">${row}${row}${row}</div>
        <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando tus sesiones…</p>`;
  } else if (list === 'error') {
    body = `
        <div class="state-error" role="alert">
          ${icon('alert', 32)}
          <h3>No pudimos cargar tus sesiones.</h3>
          <p>Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: <code>${CORRELATION_ID}</code></p>
          <button class="btn btn-outline" type="button">${icon('retry', 16)}Reintentar</button>
        </div>`;
  } else {
    body = `
        ${alertBox(v.sesionesAlerta)}
        <ul class="sessions" aria-label="Sesiones abiertas">${list.map(sessionRow).join('')}
        </ul>
        ${others === 0 ? `<p class="empty-note">${icon('info', 18)}<span>No tienes otras sesiones abiertas. Si inicias sesión en otro navegador o dispositivo, aparecerá aquí.</span></p>` : ''}`;
  }
  return `
      <section class="card" aria-labelledby="t-sesiones"${list === 'cargando' ? ' aria-busy="true"' : ''}>
        <div class="card-head">
          <h2 id="t-sesiones">Sesiones activas ${count}</h2>
          <p class="card-desc">Estos son los navegadores y dispositivos con tu cuenta abierta. Si no reconoces alguno, cierra esa sesión y cambia tu contraseña.</p>
          ${closeOthers}
        </div>${body}
      </section>`;
}

const REQS = [
  ['len', '12 caracteres o más'],
  ['upper', 'Una mayúscula'],
  ['num', 'Un número'],
  ['sym', 'Un símbolo'],
];
function reqList(estado) {
  // estado: 'pending' | 'ok' | objeto { len: bool, ... }
  const items = REQS.map(([k, label]) => {
    const st = estado === 'pending' ? 'pending' : estado === 'ok' || estado[k] ? 'ok' : 'fail';
    const ic = st === 'ok' ? 'check' : st === 'fail' ? 'x' : 'dot';
    const sr = st === 'ok' ? 'cumplido' : st === 'fail' ? 'falta' : 'pendiente';
    return `<li class="is-${st}">${icon(ic, 15)}<span>${label}</span><span class="sr-only"> (${sr})</span></li>`;
  });
  return `<ul class="reqs" id="req-nueva" aria-label="Requisitos de la contraseña nueva">${items.join('')}</ul>`;
}

function passwordField({ id, label, autocomplete, value = '', error, describedBy = [], readonly, after = '' }) {
  const errId = `${id}-error`;
  const ids = [...describedBy, ...(error ? [errId] : [])];
  return `
          <div class="field">
            <label for="${id}">${label}</label>
            <div class="control">
              <input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" value="${value}"${ids.length ? ` aria-describedby="${ids.join(' ')}"` : ''}${error ? ' aria-invalid="true"' : ''}${readonly ? ' readonly' : ''}>
              <button class="reveal" type="button" aria-label="Mostrar contraseña" aria-pressed="false"${readonly ? ' disabled' : ''}>${icon('eye', 18)}</button>
            </div>
            ${error ? `<p class="field-error" id="${errId}" role="alert">${icon('alert', 15)}<span>${error}</span></p>` : ''}${after}
          </div>`;
}

function passwordCard(v) {
  const f = v.form;
  const busy = !!f.enviando;
  const nuevaErr = f.nuevaError;
  return `
      <section class="card" aria-labelledby="t-contrasena">
        <div class="card-head">
          <h2 id="t-contrasena">Cambiar contraseña</h2>
          <p class="card-desc">Al cambiarla cerraremos tus otras sesiones. Esta seguirá abierta.</p>
        </div>
        ${alertBox(f.alerta)}
        <form novalidate${busy ? ' aria-busy="true"' : ''}>
          ${passwordField({
            id: 'actual', label: 'Contraseña actual', autocomplete: 'current-password', value: f.actual || '',
            error: f.actualError, readonly: busy, describedBy: ['actual-ayuda'],
            after: `<p class="field-help" id="actual-ayuda"><a href="#">¿No la recuerdas? Restablece tu contraseña</a></p>`,
          })}
          ${passwordField({
            id: 'nueva', label: 'Contraseña nueva', autocomplete: 'new-password', value: f.nueva || '',
            error: nuevaErr, readonly: busy, describedBy: ['req-nueva'], after: reqList(f.reqs),
          })}
          ${passwordField({
            id: 'confirmacion', label: 'Confirma la contraseña nueva', autocomplete: 'new-password', value: f.confirmacion || '',
            error: f.confirmacionError, readonly: busy,
          })}
          <div class="form-foot">
            ${busy
              ? `<button class="btn btn-primary btn-busy" type="submit" disabled aria-disabled="true">${icon('loader', 16, 'spin')}Cambiando contraseña…</button><span class="sr-only" role="status">Cambiando tu contraseña…</span>`
              : `<button class="btn btn-primary" type="submit">Cambiar contraseña</button>`}
          </div>
        </form>
      </section>`;
}

function page(v) {
  const file = v.estado === 'default' ? 'seguridad.html' : `seguridad--${v.estado}.html`;
  return `${M.cabecera({
    titulo: `Seguridad · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 002, §11: pantalla «Seguridad»). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa tokens y components/ui.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">${v.chip}</span> <strong>Seguridad</strong> <span class="file">${file}</span> <span>en la aplicación · con sesión · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${sidebar()}
    <div class="main">
      ${topbar()}
      <main class="content" id="contenido">
        <div class="page-head">
          <h1>Seguridad</h1>
          <p>Revisa dónde está abierta tu cuenta y cambia tu contraseña.</p>
        </div>
        <div class="grid">
          ${sessionsCard(v)}
          ${passwordCard(v)}
        </div>
      </main>
    </div>
  </div>${dialog(v.dialogo)}
</div>

</body>
</html>
`;
}

// ---------- Estados ----------
const soloActual = SESIONES.filter((s) => s.actual);
const sinSafari = SESIONES.filter((s) => s.id !== 'safari');
const FORM_VACIO = { reqs: 'pending' };
const NUEVA_OK = 'Nimbo-Seguro-2026';

const ESTADOS = [
  { estado: 'default', chip: 'D-9', titulo: 'default (este dispositivo y otros tres)', sesiones: SESIONES, form: FORM_VACIO },
  { estado: 'cargando', chip: 'D-9', titulo: 'cargando la lista de sesiones', sesiones: 'cargando', form: FORM_VACIO },
  { estado: 'error-sesiones', chip: 'D-9', titulo: 'error al cargar las sesiones', sesiones: 'error', form: FORM_VACIO },
  { estado: 'sin-otras-sesiones', chip: 'D-9', titulo: 'solo la sesión de este dispositivo', sesiones: soloActual, form: FORM_VACIO },
  {
    estado: 'confirmar-cierre', chip: 'D-8', titulo: 'confirmar el cierre de una sesión', sesiones: SESIONES, form: FORM_VACIO,
    dialogo: { title: '¿Cerrar la sesión en Safari · iOS?', body: 'Ese dispositivo tendrá que iniciar sesión de nuevo.', confirm: 'Cerrar sesión' },
  },
  {
    estado: 'confirmar-cierre-actual', chip: 'D-8', titulo: 'confirmar el cierre de la sesión actual', sesiones: SESIONES, form: FORM_VACIO,
    dialogo: M.DIALOGO_CERRAR_SESION,
  },
  {
    estado: 'sesion-cerrada', chip: 'D-8', titulo: 'sesión cerrada', sesiones: sinSafari, form: FORM_VACIO,
    sesionesAlerta: { type: 'success', body: 'Cerramos la sesión en Safari · iOS.' },
  },
  {
    estado: 'cerrar-demas', chip: 'D-8', titulo: 'confirmar «Cerrar las demás sesiones»', sesiones: SESIONES, form: FORM_VACIO,
    dialogo: {
      title: '¿Cerrar las demás sesiones?',
      body: 'Cerraremos 3 sesiones. Esos dispositivos tendrán que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.',
      confirm: 'Cerrar 3 sesiones',
    },
  },
  {
    estado: 'cerrar-demas-exito', chip: 'D-8', titulo: 'resultado de «Cerrar las demás sesiones»', sesiones: soloActual, form: FORM_VACIO,
    sesionesAlerta: { type: 'success', body: 'Cerramos 3 sesiones. Solo queda abierta la de este dispositivo.' },
  },
  {
    estado: 'contrasena-enviando', chip: 'D-7', titulo: 'cambiando la contraseña', sesiones: SESIONES,
    form: { actual: 'Lucia-Alpha-2025', nueva: NUEVA_OK, confirmacion: NUEVA_OK, reqs: 'ok', enviando: true },
  },
  {
    estado: 'contrasena-no-coincide', chip: 'D-7', titulo: 'la confirmación no coincide (validación en el cliente)', sesiones: SESIONES,
    form: {
      actual: 'Lucia-Alpha-2025', nueva: NUEVA_OK, confirmacion: 'Nimbo-Seguro-2025', reqs: 'ok',
      confirmacionError: 'Las contraseñas no coinciden. Escribe la misma en los dos campos.',
    },
  },
  {
    estado: 'contrasena-incorrecta', chip: 'D-7', titulo: 'contraseña actual incorrecta (IDENTITY_WRONG_PASSWORD)', sesiones: SESIONES,
    form: { actual: '', actualError: 'La contraseña actual no es correcta.', nueva: NUEVA_OK, confirmacion: NUEVA_OK, reqs: 'ok' },
  },
  {
    estado: 'contrasena-debil', chip: 'D-7', titulo: 'contraseña nueva débil (IDENTITY_WEAK_PASSWORD)', sesiones: SESIONES,
    form: {
      actual: 'Lucia-Alpha-2025', nueva: 'Alpha2026', confirmacion: 'Alpha2026',
      nuevaError: 'La contraseña no cumple todos los requisitos.', reqs: { len: false, upper: true, num: true, sym: false },
    },
  },
  {
    estado: 'contrasena-bloqueada', chip: 'D-7', titulo: 'cambio bloqueado tras 5 intentos (IDENTITY_TOO_MANY_REQUESTS)', sesiones: SESIONES,
    form: {
      actual: '', nueva: NUEVA_OK, confirmacion: NUEVA_OK, reqs: 'ok',
      alerta: { type: 'error', body: 'Hiciste demasiados intentos con una contraseña incorrecta. Espera 15 minutos o restablece tu contraseña.' },
    },
  },
  {
    estado: 'contrasena-cambiada', chip: 'D-7', titulo: 'contraseña cambiada', sesiones: soloActual,
    form: { reqs: 'pending', alerta: { type: 'success', body: 'Cambiamos tu contraseña y cerramos tus otras sesiones.' } },
  },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'seguridad.html' : `seguridad--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}