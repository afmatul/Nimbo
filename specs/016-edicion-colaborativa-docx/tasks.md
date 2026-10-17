# Tareas 016 — Edición colaborativa de .docx

> Spec: `./spec.md` · Plan: `./plan.md` (aprobado por Adrián 2026-10-16; ADR-0004/0029 y DF-05, 19, 20, 39, 66–70 aceptados)
> 11 tareas verticales, un commit cada una (`feat(editing): … [016 T-xx]`). Toda tarea de lógica empieza por su prueba.
> Prefijos abreviados: `editing/` = `apps/api/src/modules/editing/`; `storage/` = `apps/api/src/modules/storage/`; `test/` = `apps/api/test/`.
> Constitución, siempre: funciones ≤ 30 líneas y ≤ 3 parámetros (entradas con objetos nombrados: `OpenSessionInput`, `EditedVersionInput`).
> Las pruebas inyectan su propio stub de `IPlanLimitsProvider` (`test/support/fake-plan-limits.provider.ts`) y un doble de `IDocumentEditor`; no dependen del andamiaje.
> Verificación mínima de cada tarea: `pnpm lint && pnpm typecheck` y `pnpm test`; más lo que indique la tarea (`pnpm test:int`, `pnpm test:isolation`, `pnpm env:check`).

- [x] **T-01** Dominio de edición y frontera del módulo. Primero `edit-mode-policy.spec.ts` (tabla: nivel Lector/Propietario/Editor, plan de la **propietaria** con `maxEditors` 0/3/5, quién abre, editores activos, tamaño, tipo → `{mode, readOnlyReason}`; cubre `EDITING_VIEW_ONLY`, `EDITING_PLAN_READ_ONLY`, `EDITING_OWNER_PLAN_READ_ONLY`, `EDITING_LIMIT_REACHED`, `EDITING_FILE_TOO_LARGE` y formato no `.docx`) y `edit-session.spec.ts` (transiciones válidas e inválidas `activa → guardando → cerrada | fallida`, `activa → sin_cambios`; solo el estado 2 llega a `guardando`). Luego `EditSession`, `EditModePolicy`, errores 422/503/409, contratos zod y `EDITING_ERROR_CODES` en `packages/contracts/src/editing/*`. **Lint**: `boundaries.js` (`identity: ['notifications','audit','editing']`, `editing: ['storage','access','realtime','audit']`), `module-graph.spec.ts` con el mismo grafo, `editing/README.md` y el fixture negativo `editing-imports-billing.ts` (debe fallar el lint; `cycles.js` verde). Esto deja probado de punta a punta el cálculo del modo y el grafo de módulos que lo protege. — CA: CA-1, CA-3, CA-4, CA-5, CA-7, CA-9, CA-11, CA-14 (máquina de estados), CA-21, CA-22 (reglas) — Archivos: `editing/domain/{edit-session,edit-mode-policy,errors/*}.ts` y specs, `packages/contracts/src/editing/*`, `packages/config/eslint/boundaries.js`, `module-graph.spec.ts`, `editing/README.md`, fixture `editing-imports-billing.ts` — Verificar: `pnpm lint && pnpm typecheck`, `pnpm test`

- [x] **T-02** Migraciones y registro de versión de edición en `storage`. Primero `test/int/editing/migrations.int-spec.ts` (`up`, `down`, `UNIQUE uq_sesion_edicion_abierta`, `uq_version_archivo_sesion_edicion`, `ck_version_archivo_sesion_origen`, RLS: sin política para roles internos ni sin actor) y `quota-overdraft.int-spec.ts` + `registered-edited-version.int-spec.ts` (versión nueva vigente con `origen='edicion'`; cuenta sin cuota libre guarda igual y la carga siguiente da `STORAGE_QUOTA_EXCEEDED`; poda a `retainedVersions` sin violar `ck_usuario_espacio_usado`; `versionId` repetido = éxito). Luego migraciones `20261016100000` y `20261016100100` (con `down`), `FileVersion.fromEdit`, `IFileVersionRepository` interno, `EditedVersionRegistrar` (`lockUsage` → valida `docx` con `IFileTypeDetector` → inserta → puntero → `addUsedBytes` sin validar cuota → poda; borrado de objetos podados tras el commit), `IObjectStorage.getObjectStream/putObject` (flujo, adaptador MinIO) y `EditableFileGateway` exportado (`find`, `openContent`, `registerEditedVersion`), `PlanLimits.maxEditors`/`retainedVersions` llenados por `PlanLimitsAdapter.toLimits`, acciones de auditoría `file.version_created`, `edit.session_opened`, `edit.save_failed`. — CA: CA-13, CA-20; soporte de CA-9, CA-10 — Archivos: `…/migrations/20261016100000-*.ts`, `…/20261016100100-*.ts`, `storage/application/{editable-file.gateway,edited-version.registrar}.ts`, `storage/application/ports/{i-file-version.repository.port,i-object-storage.port}.ts`, `storage/domain/file-version.ts`, `storage/infrastructure/*` (repositorio, MinIO), `storage/index.ts`, `storage/**/plan-limits.ts`, `billing/infrastructure/adapters/plan-limits.adapter.ts`, `audit/{audit-action,audit-catalog}.ts`, specs correspondientes, `test/int/editing/{migrations,quota-overdraft,registered-edited-version}.int-spec.ts` — Depende: T-01 — Verificar: `pnpm test:int`, `pnpm --filter api migration:run` y `migration:revert`

