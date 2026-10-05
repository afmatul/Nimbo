// Genera los mockups autocontenidos de shared/layout (marco de la aplicación, PD-28), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// Las piezas comunes (barra lateral, barra superior, menú de la cuenta, cajón y diálogo) vienen de marco/marco.js,
// las mismas que usa identity/seguridad. Los estados de «Accesos rápidos» (spec 006, CA-27 y CA-28) usan accesos/accesos.js
// y suman su CSS solo a esas páginas: los cinco estados anteriores no cambian ni un byte.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');
const E = require('../mis-archivos/estados.js');
const A = require('../accesos/accesos.js');
const S = require('../mis-archivos/mis-archivos.js');
const Q = require('../espacio/espacio.js');
const C = require('../carpetas/carpetas.js');
const U = require('../carga/panel.js');
const B = require('./barra.js');

const { icon } = M;

const repo = process.argv[2];
if (!repo) throw new Error('Falta la ruta del worktree');
const OUT = path.join(repo, 'docs/design/mockups/shared/layout');
fs.mkdirSync(OUT, { recursive: true });

// ---------- CSS: marco compartido + extensiones + marcador de contenido ----------
const CSS = '\n' + M.CSS.MARCO + M.CSS.BOTONES + M.CSS.DIALOGO + M.CSS.MQ_900 +
  '  @media (max-width: 600px) {\n' + M.CSS.MQ600_MARCO + M.CSS.MQ600_DIALOGO + '  }\n' + M.EXTRA + `
  /* Propio de este mockup */
  a.btn-primary, a.btn-primary:hover { color: var(--primary-foreground); }
  .slot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 560px; margin-top: 22px; padding: 24px; border: 1.5px dashed var(--input); border-radius: var(--radius-lg); text-align: center; color: var(--secondary-foreground); }
  .slot p { margin: 0; max-width: 52ch; }
  .slot .slot-t { font-weight: 600; color: var(--foreground); }
  @media (max-width: 900px) { .slot { min-height: 520px; } }
  @media (max-width: 600px) { .slot { margin-top: 16px; } }
`;

// ---------- Comportamiento (patrón «menu button» de WAI-ARIA, cajón y diálogo) ----------
const JS = `
(function () {
  var app = document.querySelector('.app');
  var mq = window.matchMedia('(max-width: 900px)');

  // Menú de la cuenta: Enter, Espacio o flecha abajo abren en el primer ítem; flecha arriba, en el último.
  var btn = document.getElementById('cuenta-btn');
  var pop = document.getElementById('cuenta-pop');
  var items = Array.prototype.slice.call(pop.querySelectorAll('[role="menuitem"]'));
  function enfocar(i) { items[(i + items.length) % items.length].focus(); }
  function abrirMenu(i) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); enfocar(i); }
  function cerrarMenu(devolverFoco) {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btn.focus();
  }
  btn.addEventListener('click', function () { if (pop.hidden) abrirMenu(0); else cerrarMenu(true); });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); abrirMenu(0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); abrirMenu(-1); }
  });
  pop.addEventListener('keydown', function (e) {
    var i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); enfocar(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); enfocar(0); }
    else if (e.key === 'End') { e.preventDefault(); enfocar(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrarMenu(true); }
    else if (e.key === 'Tab') { cerrarMenu(false); }
    else if (e.key === ' ' && i >= 0) { e.preventDefault(); items[i].click(); }
  });
  document.addEventListener('click', function (e) {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) cerrarMenu(false);
  });
  items.forEach(function (it) {
    it.addEventListener('click', function (e) {
      e.preventDefault();
      var esCerrarSesion = it.hasAttribute('data-cerrar-sesion');
      cerrarMenu(!esCerrarSesion);
      if (esCerrarSesion) abrirDialogo();
    });
  });

  // Diálogo «¿Cerrar la sesión en este dispositivo?»: foco inicial en Cancelar; Escape cancela.
  var velo = document.querySelector('.overlay');
  var dlg = document.querySelector('.dialog');
  var botones = Array.prototype.slice.call(dlg.querySelectorAll('button'));
  function abrirDialogo() { velo.hidden = false; dlg.hidden = false; app.inert = true; botones[0].focus(); }
  function cerrarDialogo() { velo.hidden = true; dlg.hidden = true; app.inert = false; btn.focus(); }
  // Cancelar vuelve al marco; en la app, confirmar revoca la sesión y lleva al inicio de sesión (CA-14 de 002).
  botones.forEach(function (b) { b.addEventListener('click', cerrarDialogo); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrarDialogo(); }
    if (e.key === 'Tab') {
      var ultimo = botones[botones.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); botones[0].focus(); }
      if (e.shiftKey && document.activeElement === botones[0]) { e.preventDefault(); ultimo.focus(); }
    }
  });

  // Cajón móvil: foco en el primer enlace al abrir; Escape, la X o el velo lo cierran y el foco vuelve al botón.
  var menuBtn = document.querySelector('.menu-btn');
  var cajon = document.getElementById('cajon');
  var veloCajon = document.querySelector('.drawer-overlay');
  var primero = document.getElementById('cajon-primero');
  function abrirCajon() { cajon.hidden = false; veloCajon.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); app.inert = true; primero.focus(); }
  function cerrarCajon(devolverFoco) {
    cajon.hidden = true; veloCajon.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); app.inert = false;
    if (devolverFoco) menuBtn.focus();
  }
  menuBtn.addEventListener('click', abrirCajon);
  Array.prototype.forEach.call(document.querySelectorAll('[data-cerrar-cajon]'), function (el) {
    el.addEventListener('click', function () { cerrarCajon(true); });
  });
  Array.prototype.forEach.call(cajon.querySelectorAll('.nav a'), function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); cerrarCajon(true); });
  });
  cajon.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !e.target.closest('.row-menu')) { e.preventDefault(); cerrarCajon(true); } });
  mq.addEventListener('change', function (e) { if (!e.matches && !cajon.hidden) cerrarCajon(false); });

  // Estado inicial de la hoja
  if (!pop.hidden) enfocar(0);
  if (!cajon.hidden) { if (mq.matches) { app.inert = true; primero.focus(); } else cerrarCajon(false); }
})();
`;

