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

Otros módulos importan **solo** desde `modules/storage/index.ts`. Hoy exporta `StorageModule`, `StorageWorkerModule`, `I_PLAN_LIMITS_PROVIDER`,
`I_NODE_METADATA_READER` y los tipos `IPlanLimitsProvider`, `PlanLimits`, `INodeMetadataReader`, `FileMetadata` y
`FileMetadataPage`. No exporta `MagicBytesDetector`, `IExpiredUploadScanner`, el adaptador de
auditoría ni los repositorios. Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## API pública

`index.ts` exporta solo: `StorageModule` (API), `StorageWorkerModule` (`worker`), el token `I_PLAN_LIMITS_PROVIDER` y los
tipos `IPlanLimitsProvider` y `PlanLimits` y, desde 011 (PD-31), el token `I_NODE_METADATA_READER` y los tipos
`INodeMetadataReader`, `FileMetadata` y `FileMetadataPage` (metadatos de `archivo` para `backoffice`, sin contenido ni
versiones). `index.spec.ts` fija esa lista (`RUNTIME_EXPORTS`). `StorageModule` exporta solo `I_NODE_METADATA_READER`
(adaptador `SqlNodeMetadataReader`); `backoffice` importa el mismo `DynamicModule` que la raíz. No salen el detector de
tipos, `IExpiredUploadScanner`, el adaptador de auditoría ni los repositorios. Ni `StorageModule` ni
`StorageWorkerModule` enlazan `I_PLAN_LIMITS_PROVIDER` (DF-51): lo hace la raíz de composición (`AppModule`,
`WorkerModule`). Desde 012 (PD-121), `index.ts` y `StorageModule` exportan también `WritableAccountPolicy`: `sharing`
rechaza compartir desde una cuenta en solo lectura con la misma regla. Desde 013 (plan §2), exportan también la fachada
`LinkedFileGateway` (y el tipo `LinkedFile`, `{ id, name, sizeBytes }`): `findOwnedFile(actor, fileId)` resuelve con
`findOwnedLiveFile` (`ownedNodes`) el archivo propio y vivo de un enlace público de `sharing`; una carpeta, un archivo
ajeno, en la papelera o inexistente es `null`.

## Persistencia (005, PR-C)

Tablas (migraciones `20260930100000`…`100300`, plan §4): `archivo`, `version_archivo` y `carga`, con RLS `ENABLE` +
`FORCE`; `usuario.espacio_usado` es la única columna de otra tabla que `storage` escribe (D-5, DF-59).

| Puerto (`application/ports/`)                                                                            | Token                         | Implementación (`infrastructure/persistence/`) |
| -------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `INodeRepository`: `findAccessibleById`, `findTakenNames`, `insertWithVersion` (y los de carpetas, 006)  | `I_NODE_REPOSITORY`           | `TypeOrmNodeRepository`                        |
| `IUploadSessionRepository`: `insert`, `findOwned`, `transition` (compare-and-set)                        | `I_UPLOAD_SESSION_REPOSITORY` | `TypeOrmUploadSessionRepository`               |
| `IQuotaRepository`: `lockUsage`, `readUsage` (007), `lockAndReadUsage`, `addUsedBytes`                   | `I_QUOTA_REPOSITORY`          | `TypeOrmQuotaRepository`                       |
| `IExpiredUploadScanner`: `listExpiredIds(now, limit)` → `{ id, propietarioId }[]` (sin actor)            | `I_EXPIRED_UPLOAD_SCANNER`    | `SqlExpiredUploadScanner`                      |
| `INodeMetadataReader` (011, lo consume `backoffice`): `listForOwner(actor, ownerId, { page, pageSize })` | `I_NODE_METADATA_READER`      | `SqlNodeMetadataReader`                        |

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
grupo en la clave de `NodeOrder` (007): por defecto `creado_en DESC, id DESC`; `ORDER BY` y condición de teclado de
`node-order-sql.ts`; cursor opaco `[sort, dir, grupo, valor, id]` de `node-list-cursor.ts`, rechazado si es de otro
orden; la papelera conserva el suyo, `[tipo, eliminado_en, id]`, en `trash-cursor.ts`), `breadcrumbs`,
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