- [x] **T-03** Abrir sesión: `POST /files/:fileId/edit-session` y contenido firmado, con andamiaje de plan. Primero `test/int/editing/open-session.int-spec.ts` (feliz con plan de pago por stub: 200 `mode:'edit'`; ajeno/papelera/inexistente → 404 sin sesión; `.xlsx` → `EDITING_UNSUPPORTED_FORMAT`; lector, Personal, límite, tamaño → `view` con su `readOnlyReason`; rol interno → `SHARED_FORBIDDEN` sin participación; sesión `guardando` → 409; el `GET /editing/content/:token` entrega el flujo y responde 404 uniforme con token inválido, vencido, de otro `typ` o sesión no activa) y `degradation.int-spec.ts` (ONLYOFFICE o variables ausentes → `EDITING_UNAVAILABLE` 503 y `GET /files`, subir y descargar responden igual). Luego `EditSessionService.open` (reutiliza la sesión activa o la crea; alta de `participacion` bajo `FOR UPDATE`), `IEditSessionRepository` (+ `typeorm-edit-session.repository.ts`, ORM de sesión y participación), `ContentLinkSigner`, `EditingConfig`, `IDocumentEditor` + `OnlyOfficeEditor` (`signConfig`, `isAvailable`), `OnlyOfficeHealthIndicator` en `HealthModule.forRoot`, `IUserDirectory` + `UserDirectoryAdapter` + `UserDirectoryBindingModule` (nombre visible del servidor en `config.user.name`, RN-12), `EditorController`, `OnlyOfficeController` (solo `GET content` aquí), `EditingModule`, variables `ONLYOFFICE_*`, `EDITING_CALLBACK_BASE_URL`, `EDITING_MAX_DOC_BYTES` en `env.schema.ts`/`.env.example`/`ambientes.md`/`compose.yml` (`ALLOW_PRIVATE_IP_ADDRESS` solo local/staging). **Andamiaje temporal** `apps/api/src/dev-scaffold/` (`DevPaidPlanBindingModule`, `DevPaidPlanLimitsProvider`, `planLimitsBinding()`, `DEV_FORCE_PAID_PLAN` solo con `APP_ENV` local/test, lanza al arrancar si no) y el cambio de una línea en `app.module.ts`, con su spec. — CA: CA-1, CA-2, CA-3, CA-4, CA-5, CA-7, CA-15, CA-17, CA-21, CA-22 (integración) — Archivos: `editing/application/{edit-session.service,content-link.signer,editing-config,ports/*}.ts`, `editing/infrastructure/{onlyoffice-editor,onlyoffice.health-indicator,typeorm-edit-session.repository,edit-session.orm-entity,participation.orm-entity}.ts`, `editing/presentation/{editor,onlyoffice}.controller.ts`, `editing/{editing.module,index}.ts`, `identity/infrastructure/adapters/user-directory.adapter.ts`, `apps/api/src/user-directory-binding.module.ts`, `apps/api/src/dev-scaffold/*`, `app.module.ts`, `shared/infrastructure/config/env.schema.ts`, `.env.example`, `compose.yml`, `docs/ambientes.md`, `test/int/editing/{open-session,degradation}.int-spec.ts` — Depende: T-02 — Verificar: `pnpm test:int`, `pnpm env:check`, `pnpm lint && pnpm typecheck`

- [x] **T-04** Presencia, salida y revocación en vivo. Primero `test/int/editing/presence.int-spec.ts` (Socket.IO real, patrón de `test/int/realtime`: dos participantes ven la lista con sus nombres reales y se actualiza al entrar o salir; cierre de pestaña o corte de red → los demás dejan de verlo y su plaza queda libre para el límite en ≤ 60 s; `revokeAccess` saca de la sala y deja de recibir avisos, lo escrito antes se conserva) y `user-directory.int-spec.ts` (los nombres salen de `IUserDirectory`, el cliente no envía nombre; el adaptador devuelve solo `id → nombre`). Luego `PresenceService` (`IDocumentRooms.admit`, publicación `editing.presence {participants, editors, maxEditors}` por `toDocument`, `@OnEvent(REALTIME_DOCUMENT_LEFT)` idempotente que cierra `participacion.salio_en`) y `EditSessionService.revokeAccess(fileId, userId)` (`retire` + `dropUser`); `connectionId` opcional en la apertura. — CA: CA-6, CA-7 (plaza liberada), CA-8, CA-16 — Archivos: `editing/application/{presence.service,edit-session.service}.ts`, `editing/infrastructure/onlyoffice-editor.ts` (`dropUser`), `editing/editing.module.ts`, `test/int/editing/{presence,user-directory}.int-spec.ts` — Depende: T-03 — Verificar: `pnpm test:int`, `pnpm lint && pnpm typecheck`

