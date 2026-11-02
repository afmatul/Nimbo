// Genera los estados de intelligence/panel-agente (spec 020): panel del agente con citas, ámbito y consultas del plan.
// Uso: node generar.js <ruta-del-repo>
// Tokens, botones y marco: marco/css-marco.js y marco/marco.js. Solo Inter y los tonos AA de ui-guidelines.md §2–§3.
// `panel-agente--con-citas.html` sustituye al paquete de la propuesta (lienzo de ~1490 px, con sugerencias de preguntas,
// «Párrafo atribuido a…» y una cita a un `.xlsx`, todo fuera de alcance): se genera con el resto de estados.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del repositorio');
const OUT = path.join(repo, 'docs/design/mockups/intelligence/panel-agente');
fs.mkdirSync(OUT, { recursive: true });

const NB = ' '; // espacio fijo: «2 000» y «1 000» no se parten al final de línea
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

// ---------- Íconos (Lucide) ----------
const P = {
  ...S.P,
  arrowup: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  cloudoff: '<path d="m2 2 20 20"/><path d="M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.2"/><path d="M21.53 16.05A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07"/>',
  searchx: '<path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  fileclock: '<path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="8" cy="16" r="6"/><path d="M9.5 17.5 8 16.25V14"/>',
  messages: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
};
const icon = S.crearIcon(P);

// ---------- Datos de ejemplo (en la app vienen de la API: plan, consultas, ámbito y archivos indexados) ----------
// Catálogo de product-context §3: Equipo 2 000 consultas, 350 GB, 1 GB por archivo, 60 versiones, 60 días de papelera.
const EQUIPO = {
  plan: 'EQUIPO', total: 2000, usadas: 142, renueva: '14 de noviembre',
  cuota: { usado: '42 GB', total: '350 GB', pct: 12 },
  carpetas: [['folder', 'Proyecto Alpha', '4'], ['folder', 'Documentos legales', '126'], ['folder', 'Finanzas', '64']],
};
const PERSONAL = { plan: 'PERSONAL', total: 20, usadas: 20, renueva: '1 de noviembre', cuota: undefined, carpetas: undefined };
const MAX_PREGUNTA = 1000; // RN-7: configurable por entorno; en la app viene de la API

const AMBITOS = {
  todos: { clave: 'todos', etiqueta: 'Todos mis archivos', detalle: '14 archivos indexados' },
  carpeta: { clave: 'carpeta', etiqueta: 'Carpeta Finanzas', detalle: 'Con sus subcarpetas · 64 archivos indexados' },
  archivo: { clave: 'archivo', etiqueta: 'Archivo Contrato_La_Ceiba.pdf', detalle: '1 archivo' },
};
const OPCIONES_AMBITO = [
  { clave: 'todos', titulo: 'Todos mis archivos', nota: 'Incluye los que te compartieron · 14 archivos indexados' },
  { clave: 'carpeta', titulo: 'Una carpeta', nota: 'Con sus subcarpetas · Finanzas, 64 archivos' },
  { clave: 'archivo', titulo: 'Un archivo', nota: 'Elige el archivo en el que buscar' },
];

