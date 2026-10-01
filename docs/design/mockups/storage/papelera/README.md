# Mockup: Papelera

- **Spec**: 006 (carpetas y papelera; RF-11, CA-10 a CA-21)
- **Propuesta presentada**: p. 11 (`papelera.html`). Los estados de 006 no se presentaron.
- **Origen**: dos tecnologías en la misma carpeta.
  - `papelera.html`: HTML empaquetado y autocontenido de la propuesta (Cielo Sereno original, lienzo de ≈ 1490 px con
    el rótulo de la hoja). No se genera ni se edita. Su captura es `papelera--default`.
  - `papelera--*.html` (spec 006): HTML autocontenido generado con `../../_generadores/papelera/generar.js`; no se edita
    a mano. Marco de `_generadores/marco/marco.js`; cuota, tabla, menú ⋮ y estados comunes de
    `_generadores/mis-archivos/`; logo, barra lateral con «Carpetas», toast y diálogos de `_generadores/carpetas/`
    (los mismos de `storage/explorador`). Tonos AA de `ui-guidelines.md` §2–§3, solo Inter, cifras con `tabular-nums`,
    versión móvil real a 360 px.
  - Son referencia visual; `apps/web` no los importa.
- **Capturas**: `docs/design/capturas/storage/papelera/` (`papelera--<estado>--<360|1440>.png`). En los 12 estados de
  006: axe-core sin violaciones a 360 y 1440 px, sin desbordamiento horizontal a 360 px, sin errores de consola y sin
  objetivos menores de 24 px (`_generadores/pw/axe-seguridad.js` sobre la carpeta). En `acciones` se recorrió el teclado
  del menú ⋮ (flechas y Escape devuelve el foco al botón).

## Estados incluidos
| Estado | Archivo | Qué muestra |
|---|---|---|
| default (propuesta) | `papelera.html` | Propuesta p. 11, sin cambios |
| con-elementos | `papelera--con-elementos.html` | Lista de 6 elementos (2 carpetas), resumen de espacio y retención, aviso de purga próxima |
| vacia | `papelera--vacia.html` | `StateView` vacío con «Ir a Mis archivos»; sin resumen ni «Vaciar papelera» |
| cargando | `papelera--cargando.html` | Esqueleto de la tabla y «Cargando la papelera…» (`role="status"`) |
| error | `papelera--error.html` | Falló `GET /trash`: error con «Reintentar» |
| seleccion | `papelera--seleccion.html` | 2 filas elegidas (fila seleccionada de §5) y barra con «Restaurar 2» y «Quitar selección» |
| acciones | `papelera--acciones.html` | Menú ⋮ de una fila: «Restaurar» y «Eliminar definitivamente» |
| restaurado | `papelera--restaurado.html` | Restaurar uno sin conflicto: toast «Restauramos … en {carpeta}.» con «Abrir carpeta» |
| restaurado-con-avisos | `papelera--restaurado-con-avisos.html` | Resultado por elemento (CA-14, CA-15, CA-17): restaurado, renombrado «(1)», a la raíz y uno rechazado por profundidad (`422`) |
| confirmar-eliminar | `papelera--confirmar-eliminar.html` | `ConfirmDestructiveDialog` de «Eliminar definitivamente» con el espacio que se libera (CA-18) |
| confirmar-vaciar | `papelera--confirmar-vaciar.html` | Igual para «Vaciar papelera» |
| vaciando | `papelera--vaciando.html` | Vaciado diferido (`DELETE /trash` → `202`): aviso `role="status"` con el espacio que se liberará, cada fila con «Vaciando…» y sin acciones, casillas y «Vaciar papelera» deshabilitados (CA-18, plan R-1) |
| vaciada | `papelera--vaciada.html` | Al terminar el trabajo (la página vuelve a leer `GET /trash/summary`): papelera vacía y toast «Vaciaste la papelera. Liberaste 2.7 GB de espacio.» |

## Datos de ejemplo
Plan Equipo (`product-context.md` §3): 350 GB, 60 días de retención; hoy es 30 sep 2026. Cuota lateral 304 GB (87 %),
igual que `storage/explorador`. Elementos de lo más reciente a lo más antiguo (CA-12): dos carpetas con su tamaño total,
`.docx`, `.xlsx`, `.mp4` y `.pdf`; dos con 4 y 1 días restantes. Total 2.7 GB. En la app, la
retención, los tamaños y las fechas vienen de la API (`GET /trash/summary` y `GET /trash`); los días restantes los
calcula `web` a partir de `purgeAt` (plan §4).

## Cambios respecto de la propuesta (p. 11)
Solo cuentan estos; lo demás se mantiene.
1. **Sin «Eliminado por» ni filtros** «Todos / Eliminados por mí / Por el equipo / Purga automática» (P-10: llegan con
   012). Sin «Ordenar»: el orden es fijo, de lo más reciente a lo más antiguo (CA-12).
