// Genera los mockups autocontenidos de backoffice/soporte (spec 011: metadatos de los archivos de un cliente, HU-5,
// CA-13), un archivo por estado. Uso: node generar.js <ruta-del-worktree>
// El marco viene de admin/area.js con AREA_SOPORTE (persona de Soporte y navegación con solo «Metadatos de archivos»,
// CA-14); la búsqueda por correo y la paginación son las mismas piezas de backoffice/admin (area.js). Los íconos de tipo
// salen de mis-archivos/mis-archivos.js. Aquí solo va la vista de metadatos: sin contenido, texto, vista previa,
// descarga, URL ni clave de objeto (RN-1); ninguna fila ni nombre es un enlace o un botón.
const A = require('../admin/area.js');
const C = require('../admin/corpus.js');
const MA = require('../mis-archivos/mis-archivos.js');
const E = require('../espacio/espacio.js');

const OUT = A.carpetaDeSalida('soporte');

// Íconos del área + los de tipo de archivo de 005 + imagen (Lucide «image», el mismo de espacio/espacio.js, 007).
const icon = MA.crearIcon({ ...A.P, ...MA.P, image: E.P.image });

// ---------- Datos de ejemplo (en la app vienen de la API) ----------
// Laura Barrios (la ficha que tiene «Ver metadatos de archivos») y Diego Coj (recién registrado, sin archivos) vienen del
// corpus del área (admin/corpus.js), los mismos de la lista de cuentas de backoffice/admin.
const { LAURA, DIEGO } = C;
const TOTAL_ARCHIVOS = 214;

// archivo.tipo (FileKind de 005: docx, pdf, texto, xlsx, pptx, imagen, otro) → ícono, token --file-* y etiqueta.
const TIPOS = {
  docx: { icono: 'fileText', token: 'docx', etiqueta: 'Documento Word' },
  xlsx: { icono: 'sheet', token: 'xlsx', etiqueta: 'Hoja de cálculo' },
  pptx: { icono: 'slides', token: 'pptx', etiqueta: 'Presentación' },
  pdf: { icono: 'fileText', token: 'pdf', etiqueta: 'PDF' },
  texto: { icono: 'fileText', token: 'other', etiqueta: 'Texto' },
  imagen: { icono: 'image', token: 'img', etiqueta: 'Imagen' },
  otro: { icono: 'file', token: 'other', etiqueta: 'Otro' },
};

// papelera: fecha de eliminado_en (006) si el archivo está en la papelera. Ordenados por última modificación, de la más
// reciente; dos están en la papelera.
const ARCHIVOS = [
  { nombre: 'Propuesta_Nimbo_v3.docx', tipo: 'docx', tamano: '2.4 MB',
    creado: '14/09/2026 10:02', modificado: '03/10/2026 10:11' },
  { nombre: 'Matriz_Requisitos_RF.xlsx', tipo: 'xlsx', tamano: '860 KB',
    creado: '05/09/2026 16:20', modificado: '03/10/2026 09:12' },
  { nombre: 'Demo_Fase3_avance.pptx', tipo: 'pptx', tamano: '18.7 MB',
    creado: '01/10/2026 15:47', modificado: '03/10/2026 08:05' },
  { nombre: 'Modelo_ER_Nimbo.pdf', tipo: 'pdf', tamano: '1.1 MB',
    creado: '02/10/2026 14:03', modificado: '02/10/2026 14:03' },
  { nombre: 'Grabacion_reunion_Alpha.mp4', tipo: 'otro', tamano: '742.3 MB',
    creado: '30/09/2026 18:22', modificado: '30/09/2026 18:22' },
  { nombre: 'Logo_Alpha_final.png', tipo: 'imagen', tamano: '3.6 MB',
    creado: '29/09/2026 09:15', modificado: '29/09/2026 09:15' },
  { nombre: 'Notas_entrevistas.md', tipo: 'texto', tamano: '14 KB',
    creado: '10/09/2026 08:40', modificado: '28/09/2026 12:05' },
  { nombre: 'Presupuesto_Q4_borrador.xlsx', tipo: 'xlsx', tamano: '1.3 MB',
    creado: '22/09/2026 11:30', modificado: '25/09/2026 16:48', papelera: '02/10/2026' },
  { nombre: 'Contrato_servicios_Alpha.pdf', tipo: 'pdf', tamano: '412 KB',
    creado: '08/09/2026 11:26', modificado: '08/09/2026 11:26', papelera: '01/10/2026' },
  { nombre: 'Respaldo_fotos_agosto.zip', tipo: 'otro', tamano: '980.2 MB',
    creado: '03/09/2026 20:11', modificado: '03/09/2026 20:11' },
];

