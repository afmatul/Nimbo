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
| T3 | (transversal) | `realtime` | Adrián | 26, 32 (streaming); no 08: el progreso es local del cliente y no se difunde (DF-58, 015 P-7) |
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
  - con 011, fachadas que consume `backoffice` (clases sin interfaz, Art. V.2; DF-04, DF-65): `AccountDirectory` (`list`, `get`, `findClientByEmail`, `statistics`), `AccountAdministration` (`lockAdminRoster`, `assertActorActive`, `suspend`, `reactivate`; `suspend` devuelve `Suspension`, con `logRevokedSessions()` para después del commit del llamador) e `InternalAccountEnrollment` (`enroll`, `enrollInitialAdmin`), que delega el enlace «Crear tu contraseña» en `AccountSetupLinkIssuer` (con la forma de `VerificationLinkIssuer`); `AccountSetupService` (`checkLink`, `setFirstPassword`).
- Guard: `IdentityIpThrottlerGuard`, subclase de `ThrottlerGuard` para el límite por IP del registro y del reenvío (001 D-8, D-15, ADR-0017).
- Puertos → implementaciones:
  - `IPasswordHasher` → `Argon2idHasher` (`argon2`, ADR-0017) e `IAttemptLockout` → `RedisAttemptLockout` (002): con 013 se mueven a T1 `shared` sin cambio de firma (plan 013 D-2, DF-10); `identity` los consume desde `shared` y conserva sus claves y su `LockoutPolicy`;
  - `ITokenService` → `JwtTokenService`;
  - `IUserRepository`, `IVerificationTokenRepository` (nuevo, DF-54) e `ISessionRepository` → TypeORM;
  - con 011: `IAdminRosterRepository` (padrón interno: alta, estado, conteo de Administradores activos y candado `pg_advisory_xact_lock`; toma de `IUserRepository` solo `findByIdForUpdate` y `findByEmail`, ISP) → `TypeormUserRepository` (`useExisting`, el mismo adaptador); `IAccountDirectoryRepository` (modelo de lectura paginado) → `TypeOrmAccountDirectoryRepository`;
  - `IAccountEventsPublisher` (nuevo, DF-54) → `EventEmitterAccountEventsPublisher` (ADR-0019).
  - Implementa hacia fuera el puerto token→`Actor` que declara T1 `shared` (002 D-14).
  - con 012 (DF-84): implementa `IShareeDirectory`, que declara M3b `sharing`, con `ShareeDirectoryAdapter` (`findClientByEmail`: cliente `activa` y verificado, filtro en la consulta; `profiles(ids)` sin filtrar estado; `displayNames` delega en `UserDirectoryAdapter`). Arista `identity → sharing` solo para el puerto; el enlace vive en la raíz (`ShareeDirectoryBindingModule`), como `UserDirectoryBindingModule` (DF-74).
- Puertos que consume: `IMailer` (lo declara e implementa T4 `notifications`); `IRateLimiter`, `ITransactionRunner` e `IClock` (T1 `shared`; el límite por correo es de 001 D-15).
- Dominio:
  - `User` (abstracta) ← `ClientUser` (sin `subscriptionId`: la relación vive solo en `suscripcion.usuario_id`, DF-35), `InternalUser`;
  - `Session`; `Device` (DF-11, spec 002 D-4);
  - `VerificationToken` (`issue`, `stateAt(now)`, `isValid`, `consume`, `invalidate`; DF-53);
  - objetos de valor `EmailAddress`, `OpaqueToken`, `PasswordHash` (en T1 `shared` desde 013) y `LegalAcceptance` (DF-54); con 011, `EmployeeCode` (DF-33);
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
  - `FileService` (`getDownloadUrl`, renombrar, mover; con 012, `getDetail`), `UploadService` (`init`, `resume`, `complete`, `cancel`, `expire`), `QuotaService` (`assertCanUpload`);
  - con 006 (DF-61): `FolderService` (`create`, `rename`, `move`, `contents`), `TrashService` (eliminar, listar, restaurar, purgar, vaciar; el `trash` del diagrama sale de `FileService` por SRP) y `TrashPurger` (borrado definitivo de objetos, filas y `espacio_usado` en una transacción con `lockUsage` primero); con 011b (DF-81): `SupportTrashService` (`list(actor, query)`, `restore(actor, cmd)`; recibe `actor` y `ownerId`, no usa `WritableAccountPolicy` ni `accessibleNodes`) y la función `restaurar_raiz_papelera` (ADR-0035);
  - con 006 §9 (DF-63): `QuickAccessService` (`list`, `pin`, `unpin`, `recordOpen`; solo `pin` toma `IQuotaRepository.lockUsage` y comprueba el tope). Configuración `QUICK_ACCESS_CONFIG` = `{ maxPinned, recentVisible }` desde `QUICK_ACCESS_MAX_PINNED` (5) y `QUICK_ACCESS_RECENT_VISIBLE` (3, decisión de Adrián del 2026-10-03) y la constante `RECENTS_STORED = 25` (colchón de poda, no configuración).
  - con 007 (DF-62): `SpaceSummaryService` (`summary`), `SpaceMeasurer` (`measure`, compartido por el resumen y la conciliación) y `UsageReconciler` (`reconcile`).
  - con 014 (DF-68; `storage` es el dueño del ciclo de vida de versiones, DF-17, ADR-0012): `FileVersionService` (`register` en la transacción del llamador bajo `lockUsage`, con `buildVersion(number)` que decide el origen; `afterCommit` dispara la poda), `VersionPruner` (`prune`: una versión por transacción, nunca lanza), `VersionHistoryService` (`list`) y `VersionRestoreService` (`restore`). Se registran en `UPLOAD_LIFECYCLE_PROVIDERS` (api y worker).
  - Trabajos (worker): `UploadCleanupProcessor` y `UploadCleanupScheduler` (cola `upload-cleanup`); con 006, `TrashPurgeScheduler` y `TrashPurgeProcessor` (cola `trash-purge`, repetible con `upsertJobScheduler`, `concurrency: 1`).
  - con 007 (DF-62): `UsageReconcileProcessor` y `UsageReconcileScheduler` (cola `usage-reconcile`).
