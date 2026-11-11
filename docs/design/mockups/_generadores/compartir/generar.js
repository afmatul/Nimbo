// Genera los estados de sharing/compartir para la spec 013c: la sección «Enlace público» del diálogo «Compartir»
// (CA-1 a CA-15). El diálogo reproduce el real de la 012b (share-dialog.tsx): título, descripción, formulario de correo
// con «Qué puede hacer» (Lector/Editor), «Personas con acceso» con dos filas y la X de cierre, sin pie. La sección va
// después de «Personas con acceso», con h3 y borde superior (D-3), y solo para archivos (CA-2).
// Uso: node generar.js <ruta-del-worktree>
// Marco: marco/marco.js; tabla de fondo y barra lateral: mis-archivos/ y carpetas/. compartir.html es el paquete de
// la propuesta (p. 14) y no se genera.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const C = require('../carpetas/carpetas.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/sharing/compartir');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos (trazos de Lucide, 24 × 24) ----------
const icon = S.crearIcon({
  ...C.P,
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  linkOff: '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4"/><path d="m2 2 20 20"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
});

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + S.CSS_LISTA + C.CSS_006 + `
  /* Propio de sharing/compartir (spec 013c). Valores de ui-guidelines.md §3; la app usa utilidades de Tailwind. */
  :root { --file-docx: #3F62A8; --file-docx-bg: #6B8DD620; }

  /* Fondo: Mis archivos inerte detrás del velo; la capa del diálogo marca la altura de la hoja */
  .canvas .app { position: absolute; inset: 0; min-height: 0; }
  .layer { position: relative; z-index: 10; min-height: 860px; padding: 56px 16px; background: var(--overlay); }

  /* DialogContent (components/ui/dialog): max-w-lg, p-6, gap-4, rounded-xl, borde y sombra modal */
  .sd { position: relative; display: grid; gap: 16px; width: 100%; max-width: 512px; margin: 0 auto; padding: 24px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: var(--shadow-modal); }
  .sd .btn { min-height: 44px; font-size: 14px; }
  .sd .btn-sm { min-height: 36px; font-size: 13px; }
  .sd-head { display: grid; gap: 8px; padding-right: 40px; }
  .sd-head h2 { margin: 0; font-size: 18px; line-height: 1.35; font-weight: 600; overflow-wrap: anywhere; }
  .sd-head p { margin: 0; font-size: 14px; color: var(--secondary-foreground); }
  .sd-close { position: absolute; top: 12px; right: 12px; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); cursor: pointer; }
  .sd-close:hover { background: var(--accent); }

  /* Campos (Input, Label, RadioGroup y PasswordField) */
  .sd form { display: grid; gap: 12px; margin: 0; }
  /* .sd anula las reglas de .field del diálogo con un campo de 006 (carpetas.js) */
  .sd .field { display: grid; gap: 6px; margin: 0; }
  .sd .field label, .rg legend { display: block; margin: 0; font-size: 14px; font-weight: 500; color: var(--foreground); }
  .input { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .input::placeholder { color: var(--muted-foreground); }
  .input[aria-invalid="true"] { border-color: var(--destructive); }
  .input:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .input[aria-invalid="true"]:focus-visible { outline-color: var(--destructive); }
  .rg { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; gap: 4px; }
  .rg legend { padding: 0; margin-bottom: 2px; }
  .rg label { display: flex; align-items: center; gap: 12px; min-height: 44px; font-size: 14px; font-weight: 500; }
  .rg input { width: 20px; height: 20px; margin: 0; accent-color: var(--primary); }
  .pw { position: relative; }
  .pw .input { padding-right: 48px; }
  .pw-toggle { position: absolute; top: 0; right: 0; bottom: 0; display: inline-flex; align-items: center; justify-content: center; width: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--muted-foreground); cursor: pointer; }
  .pw-toggle:hover { color: var(--foreground); }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .sd .field-error { display: flex; align-items: flex-start; gap: 6px; margin: 0 !important; font-size: 13px !important; font-weight: 500; color: var(--destructive) !important; }
  .field-error .ico { margin-top: 2px; }
  .btn[aria-disabled="true"] { cursor: progress; }

  /* «Personas con acceso» (AccessList y access-row de la 012b) */
  .acc { display: grid; gap: 8px; }
  .sd h3 { margin: 0; font-size: 14px; font-weight: 600; color: var(--foreground); }
  .acc ul { list-style: none; margin: 0; padding: 0; }
  .acc li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 0; }
  .acc li + li { border-top: 1px solid var(--border); }
  .person { display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; }
  .pav { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: none; border-radius: 999px; background: var(--card); color: var(--foreground); font-size: 12px; font-weight: 600; box-shadow: 0 0 0 2px var(--input); }
  .person p { margin: 0; }
  .p-name { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .p-sub { font-size: 12px; color: var(--secondary-foreground); overflow-wrap: anywhere; }
  .row-act { display: flex; align-items: center; gap: 4px; }
  .lvl { height: 36px; padding: 0 8px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .icon-ghost { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--secondary-foreground); cursor: pointer; }
  .icon-ghost:hover { background: var(--accent); }

  /* Sección «Enlace público» (spec 013c, D-3): h3 y borde superior, después de «Personas con acceso» */
  .pl { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--border); }
  .pl p { margin: 0; }
  .pl-desc { font-size: 14px; color: var(--secondary-foreground); }
  .pl-loading { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; color: var(--secondary-foreground); }
  .pl-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .pl-note { font-size: 13px; color: var(--muted-foreground); }

  /* Resumen del enlace: StatusBadge (ícono + texto, nunca solo color) y metadatos con fechas absolutas */
  .pl-sum { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; white-space: nowrap; }
  .badge-success { border-color: color-mix(in srgb, var(--success) 40%, var(--card)); background: color-mix(in srgb, var(--success) 10%, var(--card)); color: var(--success-foreground); }
  .badge-neutral { border-color: var(--border); background: var(--card); color: var(--secondary-foreground); }
  .pl-dates { display: grid; min-width: 0; }
  .meta { display: flex; flex-wrap: wrap; gap: 0 6px; font-size: 13px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }

  /* «Revocar enlace» abre la confirmación: texto destructive (5.4:1 sobre card), borde input; el rojo lleno es el de confirmar */
  .btn-outline-danger { color: var(--destructive); }
  .btn-outline-danger:hover { color: var(--destructive); }

  /* Confirmación en línea de «Revocar» (D-1, excepción de ui-guidelines.md §4): tono destructive al 5 % */
  .pl-confirm { display: grid; gap: 12px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--destructive-soft) 50%, var(--card)); border-radius: var(--radius-md); background: color-mix(in srgb, var(--destructive) 5%, var(--card)); }
  .pl-confirm-text { font-size: 14px; font-weight: 500; color: var(--foreground); }
  /* outline sobre un fondo tintado (advertencia, error): borde secondary-foreground; input daría menos de 3:1 (PD-189) */
  .pl-confirm .btn-outline, .alert-warning .btn-outline { color: var(--foreground); border-color: var(--secondary-foreground); }

  /* Formulario del enlace y su envoltorio de reemplazo */
  .pl-replace { display: grid; gap: 12px; }

  /* Campo de la URL (GeneratedLinkField): una línea, solo lectura, texto foreground; «Copiar enlace» al lado */
  .url-row { display: flex; gap: 8px; }
  .url-row .input { flex: 1; min-width: 0; background: var(--muted); text-overflow: ellipsis; }
  .url-row .btn { flex: none; }

  /* Alert de shadcn: error (role="alert"), warning y success (role="status") */
  .alert { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; margin: 0; padding: 12px 16px; border: 1px solid; border-radius: var(--radius-md); font-size: 14px; line-height: 1.5; }
  .alert > .ico { margin-top: 2px; }
  .alert .alert-text { flex: 1 1 192px; min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .alert-error { border-color: var(--destructive); background: var(--card); color: var(--destructive); }
  .alert-error .btn-outline { color: var(--foreground); }
  .alert-warning { border-color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, var(--card)); color: var(--warning-foreground); }
  .alert-success { border-color: var(--success); background: color-mix(in srgb, var(--success) 10%, var(--card)); color: var(--foreground); }
  .alert-success > .ico { color: var(--success-foreground); }
  /* ReadOnlyBanner (marco.avisoSoloLectura) dentro de la sección: el gap de .pl separa, sin el margen de página */
  .sd .readonly { margin: 0; }

  @media (max-width: 900px) {
    .layer { min-height: 0; }
  }
  @media (max-width: 600px) {
    .layer { padding: 24px 8px; }
    .sd { padding: 24px 16px; }
    .sd-close { top: 8px; right: 8px; }
    .sd-submit, .pl-actions .btn, .pl-confirm .btn { width: 100%; }
    .pl-actions { flex-direction: column; }
    .pl-confirm .pl-actions { flex-direction: column-reverse; }
    .url-row { flex-direction: column; }
    .meta { flex-direction: column; }
    .meta [aria-hidden="true"] { display: none; }
    .alert .btn { min-height: 44px; }
  }
`;

