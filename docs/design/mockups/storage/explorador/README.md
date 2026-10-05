# Mockup: Explorador de archivos

- **Spec**: 005–007 (005: explorador mínimo de la raíz con «Subir archivos», arrastrar y soltar y «Descargar», §9;
  006: carpetas, migas, crear, renombrar, «Mover a…» y mover a la papelera; ver «Estados de 006»; desde el 2026-10-03,
  desglose de carpetas y accesos rápidos: ver «Estados de 006: desglose y accesos rápidos», aprobados el 2026-10-03;
  007: orden y «Cargar más»; ver «Estados de 007»)
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
  - Los 22 estados de 006 (ver «Estados de 006»): HTML autocontenido generado con
    `../../_generadores/explorador/generar-carpetas.js`; no se edita a mano. Mismo marco y módulo `mis-archivos`, más
    `_generadores/carpetas/carpetas.js` (logo, barra lateral con «Carpetas» y contador de la Papelera, toast y diálogos),
    que comparte con `storage/papelera`. La fila, la tabla y el encabezado de 006 viven ahora en `carpetas.js` (el
    HTML de 006 no cambió) para que 007 los reutilice.
  - Los 9 estados de CA-26 a CA-28 (desglose, «Ver más», «Fijar en la barra lateral» y tope): mismo generador, con
    `../../_generadores/explorador/desglose.js` y `../../_generadores/accesos/accesos.js`.
  - Los 6 estados de 007 (ver «Estados de 007»): generados con `../../_generadores/explorador/generar-orden.js`, con
    la misma tabla de `carpetas.js` y la barra lateral de `_generadores/espacio/espacio.js`.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos** (los de 006 están en «Estados de 006»):
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
- `AppLayout` de 000b no tiene la cuota lateral, «Recientes», «Fijados» ni «Optimizador», y el ítem se llama «Mis
  Archivos»; el marco de los mockups es el de `shared/layout`.

## Estados de 006 (carpetas)
**Spec 006** (RF-10; CA-1 a CA-11). Propuesta p. 08–09: muestra carpetas en la lista y en la barra lateral, pero no
presentó estos estados. Capturas: `explorador--<estado>--<360|1440>.png`. En los 22 estados: axe-core sin violaciones a
360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de consola y sin objetivos menores de 24 px; en
`mover` se recorrió el teclado del árbol (flechas, Enter elige, las filas deshabilitadas no se eligen) y en
`mover-nueva-carpeta` el alta en línea (botón del pie con teclado, Enter vacío, «/», nombre repetido, Esc, crear con
Enter y con ✓; la carpeta creada queda elegida y con el foco), con axe también tras abrir el campo, con error y tras
crear.

| Estado | Qué muestra |
|---|---|
| raiz-carpetas | Raíz con carpetas primero y luego archivos |
| carpeta | `Mis archivos / Proyecto Alpha / Fase 3 · RAG`: migas, subcarpetas primero y archivos, «Nueva carpeta» y «Subir archivos» |
| carpeta-vacia | `StateView` vacío de la carpeta, con «Subir archivos» |
| carpeta-cargando | Esqueleto de la lista y «Cargando el contenido de {carpeta}…» |
| carpeta-error | Falló el listado: error con «Reintentar» |
| carpeta-no-encontrada | 404 (inexistente, ajena o en la papelera; el mismo texto para todas, CA-5 y CA-22): «Ir a Mis archivos» y «Ver papelera» |
| carpeta-arrastre | Zona de soltar de 005; la etiqueta dice «Se guardarán en {carpeta}» (CA-6) |
| acciones-archivo | Menú ⋮: «Descargar», «Renombrar», «Mover a…», separador y «Mover a la papelera» |
| acciones-carpeta | Menú ⋮ de carpeta: «Renombrar», «Mover a…», separador y «Mover a la papelera» |
| nueva-carpeta | Diálogo con el campo «Nombre de la carpeta» y el destino en la descripción |
| nombre-invalido | `400`: error en el campo (separadores de ruta) |
| nombre-repetido-carpeta | `409`: «Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.» en el campo (sin distinguir mayúsculas) |
| limite-niveles | `422` en el nivel 10: aviso dentro del diálogo; migas colapsadas con «…» |
| renombrar | Renombrar archivo: la extensión queda fija como sufijo del campo |
| renombrar-repetido | Renombrar carpeta con un nombre ocupado: `409` en el campo |
| mover | «Mover a…» un archivo: árbol con «Mis archivos» como raíz; la ubicación actual, deshabilitada |
| mover-carpeta | «Mover a…» una carpeta: ella y sus subcarpetas deshabilitadas con el motivo (CA-8) |
| mover-conflicto | `409` al mover: aviso dentro del diálogo |
| mover-nueva-carpeta | «Nueva carpeta» desde «Mover a…»: campo en línea como primer hijo del destino elegido («Documentación»), con «Se creará en {carpeta}.», ✓ «Crear carpeta» y ✕ «Cancelar la nueva carpeta» |
| mover-nueva-carpeta-error | El campo en línea repite un nombre del destino: `409` debajo del campo, igual que en el diálogo «Nueva carpeta» |
| eliminado | Se movió a la papelera sin confirmar: toast «Movimos «{nombre}» a la papelera.» con «Ver papelera»; el contador de la Papelera sube |
| eliminar-fallido | No se pudo mover a la papelera: `Alert` arriba de la lista con «Reintentar» (el mismo de `descarga-fallida`) |

