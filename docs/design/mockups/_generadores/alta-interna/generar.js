// Genera los mockups autocontenidos de backoffice/alta-interna (spec 011: alta de cuenta interna), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco del área de administración (íconos, persona, barra lateral, barra superior, cajón, CSS común y página) viene
// de admin/area.js, el mismo de backoffice/admin. Aquí solo va el formulario de alta y sus estados.
const fs = require('node:fs');
const path = require('node:path');
const A = require('../admin/area.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/backoffice/alta-interna');
fs.mkdirSync(OUT, { recursive: true });

const { icon } = A;

// ---------- Datos de ejemplo (en la app los roles y los mensajes de conflicto vienen de la API) ----------
// Roles internos (product-context §2): nunca Cliente. Una línea por rol para ayudar a elegir.
const ROLES = [
  ['administrador', 'Administrador', 'shield', 'Gestiona cuentas, el catálogo de planes y las métricas.'],
  ['soporte', 'Soporte', 'headset', 'Consulta los metadatos de los archivos de los clientes para ayudarles.'],
  ['operador', 'Operador', 'server', 'Atiende la infraestructura y la operación del servicio.'],
];
const NUEVO = { nombre: 'Rodrigo Pérez', correo: 'rodrigo.perez@nimbo.gt', codigo: 'EMP-0142', rol: 'soporte' };
// Andrea Ruiz ya existe en la lista de backoffice/admin (Soporte, alta 28/09/2026).
const REPETIDO = { nombre: 'Andrea Ruiz', correo: 'andrea.ruiz@nimbo.gt', codigo: 'EMP-0118', rol: 'soporte' };

