# Plan 018b — Búsqueda por contenido

> Spec: `./spec.md` · Estado del plan: Propuesto
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa (sin cuerpos de funciones ni pseudocódigo). Lo aprueba Adrián antes de escribir código.
>
> Las respuestas de P-1 a P-4 y P-6 (Juan Marcos, 2026-11-06) coinciden con las recomendaciones sobre las que se
> redactó este plan: no cambia.

## 1. Resumen técnico

La búsqueda sigue siendo `GET /search` de 018 (`SearchController` → `SearchService` → `INodeSearchRepository`). Lo único
que cambia es la consulta de **archivos** de `TypeOrmNodeSearchRepository`: su condición de nombre pasa a ser
«nombre coincide **o** contenido coincide», y el `SELECT` suma si coincidió por nombre (para la marca, RN-3). La
condición de contenido no la escribe `storage`: se la pide a un puerto nuevo, **`IContentMatchReader`**, declarado en
`storage/search` y exportado por `storage/index.ts`, que implementa `intelligence` (`SqlContentMatchReader`) porque es
el dueño de `fragmento` (PD-127). El puerto devuelve una condición SQL con parámetros (`EXISTS` sobre `fragmento` de la
versión vigente con `texto_busq @@ plainto_tsquery('spanish', …)`) que el repositorio inserta en **la misma consulta**,
donde ya están `accessibleNodes(actor)`, `eliminado_en IS NULL`, los filtros, el orden y el cursor de 018. Así la
unión, el orden y las páginas no cambian (RN-2), no hay tope de archivos por contenido y no se filtra después de
consultar. El enlace del token vive en la raíz (`ContentMatchBindingModule`), como `PlanLimitsBindingModule` (DF-51),
porque `storage` no puede importar `intelligence` (ya existe `intelligence → storage`). Sin migración (PD-127).
La web solo agrega la marca «Coincide en el contenido» en la fila y la nota de alcance en la página.

## 2. Módulos, archivos y diseño

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts | `packages/contracts/src/storage/search-schemas.ts` (cambia) | La variante `file` de `searchHitSchema` suma `matchedBy: 'name' \| 'content'` (RN-3); la de carpeta no cambia. `searchResponseSchema` sigue `.strict()` |
| storage · puerto | `apps/api/src/modules/storage/search/application/ports/i-content-match-reader.port.ts` (nuevo) | `IContentMatchReader.matchCondition(request)` → `ContentMatchCondition` (`{ sql, parameters }`, sin tipos de TypeORM); `ContentMatchRequest` = `{ text, fileIdColumn, versionIdColumn }` (columnas de la consulta de `storage`); token `I_CONTENT_MATCH_READER`. JSDoc del contrato: `fileIdColumn`/`versionIdColumn` son expresiones constantes de `storage`, nunca entrada del usuario; `text` viaja solo como el parámetro `:contentText`, nunca interpolado; la condición es de solo lectura sobre `fragmento` y nunca lanza; sin `actor` porque se evalúa dentro de `requireActorScope(actor)` |
| storage · puerto | `apps/api/src/modules/storage/search/application/ports/i-node-search.repository.port.ts` (cambia) | `NodeSearchHit` suma `matchedBy` (`'name'` para carpetas) |
| storage · infraestructura | `apps/api/src/modules/storage/search/infrastructure/typeorm-node-search.repository.ts` (cambia) | Inyecta `I_CONTENT_MATCH_READER`. El grupo de archivos usa «nombre ∨ contenido» como condición de coincidencia y selecciona `coincide_nombre`; carpetas sin cambio. El texto del contenido es `criteria.terms` unido por espacios. Cursor, orden, `pageOf`/`ordered` y ubicación, sin cambio (no hay tercera copia de `pageOf`) |
| storage · aplicación | `apps/api/src/modules/storage/search/application/search.service.ts` (cambia) | `toSearchHit` copia `matchedBy` en los archivos. Sin otra regla nueva |
| storage · fachada | `apps/api/src/modules/storage/index.ts` (cambia, **de Adrián**) | Exporta `IContentMatchReader`, `ContentMatchRequest`, `ContentMatchCondition` e `I_CONTENT_MATCH_READER` (solo tipos y token) |
| intelligence · persistencia | `apps/api/src/modules/intelligence/infrastructure/persistence/sql-content-match.reader.ts` (nuevo, **módulo de Adrián**) | `SqlContentMatchReader implements IContentMatchReader`: arma el `EXISTS` sobre `fragmento` con las columnas recibidas (D-2). No lee tablas de `storage` por su cuenta, no recibe `EntityManager` y no ejecuta nada |
| intelligence · fachada | `apps/api/src/modules/intelligence/index.ts` (cambia, **de Adrián**) | Exporta `SqlContentMatchReader` para la raíz, como `billing` exporta `PlanLimitsAdapter`; se ajusta el comentario («nada más de infraestructura») |
| raíz | `apps/api/src/content-match-binding.module.ts` (nuevo, **de Adrián**) | `@Global()`; `{ provide: I_CONTENT_MATCH_READER, useClass: SqlContentMatchReader }`, exporta el token. Solo el `api` (el `worker` no monta la búsqueda) |
| raíz | `apps/api/src/app.module.ts` (cambia, compartido) | Importa `ContentMatchBindingModule` junto a `PlanLimitsBindingModule` y suma una línea al comentario de composición |
| web · lista | `apps/web/src/features/search/components/search-results.tsx` (cambia) | `HitMatch`: marca «Coincide en el contenido» con ícono `lucide` y texto (tokens de `ui-guidelines.md`, no solo color), en la celda del nombre a 360 y 1440 px, cuando `matchedBy === 'content'` |
| web · pantalla | `apps/web/src/features/search/components/search-view.tsx` (cambia) | Nota de alcance (CA-8) junto a los resultados y en «sin resultados», con el texto del mockup aprobado |

