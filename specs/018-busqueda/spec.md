# Spec 018 — Búsqueda por nombre, tipo y fecha

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Lista (2026-10-28): plan aprobado por Adrián (2026-10-27) y mockup aprobado (2026-10-28) |
| Dueño | Juan Marcos (2) |
| Fase | 2 |
| Requisitos | RF-15 (nombre, tipo y fecha; el contenido pasa a 018b); aplican RF-05, RF-07, RF-10, RF-11, RNF-05, RNF-13, RNF-14, RNF-17 |
| Depende de | 005 (archivos), 006 (carpetas y papelera), 007 (categorías de tipo, fecha de modificación y «Cargar más») |
| Módulo | M2 `storage`, carpeta propia `storage/search` (`specs/README.md`, excepciones); web `features/search` |
| DF | DF-15 (`SearchService`), DF-32 (`accessibleNodes`) |
| Última actualización | 2026-10-28 |

## 1. Contexto y objetivo

RF-15 pide buscar por nombre, tipo, fecha y contenido. Adrián aprobó partirlo (2026-10-26): esta spec cubre **nombre,
tipo y fecha** dentro de `storage`; la búsqueda por contenido es la 018b, posterior y aparte. Hoy el cliente solo
encuentra un archivo recorriendo carpetas. Al terminar, escribe un texto, ve los archivos y carpetas cuyo nombre
coincide (en cualquier carpeta), los acota por tipo y por fecha de modificación y abre el que busca.

## 2. Historias de usuario

- **HU-1** Como cliente, quiero buscar por nombre en todas mis carpetas, sin preocuparme por mayúsculas ni acentos.
- **HU-2** Como cliente, quiero acotar los resultados por tipo de archivo y por fecha de modificación.
- **HU-3** Como cliente, quiero abrir un resultado: la carpeta en el explorador o el archivo en su ficha.
- **HU-4** Como equipo, queremos que la búsqueda nunca muestre nada ajeno ni deje el texto buscado en bitácoras.

## 3. Criterios de aceptación

### Buscar por nombre (HU-1)
- **CA-1** (HU-1, RF-15) Dado archivos y carpetas del cliente, cuando busca un texto, entonces recibe los que contienen **todas** sus palabras en el nombre, en cualquier orden, sin distinguir mayúsculas ni acentos: «camion informe» encuentra «Informe del Camión.docx»; «ano» no encuentra «Año.pdf».
- **CA-2** (HU-1, RF-15) Dado varios resultados, entonces llegan primero las carpetas y después los archivos, cada grupo del modificado más reciente al más antiguo; cada uno muestra nombre, fecha de modificación y ubicación (carpeta que lo contiene o «Mis archivos»), y los archivos, además, tipo y tamaño.
- **CA-3** (HU-1, RF-15, RNF-14) Dado más resultados que el tamaño de página, cuando pulsa «Cargar más», entonces se agregan los siguientes sin repetir ni saltar ninguno, con los estados de 007 (cargando más y error con «Reintentar»).
- **CA-4** (HU-1, RF-15) Dado el texto «50%» o «a_b», entonces se busca tal cual: encuentra «Avance 50%.pdf» o «a_b.txt», y no todos los nombres.
- **CA-5** (HU-1, RF-11) Dado un archivo o una carpeta en la papelera, entonces no aparece en los resultados; al restaurarlo vuelve a aparecer.
- **CA-6** (HU-1, RF-15) — error: Dado un texto vacío o solo con espacios, la web no busca, deja la página en su estado inicial («Escribe qué quieres buscar.») y devuelve el foco al campo; la API responde `400` `STORAGE_INVALID_QUERY` con `fields[q].reason = REQUIRED`. Con más de 255 caracteres, `NAME_TOO_LONG` y el mensaje «Usa 255 caracteres o menos…».

### Filtros (HU-2)
- **CA-7** (HU-2, RF-15) Dado el filtro de tipo «Documentos», «Imágenes» u «Otros» (las categorías del resumen de espacio, 007 CA-2), entonces solo aparecen archivos de esa categoría y **ninguna carpeta**; al quitar el filtro, las carpetas vuelven.
- **CA-8** (HU-2, RF-15) Dado un rango de fechas de modificación («desde», «hasta» o ambos, días completos en la hora local del cliente), entonces solo aparecen los elementos modificados dentro del rango, ambos días incluidos; el rango se combina con el texto y el tipo. La pantalla ofrece «Cualquier fecha», «Últimos 7 días», «Últimos 30 días», «Este año» y «Rango personalizado» (desde/hasta); los atajos equivalen a ese mismo rango.
- **CA-9** (HU-2, RF-15) — error: Dado un tipo fuera del catálogo, una fecha mal formada o un «hasta» anterior al «desde», la API responde `400` `STORAGE_INVALID_QUERY` con `INVALID_TYPE`, `INVALID_DATE` o `INVALID_RANGE`; la web no consulta un rango inválido y muestra el mensaje junto al campo, que sigue editable para corregirlo (esa es la acción); la lista anterior se ve atenuada porque ya no corresponde a los filtros.