// ---------- CSS ----------
const CSS = A.CSS + `
  /* Propio de backoffice/alta-interna (spec 011: alta de cuenta interna) */
  .page-head { margin-top: 8px; }
  .form-card, .done { max-width: 720px; margin-top: 20px; }
  .req-note { margin: 0; font-size: 13px; color: var(--secondary-foreground); }

  /* Campos (Input de shadcn + Label): ayuda bajo la etiqueta y error bajo el control, con ícono y texto */
  .field { margin-top: 20px; }
  .field > label, .legend { display: block; margin: 0 0 4px; padding: 0; font-size: 13.5px; font-weight: 600; color: var(--foreground); }
  .field-help { margin: 0 0 8px; font-size: 13px; color: var(--secondary-foreground); }
  .text-input { width: 100%; max-width: 440px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .text-input.short { max-width: 220px; }
  .text-input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .text-input[aria-invalid="true"] { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .text-input[readonly] { background: var(--muted); color: var(--secondary-foreground); }
  .field-error { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 0; font-size: 13px; font-weight: 500; color: var(--destructive); }
  .field-error .ico { margin-top: 2px; }
  .field-error a { display: inline-flex; align-items: center; min-height: 24px; color: var(--destructive); }
  .field-error a:hover { color: var(--foreground); }

  /* Rol (RadioGroup de shadcn): opción entera clicable, radio de 24 px, seleccionada con borde, fondo y el punto del radio */
  .roles { margin: 20px 0 0; padding: 0; border: 0; min-width: 0; }
  .role-list { list-style: none; display: grid; gap: 8px; margin: 0; padding: 0; }
  .role { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); cursor: pointer; }
  .role:hover { background: var(--muted); }
  .role input { appearance: none; flex: none; width: 24px; height: 24px; margin: 0; border: 2px solid var(--input); border-radius: 999px; background: var(--card); cursor: pointer; }
  .role input:checked { border-color: var(--primary); background: radial-gradient(circle, var(--primary) 0 5px, var(--card) 5.5px); }
  .role input:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .role:has(input:checked) { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); background: var(--brand-soft); }
  .role:has(input[disabled]) { cursor: default; }
  .role:has(input[disabled]:not(:checked)) { background: var(--muted); }
  .role-body { display: grid; gap: 2px; min-width: 0; }
  .role-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--foreground); }
  .role-name .ico { color: var(--primary); }
  .role-desc { font-size: 13px; color: var(--secondary-foreground); }
  .roles.is-invalid .role { border-color: var(--destructive); }
  .role-note { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .role-note .ico { margin-top: 2px; color: var(--primary); }

  /* Contraseña por enlace y auditoría, justo antes de crear */
  .form-card .info-box { margin-top: 22px; }
  .audit-note { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .audit-note .ico { margin-top: 2px; }
  .form-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); }

  /* Resumen de errores (Alert destructivo): cuántos campos y enlaces a cada uno */
  .form-card .alert { margin: 0 0 16px; }
  .alert-error { border: 1px solid color-mix(in srgb, var(--destructive-soft) 60%, var(--card)); background: var(--destructive-tint); }
  .alert-error > .ico, .alert-error .alert-title { color: var(--destructive); }
  .alert-list { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--destructive); }
  .alert-list a { display: inline-flex; align-items: center; min-height: 24px; color: var(--destructive); font-weight: 500; }
  .alert-list a:hover { color: var(--foreground); }

  /* Éxito: la tarjeta reemplaza el formulario */
  .done-head { display: flex; align-items: flex-start; gap: 14px; }
  .done-mark { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--success) 45%, var(--card)); background: var(--success-soft); color: var(--success-foreground); }
  .done h2 { margin: 6px 0 0; font-size: 18px; line-height: 1.35; font-weight: 700; }
  .done-text { margin: 6px 0 0; font-size: 14.5px; color: var(--secondary-foreground); }
  .done-text strong { color: var(--foreground); font-weight: 600; overflow-wrap: anywhere; }
  .summary { display: grid; grid-template-columns: 170px minmax(0, 1fr); margin: 18px 0 0; }
  .summary dt, .summary dd { padding: 10px 0; border-top: 1px solid var(--border); font-size: 14px; }
  .summary dt { color: var(--secondary-foreground); }
  .summary dd { margin: 0; min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
  .next { list-style: none; display: grid; gap: 8px; margin: 16px 0 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--muted); }
  .next li { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--secondary-foreground); }
  .next .ico { margin-top: 2px; }

  @media (max-width: 600px) {
    .page-head { margin-top: 4px; }
    .form-card, .done { margin-top: 16px; }
    .text-input, .text-input.short { max-width: none; min-height: 44px; }
    .role { padding: 12px; }
    .form-actions { flex-direction: column; align-items: stretch; }
    .form-actions .btn { width: 100%; min-height: 44px; }
    .alert-list a { min-height: 32px; }
    .done-head { gap: 12px; }
    .done h2 { font-size: 17px; margin-top: 2px; }
    .summary { grid-template-columns: minmax(0, 1fr); }
    .summary dt { padding-bottom: 0; font-size: 13px; }
    .summary dd { border-top: 0; padding-top: 2px; }
  }
`;

// ---------- Piezas de la pantalla ----------
const volver = `
        <a class="back" href="../admin/admin.html">${icon('arrowLeft', 16)}Volver a cuentas</a>`;

const encabezado = `
        <div class="page-head">
          <div>
            <h1>Nueva cuenta interna</h1>
            <p>Crea una cuenta para alguien del equipo de Nimbo: Administración, Soporte u Operación.</p>
          </div>
        </div>`;

// Campo de texto. err: mensaje (HTML) o ''; ro: solo lectura mientras se envía.
function campo({ id, label, help, type = 'text', value = '', err = '', ro = false, extra = '', short = false }) {
  const desc = [`${id}-ayuda`, ...(err ? [`${id}-error`] : [])].join(' ');
  return `
          <div class="field">
            <label for="${id}">${label}</label>
            <p class="field-help" id="${id}-ayuda">${help}</p>
            <input class="text-input${short ? ' short' : ''}" id="${id}" name="${id}" type="${type}" value="${value}" required aria-describedby="${desc}"${err ? ' aria-invalid="true"' : ''}${ro ? ' readonly' : ''} ${extra}>${err ? `
            <p class="field-error" id="${id}-error">${icon('alert', 15)}<span>${err}</span></p>` : ''}
          </div>`;
}

