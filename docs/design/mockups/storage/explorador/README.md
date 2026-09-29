# Mockup: Explorador de archivos

- **Spec**: 005–007 (005: explorador mínimo de la raíz con «Subir archivos», arrastrar y soltar y «Descargar», §9)
- **Propuesta presentada**: p. 08 (cuadricula) y p. 09 (lista). Los estados de 005 (`vacio`, `cargando`, `arrastre`,
  `error`, `acciones`, `descarga-preparando`, `descarga-fallida`) no se presentaron.
- **Cambios respecto de la propuesta**: ninguno en `cuadricula` ni `lista`; al implementar, el botón principal usa el
  token corregido (DF-41) en lugar de `#6B8DD6`.
- **Origen**: dos tecnologías en la misma carpeta.
  - `explorador--cuadricula.html` y `explorador--lista.html`: HTML empaquetado y autocontenido de la propuesta (Cielo
    Sereno original, lienzo de ≈ 1490 px con el rótulo de la hoja). No se generan.
  - `explorador--{vacio,cargando,arrastre,error,acciones,descarga-preparando,descarga-fallida}.html` (spec 005): HTML autocontenido generado con
    `../../_generadores/explorador/generar.js`; no se edita a mano. El marco sale de `_generadores/marco/marco.js` y la
    página «Mis archivos» (encabezado, tabla de la raíz con el menú ⋮, tipos de archivo, cuota por tramos y barra
    lateral de 005) de `_generadores/mis-archivos/mis-archivos.js`, **el mismo módulo** que usa `storage/carga`. Tonos
    AA de `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`, versión móvil real a 360 px.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos**:
  - cuadricula (`explorador--cuadricula.html`, propuesta p. 08)
  - lista con 2 elementos seleccionados (`explorador--lista.html`, propuesta p. 09)
  - vacio: raíz sin archivos, con la invitación a subir (`explorador--vacio.html`, 005)
  - cargando: esqueleto de la lista mientras llega el listado de la raíz (`explorador--cargando.html`, 005)
  - arrastre: archivos arrastrados sobre Mis archivos, con la zona de soltar resaltada (`explorador--arrastre.html`,
    005)
  - error: falló el listado de la raíz; error con «Reintentar» (`explorador--error.html`, 005)
  - acciones: menú ⋮ de la primera fila abierto con «Descargar», la única acción de 005 (`explorador--acciones.html`,
    005)
  - descarga-preparando: la URL firmada tarda más de 2 s; el ítem «Descargar» queda deshabilitado con «Preparando…»
    (`explorador--descarga-preparando.html`, 005)
  - descarga-fallida: falló la descarga por límite de tasa (`429`); aviso arriba de la lista con «Reintentar»
    (`explorador--descarga-fallida.html`, 005)
- **Capturas**: `docs/design/capturas/storage/explorador/` (`explorador--<estado>--<360|1440>.png`). En los siete
  estados de 005: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de
  consola y sin objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta). En `acciones` se
  recorrió además el teclado. Las capturas de 360 px de `cuadricula` y `lista` muestran el lienzo de escritorio (el
  paquete no tiene versión móvil).

## Datos de ejemplo
Plan Equipo del catálogo (`product-context.md` §3), como en `storage/carga`: 350 GB y 1 GB como máximo por archivo. En
la app los límites vienen de `PlanLimits` por la API; los del mockup son de ejemplo.
- **Barra lateral de 005** (decisión de Adrián, 2026-09-28): sin la sección «Carpetas» y sin el contador de la
  Papelera en todos los estados de 005, también en `storage/carga`, hasta la 006. Se hace con las opciones
  `carpetas: []` y `contadorPapelera: ''` de `marco.sidebar`; Seguridad y el layout compartido no cambian.
- `vacio`: 0 B de 350 GB (0 %, tramo sin nota de `QuotaBar`).
- `cargando`, `arrastre`, `error` y `acciones`: 304 GB de 350 GB (87 %), la misma cuota lateral que `storage/carga`, y
  los 4 archivos de la raíz de `storage/carga` (`.docx`, `.xlsx`, `.pptx`, `.pdf`). La cifra no cuadra con 4
  archivos sin carpetas; **se deja así por decisión de Adrián** (2026-09-28): es un recorte de ejemplo.

## Decisiones de UX (estados de 005)
- **Pantalla de 005**: «Mis archivos» es la raíz (RN-4). Solo vista de lista con Nombre, Tamaño, Modificado y una
  columna de acciones sin título visible («Acciones» para lectores de pantalla): sin carpetas en el contenido, sin
  migas de carpeta, sin columna «Autor», «Personas» ni «Indexación», sin selector Tarjetas/Lista, sin búsqueda y sin
  «Ver planes» (se oculta hasta 008). Las entradas de la carga son el botón «Subir archivos» del encabezado y
  arrastrar y soltar.
