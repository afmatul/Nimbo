# Mockup: Ficha de archivo con historial de versiones

- **Spec**: 014 (CA-6 a CA-12, CA-15, CA-16, CA-20; D-1 a D-10), 019 (estado de indexación: CA-4, CA-5, CA-7, CA-12 a
  CA-14, CA-19; P-3) y 021 (optimizar una imagen desde la ficha: CA-1, CA-2, CA-5, CA-6, CA-7, CA-9 a CA-11,
  CA-13 a CA-15, CA-17, CA-22; original conservado de 014b). 016 (participantes) se suma después.
- **Propuesta presentada**: No presentada (diseño interno); 019 es un cambio sobre ella (ver abajo).
- **Origen**: dos tecnologías en la misma carpeta.
  - Estados de 014: HTML autocontenido generado con `../../_generadores/ficha-archivo/generar.js` (ver
    [`_generadores/README.md`](../../_generadores/README.md)); no se edita a mano. Marco de `marco/marco.js`, barra
    lateral y cuota del plan Personal de `espacio/espacio.js` (la de 007), logo y toast de `carpetas/carpetas.js`, y
    esqueleto, error y `Alert` de `mis-archivos/estados.js`. Tokens AA de `ui-guidelines.md` §2–§3, solo Inter, cifras
    con `tabular-nums`. Versión móvil real a 360 px.
  - `ficha-archivo--vision.html`: el paquete de diseño interno anterior (antes `ficha-archivo.html`), con autoría por
    porcentaje, cambios por párrafo, indexación, accesos y enlace público. **No se implementa tal cual** (ver
    «Diferencias»). Solo se corrigió su texto de restaurar.
  - Son referencia visual; `apps/web` no los importa.
