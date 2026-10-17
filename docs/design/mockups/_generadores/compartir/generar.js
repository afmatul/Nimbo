// Genera los estados de sharing/compartir (spec 012): el diálogo «Compartir» con la lista de accesos (AccessList),
// abierto desde el menú ⋮ de una fila de Mis archivos. Solo Lector y Editor (RN-1); sin enlace público ni «externos»
// (013 y fuera de alcance). Uso: node generar.js <ruta-del-worktree>
// Piezas de 012: comparticion/ (corpus y página); explorador de fondo: explorador/desglose.js y carpetas/carpetas.js;
// confirmación destructiva: carpetas/carpetas.js (marco/marco.js); aviso warning en diálogo: mis-archivos/estados.js.
const S = require('../mis-archivos/mis-archivos.js');
const E = require('../mis-archivos/estados.js');
const C = require('../carpetas/carpetas.js');
const D = require('../explorador/desglose.js');
const K = require('../comparticion/corpus.js');
const X = require('../comparticion/piezas.js');

const { icon } = X;
const T = K.TEXTOS;

// ---------- CSS propio ----------
const CSS = X.css({
  escritorio: D.CSS + E.CSS_DLG_WARN + `
  /* Diálogo «Compartir» (Dialog de shadcn). En la app se desplaza dentro de la ventana; aquí la hoja crece con él:
     el diálogo y la app comparten la celda de una rejilla, así la captura lo muestra completo a cualquier ancho. */
  .canvas:has(.dialog-share) { display: grid; }
  .canvas:has(.dialog-share) > .app, .dialog.dialog-share { grid-area: 1 / 1; }
  .dialog.dialog-share { position: relative; top: auto; left: auto; transform: none; justify-self: center; align-self: start; margin: 88px 0 32px; width: min(600px, calc(100% - 32px)); padding: 22px 24px 24px; }
  .share-head { display: flex; align-items: flex-start; gap: 12px; }
  .share-head > div { flex: 1; min-width: 0; }
  .share-head h2 { overflow-wrap: anywhere; }
  .share-head .icon-btn { margin: -8px -10px 0 0; color: var(--secondary-foreground); }
  .dialog .share-head p { margin-top: 4px; font-size: 13.5px; }
  .share-row { display: flex; align-items: flex-end; gap: 10px; }
  .share-row .field { margin-top: 16px; }
  .share-email { flex: 1; min-width: 0; }
  .share-row .btn { min-height: 46px; }
  .select { min-height: 40px; max-width: 100%; padding: 6px 12px; border: 1px solid var(--input); border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font: inherit; font-size: 14px; }
  .select:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
  .share-level .select { min-height: 46px; min-width: 116px; }
  .dialog .share-help { margin: 8px 0 0; font-size: 13px; color: var(--secondary-foreground); }
  .dialog .share-ok { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; font-size: 13.5px; color: var(--success-foreground); font-weight: 500; }
  .share-ok .ico { margin-top: 1px; }
  .dlg-alert strong { display: block; color: var(--destructive) !important; font-weight: 600; }
  .dlg-alert .btn { margin-top: 10px; }

  /* Lista de accesos (AccessList) */
  .acl { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
  .acl h3 { margin: 0; font-size: 14px; font-weight: 600; }
  .acl-list { list-style: none; margin: 6px 0 0; padding: 0; }
  .acl-item { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: var(--radius-md); }
  .acl-item.is-hit { background: var(--accent); box-shadow: inset 3px 0 0 var(--brand); }
  .acl-item.is-hit .acl-meta { color: var(--secondary-foreground); }
  .acl-who { flex: 1; min-width: 0; }
  .dialog .acl-who p { margin: 0; }
  .dialog .acl-name { font-size: 14px; font-weight: 600; color: var(--foreground); overflow-wrap: anywhere; }
  .dialog .acl-meta { font-size: 12.5px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .dialog .acl-meta.acl-rige { color: var(--secondary-foreground); }
  .acl-ctl { display: flex; align-items: center; gap: 8px; flex: none; }
  .acl-ctl .select { min-height: 36px; font-size: 13.5px; }
  .acl-busy { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--secondary-foreground); }
  .acl-busy .ico { color: var(--primary); }
  .dialog .acl-empty { margin: 4px 8px 0; font-size: 13.5px; color: var(--secondary-foreground); }
  .acl-group { margin-top: 14px; }
  .acl-group h4 { display: flex; align-items: center; gap: 8px; margin: 0; padding: 0 8px; font-size: 13px; font-weight: 600; color: var(--foreground); }
  .acl-group h4 .ico { color: var(--primary); }
  .dialog .acl-note { margin: 2px 0 0; padding: 0 8px; font-size: 12.5px; color: var(--secondary-foreground); }
  .acl-note a { display: inline-flex; align-items: center; min-height: 24px; font-weight: 600; }
  .acl-sk { display: flex; align-items: center; gap: 12px; padding: 12px 8px; }
  .acl-sk .skeleton-line.tile { width: 32px; height: 32px; border-radius: 999px; }
  .acl-sk > div { flex: 1; }
`,
  movil: `    .dialog.dialog-share { margin: 72px 0 16px; width: calc(100% - 16px); padding: 18px 14px 16px; }
    .share-head .icon-btn { margin: -10px -8px 0 0; }
    .share-row { flex-direction: column; align-items: stretch; gap: 0; }
    .share-row .btn, .share-level .select { width: 100%; min-height: 44px; margin-top: 12px; }
    .share-level { margin-top: 0; }
    .acl-item { flex-wrap: wrap; padding: 12px 6px; }
    .acl-ctl { width: 100%; padding-left: 44px; }
    .acl-ctl .select { flex: 1; min-height: 44px; }
    .acl-ctl .btn { min-height: 44px; }
    .acl-note a { display: flex; min-height: 44px; }
    .dlg-alert .btn { width: 100%; min-height: 44px; }
`,
});

