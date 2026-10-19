// Genera los estados de editing/editor (spec 016): editor .docx con la lista de participantes en vivo.
// Uso: node generar.js <ruta-del-worktree>
// Tokens, botones y avisos: marco/css-marco.js, marco/marco.js (EXTRA) y mis-archivos/estados.js (Alert, error).
// editor--editando.html es el paquete de la propuesta (con atribución por párrafo, firma y sugerencias del agente,
// fuera de alcance) y no se genera: el estado «editando» corregido es editor--coeditando.html.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const E = require('../mis-archivos/estados.js');
const S = require('../mis-archivos/mis-archivos.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/editing/editor');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos (Lucide) ----------
const P = {
  ...S.P,
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cloudoff: '<path d="m2 2 20 20"/><path d="M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.2"/><path d="M21.53 16.05A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07"/>',
  filebig: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
};
const icon = S.crearIcon(P);

// ---------- Datos de ejemplo (en la app vienen de la API: archivo, versión vigente, plan de la cuenta propietaria) ----------
// Límite de editores del plan de la cuenta propietaria (IPlanLimitsProvider): Equipo 5. Nunca escrito en el frontend.
const ARCHIVO = { nombre: 'Propuesta_comercial_2027.docx', version: 12, guardada: 'hoy, 10:42', tam: '1.8 MB' };
const LIMITE = 5;
// Anillo: la secuencia de participantes (DF-46) con los 5 tonos que ya son tokens; quien solo ve lleva anillo neutro (input)
const PERSONAS = {
  lucia: { nombre: 'Lucía Barrios', ini: 'LB', anillo: 'brand' },
  mario: { nombre: 'Mario Gómez', ini: 'MG', anillo: 'live' },
  julia: { nombre: 'Julia Cifuentes', ini: 'JC', anillo: 'success' },
  sofia: { nombre: 'Sofía Ramírez', ini: 'SR', anillo: 'warning' },
  andres: { nombre: 'Andrés Pineda', ini: 'AP', anillo: 'destructive-soft' },
  diego: { nombre: 'Diego Morales', ini: 'DM', anillo: 'brand' },
};

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.EXTRA + E.CSS_ESTADOS + E.CSS_ALERT_WARN + `
  /* Propio de editing/editor (spec 016) */
  :root {
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --live: #7EC8D8;
  }
  .ed { display: flex; flex-direction: column; min-height: 860px; }

  /* Barra del editor: volver, archivo, modo, participantes y acciones (sin la barra lateral: pantalla de trabajo) */
  .ed-bar { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; padding: 10px 20px; background: var(--card); border-bottom: 1px solid var(--border); }
  .ed-file { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
  .ed-file .icon-btn { flex: none; }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: none; border-radius: 8px; color: var(--file-docx); background: var(--file-docx-bg); }
  .ed-name { min-width: 0; }
  .ed-name h1 { margin: 0; font-size: 15.5px; line-height: 1.35; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ed-name p { margin: 0; font-size: 12.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .mode-movil { display: none; }
  .ed-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  /* StatusBadge del modo: ícono + etiqueta (nunca solo color) */
  .mode { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .mode-edit { color: var(--primary-hover); background: var(--brand-soft); }
  .mode-read { color: var(--secondary-foreground); background: var(--muted); box-shadow: inset 0 0 0 1px var(--border); }

  /* PresenceStack + conteo frente al límite (botón: en móvil abre la lista) */
  .presence { display: inline-flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 12px 4px 6px; border: 1px solid var(--input); border-radius: 999px; background: var(--card); color: var(--foreground); font: inherit; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
  .presence:hover { background: var(--muted); }
  .stack { display: inline-flex; }
  .stack { gap: 6px; padding: 0 2px; }
  .av { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: none; border-radius: 999px; background: var(--card); color: var(--foreground); font-size: 10.5px; font-weight: 700; box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--input); }
  .av-lg { width: 32px; height: 32px; font-size: 11px; }
  .ring-brand { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--brand); }
  .ring-live { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--live); }
  .ring-success { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--success); }
  .ring-warning { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--warning); }
  .ring-destructive-soft { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--destructive-soft); }
  .ring-view { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--input); }

  /* Cuerpo: editor incrustado + panel de participantes */
  .ed-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 280px; min-height: 0; }
  .ed-main { min-width: 0; display: flex; flex-direction: column; }
  .ed-main > .alert, .ed-main > .readonly { margin: 16px 20px 0; }
  .readonly { margin-bottom: 0; }

  /* Representación del editor de ONLYOFFICE (iframe). Su barra y su presencia nativa son del servicio, no de Nimbo */
  .oo { flex: 1; display: flex; flex-direction: column; margin: 16px 20px 20px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--muted); overflow: hidden; }
  .oo-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; background: var(--card); border-bottom: 1px solid var(--border); }
  .oo-bar i { display: block; height: 22px; border-radius: 6px; background: var(--muted); box-shadow: inset 0 0 0 1px var(--border); }
  .oo-bar i.w1 { width: 22px; } .oo-bar i.w2 { width: 96px; } .oo-bar i.w3 { width: 140px; }
  .oo-bar .gap { width: 1px; height: 22px; background: var(--border); }
  .oo-bar .oo-label { margin-left: auto; font-size: 11.5px; color: var(--muted-foreground); }
  .oo-page { position: relative; width: min(680px, calc(100% - 40px)); margin: 24px auto; padding: 48px 56px 64px; background: var(--card); box-shadow: var(--shadow-card); border-radius: 4px; }
  .oo-page h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
  .oo-page .sub { margin: 0 0 22px; font-size: 12.5px; color: var(--muted-foreground); }
  .oo-page h3 { margin: 22px 0 8px; font-size: 15px; font-weight: 600; color: var(--primary); }
  .oo-page p { margin: 0 0 12px; font-size: 13.5px; line-height: 1.7; color: var(--foreground); }
  .oo-page table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  .oo-page td:last-child, .oo-page th:last-child { white-space: nowrap; text-align: right; }
  .oo-page th, .oo-page td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); }
  .oo-page th { font-weight: 600; color: var(--secondary-foreground); }
  /* Cursor nativo de ONLYOFFICE (ilustración: el servicio pinta los suyos) */
  .caret { position: relative; display: inline-block; width: 2px; height: 18px; margin: 0 1px; vertical-align: -4px; background: var(--live); }
  .caret span { position: absolute; bottom: 100%; left: 0; padding: 1px 6px; border-radius: 4px 4px 4px 0; background: var(--live); color: var(--foreground); font-size: 10.5px; font-weight: 600; white-space: nowrap; }

  /* Panel de participantes (lista en vivo de Nimbo, RF-26) */
  .people { display: flex; flex-direction: column; gap: 14px; padding: 18px 18px 20px; background: var(--card); border-left: 1px solid var(--border); }
  .people h2 { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-foreground); }
  .count { margin: 0; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .count-meter { display: flex; gap: 4px; margin-top: 8px; }
  .count-meter span { flex: 1; height: 6px; border-radius: 999px; background: var(--muted); box-shadow: inset 0 0 0 1px var(--input); }
  .count-meter span.on { background: var(--primary); box-shadow: none; }
  .count-note { margin: 6px 0 0; font-size: 12.5px; color: var(--muted-foreground); }
  .count-full { color: var(--warning-foreground); font-weight: 600; }
  .plist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .plist li { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 4px; }
  .plist .who { min-width: 0; }
  .plist .who strong { display: block; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plist .who span { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--muted-foreground); }
  .plist-sep { margin: 6px 0 0; font-size: 12px; font-weight: 600; color: var(--muted-foreground); }
  .people-foot { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border); font-size: 12.5px; line-height: 1.55; color: var(--secondary-foreground); }
  .people-foot .ico { vertical-align: -3px; margin-right: 4px; color: var(--muted-foreground); }

  /* Cargando y no disponible */
  .oo-skel { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 24px 20px; }
  .oo-skel .sk-page { width: min(680px, 100%); padding: 48px 56px; background: var(--card); border-radius: 4px; box-shadow: var(--shadow-card); display: grid; gap: 14px; }
  .oo-skel .skeleton-line.h { height: 18px; }
  .ed-main > .state-error { margin: 20px; flex: 1; min-height: 360px; }
  .state-error .err-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .state-error .err-actions .btn { margin: 0; }
  .alert-actions .btn-primary { min-height: 36px; }
  .alert-text .tn { font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Escritorio: el botón de participantes no despliega nada (la lista está siempre a la derecha) */
  @media (min-width: 901px) { .presence { cursor: default; } .presence .chev { display: none; } }

  @media (max-width: 900px) {
    .ed { min-height: 0; }
    .ed-bar { padding: 8px 12px; }
    .ed-body { grid-template-columns: minmax(0, 1fr); }
    .people:not(.movil-abierto) { display: none; }
    .people { order: -1; border-left: 0; border-bottom: 1px solid var(--border); padding: 14px 16px; }
    .people-foot { margin-top: 0; }
    .presence { min-height: 44px; }
  }
  @media (max-width: 600px) {
${M.CSS.MQ600_MARCO}${E.CSS_ESTADOS_MQ600}    .ed-tools { width: 100%; }
    .ed-tools .btn-label { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
    .ed-tools .btn { min-width: 44px; min-height: 44px; padding: 8px 10px; }
    .ed-tools { flex-wrap: nowrap; }
    .ed-tools > .mode { display: none; }
    .mode-movil { display: block; margin: 4px 0 0 !important; }
    .ed-tools .presence { margin-right: auto; padding: 4px 10px 4px 12px; }
    .ed-tools .presence .stack { display: none; }
    .ed-main > .alert, .ed-main > .readonly { margin: 12px 12px 0; }
    .oo { margin: 12px; }
    .oo-bar i.w3, .oo-bar .oo-label { display: none; }
    .oo-page { width: calc(100% - 16px); margin: 8px auto 16px; padding: 24px 18px 32px; }
    .oo-page h2 { font-size: 17px; }
    .oo-skel .sk-page { padding: 24px 18px; }
    .ed-main > .state-error { margin: 12px; }
    .state-error .err-actions { flex-direction: column; width: 100%; }
    .alert-actions .btn-primary { flex: 1; min-height: 44px; }
  }
`;

