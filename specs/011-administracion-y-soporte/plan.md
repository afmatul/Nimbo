# Plan 011 — Administración y soporte

> Spec: `./spec.md` · Estado del plan: **Propuesto** (2026-10-06, Fátima). Lo aprueba Adrián; pasa por `architect` (§8).
> Dice qué archivos se tocan y qué hace cada uno; no es el código en prosa. Reutiliza lo que ya existe en `identity`,
> `billing`, `storage` y `audit` (fachadas pequeñas en el módulo dueño, hallazgos 10–12 de Adrián).

## 1. Resumen técnico
- `backoffice` (M8) orquesta y no tiene reglas ni tablas propias: cuatro controladores por razón de cambio (cuentas, catálogo,
  métricas, metadatos; DF-36), cada uno con `@Roles`, y servicios que llaman a fachadas del módulo dueño (DF-04): cuentas en
  `identity`, catálogo en `billing`, metadatos en `storage` (`INodeMetadataReader`, PD-31). Autorizar = `RolesGuard`.
- Toda acción interna (suspender, reactivar, alta, crear o desactivar plan, consultar metadatos) corre en **una transacción**
  `withActor(actor)` junto con su evento `IAuditLogger.recordInTransaction` (004 D-5): sin evento no hay acción.
- RN-7 y CA-7 se serializan con un candado de transacción (`pg_advisory_xact_lock`) del «padrón de Administradores»; dos
  suspensiones simultáneas no pueden dejar cero Administradores activos.
- El alta interna reutiliza `token_cuenta` (hash, un solo uso) con el tipo nuevo `alta_interna`; CA-7 es un script de servidor
  (`pnpm --filter api admin:bootstrap`) que arranca un contexto Nest sin HTTP, como `migrate.ts`.
- Métricas (CA-12): conteos y `SUM(usuario.espacio_usado)` en una sola lectura agregada de `identity` (dueño de la tabla), sin
  recalcular desde `archivo`; los conteos por plan los da `billing` (sin `suscripcion` hasta la 009: todo cliente es Personal).
- Web: área real por rol en `(app)/(interno)` según los cinco mockups de `backoffice/`; `/interno` deja de ser marcador.