// ---------- Fondo: Mis archivos (006, con el menú ⋮ de 012) ----------
// «Compartir» va después de «Descargar» en los archivos y primero en las carpetas (que no tienen «Descargar»); se
// busca por su texto para no depender de la posición. Solo el propietario lo ve (RN-1).
function menuPropietario(n) {
  const items = D.menuDe(n);
  const descargar = items.findIndex((it) => it.includes('<span>Descargar</span>'));
  items.splice(descargar + 1, 0, X.itemMenu('userPlus', 'Compartir'));
  return items;
}
const fondoRaiz = (menuEn = '') => () => C.encabezado(['Mis archivos']) + D.tabla(K.RAIZ, { menu: menuPropietario, menuEn });
const fondoAlpha = () => C.encabezado(['Mis archivos', K.ALPHA]) + D.tabla(K.EN_ALPHA, { lugar: K.ALPHA, menu: menuPropietario });

// ---------- Formulario: correo, nivel y «Compartir» ----------
// f: { correo, nivel, error, enviando, bloqueado }
function campoCorreo(f) {
  const describe = ['sh-ayuda', f.error ? 'sh-error' : '', f.bloqueado ? 'sh-lim' : ''].filter(Boolean).join(' ');
  return `
        <div class="field share-email">
          <label for="sh-correo">Correo de la persona</label>
          <div class="input-group"><input id="sh-correo" name="correo" type="email" inputmode="email" autocomplete="off" spellcheck="false" value="${f.correo || ''}" aria-describedby="${describe}"${f.error ? ' aria-invalid="true" autofocus' : ''}${f.autofocus ? ' autofocus' : ''}${f.enviando ? ' readonly' : ''}></div>
        </div>`;
}
const opciones = (elegido) => ['Lector', 'Editor'].map((n) => `<option${n === elegido ? ' selected' : ''}>${n}</option>`).join('');
const campoNivel = (f) => `
        <div class="field share-level">
          <label for="sh-nivel">Nivel</label>
          <select class="select" id="sh-nivel" name="nivel"${f.enviando ? ' disabled' : ''}>${opciones(f.nivel || 'Lector')}</select>
        </div>`;