// ---------- Piezas ----------
const av = (p, { lg = false, vista = false } = {}) =>
  `<span class="av${lg ? ' av-lg' : ''} ${vista ? 'ring-view' : `ring-${p.anillo}`}" aria-hidden="true">${p.ini}</span>`;

function modo(edita) {
  return edita
    ? `<span class="mode mode-edit">${icon('pencil', 14)}Editando</span>`
    : `<span class="mode mode-read">${icon('eye', 14)}Solo lectura</span>`;
}

// Botón de presencia: pila de editores + «N de L editores» (o el texto que corresponda si el plan no edita)
function presencia(v) {
  const editores = v.gente.filter((g) => g.edita);
  const pila = editores.slice(0, 3).map((g) => av(g.p)).join('');
  const resto = editores.length > 3 ? `<span class="av" aria-hidden="true">+${editores.length - 3}</span>` : '';
  const n = v.gente.length;
  const texto = v.limite ? `${editores.length} de ${v.limite} editores` : `${n} ${n === 1 ? 'persona' : 'personas'}`;
  return `<button class="presence" type="button" aria-controls="participantes" aria-expanded="${v.movilAbierto ? 'true' : 'false'}">
            ${pila ? `<span class="stack">${pila}${resto}</span>` : ''}<span><span class="sr-only">Participantes: </span>${texto}</span>${icon('chevron', 16, 'chev')}
          </button>`;
}

