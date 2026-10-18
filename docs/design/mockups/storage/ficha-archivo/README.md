# Mockup: Ficha de archivo con historial de versiones

- **Spec**: 014 (CA-6 a CA-12, CA-15, CA-16, CA-20; D-1 a D-10). 019 (estado de indexación) y 016 (participantes) se
  suman después.
- **Propuesta presentada**: No presentada (diseño interno).
- **Origen**: dos tecnologías en la misma carpeta.
  - Estados de 014: HTML autocontenido generado con `../../_generadores/ficha-archivo/generar.js` (ver
    [`_generadores/README.md`](../../_generadores/README.md)); no se edita a mano. Marco de `marco/marco.js`, barra
    lateral y cuota del plan Personal de `espacio/espacio.js` (la de 007), logo y toast de `carpetas/carpetas.js`, y
    esqueleto y error de `mis-archivos/estados.js` y `Alert` de `mis-archivos/avisos.js`. Tokens AA de
    `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`. Versión móvil real a 360 px.
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
  - vision: paquete de diseño interno (`ficha-archivo--vision.html`), solo como referencia
- **Capturas**: `docs/design/capturas/storage/ficha-archivo/` (`ficha-archivo--<estado>--<360|1440>.png`). axe-core sin
  violaciones en los 12 estados de 014 a 360 y 1440 px; sin desbordamiento horizontal a 360 px; objetivos de 36 px en
  escritorio y 44 px en móvil; sin errores de consola. `vision` no pasa axe (paquete; contraste y título): es histórico.

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
| `secondary-foreground` sobre `muted` (resumen del diálogo) | 7.45 |

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
- Participantes de una versión de edición (016) y estado de indexación (019, estado `no-indexable`).
- Contrato (plan 014 §4): `FileVersionSummary` necesita el número de la versión de origen de una restauración
  (`restoredFromNumber`, que sobreviva a la poda de esa versión) y `deltaBytes` nulo cuando no hay versión anterior
  retenida. Sin ellos, la fila dice solo «Restauración» y el cambio frente a una versión podada no se puede calcular.
