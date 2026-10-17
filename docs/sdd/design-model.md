# Modelo de diseño — versión textual de los diagramas

> Fuente visual: `docs/design/diagramas/` (Arquitectura, Clases, E-R).
> Este archivo es la versión que los agentes leen rápido. **Si el código o una spec se aparta de los diagramas,
> se actualiza el diagrama, este archivo y el hallazgo en `design-findings.md` en el mismo PR**: los diagramas son
> entregables del Documento de Diseño y el docente los compara con el sistema.

## 1. Convención de estereotipos (leyenda de los diagramas de clases)

| Color / estereotipo | Significado | Sufijo de archivo NestJS | Capa |
|---|---|---|---|
| naranja `«controller»` | Controlador HTTP | `*.controller.ts` | presentation |
| azul `«service»` | Servicio de aplicación | `*.service.ts` | application |
| azul `«job»` | Tarea programada (`@Cron`) | `*.job.ts` | application (corre en worker) |
| azul `«processor»` | Procesador de cola BullMQ | `*.processor.ts` | infrastructure (corre en worker) |
| azul `«gateway»` | Gateway Socket.IO | `*.gateway.ts` | presentation |
| azul `«guard»` | Guard de NestJS | `*.guard.ts` | presentation |
| morado `«interface»` | Puerto (prefijo `I`) | `*.port.ts` | application/domain |
| amarillo `«abstract»` | Clase abstracta | nombre del concepto | domain o application |
| verde (sin estereotipo) | Implementación / adaptador | `*.adapter.ts` o nombre de la clase | infrastructure |
| turquesa `«entity»` | Entidad de dominio | `*.entity.ts` (dominio) + `*.orm-entity.ts` (TypeORM) | domain / infrastructure |
| turquesa `«value object»` | Objeto de valor inmutable | `*.vo.ts` | domain |
| rosa `«enumeration»` | Enumeración | `*.enum.ts` | domain |
| gris | Clase de otro módulo (solo referencia) | — | — |

## 2. Módulos (8 de los diagramas + transversales)

| # | Diagrama | Módulo NestJS | Dueño sugerido | RF |
|---|---|---|---|---|
| M1 | Identidad y Acceso | `identity` | Juan Marcos | 01–04 |
| M2 | Motor de Almacenamiento | `storage` | Abel | 08–15, 27 |
| M3a | Compartición y Control de Acceso (lectura de permisos) | `access` | Adrián | 05, 16–18, 33 |
| M3b | Compartición y Control de Acceso (comparticiones y enlaces) | `sharing` | Fátima | 16–18 |
| M4 | Suscripciones y Pago | `billing` | Juan Marcos | 19–24, 34 (contador) |
| M5 | Edición Colaborativa .docx e Historial con Autoría | `editing` | Fátima | 25, 26, 28, 29 |
| M6 | Inteligencia Documental | `intelligence` | Fátima | 15 (contenido), 30–34 |
| M7 | Optimizador de Almacenamiento | `optimizer` | Abel | 35, 36 |
| M8 | Administración, Soporte y Operación | `backoffice` | Adrián | 06, 37 |
| T1 | (transversal; recibe de M8 la salud, DF-49, y `RolesGuard`, DF-50) | `shared` | Adrián | `Actor`, `IClock`, errores, logger, `correlationId`, entorno, salud, guards globales (003) |
| T2 | (transversal, extraído de M8) | `audit` | Adrián | 07 |
| T3 | (transversal) | `realtime` | Fátima | 26, 32 (streaming); 08 (progreso) solo si 015 lo difunde (DF-58: en 005 es local del cliente) |
| T4 | (transversal) | `notifications` | Juan Marcos | declara e implementa `IMailer` e `INotifier` |

M3 se divide en `access` y `sharing`, y `audit`/`realtime`/`notifications` salen como transversales, para evitar
ciclos de dependencia (ver DF-02, DF-03, DF-30, DF-34). Decidido en ADR-0010 (aceptado el 26/09/2026); falta redibujar los diagramas.

## 3. Clases por módulo

Todo método de servicio que actúa sobre datos de un usuario recibe `actor: Actor` como primer parámetro (DF-01,
spec 003 D-9). Los diagramas de clases todavía no lo muestran en las firmas.

«Puertos que consume» lista los puertos que un módulo de negocio importa desde el `index.ts` del transversal que los
declara y los implementa. El módulo de negocio no los declara (ADR-0010, `architecture.md` §3, regla 5).

