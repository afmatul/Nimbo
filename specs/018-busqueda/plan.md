# Plan 018 — Búsqueda por nombre, tipo y fecha

> Spec: `./spec.md` · Estado del plan: Aprobado
> Obligatorio y ≤ 250 líneas. Dice **qué** archivos se tocan y **qué** se espera de cada uno; no es el código en
> prosa. Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico

`GET /search` (solo `CLIENT`) en `storage/search`: `SearchController` valida con un esquema de `contracts` y delega en
`SearchService.search(actor, request)`, que abre `withActor`, convierte el texto en palabras y la categoría en tipos
de archivo, y llama a `INodeSearchRepository`. El repositorio hace **dos consultas**, carpetas y luego archivos, igual
que `listContents` de 006/007 (sin `UNION ALL` de entidades distintas), cada una con `accessibleNodes(actor)` dentro
del `WHERE`, `eliminado_en IS NULL`, una condición `LIKE` por palabra sobre el nombre plegado, y los filtros de tipo y
fecha. Orden fijo `actualizado_en DESC, id DESC` por grupo y cursor opaco reutilizado del explorador
(`NodeOrder.of('updated', 'desc')`, `encodeNodeListCursor`, `orderByOf`, `afterCondition`). La ubicación sale de un
`LEFT JOIN` a la carpeta contenedora, también filtrada por `accessibleNodes`.

Plegado sin extensión de PostgreSQL: `lower(translate(nombre, <mayúsculas y minúsculas con marca, Ç y Ñ>, <su minúscula
sin marca; Ñ → ñ>))` en una sola constante del repositorio, aplicada a la columna y al parámetro (D-1). Sin migración ni índices nuevos (D-2).
La web agrega `/buscar` en `features/search` y el ítem «Buscar» en la navegación por defecto del `AppLayout`.