- [x] **T-05** Guardado firmado: callback → cola → versión. Primero `test/int/editing/save-version.int-spec.ts` (callback estado 2 con JWT válido responde `{"error":0}` sin procesar en la petición y encola; el procesador crea **una** versión vigente `origen='edicion'` con `creado_por` = quien abrió y autores = todos los que entraron como editor aunque salieran; mismo aviso dos veces = una versión; estado 4 y guardado forzado (6) = sin versión; reindexación encolada por `IIndexQueue` aun sin consumidor; poda según plan; el estado 1 reconcilia presencia y revalida acceso) y `callback-security.int-spec.ts` en lo de firma (JWT inválido o `alg` ≠ HS256 → `{"error":1}`, URL de otro origen u origen parecido, redirección y sesión no activa → nada descargado ni cambiado). Luego `SaveCallbackHandler`, cola `editing-save` (`SaveVersionQueue`, 3 intentos, espera exponencial, `jobId` = sesión), `SaveVersionProcessor` en el `api` (concurrencia 1), `SaveVersionService` (relee la sesión con `withActor(createActor(oid))`, `versionId` uuid v5 de `sessionId`, UNIQUE violado = éxito, cierra sesión, publica `editing.version-saved`, audita sin URLs ni nombres), `OnlyOfficeEditor.verifyCallback/download` (lista blanca por origen, sin redirecciones, tope `2 × EDITING_MAX_DOC_BYTES`), `POST /editing/callback` con `callbackUrl` firmado. — CA: CA-9, CA-10, CA-11, CA-12, CA-13, CA-19, CA-20 — Archivos: `editing/application/{save-callback.handler,save-version.service}.ts`, `editing/infrastructure/{save-version.queue,save-version.processor,onlyoffice-editor}.ts`, `editing/presentation/onlyoffice.controller.ts`, `editing/editing.module.ts`, `test/int/editing/{save-version,callback-security}.int-spec.ts` — Depende: T-02, T-04 — Verificar: `pnpm test:int`, `pnpm lint && pnpm typecheck`

- [x] **T-06** Guardado fallido: archivo íntegro o nada, aviso y banner. Primero ampliar `callback-security.int-spec.ts` (archivo corrupto o incompleto → sesión `fallida/integridad` y versión vigente intacta; archivo purgado en sesión → `fallida/archivo_purgado`; estado 3 → `fallida/editor`; fallo transitorio que se recupera al reintentar no marca `fallida`; solo tras el 3.er intento; cada participante y la propietaria reciben `editing.save-failed {sessionId, fileId}` por `toUser`; al reabrir, `lastSaveFailed: true` y «Abrir el editor de nuevo» abre sesión nueva sobre la versión vigente sin reprocesar; con archivo purgado no hay banner y la apertura responde 404). Luego `SaveFailedNotifier` (reutilizado por el estado 3 y el procesador), manejo de agotamiento de intentos en el procesador, `findLatestFor(actor, fileId)` y `lastSaveFailed` en la respuesta de apertura, auditoría `edit.save_failed` con `reason`. — CA: CA-14 (servidor) — Archivos: `editing/application/{save-failed-notifier,save-version.service,edit-session.service}.ts`, `editing/infrastructure/{save-version.processor,typeorm-edit-session.repository}.ts`, `test/int/editing/callback-security.int-spec.ts` — Depende: T-05 — Verificar: `pnpm test:int`, `pnpm lint && pnpm typecheck`

- [x] **T-07** Aislamiento (bloqueante; lo revisa `security-auditor`). `test/isolation/editing.iso-spec.ts`: A y B con documentos distintos y casi idénticos; A edita y B, con varias conexiones, pidiendo `room.join` a `doc:` de A, abriendo la sesión de A, solicitando el contenido con un token de otro documento y enviando **callbacks falsificados** (firma inválida, firma válida de otra clave `sid`, URL fuera de la lista blanca, `oid` ajeno), no recibe presencia, avisos ni versión de A, y el archivo y la versión vigente de A no cambian; roles internos no ven filas de `sesion_edicion` ni `participacion`. Entra a `pnpm test:isolation`. — CA: CA-18, CA-19 (con avisos falsificados) — RNF-05 — Archivos: `test/isolation/editing.iso-spec.ts` (+ soporte en `test/support/*` si hace falta) — Depende: T-06 — Verificar: `pnpm test:isolation`

