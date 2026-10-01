# `storage` — M2 · Motor de Almacenamiento

- **Dueño**: Abel (`specs/README.md`).
- **Diagrama de origen**: M2 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Nodos, cargas, descargas, papelera, versiones, cuota, búsqueda por metadatos, vista previa.
- **Puede depender de**: shared, access, audit, realtime. **No** de `billing` (DF-51, opción A: `storage` declara
  `IPlanLimitsProvider` y `billing` lo implementa) ni de `identity` (DF-59). Lo hace cumplir
  `packages/config/eslint/boundaries.js`.
- **Specs que lo construyen**: 005, 006, 007, 014, 017, 018.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/storage/
├─ domain/          # FileName, ObjectKey, FileKind, QuotaPolicy, UploadSession, File, FileVersion y errores;
│                   # sin Nest, TypeORM, zod ni @nimbo/contracts (ADR-0008): los límites llegan como argumentos
├─ application/     # servicios («service» de los diagramas), plan-limits.ts y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores (MagicBytesDetector, MinIO), procesadores
├─ presentation/    # controladores; el contrato de códigos de error contra `contracts/storage`
├─ storage.module.ts # `StorageModule.forRoot(env)`, con los controladores de 005 (T-42)
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/storage/index.ts`. Hoy exporta `StorageModule`, `StorageWorkerModule`, `I_PLAN_LIMITS_PROVIDER` y los tipos
`IPlanLimitsProvider` y `PlanLimits`. No exporta `MagicBytesDetector`, `IExpiredUploadScanner`, el adaptador de
auditoría ni los repositorios. Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## API pública

`index.ts` exporta solo: `StorageModule` (API), `StorageWorkerModule` (`worker`), el token `I_PLAN_LIMITS_PROVIDER` y los
tipos `IPlanLimitsProvider` y `PlanLimits`. `index.spec.ts` fija esa lista (`RUNTIME_EXPORTS`). No salen el detector de
tipos, `IExpiredUploadScanner`, el adaptador de auditoría ni los repositorios. Ni `StorageModule` ni
`StorageWorkerModule` enlazan `I_PLAN_LIMITS_PROVIDER` (DF-51): lo hace la raíz de composición (`AppModule`,
`WorkerModule`).

## Persistencia (005, PR-C)

Tablas (migraciones `20260930100000`…`100300`, plan §4): `archivo`, `version_archivo` y `carga`, con RLS `ENABLE` +
`FORCE`; `usuario.espacio_usado` es la única columna de otra tabla que `storage` escribe (D-5, DF-59).

| Puerto (`application/ports/`)                                                                                             | Token                         | Implementación (`infrastructure/persistence/`) |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `INodeRepository`: `findAccessibleById`, `listAccessible`, `findTakenNames`, `insertWithVersion` (y los de carpetas, 006) | `I_NODE_REPOSITORY`           | `TypeOrmNodeRepository`                        |
| `IUploadSessionRepository`: `insert`, `findOwned`, `transition` (compare-and-set)                                         | `I_UPLOAD_SESSION_REPOSITORY` | `TypeOrmUploadSessionRepository`               |
| `IQuotaRepository`: `lockUsage`, `lockAndReadUsage`, `addUsedBytes`                                                       | `I_QUOTA_REPOSITORY`          | `TypeOrmQuotaRepository`                       |
| `IExpiredUploadScanner`: `listExpiredIds(now, limit)` → `{ id, propietarioId }[]` (sin actor)                             | `I_EXPIRED_UPLOAD_SCANNER`    | `SqlExpiredUploadScanner`                      |

- Todo método recibe `actor` y toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`: se llama
  dentro de `ITransactionRunner.withActor(actor, …)` o lanza `ActorScopeMissingError`.
- Las lecturas de `archivo` unen `accessibleNodes(actor)` de `access` en la misma consulta (ADR-0005); la RLS es la
  segunda barrera. Los roles internos reciben siempre el conjunto vacío.