- Puertos → implementaciones:
  - `IObjectStorage` → `MinioStorageAdapter` (con 005: `createMultipart`, `presignUploadPart`, `presignUploadObject`, `listParts`, `completeMultipart`, `abortMultipart`, `headObject`, `getRange`, `purgeObject`, `presignDownload`); `IFileTypeDetector` → `MagicBytesDetector`;
  - `INodeRepository` → TypeORM (archivos y, con 006, carpetas); con 012 (DF-85), escrituras y destinos con `ownedNodes`, `findOwnedFolder` y `findOwnedLiveFile`; las lecturas siguen con `accessibleNodes` y abren lo compartido;
  - `IPlanLimitsProvider` → lo **declara** `storage` con `PlanLimits` e `I_PLAN_LIMITS_PROVIDER` (`application/plan-limits.ts`, exportados por `storage/index.ts`) y lo implementa `billing` (DF-51, opción A; `storage` no importa `billing`); con 006, `PlanLimits.trashRetentionDays`; con 011b (DF-81), `PlanLimits.extraQuotaBytes`/`extraQuotaUntil` (solo el extra vigente, sumado a la cuota al leer con `IClock`; `PlanStorageLimits` los omite);
  - repositorios de 005: `IUploadSessionRepository`, `IQuotaRepository` (único punto que escribe `usuario.espacio_usado`: DF-59) e `IExpiredUploadScanner` (acceso sin actor de la limpieza, ADR-0021);
  - repositorios de 006 (internos, DF-61): `ITrashRepository` (incluye `schedulePurgeOfAll`), `IExpiredTrashScanner` (único acceso sin actor de la purga, función `papelera_vencida`) e `ITrashPurgeQueue` → `TrashPurgeQueue`; con 011b (DF-81): `ISupportTrashRepository` → `TypeOrmSupportTrashRepository` (`listRoots(actor, query)`, `restoreRoot(actor, cmd)`; llama a `restaurar_raiz_papelera`);
  - repositorio de 006 §9 (interno, DF-63): `IQuickAccessRepository` → `TypeOrmQuickAccessRepository` (`list`, `countPinned`, `findAccessibleNode`, `upsertPin`, `removePin`, `touchRecent`, `pruneRecents`). Toda lectura y escritura une `accessibleNodes(actor)` dentro de la consulta. No hay puerto entre módulos.
  - con 007 (internos, DF-62): `ISpaceRepository` → `TypeOrmSpaceRepository` (bytes vivos propios por tipo), `IClientAccountScanner` → `SqlClientAccountScanner` (solo ids de cuentas de cliente; único acceso sin actor de la conciliación) e `IQuotaRepository.readUsage` (sin bloqueo).
  - con 014 (interno, DF-68): `IVersionRepository` → `TypeOrmVersionRepository` (`list` por `numero DESC`, `nextNumber` = `MAX + 1`, `insert`, `delete`; `find` con la lectura y la restauración; todo con `requireActorScope`); `INodeRepository.updateCurrentVersion` y `findLiveFileByName`; `IObjectStorage.copyObject`; `PlanLimits.retainedVersions`. Con 014b (interno, DF-21, ADR-0013): `IVersionRepository.markKept` (fija `conservada_hasta` solo si estaba nula) y `listExpiredKept` (originales vencidos de archivos vivos propios, con `accessibleNodes(actor)` en la consulta); `FileVersion.keptUntil`, `countsInQuota` y `conserveAsOriginal`; `RegisterVersionCommand.keepPreviousForDays`; `VersionPruner.purgeExpiredOriginals`, que llama `UsageReconcileProcessor` (ahora con `VersionPruner` e `I_CLOCK`) antes de conciliar cada cuenta; `COUNTED_VERSION_SQL` en toda suma de versiones.
  - con 019 (entre módulos, DF-78): evento `storage.file-version-created` (`FILE_VERSION_CREATED`, `FileVersionCreatedEvent { fileId, versionId, ownerId, kind }`), publicado con `IDomainEventPublisher` (T1 `shared`) después del commit desde `FileVersionService.afterCommit` (reemplazo, restauración y edición) y `UploadRegistrar` (archivo nuevo); y la fachada `IndexableFileGateway` (`findAccessible`, `findOwned`, `openCurrent`, `lockCurrentVersion`, `listIndexable`, `clientIds`) para `intelligence`, que depende de `storage` (sin `storage → intelligence`).
  - con 013 (entre módulos, DF-86): la fachada `LinkedFileGateway` para `sharing` (`findOwnedFile(actor, fileId)` → `LinkedFile { id, name, sizeBytes }` o `null`, propio y vivo por `findOwnedLiveFile`; `issueDownload(actor, fileId)` → `DownloadUrl` de la versión vigente o `null`, sin auditar ni límite: los pone `sharing`). La firma de la versión vigente (clave, nombre y `DOWNLOAD_URL_TTL_SECONDS`, RNF-06) se extrae de `FileService` a `current-version-download.ts` y la usan los dos.
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
- Servicio: `PermissionResolver` (`levelFor`, `can`; `levelFor` lo usan `FolderService` y `FileService.getDetail` para el `accessLevel`, 012 CA-13). Sin `inheritedGrants` ni `IGrantRepository` (YAGNI): los heredados de la lista de accesos los da `IShareRepository.listAccess` de M3b (DF-85).
- Fragmentos SQL (funciones puras, exportadas por `index.ts`; DF-32, DF-85): `accessibleNodes(actor)` = propios vivos (`OWNER`) ∪ compartidos (`nodos_compartidos()`, `EDITOR` o `VIEWER`), solo para leer; con 012, `ownedNodes(actor)` (propios vivos), para toda escritura y destino; `ownedTrashedNodes` (006) y `ownedFiles` (016). Los roles internos reciben el conjunto vacío.
- Puertos → implementaciones: `IAccessPolicy` → `OwnerPolicy`, `EditorPolicy`, `ViewerPolicy` (**Strategy**); `IAccessLevelReader` → `SqlAccessLevelReader` (interno, consulta `accessibleNodes`).
- Dominio: `AccessLevel` = `OWNER | EDITOR | VIEWER`; `Action`.
- Tablas que lee: `archivo`, `carpeta`, `comparticion` (modelo de lectura). Función `nodos_compartidos()` (012, `STABLE`, `SECURITY DEFINER`, sin parámetros): la regla única de «qué se comparte conmigo» (directos y herencia por `carpeta.ruta`, del mismo propietario, nodos vivos, nivel mayor); lee `usuario.estado` (propietaria `activa`, CA-17), excepción acotada de `architecture.md` §3 regla 3. La usan el fragmento y las políticas RLS del destinatario.