**Datos de ejemplo**: plan Equipo, cuota 304 GB (87 %) como en 005; carpetas de primer nivel «Proyecto Alpha»,
«Documentos Legales» y «Finanzas»; Papelera con 6 elementos (`storage/papelera`; el contador sale de
`GET /trash/summary`). Profundidad máxima de ejemplo: 10
niveles (P-6; en la app sale de la configuración por la API).

### Cambios respecto de la propuesta (p. 08–09)
1. **Barra lateral**: vuelve «Carpetas» (spec 006 §6), pero solo con los nombres de las carpetas de primer nivel (sin
   cantidades: `FolderRef` no las trae); sin árbol desplegable ni «Nueva carpeta» en la barra (el botón está en el
   encabezado).
2. **Encabezado**: el título es la carpeta abierta, sin el resumen «34 elementos · 41 GB» (el listado es paginado y la
   API no da totales por carpeta); las migas van en la barra superior (en la propuesta, bajo el título). Sin búsqueda, «Agente Nimbo», «Tarjetas / Lista», «Ordenar», columnas «Personas» e
   «Indexación», casillas ni barra de selección (007, 012, 018–020).
3. **Carpetas en la tabla**: «—» en «Tamaño», como la propuesta, con «Carpeta, sin tamaño» para lectores de pantalla, y
   sin la línea «22 elementos»; a 360 px el metadato dice «Carpeta · {fecha}». El tamaño total de una carpeta solo se
   muestra en la papelera (CA-11).
4. **Logo**: los mockups de 006 usan el logo del proyecto (`docs/design/logos/`, nube con destello) con los tokens
   `brand` y `primary-foreground`, en lugar de la «N» provisional del marco.

### Decisiones de UX de 006
**Aprobadas por Adrián (2026-09-30) sin cambios**: «Mover a la papelera» sin rojo en el menú; toasts con `sonner` (ADR-0024,
aceptado); migas; carpetas con «—» y barra lateral de primer nivel; extensión fija al renombrar; errores dentro de los
diálogos. **Con ajustes** (2026-09-30): el enlace de regreso en móvil y «Nueva carpeta» dentro de «Mover a…» (abajo).
Ajustes aprobados por Adrián (2026-09-30), incluidos el mensaje de error de red al crear desde el árbol («No pudimos crear la carpeta. Inténtalo de nuevo.») y el campo a todo el ancho del árbol a 360 px.

- **Migas**: en escritorio, `nav` «Ruta» de la barra superior con enlaces; con más de 4 niveles se colapsan los
  intermedios en un botón «…» («Mostrar n carpetas intermedias», abre un menú con ellas). Por debajo de 900 px las
  migas se ocultan (como en 005) y sobre el título aparece un enlace de regreso con el nombre real de la carpeta
  anterior, «‹ {nombre}» («‹ Mis archivos» en el primer nivel), de 44 px y con `aria-label="Volver a {nombre}"` (el
  texto visible queda dentro del nombre accesible). Ajuste de Adrián (2026-09-30): sin textos genéricos.
