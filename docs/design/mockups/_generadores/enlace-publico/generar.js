// Genera los estados de sharing/enlace-publico para la spec 013b (página pública /enlace, CA-1 a CA-8 y CA-11).
// Uso: node generar.js <ruta-del-worktree>
// Marco: marco/marco.js (tokens, botones, <head>); íconos de tipo: mis-archivos/. Sin barra lateral: es la cabecera
// pública real de la app (PublicHeader: logo, «Planes» e «Iniciar sesión») y la tarjeta centrada de IdentityCard.
// enlace-publico--propuesta.html es el paquete de la propuesta (p. 15) y no se genera.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/sharing/enlace-publico');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const icon = S.crearIcon({
  ...S.P,
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  linkOff: '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4"/><path d="m2 2 20 20"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
});

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + `
  /* Propio de sharing/enlace-publico (spec 013b). Valores de ui-guidelines.md §3; la app usa utilidades de Tailwind. */
  :root {
    --warning: #D4A96A;
    --warning-foreground: #8A6424;
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
  }
  [hidden] { display: none !important; }

  /* Lienzo de una página pública: cabecera arriba y contenido centrado (app/(public)/layout.tsx) */
  .pub { display: flex; flex-direction: column; min-height: 760px; background: var(--background); }

  /* PublicHeader: h-16, bg-card, borde inferior, sombra suave; logo (BrandLogo) y navegación pública */
  .pub-header { display: flex; align-items: center; justify-content: space-between; height: 64px; padding: 0 24px; background: var(--card); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-card); }
  .brand { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px; border-radius: var(--radius-sm); color: var(--foreground); text-decoration: none; }
  .brand:hover { color: var(--foreground); }
  .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-button); }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
  .pub-nav { display: flex; align-items: center; gap: 4px; }
  .pub-nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: var(--radius-sm); color: var(--foreground); font-size: 14px; font-weight: 500; text-decoration: none; }
  .pub-nav a:hover { background: var(--muted); color: var(--foreground); }

  /* IdentityCard: columna de 448 px, tarjeta con ícono de tono, título h1 centrado y contenido */
  .pub-main { flex: 1; display: flex; flex-direction: column; }
  .id-wrap { width: 100%; max-width: 448px; margin: 0 auto; padding: 64px 16px; }
  .id-card { display: grid; gap: 24px; padding: 32px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .id-head { display: grid; justify-items: center; gap: 12px; text-align: center; }
  .tone { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: var(--radius-md); }
  .tone-info { background: var(--accent); color: var(--primary); }
  .id-head h1 { margin: 0; font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }

  /* Ficha del archivo: ícono del tipo (FileTypeIcon), nombre, tamaño y vencimiento absoluto */
  .ficha { display: flex; align-items: flex-start; gap: 12px; margin: 0; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card); }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: none; border-radius: 8px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }
  .ficha-text { min-width: 0; }
  .ficha-name { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .ficha-meta { display: flex; flex-wrap: wrap; gap: 0 6px; margin: 2px 0 0; font-size: 13.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }

  /* Formulario de la contraseña (PasswordField: Input + botón de 44 px para mostrar u ocultar) */
  .form { display: grid; gap: 16px; margin: 0; }
  .field { display: grid; gap: 6px; }
  .field label { font-size: 14px; font-weight: 500; }
  .pw { position: relative; }
  .input { width: 100%; min-height: 44px; padding: 8px 48px 8px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 15px; }
  .input:focus-visible, .input.is-focus { outline: 2px solid var(--ring); outline-offset: 2px; }
  .input[aria-invalid="true"] { border-color: var(--destructive); }
  .pw-toggle { position: absolute; top: 0; right: 0; bottom: 0; display: inline-flex; align-items: center; justify-content: center; width: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--muted-foreground); cursor: pointer; }
  .pw-toggle:hover { color: var(--foreground); }
  .field-error { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 13.5px; font-weight: 500; color: var(--destructive); }
  .field-error .ico { margin-top: 2px; }

  /* Acción principal a todo el ancho, 44 px; «Preparando descarga…» no acepta otro clic y conserva el contraste */
  .btn-block { width: 100%; min-height: 44px; font-size: 14px; }
  .btn[aria-disabled="true"] { cursor: progress; }

  /* Alert de shadcn sobre la ficha: warning (429 y red al descargar) y success (descarga iniciada), role="status" */
  .alert { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 12px 16px; border: 1px solid; border-radius: var(--radius-md); font-size: 14px; line-height: 1.5; }
  .alert .ico { margin-top: 2px; }
  .alert p { margin: 0; }
  .alert-warning { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, var(--card)); color: var(--warning-foreground); }
  .alert-success { border-color: var(--success); background: color-mix(in srgb, var(--success) 10%, var(--card)); color: var(--foreground); }
  .alert-success .ico { color: var(--success-foreground); }

  /* Cargando: esqueleto con la forma de la ficha (aria-hidden) y un texto con role="status" */
  .skeleton-line { display: block; height: 12px; border-radius: 999px; background: var(--muted); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  .sk-head { display: grid; justify-items: center; gap: 12px; }
  .sk-tone { width: 48px; height: 48px; border-radius: var(--radius-md); }
  .sk-title { width: 80%; height: 20px; }
  .sk-title2 { width: 50%; height: 20px; }
  .sk-ficha { display: flex; gap: 12px; align-items: center; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); }
  .sk-ficha > div { flex: 1; display: grid; gap: 8px; }
  .sk-tile { width: 40px; height: 40px; flex: none; border-radius: 8px; }
  .sk-btn { height: 44px; border-radius: var(--radius-md); }
  .w45 { width: 45%; } .w70 { width: 70%; }
  .loading-text { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; font-size: 14px; color: var(--secondary-foreground); }

  /* StateView (no disponible y error al abrir), en la misma columna que la tarjeta */
  .state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 224px; padding: 32px; text-align: center; background: var(--card); border: 1px dashed var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .state > .ico { margin-bottom: 16px; color: var(--muted-foreground); }
  .state h2 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; color: var(--foreground); }
  .state p { margin: 6px 0 0; max-width: 384px; font-size: 14px; color: var(--muted-foreground); }
  .state .btn { margin-top: 20px; }
  .state-error { border-color: color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .state-error > .ico, .state-error h2 { color: var(--destructive); }
  .state-error p, .state-warning p { color: var(--foreground); }
  .state-warning { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, var(--card)); }
  .state-warning > .ico, .state-warning h2 { color: var(--warning-foreground); }

  @media (max-width: 767px) {
    .pub-header { padding: 0 16px; }
  }
  @media (max-width: 639px) {
    .sheet-label { padding: 16px 12px 10px; }
    .canvas { margin: 0 8px 16px; border-radius: var(--radius-md); }
    .pub { min-height: 680px; }
    .pub-nav a { padding: 0 8px; }
    .id-wrap { padding: 40px 16px; }
    .id-card { padding: 24px; }
    .ficha { gap: 10px; padding: 12px; }
    .ftile { width: 36px; height: 36px; }
    .ficha-name { font-size: 14px; }
    .ficha-meta { flex-direction: column; }
    .ficha-meta [aria-hidden="true"] { display: none; }
    .state { padding: 32px 16px; }
    .state .btn { width: 100%; min-height: 44px; }
  }
`;