const AVISO_SOPORTE = 'Soporte ve metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido ni vistas previas.';

// Papelera (011b): solo raíces de archivos y carpetas, con la retención de 60 días del plan Equipo. En la app el listado
// sale de `storage`; aquí basta con tres ejemplos, uno de cada borde (carpeta, archivo y archivo que se renombra).
const PAPELERA = [
  { nombre: 'Contratos 2026', tipo: 'carpeta', items: 12, tamano: '48 MB',
    eliminado: '02/10/2026', purga: '01/12/2026', ruta: 'Mis archivos / Alpha' },
  { nombre: 'Presupuesto_Q4_borrador.xlsx', tipo: 'xlsx', tamano: '1.3 MB',
    eliminado: '12/10/2026', purga: '11/12/2026', ruta: 'Mis archivos / Finanzas' },
  { nombre: 'Contrato_servicios_Alpha.pdf', tipo: 'pdf', tamano: '412 KB',
    eliminado: '20/10/2026', purga: '19/12/2026', ruta: 'Mis archivos / Contratos 2026' },
];
// Vista que quedó abierta más allá de la retención: la fila sigue en pantalla, pero el servidor ya no la restaura. La
// fecha de purga coincide con el aviso para que el estado no se contradiga.
const PAPELERA_VENCIDA = { ...PAPELERA[2], eliminado: '20/08/2026', purga: '19/10/2026', vencida: true };
const AVISO_PAPELERA = 'Soporte puede restaurar raíces de la papelera (archivos y carpetas), nunca abrirlas, descargarlas, editarlas ni borrarlas. Cada restauración exige un motivo y queda en la auditoría del cliente.';