### M1 `identity`
- Controladores: `AuthController` (register, verifyEmail, resendVerification, login, refresh, forgotPassword, resetPassword; `resendVerification` es nuevo, plan 001, DF-54); `SessionsController` (listar y revocar sesiones, RF-04; DF-15 parcial, spec 002 D-8); con 011, `AccountSetupController` (`POST /auth/account-setup/check` y `POST /auth/account-setup`, primera contraseña de una cuenta interna, `@Public()` y `no-store`).
- Servicios:
  - `RegistrationService` (register, resendVerification, verifyEmail), separado de `AuthService` por SRP (plan 001 DT-1, DF-54). Sus colaboradores: `VerificationLinkIssuer`, que invalida los enlaces vigentes y emite uno nuevo (lo reutiliza 002 D-15), y `RegistrationAttemptNotifier`, que envía el aviso de intento de registro (001 D-17);
  - `AuthService` (login, refresh, logout, recuperación; 002) y `SessionService`;
  - con 011, fachadas que consume `backoffice` (clases sin interfaz, Art. V.2; DF-04, DF-65): `AccountDirectory` (`list`, `get`, `findClientByEmail`, `statistics`), `AccountAdministration` (`lockAdminRoster`, `assertActorActive`, `suspend`, `reactivate`) e `InternalAccountEnrollment` (`enroll`, `enrollInitialAdmin`), que delega el enlace «Crear tu contraseña» en `AccountSetupLinkIssuer` (con la forma de `VerificationLinkIssuer`); `AccountSetupService` (`checkLink`, `setFirstPassword`).
- Guard: `IdentityIpThrottlerGuard`, subclase de `ThrottlerGuard` para el límite por IP del registro y del reenvío (001 D-8, D-15, ADR-0017).
- Puertos → implementaciones:
  - `IPasswordHasher` → `Argon2idHasher` (`argon2`, ADR-0017);
  - `ITokenService` → `JwtTokenService`;
  - `IUserRepository`, `IVerificationTokenRepository` (nuevo, DF-54) e `ISessionRepository` → TypeORM;
  - con 011: `IAdminRosterRepository` (padrón interno: alta, estado, conteo de Administradores activos y candado `pg_advisory_xact_lock`; toma de `IUserRepository` solo `findByIdForUpdate` y `findByEmail`, ISP) → `TypeormUserRepository` (`useExisting`, el mismo adaptador); `IAccountDirectoryRepository` (modelo de lectura paginado) → `TypeOrmAccountDirectoryRepository`;
  - `IAccountEventsPublisher` (nuevo, DF-54) → `EventEmitterAccountEventsPublisher` (ADR-0019).
  - Implementa hacia fuera el puerto token→`Actor` que declara T1 `shared` (002 D-14).
- Puertos que consume: `IMailer` (lo declara e implementa T4 `notifications`); `IRateLimiter`, `ITransactionRunner` e `IClock` (T1 `shared`; el límite por correo es de 001 D-15).
- Dominio:
  - `User` (abstracta) ← `ClientUser` (sin `subscriptionId`: la relación vive solo en `suscripcion.usuario_id`, DF-35), `InternalUser`;
  - `Session`; `Device` (DF-11, spec 002 D-4);
  - `VerificationToken` (`issue`, `stateAt(now)`, `isValid`, `consume`, `invalidate`; DF-53);
  - objetos de valor `EmailAddress`, `OpaqueToken`, `PasswordHash` y `LegalAcceptance` (DF-54); con 011, `EmployeeCode` (DF-33);
  - `AccountStatus` = `ACTIVE | SUSPENDED`; `Role` = `CLIENT | ADMIN | SUPPORT | OPERATOR` (vive en `shared`).
- Eventos que publica (ADR-0019): `identity.client-account-verified` (`ClientAccountVerifiedEvent { userId }`), después del commit y una vez por cuenta. Lo exporta `index.ts` y lo consume `billing` en la 009 (PD-40); la 006a no lo escucha.
- Patrones: Herencia de tabla única para `User`; Strategy implícita en hasher/tokens.
- Tablas:
  - `usuario`: `rol` con `CHECK`, sin tabla `rol` (DF-13); `correo_verificado`, `version_terminos`, `version_privacidad` y `terminos_aceptados_en` (DF-33 parcial, 001 D-14);
  - `token_cuenta`: `usuario_id`, `invalidado_en` y `creado_en`, con un solo enlace vigente por cuenta y tipo (DF-53); con 011, `tipo = 'alta_interna'` y `usuario.codigo_empleado` (DF-33);
  - `dispositivo` y `sesion` (002).

### M2 `storage`
- Controladores:
  - `FilesController` (con 006: renombrar, mover, `download-url`) y, con 005, `UploadsController` (init, resume, complete, cancel; SRP; `uploadPart` desaparece porque los bytes no pasan por la API, DF-16);
  - con 006 (DF-61): `FoldersController` (`GET /folders/contents`, crear, renombrar, mover; reemplaza `FilesController.list`) y `TrashController` (eliminar a la papelera, listar, resumen, restaurar, eliminar definitivamente, vaciar);
  - con 006 §9 (DF-63): `QuickAccessController` (`GET /quick-access`, `PUT`/`DELETE /quick-access/pins/:nodeType/:nodeId`, `POST /quick-access/recents/:nodeType/:nodeId`; `:nodeType` ∈ `files|folders`; `@Roles(Role.CLIENT)`).
  - con 007 (DF-62): `SpaceController` (`GET /storage/summary`, `@Roles(Role.CLIENT)`).
  - con 014 (DF-68): `FileVersionsController` (`GET /files/:fileId/versions`, `POST …/versions/:versionId/restore` y `…/download-url`, `@Roles(Role.CLIENT)`).
  - Faltan búsqueda y vista previa → DF-15.