// ---------- Datos de ejemplo (en la app vienen de POST /public-links/open; nunca el token) ----------
const FICHA = {
  propietario: 'Andrea Morales',
  archivo: 'Informe_trimestral_Q3.docx',
  tamano: '2,4 MB',
  vence: 'Vence el 14 nov 2026, 14:30',
};
const ESPERA_MIN = 15; // {n} de CA-5: minutos desde retryAfterSeconds, hacia arriba
const TEXTO_429 = ['Hubo demasiados intentos con este enlace.', `Espera ${ESPERA_MIN} minutos e inténtalo de nuevo.`];

// ---------- Piezas ----------
const cabeceraPublica = () => `
    <header class="pub-header">
      <a class="brand" href="#"><span class="brand-mark">${icon('cloud', 20)}</span><span class="brand-name">Nimbo</span></a>
      <nav class="pub-nav" aria-label="Navegación pública">
        <a href="#">Planes</a>
        <a href="#">Iniciar sesión</a>
      </nav>
    </header>`;

const ficha = () => `
          <div class="ficha">
            <span class="ftile ftile-docx" aria-hidden="true">${icon('fileText', 20)}</span>
            <div class="ficha-text">
              <p class="ficha-name">${FICHA.archivo}</p>
              <p class="ficha-meta"><span>${FICHA.tamano}</span><span aria-hidden="true">·</span><span>${FICHA.vence}</span></p>
            </div>
          </div>`;

