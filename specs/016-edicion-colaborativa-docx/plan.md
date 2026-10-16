# Plan 016 — Edición colaborativa de .docx

> Spec: `./spec.md` · Estado del plan: Aprobado
> Qué archivos se tocan y qué se espera de cada uno. Sin cuerpos de funciones. Lo aprueba Adrián antes de escribir código.

## 1. Resumen técnico
- `editing` (M5) abre una **sesión de edición** por archivo: valida con `PermissionResolver`/`accessibleNodes(actor)` y los
  límites del plan, decide el modo (edición o solo lectura con motivo) y devuelve la configuración del editor **firmada con JWT**
  de ONLYOFFICE. El documento lo lee ONLYOFFICE desde un endpoint de `api` con enlace firmado y corto, que transmite el objeto
  de MinIO sin exponer su clave ni URLs de MinIO.
- La presencia usa 015: al abrir, `editing` admite la conexión con `IDocumentRooms.admit` y publica la lista con
  `IRealtimePublisher.toDocument`; las salidas llegan con `realtime.document-left`. La presencia nativa del editor (cursores) no se toca.
- ONLYOFFICE llama al `callback`: se verifica el JWT del cuerpo; **solo el estado 2** encola `editing-save` (jobId = sesión) y
  responde `{"error":0}` (DF-20). El procesador descarga el archivo (URL de la lista blanca), lo verifica y pide a `storage`
  registrar una versión `origen='edicion'`. La idempotencia es de BD: `version_archivo.sesion_edicion_id UNIQUE` (DF-05).
- `storage` es dueño de la versión (ADR-0012): suma su tamaño con `IQuotaRepository.addUsedBytes` **sin validar cuota** (sobregiro,
  CA-20), mueve el puntero de versión vigente y poda por retención. La reindexación se encola por `IIndexQueue` (sin consumidor hasta 019).
- **El procesador corre en el `api`, no en el `worker`**: las salas de 015 viven en memoria del `api` (ADR-0028) y el aviso de
  guardado fallido debe emitirse desde ahí. La cola sigue siendo BullMQ/Redis (durable, con reintentos).
- Frontend: página del editor que carga el script de ONLYOFFICE, abre el canal de 015 (`useRealtime()`) y muestra la presencia. Un oyente del shell
  recibe `editing.save-failed` (aviso a un usuario, 015) en cualquier pantalla; al reabrir, `lastSaveFailed` muestra el banner con «Abrir el editor de nuevo».