12 archivos de producción (al tope de `workflow.md` §4.1, una pantalla). Documentación en el mismo PR (T-03): `architecture.md`
§3 (el patrón «condición SQL que da el dueño de la tabla» junto a `accessibleNodes`, no como excepción de la regla 7;
fila `storage`: el puerto y su enlace) y §5 (fila del puerto `IContentMatchReader`), `design-model.md` M2 y M6,
`apps/api/src/modules/storage/README.md` (sección de búsqueda, PD-150) y `intelligence/README.md` (PD-127 cerrado).
`storage.module.ts` **no** cambia: el token llega global desde la raíz; `storage.module.spec.ts` (prueba, no cuenta como
producción) afirma que `StorageModule` no enlaza `I_CONTENT_MATCH_READER` (como con `I_PLAN_LIMITS_PROVIDER`); el
`worker` no lo necesita porque `StorageWorkerModule` no monta la búsqueda.

- Nombres de `design-model.md`: `SearchService`, `SearchController`, `INodeSearchRepository` (018, DF-15). Nuevos:
  `IContentMatchReader` (nombre fijado en PD-127 y `specs/README.md`) y `SqlContentMatchReader`.
- **Puerto nuevo entre módulos** `IContentMatchReader` (Art. V.2 d): permite que `storage` use el conocimiento de
  `fragmento` sin la arista `storage → intelligence`, que cerraría el ciclo con la existente `intelligence → storage`.
  **Requiere la opinión de `architect`** (§8).
- Dependencias nuevas entre módulos: ninguna arista nueva. `intelligence → storage` ya existe (importa solo el puerto
  de `storage/index.ts`, patrón `billing → storage`); la raíz importa de los dos `index.ts`.