- **Estados incluidos** (plan Personal: conserva 3 versiones, contando la actual):
  - default: archivo en el límite (3 de 3), versiones 5, 4 y 3 (la 1 y la 2 ya se podaron) (`ficha-archivo.html`, CA-6)
  - una-version: una sola versión, solo «Descargar», y cómo nacen las versiones (`ficha-archivo--una-version.html`, CA-20)
  - cargando: esqueleto del historial con «Cargando el historial…» (`ficha-archivo--cargando.html`)
  - error: el historial no cargó, con «Reintentar» (`ficha-archivo--error.html`, CA-20)
  - confirmar-restauracion: 2 de 3, sin poda; dice el espacio que usará (`ficha-archivo--confirmar-restauracion.html`, CA-9, CA-20)
  - aviso-de-poda: 3 de 3; avisa qué versión se eliminará antes de confirmar (`ficha-archivo--aviso-de-poda.html`, CA-15)
  - restaurando: más de 2 s; botones deshabilitados, «Restaurando…» y anuncio (`ficha-archivo--restaurando.html`, CA-20)
  - restaurada: la versión 6 nace de la 4 y es la actual; la 3 se eliminó; toast (`ficha-archivo--restaurada.html`, CA-9, CA-13)
  - error-cuota: «Te faltan 1.6 MB…» con «Liberar espacio» (`ficha-archivo--error-cuota.html`, CA-12)
  - error-version-no-encontrada: la versión ya no existe; «Actualizar historial» (`ficha-archivo--error-version-no-encontrada.html`, CA-11)
  - no-encontrado: archivo en la papelera, inexistente o ajeno; mismo mensaje en los tres casos (`ficha-archivo--no-encontrado.html`, CA-16, CA-17)
  - descarga-preparando: la URL firmada de una versión tarda más de 2 s (`ficha-archivo--descarga-preparando.html`, CA-8)
  - **019, estado de indexación** (misma ficha con chip y aviso; archivo de una sola versión para que el foco sea el estado):
    - indexando: `pendiente` o `indexando`, sin distinguirlos para el cliente (`ficha-archivo--indexando.html`, CA-14)
    - indexado: «Listo para consultar con el agente» (`ficha-archivo--indexado.html`, CA-1)
    - indexado-aviso: el mismo estado cuando termina mientras miras la ficha; toast, sin recargar (`ficha-archivo--indexado-aviso.html`, CA-14)
    - no-indexable: sin texto, PDF escaneado (`ficha-archivo--no-indexable.html`, CA-4)
    - no-indexable-formato: el contenido no corresponde a la extensión (`ficha-archivo--no-indexable-formato.html`, CA-5)
    - no-indexable-grande: supera el tope de indexación, plan Pro (`ficha-archivo--no-indexable-grande.html`, CA-7)
    - fallido: tras agotar los reintentos; «Reintentar» para propietario y editor (`ficha-archivo--fallido.html`, CA-12, CA-13)
    - fallido-reintentando: > 2 s, botón `aria-disabled` con «Reintentando…» y anuncio, el foco no se pierde (`ficha-archivo--fallido-reintentando.html`)
    - fallido-error-reintento: el reintento no llegó al servidor; dice qué hacer (`ficha-archivo--fallido-error-reintento.html`)
    - solo-lectura-lector: lector de un archivo compartido; ve estado y motivo, sin «Reintentar» ni historial (`ficha-archivo--solo-lectura-lector.html`, CA-13, CA-19)
  - **021, optimizar una imagen** (tarjeta «Optimizar espacio» encima del historial; `Foto_inventario.jpg`, plan
    Personal, 3 de 3 versiones; cifras ilustrativas 4.8 MB → 2.9 MB, ahorro 1.9 MB, 40 %):
    - optimizar-sin-estimacion: texto breve y «Calcular ahorro» (`ficha-archivo--optimizar-sin-estimacion.html`, CA-1)
    - optimizar-estimando: «Calculando el ahorro…», progreso indeterminado y anuncio; la ficha sigue usable (`ficha-archivo--optimizar-estimando.html`, CA-1, RNF-14)
    - optimizar-conviene: tamaño actual, estimado, «Ahorrarías 1.9 MB (40 %)» y «Optimizar» (`ficha-archivo--optimizar-conviene.html`, CA-1)
    - optimizar-confirmar: diálogo «¿Optimizar esta imagen?» con la fecha de conservación y, en 3 de 3, el aviso de poda de 014 (`ficha-archivo--optimizar-confirmar.html`, CA-6, CA-13)
    - optimizar-no-conviene: cifras y «El ahorro sería mínimo…», sin «Optimizar» (`ficha-archivo--optimizar-no-conviene.html`, CA-2)
    - optimizar-no-disponible: tres archivos, uno por motivo, sin botón y sin cifras de límite (CA-5):
      tamaño, «Esta imagen supera el tamaño máximo permitido para optimizarla.» (`ficha-archivo--optimizar-no-disponible.html`);
      resolución, «Esta imagen supera la resolución máxima permitida para optimizarla.» (`ficha-archivo--optimizar-no-disponible-megapixeles.html`);
      GIF animado, «La optimización no está disponible para GIF animados.» (`ficha-archivo--optimizar-no-disponible-animado.html`)
    - optimizar-optimizando: «Optimizando… Puedes seguir usando Nimbo; te mostramos el resultado aquí.», progreso indeterminado (`ficha-archivo--optimizar-optimizando.html`, CA-6, RNF-14)
    - optimizar-completada: la tarjeta en su estado normal con el texto «Optimizamos tu imagen: ahorraste 1.9 MB (40 %).»; versión 4 «Optimización» ACTUAL y NUEVA, la 3 con «Original conservado hasta 1 nov 2026 · no ocupa tu espacio», la 1 podada y la cuota de 4.9 GB a 4.8 GB (`ficha-archivo--optimizar-completada.html`, CA-7, CA-15)
    - optimizar-descartada: «El ahorro real fue mínimo. Tu archivo no cambió.» (`ficha-archivo--optimizar-descartada.html`, CA-10; variante de texto de CA-11 abajo)
    - optimizar-error-integridad: «No pudimos optimizar este archivo sin dañarlo…», sin invitar a repetir (`ficha-archivo--optimizar-error-integridad.html`, CA-9)
    - optimizar-error-servicio: «El optimizador no está disponible ahora…» con «Calcular ahorro» habilitado (`ficha-archivo--optimizar-error-servicio.html`, CA-14)
    - optimizar-solo-lectura: `ReadOnlyBanner` de 010 CA-13 una sola vez arriba de la vista, con «Renovar plan»; la estimación se ve y «Optimizar» queda deshabilitado (`aria-disabled`, descrito por el banner); el historial no ofrece «Restaurar» (`ficha-archivo--optimizar-solo-lectura.html`, CA-17)
  - vision: paquete de diseño interno (`ficha-archivo--vision.html`), solo como referencia