## 2. Módulos, archivos y diseño
Dueño del módulo entre corchetes: lo ajeno se pide a su dueño en su PR (`specs/README.md`, «un módulo, un dueño»).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| identity/domain [Adrián] | `internal-user.entity.ts` (cambia) | `InternalUser.enroll(props)` (rol ≠ CLIENT, `employeeCode` obligatorio, correo verificado), `suspend()`, `reactivate()`, `setFirstPassword(hash)`; `ClientUser` gana `suspend()`/`reactivate()` |
| identity/domain | `employee-code.vo.ts` (nuevo) | `EmployeeCode`: recorta, pasa a mayúsculas y valida el formato (Q-4) |
| identity/domain | `verification-token.entity.ts` (cambia) | `VerificationTokenType` suma `'alta_interna'` |
| identity/domain/errors | `account-not-found`, `cannot-suspend-self`, `last-active-admin`, `account-state-conflict`, `enrollment-conflict`, `admin-already-exists`, `setup-link-invalid`, `setup-link-expired` (nuevos) | Errores tipados con `code` (§4) |
| identity/application | `account-directory.ts` (nuevo, fachada) | Lecturas para `backoffice`: `list(actor, query)`, `get(actor, id)`, `findClientByEmail(actor, email)` (solo `CLIENT`; interna o inexistente → `null`), `statistics(actor)` |
| identity/application | `account-administration.ts` (nuevo, fachada) | `suspend(actor, id)`: candado del padrón → fila `FOR UPDATE` → no a sí mismo → no al último Admin activo → `suspendida` + `revokeAllExcept(id, null, now)` (002 D-10). `reactivate(actor, id)` |
| identity/application | `internal-account-enrollment.ts` (nuevo, fachada) | `enroll(actor, command)` y `enrollInitialAdmin(command)` (candado del padrón; con un Admin activo, `AdminAlreadyExistsError`); insertan la cuenta con un hash de un secreto aleatorio descartado, emiten el enlace `alta_interna` y devuelven `{ account, deliverInvitation() }` para enviar el correo **después** del commit |
| identity/application | `account-setup.service.ts` (nuevo) | `checkLink(token)` y `setFirstPassword(command)`: reutiliza `findAccountToken`, `evaluatePassword` e `IPasswordHasher`; consume el token, fija la contraseña, no toca sesiones (CA-5) |
| identity/application/mail | `internal-invitation-mail.template.ts` (nuevo) | Correo con el enlace (el token solo va en el fragmento); `web-links.ts` suma `accountSetup: '/crear-contrasena'` |
| identity/application/ports | `i-user-repository.port.ts` (cambia) · `i-account-directory.repository.port.ts` (nuevo) | Repositorio (Art. V.2 b): `insertInternalIfAbsent`, `updateStatus`, `lockAdminRoster`, `countActiveAdmins`, `findByEmployeeCode`. El nuevo es un modelo de lectura paginado (lista, ficha, estadísticas) |
| identity/infrastructure | `typeorm-user.repository.ts` (cambia), `typeorm-account-directory.repository.ts`, `audit-actor-directory.adapter.ts` (nuevos) | SQL sobre `TransactionContext` (se une al `withActor` del llamador). El adaptador implementa `IAuditActorDirectory` de `audit` (nombres de actores internos por id) |
| identity/presentation | `password.controller.ts` (cambia) | `POST /auth/account-setup/check` y `POST /auth/account-setup`, `@Public()`, delegan en `AccountSetupService` |
| identity | `identity.module.ts`, `index.ts` (cambian) | Exporta las tres fachadas y el adaptador; nada de repositorios ni entidades |
| billing/domain [Juan Marcos escribe, Q-7] | `plan.entity.ts`, `plan-limits-set.vo.ts`, `plan-slug.ts`, `plan-rules.ts` (nuevos) | `Plan` (nombre del diagrama M4) con `PlanLimitsSet` VO (no `PlanLimits`: ese nombre ya es el tipo de `storage` con los dos límites de la carga): `Plan.create` valida CA-11 (precio ≥ 0, límites > 0, editores ≥ 0, máx. por archivo ≤ cuota y ≤ `MAX_FILE_BYTES_CEILING` = 2 GB, RNF-02) y deriva el `slug`; `deactivate(now)` rechaza Personal (`PERSONAL_PLAN_SLUG`) y un plan ya desactivado. Sin `Money` (llega con la 009) |
| billing/domain/errors | `plan-invalid.error.ts`, `plan-not-deactivatable.error.ts`, `plan-already-deactivated.error.ts` (nuevos) | 422 con `fields` · 409 · 409 |
| billing/application | `plan-catalog.service.ts` (lo crea la 008 con `list()`; la 011 lo amplía) | `create(actor, command)` (nombre único → `fields`), `deactivate(actor, id)` (CAS `desactivado_en IS NULL`). `backoffice` no revalida |
| billing/application | `subscription-administration.ts` (nuevo, fachada) | `planNamesFor(actor, clientIds)` y `clientCountsByPlan(actor, clientCount)`. Hasta la 009 aplica la regla vigente de `PlanLimitsAdapter`: sin `suscripcion`, Personal (PD-75) |
| billing/application/ports, infrastructure | `i-plan-repository.ts` y `typeorm-plan.repository.ts` (los crea la 008 con `listAll()`; la 011 suma `insert`, `deactivate` y el conteo), `plan.mapper.ts` (nuevo); `plan.orm-entity.ts`, `plan-limits.adapter.ts` (cambian) | Repositorio sobre `TransactionContext` (si usara `@InjectRepository`, la escritura no entraría en la transacción del evento). La entidad mapea `desactivado_en`; el adaptador usa `PERSONAL_PLAN_SLUG` |
| storage/application [Adrián] | `node-metadata-reader.ts` (nuevo, puerto) | `INodeMetadataReader.listForOwner(actor, ownerId, page)` → `{ items: FileMetadata[], total }`; `FileMetadata` = id, nombre, tipo, tamaño, `createdAt`, `updatedAt`, `trashedAt`. Exige `withActor` |
| storage/infrastructure | `sql-node-metadata.reader.ts` (nuevo) | Solo columnas de `archivo` (nunca `version_archivo`, `clave_objeto`, `carga`); orden `actualizado_en DESC, id DESC` |
| storage | `index.ts`, `storage.module.ts` (cambian) | Exporta el puerto, el token y el tipo; provee el adaptador |
| audit [Adrián] | `audit-action.ts`, `audit-catalog.ts` (cambian) | Acciones `account.suspended`, `account.reactivated`, `account.internal_created` (`role`), `account.bootstrap_admin` (sistema, recurso `account`), `client.files_viewed`, `plan.created`, `plan.deactivated` (recurso `plan`, sin afectado) |
| audit | `i-audit-logger.port.ts`, `audit-entry.ts`, `audit.service.ts`, `typeorm-audit.repository.ts` (cambian) | `targetUserId` admite `null` (catálogo y sistema); `actor` admite el actor de sistema (`actor_id` nulo, `rol_actor` `SYSTEM`), que se escribe con `run()` sin actor |
| audit/application/ports | `i-audit-actor-directory.port.ts` (nuevo) | `IAuditActorDirectory.namesOf(actorIds)`; `listForUser` resuelve el nombre de los actores internos de la página (CA-16). Lo implementa `identity` |
| audit/presentation | `audit-event-response.ts` (cambia) | `actorName` solo con origen `staff` (requiere corregir 004 CA-14, Q-1) |
| backoffice [Fátima] | `application/internal-action.service.ts` (nuevo) | `InternalActionService` (nombre del diagrama) por **composición**, no Template Method: ejecuta la acción dentro de `withActor` y registra su evento en esa transacción. No autoriza (sin `assertInternal`) ni valida. Tres usuarios: Admin, CatalogAdmin, Support (regla de tres) |
| backoffice/application | `admin.service.ts` · `catalog-admin.service.ts` · `support.service.ts` · `metrics.service.ts` · `initial-admin-bootstrapper.ts` (nuevos) | Cuentas y altas (lista con plan de cada cliente) · catálogo con conteo por plan · metadatos (correo → cliente o `ClientNotFoundError` sin auditar → lectura + evento) · tablero agregado · CA-7 con evento de sistema |
| backoffice/presentation | `accounts.controller.ts`, `plans.controller.ts`, `metrics.controller.ts`, `client-files.controller.ts` + `*-response.ts` (nuevos) | Validan con `contracts`, delegan y mapean por **lista blanca** (esquemas `strict`) |
| backoffice | `domain/errors/client-not-found.error.ts`, `backoffice.module.ts`, `index.ts`, `README.md` | 404 `BACKOFFICE_CLIENT_NOT_FOUND`; módulo y API pública |
| api | `app.module.ts`, `audit-actor-directory-binding.module.ts`, `scripts/bootstrap-admin.ts`, `bootstrap-admin.module.ts`, `package.json` | Registra `BackofficeModule`; enlaza `IAuditActorDirectory` en la raíz (patrón `PlanLimitsBindingModule`); script `admin:bootstrap` |
| config | `packages/config/eslint/boundaries.js` + *fixtures* | `backoffice → identity, billing, storage, audit`; `identity → notifications, audit`; `audit` sigue sin aristas (PD-77) |
| contracts | `src/backoffice/` (nuevo), `src/identity/` y `src/audit/` (cambian) | Esquemas `strict`, `BACKOFFICE_PAGE_SIZE = 10`, códigos de error; reutiliza `byteCount` y `timestamp` |
| api/migrations | cinco migraciones (§3) | — |