- [x] **T-08** Pantalla del editor con presencia y sus estados. Primero `features/editing/*.spec.tsx` (componente, `socket.io-client` y `IDocumentEditor` de ONLYOFFICE simulados, más axe): `coeditando` («Estás editando con 2 personas más», lista que se actualiza), `cargando`, `limite-editores`, `solo-lectura-lector`, `solo-lectura-plan`, `solo-lectura-vencida`, `solo-lectura-tamano`, `solo-lectura-plan-propietario` (sin «Ver planes» ni «Renovar plan»), `no-disponible` (`StateView`, «Tus archivos siguen a salvo»); el texto sale solo de `readOnlyReason`/código. Luego `useRealtime()` (consume el `RealtimeProvider` de 015; reabre con token renovado), `app/(app)/(cliente)/editor/[fileId]/page.tsx`, panel de presencia, cliente de contratos zod, acción «Editar» solo para `.docx` y oculta a roles internos, carga del script de ONLYOFFICE desde `documentServerUrl`. Solo tokens de `ui-guidelines.md`, sin colores a mano; ignora atribución por párrafo, firma y sugerencias del mockup. — CA: CA-1, CA-3, CA-5, CA-6, CA-7, CA-15, CA-21, CA-22 (UI), CA-17 (sin acción) — Archivos: `apps/web/src/app/(app)/(cliente)/editor/[fileId]/page.tsx`, `apps/web/src/features/editing/*` (`use-realtime.ts`, panel de presencia, estados, cliente HTTP) y specs — Depende: T-04, T-06 (contrato de apertura) — Verificar: `pnpm lint && pnpm typecheck`, `pnpm test`