- Bytes en `bigint` de punta a punta (`BIGINT_TRANSFORMER` de `shared`; propiedades `*Bytes`).
- `listAccessible` pagina con un cursor opaco (`creado_en DESC, id DESC`); un cursor ajeno es `InvalidQueryError`.
- `findTakenNames(actor, name, folderId, exceptId?)` devuelve el nombre y sus copias «base (n).ext» ocupados en esa
  carpeta (sin distinguir mayúsculas, sin papelera) para `FileName.firstFree`.
- Las cargas vencidas de todos los propietarios **no** se leen por los puertos con actor: eso es
  `IExpiredUploadScanner`, que llama a `carga_expiradas` (ADR-0021) dentro de `ITransactionRunner.run`. Es el único
  acceso sin actor: solo lo inyecta `UploadCleanupProcessor` y no sale de `storage/index.ts`.
- Pruebas: `apps/api/test/int/storage/*.int-spec.ts`, `apps/api/test/int/access/accessible-nodes.int-spec.ts`,
  `apps/api/test/isolation/storage.iso-spec.ts` y `storage-maintenance.iso-spec.ts`
  (Testcontainers; `pnpm test:int`).

## Carpetas (006, T-03)

`INodeRepository` suma el árbol vivo: `findAccessibleFolder`, `listContents` (carpetas primero y luego archivos, cada
grupo `creado_en DESC, id DESC`; cursor opaco `[grupo, creado_en, id]` de `node-list-cursor.ts`), `breadcrumbs`,
`findTakenFolderNames`, `maxSubtreeDepth`, `insertFolder`, `renameFolder`, `renameFile`, `moveFile` y
`moveFolderSubtree` (un `UPDATE` por prefijo de `ruta` que reubica todo el subárbol del dueño, también lo que está en la
papelera).

- Las lecturas y las escrituras por id unen `accessibleNodes(actor)` filtrado por `tipo_nodo` (`archivo` o `carpeta`):
  desde 006 el fragmento mezcla ambos tipos. En la raíz se filtra con `IS NULL` para usar los índices parciales de raíz.
- `FolderService` (`create`, `rename`, `move`, `contents`) abre `withActor` y toma primero `lockUsage`: es el punto de
  serialización de toda mutación del árbol. La profundidad máxima sale de `FOLDER_CONFIG` (`FOLDER_MAX_DEPTH`).
- Rutas (`FoldersController`, solo `CLIENT`): `GET /folders/contents`, `POST /folders`, `PATCH /folders/:folderId` y
  `POST /folders/:folderId/move`. Un `:folderId` que no es UUID es el mismo 404 que uno inexistente o ajeno.
- Pruebas: `folder.service.spec.ts`, `test/int/storage/node-tree.repository.int-spec.ts` y `folders.int-spec.ts`.

## Limpieza de cargas vencidas (005, PR-E)

Una carga `activa` con más de 24 h se vence sola (CA-9). El barrido corre en el `worker`, no en la API.

- **Cola y programa**: cola BullMQ `upload-cleanup`, trabajo `sweep`. Al arrancar, `UploadCleanupScheduler` llama
  `upsertJobScheduler` con el id fijo `upload-cleanup` y `every: UPLOAD_CLEANUP_INTERVAL_MINUTES` (10 por defecto).
  El id fijo lo hace idempotente: reiniciar o escalar el `worker` no duplica ejecuciones y no se usa
  `@nestjs/schedule`. El payload es solo `{ correlationId }`.
- **Lote**: `UPLOAD_CLEANUP_BATCH_SIZE` filas por ejecución (100 por defecto, máximo 1000, validado en el esquema del
  entorno). Lo que exceda el lote se recoge en la ejecución siguiente.
- **Dos fases** (`UploadCleanupProcessor`, concurrencia 1, ADR-0021):
  1. `IExpiredUploadScanner.listExpiredIds(now, limit)` dentro de `ITransactionRunner.run`, **sin actor**: es el único
     acceso sin actor del módulo, solo devuelve `(id, propietarioId)` y no sale de `storage/index.ts`.
  2. Por fila, `UploadService.expire(createActor(propietarioId, CLIENT), id)`: compare-and-set `activa → expirada`
     (libera la reserva de cuota) y después aborta las partes o borra el objeto en MinIO. `expire` abre su propio
     `withActor` y es idempotente: si `complete` ganó la carrera, no hace nada.