### M3b `sharing`
- Controladores (012): `SharingController` (`POST /shares`, `GET /shares`, `DELETE /shares/:shareId`) y `ReceivedSharesController` (`GET /shares/received`, `DELETE /shares/received/:shareId`), `@Roles(Role.CLIENT)` y `no-store`. Con 013 (DF-86): `PublicLinksController` (`POST /public-links`, `GET /public-links?fileId`, `DELETE /public-links/:linkId`, `@Roles(Role.CLIENT)`) y `PublicLinkAccessController` (`POST /public-links/open` y `/download`, `@Public()`, `no-store` y `Referrer-Policy: no-referrer`).
- Servicios (con `actor` primero): `SharingService` (`share`, `listAccess`, `revoke`; autoriza con `PermissionResolver.can` y `Action.SHARE`/`VIEW_ACCESS_LIST`; límite con `IRateLimiter` y solo lectura con `WritableAccountPolicy` de `storage`) y, por SRP, `ReceivedSharesService` (`listReceived`, `leave`; sin `WritableAccountPolicy`, 010 RN-6); `share-records.ts` arma evento y bitácora de ambos. Con 013 (DF-86): `PublicLinkService` (`createLink`, `currentLink`, `revokeLink`; `can(CREATE_PUBLIC_LINK)`, `WritableAccountPolicy` al crear) y, por SRP, `PublicLinkAccessService` (`openLink`, `downloadLink`; recibe `{ token, ip }` sin `actor`, excepción de `architecture.md` §6 punto 11, ADR-0039); `public-link-records.ts` arma eventos y bitácoras de los dos.
- Puertos → implementaciones: `IShareRepository` (interno) → `TypeOrmShareRepository` (`findDirect`, `insert`, `updateLevel`, `listAccess`, `revoke`, `listReceived`, `findReceived`, `leave`; todo con `requireActorScope`); `IShareeDirectory` (lo declara `sharing` y lo exporta `index.ts`: `findClientByEmail`, `profiles`, `displayNames`) → `ShareeDirectoryAdapter` de M1 (DF-84); con 013 suma `activeDisplayName(userId)`. Con 013: `IPublicLinkRepository` (interno) → `TypeOrmPublicLinkRepository` (`findCurrent`, `findAvailable`, `replace`, `revoke`, `recordFailedAttempt`; todo con `requireActorScope`) e `IPublicLinkResolver` (interno, único acceso sin actor) → `SqlPublicLinkResolver` (solo llama `enlace_por_token`). Sin `ISecretCipher` (DF-10, YAGNI).
- Puertos que consume: `IAuditLogger` (lo declara e implementa T2 `audit`); `IRateLimiter`, `ITransactionRunner` e `IClock` (T1 `shared`); con 013, `IPasswordHasher` e `IAttemptLockout` (T1 `shared`, DF-10) y `LinkedFileGateway` (M2).
- Dominio: `UserShare` (`grant`, `changeLevel`, `rehydrate`, `toSnapshot`; rechaza `OWNER` y compartir consigo, DF-31) y `AccessList` (value object, `direct` e `inherited`). Con 013: `PublicLink` (`create`, `rehydrate`, `toSnapshot`, `statusAt(now)`, `requiresPassword`), `LinkToken` (segunda copia de `OpaqueToken`, PD-146) y `NetworkPrefix` (`forRecord` /24-/48, `forLimit` /32-/64); `AccessGrant` (abstracta) **no se crea** (DF-84, Art. V.2). Errores: `SharingInvalidLevelError`, `SharingInvalidRequestError`, `RecipientNotFoundError`, `CannotShareWithSelfError` (422) y `ShareNotFoundError` (404); con 013, `PublicLinkNotFoundError` y `PublicLinkUnavailableError` (404) y `PublicLinkPasswordInvalidError` (403).
- Tablas: `comparticion` (012); `enlace_publico` e `intento_acceso` con la 013, y la función `enlace_por_token` (ADR-0039).