## 2. Módulos, archivos y diseño

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| contracts | `packages/contracts/src/storage/search-schemas.ts` (nuevo) | `SEARCH_TYPES` (`documents`, `images`, `other`, espejo de `FileCategory`); `searchQuerySchema` = `pageQuerySchema` + `q` (recorta; `REQUIRED`, `NAME_TOO_LONG` con mensajes propios, como `STORAGE_NODE_FIELD_MESSAGES`), `type`, `from`/`to` (instantes ISO; `to` exclusivo; `INVALID_RANGE` si `from >= to`, igual que `GET /audit/my-events`); `searchHitSchema` (`nodeSummarySchema` + `location: folderRefSchema \| null` + `shared: boolean`) y `searchResponseSchema` (`items`, `nextCursor`) |
| contracts | `packages/contracts/src/storage/error-codes.ts` (cambia) | Suma `INVALID_TYPE`, `INVALID_DATE` e `INVALID_RANGE` a `STORAGE_FIELD_ISSUE_REASONS` con sus mensajes |
| contracts | `packages/contracts/src/storage/index.ts` (cambia) | `export * from './search-schemas'` |
| storage · aplicación | `apps/api/src/modules/storage/search/application/search.service.ts` (nuevo) | `SearchService.search(actor, request)`: palabras (NFC, recorte, división por espacios, sin repetidas), categoría → `FileKind[]` filtrando `FILE_KINDS` (`domain/file-kind.ts`) con `categoryOf` (`domain/file-category.ts`), sin una segunda tabla inversa de `CATEGORY_BY_KIND`, `withActor`, mapeo a `SearchResponse` con `toNodeSummary` |
| storage · puerto | `apps/api/src/modules/storage/search/application/ports/i-node-search.repository.port.ts` (nuevo) | `INodeSearchRepository.search(actor, criteria)` → `SearchPage` (`{ node: StorageNode, location: Folder ref \| null }[]` + `nextCursor`); token `I_NODE_SEARCH_REPOSITORY`; `NodeSearchCriteria` (`terms`, `kinds?`, `from?`, `to?`, `limit`, `cursor?`) |
| storage · infraestructura | `apps/api/src/modules/storage/search/infrastructure/typeorm-node-search.repository.ts` (nuevo) | Las dos consultas de §3 con `requireActorScope(actor)`; reutiliza `nodesIn` (`node-sql`), `orderByOf`/`afterCondition` (`node-order-sql`), `encode/decodeNodeListCursor`, `toFile`; escapa `%`, `_` y `\` con `escapeLike` de `shared` (§2); `toFolder` exportado de `typeorm-node.repository.ts`; constante `FOLD_FROM`/`FOLD_TO` del plegado |
| storage · presentación | `apps/api/src/modules/storage/search/presentation/search.controller.ts` (nuevo) | `@Roles(Role.CLIENT)`, `@Controller('search')`, `@Get()` con `ZodValidationPipe(searchQuerySchema, storageQueryValidationError)` |
| storage · composición | `apps/api/src/modules/storage/storage.module.ts` (cambia, **archivo de Adrián**) | Registra `SearchController`, `SearchService` y `{ provide: I_NODE_SEARCH_REPOSITORY, useClass: TypeOrmNodeSearchRepository }` (tres entradas; no se exporta nada) |
| shared · persistencia | `apps/api/src/shared/infrastructure/persistence/escape-like.ts` (nuevo, **de Adrián**, condición de su aprobación) | `escapeLike(text)`: escapa `\`, `%` y `_` para `LIKE … ESCAPE '\'`. Tercer uso (Art. VI.2): sustituye las copias de `storage` e `identity` |
| shared · fachada | `apps/api/src/shared/index.ts` (cambia, **de Adrián**) | Exporta `escapeLike` |
| storage · persistencia | `apps/api/src/modules/storage/infrastructure/persistence/typeorm-node.repository.ts` (cambia, **de Adrián**) | Importa `escapeLike` de `shared` (borra su copia) y exporta `toFolder` para la búsqueda |
| identity · persistencia | `apps/api/src/modules/identity/infrastructure/persistence/typeorm-account-directory.repository.ts` (cambia, **de Adrián**) | Importa `escapeLike` de `shared` y borra su copia; sin cambio de comportamiento |
| web · ruta | `apps/web/src/app/(app)/(cliente)/buscar/page.tsx` (nuevo) | Página cliente que monta `SearchView`; la guarda de rol del grupo `(cliente)` ya la cubre |
| web · datos | `apps/web/src/features/search/use-search.ts` (nuevo) | `fetchSearchPage` (con `storage-http`, valida con `searchResponseSchema`) y `useSearch`: estado en la URL (`q`, `tipo`, `desde`, `hasta` como días `AAAA-MM-DD`), conversión de días locales a `from`/`to` como `use-activity` (004), rango inválido sin consultar, páginas con `MoreStatus` de 007 |
| web · pantalla | `apps/web/src/features/search/components/search-view.tsx` (nuevo) | `AppLayout` con «Buscar» activo y `SidebarQuota`; formulario (`role="search"`, foco al montar), filtro de tipo y de fechas, lista de resultados (`FileTypeChip`, ubicación, fecha, tamaño con `formatBytes`), enlaces con `folderPath`/`fileDetailPath`, `StateView` para vacío, sin resultados y error, `LoadMore` de 007 |
| web · compartido | `apps/web/src/components/nimbo/app-layout.tsx` (cambia, 000b, permitido) | Ítem «Buscar» (`Search` de lucide, `/buscar`) en `DEFAULT_NAV_ITEMS`; la navegación interna (`internalNavFor`) no lo recibe |

16 archivos de producción: los 12 de la búsqueda y 4 de la extracción de `escapeLike` que Adrián pidió al aprobar (Art. VI.2 manda sobre el tope de ADR-0034; son cambios de una o dos líneas, sin comportamiento nuevo). Pruebas en §6.

- Nombres de `design-model.md`: `SearchService` (DF-15). Nuevos: `SearchController` (DF-15 ya lo pide como punto de
  entrada) e `INodeSearchRepository` con `TypeOrmNodeSearchRepository`.
- Puertos nuevos: `INodeSearchRepository`, **interno de `storage`**. Art. V.2 (b): es un repositorio y mantiene la
  aplicación libre de TypeORM. No se reutiliza `INodeRepository` porque es de Adrián (`storage` fuera de
  `storage/search`) y ya pasa de 400 líneas; el plan solo lee sus funciones exportadas.
- DRY (Art. VI.2), decidido en la aprobación de Adrián (2026-10-27):
  - `escapeLike` ya tenía dos copias (`storage` e `identity`); la búsqueda es el tercer uso → se extrae a `shared` y
    las tres lo importan.
  - `toFolder` no se copia: `typeorm-node.repository.ts` lo exporta (el archivo ya cambia por `escapeLike`).
  - `localDayStart` e `isInvalidRange`, privados en `features/audit/hooks/use-activity.ts` (004): copia en
    `use-search.ts` (segundo uso); al tercero se extraen.
  - `pageOf`, `ordered` y el paginado «carpetas y luego archivos con el espacio que queda», privados en
    `typeorm-node.repository.ts` (`listContents`, 006/007): segunda copia en `typeorm-node-search.repository.ts`
    (review I-1). Al tercer uso (p. ej. 018b) se extraen a un solo lugar de `storage`.