// ---------- CSS ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.EXTRA + `
  /* Propio de intelligence/panel-agente (spec 020) */
  :root {
    --live: #7EC8D8;
    --agent-bg: #2C3A52; --agent-text: #D8E4F0; --agent-accent: #7EC8D8; --agent-tag: #3A4E6A;
    --warning-tint: color-mix(in srgb, var(--warning) 10%, var(--card));
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --file-xlsx: #3A7560; --file-xlsx-bg: #6DB99A20;
    --file-pdf: #A34F4F; --file-pdf-bg: #C97B7B20;
    --file-img: #276B7A; --file-img-bg: #7EC8D820;
    --file-other: #53677D; --file-other-bg: #7A90A820;
  }
  .app.app-agente { grid-template-columns: 236px minmax(0, 1fr) 420px; min-height: 860px; }
  .btn .ico { flex: none; }
  .tn { font-variant-numeric: tabular-nums; }

  /* Zona de trabajo (a la izquierda del panel) */
  .work { padding: 24px 28px 32px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .files { list-style: none; margin: 0; padding: 0; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
  .files li { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); min-width: 0; }
  .files li:last-child { border-bottom: 0; }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: none; border-radius: 8px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }
  .ftile-xlsx { color: var(--file-xlsx); background: var(--file-xlsx-bg); }
  .ftile-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }
  .ftile-other { color: var(--file-other); background: var(--file-other-bg); }
  .files .fn { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .files .fm { font-size: 12.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Fragmento citado en su documento (la vista previa llega con 017; antes, la ficha con la ubicación visible) */
  .doc-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; color: var(--secondary-foreground); }
  .doc-where { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--primary-hover); font-variant-numeric: tabular-nums; }
  .doc { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: 40px 48px 48px; }
  .doc h2 { margin: 0 0 14px; font-size: 20px; line-height: 1.3; font-weight: 700; }
  .doc p { margin: 0 0 14px; font-size: 14px; line-height: 1.75; }
  .hit { padding: 14px 16px; border-left: 3px solid var(--brand); border-radius: var(--radius-sm); background: var(--brand-soft); }
  .hit-tag { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--primary-hover); }
  .hit p { margin: 0; }

  /* Panel del agente (AgentPanel): superficie agent-bg; el foco usa el cian del panel (ui-guidelines §2) */
  .agent { display: flex; flex-direction: column; min-width: 0; background: var(--agent-bg); color: var(--agent-text); }
  .agent :focus-visible { outline-color: var(--live); }
  .agent-head { padding: 16px 20px 12px; display: grid; gap: 10px; }
  .agent-title { display: flex; align-items: center; gap: 10px; }
  .agent-title h2 { margin: 0; font-size: 15px; font-weight: 600; flex: 1; }
  .agent-title > .ico { color: var(--agent-accent); }
  .agent-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--agent-text); cursor: pointer; }
  .agent-close:hover { background: var(--agent-tag); }
  .uses { margin: 0; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 12px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .uses strong { font-weight: 600; }
  .meter { height: 6px; border-radius: 999px; background: var(--agent-tag); overflow: hidden; }
  .meter span { display: block; height: 100%; border-radius: 999px; background: var(--agent-accent); }
  .meter-warn span { background: var(--warning); }
  .meter-full span { background: var(--destructive-soft); }
  .uses-full { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }

  /* Selector de ámbito (RN-9): menú de opciones excluyentes */
  .scope { position: relative; padding: 0 20px 12px; }
  .scope-btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 6px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: transparent; color: var(--agent-text); font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
  .scope-btn:hover, .scope-btn[aria-expanded="true"] { background: var(--agent-tag); }
  .scope-k { font-size: 12px; font-weight: 600; color: var(--agent-accent); }
  .scope-btn:hover .scope-k, .scope-btn[aria-expanded="true"] .scope-k { color: var(--agent-text); } /* agent-accent sobre agent-tag da 4.50: al límite */
  .scope-v { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scope-pop { position: absolute; z-index: 5; top: calc(100% - 8px); left: 20px; right: 20px; background: var(--card); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-modal); padding: 6px; }
  .scope-pop ul { list-style: none; margin: 0; padding: 0; }
  .scope-item { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 44px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .scope-item:hover, .scope-item:focus { background: var(--muted); }
  .scope-item:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
  .scope-item .ico { margin-top: 2px; color: var(--primary); }
  .scope-item .ico-off { visibility: hidden; }
  .scope-item strong { display: block; font-size: 14px; font-weight: 600; }
  .scope-item .nota { display: block; font-size: 12.5px; color: var(--muted-foreground); }
  .scope-item:hover .nota, .scope-item:focus .nota, .scope-item[aria-checked="true"] .nota { color: var(--secondary-foreground); }
  .scope-item[aria-checked="true"] { background: var(--accent); }

  /* Conversación (role=log: el streaming se anuncia en voz baja) */
  .thread { flex: 1; display: flex; flex-direction: column; gap: 18px; padding: 8px 20px 20px; border-top: 1px solid var(--agent-tag); overflow: auto; }
  .intro, .state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin: auto 0; padding: 24px 0; }
  .intro > .ico, .state > .ico { color: var(--agent-accent); margin-bottom: 14px; }
  .intro h3, .state h3 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; }
  .intro p, .state p { margin: 6px 0 0; max-width: 36ch; font-size: 14px; line-height: 1.6; }
  .state .btn { margin-top: 18px; }
  .formats { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .formats li { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 3px 10px; border-radius: var(--radius-sm); background: var(--agent-tag); font-size: 12.5px; }
  .formats strong { font-weight: 600; }
  .msg-user { align-self: flex-end; max-width: 90%; margin: 10px 0 0; padding: 10px 14px; border-radius: 14px 14px 4px 14px; background: var(--agent-tag); font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
  .msg-user p { margin: 0; }
  .msg-agent { display: grid; gap: 10px; }
  .msg-label { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--agent-accent); }
  .msg-agent > p:not(.msg-label) { margin: 0; font-size: 14px; line-height: 1.75; }
  .msg-agent strong { font-weight: 600; }

  /* CitationChip: «archivo · ubicación», navegable; la ubicación aproximada lleva ícono, borde discontinuo y texto */
  .cita { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 28px; margin: 2px 2px 2px 0; padding: 3px 10px; border: 1px solid var(--input); border-radius: var(--radius-sm); background: var(--agent-tag); color: var(--agent-text); font-size: 12.5px; line-height: 1.35; text-decoration: none; vertical-align: middle; }
  .cita:hover { border-color: var(--agent-accent); text-decoration: underline; color: var(--agent-text); }
  .cita .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cita .l { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cita-aprox { border-style: dashed; border-color: var(--agent-accent); }
  .cita-aprox .ico { color: var(--agent-accent); }
  .cita-aprox { align-items: flex-start; flex-wrap: wrap; }
  .cita-aprox .ico { margin-top: 2px; }
  .cita-aprox .n { white-space: normal; overflow-wrap: anywhere; }
  .cita-aprox .l { white-space: normal; flex-basis: 100%; padding-left: 20px; }

  /* Indicador en vivo: punto cian con texto (el color nunca va solo) y cursor de escritura */
  .live { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--agent-accent); }
  .live-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--agent-accent); box-shadow: 0 0 0 0 color-mix(in srgb, var(--agent-accent) 60%, transparent); animation: latido 1.6s ease-out infinite; }
  .cursor { display: inline-block; width: 7px; height: 16px; margin-left: 2px; vertical-align: -3px; background: var(--agent-accent); animation: parpadeo 1s steps(2, start) infinite; }
  @keyframes latido { to { box-shadow: 0 0 0 7px transparent; } }
  @keyframes parpadeo { to { visibility: hidden; } }
  @media (prefers-reduced-motion: reduce) { .live-dot, .cursor { animation: none !important; } }

  /* Avisos dentro del panel: tarjeta clara con tokens (Alert warning / error de ui-guidelines §4) */
  .note { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--warning); border-radius: var(--radius-lg); background: var(--warning-tint); color: var(--foreground); }
  .note > .ico { margin-top: 2px; color: var(--warning-foreground); }
  .note-body { flex: 1; min-width: 0; }
  .note-title { margin: 0; font-size: 14px; line-height: 1.45; font-weight: 600; color: var(--warning-foreground); }
  .msg-agent .note-text, .note-text { margin: 2px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--foreground); }
  .note-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .note-error { border-color: var(--destructive); background: color-mix(in srgb, var(--destructive-soft) 8%, var(--card)); }
  .note-error > .ico, .note-error .note-title { color: var(--destructive); }
  .note-info { border-color: var(--border); background: var(--card); }
  .note-info > .ico { color: var(--primary); }
  .note-info .note-title { color: var(--foreground); }
  .agent .note .btn-primary { border-color: var(--primary); }
  .agent .note :focus-visible { outline-color: var(--ring); }

  /* Cuadro de la pregunta (claro dentro del panel oscuro: los errores del campo usan los tonos de la tarjeta) */
  .composer { display: grid; gap: 10px; padding: 12px 20px 16px; border-top: 1px solid var(--agent-tag); }
  .field { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 4px 8px; padding: 8px 8px 8px 12px; background: var(--card); color: var(--foreground); border: 1px solid var(--input); border-radius: var(--radius-lg); }
  .field:focus-within { outline: 2px solid var(--live); outline-offset: 2px; }
  .field textarea { width: 100%; min-height: 48px; border: 0; padding: 4px 0; background: transparent; color: var(--foreground); font: inherit; font-size: 14px; line-height: 1.5; resize: none; outline: none; }
  .field textarea::placeholder { color: var(--muted-foreground); opacity: 1; }
  .field .send { width: 40px; min-width: 40px; min-height: 40px; padding: 0; border-radius: var(--radius-md); }
  .field .send:focus-visible { outline-color: var(--ring); }
  .field-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: 12.5px; color: var(--muted-foreground); }
  .field-foot .count { font-variant-numeric: tabular-nums; margin-left: auto; }
  .field-error { flex: 1 1 100%; display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--destructive); font-weight: 600; }
  .field-error .ico { margin-top: 1px; }
  .field-invalid { border: 1.5px solid var(--destructive); }
  .field-invalid .count { color: var(--destructive); font-weight: 600; }
  .field-off { background: var(--muted); }
  .field-off .field-foot { color: var(--secondary-foreground); }
  .foot-note { margin: 0; font-size: 12px; line-height: 1.5; }

  @media (max-width: 1100px) { .app.app-agente { grid-template-columns: 236px minmax(0, 1fr) 360px; } .doc { padding: 28px 28px 36px; } }

  /* Hoja a pantalla completa (≤ 900 px): solo el panel, sin marco ni rótulo; el cuadro de pregunta queda al pie */
  @media (max-width: 900px) {
    body { background: var(--agent-bg); }
    .sheet-label { display: none; }
    .canvas { margin: 0; border-radius: 0; box-shadow: none; }
    .app.app-agente { grid-template-columns: minmax(0, 1fr); min-height: 100vh; min-height: 100dvh; }
    .app.app-agente .sidebar, .app.app-agente .main { display: none; }
    .agent { min-height: 100vh; min-height: 100dvh; }
    .agent-head { padding: 8px 12px 12px; }
    .agent-title { min-height: 44px; }
    .agent-close { width: 44px; height: 44px; margin-right: -4px; }
    .scope { padding: 0 12px 12px; }
    .scope-btn { min-height: 44px; }
    .scope-pop { left: 12px; right: 12px; }
    .thread { padding: 8px 12px 16px; }
    .msg-user { max-width: 94%; }
    .cita { min-height: 36px; padding: 6px 12px; }
    .composer { position: sticky; bottom: 0; padding: 10px 12px 12px; background: var(--agent-bg); }
    .field .send { width: 44px; min-width: 44px; min-height: 44px; }
    .btn { min-height: 44px; }
    .state .btn, .note-actions .btn { width: 100%; }
    .note { padding: 12px; }
    .formats li { min-height: 36px; }
  }