const alerta = (tono, ic, texto) => `
          <div class="alert alert-${tono}" role="status">${icon(ic, 18)}<p>${texto}</p></div>`;

// «Descargar» (CA-1, CA-3). preparando: texto de CA-3, aria-disabled y aria-busy; el anuncio va en una región aparte.
function botonDescargar({ preparando = false, submit = false } = {}) {
  const tipo = submit ? 'submit' : 'button';
  if (!preparando) return `
          <button class="btn btn-primary btn-block" type="${tipo}">${icon('download', 18)}<span>Descargar</span></button>`;
  return `
          <button class="btn btn-primary btn-block btn-busy" type="${tipo}" aria-disabled="true" aria-busy="true">${icon('loader', 18, 'spin')}<span>Preparando descarga…</span></button>
          <p class="sr-only" role="status">Preparando descarga…</p>`;
}

// Campo «Contraseña del enlace» (CA-2, CA-4): con error, vacío, aria-invalid, mensaje role="alert" y foco.
function formulario({ error = '', valor = '', extra = '' } = {}) {
  const inv = error ? ' aria-invalid="true" aria-describedby="pw-error" autofocus' : '';
  return `
          <form class="form" novalidate>
            <div class="field">
              <label for="pw">Contraseña del enlace</label>
              <div class="pw">
                <input class="input${error ? ' is-focus' : ''}" id="pw" name="password" type="password" autocomplete="off" maxlength="128"${valor ? ` value="${valor}"` : ''}${inv}>
                <button class="pw-toggle" type="button" aria-label="Mostrar contraseña">${icon('eye', 18)}</button>
              </div>${error ? `
              <p class="field-error" id="pw-error" role="alert">${icon('alert', 16)}<span>${error}</span></p>` : ''}
            </div>${extra}${botonDescargar({ submit: true })}
          </form>`;
}

// Tarjeta de la ficha (IdentityCard, tono info). conContrasena: ícono de candado y formulario; si no, solo «Descargar».
function tarjeta({ conContrasena = false, aviso = '', form = {}, preparando = false } = {}) {
  const accion = conContrasena ? formulario(form) : botonDescargar({ preparando });
  return `
      <section class="id-wrap" aria-labelledby="ficha-t">
        <div class="id-card">
          <div class="id-head">
            <span class="tone tone-info" aria-hidden="true">${icon(conContrasena ? 'lock' : 'share', 24)}</span>
            <h1 id="ficha-t">${FICHA.propietario} compartió un archivo contigo</h1>
          </div>${ficha()}${aviso}${accion}
        </div>
      </section>`;
}

const cargando = () => `
      <section class="id-wrap" aria-busy="true" aria-labelledby="carga-t">
        <h1 class="sr-only" id="carga-t">Archivo compartido</h1>
        <div class="id-card">
          <div aria-hidden="true">
            <div class="sk-head"><span class="skeleton-line sk-tone"></span><span class="skeleton-line sk-title"></span><span class="skeleton-line sk-title2"></span></div>
          </div>
          <div class="sk-ficha" aria-hidden="true"><span class="skeleton-line sk-tile"></span><div><span class="skeleton-line w70"></span><span class="skeleton-line w45"></span></div></div>
          <span class="skeleton-line sk-btn" aria-hidden="true"></span>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando el archivo compartido…</p>
        </div>
      </section>`;

// StateView sin ficha. La página siempre tiene un h1 (sr-only) y el título del estado va en h2 (headingLevel="h2").
function estadoSinFicha({ tono = '', ic, titulo, texto, rol, accion = '' }) {
  return `
      <section class="id-wrap" aria-labelledby="estado-h1">
        <h1 class="sr-only" id="estado-h1">Archivo compartido</h1>
        <div class="state${tono ? ` state-${tono}` : ''}" role="${rol}">
          ${icon(ic, 40)}
          <h2>${titulo}</h2>
          <p>${texto}</p>${accion ? `
          <button class="btn btn-outline" type="button">${icon('retry', 16)}<span>${accion}</span></button>` : ''}
        </div>
      </section>`;
}

