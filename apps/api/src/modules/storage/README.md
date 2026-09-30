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
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ storage.module.ts # lo crea la primera spec del módulo
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/storage/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## Persistencia (005, PR-C)

Tablas (migraciones `20260930100000`…`100300`, plan §4): `archivo`, `version_archivo` y `carga`, con RLS `ENABLE` +
`FORCE`; `usuario.espacio_usado` es la única columna de otra tabla que `storage` escribe (D-5, DF-59).

| Puerto (`application/ports/`)                                                                    | Token                         | Implementación (`infrastructure/persistence/`) |
| ------------------------------------------------------------------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `INodeRepository`: `findAccessibleById`, `listAccessible`, `findTakenNames`, `insertWithVersion` | `I_NODE_REPOSITORY`           | `TypeOrmNodeRepository`                        |
| `IUploadSessionRepository`: `insert`, `findOwned`, `transition` (compare-and-set)                | `I_UPLOAD_SESSION_REPOSITORY` | `TypeOrmUploadSessionRepository`               |
| `IQuotaRepository`: `lockUsage`, `lockAndReadUsage`, `addUsedBytes`                              | `I_QUOTA_REPOSITORY`          | `TypeOrmQuotaRepository`                       |
| `IExpiredUploadScanner`: `listExpiredIds(now, limit)` → `{ id, propietarioId }[]` (sin actor)    | `I_EXPIRED_UPLOAD_SCANNER`    | `SqlExpiredUploadScanner`                      |

- Todo método recibe `actor` y toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`: se llama
  dentro de `ITransactionRunner.withActor(actor, …)` o lanza `ActorScopeMissingError`.
- Las lecturas de `archivo` unen `accessibleNodes(actor)` de `access` en la misma consulta (ADR-0005); la RLS es la
  segunda barrera. Los roles internos reciben siempre el conjunto vacío.
- Bytes en `bigint` de punta a punta (`BIGINT_TRANSFORMER` de `shared`; propiedades `*Bytes`).
- `listAccessible` pagina con un cursor opaco (`creado_en DESC, id DESC`); un cursor ajeno es `InvalidQueryError`.
- `findTakenNames(actor, name)` devuelve el nombre y sus copias «base (n).ext» ocupados (sin distinguir mayúsculas,
  sin papelera) para `FileName.firstFree`.
- Las cargas vencidas de todos los propietarios **no** se leen por los puertos con actor: eso es
  `IExpiredUploadScanner`, que llama a `carga_expiradas` (ADR-0021) dentro de `ITransactionRunner.run`. Es el único
  acceso sin actor: solo lo inyecta `UploadCleanupProcessor` y no sale de `storage/index.ts`.
- Pruebas: `apps/api/test/int/storage/*.int-spec.ts` y `apps/api/test/int/access/accessible-nodes.int-spec.ts`
  (Testcontainers; `pnpm test:int`).

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