- **Abrir carpeta**: el nombre de la carpeta es un enlace (una URL por carpeta: se puede compartir y volver con el
  navegador). La fila entera no es clicable para no competir con el ⋮.
- **«Mover a la papelera»** en lugar de «Eliminar» en el menú, sin color destructivo: es reversible y no pide
  confirmación (decisión de Adrián); el rojo y la confirmación quedan para «Eliminar definitivamente» en la papelera.
  Va después de un separador.
- **Crear y renombrar**: `Dialog` de shadcn con un solo campo, foco en el campo y el texto seleccionado al abrir; Enter
  envía. Errores del servidor por campo (`400`, `409`) debajo del campo, con `aria-invalid` y `aria-describedby`; el
  foco vuelve al campo. Errores que no son del nombre (`422` de profundidad) van como aviso dentro del diálogo, sin
  cerrarlo. Textos:
  - vacío: «Escribe un nombre para la carpeta.»; más de 255: «El nombre puede tener hasta 255 caracteres.»;
    separadores: «El nombre no puede contener «/» ni «\». Quítalos o usa un guion.»
  - `409` (CA-3): «Ya existe una carpeta llamada «{nombre}» aquí. Elige otro nombre.» (con el nombre como está guardado).
  - `422` (CA-9): «Llegaste al máximo de {n} niveles de carpetas. Crea la carpeta en otro lugar.»
- **Renombrar archivo**: el campo tiene solo el nombre y la extensión queda como sufijo fijo (`.docx`): el tipo no
  cambia al renombrar. El nombre repetido de un archivo sigue la regla de 005 (diálogo «¿Conservar ambos archivos?» de
  `storage/carga`), sin estado propio.
- **«Mover a…»**: `Dialog` con un árbol (patrón `tree` de WAI-ARIA, selección única, carga perezosa al expandir) que
  empieza en «Mis archivos» con la ruta actual abierta. La ubicación actual y, al mover una carpeta, ella y sus
  descendientes están deshabilitados con el motivo en texto («Ubicación actual», «Carpeta que mueves», «Dentro de la
  carpeta»), así el `422` de CA-8 casi no se ve. Abajo, «Se moverá a {ruta}.» (`aria-live`). `409` al mover una carpeta: «Ya existe una carpeta llamada «{nombre}» en {destino}. Elige otro
  destino o cambia el nombre de la carpeta.» (variante de CA-3 para mover); en archivos, el diálogo de 005.
- **«Nueva carpeta» dentro de «Mover a…»** (pedido de Adrián, 2026-09-30): botón «Nueva carpeta» (`outline`, ícono
  de carpeta con «+») a la izquierda del pie; a 360 px va al final de la columna de botones. Abre un campo en línea como
  primer hijo de la carpeta elegida en el árbol (la expande si estaba cerrada) con el foco en el campo, «Se creará en
  {carpeta}.» debajo, ✓ «Crear carpeta» y ✕ «Cancelar la nueva carpeta» (40 px; 44 px a 360 px, donde el campo usa
  todo el ancho del árbol). Enter o ✓ crean, Esc o ✕ cancelan y el foco vuelve al destino. Mismas validaciones y textos
  que el diálogo «Nueva carpeta»: vacío, más de 255, separadores (`400`), repetido sin distinguir mayúsculas (`409`)
  y límite de niveles (`422`), todos debajo del campo con `role="alert"`, `aria-invalid` y `aria-describedby`; el
  error se borra al escribir. Al crear, la carpeta nueva queda elegida como destino y con el foco, y «Se moverá a
  {ruta}.» lo anuncia. Una falla de red o `5xx` usa el mismo lugar con «No pudimos crear la carpeta. Inténtalo de
  nuevo.». El campo no entra en el recorrido con flechas del árbol (las flechas siguen sirviendo al texto); se alcanza
  con Tab. Mientras el campo está abierto, «Nueva carpeta» del pie lleva el foco al campo en lugar de abrir otro.
