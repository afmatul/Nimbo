// Genera los estados escritos a mano de storage/carga (spec 005), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// El marco (barra lateral, barra superior y CSS base) viene de marco/marco.js, el mismo de identity/seguridad y
// shared/layout. El panel de carga reproduce el de carga--progreso.html (propuesta p. 10) con tokens de
// ui-guidelines.md §3. carga--progreso.html (HTML empaquetado de la propuesta) NO se genera aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const U = require('./panel.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/carga');
fs.mkdirSync(OUT, { recursive: true });

// Íconos (los del panel más los de la lista) y piezas del panel de cargas: carga/panel.js
const { icon, btnIcon, panel } = U;

// Datos de ejemplo, tipos de archivo, cuota por tramos y tabla de la raíz: mis-archivos/mis-archivos.js
const { CUOTA_NORMAL, CUOTA_LLENA, sidebar, tabla } = S;

// ---------- CSS propio de la pantalla ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de storage/carga */
` + S.CSS_LISTA + U.CSS_PANEL + `
  /* Diálogo de nombre repetido (Dialog de shadcn; no es destructivo) */
  .dialog-note { margin-top: 10px !important; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); color: var(--secondary-foreground) !important; font-size: 13px !important; overflow-wrap: anywhere; }
  .dialog-note strong { color: var(--foreground); font-weight: 600; }
  .dialog-check { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; }
  .dialog-check input { width: 24px; height: 24px; margin: 0; flex: none; accent-color: var(--primary); cursor: pointer; }
  .dialog-check label { display: inline-flex; align-items: center; min-height: 24px; font-size: 14px; font-weight: 600; color: var(--foreground); cursor: pointer; }
  .dialog-check p { margin: 0 !important; font-size: 13px !important; color: var(--secondary-foreground) !important; }
  .dialog .dialog-check + .dialog-actions { margin-top: 18px; }

  @media (max-width: 900px) {
` + U.CSS_PANEL_MQ900 + `  }
  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + U.CSS_PANEL_MQ600_HOJA + `    .dialog-check label { min-height: 28px; }
` + U.CSS_PANEL_MQ600_FILAS + `  }
`;

