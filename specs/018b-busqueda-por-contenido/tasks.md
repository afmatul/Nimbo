# Tareas 018b — Búsqueda por contenido

> Spec: `./spec.md` · Plan: `./plan.md`
> 5 a 12 tareas verticales, de medio día a un día, un commit cada una (`feat(<modulo>): … [018b T-xx]`).
> Cada tarea es una línea: criterio, prueba y de qué depende. Los archivos viven en `plan.md`. Sin tareas de «cierre».
> `/implement` exige el plan `Aprobado` y la spec en `Lista` (P-1 a P-4 y P-6 resueltas).

- [x] **T-01** (`ui-designer`) Estado `resultados-por-contenido` en `storage/busqueda` con `/mockup` (marca y nota de alcance) y capturas a 360 y 1440 px, aprobado por Adrián — CA: CA-8 — Prueba: axe del mockup sin violaciones — Depende: P-4, P-6
- [x] **T-02** Contrato `matchedBy` en `searchHitSchema` y puerto `IContentMatchReader` exportado por `storage/index.ts` (JSDoc del contrato, parámetro `contentText`) — CA: CA-4, CA-8 — Prueba: unitaria de contratos y `storage.module.spec.ts` (no enlaza el token; rojas primero) — Depende: —
- [ ] **T-03** `SqlContentMatchReader` en `intelligence`, `ContentMatchBindingModule` en la raíz, y `architecture.md` (§3 patrón «condición SQL que da el dueño de la tabla» junto a `accessibleNodes`; §5 fila del puerto) y `design-model.md` M2/M6 al día — CA: CA-1, CA-2, CA-3, CA-5, CA-7 — Prueba: integración `content-match.int-spec.ts` y unitaria del enlace (rojas primero) — Depende: T-02
- [ ] **T-04** Repositorio de búsqueda con «nombre ∨ contenido» y `coincide_nombre` — CA: CA-4, CA-6, CA-7, CA-9 — Prueba: integración `search.repository.int-spec.ts` (roja primero) — Depende: T-03
- [ ] **T-05** `SearchService` con `matchedBy` y `GET /search` de punta a punta — CA: CA-4, CA-5, CA-12 — Prueba: unitaria del servicio + integración HTTP (feliz, `400`, bitácora sin texto) — Depende: T-04
- [ ] **T-06** Aislamiento: B no encuentra el texto de A; un compartido que coincide solo por contenido aparece con `shared` (`fragmento_compartido`) y desaparece al revocarse; actor interno sin filas — CA: CA-10, CA-11 — Prueba: aislamiento `storage-search.iso-spec.ts` — Depende: T-04
- [ ] **T-07** Web: marca «Coincide en el contenido», nota de alcance y textos del encabezado y del formulario (`search-form.tsx`) según el mockup de T-01 — CA: CA-8 — Prueba: componente `search-view.spec.tsx` (con la etiqueta nueva) + axe a 360 y 1440 px — Depende: T-01, T-05
- [ ] **T-08** **(humana, Juan Marcos)** Recorrido de la demo en local: subir un `.docx` y un PDF, esperar su indexación, buscar por una frase, ver la marca, compartir y revocar con otra cuenta; nota en el PR — CA: CA-1, CA-4, CA-6, CA-8, CA-10 — Depende: T-06, T-07

## Notas del developer

- T-02: para que cada commit quede verde, `NodeSearchHit.matchedBy` y su copia en `SearchService` entran con el contrato
  (el repositorio responde `name` hasta T-04); T-05 suma las pruebas del mapeo y el HTTP. `contracts` exporta
  `SEARCH_MATCHES` y `SearchMatch` para tipar `matchedBy` en `api` y `web` sin repetir los literales.

## Hallazgos de la auditoría de la rama (2026-11-07), a atender en este PR

Resueltos con Adrián (2026-11-07): `search-form.tsx` entra al plan y la excepción de 13 archivos queda aprobada (H-1);
el mockup `resultados-por-contenido` queda aprobado, así que T-01 está hecha (H-2). Pendientes, en la tarea indicada:

- [ ] **H-3** (medio, T-03/T-04) Forma de la condición de contenido: preferir la no correlacionada
  `(archivo.id, archivo.version_actual_id) IN (SELECT f.archivo_id, f.version_archivo_id FROM fragmento f WHERE
  f.texto_busq @@ plainto_tsquery('spanish', :contentText))`, que usa `idx_fragmento_texto_busq` (GIN), en lugar del
  `EXISTS` por archivo de plan D-2 y §3 (que evalúa `@@` y la RLS de `fragmento_compartido` fila por fila). Actualizar
  D-2, §3 y R-1.
- [ ] **H-4** (menor, T-03) RN-4 exige estado `indexado`, pero la condición solo mira fragmentos de la versión vigente.
  Hoy equivale porque `IndexingService.swap` escribe fragmentos y marca `indexado` en una transacción; al reindexar la
  misma versión los fragmentos viejos siguen mientras el estado es `pendiente`. Anotar el invariante en D-2 (o ajustar
  RN-4) y fijarlo en `content-match.int-spec.ts`.
- [x] **H-5** (menor, cierre) La rama incluye el cierre de la 018 (`f6dd5dc`); mencionarlo en la descripción del PR.
- [ ] **H-6** (menor, T-03) Contrato del puerto: `SqlContentMatchReader` valida que `fileIdColumn`/`versionIdColumn`
  sean identificadores (`alias.propiedad`) y una prueba demuestra que un choque con el parámetro `contentText` falla
  (TypeORM pisa parámetros con el mismo nombre sin avisar, R-5).
- [ ] **H-7** (menor, T-04) Las columnas que recibe el puerto son rutas de propiedad del *query builder*
  (`archivo.versionActualId`), no nombres de columna; y `FILES` deja de ser una constante de módulo para usar el reader
  inyectado (se arma en el repositorio).
- [ ] **H-8** (menor, T-07) Mockup frente a código: el nombre del formulario del mockup («Buscar por nombre o
  contenido») y el actual («Buscar archivos y carpetas») difieren: se usa el del mockup aprobado. Los 11 estados de 018
  conservan los textos viejos (decisión 4 del README) y la nota en «sin resultados» no está dibujada (decisión 5): la
  web aplica ambas.
