# Mockup: Búsqueda

- **Spec**: [018](../../../../../specs/018-busqueda/spec.md) (búsqueda por **nombre**, **tipo** y **fecha** de última
  modificación; RF-15 parcial; CA-1…CA-15, §6 y §7). La búsqueda por contenido es la
  [018b](../../../../../specs/018b-busqueda-por-contenido/spec.md) (CA-8, §6): un estado nuevo,
  `resultados-por-contenido`, **Pendiente de aprobación de Adrián** (ver «Estado de 018b»).
- **Estado**: **Aprobado** por Adrián (2026-10-28, auditoría del PR #81), con observaciones (ver «Aprobación»). Dueño de la spec: Juan Marcos. Alineado con
  la spec el 2026-10-26 (decisiones del dueño: entrada por la navegación, sin resaltado, filtro de fecha con atajos).
- **Origen**:
  - Estados de 018: HTML autocontenido generado con `_generadores/busqueda/generar.js` (marco, fila y tabla del
    explorador, estados de lista y barra lateral de 007, «Cargar más» de 007 y el patrón de filtros de
    `audit/mi-actividad`). No se editan a mano: se cambia el generador y se regenera
    (`node docs/design/mockups/_generadores/busqueda/generar.js "$(pwd)"`).
  - `busqueda--resultados.html`: paquete de la propuesta (p. 13), búsqueda por contenido. **No se usa tal cual** ni
    en 018 ni en 018b: muestra fragmentos, relevancia y conteos (fuera de alcance) y su botón `#6B8DD6` incumple AA
    (DF-41). No se genera. El estado de 018b es `resultados-por-contenido`.
- Son referencia visual; `apps/web` no los importa. Colores: valores de `ui-guidelines.md` §3 (botón primario `#4A6FA5`).
- **Capturas**: `docs/design/capturas/storage/busqueda/` (`busqueda--<estado>--<360|1440>.png`), con
  `_generadores/pw/capturar-rutas.js` (es-GT, hora de Guatemala, movimiento reducido). `menu-movil` solo a 360 (a
  1440 no hay cajón; mismo criterio que `shared/layout`).

## Estados de 018

| Estado | Archivo | Qué muestra | Spec |
|---|---|---|---|
| entrada | `busqueda--entrada.html` | `/buscar` recién abierta desde «Buscar» (activo en la barra lateral): campo vacío **con foco** e invitación «Escribe qué quieres buscar.»; sin filtros ni lista | CA-6, CA-12, §6 |
| resultados-por-nombre | `busqueda--resultados-por-nombre.html` | «camion» encuentra «Camión_Ventas.xlsx», «Ruta_CAMIONES…» y las carpetas «Camiones» y «Seguro del camión». Carpetas primero y luego archivos, cada grupo del más reciente al más antiguo; columnas nombre, ubicación (carpeta que lo contiene o «Mis archivos»), tamaño y modificado | CA-1, CA-2, CA-10 |
| filtros | `busqueda--filtros.html` | Tipo «Documentos» y «Últimos 30 días»: las carpetas y la imagen desaparecen; nota «Con un tipo elegido solo ves archivos» y «Quitar filtros» | CA-7, CA-8 |
| rango-invalido | `busqueda--rango-invalido.html` | «Rango personalizado» con Hasta antes de Desde: error junto a los campos («La fecha final debe ser igual o posterior a la inicial. Corrige el rango para buscar.»); no se consulta y la lista anterior se conserva | CA-9, §6 |
| sin-resultados | `busqueda--sin-resultados.html` | Cero resultados con filtros: «No encontramos nada con «camion».» + «Revisa lo que escribiste o quita los filtros.» y «Quitar filtros» | CA-11, §6 |
| sin-resultados-sin-filtros | `busqueda--sin-resultados-sin-filtros.html` | Cero resultados sin filtros: mismo título; texto «Revisa lo que escribiste.» y sin acción (no hay filtros que quitar) | CA-11 |
| cargando | `busqueda--cargando.html` | Campo y filtros deshabilitados, esqueleto con la forma de la lista y «Buscando «camion»…» (`role="status"`) | CA-11 |
| error | `busqueda--error.html` | `StateView` de error «No pudimos buscar.» + «Revisa tu conexión y vuelve a intentarlo.» con «Reintentar» | CA-11, §6 |
| cargando-mas | `busqueda--cargando-mas.html` | «Cargar más» en curso (patrón de 007): botón «Cargando más…» deshabilitado y la lista visible se conserva | CA-3 |
| cargar-mas-error | `busqueda--cargar-mas-error.html` | Falló la página siguiente (patrón de 007): aviso «No pudimos cargar más resultados.» con «Reintentar» debajo de la lista | CA-3 |
| menu-movil | `busqueda--menu-movil.html` | A 360: menú móvil (cajón) abierto en `/buscar` con «Buscar» activo | CA-12 |

La lista de `cargando-mas` y `cargar-mas-error` está abreviada (10 filas); en la app la página es de 50 (RN-6).

Fuera de alcance de 018 y ausente a propósito: campo fijo en la barra superior, resaltado de la coincidencia, total de
coincidencias, orden elegible, búsqueda mientras se escribe, «En comentarios», texto OCR, «Preguntar al agente»,
«Resumir con citas», «Incluir papelera», «Solo indexados», % de relevancia, «Ámbito de la búsqueda» y fragmentos de
contenido (spec §6 y §7).

## Estado de 018b (Pendiente de aprobación de Adrián, 2026-11-06)

| Estado | Archivo | Qué muestra | Spec |
|---|---|---|---|
| resultados-por-contenido | `busqueda--resultados-por-contenido.html` | «camion» con una sola lista en el orden de 018 (carpetas y luego archivos, del más reciente al más antiguo), sin total, relevancia, pestañas, fragmento ni resaltado. Coinciden solo por contenido y llevan la marca «Coincide en el contenido»: «Acta_reunion_logistica.docx», «Contrato_arrendamiento_flota.pdf», «Informe_entregas_septiembre.docx» (**Compartido contigo**, 012) y «Minuta_comite_operaciones.docx». «Mantenimiento_camion_C-12.docx» coincide por nombre y contenido: una vez y sin marca. Las carpetas y la imagen nunca la llevan. Nota de alcance bajo el título de la lista | CA-1, CA-4, CA-8, CA-9, CA-10, RN-2, RN-3 |

Decisiones visuales (propuestas):

1. **Marca = `StatusBadge` tono `neutral`** (§4 de `ui-guidelines.md`): ícono lucide `TextSearch` + texto «Coincide en
   el contenido», `secondary-foreground` sobre `card` (8.09:1), borde `border`. No hay token ni par de colores nuevo. El
   tono neutral evita que parezca un éxito, un aviso o un enlace (no es interactiva).
2. **Posición**: bajo el nombre, dentro de la celda «Nombre», a 360 y 1440 px (no columna nueva). El lector de pantalla
   la lee justo después del nombre del archivo; el nombre del enlace no cambia.
3. **Nota de alcance**: bajo «Resultados para «…»», con ícono `Info` en `primary` y texto `secondary-foreground`
   (13 px), asociada a la tabla con `aria-describedby`. Texto ajustado: «También buscamos dentro de los documentos ya
   indexados. Los que aún se están procesando, y los que no tienen texto (como las imágenes), solo aparecen por su
   nombre.» Se agrega «los que no tienen texto (como las imágenes)» porque CA-6 incluye `no_indexable` y `fallido`, y la
   imagen aparece en la lista sin marca. Si se prefiere el texto corto de la spec §6, se cambia la constante
   `NOTA_ALCANCE`.
4. **Textos del encabezado** (solo en este estado; en la app se aplican a toda `/buscar`): subtítulo «Encuentra archivos
   y carpetas por su nombre, y documentos por las palabras que contienen. Sin distinguir mayúsculas ni acentos.»,
   etiqueta «Nombre o palabras del documento» y formulario «Buscar por nombre o contenido». Los de 018 dicen «por su
   nombre» y quedarían inexactos.
5. **Sin resultados** (CA-8): no se dibuja otro estado; en la app la misma nota va bajo el mensaje de
   `sin-resultados` y `sin-resultados-sin-filtros`. Los HTML aprobados de 018 no se regeneran con cambios (el CSS de
   018b solo entra en los estados de 018b).

Verificación (2026-11-06): axe-core 4 (`pw/axe-seguridad.js`) a 360 y 1440 px sobre `resultados-por-contenido`: **sin
violaciones**; sin desplazamiento horizontal a 360 px; ningún objetivo menor de 24 px. Foco visible: la marca no es
interactiva y los enlaces conservan el anillo de 018. Capturas: `busqueda--resultados-por-contenido--360.png` y
`--1440.png`.

## Decisiones de UX (aprobadas por Adrián, 2026-10-28)

1. **Entrada por la navegación** (CA-12): ítem «Buscar» (ícono `Search` de lucide) después de «Mis archivos» en la
   barra lateral y en el cajón móvil, con `aria-current="page"` en `/buscar`. **No hay campo en la barra superior**
   (spec §7); la miga dice «Buscar». La navegación interna no lo recibe (CA-14). En `DEFAULT_NAV_ITEMS` de
   `AppLayout` se sugiere la misma posición: justo después de «Mis Archivos».
2. **Campo propio en `/buscar`** dentro del contenido: `form role="search"`, etiqueta visible «Nombre del archivo o
   carpeta», `type="search"`, `maxlength="255"` (RN-5), 44 px de alto y 16 px de letra (iOS no hace zoom), X «Borrar
   el texto» y botón primario «Buscar». Se busca al enviar (Enter o el botón), no mientras se escribe. El foco va al
   campo al entrar. Ayuda fija: «Se buscan todas las palabras que escribas, en cualquier orden.» (CA-1); el
   subtítulo dice la regla «Sin distinguir mayúsculas ni acentos».
3. **Entrada vacía** (CA-6): sin texto no se busca ni se muestran filtros; se ve la invitación «Escribe qué quieres
   buscar.» con la nota de que la papelera no entra (RN-2). Si se envía vacío o solo con espacios, la vista no cambia
   y el foco vuelve al campo. Los filtros aparecen con la primera búsqueda.
4. **Sin resaltado** (spec §7): el nombre se muestra tal cual. La web no pliega acentos (plan R-2).
5. **Fila = fila del explorador** (`FileTypeChip`/carpeta, nombre, tamaño, modificado) + columna **«Ubicación»** con
   la carpeta que lo contiene (o «Mis archivos»), enlace que la abre en el explorador. Nombre: carpeta → explorador
   (006); archivo → su ficha (014) (CA-10). **Sin menú ⋮** (YAGNI). A 360 px la ubicación y «tamaño · fecha» bajan bajo
   el nombre, sin columnas.
6. **Orden fijo** (CA-2): carpetas primero; cada grupo del modificado más reciente al más antiguo. Sin control de orden,
   relevancia **ni total de coincidencias** (RN-6, §7): el título de la lista es «Resultados para «texto»», sin número.
7. **Tipo** con las 3 categorías de `FileCategory` (007 CA-2) en segmentos de una sola opción, con «Todos» por
   defecto. Con un tipo elegido las carpetas no aparecen y una nota lo explica (CA-7).
8. **Fecha de última modificación** en un `Select`: Cualquier fecha (defecto), Últimos 7 días, Últimos 30 días, Este
   año y Rango personalizado (Desde/Hasta) (CA-8). El rango reutiliza el patrón de mi-actividad (004): error junto a
   los campos (`aria-invalid`, `role="alert"`), sin consultar, y la lista anterior no se borra (CA-9).
9. **«Quitar filtros»** solo si hay un filtro activo: al pie de la tarjeta de filtros y como acción del estado sin
   resultados con filtros (CA-11).
10. **Sin resultados sin filtros**: el texto de §6 sin la parte «o quita los filtros», porque no hay filtros activos, y
    sin acción. Ver «Diferencias con la spec».
11. **Ámbito**: propios y, desde 012, compartidos. Un compartido cuya carpeta no veo muestra «Compartido contigo» (ícono
    de personas, texto sin enlace); está dibujado en `resultados-por-nombre` y los estados con la lista (2026-10-31,
    cierra PD-148; aprobado por Adrián el 2026-10-31).

## Diferencias con la spec

- **Implementación (T-09, 2026-10-28)**, aceptadas en la revisión de la 018: (1) mientras carga, el campo y los
  filtros no se deshabilitan, para no quitar el foco (WCAG 2.4.3); (2) el error de «Cargar más» reutiliza `LoadMore`
  de 007 y dice «…elementos»; (3) sin miga en la barra superior, como Espacio y Mi actividad; (4) las fechas se
  muestran cortas en es-GT («20 oct 2026»), no «hoy · 08:40» ni «ayer».
- **sin-resultados-sin-filtros**: resuelto (2026-10-28). La spec §6 ya da dos mensajes: con filtros activos
  «… Revisa lo que escribiste o quita los filtros.» y, sin filtros, «… Revisa lo que escribiste.» sin acción, como el
  mockup.
- **NAME_TOO_LONG** (CA-6): no tiene estado propio; el campo limita a 255 caracteres (`maxlength`), así que el mensaje
  «Usa 255 caracteres o menos…» solo llegaría desde la API (p. ej. dirección editada a mano). Si se quiere dibujar, va
  junto al campo como el error de rango.

## Verificación hecha (2026-10-26)

- axe-core (`pw/axe-seguridad.js`) a 360 y 1440 px sobre los 11 estados: única violación `serious`,
  `label-content-name-mismatch` en `.account-btn`, que viene del marco compartido (`marco/marco.js`) y ya aparece en
  el explorador; no es de esta pantalla. `busqueda--resultados.html` (paquete de 018b) no se audita para 018.
- Sin desplazamiento horizontal a 360 px; ningún objetivo menor de 24 px (44 px en el campo, el botón y los segmentos
  a 360 px).
- Contraste de pares usados: texto de ayuda, ubicación y nota (`secondary-foreground` sobre `card`/`background`)
  8.09:1; botón primario `#4A6FA5` con texto blanco ≥ 4.5:1 (§3). No hay pares nuevos.

## Aprobación (Adrián, 2026-10-28)

Aprobados los 11 estados y las decisiones 1–11. Observaciones, que se aplican al implementar sin regenerar el mockup
(spec §6):

1. A 360 px la tarjeta de filtros empuja los resultados casi 1000 px: en la app va en un panel plegable.
2. En `rango-invalido` la lista anterior se atenúa (ya no corresponde a los filtros).
3. La acción que corrige el rango son los campos de fecha editables; «Quitar filtros» no lo corrige.
4. «Optimizador» en la barra lateral viene del marco compartido; llega con 021.
5. «Buscar» en miga, `h1` y navegación: patrón del resto de pantallas, se mantiene.
6. Las capturas muestran mm/dd/aaaa (formato del sistema); la app muestra las fechas en es-GT.
7. `NAME_TOO_LONG` sin estado propio: `maxlength` lo evita; solo llegaría desde la API.
8. La violación `serious` de axe (`label-content-name-mismatch` en `.account-btn`) es del marco compartido.
9. Sin resultados sin filtros: confirmado sin «o quita los filtros» (spec §6).