function roles({ elegido = '', err = '', ro = false } = {}) {
  const opciones = ROLES.map(([val, nombre, ic, desc], i) => `
              <li><label class="role"><input type="radio" name="rol" value="${val}"${i === 0 ? ' required' : ''}${val === elegido ? ' checked' : ''}${ro ? ' disabled' : ''} aria-describedby="rol-${val}-d"><span class="role-body"><span class="role-name">${icon(ic, 16)}${nombre}</span><span class="role-desc" id="rol-${val}-d">${desc}</span></span></label></li>`).join('');
  const desc = ['rol-ayuda', 'rol-nota', ...(err ? ['rol-error'] : [])].join(' ');
  return `
          <fieldset class="roles${err ? ' is-invalid' : ''}" id="rol" aria-describedby="${desc}">
            <legend class="legend">Rol</legend>
            <p class="field-help" id="rol-ayuda">Define qué puede hacer. Cada persona tiene un solo rol y nunca el de Cliente.</p>
            <ul class="role-list">${opciones}
            </ul>${err ? `
            <p class="field-error" id="rol-error">${icon('alert', 15)}<span>${err}</span></p>` : ''}
            <p class="role-note" id="rol-nota">${icon('lock', 15)}<span>Ningún rol ve el contenido de los archivos de los clientes.</span></p>
          </fieldset>`;
}

function resumenErrores({ titulo, texto, items }) {
  return `
          <div class="alert alert-error" role="alert" tabindex="-1" id="errores">${icon('alert', 18)}<div><p class="alert-title">${titulo}</p><p class="alert-text">${texto}</p>
            <ul class="alert-list">${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ul></div></div>`;
}

// f: valores y errores del formulario
function formulario(f = {}) {
  const v = f.valores || {};
  const e = f.errores || {};
  const ro = !!f.enviando;
  const boton = ro
    ? `<button class="btn btn-primary btn-busy" type="submit" disabled aria-disabled="true">${icon('loader', 16, 'spin')}Creando cuenta…</button>`
    : `<button class="btn btn-primary" type="submit">${icon('userPlus', 16)}Crear cuenta</button>`;
  return `
        <form class="card form-card" aria-labelledby="form-t" novalidate onsubmit="return false"${ro ? ' aria-busy="true"' : ''}>
          <h2 id="form-t" class="sr-only">Datos de la cuenta interna</h2>${f.resumen ? resumenErrores(f.resumen) : ''}
          <p class="req-note">Todos los campos son obligatorios.</p>${campo({
    id: 'nombre', label: 'Nombre completo', help: 'Así aparecerá en la auditoría que ven los clientes cuando actúe sobre su cuenta.',
    value: v.nombre || '', err: e.nombre, ro, extra: 'autocomplete="off"',
  })}${campo({
    id: 'correo', label: 'Correo', help: 'Le enviaremos aquí el enlace para fijar su contraseña.', type: 'email',
    value: v.correo || '', err: e.correo, ro, extra: 'autocomplete="off" autocapitalize="none" spellcheck="false"',
  })}${campo({
    id: 'codigo', label: 'Código de empleado', help: 'Debe ser único entre las cuentas internas, por ejemplo EMP-0142.',
    value: v.codigo || '', err: e.codigo, ro, short: true, extra: 'autocomplete="off" autocapitalize="characters" spellcheck="false"',
  })}${roles({ elegido: v.rol, err: e.rol, ro })}
          <div class="info-box">${icon('key', 16)}<p><strong>No hay contraseña que definir.</strong>Le enviaremos un enlace de un solo uso para que la fije. Tú nunca la conoces.</p></div>
          <p class="audit-note">${icon('history', 15)}<span>El alta queda en la auditoría con tu nombre y rol.</span></p>
          <div class="form-actions">
            ${boton}${ro ? '' : `
            <a class="btn btn-outline" href="../admin/admin.html">Cancelar</a>`}
          </div>${ro ? `
          <p class="sr-only" role="status">Creando la cuenta de ${v.nombre}…</p>` : ''}
        </form>`;
}