## 2. Módulos, archivos y diseño
| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| editing/domain | `edit-session.ts` | `EditSession`: estados `activa → guardando → cerrada \| fallida`, `activa → sin_cambios`; transiciones puras |
| editing/domain | `edit-mode-policy.ts` | Decide `{mode, readOnlyReason}` según nivel, plan **de la cuenta propietaria** (`maxEditors`), si quien abre es la propietaria, editores activos, tamaño y tipo (puro; recibe `PlanLimits` ya resueltos). «Plan sin edición» ⇔ `maxEditors === 0` (Personal; el valor sale de la BD, RN-3): `EDITING_PLAN_READ_ONLY` si abre la propietaria, `EDITING_OWNER_PLAN_READ_ONLY` si abre un coeditor |
| editing/domain | `errors/*.ts` | `EditingUnsupportedFormatError` 422, `EditingUnavailableError` 503, `EditingSaveInProgressError` 409 |
| editing/application | `edit-session.service.ts` | `open(actor, fileId, input)`: caso de uso de apertura; `closeWithoutChanges`; `revokeAccess(fileId, userId)` (CA-16) |
| editing/application | `presence.service.ts` | Admisión a la sala, lista de participantes (nombres desde `IUserDirectory`), `@OnEvent(REALTIME_DOCUMENT_LEFT)` idempotente |
| editing/application | `save-callback.handler.ts` | Enruta el estado del callback: 1 reconcilia presencia y revalida acceso; 2 encola; 4 sin cambios; 3 falla; 6 y 7 se ignoran |
| editing/application | `save-version.service.ts` | Lo que hace el trabajo `editing-save`: relee la sesión con `withActor(createActor(oid))` (no confía en el trabajo), descarga, registra con `storage`, cierra la sesión, avisa, audita, encola reindexación. `versionId` = uuid v5 de `sessionId`; `uq_version_archivo_sesion_edicion` violado en un reintento = éxito; `fallida` y aviso solo al agotar los 3 intentos |
| editing/application | `content-link.signer.ts` | Firma y verifica (HS256 fijo, claim `typ` propio, TTL de minutos) el token de contenido `{sid, oid, exp}` (también como parámetro firmado de `callbackUrl`, cuya consulta ONLYOFFICE no firma) y el de modo `view` `{fid, vid, oid, exp}` (sin sesión) |
| editing/application | `ports/i-document-editor.port.ts` | `IDocumentEditor` (`signConfig`, `verifyCallback`, `download`, `dropUser`, `isAvailable`) |
| editing/application | `ports/i-edit-session.repository.port.ts` | `IEditSessionRepository` (renombra `ISessionRepository`, DF-19): sesiones y `participacion`, siempre con actor; `findLatestFor(actor, fileId)` para el banner (CA-14) |
| editing/application | `ports/i-user-directory.port.ts` | **Puerto nuevo** `IUserDirectory` (`I_USER_DIRECTORY`): `displayNames(userIds)` → mapa id→nombre visible; nada más (ISP). Lo declara `editing` |
| identity/infrastructure | `adapters/user-directory.adapter.ts` | `UserDirectoryAdapter implements IUserDirectory` (importa el puerto de `editing`, como `PlanLimitsAdapter` con `storage`); lee `usuario.nombre` y no devuelve ningún otro dato |
| raíz (`apps/api/src`) | `user-directory-binding.module.ts` | `UserDirectoryBindingModule`: `useExisting: UserDirectoryAdapter` para `I_USER_DIRECTORY`; mismo patrón que `PlanLimitsBindingModule` |
| editing/application | `save-failed-notifier.ts` | Al fallar una sesión: `IRealtimePublisher.toUser` a cada participante (y a la propietaria) con `editing.save-failed`; reutilizado por el estado 3 y por el procesador |
| **andamiaje temporal** | ver §2.1 | Plan de pago de prueba hasta la 009; **se borra al terminar la spec** |
| editing/application | `editing-config.ts` | `EDITING_CONFIG`: URLs, secreto, tope editable, enlace de contenido (TTL constante) |
| editing/infrastructure | `onlyoffice-editor.ts` | `OnlyOfficeEditor`: JWT con `@nestjs/jwt` (ya instalado), algoritmo fijo HS256; descarga comparando el **origen** de la URL analizada (no `startsWith`) con la lista blanca, sin seguir redirecciones, con tope de bytes; comando `drop` |
| editing/infrastructure | `onlyoffice.health-indicator.ts` | `OnlyOfficeHealthIndicator` (DF-29); se registra en `HealthModule.forRoot` de la raíz |
| editing/infrastructure | `typeorm-edit-session.repository.ts`, `edit-session.orm-entity.ts`, `participation.orm-entity.ts` | Persistencia con `TransactionContext.requireActorScope(actor)` |
| editing/infrastructure | `save-version.queue.ts`, `save-version.processor.ts` | Cola `editing-save` (3 intentos, espera exponencial) y su procesador en el `api` |
| editing/presentation | `editor.controller.ts` | `POST /files/:fileId/edit-session` (CLIENT) |
| editing/presentation | `onlyoffice.controller.ts` | `GET /editing/content/:token` y `POST /editing/callback`, ambos `@Public()` y autenticados por JWT |
| editing | `editing.module.ts`, `index.ts` | Composición y API pública del módulo; registra los oyentes y la cola |
| storage/application | `editable-file.gateway.ts` (**exportado**) | Fachada para `editing`: `find(actor, fileId)`, `openContent(actor, fileId)`, `registerEditedVersion(actor, input)`; `EditedVersionInput` lleva `versionId` y `createdBy` (= `abierta_por`, distinto del actor propietario) |
| storage/application | `edited-version.registrar.ts` | Transacción con actor: `lockUsage` → valida `docx` con `IFileTypeDetector` → inserta versión → mueve puntero → `addUsedBytes` → poda |
| storage/application | `ports/i-file-version.repository.port.ts` (interno) | `findCurrent`, `insertEdited`, `setCurrent`, `trimBeyond(keep)`; sin puerto entre módulos |
| storage/application | `ports/i-object-storage.port.ts` (+2 métodos) | `getObjectStream(key)` y `putObject(key, stream, length)` (flujo, sin cargar el `.docx` en memoria; el adaptador MinIO ya usa `client-s3`) |
| storage/domain | `file-version.ts` | `FileVersion.fromEdit(...)` con `origin='edicion'` |
| storage | `plan-limits.ts` (+2 campos) | `PlanLimits.maxEditors` y `retainedVersions`; los llena `billing` (`PlanLimitsAdapter.toLimits`, ya lee ambas columnas) |
| audit | `audit-action.ts`, `audit-catalog.ts` | Acciones `edit.session_opened`, `file.version_created`, `edit.save_failed` (recurso `file`, atributos numéricos y `reason`) |
| shared / raíz | `env.schema.ts`, `app.module.ts` | Variables nuevas (§5), importa `EditingModule`, registra el indicador de salud |
| contracts | `packages/contracts/src/editing/*` | Esquemas zod (ADR-0020), `EDITING_ERROR_CODES` y constantes de eventos |
| web | `app/(app)/(cliente)/editor/[fileId]/page.tsx`, `features/editing/*` | Página del editor, `useRealtime()`, panel de presencia, 10 estados del mockup (§6 de la spec), banner de guardado fallido y oyente de `editing.save-failed` |
| web | `features/editing/use-realtime.ts` | Cliente `socket.io-client` (ya en `web`) que reabre con token renovado (015 CA-4) |
| infra | `compose.yml`, `.env.example` | Variables de ONLYOFFICE y red hacia `api` (§5) |