- Dependencias nuevas entre módulos: ninguna (`storage → access` ya existe). Sin `architect`.
- Frontend: reutiliza `LoadMore` y `MoreStatus` (`features/storage`), `SidebarQuota` y `useSpace`, `routes.ts`,
  `FileTypeChip`, `StateView` y `formatBytes`. Los estados siguen el mockup aprobado (2026-10-28) con sus observaciones
  (spec §6): filtros en panel plegable a 360 px, lista atenuada con rango inválido y fechas en `es-GT`.
- Tamaño de funciones y SRP en la web (auditoría de Adrián, menor 7): `use-search.ts` separa en funciones puras la
  lectura y escritura de la URL, los atajos y días → `from`/`to` y la validación del rango; `search-view.tsx` separa
  formulario, filtros y lista en componentes, todos ≤ 30 líneas y ≤ 3 parámetros. Siguen en los mismos dos archivos;
  si alguno pasa de ~200 líneas se parte dentro de `features/search` y se anota en «Notas del developer».

## 3. Datos

Sin cambios de esquema ni migración. Forma de la consulta de archivos (la de carpetas es igual sobre `carpeta`, sin
tipo ni tamaño):

```sql
SELECT a.*, p.id AS ubicacion_id, p.nombre AS ubicacion_nombre
  FROM archivo a
  LEFT JOIN carpeta p ON p.id = a.carpeta_id
        AND p.id IN (SELECT nodo_id FROM (<accessibleNodes>) n WHERE n.tipo_nodo = 'carpeta')
 WHERE a.id IN (SELECT nodo_id FROM (<accessibleNodes>) n WHERE n.tipo_nodo = 'archivo')
   AND a.eliminado_en IS NULL
   AND lower(translate(a.nombre, :foldFrom, :foldTo)) LIKE '%' || lower(translate(:t1, :foldFrom, :foldTo)) || '%' ESCAPE '\'
   -- … una condición por palabra (:t2, :t3…)
   AND a.tipo = ANY(:kinds)                       -- solo con filtro de tipo; con él no se consulta `carpeta`
   AND a.actualizado_en >= :from AND a.actualizado_en < :to   -- cada extremo, solo si viene
   AND (a.actualizado_en, a.id) < (:afterValue, :afterId)     -- `afterCondition`, solo con cursor
 ORDER BY a.actualizado_en DESC, a.id DESC
 LIMIT :limit + 1;
```

- **D-1 Plegado sin `unaccent`.** `translate` con un mapa cerrado (vocales con tilde, grave, circunflejo, diéresis,
  `ç` y **sus mayúsculas**, más `Ñ` → `ñ`) aplicado **antes** de `lower()`, en vez de `CREATE EXTENSION unaccent`:
  (a) no hay migración ni extensión nueva; (b) `unaccent` iguala `ñ` y `n` («año» = «ano»), y en español son letras
  distintas (RN-1); (c) no depende del `LC_CTYPE` de la base: el mapa ya deja en minúscula toda letra no ASCII que
  importa (Á, Ñ, Ü…), y a `lower()` solo le queda el ASCII, que pliega igual en cualquier locale (incluido `C`); (d) sin índice (D-2), la inmutabilidad que pediría `unaccent` en una expresión
  indexada no importa. Alternativa (discutible, §7): `unaccent` en una migración reversible
  (`CREATE EXTENSION IF NOT EXISTS unaccent` / `DROP EXTENSION IF EXISTS unaccent`). Es un módulo *contrib* incluido en
  la imagen `pgvector/pgvector:pg17` y marcado *trusted* desde PG 13: a mi juicio no es «dependencia significativa»
  (ni paquete ni servicio nuevos) y no pediría ADR; sumaría un archivo (13) y cambiaría RN-1 (ñ = n).
- **D-2 Sin índices nuevos (YAGNI).** `LIKE '%…%'` no usa B-tree; un índice GIN con `pg_trgm` sería otra extensión.
  `accessibleNodes` acota a los nodos del actor (`idx_archivo_propietario_actualizado`, migración `20261007100400`,
  sirve además al orden). Con el volumen de la demo (el corpus de 005/019, cientos a pocos miles de nodos por cuenta)
  basta, como midió 007 para el orden (PD-62). Se mide con k6 en 023 (PD-153).
- `down`: no aplica. RLS: sin cambios (`archivo` y `carpeta` ya tienen `ENABLE` + `FORCE`).