- DRY (Art. VI): la léxica del agente (`keywordSearchQuery` de `chunk-sql.ts`, 020) **no** se reutiliza. Es otro
  conocimiento: el agente une los lexemas con OR y ordena por `ts_rank_cd` para recuperar candidatos; la búsqueda exige
  todas las palabras (AND, como 018 CA-1) en un fragmento y no ordena (Art. VI.1). Lo que sí coincide es «fragmento de
  la versión vigente» (`f.version_archivo_id = archivo.version_actual_id`): segunda aparición (020 y 018b); a la
  tercera se extrae un fragmento común en `intelligence`. `accessibleFiles` no hace falta: el filtro de acceso ya está
  en la consulta de `storage`.
- Frontend: reutiliza `SearchResults`, `StateView` y los tokens de la marca de `ui-guidelines.md` §4 (chip o
  distintivo existente). Sin componente nuevo en `components/nimbo` si el mockup no lo pide.

### D-1 Forma del puerto: condición SQL dentro de la consulta (discutible, `architect`)

| Opción | A favor | En contra |
|---|---|---|
| **A. El puerto devuelve una condición SQL** que `storage` inserta en su consulta (elegida) | Una consulta: acceso, versión vigente, filtros, orden y cursor de 018 intactos; sin tope; el conocimiento de `fragmento` sigue en `intelligence`; mismo patrón que `accessibleNodes` de `access` | Un puerto que devuelve SQL solo admite una implementación sobre la misma base (Liskov acotado a Postgres); `storage` ejecuta una consulta que toca `fragmento` |
| B. El puerto devuelve ids de archivos que coinciden (`matchingFileIds(actor, text)`) | Puerto «limpio» y asíncrono | Ida y vuelta de ids (ADR-0036 opción 2 lo descartó por eso); exige un tope de archivos por contenido (resultados que faltan sin aviso) o una paginación propia; `intelligence` necesitaría leer `archivo.version_actual_id` fuera de `chunk-sql.ts` (enmienda de ADR-0036) |
| C. `storage` lee `fragmento` por SQL | Sin puerto | Cuarta excepción a «cada módulo es dueño de sus tablas» (exige DF y ADR, `architecture.md` §3 regla 7); `storage` conocería columnas de `intelligence` |

Con A no hay excepción nueva a la propiedad de tablas: el SQL sobre `fragmento` lo escribe su dueño y `intelligence`
no lee `archivo` por su cuenta (recibe expresiones de columna de `storage`). Lo registra **DF-95**. Si `architect`
prefiere B, el plan suma un tope (pregunta de negocio nueva) y una lectura en `chunk-sql.ts`; si exige ADR para A,
se redacta corto en este PR (sin dependencia ni tecnología nueva).

### D-2 Condición de contenido

`plainto_tsquery('spanish', :contentText)` une los lexemas con AND y descarta las palabras vacías (RN-1); `texto_busq`
ya es `to_tsvector('spanish', texto)` (019), así que plural, género y tildes agudas pliegan igual en ambos lados
(el *stemmer* de español quita la tilde aguda al final). Un texto solo de palabras vacías da una consulta vacía, que no
coincide con nada (CA-5): la búsqueda sigue por nombre. La condición exige `f.version_archivo_id` = versión vigente
(RN-4): las filas de versiones anteriores que aún no borró `deleteOtherVersions` no cuentan (CA-7).

### D-3 Marca sin segunda consulta

`coincide_nombre` = la misma condición de nombre de 018 en el `SELECT` (mismos parámetros); `matchedBy = 'content'`
solo si es falsa (RN-3). No hay `UNION`, por lo que un archivo nunca se repite (CA-4).

## 3. Datos

Sin cambios de esquema ni migración; no se toca `20261022100000-crear-indexacion-y-fragmento.ts` (PD-127). Forma de la
consulta de archivos (la de carpetas no cambia):