// ---------- Página ----------
function page(v) {
  const file = `enlace-publico--${v.estado}.html`;
  const head = M.cabecera({
    titulo: 'Archivo compartido · Nimbo',
    comentarios: [
      `Mockup de referencia (spec 013b: página pública /enlace, CA-1 a CA-8 y CA-11). Estado: ${v.estado}.`,
      'Título genérico de CA-8: nunca el nombre del archivo ni el token. noindex por S-5.',
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/enlace-publico/generar.js (marco y mis-archivos). No editar a mano.',
    ],
    css: CSS,
  }).replace('<meta name="viewport"', '<meta name="robots" content="noindex">\n<meta name="viewport"');
  return `${head}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">013b</span> <strong>Enlace público (página)</strong> <span class="file">${file}</span> <span>ruta /enlace#… (el token va en el fragmento y no se muestra) · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="pub">${cabeceraPublica()}
    <main class="pub-main" id="contenido">${v.cuerpo()}
    </main>
  </div>
</div>

</body>
</html>
`;
}

// ---------- Estados (spec 013b §6) ----------
const ESTADOS = [
  { estado: 'cargando', titulo: 'esqueleto mientras responde POST /public-links/open (CA-1)', cuerpo: cargando },
  { estado: 'sin-contrasena', titulo: 'ficha y «Descargar», nada más (CA-1)', cuerpo: () => tarjeta() },
  { estado: 'con-contrasena', titulo: 'la ficha se ve sin escribir nada; el campo va antes de «Descargar» (CA-2)', cuerpo: () => tarjeta({ conContrasena: true }) },
  {
    estado: 'contrasena-incorrecta', titulo: '403: campo vacío, inválido y con el foco; sin intentos restantes (CA-4)',
    cuerpo: () => tarjeta({ conContrasena: true, form: { error: 'La contraseña no es correcta. Revísala y vuelve a intentarlo.' } }),
  },
  {
    estado: 'bloqueado', titulo: '429 al descargar: aviso neutro sobre la ficha, sin motivo ni cuenta regresiva (CA-5, CA-12)',
    cuerpo: () => tarjeta({ conContrasena: true, aviso: alerta('warning', 'clock', TEXTO_429.join(' ')), form: { valor: 'contrasena' } }),
  },
  { estado: 'descargando', titulo: 'pasados 2 s: «Preparando descarga…» y sin otro clic (CA-3)', cuerpo: () => tarjeta({ preparando: true }) },
  {
    estado: 'descarga-iniciada', titulo: 'aviso de éxito anunciado y «Descargar» disponible otra vez (CA-3)',
    cuerpo: () => tarjeta({ aviso: alerta('success', 'ok', 'Tu descarga comenzó. Si no empieza, vuelve a intentarlo.') }),
  },
  {
    estado: 'no-disponible', titulo: 'un solo mensaje para todo motivo, sin ficha (CA-6, RN-1)',
    cuerpo: () => estadoSinFicha({ ic: 'linkOff', titulo: 'Este enlace ya no está disponible.', texto: 'Pide a quien te lo compartió uno nuevo.', rol: 'status' }),
  },
  {
    estado: 'error-carga', titulo: 'red o 5xx al abrir: distinto de «no disponible», con «Reintentar» (CA-7)',
    cuerpo: () => estadoSinFicha({ tono: 'error', ic: 'alert', titulo: 'No pudimos cargar el archivo compartido.', texto: 'Revisa tu conexión e inténtalo de nuevo.', rol: 'alert', accion: 'Reintentar' }),
  },
  {
    // Variante de error-carga (spec §6): el 429 al abrir usa este diseño en tono de advertencia (CA-5).
    estado: 'error-carga-limite', titulo: 'variante de error-carga: 429 al abrir, tono de advertencia y «Reintentar» (CA-5)',
    cuerpo: () => estadoSinFicha({ tono: 'warning', ic: 'clock', titulo: TEXTO_429[0], texto: TEXTO_429[1], rol: 'status', accion: 'Reintentar' }),
  },
];

for (const v of ESTADOS) {
  const file = `enlace-publico--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