function botonCompartir(f) {
  if (f.enviando) return `<button class="btn btn-primary btn-busy" type="submit" disabled>${icon('loader', 16, 'spin')}<span>Compartiendo…</span></button>`;
  return `<button class="btn btn-primary" type="submit"${f.bloqueado ? ' disabled' : ''}>${icon('userPlus', 16)}<span>Compartir</span></button>`;
}
function formulario(f) {
  const error = f.error ? `
      <p class="field-error" id="sh-error" role="alert">${icon('alert', 15)}<span>${f.error}</span></p>` : '';
  const anuncio = f.enviando ? `<p class="sr-only" role="status">Compartiendo con ${f.correo}…</p>` : '';
  const ayuda = `Lector: ${K.NIVELES.Lector.puede}. Editor: ${K.NIVELES.Editor.puede}.`;
  return `${f.bloqueado ? E.avisoDialogo({ id: 'sh-lim', titulo: T.intentos(5), texto: 'Mientras tanto, puedes cambiar niveles o quitar accesos en la lista.' }) : ''}
    <form class="share-form" novalidate${f.enviando ? ' aria-busy="true"' : ''}>
      <div class="share-row">${campoCorreo(f)}${campoNivel(f)}
        ${botonCompartir(f)}
      </div>${error}
      <p class="share-help" id="sh-ayuda">${ayuda}</p>${anuncio}
    </form>${f.exito ? `
    <p class="share-ok" role="status">${icon('ok', 18)}<span>${f.exito}</span></p>` : ''}`;
}

// ---------- Lista de accesos ----------
const desde = (a) => (a.desde === 'hoy' ? 'desde hoy' : `desde el ${a.desde}`);
const quien = (p, meta, extra = '') => `${X.avatar(p)}
          <div class="acl-who"><p class="acl-name">${p.nombre}</p><p class="acl-meta">${meta}</p>${extra}</div>`;
const filaPropietario = () => `
        <li class="acl-item">${quien({ ...K.YO, nombre: `${K.YO.nombre} (tú)` }, K.YO.correo)}
          <div class="acl-ctl">${X.nivel('Propietario')}</div>
        </li>`;

// l: { resaltar, cambiando: { nombre, a }, nuevo }. El nivel se cambia al elegirlo (sin «Guardar»); revocar confirma.
function controles(a, l) {
  const c = l.cambiando && l.cambiando.nombre === a.nombre ? l.cambiando : null;
  const nivel = c ? c.a : a.nivel;
  const ocupado = c ? `<span class="acl-busy" aria-hidden="true">${icon('loader', 14, 'spin')}Guardando…</span><span class="sr-only" role="status">Cambiando el nivel de ${a.nombre} a ${c.a}…</span>` : '';
  const id = `nivel-${a.iniciales}`;
  return `
          <div class="acl-ctl">
            <label class="sr-only" for="${id}">Nivel de ${a.nombre}</label>
            <select class="select" id="${id}"${c ? ' disabled' : ''}>${opciones(nivel)}</select>${ocupado}
            <button class="btn btn-outline btn-sm" type="button" aria-label="Quitar el acceso de ${a.nombre}"${c ? ' disabled' : ''}>Quitar</button>
          </div>`;
}
function filaDirecta(a, l) {
  const nuevo = l.nuevo === a.nombre ? '<span class="badge-new">NUEVO</span>' : '';
  const hit = l.resaltar === a.nombre ? ' is-hit' : '';
  return `
        <li class="acl-item${hit}">${quien({ ...a, nombre: `${a.nombre}${nuevo}` }, `${a.correo} · ${desde(a)}`)}${controles(a, l)}
        </li>`;
}

// Heredados de una carpeta: sin controles; se gestionan en la carpeta de origen (CA-6). Si la persona también tiene
// acceso directo, rige el mayor (CA-20, RN-6) y se dice en texto.
function filaHeredada(a, directos) {
  const directo = directos.find((d) => d.nombre === a.nombre);
  const rige = directo && directo.nivel !== a.nivel ? `<p class="acl-meta acl-rige">Rige su acceso directo: ${directo.nivel}</p>` : '';
  return `
          <li class="acl-item">${quien(a, `${a.correo} · ${desde(a)}`, rige)}
            <div class="acl-ctl">${X.nivel(a.nivel)}</div>
          </li>`;
}
function grupoHeredado({ origen, accesos }, directos) {
  return `
      <div class="acl-group" role="group" aria-labelledby="acl-h">
        <h4 id="acl-h">${icon('folder', 16)}<span>Heredado de «${origen}»</span></h4>
        <p class="acl-note">Estos accesos se cambian o se quitan en esa carpeta. <a href="compartir--con-accesos-carpeta.html">Gestionar en «${origen}»</a></p>
        <ul class="acl-list">${accesos.map((a) => filaHeredada(a, directos)).join('')}
        </ul>
      </div>`;
}