// ---------- Datos de ejemplo (en la app vienen de la API; el token nunca se guarda ni se registra) ----------
const ARCHIVO = 'Informe_trimestral_Q3.docx';
const CARPETA = 'Contratos 2026';
const PERSONAS = [
  { iniciales: 'PI', nombre: 'Pablo Ixcoy', correo: 'pablo.ixcoy@gmail.com', nivel: 'EDITOR' },
  { iniciales: 'MR', nombre: 'Mónica Reyes', correo: 'monica.reyes@outlook.com', nivel: 'VIEWER' },
];
// Token falso de ejemplo (43 caracteres base64url): no es un enlace real.
const URL_EJEMPLO = 'https://nimbo.gt/enlace#q7VfK2mXr9TbLw4NcY8pHs3dZaE6uJ1gQo5vRiWnTx0';
const VENCE = 'Vence el 14 nov 2026, 14:30';
const CREADO = 'Creado el 7 nov 2026, 14:30';
const VENCIDO = { vence: 'Venció el 3 nov 2026, 09:15', creado: 'Creado el 27 oct 2026, 09:15' };
const ESPERA_MIN = 15; // {n} de CA-12: minutos de retryAfterSeconds, hacia arriba
const FONDO = [
  ['carpeta', CARPETA, '', 'hoy · 09:40'],
  ['archivo', ARCHIVO, '2,4 MB', '7 nov'],
  ['archivo', 'Presupuesto_marketing.xlsx', '860 KB', '4 nov'],
  ['archivo', 'Manual_de_marca.pdf', '12,8 MB', '28 oct'],
];