## Archivos en carpetas (006, T-04)

- `FileService.rename` y `FileService.move` (`PATCH /files/:fileId`, `POST /files/:fileId/move`) toman `lockUsage` y
  aplican la regla «(n)» de 005 en la carpeta del archivo o en el destino (`freeFileName`, compartida con las cargas):
  con `onConflict: 'ask'` un nombre ocupado es `409 STORAGE_NAME_CONFLICT` con `details.suggestedName`. Un destino
  ajeno, inexistente o en la papelera es `404`. El tamaño, las versiones y `espacio_usado` no cambian.
- `GET /files` y `FileService.list` se retiraron: el listado es `GET /folders/contents`.
- `POST /uploads` acepta `folderId` (`null` = raíz): `init` comprueba la carpeta tras bloquear el uso y evalúa el nombre
  en ella. `UploadRegistrar` la vuelve a comprobar con el mismo `lockUsage`: si pasó a la papelera durante la carga,
  CAS `activa → cancelada` (libera la reserva), `UploadService` purga lo subido y responde `404`
  (`upload.destination_gone`).
- Pruebas: `file.service.spec.ts`, `upload.service.spec.ts`, `test/int/storage/files-organize.int-spec.ts` y
  `uploads-folder.int-spec.ts`.

## Papelera (006, T-05)

- `TrashService` (`trashFile`, `trashFolder`, `list`, `summary`, `restoreFile`, `restoreFolder`) abre `withActor` y toma
  primero `lockUsage`, como `FolderService`. La fecha de purga se fija al eliminar con `trashRetentionDays` del plan
  vigente (`TrashState.start`). Eliminar no cambia `espacio_usado`: eso solo lo hace la purga (T-06).
- `ITrashRepository` → `TypeOrmTrashRepository`: las raíces de la papelera se leen y escriben con
  `ownedTrashedNodes(actor)` dentro de la consulta; lo vivo, con `accessibleNodes(actor)`. Eliminar una carpeta marca
  todo su subárbol vivo con la misma fecha y `eliminado_con_carpeta_id`; restaurarla devuelve solo eso (lo eliminado
  antes por separado sigue en la papelera). Tamaños como suma de `version_archivo.tamano_bytes` en `bigint`.
- Restaurar: a la carpeta original si sigue viva; si no, a la raíz (`moved_to_root`); con «nombre (n)» si el nombre
  está ocupado (`renamed`; si además va a la raíz, gana `moved_to_root`). Una carpeta que superaría `FOLDER_MAX_DEPTH`
  responde `422`. La carpeta se lee sin `Folder.rehydrate` (`TrashedFolder.storedPath`): tras R-5 su ruta guardada
  conserva ancestros purgados; al volver se rehace la ruta y se reubica el subárbol (`rebaseSubtree` de `node-sql.ts`).
- Auditoría `node.trashed` y `node.restored` con `nodeType`, `itemCount` y `sizeBytes`, sin nombres.
- Rutas (`TrashController`, solo `CLIENT`): `DELETE /files/:fileId`, `DELETE /folders/:folderId`, `GET /trash`,
  `GET /trash/summary`, `POST /trash/files/:fileId/restore` y `POST /trash/folders/:folderId/restore`.
- Pruebas: `trash.service.spec.ts`, `trash.controller.spec.ts` y `test/int/storage/trash.int-spec.ts`.

## Purga de la papelera (006, T-06)

- `TrashPurger` es el único que borra: por raíz, en un `withActor` con `lockUsage` primero, toma de
  `ITrashRepository.purgeTargets` los archivos (claves de todas sus versiones y su suma), y por archivo hace
  `purgeObject` de cada clave → `deleteFileRows` (las versiones caen por `CASCADE`) → `addUsedBytes(-bytes)`. Si un
  objeto falla, ese archivo no cambia y la carpeta no se borra (`trash.purge_failed` con `nodeId` y `errorName`);
  quien llama lanza `TrashPurgeIncompleteError` para reintentar (CA-20). Las carpetas se borran al final con
  `deleteFolderRows`, en un solo `DELETE`; lo eliminado aparte debajo queda en la raíz por `SET NULL` (R-5).