- **Puertos nuevos y regla V.2**: `INodeMetadataReader` (diagrama M8; lo declara **e implementa** `storage` y lo consume
  `backoffice`: es repositorio, b, y no crea ciclo porque `storage` no importa `backoffice`; cierra PD-31).
  `IAuditActorDirectory` (d: `audit` no puede importar `identity`; lo declara el transversal, regla 5 de ADR-0010, como el
  puerto token→`Actor`). `IAccountDirectoryRepository` e `IPlanRepository`, internos (b). **Fachadas sin interfaz**:
  `AccountDirectory`, `AccountAdministration`, `InternalAccountEnrollment`, `PlanCatalogService` y
  `SubscriptionAdministration` son clases (no hay ciclo ni segunda implementación; DF-04 queda con estos nombres).
  `IPlanLimitsProvider` no cambia.
- **Dependencias nuevas**: `backoffice → identity, billing, storage, audit` (ya permitidas en `architecture.md` §3) e
  `identity → audit` para implementar `IAuditActorDirectory` (`identity → audit` ya está permitida). DAG intacto.
- **Frontend** (`apps/web/src`): `app/(app)/(interno)/admin/{cuentas,cuentas/[id],cuentas/[id]/metadatos,cuentas/nueva,
  planes,planes/nuevo,metricas}`, `soporte/metadatos`, `operacion/metricas`, cada grupo con `RequireRole` de un rol;
  `(public)/crear-contrasena` con el patrón de `(public)/restablecer-contrasena` (002) y sus componentes de
  `features/identity` (P-15; tokens de Cielo Sereno); con el enlace vencido indica «¿Olvidaste tu contraseña?» (CA-5). `features/backoffice/` (`api.ts`, hooks, componentes por pantalla, `internal-area-layout`
  sobre `AppLayout`, `page-pager`, `plan-card`, `client-files-table`), `features/access/home-path.ts` (inicio por rol:
  `/admin/cuentas`, `/soporte/metadatos`, `/operacion/metricas`), `lib/error-catalog.ts`. Reutiliza `StateView`,
  `ConfirmDestructiveDialog`, `FileTypeChip`, `QuotaBar`, `ForbiddenState` y `RequireRole`; crea `StatusBadge` en
  `components/nimbo/` (inventario de `ui-guidelines.md` §4). `PlanCard` vive en `features/backoffice` hasta que 008 lo use (PD-78).