- Servicios (todos con `actor: Actor` primero):
  - `FileService` (`getDownloadUrl`, renombrar, mover), `UploadService` (`init`, `resume`, `complete`, `cancel`, `expire`), `QuotaService` (`assertCanUpload`);
  - con 006 (DF-61): `FolderService` (`create`, `rename`, `move`, `contents`), `TrashService` (eliminar, listar, restaurar, purgar, vaciar; el `trash` del diagrama sale de `FileService` por SRP) y `TrashPurger` (borrado definitivo de objetos, filas y `espacio_usado` en una transacción con `lockUsage` primero);
  - con 006 §9 (DF-63): `QuickAccessService` (`list`, `pin`, `unpin`, `recordOpen`; solo `pin` toma `IQuotaRepository.lockUsage` y comprueba el tope). Configuración `QUICK_ACCESS_CONFIG` = `{ maxPinned, recentVisible }` desde `QUICK_ACCESS_MAX_PINNED` (5) y `QUICK_ACCESS_RECENT_VISIBLE` (3, decisión de Adrián del 2026-10-03) y la constante `RECENTS_STORED = 25` (colchón de poda, no configuración).
  - con 007 (DF-62): `SpaceSummaryService` (`summary`), `SpaceMeasurer` (`measure`, compartido por el resumen y la conciliación) y `UsageReconciler` (`reconcile`).
  - con 014 (DF-68; `storage` es el dueño del ciclo de vida de versiones, DF-17, ADR-0012): `FileVersionService` (`register` en la transacción del llamador bajo `lockUsage`, con `buildVersion(number)` que decide el origen; `afterCommit` dispara la poda), `VersionPruner` (`prune`: una versión por transacción, nunca lanza), `VersionHistoryService` (`list`) y `VersionRestoreService` (`restore`). Se registran en `UPLOAD_LIFECYCLE_PROVIDERS` (api y worker).
  - Trabajos (worker): `UploadCleanupProcessor` y `UploadCleanupScheduler` (cola `upload-cleanup`); con 006, `TrashPurgeScheduler` y `TrashPurgeProcessor` (cola `trash-purge`, repetible con `upsertJobScheduler`, `concurrency: 1`).
  - con 007 (DF-62): `UsageReconcileProcessor` y `UsageReconcileScheduler` (cola `usage-reconcile`).
- Puertos → implementaciones:
  - `IObjectStorage` → `MinioStorageAdapter` (con 005: `createMultipart`, `presignUploadPart`, `presignUploadObject`, `listParts`, `completeMultipart`, `abortMultipart`, `headObject`, `getRange`, `purgeObject`, `presignDownload`); `IFileTypeDetector` → `MagicBytesDetector`;
  - `INodeRepository` → TypeORM (archivos y, con 006, carpetas);
  - `IPlanLimitsProvider` → lo **declara** `storage` con `PlanLimits` e `I_PLAN_LIMITS_PROVIDER` (`application/plan-limits.ts`, exportados por `storage/index.ts`) y lo implementa `billing` (DF-51, opción A; `storage` no importa `billing`); con 006, `PlanLimits.trashRetentionDays`;
  - repositorios de 005: `IUploadSessionRepository`, `IQuotaRepository` (único punto que escribe `usuario.espacio_usado`: DF-59) e `IExpiredUploadScanner` (acceso sin actor de la limpieza, ADR-0021);
  - repositorios de 006 (internos, DF-61): `ITrashRepository` (incluye `schedulePurgeOfAll`), `IExpiredTrashScanner` (único acceso sin actor de la purga, función `papelera_vencida`) e `ITrashPurgeQueue` → `TrashPurgeQueue`;
  - repositorio de 006 §9 (interno, DF-63): `IQuickAccessRepository` → `TypeOrmQuickAccessRepository` (`list`, `countPinned`, `findAccessibleNode`, `upsertPin`, `removePin`, `touchRecent`, `pruneRecents`). Toda lectura y escritura une `accessibleNodes(actor)` dentro de la consulta. No hay puerto entre módulos.
  - con 007 (internos, DF-62): `ISpaceRepository` → `TypeOrmSpaceRepository` (bytes vivos propios por tipo), `IClientAccountScanner` → `SqlClientAccountScanner` (solo ids de cuentas de cliente; único acceso sin actor de la conciliación) e `IQuotaRepository.readUsage` (sin bloqueo).
  - con 014 (interno, DF-68): `IVersionRepository` → `TypeOrmVersionRepository` (`list` por `numero DESC`, `nextNumber` = `MAX + 1`, `insert`, `delete`; `find` con la lectura y la restauración; todo con `requireActorScope`); `INodeRepository.updateCurrentVersion` y `findLiveFileByName`; `IObjectStorage.copyObject`; `PlanLimits.retainedVersions`.
  - con 011 (entre módulos, PD-31): `INodeMetadataReader` (`application/ports/i-node-metadata-reader.port.ts`; `listForOwner(actor, ownerId, FileMetadataPageRequest)`) → `SqlNodeMetadataReader`: lo declara e implementa `storage` y lo consume `backoffice`; solo columnas de `archivo`, dentro de `withActor` y con RLS.