- **Capturas**: `docs/design/capturas/storage/ficha-archivo/` (`ficha-archivo--<estado>--<360|1440>.png`). axe-core sin
  violaciones en los 12 estados de 014 a 360 y 1440 px; sin desbordamiento horizontal a 360 px; objetivos de 36 px en
  escritorio y 44 px en móvil; sin errores de consola. `vision` no pasa axe (paquete; contraste y título): es histórico.
  Los 10 estados de 019 también pasan axe-core (0 violaciones) a 360 y 1440 px, sin desbordamiento y sin errores de consola.
  **021:** los 14 estados tienen sus 28 capturas a 360 y 1440 px (`ficha-archivo--optimizar-<estado>--<360|1440>.png`)
  y pasan axe-core con 0 violaciones de cualquier gravedad, sin desbordamiento a 360 px, sin objetivos de menos de
  24 px y sin errores de consola (2026-10-25). Se usaron los scripts del repositorio (`pw/capturar-rutas.js` y
  `pw/axe-seguridad.js`) copiados a un directorio temporal fuera del repo, con Playwright 1.48.2 y axe-core 4.10.2
  instalados allí y el Chrome del sistema (`channel: 'chrome'`); única diferencia con el original: el canal del
  navegador y, en axe, el filtro a los archivos `--optimizar-`. El repositorio no ganó dependencias.
- **Propuesta presentada**: este cambio (estado de indexación en la ficha, 019) **no está en el PDF «Mockups nimbo final»
  (p. 03–18)**: es un cambio interno respecto de la propuesta firmada, decidido por Adrián en P-3 (2026-10-21): el estado
  vive solo en la ficha, sin columna en el explorador.

## Decisiones de UX
- **Entrada**: menú ⋮ de la fila del archivo, «Ver historial» (plan 014). Ruta propia de la ficha, sin panel lateral (D-10).
  En móvil, «‹ {carpeta}» vuelve a la carpeta.
- **Encabezado**: ícono de tipo (`FileTypeChip`), nombre, «2.6 MB · versión 5 · en Proyecto Alpha» y «Descargar»
  (la versión actual, ruta de 005). Sin «Compartir» ni «Abrir y editar» hasta 012 y 016.
- **Historial (`VersionTimeline`)**: lista ordenada (`<ol>`), de la más reciente a la más antigua. Cada versión dice en
  texto: «Versión N», distintivo «ACTUAL» (ícono + texto, `success-foreground` sobre `success` al 12 %), fecha, autor
  («Tú»: el propietario es el único autor antes de 016, D-9), origen con ícono («Carga», «Restauración de la versión k»,
  y «Edición»/«Optimización» cuando lleguen 016 y 021), tamaño y cambio («+200 KB», «−100 KB»).
  - En escritorio, columnas con un encabezado visual `aria-hidden`; cada fila ya trae sus datos en texto. Entre 601 y
    1180 px y en móvil, la versión se apila (rótulos «Origen:» y «Tamaño:» visibles) y en móvil los botones van a todo
    el ancho (44 px).
  - Cambio de tamaño: para lectores, «200 KB más que la versión 4». La primera versión dice «Primera versión»; la más
    antigua retenida cuya anterior ya se podó dice «Sin comparación» (lectores: «la versión 2 ya no se conserva»).
  - **La versión actual no tiene «Restaurar»** (sería `409 STORAGE_VERSION_ALREADY_CURRENT`); solo «Descargar». El
    `409` queda para una carrera (otra pestaña restauró) y se muestra como `Alert` con «Actualizar historial», igual
    que el `404`.
  - Botones con nombre accesible completo: «Descargar la versión 4», «Restaurar la versión 4».
  - Subtítulo: «3 versiones · tu plan Personal conserva 3, contando la actual» (`retainedVersions` de la API, D-2).
  - Pie: «Restaurar crea una versión nueva; solo se elimina la más antigua cuando pasas el límite de tu plan.»
  - Tras restaurar, la versión nueva lleva «NUEVA» y fondo `brand` al 12 % con barra de 3 px (no solo color) hasta que
    se recarga la ficha.
