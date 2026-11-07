# Spec 018b — Búsqueda por contenido

> Qué y por qué, en ≤ 150 líneas. El cómo va en `./plan.md` (obligatorio).

| Campo | Valor |
|---|---|
| Estado | Lista (2026-11-07): plan aprobado por Adrián |
| Dueño | Juan Marcos (2) |
| Fase | 2 |
| Requisitos | RF-15 (contenido; nombre, tipo y fecha son de 018); aplican RF-05, RF-07, RF-11, RF-30, RNF-01, RNF-05, RNF-09, RNF-13, RNF-17 |
| Depende de | 018 (búsqueda por nombre, `GET /search` y `/buscar`), 019 (texto indexado por fragmento), 012 (lo compartido) |
| Módulo | M2 `storage/search` (consume) + M6 `intelligence` (implementa el puerto `IContentMatchReader`, PD-127) |
| DF | DF-15 (búsqueda), DF-95 (nuevo: puerto de coincidencia por contenido) |
| Última actualización | 2026-11-07 |

## 1. Contexto y objetivo

RF-15 pide buscar por nombre, tipo, fecha y **contenido**. La 018 cubrió lo primero; la búsqueda por contenido se
separó (Adrián, 2026-10-26). Hoy un cliente que recuerda una frase de un documento, pero no su nombre, no lo encuentra.
Al terminar, la misma búsqueda de `/buscar` también trae los archivos cuyo texto ya indexado (019) contiene las palabras
buscadas, marcados para que se entienda por qué aparecen. Todo lo demás de 018 se conserva: ruta, filtros, orden,
páginas, estados, aislamiento, roles y bitácoras.

## 2. Historias de usuario

- **HU-1** Como cliente, quiero encontrar un archivo por palabras de su texto, para no depender de recordar su nombre.
- **HU-2** Como cliente, quiero saber qué resultados aparecen por su contenido y no por su nombre.
- **HU-3** Como equipo, queremos que la búsqueda por contenido nunca muestre ni insinúe archivos ajenos ni deje texto en bitácoras.

## 3. Criterios de aceptación

### Coincidencia por contenido (HU-1)
- **CA-1** (HU-1, RF-15, RF-30) Dado «Acta.docx» indexado con el párrafo «El camión llegó tarde», cuando el cliente busca «camion», entonces «Acta.docx» aparece entre los resultados, marcado por contenido (CA-8).
- **CA-2** (HU-1, RF-15) Dado ese mismo archivo, entonces «CAMIÓN» y «camiones» también lo encuentran (palabra completa con sus variantes, sin mayúsculas ni tilde), pero «camio» no lo encuentra por contenido (un trozo de palabra solo vale para el nombre, 018 RN-1).
- **CA-3** (HU-1, RF-15) Dado un PDF con «presupuesto» en la página 2 y «camión» solo en la página 5, cuando busca «camión presupuesto», entonces no aparece por contenido; si las dos palabras están en la misma página (o párrafo, línea, hoja o diapositiva, 019), sí aparece.
- **CA-4** (HU-1, RF-15) Dado un archivo cuyo nombre y contenido coinciden, entonces aparece una sola vez y sin la marca; los resultados mantienen el orden de 018 (carpetas y luego archivos, del modificado más reciente al más antiguo) y «Cargar más» no repite ni salta ninguno (018 CA-3).
- **CA-5** (HU-1, RF-15) — error: Dado un texto vacío, de más de 255 caracteres o un filtro inválido, entonces la API responde como 018 (`400 STORAGE_INVALID_QUERY`, 018 CA-6 y CA-9); dado un texto solo de palabras vacías («de la»), no hay error: se busca solo por nombre.

### Alcance del texto indexado (HU-1)
- **CA-6** (HU-1, RF-15, RF-30, RNF-09) Dado un archivo pendiente, en indexación, `fallido` o `no_indexable` (imagen, PDF sin texto, formato que no se indexa), entonces solo se encuentra por nombre y la búsqueda responde igual; cuando su indexación termina, se encuentra por contenido sin que el cliente haga nada. Con la indexación detenida, la búsqueda sigue funcionando.
- **CA-7** (HU-1, RF-15, RF-13, RF-11) Dado un archivo con una versión vigente nueva aún sin indexar, entonces una palabra que solo estaba en la versión anterior no lo encuentra; un archivo en la papelera no aparece aunque su texto coincida (018 CA-5).
- **CA-8** (HU-2, RF-15, RNF-13) Dado un resultado que coincide por contenido y no por nombre, entonces su fila lleva la marca «Coincide en el contenido» con ícono y texto (el color no es el único indicador, también legible por lector de pantalla), sin fragmento, sin ubicación interna y sin resaltado; la página explica, junto a los resultados y en «sin resultados», que el contenido solo se busca en documentos ya indexados. Usable a 360 px y AA.
- **CA-9** (HU-1, RF-15) Dado el filtro de tipo o de fecha de 018, entonces se aplica igual a lo encontrado por contenido (la fecha es la de modificación del archivo, no la de indexación); las carpetas nunca coinciden por contenido.

