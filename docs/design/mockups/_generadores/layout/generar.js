// Genera los mockups autocontenidos de shared/layout (marco de la aplicación, PD-28), un archivo por estado.
// Uso: node generar.js <ruta-del-worktree>
// Las piezas comunes (barra lateral, barra superior, menú de la cuenta, cajón y diálogo) vienen de marco/marco.js,
// las mismas que usa identity/seguridad.
const fs = require('node:fs');
const path = require('node:path');
const M = require('../marco/marco.js');

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
  cajon.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); cerrarCajon(true); } });
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

function page(v) {
  const file = v.estado === 'default' ? 'layout.html' : `layout--${v.estado}.html`;
  const plan = v.plan || 'PERSONAL';
  const cuota = v.cuota || M.CUOTA;
  const activo = 'Mis archivos';
  return `${M.cabecera({
    titulo: `Layout de la app · Nimbo — ${v.titulo}`,
    comentarios: [
      `Mockup de referencia (PD-28, spec 000b: layout compartido de la aplicación). Estado: ${v.estado}.`,
      'Colores: valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa tokens, components/ui y AppLayout.',
      'Piezas del marco generadas con marco/marco.js, las mismas que identity/seguridad.',
    ],
    css: CSS,
  })}
<body>

<aside class="sheet-label" aria-label="Rótulo del mockup"><span class="chip">000b</span> <strong>Layout de la app</strong> <span class="file">${file}</span> <span>marco compartido · con sesión · estado: ${v.titulo}</span></aside>

<div class="canvas">
  <div class="app"${v.dialogo ? ' inert' : ''}>
    ${M.sidebar({ activo, plan, cuota })}
    <div class="main">
      ${M.topbar({ crumbs: ['Mis archivos'], conMenu: true, menuAbierto: !!v.menu, cajonAbierto: !!v.cajon })}
      <main class="content" id="contenido">${avisoSoloLectura(v.soloLectura)}
        <div class="page-head">
          <h1>Mis archivos</h1>
        </div>
        <div class="slot">
          <p class="slot-t">Contenido de la pantalla</p>
          <p>Cada pantalla (explorador, Plan y facturación, Seguridad…) dibuja aquí su contenido en su propio mockup.</p>
        </div>
      </main>
    </div>
  </div>${M.cajon({ activo, plan, cuota, abierto: !!v.cajon })}${M.dialog(M.DIALOGO_CERRAR_SESION, { oculto: !v.dialogo })}
</div>

<script>${JS}</script>
</body>
</html>
`;
}

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
  { estado: 'movil-cajon-abierto', titulo: 'cajón de navegación abierto (solo por debajo de 900 px)', cajon: true },
];

for (const v of ESTADOS) {
  const file = v.estado === 'default' ? 'layout.html' : `layout--${v.estado}.html`;
  fs.writeFileSync(path.join(OUT, file), page(v), 'utf8');
  console.log(file);
}
