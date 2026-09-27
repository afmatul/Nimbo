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
| M3b | Compartición y Control de Acceso (comparticiones y enlaces) | `sharing` | Abel | 16–18 |
| M4 | Suscripciones y Pago | `billing` | Juan Marcos | 19–24, 34 (contador) |
| M5 | Edición Colaborativa .docx e Historial con Autoría | `editing` | Fátima | 25, 26, 28, 29 |
| M6 | Inteligencia Documental | `intelligence` | Fátima | 15 (contenido), 30–34 |
| M7 | Optimizador de Almacenamiento | `optimizer` | Abel | 35, 36 |
| M8 | Administración, Soporte y Operación | `backoffice` | Adrián | 06, 37 |
| T1 | (transversal; recibe la salud de M8, DF-49) | `shared` | Adrián | `Actor`, `IClock`, errores, logger, `correlationId`, entorno, salud |
| T2 | (transversal, extraído de M8) | `audit` | Adrián | 07 |
| T3 | (transversal) | `realtime` | Fátima | 08 (progreso), 26, 32 (streaming) |
| T4 | (transversal) | `notifications` | Juan Marcos | implementa `IMailer` e `INotifier` |

M3 se divide en `access` y `sharing`, y `audit`/`realtime`/`notifications` salen como transversales, para evitar
ciclos de dependencia (ver DF-02, DF-03, DF-30, DF-34). Decidido en ADR-0010 (aceptado el 26/09/2026); falta redibujar los diagramas.

## 3. Clases por módulo

### M1 `identity`
- Controlador: `AuthController` (register, verifyEmail, login, refresh, forgotPassword, resetPassword). Falta: `SessionsController` (listar/revocar, RF-04) → DF-15.
- Servicios: `AuthService`, `SessionService`.
- Puertos → implementaciones: `IPasswordHasher` → `Argon2idHasher`; `ITokenService` → `JwtTokenService`; `IUserRepository`, `ISessionRepository` → TypeORM; `IMailer` → `notifications`.
- Dominio: `User` (abstracta) ← `ClientUser`, `InternalUser`; `Session`; `VerificationToken`; `Role` = `CLIENT | ADMIN | SUPPORT | OPERATOR`.
- Patrones: Herencia de tabla única para `User`; Strategy implícita en hasher/tokens.
- Tablas: `usuario`, `dispositivo`, `sesion`, `token_cuenta` (+ `rol` según DF-13).

### M2 `storage`
- Controlador: `FilesController` (list, download, initUpload, uploadPart, completeUpload, move, trash). Faltan carpetas, renombrar, restaurar, versiones, cuota, búsqueda, vista previa → DF-15.
- Servicios: `FileService`, `UploadService`, `QuotaService`.
- Puertos → implementaciones: `IObjectStorage` → `MinioStorageAdapter`; `IFileTypeDetector` → `MagicBytesDetector`; `INodeRepository` → TypeORM; `IPlanLimitsProvider` → implementado por `billing`.
- Dominio: `StorageNode` (abstracta) ← `Folder`, `File` (**Composite**); `FileVersion` (composición 1..* de `File`); `UploadSession`.
- Tablas: `carpeta`, `archivo`, `version_archivo`, `carga`.

### M3a `access`
- Servicio: `PermissionResolver` (levelFor, can, inheritedGrants) + constructor de consulta de nodos accesibles (DF-32).
- Puertos → implementaciones: `IAccessPolicy` → `OwnerPolicy`, `EditorPolicy`, `ViewerPolicy` (**Strategy**); `IGrantRepository`.
- Dominio: `AccessLevel` = `OWNER | EDITOR | VIEWER`; `Action`.
- Tablas que lee: `archivo`, `carpeta`, `comparticion` (modelo de lectura).

### M3b `sharing`
- Controlador: `SharingController` (share, listAccess, revokeGrant, createLink, openLink).
- Servicios: `SharingService`, `PublicLinkService`.
- Puertos → implementaciones: `IRateLimiter` → `RedisRateLimiter`; `IAuditLogger` → `audit`; `ISecretCipher` (ver DF-10).
- Dominio: `AccessGrant` (abstracta) ← `UserShare`, `PublicLink`; `AccessList` (value object).
- Tablas: `comparticion`, `enlace_publico`, `intento_acceso`.

### M4 `billing`
- Controlador: `SubscriptionController` (listPlans, comparePlans, subscribe, renew, changePlan, history, invoice).
- Servicios: `PlanCatalogService`, `SubscriptionService`, `PaymentService`; job `RenewalScheduler` (`@Cron`, usa `IClock`).
- Puertos → implementaciones: `IPaymentGateway` → `SimulatedPaymentGateway` (failureRate, latencyMs); `IInvoiceGenerator` → `PdfInvoiceGenerator`; `INotifier` → `notifications`; repos.
- Dominio: `Plan` con `PlanLimits` (value object); `Subscription` (pendingPlanId, isReadOnly, scheduleChange, applyPendingChange); `Payment`; `Invoice`; `Money`.
- Implementa hacia fuera: `IPlanLimitsProvider` (M2, M5), `IAgentQuota` (M6) → DF-27.
- Tablas: `plan`, `suscripcion`, `transaccion`, `factura`.