- **Mover a la papelera**: sin confirmación; la fila sale de la lista, el contador de la Papelera sube y aparece un toast
  `role="status"` «Movimos «{nombre}» a la papelera.» con «Ver papelera» y «Cerrar aviso» (para carpetas, el mismo
  texto). Debe durar al menos 8 s y pausarse con el puntero o el foco encima; si se cierra, la Papelera de la barra
  lateral es el mismo camino. Sin «Deshacer» (006 §7). Si falla, `Alert` arriba de la lista (no toast) con
  «Reintentar».
- **Toast**: no existe aún en `components/ui`. Propuesta: `sonner` de shadcn, con su ADR (dependencia nueva; ver
  «Mejora futura» de `descarga-fallida`).
- **Carpeta no encontrada**: `StateView` vacío (no de error: no es una falla del sistema) con `h1` propio, «Ir a Mis
  archivos» y «Ver papelera». Mismo texto para inexistente, ajena o en la papelera, para no revelar nada (CA-22).

## Estados de 006: desglose y accesos rápidos (CA-26 a CA-28)
**Spec 006**. **Estado: Aprobado (2026-10-03, Adrián)**, con los ajustes que se describen abajo ya aplicados. Nueve estados
nuevos, generados con `generar-carpetas.js` y `explorador/desglose.js` (filas, CSS y script del desglose) más
`accesos/accesos.js` (la sección de la barra lateral, la misma de `shared/layout`; ver su README para P-15). Todos parten
de la raíz de Mis archivos con «Proyecto Alpha» desglosada a dos niveles. **Los 22 estados anteriores solo cambiaron en la
etiqueta «Fijados» (antes «Favoritos») de la navegación**: conservan la barra lateral con «Carpetas» y las filas sin
control de desglose; los nuevos llevan «Accesos rápidos» (3 fijados y 3 recientes con «Ver más»; en `tope-de-fijados`, 5
fijados y 3 recientes con «Ver más») y el control en cada carpeta.
Capturas: `explorador--<estado>--<360|1440>.png`.

| Estado | Qué muestra |
|---|---|
| carpeta-desglosada | «Proyecto Alpha» abierta con «Actas», «Documentación», «Fase 3 · RAG» (también abierta, con «Prompts», `.docx` y `.pdf`) y un archivo; carpetas primero, sangría y guías en dos niveles |
| **desglosada-ver-mas** | Q-2: «Fase 3 · RAG» y «Proyecto Alpha» tienen más de una página; al final de cada nivel, una fila «Ver más» (nivel 3 y nivel 2) que lleva a la página de esa carpeta |
| desglosando-cargando | Se desglosa «Documentación»: el control muestra el ícono giratorio, y bajo la fila, «Cargando el contenido de Documentación…» y dos filas de esqueleto |
| desglosada-vacia | «Actas» abierta sin contenido: fila «Esta carpeta está vacía» |
| desglosada-error | Falló el contenido de «Documentación»: fila «No pudimos cargar el contenido de Documentación.» con «Reintentar»; el resto de la lista sigue usable |
| menu-fila-carpeta | Menú ⋮ de una subcarpeta (nivel 2): Renombrar, Mover a…, **Fijar en la barra lateral**, separador, Mover a la papelera |
| menu-fila-archivo | Menú ⋮ de un archivo anidado (nivel 3): Descargar, Renombrar, Mover a…, **Fijar en la barra lateral**, separador, Mover a la papelera |
| menu-fila-quitar | Menú ⋮ de un archivo ya fijado (aparece en la barra): **Quitar de la barra lateral** |
| tope-de-fijados | Cinco fijados; aviso arriba de la lista «Ya fijaste 5 elementos. Quita uno para fijar otro.» |

### Ajustes aprobados por Adrián (2026-10-03)
- **Token de guías y sangría (CA-26)**: el mockup usa exactamente el token que define `ui-guidelines.md` §3 y está en
  `apps/web/src/app/globals.css`: variables `--tree-indent`, `--tree-guide-x`, `--tree-max-level` y `--tree-guide`, y las
  utilidades `tree-indent` (sangría) y `tree-guides` (guías). Aquí son las mismas variables y clases en CSS plano; el nivel
  de cada fila es `style="--tree-level: n"`. El mockup cambia a móvil a 600 px y la implementación usa `sm` (640 px).