### Aislamiento, roles y bitácoras (HU-3)
- **CA-10** (HU-3, RNF-05) Dado dos clientes A y B con documentos de texto casi idéntico, cuando B busca una palabra que solo está en el texto de A, entonces no recibe nada de A ni indicio de su existencia; un archivo que A comparte con B (012) y cuyo nombre no coincide sí aparece por contenido para B, marcado `shared` y con la marca de CA-8, y deja de aparecer al revocarse. Se añade a `pnpm test:isolation`.
- **CA-11** (HU-3, RF-05) Dado un Administrador, Soporte u Operador, entonces `GET /search` sigue en `403 SHARED_FORBIDDEN` (018 CA-14) y, aunque la consulta de búsqueda corriera con su actor, no les devolvería ningún archivo por contenido (RLS de `fragmento`).
- **CA-12** (HU-3, RNF-17, RF-07) Dado cualquier búsqueda, entonces ninguna bitácora de `api` contiene el texto buscado, sus palabras, nombres ni texto de archivos, y no se registra auditoría (igual que 018 CA-15).

## 4. Reglas de negocio

- **RN-1** Coincidencia por contenido: un mismo fragmento indexado de la **versión vigente** (019) contiene **todas las palabras significativas** del texto, como palabras completas con sus variantes en español (plural, género), sin distinguir mayúsculas ni las tildes agudas (á, é, í, ó, ú); las palabras vacías («de», «la», «y»…) se ignoran. La ñ no se iguala a la n (018 RN-1).
- **RN-2** Resultado = archivos y carpetas que coinciden por nombre (018) **∪** archivos que coinciden por contenido. Cada nodo aparece una vez. Orden, página y cursor: los de 018 (CA-2, RN-6), sin relevancia ni total.
- **RN-3** Marca: un archivo coincide «por contenido» solo si no coincide por nombre. Las carpetas no tienen contenido.
- **RN-4** Solo participa el texto que la indexación dejó en estado `indexado` para la versión vigente; nada más (ni versiones anteriores, ni la papelera, ni texto de imágenes).
- **RN-5** Alcance, filtros y largo del texto: los de 018 (RN-2 a RN-5); lo compartido entra por el mismo filtro de acceso.

## 5. Seguridad y privacidad

- Toca datos de clientes (texto indexado): sí → prueba de aislamiento (CA-10). El filtro de acceso va **dentro** de la misma consulta que la coincidencia; RLS de `fragmento` y `archivo` como segunda barrera.
- La respuesta no trae texto del archivo: solo el resultado de 018 y la marca. La marca revela que unas palabras están en un archivo que el actor ya puede leer.
- Auditoría: ninguna (leer lo propio, como 018). Bitácoras: ninguna línea nueva; nunca el texto buscado (CA-12).
- Roles internos: `403` en la API y 0 coincidencias por construcción (CA-11). Nunca reciben contenido (Art. IX.1).

## 6. Experiencia de usuario

| Pantalla | Mockup (`docs/design/mockups/…`) | Estados requeridos | Estado del mockup |
|---|---|---|---|
| Búsqueda (`/buscar`) | `storage/busqueda/` | los 11 de 018 + **resultados-por-contenido** (mezcla de coincidencias por nombre y por contenido, con la marca y la nota de alcance) a 360 y 1440 px | 018: `Aprobado` (2026-10-28). Estado nuevo: `Aprobado` por Adrián (2026-11-07; generado el 2026-11-06, axe sin violaciones a 360 y 1440 px). `busqueda--resultados.html` (propuesta) **no** se usa tal cual: muestra fragmentos, relevancia y un botón que incumple AA (DF-41) |

- Mensajes clave (tuteo): marca «Coincide en el contenido»; nota «También buscamos dentro de los documentos ya indexados. Los que aún se están procesando, y los que no tienen texto (como las imágenes), solo aparecen por su nombre.»; subtítulo «Encuentra archivos y carpetas por su nombre, y documentos por las palabras que contienen. Sin distinguir mayúsculas ni acentos.»; etiqueta del campo «Nombre o palabras del documento». Los demás, los de 018.

## 7. Fuera de alcance