// ---------- Piezas propias ----------
function avisoSoloLectura(a) {
  if (!a) return '';
  return `
        <section class="readonly" aria-labelledby="ro-t">
          ${icon('lock', 20)}
          <p class="readonly-text"><strong id="ro-t">Tu cuenta está en solo lectura.</strong> ${a.cuerpo}</p>
          <a class="btn btn-primary btn-sm" href="#">Renovar plan</a>
        </section>`;
}

// 007: a 360 el cajón debe mostrar la tarjeta completa (con «Liberar espacio») sin recortarse
const CSS_TRAMO = '  @media (max-width: 900px) { .canvas { min-height: 940px; } }\n';

// 007: en los estados de tramo, la tarjeta de cuota lleva el texto del tramo con ícono y «Liberar espacio» (QuotaBar)
const conTarjeta = (html, v) => (v.tramo ? html.replace(M.cuota(v.cuota), Q.tarjeta(v.cuota)) : html);

function page(v) {
  const file = v.estado === 'default' ? 'layout.html' : `layout--${v.estado}.html`;
  const plan = v.plan || 'PERSONAL';
  const cuota = v.cuota || M.CUOTA;
  const activo = 'Mis archivos';
  // Accesos rápidos reemplaza a «Carpetas» (006): la barra y el cajón llevan la misma sección con ids distintos
  const acc = v.accesos ? { carpetas: [] } : {};
  // El menú ⋮ abierto vive en la barra (escritorio) o en el cajón (móvil), nunca en los dos a la vez
  const sinMenu = { ...v.accesos, menuEn: '' };
  const barra = v.accesos ? { ...acc, accesos: A.seccion(v.cajon ? sinMenu : v.accesos, 'barra') } : {};
  const cajonAcc = v.accesos ? { ...acc, accesos: A.seccion(v.cajon ? v.accesos : sinMenu, 'cajon') } : {};
  const cssAccesos = v.accesos ? `${S.CSS_MENU_FILA}${A.CSS}${E.CSS_ALERT}  @media (max-width: 600px) {
${E.CSS_ALERT_MQ600}  }
` : '';
  const aviso = v.aviso ? A.avisoTope() : '';
  // El cajón real se desplaza dentro del alto de la pantalla; aquí el lienzo crece para dibujarlo completo en la captura
  const cssCajon = v.cajonCompleto ? `  @media (max-width: 900px) { .canvas { min-height: ${v.cajonCompleto}px; } }` + String.fromCharCode(10) : '';
  return `${M.cabecera({
    titulo: `Layout de la app · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (PD-28, spec 000b: layout compartido de la aplicación). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa tokens, components/ui y AppLayout.',
      'Piezas del marco generadas con marco/marco.js, las mismas que identity/seguridad.',
    ],
    css: CSS + (v.tramo ? M.CSS.TRAMOS + Q.CSS_TARJETA + CSS_TRAMO : '') + cssAccesos + cssCajon,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">000b</span> <strong>Layout de la app</strong> <span class="file">${file}</span> <span>marco compartido · con sesión · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${conTarjeta(M.sidebar({ activo, plan, cuota, ...barra }), v)}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'], conMenu: true, menuAbierto: !!v.menu, cajonAbierto: !!v.cajon })}
      <main class="content" id="contenido">${avisoSoloLectura(v.soloLectura)}
        <div class="page-head">
          <h1>Mis archivos</h1>
        </div>${aviso}
        <div class="slot">
          <p class="slot-t">Contenido de la pantalla</p>
          <p>Cada pantalla (explorador, Plan y facturación, Seguridad…) dibuja aquí su contenido en su propio mockup.</p>
        </div>
      </main>
    </div>
  </div>${conTarjeta(M.cajon({ activo, plan, cuota, abierto: !!v.cajon, ...cajonAcc }), v)}${M.dialog(M.DIALOGO_CERRAR_SESION, { oculto: !v.dialogo })}