### M4 `billing`
- Controladores: `PlansController` (`GET /api/v1/billing/plans`, público; spec 008, DF-67); `SubscriptionController` (subscribe, renew, changePlan, history, invoice). `listPlans` y `comparePlans` no se crean: el catálogo es una sola lectura y la comparación se arma en `web`.
- Servicios: `PlanCatalogService` (`list()` de los activos, spec 008; `listAll(actor)` con los desactivados, `create` y `deactivate` del Administrador, spec 011 T-09 y CA-8, CA-12), `SubscriptionAdministration` (fachada para `backoffice`: `planNamesFor`, `clientCountsByPlan(actor)`; la crea la 009 T-03 leyendo `suscripcion`; con 011b, DF-81: `limitsOf(actor, clientId)`, `adjustQuota(actor, cmd)` y `adjustValidity(actor, cmd)` con `limites_de_cuenta` (lectura) y las dos funciones de escritura `SECURITY DEFINER`; las reglas que dependen del estado viven en SQL y el repositorio traduce sus códigos), `SubscriptionService`, `PaymentService`; job `RenewalScheduler` (`@Cron`, usa `IClock`).
- Puertos → implementaciones: `IPaymentGateway` → `SimulatedPaymentGateway` (determinista: con la tarjeta presente aprueba `TEST_CARDS.approved` y `TEST_CARDS.recurringDeclined` (`0341`) y rechaza cualquier otra; al aprobar emite una referencia del instrumento y, en el cobro sin el cliente, decide por ella: la de `0341` se rechaza; sin `failureRate` ni `latencyMs`, DF-69, DF-77, ADR-0031); `IInvoiceGenerator` → `PdfInvoiceGenerator`; `IPlanRepository` → `TypeOrmPlanRepository` (interno de `billing`, spec 008, Art. V.2(b); desde la 011 en `application/ports/`, sobre `TransactionContext`); con 011b (DF-81): `ISubscriptionAdministrationRepository` → `TypeOrmSubscriptionAdministrationRepository` (llama a `limites_de_cuenta`, `ajustar_cuota_extra` y `extender_vigencia`, y traduce sus códigos de resultado); repos.
- Puertos que consume: `INotifier` (lo declara e implementa T4 `notifications`).
- Eventos que consume (ADR-0019): `identity.client-account-verified` → crea la suscripción Personal (001 D-4). El oyente es idempotente y se acompaña de una conciliación de las cuentas verificadas sin suscripción. Lo implementa la 009 (PD-40, 2026-09-29); la 006a no lo hace.
- 009 (DF-69): `AccountVerifiedListener` (`presentation/`, solo delega) → `PersonalSubscriptionService.subscribe(actor)` (alta Personal idempotente con `withActor`) → `ISubscriptionRepository` → `TypeOrmSubscriptionRepository` (sobre `TransactionContext`, RLS forzado). `PERSONAL_PLAN_SLUG` vive en `domain/plan-slug.ts`. Conciliación (CA-2): `SubscriptionReconcileProcessor` (cola `subscription-reconcile`, solo delega) → `SubscriptionReconcilerService.reconcileAll` → `VerifiedClientLister` de `identity` (sin actor, solo ids) y `PersonalSubscriptionService` por cliente; `BillingWorkerModule` lo monta en el `worker` con `IdentityReadersModule`. Cobro (T-04): `PaymentService.charge(actor, order)` → `IPaymentGateway` → `SimulatedPaymentGateway` (determinista) e `IPaymentRepository` → `TypeOrmPaymentRepository` (`transaccion`, referencia `SIM-` de la secuencia); devuelve `ChargeResult`, el `Payment` aprobado o rechazado, sin lanzar por un rechazo. `Money` guarda centavos; `breakdown` (IVA) vive en `contracts`. Suscribir (T-05): `SubscriptionController` → `SubscriptionService.subscribe` → `ISubscriptionRepository.lockCurrent` (`FOR UPDATE`) y `save`, `Subscription.subscribeTo` (`PAID_PLAN_PERIOD_DAYS`, solo desde Personal y a un plan con `isForSale`) y `PaymentService.charge`; el `402` lo lanza el controlador después del commit. Factura (T-06): `SubscriptionService` (límite, transacción, bitácora) → `SubscriptionCheckout` (pasos del cobro) → `InvoiceService.register` → `IInvoiceRepository` → `TypeOrmInvoiceRepository` (`factura`, número `NB-`), con el correo de `AccountContactReader` (`identity`). PDF (T-07): `SubscriptionService` emite después del commit con `InvoiceIssuer.issue` → `IInvoiceGenerator` (`PdfInvoiceGenerator`, `pdfkit`) e `IObjectStorage.putObject` (`invoices/{usuario}/{factura}.pdf`); `InvoiceRetrier.retryPending` (cola `invoice-retry`) repone las pendientes con `IPendingInvoiceScanner`. Aviso (T-08): `InvoiceIssuer` → `INotifier` (`notifications`) con `receiptMessage`. Lectura de la suscripción (T-03, PD-80): `PlanLimitsAdapter.limitsFor` → `ISubscriptionRepository.findCurrentPlanId` con `withActor` e `IPlanRepository` (sin fila, Personal); `SubscriptionAdministration` (fachada para `backoffice`) → `ISubscriptionAdministrationReader` (`SqlSubscriptionAdministrationReader`) sobre `nombres_de_plan_por_cliente` (solo `ADMIN`) y `conteo_de_clientes_por_plan` (`ADMIN`, `OPERATOR`), ADR-0021. Historial (T-09): `SubscriptionController` → `BillingHistoryService` → `IBillingHistoryReader` (`SqlBillingHistoryReader`, RLS) e `IObjectStorage.presignDownload` (5 min); `InvoiceNotFoundError` para ajena, inexistente o sin PDF. Módulos: `BillingModule` (núcleo), `BillingHttpModule` (`api`) y `BillingWorkerModule` (`worker`), estos dos con la instancia de `storage` de su raíz.
- Dominio: `Plan` con `PlanLimitsSet` (011 T-09: `create` valida CA-11 y deriva el `slug`, `deactivate` rechaza Personal y un plan ya desactivado; reemplaza al `PlanSummary` de la 008, PD-83); `Subscription` (pendingPlanId, isReadOnly, scheduleChange, applyPendingChange); `Payment`; `Invoice`; `Money`.
- Implementa hacia fuera: `IPlanLimitsProvider` (declarado por `storage`, DF-51 opción A; lo usan M2 y M5; se importa de `storage/index.ts`) e `IAgentQuota` (M6, lo declara `billing`) → DF-27. El `PlanLimits` de dominio de `Plan` es distinto del tipo `PlanLimits` de `storage`: se mapea al implementar el puerto. El catálogo público (008) no pasa por este puerto: `PlanCatalogService` lee `plan` por `IPlanRepository` (DF-67).
- Tablas: `plan`, `suscripcion`, `transaccion`, `factura`.