- **vacio**: reproduce `StateView type="empty"` de 000b (borde discontinuo `border`, fondo `card`, alto mínimo de
  224 px, ícono `FolderOpen` de 40 px en `muted-foreground`, título, descripción de 384 px como máximo y un botón
  `primary`). Retoma la tarjeta «Arrastra archivos aquí · máx. X por archivo» de la propuesta p. 08: el cuadro
  discontinuo invita a soltar y dice el máximo por archivo, que viene de `PlanLimits`. **Aprobado** (Adrián,
  2026-09-28): el cuadro repite el botón «Subir archivos» del encabezado; a 360 px ocupa todo el ancho. En pantallas
  sin arrastre la descripción no menciona arrastrar (en el mockup, por ancho ≤ 600 px; en la app, por `(hover: none)`
  o `(pointer: coarse)`).
- **cargando**: esqueleto con la forma de la tabla (encabezado y 5 filas; a 360 px, ícono y dos líneas),
  `aria-hidden`, dentro de un contenedor con `aria-busy="true"`, y debajo un texto `role="status"` con el ícono
  giratorio, como la lista de sesiones aprobada de Seguridad. El pulso y el giro se detienen con
  `prefers-reduced-motion`. **Aprobado** (Adrián, 2026-09-28): «Subir archivos» queda habilitado mientras carga (la
  carga no depende del listado; el nombre repetido lo resuelve el servidor, CA-6).
- **arrastre**: el área de contenido bajo la barra superior (encabezado y lista) es la zona de soltar, con el patrón de
  `ui-guidelines.md` §5: `bg-brand/5` y borde `1.5px` discontinuo `brand` (3.05:1 sobre `background`, suficiente para
  un indicador no textual). La lista sigue legible debajo del tinte del 5 %. Una etiqueta flotante abajo al centro, en
  `primary` con texto `primary-foreground` (5.11:1), dice «Suelta para subir» y a dónde van los archivos; es
  `role="status"`. La zona no captura clics y desaparece al soltar o al salir; al soltar se abre el panel de cargas de
  `storage/carga`. El arrastre no tiene equivalente de teclado: «Subir archivos» es la alternativa. **Aprobado**
  (Adrián, 2026-09-28): la zona de soltar es solo el área de contenido, no la barra lateral ni la superior.
- **error**: `StateView type="error"` con el tono y la estructura del error aprobado de Seguridad (`error-sesiones`):
  cuadro discontinuo sobre `destructive-tint`, ícono y título en `destructive` (4.79:1 sobre el tinte), texto en
  `foreground` (12.07:1) y el botón `outline` «Reintentar» con ícono (no destructivo: reintentar no borra nada).
  `role="alert"`. **Sin código de soporte** y con «Subir archivos» habilitado en el encabezado (Adrián, 2026-09-28). **Diferencia con `StateView`**: su botón de error es
  `destructive` por omisión; aquí la implementación debe pasar `variant: 'outline'`.
- **acciones** (decisión de Adrián, 2026-09-28): cada fila tiene un botón ⋮ (`row-btn`, 36 px en escritorio y 44 px en
  móvil) con nombre accesible «Acciones de {nombre}», `aria-haspopup="menu"`, `aria-expanded` y `aria-controls`. Abre
  un menú (`role="menu"`, etiquetado por el botón) con «Descargar» (ícono de descarga) como única acción en 005;
  compartir, mover y las demás se suman al mismo menú en sus specs. Es el `DropdownMenu` de shadcn con la misma
  apariencia y el mismo teclado que el menú de la cuenta de `shared/layout`: Enter, Espacio o flecha abajo abren con el
  foco en el primer ítem; flecha arriba abre en el último; flechas, Inicio y Fin recorren; Escape cierra y devuelve el
  foco al botón; Tab cierra y sigue; un clic fuera cierra. El foco visible es el anillo `ring` (2 px). En la app,
  «Descargar» pide la URL firmada (`POST /files/:id/download-url`) y el navegador descarga el archivo.
  - **Móvil: menú desplegable, no hoja inferior.** Se evaluó la hoja inferior y se descartó: (1) el sistema ya usa el
    desplegable a 360 px para el menú de la cuenta (`shared/layout`), así que el mismo gesto se comporta igual; (2) con
    una sola acción, una hoja a todo el ancho es desproporcionada; (3) el menú queda anclado a la fila, lo que deja
    claro sobre qué archivo actúa, y a 360 px los ítems ya miden 44 px (`account-menu` en móvil); (4) una hoja
    necesitaría otro componente (`Sheet` o `Drawer`; `Drawer` de shadcn trae `vaul`, una dependencia con ADR) para una
    sola acción. Si en 006–012 el menú pasa de 4–5 acciones, se revisa.
- **descarga-preparando** (decisión de Adrián, 2026-09-28): al elegir «Descargar», el menú sigue abierto mientras se
  pide la URL firmada. Si llega antes de 2 s, el menú se cierra, el foco vuelve al botón ⋮ y el navegador descarga.
  Si tarda más de 2 s (RNF-14), el ítem cambia a «Preparando…» con el ícono giratorio, queda `aria-disabled="true"`
  (sigue enfocable, así el foco no se pierde) y una región `role="status"` anuncia «Preparando la descarga de
  {nombre}…». El texto del ítem deshabilitado usa `secondary-foreground` (7.45:1 sobre `muted`) en lugar de la
  opacidad de §5, porque es un estado en curso que hay que poder leer. Escape cierra el menú; la preparación sigue y,
  si falla, aparece el aviso de `descarga-fallida`.