### M5 `editing`
- Controlador: `EditorController` (open, callback, versions, restore).
- Servicios: `EditSessionService`, `SaveCallbackHandler`, `VersionHistoryService`. Sin gateway propio: el diagrama tiene `PresenceGateway`, pero la presencia se publica por el gateway único de T3 `realtime`, y `editing` autoriza la unión a la sala del documento consultando `access` (DF-30, ADR-0010).
- Puertos → implementaciones: `IDocumentEditor` → `OnlyOfficeEditor`; `IIdempotencyStore` → `RedisIdempotencyStore`; `ISessionRepository` (renombrar, DF-19); `IVersionRepository`; `IIndexQueue` → `intelligence`.
- Dominio: `EditSession` (composición 1..* `Participant`); `DocumentVersion` (hoy hereda de `FileVersion`, ver DF-18).
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
- Controladores: `BackofficeController` (listAccounts, suspend, adjustQuota, fileMetadata, retryJob, dashboard). `HealthController` se movió a T1 `shared` (DF-49).
- Servicios: `AdminService`, `SupportService` ← `InternalActionService` (abstracta: `recordAction`, `assertInternal` — **Template Method**), `MetricsService`, `JobMonitorService`; guard `RolesGuard` (`CanActivate`).
- Puertos → implementaciones: `IQueueInspector` → `BullMqInspector`; `INodeMetadataReader` → `storage`. `IHealthIndicator` y sus indicadores se movieron a T1 (DF-49); `OnlyOfficeHealthIndicator` (DF-29) lo aporta `editing` y se registra en la raíz de composición.
- Tipos: `Actor` (actor que ejecuta; vive en `shared`).

### T1 `shared` (spec 000)
- Controlador: `HealthController` (live, ready) — sin autenticación; nunca expone topología.
- Servicio: `HealthService` (`ready()`: ejecuta los `IHealthIndicator` en paralelo con tiempo límite; agrega `up`/`down`).
- Puertos → implementaciones: `IHealthIndicator` → `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` (DF-29 parcial); `IClock` → `SystemClock` (infraestructura), `FixedClock` (dominio, para pruebas).
- Dominio: `Actor` (`id`, `role`, `canReadContent`), `Role` = `CLIENT | ADMIN | SUPPORT | OPERATOR`, `DomainError` (abstracta) ← `InvalidInputError` (422), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409).
- Presentación: `DomainExceptionFilter` (único traductor `DomainError` → HTTP), `CorrelationIdMiddleware`, `VersionHeaderMiddleware`.
- Infraestructura: `CorrelationContext` (`AsyncLocalStorage`), logger Pino con `REDACTED_FIELDS`/`redactDeep`, `loadEnv` (zod), `buildDataSourceOptions`, `enqueueWithCorrelation`, cola de prueba `ping` (`PingProcessor`).
- Módulos NestJS: `SharedModule` (config, logger, TypeORM, conexión BullMQ) y `HealthModule.forRoot({ indicators })` (la raíz de composición de `api` y de `worker` elige los indicadores).
- Tablas: ninguna de negocio; tabla de control `migracion` (TypeORM).

### T2 `audit`
- `AuditService` (record, listForUser), `AuditEntry` (actorId, actorRole, targetUserId, action, resourceId, occurredAt, `isVisibleTo`). Implementa `IAuditLogger`.
- Tabla: `evento_auditoria`.

### T3 `realtime`
- Único gateway Socket.IO: handshake autenticado con el puerto token→`Actor` de `shared` (sin depender de `identity`), salas por usuario y por documento. Declara el puerto de publicación (nombre en el plan 015) que usan `storage`, `editing`, `intelligence` y `notifications`. No conoce permisos (ADR-0010).

## 4. Mapeo clase ↔ tabla (E-R)

Regla: **clases e identificadores en inglés (diagrama de clases); tablas y columnas en español `snake_case` (diagrama E-R)**.
El mapeo vive solo en las entidades TypeORM (`@Entity('archivo')`, `@Column({ name: 'creado_en' })`).

| Clase | Tabla | Notas |
|---|---|---|
| `User`, `ClientUser`, `InternalUser` | `usuario` | Tabla única; `rol` discrimina |
| `Session` | `sesion` | Depende de `dispositivo` |
| (dispositivo) | `dispositivo` | Sin clase en el diagrama; agregar `Device` (DF-11) |
| `VerificationToken` | `token_cuenta` | `tipo` = verificación / recuperación |
| `Folder` | `carpeta` | `ruta` como camino materializado |
| `File` | `archivo` | |
| `FileVersion` / `DocumentVersion` | `version_archivo` | `origen` = carga / edicion / restauracion / optimizacion |
| `UploadSession` | `carga` | |
| `UserShare` | `comparticion` | |
| `PublicLink` | `enlace_publico` | |
| (intentos) | `intento_acceso` | |
| `Plan` + `PlanLimits` | `plan` | Unidades distintas (DF-24) |
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
| Dinero | `integer` en centavos de quetzal (o `numeric(12,2)`, uno solo) | DF-23 |
| Fechas | `timestamptz` | Vigencias y zonas horarias |
| Procedencia | `jsonb` | Página / sección+párrafo / línea + confianza (DF-07) |
| Embedding | `vector(768)` | Fijo desde la primera migración; configurar el modelo con dimensión de salida 768 |
| Texto de búsqueda | `tsvector` con configuración `spanish` | Búsqueda léxica |
| Estados | `varchar` + `CHECK` o enum de Postgres | Valores cerrados |