</div>

<script>${JS}${v.accesos ? E.JS_MENU + A.JS_QUITAR : ''}</script>
</body>
</html>
`;
}

// ---------- Estados de 007 CA-18 y CA-19: Mis archivos real dentro de una «ventana» de alto fijo ----------
// La hoja no puede desplazar la ventana del navegador, así que el lienzo hace de ventana (.ventana): la columna
// principal se desplaza sola con la barra superior fija (sticky) y la barra lateral queda quieta a todo el alto. En la
// app es el documento el que se desplaza; la barra lateral es sticky con el alto de la ventana (ver README).
const CSS_007 = CSS + S.CSS_LISTA + C.CSS_006 + Q.CSS_TARJETA + U.CSS_PANEL + B.CSS + `
  /* Ventana de alto fijo: el lienzo hace de ventana del navegador */
  .canvas.ventana { height: 820px; }
  .ventana .app { height: 100%; min-height: 0; }
  .ventana .main { min-height: 0; overflow-y: auto; }
  .ventana .topbar { position: sticky; top: 0; z-index: 4; }
  .more { display: flex; justify-content: center; margin-top: 16px; }

  /* Aviso (Toaster, ADR-0024; 007 CA-18): arriba y al centro, debajo de la barra superior (64 px + 16 px) y nunca
     sobre el panel de cargas, que sigue abajo a la derecha. Tokens del Toaster real: card, foreground, border,
     radius-md, shadow-modal; ícono de éxito en success-foreground. */
  .toast { top: 80px; bottom: auto; left: 50%; right: auto; transform: translateX(-50%); border-radius: var(--radius-md); }

  @media (max-width: 900px) {
` + U.CSS_PANEL_MQ900 + `    .canvas.ventana { height: 720px; }
  }
  @media (max-width: 600px) {
` + S.CSS_LISTA_MQ600 + C.CSS_006_MQ600 + U.CSS_PANEL_MQ600_HOJA + U.CSS_PANEL_MQ600_FILAS + `    .ventana .app { min-height: 0; }
    /* A 360 px el aviso ocupa el ancho disponible, debajo de la barra superior (64 px + 8 px) */
    .toast { top: 72px; bottom: auto; left: 8px; right: 8px; transform: none; }
    .more .btn { width: 100%; min-height: 44px; }
  }