- [x] **T-09** Aviso de guardado fallido en cualquier pantalla y banner al reabrir. Primero `save-failed-listener.spec.tsx` y `save-failed-banner.spec.tsx` (componente, axe): al llegar `editing.save-failed` en cualquier ruta del shell aparece un aviso persistente sin toast (ADR-0024); el banner «No pudimos guardar tus cambios. Tu versión anterior está intacta. Reintenta» aparece cuando `lastSaveFailed` y «Abrir el editor de nuevo» vuelve a llamar a `POST /files/:fileId/edit-session` y lo oculta. Luego el oyente montado en `(app)/layout.tsx` junto al `RealtimeProvider`, el banner en el estado `guardado-fallido` y la limpieza al abrir la sesión nueva. — CA: CA-14 (UI) — Archivos: `apps/web/src/features/editing/{save-failed-listener,save-failed-banner}.tsx` y specs, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/(cliente)/editor/[fileId]/page.tsx` — Depende: T-08 — Verificar: `pnpm lint && pnpm typecheck`, `pnpm test`

- [x] **T-10** **(humana, Adrián)** Recorrido de la demo con ONLYOFFICE real: `docker compose up -d`, `docker compose --profile onlyoffice up -d`, `DEV_FORCE_PAID_PLAN=pro` con `APP_ENV=local` y `pnpm dev`. Subir un `.docx`; abrirlo y editarlo; abrirlo con **la misma cuenta** en una segunda sesión del navegador (incógnito u otro navegador) y ver la coedición en vivo y la presencia con el nombre real una sola vez; desconectar una de las dos y ver que la otra deja de verla en ≤ 60 s; cerrar todas las pestañas y comprobar la versión nueva con su participante; cerrar sin cambios (sin versión); apagar ONLYOFFICE y ver «El editor no está disponible» con subir/descargar normales; forzar un guardado fallido y ver el aviso y el banner; confirmar que Soporte no ve acción de edición. Smoke del contenedor real (alcanzabilidad `host.docker.internal`, lista blanca de origen de la URL de descarga) y valoración del tope de 50 MB. Nota en el PR. **Sin 012 no hay segunda cuenta con acceso** (`accessibleNodes` solo devuelve lo propio y el límite cuenta cuentas, no pestañas): la presencia con varios nombres (CA-6), el límite de Pro con solo lectura (CA-7) y la revocación en sesión (CA-16) se verifican con las pruebas automáticas de T-03, T-04 y T-08, y su recorrido multi-cuenta pasa a la demo de 012; la nota del PR lo dice. — CA: los visibles (CA-1 a CA-5, CA-6 con una cuenta, CA-8, CA-9, CA-12, CA-14, CA-15, CA-17) — Depende: T-07, T-09 — Hecha (2026-10-17, Adrián): recorrido aprobado; lo multi-cuenta queda para 012.

- [ ] **T-11** Eliminar el andamiaje temporal de plan de pago (RN-13, plan §2.1), con la demo ya aprobada. Primero se ejecuta la verificación que debe fallar: `grep -r "DEV_FORCE_PAID_PLAN\|dev-scaffold\|DevPaidPlan\|planLimitsBinding" apps packages docs .env.example compose.yml` encuentra el rastro. Luego se borra `apps/api/src/dev-scaffold/`, se revierte `app.module.ts` a `PlanLimitsBindingModule`, y se quitan `DEV_FORCE_PAID_PLAN` de `env.schema.ts`, `.env.example` y `ambientes.md` (junto con la nota de retención de papelera del `worker`). El mismo `grep` ya no encuentra nada y toda la suite sigue verde porque ninguna prueba dependía del andamiaje. — CA: soporte de RN-13 (sin CA propio; las pruebas de CA-1 a CA-22 siguen en verde) — Archivos: `apps/api/src/dev-scaffold/*` (borrado), `apps/api/src/app.module.ts`, `shared/infrastructure/config/env.schema.ts`, `.env.example`, `docs/ambientes.md` — Depende: T-10 — Verificar: `grep` sin resultados, `pnpm env:check`, `pnpm lint && pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`

## Matriz CA → tarea

| CA    | Tarea(s)                                                       |
| ----- | -------------------------------------------------------------- |
| CA-1  | T-01, T-03, T-08, T-10                                         |
| CA-2  | T-03                                                           |
| CA-3  | T-01, T-03, T-08                                               |
| CA-4  | T-01, T-03                                                     |
| CA-5  | T-01, T-03, T-08                                               |
| CA-6  | T-04, T-08                                                     |
| CA-7  | T-01, T-03, T-04 (plaza liberada), T-08                        |
| CA-8  | T-04                                                           |
| CA-9  | T-01 (máquina de estados), T-05                                |
| CA-10 | T-05                                                           |
| CA-11 | T-01, T-05                                                     |
| CA-12 | T-05                                                           |
| CA-13 | T-02 (poda), T-05 (de punta a punta)                           |
| CA-14 | T-01 (estados), T-06 (servidor), T-09 (UI)                     |
| CA-15 | T-03, T-08                                                     |
| CA-16 | T-04                                                           |
| CA-17 | T-03, T-08                                                     |
| CA-18 | T-07                                                           |
| CA-19 | T-05, T-07 (callbacks falsificados)                            |
| CA-20 | T-02, T-05                                                     |
| CA-21 | T-01, T-03, T-08                                               |
| CA-22 | T-01, T-03 (con stub de plan; alcanzable al llegar 012), T-08  |

## Notas del developer

- **Merge de `main` (014 y 008)**: los DF y PD de 015/016 se renumeraron porque `main` ya usaba esos números:
  DF-65…70 → DF-69…74 y PD-74…79 → PD-93…98 (referencias actualizadas en `specs/015`, `specs/016`, ADR-0028 y ADR-0029).
- **T-02 sobre 014 (DF-75)**: no se crea `IFileVersionRepository`; `EditedVersionRegistrar` reutiliza `IVersionRepository`,
  `FileVersionService.register` (bajo `lockUsage`, sin validar cuota) y la poda de 014 tras el commit (`VersionPruner`, una
  versión por transacción), en lugar de podar dentro de la misma transacción. `FileVersion.fromEdit` agrega `editSessionId`;
  `forOrigin` queda solo para `optimizacion`. La FK de `sesion_edicion_id` lleva nombre (`fk_version_archivo_sesion_edicion`).
  El registrador devuelve `registered | duplicate | corrupt | file_missing`; si la transacción falla borra el objeto subido y
  propaga el error (el trabajo reintenta con la misma clave). Sin cambios de CA ni de contrato.
- **RN-11 (PD-99, resuelta 2026-10-16)**: Adrián decide «guardar igual» (RN-11 sin cambios). El registro de la versión
  editada resuelve el archivo con `ownedFiles(actor)` de `access` (propio, vivo o en la papelera); `file_missing` queda
  solo para el archivo purgado. PD-100 también resuelta: sin `OnlyOfficeHealthIndicator` (plan §2 y §5 corregidos).
- **Pruebas en este worktree**: Jest no casa `testMatch` con `<rootDir>` bajo `.claude/` (carpeta con punto), así que
  `pnpm test`/`pnpm test:int` aquí se corren con `--testMatch '**/…'`; en el repositorio normal no cambia nada.