// ---------- CSS ----------
const CSS = A.CSS + A.CSS_FORM + `
  /* Propio de backoffice/soporte (spec 011: metadatos de los archivos de un cliente) */
  :root {
    /* Tipos de archivo (ui-guidelines §3): texto AA; fondo = tono base al 12 % */
    --file-docx: #3F62A8; --file-docx-bg: #6B8DD620;
    --file-xlsx: #3A7560; --file-xlsx-bg: #6DB99A20;
    --file-pptx: #8A6424; --file-pptx-bg: #D4A96A20;
    --file-pdf: #A34F4F;  --file-pdf-bg: #C97B7B20;
    --file-img: #276B7A;  --file-img-bg: #7EC8D820;
    --file-other: #53677D; --file-other-bg: #7A90A820;
  }
${A.CSS_BUSQUEDA}${A.CSS_PAGINACION}
  /* Cliente consultado */
  .client { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; margin-top: 24px; }
  .client h2 { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 700; }
  .client .mail { margin: 2px 0 0; color: var(--secondary-foreground); font-size: 14px; overflow-wrap: anywhere; }
  .client .badge { margin-top: 4px; }
  .audit-box { margin-top: 12px; }

  /* Tabla de metadatos (solo lectura: sin enlaces, sin menú de acciones, sin selección) */
  .meta { margin-top: 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .meta table { width: 100%; border-collapse: collapse; }
  .meta th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); background: var(--background); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .meta td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--secondary-foreground); vertical-align: middle; }
  .meta tr:last-child td { border-bottom: 0; }
  .c-tipo { width: 148px; } .c-tam { width: 104px; } .c-fecha { width: 150px; } .c-estado { width: 168px; }
  .c-tam, .c-fecha { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .fname { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .fname-text { min-width: 0; }
  .fn { display: block; color: var(--foreground); font-weight: 500; overflow-wrap: anywhere; }
  .ftile { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: 8px; }
  .ftile-docx { color: var(--file-docx); background: var(--file-docx-bg); }
  .ftile-xlsx { color: var(--file-xlsx); background: var(--file-xlsx-bg); }
  .ftile-pptx { color: var(--file-pptx); background: var(--file-pptx-bg); }
  .ftile-pdf { color: var(--file-pdf); background: var(--file-pdf-bg); }
  .ftile-img { color: var(--file-img); background: var(--file-img-bg); }
  .ftile-other { color: var(--file-other); background: var(--file-other-bg); }
  .since { display: block; margin-top: 3px; font-size: 12px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  /* Datos que se mueven a otra celda en anchos menores (ocultos en escritorio) */
  .t-tipo, .t-creado, .m-meta { display: none; }

  /* Esqueleto */
  .sk-client { margin-top: 24px; display: grid; gap: 8px; max-width: 360px; }
  .sk-client .skeleton-line:first-child { height: 18px; }
  .sk-row { display: grid; grid-template-columns: minmax(0, 1fr) 148px 104px 150px 150px 168px; gap: 0 14px; align-items: center; padding: 14px; border-bottom: 1px solid var(--border); }
  .sk-row:last-child { border-bottom: 0; }
  .sk-head { padding: 12px 14px; background: var(--background); }
  .sk-head .skeleton-line { height: 10px; width: 60%; background: var(--border); }
  .sk-name { display: flex; align-items: center; gap: 12px; }
  .sk-name .sk-tile { width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--muted); }
  .sk-name .skeleton-line { flex: 1; }

  /* Vista desde la ficha del Administrador */
  .back { margin-bottom: 8px; }

  /* Papelera (011b): raíces restaurables, sin abrir ni descargar */
  .trash { margin-top: 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
  .trash table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .trash th { padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); background: var(--background); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .trash td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--secondary-foreground); vertical-align: middle; }
  .trash tr:last-child td { border-bottom: 0; }
  .c-tipo-p { width: 132px; } .c-tam-p { width: 80px; } .c-fecha-p { width: 102px; } .c-ruta-p { width: 230px; } .c-accion-p { width: 124px; text-align: right; }
  .trash .c-tam-p, .trash .c-fecha-p { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .trash .fn { font-weight: 500; overflow-wrap: break-word; }
  .trash .tipo-detalle { display: block; margin-top: 2px; font-size: 12px; color: var(--secondary-foreground); }
  .ruta { display: block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trash .btn { min-height: 36px; padding: 0 12px; font-size: 13px; white-space: nowrap; }
  .no-action { font-size: 12.5px; color: var(--muted-foreground); white-space: nowrap; }
  .ftile-folder { color: var(--file-other); background: var(--file-other-bg); }
  .m-trash { display: none; }
  .trash .alert { margin: 16px 16px 0; }
  .trash .alert + table { margin-top: 0; }
  .sk-p { display: grid; gap: 10px; padding: 14px; }

  .restore-dialog { top: 72px; width: min(560px, calc(100% - 32px)); max-height: calc(100vh - 144px); overflow: auto; }
  .restore-dialog .sub { margin: 4px 0 0; color: var(--secondary-foreground); font-size: 13.5px; }
  .restore-dialog .field { margin-top: 16px; }
  .restore-dialog .field > label { font-size: 13.5px; }
  .restore-dialog .text-area { max-width: none; min-height: 100px; resize: vertical; line-height: 1.5; }
  .restore-dialog .counter { margin: 4px 0 0; text-align: right; font-size: 12px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .restore-dialog .info-box { margin-top: 16px; }
  .restore-dialog .alert { margin: 0 0 16px; }
  .restore-dialog .dialog-actions .btn { min-height: 40px; }

  @media (max-width: 1180px) and (min-width: 601px) {
    /* En la tabla de papelera, tipo, tamaño y eliminado pasan bajo el nombre */
    .c-tipo-p, .c-tam-p, .c-fecha-p.c-eliminado-p, .trash .tipo-detalle { display: none; }
    .trash .m-trash { display: grid; gap: 2px; margin-top: 4px; font-size: 12px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
  }
  @media (max-width: 1000px) and (min-width: 601px) {
    .c-ruta-p { display: none; }
    .trash .m-trash .ruta-line { display: block; }
  }
  @media (max-width: 600px) {
    .trash thead { display: none; }
    .trash td:not(.c-nombre-p) { display: none; }
    .trash td { padding: 14px 12px; }
    .trash .tipo-detalle { display: none; }
    .trash .m-trash { display: grid; gap: 4px; margin-top: 6px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
    .trash .m-trash .btn { width: 100%; min-height: 44px; margin-top: 6px; }
    .trash .alert { margin: 12px 12px 0; }
    .restore-dialog { top: 16px; max-height: calc(100vh - 32px); }
    .restore-dialog .dialog-actions { flex-direction: column-reverse; align-items: stretch; }
    .restore-dialog .dialog-actions .btn { width: 100%; min-height: 44px; }
  }

  @media (max-width: 1180px) and (min-width: 601px) {
    /* Tipo y tamaño bajo el nombre, y fecha de creación bajo la de modificación */
    .c-tipo, .c-tam, .c-creado { display: none; }
    .c-estado { width: 150px; }
    .t-tipo, .t-creado { display: block; margin-top: 2px; font-size: 12px; color: var(--secondary-foreground); }
    .sk-row { grid-template-columns: minmax(0, 1fr) 150px 150px; }
    .sk-row > .sk-opt { display: none; }
  }
  @media (max-width: 600px) {
${A.CSS_BUSQUEDA_MQ600}    .client { margin-top: 20px; }
    .client h2 { font-size: 18px; }
    /* Tabla → filas apiladas: la primera celda resume los cinco metadatos; el resto de columnas se ocultan */
    .meta thead { display: none; }
    .meta td:not(.c-nombre) { display: none; }
    .meta td { padding: 14px 12px; }
    .fname { align-items: flex-start; }
    .m-meta { display: grid; gap: 4px; margin-top: 6px; font-size: 12.5px; color: var(--secondary-foreground); font-variant-numeric: tabular-nums; }
    .m-meta .badge { justify-self: start; margin-top: 2px; }
    .m-meta .since { display: inline; margin: 0 0 0 6px; }
${A.CSS_PAGINACION_MQ600}    .sk-row { grid-template-columns: minmax(0, 1fr); padding: 14px 12px; }
    .sk-row > .sk-col, .sk-head { display: none; }
  }
`;