### Abrir un resultado y estados (HU-3)
- **CA-10** (HU-3, RF-15, RF-10) Dado un resultado, cuando lo activa (clic o teclado), entonces una carpeta se abre en el explorador (006) y un archivo, en su ficha (014).
- **CA-11** (HU-3, RNF-13, RNF-14) Dado una búsqueda sin coincidencias, entonces se ve el estado «sin resultados» con el texto buscado y, si hay filtros activos, «Quitar filtros»; mientras carga y ante un error (con «Reintentar») hay estado propio; todo usable a 360 px, en español y con contraste AA.
- **CA-12** (HU-1, RF-15) Dado un cliente en cualquier pantalla de su cuenta, entonces la navegación (barra lateral y menú móvil) tiene «Buscar»; la página de búsqueda pone el foco en el campo y la dirección guarda texto y filtros (recargar o volver atrás repite la búsqueda).

### Aislamiento, roles y bitácoras (HU-4)
- **CA-13** (HU-4, RNF-05) Dado dos clientes A y B con nombres de archivos y carpetas casi idénticos, cuando B busca, entonces nunca recibe nodos de A, ni su ubicación ni indicios de su existencia; la ubicación solo nombra una carpeta que el actor ve. Se añade a `pnpm test:isolation`.
- **CA-14** (HU-4, RF-05) Dado un Administrador, Soporte u Operador, cuando llama a la búsqueda, entonces `403` `SHARED_FORBIDDEN`; sin sesión, `401` `SHARED_UNAUTHENTICATED`. Su navegación no muestra «Buscar» y la página de búsqueda no les abre (guarda de rutas de cliente, 003).
- **CA-15** (HU-4, RNF-17, RF-07) Dado cualquier búsqueda (con resultados, sin ellos o con error), entonces ninguna bitácora contiene el texto buscado, la cadena de consulta ni nombres de archivo o carpeta, y no se registra evento de auditoría.

## 4. Reglas de negocio

- **RN-1** Coincidencia: el texto se divide en palabras por espacios; cada palabra debe aparecer como fragmento del nombre completo (extensión incluida). Se ignoran mayúsculas y las marcas de acento y diéresis de las vocales (á, à, â, ä → a; ü → u; también ç → c); la ñ es una letra distinta de la n.
- **RN-2** Alcance: elementos vivos que el actor puede ver (DF-32). Hoy son los propios; cuando llegue 012 se suman los compartidos con él sin cambiar esta spec. La papelera nunca entra.
- **RN-3** Tipo = categoría de 007: Documentos (Word, PDF, texto, Excel, PowerPoint), Imágenes, Otros. Las carpetas no tienen tipo: con filtro de tipo no aparecen.
- **RN-4** Fecha = fecha de **última modificación**, la columna «Modificado» del explorador (007).
- **RN-5** El texto mide de 1 a 255 caracteres tras recortar espacios (el largo máximo de un nombre, 005).
- **RN-6** Página: el mismo tamaño por defecto y máximo que el explorador (50 y 100); sin total de coincidencias.

## 5. Seguridad y privacidad

- Toca datos de clientes (nombres de nodos): sí → prueba de aislamiento (CA-13). El filtro va **dentro** de la consulta (`accessibleNodes(actor)`), con RLS como segunda barrera.
- Auditoría: ninguna; buscar es leer metadatos propios, como el resumen de espacio (007). Bitácoras: solo la línea HTTP estándar, sin la cadena de consulta; nunca el texto buscado ni nombres (CA-15).
- Roles internos: `403` en la API y sin entrada en su navegación (CA-14); nunca reciben nombres ni contenido.
- El texto buscado viaja en la dirección de la página y de la API: queda en el historial del propio navegador; las bitácoras del servidor lo descartan (CA-15).

## 6. Experiencia de usuario

| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Búsqueda (`/buscar`) | `storage/busqueda/` | resultados por nombre (carpetas y archivos, con ubicación), filtro de tipo, filtro de fecha, sin-resultados, cargando, error, cargando-mas y cargar-mas-error (patrón del explorador, 007) | `Aprobado` (Adrián, 2026-10-28, PR #81): 11 estados de la 018 (entrada, resultados-por-nombre, filtros, rango-invalido, sin-resultados, sin-resultados-sin-filtros, cargando, error, cargando-mas, cargar-mas-error, menu-movil); `busqueda--resultados` queda como referencia de 018b |
| Navegación (barra lateral y menú móvil) | `shared/layout/` | ítem «Buscar» activo en `/buscar` | Patrón existente del layout (000b) |

- Del mockup existente **no se construye**: «En comentarios», «texto reconocido por OCR» (fuera de alcance, §9 del contexto), «Preguntar al agente» y «Resumir con citas» (020), «Incluir papelera», «Solo indexados», el porcentaje de relevancia, la tarjeta «Ámbito de la búsqueda», los fragmentos de contenido y «Coincidencia en contenido» (018b), el total «28 coincidencias en 9 archivos · 0.4 s» y «Ordenar: Relevancia».
- Observaciones de la aprobación del mockup (Adrián, 2026-10-28) que se aplican al implementar, sin regenerar el mockup:
  a 360 px los filtros van en un panel plegable (cerrado por defecto, con el número de filtros activos) para no empujar
  los resultados; en `rango-invalido` los campos de fecha quedan editables y la lista anterior se atenúa (CA-9); las
  fechas se muestran en `es-GT`. No aplican a 018: «Optimizador» en la barra lateral (marco del mockup; llega con 021),
  «Buscar» repetido en miga, `h1` y navegación (patrón del resto de pantallas), `NAME_TOO_LONG` sin estado propio
  (`maxlength`) y el aviso de axe del botón de cuenta (marco compartido).
- Mensajes clave (tuteo, con acción): vacío «Escribe qué quieres buscar.»; sin resultados con filtros activos «No encontramos nada con «{texto}». Revisa lo que escribiste o quita los filtros.» y, sin filtros activos, «No encontramos nada con «{texto}». Revisa lo que escribiste.» (sin acción); rango «La fecha final debe ser igual o posterior a la inicial. Corrige el rango para buscar.»; error «No pudimos buscar. Revisa tu conexión y vuelve a intentarlo.» con «Reintentar».

## 7. Fuera de alcance

- Búsqueda por contenido y sus fragmentos (018b, con su propio puerto hacia `intelligence`).
- Búsqueda mientras se escribe, sugerencias, resaltado de la coincidencia, orden elegible, total de coincidencias.
- Filtros por tamaño, por carpeta o por ámbito; buscar en la papelera.
- Un campo de búsqueda fijo en la cabecera de todas las pantallas (la entrada es «Buscar» en la navegación; ver plan §7).

## 8. Supuestos

- Las categorías de tipo son las de 007 (Documentos, Imágenes, Otros); se elige una o ninguna.
- Lo compartido conmigo aparece cuando llegue 012, por el mismo filtro de acceso, sin tocar esta spec.
- La paginación es la del explorador (007): cursor opaco y «Cargar más».
- Se busca al enviar el formulario y al cambiar un filtro; la búsqueda exige texto (los filtros solo acotan).
- Un archivo se abre en su ficha (014), no en su carpeta.

## 9. Preguntas

- [RESUELTA] ¿Ignorar acentos además de mayúsculas? → Sí: «camion» encuentra «camión»; la ñ no se iguala a la n (RN-1). (2026-10-26, Juan Marcos; a confirmar por Adrián en la aprobación del plan)
- [RESUELTA] ¿Qué fecha? → La de última modificación, la del explorador (RN-4). (2026-10-26, Juan Marcos)
- [RESUELTA] ¿Las carpetas aparecen? → Sí; con filtro de tipo se ocultan; al abrirlas van al explorador (CA-7, CA-10). (2026-10-26, Juan Marcos)
- [RESUELTA] ¿Mockup o patrones existentes? → Mockup: estados nuevos con `/mockup` en esta rama, pendientes de aprobación de Adrián (§6). (2026-10-26, Juan Marcos)
- [RESUELTA] ¿Nombre y contenido juntos? → No: 018 = nombre, tipo y fecha; 018b = contenido, después. (2026-10-26, Adrián)

## 10. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-26 | Spec, plan y tareas en un solo pase (ADR-0034), ya partida de 018b | Regla de partición (`workflow.md` §4.1) | Partición: Adrián |
| 2026-10-26 | Mockup alineado con la spec: entrada por «Buscar» en la navegación (no campo en la cabecera), sin resaltado de la coincidencia; CA-8 suma los atajos de fecha del mockup | Mockup y plan se hicieron en paralelo y diferían | Dueño: Juan Marcos (pendiente Adrián) |
| 2026-10-26 | Revisión de la spec: CA-6 alineado con el mockup (vacío sin mensaje de error), §6 con los 11 estados; en el plan, copias declaradas (M-1), prueba de atajos y PD-135 (lint de capas) | Revisión SOLID/DRY/YAGNI del dueño | Dueño: Juan Marcos (pendiente Adrián) |
| 2026-10-27 | Plan corregido según la aprobación de Adrián: `escapeLike` a `shared` (tercer uso) y `toFolder` exportado; categoría → tipos con `FILE_KINDS` + `categoryOf`; plegado de mayúsculas no ASCII y `Ñ` sin depender del locale; prueba del cursor con fechas iguales; nueva T-03 (11 tareas) | Condiciones de la aprobación del plan (PR #81) | Adrián (2026-10-27) |
| 2026-10-28 | Spec a `Lista`; mockup `Aprobado`; mensaje de sin resultados sin filtros (observación 9), CA-9 con campos editables y lista atenuada, y observaciones del mockup para la implementación (§6) | Auditoría de Adrián del PR #81 (medio 1 y observaciones 1, 2, 3, 6 y 9) | Adrián (2026-10-28) |