const esqueleto = () => {
  const fila = (w) => `<div class="acl-sk"><span class="skeleton-line tile"></span><div><span class="skeleton-line ${w}"></span></div></div>`;
  return `
      <div aria-hidden="true">${['w55', 'w40', 'w45'].map(fila).join('')}</div>
      <p class="loading-text" role="status">${icon('loader', 16, 'spin')}Cargando quién tiene acceso…</p>`;
};
const errorLista = () => `
      <div class="dlg-alert" role="alert">${icon('alert', 18)}<div><p><strong>No pudimos cargar quién tiene acceso.</strong>Tus accesos siguen igual. Inténtalo de nuevo en unos segundos.</p>
        <button class="btn btn-outline btn-sm" type="button">${icon('retry', 14)}<span>Reintentar</span></button></div></div>`;

// l: { estado: 'cargando' | 'error', directos, heredado: { origen, accesos }, vacio, … }
function contenidoLista(l, nombre) {
  if (l.estado === 'cargando') return esqueleto();
  if (l.estado === 'error') return errorLista();
  const directos = l.directos || [];
  const vacio = directos.length ? '' : `
      <p class="acl-empty">Aún no compartes «${nombre}» con nadie.</p>`;
  return `
      <ul class="acl-list" aria-labelledby="acl-t">${filaPropietario()}${directos.map((a) => filaDirecta(a, l)).join('')}
      </ul>${vacio}${l.heredado ? grupoHeredado(l.heredado, directos) : ''}`;
}
const lista = (l, nombre) => `
    <section class="acl" aria-labelledby="acl-t"${l.estado === 'cargando' ? ' aria-busy="true"' : ''}>
      <h3 id="acl-t">Personas con acceso</h3>${contenidoLista(l, nombre)}
    </section>`;

// ---------- Diálogo ----------
// d: { recurso: { tipo, nombre, lugar }, form, lista }. debajo: hay un diálogo de confirmación encima (inert).
function dialogoCompartir(d, debajo = false) {
  const { tipo, nombre, lugar } = d.recurso;
  const tile = tipo === 'carpeta' ? `<span class="ftile ftile-folder">${icon('folder', 16)}</span>` : S.tile(nombre);
  return `
  <div class="overlay" aria-hidden="true"></div>
  <div class="dialog dialog-share" role="dialog" aria-modal="true" aria-labelledby="sh-t" aria-describedby="sh-d"${debajo ? ' inert' : ''}>
    <div class="share-head">
      ${tile}
      <div>
        <h2 id="sh-t">Compartir «${X.partible(nombre)}»</h2>
        <p id="sh-d">${tipo === 'carpeta' ? 'Carpeta' : 'Archivo'} en ${lugar}. Comparte con cuentas de Nimbo; no enviamos aviso por correo: lo verán en «Compartido conmigo».</p>
      </div>
      <button class="icon-btn" type="button" aria-label="Cerrar">${icon('x', 20)}</button>
    </div>${formulario(d.form || { autofocus: true })}${lista(d.lista, nombre)}
  </div>`;
}

// ---------- Estados ----------
const ALPHA = { tipo: 'carpeta', nombre: K.ALPHA, lugar: 'Mis archivos' };
const PLAN = { tipo: 'archivo', nombre: K.PLAN_TRABAJO, lugar: K.ALPHA };
const CON_TRES = { directos: K.ACCESOS_ALPHA };
const SIN_LAURA = { directos: K.ACCESOS_ALPHA.slice(1) };
const [LAURA, SOFIA, JAVIER] = K.ACCESOS_ALPHA;

// e: { estado, titulo, recurso, form, lista, encima (confirmación), js }
function estado(e) {
  const recurso = e.recurso || ALPHA;
  const raiz = recurso === ALPHA;
  const dialogo = dialogoCompartir({ recurso, form: e.form, lista: e.lista }, !!e.encima);
  return {
    estado: e.estado, titulo: e.titulo, activo: 'Mis archivos', modal: true,
    crumbs: raiz ? ['Mis archivos'] : ['Mis archivos', K.ALPHA],
    cuerpo: raiz ? fondoRaiz() : fondoAlpha, capa: dialogo + (e.encima || ''),
  };
}