// ---------- Piezas ----------
const tile = (t) => `<span class="ftile ftile-${TIPOS[t].token}">${icon(TIPOS[t].icono, 16)}</span>`;
const badgeEstado = (papelera) => (papelera
  ? `<span class="badge badge-idle">${icon('trash', 13)}En papelera</span>`
  : `<span class="badge badge-ok">${icon('ok', 13)}Disponible</span>`);
const desde = (papelera) => (papelera ? `<span class="since">desde ${papelera}</span>` : '');

function encabezado() {
  return `
        <div class="page-head">
          <div>
            <h1>Metadatos de archivos</h1>
            <p>Busca a un cliente por su correo para revisar el estado de sus archivos.</p>
          </div>
        </div>${A.privacidad(AVISO_SOPORTE)}`;
}

const busqueda = (valor = '') => A.busqueda({
  valor, aria: 'Buscar cliente', etiqueta: 'Correo del cliente', boton: 'btn-primary', id: 'correo',
  ayuda: 'Escribe el correo completo con el que el cliente inicia sesión.',
});

// Sección del cliente consultado: encabezado, aviso de auditoría y contenido (la tabla de metadatos o el vacío).
function cliente(c, contenido, quien = 'tu rol (Soporte)') {
  return `
        <section aria-labelledby="cliente-t">
          <div class="client">
            <div>
              <h2 id="cliente-t">${c.nombre}</h2>
              <p class="mail">${c.correo}</p>
            </div>
            <span class="badge badge-role">${icon('users', 13)}Cliente</span>
          </div>
          <div class="info-box audit-box">${icon('history', 16)}<p><strong>Esta consulta queda en la auditoría de ${c.nombre.split(' ')[0]}.</strong>Verá la fecha, ${quien}.</p></div>${contenido}
        </section>`;
}

function fila({ nombre, tipo: t, tamano: tam, creado, modificado: mod, papelera }) {
  const tipo = TIPOS[t].etiqueta;
  return `
                <tr>
                  <td class="c-nombre"><div class="fname">${tile(t)}<div class="fname-text"><span class="fn">${nombre}</span><span class="t-tipo">${tipo} · ${tam}</span><div class="m-meta"><span>${tipo} · ${tam}</span><span>Modificado: ${mod}</span><span>Creado: ${creado}</span><span>${badgeEstado(papelera)}${desde(papelera)}</span></div></div></div></td>
                  <td class="c-tipo">${tipo}</td>
                  <td class="c-tam">${tam}</td>
                  <td class="c-fecha c-creado">${creado}</td>
                  <td class="c-fecha">${mod}<span class="t-creado">Creado: ${creado}</span></td>
                  <td class="c-estado">${badgeEstado(papelera)}${desde(papelera)}</td>
                </tr>`;
}