```sql
SELECT a.*, p.id AS ubicacion_id, p.nombre AS ubicacion_nombre,
       (<nombre plegado LIKE por palabra, 018 D-1>) AS coincide_nombre
  FROM archivo a
  LEFT JOIN carpeta p ON p.id = a.carpeta_id AND p.id IN (<accessibleNodes, carpetas>)
 WHERE a.id IN (<accessibleNodes, archivos>)
   AND a.eliminado_en IS NULL
   AND ( (<nombre plegado LIKE por palabra>)
         OR EXISTS (SELECT 1 FROM fragmento f                       -- condición de SqlContentMatchReader
                     WHERE f.archivo_id = a.id
                       AND f.version_archivo_id = a.version_actual_id
                       AND f.texto_busq @@ plainto_tsquery('spanish', :contentText)) )
   AND a.tipo IN (:...kinds)                                       -- solo con filtro de tipo (018)
   AND a.actualizado_en >= :from AND a.actualizado_en < :to         -- cada extremo, solo si viene
   AND (a.actualizado_en, a.id) < (:afterValue, :afterId)           -- solo con cursor
 ORDER BY a.actualizado_en DESC, a.id DESC
 LIMIT :limit + 1;
```

- Índices que ya existen y sirven: `uq_fragmento_version_orden` (prefijo `version_archivo_id`) para el `EXISTS` por
  archivo, `idx_fragmento_archivo` e `idx_fragmento_texto_busq` (GIN; el planificador elige). `accessibleNodes` acota
  primero a los nodos del actor (`idx_archivo_propietario_actualizado`). Sin índices nuevos (YAGNI, R-1).
- RLS: sin cambios; segunda barrera. `fragmento_cliente` es solo de la propietaria desde `20261101100100`; lo
  compartido lo cubre `fragmento_compartido` (`FOR SELECT`, solo la versión vigente de lo compartido, migración
  `20261101100200`). Sin política para roles internos ni para `nimbo_app` sin actor.
