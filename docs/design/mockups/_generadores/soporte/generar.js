// Genera los mockups autocontenidos de backoffice/soporte (spec 011: metadatos de los archivos de un cliente, HU-5,
// CA-13), un archivo por estado. Uso: node generar.js <ruta-del-worktree>
// El marco viene de admin/area.js con AREA_SOPORTE (persona de Soporte y navegación con solo «Metadatos de archivos»,
// CA-14); la búsqueda por correo y la paginación son las mismas piezas de backoffice/admin (area.js). Los íconos de tipo
// salen de mis-archivos/mis-archivos.js. Aquí solo va la vista de metadatos: sin contenido, texto, vista previa,
// descarga, URL ni clave de objeto (RN-1); ninguna fila ni nombre es un enlace o un botón.
const fs = require('node:fs');
const path = require('node:path');
const A = require('../admin/area.js');
const MA = require('../mis-archivos/mis-archivos.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/backoffice/soporte');
fs.mkdirSync(OUT, { recursive: true });

// Íconos del área + los de tipo de archivo de 005 + imagen (Lucide «image»).
const icon = MA.crearIcon({
  ...A.P, ...MA.P,
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
});

// ---------- Datos de ejemplo (en la app vienen de la API) ----------
// Laura Barrios: clienta del plan Equipo de la lista de cuentas de backoffice/admin (304 GB de 350 GB), la misma ficha
// que tiene «Ver metadatos de archivos». Diego Coj: cliente recién registrado, sin archivos (0 B en la lista de cuentas).
const LAURA = { nombre: 'Laura Barrios', correo: 'laura.barrios@alpha.gt' };
const DIEGO = { nombre: 'Diego Coj', correo: 'diego.coj@gmail.com' };
const TOTAL_ARCHIVOS = '214';
const PAGINAS = '22';

// archivo.tipo (FileKind de 005: docx, pdf, texto, xlsx, pptx, imagen, otro) → ícono, token --file-* y etiqueta.
const TIPOS = {
  docx: ['fileText', 'docx', 'Documento Word'],
  xlsx: ['sheet', 'xlsx', 'Hoja de cálculo'],
  pptx: ['slides', 'pptx', 'Presentación'],
  pdf: ['fileText', 'pdf', 'PDF'],
  texto: ['fileText', 'other', 'Texto'],
  imagen: ['image', 'img', 'Imagen'],
  otro: ['file', 'other', 'Otro'],
};

// [nombre, tipo, tamaño, creado, modificado, papelera (fecha de eliminado_en) o null]
// Ordenados por última modificación, de la más reciente. Dos están en la papelera (eliminado_en, 006).
const ARCHIVOS = [
  ['Propuesta_Nimbo_v3.docx', 'docx', '2.4 MB', '14/09/2026 10:02', '03/10/2026 10:11', null],
  ['Matriz_Requisitos_RF.xlsx', 'xlsx', '860 KB', '05/09/2026 16:20', '03/10/2026 09:12', null],
  ['Demo_Fase3_avance.pptx', 'pptx', '18.7 MB', '01/10/2026 15:47', '03/10/2026 08:05', null],
  ['Modelo_ER_Nimbo.pdf', 'pdf', '1.1 MB', '02/10/2026 14:03', '02/10/2026 14:03', null],
  ['Grabacion_reunion_Alpha.mp4', 'otro', '742.3 MB', '30/09/2026 18:22', '30/09/2026 18:22', null],
  ['Logo_Alpha_final.png', 'imagen', '3.6 MB', '29/09/2026 09:15', '29/09/2026 09:15', null],
  ['Notas_entrevistas.md', 'texto', '14 KB', '10/09/2026 08:40', '28/09/2026 12:05', null],
  ['Presupuesto_Q4_borrador.xlsx', 'xlsx', '1.3 MB', '22/09/2026 11:30', '25/09/2026 16:48', '02/10/2026'],
  ['Contrato_servicios_Alpha.pdf', 'pdf', '412 KB', '08/09/2026 11:26', '08/09/2026 11:26', '01/10/2026'],
  ['Respaldo_fotos_agosto.zip', 'otro', '980.2 MB', '03/09/2026 20:11', '03/09/2026 20:11', null],
];

const AVISO_SOPORTE = 'Soporte ve metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido ni vistas previas.';

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
const tile = (t) => { const [ic, cls] = TIPOS[t]; return `<span class="ftile ftile-${cls}">${icon(ic, 16)}</span>`; };
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

function cliente(c, quien = 'tu nombre y tu rol (Soporte)') {
  return `
        <section aria-labelledby="cliente-t">
          <div class="client">
            <div>
              <h2 id="cliente-t">${c.nombre}</h2>
              <p class="mail">${c.correo}</p>
            </div>
            <span class="badge badge-role">${icon('users', 13)}Cliente</span>
          </div>
          <div class="info-box audit-box">${icon('history', 16)}<p><strong>Esta consulta queda en la auditoría de ${c.nombre.split(' ')[0]}.</strong>Verá la fecha, ${quien}.</p></div>`;
}