## 3. Datos
```sql
-- 20261007100000-agregar-codigo-empleado-a-usuario.ts (identity)
ALTER TABLE usuario ADD COLUMN codigo_empleado varchar(20) NULL,
  ADD CONSTRAINT ck_usuario_codigo_empleado_cliente CHECK (rol <> 'CLIENT' OR codigo_empleado IS NULL),
  ADD CONSTRAINT ck_usuario_codigo_empleado_interna CHECK (rol = 'CLIENT' OR codigo_empleado IS NOT NULL),
  ADD CONSTRAINT ck_usuario_codigo_empleado_largo CHECK (char_length(codigo_empleado) BETWEEN 1 AND 20);
CREATE UNIQUE INDEX uq_usuario_codigo_empleado ON usuario (codigo_empleado) WHERE codigo_empleado IS NOT NULL;
-- 20261007100100-agregar-alta-interna-a-token-cuenta.ts (identity)
ALTER TABLE token_cuenta DROP CONSTRAINT ck_token_cuenta_tipo,
  ADD CONSTRAINT ck_token_cuenta_tipo CHECK (tipo IN ('verificacion', 'recuperacion', 'alta_interna'));
-- 20261007100200-agregar-desactivado-en-a-plan.ts (billing; sin RLS: catálogo)
ALTER TABLE plan ADD COLUMN desactivado_en timestamptz NULL,
  ADD CONSTRAINT ck_plan_personal_activo CHECK (slug <> 'personal' OR desactivado_en IS NULL),
  ADD CONSTRAINT ck_plan_max_archivo CHECK (max_archivo_bytes <= cuota_bytes AND max_archivo_bytes <= 2147483648);
CREATE UNIQUE INDEX uq_plan_nombre ON plan (lower(btrim(nombre)));
-- 20261007100300-ampliar-evento-auditoria-para-acciones-internas.ts (audit)
ALTER TABLE evento_auditoria ALTER COLUMN usuario_afectado_id DROP NOT NULL,
  DROP CONSTRAINT evento_auditoria_rol_actor_check, DROP CONSTRAINT evento_auditoria_tipo_recurso_check,
  ADD CONSTRAINT ck_evento_rol_actor CHECK (rol_actor IN ('CLIENT','ADMIN','SUPPORT','OPERATOR','SYSTEM')),
  ADD CONSTRAINT ck_evento_tipo_recurso CHECK (tipo_recurso IN ('file','folder','upload','account','plan')),
  ADD CONSTRAINT ck_evento_sistema CHECK (rol_actor <> 'SYSTEM' OR actor_id IS NULL),
  ADD CONSTRAINT ck_evento_destino CHECK (usuario_afectado_id IS NOT NULL OR recurso_id IS NOT NULL);
CREATE POLICY evento_auditoria_alta_sistema ON evento_auditoria FOR INSERT TO nimbo_app
  WITH CHECK (nimbo_actor_id() IS NULL AND actor_id IS NULL AND rol_actor = 'SYSTEM' AND usuario_afectado_id IS NULL);
-- 20261007100400-indice-metadatos-de-archivo.ts (storage)
CREATE INDEX idx_archivo_propietario_actualizado ON archivo (propietario_id, actualizado_en DESC, id DESC);
```
- **`down`** (en orden inverso): `DROP INDEX idx_archivo_propietario_actualizado` · borrar los eventos con afectado nulo, rol
  `SYSTEM` o recurso `account`/`plan`, `DROP POLICY`, restaurar los dos CHECK de 004 y `SET NOT NULL` · `DROP INDEX
  uq_plan_nombre`, quitar los dos CHECK y `desactivado_en` · borrar los tokens `alta_interna` y restaurar el CHECK de 001 ·
  `DROP INDEX uq_usuario_codigo_empleado`, quitar los CHECK y la columna. Se prueba `up → down → up` (corre como dueño).