function tabla(c) {
  return `
          <div class="meta">
            <table>
              <caption class="sr-only">Archivos de ${c.nombre}: metadatos, ordenados por última modificación, de la más reciente</caption>
              <thead><tr><th scope="col" class="c-nombre">Nombre</th><th scope="col" class="c-tipo">Tipo</th><th scope="col" class="c-tam">Tamaño</th><th scope="col" class="c-fecha c-creado">Creado</th><th scope="col" class="c-fecha">Modificado</th><th scope="col" class="c-estado">Estado</th></tr></thead>
              <tbody>${ARCHIVOS.map(fila).join('')}
              </tbody>
            </table>
          </div>${A.paginacion({ aria: `Paginación de los archivos de ${c.nombre}`, total: TOTAL_ARCHIVOS, cosas: 'archivos' })}`;
}

const inicial = () => `
        <section class="state state-empty" aria-labelledby="inicial-t">
          ${icon('fileSearch', 36)}
          <h2 id="inicial-t">Busca a un cliente para ver sus archivos</h2>
          <p>Verás el nombre, tipo, tamaño, fechas y estado de cada archivo, nunca su contenido. Cada consulta queda en la auditoría del cliente, que ve tu rol.</p>
        </section>`;

const vacio = (c) => `
          <div class="state state-empty" role="status" aria-labelledby="vacio-t">
            ${icon('folder', 36)}
            <h2 id="vacio-t">${c.nombre} no tiene archivos.</h2>
            <p>No hay archivos en su cuenta ni en su papelera. Las cargas que no terminaron no aparecen aquí.</p>
          </div>`;

const noEncontrado = (q) => `
        <section class="state state-empty" role="status" aria-labelledby="nf-t">
          ${icon('search', 36)}
          <h2 id="nf-t">No encontramos una cuenta de cliente con «${q}».</h2>
          <p>Revisa que el correo esté completo y bien escrito, o pídele al cliente el correo con el que inicia sesión.</p>
          <button class="btn btn-outline" type="button">${icon('x', 16)}Limpiar búsqueda</button>
        </section>`;

const SK = [['w70', 'w60', 'w40', 'w70', 'w70', 'w60'], ['w50', 'w50', 'w30', 'w70', 'w70', 'w60'],
  ['w60', 'w60', 'w40', 'w70', 'w70', 'w60'], ['w40', 'w30', 'w30', 'w70', 'w70', 'w60'],
  ['w70', 'w50', 'w40', 'w70', 'w70', 'w60'], ['w50', 'w40', 'w30', 'w70', 'w70', 'w60']];
function cargando() {
  const opt = (i) => (i === 1 || i === 2 || i === 3 ? ' sk-opt' : '');
  const filaSk = (r) => `
              <div class="sk-row"><div class="sk-name"><span class="sk-tile"></span><span class="skeleton-line ${r[0]}"></span></div>${r.slice(1).map((w, i) => `<div class="sk-col${opt(i + 1)}"><span class="skeleton-line ${w}"></span></div>`).join('')}</div>`;
  return `
        <div aria-busy="true">
          <div aria-hidden="true">
            <div class="sk-client"><span class="skeleton-line w50"></span><span class="skeleton-line w70"></span></div>
            <div class="meta">
              <div class="sk-row sk-head">${[0, 1, 2, 3, 4, 5].map((i) => `<span class="sk-col${opt(i)}"><span class="skeleton-line"></span></span>`).join('')}</div>${SK.map(filaSk).join('')}
            </div>
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Buscando la cuenta y sus archivos…</p>
        </div>`;
}

const error = () => A.estadoError('No pudimos completar la búsqueda.', 'Revisa tu conexión e inténtalo de nuevo.');

// ---------- Papelera (011b) ----------
function encabezadoPapelera() {
  return `
        <div class="page-head">
          <div>
            <h1>Papelera de archivos</h1>
            <p>Busca a un cliente por su correo para restaurar una carpeta o un archivo de su papelera.</p>
          </div>
        </div>${A.privacidad(AVISO_PAPELERA)}`;
}

const tipoDe = (item) => (item.tipo === 'carpeta'
  ? { icono: 'folder', token: 'folder', etiqueta: 'Carpeta' }
  : TIPOS[item.tipo]);
const detalleDe = (item) => (item.tipo === 'carpeta' ? 'Carpeta' : TIPOS[item.tipo].etiqueta);
const detalleLargoDe = (item) => (item.tipo === 'carpeta'
  ? `Carpeta · ${item.items} elementos`
  : TIPOS[item.tipo].etiqueta);
const tilePapelera = (item) => {
  const t = tipoDe(item);
  return `<span class="ftile ftile-${t.token}">${icon(t.icono, 16)}</span>`;
};