- **Q-2: «Ver más» en el desglose**: si una carpeta tiene más de una página, al final de su nivel (con su sangría y sus
  guías) aparece una fila «Ver más ›» en `primary` que lleva a la página de esa carpeta. Nombre accesible «Ver más en
  {carpeta}» (empieza con el texto visible); 32 px de alto (44 px a 360 px). Cuenta como una fila hija más de `aria-controls`.
- **Tope**: `Alert` variante `warning` (`ui-guidelines.md` §4), `role="status"`.
- **Barra lateral**: 3 recientes visibles (P-15), «Fijados» en la navegación y menú ⋮ en cada fijado (no se dibuja
  en este mockup; ver `shared/layout`, estados `fijado-menu-abierto` y `movil-cajon-fijado-menu-abierto`; el script del
  explorador también lo hace funcionar).

### Decisiones de UX (propias de estos estados)
- **Control de desglose** (CA-26): botón de 32 px (44 px a 360 px, con margen negativo para no ensanchar la fila) antes
  del ícono de la carpeta, con la flecha ›, que gira 90° al abrir. `aria-expanded`, `aria-controls` (las filas hijas) y un
  nombre fijo, «Mostrar contenido de {nombre}»: el estado lo da `aria-expanded`, no el texto. **El nombre de la carpeta
  sigue siendo el enlace que la abre** (CA-5) y la fila entera sigue sin ser clicable; el control nunca navega. Enter o
  Espacio lo activan. Las filas de archivo reservan el mismo ancho (sin control) para que los íconos queden alineados.
- **Sangría y guías**: 28 px por nivel (16 px a 360 px) con una guía vertical bajo el control de cada ancestro (1 px,
  `border`, decorativa). La sangría y las guías dejan de crecer en el nivel 6 (nivel 3 a 360 px) para que el nombre no se
  quede sin ancho: la profundidad máxima es 10. Las filas hijas llevan para lectores de pantalla «, dentro de {carpeta}».
- **Tabla, no `treegrid`**: es una sola tabla con filas hijas (`data-padre`). Un `treegrid` pediría navegar con flechas
  entre celdas y reemplazaría el orden de Tab de la fila (control, enlace, ⋮); con tres controles por fila y acciones en
  cualquier nivel, el botón con `aria-expanded` y el sufijo «dentro de…» son más simples y suficientes. Se puede revisar si
  la auditoría de accesibilidad lo pide.
- **Cargando / vacía / error** (CA-26): viven en una fila bajo la carpeta, con la misma sangría que tendrían sus hijos; no
  hay estado de pantalla. Cargando: el control cambia a ícono giratorio con `aria-busy`, una fila `role="status"` con el
  texto y dos filas de esqueleto `aria-hidden` (el giro y el pulso se detienen con `prefers-reduced-motion`). Vacía: ícono de
  carpeta abierta y «Esta carpeta está vacía», sin acción. Error: ícono y texto en `foreground`, `role="alert"` y el botón
  «Reintentar» (`outline`, 36 px; 44 px a 360 px, donde baja a su propia línea); **solo esa fila** muestra error y la
  carpeta sigue abierta.
- **Menú ⋮ con «Fijar»** (CA-27): se agrega después de «Mover a…» y antes del separador, con ícono de chincheta; si el
  elemento ya está fijado dice «Quitar de la barra lateral» con la chincheta tachada. Valen los mismos textos en carpetas
  y archivos y en cualquier nivel. El menú crece a su contenido (`min-width: 208 px`, unos 252 px) porque el texto nuevo no
  cabía. Con «Fijar», el menú de un archivo llega a **cinco acciones y un separador**: sigue siendo un menú desplegable
  (a 360 px los ítems miden 44 px); el límite de «4–5 acciones» de 005 queda alcanzado y una acción más obligaría a revisar
  la hoja inferior.
- **Tope** (CA-28): `Alert` variante `warning` arriba de la lista, texto exacto de la spec y «Cerrar aviso»; no es un toast
  (ADR-0024: lo que no es una confirmación va en `Alert`). «Fijar en la barra lateral» no se deshabilita al llegar a 5:
  intentar el sexto muestra el aviso y no cambia nada.
- **Qué hace el mockup**: el control abre y cierra y, al contraer, oculta también a los descendientes; una carpeta sin filas
  de ejemplo se abre «vacía». En la app, abrir pide `GET /folders/contents` de esa carpeta.

