// Piezas comunes del marco de la aplicación (barra lateral, barra superior, menú de la cuenta, cajón móvil y
// diálogo de confirmación). Las usan identity/seguridad (seguridad/generar.js) y shared/layout (layout/generar.js).
// Regla: con las opciones por defecto, cada función produce exactamente el HTML que seguridad ya tenía aprobado.
const CSS = require('./css-marco.js');

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const P = {
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  sparkles: '<path d="m12 3-1.9 5.8L4 10.7l6.1 1.9 1.9 5.9 1.9-5.9 6.1-1.9-6.1-1.9Z"/><path d="M5 3v4"/><path d="M3 5h4"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  retry: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  trash2: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  circlex: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  drive: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  shieldcheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
const icon = (name, size = 18, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;

// ---------- Datos del marco (vienen de la API en la implementación) ----------
const CUENTA = { nombre: 'Lucía Barrios', iniciales: 'LB', correo: 'lucia.barrios@gmail.com' };
const NAV_PRINCIPAL = [
  ['folder', 'Mis archivos'],
  ['share', 'Compartidos conmigo'],
  ['clock', 'Recientes'],
  ['pin', 'Fijados'],
  ['trash', 'Papelera', '3'],
];
const NAV_CUENTA = [
  ['sparkles', 'Optimizador'],
  ['card', 'Plan y facturación'],
];
const CARPETAS = [
  ['folder', 'Tesis', '18'],
  ['folder', 'Trabajo', '42'],
  ['folder', 'Personales', '9'],
];
const CUOTA = { usado: '3.2 GB', total: '15 GB', pct: 21 };

// Diálogo de «Cerrar sesión» en este dispositivo: mismo texto en Seguridad (confirmar-cierre-actual) y en el menú
// de la cuenta (confirmar-cerrar-sesion). Spec 002 §11 y decisión aprobada 2 del README de Seguridad.
const DIALOGO_CERRAR_SESION = {
  title: '¿Cerrar la sesión en este dispositivo?',
  body: 'Tendrás que iniciar sesión de nuevo para volver a entrar.',
  confirm: 'Cerrar sesión',
};

// ---------- Piezas ----------
// carpetas: sección «Carpetas» (por defecto, CARPETAS; con [] se omite el título y la lista).
// accesos: HTML de la sección «Accesos rápidos» de 006 (accesos/accesos.js); con '' no aparece y el marco no cambia.
// contadorPapelera: por defecto, el de NAV_PRINCIPAL; con '' se omite (005: la papelera llega con 006).
function navegacion({ activo = '', etiqueta = 'Navegación principal', idPrimerEnlace = '', carpetas = CARPETAS, contadorPapelera, accesos = '' } = {}) {
  const principal = contadorPapelera === undefined ? NAV_PRINCIPAL
    : NAV_PRINCIPAL.map(([ic, label, meta]) => [ic, label, label === 'Papelera' ? contadorPapelera : meta]);
  let primero = !!idPrimerEnlace;
  const item = ([ic, label, meta = '']) => {
    const current = label === activo ? ' aria-current="page"' : '';
    const id = primero ? ` id="${idPrimerEnlace}"` : '';
    primero = false;
    return `<li><a href="#"${id}${current}>${icon(ic)}<span>${label}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</a></li>`;
  };
  const lista = (items) => items.map((i) => `\n          ${item(i)}`).join('');
  return `<nav aria-label="${etiqueta}">
        <ul class="nav">${lista(principal)}
        </ul>
        <div class="nav-sep" role="presentation"></div>
        <ul class="nav">${lista(NAV_CUENTA)}
        </ul>${carpetas.length ? `
        <p class="nav-title">Carpetas</p>
        <ul class="nav">${lista(carpetas)}
        </ul>` : ''}${accesos}
      </nav>`;
}

function cuota({ usado, total, pct } = CUOTA) {
  const ancho = pct === CUOTA.pct ? '' : ` style="width: ${pct}%"`;
  return `<div class="quota">
        <div class="quota-head"><span>Almacenamiento</span><span>${pct} %</span></div>
        <div class="quota-bar" role="progressbar" aria-label="Almacenamiento usado" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${usado} de ${total} (${pct} %)"><span${ancho}></span></div>
        <div class="quota-meta">${usado} de ${total}</div>
      </div>`;
}

const logo = (cls = 'logo') =>
  `<a class="${cls}" href="#" aria-label="NIMBO, Mis archivos"><span class="logo-mark" aria-hidden="true">N</span><span>NIMBO</span></a>`;

function sidebar({ activo = '', plan = 'PERSONAL', cuota: q = CUOTA, carpetas = CARPETAS, contadorPapelera, accesos = '' } = {}) {
  return `
    <aside class="sidebar" aria-label="Barra lateral">
      <div class="brand-row">
        ${logo()}
        <span class="plan-chip">${plan}</span>
      </div>
      ${navegacion({ activo, carpetas, contadorPapelera, accesos })}
      ${cuota(q)}
    </aside>`;
}

// Cajón móvil (por debajo de 900 px): mismo contenido que la barra lateral dentro de un diálogo modal.
function cajon({ activo = '', plan = 'PERSONAL', cuota: q = CUOTA, abierto = false, carpetas = CARPETAS, accesos = '' } = {}) {
  const oculto = abierto ? '' : ' hidden';
  return `
  <div class="drawer-overlay" data-cerrar-cajon aria-hidden="true"${oculto}></div>
  <div class="drawer" id="cajon" role="dialog" aria-modal="true" aria-labelledby="cajon-t"${oculto}>
      <div class="drawer-head">
        ${logo()}
        <span class="plan-chip">${plan}</span>
        <h2 id="cajon-t" class="sr-only">Menú de navegación</h2>
        <button class="icon-btn" type="button" data-cerrar-cajon aria-label="Cerrar menú">${icon('x', 22)}</button>
      </div>
      ${navegacion({ activo, idPrimerEnlace: 'cajon-primero', carpetas, accesos })}
      ${cuota(q)}
  </div>`;
}

// actividad: agrega «Mi actividad» (spec 004) entre Seguridad y Plan; 'actual' la marca como página abierta.
// Sin la opción, el HTML es el aprobado de shared/layout.
function menuCuenta({ abierto = false, actividad = false } = {}) {
  return `
        <div class="account-pop" id="cuenta-pop"${abierto ? '' : ' hidden'}>
          <div class="account-who">
            <p class="account-who-name">${CUENTA.nombre}</p>
            <p class="account-who-mail">${CUENTA.correo}</p>
          </div>
          <ul class="account-menu" id="cuenta-menu" role="menu" aria-labelledby="cuenta-btn">
            <li role="none"><a role="menuitem" href="#" tabindex="-1">${icon('shield')}<span>Seguridad</span></a></li>${actividad ? `
            <li role="none"><a role="menuitem" href="#" tabindex="-1"${actividad === 'actual' ? ' aria-current="page"' : ''}>${icon('history')}<span>Mi actividad</span></a></li>` : ''}
            <li role="none"><a role="menuitem" href="#" tabindex="-1">${icon('card')}<span>Plan y facturación</span></a></li>
            <li role="separator" class="account-sep"></li>
            <li role="none"><button role="menuitem" type="button" tabindex="-1" data-cerrar-sesion>${icon('logout')}<span>Cerrar sesión</span></button></li>
          </ul>
        </div>`;
}

// crumbs: [texto, …]; el último es la página actual.
// conMenu: agrega aria-controls, el id del botón y el menú (layout). Sin él, el HTML es el aprobado de Seguridad.
function topbar({ crumbs = ['Cuenta', 'Seguridad'], conMenu = false, menuAbierto = false, cajonAbierto = false, actividad = false } = {}) {
  const items = crumbs.map((c, i) =>
    i === crumbs.length - 1 ? `<li><span aria-current="page">${c}</span></li>` : `<li><a href="#">${c}</a></li>`).join('');
  const menuBtnExtra = conMenu ? ' aria-controls="cajon"' : '';
  const cuentaExtra = conMenu ? ' id="cuenta-btn" aria-controls="cuenta-menu"' : '';
  return `
      <header class="topbar">
        <div class="topbar-left">
          <button class="menu-btn" type="button" aria-label="Abrir menú de navegación" aria-expanded="${cajonAbierto}"${menuBtnExtra}>${icon('menu', 22)}</button>
          ${logo('logo logo-mobile')}
          ${crumbs.length ? `<nav class="crumbs" aria-label="Ruta">
            <ol>${items}</ol>
          </nav>` : ''}
        </div>
        ${conMenu ? '<div class="account">\n        ' : ''}<button class="account-btn" type="button"${cuentaExtra} aria-haspopup="menu" aria-expanded="${menuAbierto}">
          <span class="account-name">${CUENTA.nombre}<span class="sr-only"> (menú de la cuenta)</span></span><span class="avatar" aria-hidden="true">${CUENTA.iniciales}</span>
        </button>${conMenu ? `${menuCuenta({ abierto: menuAbierto, actividad })}\n        </div>` : ''}
      </header>`;
}

function dialog(d, { oculto = false } = {}) {
  if (!d) return '';
  const h = oculto ? ' hidden' : '';
  return `
  <div class="overlay" aria-hidden="true"${h}></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d"${h}>
    <h2 id="dlg-t">${d.title}</h2>
    <p id="dlg-d">${d.body}</p>
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button" autofocus>Cancelar</button>
      <button class="btn btn-destructive" type="button">${d.confirm}</button>
    </div>
  </div>`;
}

// Aviso de solo lectura (ReadOnlyBanner, RF-23). Lo usan shared/layout (layout--solo-lectura) y billing/suscripcion
// (suscripcion--vencida). a: { titulo, cuerpo }; sin a, nada. El título por defecto es el aprobado del layout.
function avisoSoloLectura(a) {
  if (!a) return '';
  return `
        <section class="readonly" aria-labelledby="ro-t">
          ${icon('lock', 20)}
          <p class="readonly-text"><strong id="ro-t">${a.titulo || 'Tu cuenta está en solo lectura.'}</strong> ${a.cuerpo}</p>
          <a class="btn btn-primary btn-sm" href="${a.href || '#'}">Renovar plan</a>
        </section>`;
}

// <head> común: Inter 400/500/600/700 y el CSS del mockup.
function cabecera({ titulo, comentarios, css }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
${comentarios.map((c) => `<!-- ${c} -->`).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>`;
}

// ---------- CSS de las piezas que Seguridad no muestra (ítem activo, menú de la cuenta, cajón, aviso de solo lectura) ----------
const EXTRA = `
  /* Extensiones del marco (shared/layout) */
  :root {
    --warning: #D4A96A;
    --warning-foreground: #8A6424;
    --warning-soft: color-mix(in srgb, var(--warning) 12%, var(--card));
  }
  [hidden] { display: none !important; }

  /* Ítem activo: fondo accent, texto foreground en 600 y barra de 3 px (no solo color) */
  .nav a[aria-current="page"] { background: var(--accent); color: var(--foreground); font-weight: 600; border-left: 3px solid var(--primary); padding-left: 9px; }
  .nav a[aria-current="page"] .meta, .nav a:hover .meta { color: var(--secondary-foreground); } /* muted-foreground sobre muted da 4.39 */
  @media (max-width: 900px) { .logo { min-height: 44px; } } /* CA-5 de 000b: 44 px en móvil */

  /* Menú de la cuenta (DropdownMenu de shadcn) */
  .topbar { position: relative; }
  .account { position: relative; }
  .account-btn[aria-expanded="true"] { background: var(--muted); color: var(--foreground); }
  .account-pop { position: absolute; z-index: 20; top: calc(100% + 8px); right: 0; width: 272px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); padding: 6px; }
  .account-who { padding: 10px 12px 12px; border-bottom: 1px solid var(--border); margin-bottom: 6px; }
  .account-who p { margin: 0; }
  .account-who-name { font-weight: 600; font-size: 14px; }
  .account-who-mail { font-size: 13px; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .account-menu { list-style: none; margin: 0; padding: 0; }
  .account-menu [role="menuitem"] { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); font: inherit; font-size: 14px; font-weight: 500; text-align: left; text-decoration: none; cursor: pointer; }
  .account-menu [role="menuitem"] .ico { color: var(--secondary-foreground); }
  .account-menu [role="menuitem"]:hover, .account-menu [role="menuitem"]:focus { background: var(--muted); }
  .account-menu [role="menuitem"]:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
  .account-sep { height: 1px; background: var(--border); margin: 6px 4px; }

  /* Cajón móvil (AppLayout, por debajo de 900 px) */
  .drawer-overlay { position: absolute; inset: 0; z-index: 10; background: var(--overlay); }
  .drawer { position: absolute; z-index: 11; top: 0; bottom: 0; left: 0; width: min(320px, calc(100% - 40px)); display: flex; flex-direction: column; gap: 14px; overflow-y: auto; background: var(--card); box-shadow: var(--shadow-modal); padding: 12px 12px 16px; }
  .drawer-head { display: flex; align-items: center; gap: 10px; padding: 0 0 10px 8px; border-bottom: 1px solid var(--border); }
  .drawer-head .icon-btn { margin-left: auto; }
  .drawer .nav a { min-height: 44px; font-size: 15px; }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); cursor: pointer; }
  .icon-btn:hover { background: var(--muted); }
  @media (min-width: 901px) { .drawer, .drawer-overlay { display: none !important; } }

  /* Aviso de solo lectura (ReadOnlyBanner, RF-23) */
  .readonly { display: flex; align-items: center; gap: 12px 16px; margin: 0 0 22px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--card)); border-radius: var(--radius-lg); background: var(--warning-soft); color: var(--foreground); }
  .readonly > .ico { color: var(--warning-foreground); flex: none; }
  .readonly-text { flex: 1; min-width: 0; margin: 0; font-size: 14px; line-height: 1.5; }
  .readonly-text strong { display: block; color: var(--warning-foreground); font-weight: 600; }
  .readonly .btn { flex: none; }

  @media (max-width: 600px) {
    .account { position: static; }
    .account-pop { top: calc(100% - 2px); right: 8px; width: min(272px, calc(100% - 16px)); }
    .account-menu [role="menuitem"] { min-height: 44px; }
    .readonly { flex-wrap: wrap; align-items: flex-start; padding: 14px; }
    .readonly .btn { width: 100%; }
  }
`;

module.exports = {
  CSS, EXTRA, P, icon, CUENTA, CUOTA, DIALOGO_CERRAR_SESION,
  sidebar, cajon, topbar, dialog, cabecera, navegacion, cuota, logo, avisoSoloLectura,
};