### M5 `editing`
- Controladores (plan 016, DF-70 a DF-74): `EditorController` (`POST /files/:fileId/edit-session`) y `OnlyOfficeController` (contenido y `callback`, públicos y autenticados por JWT). `versions` y `restore` son de la 014.
- Servicios: `EditSessionService` (abrir, cerrar sin cambios, revocar acceso), `PresenceService`, `SaveCallbackHandler`, `SaveVersionService` (trabajo `editing-save`, procesado en el `api`, ADR-0029) y `SaveFailedNotifier`. El `VersionHistoryService` del diagrama vive en M2 desde 014 (DF-17, DF-68); 016 registra sus versiones con `FileVersionService` y solo aporta la autoría. Sin gateway propio: la presencia se publica por el gateway único de T3 `realtime`, y `editing` autoriza la unión a la sala consultando `access` (DF-30, ADR-0010).
- Dominio: `EditSession` (estados `activa → guardando → cerrada | fallida`, `activa → sin_cambios`), `EditModePolicy` y `Participant`. `DocumentVersion` desaparece (ADR-0012, DF-18): la autoría sale de `participacion`.
- Puertos → implementaciones: `IDocumentEditor` → `OnlyOfficeEditor` (ADR-0004); `IEditSessionRepository` (renombre de `ISessionRepository`, DF-19); `IUserDirectory` → `UserDirectoryAdapter` de `identity` (DF-74; lo declara `editing`). `IIdempotencyStore` se descarta (DF-72). `editing` ya no encola la indexación: la versión editada se anuncia con `storage.file-version-created` y `IIndexQueue` es interno de `intelligence` (DF-78, cierra PD-18). `IVersionRepository` vive en M2 desde 014, interno de `storage` (la versión es de `storage`, ADR-0012, DF-68).
- Fachada que `editing` consume de `storage`: `EditableFileGateway` (`find`, `openContent`, `registerEditedVersion`); `IObjectStorage` suma `getObjectStream` y `putObjectStream`; `PlanLimits` suma `maxEditors` (DF-73; `retainedVersions` llegó con 014, DF-68).
- Tablas: `sesion_edicion` (`archivo_id` sin FK, DF-70) y `participacion` (N:M `participa`); `version_archivo` gana `sesion_edicion_id` `UNIQUE` con `CHECK` contra `origen` (DF-05).

### M6 `intelligence`
- Controladores (`@Roles(CLIENT)`): `IndexingController` (019, `GET /files/:fileId/indexing` y `POST /files/:fileId/indexing/retry`) y `AgentController` (020, `POST /agent/ask` en `text/event-stream` y `GET /agent/status`; DF-15, DF-82). Sin entidades de conversación (`Conversation` y `AgentQuery` descartadas, 020 RN-10).
- Servicios (020): `AgentService` (`ask`, `status`), `AgentAdmission` (tasa, pregunta, ámbito, indexados), `HybridRetriever` (keyword + vector + fuse) y `AnswerComposer` (prompt, `CitationMarkerFilter`, avisos y `done`); la cita trae `fileName`, leído en la misma consulta (enmienda de ADR-0036). Con 019: `IndexingService` (`indexVersion`, `giveUp`; el processor del diagrama es `IndexingProcessor`, que solo delega), `IndexingOutcomeRecorder` (estado, auditoría, bitácora y aviso), `IndexScheduler` (programa una versión; lo usan el oyente y la conciliación), `IndexStatusService` (`get`, `retry`), `IndexReconciler`, `Chunker` y `ExtractorRegistry` (**Registry**: única fuente de qué tipos se indexan).
- Procesadores y oyentes (DF-78): `FileVersionCreatedListener` (escucha `storage.file-version-created`, en el `api`), `IndexingProcessor` (cola `indexing`) e `IndexReconcileProcessor` (cola `index-reconcile`) en el `worker`, e `IndexStatusRelay` (cola `index-status`, en el `api`).
- Puertos → implementaciones (todos **internos**; ninguno cruza módulos): `ILanguageModel` → `GeminiFlashModel` (020); `IEmbeddingProvider` → `GeminiEmbeddingProvider` (REST, ADR-0033); `ITextExtractor` → `DocxExtractor`, `PdfExtractor`, `PlainTextExtractor`, `XlsxExtractor`, `PptxExtractor` (**abierto/cerrado**); `IIndexQueue` → `BullmqIndexQueue` (cola `indexing`; ya **no** `editing → intelligence`, DF-78); `ICommandRunner` → `ChildProcessRunner` (viene de M7: 019 lo necesita antes y `intelligence` no puede importar `optimizer`; interno hasta que 021 lo reutilice, DF-80); `IIndexStatusNotifier` → `RealtimeIndexStatusNotifier` (`api`) y `QueuedIndexStatusNotifier` (`worker`); `IIndexingRepository`, `IChunkRepository` (`replaceForVersion`, `findByFile(actor, …)`; escritura del `worker`); `IChunkSearch` → `TypeOrmChunkSearch` (020, solo lectura: `keywordSearch`, `vectorSearch`, `hasIndexed`, `scopeExists`, con `accessibleNodes`, versión vigente y ámbito en la misma consulta; reemplaza a `nearest`, DF-83); `IAgentQuota` → `billing` (020).
- Dominio: `FileIndexing` (estados `pendiente → indexando → indexado | no_indexable | fallido`, `fallido → pendiente`, con `reason`), `Segment`, `Chunk` con `SourceLocation` (abstracta: `groupKey()`, `mergeWith()`, `label()`, `isCertain()`, `toJson()`) ← `PdfLocation` (page), `DocxLocation` (section, rango de párrafos), `TextLocation` (rango de líneas), `SheetLocation` (hoja) y `SlideLocation` (diapositiva) (DF-79); `confidence` + `isCertain()`. Errores: `NotIndexableError`, `EmbeddingUnavailableError`, `ContentReadError` e `IndexingNotRetryableError`.
- Tablas: `indexacion` (una fila por versión, `estado` y `motivo` con `CHECK`), `fragmento` (`archivo_id`, `version_archivo_id`, `orden`, `procedencia jsonb`, `embedding vector(768)`, `texto_busq tsvector` generado), ambas con RLS (`ENABLE` + `FORCE`). Sin `conversacion`, `consulta_agente` ni `cita` (020 RN-10, DF-08); el contador del agente es `uso_agente`, de `billing`.
- Diagrama «Indexación» sin redibujar (PD-129): sigue mostrando `editing → IIndexQueue → intelligence` y las clases anteriores a 019.