- Puertos que consume: `IAuditLogger` (lo declara T2 `audit`); `IRateLimiter` (T1 `shared`).
- Dominio:
  - `StorageNode` ← `Folder`, `File` (**Composite**). Con 006 es una unión `File | Folder` y no una clase abstracta: no hay comportamiento común que heredar (DF-61);
  - `FileVersion` (composición 1..* de `File`; `DocumentVersion` no hereda de él, ADR-0012); `UploadSession` (máquina `activa → completada | rechazada | cancelada | expirada`);
  - con 005: `FileName` (VO), `FileKind` + catálogo extensión → tipo/MIME, `ObjectKey` y `QuotaPolicy` (puro);
  - con 006: `FolderName` (VO), `FolderPath` y `TrashState`;
  - con 006 §9: `QuickAccessItem` (modelo de lectura: `type`, `id`, `name`, `kind?`), `QuickAccessList` (`pinned`, `recent`, `hasMoreRecent`) y `QuickAccessLimitError` (422, `STORAGE_QUICK_ACCESS_LIMIT`, `details.maxPinned`).
  - con 007: `FileCategory`, `SpaceBreakdown`, `NodeOrder` y `QuotaPolicy.available`.
  - con 014: `FileVersion` con `number` y `restoredFromNumber` y las fábricas `fromUpload`, `fromRestoration` y `forOrigin`; `VersionRetention` (puro), `VersionHistory`/`VersionEntry` (lectura), `File.withCurrentVersion`, `ObjectKey.parse`, `VersionNotFoundError` y `VersionAlreadyCurrentError`.
- Tablas: `carpeta`, `archivo`, `version_archivo`, `carga` y, con 006 §9, `acceso_rapido`. Con 005: `archivo`, `version_archivo` y `carga` con RLS (`ENABLE` + `FORCE`); función de mantenimiento `carga_expiradas` (ADR-0021). Con 006: RLS en `carpeta` y función `papelera_vencida`. Con 006 §9: RLS de cliente en `acceso_rapido`, sin política para roles internos ni de mantenimiento. `storage` además escribe la columna `usuario.espacio_usado` (excepción DF-59). Desde 007, `storage` lee `usuario.id` y `rol` para listar cuentas en la conciliación (extensión de DF-59, DF-62).

### M3a `access`
- Servicio: `PermissionResolver` (levelFor, can, inheritedGrants) + `accessibleNodes(actor)`, constructor de la consulta de nodos accesibles (DF-32, spec 003 D-1: 003 entrega la firma; la consulta se completa con 005 y 012).
- Puertos → implementaciones: `IAccessPolicy` → `OwnerPolicy`, `EditorPolicy`, `ViewerPolicy` (**Strategy**); `IGrantRepository`.
- Dominio: `AccessLevel` = `OWNER | EDITOR | VIEWER`; `Action`.
- Tablas que lee: `archivo`, `carpeta`, `comparticion` (modelo de lectura).

### M3b `sharing`
- Controlador: `SharingController` (share, listAccess, revokeGrant, createLink, openLink).
- Servicios: `SharingService`, `PublicLinkService`.
- Puertos → implementaciones: `ISecretCipher` (ver DF-10).
- Puertos que consume: `IAuditLogger` (lo declara e implementa T2 `audit`); `IRateLimiter` (T1 `shared`).
- Dominio: `AccessGrant` (abstracta) ← `UserShare`, `PublicLink`; `AccessList` (value object).
- Tablas: `comparticion`, `enlace_publico`, `intento_acceso`.

