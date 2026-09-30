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

- Todo método recibe `actor` y toma el `EntityManager` de `TransactionContext.requireActorScope(actor)`: se llama
  dentro de `ITransactionRunner.withActor(actor, …)` o lanza `ActorScopeMissingError`.
- Las lecturas de `archivo` unen `accessibleNodes(actor)` de `access` en la misma consulta (ADR-0005); la RLS es la
  segunda barrera. Los roles internos reciben siempre el conjunto vacío.
- Bytes en `bigint` de punta a punta (`BIGINT_TRANSFORMER` de `shared`; propiedades `*Bytes`).
- `listAccessible` pagina con un cursor opaco (`creado_en DESC, id DESC`); un cursor ajeno es `InvalidQueryError`.
- `findTakenNames(actor, name)` devuelve el nombre y sus copias «base (n).ext» ocupados (sin distinguir mayúsculas,
  sin papelera) para `FileName.firstFree`.
- Las cargas vencidas de todos los propietarios **no** se leen por estos puertos: eso es `IExpiredUploadScanner`
  (`carga_expiradas`, ADR-0021), que llega con PR-E.
- Pruebas: `apps/api/test/int/storage/*.int-spec.ts` y `apps/api/test/int/access/accessible-nodes.int-spec.ts`
  (Testcontainers; `pnpm test:int`).

## API pública (`index.ts`, 005 PR-D)

| Exportación                                                   | Para qué                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `StorageModule` (`forRoot(env)`)                              | La raíz de composición (`AppModule`) lo monta con las variables de `StorageEnv`              |
| `I_PLAN_LIMITS_PROVIDER`, `IPlanLimitsProvider`, `PlanLimits` | Puerto que `billing` implementará (DF-51, opción A); hoy lo enlaza `PlanLimitsBindingModule` |

Nada de `infrastructure/**` sale: ni el adaptador de MinIO, ni el detector de tipos, ni los repositorios, ni (con
PR-E) `IExpiredUploadScanner`. `index.spec.ts` fija el conjunto exacto. `StorageWorkerModule` se agrega al índice con
PR-E (T-51).

## Aplicación, infraestructura y rutas (005, PR-D)

| Pieza                                      | Rol                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `UploadService`                            | `init` (reserva de cuota y URLs prefirmadas), `resume`, `complete`, `cancel`, `expire`             |
| `UploadRegistrar`                          | Paso final de `complete`: CAS `activa → completada`, nombre definitivo, `archivo` + versión, cuota |
| `QuotaService`                             | Máximo por archivo y cuota total con reservas de cargas activas (`QuotaPolicy`)                    |
| `FileService`                              | Listado paginado y URL de descarga de 300 s                                                        |
| `IObjectStorage` → `MinioStorageAdapter`   | Multipart, URLs prefirmadas (`Content-Length` firmado), `headObject`, `getRange`, purga real       |
| `IFileTypeDetector` → `MagicBytesDetector` | Tipo real por firma; rechaza ejecutables y texto disfrazado                                        |

Rutas (solo `CLIENT`; roles internos → 403, sin token → 401; un id que no es UUID responde el mismo 404 que uno
inexistente): `POST /uploads`, `POST /uploads/:uploadId/resume`, `POST /uploads/:uploadId/complete`,
`DELETE /uploads/:uploadId`, `GET /files`, `POST /files/:fileId/download-url`. `init` y `download-url` pasan por
`IRateLimiter`.

- Pruebas HTTP: `apps/api/test/int/storage/*.int-spec.ts` (`pnpm test:int`); aislamiento:
  `apps/api/test/isolation/storage.iso-spec.ts` (`pnpm test:isolation`).