function barra(v) {
  const tools = v.sinEditor ? '' : `${modo(v.edita)}
          ${presencia(v)}`;
  const compartir = v.esPropietario ? `<button class="btn btn-outline btn-sm" type="button">${icon('share', 16)}<span class="btn-label">Compartir</span></button>` : '';
  return `
    <header class="ed-bar">
      <div class="ed-file">
        <a class="icon-btn" href="#" aria-label="Volver a Mis archivos">${icon('back', 20)}</a>
        <span class="ftile">${icon('file', 16)}</span>
        <div class="ed-name">
          <h1>${ARCHIVO.nombre}</h1>
          <p>${v.meta || `Versión ${ARCHIVO.version} · guardada ${ARCHIVO.guardada}`}</p>${v.sinEditor ? '' : `
          <p class="mode-movil">${modo(v.edita)}</p>`}
        </div>
      </div>
      <div class="ed-tools">
          ${tools}
          ${compartir}
          <button class="btn btn-outline btn-sm" type="button">${icon('download', 16)}<span class="btn-label">Descargar</span></button>
      </div>
    </header>`;
}

function persona(g) {
  const tu = g.tu ? ' (tú)' : '';
  const rol = g.edita ? `${icon('pencil', 13)}Editando` : `${icon('eye', 13)}Solo ve${g.nota ? ` · ${g.nota}` : ''}`;
  return `
          <li>${av(g.p, { lg: true, vista: !g.edita })}<div class="who"><strong>${g.p.nombre}${tu}</strong><span>${rol}</span></div></li>`;
}

