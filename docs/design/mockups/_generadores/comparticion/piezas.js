// Piezas comunes de la spec 012 para sharing/compartir y sharing/compartido-conmigo: íconos, distintivo de nivel, ítem
// de menú, barra lateral con «Accesos rápidos» (006) y la entrada «Compartido conmigo», CSS común y la página.
// El marco sale de marco/marco.js; la barra lateral y el CSS de 006 de carpetas/carpetas.js; la tabla, el menú ⋮ y los
// estados de mis-archivos/; los accesos rápidos de accesos/accesos.js. Datos: comparticion/corpus.js.
const M = require('../marco/marco.js');
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const A = require('../accesos/accesos.js');
const AR = require('../admin/area.js');
const K = require('./corpus.js');

// ---------- Íconos (trazos de Lucide): los de 006 más los de personas del área de 011 ----------
const P = { ...C.P, userPlus: AR.P.userPlus, users: AR.P.users, key: AR.P.key, logout: M.P.logout };
const icon = S.crearIcon(P);

// ---------- Entrada de la barra lateral ----------
// El marco la rotula «Compartidos conmigo»; la spec 012 (§6) la llama «Compartido conmigo». Se corrige aquí sin tocar
// marco/marco.js para no cambiar los demás mockups (pendiente: unificar el marco, ver README).
const ENTRADA_MARCO = 'Compartidos conmigo';
const ENTRADA = 'Compartido conmigo';
const conEntrada = (html) => html.split(`<span>${ENTRADA_MARCO}</span>`).join(`<span>${ENTRADA}</span>`);
const activoDe = (activo) => (activo === ENTRADA ? ENTRADA_MARCO : activo);

// Barra lateral de 006 con Accesos rápidos (lo propio y lo compartido mezclados, CA-17)
const PAPELERA = '6'; // contador de la Papelera: el de la barra lateral de 006 (carpetas/carpetas.js)
const barra = (activo) => C.sidebar({ activo: activoDe(activo), papelera: PAPELERA, accesos: A.seccion(K.ACCESOS_RAPIDOS, 'barra') });

// Cajón móvil abierto (por debajo de 900 px) con la misma navegación y la cuota del plan Equipo
function cajon(activo) {
  const html = M.cajon({
    activo: activoDe(activo), plan: S.PLAN, cuota: S.CUOTA_NORMAL, abierto: true, carpetas: [], contadorPapelera: PAPELERA,
    accesos: A.seccion(K.ACCESOS_RAPIDOS, 'cajon'),
  });
  return html.replace(M.cuota(S.CUOTA_NORMAL), S.cuota(S.CUOTA_NORMAL, 'warn'));
}

// ---------- Piezas ----------
// Nivel en texto con ícono (AccessList, ui-guidelines §4): nunca solo color.
const nivel = (n) => `<span class="lvl">${icon(K.NIVELES[n].icono, 13)}<span>${n}</span></span>`;

// Ítem de un menú ⋮ (DropdownMenu). cls 'menu-danger': acción definitiva (rojo con ícono, CSS de 006).
const itemMenu = (ic, label, cls = '') =>
  `<button role="menuitem" type="button" tabindex="-1"${cls ? ` class="${cls}"` : ''}>${icon(ic)}<span>${label}</span></button>`;

// <wbr> tras cada «_»: a 360 px un nombre largo se parte en los guiones bajos (como en explorador/desglose.js)
const partible = (nombre) => nombre.replace(/_/g, '_<wbr>');

const avatar = (p) => `<span class="avatar" aria-hidden="true">${p.iniciales}</span>`;

// ---------- CSS ----------
const CSS_BASE = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 + M.EXTRA +
  S.CSS_LISTA + E.CSS_ESTADOS + C.CSS_006 + A.CSS + `
  /* Propio de sharing (spec 012) */
  .lvl { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--muted); color: var(--secondary-foreground); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .lvl .ico { color: var(--secondary-foreground); }
  .canvas .avatar { flex: none; }
`;
const CSS_BASE_MQ600 = M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + S.CSS_LISTA_MQ600 + E.CSS_ESTADOS_MQ600 + C.CSS_006_MQ600;
// css: { escritorio, movil } propios de la pantalla; el móvil va dentro del @media de 600 px
const css = ({ escritorio = '', movil = '' }) => `${CSS_BASE}${escritorio}  @media (max-width: 600px) {
${CSS_BASE_MQ600}${movil}  }
`;

// ---------- Página ----------
// pantalla: { nombre (= carpeta del mockup y del generador), rotulo, contexto, css }. v: { estado, titulo, crumbs, activo, cuerpo, capa, modal, cajon, js }
const cabecera = (pantalla, v) => M.cabecera({
  titulo: `${pantalla.rotulo} · Nimbo — ${v.titulo}`,
  comentarios: [
    `Mockup de referencia (spec 012: compartición y accesos). Estado: ${v.estado}.`,
    'Colores: valores de ui-guidelines.md §3 (tonos AA). La implementación usa tokens, components/ui y components/nimbo (AccessList).',
    `Generado con _generadores/${pantalla.nombre}/generar.js (comparticion/, marco, carpetas, accesos y mis-archivos). No editar a mano.`,
  ],
  css: pantalla.css,
});

function pagina(pantalla, v) {
  const file = AR.archivoDe(pantalla.nombre, v.estado);
  return conEntrada(C.conLogo(`${cabecera(pantalla, v)}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">012</span> <strong>${pantalla.rotulo}</strong> <span class="file">${file}</span> <span>${pantalla.contexto} · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.modal ? ' inert' : ''}>
    ${barra(v.activo)}
    <div class="main">
      ${M.topbar({ crumbs: v.crumbs, cajonAbierto: !!v.cajon })}
      <main class="content" id="contenido">${v.cuerpo()}
      </main>
    </div>
  </div>${v.cajon ? cajon(v.activo) : ''}${v.capa || ''}
</div>
${v.js ? `\n<script>${v.js}</script>\n` : ''}
</body>
</html>
`));
}

// Escribe todos los estados de una pantalla en docs/design/mockups/sharing/<nombre>/
function generar(pantalla, estados) {
  const path = require('node:path');
  const fs = require('node:fs');
  const repo = process.argv[2];
  if (!repo) throw new Error('Falta la ruta del worktree');
  const dir = path.join(repo, 'docs/design/mockups/sharing', pantalla.nombre);
  fs.mkdirSync(dir, { recursive: true });
  for (const v of estados) AR.escribir(dir, AR.archivoDe(pantalla.nombre, v.estado), pagina(pantalla, v));
}

module.exports = { icon, ENTRADA, nivel, itemMenu, partible, avatar, css, generar };