// Textos de la spec 013c (CA-3 a CA-14, §5)
const T = {
  cargando: 'Cargando el enlace público…',
  descripcion: 'Cualquiera con el enlace puede descargar este archivo, sin cuenta en Nimbo.',
  generado: 'Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.',
  nota: 'Por seguridad, el enlace solo se ve al generarlo. Si lo perdiste, genera otro: el actual dejará de funcionar.',
  reemplazo: 'El enlace actual dejará de funcionar para quien lo tenga.',
  revocar: '¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.',
  revocado: 'Revocamos el enlace. Ya no sirve para descargar el archivo.',
  copiado: 'Enlace copiado',
  copiaFallida: 'No pudimos copiar el enlace. Selecciónalo y cópialo a mano.',
  contrasenaInvalida: 'Escribe una contraseña de 8 a 128 caracteres.',
  ayuda: 'Si la pones, se pedirá para descargar. De 8 a 128 caracteres. No uses la de tu cuenta y compártela por otro medio.',
  red: 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.',
  limite: `Hiciste demasiados intentos. Espera ${ESPERA_MIN} minutos e inténtalo de nuevo.`,
  noExiste: 'Este enlace ya no existe. Actualiza para ver el estado actual.',
  archivoNo: 'Este archivo ya no está disponible. Puede que esté en la papelera.',
  // ReadOnlyBanner (components/nimbo, M-3 de la auditoría del #107): título por omisión «Tu cuenta está en solo lectura.»
  soloLectura: 'No puedes generar enlaces. Para hacerlo, renueva tu plan.',
};

// ---------- Piezas del diálogo de la 012b ----------
const encabezado = (nombre) => `
    <div class="sd-head">
      <h2 id="sd-t">Compartir «${nombre}»</h2>
      <p id="sd-d">Escribe el correo de una persona con cuenta en Nimbo y elige qué puede hacer.</p>
    </div>`;

