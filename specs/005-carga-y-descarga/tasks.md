# Tareas 005 — Carga y descarga de archivos

> Spec: `./spec.md` (Lista, 2026-09-28) · Plan: `./plan.md` (Aprobado, §11; los 15 cambios de §11.4 están en el cuerpo; DF-51 opción A)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque (no comparten archivos) · `[P×PR]` puede empezar
> antes de que se integre el PR del que depende su bloque (ver «Paralelismo entre PR») · Cada tarea ≈ 2–4 h y un commit.
> Dueño: Adrián. Commits con Conventional Commits y sufijo `[005 T-xx]`.
>
> - **Seis PR parciales** (plan §9 R-3, `workflow.md` §4.8). Cada uno cierra con `pnpm lint`, `pnpm typecheck` y
>   `pnpm test` en verde. `pnpm test:int` y `pnpm test:isolation` se **escriben** en el PR y se **ejecutan** en esta
>   máquina (Docker disponible desde el 2026-09-29; también en el CI desde el 30/09). Sin esa ejecución, `review.md` no marca el CA en verde (plan §8, R-1).
>   Ramas: `feat/005-contratos-dominio` (PR-A, sobre `main`) · `feat/005-web-componentes` (PR-B, tras T-01 y T-02) ·
>   `feat/005-persistencia` (PR-C, tras **001-PR-1** y **003-PR-B/C**) · `feat/005-api` (PR-D, sobre PR-C) ·
>   `feat/005-limpieza` (PR-E, sobre PR-D) · `feat/005-web` (PR-F, tras PR-B, **001-PR-4**, **002-PR-5a** y **003-PR-F**).
> - **Pruebas primero**: toda tarea de código escribe su prueba antes (rojo → verde → refactor) en la misma tarea.
>   Nombres `'CA-n: …'` (Art. II).
> - **Sin Playwright** (D-19, PD-41): CA-21 se cubre con pruebas de componentes y jest-axe a 360 y 1440 px, más el
>   guion manual de T-54. No se crea `e2e/storage-upload.e2e.ts`.
> - **Dependencia nueva** (adenda de ADR-0015, versión exacta igual a `@aws-sdk/client-s3`): `@aws-sdk/s3-request-presigner`.
>   La instala T-31. shadcn `alert-dialog`, `checkbox` y `dropdown-menu` (primitivas Radix, misma adenda) los agrega T-10.
>   Sin `class-validator`, `class-transformer`, `file-type`, `prom-client` ni `@nestjs/schedule`.
> - **006a no bloquea**: `IPlanLimitsProvider` lo declara `storage` (T-07). Hasta que 006a lo implemente, producción
>   enlaza `FakePlanLimitsProvider` **solo** si el token aún no tiene implementación real, y las pruebas de CA-3/CA-4
>   usan el doble (R-3). Ningún número del catálogo de planes vive en código de producción (RN-1).
> - **No se editan en estas ramas**: `design-findings.md`, `architecture.md`, `design-model.md` ni los diagramas
>   (DF-59, DF-60, PD-46). Los cierra el `architect` al integrar (plan §10c). Métricas: no se instrumentan (D-16, 022).
>   `FileVersionCreated` no se emite.

## Reglas de diseño (cada tarea)

SOLID, DRY y YAGNI del plan §2 y §6. Si una tarea empuja a saltárselas, se parte la tarea; no se ensancha el diseño.

- **Una razón para cambiar**: `UploadService` recorre el ciclo de la carga; `QuotaService` responde si cabe;
  `FileService` lista y emite la URL de descarga; `MagicBytesDetector` solo detecta; `QuotaPolicy` y `FileName` son
  dominio puro. Los controladores delegan.
- **El dominio no importa** `@nimbo/contracts`, Nest, TypeORM ni el SDK (ADR-0008). Los límites llegan como argumentos.
- **Un solo escritor** de `usuario.espacio_usado`: `IQuotaRepository`. `storage` no importa `identity` ni `billing`.
  `PlanLimits` solo lleva `maxFileBytes` y `storageQuotaBytes` (ISP: `editing` no ensancha este tipo).
- **Un solo acceso sin actor**: `IExpiredUploadScanner`. No vive en `IUploadSessionRepository`, no se exporta desde
  `storage/index.ts` y solo lo inyecta `UploadCleanupProcessor`.
- **Sin mecanismos de más**: no hay `pg_advisory_xact_lock` (el `FOR UPDATE` de `usuario` ya serializa), ni
  `IIdGenerator`, `IMetrics`, `IEventBus`, `IUploadQueue` ni evento de dominio.
- **Integridad**: compare-and-set de `carga.estado` primero; borrar el objeto después. `complete` es idempotente.
- **Bytes**: `bigint` en dominio y BD; `number` entero seguro en JSON. Clave de objeto `u/{propietario}/{archivo}/{version}`:
  nunca el nombre, y nunca sale de la API ni entra en una bitácora.

## Paralelismo entre PR

```
hoy        PR-A  T-01…T-08 ─ T-09 cierre ──► merge PR-A
T-01+T-02  PR-B  T-10…T-18 ─ T-19 cierre     (componentes; no necesita la API)
001-PR-1 + 003-PR-B + 003-PR-C
           PR-C  T-20…T-29 ─ T-30 cierre ──► merge PR-C
PR-C       PR-D  T-31…T-45 ─ T-46 spike (cuando haya Docker) ─ T-47 cierre
PR-D       PR-E  T-48…T-51 ─ T-52 cierre
PR-B + 001-PR-4 + 002-PR-5a + 003-PR-F
           PR-F  T-53…T-56 ─ T-57 docs ─ T-58 cierre de la spec
```

| Se puede empezar **hoy**, sin esperar 001 ni 003 | Requiere | Por qué |
|---|---|---|
| **PR-A completo** (T-01…T-09) | `main` | Contratos, dominio y detector no usan `withActor`, guards ni MinIO |
| PR-B: **T-10** (primitivas Radix) | nada | No usa contratos de `storage` |
| PR-B: T-11…T-18 | T-01, T-02 | La máquina de estados y los diálogos hablan los esquemas de `contracts/storage` |
| PR-C en adelante | **001-PR-1** (T-06 arnés de migraciones, T-07 `TooManyRequestsError`, T-08 filtro, T-09 `REDACTED_FIELDS`, T-10 env, T-12/T-13 `IRateLimiter`, T-14 `ITransactionRunner`, T-15 `ZodValidationPipe`) y **003-PR-B** (T-29 `withActor`) + **003-PR-C** (T-37 `accessibleNodes`) | Sin eso no hay transacción con actor ni fragmento SQL |
| PR-D: aislamiento (T-45) | **003-PR-D** (T-41 `isolation-world`) | `.withFiles` / `.withUploads` amplían ese *builder* |
| PR-F | **001-PR-4** (T-57 catálogo), **002 T-85** (`auth-fetch`), **003-PR-F** (grupo `(app)`, marcador de `/archivos`) | La página sustituye el marcador; los `PUT` a MinIO no usan `auth-fetch` |

- Con dos personas: una hace PR-A y, en cuanto exista 001-PR-1 + 003-PR-B/C, PR-C → PR-D → PR-E. La otra, tras T-01 y
  T-02, hace PR-B y después PR-F.
- **Lo que 006 reutiliza y no debe duplicarse**: `purgeObject`, `FileName.firstFree`, `IExpiredUploadScanner` como
  patrón de barrido (ADR-0021) y el menú ⋮ (006 agrega acciones; 005 deja solo «Descargar»).

## Bloque 1 — PR-A «contratos y dominio» (plan §4–§6, D-9, D-11 forma de errores) · depende de: `main`

- [ ] **T-01** [P] `contracts/storage`: códigos, motivos, parámetros y `formatBytes` — CA: CA-3, CA-4, CA-7 (códigos), CA-19 — Depende: — — ~2 h
  Prueba primero `packages/contracts/src/storage/constants.spec.ts`: `STORAGE_ERROR_CODES` es exactamente el conjunto
  de plan §5 (`STORAGE_INVALID_UPLOAD_REQUEST`, `STORAGE_INVALID_QUERY`, `STORAGE_EMPTY_FILE`, `STORAGE_FILE_TOO_LARGE`,
  `STORAGE_QUOTA_EXCEEDED`, `STORAGE_NAME_CONFLICT`, `STORAGE_UPLOAD_NOT_FOUND`, `STORAGE_UPLOAD_EXPIRED`,
  `STORAGE_UPLOAD_INCOMPLETE`, `STORAGE_UPLOAD_SIZE_MISMATCH`, `STORAGE_INVALID_FILE_TYPE`, `STORAGE_NODE_NOT_FOUND`,
  `STORAGE_TOO_MANY_REQUESTS`); `FIELD_ISSUE_REASONS` = `REQUIRED`, `INVALID_NAME`, `NAME_TOO_LONG`, `INVALID_SIZE`,
  `UNKNOWN_FIELD`, `INVALID_CURSOR`; `REJECTION_REASONS` = `tamano`, `tipo_invalido` (una sola exportación, cambio 15b);
  `FILE_TYPE_REASONS` = `signature`, `executable`, `text`; constantes de dominio `UPLOAD_TTL_HOURS = 24`,
  `DOWNLOAD_URL_TTL_SECONDS = 300`, `FILE_NAME_MAX_LENGTH = 255`, `FILES_PAGE_DEFAULT = 50`, `FILES_PAGE_MAX = 100`.
  `formatBytes` formatea en español las cifras que citan CA-3 y CA-4 (la misma función la usan API y web). Luego los
  archivos y la reexportación desde `packages/contracts/src/index.ts`. El dominio de `storage` **no** importa este paquete.
  Archivos: `packages/contracts/src/storage/{error-codes,parameters,format-bytes,index}.ts`, `packages/contracts/src/storage/constants.spec.ts`, `packages/contracts/src/index.ts`.