function fila([nombre, t, tam, creado, mod, papelera]) {
  const tipo = TIPOS[t][2];
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
          </div>${A.paginacion({ aria: `Paginación de los archivos de ${c.nombre}`, resumen: `Mostrando 1–10 de ${TOTAL_ARCHIVOS} archivos`, paginas: PAGINAS })}
        </section>`;
}

const inicial = () => `
        <section class="state state-empty" aria-labelledby="inicial-t">
          ${icon('fileSearch', 36)}
          <h2 id="inicial-t">Busca a un cliente para ver sus archivos</h2>
          <p>Verás el nombre, tipo, tamaño, fechas y estado de cada archivo, nunca su contenido. Cada consulta queda en la auditoría del cliente con tu nombre y rol.</p>
        </section>`;

const vacio = (c) => `
          <div class="state state-empty" role="status" aria-labelledby="vacio-t">
            ${icon('folder', 36)}
            <h2 id="vacio-t">${c.nombre} no tiene archivos.</h2>
            <p>No hay archivos en su cuenta ni en su papelera. Las cargas que no terminaron no aparecen aquí.</p>
          </div>
        </section>`;

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

// Vista del Administrador (desde «Ver metadatos de archivos» de la ficha): mismo contenido, en su área y sin buscador.
// «Volver a la ficha» y la miga con el nombre llevan a la ficha de Laura Barrios activa (backoffice/admin, estado ficha).
const FICHA_LAURA = '../admin/admin--ficha.html';
function desdeAdmin() {
  return `
        <a class="back" href="${FICHA_LAURA}">${icon('arrowLeft', 16)}Volver a la ficha de ${LAURA.nombre}</a>
        <div class="page-head">
          <div>
            <h1>Metadatos de archivos</h1>
            <p>Nombre, tipo, tamaño, fechas y estado de los archivos de esta cuenta.</p>
          </div>
        </div>${A.privacidad()}${cliente(LAURA, 'tu nombre y tu rol (Administrador)')}${tabla(LAURA)}`;
}

// ---------- Estados ----------
const VARIANTES = [
  { estado: 'default', titulo: 'metadatos de los archivos de una clienta, con la consulta en su auditoría',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + cliente(LAURA) + tabla(LAURA) },
  { estado: 'inicial', titulo: 'antes de buscar: qué se verá y que la consulta se audita',
    cuerpo: () => encabezado() + busqueda() + inicial() },
  { estado: 'cargando', titulo: 'esqueleto mientras se busca la cuenta y llegan sus archivos',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + cargando() },
  { estado: 'vacio', titulo: 'cliente sin archivos (ni en la papelera)',
    cuerpo: () => encabezado() + busqueda(DIEGO.correo) + cliente(DIEGO) + vacio(DIEGO) },
  { estado: 'no-encontrado', titulo: 'correo inexistente o que no es de cliente: el mismo mensaje (003 D-6)',
    cuerpo: () => encabezado() + busqueda('lucia.barios@gmail.com') + noEncontrado('lucia.barios@gmail.com') },
  { estado: 'error', titulo: 'falló la búsqueda: error con «Reintentar»',
    cuerpo: () => encabezado() + busqueda(LAURA.correo) + error() },
  { estado: 'desde-admin', titulo: 'la misma vista para el Administrador, desde la ficha de la cuenta', area: A.AREA_ADMIN,
    actual: 'Cuentas', crumbs: ['Administración', 'Cuentas', [LAURA.nombre, FICHA_LAURA], 'Metadatos de archivos'], cuerpo: desdeAdmin },
];

for (const v of VARIANTES) {
  const file = v.estado === 'default' ? 'soporte.html' : `soporte--${v.estado}.html`;
  const html = A.pagina({
    titulo: `Metadatos de archivos · ${v.area ? 'Administración' : 'Soporte'} · Nimbo — ${v.estado}`,
    comentarios: [
      `Mockup de referencia (spec 011: metadatos de los archivos de un cliente, HU-5, CA-13). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo.',
      'Generado con _generadores/soporte/generar.js (marco del área en admin/area.js y CSS del marco en marco/marco.js). No editar a mano.',
    ],
    css: CSS,
    rotulo: 'Metadatos de archivos',
    file,
    estado: v.titulo,
    crumbs: v.crumbs || ['Soporte', 'Metadatos de archivos'],
    cuerpo: v.cuerpo(),
    actual: v.actual || 'Metadatos de archivos',
    area: v.area || A.AREA_SOPORTE,
  });
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  console.log(file);
}