// ShareForm (012b CA-2): correo, «Qué puede hacer» con Lector marcado y «Compartir». Radix pone el foco en el correo
// al abrir; en los estados de la sección el foco está en el control que dice cada uno.
const formularioCorreo = ({ autofoco = false } = {}) => `
    <form novalidate aria-label="Compartir con una persona">
      <div class="field">
        <label for="compartir-correo">Correo de la persona</label>
        <input class="input" id="compartir-correo" type="email" autocomplete="off" placeholder="nombre@dominio.com"${autofoco ? ' autofocus' : ''}>
      </div>
      <fieldset class="rg">
        <legend>Qué puede hacer</legend>
        <label for="nivel-viewer"><input id="nivel-viewer" type="radio" name="compartir-nivel" value="VIEWER" checked>Lector: ve y descarga</label>
        <label for="nivel-editor"><input id="nivel-editor" type="radio" name="compartir-nivel" value="EDITOR">Editor: también edita los .docx</label>
      </fieldset>
      <div><button class="btn btn-primary sd-submit" type="submit">Compartir</button></div>
    </form>`;

const nivelSelect = (p) => `<select class="lvl" aria-label="Nivel de ${p.nombre}">
            <option value="VIEWER"${p.nivel === 'VIEWER' ? ' selected' : ''}>Lector</option>
            <option value="EDITOR"${p.nivel === 'EDITOR' ? ' selected' : ''}>Editor</option>
          </select>`;

const filaPersona = (p) => `
        <li>
          <div class="person">
            <span class="pav" aria-hidden="true">${p.iniciales}</span>
            <div><p class="p-name">${p.nombre}</p><p class="p-sub">${p.correo}</p><p class="p-sub">Acceso directo</p></div>
          </div>
          <div class="row-act">
          ${nivelSelect(p)}
          <button class="icon-ghost" type="button" aria-label="Quitar acceso de ${p.nombre}">${icon('userMinus', 20)}</button>
          </div>
        </li>`;

const personas = () => `
    <section class="acc" aria-labelledby="personas-con-acceso">
      <h3 id="personas-con-acceso">Personas con acceso</h3>
      <ul>${PERSONAS.map(filaPersona).join('')}
      </ul>
    </section>`;

const cerrar = () => `
    <button class="sd-close" type="button" aria-label="Cerrar">${icon('x', 20)}</button>`;

// ---------- Piezas de la sección «Enlace público» ----------
const btn = (cls, texto, { ic = '', attrs = '' } = {}) =>
  `<button class="btn ${cls}" type="button"${attrs}>${ic ? icon(ic, 16) : ''}<span>${texto}</span></button>`;
const ocupado = (cls, texto, tipo = 'button') =>
  `<button class="btn ${cls} btn-busy" type="${tipo}" aria-disabled="true" aria-busy="true">${icon('loader', 16, 'spin')}<span>${texto}</span></button>`;
const anuncio = (texto) => `
      <p class="sr-only" role="status">${texto}</p>`;

// Alert con su acción (ShareErrorAlert en error; warning y success con role="status")
function alerta(tono, ic, texto, accion = '') {
  const rol = tono === 'error' ? 'alert' : 'status';
  return `
      <div class="alert alert-${tono}" role="${rol}">${icon(ic, 20)}<p class="alert-text">${texto}</p>${accion}</div>`;
}
const accionReintentar = () => btn('btn-outline btn-sm', 'Reintentar', { ic: 'retry' });
const accionActualizar = () => btn('btn-outline btn-sm', 'Actualizar', { ic: 'retry' });

const resumen = ({ vencido = false, contrasena = true } = {}) => {
  const badge = vencido
    ? `<span class="badge badge-neutral">${icon('clock', 14)}Vencido</span>`
    : `<span class="badge badge-success">${icon('check', 14)}Activo</span>`;
  const fechas = vencido ? VENCIDO : { vence: VENCE, creado: CREADO };
  return `
      <div class="pl-sum">${badge}
        <div class="pl-dates"><p class="meta"><span>${fechas.vence}</span><span aria-hidden="true">·</span><span>${contrasena ? 'Con contraseña' : 'Sin contraseña'}</span></p><p class="meta">${fechas.creado}</p></div>
      </div>`;
};