- **Puerto nuevo entre módulos: `IUserDirectory`** (Art. V.2: dos implementaciones reales no, pero cruza una frontera de módulo y evita que
  `editing` importe `identity`; igual que `IPlanLimitsProvider`). Lo declara `editing`, lo implementa `identity`, se enlaza en la raíz. Se usa
  para la lista en vivo y para `user.name` de la config de ONLYOFFICE; la 014 lo reutilizará para el historial con autoría. `IDocumentEditor`
  ya figura en `architecture.md` §5 (infraestructura externa); `IEditSessionRepository` y `IFileVersionRepository` son internos.
- **Se descarta** `IIdempotencyStore`/`RedisIdempotencyStore` (YAGNI, una sola garantía suficiente): `UNIQUE` en BD + `jobId` de la cola (DF-68).
- **Dependencias entre módulos**: **arista nueva `identity → editing`** (solo para implementar el puerto, patrón `billing → storage`); `editing`
  sigue sin importar `identity`. `architecture.md` §3 ya la recoge. **`editing` no depende de `billing`** (con `identity → editing` cerraría
  el ciclo `editing → billing → identity → editing`): sus dependencias son `storage, access, realtime, audit`. El plan sale de
  `I_PLAN_LIMITS_PROVIDER` de `storage` (DF-51), con el actor de la propietaria. Se amplía la API pública de `storage` (`EditableFileGateway`).
- **Lint** (lo hace el developer): `packages/config/eslint/boundaries.js` → `identity: ['notifications','audit','editing']` y
  `editing: ['storage','access','realtime','audit']`; mismo grafo en `module-graph.spec.ts`; `apps/api/src/modules/editing/README.md`; fixture
  negativo `editing-imports-billing.ts`; `cycles.js` sigue verde.
- Funciones ≤ 30 líneas y ≤ 3 parámetros: las entradas llevan objetos de entrada nombrados (`OpenSessionInput`, `EditedVersionInput`).
- Nombres visibles: **los pone el servidor** con `IUserDirectory.displayNames`; el cliente no envía nombre (se descarta DF-70 original). Excepción
  acotada al «todo servicio recibe `actor`» (`architecture.md` §6): el puerto solo recibe ids de participantes de la sesión y devuelve nombre visible, nunca nodos.