- **Detalles**: tipo, tamaño de la actual, **espacio que ocupan todas sus versiones** (suma del historial; D-1: todas
  cuentan en la cuota), ubicación, creado y modificado. Sin indexación ni accesos hasta 019 y 012.
- **Confirmar restaurar** (`AlertDialog`): título «¿Restaurar la versión 4?», texto de la spec «Se creará una versión
  nueva con el contenido de la versión 4. Usará 2.4 MB de tu espacio.» y un resumen (versión elegida y «Versión 5 · se
  conserva en el historial»). Botón `primary` «Restaurar versión 4» (no es destructivo: no se pierde contenido).
  - **Sin poda**: foco inicial en «Restaurar versión N».
  - **Con poda** (CA-15): `Alert` `warning` dentro del diálogo, «**Se eliminará la versión 3.** Tu plan conserva 3
    versiones. Al continuar se eliminará la versión 3, la más antigua.» (`role="status"`, incluido en
    `aria-describedby`); el foco inicial pasa a «Cancelar» porque ahora sí se pierde algo.
  - **Restaurando** (> 2 s): el patrón `pending` de `ConfirmDestructiveDialog`: ambos botones deshabilitados,
    «Restaurando…» con indicador, anuncio `role="status"` y Escape no cierra.
  - **Error de cuota** (`422`): `Alert` de error en el diálogo con el texto de la spec y «Liberar espacio» (lleva a
    `/espacio`); «Cerrar» recibe el foco. «Ver planes» se suma cuando 008 esté implementada, como en 005.
- **Éxito**: el diálogo se cierra, el historial se recarga y un toast (arriba al centro, `role="status"`) dice
  «Restauraste la versión 4 como versión 6.». No afirma la poda: corre después del commit y es de mejor esfuerzo (plan
  014 §1); el historial recargado ya no muestra la versión eliminada.
- **Descarga de una versión**: «Descargar» pasa a «Preparando…» (`aria-disabled`, sigue enfocable) con anuncio, como
  en 005; si falla, el `Alert` de descarga fallida de 005.
- **Archivo no encontrado** (`404 STORAGE_NODE_NOT_FOUND`): el mismo mensaje para papelera, inexistente y ajeno (no
  revela cuál es) con «Ir a Mis archivos».
- Roles internos: no llegan a esta ruta (`403`); no se dibuja nada para ellos. Solo lectura (010) no se dibuja: 010
  ocultará «Restaurar».

## Decisiones de UX de 019 (estado de indexación)
- **Dónde**: bajo el subtítulo del encabezado, un chip (`StatusBadge`: ícono + texto, nunca solo color) con una frase corta, y
  entre el encabezado y las tarjetas un aviso (`Alert`) con el motivo y lo que puede hacer el cliente. Fila «Indexación» en
  Detalles (cuándo y de qué versión; RN-1). Nada en el explorador ni en la fila del archivo (P-3).
- **Estados y copia** (tuteo, sin «embeddings», «fragmentos» ni «vector»):
  | Estado | Chip | Aviso |
  |---|---|---|
  | `pendiente` / `indexando` | «Indexando…» (ícono girando) | info: «Indexando… ya puedes seguir trabajando.» Descargar, editar y compartir siguen igual |
  | `indexado` | «Indexado» + «Listo para consultar con el agente» | sin aviso fijo; al terminar en vivo, toast |
  | `no_indexable` | «No se indexa» + «Se busca solo por nombre» | info con el motivo: sin texto, formato no soportado, demasiado grande (50 MB, desde la API) |
  | `fallido` | «No se pudo indexar» | error con «Reintentar» (propietario y editor) |
- **`pendiente` e `indexando` se ven igual**: al cliente le da lo mismo si está en cola o en curso; se evita una distinción
  sin acción asociada.
- **No indexable no es un error**: usa `info` (no `destructive`); el archivo funciona y se busca por nombre. Solo `fallido`
  usa el tono de error, porque hay algo que reintentar. Cada motivo dice qué pasa y, si hay salida, cuál (PDF sin texto:
  «súbela con el mismo nombre y elige "Reemplazar"»); sin OCR (§9).