function filaPapelera(item) {
  const detalle = detalleDe(item);
  const largo = detalleLargoDe(item);
  const accion = item.vencida
    ? '<span class="no-action">No disponible</span>'
    : '<a class="btn btn-outline" href="soporte--papelera-confirmar.html">Restaurar</a>';
  return `
                <tr>
                  <td class="c-nombre-p"><div class="fname">${tilePapelera(item)}<div class="fname-text"><span class="fn">${item.nombre.replace(/_/g, '_<wbr>')}</span><span class="tipo-detalle">${largo} · ${item.tamano}</span><div class="m-trash"><span>${largo} · ${item.tamano}</span><span>Eliminado: ${item.eliminado}</span><span>Se purga: ${item.purga}</span><span class="ruta-line">Estaba en: ${item.ruta}</span>${accion}</div></div></div></td>
                  <td class="c-tipo-p">${detalle}</td>
                  <td class="c-tam-p">${item.tamano}</td>
                  <td class="c-fecha-p c-eliminado-p">${item.eliminado}</td>
                  <td class="c-fecha-p">${item.purga}</td>
                  <td class="c-ruta-p"><span class="ruta" title="${item.ruta}">${item.ruta}</span></td>
                  <td class="c-accion-p">${accion}</td>
                </tr>`;
}

function tablaPapelera(c, items) {
  return `
          <div class="trash">
            <table>
              <caption class="sr-only">Papelera de ${c.nombre}: raíces de archivos y carpetas, con su fecha de purga</caption>
              <thead><tr><th scope="col" class="c-nombre-p">Nombre</th><th scope="col" class="c-tipo-p">Tipo</th><th scope="col" class="c-tam-p">Tamaño</th><th scope="col" class="c-fecha-p c-eliminado-p">Eliminado</th><th scope="col" class="c-fecha-p">Se purga</th><th scope="col" class="c-ruta-p">Ubicación original</th><th scope="col" class="c-accion-p">Acción</th></tr></thead>
              <tbody>${items.map(filaPapelera).join('')}
              </tbody>
            </table>
          </div>`;
}

function clientePapelera(c, contenido, aviso = '') {
  return `
        <section aria-labelledby="cliente-t">
          <div class="client">
            <div>
              <h2 id="cliente-t">${c.nombre}</h2>
              <p class="mail">${c.correo}</p>
            </div>
            <span class="badge badge-role">${icon('users', 13)}Cliente</span>
          </div>
          <div class="info-box audit-box">${icon('history', 16)}<p><strong>Cada restauración queda en la auditoría de ${c.nombre.split(' ')[0]}.</strong>Verá la fecha, el motivo que escribas y tu rol (Soporte), no tu nombre.</p></div>${aviso}${contenido}
        </section>`;
}

const vacioPapelera = (c) => `
          <div class="state state-empty" role="status" aria-labelledby="vacio-p-t">
            ${icon('trash', 36)}
            <h2 id="vacio-p-t">La papelera de ${c.nombre} está vacía.</h2>
            <p>Los archivos y carpetas que borre aparecerán aquí hasta que termine su retención de 60 días.</p>
          </div>`;

function cargandoPapelera() {
  return `
        <div aria-busy="true">
          <div aria-hidden="true">
            <div class="sk-client"><span class="skeleton-line w50"></span><span class="skeleton-line w70"></span></div>
            <div class="trash"><div class="sk-p">${[0, 1, 2, 3, 4].map(() => '<span class="skeleton-line w70"></span>').join('')}</div></div>
          </div>
          <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Buscando la cuenta y su papelera…</p>
        </div>`;
}

const errorPapelera = () => A.estadoError('No pudimos cargar la papelera.', 'Revisa tu conexión e inténtalo de nuevo.');