### 2.1 Andamiaje temporal: plan de pago hasta la 009 (se borra al terminar)
`PlanLimitsAdapter.limitsFor` devuelve siempre `personal` hasta 009/010 y no se toca billing. Archivos, todos bajo `apps/api/src/dev-scaffold/`:
| Archivo | Responsabilidad |
|---|---|
| `dev-paid-plan.module.ts` | `DevPaidPlanBindingModule` (global): enlaza `I_PLAN_LIMITS_PROVIDER` a `DevPaidPlanLimitsProvider`. Exporta `planLimitsBinding()`, que devuelve este módulo solo si `DEV_FORCE_PAID_PLAN` está definida y, si no, `PlanLimitsBindingModule`. **Segunda barrera**: lanza al arrancar si `APP_ENV` no es `local` ni `test` |
| `dev-paid-plan.provider.ts` | `DevPaidPlanLimitsProvider`: delega en `PlanLimitsAdapter.getLimitsBySlug(<slug de la variable>)` (ya existe) para todo actor |
- Único contacto fuera de la carpeta: `app.module.ts` cambia `PlanLimitsBindingModule` por `planLimitsBinding()` (1 import y 1 línea) y `env.schema.ts`/`.env.example` suman `DEV_FORCE_PAID_PLAN` (`pro|equipo|institucional`, opcional). El entorno es **`APP_ENV`** (`local|test|staging|production`), no `NODE_ENV`: el esquema solo la acepta con `APP_ENV` ∈ {`local`,`test`}. Importa solo `./modules/billing` (index); `dev-scaffold/` está fuera de `modules/`, así que `boundaries.js` no lo restringe.
- **El `worker` no se toca** (YAGNI): con ADR-0029 `editing-save` corre en el `api` y `WorkerModule` no importa `EditingModule`; el `worker` solo usa límites para la retención de la papelera, que no interviene en la edición. Sigue con `PlanLimitsBindingModule` (en la demo la retención de papelera del `worker` es la de Personal; se documenta en `ambientes.md`).
- Las pruebas **no dependen** del andamiaje: inyectan su propio stub de `IPlanLimitsProvider` (`test/support/fake-plan-limits.provider.ts` ya existe).
- **La última tarea de la spec lo elimina**: borra `dev-scaffold/`, revierte `app.module.ts`, `env.schema.ts`, `.env.example` y `ambientes.md`, y verifica con `grep -r "DEV_FORCE_PAID_PLAN\|dev-scaffold\|DevPaidPlan"` que no queda rastro; `pnpm env:check` pasa. Si 009 llega antes, se borra antes.

## 3. Datos
```sql
-- 20261016100000-crear-sesion-edicion-y-participacion
CREATE TABLE sesion_edicion (
  id uuid PRIMARY KEY,
  archivo_id uuid NOT NULL,                    -- sin FK: la purga no borra la evidencia de una sesión fallida (DF-66)
  propietario_id uuid NOT NULL REFERENCES usuario(id),
  abierta_por uuid NOT NULL REFERENCES usuario(id),
  version_base_id uuid NOT NULL,               -- versión vigente al abrir
  estado varchar(12) NOT NULL CHECK (estado IN ('activa','guardando','cerrada','sin_cambios','fallida')),
  motivo_fallo varchar(30) CHECK (motivo_fallo IN ('integridad','editor','archivo_purgado','almacenamiento')),
  iniciada_en timestamptz NOT NULL, finalizada_en timestamptz,
  CHECK ((estado = 'fallida') = (motivo_fallo IS NOT NULL))
);
CREATE UNIQUE INDEX uq_sesion_edicion_abierta ON sesion_edicion (archivo_id) WHERE estado IN ('activa','guardando');
CREATE INDEX idx_sesion_edicion_propietario ON sesion_edicion (propietario_id, iniciada_en DESC);
CREATE TABLE participacion (
  sesion_edicion_id uuid NOT NULL REFERENCES sesion_edicion(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuario(id),
  entro_en timestamptz NOT NULL, salio_en timestamptz,
  PRIMARY KEY (sesion_edicion_id, usuario_id)
);
CREATE INDEX idx_participacion_activa ON participacion (sesion_edicion_id) WHERE salio_en IS NULL;
-- RLS (ENABLE + FORCE) en ambas, rol nimbo_app, como 005: solo cliente y solo lo propio; sin política para roles internos.
CREATE POLICY sesion_edicion_cliente ON sesion_edicion TO nimbo_app
  USING (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id())
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND propietario_id = nimbo_actor_id());
CREATE POLICY participacion_cliente ON participacion TO nimbo_app
  USING (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM sesion_edicion s WHERE s.id = sesion_edicion_id))
  WITH CHECK (nimbo_actor_role() = 'CLIENT' AND EXISTS (SELECT 1 FROM sesion_edicion s WHERE s.id = sesion_edicion_id));

-- 20261016100100-agregar-sesion-edicion-a-version-archivo
ALTER TABLE version_archivo ADD COLUMN sesion_edicion_id uuid REFERENCES sesion_edicion(id);
ALTER TABLE version_archivo ADD CONSTRAINT uq_version_archivo_sesion_edicion UNIQUE (sesion_edicion_id);
ALTER TABLE version_archivo ADD CONSTRAINT ck_version_archivo_sesion_origen
  CHECK ((origen = 'edicion') = (sesion_edicion_id IS NOT NULL));
```
- `down`: la segunda quita la restricción, el `CHECK` y la columna; la primera borra políticas, `participacion` y `sesion_edicion`
  (en ese orden). Ambas probadas con `migration:revert` (RNF-10). `synchronize: false`.
- **Autores de una versión** = `participacion` de su `sesion_edicion_id` (ADR-0012); `creado_por` = `abierta_por` (quien abrió la sesión). Los
  nombres no se guardan (sin `nombre_visible`): se piden a `IUserDirectory` al vuelo; 014 agregará una instantánea si la necesita.