- **Aviso en vivo (CA-14)**: el contenedor `role="status"` (`aria-live="polite"`) existe siempre, también vacío, y el
  contenido cambia dentro de él; no mueve el foco ni usa `role="alert"` (no interrumpe). Al pasar a `indexado` se muestra
  un toast («Listo para consultar con el agente: {archivo}.») y el chip cambia; el cambio llega por el canal en vivo de 015.
  Con `prefers-reduced-motion` el ícono de «Indexando…» queda quieto.
- **«Reintentar»** (CA-13): botón `outline` pequeño dentro del aviso, con foco visible. Al pulsarlo pasa a «Reintentando…»
  con `aria-disabled` (sigue enfocable: el foco no se pierde) y un anuncio. Cuando el estado cambia a `indexando`, el
  botón desaparece y el foco debe pasar al contenedor del aviso (`tabindex="-1"`), no al `body`. Si falla la petición, el
  aviso dice «No pudimos reintentar la indexación. Tu archivo no cambió…» y el botón sigue disponible.
- **Lector** (CA-13, CA-19): ve el mismo chip y el motivo; sin «Reintentar» (el texto explica que solo quien puede editar
  lo reintenta) y sin historial de versiones. La UI no ofrece lo que el servidor niega.
- **Roles internos**: no llegan a la ficha (`403`); no se dibuja nada (CA-20).
- **Sin estado de «límite del plan»**: indexar no descuenta cupos ni almacenamiento (RN-8). «Demasiado grande» usa el tope de
  indexación (RN-7), que no depende del plan; se dibuja con un archivo de 120 MB de un plan Pro (el Personal solo sube 50 MB).
- Sin cuenta en solo lectura por suscripción: indexar no es acción del cliente (CA-22), el estado se ve igual.

## Decisiones de UX de 021 (optimizar una imagen)
- **Dónde**: archivo por archivo, en la ficha (decisión de Adrián sobre P-3). Una tarjeta «Optimizar espacio» (`Card`)
  es la primera de la rejilla, encima del historial, porque el resultado se ve en el historial justo debajo. No hay
  pantalla global ni ítem «Optimizador» en la navegación: en los estados de 021 el generador quita ese ítem que trae
  `marco/marco.js` (los estados de 014 y 019 no se tocan; ver «Pendiente»).
- **Cuándo aparece**: solo para imágenes `png`, `jpg`/`jpeg`, `gif` estático y `webp` (también animado) del
  propietario (RN-1, RN-5). El WebP animado se optimiza conservando cuadros, tiempos y bucle (sujeto al spike de
  ADR-0037); solo el GIF animado queda fuera.
  Para un PDF (spec futura 021b), un `.docx` u otro tipo **la tarjeta no se dibuja** (CA-3): no se ofrece lo que la API
  rechaza. Lectores y roles internos tampoco la ven.
- **Ícono de tipo**: `FileTypeChip` de imagen (`--file-img`, como en 007), en el encabezado.
- **Cifras** (`opt-figs`): tamaño actual y estimado en grande (`tabular-nums`), una barra comparativa decorativa
  (`aria-hidden`; el relleno `primary` es el estimado respecto del actual) y el ahorro en texto con ícono, «Ahorrarías
  1.9 MB (40 %)», en `success-foreground`. Debajo, una nota: el original se conserva 7 días y no ocupa tu espacio.
  «Optimizar» es `primary` (no destructivo: el original sigue restaurable).
- **No conviene / descartada / no disponible**: `Alert` `info`, no de error (el archivo funciona). Sin botón. En «no
  conviene» las cifras siguen visibles (CA-1) y el ahorro va en `secondary-foreground` (sin tono de éxito).
- **No disponible: tres archivos, uno por motivo** (tamaño, resolución, GIF animado), para que cada texto tenga su
  captura y su prueba; la estructura es la misma. **Sin números de límite en la UI**: los límites aún no están medidos
  (P-11) y el texto no depende de ellos («Esta imagen supera el tamaño máximo / la resolución máxima permitida para
  optimizarla.»). Los tamaños de los archivos de ejemplo son datos del archivo, no límites. El tamaño se conoce sin
  estimar, así que ese aviso reemplaza a «Calcular ahorro» desde el principio; resolución y animación se conocen al
  estimar, y el aviso reemplaza al resultado.