- [x] **T-02** [P] Esquemas de carga, listado y descarga; `details` en el error — CA: CA-1, CA-2, CA-6, CA-7, CA-13 — Depende: — — ~3 h
  Prueba primero `packages/contracts/src/storage/schemas.spec.ts` y ampliar `error.spec.ts`: `initUploadSchema` estricto
  acepta `{ name, sizeBytes, onConflict?: 'ask' | 'keep_both' }` (`onConflict` ausente = `ask`), rechaza nombre vacío,
  tamaño no entero o negativo, y campos de más; `sizeBytes = 0` **pasa el esquema** (el 422 `STORAGE_EMPTY_FILE` lo
  decide el servicio, no zod). La respuesta de inicio es unión por `mode`: `simple` con un `PUT`; `multipart` con
  `partSizeBytes`, `totalParts` y `parts`. `FileSummary` = `{ id, name, sizeBytes, kind, createdAt }` con `kind` del
  catálogo. `downloadUrlSchema` = `{ url, expiresAt }`. `errorResponseSchema` gana `details` opcional, objeto plano de
  `string | number | boolean`, `.strict()` (D-12); un `details` con un objeto anidado o un array falla. `fields` de 001,
  si ya está en la rama, se conserva. Luego los esquemas. Los `:id` no se validan como UUID en el pipe de forma que
  un id malformado se distinga de uno inexistente (CA-16: ambos 404; la comprobación vive en el controlador, T-42).
  Archivos: `packages/contracts/src/storage/schemas.ts`, `packages/contracts/src/storage/schemas.spec.ts`, `packages/contracts/src/error.ts`, `packages/contracts/src/error.spec.ts`.