- Hasta 012 solo el propietario ve `sesion_edicion`; 012 amplía estas políticas (nota de la spec RN-2). Tamaños `bigint`.

## 4. Contratos
| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| POST | `/files/:fileId/edit-session` | CLIENT | `{connectionId?}` → 200 `{sessionId, mode, readOnlyReason, documentServerUrl, config, participants[], editors, maxEditors, lastSaveFailed}` | 404 inexistente; 422 `EDITING_UNSUPPORTED_FORMAT`; 409 `EDITING_SAVE_IN_PROGRESS`; 503 `EDITING_UNAVAILABLE`; 403 `SHARED_FORBIDDEN` (roles internos); 429 |
| GET | `/editing/content/:token` | pública con JWT | token firmado `{sid, oid, exp}` (o `{fid, vid, oid, exp}` en `view`) → flujo `.docx` (`no-store`, `attachment`) | 404 uniforme si el token es inválido, vencido o la sesión no está `activa`/`guardando` (CA-16) |
| POST | `/editing/callback` | pública con JWT de ONLYOFFICE | cuerpo ONLYOFFICE → `{"error":0}` | `{"error":1}` solo si la firma es inválida (CA-19) |

- `mode` ∈ `edit | view`; `readOnlyReason` ∈ `EDITING_VIEW_ONLY | EDITING_PLAN_READ_ONLY | EDITING_OWNER_PLAN_READ_ONLY | EDITING_LIMIT_REACHED | EDITING_FILE_TOO_LARGE | null`.
  **Recomendación**: código propio `EDITING_OWNER_PLAN_READ_ONLY` en vez de reusar `EDITING_PLAN_READ_ONLY` con un indicador; es un valor más del
  enum (la política ya devuelve el motivo), el texto de la UI sale solo del código y no hay un segundo campo que mantener. Quien abre un
  coeditor ve «El plan de la cuenta propietaria no incluye edición» sin «Ver planes» ni «Renovar plan». Solo es alcanzable al llegar la 012.
- `lastSaveFailed`: verdadero si la sesión **más reciente** del archivo está `fallida` y quien abre participó en ella (o es la propietaria). No añade
  columnas: sale de `sesion_edicion.estado/motivo_fallo` y `participacion`; desaparece sola al abrirse una sesión nueva. Con archivo purgado no hay banner (CA-2).
  «Abrir el editor de nuevo» es otra llamada a este mismo endpoint: abre sesión nueva sobre la versión vigente; no se reprocesa la entrega.
  En `view` no hay sesión ni participación (clave del documento = `v-<versionId>`); en `edit`, la clave es el id de la sesión.
- Apertura: reutiliza la sesión `activa` del archivo o la crea (`uq_sesion_edicion_abierta` resuelve la carrera); con una `guardando`
  responde `EDITING_SAVE_IN_PROGRESS` para no editar sobre una versión vieja. El conteo y el alta de `participacion` se hacen bajo `FOR UPDATE` de la sesión.
- Eventos (sin contenido ni nombre de archivo). Por sala (`toDocument`): `editing.presence`
  `{participants:[{userId,displayName}], editors, maxEditors}`; `editing.version-saved` `{sessionId}`. **Por usuario** (`toUser`, 015, llega en
  cualquier pantalla): `editing.save-failed` `{sessionId, fileId}`; el shell de `web` lo muestra como aviso persistente, sin toast (ADR-0024).
  Entrada: `realtime.document-left` (015). Salida a reindexar: `IIndexQueue` con `{fileId, versionId}`.
- Sin token de usuario no hay actor para la RLS de `sesion_edicion` (`FORCE`, sin política sin actor): el token de contenido y el parámetro firmado de
  `callbackUrl` llevan `sid` y `oid`; el controlador exige `payload.key === sid` y lee la sesión con `withActor(createActor(oid, CLIENT))`. No hay
  función `SECURITY DEFINER` (ADR-0021). El token de `view` lleva `oid` y `fid`; `openContent` re-verifica el acceso con ese actor.
- Callback: se usa el **payload del JWT**, no el cuerpo crudo (tope de tamaño del cuerpo). Estado 1: reconcilia `salio_en` con `users` y revalida el permiso
  de cada uno (si falló, `retire` + `dropUser`; CA-16). 2: CAS `activa → guardando`, encola `{sessionId, oid, url}`. 4: CAS a `sin_cambios`.
  3: `fallida/editor`. 6 y 7: se ignoran. Sesión desconocida o no `activa`: `{"error":0}` y se anota (sin tormenta de reintentos); si no está `activa`
  ni `guardando` el estado 2 se rechaza sin encolar.