### M4 `billing`
- Controladores: `PlansController` (`GET /api/v1/billing/plans`, público; spec 008, DF-67); `SubscriptionController` (subscribe, renew, changePlan, history, invoice). `listPlans` y `comparePlans` no se crean: el catálogo es una sola lectura y la comparación se arma en `web`.
- Servicios: `PlanCatalogService` (`list()`, solo lectura del catálogo; spec 008), `SubscriptionService`, `PaymentService`; job `RenewalScheduler` (`@Cron`, usa `IClock`).
- Puertos → implementaciones: `IPaymentGateway` → `SimulatedPaymentGateway` (failureRate, latencyMs); `IInvoiceGenerator` → `PdfInvoiceGenerator`; `IPlanRepository` → `TypeOrmPlanRepository` (interno de `billing`, spec 008, Art. V.2(b)); repos.
- Puertos que consume: `INotifier` (lo declara e implementa T4 `notifications`).
- Eventos que consume (ADR-0019): `identity.client-account-verified` → crea la suscripción Personal (001 D-4). El oyente es idempotente y se acompaña de una conciliación de las cuentas verificadas sin suscripción. Lo implementa la 009 (PD-40, 2026-09-29); la 006a no lo hace.
- Dominio: `Plan` con `PlanLimits` (value object); `Subscription` (pendingPlanId, isReadOnly, scheduleChange, applyPendingChange); `Payment`; `Invoice`; `Money`.
- Implementa hacia fuera: `IPlanLimitsProvider` (declarado por `storage`, DF-51 opción A; lo usan M2 y M5; se importa de `storage/index.ts`) e `IAgentQuota` (M6, lo declara `billing`) → DF-27. El `PlanLimits` de dominio de `Plan` es distinto del tipo `PlanLimits` de `storage`: se mapea al implementar el puerto. El catálogo público (008) no pasa por este puerto: `PlanCatalogService` lee `plan` por `IPlanRepository` (DF-67).
- Tablas: `plan`, `suscripcion`, `transaccion`, `factura`.

### M5 `editing`
- Controlador: `EditorController` (open, callback, versions, restore).
- Servicios: `EditSessionService`, `SaveCallbackHandler`. El `VersionHistoryService` del diagrama vive en M2 desde 014 (DF-17, DF-68); 016 registra sus versiones con `FileVersionService` y solo aporta la autoría. Sin gateway propio: el diagrama tiene `PresenceGateway`, pero la presencia se publica por el gateway único de T3 `realtime`, y `editing` autoriza la unión a la sala del documento consultando `access` (DF-30, ADR-0010).
- Puertos → implementaciones: `IDocumentEditor` → `OnlyOfficeEditor`; `IIdempotencyStore` → `RedisIdempotencyStore`; `ISessionRepository` (renombrar, DF-19); `IIndexQueue` → `intelligence`. `IVersionRepository` vive en M2 desde 014 (DF-68).
- Dominio: `EditSession` (composición 1..* `Participant`); `DocumentVersion` (en el diagrama hereda de `FileVersion`; se reemplaza por composición con `origen = 'edicion'`, DF-18, ADR-0012).
- Tablas: `sesion_edicion`, `participacion` (N:M `participa`).

### M6 `intelligence`
- Servicios: `AgentService`, `HybridRetriever` (keyword + vector + fuse), processor `IndexingService`, `Chunker`, `ExtractorRegistry` (**Registry**). Falta `AgentController` y entidades de conversación → DF-15.
- Puertos → implementaciones: `ILanguageModel` → `GeminiFlashModel`; `IEmbeddingProvider` → `GeminiEmbeddingProvider`; `ITextExtractor` → `DocxExtractor`, `PdfExtractor`, `PlainTextExtractor` (**abierto/cerrado**); `IChunkRepository`; `IAgentQuota` → `billing`.
- Dominio: `Chunk` con `SourceLocation` (abstracta) ← `PdfLocation` (page), `DocxLocation` (section, paragraph), `TextLocation` (line); `confidence` + `isCertain()`.
- Tablas: `indexacion`, `fragmento` (`embedding vector(768)`, `texto_busq tsvector`), `conversacion`, `consulta_agente`, `cita` (N:M).

### M7 `optimizer`
- Controlador: `OptimizerController` (estimate, run, restoreOriginal).
- Servicios: `OptimizationService`; processor `OptimizationProcessor`.
- Puertos → implementaciones: `IOptimizer` ← `BaseOptimizer` (abstracta, **Template Method**) ← `PdfOptimizer`, `ImageOptimizer`; `IIntegrityValidator` → `DefaultIntegrityValidator`; `ICommandRunner` → `ChildProcessRunner`; `IJobRepository`, `IJobQueue`.
- Dominio: `OptimizationJob`; `SavingsEstimate` (value object, `isWorthIt(min)`).
- Tablas: `optimizacion` (+ `trabajo`, ver DF-22).