const PANTALLA = {
  nombre: 'compartir', rotulo: 'Compartir y accesos', css: CSS,
  contexto: 'diálogo sobre Mis archivos · solo el propietario · Lector o Editor',
};

const ESTADOS = [
  {
    estado: 'menu-fila', titulo: 'entrada: menú ⋮ de una carpeta propia con «Compartir» (RN-1)', activo: 'Mis archivos',
    crumbs: ['Mis archivos'], cuerpo: fondoRaiz(K.ALPHA), js: D.JS_MENU,
  },
  estado({ estado: 'sin-accesos', titulo: 'nadie más tiene acceso: solo la propietaria y el formulario', lista: { directos: [] } }),
  estado({ estado: 'cargando', titulo: 'cargando la lista de accesos (esqueleto)', lista: { estado: 'cargando' } }),
  estado({
    estado: 'con-accesos', titulo: 'archivo con accesos directos y heredados de su carpeta; los heredados sin controles (CA-6, CA-20)',
    recurso: PLAN, lista: { directos: K.DIRECTOS_PLAN, heredado: { origen: K.ALPHA, accesos: K.ACCESOS_ALPHA } },
  }),
  estado({ estado: 'con-accesos-carpeta', titulo: 'carpeta con tres accesos directos: nivel y «Quitar» por persona (CA-6)', lista: CON_TRES }),
  estado({
    estado: 'agregando', titulo: 'compartiendo (> 2 s): campos y botón deshabilitados, indicador y anuncio (CA-1)',
    form: { correo: LAURA.correo, nivel: 'Editor', enviando: true }, lista: SIN_LAURA,
  }),
  estado({
    estado: 'compartido', titulo: 'éxito: la persona aparece arriba con «NUEVO» y el campo queda listo para otra (CA-1, RN-11)',
    form: { autofocus: true, exito: `Compartiste «${K.ALPHA}» con ${LAURA.nombre} como ${LAURA.nivel}. Ya lo ve en «Compartido conmigo».` },
    lista: { ...CON_TRES, nuevo: LAURA.nombre },
  }),
  estado({
    estado: 'error-correo-generico', titulo: 'correo sin cuenta, sin verificar, suspendida o interna: el mismo mensaje en los cuatro casos (CA-2)',
    form: { correo: K.DIEGO.correo, nivel: 'Lector', error: T.correoGenerico(K.DIEGO.correo) }, lista: CON_TRES,
  }),
  estado({
    estado: 'error-propio', titulo: `el correo propio: «${T.propio}» (CA-3)`,
    form: { correo: K.YO.correo, nivel: 'Editor', error: T.propio }, lista: CON_TRES,
  }),
  estado({
    estado: 'ya-tiene-acceso', titulo: 'ya tiene acceso directo: no se duplica y se resalta su fila (CA-4)',
    form: { correo: SOFIA.correo, nivel: 'Editor', error: T.yaTiene(SOFIA.nombre) }, lista: { ...CON_TRES, resaltar: SOFIA.nombre },
  }),
  estado({
    estado: 'cambiando-nivel', titulo: 'cambiando Lector → Editor: la fila muestra «Guardando…» y se anuncia (CA-7)',
    lista: { ...CON_TRES, cambiando: { nombre: SOFIA.nombre, a: 'Editor' } },
  }),
  estado({
    estado: 'confirmar-revocar', titulo: 'confirmar «Quitar»: consecuencia explícita y foco en «Cancelar» (CA-8)', lista: CON_TRES,
    encima: C.confirmar({ titulo: `¿Quitar el acceso de ${JAVIER.nombre}?`, cuerpo: T.revocar(JAVIER.nombre, ALPHA), boton: 'Quitar acceso' }),
  }),
  estado({
    estado: 'demasiados-intentos', titulo: 'límite de intentos (429): aviso con la espera y «Compartir» deshabilitado (CA-5)',
    form: { correo: K.CARMEN.correo, nivel: 'Lector', bloqueado: true }, lista: CON_TRES,
  }),
  estado({ estado: 'error', titulo: 'la lista de accesos no cargó: causa y «Reintentar»', lista: { estado: 'error' } }),
];

X.generar(PANTALLA, ESTADOS);