- Procesador: el trabajo lleva `{sessionId, oid, url}`; actúa con `createActor(oid, CLIENT)` y relee `propietario_id` de la sesión (debe coincidir con `oid`).
  Descarga solo si el origen de la URL ∈ {`ONLYOFFICE_INTERNAL_URL`, `ONLYOFFICE_PUBLIC_URL`}, sin seguir redirecciones, con tope de `2 × EDITING_MAX_DOC_BYTES`.
  Idempotencia: un reintento reutiliza la `clave_objeto` (versionId determinista) y una violación del UNIQUE cuenta como éxito; la sesión pasa a `fallida` solo tras el 3.er intento.

## 5. Seguridad y operación
- `actor` en todos los servicios; la lectura del archivo y la sesión pasan por `withActor` y `accessibleNodes` (`INodeRepository.findAccessibleById`).
  Excepción acotada: el enlace de contenido, el callback y el procesador no traen token de usuario y usan `createActor(oid, CLIENT)` con el `oid` firmado
  (TTL de minutos, HS256 fijo, claim `typ` propio para que un token de ONLYOFFICE no valga como enlace). Nunca se confía en un `ownerId` del cuerpo o del trabajo.
- Roles internos: `@Roles(CLIENT)` + `canReadContent` en `PermissionResolver`; no tienen filas visibles por RLS.
- Bitácora técnica: `editing.session_opened`, `editing.saved`, `editing.save_failed` con `correlationId`, `sessionId`, `userId`, `reason`
  (nunca nombres de archivo, tokens, URLs de descarga ni claves de objeto). Los trabajos no registran su `url`.
- Auditoría (RF-07): tres acciones del catálogo con `sizeBytes` y `reason`.
- Variables nuevas del `api` (todas **opcionales**: sin ellas el editor responde `EDITING_UNAVAILABLE`, RNF-09): `ONLYOFFICE_JWT_SECRET` (ya existe en
  `.env.example`, secreto, se rechaza el valor de ejemplo y se exige longitud mínima fuera de local, como `JWT_ACCESS_SECRET`), `ONLYOFFICE_PUBLIC_URL` (navegador), `ONLYOFFICE_INTERNAL_URL` (api→ONLYOFFICE y lista blanca),
  `EDITING_CALLBACK_BASE_URL` (ONLYOFFICE→api; en local `host.docker.internal`), `EDITING_MAX_DOC_BYTES` (50 MB inicial, a validar en staging).
  `DEV_FORCE_PAID_PLAN` es del andamiaje (§2.1), vive solo hasta el fin de la spec y solo se acepta con `APP_ENV` local o test. Se agregan a
  `.env.example`, `apiEnvSchema` y `ambientes.md`; `pnpm env:check` debe pasar. El `worker` no cambia.
- ONLYOFFICE bloquea llamadas a IP privadas: el servicio de compose lleva `ALLOW_PRIVATE_IP_ADDRESS=true` solo en local/staging.
- Métricas/alertas (022): `OnlyOfficeHealthIndicator` ya cubre la alerta de caída (`product-context` §8).

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| 1, 3, 4, 5, 7, 21 | unit (decisión de modo, tabla de casos) | `editing/domain/edit-mode-policy.spec.ts` |
| 9, 11, 14 | unit (máquina de estados, transiciones válidas e inválidas) | `editing/domain/edit-session.spec.ts` |
| 2, 17 | int: abrir con ajeno/inexistente/papelera/rol interno | `test/int/editing/open-session.int-spec.ts` |
| 6, 8, 16 | int: presencia con Socket.IO real, salida y revocación (patrón de `test/int/realtime`) | `test/int/editing/presence.int-spec.ts` |
| 9, 10, 11, 12, 13 | int: callback firmado → cola → versión (`creado_por` = quien abrió); repetido = una versión; poda sin violar `ck_usuario_espacio_usado`; reindexación encolada | `test/int/editing/save-version.int-spec.ts` |
| 20 | int: cuenta en cuota, la versión se guarda y `STORAGE_QUOTA_EXCEEDED` en la carga siguiente | `test/int/editing/quota-overdraft.int-spec.ts` |
| 14, 19 | int: archivo corrupto, firma inválida, URL fuera de la lista blanca (origen parecido incluido), redirección, sesión no activa, `alg` distinto de HS256, archivo purgado, fallo transitorio que se recupera al reintentar (sin `fallida`); `editing.save-failed` por `toUser` y `lastSaveFailed` al reabrir | `test/int/editing/callback-security.int-spec.ts` |
| 6 | int: nombres de la lista salen de `IUserDirectory`, no del cliente (nadie con nombre ajeno); adaptador de `identity` devuelve solo el nombre | `test/int/editing/user-directory.int-spec.ts` |
| 22 | unit: coeditor con propietaria Personal/vencida → `EDITING_OWNER_PLAN_READ_ONLY` (dentro de la tabla de la política) | `editing/domain/edit-mode-policy.spec.ts` |
| 15 | int: ONLYOFFICE apagado; `GET /files` y descarga responden igual | `test/int/editing/degradation.int-spec.ts` |
| 18 | aislamiento (bloqueante): A y B, presencia, avisos, contenido, callback con otra clave | `test/isolation/editing.iso-spec.ts` |
| migraciones | int: `up`, `down`, `UNIQUE`/`CHECK` y RLS | `test/int/editing/migrations.int-spec.ts` |
| UI | componentes: estados clave (coeditando, solo lectura por motivo, límite, guardado fallido con banner, no disponible) + axe | `features/editing/*.spec.tsx` |
| demo | e2e manual con ONLYOFFICE real (perfil `onlyoffice`) | recorrido de la tarea humana |