// «Vence en» (D-4, RadioGroup) y «Contraseña (opcional)» (PasswordField: new-password, nombre propio, ayuda de §5).
const OPCIONES = [[1, '1 día'], [7, '7 días'], [30, '30 días']];
function formularioEnlace({ dias = 7, contrasena = '', error = '', pendiente = false, enviar = 'Generar enlace', foco = '' } = {}) {
  const radios = OPCIONES.map(([d, t]) => `
          <label for="vence-${d}"><input id="vence-${d}" type="radio" name="enlace-vence" value="${d}"${d === dias ? ' checked' : ''}${d === dias && foco === 'vence' ? ' autofocus' : ''}>${t}</label>`).join('');
  const desc = error ? 'pl-pw-error pl-pw-hint' : 'pl-pw-hint';
  const inv = error ? ' aria-invalid="true" autofocus' : '';
  const valor = contrasena ? ` value="${contrasena}"` : '';
  const off = pendiente ? ' disabled' : '';
  return `
      <form novalidate aria-label="Nuevo enlace público">
        <fieldset class="rg">
          <legend>Vence en</legend>${radios}
        </fieldset>
        <div class="field">
          <label for="pl-pw">Contraseña (opcional)</label>
          <div class="pw">
            <input class="input" id="pl-pw" name="enlace-contrasena" type="password" autocomplete="new-password" maxlength="128" aria-describedby="${desc}"${valor}${inv}>
            <button class="pw-toggle" type="button" aria-label="Mostrar contraseña">${icon('eye', 16)}</button>
          </div>${error ? `
          <p class="field-error" id="pl-pw-error" role="alert">${icon('alert', 16)}<span>${error}</span></p>` : ''}
          <p class="hint" id="pl-pw-hint">${T.ayuda}</p>
        </div>
        <div class="pl-actions">
          ${pendiente ? ocupado('btn-primary', 'Generando…', 'submit') : `<button class="btn btn-primary" type="submit">${icon('link', 16)}<span>${enviar}</span></button>`}
          <button class="btn btn-outline" type="button"${off}>Cancelar</button>
        </div>
      </form>${pendiente ? anuncio('Generando…') : ''}`;
}

// La URL (RN-1): solo tras generar y mientras el diálogo siga abierto. copia: '' | 'ok' | 'fallo'.
function generado({ contrasena = false, copia = '' } = {}) {
  const boton = copia === 'ok'
    ? `<button class="btn btn-primary" type="button">${icon('check', 16)}<span>${T.copiado}</span></button>`
    : `<button class="btn btn-primary" type="button"${copia ? '' : ' autofocus'}>${icon('copy', 16)}<span>Copiar enlace</span></button>`;
  return `${alerta('success', 'ok', T.generado)}
      <div class="field">
        <label for="pl-url">Enlace generado</label>
        <div class="url-row">
          <input class="input" id="pl-url" type="text" readonly value="${URL_EJEMPLO}" aria-describedby="pl-url-meta"${copia === 'fallo' ? ' autofocus' : ''}>
          ${boton}
        </div>
        <p class="meta" id="pl-url-meta"><span>${VENCE}</span><span aria-hidden="true">·</span><span>${contrasena ? 'Con contraseña' : 'Sin contraseña'}</span></p>
      </div>${copia === 'ok' ? anuncio(T.copiado) : ''}${copia === 'fallo' ? alerta('error', 'alert', T.copiaFallida) : ''}`;
}

const sinEnlace = ({ foco = false } = {}) => `
      <p class="pl-desc">${T.descripcion}</p>
      <div class="pl-actions">${btn('btn-outline', 'Crear enlace público', { ic: 'link', attrs: foco ? ' autofocus' : '' })}</div>`;

const accionesEnlace = ({ soloLectura = false } = {}) => `
      <div class="pl-actions">${soloLectura ? '' : btn('btn-outline', 'Generar otro enlace', { ic: 'retry' })}${btn('btn-outline btn-outline-danger', 'Revocar enlace', { ic: 'linkOff' })}</div>`;

const conEnlace = ({ vencido = false, contrasena = true } = {}) =>
  resumen({ vencido, contrasena }) + (vencido ? '' : `
      <p class="pl-note">${T.nota}</p>`) + accionesEnlace();