## 4. Contratos

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/search?q=&type=&from=&to=&cursor=&limit=` | `CLIENT` | `q` obligatorio (1–255 tras recortar); `type` ∈ `documents\|images\|other`; `from` inclusivo y `to` exclusivo (ISO 8601); `limit` 50 por defecto, 100 máximo (`pageQuerySchema`) → `200 { items: SearchHit[], nextCursor: string \| null }`; `SearchHit` = `NodeSummary` + `location: { id, name } \| null` + `shared` (`location: null` = «Mis archivos» si es propio, «Compartido contigo» si `shared`; sin ubicación el `parentId`/`folderId` va en `null`) | `400 STORAGE_INVALID_QUERY` (`fields[].reason`: `REQUIRED`, `NAME_TOO_LONG`, `INVALID_TYPE`, `INVALID_DATE`, `INVALID_RANGE`, `INVALID_CURSOR`); `401 SHARED_UNAUTHENTICATED`; `403 SHARED_FORBIDDEN` |

Eventos / Socket.IO: ninguno.

## 5. Seguridad y operación

- `actor` en `SearchService.search` y en `INodeSearchRepository.search`; `accessibleNodes(actor)` **dentro** del
  `WHERE` de las dos consultas y del `JOIN` de la ubicación (una carpeta que el actor no ve no se nombra: `location`
  queda `null`). `requireActorScope(actor)` falla fuera de `withActor`; RLS como segunda barrera. Roles internos:
  `RolesGuard` responde `403` antes del servicio y, por construcción, `accessibleNodes` es vacío para ellos.
- Bitácoras: ninguna línea propia (D-3). La línea HTTP de Pino ya quita la cadena de consulta
  (`logger.options.ts`, `stripQuery`), así que `q` no llega a la bitácora; el `400` responde los motivos, no el valor.
  Sin auditoría (leer metadatos propios, como 007). Métricas: ninguna nueva.
- **D-3** Una bitácora de conteos (resultados, milisegundos) no aporta hasta que 022 tenga tablero; se omite (YAGNI).
- `GET /search` no lleva límite de tasa: es una lectura acotada a la cuenta, como `GET /folders/contents`.

## 6. Estrategia de pruebas (por riesgo)

| CA | Nivel (unit / int / iso / web / e2e) | Archivo |
|---|---|---|
| CA-6, CA-9 (forma de `q`, tipo, fechas y rango) | unit (contratos) | `packages/contracts/src/storage/search-schemas.spec.ts` |
| CA-4 (`\`, `%` y `_` escapados; texto sin especiales intacto) | unit | `apps/api/src/shared/infrastructure/persistence/escape-like.spec.ts` |
| CA-1 (palabras, NFC, sin repetidas), CA-7 (categoría → tipos), mapeo de la respuesta | unit | `apps/api/src/modules/storage/search/application/search.service.spec.ts` |
| CA-1 (mayúsculas, acentos, ñ ≠ n; «AÑO» = «año» y «ÁRBOL» = «arbol» sin depender del locale), CA-2 (orden y grupos, ubicación), CA-3 (cursor sin repetir ni saltar, también con varios nodos de igual `actualizado_en`, porque el cursor guarda milisegundos y PostgreSQL microsegundos, como en 007), CA-4 (comodines literales), CA-5 (papelera), CA-7, CA-8 (extremos del rango) | int (Testcontainers, `nimbo_app`) | `apps/api/test/int/storage/search.repository.int-spec.ts` |
| CA-6/CA-9 (error principal `400`), CA-14 (`403` internos, `401`), CA-15 (bitácora capturada sin `q` ni nombres), caso feliz HTTP | int | `apps/api/test/int/storage/search.int-spec.ts` |
| CA-13 (A y B con nombres casi iguales; ubicación ajena nunca nombrada; roles internos con 0 filas en el repositorio) | iso | `apps/api/test/isolation/storage-search.iso-spec.ts` |
| CA-3, CA-8, CA-9 (URL ↔ filtros, días → instantes, cada atajo de fecha → su rango, rango inválido sin consultar, páginas), CA-6 (vacío sin consultar) | web (hook) | `apps/web/src/features/search/use-search.spec.ts` |
| CA-2, CA-10, CA-11 (resultados, enlaces, sin resultados con y sin filtros, cargando, error con «Reintentar», foco, fechas en `es-GT`, panel de filtros plegable a 360 px, lista atenuada con rango inválido) | web (componente) | `apps/web/src/features/search/components/search-view.spec.tsx` |
| CA-11 (axe a 360 y 1440 px) | web | `apps/web/src/features/search/a11y.spec.tsx` |
| CA-12 («Buscar» en la navegación del cliente, no en la interna) | web | `apps/web/src/components/nimbo/app-layout.spec.tsx` (se amplía) |

Sin E2E (marcador hasta 000b/023). El recorrido de la demo es la tarea humana.

## 7. Riesgos y coherencia con el diseño

- **R-1 Rendimiento sin índice** (RNF-01, p95 < 300 ms): `LIKE` por palabra sobre los nodos del actor. Mitigación:
  `accessibleNodes` acota primero; `limit + 1`; medir en 023 (PD-153). **Umbral** (PD-146): con 50 000 nodos vivos del
  actor (el cliente más grande que simula 023), si el p95 de `GET /search` supera 300 ms (RNF-01) se crea el índice GIN
  `pg_trgm` sobre la expresión plegada (extensión nueva → ADR corto); mientras no se supere, no se indexa (YAGNI).
- **R-2 Mapa de plegado a mano**: un solo lugar (constante del repositorio, aplicada a columna y parámetro); la
  prueba de integración fija «camión», «CAMIÓN», «pingüino», «AÑO» = «año» y «Año» frente a «ano». La web no pliega (no resalta).
- **R-3 Ubicación con 012** (resuelto, PD-148 y PD-152, 2026-10-31): un resultado compartido cuya carpeta no se ve llega con
  `location: null`, `shared: true` y su `parentId`/`folderId` en `null` (`SearchService.toSearchHit`: `shared` = el nodo no es
  del actor; sin ubicación, se anula el padre). La web escribe «Compartido contigo» sin enlace; sin `shared`, «Mis archivos».
- **R-4 Texto buscado en direcciones**: Pino lo quita; un `accessLog` de Traefik lo registraría → PD-149 (como PD-101).
- **R-5 Archivos de Adrián**: `storage.module.ts` (tres entradas), los dos de `packages/contracts/src/storage/`
  (motivos y una exportación) y los cuatro de la extracción de `escapeLike` (§2). Se piden en esta aprobación. Además `components/nimbo/app-layout.tsx` (un ítem en
  `DEFAULT_NAV_ITEMS`): es archivo compartido de 000b permitido por `specs/README.md`, se nombra para que no sorprenda.
- **R-6 Mockup**: T-09 espera la aprobación de los estados nuevos. Los atajos de fecha del mockup («Últimos 7 días»,
  «Últimos 30 días», «Este año») se resuelven en la web sobre el mismo `from`/`to`; la API no cambia.
- **R-7 Lint de capas** (resuelto, PD-151, 2026-10-27): `layers.js` vigilaba solo `modules/*/{domain,application}/**`; ahora
  también `modules/*/*/{domain,application}/**`, así que `storage/search/application` queda cubierto (sirve a 017).
- Desviaciones de los diagramas: DF-15 actualizado (`SearchService` y `SearchController` en `storage/search`,
  propuesto por este plan); M2 sin redibujar → PD-150.
- Pendientes que deja fuera: PD-153 (k6 de la búsqueda), PD-149 (access log),
  PD-150 (Clases M2 y `design-model.md`, sección de búsqueda en `storage/README.md`); PD-127 pasa a 018b.
- ADR requeridos: ninguno. **Discutible**: si Adrián prefiere `unaccent` (D-1), propongo no hacer ADR (contrib de la
  imagen ya aprobada en ADR-0003) y anotarlo en este plan.
- **Discutible**: entrada por un ítem «Buscar» en la navegación y no por un campo fijo en la cabecera. El campo en la
  cabecera exige saber el rol dentro de `AppLayout` (lo usa también el área interna): un contexto nuevo en
  `components/nimbo` y un cambio en `app/(app)/(cliente)/layout.tsx`, tres archivos más (15). Si el mockup lo pide, va
  en una spec de pulido (024).

## 8. Aprobación

- `architect` (solo si hay puerto nuevo entre módulos, tecnología nueva o cambio de arquitectura): no aplica (puerto
  interno de `storage`, sin tecnología nueva).
- Adrián: **Aprobado** (2026-10-27), con los archivos suyos que pide R-5 (`storage.module.ts`, `contracts/storage/*`,
  `app-layout.tsx`). Antes de implementar, corregir el plan: `escapeLike` ya tiene dos copias (`storage` e `identity`), así
  que la búsqueda es el tercer uso y se extrae a un solo lugar común (Art. VI.2); precisar que la categoría → tipos
  filtra `FILE_KINDS` con `categoryOf`, y que el plegado de `Ñ` no dependa del locale de `lower()`.