### M7 `optimizer`
- Controlador: `OptimizerController` (estimate, run, restoreOriginal).
- Servicios: `OptimizationService`; processor `OptimizationProcessor`.
- Puertos → implementaciones: `IOptimizer` ← `BaseOptimizer` (abstracta, **Template Method**) ← `PdfOptimizer`, `ImageOptimizer`; `IIntegrityValidator` → `DefaultIntegrityValidator`; `ICommandRunner` → `ChildProcessRunner` (hoy **interno de `intelligence`** desde la 019, DF-80; 021 lo mueve a `shared` al ser el segundo consumidor); `IJobRepository`, `IJobQueue`.
- Dominio: `OptimizationJob`; `SavingsEstimate` (value object, `isWorthIt(min)`).
- Tablas: `optimizacion` (+ `trabajo`, ver DF-22).

### M8 `backoffice`
- Controladores (DF-36), con 011: ya existen `ClientFilesController` (`GET /backoffice/client-files`, `ADMIN` y `SUPPORT`), `AccountsController` (`/backoffice/accounts*`, solo `ADMIN`), `MetricsController` (`GET /backoffice/metrics`, `ADMIN` y `OPERATOR`) y `PlansController` (`/backoffice/plans*`, solo `ADMIN`). Con 011b (DF-81): `AccountAdjustmentsController` (`GET/PUT/DELETE /backoffice/accounts/:id/limits|quota|validity`, `ADMIN`) y `ClientTrashController` (`GET /backoffice/client-trash`, `POST /backoffice/client-trash/:nodeId/restore`, `SUPPORT`). El diagrama tiene un solo `BackofficeController` (DF-65). `HealthController` se movió a T1 `shared` (DF-49).
- Servicios (011, DF-65): `InternalActionService` por **composición**, no clase abstracta: `read(actor, work)` y `run(actor, action)` ponen transacción, actor interno activo y evento de auditoría en la misma transacción; `SupportService` (metadatos de un cliente), `AdminService` (lista y ficha con `read`; suspender, reactivar y alta interna con `run` y el candado del padrón; compone `AccountDirectory`, `AccountAdministration` e `InternalAccountEnrollment` de `identity` con `SubscriptionAdministration.planNamesFor` de `billing`; el correo del alta sale después del commit), `InitialAdminBootstrapper` (primer Administrador por comando, CA-7), `MetricsService` (tablero con `read`: `AccountDirectory.statistics` de `identity`, `SubscriptionAdministration.clientCountsByPlan` y `PlanCatalogService.listAll` de `billing`; activos siempre, desactivados solo con clientes) y `CatalogAdminService` (catálogo: lista, alta y desactivación con `run`), que ya existen; con 011b (DF-81): `AccountAdjustmentsService` (compone `AccountDirectory` y `SubscriptionAdministration`; `InternalAction.event` puede devolver una lista y `run` registra cada evento en orden, así extender la vigencia suma `subscription.read_only_exited` sin cambiar a los demás llamadores) y `ClientTrashService` (resuelve el correo y audita); y `BackofficeRateLimiter` (límite de tasa por cuenta interna, T-14), que `InternalActionService` consulta antes de la transacción. `InternalActionService` anota `backoffice.actor.inactive` ante un `ActorNotActiveError` de `identity`. `JobMonitorService` llega con su spec. Sin guards: el diagrama tiene `RolesGuard`, pero se movió a T1 `shared` con los guards globales (DF-50, spec 003 D-2); los controladores de M8 declaran `@Roles(...)`.
- Puertos que consume (de `shared`): `IAuditLogger` (el evento de la acción), `IRateLimiter` (el límite de tasa por cuenta) e `ITransactionRunner` (la transacción con actor).
- Puertos → implementaciones: `IQueueInspector` → `BullMqInspector`; `INodeMetadataReader` → `SqlNodeMetadataReader` (lo declara e implementa `storage`, M2). `IHealthIndicator` y sus indicadores se movieron a T1 (DF-49); ~~`OnlyOfficeHealthIndicator` (DF-29) lo aporta `editing` y se registra en la raíz de composición~~ omitido (PD-113): `editing` revisa ONLYOFFICE con `IDocumentEditor.isAvailable` en cada apertura.
- Tipos: `Actor` (actor que ejecuta; vive en `shared`). Error: `ClientNotFoundError` (404), `InvalidBackofficeQueryError` (400) e `InvalidBackofficeInputError` (422, 011b).

