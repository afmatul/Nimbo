// Genera los estados escritos a mano de storage/explorador para la spec 005 (vacio, cargando y arrastre).
// Uso: node generar.js <ruta-del-worktree>
// El marco (barra lateral, barra superior y CSS base) viene de marco/marco.js y la página «Mis archivos»
// (encabezado, tabla de la raíz, cuota por tramos) de mis-archivos/mis-archivos.js, los mismos de storage/carga.
// explorador--cuadricula.html y explorador--lista.html (HTML empaquetado de la propuesta) NO se generan aquí.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const AV = require('../mis-archivos/avisos.js');
const MF = require('../mis-archivos/menu-fila.js');

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/storage/explorador');
fs.mkdirSync(OUT, { recursive: true });

// ---------- Íconos propios (trazos de Lucide, 24 × 24) ----------
const P = {
  ...S.P,
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
};
const icon = S.crearIcon(P);

// Cuenta sin archivos: 0 B usados del plan Equipo (tramo 0–69 % de QuotaBar, sin nota)
// «1 GB» sin partir entre líneas
const MAX = S.MAX_POR_ARCHIVO.replace(' ', '&nbsp;');

const CUOTA_VACIA = { usado: '0 B', total: '350 GB', pct: 0 };

// ---------- CSS propio de la pantalla ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + '  }\n' + M.EXTRA + `
  /* Propio de storage/explorador (spec 005) */
` + S.CSS_LISTA + `
` + E.CSS_ESTADOS + `  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + `  }
`;

// ---------- Menú ⋮ por fila: mismo comportamiento de teclado que el menú de la cuenta (shared/layout) ----------
// Enter, Espacio o flecha abajo abren en el primer ítem; flechas, Inicio y Fin recorren; Escape cierra y devuelve el
// foco al botón; Tab cierra. En el estado «acciones» el menú de la primera fila empieza abierto y con el foco.
const JS = MF.JS_MENU;

// ---------- Piezas ----------
function vacio() {
  return `
        <section class="state-empty" aria-labelledby="vacio-t">
          ${icon('folderOpen', 40)}
          <h2 id="vacio-t">Aún no tienes archivos</h2>
          <p><span class="solo-escritorio">Sube tus documentos con el botón o arrástralos a esta página.</span><span class="solo-tactil">Sube tus documentos desde tu dispositivo.</span> Tu plan permite hasta ${MAX} por archivo.</p>
          ${S.botonSubir()}
        </section>`;
}

const cargando = () => E.esqueleto('Cargando tus archivos…');

const error = () => E.errorEstado('No pudimos cargar tus archivos.', 'Tus archivos siguen guardados. Inténtalo de nuevo.');

// Aviso de descarga fallida. Textos por código (catálogo de errores del frontend); el mockup dibuja el 429.
const AVISOS_DESCARGA = {
  429: (n) => ({ titulo: `No pudimos preparar la descarga de «${n}».`, texto: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', accion: 'Reintentar' }),
  404: (n) => ({ titulo: `No encontramos «${n}».`, texto: 'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.', accion: 'Actualizar lista' }),
};
const avisoDescarga = (codigo, nombre) => AV.aviso(AVISOS_DESCARGA[codigo](nombre));

const arrastre = () => E.arrastre('Mis archivos', MAX);

function page(v) {
  const file = `explorador--${v.estado}.html`;
  return `${M.cabecera({
    titulo: `Mis archivos · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 005: explorador mínimo de la raíz). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y StateView.',
      'Marco generado con _generadores/marco/marco.js; página Mis archivos con _generadores/mis-archivos/mis-archivos.js (igual que storage/carga).',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">005</span> <strong>Explorador · Mis archivos</strong> <span class="file">${file}</span> <span>raíz de Mis archivos · plan Equipo · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app">
    ${S.sidebar(v.cuota, v.tramo)}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'] })}
      <main class="content" id="contenido">${S.encabezado()}${v.cuerpo()}
      </main>
    </div>
  </div>
</div>
${v.js ? `
<script>${JS}</script>
` : ''}
</body>
</html>
`;
}

// ---------- Estados ----------
const ESTADOS = [
  {
    estado: 'vacio',
    titulo: 'raíz sin archivos: invitación a subir con el botón o arrastrando',
    cuota: CUOTA_VACIA, tramo: 'ok',
    cuerpo: vacio,
  },
  {
    estado: 'cargando',
    titulo: 'esqueleto de la lista mientras llega GET /files',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: cargando,
  },
  {
    estado: 'arrastre',
    titulo: 'archivos arrastrados sobre Mis archivos: zona de soltar resaltada',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: () => S.tabla([]) + arrastre(),
  },
  {
    estado: 'error',
    titulo: 'falló el listado de la raíz: error con código y «Reintentar»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn',
    cuerpo: error,
  },
  {
    estado: 'acciones',
    titulo: 'menú ⋮ de la fila abierto con «Descargar», la única acción de 005',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => S.tabla([], { menuAbierto: 0 }),
  },
  {
    estado: 'descarga-preparando',
    titulo: 'la URL firmada tarda más de 2 s: «Descargar» deshabilitado con «Preparando…»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => S.tabla([], { menuAbierto: 0, preparando: true }),
  },
  {
    estado: 'descarga-fallida',
    titulo: 'falló la descarga (429): aviso arriba de la lista con «Reintentar»',
    cuota: S.CUOTA_NORMAL, tramo: 'warn', js: true,
    cuerpo: () => avisoDescarga(429, 'Propuesta_Nimbo_v3.docx') + S.tabla([]),
  },
];

for (const v of ESTADOS) {
  const file = `explorador--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