### M8 `backoffice`
- Controladores (DF-36): con 011, `ClientFilesController` (`GET /backoffice/client-files`); en el PR-B de 011, `AccountsController`, `MetricsController` y `PlansController`. El diagrama tiene un solo `BackofficeController` (DF-65). `HealthController` se movió a T1 `shared` (DF-49).
- Servicios (011, DF-65): `InternalActionService` por **composición**, no clase abstracta: `read(actor, work)` y `run(actor, action)` ponen transacción, actor interno activo y evento de auditoría en la misma transacción; `SupportService` (metadatos de un cliente) e `InitialAdminBootstrapper` (primer Administrador por comando, CA-7); en el PR-B, `AdminService`, `MetricsService` y `CatalogAdminService`. `JobMonitorService` llega con su spec. Sin guards: el diagrama tiene `RolesGuard`, pero se movió a T1 `shared` con los guards globales (DF-50, spec 003 D-2); los controladores de M8 declaran `@Roles(...)`.
- Puertos → implementaciones: `IQueueInspector` → `BullMqInspector`; `INodeMetadataReader` → `SqlNodeMetadataReader` (lo declara e implementa `storage`, M2). `IHealthIndicator` y sus indicadores se movieron a T1 (DF-49); `OnlyOfficeHealthIndicator` (DF-29) lo aporta `editing` y se registra en la raíz de composición.
- Tipos: `Actor` (actor que ejecuta; vive en `shared`). Error: `ClientNotFoundError` (404) e `InvalidBackofficeQueryError` (400).

### T1 `shared` (spec 000; guards con 003)
- Controlador: `HealthController` (live, ready) — `@Public()`, sin autenticación; nunca expone topología.
- Guards globales (spec 003 D-2, DF-50): `JwtAuthGuard` y `RolesGuard` (`CanActivate`), registrados para toda la API y que **niegan por defecto**. `JwtAuthGuard` verifica el token con el puerto token→`Actor` que declara `shared` y que implementa `identity` (002 D-14; nombre en el plan 003) y construye el `Actor`; `RolesGuard` comprueba `@Roles(...)`. Decoradores `@Public()` y `@Roles(...)`: toda ruta declara uno de los dos (003 D-10). El handshake de T3 `realtime` usa el mismo puerto.
- Persistencia con actor: `withActor()` fija `app.actor_id` y `app.actor_role` por transacción para RLS (ADR-0005, 003 D-7).
- Servicio: `HealthService` (`ready()`: ejecuta los `IHealthIndicator` en paralelo con tiempo límite; agrega `up`/`down`).
- Puertos → implementaciones:
  - `IHealthIndicator` → `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` (DF-29 parcial);
  - `IClock` → `SystemClock` (infraestructura), `FixedClock` (dominio, para pruebas);
  - con 001, `IRateLimiter` → `RedisRateLimiter`, con ventana deslizante en Redis (lo consumen M1 y M3b; PD-30);
  - con 001, `ITransactionRunner` → implementación TypeORM que publica el `EntityManager` en `TransactionContext` (`AsyncLocalStorage`). `withActor` de 003 se construye sobre el mismo contexto (DF-54).
- Dominio:
  - `Actor` (`id`, `role`, `canReadContent`) y `Role` = `CLIENT | ADMIN | SUPPORT | OPERATOR`;
  - `DomainError` (abstracta; desde 001 con `fields?: FieldIssue[]`; con 005 también `details?` plano de `string | number | boolean`, DF-60) ← `InvalidInputError` (422), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409) y `TooManyRequestsError` (429, con `retryAfterSeconds`; desde 001, DF-54).
- Presentación:
  - `DomainExceptionFilter`: único traductor `DomainError` → HTTP; desde 001 agrega `fields` y `Retry-After`; con 005 agrega `details` (y no lo registra en bitácoras: puede llevar un nombre de archivo);
  - `ZodValidationPipe`: valida con los esquemas de `contracts` (ADR-0020);
  - `configureHttpApp`: middlewares, prefijo, filtro, solo JSON, CORS y `trust proxy`. La usan `main.ts` y el arnés de pruebas;
  - `CorrelationIdMiddleware` y `VersionHeaderMiddleware`.
- Infraestructura:
  - `CorrelationContext` (`AsyncLocalStorage`) y logger Pino con `REDACTED_FIELDS`/`redactDeep`;
  - `loadEnv` (zod) y `buildDataSourceOptions`;
  - `enqueueWithCorrelation`, que desde 001 acepta opciones del trabajo;
  - proveedor `REDIS_CLIENT` (ioredis);
  - cola de prueba `ping` (`PingProcessor`).
- Módulos NestJS:
  - `SharedModule`: config, logger, TypeORM y conexión BullMQ. Desde 001 es `@Global()` y exporta `I_CLOCK`, `REDIS_CLIENT`, `I_RATE_LIMITER` e `I_TRANSACTION_RUNNER`;
  - `HealthModule.forRoot({ indicators })`: la raíz de composición de `api` y de `worker` elige los indicadores.
- Tablas: ninguna de negocio; tabla de control `migracion` (TypeORM).