- **Descartada (variante de texto, CA-11)**: si el archivo cambió mientras se optimizaba, el mismo `Alert` `info` dice
  «Tu archivo cambió mientras se optimizaba. No aplicamos la optimización; puedes calcular el ahorro de nuevo.» y suma
  «Calcular ahorro» (la estimación anterior ya no vale). No se genera un archivo aparte.
- **Errores**: `Alert` de error (tono `destructive`). Integridad (CA-9): sin botón, no invita a repetir. Servicio
  (CA-14): «Calcular ahorro» habilitado debajo, para volver a pedirla cuando el servicio vuelva. Los dos dicen primero
  que el archivo no cambió.
- **En curso** (estimando y optimizando, > 2 s, RNF-14): ícono girando, título y texto, una barra indeterminada
  (`role="progressbar"` sin `aria-valuenow`, con nombre) y el botón que se pulsó queda en su sitio como «Calculando…» u
  «Optimizando…» con `aria-disabled` (sigue enfocable: el foco no se pierde, patrón de «Reintentando…» de 019). Al
  llegar el resultado el botón desaparece y el foco pasa al cuerpo de la tarjeta (`tabindex="-1"`), no al `body`. Con
  `prefers-reduced-motion` el ícono queda quieto y la barra se ve llena en un tono suave, sin movimiento.
- **Sin tiempo real**: la ficha consulta el estado periódicamente; el contenedor `role="status"` (`aria-live="polite"`)
  de la tarjeta existe siempre y su contenido cambia dentro, así cada cambio se anuncia sin mover el foco. Sin toast:
  el resultado se muestra en la tarjeta («te mostramos el resultado aquí») y ya se anuncia; un toast lo repetiría.
  Si la implementación necesita aviso transitorio (por ejemplo, si el cliente se fue de la ficha), se usa el toast
  existente de 006/014 (`carpetas/carpetas.js`), sin variantes nuevas.
- **Confirmar** (`AlertDialog`, mismo patrón que restaurar): «¿Optimizar esta imagen?», «Se creará una versión
  optimizada. El original se conserva hasta el 1 nov 2026 y no ocupa tu espacio.» (fecha = hoy + retención en papelera
  del plan, 7 días en Personal; viene de la API) y un resumen (actual 4.8 MB · versión 3; estimado 2.9 MB · ahorras
  1.9 MB). En 3 de 3, el mismo `Alert` `warning` de 014 CA-15: «**Se eliminará la versión 1.** Tu plan conserva 3
  versiones. Al continuar se eliminará la versión 1, la más antigua.», y el foco inicial pasa a «Cancelar». Por debajo
  del límite no hay aviso y el foco inicial va a «Optimizar».
- **Completada**: la tarjeta en su estado normal, sin `Alert` (no hay variante de éxito en `ui-guidelines.md` §4):
  el texto «Optimizamos tu imagen: ahorraste 1.9 MB (40 %).» con ícono de check, con el mismo estilo que el ahorro
  estimado (`success-foreground` sobre `card`), y una nota con cuándo vence el original. En el historial la versión 4 («Optimización», ACTUAL y NUEVA). La versión 3 lleva una marca de texto con ícono a lo ancho
  de su fila, «Original conservado hasta 1 nov 2026 · no ocupa tu espacio» (no solo color), y conserva «Restaurar»
  (restaurar sí usa espacio, como 014; el diálogo de restaurar ya lo dice). El original conservado ocupa uno de los 3
  lugares, así que la versión 1 se podó y la 2 dice «Sin comparación». Detalles: «Con versiones» ya no suma el original
  (7.4 MB) y una fila «Original conservado» lo explica. La cuota de la barra lateral baja de 4.9 GB a 4.8 GB (cifras
  elegidas en el borde del redondeo para que la bajada se vea; un ahorro pequeño puede no cambiar el decimal).
- **Solo lectura** (CA-17): el patrón existente, el `ReadOnlyBanner` (`avisoSoloLectura` del marco) **una sola vez,
  arriba de la vista**, con el texto de 010 CA-13 («Tu suscripción venció y tu cuenta está en solo lectura. Renueva tu
  plan para volver a subir, editar y compartir.») y «Renovar plan». La tarjeta es la de «conviene» (estimar está
  permitido) con «Optimizar» deshabilitado: `aria-disabled="true"` (sigue enfocable) y `aria-describedby` al título
  del banner, con la opacidad de los botones deshabilitados. Sin segundo banner ni texto nuevo en la tarjeta. El
  historial no ofrece «Restaurar» (010 CA-13 la rechaza).