2. **Sin «descárgalos»**: desde la papelera no se descarga (P-9, decisión de Adrián). El aviso dice «Restáuralos antes
   de esa fecha si los necesitas.» y no tiene botón «Ver los 3».
3. **Sin «Los archivos restaurados vuelven a indexarse automáticamente»** (019).
4. **Resumen arriba de la lista, no en la barra lateral**: «Espacio que ocupa» (cuenta contra la cuota) y «Retención de
   tu plan» en dos bloques. La barra lateral vuelve a ser la común, con la cuota.
5. **Columnas**: Nombre (las carpetas con «Carpeta» debajo), Ubicación original (solo el nombre de la carpeta donde estaba,
   `TrashItem.originalFolder`; «Mis archivos» si es la raíz; la propuesta mostraba la ruta), Tamaño, Eliminado (fecha) y
   Días restantes en texto; la barrita de días de la propuesta se quita (solo color) y los ≤ 7 días llevan ícono de reloj
   y texto `warning-foreground` (5.20:1).
6. **Acciones por fila**: «Restaurar» visible (`outline`, como la propuesta) y menú ⋮ con «Restaurar» y «Eliminar
   definitivamente». A 360 px solo el ⋮.
7. **Botones**: «Vaciar papelera» `outline` con texto y borde `destructive` (5.39:1); el principal usa el token
   corregido (DF-41). «Restaurar selección · 2» del encabezado pasa a la barra de selección.

## Decisiones de UX (pendientes de aprobación)
- **Eliminar definitivamente solo por elemento o vaciando todo** (CA-18): la selección solo restaura. La confirmación
  dice la consecuencia y el espacio que se libera; el foco empieza en «Cancelar». Para una carpeta: «¿Eliminar
  definitivamente la carpeta «{nombre}»?» / «Se eliminarán también sus {n} elementos. Esta acción no se puede deshacer.
  Liberarás {tamaño} de espacio.» «Eliminar definitivamente» es síncrono; si tarda más de 2 s, el botón del diálogo
  pasa a «Eliminando…» con el ícono giratorio (patrón de `descarga-preparando`), sin estado propio. «Vaciar papelera» es
  diferido: el diálogo se cierra al aceptar `202` y la lista muestra `vaciando`.
- **Resultado de restaurar**: uno sin cambios → toast con «Abrir carpeta» (se cierra solo). Con aviso (renombrado o a la
  raíz) o varios → panel persistente arriba de la lista (`role="status"`) con una línea por elemento que empieza con
  «Restaurado.», «Restaurado con cambios.» o «No restaurado.» (texto e ícono; el color no es el único indicio). Se cierra
  con «Cerrar resultado». Una llamada por elemento (plan §4): `outcome` `restored`, `renamed` o `moved_to_root`;
  `422` de profundidad con el texto de CA-15; `404` (ya purgado o inexistente) con «No encontramos «{nombre}» en la
  papelera. Puede que ya se haya eliminado definitivamente.»
- **Aviso de purga próxima**: aparece si hay elementos con ≤ 7 días (umbral de la UI); tono `warning` como
  `ReadOnlyBanner`, `role="note"`.
- **Selección**: casillas de 24 px; «Seleccionar todos los elementos de esta página» en el encabezado de la tabla (a
  360 px el encabezado se oculta y no hay «seleccionar todo»). Fila seleccionada con `bg-accent` y barra `brand` de 3 px;
  metadatos en `secondary-foreground` (en `muted-foreground` fallaba AA sobre `accent`).
- **Vacía**: «La papelera está vacía» / «Lo que elimines aparecerá aquí durante {días}, la retención de tu plan.» (la
  spec dice «hasta que se cumpla la retención de tu plan»; se propone decir los días).
- **Error**: «No pudimos cargar la papelera.» / «Lo que eliminaste sigue a salvo. Inténtalo de nuevo.» con «Reintentar».
- **Toast**: `role="status"`, abajo a la derecha (a 360 px, a todo el ancho con la acción debajo del texto) y «Cerrar
  aviso». Requiere un componente nuevo (ver el README de `storage/explorador`, decisión del toast).
- **Sin permiso y solo lectura**: los roles internos reciben `403` y no ven la app del cliente (CA-23); el bloqueo por
  plan vencido llega con 010 (`ReadOnlyBanner`).

## Diferencias con la implementación actual (`apps/web`)
- Hacen falta `checkbox` y `alert-dialog` (005 ya los lista), `dropdown-menu` (005) y el toast (decisión pendiente).
- `StateView` necesita el nivel del encabezado y `variant: 'outline'` en el error (igual que en 005).

## Pendiente
- `papelera.html` (propuesta): botón `#6B8DD6` con texto blanco (3.28:1, DF-41) y sin versión móvil; queda como
  referencia histórica.
- Paginación: el mockup tiene 6 elementos y solo muestra el total; con más de una página se agrega la paginación de 007.