### Decisiones abiertas (no bloquean)
1. **¿Se actualizan los 22 estados anteriores?** Si «Accesos rápidos» reemplaza a «Carpetas» y toda carpeta se desglosa,
   cualquier captura vieja de Mis archivos (`carpeta`, `raiz-carpetas`, los diálogos…) muestra una barra lateral y unas
   filas que ya no existirán. Se dejaron como Adrián las aprobó el 2026-09-30 (salvo la etiqueta «Fijados»); regenerarlas es
   cambiar dos opciones del generador (`nuevo: true`) y volver a capturar.
2. **¿Se marca en la fila que el elemento está fijado?** Hoy solo se sabe por el texto del menú («Quitar…») y por la barra.
   Una chincheta pequeña junto al nombre lo haría visible; no está en la spec y no se dibujó.
3. **Qué pasa con las hijas al contraer** (sin dibujar): propuesta para el plan, conservar lo cargado mientras viva la
   página y volver a pedirlo tras renombrar, mover o enviar a la papelera dentro de esa carpeta.

### Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `secondary-foreground` sobre `card` (control de desglose, texto de «vacía») | 8.09 |
| `secondary-foreground` sobre `muted` (control con puntero) | 7.45 |
| `foreground` sobre `card` (texto de la fila de error) | 13.58 |
| `destructive` sobre `card` (ícono de la fila de error, no es texto) | 5.39 |
| `warning-foreground` sobre `warning` al 10 % (aviso del tope) sobre `background` / `card` | 4.66 / 4.86 |
| `primary` sobre `card` («Ver más» de una carpeta) / `primary-hover` sobre `muted` (con puntero) | 4.97 / 6.24 |
| Guías de sangría `border` sobre `card` (decorativas) | 1.23 |

Verificación: axe-core sin violaciones a 360 y 1440 px en los nueve estados, sin desbordamiento horizontal a 360 px, sin
objetivos menores de 24 px (44 px donde ya se pedían) y sin errores de consola (`_generadores/pw/axe-seguridad.js`). Se probó
además el script del mockup: contraer y volver a abrir «Proyecto Alpha» oculta y muestra sus filas, abrir una carpeta sin
datos con Enter agrega la fila «vacía» (con su sangría y guías) y axe sigue sin violaciones; el menú ⋮ de una fila anidada
abre con el foco en el primer ítem.

## Estados de 007 (orden y «Cargar más»)
**Spec 007** (CA-9, CA-10, CA-12; P-4 y P-5 resueltas; orden por defecto corregido en D-6). Generados con `../../_generadores/explorador/generar-orden.js`;
no se editan a mano. Carpeta «Proyecto Alpha / Documentación» con 3 subcarpetas y archivos de plan Personal (ninguno pasa
de 50 MB); la página de ejemplo tiene 20 elementos (el tamaño real lo fija el plan, RN-6). Barra lateral de 007
(`espacio/espacio.js`): plan Personal al 32 % con «Ver detalle». Capturas: `explorador--<estado>--<360|1440>.png`. En
los 6 estados: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento a 360 px y sin objetivos menores de 24 px.

| Estado | Archivo | Qué muestra |
|---|---|---|
| orden-menu | `explorador--orden-menu.html` | Menú «Ordenar» abierto: «Ordenar por» (Nombre, Tamaño, Fecha de modificación, Fecha de creación; marcada por defecto) y «Orden» (aquí «Más recientes primero» marcado), con la nota «Las carpetas siempre van primero. El tamaño ordena solo los archivos.» |
| ordenando | `explorador--ordenando.html` | Se eligió «Tamaño, mayor primero»: el botón pasa a «Ordenando…» y la lista visible se conserva (`aria-busy`) hasta que llega la respuesta (CA-12) |
| ordenado | `explorador--ordenado.html` | Ordenado por tamaño, mayor primero: carpetas primero (por nombre) y luego archivos de mayor a menor; la columna lleva `aria-sort` y flecha |
| mas-paginas | `explorador--mas-paginas.html` | Primera página con el orden inicial (fecha de creación, más recientes primero) y «Cargar más» debajo de la lista |
| cargando-mas | `explorador--cargando-mas.html` | «Cargar más» en curso: «Cargando más…» deshabilitado con `aria-disabled` y anuncio `role="status"`; la lista se conserva |
| cargar-mas-error | `explorador--cargar-mas-error.html` | Falló la página siguiente: `Alert` destructivo debajo de la lista, «No pudimos cargar más elementos.» con «Reintentar» |