- **T-03, clases de aplicación no nombradas en el plan**: `EditorAvailability` (puerta de CA-15: variables y salud),
  `EditorConfigFactory` (configuración firmada del editor) y `DocumentContentService` (`GET /editing/content/:token`);
  separan responsabilidades de `EditSessionService` (SRP, funciones ≤ 30 líneas). El 404 uniforme reutiliza
  `NodeNotFoundError` de `storage` (ahora exportado por su `index.ts`); `EditableFile` suma `name` (título del editor).
  `EditingModule.forRoot(env, storage)` recibe la misma instancia de `StorageModule` y `UserDirectoryBindingModule.forRoot(identity)`
  la de `IdentityModule` (patrón de 015). El cuerpo `{connectionId?}` se valida en T-04, que es quien lo usa.
- **T-03, `OnlyOfficeHealthIndicator` sin registrar (propuesta en el registro de cambios de la spec)**: registrarlo en
  `HealthModule.forRoot` haría que `/health/ready` del `api` responda 503 cuando ONLYOFFICE está apagado o sin
  configurar (las variables son opcionales), lo que contradice CA-15/RNF-09 y rompe `health.int-spec.ts` y el contrato
  `HEALTH_CHECK_NAMES`. CA-15 queda cubierto por `OnlyOfficeEditor.isAvailable` en cada apertura. Pendiente de decisión
  de Adrián (PD-100): indicador no bloqueante con 022 o fuera de `ready`.
- **Pruebas de integración de T-03**: lector (CA-3) y coeditor (CA-22) no son alcanzables antes de 012; los cubre
  `edit-mode-policy.spec.ts`. CA-7 se prueba con una participación sembrada de otra cuenta y `maxEditors = 1`.
- **T-04, `revokeAccess(actor, { fileId, userId })`**: el plan la nombra `revokeAccess(fileId, userId)`; lleva además el
  `actor` de quien revoca (la propietaria; en T-05, el `oid` del aviso), porque leer y cerrar la participación pasa por la
  RLS de `sesion_edicion`/`participacion` (`withActor`) y la constitución exige `actor` en todo servicio con datos de cliente.
  `PresenceService` hace la sala, la lista y la salida (`admit`, `announce`, `retire`, `leave`, `@OnEvent`); `EditSessionService`
  suma `retire` + `leave` + `IDocumentEditor.dropUser` (comando `drop` firmado a `ONLYOFFICE_INTERNAL_URL/command`, nunca lanza).
  `participants.ts` (nombres) lo comparten los dos servicios.
- **T-04, `EDITING_INVALID_REQUEST` (400)**: validar `{connectionId?}` con `ZodValidationPipe` (ADR-0020) necesita un código
  del módulo; el plan §4 no lo listaba. Se agrega a `EDITING_ERROR_CODES` (`EditingInvalidRequestError`, con `fields`). Un
  `displayName` en el cuerpo también responde 400 (RN-12). Contratos nuevos para la web (T-08): `EDITING_EVENTS.PRESENCE` y
  `editingPresenceSchema`.
- **T-04, sala y salida**: la sala del documento es el id del archivo. Con `connectionId`, la conexión se admite **antes** de
  dar de alta la participación (una conexión ajena o inexistente responde `SHARED_FORBIDDEN` sin crear nada) y también en
  solo lectura (quien ve el documento recibe la lista); `editing.presence` se publica solo cuando cambia la lista de una
  sesión (apertura en edición, salida, revocación). La salida usa el actor de quien sale: hasta 012 solo la propietaria ve
  la sesión (PD-95), así que la salida de un coeditor no es alcanzable todavía; en las pruebas, Bea entra con su
  participación sembrada y `IDocumentRooms.admit`. Salir con otra pestaña abierta: PD-101.
- **T-04, composición**: `EditingModule.forRoot(env, { storage, realtime })` recibe también la misma instancia de
  `RealtimeModule` (antes `forRoot(env, storage)`). El arnés `editing-http.ts` monta el canal en vivo (puerto efímero,
  `TestAccessTokenVerifierModule` de `test/int/realtime`, ahora exportado) y `createStorageHttpApp` acepta `withRealtime`.
- **T-05, PD-99 en código**: `access` exporta `ownedFiles(actor)` (función pura, como `ownedTrashedNodes`; sin puerto nuevo).
  `INodeRepository.findOwnedFile` (interno de `storage`) lo usa en `EditedVersionRegistrar.resolve`, y
  `updateCurrentVersion` filtra por `accessibleNodes ∪ ownedFiles` en la misma consulta para mover el puntero de un
  archivo propio en la papelera. La poda (`VersionPruner`) sigue saltando archivos en la papelera: se poda al restaurar
  y guardar de nuevo, o la purga se lleva todo.
- **T-05, enlace de `callbackUrl` sin vencimiento (desviación del plan §5, «TTL de minutos»)**: ONLYOFFICE usa la misma
  `callbackUrl` durante toda la sesión (estado 1 en cada entrada o salida, estado 2 al cerrar), y la sesión no tiene
  plazo propio (RN-4); con un TTL de minutos se perderían los guardados. El enlace (`typ` `nimbo.edit-callback`, HS256,
  `{sid, oid}`) no lleva `exp`; vale solo junto con el JWT de ONLYOFFICE con `key === sid` y mientras la sesión esté
  `activa`/`guardando`. Los enlaces de contenido siguen con 5 min. **Aceptado por Adrián (2026-10-16)**; plan §2, §5 y §9
  corregidos en T-06.