`;

// ---------- Piezas ----------
const chip = ({ archivo, ubicacion, nombreLargo, aprox = false }) => {
  const aria = `Abrir ${archivo}, ${nombreLargo}${aprox ? ', ubicación aproximada' : ''}`;
  return `<a class="cita${aprox ? ' cita-aprox' : ''}" href="#" aria-label="${aria}" title="${archivo}">${icon(aprox ? 'alert' : 'fileText', 14)}<span class="n">${archivo}</span><span class="l">· ${ubicacion}${aprox ? ' · ubicación aproximada' : ''}</span></a>`;
};
const C = {
  propuesta: chip({ archivo: 'Propuesta_Nimbo_v3.docx', ubicacion: 'sec. 5, párr. 2', nombreLargo: 'sección 5, párrafo 2' }),
  catalogo: chip({ archivo: 'Catalogo_de_planes.pdf', ubicacion: 'p. 4', nombreLargo: 'página 4' }),
  notas: chip({ archivo: 'Notas_de_facturacion.md', ubicacion: 'línea 18', nombreLargo: 'línea 18' }),
  contrato: chip({ archivo: 'Contrato_La_Ceiba.pdf', ubicacion: 'p. 7', nombreLargo: 'página 7', aprox: true }),
  condiciones: chip({ archivo: 'Condiciones_comerciales.docx', ubicacion: 'sec. 3, párr. 1', nombreLargo: 'sección 3, párrafo 1' }),
};

const pregunta = (texto) => `
        <div class="msg-user"><p><span class="sr-only">Preguntaste: </span>${texto}</p></div>`;

const respuesta = (cuerpo, { vivo = false } = {}) => `
        <article class="msg-agent" aria-label="Respuesta del agente">
          <p class="msg-label">${icon('sparkles', 14)}Respuesta${vivo ? `<span class="live" role="status"><span class="live-dot" aria-hidden="true"></span>Escribiendo…</span>` : ''}</p>
          ${cuerpo}
        </article>`;

const nota = ({ tono = '', ic, titulo, texto, acciones = '' }) => `
          <div class="note${tono ? ` note-${tono}` : ''}" role="${tono === 'error' ? 'alert' : 'status'}">
            ${icon(ic, 18)}
            <div class="note-body">
              <p class="note-title">${titulo}</p>
              <p class="note-text">${texto}</p>${acciones ? `
              <div class="note-actions">${acciones}</div>` : ''}
            </div>
          </div>`;

const inicio = () => `
        <div class="intro">
          ${icon('sparkles', 40)}
          <h3>Pregunta sobre tus documentos</h3>
          <p>Escribe una pregunta y te responderé con lo que dicen tus archivos, citando el archivo y el lugar exacto.</p>
        </div>`;

const vacio = () => `
        <div class="state">
          ${icon('fileclock', 40)}
          <h3>Aún no hay archivos que consultar</h3>
          <p>El agente responde con lo que dicen tus documentos. Cuando subas archivos de estos formatos y terminen de prepararse, podrás preguntarles aquí.</p>
          <ul class="formats" aria-label="Formatos que se indexan">
            <li>${icon('fileText', 14)}<strong>.docx</strong> Word</li>
            <li>${icon('fileText', 14)}<strong>.pdf</strong> con texto</li>
            <li>${icon('fileText', 14)}<strong>.txt</strong></li>
            <li>${icon('fileText', 14)}<strong>.md</strong></li>
          </ul>
          <p>Los PDF escaneados (solo imagen) y las hojas de cálculo, presentaciones e imágenes no se indexan.</p>
          <a class="btn btn-primary" href="#">${icon('upload', 16)}Subir archivos</a>
        </div>`;

// ---------- Cuadro de la pregunta ----------
function composer(c) {
  const { estado = 'normal', texto = '', cuenta = 0 } = c;
  const apagado = estado === 'respondiendo' || estado === 'limite';
  const invalido = estado === 'error-vacia' || estado === 'error-larga';
  const marca = ['field', invalido ? 'field-invalid' : '', apagado ? 'field-off' : ''].filter(Boolean).join(' ');
  const ph = { respondiendo: 'Esperando la respuesta…', limite: 'Sin consultas disponibles' }[estado] || 'Pregunta sobre tus documentos…';
  const mensajes = {
    'error-vacia': 'Escribe una pregunta para consultar a tus documentos. No se descontó ninguna consulta.',
    'error-larga': `Tu pregunta tiene ${miles(cuenta - MAX_PREGUNTA)} caracteres de más. Acórtala a ${miles(MAX_PREGUNTA)} o menos para enviarla. No se descontó ninguna consulta.`,
  };
  const pie = {
    respondiendo: 'Podrás preguntar de nuevo cuando termine.',
    limite: 'Podrás preguntar de nuevo el 1 de noviembre.',
  }[estado] || '';
  const err = mensajes[estado] ? `<p class="field-error" id="pregunta-error">${icon('alert', 14)}<span>${mensajes[estado]}</span></p>` : '';
  const desc = [err ? 'pregunta-error' : '', 'pregunta-cuenta'].filter(Boolean).join(' ');
  const off = apagado ? ' disabled' : '';
  return `
      <form class="composer" onsubmit="return false" novalidate>
        <div class="${marca}">
          <label class="sr-only" for="pregunta">Pregunta sobre tus documentos</label>
          <textarea id="pregunta" rows="2" placeholder="${ph}"${off} aria-describedby="${desc}"${invalido ? ' aria-invalid="true"' : ''}>${texto}</textarea>
          <button class="btn btn-primary send" type="submit" aria-label="Enviar pregunta"${off}>${icon('arrowup', 20)}</button>
          <div class="field-foot">${err}${pie ? `<span>${pie}</span>` : ''}<span class="count" id="pregunta-cuenta"><span class="sr-only">Caracteres: </span>${miles(cuenta)} / ${miles(MAX_PREGUNTA)}</span></div>
        </div>
        <p class="foot-note">Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas. El agente solo lee los archivos a los que tienes acceso.</p>
      </form>`;
}

// ---------- Panel ----------
function ambito(v) {
  const a = AMBITOS[v.ambito];
  const items = OPCIONES_AMBITO.map((o) => {
    const marcado = o.clave === v.ambito;
    return `
              <li role="none"><button class="scope-item" type="button" role="menuitemradio" aria-checked="${marcado}" tabindex="-1">${icon('check', 16, marcado ? '' : 'ico-off')}<span><strong>${o.titulo}</strong><span class="nota">${o.nota}</span></span></button></li>`;
  }).join('');
  return `
      <div class="scope">
        <button class="scope-btn" type="button" id="ambito-btn" aria-haspopup="menu" aria-controls="ambito-menu" aria-expanded="${!!v.menuAbierto}">
          <span class="scope-k">Ámbito</span><span class="scope-v">${a.etiqueta}</span>${icon('chevron', 16)}
        </button>
        <div class="scope-pop" id="ambito-pop"${v.menuAbierto ? '' : ' hidden'}>
          <ul role="menu" id="ambito-menu" aria-labelledby="ambito-btn">${items}
          </ul>
        </div>
      </div>`;
}

function encabezado(v) {
  const u = v.cuenta;
  const pct = Math.min(100, (u.usadas / u.total) * 100);
  const tramo = pct >= 100 ? ' meter-full' : pct >= 70 ? ' meter-warn' : '';
  const agotado = u.usadas >= u.total;
  const estado = agotado ? `<span class="uses-full">${icon('alert', 13)}Sin consultas disponibles</span>` : `<span>Se renuevan el ${u.renueva}</span>`;
  return `
      <div class="agent-head">
        <div class="agent-title">
          ${icon('sparkles', 20)}
          <h2>Agente Nimbo</h2>
          <button class="agent-close" type="button" aria-label="Cerrar el agente">${icon('x', 20)}</button>
        </div>
        <div>
          <p class="uses"><strong>${miles(u.usadas)} de ${miles(u.total)} consultas este mes</strong>${estado}</p>
          <div class="meter${tramo}" role="progressbar" aria-label="Consultas usadas este mes" aria-valuemin="0" aria-valuemax="${u.total}" aria-valuenow="${u.usadas}" aria-valuetext="${miles(u.usadas)} de ${miles(u.total)} consultas" style="margin-top: 6px"><span style="width: ${pct}%"></span></div>
        </div>
      </div>`;
}

function panel(v) {
  return `
    <aside class="agent" aria-label="Agente Nimbo">${encabezado(v)}${ambito(v)}
      <div class="thread" role="log" aria-label="Conversación con el agente" aria-live="polite"${v.ocupado ? ' aria-busy="true"' : ''}>${v.hilo}
      </div>${composer(v.composer)}
    </aside>`;
}

// ---------- Zona de trabajo ----------
const ARCHIVOS_INDEXADOS = [
  ['Propuesta_Nimbo_v3.docx', 'docx', 'hoy, 09:12', '1.8 MB'],
  ['Catalogo_de_planes.pdf', 'pdf', 'ayer', '640 KB'],
  ['Contrato_La_Ceiba.pdf', 'pdf', '19 oct', '2.3 MB'],
  ['Notas_de_facturacion.md', 'other', '12 oct', '8 KB'],
  ['Presupuesto_2027.xlsx', 'xlsx', '3 oct', '412 KB'],
];
const ARCHIVOS_SIN_INDEXAR = [
  ['Presupuesto_2027.xlsx', 'xlsx', 'hoy, 08:40', '412 KB'],
  ['Cronograma_Alpha.xlsx', 'xlsx', 'ayer', '96 KB'],
  ['Logo_cliente.png', 'img', '19 oct', '240 KB'],
  ['Diagrama_red.png', 'img', '12 oct', '1.1 MB'],
];
const listaArchivos = (filas) => `
        <section aria-labelledby="mis-archivos-t">
          <div class="page-head"><h1 id="mis-archivos-t">Mis archivos</h1></div>
          <ul class="files" style="margin-top: 16px">${filas.map(([n, t, f, p]) =>
    `\n            <li><span class="ftile ftile-${t}">${icon(t === 'xlsx' ? 'sheet' : t === 'img' ? 'file' : 'fileText', 16)}</span><span class="fn">${n}</span><span class="fm">${f} · ${p}</span></li>`).join('')}
          </ul>
        </section>`;

const documentoCitado = () => `
        <div class="doc-head">
          <span>Propuesta_Nimbo_v3.docx · versión 12</span>
          <span class="doc-where">${icon('fileText', 14)}sección 5, párrafo 2</span>
        </div>
        <article class="doc" aria-label="Propuesta_Nimbo_v3.docx, fragmento citado">
          <h2>5. Planes y modelo de servicio</h2>
          <p>El catálogo define cuatro niveles de servicio. Cada plan delimita el almacenamiento total, el tamaño máximo por archivo, la cuota mensual de consultas al agente y la política de retención de versiones y papelera.</p>
          <div class="hit">
            <p class="hit-tag">${icon('sparkles', 14)}Fragmento citado</p>
            <p>El plan <strong>Equipo</strong> (Q110.00 mensuales) ofrece 350 GB de almacenamiento, un tamaño máximo de 1 GB por archivo, 2 000 consultas mensuales al agente y conserva las últimas 60 versiones de cada documento, con 60 días de retención en papelera.</p>
          </div>
          <p style="margin-top: 14px">Los cambios de plan aplican en el siguiente ciclo de facturación; no existe prorrateo inmediato. Al vencer la suscripción, la cuenta pasa a solo lectura conservando la totalidad de los archivos.</p>
        </article>`;

// ---------- Estados ----------
const PREG_PLAN = '¿Cuántas consultas incluye el plan Equipo y cuántas versiones conserva?';
const RESP_COMPLETA = `
          <p>El plan Equipo incluye <strong>2 000 consultas mensuales</strong> al agente y conserva las <strong>últimas 60 versiones</strong> de cada documento. ${C.propuesta}</p>
          <p>La papelera guarda lo eliminado durante 60 días. ${C.catalogo}</p>
          <p>Los cambios de plan aplican en el siguiente ciclo de facturación; no hay prorrateo. ${C.notas}</p>`;
const PREG_LARGA = 'Necesito comparar todas las cláusulas de los contratos con proveedores de 2024, 2025 y 2026 y que me digas cuáles tienen penalizaciones por retraso, cuáles exigen anticipo, cuáles se renuevan solas y cuáles obligan a dar aviso con más de 30 días, y además quiero saber quién firmó cada uno, en qué fecha, con qué montos y bajo qué condiciones de pago, incluyendo los anexos y las adendas que se hayan firmado después, así como cualquier cambio de precio que se haya acordado por escrito desde entonces hasta hoy…';

const ESTADOS = [
  {
    estado: 'con-citas', titulo: 'respuesta completa con citas; la primera abre el fragmento (CA-1, CA-8, CA-10)',
    cuenta: EQUIPO, ambito: 'todos', izquierda: 'documento', crumbs: ['Proyecto Alpha', 'Propuesta_Nimbo_v3.docx'],
    hilo: pregunta(PREG_PLAN) + respuesta(RESP_COMPLETA),
    composer: { estado: 'normal' },
  },
  {
    estado: 'inicio', titulo: 'con archivos indexados y sin preguntas todavía', cuenta: EQUIPO, ambito: 'todos',
    hilo: inicio(), composer: { estado: 'normal' },
  },
  {
    estado: 'vacio', titulo: 'sin archivos indexados: qué formatos se indexan (CA-7)', cuenta: { ...EQUIPO, usadas: 0 }, ambito: 'todos',
    izquierda: 'sin-indexar', hilo: vacio(), composer: { estado: 'normal' },
  },
  {
    estado: 'respondiendo', titulo: 'respuesta en streaming con indicador en vivo (CA-1, RNF-03)', cuenta: EQUIPO, ambito: 'todos', ocupado: true,
    hilo: pregunta(PREG_PLAN) + respuesta(`
          <p>El plan Equipo incluye <strong>2 000 consultas mensuales</strong> al agente y conserva las <strong>últimas 60 versiones</strong> de cada documento. ${C.propuesta}</p>
          <p>La papelera guarda lo eliminado durante 60 días<span class="cursor" aria-hidden="true"></span></p>`, { vivo: true }),
    composer: { estado: 'respondiendo' },
  },
  {
    estado: 'sin-resultados', titulo: '«No encontré esto en tus documentos»: sin citas inventadas (CA-3)', cuenta: { ...EQUIPO, usadas: 143 }, ambito: 'carpeta',
    hilo: pregunta('¿Cuál es nuestra política de reembolso a proveedores?') + respuesta(`
          <p><strong>No encontré esto en tus documentos.</strong></p>
          <p>Busqué en Finanzas y sus subcarpetas, pero ninguno de los archivos indexados habla de esto. Prueba con otras palabras o amplía el ámbito a todos tus archivos.</p>`)
      + nota({ tono: 'info', ic: 'info', titulo: 'Esta respuesta cuenta como una consulta', texto: 'Se usó una de tus consultas de este mes aunque no haya fuentes.' }),
    composer: { estado: 'normal' },
  },
  {
    estado: 'cita-incierta', titulo: 'cita con «ubicación aproximada» y aviso en el texto (CA-4)', cuenta: EQUIPO, ambito: 'todos',
    hilo: pregunta('¿Qué plazo de entrega y de pago tiene el contrato con Distribuidora La Ceiba?') + respuesta(`
          <p>El contrato fija un plazo de entrega de <strong>30 días calendario</strong> desde la firma. ${C.contrato}</p>`
      + nota({ tono: 'warn', ic: 'alert', titulo: 'La ubicación de esta cita es aproximada', texto: 'El texto está cerca de la página 7, pero no pude fijar el lugar exacto. Abre el archivo y compruébalo antes de usarlo.' }) + `
          <p>El pago se hace a <strong>45 días</strong> de recibida la factura. ${C.condiciones}</p>`),
    composer: { estado: 'normal' },
  },
  {
    estado: 'limite-alcanzado', titulo: 'agotaste las consultas del periodo (CA-11, AGENT_QUOTA_EXCEEDED)', cuenta: PERSONAL, ambito: 'todos',
    hilo: pregunta('¿Qué dice el contrato sobre la renovación automática?')
      + `\n        <div>${nota({
        tono: 'warn', ic: 'lock', titulo: 'Usaste tus 20 consultas de este mes.',
        texto: 'Se renuevan el 1 de noviembre. Mientras tanto, subir, descargar y buscar archivos funciona igual.',
        acciones: `<a class="btn btn-primary btn-sm" href="#">Ver planes</a>`,
      })}\n        </div>`,
    composer: { estado: 'limite' },
  },
  {
    estado: 'no-disponible', titulo: 'el proveedor del modelo no responde (CA-15, AGENT_UNAVAILABLE)', cuenta: EQUIPO, ambito: 'todos',
    hilo: pregunta(PREG_PLAN) + `\n        <div>${nota({
      tono: 'error', ic: 'cloudoff', titulo: 'El agente no está disponible.',
      texto: 'Tus archivos siguen a salvo: puedes seguir subiendo, descargando y buscando mientras se restablece. No se descontó esta consulta.',
      acciones: `<button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}Reintentar</button>`,
    })}\n        </div>`,
    composer: { estado: 'normal' },
  },
  {
    estado: 'no-disponible-parcial', titulo: 'el servicio falla a mitad de la respuesta: se conserva lo recibido (CA-15)', cuenta: EQUIPO, ambito: 'todos',
    hilo: pregunta(PREG_PLAN) + respuesta(`
          <p>El plan Equipo incluye <strong>2 000 consultas mensuales</strong> al agente y conserva las <strong>últimas 60 versiones</strong> de cada documento. ${C.propuesta}</p>
          <p>La papelera guarda lo eliminado durante…</p>`
      + nota({
        tono: 'error', ic: 'cloudoff', titulo: 'El agente no está disponible.',
        texto: 'La respuesta se cortó; lo de arriba es lo que alcanzó a llegar. Tus archivos siguen a salvo y no se descontó esta consulta.',
        acciones: `<button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}Preguntar de nuevo</button>`,
      })),
    composer: { estado: 'normal' },
  },
  {
    estado: 'error-pregunta', titulo: 'pregunta de más de 1 000 caracteres (CA-6, AGENT_INVALID_QUESTION)', cuenta: EQUIPO, ambito: 'todos',
    hilo: inicio(), composer: { estado: 'error-larga', texto: PREG_LARGA, cuenta: 1124 },
  },
  {
    estado: 'error-pregunta-vacia', titulo: 'pregunta vacía (CA-6, AGENT_INVALID_QUESTION)', cuenta: EQUIPO, ambito: 'todos',
    hilo: inicio(), composer: { estado: 'error-vacia', texto: '', cuenta: 0 },
  },
  {
    estado: 'ambito', titulo: 'selector de ámbito abierto: todos, una carpeta o un archivo (RN-9)', cuenta: EQUIPO, ambito: 'carpeta', menuAbierto: true,
    hilo: inicio(), composer: { estado: 'normal' },
  },
];

// ---------- Página ----------
function izquierda(v) {
  if (v.izquierda === 'documento') return documentoCitado();
  return listaArchivos(v.izquierda === 'sin-indexar' ? ARCHIVOS_SIN_INDEXAR : ARCHIVOS_INDEXADOS);
}

function page(v) {
  const file = `panel-agente--${v.estado}.html`;
  const c = v.cuenta;
  return `${M.cabecera({
    titulo: `Agente Nimbo · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 020: agente con citas). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo (AgentPanel, CitationChip, Alert, StateView).',
      'Generado con _generadores/panel-agente/generar.js. No editar a mano.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">020</span> <strong>Panel del agente</strong> <span class="file">${file}</span> <span>${v.titulo}</span></aside>

<div class="canvas">
  <div class="app app-agente">${M.sidebar({ activo: 'Mis archivos', plan: c.plan, cuota: c.cuota, carpetas: c.carpetas })}
    <div class="main">${M.topbar({ crumbs: v.crumbs || ['Mis archivos'] })}
      <main class="work" id="contenido">${izquierda(v)}
      </main>
    </div>${panel(v)}
  </div>
</div>
${JS}
</body>
</html>
`;
}

// Menú del ámbito: abre y cierra con el botón, Escape y clic fuera; flechas entre opciones
const JS = `<script>
(function () {
  var b = document.getElementById('ambito-btn'), pop = document.getElementById('ambito-pop');
  if (!b || !pop) return;
  var items = Array.prototype.slice.call(pop.querySelectorAll('[role="menuitemradio"]'));
  function cerrar(foco) { pop.hidden = true; b.setAttribute('aria-expanded', 'false'); if (foco) b.focus(); }
  function abrir() { pop.hidden = false; b.setAttribute('aria-expanded', 'true'); (items.filter(function (i) { return i.getAttribute('aria-checked') === 'true'; })[0] || items[0]).focus(); }
  b.addEventListener('click', function () { if (pop.hidden) abrir(); else cerrar(true); });
  pop.addEventListener('keydown', function (e) {
    var i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(true); }
    else if (e.key === 'Tab') cerrar(false);
  });
  document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target) && !b.contains(e.target)) cerrar(false); });
})();
</script>`;

for (const v of ESTADOS) {
  const file = `panel-agente--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