// Diálogos del panel: mismo componente (Dialog de shadcn como alertdialog), misma estructura:
// título, mensaje, nota sobre fondo muted, [casilla] y dos botones.
function dialogo(d) {
  if (!d) return '';
  const casilla = d.restantes ? `
    <div class="dialog-check">
      <input type="checkbox" id="dlg-todos" aria-describedby="dlg-todos-d">
      <div>
        <label for="dlg-todos">Aplicar a los demás</label>
        <p id="dlg-todos-d">Usaremos la misma respuesta para ${d.restantes === 1 ? 'el otro archivo' : `los otros ${d.restantes} archivos`} con nombre repetido.</p>
      </div>
    </div>` : '';
  if (d.tipo === 'cancelar') {
    return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d dlg-n">
    <h2 id="dlg-t">¿Cancelar esta carga?</h2>
    <p id="dlg-d">Ya subiste ${d.subido} de «${d.nombre}». La pausamos mientras decides.</p>
    <p id="dlg-n" class="dialog-note">Si la cancelas, se perderá lo que ya subiste y liberaremos el espacio reservado. Para subir el archivo tendrás que empezar de cero.</p>
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button" autofocus>Seguir subiendo</button>
      <button class="btn btn-destructive" type="button">Cancelar carga</button>
    </div>
  </div>`;
  }
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d dlg-n">
    <h2 id="dlg-t">¿Conservar ambos archivos?</h2>
    <p id="dlg-d">Ya tienes un archivo llamado «${d.nombre}». ¿Quieres conservar ambos o cancelar?</p>
    <p id="dlg-n" class="dialog-note">Si conservas ambos, el nuevo se guardará como <strong>«${d.nuevo}»</strong>.</p>${casilla}
    <div class="dialog-actions">
      <button class="btn btn-outline" type="button">Cancelar</button>
      <button class="btn btn-primary" type="button" autofocus>Conservar ambos</button>
    </div>
  </div>`;
}

function page(v) {
  const file = `carga--${v.estado}.html`;
  const q = v.cuota || CUOTA_NORMAL;
  const tramo = v.cuota === CUOTA_LLENA ? 'full' : 'warn';
  return `${M.cabecera({
    titulo: `Carga de archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 005: carga y descarga). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y UploadProgress.',
      'Marco generado con _generadores/marco/marco.js; panel de carga como el de carga--progreso.html (propuesta p. 10).',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">005</span> <strong>Carga de archivos</strong> <span class="file">${file}</span> <span>panel de carga sobre Mis archivos · plan Equipo · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${sidebar(q, tramo)}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'] })}
      <main class="content" id="contenido">${S.encabezado()}${tabla(v.nuevos || [])}${panel(v.panel)}
      </main>
    </div>
  </div>${dialogo(v.dialogo)}
</div>

</body>
</html>
`;
}

// ---------- Acciones por archivo ----------
const pausar = (n) => btnIcon('pause', `Pausar la carga de ${n}`);
const cancelar = (n) => btnIcon('x', `Cancelar la carga de ${n}`);
const reanudar = (n, texto = 'Reanudar') =>
  `<button class="btn btn-primary btn-sm" type="button" aria-label="${texto} la carga de ${n}">${icon('play', 14)}<span>${texto}</span></button>`;

// ---------- Estados ----------
const VIDEO = 'Grabacion_sesion_13.mp4'; // 862 MB: cabe en el máximo de 1 GB del plan Equipo
const ZIP = 'Respaldo_encuestas_2026.zip';
const SIMPLE = 'Informe_avance_sep.docx'; // carga simple: al reanudar empieza de cero
const ANEXO = { nombre: 'Anexo_B_pgvector.pdf', meta: '3.4 MB', st: 'subido', stCls: 'st-ok', done: true };

const ESTADOS = [
  {
    estado: 'pausa',
    titulo: 'cargas en pausa (por partes y simple) y una en curso; pausar, reanudar y cancelar por archivo',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: 'Subiendo 3 archivos', sub: '2 en pausa · 54 %', activas: true,
      anuncio: `Pausaste la carga de ${SIMPLE}. Se reiniciará al reanudar.`,
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB · 8.4 MB/s · quedan 60 s', bar: 41, barTxt: '41 %, 354 MB de 862 MB',
          acciones: pausar(VIDEO) + cancelar(VIDEO) },
        { nombre: ZIP, meta: '461 MB de 640 MB', st: 'en pausa', stCls: 'st-warn', bar: 72, barCls: 'bar-warn', barTxt: '72 %, en pausa',
          acciones: reanudar(ZIP) + cancelar(ZIP) },
        { nombre: SIMPLE, meta: '1.1 MB de 2.6 MB', st: 'en pausa', stCls: 'st-warn', bar: 42, barCls: 'bar-warn', barTxt: '42 %, en pausa; se reiniciará al reanudar',
          acciones: reanudar(SIMPLE) + cancelar(SIMPLE), nota: 'Se reiniciará al reanudar.' },
        { nombre: 'Plano_laboratorio.pdf', meta: '12 MB', st: 'cancelada', stCls: '',
          nota: 'Cancelaste esta carga. Liberamos el espacio que tenía reservado.' },
        ANEXO,
      ],
    },
  },
  {
    estado: 'sin-conexion',
    titulo: 'se cortó la red; la carga se reanuda sola donde quedó (misma pestaña)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: 'Carga en espera', sub: '1 archivo · 41 %', activas: true,
      banner: '<strong>Se cortó la conexión.</strong> Tu carga se reanudará donde quedó. No cierres ni recargues esta pestaña.',
      anuncio: 'Se cortó la conexión. Tu carga se reanudará donde quedó.',
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB', st: 'sin conexión', stCls: 'st-warn', bar: 41, barCls: 'bar-warn', barTxt: '41 %, sin conexión',
          acciones: reanudar(VIDEO) + cancelar(VIDEO) },
        ANEXO,
      ],
    },
  },
  {
    estado: 'rechazo-tamano',
    titulo: 'rechazo antes de subir: el archivo supera el máximo por archivo del plan (CA-3)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    panel: {
      titulo: '1 archivo rechazado', sub: '1 de 2 subido', activas: false,
      anuncio: 'No se subió Grabacion_sesion_14.mp4. Este archivo pesa 1.2 GB y tu plan permite hasta 1 GB por archivo.',
      items: [
        { nombre: 'Grabacion_sesion_14.mp4', meta: '1.2 GB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Este archivo pesa 1.2 GB y tu plan permite hasta 1 GB por archivo.</strong> Reduce su tamaño o cambia de plan.</span>' }, // «Ver planes» se oculta hasta 008 (CA-4)
        ANEXO,
      ],
    },
  },
  {
    estado: 'rechazo-cuota',
    titulo: 'rechazo antes de subir: no queda espacio en la cuota del plan (CA-4)',
    cuota: CUOTA_LLENA,
    nuevos: [['Entrevistas_ronda2.docx', '820 KB', 'ahora']],
    panel: {
      titulo: '1 archivo rechazado', sub: '1 de 2 subido', activas: false,
      anuncio: 'No se subió Respaldo_fotos_campo.zip. Te faltan 320 MB de espacio para subir este archivo.',
      items: [
        { nombre: 'Respaldo_fotos_campo.zip', meta: '920 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Te faltan 320 MB de espacio para subir este archivo.</strong> Libera espacio o cambia de plan.</span>',
          msgAcciones: '<a class="btn btn-primary btn-sm" href="#">Liberar espacio</a>' }, // «Ver planes» se oculta hasta 008 (CA-4)
        { nombre: 'Entrevistas_ronda2.docx', meta: '820 KB', st: 'subido', stCls: 'st-ok', done: true },
      ],
    },
  },
  {
    estado: 'tipo-invalido',
    titulo: 'rechazos por contenido: no coincide con la extensión, ejecutable y archivo vacío (CA-11, CA-24, CA-7)',
    nuevos: [['Acta_comite_sep.docx', '96 KB', 'ahora']],
    panel: {
      titulo: '3 archivos rechazados', sub: '1 de 4 subido', activas: false,
      anuncio: 'Se rechazaron 3 archivos. Revisa el motivo de cada uno.',
      items: [
        { nombre: 'Informe_final.docx', meta: '2.1 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>Este archivo no es un .docx válido.</strong> Comprueba que sea el archivo correcto.</span>' },
        { nombre: 'Factura_septiembre.pdf', meta: '1.8 MB', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>No se permiten archivos ejecutables.</strong> Sube otro archivo.</span>' },
        { nombre: 'Notas_reunion.txt', meta: '0 bytes', st: 'rechazado', stCls: 'st-err',
          msg: '<span><strong>El archivo está vacío.</strong> Revisa que tenga contenido y súbelo de nuevo.</span>' },
        { nombre: 'Acta_comite_sep.docx', meta: '96 KB', st: 'subido', stCls: 'st-ok', done: true },
      ],
    },
  },
  {
    estado: 'nombre-repetido',
    titulo: 'ya existe un archivo con ese nombre en la raíz: conservar ambos o cancelar (CA-6)',
    dialogo: { nombre: 'Propuesta_Nimbo_v3.docx', nuevo: 'Propuesta_Nimbo_v3 (1).docx' },
    panel: {
      titulo: 'Subiendo 1 archivo', sub: 'esperando tu respuesta', activas: true,
      anuncio: 'Ya tienes un archivo llamado Propuesta_Nimbo_v3.docx.',
      items: [
        { nombre: 'Propuesta_Nimbo_v3.docx', meta: '2.4 MB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Propuesta_Nimbo_v3.docx') },
      ],
    },
  },
  {
    estado: 'nombre-repetido-varios',
    titulo: 'varios nombres repetidos: un diálogo por archivo con «Aplicar a los demás» (CA-6)',
    dialogo: { nombre: 'Matriz_Requisitos_RF.xlsx', nuevo: 'Matriz_Requisitos_RF (1).xlsx', restantes: 1 },
    panel: {
      titulo: 'Subiendo 3 archivos', sub: 'esperando tu respuesta', activas: true,
      anuncio: 'Ya tienes un archivo llamado Matriz_Requisitos_RF.xlsx.',
      items: [
        { nombre: 'Propuesta_Nimbo_v3 (1).docx', meta: '1.2 MB de 2.4 MB · 3.1 MB/s · quedan 1 s', bar: 50, barTxt: '50 %, 1.2 MB de 2.4 MB',
          acciones: pausar('Propuesta_Nimbo_v3 (1).docx') + cancelar('Propuesta_Nimbo_v3 (1).docx') },
        { nombre: 'Matriz_Requisitos_RF.xlsx', meta: '860 KB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Matriz_Requisitos_RF.xlsx') },
        { nombre: 'Modelo_ER_Nimbo.pdf', meta: '1.1 MB', st: 'nombre repetido', stCls: 'st-warn',
          acciones: cancelar('Modelo_ER_Nimbo.pdf') },
      ],
    },
  },
  {
    estado: 'confirmar-cancelar',
    titulo: 'cancelar una carga con progreso mayor que 0 % pide confirmación; la carga queda en pausa mientras tanto (CA-22)',
    nuevos: [['Anexo_B_pgvector.pdf', '3.4 MB', 'ahora']],
    dialogo: { tipo: 'cancelar', nombre: VIDEO, subido: '354 MB de 862 MB' },
    panel: {
      titulo: 'Subiendo 1 archivo', sub: '1 en pausa · 41 %', activas: true,
      anuncio: '',
      items: [
        { nombre: VIDEO, meta: '354 MB de 862 MB', st: 'en pausa', stCls: 'st-warn', bar: 41, barCls: 'bar-warn', barTxt: '41 %, en pausa',
          acciones: reanudar(VIDEO) + cancelar(VIDEO) },
        ANEXO,
      ],
    },
  },
];

for (const v of ESTADOS) {
  const file = `carga--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