- Doble de `IDocumentEditor` en int salvo un solo smoke con el contenedor real. Se prueba con un stub de `IPlanLimitsProvider` inyectado, sin el andamiaje (§2.1).
- Cobertura: lógica de negocio ≥ 60 %. Sin repetir un CA en tres capas.

## 7. Riesgos y coherencia con el diseño
1. **Hoy todas las cuentas son «Personal»** (`limitsFor` fija `personal` hasta 009/010). Decidido por Adrián: andamiaje temporal de §2.1 para la demo,
   sin condicionar a la 009 y sin tocar billing; se borra en la última tarea. Riesgo: que quede rastro; lo cubre el `grep` de cierre.
8. **`usuario` sin RLS** (confirmado por `architect`): `UserDirectoryAdapter` lee solo `id, nombre`; no se toca ninguna política.
2. **Edición antes de 012**: las políticas RLS dejan ver `archivo`, `sesion_edicion` y `participacion` solo al propietario; el nivel Editor es
   código correcto pero inalcanzable hasta que 012 amplíe `accessibleNodes` y las políticas. Se anota en `pendientes.md`.
3. **Edición sobre versión vieja**: una carga o restauración (014) durante la sesión crea otra versión vigente; el guardado se registra como
   versión nueva encima (inmutable, nada se pierde). Una sesión `guardando` bloquea nuevas aperturas (CA del contrato).
4. **Alcanzabilidad ONLYOFFICE ↔ api** en Docker (api en el host): `host.docker.internal`, `ALLOW_PRIVATE_IP_ADDRESS` y que la URL de descarga del callback traiga un origen de la lista blanca; se valida en el smoke.
5. **Memoria** (`api` 768 MB junto a ONLYOFFICE): descarga y subida van por flujo (`putObject(key, stream, length)`), sin cargar el `.docx`; el tope editable y la concurrencia 1 siguen acotando el trabajo. El límite se registra en 023.
6. **Poda y `CHECK espacio_usado >= 0`** (`ck_usuario_espacio_usado`, migración `20260930100000`, sobre `usuario`): `registerEditedVersion` suma la versión nueva y después resta solo los bytes de las versiones podadas, ambos con `addUsedBytes` bajo `lockUsage` y en la misma transacción. Como el contador ya incluía esas versiones, nunca baja de cero; si una deriva lo violara, la transacción revierte y el trabajo reintenta (la conciliación de 007 corrige la deriva). Prueba de borde incluida. Los objetos podados se borran tras el commit, mejor esfuerzo.
7. **Revocación** (CA-16) se detecta en los avisos de estado 1 y por `revokeAccess`; hasta 012 nadie la invoca. Sin corte inmediato (015 P-2).
- **DF**: nuevos DF-66 (`archivo_id` sin FK), DF-67 (procesamiento de `editing-save` en el `api`, corrige `architecture.md` §7.2 paso 5 y la tabla de colas), DF-68
  (se descarta `IIdempotencyStore`; actualiza DF-05), DF-69 (`PlanLimits` suma `maxEditors` y `retainedVersions`, consistente con `architecture.md` §5 y DF-51),
  DF-70 (reescrito: el nombre visible viene de `identity` por `IUserDirectory`, arista `identity → editing`; el `displayName` del cliente se descarta). Se actualizan DF-05, DF-17, DF-18, DF-19, DF-20, DF-30, DF-39 al cerrar la spec.
