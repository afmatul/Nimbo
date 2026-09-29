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
| T1 | (transversal; recibe de M8 la salud, DF-49, y `RolesGuard`, DF-50) | `shared` | Adrián | `Actor`, `IClock`, errores, logger, `correlationId`, entorno, salud, guards globales (003) |
| T2 | (transversal, extraído de M8) | `audit` | Adrián | 07 |
| T3 | (transversal) | `realtime` | Fátima | 08 (progreso), 26, 32 (streaming) |
| T4 | (transversal) | `notifications` | Juan Marcos | declara e implementa `IMailer` e `INotifier` |

M3 se divide en `access` y `sharing`, y `audit`/`realtime`/`notifications` salen como transversales, para evitar
ciclos de dependencia (ver DF-02, DF-03, DF-30, DF-34). Decidido en ADR-0010 (aceptado el 26/09/2026); falta redibujar los diagramas.

## 3. Clases por módulo

Todo método de servicio que actúa sobre datos de un usuario recibe `actor: Actor` como primer parámetro (DF-01,
spec 003 D-9). Los diagramas de clases todavía no lo muestran en las firmas.

«Puertos que consume» lista los puertos que un módulo de negocio importa desde el `index.ts` del transversal que los
declara y los implementa. El módulo de negocio no los declara (ADR-0010, `architecture.md` §3, regla 5).

### M1 `identity`
- Controladores: `AuthController` (register, verifyEmail, resendVerification, login, refresh, forgotPassword, resetPassword; `resendVerification` es nuevo, plan 001, DF-54); `SessionsController` (listar y revocar sesiones, RF-04; DF-15 parcial, spec 002 D-8).
- Servicios:
  - `RegistrationService` (register, resendVerification, verifyEmail), separado de `AuthService` por SRP (plan 001 DT-1, DF-54). Sus colaboradores: `VerificationLinkIssuer`, que invalida los enlaces vigentes y emite uno nuevo (lo reutiliza 002 D-15), y `RegistrationAttemptNotifier`, que envía el aviso de intento de registro (001 D-17);
  - `AuthService` (login, refresh, logout, recuperación; 002) y `SessionService`.
- Guard: `IdentityIpThrottlerGuard`, subclase de `ThrottlerGuard` para el límite por IP del registro (001 D-15, ADR-0017).
- Puertos → implementaciones:
  - `IPasswordHasher` → `Argon2idHasher` (`argon2`, ADR-0017);
  - `ITokenService` → `JwtTokenService`;
  - `IUserRepository`, `IVerificationTokenRepository` (nuevo, DF-54) e `ISessionRepository` → TypeORM;
  - `IAccountEventsPublisher` (nuevo, DF-54) → `EventEmitterAccountEventsPublisher` (ADR-0019).
  - Implementa hacia fuera el puerto token→`Actor` que declara T1 `shared` (002 D-14).
- Puertos que consume: `IMailer` (lo declara e implementa T4 `notifications`); `IRateLimiter`, `ITransactionRunner` e `IClock` (T1 `shared`; el límite por correo es de 001 D-15).
- Dominio:
  - `User` (abstracta) ← `ClientUser` (sin `subscriptionId`: la relación vive solo en `suscripcion.usuario_id`, DF-35), `InternalUser`;
  - `Session`; `Device` (DF-11, spec 002 D-4);
  - `VerificationToken` (`issue`, `stateAt(now)`, `isValid`, `consume`, `invalidate`; DF-53);
  - objetos de valor `EmailAddress`, `OpaqueToken`, `PasswordHash` y `LegalAcceptance` (DF-54);
  - `AccountStatus` = `ACTIVE | SUSPENDED`; `Role` = `CLIENT | ADMIN | SUPPORT | OPERATOR` (vive en `shared`).
- Eventos que publica (ADR-0019): `identity.client-account-verified` (`ClientAccountVerifiedEvent { userId }`), después del commit y una vez por cuenta. Lo exporta `index.ts` y lo consume `billing` (006a).
- Patrones: Herencia de tabla única para `User`; Strategy implícita en hasher/tokens.
- Tablas:
  - `usuario`: `rol` con `CHECK`, sin tabla `rol` (DF-13); `correo_verificado`, `version_terminos`, `version_privacidad` y `terminos_aceptados_en` (DF-33 parcial, 001 D-14);
  - `token_cuenta`: `usuario_id`, `invalidado_en` y `creado_en`, con un solo enlace vigente por cuenta y tipo (DF-53);
  - `dispositivo` y `sesion` (002).

### M2 `storage`
- Controlador: `FilesController` (list, download, initUpload, uploadPart, completeUpload, move, trash). Faltan carpetas, renombrar, restaurar, versiones, cuota, búsqueda, vista previa → DF-15.
- Servicios: `FileService`, `UploadService`, `QuotaService`.
- Puertos → implementaciones: `IObjectStorage` → `MinioStorageAdapter`; `IFileTypeDetector` → `MagicBytesDetector`; `INodeRepository` → TypeORM; `IPlanLimitsProvider` → implementado por `billing`.
- Dominio: `StorageNode` (abstracta) ← `Folder`, `File` (**Composite**); `FileVersion` (composición 1..* de `File`); `UploadSession`.
- Tablas: `carpeta`, `archivo`, `version_archivo`, `carga`.

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
- Controlador: `SubscriptionController` (listPlans, comparePlans, subscribe, renew, changePlan, history, invoice).
- Servicios: `PlanCatalogService`, `SubscriptionService`, `PaymentService`; job `RenewalScheduler` (`@Cron`, usa `IClock`).
- Puertos → implementaciones: `IPaymentGateway` → `SimulatedPaymentGateway` (failureRate, latencyMs); `IInvoiceGenerator` → `PdfInvoiceGenerator`; repos.
- Puertos que consume: `INotifier` (lo declara e implementa T4 `notifications`).
- Eventos que consume (ADR-0019): `identity.client-account-verified` → crea la suscripción Personal (001 D-4). El oyente es idempotente y se acompaña de una conciliación de las cuentas verificadas sin suscripción (006a).
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
- Servicios: `AdminService`, `SupportService` ← `InternalActionService` (abstracta: `recordAction`, `assertInternal` — **Template Method**), `MetricsService`, `JobMonitorService`. Sin guards: el diagrama tiene `RolesGuard`, pero se movió a T1 `shared` con los guards globales (DF-50, spec 003 D-2); los controladores de M8 declaran `@Roles(...)`.
- Puertos → implementaciones: `IQueueInspector` → `BullMqInspector`; `INodeMetadataReader` → `storage`. `IHealthIndicator` y sus indicadores se movieron a T1 (DF-49); `OnlyOfficeHealthIndicator` (DF-29) lo aporta `editing` y se registra en la raíz de composición.
- Tipos: `Actor` (actor que ejecuta; vive en `shared`).

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
  - `DomainError` (abstracta; desde 001 con `fields?: FieldIssue[]`) ← `InvalidInputError` (422), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409) y `TooManyRequestsError` (429, con `retryAfterSeconds`; desde 001, DF-54).
- Presentación:
  - `DomainExceptionFilter`: único traductor `DomainError` → HTTP; desde 001 agrega `fields` y `Retry-After`;
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
- `AuditService` (record, listForUser), `AuditEntry` (actorId, actorRole, targetUserId, action, resourceId, occurredAt, `isVisibleTo`). Implementa `IAuditLogger`.
- Tabla: `evento_auditoria`.

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