- `down`: no aplica.

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/search?q=&type=&from=&to=&cursor=&limit=` | `CLIENT` | Petición **igual que 018**. `200 { items: SearchHit[], nextCursor }`; `SearchHit` de archivo suma `matchedBy: 'name' \| 'content'` (`'content'` = coincide por contenido y no por nombre); el de carpeta no cambia | Los de 018: `400 STORAGE_INVALID_QUERY` (`REQUIRED`, `NAME_TOO_LONG`, `INVALID_TYPE`, `INVALID_DATE`, `INVALID_RANGE`, `INVALID_CURSOR`); `401 SHARED_UNAUTHENTICATED`; `403 SHARED_FORBIDDEN` |

Eventos / Socket.IO: ninguno. Un cursor emitido por la búsqueda de 018 sigue siendo válido (mismo orden y forma).

## 5. Seguridad y operación

- `actor` en `SearchService.search` y en el repositorio (018). La condición de contenido va en la **misma** consulta
  que `accessibleNodes(actor)` y sobre el `EntityManager` de `requireActorScope(actor)` (RLS activas:
  `fragmento_cliente` para lo propio, `fragmento_compartido` para lo compartido, y las de `archivo`). `SqlContentMatchReader` no recibe `actor` porque no ejecuta nada: no hay lectura fuera del
  ámbito del actor (CLAUDE.md, «dentro de la consulta»).
- Roles internos: `RolesGuard` responde `403`; además `accessibleNodes` y las políticas de `fragmento` dan 0 filas (CA-11).
- Bitácoras: ninguna línea nueva en `storage` ni en `intelligence`. Pino ya quita la cadena de consulta (018). El
  `NOTICE` de Postgres por una consulta solo de palabras vacías no lleva el texto y la aplicación no lo registra
  (R-4). Auditoría: ninguna. Métricas: ninguna nueva (018 D-3).
- Degradación (RNF-09, Art. XII): la búsqueda no llama al `worker`, a Redis ni a Gemini; con la indexación detenida
  solo deja de crecer el texto indexado (CA-6).

## 6. Estrategia de pruebas (por riesgo)

| CA | Nivel | Archivo |
|---|---|---|
| CA-4 (contrato: `matchedBy` solo en archivos; respuesta `.strict()`) | unit | `packages/contracts/src/storage/search-schemas.spec.ts` (se amplía) |
| CA-4, CA-8 (mapeo de `matchedBy` a la respuesta) | unit | `apps/api/src/modules/storage/search/application/search.service.spec.ts` (se amplía) |
| Enlace del token en la raíz | unit | `apps/api/src/content-match-binding.module.spec.ts` (nuevo, como `plan-limits-binding.module.spec.ts`) |
| `StorageModule` no enlaza `I_CONTENT_MATCH_READER` | unit | `apps/api/src/modules/storage/storage.module.spec.ts` (se amplía) |
| CA-1, CA-2 (variantes, mayúsculas, tilde, trozo que no basta), CA-3 (mismo fragmento), CA-5 (solo palabras vacías), CA-7 (versión vigente) — la semántica vive en `intelligence` | int (Testcontainers, `nimbo_app`) | `apps/api/test/int/intelligence/content-match.int-spec.ts` (nuevo; usa `intelligence-test-db.ts`) |
| CA-4 (unión sin duplicados, orden, cursor con nombre y contenido mezclados), CA-6 (`pendiente`, `fallido`, `no_indexable`: solo por nombre), CA-7 (papelera), CA-9 (tipo, fecha, carpetas nunca por contenido) | int | `apps/api/test/int/storage/search.repository.int-spec.ts` (se amplía) |
| Caso feliz HTTP con `matchedBy`, CA-5 (error principal `400` sin cambio), CA-12 (bitácora capturada sin `q`, palabras ni texto) | int | `apps/api/test/int/storage/search.int-spec.ts` (se amplía) |
| CA-10 (A y B con texto casi idéntico; un archivo compartido que coincide solo por contenido aparece con `shared` vía `fragmento_compartido` y desaparece al revocar), CA-11 (actor interno: 0 filas por contenido) | iso | `apps/api/test/isolation/storage-search.iso-spec.ts` (se amplía) |
| CA-8 (marca con ícono y texto, nota en resultados y en sin resultados) | web (componente) | `apps/web/src/features/search/components/search-view.spec.tsx` (se amplía; `test-search-hit.ts` suma `matchedBy`) |
| CA-8 (axe a 360 y 1440 px con la marca) | web | `apps/web/src/features/search/a11y.spec.tsx` (se amplía) |

Sin E2E (marcador hasta 023). El recorrido de la demo es la tarea humana.

## 7. Riesgos y coherencia con el diseño

- **R-1 Rendimiento** (RNF-01): el `OR` impide al planificador separar nombre y contenido; el `EXISTS` corre por
  archivo accesible sobre sus fragmentos de la versión vigente. Mitigación: `accessibleNodes` acota primero,
  `limit + 1`, índices existentes. Se mide en 023 con el mismo umbral de 018 R-1 (PD-153, ampliado a contenido). Si
  no alcanza: separar la condición en un `IN (SELECT archivo_id … @@ …)` acotado por GIN antes de pensar en índices.
- **R-2 Semánticas distintas**: el nombre coincide por trozo (018) y el contenido por palabra completa con variantes
  (CA-2). La nota de la página y la marca lo hacen visible; la prueba de integración fija los dos casos.
- **R-3 Plegado del contenido**: `spanish` no pliega la diéresis ni otras marcas (`pingüino` ≠ `pinguino` en el
  texto). Cambiarlo exige otra configuración de texto y regenerar `texto_busq` (migración de 019) → PD-187, decisión
  de Adrián. La afirmación de D-2 sobre la tilde aguda se fija con la prueba de T-03; si fallara, se corrige CA-2.
- **R-4 `NOTICE` de palabras vacías**: se confirma en la prueba de bitácoras (CA-12) que no se registra.
- **R-5 Puerto que devuelve SQL** (D-1): acoplamiento a nombres de parámetros. Mitigación: un único nombre
  de parámetro fijo, `contentText`, documentado en el puerto; la prueba de integración de `storage` falla si choca.
- **R-6 Archivos de Adrián**: `storage/index.ts`, `intelligence/index.ts`, `sql-content-match.reader.ts` (módulo
  `intelligence`), `content-match-binding.module.ts`, la documentación de `architecture.md` y `design-model.md`, y
  `app.module.ts` (compartido). Se piden en esta aprobación (como 018 R-5).
- **R-7 Tope de 12 archivos**: el plan queda justo en 12. Si `architect` pide B (D-1) o una prueba de contrato del
  puerto en `intelligence`, se reevalúa antes de partir.
- Desviaciones de los diagramas: **DF-95** nuevo (puerto `IContentMatchReader`, `storage` ← `intelligence`, que
  devuelve una condición SQL); DF-15 actualizado (018b). Clases M2 y M6 sin redibujar → PD-185.
- Pendientes que deja fuera: PD-185 (diagramas M2 y M6), PD-186 (búsqueda semántica de RF-15 sin spec), PD-187
  (plegado de la diéresis en el contenido); PD-153 se amplía a contenido; PD-127 pasa a «Planificado».
- ADR requeridos: ninguno si `architect` acepta D-1 como DF; si lo pide, uno corto sobre «puerto que devuelve una
  condición SQL» (sin dependencia nueva).
- **Discutible**: D-1 (A frente a B); la marca solo cuando no coincide el nombre (RN-3) frente a marcar toda
  coincidencia por contenido; que la nota de alcance sea fija y no un estado por archivo (P-5).

## 8. Aprobación

- `architect` (puerto nuevo entre módulos `IContentMatchReader`, `storage` ← `intelligence`; D-1, DF-95): **De acuerdo
  con cambios** (2026-11-06). D-1 opción A respeta las fronteras: Art. V.2 (d) justifica el puerto (`storage → intelligence`
  cerraría el ciclo con `intelligence → storage`, `boundaries.js`); el SQL de `fragmento` lo escribe su dueño y
  `intelligence` no nombra columnas de `archivo` (ADR-0036 no se enmienda, no es una cuarta excepción de la regla 7); es el
  mismo contrato que `accessibleNodes` de `access`, inyectado en lugar de importado. B se descarta (tope o paginación
  propia, filtro fuera de la consulta). Sin ADR: no hay tecnología ni excepción nueva; DF-95 basta. Cambios:
  1. §3 y §5: la RLS de lo compartido es `fragmento_compartido` (migración `20261101100200`, versión vigente de lo
     compartido), no `fragmento_cliente`, que desde `20261101100100` es solo de la propietaria. Corregir el texto y que
     CA-10 en `storage-search.iso-spec.ts` pruebe un archivo compartido con fragmento por contenido.
  2. Contrato del puerto (JSDoc de `i-content-match-reader.port.ts`): `fileIdColumn`/`versionIdColumn` son expresiones
     constantes de `storage`, nunca entrada del usuario; `text` viaja solo como parámetro (`:contentText`), nunca
     interpolado; la condición es de solo lectura, sin `actor` porque se evalúa dentro de `requireActorScope(actor)`.
  3. Nombre de parámetro fijo y único (`contentText`) en lugar de «prefijo `content` reservado» (R-5): menos contrato.
  4. `storage.module.spec.ts`: afirmar que `StorageModule` no enlaza `I_CONTENT_MATCH_READER` (como RN-1 con
     `I_PLAN_LIMITS_PROVIDER`); `StorageWorkerModule` no monta la búsqueda, así que el `worker` no lo necesita.
  5. `architecture.md` §3: anotar el patrón «condición SQL provista por el dueño de la tabla» junto a `accessibleNodes`
     (no como excepción de la regla 7) y §5 la fila del puerto; DF-95 pasa a `Aceptado` con la aprobación de Adrián.
  Verificado: 12 archivos de producción reales (todos existen salvo los 3 nuevos); no toca la migración de 019; índices
  `uq_fragmento_version_orden`, `idx_fragmento_texto_busq` y `texto_busq` en `spanish` existen. Vigilar R-1 en 023.
- Adrián: pendiente (incluye los archivos suyos de R-6 y P-1 a P-4 y P-6 ya respondidas por el dueño).