- `TrashService.purge` («Eliminar definitivamente», síncrono, `DELETE /trash/{files|folders}/:id` → `{ freedBytes }`);
  `TrashService.empty` («Vaciar», `DELETE /trash` → `202 { scheduledItems, pendingBytes }`): adelanta `purgar_en` a
  «ahora» en las raíces y encola con `ITrashPurgeQueue` (`TrashPurgeQueue`, mejor esfuerzo: si Redis falla, el ciclo
  programado lo recoge). `TrashService.purgeExpired` (worker) vuelve a comprobar `purgar_en <= now`.
- Worker: cola `trash-purge` (trabajo `purge`), `TrashPurgeScheduler` (`upsertJobScheduler`, id fijo, cada
  `TRASH_PURGE_INTERVAL_MINUTES`, 3 intentos exponenciales) y `TrashPurgeProcessor` (concurrencia 1) en dos fases como
  la limpieza de cargas: `IExpiredTrashScanner` (`papelera_vencida`, sin actor, `TRASH_PURGE_BATCH_SIZE`) y
  `purgeExpired` como el dueño. No mira el estado de la cuenta (CA-19). Bitácoras `trash.purge_scheduled`,
  `trash.purge_run` (`scanned`, `purged`, `failed`) y `trash.purge_item_failed`. El `api` registra la cola solo para
  encolar.
- Auditoría `node.purged` (`trigger: manual|scheduled`) y `trash.emptied` (`itemCount`, `sizeBytes`), sin nombres.
- `TRASH_LIFECYCLE_PROVIDERS` (`upload-lifecycle.providers.ts`) los comparten `StorageModule` y `StorageWorkerModule`;
  en el `worker`, `FOLDER_CONFIG` lanza al leerse, como `UPLOAD_CONFIG`.
- Pruebas: `trash-purger.spec.ts`, `trash-purge.{scheduler,queue,processor}.spec.ts` y
  `test/int/storage/trash-purge.int-spec.ts` (MinIO real, fallo simulado y reintento de BullMQ).

## Accesos rápidos: datos (006, T-13)

- Tabla `acceso_rapido` (migración `20261003100000`, plan §9.2, DF-63): una fila por cuenta (`usuario_id`, quien fija
  o abre, no el dueño del nodo) y nodo, con `archivo_id` **o** `carpeta_id` (`ck_acceso_un_nodo`, ADR-0011) y las marcas
  `fijado_en` (fijado ⇔ no nulo) y `abierto_en`; sin ninguna, no hay fila (`ck_acceso_util`). Unicidades
  `uq_acceso_archivo` / `uq_acceso_carpeta` por (nodo, cuenta); índices `idx_acceso_fijados` e `idx_acceso_recientes`.
- Las FK de nodo son `ON DELETE CASCADE`: la purga borra los accesos sin que la papelera los conozca; eliminar a la
  papelera es un `UPDATE` y las marcas siguen al restaurar. `usuario_id` no es en cascada.
- RLS `acceso_rapido_cliente` (`ENABLE` + `FORCE`), como `archivo_cliente`; sin política para roles internos.
- Configuración: `QUICK_ACCESS_MAX_PINNED` (5) y `QUICK_ACCESS_RECENT_VISIBLE` (3), 1–20, en `QuickAccessConfig`;
  `RECENTS_STORED` (25) es constante. Tope: `QuickAccessLimitError` (`422 STORAGE_QUICK_ACCESS_LIMIT`,
  `details.maxPinned`).
- Pruebas: `test/int/storage/quick-access-migrations.int-spec.ts` (restricciones, `CASCADE`, RLS, `EXPLAIN` de los
  listados unidos a `accessibleNodes`, `revert` ×3).

## Accesos rápidos: API (006, T-14)