- `codigo_empleado` (RN-5): el dominio (`InternalUser.enroll`) y la BD lo exigen en internas y lo prohíben en clientes. Hoy
  no hay cuentas internas reales (003 D-3); si una base local tiene alguna sin código, la migración falla con un mensaje
  que lo dice (no inventa códigos). Las pruebas que insertan internas por SQL pasan a usar los ayudantes de filas
  (`identity-rows.ts`, `accounts.ts`, `isolation-world.ts`, `storage-test-db.ts`), que ponen un código de prueba
  único cuando el rol no es `CLIENT`; las que insertan sin ayudante se corrigen una por una (tarea propia).
- Catálogo: un plan **no tiene `UPDATE`** fuera de `desactivado_en` (no hay operación para editarlo, RN-4). Los CHECK son
  segunda barrera de las reglas de `Plan`. La semilla de 006a cumple todos (Institucional = 2 GB exactos).
- Auditoría: los eventos de catálogo y el alta inicial no tienen afectado; ninguna política de lectura los alcanza (CA-16).
  La política de sistema solo admite eventos sin actor y sin afectado fuera de cualquier `withActor`.
- Sin índices nuevos en `usuario`: lista ordenada por `creado_en DESC, id DESC` sobre miles de filas (RNF-14 holgado); se
  reevalúa con k6 (023).