function confirmarRevocar({ pendiente = false } = {}) {
  const off = pendiente ? ' disabled' : '';
  return `
      <div class="pl-confirm" role="group" aria-labelledby="pl-revocar-t">
        <p class="pl-confirm-text" id="pl-revocar-t">${T.revocar}</p>
        <div class="pl-actions">
          <button class="btn btn-outline" type="button"${off}${pendiente ? '' : ' autofocus'}>Cancelar</button>
          ${pendiente ? ocupado('btn-destructive', 'Revocando…') : btn('btn-destructive', 'Revocar enlace')}
        </div>
      </div>${pendiente ? anuncio('Revocando…') : ''}`;
}

const confirmarReemplazo = (form = {}) => `
      <div class="pl-replace">${alerta('warning', 'warn', T.reemplazo)}${formularioEnlace({ enviar: 'Generar otro enlace', ...form })}
      </div>`;

const seccion = (cuerpo, { ocupada = false } = {}) => `
    <section class="pl" aria-labelledby="enlace-publico-t"${ocupada ? ' aria-busy="true"' : ''}>
      <h3 id="enlace-publico-t">Enlace público</h3>${cuerpo}
    </section>`;

// ---------- Página ----------
function page(v) {
  const file = `compartir--${v.estado}.html`;
  const nombre = v.carpeta ? CARPETA : ARCHIVO;
  const html = `${M.cabecera({
    titulo: `Compartir · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 013c: sección «Enlace público» del diálogo «Compartir», CA-1 a CA-15). Estado: ${v.estado}.`,
      'El diálogo es el de la 012b (share-dialog.tsx); la URL y su token son de ejemplo, falsos.',
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/compartir/generar.js (marco, mis-archivos y carpetas). No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">013c</span> <strong>Compartir · Enlace público</strong> <span class="file">${file}</span> <span>diálogo sobre /archivos · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app" inert>
    ${C.sidebar({ activo: 'Mis archivos' })}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'] })}
      <main class="content" id="contenido">${C.encabezado(['Mis archivos'])}${C.tabla(FONDO, 'Mis archivos')}
      </main>
    </div>
  </div>
  <div class="layer">
  <div class="sd" role="dialog" aria-modal="true" aria-labelledby="sd-t" aria-describedby="sd-d">${encabezado(nombre)}${formularioCorreo({ autofoco: v.carpeta })}${personas()}${v.carpeta ? '' : seccion(v.cuerpo(), { ocupada: v.ocupada })}${cerrar()}
  </div>
  </div>
</div>
${v.js ? `
<script>${v.js}</script>
` : ''}
</body>
</html>
`;
  return C.conLogo(html);
}

// copia-fallida (CA-6): el texto del campo queda seleccionado para copiarlo a mano.
const JS_SELECCIONAR = `
  const url = document.getElementById('pl-url');
  url.focus();
  url.select();
`;