- **descarga-fallida** (decisión de Adrián, 2026-09-28): `Alert` de shadcn (variante destructiva) arriba de la lista,
  no un aviso flotante: borde `destructive-soft` al 45 %, fondo `destructive-tint`, ícono y título en `destructive`
  (4.79:1), texto en `foreground`, una acción `outline` y «Cerrar aviso» (botón de ícono). `role="alert"`; el foco no
  se mueve. El título nombra el archivo. Se reemplaza al siguiente intento y se cierra solo si el reintento sale bien.
  A 360 px la X queda arriba a la derecha (44 px) y la acción ocupa todo el ancho. El mockup dibuja el `429`; el `404`
  usa el mismo aviso con su texto y «Actualizar lista» (vuelve a pedir `GET /files`).
  - **Mejora futura**: evaluar un aviso flotante (`toast`, `sonner` de shadcn) para descargas. `sonner` es una
    dependencia nueva: hay que revisar si necesita ADR (CLAUDE.md: «No se agrega una dependencia significativa sin un
    ADR»).

## Textos
**Aprobados** (Adrián, 2026-09-28):
- vacio, título: «Aún no tienes archivos»
- vacio, descripción (con arrastre): «Sube tus documentos con el botón o arrástralos a esta página. Tu plan permite
  hasta {máximo} por archivo.»
- vacio, descripción (sin arrastre): «Sube tus documentos desde tu dispositivo. Tu plan permite hasta {máximo} por
  archivo.»
- vacio, botón: «Subir archivos» (el mismo del encabezado)
- cargando: «Cargando tus archivos…»
- arrastre: «Suelta para subir» y «Se guardarán en Mis archivos · hasta {máximo} por archivo»
- error: «No pudimos cargar tus archivos.» y «Reintentar» (`outline`), sin código de soporte
- acciones: «Acciones de {nombre}» (nombre accesible del botón ⋮) y «Descargar»

- error, segunda frase: «Tus archivos siguen guardados. Inténtalo de nuevo.» (ajuste aprobado por Adrián, 2026-09-28)

**Aprobados por Adrián (2026-09-28), textos de descarga**:
- descarga-preparando: «Preparando…» (ítem) y «Preparando la descarga de {nombre}…» (anuncio para lectores de
  pantalla)
- descarga-fallida `429`: «No pudimos preparar la descarga de «{nombre}».» / «Hiciste demasiadas solicitudes. Espera
  un momento e inténtalo de nuevo.» (el texto de CA-19) con «Reintentar»
- descarga-fallida `404`: «No encontramos «{nombre}».» / «Puede que ya no esté en Mis archivos. Actualiza la lista
  para ver tus archivos.» con «Actualizar lista»
- botón de ícono del aviso: «Cerrar aviso»
- otras fallas (red caída o `5xx`): el mismo aviso, sin estado propio, con «No pudimos preparar la descarga de
  «{nombre}».» / «Revisa tu conexión e inténtalo de nuevo.» y «Reintentar»

## Diferencias con la implementación actual (`apps/web`)
- No existe aún la página `app/(app)/(cliente)/archivos/page.tsx`; solo hay `StateView` y la galería de 000b.
- `StateView` usa `h3` para el título; en «Mis archivos» el siguiente nivel tras el `h1` es `h2` (el mockup usa `h2`).
  Conviene que `StateView` acepte el nivel del encabezado.
- `StateView type="error"` usa por omisión el botón `destructive`; «Reintentar» debe ser `outline`.
- `StateView type="loading"` es un ícono giratorio centrado; para listas, el mockup usa esqueleto + texto
  `role="status"`. Hace falta un `Skeleton` (shadcn) o una variante de `StateView`.
- El menú ⋮ necesita el componente `dropdown-menu` de shadcn y el aviso de descarga, `alert`; el plan de 005 no los
  lista (solo `alert-dialog` y `checkbox`). `alert` es solo un archivo con `cva`, sin dependencia nueva.
- `AppLayout` de 000b no tiene la cuota lateral, «Recientes», «Favoritos» ni «Optimizador», y el ítem se llama «Mis
  Archivos»; el marco de los mockups es el de `shared/layout`.

## Pendiente
- Datos de ejemplo de `cuadricula` y `lista` contra el catálogo (product-context §3): la zona de arrastre dice «máx.
  2 GB por archivo», pero el plan Equipo permite 1 GB; y la lista incluye archivos de 8.5 GB y 18 GB.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) en `cuadricula` y `lista` no cumple AA (DF-41); la
  implementación y los estados de 005 usan el token corregido.
- Versión móvil real a 360 px de `cuadricula` y `lista`: el paquete está diseñado para escritorio.
- Estado `seleccion` del inventario (llega con las acciones de 006/007).