### T2 `audit`
- `AuditEntry` (id, action, actorId nullable, actorRole, targetUserId, resourceType, resourceId, attributes, occurredAt, correlationId), **sin** `isVisibleTo`: la visibilidad es la consulta con `usuario_afectado_id = actor.id` más RLS (DF-64, Art. IX.2). El catálogo cerrado `AuditAction`/`AUDIT_CATALOG` declara por acción el tipo de recurso y los atributos permitidos; `sanitizeAttributes` descarta los demás.
- `AuditService` implementa `IAuditLogger` (token `I_AUDIT_LOGGER`): `record(entry: AuditRecord)` de mejor esfuerzo y posterior al commit (005, 006; nunca lanza), `recordInTransaction(entry)` síncrona, que lanza y se une a la transacción del llamador (011, D-5), y `listForUser(actor, query)`; ambas escrituras delegan en un `append` privado. `AuditRecord = { action: AuditAction; actor: AuditActor; targetUserId; resourceId?; attributes? }`, con `AuditActor = Actor | SystemActor` (011: `SYSTEM_ACTOR` solo para el alta inicial por comando, sin `actorId`).
- Puerto interno `IAuditRepository` (`insert(actor, entry)`, `listForTarget`) → `TypeOrmAuditRepository`, dentro de `audit` (no lo exporta `index.ts`).
- Presentación: `AuditController` con `GET /audit/my-events` (DF-15) en `AuditHttpModule`, que carga solo `api`; el `worker` carga `AuditModule` sin rutas. `LogAuditLogger` (adaptador provisional de 005) se retiró con 004 (DF-64).
- Tabla: `evento_auditoria` (004).

### T3 `realtime`
- Único gateway Socket.IO: handshake autenticado con el puerto token→`Actor` de `shared` (sin depender de `identity`), salas por usuario y por documento. Declara el puerto de publicación (nombre en el plan 015) que usan `storage`, `editing`, `intelligence` y `notifications`. No conoce permisos (ADR-0010).