- **Fallos**: el error de una fila se registra y no frena el lote. Si hubo fallos, al final el trabajo lanza
  `UploadCleanupIncompleteError` para que BullMQ reintente: 3 intentos, espera exponencial desde 30 s; los trabajos
  fallidos se conservan 24 h.
- **Bitácoras** (Pino, sin nombres de archivo ni claves): `upload.cleanup_scheduled` (al registrar el programa, con
  `intervalMinutes`), `upload.cleanup_run` (`scanned`, `expired`, `failed`; `expired` cuenta las filas procesadas sin
  error) y `upload.cleanup_failed` (`cargaId` y `errorName`, nunca el mensaje).
- **`StorageWorkerModule.forRoot({ UPLOAD_CLEANUP_INTERVAL_MINUTES, UPLOAD_CLEANUP_BATCH_SIZE })`**: registra la cola,
  el escáner, el programa, el procesador y `UploadService` con sus dependencias
  (`upload-lifecycle.providers.ts` las comparte con `StorageModule`). `WorkerModule` lo importa desde
  `storage/index.ts`, junto con `MinioConfigModule` y `PlanLimitsBindingModule`.

Decisiones de enlace en el `worker` (a confirmar en `/review`):

- `I_PLAN_LIMITS_PROVIDER` lo enlaza `PlanLimitsBindingModule` en `WorkerModule` (raíz de composición, DF-51):
  `storage` sigue sin conocer a `billing`, y cuando 006a cambie el enlace vale para ambos procesos.
- `UPLOAD_CONFIG` en el `worker` es un objeto cuyos campos lanzan al leerse: `expire` no lo lee y las variables
  `UPLOAD_*` son solo del `api`. Separar `expire` de `UploadService` sería un cambio de modelo de diseño.
- El adaptador de MinIO del `worker` firma contra `MINIO_ENDPOINT` (interno): no tiene `MINIO_PUBLIC_ENDPOINT` ni emite
  URLs, solo aborta partes y borra objetos.

Pruebas: `upload-cleanup.processor.spec.ts` y `upload-cleanup.scheduler.spec.ts` (unitarias),
`test/int/storage/expired-upload.scanner.int-spec.ts`, `test/int/storage/upload-cleanup.int-spec.ts` y
`test/isolation/storage-maintenance.iso-spec.ts`. Esta última exige que el dueño de las tablas **no** sea superusuario;
`pnpm test:isolation` la corre así.

## Aplicación, infraestructura y rutas (005, PR-D)

| Pieza                                      | Rol                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `UploadService`                            | `init` (reserva de cuota y URLs prefirmadas), `resume`, `complete`, `cancel`, `expire`             |
| `UploadRegistrar`                          | Paso final de `complete`: CAS `activa → completada`, nombre definitivo, `archivo` + versión, cuota |
| `QuotaService`                             | Máximo por archivo y cuota total con reservas de cargas activas (`QuotaPolicy`)                    |
| `FileService`                              | Listado paginado y URL de descarga de 300 s                                                        |
| `FolderService` (006)                      | Crear, renombrar, mover y abrir carpetas, con migas                                                |
| `IObjectStorage` → `MinioStorageAdapter`   | Multipart, URLs prefirmadas (`Content-Length` firmado), `headObject`, `getRange`, purga real       |
| `IFileTypeDetector` → `MagicBytesDetector` | Tipo real por firma; rechaza ejecutables y texto disfrazado                                        |

Rutas (solo `CLIENT`; roles internos → 403, sin token → 401; un id que no es UUID responde el mismo 404 que uno
inexistente): `POST /uploads`, `POST /uploads/:uploadId/resume`, `POST /uploads/:uploadId/complete`,
`DELETE /uploads/:uploadId`, `GET /files`, `POST /files/:fileId/download-url`. `init` y `download-url` pasan por
`IRateLimiter`.