### T1 `shared` (spec 000; guards con 003)
- Controlador: `HealthController` (live, ready) — `@Public()`, sin autenticación; nunca expone topología.
- Guards globales (spec 003 D-2, DF-50): `JwtAuthGuard` y `RolesGuard` (`CanActivate`), registrados para toda la API y que **niegan por defecto**. `JwtAuthGuard` verifica el token con el puerto token→`Actor` que declara `shared` y que implementa `identity` (002 D-14; nombre en el plan 003) y construye el `Actor`; `RolesGuard` comprueba `@Roles(...)`. Decoradores `@Public()` y `@Roles(...)`: toda ruta declara uno de los dos (003 D-10). El handshake de T3 `realtime` usa el mismo puerto, que desde 015 devuelve también `expiresAt` en una verificación válida (DF-76).
- Persistencia con actor: `withActor()` fija `app.actor_id` y `app.actor_role` por transacción para RLS (ADR-0005, 003 D-7).
- Servicio: `HealthService` (`ready()`: ejecuta los `IHealthIndicator` en paralelo con tiempo límite; agrega `up`/`down`).
- Puertos → implementaciones:
  - `IHealthIndicator` → `PostgresHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator` (DF-29 parcial);
  - `IClock` → `SystemClock` (infraestructura), `FixedClock` (dominio, para pruebas);
  - con 019 (DF-80): `IDomainEventPublisher` → `EventEmitterDomainEventPublisher` (publica en proceso; un oyente que lanza se registra y no se propaga; lo usa `storage`, y `identity` y `realtime` migran después, PD-125);
  - con 001, `IRateLimiter` → `RedisRateLimiter`, con ventana deslizante en Redis (lo consumen M1 y M3b; PD-30);
  - con 013 (plan 013 D-2, DF-10, `architecture.md` §3 regla 8): `IPasswordHasher` → `Argon2idHasher` (VO `PasswordHash` en `shared/domain`) e `IAttemptLockout` → `RedisAttemptLockout`, movidos desde M1 sin cambio de firma; los consumen M1 y M3b;
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
- Acciones de compartición (012): `SHARE_GRANTED`, `SHARE_LEVEL_CHANGED` y `SHARE_REVOKED` (`share.granted`, `share.level_changed`, `share.revoked`), tipo de recurso `file`/`folder` y atributos `nodeType` y `level`; afectado = propietario (CA-19). Salir (CA-23) escribe `share.revoked` en la actividad de la propietaria con el destinatario como actor: lo admite solo la política `evento_auditoria_salir_comparticion` (migración `20261101100300`), con el evento exacto y `ocurrido_en` en `now() ± 5 min`.
- Tabla: `evento_auditoria` (004).

### T3 `realtime` (spec 015; DF-76 recoge lo que el diagrama no trae)
- Único gateway Socket.IO (ADR-0030, sin adaptador de Redis: PD-106): handshake autenticado con el puerto token→`Actor` de `shared` (sin depender de `identity`), salas por usuario (`user:<id>`) y por documento (`doc:<id>`). No conoce permisos (ADR-0010): el módulo dueño del documento decide quién entra.
- Presentación: `RealtimeGateway` (registra el *middleware* de *handshake*, une a la sala del usuario, programa el cierre y responde `room.join` siempre con `SHARED_FORBIDDEN`). Sin `PresenceGateway` (DF-30).
- Aplicación: `ConnectionAdmission` (límite de intentos por origen con `IRateLimiter` → verificación del token → solo `CLIENT`; produce `Actor` y `expiresAt`) y `RealtimeConfig`.
- Puertos de frontera que declara y exporta en su `index.ts`, segregados por consumidor (ISP):
  - `IRealtimePublisher` (`toUser(userId, notice)`, `toDocument(documentId, notice)`, con `RealtimeNotice { event, payload }`; síncronos, nunca lanzan): lo usan `storage`, `editing`, `intelligence` y `notifications`;
  - `IDocumentRooms` (`admit(actor, connectionId, documentId)`, que lanza `ForbiddenError` si la conexión no es del actor o no existe, y `retire(userId, documentId)`): solo el dueño de la sala (`editing`, 016).
- Infraestructura: `SocketIoHub` implementa los dos puertos (un solo adaptador) y emite el evento en proceso `realtime.document-left` (`DocumentLeftEvent { userId, connectionId, documentId }`, ADR-0019) por cada sala de documento que deja una conexión, sea cierre limpio, vencimiento del token o caída detectada por el latido (≤ 60 s, RN-9); un oyente que lanza se registra y no corta el cierre. `ConnectionLifetime` cierra la conexión al llegar el `expiresAt` del token (lo devuelve el puerto token→`Actor` de T1 desde 015). `RealtimeIoAdapter` aplica ruta, CORS por origen exacto y latido.
- Tablas: ninguna (salas en memoria del proceso `api`).