### Decisiones de UX de 007
- **Un solo control de orden** para todos los anchos: `DropdownMenu` con dos grupos de `menuitemradio`, a la derecha
  encima de la lista (a todo el ancho y 44 px en móvil, donde la tabla no tiene encabezados). El botón dice el orden
  vigente en texto («Ordenar: Tamaño, mayor primero»). Los encabezados de columna no son botones: solo muestran
  `aria-sort` y una flecha en la columna activa (con el orden por defecto, por fecha de creación, ninguna columna la
  lleva: la tabla muestra «Modificado», no la fecha de creación). Alternativa (encabezados clicables además del menú) pendiente de Adrián.
  La web (T-11) ya la implementa: el primer clic ordena «Nombre» de la A a la Z y «Tamaño» y «Modificado» de mayor o
  más reciente a menor; un segundo clic en la columna activa invierte la dirección.
- **Navegación**: en los estados de 007 el ítem «Espacio» reemplaza a «Plan y facturación» (decisión e del resumen de
  espacio, hasta 008).
- **Cuatro campos de orden** (CA-10): Nombre, Tamaño, Fecha de modificación y Fecha de creación (`created`), cada uno
  ascendente o descendente.
- **Textos de la dirección según el campo**: Nombre «A–Z» / «Z–A»; Tamaño «Menor primero» / «Mayor primero»; las dos
  fechas «Más antiguos primero» / «Más recientes primero».
- **Orden por defecto: «Fecha de creación, más recientes primero»** (RN-6, D-6; corrección de Adrián, 2026-10-01): es
  el orden de 006 y el que marca el menú al abrir la carpeta. Sustituye al «Nombre A–Z» de la primera versión del
  mockup. Como la columna visible es «Modificado», las fechas de la lista por defecto no salen en orden; es
  esperado y no un error.
- **Carpetas primero siempre** (006 CA-5). Al ordenar por tamaño las carpetas no tienen tamaño (RN-5) y quedan por
  nombre ascendente; lo dice la nota del menú.
- **Al cambiar el orden** se pide la primera página con el orden nuevo; la lista visible se conserva hasta que llega
  (CA-12) y el orden queda en la URL (`?orden=tamano&dir=desc`) para que sobreviva a recargar y a «Atrás».
- **Paginación por cursor con «Cargar más»** (CA-9; `nextCursor` de `GET /folders/contents`): no hay total ni números
  de página. El botón desaparece cuando no hay `nextCursor`. Al cargar, las filas nuevas se agregan al final, el foco
  se queda en «Cargar más» y un `role="status"` anuncia «Se cargaron N elementos más.». Si falla, el botón se
  reemplaza por el `Alert` con «Reintentar» y lo ya cargado sigue visible.
- **Imágenes** en la lista: ícono de imagen con `--file-img` (antes caían en «otro»).
- Sin cuadrícula, filtros ni selección múltiple (spec 007 §7).
- **Plan de los datos**: los estados de 005 y 006 usan plan Equipo (350 GB, 87 %); los de 007, plan Personal como el
  resumen de espacio. Al regenerar 005/006 conviene pasarlos a Personal para que todas las pantallas cuenten lo mismo.

## Pendiente
- Datos de ejemplo de `cuadricula` y `lista` contra el catálogo (product-context §3): la zona de arrastre dice «máx.
  2 GB por archivo», pero el plan Equipo permite 1 GB; y la lista incluye archivos de 8.5 GB y 18 GB.
- Botón principal `#6B8DD6` con texto blanco (3.28:1) en `cuadricula` y `lista` no cumple AA (DF-41); la
  implementación y los estados de 005 usan el token corregido.
- Versión móvil real a 360 px de `cuadricula` y `lista`: el paquete está diseñado para escritorio.
- Estado `seleccion` del inventario: la selección múltiple se difiere (spec 007 §7, P-4), igual que la cuadrícula y los
  filtros (pasan a 018).