// ---------- Estados (spec 013c §6) ----------
const ESTADOS = [
  { estado: 'enlace-cargando', titulo: 'la sección pide GET /public-links (CA-1)', ocupada: true, cuerpo: () => `
      <p class="pl-loading" role="status">${icon('loader', 16, 'spin')}${T.cargando}</p>` },
  { estado: 'enlace-error-carga', titulo: 'red o 5xx al cargar: error con «Reintentar» en lugar del estado (CA-13)', cuerpo: () => alerta('error', 'alert', T.red, accionReintentar()) },
  { estado: 'enlace-sin-enlace', titulo: 'sin enlace: «Crear enlace público» (CA-1, D-2)', cuerpo: () => sinEnlace() },
  { estado: 'enlace-formulario', titulo: '«Vence en» con 7 días marcado y contraseña opcional vacía (CA-3, D-4)', cuerpo: () => formularioEnlace({ foco: 'vence' }) },
  { estado: 'enlace-formulario-con-contrasena', titulo: 'con contraseña escrita, válida (CA-3)', cuerpo: () => formularioEnlace({ dias: 30, contrasena: 'puente-azul-27' }) },
  { estado: 'enlace-contrasena-invalida', titulo: 'menos de 8 caracteres: error junto al campo, con el foco; conserva 30 días (CA-5)', cuerpo: () => formularioEnlace({ dias: 30, contrasena: 'abc12', error: T.contrasenaInvalida }) },
  { estado: 'enlace-generando', titulo: 'pasados 2 s: «Generando…» y anuncio (CA-3)', ocupada: true, cuerpo: () => formularioEnlace({ dias: 30, contrasena: 'puente-azul-27', pendiente: true }) },
  { estado: 'enlace-generado', titulo: 'URL una sola vez, «Copiar enlace» con el foco, vencimiento y contraseña (CA-3, RN-1)', cuerpo: () => generado() },
  { estado: 'enlace-copiado', titulo: '«Enlace copiado» anunciado y en el botón hasta la siguiente interacción (CA-6, D-9)', cuerpo: () => generado({ copia: 'ok' }) },
  { estado: 'enlace-copia-fallida', titulo: 'el navegador no deja copiar: aviso y texto del campo seleccionado (CA-6)', js: JS_SELECCIONAR, cuerpo: () => generado({ copia: 'fallo' }) },
  { estado: 'enlace-activo', titulo: 'activo: «Activo», fechas, contraseña y la nota; sin URL (CA-7)', cuerpo: () => conEnlace() },
  { estado: 'enlace-vencido', titulo: 'vencido: «Venció el …» con las mismas acciones (CA-7)', cuerpo: () => conEnlace({ vencido: true, contrasena: false }) },
  { estado: 'enlace-confirmar-reemplazo', titulo: '«Generar otro enlace»: advertencia en línea y formulario, sin otro diálogo (CA-8)', cuerpo: () => resumen() + confirmarReemplazo({ foco: 'vence' }) },
  { estado: 'enlace-reemplazando', titulo: 'reemplazo confirmado: «Generando…» (CA-8)', ocupada: true, cuerpo: () => resumen() + confirmarReemplazo({ pendiente: true }) },
  { estado: 'enlace-confirmar-revocar', titulo: '«Revocar enlace»: confirmación en línea con el foco en «Cancelar» (CA-9, D-1)', cuerpo: () => resumen() + confirmarRevocar() },
  { estado: 'enlace-revocando', titulo: 'pasados 2 s: «Revocando…» y anuncio (CA-9)', ocupada: true, cuerpo: () => resumen() + confirmarRevocar({ pendiente: true }) },
  { estado: 'enlace-revocado', titulo: 'revocado: aviso de éxito y vuelve a «sin enlace» (CA-9)', cuerpo: () => alerta('success', 'ok', T.revocado) + sinEnlace({ foco: true }) },
  { estado: 'enlace-error-red', titulo: 'red o 5xx al generar: error con «Reintentar», conserva lo elegido (CA-13)', cuerpo: () => formularioEnlace({ dias: 30, contrasena: 'puente-azul-27' }).replace('<div class="pl-actions">', alerta('error', 'alert', T.red, accionReintentar()).trim() + '\n        <div class="pl-actions">') },
  { estado: 'enlace-limite', titulo: '429 al generar: advertencia con la espera de la API, conserva lo elegido (CA-12)', cuerpo: () => formularioEnlace({ dias: 30, contrasena: 'puente-azul-27' }).replace('<div class="pl-actions">', alerta('warning', 'clock', T.limite).trim() + '\n        <div class="pl-actions">') },
  { estado: 'enlace-no-existe', titulo: '404 SHARING_LINK_NOT_FOUND al revocar: «Actualizar» vuelve a pedir el estado (CA-14)', cuerpo: () => alerta('error', 'alert', T.noExiste, accionActualizar()) + resumen() },
  { estado: 'enlace-archivo-no-encontrado', titulo: '404 STORAGE_NODE_NOT_FOUND: texto propio, sin botón (CA-14, D-8)', cuerpo: () => alerta('error', 'alert', T.archivoNo) },
  { estado: 'enlace-solo-lectura-sin-enlace', titulo: 'solo lectura sin enlace: ReadOnlyBanner con «Renovar plan», sin «Crear» (CA-10, D-6)', cuerpo: () => M.avisoSoloLectura({ cuerpo: T.soloLectura }) },
  { estado: 'enlace-solo-lectura-con-enlace', titulo: 'solo lectura con enlace: sin «Generar otro enlace»; «Revocar enlace» sigue (CA-10)', cuerpo: () => M.avisoSoloLectura({ cuerpo: T.soloLectura }) + resumen() + accionesEnlace({ soloLectura: true }) },
  { estado: 'carpeta', titulo: 'una carpeta: la sección no aparece y no se pide nada a la API de enlaces (CA-2)', carpeta: true },
];

for (const v of ESTADOS) {
  const file = `compartir--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