- **Pendientes** (`pendientes.md`): PD-76 `access`/RLS para Editor (012); PD-77 `sharing.access-revoked` hacia `editing.revokeAccess`; PD-78 ruta del procesador si hay >1 réplica (con PD-74).
- **ADR** (los redacta `architect` en estado Propuesto): ADR-0029 «`editing-save` se procesa en el `api`» (cambia ADR-0001/`architecture.md` §7.2) y
  ADR-0004 «ONLYOFFICE, solo `.docx`» (figura «Pendiente» en el índice). Ambos se aceptan antes de implementar.

## 8. Aprobación
- ¿Hay puerto nuevo entre módulos? **Sí**: `IUserDirectory` (declara `editing`, implementa `identity`), con **arista nueva `identity → editing`**.
  `EditableFileGateway` es una fachada concreta. ¿Tecnología nueva? **No** (ONLYOFFICE en ADR-0004; sin dependencias npm nuevas). ¿Cambio de arquitectura?
  **Sí, menor**: `editing-save` en el `api` y ampliación de `PlanLimits`/`IObjectStorage`. `architect` revisa el puerto, la arista y ADR-0004/0029.
- Sin preguntas abiertas: plan hasta 009 → andamiaje §2.1; nombres → `IUserDirectory`; guardado en el `api` → ADR-0029 (todas de Adrián, 2026-10-16).
- `architect`: **Visto bueno del architect** (2026-10-16, ciclo 2). Los 9 cambios del ciclo 1 están aplicados y comprobados: sin `editing → billing` (DAG intacto con `identity → editing`; el developer cambia `boundaries.js`, `module-graph.spec.ts` y el README de `editing`, con el fixture `editing-imports-billing.ts`); tokens `{sid,oid,exp}` y `{fid,vid,oid,exp}` con `withActor(createActor(oid))` y `payload.key === sid`; `versionId` uuid v5 de `sessionId` y `UNIQUE` = éxito; `worker` sin andamiaje ni `EditingModule`; poda con `addUsedBytes` bajo `lockUsage` en la misma transacción. ADR-0004 y ADR-0029 siguen `Propuesto` hasta que Adrián los acepte; `architecture.md`, `design-model.md` y DF-66 a DF-70 ya están al día. Vigilar: `editing-save` en el `api` (memoria, ADR-0029) y la excepción de `IUserDirectory` sin `actor` (`architecture.md` §6.9).
- **Ciclo 1: cambios aplicados (puntos 1–9).** Lo que Adrián acepta al aprobar el plan: DF-05, DF-19, DF-20, DF-39 y DF-66 a DF-70 pasan a `Aceptado`;
  ADR-0004 y ADR-0029 (excepción a ADR-0001) se aceptan antes de la primera tarea; `IUserDirectory` y la arista `identity → editing` (sin `editing → billing`);
  el `worker` sigue con Personal en la demo. Redibujo de los diagramas de arquitectura y E-R anotado en `pendientes.md` (PD-79, junto con PD-76 a PD-78).
- Adrián: **Aprobado** — 2026-10-16 (acepta ADR-0004, ADR-0029 y DF-05, 19, 20, 39, 66–70)

## 9. Registro de cambios
| Fecha | Cambio | Motivo | Aprobó |
|---|---|---|---|
| 2026-10-16 | Plan inicial con P-1…P-10 | Respuestas de Adrián | — |
| 2026-10-16 | Ciclo 1 con `architect` (9 puntos): sin `editing → billing`; tokens `{sid, oid}` para contenido y `callbackUrl`; idempotencia (uuid v5, UNIQUE = éxito, 3 intentos, `creado_por`); sin `nombre_visible`; `maxEditors === 0`; endurecimiento de contenido y callback; andamiaje con `APP_ENV` y worker intacto; `putObject` con flujo; poda vs `CHECK` | Revisión de `architect` | — |
| 2026-10-16 | Andamiaje temporal de plan de pago (§2.1); `IUserDirectory` y arista `identity → editing` (DF-70 reescrito); ADR-0004 y 0029 referenciados; CA-14 con aviso por `toUser` y `lastSaveFailed`; `EDITING_OWNER_PLAN_READ_ONLY`; 10 estados de UI | Decisiones de Adrián | Adrián |
| 2026-10-16 | Plan aprobado; ADR-0004/0029 y DF aceptados | Revisión de Adrián | Adrián |