## 4. Contratos
Prefijo `/api/v1`. Errores comunes: `401 SHARED_UNAUTHENTICATED`, `403 SHARED_FORBIDDEN` (rol fuera de `@Roles`, CA-14).

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/backoffice/accounts?email&page` | ADMIN | prefijo de correo (Q-5), página desde 1 → `200 { items: AccountListItem[], page, pageSize: 10, total }`; `AccountListItem = { id, email, fullName, role, status, emailVerified, planName \| null, usedBytes \| null, createdAt, isSelf }` (internas: `null`) | `400 BACKOFFICE_INVALID_QUERY` |
| GET | `/backoffice/accounts/:id` | ADMIN | → `200 AccountListItem` | `404 IDENTITY_ACCOUNT_NOT_FOUND` |
| POST | `/backoffice/accounts/:id/suspension` | ADMIN | sin cuerpo → `200 AccountListItem` | `404 IDENTITY_ACCOUNT_NOT_FOUND` · `409 IDENTITY_CANNOT_SUSPEND_SELF` · `409 IDENTITY_LAST_ACTIVE_ADMIN` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT` |
| DELETE | `/backoffice/accounts/:id/suspension` | ADMIN | → `200 AccountListItem` (reactivada) | `404` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT` |
| POST | `/backoffice/accounts` | ADMIN | `{ fullName, email, employeeCode, role: ADMIN\|SUPPORT\|OPERATOR }` → `201 AccountListItem` | `422 IDENTITY_INVALID_INPUT` (`fields`; `role` CLIENT) · `409 IDENTITY_ENROLLMENT_CONFLICT` (`fields`: `email` `EMAIL_IN_USE`, `employeeCode` `EMPLOYEE_CODE_IN_USE`, ambos a la vez si aplica) |
| GET | `/backoffice/plans` | ADMIN | → `200 { items: PlanAdminView[] }` = `{ id, slug, name, description, priceCents, quotaBytes, maxFileBytes, maxEditors, agentQueriesPerMonth, retainedVersions, trashRetentionDays, deactivatedAt \| null, clientCount, isDefault }` | — |
| POST | `/backoffice/plans` | ADMIN | `{ name, description, priceCents, quotaBytes, maxFileBytes, maxEditors, agentQueriesPerMonth, retainedVersions, trashRetentionDays }` → `201 PlanAdminView` | `422 BILLING_PLAN_INVALID` (`fields`, incl. `name` `NAME_TAKEN`) |
| POST | `/backoffice/plans/:id/deactivation` | ADMIN | → `200 PlanAdminView` | `404 PLAN_NOT_FOUND` · `409 BILLING_PLAN_NOT_DEACTIVATABLE` · `409 BILLING_PLAN_ALREADY_DEACTIVATED` |
| GET | `/backoffice/metrics` | ADMIN, OPERATOR | → `200 { accounts: { total, clients, internal, byStatus: { active, suspended } }, usedBytesTotal, byPlan: { planId, name, deactivatedAt \| null, clientCount }[] }` (activos siempre; inactivos con cuentas) | — |
| GET | `/backoffice/client-files?email&page` | ADMIN, SUPPORT | correo exacto → `200 { client: { id, fullName, email }, items: { id, name, kind, sizeBytes, createdAt, updatedAt, trashedAt \| null }[], page, pageSize: 10, total }` | `404 BACKOFFICE_CLIENT_NOT_FOUND` (idéntico para inexistente e interna, sin auditoría) · `400 BACKOFFICE_INVALID_QUERY` |
| POST | `/auth/account-setup/check` | público | `{ token }` → `200 { status: 'valid' }` | `400 IDENTITY_SETUP_LINK_INVALID` · `410 IDENTITY_SETUP_LINK_EXPIRED` |
| POST | `/auth/account-setup` | público | `{ token, password }` → `200 { status: 'password-set' }` | los dos anteriores · `422 IDENTITY_WEAK_PASSWORD` |

- `GET /audit/my-events` (004): `AuditEventResponse` suma `actorName?: string` (solo `staff`) y los textos de las acciones nuevas.
- Página por número con `total` (los mockups muestran «Página N de M»): desvío de la convención de cursor
  (`conventions.md`), registrado en **DF-66**, con listados acotados (cuentas, archivos de un cliente). CA-7 **no** es HTTP: `pnpm --filter api admin:bootstrap --name … --email
  … --employee-code …`; sale con `0` (creado) o `1` (`IDENTITY_ADMIN_ALREADY_EXISTS` u otro error) y nunca imprime el token.
- Sin eventos de Socket.IO ni colas nuevas (el correo usa la cola `mail` existente).

## 5. Seguridad y operación
- **Actor**: todo método de fachada recibe `actor` primero (DF-01). Lecturas de `usuario` y `plan` no tienen RLS (tablas sin
  datos de archivos); la única lectura de datos de cliente es `INodeMetadataReader`, siempre dentro de `withActor` con la
  política `archivo_metadatos_internos` (005) y el filtro `propietario_id` **en el SQL**. Excepción a `accessibleNodes`
  documentada en `architecture.md` §6.5: un rol interno nunca tiene nodos accesibles; lee metadatos por política, sin contenido.
- **Sin contenido** por construcción: el lector no toca `version_archivo` (RLS sin política interna) ni `carga`; respuestas
  `strict` y mapeadores de lista blanca. Operador: `@Roles` lo limita a métricas y RLS le da 0 filas de `archivo`.
- **Auditoría**: §2 (`InternalActionService`). Atributos sin nombres ni correos (solo `role` del alta). La consulta de
  metadatos se audita aunque la página venga vacía; el 404 no. El nombre del actor no se guarda en el evento: se resuelve
  al leer, así la anonimización de 004 D-8 lo borra.
- **Bitácoras** (Pino, ids): `backoffice.account.suspended|reactivated|enrolled`, `backoffice.plan.created|deactivated`,
  `backoffice.client_files.viewed`, `identity.session.revoked` (`reason: account_suspended`), `identity.invitation.mail_failed`,
  `admin.bootstrap.completed|refused`. Nunca correo, nombre de archivo, token ni enlace (el correo de búsqueda va en la
  cadena de consulta, que `http.request` ya descarta).
- `/auth/account-setup*` reutilizan el modelo de 002: token de 256 bits, solo hash, consumo atómico; sin límite de tasa propio.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-9, CA-10, CA-11 (reglas de `Plan`, `slug`, Personal, ya desactivado) | unit | `billing/domain/plan.entity.spec.ts`, `plan-slug.spec.ts` |
| CA-2, CA-3, CA-4 (a sí mismo, último Admin, estado), CA-5, CA-6 (dominio y fachadas con dobles en memoria) | unit | `identity/application/account-administration.spec.ts`, `internal-account-enrollment.spec.ts`, `account-setup.service.spec.ts`, `domain/employee-code.vo.spec.ts` |
| Acción + evento en una transacción; si el evento falla, la acción se revierte; 404 sin evento | unit | `backoffice/application/internal-action.service.spec.ts`, `support.service.spec.ts` |
| CA-1 a CA-6 por HTTP (lista, búsqueda, ficha, suspender revoca sesiones y el login da `IDENTITY_ACCOUNT_SUSPENDED`, reactivar, alta + correo en Mailpit + fijar contraseña + login) | int | `test/int/backoffice/accounts.int-spec.ts`, `test/int/identity/account-setup.int-spec.ts` |
| **RN-7**: dos suspensiones cruzadas simultáneas entre los dos únicos Admin → exactamente una gana; CA-7 doble en paralelo → un solo Admin | int | `test/int/backoffice/admin-roster-concurrency.int-spec.ts` |
| CA-7 (script: crea, niega si ya hay Admin, evento de sistema) | int | `test/int/backoffice/bootstrap-admin.int-spec.ts` |
| CA-8 a CA-11 por HTTP (CAS de desactivar, nombre repetido, escritura y evento en la misma transacción) | int | `test/int/backoffice/plans.int-spec.ts` |
| CA-12, CA-13 (conteos y suma; metadatos con papelera; 404 uniforme) | int | `test/int/backoffice/metrics.int-spec.ts`, `client-files.int-spec.ts` |
| CA-14 (matriz rol × ruta, tabla) | int | `test/int/backoffice/roles-matrix.int-spec.ts` |
| CA-16 (el cliente ve fecha, nombre y rol; no ve los de otra cuenta ni los del catálogo) | int | `test/int/audit/internal-events.int-spec.ts` |
| Migraciones `up → down → up` | int | `test/int/backoffice/migrations.int-spec.ts` |
| **CA-15 (bloqueante)**: cada rol interno por cada ruta: sin contenido, texto, URL, `clave_objeto` ni filas de versiones (nombres sembrados casi idénticos entre A y B); Operador y Soporte por SQL como `nimbo_app` (0 filas de `version_archivo`; Operador 0 de `archivo`); Soporte no lee la auditoría del cliente; un cliente no ve eventos internos de otro | iso | `test/isolation/backoffice.iso-spec.ts` (+ `withInternalAccounts` en `setup/isolation-world.ts`) |
| CA-17 (estados de cada pantalla, foco, formulario conserva lo escrito, «sin permiso», 360 px y axe) | web | `features/backoffice/**/*.spec.tsx`, `features/backoffice/a11y.spec.tsx`, `features/access/home-path.spec.ts` |
| Recorrido de punta a punta | humano | tarea de demo (sin E2E: Playwright sigue de marcador, PD-41) |

Cada CA vive en una capa principal: reglas en unit, contrato y concurrencia en int, fugas solo en iso, estados en web.

## 7. Riesgos y coherencia con el diseño
- **R-1 Contradicción con 004** (CA-14 y D-2 prohíben el nombre del actor; 011 CA-16 lo pide): Adrián eligió el puerto
  `IAuditActorDirectory` (Q-1 A); hasta que corrija 004 (PD-79) no se implementa CA-16.
- **R-2 Carrera de RN-7 y de CA-7**: candado de transacción único del padrón tomado **antes** de la fila; prueba de int.
- **R-3 Atomicidad**: si un repositorio no usa `TransactionContext`, su escritura escapa del evento. Mitigación: repos nuevos
  sobre `TransactionContext` y la prueba de reversión en `plans.int-spec.ts` y `accounts.int-spec.ts`.
- **R-4 Correo del alta**: se encola después del commit; si falla, la cuenta queda creada y auditada, se anota
  `identity.invitation.mail_failed` y la persona puede usar «¿Olvidaste tu contraseña?» (nace verificada, Q-3).
- **R-5 Módulos ajenos**: Adrián autorizó a la dueña a cambiar `identity`, `storage` y `audit` (2026-10-07). `billing`
  es de Juan Marcos y la 008 (rama `feat/008-catalogo-y-comparador`, sin integrar) crea `PlanCatalogService` e
  `IPlanRepository`: la parte de `billing` de la 011 la escribe **Juan Marcos** sobre la 008 integrada (Q-7), y su `list()`
  omite los planes con `desactivado_en` (PD-71). Las tareas de catálogo de `backoffice` esperan su PR.
- **R-6 Antes de la 009** todo cliente cuenta como Personal en CA-1, CA-12 y el catálogo (regla vigente, PD-75).
- **R-7 Mockups en `Borrador`** (`ui-guidelines.md` §7): aprobarlos antes de las tareas web.
- **Desviaciones de los diagramas y convenciones**: DF-66 (paginación por página, §4); DF-04, DF-15 (catálogo), DF-27 (`INodeMetadataReader`), DF-33 (`codigo_empleado`),
  DF-36 pasan a `Propuesto (plan 011)`; **DF-65** nuevo con el resto (M8 sin Template Method ni `assertInternal`, servicios
  divididos, `InitialAdminBootstrapper`; M1 fachadas y `AccountSetupService`; M4 `Plan` con `desactivado_en`; T2 actor de
  sistema, afectado nulo, `IAuditActorDirectory`; E-R).
- **Pendientes nuevos**: PD-75 (009 reemplaza la regla Personal en `SubscriptionAdministration`), PD-76 (redibujar), PD-77
  (`boundaries.js`), PD-78 (`PlanCard` a `components/nimbo` con la 008), PD-79 (corregir 004). PD-31 queda resuelto aquí.
- **ADR requeridos**: ninguno (sin tecnología nueva; el contexto Nest del script ya está en la pila). `architect` decide si
  `IAuditActorDirectory` merece una enmienda breve de ADR-0010.
- **Fuera**: 011b, 022b, RN-6 en 012/013 (PD-73), comparador 008 (PD-71), reenviar el enlace de alta, sesiones ajenas.

### Preguntas
- [RESUELTAS] (2026-10-07, Fátima y Adrián) **Q-1** puerto `IAuditActorDirectory` (A); Adrián corrige 004 (PD-79) ·
  **Q-2** patrón de `restablecer-contrasena` con Cielo Sereno (P-15) · **Q-3** internas nacen verificadas; enlace vencido →
  «¿Olvidaste tu contraseña?» · **Q-4** código de 1–20 caracteres en mayúsculas, enlace de 24 h, sin restringir el
  dominio · **Q-5** búsqueda por inicio del correo, 10 por página · **Q-6** conteo por plan en CA-8.
- [RESUELTAS] (2026-10-07, Fátima) **Q-4b** el correo del alta se valida con `emailReasons` de
  `packages/contracts/src/identity/schemas.ts` (el mismo del registro: exige `@` y dominio, máx. 254, `INVALID_EMAIL`); los
  1–20 caracteres son solo del código de empleado · **Q-7** la parte de `billing` (entidad `Plan`, `create`, `deactivate` y
  conteo, sobre la 008) la escribe **Juan Marcos** en su módulo, y su `list()` omite los planes desactivados (PD-71).

## 8. Aprobación
- `architect`: **requerido** — puerto nuevo entre módulos (`IAuditActorDirectory`), primer uso de `INodeMetadataReader`,
  cambios al contrato de `IAuditLogger` (actor de sistema, afectado nulo) y a la RLS de `evento_auditoria`. Veredicto: pendiente.
- Adrián: pendiente.