### T4 `notifications`
- Responsabilidad: correo transaccional y notificaciones al usuario (DF-34, ADR-0010). No conoce las reglas de negocio de quien lo usa: recibe qué enviar y a quién. Dueño de la tabla `notificacion` y de la cola `mail` del `worker`.
- Puertos que declara y exporta en su `index.ts`, segregados por consumidor (ISP): `IMailer` (lo consume `identity`: verificación, recuperación y avisos de cuenta) e `INotifier` (lo consume `billing`). Los declara el transversal, no el consumidor, para que `notifications` nunca importe un módulo de negocio (`architecture.md` §3, regla 5).
- Implementaciones:
  - `IMailer` → `SmtpMailer`. En el `api` encola en `mail` con `jobId = idempotencyKey` (spec 001 D-11);
  - `MailProcessor` («processor», en el `worker») entrega con `SmtpTransport`, un envoltorio de nodemailer, y aplica la idempotencia: marca en Redis y `Message-ID` determinista (ADR-0018);
  - `MailMessage` = `{ to, subject, text, html, idempotencyKey, tag, recipientId? }`;
  - el destino SMTP es Mailpit en local y el SMTP de Resend en staging (001 D-12). Solo el `worker` tiene las credenciales SMTP;
  - `INotifier` → `MailNotifier` (spec 009): único canal el correo, delega en `IMailer` con el mismo `MailMessage` y la clave `billing.receipt.<transaccion_id>`.
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
| `FileVersion` / `DocumentVersion` | `version_archivo` | `origen` = carga / edicion / restauracion / optimizacion (ADR-0012). Con 005: `clave_objeto` única (`u/{propietario}/{archivo}/{version}`), `creado_por`; sin `checksum` ni `sesion_edicion_id`; RLS, sin política para roles internos. Con 014 (DF-68): `numero` (consecutivo por archivo, `UNIQUE (archivo_id, numero)` y `CHECK > 0`; la actual es la de mayor número y no se reutiliza tras una poda) y `restaurada_de_numero` (sin FK, entre 1 y `numero - 1`). Con 014b (DF-21): `conservada_hasta` (`timestamptz` nula = cuenta en `espacio_usado`; con fecha = original conservado por una optimización, no cuenta y se purga en esa fecha; `CHECK > creada_en` e índice parcial) |
| `UploadSession` | `carga` | Reserva de cuota mientras está `activa`; `upload_id` y `clave_objeto` nunca salen de la API; RLS solo para el propietario; `archivo_id`/`version_id` reservados sin FK; con 006, `carpeta_destino_id` sin FK (DF-61); con 014, `reemplaza` (la carga crea una versión nueva de un archivo existente, DF-68). DF-33 parcial, ADR-0021 |
| (uso de espacio) | `usuario.espacio_usado` | Atributo almacenado (`bigint`, `CHECK >= 0`, DF-38); `storage` lo escribe por excepción (DF-59) |
| `UserShare` | `comparticion` | Con 012 (DF-31, DF-85): `propietario_id`, `destinatario_id` (FK a `usuario`), `archivo_id` o `carpeta_id` (FK con `ON DELETE CASCADE`, `CHECK` de exactamente uno, ADR-0011), `nivel` (`CHECK IN ('EDITOR','VIEWER')`), `creado_en`, `actualizado_en`; `CHECK destinatario_id <> propietario_id`. Únicas parciales `(archivo_id, destinatario_id)` y `(carpeta_id, destinatario_id)`; índice `(destinatario_id)`. RLS `ENABLE` + `FORCE`: el propietario todo sobre nodos propios; el destinatario `SELECT` y `DELETE` (Salir); sin política para roles internos. La regla de lo compartido vive en la función `nodos_compartidos()` (M3a). Desde 012, `archivo.carpeta_id`, `archivo/carpeta.eliminado_con_carpeta_id` y `carpeta.carpeta_padre_id` son FK compuestas con `propietario_id` (`uq_carpeta_id_propietario`) |
| `PublicLink` | `enlace_publico` | Con 013 (DF-09, DF-86): `id uuid` (no el token), `token_hash char(64)` único con `CHECK` hexadecimal, `clave_hash` (PHC Argon2id o `NULL`, DF-10), `archivo_id` (FK con `ON DELETE CASCADE`; solo archivos, sin `carpeta_id`), `propietario_id`, `vence_en`, `creado_en`, `revocado_en`; único parcial `(archivo_id) WHERE revocado_en IS NULL`. RLS `ENABLE` + `FORCE` del propietario (cliente) y `enlace_publico_por_token` (`TO CURRENT_USER`) para la función `enlace_por_token` (ADR-0039); para `nimbo_app`, sin `DELETE` y con `UPDATE` solo de `revocado_en` |
| (intentos) | `intento_acceso` | Con 013 (RNF-08, DF-86): `enlace_id` (FK `ON DELETE CASCADE`), `propietario_id`, `red_origen cidr` (/24 o /48), `ocurrido_en`; solo `INSERT` para `nimbo_app` (lector y retención: PD-145) |
| `Plan` + `PlanLimits` | `plan` | Bytes `bigint` y precio en centavos (DF-24, DF-23, ADR-0016) |
| `Subscription` | `suscripcion` | Con 011b: `cuota_extra_bytes` y `cuota_extra_hasta`; `vence_en` (E-R: `fin`), `estado`, avisos y `plan_pendiente_id` de 010 |
| `Payment` | `transaccion` | |
| `Invoice` | `factura` | |
| `EditSession` | `sesion_edicion` | |
| `Participant` | `participacion` | Tabla de la relación N:M `participa` |
| `FileIndexing` | `indexacion` | Estado por versión, con motivo (019, DF-79) |
| `Chunk` | `fragmento` | Con `archivo_id`, `orden` y `procedencia jsonb` (019, DF-79) |
| (conversación, consulta) | ~~`conversacion`, `consulta_agente`, `cita`~~ | No existen: sin historial (020 RN-10, DF-08, DF-15) |
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