- [x] **T-03** [P] `FileName` y `ObjectKey` — CA: CA-6, CA-7 — Depende: — — ~3 h
  Prueba primero `file-name.vo.spec.ts`: NFC; recorta espacios; 1–255 puntos de código; rechaza vacío, `/`, `\`, NUL,
  controles, `.` y `..`; `extension()` en minúsculas; `firstFree(taken)` devuelve «base (n).ext» con el primer `n ≥ 1`
  libre, sin distinguir mayúsculas, y «base (n)» si no hay extensión; «Ñ» y «ñ» colisionan. `object-key.spec.ts`:
  `ObjectKey.of(propietario, archivo, version)` es `u/{uuid}/{uuid}/{uuid}` y rechaza cualquier segmento que no sea UUID.
  Sin Nest ni `contracts`. Luego los objetos de valor, inmutables.
  Archivos: `apps/api/src/modules/storage/domain/{file-name.vo,object-key}.ts`, `apps/api/src/modules/storage/domain/{file-name.vo,object-key}.spec.ts`.

- [x] **T-04** [P] Catálogo `FileKind` y `QuotaPolicy` — CA: CA-3, CA-4, CA-12, CA-23 — Depende: — — ~2 h
  Prueba primero `file-kind.spec.ts`: una tabla `FILE_KIND_CATALOG` (extensión → `kind` + MIME). Imagen = `png`, `jpg`,
  `jpeg`, `gif`, `webp`; `svg`, `bmp` y `heic` son `otro` (D-9). `docx`, `pdf`, `texto` (`txt`, `md`), `xlsx`, `pptx`.
  `quota-policy.spec.ts`: `check(limits, usage, declaredBytes)` es pura; primero el máximo por archivo
  (`FileTooLarge` con `sizeBytes` y `maxBytes`), después la cuota (`used + reserved + declared > quota` → `QuotaExceeded`
  con `missingBytes`); la reserva de la segunda carga concurrente no cabe (CA-23); los límites llegan como argumentos,
  ningún byte del catálogo de planes está en el archivo.
  Archivos: `apps/api/src/modules/storage/domain/{file-kind,quota-policy}.ts`, `apps/api/src/modules/storage/domain/{file-kind,quota-policy}.spec.ts`.

- [x] **T-05** `UploadSession`, `File` y `FileVersion` — CA: CA-8, CA-9, CA-22 — Depende: T-03 — ~3 h
  Prueba primero `upload-session.spec.ts` con `FixedClock`: estados `activa → completada | rechazada | cancelada | expirada`
  y ninguna otra transición; `isExpired(now)` a las 24 h desde `creadaEn` (constante de dominio, no env); `rechazada`
  exige motivo `tamano` o `tipo_invalido`. `file.spec.ts`: `tamanoBytes > 0`; `FileVersion.origen` solo `carga` en esta
  spec (el tipo admite los cuatro del `CHECK`, sin lógica de edición). Objetos inmutables; las transiciones devuelven
  una copia nueva.
  Archivos: `apps/api/src/modules/storage/domain/{upload-session,file,file-version}.ts`, `apps/api/src/modules/storage/domain/{upload-session,file}.spec.ts`.

- [x] **T-06** Errores de `storage` — CA: CA-3…CA-7, CA-9, CA-10, CA-11, CA-13, CA-19, CA-24 — Depende: T-01 — ~3 h
  Prueba primero `storage-errors.spec.ts`: `InvalidUploadRequestError` e `InvalidQueryError` extienden `DomainError` con
  `status = 400` y `fields` (no se crea una base nueva; `InvalidInputError` de `shared` sigue en 422); `EmptyFileError`,
  `FileTooLargeError`, `QuotaExceededError`, `UploadSizeMismatchError` e `InvalidFileTypeError` extienden
  `InvalidInputError` (422); `NameConflictError` (409, guarda `suggestedName`); `UploadIncompleteError` (409);
  `UploadNotFoundError` y `NodeNotFoundError` (404); `UploadExpiredError` (410, base propia mínima); `StorageTooManyRequestsError`
  extiende `TooManyRequestsError` **cuando 001 T-07 esté en la rama**; si PR-A se abre antes, la clase de 429 queda en
  un archivo que compila contra la base de 001 y esta tarea se cierra al rebasear sobre 001-PR-1 (no se copia el error
  de 001). Mensajes exactos de spec §9, armados con `formatBytes` inyectado donde hay cifras.
  `STORAGE_UPLOAD_SIZE_MISMATCH` = «El archivo cambió durante la carga. Vuelve a subirlo.» (sin parámetros).
  `InvalidFileTypeError` distingue `executable` («No se permiten archivos ejecutables. Sube otro archivo.») de
  `signature`/`text`. Contrato de códigos: un `*.spec.ts` de `presentation` (no el dominio) afirma que cada `code` está
  en `STORAGE_ERROR_CODES`. El dominio no importa `contracts`.
  Archivos: `apps/api/src/modules/storage/domain/errors/*.ts`, `apps/api/src/modules/storage/domain/errors/storage-errors.spec.ts`, `apps/api/src/modules/storage/presentation/storage-error-codes.contract.spec.ts`.

- [x] **T-07** Puerto `IPlanLimitsProvider` y fachada de `storage` — CA: CA-3, CA-4 (puerto), RN-1 — Depende: T-04 — ~2 h
  Prueba primero `apps/api/src/modules/storage/index.spec.ts`: `storage/index.ts` exporta `I_PLAN_LIMITS_PROVIDER`,
  el tipo `PlanLimits` (`maxFileBytes`, `storageQuotaBytes` y nada más) y `IPlanLimitsProvider.limitsFor(actor)`; no
  exporta `MagicBytesDetector`, `IExpiredUploadScanner`, `LogAuditLogger` ni repositorios. `FakePlanLimitsProvider`
  vive en `apps/api/test/` y devuelve los límites que la prueba le pasa. `plan-limits.ts` no importa `billing`.
  El enlace del token **no** entra en `StorageModule` (llega en `AppModule`, T-42).
  Archivos: `apps/api/src/modules/storage/application/plan-limits.ts`, `apps/api/src/modules/storage/index.ts`, `apps/api/src/modules/storage/index.spec.ts`, `apps/api/test/support/fake-plan-limits.provider.ts`.

- [x] **T-08** `MagicBytesDetector` — CA: CA-11, CA-12, CA-24 — Depende: T-04 — ~4 h
  Prueba primero `magic-bytes.detector.spec.ts` con un `ByteReader` en memoria (sin MinIO): (1) ejecutables antes que
  la extensión — PE (`MZ` + `e_lfanew` → `PE\0\0`), ELF `\x7FELF`, Mach-O `FEEDFACE`/`FEEDFACF`/`CEFAEDFE`/`CFFAEDFE`
  y universal `CAFEBABE` solo si el siguiente `uint32` big-endian está entre 1 y 30; un `CAFEBABE` de clase Java no se
  rechaza como ejecutable; (2) `pdf` = `%PDF-` en los primeros 1024 bytes; PNG, JPEG `FF D8 FF`, GIF87a/GIF89a, WebP
  `RIFF….WEBP`; `docx`/`xlsx`/`pptx` = ZIP `PK\x03\x04` cuyo directorio central (EOCD en los últimos 22–65557 bytes,
  directorio ≤ 8 MiB, leído por rango, sin descomprimir) contiene `[Content_Types].xml` y `word/document.xml`,
  `xl/workbook.xml` o `ppt/presentation.xml`; ZIP ≥ 4 GiB o Zip64 en el EOCD → firma inválida; (3) `txt`/`md` = UTF-8
  estricto por bloques de 4 MiB, BOM permitido, **sin NUL**; (4) cualquier otra extensión → `otro` aunque el contenido
  no tenga firma. Implementa `IFileTypeDetector.detect(reader, extension)` y devuelve `{ ok: true, kind, mime }` o
  `{ ok: false, reason }`. Sin dependencia nueva (D-9).
  Archivos: `apps/api/src/modules/storage/application/ports/i-file-type-detector.port.ts`, `apps/api/src/modules/storage/infrastructure/magic-bytes.detector.ts`, `apps/api/src/modules/storage/infrastructure/magic-bytes.detector.spec.ts`.

- [ ] **T-09** Cierre del PR-A — CA: n/a — Depende: T-01…T-08 — ~1 h
  README de `storage`: la primera spec ya no es un marcador; lista las capas y recuerda que `index.ts` es la única
  puerta (sin `billing`). `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde. Avisar a quien haga PR-B: T-01 y T-02
  ya se pueden consumir.
  Archivos: `apps/api/src/modules/storage/README.md`.

## Bloque 2 — PR-B «componentes de carga y explorador» (plan §6 Frontend, D-19) · depende de: T-01, T-02

Los componentes reciben datos por props o por un cliente inyectado. No llaman a la red real. Textos de spec §9 y
foco según `docs/design/mockups/storage/`. Sin tokens nuevos ni colores a mano (`ui-guidelines.md`). Sin `PLANS_PATH`.

- [ ] **T-10** [P] [P×PR] `alert-dialog`, `checkbox` y `dropdown-menu` — CA: CA-6, CA-21, CA-22 (primitivas) — Depende: — — ~2 h
  Agregar las tres primitivas shadcn/Radix (adenda de ADR-0015) con los tokens ya existentes. Prueba de render mínima
  por componente: el diálogo atrapa el foco, la casilla se puede marcar, el menú se abre con Enter y Espacio.
  Archivos: `apps/web/src/components/ui/{alert-dialog,checkbox,dropdown-menu}.tsx` y sus `*.spec.tsx`.

- [ ] **T-11** [P] `xhr-put`: progreso y aborto — CA: CA-21 (bytes) — Depende: — — ~2 h
  Prueba primero `xhr-put.spec.ts` con un `XMLHttpRequest` falso: reporta bytes enviados, se aborta, y un fallo de red
  rechaza la promesa sin reintentar (el reintento es de T-13). No envía `Authorization` ni cookies de la app.
  Archivos: `apps/web/src/features/storage/upload/xhr-put.ts`, `apps/web/src/features/storage/upload/xhr-put.spec.ts`.

- [ ] **T-12** Máquina `UploadManager`: inicio, conflicto y subida — CA: CA-1, CA-2, CA-6, CA-21 — Depende: T-01, T-02, T-11 — ~4 h
  Prueba primero `upload-manager.spec.ts` con cliente HTTP y reloj falsos. Estados:
  `queued → starting → conflict? → uploading → completing → done | rejected`. Concurrencia 2 archivos × 4 partes
  (`upload-config.ts`). Ante `409 STORAGE_NAME_CONFLICT` se detiene en `conflict` con `suggestedName` y no sube hasta
  que el llamador elige `keep_both` (reenvía `onConflict`) o descarta. `mode` sale de la respuesta del servidor; el
  cliente no decide el umbral (D-2). «Aplicar a los demás» es estado del manager: aplica `keep_both` o descarte al
  resto de la selección. Si pasa de 4 h, partir en «transiciones» y «conflicto / varios archivos» antes de seguir.
  Archivos: `apps/web/src/features/storage/upload/{upload-manager,upload-config}.ts`, `apps/web/src/features/storage/upload/upload-manager.spec.ts`.

- [ ] **T-13** Pausa, reanudación, corte y cancelación en el manager — CA: CA-8, CA-9, CA-19, CA-22 — Depende: T-12 — ~4 h
  Ampliar la misma suite: pausa ↔ `uploading`; una carga `simple` pausada aborta el `PUT` y al reanudar empieza de
  cero, con la marca «Se reiniciará al reanudar»; una `multipart` al reanudar pide `resume` y solo sube `pending`.
  Corte de red → `offline` (título de UI «Carga en espera» lo pinta T-14); al evento `online` llama `resume`.
  `403` de URL vencida vuelve a llamar `resume`. Reintento de parte: 5 intentos, espera exponencial con jitter.
  Cancelar con 0 % no pide confirmación; con progreso > 0 el manager pasa a pausa hasta que la UI confirma (T-15).
  `410` → `expired`; `429` → fila en espera con «Reintentar» siempre habilitado, sin cuenta regresiva. `complete`
  no vence por tiempo de espera del cliente (margen mayor que `UPLOAD_COMPLETE_TIMEOUT_SECONDS`; la fila puede quedar
  en `completing`).
  Archivos: `apps/web/src/features/storage/upload/upload-manager.ts`, `apps/web/src/features/storage/upload/upload-manager.spec.ts`.

- [ ] **T-14** Panel de cargas — CA: CA-3, CA-4, CA-8, CA-9, CA-19, CA-21, CA-22 — Depende: T-12 — ~3 h
  Prueba primero `upload-panel.spec.tsx` y `upload-progress.spec.tsx`: progreso (porcentaje, bytes, velocidad como
  media de 5 s, tiempo restante); avisos de tamaño, cuota (acción «Liberar espacio» hacia `/archivos`; **no** existe
  «Ver planes»), tipo, ejecutable, vacío, caducada («Subir de nuevo») y tasa («Reintentar»); corte con título
  «Carga en espera» y el texto de spec §9; fila cancelada con el texto de liberación. Mientras hay cargas activas el
  panel solo se minimiza; «Cerrar» aparece cuando no queda ninguna; las filas terminadas persisten hasta cerrar.
  Reutiliza `FileTypeChip`, `StateView`, `Button`, `Card` y `components/nimbo/upload-progress.tsx`.
  Archivos: `apps/web/src/features/storage/components/upload-panel.tsx`, `apps/web/src/components/nimbo/upload-progress.tsx`, `apps/web/src/features/storage/components/upload-panel.spec.tsx`, `apps/web/src/components/nimbo/upload-progress.spec.tsx`.

- [ ] **T-15** Diálogos de nombre repetido y de cancelar — CA: CA-6, CA-22 — Depende: T-10, T-12 — ~3 h
  Prueba primero `name-conflict-dialog.spec.tsx`: título «¿Conservar ambos archivos?», foco inicial en «Conservar ambos»,
  muestra el nombre final, casilla «Aplicar a los demás» con la ayuda en singular o en plural según `n`. Un diálogo
  por archivo. `cancel-upload-dialog.spec.tsx`: solo si ya se subió más de 0 %; texto con `{subido}`, `{total}` y
  nombre; foco inicial en «Seguir subiendo»; «Cancelar carga» confirma. Mientras el diálogo está abierto la carga
  sigue en pausa (el spec del manager de T-13 y este se encuentran en el hook de T-53; aquí el diálogo solo emite
  `onConfirm` / `onDismiss`).
  Archivos: `apps/web/src/features/storage/components/{name-conflict-dialog,cancel-upload-dialog}.tsx` y sus `*.spec.tsx`.

- [ ] **T-16** Explorador mínimo, arrastre y error de listado — CA: CA-1, CA-21 — Depende: T-02 — ~4 h
  Prueba primero `file-explorer.spec.tsx` y `upload-dropzone.spec.tsx`: estados vacío («Aún no tienes archivos» y el
  máximo por archivo que llega por prop), cargando, arrastre («Suelta para subir»), lista de la raíz, error
  («No pudimos cargar tus archivos.» / «Tus archivos siguen guardados. Inténtalo de nuevo.») con «Reintentar» que
  repite la misma petición. En error **no** se muestra `correlationId` y «Subir archivos» sigue habilitado. La barra
  lateral de esta vista **no** renderiza «Carpetas» ni el contador de la Papelera. Sin cuota ni desglose (007).
  Archivos: `apps/web/src/features/storage/components/{file-explorer,upload-dropzone,explorer-error-state}.tsx` y sus `*.spec.tsx`.

- [ ] **T-17** Menú ⋮ y aviso de descarga — CA: CA-13, CA-21 — Depende: T-10, T-16 — ~3 h
  Prueba primero `file-row-menu.spec.tsx`: la única acción es «Descargar» (`aria-label` «Acciones de {nombre}»);
  Enter/Espacio abren el menú. Si la promesa de la URL tarda más de 2 s (temporizadores falsos), el ítem queda
  deshabilitado con «Preparando…» y se anuncia «Preparando la descarga de {nombre}…». Un `429` o un `404` muestra el
  `Alert` **arriba de la lista** (no un toast) con el texto de spec §9 y la acción («Reintentar» o «Actualizar lista»);
  la fila no se quita. Red o `5xx`: el texto de conexión y «Reintentar».
  Archivos: `apps/web/src/features/storage/components/file-row-menu.tsx`, `apps/web/src/features/storage/components/file-row-menu.spec.tsx`, `apps/web/src/features/storage/components/file-explorer.tsx`.

- [ ] **T-18** Accesibilidad de los estados de §9 — CA: CA-21 — Depende: T-14, T-15, T-16, T-17 — ~2 h
  `a11y.spec.tsx` con jest-axe sobre panel (progreso, pausa, sin conexión, rechazos, nombre repetido, confirmar
  cancelar), explorador (vacío, cargando, arrastre, error, acciones, descarga preparando, descarga fallida) a 360 y
  1440 px. Cero violaciones serias. Sin colores fuera de tokens.
  Archivos: `apps/web/src/features/storage/a11y.spec.tsx`.

- [ ] **T-19** Cierre del PR-B — CA: n/a — Depende: T-10…T-18 — ~1 h
  `pnpm --filter web lint`, typecheck y test en verde. Los componentes aún no están montados en `/archivos` (eso es
  PR-F). Nota en el README de `features/storage`: el proveedor de la pestaña llega en T-53.
  Archivos: `apps/web/src/features/storage/README.md`.

## Bloque 3 — PR-C «persistencia, RLS y puertos de datos» (plan §4, D-5, D-17, D-18) · depende de: 001-PR-1, 003-PR-B, 003-PR-C

Cuatro migraciones a mano (ADR-0002), posteriores a las de 001 (`20260928100000`), 003 (`20260928110000`) y 002
(`20260929100000`). Si esa numeración cambió al integrar, se reajusta el timestamp, no el orden. Cada `down` deshace
su `up`. Los repositorios toman el `EntityManager` de `TransactionContext.requireActorScope(actor)` (003 T-29).

- [x] **T-20** `MINIO_*` compartido y variables de carga — CA: CA-14 (host), RN-2, RN-16 — Depende: 001 T-10 — ~3 h
  Prueba primero en `env.schema.spec.ts`: una sola definición de las cinco `MINIO_*` actuales, compuesta por
  `apiEnvSchema` y `workerEnvSchema`; un secreto declarado en ambos pasa si las definiciones coinciden; `MINIO_PUBLIC_ENDPOINT`
  solo está en `apiEnvSchema` (defecto local `http://localhost:9000`). Refinamientos: `UPLOAD_PART_SIZE_BYTES` ≥ 5 MiB
  (defecto 8 MiB), `UPLOAD_MULTIPART_THRESHOLD_BYTES` ≥ parte (defecto 16 MiB), `UPLOAD_URL_TTL_SECONDS` entre 60 y
  86400 (defecto 3600), tasas `RATE_LIMIT_UPLOAD_INIT_PER_MINUTE` (300) y `RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE` (120),
  `UPLOAD_COMPLETE_TIMEOUT_SECONDS` (900, solo api), `UPLOAD_CLEANUP_INTERVAL_MINUTES` (10) y `UPLOAD_CLEANUP_BATCH_SIZE`
  (100) solo en el worker. `.env.example` y `pnpm env:check` alineados. CORS de MinIO en `compose.yml`
  (`MINIO_API_CORS_ALLOW_ORIGIN` = origen de la web, sin comodín). No reintroducir el router local `/s3`.
  Archivos: `apps/api/src/shared/infrastructure/config/env.schema.ts`, `apps/api/src/shared/infrastructure/config/env.schema.spec.ts`, `.env.example`, `compose.yml`.

- [x] **T-21** Migración `espacio_usado` — CA: CA-4, CA-23, RN-10 — Depende: 001 T-06 — ~2 h
  Prueba de la migración (el caso entra en `migrations.int-spec.ts`, que se completa en T-30; aquí el archivo y el
  `down`): `ALTER TABLE usuario ADD COLUMN espacio_usado bigint NOT NULL DEFAULT 0` y
  `CHECK (espacio_usado >= 0)`. `down` quita la restricción y la columna. Sin otras columnas de `usuario`.
  Archivos: `apps/api/src/migrations/20260930100000-agregar-espacio-usado-a-usuario.ts`.

- [x] **T-22** Migración `archivo` y `version_archivo` — CA: CA-1, CA-6 — Depende: T-21 — ~3 h
  SQL de plan §4: sin `tipo_mime`, sin `carpeta_id`, sin `checksum`. `version_actual_id` con FK `DEFERRABLE INITIALLY DEFERRED`.
  Índice único parcial `(propietario_id, lower(nombre)) WHERE eliminado_en IS NULL`. `clave_objeto` única.
  `tamano_bytes > 0`. `down`: `DROP TABLE version_archivo CASCADE; DROP TABLE archivo`.
  Archivos: `apps/api/src/migrations/20260930100100-crear-archivo-y-version-archivo.ts`.

- [x] **T-23** Migración `carga` — CA: CA-2, CA-9, CA-23 — Depende: T-22 — ~3 h
  SQL de plan §4. `archivo_id` y `version_id` **sin FK** (ids reservados; una FK exigiría la fila antes de completar).
  `ck_carga_partes` y `ck_carga_rechazo`. Índices parciales de reservas (`estado = 'activa'`) y de barrido (`expira_en`).
  `upload_id` nullable. `down`: `DROP TABLE carga`.
  Archivos: `apps/api/src/migrations/20260930100200-crear-carga.ts`.

- [x] **T-24** RLS y `carga_expiradas` — CA: CA-16, CA-17, DF-52 — Depende: T-22, T-23, 003 (funciones `nimbo_actor_*`) — ~4 h
  Políticas de plan §4 sobre `archivo`, `version_archivo` y `carga`: `ENABLE` + `FORCE`. Cliente: `propietario_id = nimbo_actor_id()`.
  Metadatos internos solo `SELECT` de `ADMIN` y `SUPPORT` sobre `archivo`; `version_archivo` sin política para roles
  internos. `carga_mantenimiento FOR SELECT TO CURRENT_USER USING (estado = 'activa')`. Función `carga_expiradas`
  exactamente como el SQL del plan: `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, `LEAST(p_ahora, now())`,
  tope 1000, solo `(id, propietario_id)`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO nimbo_app`. `down` quita
  función, políticas y RLS. No hace falta `GRANT` de tabla: lo cubren los `ALTER DEFAULT PRIVILEGES` de 003; T-30 lo afirma.
  Archivos: `apps/api/src/migrations/20260930100300-politicas-rls-archivo-version-carga.ts`.

- [x] **T-25** Entidades ORM y transformer `bigint` — CA: RN-11 — Depende: T-22, T-23 — ~3 h
  Prueba primero de mapeo (string de PG ↔ `bigint`, nunca `number`). Propiedades de bytes terminan en `Bytes` (lint
  DF-06). Entidades `archivo`, `version_archivo` y `carga` alineadas con las columnas de T-22/T-23; `usuario` gana
  solo `espacioUsadoBytes` en la entidad que ya tenga 001, sin que `storage` importe el módulo `identity` (la columna
  se actualiza por SQL en T-28). `synchronize: false`.
  Archivos: `apps/api/src/modules/storage/infrastructure/persistence/*.orm-entity.ts`, `apps/api/src/modules/storage/infrastructure/persistence/bigint.transformer.spec.ts`.

- [x] **T-26** Rama de propiedad y `INodeRepository` — CA: CA-13, CA-16 — Depende: T-25, 003 T-37 — ~4 h
  Prueba primero `accessible-nodes.int-spec.ts` (se ejecuta con Docker): para `CLIENT`, el fragmento devuelve
  `nodo_id`, `tipo_nodo = 'archivo'`, `nivel = 'OWNER'` de `archivo` con `eliminado_en IS NULL`; un rol interno recibe
  el conjunto vacío. `access` no importa `storage` (ADR-0010); el SQL vive en
  `access/infrastructure/sql/accessible-nodes.ts`. `node.repository.int-spec.ts`: `findAccessibleById`, `listAccessible`
  (raíz, sin papelera, `creado_en DESC, id DESC`, cursor opaco), `findTakenNames` (minúsculas, ignora papelera) e
  `insertWithVersion` unen `accessibleNodes(actor)` en la consulta y usan `requireActorScope`. Sin método sin actor.
  `EXPLAIN` de listado y de nombre usa los índices de T-22 (afirmar el plan, no solo el resultado).
  Archivos: `apps/api/src/modules/access/infrastructure/sql/accessible-nodes.ts`, `apps/api/test/int/access/accessible-nodes.int-spec.ts`, `apps/api/src/modules/storage/application/ports/i-node.repository.port.ts`, `apps/api/src/modules/storage/infrastructure/persistence/typeorm-node.repository.ts`, `apps/api/test/int/storage/node.repository.int-spec.ts`.

- [x] **T-27** `IUploadSessionRepository` — CA: CA-9, CA-10, CA-22 — Depende: T-25 — ~3 h
  Prueba primero `upload-session.repository.int-spec.ts`: `insert`, `findOwned` (la RLS hace que la ajena no aparezca),
  `transition(id, from, to, patch)` como compare-and-set (0 filas si el estado ya no es `from`). Todos los métodos
  exigen `requireActorScope`. No existe `listExpiredIds` en este puerto.
  Archivos: `apps/api/src/modules/storage/application/ports/i-upload-session.repository.port.ts`, `apps/api/src/modules/storage/infrastructure/persistence/typeorm-upload-session.repository.ts`, `apps/api/test/int/storage/upload-session.repository.int-spec.ts`.

- [x] **T-28** `IQuotaRepository` — CA: CA-4, CA-23, RN-10 — Depende: T-21, T-25 — ~3 h
  Prueba primero `quota.repository.int-spec.ts`: `lockUsage` hace `SELECT espacio_usado … FOR UPDATE` y no suma
  reservas; `lockAndReadUsage(actor, now)` suma solo cargas `activa` con `expira_en > now`; `addUsedBytes` suma el
  delta y **ninguna otra columna de `usuario` cambia**. Dos transacciones concurrentes sobre el mismo usuario se
  serializan. Es el único archivo de `storage` con SQL contra `usuario`.
  Archivos: `apps/api/src/modules/storage/application/ports/i-quota.repository.port.ts`, `apps/api/src/modules/storage/infrastructure/persistence/typeorm-quota.repository.ts`, `apps/api/test/int/storage/quota.repository.int-spec.ts`.

- [x] **T-29** Fronteras de `storage` y `audit` — CA: n/a (Art. VIII) — Depende: T-07 — ~3 h
  Si `packages/config/eslint/boundaries.js` aún no existe (PD-24), crearlo con el alcance de PD-47 y anotarlo en
  `pendientes.md` (no cerrar PD-24 entero). Reglas: `storage` → `shared`, `access`, `audit`, `realtime` (**sin**
  `billing`); `billing` → `storage` solo vía `storage/index.ts`; `access` → `shared`; `audit` → `shared`. Fixtures
  negativos que el lint debe rechazar: `storage-imports-identity.ts` y `storage-imports-billing.ts` (ningún archivo
  de `storage`, incluido `plan-limits.ts`, importa `billing`). `apps/worker` solo podrá importar `StorageWorkerModule`
  desde `storage/index.ts` (el módulo llega en T-51; la regla se escribe ya).
  Archivos: `packages/config/eslint/boundaries.js`, `packages/config/eslint/boundaries.spec.ts`, fixtures bajo `packages/config/eslint/fixtures/`.

- [x] **T-30** Cierre del PR-C: migraciones reversibles y permisos — CA: RN-10 — Depende: T-20…T-29 — ~3 h
  `migrations.int-spec.ts`: `migration:revert` ×4 y `run` ×4 sobre base vacía; `nimbo_app` tiene
  `SELECT/INSERT/UPDATE/DELETE` en las tres tablas nuevas y `UPDATE` (no solo eso: no se le otorga `DELETE` de más)
  sobre `usuario` como ya lo dejó 003. `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde. Las suites `int` quedan
  escritas; ejecutarlas donde haya Docker.
  Archivos: `apps/api/test/int/storage/migrations.int-spec.ts`, `apps/api/src/modules/storage/README.md`.

## Bloque 4 — PR-D «servicios, MinIO y HTTP» (plan §5, §6) · depende de: PR-C, 001 T-13, 001 T-15, 003-PR-A

Los servicios reciben `actor` primero y abren `withActor` donde tocan filas. Los bytes no pasan por la API (DF-16),
salvo la lectura por rango del detector.

- [x] **T-31** Dependencia `@aws-sdk/s3-request-presigner` — CA: n/a — Depende: — — ~1 h
  `pnpm --filter api add -E @aws-sdk/s3-request-presigner` en la misma versión exacta que `@aws-sdk/client-s3`.
  Typecheck y unitarias sin cambio de comportamiento. Si hay conflicto de `pnpm-lock.yaml` con otro PR, se combinan
  los `package.json` y se regenera el lock; no se edita a mano.
  Archivos: `apps/api/package.json`, `pnpm-lock.yaml`.

- [x] **T-32** `MinioStorageAdapter`: operaciones y borrado real — CA: CA-5, CA-11 (purga) — Depende: T-20, T-31 — ~4 h
  Puerto `IObjectStorage` con la lista de plan §6. Prueba del adaptador con cliente falso y, en
  `minio-storage.adapter.int-spec.ts` (Docker), contra MinIO real: dos `S3Client`, el interno con `connectTimeout` 2 s
  y `requestTimeout` 10 s; `purgeObject` borra todas las versiones y marcas (el bucket está versionado); `headObject`,
  `getRange`, `createMultipart`, `listParts` paginado, `completeMultipart`, `abortMultipart` tolera `NoSuchUpload`.
  Firmar no usa este cliente.
  Archivos: `apps/api/src/modules/storage/application/ports/i-object-storage.port.ts`, `apps/api/src/modules/storage/infrastructure/minio-storage.adapter.ts`, `apps/api/test/int/storage/minio-storage.adapter.int-spec.ts`.

- [x] **T-33** URLs prefirmadas de carga y de descarga — CA: CA-2, CA-13, CA-14 — Depende: T-32 — ~3 h
  Ampliar la suite: el cliente de firma usa `MINIO_PUBLIC_ENDPOINT` (cómputo local; el host de la URL no es el de la
  API ni el de la web). Cada URL de carga firma `Content-Length`. La de descarga dura los segundos que pide el
  llamador, lleva `response-content-disposition: attachment; filename*=UTF-8''…`, `response-content-type: application/octet-stream`
  y `response-cache-control: no-store`, y solo autoriza esa clave (una URL de otra clave falla). Caso de TTL de 2 s
  en la prueba de integración.
  Archivos: `apps/api/src/modules/storage/infrastructure/minio-storage.adapter.ts`, `apps/api/test/int/storage/minio-storage.adapter.int-spec.ts`.

- [x] **T-34** `QuotaService` — CA: CA-3, CA-4, CA-23 — Depende: T-04, T-07, T-28 — ~2 h
  Prueba primero `quota.service.spec.ts` con puertos falsos: `assertCanUpload` corre **dentro** de la transacción que
  el llamador ya abrió, después de `lockAndReadUsage`; máximo por archivo antes que cuota; los límites salen de
  `IPlanLimitsProvider` (el doble de la prueba). No abre su propia transacción ni escribe `espacio_usado`.
  Archivos: `apps/api/src/modules/storage/application/quota.service.ts`, `apps/api/src/modules/storage/application/quota.service.spec.ts`.

- [x] **T-35** `UploadService.init` — CA: CA-1, CA-2, CA-3, CA-4, CA-6, CA-7, CA-19, CA-23 — Depende: T-06, T-27, T-33, T-34, 001 T-13 — ~4 h
  Prueba primero `upload.service.spec.ts` (parte init) con reloj, almacenamiento, cuota y límite de tasa falsos.
  Orden de plan §6: tasa (`storage:upload-init:` + `actor.id`, ventana 60 s) → `FileName` → tamaño 0 →
  `limitsFor` **fuera** de la transacción → `withActor` → `lockAndReadUsage` → `QuotaPolicy` → conflicto con
  `onConflict='ask'` devuelve `NameConflictError` y `suggestedName` sin crear sesión ni objeto → modo por umbral →
  si es por partes, `createMultipart` dentro de la transacción → insertar `carga` (la fila es la reserva) → firmar.
  Si falla después de `createMultipart`, `abortMultipart` en el `catch`. `keep_both` no responde 409; el nombre
  devuelto es informativo (el definitivo es T-38). Bitácora `upload.initiated` con id de carga, `sizeBytes` y `mode`,
  sin nombre ni URL.
  Archivos: `apps/api/src/modules/storage/application/upload.service.ts`, `apps/api/src/modules/storage/application/upload.service.spec.ts`.

- [x] **T-36** `resume`, `cancel` y `expire` — CA: CA-8, CA-9, CA-22 — Depende: T-35 — ~4 h
  Misma suite. `resume`: ajena, cancelada, completada o rechazada → `UploadNotFoundError`; vencida → `expire` y 410;
  por partes devuelve las partes ya completas y URLs nuevas solo de las faltantes; simple devuelve una URL nueva.
  `cancel` y `expire`: **CAS primero** (`activa → cancelada|expirada`), borrar después (`abortMultipart` o
  `purgeObject`, hasta 3 intentos). Si el CAS de `cancel` pierde porque ya está `completada`, 404. La reserva deja
  de contar al salir de `activa`. Bitácoras `upload.resumed`, `upload.cancelled`, `upload.expired` sin nombre ni clave.
  Archivos: `apps/api/src/modules/storage/application/upload.service.ts`, `apps/api/src/modules/storage/application/upload.service.spec.ts`.

- [x] **T-37** `complete`: validar tamaño y tipo, y recuperar un multipart ya cerrado — CA: CA-5, CA-10, CA-11, CA-12, CA-24 — Depende: T-08, T-32, T-36 — ~4 h
  Misma suite, todavía sin la transacción de T-38 (puede dejar el objeto validado en un doble). Carga `completada` →
  devuelve el archivo (idempotencia). Vencida → `expire` + 410. Por partes: `listParts` es la fuente de verdad (no
  ETags del cliente); falta una parte → 409 y la sesión sigue `activa`. Tamaños: todas las partes = `tamano_parte_bytes`
  salvo la última. `> declarado` o `> máximo` → abortar o purgar, `rechazada(tamano)`, 422 `STORAGE_UPLOAD_SIZE_MISMATCH`
  o `STORAGE_FILE_TOO_LARGE`. Simple: objeto ausente → 409; 0 bytes → `STORAGE_EMPTY_FILE`. `NoSuchUpload` + `headObject`
  presente → seguir; ausente y `activa` → 409; ausente y no `activa` → 404. Detector en fallo → `purgeObject` +
  `rechazada(tipo_invalido)` + `details.reason` y `details.extension`. No confiar en el cliente para el tipo.
  Archivos: `apps/api/src/modules/storage/application/upload.service.ts`, `apps/api/src/modules/storage/application/upload.service.spec.ts`.

- [x] **T-38** `IAuditLogger` provisional — CA: CA-20 — Depende: 001 T-09 (redacción) — ~3 h
  Prueba primero `log-audit-logger.spec.ts`: `record(AuditRecord)` no lanza; el catálogo cerrado `AuditAction` de 005
  es `file.upload_completed`, `file.upload_rejected`, `file.download_url_issued` y rechaza otra cadena; `occurredAt`
  sale de `IClock` y `correlationId` del contexto de `shared` (no viajan en el registro); atributos solo
  `string | number | boolean`; el evento Pino `audit.record` pasa por `redactDeep`. `audit/index.ts` exporta puerto,
  token `I_AUDIT_LOGGER`, `AuditAction` y `AuditModule`, **nunca** `LogAuditLogger`. JSDoc del puerto: «mejor
  esfuerzo, después del commit; el adaptador provisional no lanza». Va antes de T-39 y T-40 porque esos servicios
  dependen del puerto, no de la inversa.
  Archivos: `apps/api/src/modules/audit/application/{i-audit-logger.port,audit-action}.ts`, `apps/api/src/modules/audit/infrastructure/log-audit-logger.ts`, `apps/api/src/modules/audit/infrastructure/log-audit-logger.spec.ts`, `apps/api/src/modules/audit/audit.module.ts`, `apps/api/src/modules/audit/index.ts`.

- [x] **T-39** `complete`: transacción, nombre definitivo y auditoría — CA: CA-1, CA-6, CA-20, RN-10 — Depende: T-26, T-28, T-37, T-38 — ~4 h
  Misma suite. Dentro de `withActor`: `lockUsage` → CAS `activa → completada` (0 filas revierte y no hay `archivo`;
  responde 410 o 404 según quien ganó) → `FileName.firstFree` contra `findTakenNames` → `INSERT archivo` +
  `INSERT version_archivo(origen=carga)` → `addUsedBytes` con el tamaño real (la reserva no se suma otra vez).
  Dos completados simultáneos del mismo nombre: el segundo queda «(1)» sin 409. Tras el commit, `IAuditLogger.record`
  (`file.upload_completed` o `file.upload_rejected` con `reason`); si el registro falla, se anota el error y **no**
  se revierte el archivo. Carrera con `cancel`: el doble muestra que nunca se inserta `archivo` si el CAS pierde.
  Sin `pg_advisory_xact_lock`.
  Archivos: `apps/api/src/modules/storage/application/upload.service.ts`, `apps/api/src/modules/storage/application/upload.service.spec.ts`.

- [x] **T-40** `FileService` — CA: CA-13, CA-15, CA-19, CA-20 — Depende: T-26, T-33, T-38 — ~3 h
  Prueba primero `file.service.spec.ts`: `list` pagina con el cursor opaco (límite 1–100, fuera de rango se ajusta a
  50/100); `getDownloadUrl` pide **300 s**, resuelve el archivo con `findAccessibleById` (ajeno = inexistente = 404)
  y la tasa (`storage:download-url:` + `actor.id`) corre **antes** de buscar el archivo. Si `record` de
  `file.download_url_issued` falla, se entrega la URL igual. Bitácora `download.url_issued` con `fileId`, sin URL.
  Archivos: `apps/api/src/modules/storage/application/file.service.ts`, `apps/api/src/modules/storage/application/file.service.spec.ts`.

- [x] **T-41** `details` fuera de la bitácora — CA: CA-20 — Depende: T-02, 001 T-08, 001 T-09 — ~2 h
  Prueba primero: el filtro de errores no escribe `details` (un 409 con `suggestedName` no aparece en el sink);
  `REDACTED_FIELDS` incluye `url`, `uploadUrl`, `claveObjeto`, `objectKey`, `uploadId`, `signature`, `suggestedName`,
  `name`, `nombre`, `fileName` además de los que ya puso 001/002. `DomainError` puede llevar `details` plano hacia
  la respuesta. No registrar cuerpos.
  Archivos: `apps/api/src/shared/presentation/domain-exception.filter.ts`, `apps/api/src/shared/domain/errors/domain-error.ts`, `apps/api/src/shared/infrastructure/logging/redacted-fields.ts` y sus pruebas.

- [x] **T-42** Controladores, módulo y límite de tasa — CA: CA-7, CA-17 — Depende: T-35, T-38, T-39, T-40, T-41, 001 T-15, 003-PR-A — ~4 h
  Prueba de contrato del pipe y de las rutas: `UploadsController` (`POST /uploads`, `POST /uploads/:id/resume`,
  `POST /uploads/:id/complete`, `DELETE /uploads/:id`) y `FilesController` (`GET /files`, `POST /files/:id/download-url`).
  Todas `@Roles(Role.CLIENT)` y `@CurrentActor()`. Cuerpo con `ZodValidationPipe` y fábrica que produce
  `InvalidUploadRequestError` / `InvalidQueryError` (400, `fields`). Un `:id` que no es UUID responde el mismo 404
  que uno inexistente. `StorageModule` no importa `BillingModule` ni enlaza `I_PLAN_LIMITS_PROVIDER`; el enlace del
  doble (o de la implementación de 006a, si ya está) vive en `AppModule`. `DELETE` cancelado dos veces: la segunda
  es 404 y el cliente de T-13 la trata como éxito. Bitácora `upload.rate_limited` en el 429.
  Archivos: `apps/api/src/modules/storage/presentation/{uploads,files}.controller.ts`, `apps/api/src/modules/storage/presentation/storage-validation.ts`, `apps/api/src/modules/storage/storage.module.ts`, `apps/api/src/app.module.ts`.

- [x] **T-43** Integración HTTP: simple, límites, nombre, vacíos y cuota — CA: CA-1, CA-3, CA-4, CA-6, CA-7, CA-19, CA-23 — Depende: T-42 — ~4 h
  Escribir (y ejecutar con Docker) `uploads-simple.int-spec.ts`, `uploads-limits.int-spec.ts` (con
  `FakePlanLimitsProvider`), `uploads-validation.int-spec.ts` (400 con `fields`; 422 vacío), `uploads-name-conflict.int-spec.ts`
  (409, `keep_both`, dos completes simultáneos, colación «Ñ»/«ñ»), `uploads-quota-concurrency.int-spec.ts`
  (`Promise.all` de dos inicios con cupo para uno) y `rate-limit.int-spec.ts` (Redis real, límites bajos, `Retry-After`).
  Sin código de producción nuevo salvo el fallo que estas pruebas destapen.
  Archivos: `apps/api/test/int/storage/{uploads-simple,uploads-limits,uploads-validation,uploads-name-conflict,uploads-quota-concurrency,rate-limit}.int-spec.ts`.

- [x] **T-44** Integración HTTP: partes, reanudación, carrera, tipo, descarga y bitácora — CA: CA-2, CA-5, CA-8, CA-10, CA-11, CA-12, CA-13, CA-14, CA-15, CA-20, CA-22 — Depende: T-43 — ~4 h
  `uploads-multipart.int-spec.ts` (MinIO real, SHA-256 de origen y destino, partes faltantes, `NoSuchUpload` con
  objeto ya completado, doble `complete` → un solo archivo), `uploads-resume.int-spec.ts`, `uploads-cancel.int-spec.ts`
  y la carrera `complete` ∥ `cancel`: nunca un `archivo` sin objeto. `uploads-file-type.int-spec.ts` con el bucket
  versionado (el objeto rechazado no queda ni como versión). `download.int-spec.ts`: cabeceras reales, host distinto
  del de web/API, bytes idénticos, nombre sugerido. `audit-and-logs.int-spec.ts`: el sink no contiene nombre, URL,
  clave, firmas, `details` ni `suggestedName`.
  Archivos: `apps/api/test/int/storage/{uploads-multipart,uploads-resume,uploads-cancel,uploads-file-type,download,audit-and-logs}.int-spec.ts`.

- [x] **T-45** Aislamiento de cargas y archivos — CA: CA-16, CA-17 — Depende: T-42, 003 T-41 — ~4 h
  Ampliar `isolation-world.ts` con `.withFiles()` y `.withUploads()` que insertan **como `nimbo_app` dentro de
  `withActor`**, no como dueño. `storage.iso-spec.ts`: dos clientes casi idénticos; B no completa, reanuda, cancela
  ni pide partes de una carga de A, ni descarga un archivo de A; todo 404 idéntico salvo `correlationId`
  (`STORAGE_UPLOAD_NOT_FOUND` / `STORAGE_NODE_NOT_FOUND`); un id inexistente responde igual. Sin actor → 0 filas.
  Quitar el `JOIN` de `accessibleNodes` en una copia de la consulta de la prueba sigue sin devolver la fila ajena
  (RLS). Administrador, Soporte y Operador en todas las rutas → 403 `SHARED_FORBIDDEN`; sin token → 401. Entrar en
  `pnpm test:isolation`. Cierra CA-10, CA-11 y CA-14 de 003 con archivos reales.
  Archivos: `apps/api/test/isolation/setup/isolation-world.ts`, `apps/api/test/isolation/storage.iso-spec.ts`.

- [x] **T-46** Spike de MinIO (código descartable) — CA: CA-14 (CORS y `Content-Disposition`) — Depende: T-33 — ~1 día, tope de `workflow.md` §4.5
  Cuando haya Docker: ¿MinIO `RELEASE.2025-09-07` rechaza un `PUT` prefirmado cuyo `Content-Length` no es el firmado?,
  ¿honra `response-content-disposition` y `response-content-type`?, ¿el `OPTIONS` de CORS devuelve el origen
  configurado?, ¿limpia multipart abandonados? Anotar el resultado en `plan.md` §8. Borrar el código del spike.
  Si `Content-Length` no se puede firmar, parar y proponer *presigned POST* con `content-length-range` antes de
  cambiar el adaptador. No bloquea T-47 si las unitarias están en verde; sí bloquea dar por demostrada CA-14.

- [x] **T-47** Cierre del PR-D — CA: n/a — Depende: T-31…T-45 — ~1 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde. Anotar en la descripción del PR qué suites `int`/`iso` se
  ejecutaron y en qué máquina. `storage/index.ts` exporta `StorageModule`, los puertos que otros módulos pueden
  implementar (`IPlanLimitsProvider`) y nada de infraestructura. `StorageWorkerModule` lo agrega al índice T-51.
  Archivos: `apps/api/src/modules/storage/index.ts`, `apps/api/src/modules/storage/README.md`.

## Bloque 5 — PR-E «limpieza a las 24 h» (plan D-6, ADR-0021) · depende de: PR-D

- [ ] **T-48** `IExpiredUploadScanner` — CA: CA-9 — Depende: T-24 — ~2 h
  Prueba primero `expired-upload.scanner.int-spec.ts`: `listExpiredIds(now, limit)` llama `carga_expiradas` y solo
  devuelve `{ id, propietarioId }` de activas vencidas. No se exporta desde `storage/index.ts`. `UploadService` no
  lo recibe.
  Archivos: `apps/api/src/modules/storage/application/ports/i-expired-upload.scanner.port.ts`, `apps/api/src/modules/storage/infrastructure/persistence/sql-expired-upload.scanner.ts`, `apps/api/test/int/storage/expired-upload.scanner.int-spec.ts`, `apps/api/src/modules/storage/index.spec.ts`.

- [ ] **T-49** `UploadCleanupProcessor` y programa repetible — CA: CA-9 — Depende: T-36, T-48 — ~3 h
  Prueba primero `upload-cleanup.processor.spec.ts` con cola y scanner falsos: `concurrency: 1`, `attempts: 3`,
  espera exponencial. Fase 1: `ITransactionRunner.run` (sin actor) llama al scanner. Fase 2: por fila,
  `withActor(createActor(propietarioId, Role.CLIENT), () => uploadService.expire(...))`. Un fallo de fila se registra
  (`upload.cleanup_failed`) y no frena el lote; si hubo fallos, el trabajo falla al final. Bitácora
  `upload.cleanup_run` con `scanned`, `expired`, `failed`. `UploadCleanupScheduler` registra
  `upsertJobScheduler` al arrancar, cada `UPLOAD_CLEANUP_INTERVAL_MINUTES`, payload `{ correlationId }`. Sin
  `@nestjs/schedule`.
  Archivos: `apps/api/src/modules/storage/infrastructure/upload-cleanup.processor.ts`, `apps/api/src/modules/storage/infrastructure/upload-cleanup.scheduler.ts`, `apps/api/src/modules/storage/infrastructure/upload-cleanup.processor.spec.ts`.

- [ ] **T-50** Aislamiento del mantenimiento — CA: CA-9, DF-52 — Depende: T-24, T-48 — ~4 h
  `storage-maintenance.iso-spec.ts` con contenedor propio: un script de arranque (superusuario) crea el rol dueño
  `NOSUPERUSER`, la base, `CREATE EXTENSION vector` y `nimbo_app`; las migraciones corren con ese dueño. La suite
  **falla con mensaje explícito** si el dueño es superusuario (no pasa en vacío). Afirma: `nimbo_app` sin actor ve
  0 filas de `carga`; `carga_expiradas` no devuelve vigentes aunque `p_ahora` sea dentro de un año; no devuelve
  `completada`; tope 1000; `PUBLIC` no puede ejecutarla; `pg_policies` y `pg_proc` muestran que
  `carga_mantenimiento` y la función son del dueño de `carga`.
  Archivos: `apps/api/test/isolation/storage-maintenance.iso-spec.ts`, `apps/api/test/isolation/setup/nosuperuser-postgres.ts`.

- [ ] **T-51** Worker y carrera con `complete` — CA: CA-9 — Depende: T-49, T-50 — ~3 h
  `StorageWorkerModule` lo importa `apps/worker` **solo** desde `storage/index.ts` (exportar el módulo de worker
  desde el índice; seguir sin exportar el scanner). `WorkerModule` importa `MinioConfigModule` y
  `StorageWorkerModule`. `upload-cleanup.int-spec.ts`: el job expira, borra partes, libera la reserva y un `resume`
  posterior responde 410; `complete` y `expire` en paralelo no dejan un `archivo` sin objeto. Incluir esta suite en
  `pnpm test:isolation` junto con T-45.
  Archivos: `apps/api/src/modules/storage/storage-worker.module.ts`, `apps/api/src/modules/storage/index.ts`, `apps/api/src/worker.module.ts`, `apps/api/test/int/storage/upload-cleanup.int-spec.ts`.

- [ ] **T-52** Cierre del PR-E — CA: n/a — Depende: T-48…T-51 — ~1 h
  Lint, typecheck y unitarias en verde. La descripción del PR dice si `storage-maintenance.iso-spec.ts` corrió con
  dueño `NOSUPERUSER`. Si no alcanzó a correr antes del 30/09, queda explícito que la Definición de Hecho exige
  ejecutarla en staging con dueño no superusuario (plan §8).
  Archivos: `apps/api/src/modules/storage/README.md`.

## Bloque 6 — PR-F «página Mis archivos» (plan §6 Frontend) · depende de: PR-B, 001-PR-4, 002-PR-5a, 003-PR-F

- [ ] **T-53** Cliente HTTP, catálogo y proveedor de la pestaña — CA: CA-5, CA-19, CA-21 — Depende: T-02, T-13, 001 T-57, 002 T-85 — ~3 h
  Prueba primero: `features/storage/api.ts` valida con los esquemas de T-02 y usa `auth-fetch` solo contra la API.
  `lib/error-catalog.ts` gana cada `STORAGE_*` con el texto de spec §9, incluido el de `STORAGE_UPLOAD_SIZE_MISMATCH`
  sin parámetros; el aviso de cuota ofrece «Liberar espacio» y no «Ver planes». `use-upload-manager` conecta el
  manager de T-12/T-13 con los diálogos. El proveedor cliente vive en `app/(app)/(cliente)/layout.tsx` y conserva
  las cargas al navegar dentro de la pestaña; un reload las pierde (RN-7) y no hay lista de pendientes.
  Archivos: `apps/web/src/features/storage/api.ts`, `apps/web/src/features/storage/api.spec.ts`, `apps/web/src/lib/error-catalog.ts`, `apps/web/src/features/storage/hooks/use-upload-manager.ts`, `apps/web/src/app/(app)/(cliente)/layout.tsx`.

- [ ] **T-54** Página `/archivos` — CA: CA-1, CA-13, CA-21 — Depende: T-16, T-17, T-53, 003-PR-F — ~3 h
  Sustituye el marcador de 003. «Subir archivos» y soltar archivos en la página encolan en el manager. «Descargar»
  pide la URL y abre el enlace (la respuesta lleva `attachment`). El fallo del listado no toca las cargas del panel.
  «Liberar espacio» apunta a esta misma ruta hasta que exista 007. Prueba de la página con el cliente falso: vacío,
  lista, error con «Reintentar», y el panel sigue vivo si el listado falla.
  Archivos: `apps/web/src/app/(app)/(cliente)/archivos/page.tsx`, `apps/web/src/app/(app)/(cliente)/archivos/page.spec.tsx`.

- [ ] **T-55** **(humana)** Guion de demo local — CA: CA-1, CA-2, CA-8, CA-13, CA-21 — Depende: T-47, T-52, T-54 — ~2 h
  En una máquina con Docker (`docker compose up -d`, `pnpm dev`): subir un archivo bajo el umbral y verlo en la raíz;
  subir uno por partes, cortar la red, reanudar y comprobar el archivo; pausar y cancelar; descargar y ver que el
  enlace deja de servir tras 5 minutos; recorrer 360 y 1440 px. Anotar el resultado en la descripción del PR-F.
  No sustituye a `/review` ni a la revisión del `ui-designer`.

- [ ] **T-56** Documentación de operación — CA: n/a — Depende: T-24 — ~2 h
  `docs/operations/ambientes.md`: el rol que migra es el mismo en todos los ambientes; cambiarlo exige una migración
  nueva (`TO CURRENT_USER` queda fijado al crear `carga_mantenimiento`). README de `storage` con el flujo
  init → PUT directo a MinIO → complete, y la excepción DF-59 en una frase. No instrumentar métricas. No abrir
  `architecture.md` ni `design-findings.md`.
  Archivos: `docs/operations/ambientes.md`, `apps/api/src/modules/storage/README.md`.

- [ ] **T-57** Cierre del PR-F y de las tareas — CA: todos los de esta spec, como trazabilidad — Depende: T-53…T-56 — ~1 h
  Lint, typecheck y unitarias de `web` y `api` en verde. La spec pasa a `En revisión` solo cuando este cierre y los
  PR anteriores están integrados y se pide `/review` (tester, security-auditor, ui-designer). Hasta el primer commit
  `feat/005-*` la spec sigue en `Lista`; ese commit la pasa a `En curso`.
  Archivos: `specs/README.md` (fila 005, al integrar).

## Notas del developer

- CA-18 y RN-12 están retirados (solo lectura → 010). No hay tarea para ellos.
- El enlace real de `I_PLAN_LIMITS_PROVIDER` lo sustituye 006a en `AppModule`. 005 no importa `billing`.
- 004 sustituye el binding de `I_AUDIT_LOGGER` sin cambiar `AuditRecord` ni los tres `AuditAction` de T-40.
- Objetos huérfanos entre el CAS y el borrado están aceptados (R-7). No agregar un barrido de objetos sin
  `version_archivo` en esta spec.
- Si una tarea supera 4 h, parar y pedir que se parta. No adelantar métricas, eventos, carpetas, «Reemplazar» ni toast.

### Traspaso PR-D (2026-09-30)

- **Hechas**: T-31…T-47. T-43 en `ec4304b`; T-44 en `01e669e` (fallo de producción) y `ae8b72d` (pruebas); T-45 en
  `9dd184b`. Detenido por ALTO del coordinador tras T-45.
- **T-46 hecha** (spike en `spike/005-minio`, que solo tiene la fusión de `feat/005-api`; el guion del spike se borró
  sin confirmarse). Resultado completo en `plan.md` §8. `Content-Length` firmado y `response-*`: ya los cubrían
  `minio-storage.adapter.int-spec.ts` y `download.int-spec.ts`. (a) **CORS correcto**: con
  `MINIO_API_CORS_ALLOW_ORIGIN` de `compose.yml`, el `OPTIONS` devuelve `Access-Control-Allow-Origin` solo para
  `http://localhost` y `http://localhost:3002`; `http://evil.example` y `http://localhost:3000` reciben `204` sin
  ninguna cabecera `Access-Control-*`. Sin cambios de configuración. (b) **MinIO limpia solo los multipart
  abandonados**: por defecto `stale_uploads_expiry=24h`, `stale_uploads_cleanup_interval=6h`
  (`MINIO_API_STALE_UPLOADS_*`); con 20 s / 5 s las partes desaparecen del disco a los ~25 s y `ListParts` responde
  `NoSuchUpload` (el adaptador ya lo tolera). `ListMultipartUploads` sigue listando el `uploadId`; la API no lo usa.
  Es una red de seguridad, no reemplaza `upload-cleanup` (PR-E).
- **T-47 hecha**: `storage/index.ts` ya exportaba solo `StorageModule`, `I_PLAN_LIMITS_PROVIDER` y los tipos
  `IPlanLimitsProvider`/`PlanLimits`, y `index.spec.ts` lo fija; sin cambios de código. README de `storage` con la API
  pública, las piezas del PR-D y las rutas en `4bb763a` (sesión en la nube, en paralelo). PR-E (T-52, T-56) completa
  el README con la limpieza, el flujo de carga directa, DF-59 y el resultado de T-46 (CORS y red de seguridad de MinIO).
- **Cierre T-47 en Linux** (sesión en la nube, Node 22.22.2, pnpm 10.33.0, sobre `4bb763a`): `pnpm lint`,
  `pnpm typecheck` y `pnpm test` en verde (raíz 3 / 34, `config` 2 / 28, `contracts` 11 / 221, `web` 64 / 272, `api`
  116 / 1068); `int` e `iso` no se repitieron ahí (sin imagen de MinIO). Esa sesión dejó T-46 bloqueada (`quay.io`
  denegado); se hizo después en Windows (arriba).
- **Suites ejecutadas tras fusionar `main`** (`ca82e96` + T-46/T-44; Windows 11, Docker 29.4.0, Testcontainers sin
  nombres fijos, 2026-09-30; máquina con carga alta de otros procesos): lint y typecheck en verde; unitarias: api 119
  suites / 1105 pruebas, web 77 / 359, contracts 11 / 223, config 2 / 28, raíz 3 / 34, worker sin pruebas;
  `pnpm test:int -- test/int/storage` 18 suites / 200 pruebas; `pnpm test:isolation` 9 suites / 115 (dos corridas en
  verde). **Pruebas inestables con carga** (pasan solas y en otras corridas completas; ninguna es de lógica):
  `redact-deep.spec.ts` «CA-15 (R-8) … no degrada el logger» (umbral de 150 µs; midió ~330 µs en 2 de 3 corridas
  completas de api); `node.repository.int-spec.ts` «ADR-0005: el plan de … usa los índices de propietario» (con tablas
  casi vacías y estadísticas recién analizadas por autovacuum el planificador elige `archivo_pkey`; falló en 2 de 3
  corridas completas de `test/int/storage`); `reset-password-view.spec.tsx` (web, 002) excedió su espera una vez.
  Propuesta para `/review`: fijar las estadísticas o el volumen de `archivo` antes del `EXPLAIN` y medir el umbral de
  `redactDeep` en relación con una referencia, no en absoluto.
- **Texto para la descripción del PR-D**: «PR-D de 005 (T-31…T-47): API de cargas (init, resume, complete, cancel),
  descarga con URL prefirmada de 300 s, límites de tasa, auditoría, pruebas de integración y de aislamiento, y spike de
  MinIO (T-46: CORS restringido a los orígenes de `web`; MinIO limpia multipart abandonados a las 24 h; resultado en
  `plan.md` §8). Corrige dos carreras de `complete` (T-44: doble `complete` y objeto purgado por `cancel` durante la
  detección de tipo). Suites ejecutadas en Windows 11 con Docker 29.4.0 (Testcontainers), tras fusionar `main`: lint y
  typecheck en verde; unitarias api 119 suites / 1105 pruebas, web 77 / 359, contracts 11 / 223, config 2 / 28;
  `pnpm test:int -- test/int/storage` 18 / 200; `pnpm test:isolation` 9 / 115. Inestables con carga (ver nota de
  traspaso en `tasks.md`): el umbral de tiempo de `redact-deep.spec.ts` y las dos aserciones de plan de
  `node.repository.int-spec.ts`. El README de `storage` se completa con PR-E (T-52, T-56).»
- **Fallo de producción corregido en T-44** (`01e669e`): dos `complete` simultáneos de la misma carga: el perdedor del
  CAS final respondía 404 aunque el archivo existía (ahora responde el mismo archivo), y si el otro ya había cerrado el
  multipart, `completeMultipart` lanzaba `NoSuchUpload` → 500. El puerto `IObjectStorage.completeMultipart` ahora
  devuelve `boolean` (`false` = ya no existe) y el servicio recupera con `headObject`. Pruebas: unitarias de
  `upload.service` y del adaptador, `minio-storage.adapter.int-spec.ts` y `uploads-multipart.int-spec.ts`.
- **Arnés** (`storage-http.ts`): además de lo de T-43, `uploadParts(parts, partSize, bytes)`, `otherBytes(size)` (bytes
  «otros», no ejecutables), `UploadRow.upload_id` y `storage.clientFor(id, token?)` (rutas de una cuenta ya creada;
  sin token, sin `Authorization`). `StorageClient.token` se quitó (nadie lo usaba). `isolation-world.ts` gana
  `withFiles(app, cuenta, nombres)` y `withUploads(app, cuenta, n)`, que escriben como `nimbo_app` dentro de
  `withActor` con los repositorios de `storage`, y `close()` borra `carga` y `archivo` antes que `usuario`.
- **Trampas nuevas**: (1) `app.get(I_CLOCK, { strict: false })` devuelve el `FixedClock` de `ProbeModule` (pasado), no el
  del `UploadService`: las cargas sembradas con él nacen vencidas (410). Los *fixtures* usan `new Date()`. (2) Crear
  varias peticiones de `supertest` antes de esperarlas da `ECONNREFUSED`: enviarlas de a una (funciones, no promesas).
  (3) El mensaje de `STORAGE_INVALID_FILE_TYPE` lleva la extensión con punto (`.pdf`).
- **Para confirmar en /review**: (a) carrera estrecha `complete` ∥ `cancel` **corregida** en `fix(storage)` [005 T-44]:
  si la lectura del detector falla y `headObject` dice que el objeto ya no existe, `complete` responde como quien
  perdió el CAS final (`afterLostRegistration`: 404, o 410 si venció); si el objeto sigue ahí, el error se propaga.
  Pruebas unitarias en `upload.service.spec.ts`; el doble `FakeObjectStorage.getRange` ahora rechaza un objeto
  ausente como el adaptador real. No se agregó prueba `int` (la carrera no se reprodujo en 6 vueltas). (b) CA-5 está en
  `uploads-validation.int-spec.ts` (plan §8), no en T-44. (c) CA-9 por HTTP (410 tras 24 h) queda para T-51.
- **Bloqueos**: ninguno.