- **T-05, `IDocumentEditor`**: `verifyCallback(token)` devuelve una señal neutral (`editing | ready | failed | closed |
  ignored`, sin los números de ONLYOFFICE en `application`) y `download(url, maxBytes)` lanza
  `EditorDownloadRejectedError` (`untrusted_url | redirect | too_large | no_length`) sin reintento; otro error es
  transitorio. El token se toma del cuerpo (`token`) o de `Authorization: Bearer` (`{ payload }`). Requiere
  `Content-Length` en la descarga (se valida en el smoke de T-10).
- **T-05, colas**: puertos internos `ISaveVersionQueue` (`editing-save`, `jobId` = sesión, 3 intentos, 2 s exponencial,
  `removeOnComplete`) e `IIndexQueue` (`indexing`, `jobId` = versión). `IIndexQueue` vive en `editing` hasta que 019
  decida quién lo declara (PD-18). «UNIQUE violado = éxito» lo da el `duplicate` del registrador (revalida bajo
  `lockUsage`), sin capturar la violación aparte. `closeWithoutChanges(actor, session)` lleva el actor de la propietaria.
- **T-05, PD-101 (mitigado, no cerrado)**: el estado 1 reconcilia `participacion` con `users` (vuelve a contar a quien
  sigue en el editor, suelta a quien no está) y revalida el permiso de cada uno (la propietaria siempre conserva lo
  suyo, RN-11). Queda una carrera: si `realtime.document-left` llega **después** del estado 1 de la misma salida, la
  cuenta queda fuera hasta el siguiente estado 1. Cerrarlo del todo pide la consulta de conexiones en `IDocumentRooms`.
- **Pruebas de guardado**: `FakeOnlyOfficeServer` (HTTP en `127.0.0.1`) con el `OnlyOfficeEditor` real (JWT, lista
  blanca, descarga por flujo); `editing-http.ts` suma `onlyOffice`, `callback`, `rawCallback` y `queue`.
- **T-06, `SaveFailedNotifier.fail(owner, session, reason)`**: además de avisar, hace la transición a `fallida` (comparar y
  asignar desde el estado leído) y la auditoría `edit.save_failed` `{sessionId, reason}`; solo avisa si la transición se hizo
  (dos fallos a la vez avisan una vez). Así los tres caminos (estado 3 → `editor`; `corrupt` o descarga rechazada →
  `integridad`, decisión de Adrián; `file_missing` → `archivo_purgado`; último intento → `almacenamiento`) comparten un
  solo punto. Destinatarios: la propietaria y todo el que entró como editor aunque saliera. La bitácora `editing.save_rejected`
  pasa a `editing.save_failed` (`sessionId`, `fileId`, `userId`, `reason`).
- **T-06, agotamiento de intentos**: lo decide `SaveVersionProcessor` dentro de `process` (`attemptsMade + 1 >= attempts`),
  antes de relanzar el error, con `SaveVersionService.giveUp(job)`; así queda esperado y con su `correlationId` (un
  `@OnWorkerEvent('failed')` no se espera). Si `giveUp` mismo falla, la sesión queda en `guardando`: PD-102.
  «Incompleto» con `Content-Length` correcto (documento cortado) da `integridad`; un flujo que se corta antes del
  `Content-Length` es un error de red: se reintenta y, agotado, da `almacenamiento`.
- **T-06, `IEditSessionRepository`**: suma `findLatestFor(actor, fileId)` (plan §2) y `allParticipants(actor, sessionId)`
  (no nombrado en el plan): los destinatarios del aviso y la participación que pide `lastSaveFailed` (plan §4).
- **T-06, `lastSaveFailed` (contrato para T-08/T-09)**: se calcula dentro de la transacción de la apertura y solo si el
  archivo no tiene sesión abierta, antes de crear la nueva. La **primera** apertura tras el fallo ya responde `mode:'edit'`
  con una sesión nueva sobre la versión vigente y `lastSaveFailed: true`; «Abrir el editor de nuevo» repite el `POST` y
  reutiliza esa sesión con `lastSaveFailed: false`. En `view` no se crea sesión, así que sigue en `true` hasta que alguien
  abra en edición. Hasta 012 solo la propietaria ve sesiones (PD-95): el coeditor recibe el aviso en vivo, no el banner.
  Con el archivo purgado la apertura responde 404 (`STORAGE_NODE_NOT_FOUND`) antes de mirar sesiones.