- Búsqueda semántica (por significado, con embeddings): RF-15 la ubica en la Fase 3 y no tiene spec (PD-186).
- Fragmentos de texto, ubicación dentro del archivo («Página 3»), resaltado, orden por relevancia, total de coincidencias (decisiones de 018).
- Filtro «Solo indexados», estado de indexación por fila (lo muestra la ficha, 019), buscar en versiones anteriores o en la papelera, carpetas por el contenido de sus archivos, OCR (`product-context.md` §9).
- Cambiar cómo indexa 019 (configuración de texto, migración de `fragmento`): si hiciera falta, se pide a Adrián (PD-187).

## 8. Supuestos

- Los formatos que tienen texto son los que indexa 019 (`.docx`, `.pdf` con capa de texto, `.txt`, `.md`, `.xlsx`, `.pptx`).
- Las carpetas participan solo por nombre (RN-3); con filtro de tipo siguen ocultas (018 CA-7).
- Un archivo sin indexar no tiene estado propio en los resultados: la nota de la página lo explica (P-5).
- El rendimiento se acepta como en 018 hasta medirlo en 023 (RNF-01; PD-153 ampliado).
- La diéresis (ü) y otras marcas distintas de la tilde aguda no se pliegan en el contenido; sí en el nombre (PD-187).

## 9. Preguntas

- [RESUELTA 2026-11-06, Juan Marcos] P-1 ¿El contenido entra siempre en `GET /search` o es un modo/opción («Buscar también en el contenido»)? Decisión: **siempre**, sin parámetro nuevo: RF-15 es una sola búsqueda y una opción duplica estados y pruebas (YAGNI). Se revisó el mockup original (`busqueda--resultados`): busca siempre en nombre y contenido; sus pestañas «En el contenido / En el nombre», conteos, fragmentos y relevancia no se adoptan (pestañas a futuro, sin spec). — bloquea: sí
- [RESUELTA 2026-11-06, Juan Marcos] P-2 ¿Qué cuenta como coincidencia por contenido? Decisión: **RN-1** (todas las palabras significativas en un mismo fragmento, palabra completa con variantes). Alternativas: cada palabra en cualquier parte del archivo (más resultados, menos precisos), o mezclar palabras del nombre y del contenido. — bloquea: sí
- [RESUELTA 2026-11-06, Juan Marcos] P-3 ¿Cómo se combinan y ordenan? Decisión: **RN-2** (unión sin duplicados, orden de 018). Alternativas: primero por nombre y luego por contenido, o por relevancia (orden y cursor nuevos; 018 descartó la relevancia). — bloquea: sí
- [RESUELTA 2026-11-06, Juan Marcos] P-4 ¿Qué muestra un resultado por contenido? Decisión: **solo la marca** (CA-8), coherente con «sin resaltado» de 018. Alternativas: la ubicación («Página 3», sin texto) o un fragmento del texto (expone contenido en la lista y agranda el contrato). — bloquea: sí
- [ABIERTA] P-5 ¿Cómo se trata un archivo no indexado, en error o no indexable? Recomendación: solo por nombre, con la nota de alcance de la página y sin aviso por fila (CA-6, CA-8). — bloquea: no
- [RESUELTA 2026-11-06, Juan Marcos] P-6 ¿Se crea el estado `resultados-por-contenido` con `/mockup` o se usan patrones existentes? Decisión: `/mockup` (un estado, 360 y 1440 px) antes de la web; el paquete de la propuesta no sirve tal cual (§6). — bloquea: sí
- [ABIERTA] P-7 ¿Límite de rendimiento propio? Recomendación: ninguno nuevo; mismo umbral que 018 R-1 (p95 < 300 ms con el cliente más grande de 023) medido en 023. — bloquea: no

## 10. Registro de cambios

| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-11-06 | Spec, plan y tareas en un solo pase (ADR-0034) | Parte «contenido» de RF-15, separada de 018 (2026-10-26) | — |
| 2026-11-06 | P-1 a P-4 y P-6 resueltas según la recomendación (P-1 tras revisar el mockup original: sin pestañas) | Decisión del dueño | Juan Marcos |
| 2026-11-06 | CA-10: el archivo compartido coincide solo por contenido (no por nombre) | Cambio 1 de `architect` (RLS `fragmento_compartido`) | — |
| 2026-11-06 | Mensajes de §6 alineados con el mockup `resultados-por-contenido` (nota con «los que no tienen texto», subtítulo y etiqueta del campo) | Mockup de T-01 | Juan Marcos |
| 2026-11-07 | Mockup `resultados-por-contenido` aprobado (incluidas las decisiones visuales 1 a 5 de su README) | Auditoría de la rama | Adrián |
| 2026-11-07 | Plan aprobado; la spec pasa a `Lista` (P-5 y P-7 abiertas, no bloquean) | Aprobación del plan | Adrián |