function exito(n) {
  const rol = ROLES.find(([val]) => val === n.rol)[1];
  return `
        <section class="card done" aria-labelledby="ok-t">
          <div class="done-head" role="status">
            <span class="done-mark">${icon('ok', 22)}</span>
            <div>
              <h2 id="ok-t" tabindex="-1">Creamos la cuenta de ${n.nombre}.</h2>
              <p class="done-text">Le enviamos un enlace a <strong>${n.correo}</strong> para que fije su contraseña.</p>
            </div>
          </div>
          <dl class="summary">
            <dt>Nombre</dt><dd>${n.nombre}</dd>
            <dt>Correo</dt><dd>${n.correo}</dd>
            <dt>Rol</dt><dd>${rol}</dd>
            <dt>Código de empleado</dt><dd class="num">${n.codigo}</dd>
          </dl>
          <ul class="next">
            <li>${icon('mail', 16)}<span>El enlace es de un solo uso. Podrá iniciar sesión cuando fije su contraseña.</span></li>
            <li>${icon('history', 16)}<span>El alta quedó en la auditoría con tu nombre y rol.</span></li>
          </ul>
          <div class="form-actions">
            <a class="btn btn-primary" href="../admin/admin.html">${icon('arrowLeft', 16)}<span>Volver a cuentas</span></a>
            <a class="btn btn-outline" href="alta-interna.html">${icon('userPlus', 16)}<span>Crear otra cuenta</span></a>
          </div>
        </section>`;
}

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'default', titulo: 'formulario vacío, sin rol elegido',
    cuerpo: () => volver + encabezado + formulario() },
  { estado: 'error-campos', titulo: 'validación: nombre vacío, correo inválido y rol sin elegir; no se envió nada',
    cuerpo: () => volver + encabezado + formulario({
      valores: { correo: 'rodrigo.perez.nimbo.gt', codigo: NUEVO.codigo },
      errores: {
        nombre: 'Escribe el nombre completo de la persona.',
        correo: 'Escribe un correo válido, por ejemplo rodrigo.perez@nimbo.gt.',
        rol: 'Elige el rol de la cuenta.',
      },
      resumen: {
        titulo: 'Revisa 3 campos para crear la cuenta.',
        texto: 'Todavía no creamos nada.',
        items: [['nombre', 'Escribe el nombre completo'], ['correo', 'Escribe un correo válido'], ['rol', 'Elige el rol']],
      },
    }) },
  { estado: 'error-conflicto', titulo: 'el servidor rechaza: correo ya registrado y código de empleado repetido (CA-6)',
    cuerpo: () => volver + encabezado + formulario({
      valores: REPETIDO,
      errores: {
        correo: `Ya existe una cuenta con este correo y una persona solo puede tener una. Usa otro correo o <a href="../admin/admin.html">busca la cuenta en Cuentas</a>.`,
        codigo: `El código ${REPETIDO.codigo} ya pertenece a otra cuenta interna. Revisa el código: cada persona tiene uno distinto.`,
      },
      resumen: {
        titulo: 'No creamos la cuenta: el correo y el código ya están en uso.',
        texto: 'Nada cambió. Corrige los campos marcados y vuelve a intentarlo.',
        items: [['correo', 'Usa otro correo'], ['codigo', 'Revisa el código de empleado']],
      },
    }) },
  { estado: 'enviando', titulo: 'creando la cuenta: botón ocupado y campos de solo lectura (evita el doble envío)',
    cuerpo: () => volver + encabezado + formulario({ valores: NUEVO, enviando: true }) },
  { estado: 'exito', titulo: 'cuenta creada y enlace enviado, con «Volver a cuentas» y «Crear otra cuenta»',
    cuerpo: () => volver + encabezado + exito(NUEVO) },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'alta-interna.html' : `alta-interna--${v.estado}.html`;
  const html = A.pagina({
    titulo: `Nueva cuenta interna · Administración · Nimbo — ${v.estado}`,
    comentarios: [
      `Mockup de referencia (spec 011: administración, alta de cuenta interna). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/alta-interna/generar.js (marco del área en admin/area.js y CSS del marco en marco/marco.js). No editar a mano.',
    ],
    css: CSS,
    rotulo: 'Nueva cuenta interna',
    file,
    estado: v.titulo,
    crumbs: ['Administración', 'Cuentas', 'Nueva cuenta interna'],
    cuerpo: v.cuerpo(),
  });
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  console.log(file);
}