function conteo(v) {
  if (!v.limite) return `<p class="count">${v.conteoTexto}</p>`;
  const n = v.gente.filter((g) => g.edita).length;
  const marcas = Array.from({ length: v.limite }, (_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('');
  const nota = n >= v.limite
    ? `<p class="count-note count-full">${icon('alert', 13)} Límite del plan alcanzado</p>`
    : `<p class="count-note">Quedan ${v.limite - n} lugares para editar a la vez</p>`;
  return `<p class="count">${n} de ${v.limite} editores</p>
          <div class="count-meter" aria-hidden="true">${marcas}</div>
          ${nota}`;
}

function panel(v) {
  const editores = v.gente.filter((g) => g.edita);
  const lectores = v.gente.filter((g) => !g.edita);
  const lista = (gs) => `<ul class="plist">${gs.map(persona).join('')}
          </ul>`;
  return `
    <aside class="people${v.movilAbierto ? ' movil-abierto' : ''}" id="participantes" aria-labelledby="participantes-t">
      <div>
        <h2 id="participantes-t">En este documento</h2>
        <div role="status" aria-live="polite">
          ${conteo(v)}
        </div>
      </div>
      ${editores.length ? lista(editores) : ''}${lectores.length ? `
      <p class="plist-sep">Solo ven (no cuentan para el límite)</p>
      ${lista(lectores)}` : ''}
      <p class="people-foot">${icon('history', 15)}${v.pie || 'Cuando todos cierren el documento, guardaremos una versión nueva con quienes participaron.'}</p>
    </aside>`;
}

// Página del documento dentro del editor de ONLYOFFICE; cursor: presencia nativa del servicio (solo al coeditar)
function documento(v) {
  const cursor = v.cursor ? `<span class="caret" aria-hidden="true"><span>${v.cursor}</span></span>` : '';
  const herramientas = v.edita
    ? '<i class="w2"></i><i class="w1"></i><i class="w1"></i><i class="w1"></i><span class="gap"></span><i class="w3"></i><i class="w1"></i><i class="w1"></i><span class="gap"></span><i class="w2"></i>'
    : '<i class="w2"></i><span class="gap"></span><i class="w1"></i><i class="w1"></i>';
  return `
      <section class="oo" aria-label="Documento ${ARCHIVO.nombre}${v.edita ? '' : ', solo lectura'}">
        <div class="oo-bar" aria-hidden="true">${herramientas}<span class="oo-label">Editor de ONLYOFFICE</span></div>
        <article class="oo-page">
          <h2>Propuesta comercial 2027</h2>
          <p class="sub">Distribuidora La Ceiba · Preparada por Lucía Barrios</p>
          <h3>1. Objetivo</h3>
          <p>Proponemos${cursor} migrar los expedientes de clientes a Nimbo para que el equipo de ventas edite las cotizaciones en línea y conserve el historial de cada cambio.</p>
          <h3>2. Inversión anual</h3>
          <table>
            <thead><tr><th scope="col">Concepto</th><th scope="col">Monto</th></tr></thead>
            <tbody>
              <tr><td>Plan Equipo (12 meses, 10 personas)</td><td>Q 4,788.00</td></tr>
              <tr><td>Capacitación inicial</td><td>Q 1,200.00</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>Q 5,988.00</strong></td></tr>
            </tbody>
          </table>
          <h3>3. Próximos pasos</h3>
          <p>Validar el presupuesto con gerencia antes del 30 de octubre y programar la capacitación de la primera semana de noviembre.</p>
        </article>
      </section>`;
}

function cargando() {
  return `
      <div class="oo-skel" aria-busy="true">
        <div class="sk-page" aria-hidden="true"><span class="skeleton-line h w45"></span><span class="skeleton-line w30"></span><span class="skeleton-line w70"></span><span class="skeleton-line w60"></span><span class="skeleton-line w70"></span><span class="skeleton-line w55"></span><span class="skeleton-line w40"></span></div>
        <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Abriendo el editor…</p>
      </div>`;
}

function noDisponible() {
  return `
      <div class="state-error" role="alert">
        ${icon('cloudoff', 40)}
        <h2>El editor no está disponible</h2>
        <p>Tus archivos siguen a salvo. Puedes descargar este documento, compartirlo o seguir usando el resto de Nimbo mientras lo resolvemos. Vuelve a intentarlo en unos minutos.</p>
        <div class="err-actions">
          <button class="btn btn-primary" type="button">${icon('retry', 16)}Reintentar</button>
          <a class="btn btn-outline" href="#">Volver a Mis archivos</a>
        </div>
      </div>`;
}

// Aviso arriba del documento: Alert (info / warning / error) con acción opcional; persistente (sin «Cerrar»)
function aviso({ tono, ic, titulo, texto, accion = '', accionIc = '' }) {
  // Suscripción vencida: el mismo ReadOnlyBanner de shared/layout (RF-23), con «Renovar plan»
  if (tono === 'readonly') return `
      <div class="readonly" role="status">
        ${icon(ic, 20)}
        <p class="readonly-text"><strong>${titulo}</strong>${texto}</p>
        <a class="btn btn-primary btn-sm" href="#">${accion}</a>
      </div>`;
  const rol = tono === 'error' ? 'alert' : 'status';
  const btn = accion ? `
          <div class="alert-actions"><button class="btn ${tono === 'error' ? 'btn-primary' : 'btn-outline'} btn-sm" type="button">${accionIc ? icon(accionIc, 14) : ''}<span>${accion}</span></button></div>` : '';
  return `
      <div class="alert alert-${tono}" role="${rol}">
        ${icon(ic, 18)}
        <div class="alert-body">
          <p class="alert-title">${titulo}</p>
          <p class="alert-text">${texto}</p>
        </div>${btn}
      </div>`;
}

// ---------- Página ----------
function page(v) {
  const file = `editor--${v.estado}.html`;
  const cuerpo = v.cuerpo ? v.cuerpo() : `${v.aviso ? aviso(v.aviso) : ''}${documento(v)}`;
  return `${M.cabecera({
    titulo: `${ARCHIVO.nombre} · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 016: edición colaborativa de .docx). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo (PresenceStack, StatusBadge, Alert, StateView).',
      'Generado con _generadores/editor/generar.js. No editar a mano.',
    ],
    css: CSS + CSS_INFO,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">016</span> <strong>Editor .docx</strong> <span class="file">${file}</span> <span>${v.titulo}</span></aside>

<div class="canvas">
  <div class="ed">${barra(v)}
    <div class="ed-body"${v.sinEditor ? ' style="grid-template-columns: minmax(0, 1fr)"' : ''}>
      <main class="ed-main" id="contenido">${cuerpo}
      </main>${v.sinEditor ? '' : panel(v)}
    </div>
  </div>
</div>
${JS}
</body>
</html>
`;
}

// Variantes de Alert que este mockup agrega al CSS común: info (role=status) y error con el botón primario
const CSS_INFO = `
  .alert.alert-info { border-color: var(--border); background: var(--card); align-items: center; }
  .alert.alert-info > .ico { margin-top: 0; color: var(--primary); }
  .alert.alert-info .alert-title { color: var(--foreground); }
  .alert.alert-error { align-items: center; }
  .alert.alert-error > .ico { margin-top: 0; }
  .alert { padding-right: 12px; }
  @media (max-width: 600px) { .alert { padding: 12px; } .alert-actions { width: 100%; padding-left: 30px; } }
`;

// Abre y cierra la lista de participantes en móvil (en escritorio siempre está visible)
const JS = `<script>
(function () {
  var b = document.querySelector('.presence'), p = document.getElementById('participantes');
  if (!b || !p) return;
  var mq = window.matchMedia('(min-width: 901px)');
  // En escritorio la lista siempre está visible: el botón no despliega nada y no lleva aria-expanded
  function sincronizar() { if (mq.matches) b.removeAttribute('aria-expanded'); else b.setAttribute('aria-expanded', String(p.classList.contains('movil-abierto'))); }
  b.addEventListener('click', function () { if (mq.matches) return; p.classList.toggle('movil-abierto'); sincronizar(); });
  mq.addEventListener('change', sincronizar); sincronizar();
})();
</script>`;

// ---------- Estados ----------
const { lucia, mario, julia, sofia, andres, diego } = PERSONAS;
const ed = (p, extra = {}) => ({ p, edita: true, ...extra });
const ve = (p, extra = {}) => ({ p, edita: false, ...extra });

const ESTADOS = [
  {
    estado: 'coeditando', titulo: 'editando con 2 personas más (3 de 5 editores, plan Equipo)', edita: true, esPropietario: true,
    limite: LIMITE, movilAbierto: true, cursor: 'Mario G.',
    gente: [ed(lucia, { tu: true }), ed(mario), ed(julia)],
  },
  {
    estado: 'cargando', titulo: 'abriendo el editor (esqueleto y estado con texto)', edita: true, esPropietario: true,
    limite: LIMITE, gente: [ed(lucia, { tu: true })], cuerpo: cargando,
  },
  {
    estado: 'limite-editores', titulo: 'hay 5 editores: entras en solo lectura y no cuentas para el límite (EDITING_LIMIT_REACHED)',
    edita: false, limite: LIMITE, cursor: 'Mario G.',
    gente: [ed(lucia), ed(mario), ed(julia), ed(sofia), ed(andres), ve(diego, { tu: true })],
    aviso: {
      tono: 'warn', ic: 'users', titulo: 'Hay 5 editores; entra en solo lectura o inténtalo en unos minutos',
      texto: 'El plan de este documento permite 5 personas editando a la vez. Lo abrimos en solo lectura para que puedas leerlo; cuando alguien salga, pulsa «Intentar editar».',
      accion: 'Intentar editar', accionIc: 'pencil',
    },
  },
  {
    // Al volver a abrir el documento: se ve la versión vigente sin sesión; la sesión nueva empieza con el botón (CA-14)
    estado: 'guardado-fallido', titulo: 'la sesión anterior no se guardó; al volver a abrirlo, la versión vigente no cambió (CA-14)',
    edita: false, esPropietario: true, sinEditor: true, gente: [],
    aviso: {
      tono: 'error', ic: 'alert', titulo: 'No pudimos guardar tus cambios',
      texto: 'Los cambios de la sesión de hoy, 11:05 a 11:40, no se guardaron. El documento sigue en la <span class="tn">versión 12</span>, guardada <span class="tn">hoy, 10:42</span>. Abre el editor de nuevo para seguir desde esa versión.',
      accion: 'Abrir el editor de nuevo', accionIc: 'pencil',
    },
  },
  {
    estado: 'solo-lectura-lector', titulo: 'solo lectura: tienes acceso de lector (CA-3)', edita: false,
    limite: LIMITE, cursor: 'Lucía B.', meta: `Versión ${ARCHIVO.version} · de Lucía Barrios`,
    gente: [ed(lucia), ve(diego, { tu: true })],
    aviso: {
      tono: 'info', ic: 'eye', titulo: 'Puedes ver este documento, pero no editarlo',
      texto: 'Lucía Barrios te lo compartió como lector. Si necesitas cambiarlo, pídele acceso de editor.',
    },
  },
  {
    estado: 'solo-lectura-plan', titulo: 'solo lectura: el plan Personal no incluye edición (EDITING_PLAN_READ_ONLY)', edita: false, esPropietario: true,
    limite: 0, conteoTexto: 'Tu plan no incluye edición',
    gente: [ve(lucia, { tu: true })], pie: 'Con un plan con edición, cada sesión guarda una versión nueva con quienes participaron.',
    aviso: {
      tono: 'warn', ic: 'lock', titulo: 'Tu plan no incluye edición',
      texto: 'Con el plan Personal puedes ver tus documentos. Para editarlos en línea, y con otras personas, cambia a un plan con edición.',
      accion: 'Ver planes', accionIc: '',
    },
  },
  {
    // Coeditor de otra cuenta (alcanzable con 012): no se dice si el plan es Personal o venció (es de otra cuenta)
    estado: 'solo-lectura-plan-propietario', titulo: 'solo lectura: el plan de la cuenta propietaria no incluye edición (EDITING_PLAN_READ_ONLY, coeditor)',
    edita: false, limite: 0, conteoTexto: 'Edición no disponible', meta: `Versión ${ARCHIVO.version} · de Lucía Barrios`,
    gente: [ve(diego, { tu: true })], pie: 'Cuando la cuenta propietaria tenga un plan con edición, podrás editarlo aquí.',
    aviso: {
      tono: 'warn', ic: 'lock', titulo: 'El plan de la cuenta propietaria no incluye edición',
      texto: 'Lucía Barrios te compartió este documento como editor, pero el plan de su cuenta no permite editar en línea. Puedes leerlo y descargarlo.',
    },
  },
  {
    estado: 'solo-lectura-vencida', titulo: 'solo lectura: la suscripción venció (EDITING_PLAN_READ_ONLY, RF-23)', edita: false,
    limite: 0, conteoTexto: 'Edición en pausa',
    gente: [ve(lucia, { tu: true })], pie: 'Al renovar, vuelves a editar con el límite de tu plan.',
    aviso: {
      tono: 'readonly', ic: 'lock', titulo: 'Tu suscripción venció; tus archivos están en solo lectura',
      texto: 'Nada se borró. Renueva tu plan para volver a editar este documento.',
      accion: 'Renovar plan', accionIc: '',
    },
  },
  {
    estado: 'solo-lectura-tamano', titulo: 'solo lectura: el archivo supera el tamaño editable (EDITING_FILE_TOO_LARGE)', edita: false, esPropietario: true,
    limite: 0, conteoTexto: 'No se puede editar en línea', meta: `Versión ${ARCHIVO.version} · 68 MB`,
    gente: [ve(lucia, { tu: true })], pie: 'Puedes descargarlo, editarlo en tu equipo y subirlo de nuevo como versión nueva.',
    aviso: {
      tono: 'warn', ic: 'filebig', titulo: 'Este documento es demasiado grande para editarlo en línea',
      texto: 'Pesa <span class="tn">68 MB</span> y el editor admite hasta <span class="tn">50 MB</span>. Puedes leerlo aquí o descargarlo para editarlo en tu equipo.',
      accion: 'Descargar', accionIc: 'download',
    },
  },
  {
    estado: 'no-disponible', titulo: 'el servicio de edición no responde (EDITING_UNAVAILABLE, CA-15)', esPropietario: true,
    sinEditor: true, gente: [], cuerpo: noDisponible,
  },
];

for (const v of ESTADOS) {
  const file = `editor--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