`;

// En la app el aviso se retira solo a los 8 s y se pausa con el puntero o el foco (ADR-0024); aquí, solo con la X.
const JS_007 = `
(function () {
  var m = document.querySelector('[data-desplazar="fin"]');
  if (m) m.scrollTop = m.scrollHeight;
  var t = document.querySelector('.toast');
  if (t) t.querySelector('.icon-btn').addEventListener('click', function () { t.hidden = true; });
})();
` + B.JS;

const tablaRaiz = (nodos) => C.encabezado(['Mis archivos']) + C.tabla(nodos, 'Mis archivos');
const cargarMas = () => `
        <div class="more">
          <button class="btn btn-outline" type="button">Cargar más</button>
        </div>`;

function pagina007(v) {
  const file = `layout--${v.estado}.html`;
  const barra = { activo: 'Mis archivos', plan: Q.PLAN, cuota: Q.CUOTAS.ok, contadorPapelera: v.papelera, central: B.regionCarpetas(v.carpetas) };
  return `${M.cabecera({
    titulo: `Layout de la app · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (spec 007, ${v.ca}: layout compartido de la aplicación). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa tokens, components/ui y AppLayout.',
      'Barra lateral en tres bloques (layout/barra.js); tabla de 006 (carpetas/carpetas.js); panel de cargas de 005 (carga/panel.js).',
    ],
    css: CSS_007,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">007</span> <strong>Layout de la app</strong> <span class="file">${file}</span> <span>marco compartido · plan Personal (ejemplo) · estado: ${v.titulo}</span></aside>

<div class="canvas ventana">
  <div class="app">
    ${B.sidebar(barra)}
    <div class="main"${v.desplazar ? ' data-desplazar="fin"' : ''}>
      ${M.topbar({ crumbs: ['Mis archivos'], conMenu: true, cajonAbierto: !!v.cajon })}
      <main class="content" id="contenido">${tablaRaiz(v.nodos)}${v.desplazar ? cargarMas() : ''}
      </main>
    </div>
  </div>${v.panel ? U.panel(v.panel) : ''}${v.aviso ? C.toast(v.aviso) : ''}${B.cajon({ ...barra, abierto: !!v.cajon })}${M.dialog(M.DIALOGO_CERRAR_SESION, { oculto: true })}
</div>

<script>${JS}${JS_007}</script>
</body>
</html>
`;
}

// Datos de ejemplo (plan Personal: 50 MB por archivo). [tipo, nombre, tamaño, modificado]
const carpeta = (n, f) => ['carpeta', n, '', f];
const archivo = (n, t, f) => ['archivo', n, t, f];
const SUBIDOS = [
  archivo('Acta_comite_sep.docx', '96 KB', 'hace 1 min'),
  archivo('Presupuesto_2027.xlsx', '1.3 MB', 'hace 1 min'),
  archivo('Cronograma_tesis.pdf', '2.2 MB', 'hace 1 min'),
];
const RAIZ_CORTA = [
  ...C.CARPETAS_RAIZ.map((n, i) => carpeta(n, ['hace 2 h', 'ayer', '28 sep'][i])),
  ...SUBIDOS,
  archivo('Propuesta_Nimbo_v3.docx', '2.4 MB', 'hoy · 09:12'),
  archivo('Modelo_ER_Nimbo.pdf', '1.1 MB', 'ayer'),
];
// Raíz con 12 carpetas de primer nivel: no caben en la región central de la barra y se desplazan ahí.
const CARPETAS_MUCHAS = ['Proyecto Alpha', 'Documentos Legales', 'Finanzas', 'Tesis', 'Clases 2026', 'Facturas',
  'Fotos de campo', 'Investigación', 'Contratos', 'Presentaciones', 'Plantillas', 'Personales'];
const FECHAS = ['hace 2 h', 'ayer', '28 sep', '27 sep', '25 sep', '24 sep', '20 sep', '18 sep', '15 sep', '12 sep', '9 sep', '2 sep'];
// Primera página (20 elementos; el tamaño de página lo fija el plan): las 12 carpetas y 8 archivos, con «Cargar más».
const RAIZ_LARGA = [
  ...CARPETAS_MUCHAS.map((n, i) => carpeta(n, FECHAS[i])),
  archivo('Manual_de_usuario_borrador.docx', '4.2 MB', 'hoy · 08:40'),
  archivo('Informe_avance_fase1.docx', '1.4 MB', '29 sep'),
  archivo('Cronograma_fases.xlsx', '212 KB', '27 sep'),
  archivo('Presentacion_avance.pptx', '22.9 MB', '26 sep'),
  archivo('Diagrama_ER_v4.pdf', '2.7 MB', '25 sep'),
  archivo('Mockups_explorador.pdf', '14.5 MB', '20 sep'),
  archivo('Guia_de_estilo_UI.pdf', '9.8 MB', '12 sep'),
  archivo('Casos_de_uso_completos.pdf', '6.4 MB', '10 sep'),
];
const subido = ([, nombre, meta]) => ({ nombre, meta, st: 'subido', stCls: 'st-ok', done: true });

const ESTADOS_007 = [
  {
    estado: 'aviso-arriba-centro', ca: 'CA-18',
    titulo: 'aviso de éxito arriba y al centro, debajo de la barra superior; el panel de cargas sigue abajo a la derecha (CA-18)',
    carpetas: C.CARPETAS_RAIZ, papelera: '7', nodos: RAIZ_CORTA,
    aviso: { texto: 'Movimos «Informe.docx» a la papelera.', accion: 'Ver papelera' },
    panel: { titulo: '3 archivos subidos', sub: '3 de 3', activas: false, anuncio: '', items: SUBIDOS.map(subido) },
  },
  {
    estado: 'barra-fija-lista-larga', ca: 'CA-19',
    titulo: 'lista larga desplazada: la barra lateral queda fija, con la cuota al pie y las carpetas con desplazamiento propio (CA-19; a 360, en el cajón)',
    carpetas: CARPETAS_MUCHAS, papelera: '6', nodos: RAIZ_LARGA, desplazar: true, cajon: true,
  },
];

// ---------- Estados ----------
const ESTADOS = [
  { estado: 'default', titulo: 'default (Mis archivos, plan Personal al 21 %)' },
  { estado: 'menu-cuenta-abierto', titulo: 'menú de la cuenta abierto', menu: true },
  { estado: 'confirmar-cerrar-sesion', titulo: '«Cerrar sesión» desde el menú de la cuenta pide confirmación', dialogo: true },
  {
    estado: 'solo-lectura', titulo: 'cuenta en solo lectura por plan vencido (RF-23)',
    plan: 'PRO', cuota: { usado: '21 GB', total: '100 GB', pct: 21 },
    soloLectura: { cuerpo: 'Tu plan Pro venció el 20 sep 2026. Tus archivos siguen aquí: puedes verlos y descargarlos, pero no subir ni editar hasta que renueves.' },
  },
  {
    estado: 'cuota-70', titulo: 'cuota en el tramo 70–89 %: «Tu cuota está al 82 %.» y «Liberar espacio» (spec 007; a 360, en el cajón)',
    tramo: true, cuota: Q.CUOTAS.warn, cajon: true,
  },
  {
    estado: 'cuota-90', titulo: 'cuota en el tramo 90–99 %: «Espacio casi agotado.» y «Liberar espacio» (spec 007; a 360, en el cajón)',
    tramo: true, cuota: Q.CUOTAS.full, cajon: true,
  },
  { estado: 'movil-cajon-abierto', titulo: 'cajón de navegación abierto (solo por debajo de 900 px)', cajon: true },
  // Accesos rápidos (006, CA-27 y CA-28)
  {
    estado: 'fijados-y-recientes', titulo: 'Accesos rápidos con 5 fijados y 3 recientes, carpetas y archivos mezclados',
    accesos: { fijados: A.FIJADOS_5, recientes: A.RECIENTES.slice(0, 3) },
  },
  {
    estado: 'solo-recientes', titulo: 'Accesos rápidos sin fijados: solo el grupo Recientes',
    accesos: { recientes: A.RECIENTES.slice(0, 3) },
  },
  {
    estado: 'solo-fijados', titulo: 'Accesos rápidos sin recientes: solo el grupo Fijados',
    accesos: { fijados: A.FIJADOS_5.slice(0, 3) },
  },
  {
    estado: 'con-ver-mas', titulo: 'hay más recientes que los visibles: «Ver más» lleva a Mis archivos',
    // El tercer reciente tiene un nombre largo: se corta con «…» y el título completo queda en `title` y en el nombre accesible
    accesos: { fijados: A.FIJADOS_5, recientes: [...A.RECIENTES.slice(0, 2), ['archivo', 'Informe_final_de_resultados_septiembre.docx'], ...A.RECIENTES.slice(3)], verMas: true },
  },
  {
    estado: 'sin-accesos', titulo: 'sin fijados ni recientes: la sección se oculta',
    accesos: { fijados: [], recientes: [] },
  },
  {
    estado: 'tope-de-fijados', titulo: 'sexto fijado: aviso «Ya fijaste 5 elementos…» y no cambia nada (CA-28)',
    accesos: { fijados: A.FIJADOS_5, recientes: A.RECIENTES, verMas: true }, aviso: true,
  },
  {
    estado: 'fijado-menu-abierto', titulo: 'menú ⋮ de un fijado abierto en la barra lateral: «Quitar de la barra lateral» (CA-27)',
    accesos: { fijados: A.FIJADOS_5, recientes: A.RECIENTES, verMas: true, menuEn: 'Finanzas' },
  },
  {
    estado: 'movil-cajon-con-accesos', titulo: 'cajón de navegación con Accesos rápidos a 360 px (5 + 3, «Ver más»)',
    cajon: true, cajonCompleto: 1032, accesos: { fijados: A.FIJADOS_5, recientes: A.RECIENTES, verMas: true },
  },
  {
    estado: 'movil-cajon-fijado-menu-abierto', titulo: 'cajón con el menú ⋮ de un fijado abierto a 360 px (CA-27)',
    cajon: true, cajonCompleto: 1032, accesos: { fijados: A.FIJADOS_5, recientes: A.RECIENTES, verMas: true, menuEn: 'Matriz_Requisitos_RF.xlsx' },
  },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'layout.html' : `layout--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
for (const v of ESTADOS_007) {
  const file = `layout--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), pagina007(v), 'utf8');
  console.log(file);
}