- Rutas (`QuickAccessController`, solo `CLIENT`; internos `403`, sin token `401`): `GET /quick-access`,
  `PUT`/`DELETE /quick-access/pins/:nodeType/:nodeId` y `POST /quick-access/recents/:nodeType/:nodeId` (sin cuerpo,
  `204`). `:nodeType` ∈ `files|folders` (`NodeTypePipe`); otro valor o id no UUID es el mismo `404
STORAGE_NODE_NOT_FOUND` que un nodo ajeno, inexistente o en la papelera.
- `QuickAccessService`: solo `pin` toma `lockUsage(actor)`; `PUT` sobre un fijado responde `200` sin mirar el tope ni
  cambiar `fijado_en`; `countPinned` cuenta solo fijados visibles. El listado pide `maxPinned` fijados (R-10: los más
  recientes) y `recentVisible + 1` recientes para `hasMoreRecent`; los recientes excluyen los fijados.
- `TypeOrmQuickAccessRepository`: lecturas y escrituras unen `accessibleNodes(actor)` (por `tipo_nodo` y la FK); las
  escrituras son `INSERT … SELECT` desde el nodo visible con `ON CONFLICT ON CONSTRAINT uq_acceso_*`. Quitar un
  fijado nunca abierto borra la fila. `pruneRecents` filtra por `usuario_id` (las filas son de la cuenta) y conserva
  `RECENTS_STORED`, incluidas las de nodos en la papelera.
- Sin auditoría ni bitácoras propias (sin nombres). Pruebas: `quick-access.service.spec.ts`,
  `quick-access.controller.spec.ts` y `test/int/storage/quick-access.int-spec.ts`.

## Resumen de espacio (007, T-03)

- `GET /storage/summary` (`SpaceController`, solo `CLIENT`) → `SpaceSummaryService.summary(actor)`: los límites de
  `IPlanLimitsProvider` fuera de la transacción y, en `withActor`, `IQuotaRepository.readUsage` (contador y reserva
  **sin** `FOR UPDATE`, D-1) más `SpaceMeasurer.measure`. Disponible = `QuotaPolicy.available` (cuota − usado −
  reservado, nunca negativo). Leerlo no se audita ni deja bitácora.
- `SpaceMeasurer.measure(actor)` corre dentro de la `withActor` del llamador: `ISpaceRepository.liveBytesByKind`
  (`TypeOrmSpaceRepository`: versiones de archivos vivos con `accessibleNodes(actor)` dentro de la consulta **y**
  `propietario_id = actor.id`, agrupadas por `tipo`) + `ITrashRepository.trashSummary` (raíces: una carpeta pesa lo que
  arrastró) en un `SpaceBreakdown`. La reutiliza la conciliación (T-05).
- `FILE_BYTES_SQL` y `selectRows` (parámetros con nombre) viven en `node-sql.ts` y los comparten papelera y espacio.
  Toda suma de versiones filtra con `COUNTED_VERSION_SQL`: un original conservado (014b) no cuenta en el espacio.
- Pruebas: `space-measurer.spec.ts`, `space-summary.service.spec.ts`, `space.controller.spec.ts`,
  `storage-routes.contract.spec.ts` y `test/int/storage/space-summary.int-spec.ts`.

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
| `FileService`                              | Ficha (012), renombrar y mover archivos (006) y URL de descarga de 300 s                           |
| `FolderService` (006)                      | Crear, renombrar, mover y abrir carpetas, con migas                                                |
| `TrashService` (006)                       | Mandar a la papelera, listar, resumir y restaurar                                                  |
| `IObjectStorage` → `MinioStorageAdapter`   | Multipart, URLs prefirmadas (`Content-Length` firmado), `headObject`, `getRange`, copia, purga     |
| `IFileTypeDetector` → `MagicBytesDetector` | Tipo real por firma; rechaza ejecutables y texto disfrazado                                        |