function dialogoRestaurar({ item, motivo = '', error = '', errores = '', cargando = false } = {}) {
  const esCarpeta = item.tipo === 'carpeta';
  const nombreNuevo = item.nombre.replace(/(\.[^./]+)$/, ' (1)$1');
  const descripcion = esCarpeta
    ? `La carpeta y sus ${item.items} elementos volverán a «${item.ruta}». Si ya existe una carpeta con ese nombre, se restaurará con un nombre nuevo.`
    : `El archivo volverá a «${item.ruta}». Si ya existe uno con ese nombre, se restaurará como «${nombreNuevo}».`;
  const desc = `motivo-ayuda motivo-contador${error ? ' motivo-error' : ''}`;
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog restore-dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">Restaurar «${item.nombre}»</h2>
    <p class="sub" id="dlg-d">${descripcion}</p>
    <form onsubmit="return false">
      ${errores}
      <div class="field">
        <label for="motivo">Motivo de la restauración</label>
        <p class="field-help" id="motivo-ayuda">Obligatorio, de 1 a 500 caracteres. Se guarda en la actividad del cliente; no escribas nombres de archivo ni datos personales.</p>
        <textarea class="text-input text-area" id="motivo" name="motivo" maxlength="500" required aria-describedby="${desc}"${error ? ' aria-invalid="true"' : ''} autofocus>${motivo}</textarea>
        <p class="counter" id="motivo-contador">${motivo.length}/500</p>${error ? `
        <p class="field-error" id="motivo-error">${icon('alert', 15)}<span>${error}</span></p>` : ''}
      </div>
      <div class="info-box">${icon('history', 16)}<p><strong>El motivo queda en la auditoría de Laura.</strong>Verá la fecha, el motivo y tu rol (Soporte), no tu nombre.</p></div>
      <div class="dialog-actions">
        <a class="btn btn-outline" href="soporte--papelera.html">Cancelar</a>
        <button class="btn btn-primary" type="button"${cargando ? ' disabled aria-disabled="true"' : ''}>${cargando ? icon('loader', 16, 'spin') : ''}${cargando ? 'Restaurando…' : 'Restaurar'}</button>
      </div>
    </form>
  </div>`;
}

const AVISO_RESTAURADO = `
          <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Restauramos «Presupuesto_Q4_borrador.xlsx» en «Finanzas».</p><p class="alert-text">El motivo quedó en la auditoría de Laura. El archivo ya está disponible en su cuenta.</p></div></div>`;
const AVISO_RENOMBRADO = `
          <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">Restauramos «Contrato_servicios_Alpha.pdf» como «Contrato_servicios_Alpha (1).pdf» porque ya existía uno con ese nombre.</p><p class="alert-text">Quedó en «Contratos 2026». El motivo quedó en la auditoría de Laura.</p></div></div>`;
const AVISO_RAIZ = `
          <div class="alert alert-ok" role="status">${icon('ok', 18)}<div><p class="alert-title">La carpeta original ya no está disponible. Restauramos «Contratos 2026» en Mis archivos.</p><p class="alert-text">El motivo quedó en la auditoría de Laura.</p></div></div>`;
const AVISO_VENCIDA = `
          <div class="alert alert-error" role="alert">${icon('alert', 18)}<div><p class="alert-title">Ya no se puede restaurar «Contrato_servicios_Alpha.pdf».</p><p class="alert-text">Su retención de 60 días venció el 19/10/2026. Nada cambió.</p></div></div>`;

// Vista del Administrador (desde «Ver metadatos de archivos» de la ficha): mismo contenido, en su área y sin buscador.
// «Volver a la ficha» y la miga con el nombre llevan a la ficha de Laura Barrios activa (backoffice/admin, estado ficha).
const FICHA_LAURA = `../admin/${LAURA.ficha}`;
function desdeAdmin() {
  return `
        <a class="back" href="${FICHA_LAURA}">${icon('arrowLeft', 16)}Volver a la ficha de ${LAURA.nombre}</a>
        <div class="page-head">
          <div>
            <h1>Metadatos de archivos</h1>
            <p>Nombre, tipo, tamaño, fechas y estado de los archivos de esta cuenta.</p>
          </div>
        </div>${A.privacidad()}${cliente(LAURA, tabla(LAURA), 'tu rol (Administrador)')}`;
}

// ---------- Estados ----------
const VARIANTES = [
  { estado: 'default', titulo: 'metadatos de los archivos de una clienta, con la consulta en su auditoría',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + cliente(LAURA, tabla(LAURA)) },
  { estado: 'inicial', titulo: 'antes de buscar: qué se verá y que la consulta se audita',
    cuerpo: () => encabezado() + busqueda() + inicial() },
  { estado: 'cargando', titulo: 'esqueleto mientras se busca la cuenta y llegan sus archivos',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + cargando() },
  { estado: 'vacio', titulo: 'cliente sin archivos (ni en la papelera)',
    cuerpo: () => encabezado() + busqueda(DIEGO.correo) + cliente(DIEGO, vacio(DIEGO)) },
  { estado: 'no-encontrado', titulo: 'correo inexistente o que no es de cliente: el mismo mensaje (003 D-6)',
    cuerpo: () => encabezado() + busqueda('lucia.barios@gmail.com') + noEncontrado('lucia.barios@gmail.com') },
  { estado: 'error', titulo: 'falló la búsqueda: error con «Reintentar»',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + error() },
  { estado: 'desde-admin', titulo: 'la misma vista para el Administrador, desde la ficha de la cuenta', area: A.AREA_ADMIN,
    actual: 'Cuentas', crumbs: ['Administración', 'Cuentas', { etiqueta: LAURA.nombre, href: FICHA_LAURA }, 'Metadatos de archivos'], cuerpo: desdeAdmin },
  // 011b: papelera y restauración por Soporte.
  { estado: 'papelera', titulo: 'papelera de una clienta: raíces de archivos y carpetas con su retención', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA)) },
  { estado: 'papelera-vacia', titulo: 'papelera vacía: no hay raíces restaurables', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, vacioPapelera(LAURA)) },
  { estado: 'papelera-cargando', titulo: 'esqueleto mientras se busca la cuenta y llega su papelera', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + cargandoPapelera() },
  { estado: 'papelera-error', titulo: 'falló la papelera: error con «Reintentar»', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + errorPapelera() },
  { estado: 'papelera-confirmar', titulo: 'confirmación con motivo obligatorio antes de restaurar', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA)),
    dialogo: dialogoRestaurar({ item: PAPELERA[1] }) },
  { estado: 'papelera-motivo-invalido', titulo: 'motivo vacío: error de campo y resumen, nada cambia', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA)),
    dialogo: dialogoRestaurar({
      item: PAPELERA[1], error: 'Escribe un motivo de 1 a 500 caracteres.',
      errores: A.resumenErrores({
        titulo: 'Escribe un motivo para restaurar.', texto: 'Nada cambió.',
        items: [['motivo', 'El motivo debe tener entre 1 y 500 caracteres.']],
      }),
    }) },
  { estado: 'papelera-restaurando', titulo: 'restauración en curso: botón ocupado y motivo conservado', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA)),
    dialogo: dialogoRestaurar({ item: PAPELERA[1], motivo: 'El cliente pidió recuperar el presupuesto para revisarlo.', cargando: true }) },
  { estado: 'papelera-restaurado', titulo: 'restauración completada: el elemento sale de la papelera', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo)
      + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA.filter((x) => x !== PAPELERA[1])), AVISO_RESTAURADO) },
  { estado: 'papelera-renombrado', titulo: 'nombre ocupado: se restaura con un nombre nuevo y se avisa', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo)
      + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA.filter((x) => x !== PAPELERA[2])), AVISO_RENOMBRADO) },
  { estado: 'papelera-movido-raiz', titulo: 'ubicación original eliminada: se restaura en Mis archivos', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo)
      + clientePapelera(LAURA, tablaPapelera(LAURA, PAPELERA.filter((x) => x !== PAPELERA[0])), AVISO_RAIZ) },
  { estado: 'papelera-retencion-vencida', titulo: 'retención vencida: no se restaura y nada cambia', rotulo: 'Papelera', spec: '011b',
    referencia: 'restauración de la papelera por Soporte (011b, CA-10 a CA-12)',
    cuerpo: () => encabezadoPapelera() + busqueda(LAURA.correo) + clientePapelera(LAURA, AVISO_VENCIDA + tablaPapelera(LAURA, [...PAPELERA.slice(0, 2), PAPELERA_VENCIDA])) },
];

for (const v of VARIANTES) {
  const file = A.archivoDe('soporte', v.estado);
  const rotulo = v.rotulo || 'Metadatos de archivos';
  A.escribir(OUT, file, A.pagina({
    titulo: `${rotulo} · ${v.area ? 'Administración' : 'Soporte'} · Nimbo — ${v.estado}`,
    comentarios: A.comentariosDe(v.referencia || 'metadatos de los archivos de un cliente, HU-5, CA-13', v.estado, 'soporte', v.spec),
    css: CSS,
    rotulo,
    file,
    estado: v.titulo,
    crumbs: v.crumbs || ['Soporte', rotulo],
    cuerpo: v.cuerpo(),
    dialogo: v.dialogo || '',
    actual: v.actual || rotulo,
    area: v.area || A.AREA_SOPORTE,
    spec: v.spec,
  }));
}