- Pruebas HTTP: `apps/api/test/int/storage/*.int-spec.ts` (`pnpm test:int`); aislamiento:
  `apps/api/test/isolation/storage.iso-spec.ts` (`pnpm test:isolation`).

## Flujo de carga directa (005)

Los bytes **no pasan por la API** (DF-16): el navegador sube directo a MinIO con URLs prefirmadas y la API solo
reserva, vigila y registra. Rutas bajo el prefijo global de la API, todas con actor autenticado:

1. `POST /uploads` (`UploadService.init`, 201): valida tasa, nombre, tamaño > 0, límites del plan y cuota, y crea la fila
   `carga` (la reserva de cuota). Hasta `UPLOAD_MULTIPART_THRESHOLD_BYTES` la carga es `simple` y responde una URL
   `PUT`; por encima es `multipart` y responde `partSizeBytes`, `totalParts` y una URL firmada por parte. Un nombre
   repetido responde 409 con la sugerencia, salvo que se envíe `onConflict: 'keep_both'`.
2. **`PUT` directo a MinIO** con esas URLs (firmadas con el `Content-Length` exacto de cada parte, vigencia
   `UPLOAD_URL_TTL_SECONDS`). El navegador usa `MINIO_PUBLIC_ENDPOINT`.
3. `POST /uploads/:uploadId/complete` (`UploadService.complete`): no confía en los ETags del cliente; por partes, lista
   las partes en MinIO y cierra el multipart; comprueba el tamaño real contra lo declarado y el plan, y el tipo real
   por firma de bytes; registra `archivo` + `version_archivo`, suma `usuario.espacio_usado` en la misma transacción y
   pasa la carga a `completada`. Es idempotente: repetirlo devuelve el mismo archivo. Un tamaño o tipo inválido rechaza
   la carga y borra lo subido.
4. `POST /uploads/:uploadId/resume`: para una carga activa devuelve las partes ya recibidas y URLs nuevas solo de las
   que faltan (o una URL nueva si es simple). Vencida ⇒ 410 `STORAGE_UPLOAD_EXPIRED`.
5. `DELETE /uploads/:uploadId` (204): cancela una carga activa (libera la reserva y borra lo subido). Ajena,
   inexistente o ya cerrada ⇒ 404.

Detalles del flujo: las URLs `PUT` firman el `Content-Length` exacto (MinIO rechaza otro tamaño); por encima del umbral
la carga es multipart con `UPLOAD_PART_SIZE_BYTES` por parte; en `complete`, `listParts` es la fuente de verdad, se mide
el tamaño real, el tipo se detecta por firmas de bytes (`MagicBytesDetector`) y el registro final es un compare-and-set.

**Descarga**: `POST /files/:fileId/download-url` devuelve una URL firmada de 300 s (`DOWNLOAD_URL_TTL_SECONDS`) para la
versión actual, con `Content-Disposition: attachment`, `application/octet-stream` y `no-store`.

`complete` y `expire`/`cancel` compiten por un compare-and-set de estado (`activa → …`): gana uno y el otro no deja un
`archivo` sin objeto.

**DF-59**: `storage` escribe **solo** `usuario.espacio_usado` (tabla de `identity`) y únicamente por `IQuotaRepository`;
es una excepción a «cada módulo es dueño de sus tablas», no una arista (`docs/sdd/design-findings.md`). La operación de
ambientes (rol dueño de las migraciones) está en `docs/operations/ambientes.md`.

## MinIO: CORS y red de seguridad (005, T-46)

- **CORS**: solo los orígenes de `web`. `compose.yml` pasa `CORS_ORIGIN` a `MINIO_API_CORS_ALLOW_ORIGIN` (nunca `*`);
  otros orígenes reciben `204` sin cabeceras `Access-Control-*`.
- **Multipart abandonados**: MinIO los limpia por su cuenta (`stale_uploads_expiry=24h`, revisión cada 6 h), es decir
  después del vencimiento de la carga. Es solo una red de seguridad; la limpieza real es `upload-cleanup`.
- Resultado completo del spike: `specs/005-carga-y-descarga/plan.md` §8.