- **T-06, contratos**: `EDITING_EVENTS.SAVE_FAILED = 'editing.save-failed'`, `editingSaveFailedSchema` `{sessionId, fileId}`
  (`.strict()`) y `EditingSaveFailed`. En este worktree las pruebas del `api` leen `@nimbo/contracts` desde `dist`:
  tras cambiar contratos hay que correr `pnpm --filter @nimbo/contracts build`.
- **T-06, soporte de pruebas**: `StorageClient.trashFile/purgeFile` (`storage-http.ts`) y
  `FakeOnlyOfficeServer.serveAfterFailures(bytes, n)` (503 las primeras `n` descargas).
- **T-08, `useRealtime()` en `features/realtime/use-realtime.ts`** (el plan lo ubicaba en `features/editing`): es la API del
  `RealtimeProvider` de 015, que ahora publica un contexto `{connectionId, on(event, handler)}`; `startRealtime` devuelve
  `{socket, stop}`. No hay un segundo cliente de `socket.io-client`: la renovación de token y la reconexión siguen siendo las
  de 015. T-09 usa el mismo contexto.
- **T-08, reconexión**: el cliente no elige salas (015), así que al cambiar el id de conexión la pantalla repite
  `POST /files/:fileId/edit-session` con el id nuevo (reutiliza la sesión) y solo toma la presencia; el editor montado no
  cambia. Si ese `POST` falla, la lista deja de actualizarse hasta la próxima reconexión.
- **T-08, lo que la API no da y la pantalla no muestra** (sin cambios de contrato, YAGNI): versión y fecha bajo el nombre,
  «Compartir» (012) y «Descargar» en la barra, peso y tope en `solo-lectura-tamano`, y el nombre de quien compartió en
  `solo-lectura-lector`. El nombre del archivo sale de `config.document.title`. `solo-lectura-vencida` y `solo-lectura-plan`
  comparten código (`EDITING_PLAN_READ_ONLY`) y, como dice CA-5, el mismo texto «Tu plan no incluye edición» con «Ver
  planes»; el «Renovar plan» del mockup necesita el estado de la suscripción (010).
- **T-08, otros estados**: `409 EDITING_SAVE_IN_PROGRESS` («Estamos guardando la sesión anterior», «Reintentar») y
  `422 EDITING_UNSUPPORTED_FORMAT` («Solo se pueden editar documentos .docx») con `StateView`; el 404 reutiliza
  `NotFoundState` (CA-2). Si el script de ONLYOFFICE no carga, la pantalla pasa a `no-disponible` (CA-15).
- **T-08, «Editar»**: ítem del menú ⋮ de la fila, solo para `kind === 'docx'`, antes de «Mover a la papelera» (que sigue
  siendo la última). Los roles internos no lo ven porque el explorador y `/editor/:fileId` viven en `(cliente)` (CA-17).
- **T-08, `ParticipantAvatar`** (`components/nimbo`): anillo con los 5 tonos de la secuencia que ya son tokens (`brand`,
  `live`, `success`, `warning`, `destructive-soft`, hash del id módulo 5, no 8: los otros 3 no son tokens, DF-46); quien
  solo ve, `ring-input`.
- **T-09, aviso en vivo**: `SaveFailedListener` en `(app)/layout.tsx`, dentro del `RealtimeProvider` y arriba del
  contenido, en su propia región («Avisos de guardado», axe `region`). Un aviso por sesión, persistente mientras dure la
  pestaña (no sobrevive a recargar: lo cubre el banner al reabrir), con «Abrir el editor de nuevo» (navega al editor) y
  «Cerrar aviso». **Sin nombre de archivo** (desviación del README del mockup, que lo pedía resuelto por la API): el aviso
  no lo trae (RN-9) y no hay consulta de nombre para un coeditor hasta 012; el texto dice «los cambios de un documento».
- **T-09, banner**: con `lastSaveFailed`, la página muestra `guardado-fallido` (sin editor, modo ni presencia) y «Abrir el
  editor de nuevo» repite el `POST` (que reutiliza la sesión con `lastSaveFailed: false`) y monta el editor. El `Alert` de
  error lo comparten el banner y el aviso en vivo (`save-failed-alert.tsx`).
- **T-09, riesgo para revisar (sin cambio aquí)**: la sesión y la participación que crea la primera apertura tras el fallo
  quedan abiertas aunque la persona se vaya sin pulsar «Abrir el editor de nuevo» (sin editor montado no hay estado 1 que
  reconcilie), y en general salir del editor navegando dentro de la pestaña no saca la conexión de la sala: el canal vive
  en el layout y `realtime.document-left` llega al cerrar la pestaña. Con editor montado lo reconcilia el estado 1 de
  ONLYOFFICE; en el banner, la plaza queda ocupada hasta cerrar la pestaña. Posible PD para Adrián.