Rutas (solo `CLIENT`; roles internos → 403, sin token → 401; un id que no es UUID responde el mismo 404 que uno
inexistente): `POST /uploads`, `POST /uploads/:uploadId/resume`, `POST /uploads/:uploadId/complete`,
`DELETE /uploads/:uploadId`, `POST /files/:fileId/download-url` (y desde 006 `PATCH /files/:fileId` y
`POST /files/:fileId/move`; desde 014 `GET /files/:fileId/versions`,
`POST /files/:fileId/versions/:versionId/download-url` y `POST /files/:fileId/versions/:versionId/restore`; desde 012
`GET /files/:fileId`). `init`, las
dos `download-url` y `restore` (con su propio `RATE_LIMIT_VERSION_RESTORE_PER_MINUTE`) pasan por `IRateLimiter`.

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
versión actual, con `Content-Disposition: attachment`, `application/octet-stream` y `no-store`. Desde 014,
`POST /files/:fileId/versions/:versionId/download-url` firma una versión retenida por la misma ruta de
`FileService.getDownloadUrl` (tasa, auditoría `file.download_url_issued` con el tamaño de la versión); una versión
inexistente, podada o de otro archivo es `404` `STORAGE_VERSION_NOT_FOUND`. `GET /files/:fileId/versions`
(`VersionHistoryService`) devuelve el archivo (`name`, `kind`, `folderId`), el historial sin claves de objeto y las
versiones que retiene el plan.

**Restaurar (014)**: `POST /files/:fileId/versions/:versionId/restore` (`VersionRestoreService`, 201) valida tasa,
archivo, versión (`404` si no es del archivo, `409` `STORAGE_VERSION_ALREADY_CURRENT` si es la actual) y cuota (sin
máximo por archivo); copia el objeto en el servidor (`IObjectStorage.copyObject`) fuera de la transacción y luego,
bajo `lockUsage`, revalida y registra una versión nueva `restauracion` con `FileVersionService.register`. Si el
origen ya no existe al copiar (`copyObject` devuelve `false` porque una poda llegó antes), revalida y responde `404`
`STORAGE_VERSION_NOT_FOUND`. Si esa transacción falla, purga la copia. Tras el commit poda por retención y audita `file.version_restored`.

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

## Lo compartido (012, T-03 y T-04)

- `accessibleNodes(actor)` suma lo compartido con el actor (012 T-02), así que **solo las lecturas** lo usan:
  `findAccessibleById` (ficha y descarga de la versión vigente), `findAccessibleFolder`, `listContents` dentro de una
  carpeta, `breadcrumbs` (solo antepasados accesibles: en lo compartido las migas empiezan en la carpeta compartida),
  las fachadas de edición e indexación y los accesos rápidos.
- Toda escritura, todo destino y todo lo que solo hace el propietario usan `ownedNodes(actor)`: `findOwnedLiveFile`
  (renombrar, mover, eliminar, reemplazar, historial, restaurar y descargar una versión retenida), `findOwnedFolder`
  (destino de crear, subir, mover y restaurar), `findLiveFileByName`, `findTakenNames`, `findTakenFolderNames`,
  `maxSubtreeDepth`, los `UPDATE` de nombre y carpeta, la papelera (`TypeOrmTrashRepository`) y la poda de originales.
  `listContents` de la raíz también es solo lo propio (012 R-2). Un nodo compartido responde como inexistente (`404`,
  012 CA-14).
- `GET /folders/contents` responde `accessLevel` (`OWNER`, `EDITOR` o `VIEWER`): el nivel del actor sobre la carpeta
  abierta según `PermissionResolver.levelFor` de `access` (en la raíz, `OWNER`). La web lo usa solo para ocultar
  acciones (012b RN-1). Lo compartido no cuenta en el espacio ni en la cuota del destinatario (`propietario_id`).
- `GET /files/:fileId` es la ficha del archivo (012 CA-12): `{ file: FileSummary, accessLevel }`, con
  `FileService.getDetail` (`findAccessibleById` y `levelFor`). La abren el propietario y el destinatario; el historial
  (`GET /files/:fileId/versions`) sigue siendo solo del propietario (CA-14). No se audita.
- Pruebas: `test/isolation/storage-shared-writes.iso-spec.ts` recorre todas las rutas de escritura como Lector y Editor;
  `test/int/storage/shared-access.int-spec.ts`, lo que el destinatario abre.