- **Tamaños**: botones de la tarjeta de 36 px en escritorio y 44 px a todo el ancho en móvil; el diálogo usa el de 014.
- **Texto «esta imagen»**: la spec §6 dice «no vale la pena optimizar este archivo»; el mockup usa «esta imagen»
  porque la 021 solo optimiza imágenes. Se alinea la spec o el mockup al aprobar.

## Contraste de los pares nuevos (WCAG 2.1)
| Par | Contraste |
|---|---|
| `warning-foreground` sobre `warning` al 10 % sobre `card` (aviso de poda) | 4.86 |
| `foreground` sobre `warning` al 10 % (texto del aviso) | 12.69 |
| `primary-hover` sobre `card` (distintivo NUEVA) | 6.78 |
| `secondary-foreground` / `foreground` sobre `brand` al 12 % (fila nueva) | 7.18 / 12.06 |
| `muted-foreground` sobre `brand` al 12 % (ícono de autor, no texto) | 4.23 |
| `primary` sobre `card` (íconos de origen y del pie) | 4.97 |
| `success-foreground` sobre `success` al 12 % (ACTUAL) | 4.80 |
| `secondary-foreground` sobre `muted` (resumen del diálogo; chips «Indexando…» y «No se indexa») | 7.45 |
| `success-foreground` sobre `success` al 12 % (chip «Indexado») | 4.80 |
| `destructive` sobre `destructive-soft` al 12 % (chip y título del aviso de `fallido`) | ≈ 4.9 (axe sin violaciones) |
| `foreground` sobre `card` (título del aviso informativo) / `primary` sobre `card` (su ícono) | 15.6 / 4.97 |
| 021: `success-foreground` sobre `card` (ahorro «Ahorrarías…» y resultado «Optimizamos tu imagen…») | 5.24 |
| 021: `secondary-foreground` sobre `muted` (marca «Original conservado») / `primary` sobre `muted` (su ícono) | 7.45 / 4.59 |
| 021: `primary` sobre `muted` (barra indeterminada y barra comparativa, no texto; mínimo 3:1) | 4.59 |
| 021: `file-img` sobre `file-img-bg` (ícono de imagen del encabezado, el de 007) | el de 007 |

## Diferencias con `ficha-archivo--vision.html`
1. Autoría por porcentaje y cambios «+2 párrafos»: fuera de alcance (atribución por párrafo, `product-context.md` §9;
   RN-6 de 014 solo pide cambio de tamaño).
2. Autores múltiples por versión: llegan con 016 (anillo de `ParticipantAvatar`); antes, solo «Tú».
3. «Restaurar» en la versión actual y «Deshacer» en el aviso de éxito: no existen en 014.
4. «Mostrar 6 versiones anteriores»: sin paginación en 014 (máximo 100, plan 014 §4).
5. Indexación, accesos, enlace público, «Compartir», «Abrir y editar» y el buscador/agente del marco: 019, 012, 013, 016, 020.
6. Colores fuera de tokens y botón `#6B8DD6` con texto blanco (3.28:1, DF-41).
7. Sin versión móvil.

## Pendiente
- 021: los 22 estados de 014 y 019 (y el resto de mockups con la barra de `marco/marco.js`) siguen mostrando el ítem
  «Optimizador» en la navegación; quitarlo del marco cambia todos esos HTML y se hace en un cambio aparte.
- 021: P-2 y P-11 están resueltas como regla (spec RN-2 y RN-8) y sus valores técnicos se midieron en el spike (plan §6); la UI no muestra cifras de límite.
- Participantes de una versión de edición (016).
- Ficha del lector (019 CA-19): la ficha de 014 es solo del propietario (`404` para ajenos, CA-16); la vista de lector se
  dibuja como referencia y depende de 012 (compartir). Ver decisiones pendientes en el informe de 019.
- Contrato (plan 014 §4): `FileVersionSummary` necesita el número de la versión de origen de una restauración
  (`restoredFromNumber`, que sobreviva a la poda de esa versión) y `deltaBytes` nulo cuando no hay versión anterior
  retenida. Sin ellos, la fila dice solo «Restauración» y el cambio frente a una versión podada no se puede calcular.