### T4 `notifications`
- Responsabilidad: correo transaccional y notificaciones al usuario (DF-34, ADR-0010). No conoce las reglas de negocio de quien lo usa: recibe qué enviar y a quién. Dueño de la tabla `notificacion` y de la cola `mail` del `worker`.
- Puertos que declara y exporta en su `index.ts`, segregados por consumidor (ISP): `IMailer` (lo consume `identity`: verificación, recuperación y avisos de cuenta) e `INotifier` (lo consume `billing`). Los declara el transversal, no el consumidor, para que `notifications` nunca importe un módulo de negocio (`architecture.md` §3, regla 5).
- Implementaciones:
  - `IMailer` → `SmtpMailer`. En el `api` encola en `mail` con `jobId = idempotencyKey` (spec 001 D-11);
  - `MailProcessor` («processor», en el `worker») entrega con `SmtpTransport`, un envoltorio de nodemailer, y aplica la idempotencia: marca en Redis y `Message-ID` determinista (ADR-0018);
  - `MailMessage` = `{ to, subject, text, html, idempotencyKey, tag, recipientId? }`;
  - el destino SMTP es Mailpit en local y el SMTP de Resend en staging (001 D-12). Solo el `worker` tiene las credenciales SMTP;
  - `INotifier` → implementación de `notifications`; nombre y canales en el plan de la spec de `billing` que la use primero.
- Módulos NestJS: `NotificationsModule` (`api`: registra la cola y provee `I_MAILER`) y `NotificationsWorkerModule` (`worker`: procesador y transporte).
- Depende de: `shared` y `realtime` (para publicar en la sala del usuario). Es la única arista entre transversales (ADR-0010).
- Tabla: `notificacion`. La crea la primera spec con notificaciones dentro de la aplicación: la 001 no la crea (su §12) y la cola `mail` no la usa (ADR-0018).

## 4. Mapeo clase ↔ tabla (E-R)

Regla: **clases e identificadores en inglés (diagrama de clases); tablas y columnas en español `snake_case` (diagrama E-R)**.
El mapeo vive solo en las entidades TypeORM (`@Entity('archivo')`, `@Column({ name: 'creado_en' })`).

| Clase | Tabla | Notas |
|---|---|---|
| `User`, `ClientUser`, `InternalUser` | `usuario` | Tabla única; `rol` discrimina (columna con `CHECK`, sin tabla `rol`: DF-13) |
| `Session` | `sesion` | Depende de `dispositivo` |
| `Device` | `dispositivo` | Clase nueva (DF-11, spec 002 D-4); `huella_hash` guarda el hash del identificador aleatorio de la cookie. Falta en el diagrama |
| `VerificationToken` | `token_cuenta` | `tipo` = verificación / recuperación; `invalidado_en` y `creado_en` (DF-53) |
| `Folder` | `carpeta` | `ruta` como camino materializado; con 006: `profundidad`, `purgar_en`, `eliminado_con_carpeta_id`; RLS (DF-61) |
| `File` | `archivo` | Con 005: solo `id`, `propietario_id`, `nombre`, `tipo`, `tamano_bytes`, `version_actual_id`, fechas y `eliminado_en`; RLS; sin `estado_indexacion` (019) ni `tipo_mime` (ningún consumidor de 005 lo lee; 017 lo agrega si lo necesita; DF-60). Con 006: `carpeta_id`, `purgar_en`, `eliminado_con_carpeta_id` (DF-61). DF-33 parcial |
| `TrashState` | columnas de `archivo` y `carpeta` | `eliminado_en`, `purgar_en`, `eliminado_con_carpeta_id`; sin tabla propia. La purga lee por la función `papelera_vencida` (ADR-0021, DF-61) |
| `QuickAccessItem` / `QuickAccessList` | `acceso_rapido` | Con 006 §9 (DF-63). `usuario_id` (FK a `usuario`: la cuenta que fija, no el dueño del nodo); `archivo_id` y `carpeta_id` (FK con `ON DELETE CASCADE` y `CHECK` de exactamente uno, ADR-0011); `fijado_en` y `abierto_en` (`timestamptz`, `CHECK` de al menos uno; fijado ⇔ `fijado_en IS NOT NULL`, sin columna `fijado`); `creado_en`, `actualizado_en`. Únicas `(archivo_id, usuario_id)` y `(carpeta_id, usuario_id)`; índices parciales `(usuario_id, fijado_en DESC, id DESC)` para fijados y `(usuario_id, abierto_en DESC, id DESC)` para recientes. RLS de cliente (`usuario_id` = actor), `ENABLE` + `FORCE`, sin política para roles internos. Los items son modelos de lectura que unen la fila con `archivo`/`carpeta` vía `accessibleNodes` |
| `FileVersion` / `DocumentVersion` | `version_archivo` | `origen` = carga / edicion / restauracion / optimizacion (ADR-0012). Con 005: `clave_objeto` única (`u/{propietario}/{archivo}/{version}`), `creado_por`; sin `checksum` ni `sesion_edicion_id`; RLS, sin política para roles internos. Con 014 (DF-68): `numero` (consecutivo por archivo, `UNIQUE (archivo_id, numero)` y `CHECK > 0`; la actual es la de mayor número y no se reutiliza tras una poda) y `restaurada_de_numero` (sin FK, entre 1 y `numero - 1`) |
| `UploadSession` | `carga` | Reserva de cuota mientras está `activa`; `upload_id` y `clave_objeto` nunca salen de la API; RLS solo para el propietario; `archivo_id`/`version_id` reservados sin FK; con 006, `carpeta_destino_id` sin FK (DF-61); con 014, `reemplaza` (la carga crea una versión nueva de un archivo existente, DF-68). DF-33 parcial, ADR-0021 |
| (uso de espacio) | `usuario.espacio_usado` | Atributo almacenado (`bigint`, `CHECK >= 0`, DF-38); `storage` lo escribe por excepción (DF-59) |
| `UserShare` | `comparticion` | |
| `PublicLink` | `enlace_publico` | |
| (intentos) | `intento_acceso` | |
| `Plan` + `PlanLimits` | `plan` | Bytes `bigint` y precio en centavos (DF-24, DF-23, ADR-0016) |
| `Subscription` | `suscripcion` | |
| `Payment` | `transaccion` | |
| `Invoice` | `factura` | |
| `EditSession` | `sesion_edicion` | |
| `Participant` | `participacion` | Tabla de la relación N:M `participa` |
| (indexación) | `indexacion` | Estado por versión |
| `Chunk` | `fragmento` | |
| (conversación, consulta) | `conversacion`, `consulta_agente`, `cita` | Sin clases aún (DF-15) |
| `OptimizationJob` | `optimizacion` | |
| (trabajo) | `trabajo` | Ver DF-22 |
| `AuditEntry` | `evento_auditoria` | |
| (notificación) | `notificacion` | Dueño: `notifications` |

## 5. Tipos de columna obligatorios

| Dato | Tipo Postgres | Motivo |
|---|---|---|
| Identificadores | `uuid` | RNF-06 |
| Tamaños y cuotas en bytes | `bigint` | 2 GB supera `int` (DF-06) |
| Dinero | `integer` en centavos de quetzal. Q45.00 = 4500. `Money` y `transaccion.monto` se implementan en la 009 | DF-23, ADR-0016 |
| Fechas | `timestamptz` | Vigencias y zonas horarias |
| Procedencia | `jsonb` | Página / sección+párrafo / línea + confianza (DF-07) |
| Embedding | `vector(768)` | Fijo desde la primera migración; configurar el modelo con dimensión de salida 768 |
| Texto de búsqueda | `tsvector` con configuración `spanish` | Búsqueda léxica |
| Estados | `varchar` + `CHECK` o enum de Postgres | Valores cerrados |
