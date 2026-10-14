# Plan 011 — Administración y soporte

> Spec: `./spec.md` · Estado del plan: **Aprobado** (Adrián, 2026-10-08; decisiones en §8). `architect` lo aprobó
> con cambios (§8), ya aplicados en §1–§7. Dice qué archivos se tocan y qué hace cada uno; no es el código en prosa.
> Reutiliza `identity`, `billing`, `storage` y `audit` con fachadas pequeñas en el módulo dueño (hallazgos 10–12 de Adrián).

## 1. Resumen técnico
- `backoffice` (M8) orquesta y no tiene reglas ni tablas propias: cuatro controladores por razón de cambio (cuentas, catálogo,
  métricas, metadatos; DF-36), cada uno con `@Roles`, y servicios que llaman a fachadas del módulo dueño (DF-04): cuentas en
  `identity`, catálogo en `billing`, metadatos en `storage` (`INodeMetadataReader`, PD-31). Autorizar por rol = `RolesGuard`.
- Toda operación del backoffice (lecturas incluidas) pasa por `InternalActionService`, que abre `withActor(actor)`, comprueba
  **una vez** que el actor interno sigue `activa` (si no, `403 SHARED_FORBIDDEN`; su token vale hasta 15 min, 002 D-10) y, en
  las acciones, registra el evento con `IAuditLogger.recordInTransaction` en la misma transacción (004 D-5): sin evento no hay acción.
- RN-7 y CA-7 se serializan con un candado de transacción (`pg_advisory_xact_lock`) del «padrón de Administradores», tomado
  **antes** de comprobar al actor en las acciones de cuentas; dos suspensiones simultáneas no dejan cero Administradores activos.
- El alta interna reutiliza `token_cuenta` (hash, un solo uso) con el tipo nuevo `alta_interna`; CA-7 es un script de servidor
  (`pnpm --filter api admin:bootstrap`) con contexto Nest sin HTTP, como `migrate.ts`, y su evento es del actor de sistema,
  que solo existe en `audit` (`SYSTEM` no entra en `Role` ni en `Actor`).
- Métricas (CA-12): conteos y `SUM(usuario.espacio_usado)` en una lectura agregada de `identity` (dueño de la tabla); los
  conteos por plan los da `billing` (sin `suscripcion` hasta la 009: todo cliente es Personal).
- Web: área real por rol en `(app)/(interno)` según los cinco mockups de `backoffice/`; «Seguridad» (002) y «Mi actividad»
  (004) se muestran también dentro del marco interno, reutilizando sus componentes (B-1, decisión explícita, sin mockups nuevos).

## 2. Módulos, archivos y diseño
Dueño del módulo entre corchetes: lo ajeno se pide a su dueño en su PR (`specs/README.md`, «un módulo, un dueño»).

| Módulo / capa | Archivo (nuevo o cambiado) | Responsabilidad |
|---|---|---|
| shared [Adrián autorizó, R-8] | `typeorm-transaction-runner.ts`, `i-transaction-runner.port.ts` (cambian) | `run` se une a **cualquier** transacción en curso (con o sin actor), no solo a un `withActor`; así CA-7 es atómico (T1, DF-65). `withActor` no cambia |
| identity/domain [Adrián autorizó] | `internal-user.entity.ts`, `client-user.entity.ts` (cambian) | `InternalUser.enroll(props)` (rol ≠ CLIENT, `employeeCode` obligatorio, correo verificado), `suspend()`, `reactivate()`, `setFirstPassword(hash)`; `ClientUser.suspend()`/`reactivate()` |
| identity/domain | `employee-code.vo.ts` (nuevo) | `EmployeeCode`: recorta, pasa a mayúsculas y valida `^[A-Z0-9-]{1,20}$` (Q-4) |
| identity/domain | `verification-token.entity.ts` (cambia) | `VerificationTokenType` suma `'alta_interna'` |
| identity/domain/errors | `account-not-found`, `cannot-change-own-status`, `last-active-admin`, `account-state-conflict`, `enrollment-conflict`, `admin-already-exists`, `actor-not-active`, `setup-link-invalid`, `setup-link-expired` (nuevos) | Errores tipados con `code` (§4); `actor-not-active` se traduce a `403 SHARED_FORBIDDEN` |
| identity/application | `account-directory.ts` (nuevo, fachada) | Lecturas: `list(actor, query)`, `get(actor, id)`, `findClientByEmail(actor, email)` (solo `CLIENT`; interna o inexistente → `null`), `statistics(actor)` |
| identity/application | `account-administration.ts` (nuevo, fachada) | `lockAdminRoster()` (reentrante en la transacción) y `assertActorActive(actor)` (lee `usuario.estado` del actor en la transacción vigente). `suspend(actor, id)`: candado → fila `FOR UPDATE` → no a sí mismo → no al último Admin activo → `suspendida` + `revokeAllExcept(id, null, now)` (002 D-10). `reactivate(actor, id)`: candado → no a sí mismo → `activa` |
| identity/application | `internal-account-enrollment.ts` (nuevo, fachada) | `enroll(actor, command)` y `enrollInitialAdmin(command)` (candado; con un Admin activo, `AdminAlreadyExistsError`): insertan la cuenta con el hash de un secreto aleatorio descartado, emiten el enlace `alta_interna` y devuelven `{ account, deliverInvitation() }` para enviar el correo **después** del commit |
| identity/application | `account-setup.service.ts` (nuevo) | `checkLink(token)` y `setFirstPassword(command)`: reutiliza `findAccountToken`, `evaluatePassword` e `IPasswordHasher`; consume el token, fija la contraseña, no toca sesiones (CA-5) |
| identity/application/mail | `internal-invitation-mail.template.ts` (nuevo) | Correo con el enlace (token solo en el fragmento); `web-links.ts` suma `accountSetup: '/crear-contrasena'` |
| identity/application/ports | `i-user-repository.port.ts` (cambia) · `i-account-directory.repository.port.ts` (nuevo) | Repositorio (V.2 b): `insertInternalIfAbsent`, `updateStatus`, `lockAdminRoster`, `countActiveAdmins`, `findByEmployeeCode`, `statusOf`. El nuevo es un modelo de lectura paginado (lista, ficha, estadísticas) |
| identity/infrastructure | `typeorm-user.repository.ts` (cambia), `typeorm-account-directory.repository.ts` (nuevo) | SQL sobre `TransactionContext` (se une a la transacción del llamador) |
| identity/presentation | `password.controller.ts` (cambia) | `POST /auth/account-setup/check` y `POST /auth/account-setup`, `@Public()`, delegan en `AccountSetupService` |
| identity | `identity.module.ts`, `index.ts` (cambian) | Exporta las tres fachadas; nada de repositorios ni entidades |
| billing/domain [Juan Marcos escribe, Q-7] | `plan.entity.ts`, `plan-limits-set.vo.ts`, `plan-slug.ts`, `plan-rules.ts` (nuevos) | `Plan` (nombre de M4) con `PlanLimitsSet` (no `PlanLimits`: ya es el tipo de `storage` con los dos límites de la carga). `Plan.create` valida CA-11 (precio ≥ 0, límites > 0, editores ≥ 0, máx. por archivo ≤ cuota y ≤ `MAX_FILE_BYTES_CEILING` = 2 GB, RNF-02) y deriva el `slug` (`PlanSlug`); `deactivate(now)` rechaza Personal (`PERSONAL_PLAN_SLUG`) y un plan ya desactivado. Sin `Money` (009) |
| billing/domain/errors | `plan-invalid`, `plan-not-deactivatable`, `plan-already-deactivated` (nuevos); `plan-not-found` (de 006a, `PLAN_NOT_FOUND`, no cambia) | 422 con `fields` · 409 · 409 · 404 |
| billing/application | `plan-catalog.service.ts` (lo crea la 008 con `list()`; la 011 lo amplía) | `create(actor, command)` (nombre único → `fields`), `deactivate(actor, id)` (CAS `desactivado_en IS NULL`). `backoffice` no revalida |
| billing/application | `subscription-administration.ts` (nuevo, fachada) | `planNamesFor(actor, clientIds)` y `clientCountsByPlan(actor, clientCount)`; hasta la 009, la regla vigente de `PlanLimitsAdapter` (sin `suscripcion`, Personal; PD-80) |
| billing/ports, infrastructure | `i-plan-repository.ts`, `typeorm-plan.repository.ts` (de la 008; la 011 suma `insert`, `deactivate`, conteo), `plan.mapper.ts` (nuevo); `plan.orm-entity.ts`, `plan-limits.adapter.ts` (cambian) | Repositorio sobre `TransactionContext` (con `@InjectRepository` la escritura escaparía de la transacción del evento). La entidad mapea `desactivado_en`; el adaptador usa `PERSONAL_PLAN_SLUG` |
| storage/application [Adrián autorizó] | `node-metadata-reader.ts` (nuevo, puerto) | `INodeMetadataReader.listForOwner(actor, ownerId, page)` → `{ items: FileMetadata[], total }`; `FileMetadata` = id, nombre, tipo, tamaño, `createdAt`, `updatedAt`, `trashedAt`. Exige `withActor` |
| storage/infrastructure | `sql-node-metadata.reader.ts` (nuevo) | Solo columnas de `archivo` (nunca `version_archivo`, `clave_objeto`, `carga`); orden `actualizado_en DESC, id DESC` |
| storage | `index.ts`, `storage.module.ts` (cambian) | Exporta el puerto, el token y el tipo; provee el adaptador |
| audit [Adrián autorizó] | `audit-action.ts`, `audit-catalog.ts` (cambian) | `account.suspended`, `account.reactivated`, `account.internal_created` (`role`), `account.bootstrap_admin` (sistema), `client.files_viewed` (recurso y afectado: la cuenta), `plan.created`, `plan.deactivated` (recurso `plan`); sin afectado solo los de catálogo y `account.bootstrap_admin` (nadie los ve en «Mi actividad») |
| audit | `audit-actor.ts` (nuevo); `i-audit-logger.port.ts`, `audit-entry.ts`, `audit.service.ts`, `typeorm-audit.repository.ts` (cambian) | `AuditActor = Actor \| SystemActor` (`SYSTEM_ACTOR`, solo en `audit`); `AuditEntry.actorRole: Role \| 'SYSTEM'`; `targetUserId` nulo solo en catálogo y en el alta inicial. Con `SystemActor`, `AuditService` escribe con `run` (se une al `run` del llamador, T1); con `Actor`, `withActor` como hoy |
| audit/presentation | `audit-event-response.ts`, textos de «Mi actividad» (cambian) | Acciones nuevas en español; el origen sigue siendo solo el rol (004 D-2, CA-16). El mapeador envía `resourceType: null` si el recurso es `account` (el texto de la acción ya lo dice) y nunca recibe `SYSTEM` (sin afectado): el contrato de 004 no cambia |
| backoffice [Fátima] | `application/internal-action.service.ts` (nuevo) | `InternalActionService` (nombre de M8) por **composición**: `read(actor, work)` = `withActor` + `assertActorActive`; `run(actor, action)` = lo mismo + (si `action.locksAdminRoster`) `lockAdminRoster()` **antes** de la comprobación + `action.work()` + `recordInTransaction(action.event(resultado))`. Única dueña de «transacción + actor activo + evento» (DRY); no autoriza por rol ni valida |
| backoffice/application | `admin.service.ts` · `catalog-admin.service.ts` · `support.service.ts` · `metrics.service.ts` · `initial-admin-bootstrapper.ts` (nuevos) | Cuentas y altas (`run` con candado; lista y ficha con `read`) · catálogo (`run`; lista con `read`) · metadatos (`run`: correo → cliente o `ClientNotFoundError`, que revierte sin evento) · tablero (`read`) · CA-7: **un solo** `run` sin actor con `enrollInitialAdmin` y el evento de `SYSTEM_ACTOR` |
| backoffice/presentation | `accounts.controller.ts`, `plans.controller.ts`, `metrics.controller.ts`, `client-files.controller.ts` + `*-response.ts` (nuevos) | Validan con `contracts`, delegan y mapean por **lista blanca** (esquemas `strict`) |
| backoffice | `domain/errors/client-not-found.error.ts`, `backoffice.module.ts`, `index.ts`, `README.md` | 404 `BACKOFFICE_CLIENT_NOT_FOUND`; módulo y API pública |
| api | `app.module.ts`, `scripts/bootstrap-admin.ts`, `bootstrap-admin.module.ts`, `package.json` | Registra `BackofficeModule`; script `admin:bootstrap` |
| config | `packages/config/eslint/boundaries.js` + *fixtures* | `backoffice → identity, billing, storage, audit`; `identity → notifications`; `audit` sin aristas (PD-82) |
| contracts | `src/backoffice/` (nuevo), `src/identity/` (cambia); `src/audit/` **no** cambia (N-1) | Esquemas `strict`, `BACKOFFICE_PAGE_SIZE = 10`, códigos; bytes como texto decimal (ADR-0016, PD-87) y `timestamp` |
| api/migrations | cinco migraciones (§3) | — |

- **Puertos y regla V.2**: `INodeMetadataReader` (diagrama M8; lo declara **e implementa** `storage` y lo consume `backoffice`:
  repositorio, b, sin ciclo; cierra PD-31). `IAccountDirectoryRepository` e `IPlanRepository`, internos (b). **Sin interfaz**:
  `AccountDirectory`, `AccountAdministration`, `InternalAccountEnrollment`, `PlanCatalogService`, `SubscriptionAdministration`
  e `InternalActionService` son clases (sin ciclo ni segunda implementación; DF-04). `AuditActor` es un tipo unión, no un
  puerto. `IPlanLimitsProvider` no cambia.
- **Actor activo en lecturas** (B-2 b): las lecturas no auditan, pero también pasan por `InternalActionService.read`: una sola
  clase decide «actor interno vigente» (SRP: los servicios de `backoffice` solo componen fachadas). Sin guarda HTTP aparte.
- **Dependencias nuevas**: `backoffice → identity, billing, storage, audit` (ya en `architecture.md` §3). DAG intacto; `audit`
  no depende de `identity` (el cliente ve solo el rol, que ya guarda `evento_auditoria`).
- **Frontend** (`apps/web/src`): `app/(app)/(interno)/admin/{cuentas,cuentas/[id],cuentas/[id]/metadatos,cuentas/nueva,
  planes,planes/nuevo,metricas}`, `soporte/metadatos`, `operacion/metricas`, cada grupo con `RequireRole` de un rol;
  `interno/page.tsx` redirige al inicio del rol y se retira `internal-area-placeholder`. `(public)/crear-contrasena` con el
  patrón de `restablecer-contrasena` (002, P-15) y estados `default, enviando, error-campos, enlace-vencido, enlace-invalido,
  exito` (vencido → «¿Olvidaste tu contraseña?», CA-5). `features/backoffice/` (`api.ts`, hooks, componentes por pantalla,
  `page-pager`, `plan-card`, `client-files-table`); `lib/error-catalog.ts`. Reutiliza `StateView`, `ConfirmDestructiveDialog`,
  `FileTypeChip`, `QuotaBar`, `ForbiddenState`, `RequireRole`; crea `StatusBadge` en `components/nimbo/` (`ui-guidelines.md` §4).
  `PlanCard` vive en `features/backoffice` hasta que exista el único `PlanCard` acordado con la 008 (PD-83, R-5).
- **Marco interno, «Seguridad» y «Mi actividad»** (B-1; `features/access` es de Adrián, que lo autorizó, R-8): `features/access/components/internal-area-layout.tsx` (nuevo; sobre
  `AppLayout`, navegación de `internalNavFor(role)`) y `features/access/home-path.ts` (inicio por rol: `/admin/cuentas`,
  `/soporte/metadatos`, `/operacion/metricas`; `activityPathFor(role)`): un solo lugar para rutas internas, usado por
  `backoffice`, `identity` y `audit`. `security-view.tsx`: la rama interna usa `InternalAreaLayout` (la URL `/cuenta/seguridad`
  ya sirve a los cuatro roles). `activity-view.tsx`: separa el contenido (`ActivityPanel`) del marco; `SessionActivityView`
  conserva el del cliente (con `SidebarQuota`) en `(cliente)/actividad`, y la nueva `(interno)/interno/actividad/page.tsx`
  monta `ActivityPanel` en `InternalAreaLayout` (Next no admite la misma URL en dos grupos). `AccountMenu` recibe `activityHref`
  y `SessionAccountMenu` le pasa `activityPathFor(user.role)`. La API ya lo permite (004 CA-12, 002).

## 3. Datos
```sql
-- 20261007100000-agregar-codigo-empleado-a-usuario.ts (identity)
ALTER TABLE usuario ADD COLUMN codigo_empleado varchar(20) NULL,
  ADD CONSTRAINT ck_usuario_codigo_empleado_cliente CHECK (rol <> 'CLIENT' OR codigo_empleado IS NULL),
  ADD CONSTRAINT ck_usuario_codigo_empleado_interna CHECK (rol = 'CLIENT' OR codigo_empleado IS NOT NULL),
  ADD CONSTRAINT ck_usuario_codigo_empleado_formato CHECK (codigo_empleado ~ '^[A-Z0-9-]{1,20}$'),
  ADD CONSTRAINT ck_usuario_codigo_empleado_normalizado CHECK (codigo_empleado = upper(btrim(codigo_empleado)));
CREATE UNIQUE INDEX uq_usuario_codigo_empleado ON usuario (codigo_empleado) WHERE codigo_empleado IS NOT NULL;
-- 20261007100100-agregar-alta-interna-a-token-cuenta.ts (identity)
ALTER TABLE token_cuenta DROP CONSTRAINT ck_token_cuenta_tipo,
  ADD CONSTRAINT ck_token_cuenta_tipo CHECK (tipo IN ('verificacion', 'recuperacion', 'alta_interna'));
-- <fecha del día>-agregar-desactivado-en-a-plan.ts (billing; sin RLS: catálogo; fecha posterior a las de T-01 y T-02, acordado 2026-10-08)
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
  ADD CONSTRAINT ck_evento_bootstrap_sistema CHECK (accion <> 'account.bootstrap_admin' OR rol_actor = 'SYSTEM'),
  ADD CONSTRAINT ck_evento_destino CHECK ((usuario_afectado_id IS NULL)
    = (tipo_recurso IS NOT DISTINCT FROM 'plan' OR accion = 'account.bootstrap_admin'));
CREATE POLICY evento_auditoria_alta_sistema ON evento_auditoria FOR INSERT TO nimbo_app
  WITH CHECK (nimbo_actor_id() IS NULL AND actor_id IS NULL AND rol_actor = 'SYSTEM'
    AND accion = 'account.bootstrap_admin' AND tipo_recurso = 'account' AND recurso_id IS NOT NULL
    AND usuario_afectado_id IS NULL);
-- 20261007100400-indice-metadatos-de-archivo.ts (storage)
CREATE INDEX idx_archivo_propietario_actualizado ON archivo (propietario_id, actualizado_en DESC, id DESC);
```
- **`down`** (orden inverso): `DROP INDEX idx_archivo_propietario_actualizado` · auditoría: `NO FORCE ROW LEVEL SECURITY` →
  `DELETE` de los eventos con afectado nulo, rol `SYSTEM` o recurso `account`/`plan` → `FORCE` (como `20260930100300` de 005;
  con `FORCE` el dueño borraría 0 filas), `DROP POLICY evento_auditoria_alta_sistema`, quitar los CHECK nuevos, restaurar
  `evento_auditoria_rol_actor_check` y `evento_auditoria_tipo_recurso_check` con sus nombres y definiciones de 004 y `SET NOT
  NULL` · `DROP INDEX uq_plan_nombre`, quitar los dos CHECK y `desactivado_en` · borrar los tokens `alta_interna` y restaurar
  el CHECK de 001 · `DROP INDEX uq_usuario_codigo_empleado`, quitar los cuatro CHECK y la columna. Prueba `up → down → up`
  con un dueño **sin `SUPERUSER`** (como en producción).
- `codigo_empleado` (RN-5): el dominio (`EmployeeCode`, `InternalUser.enroll`) y la BD (obligatorio en internas, prohibido en
  clientes, 1–20, normalizado, único) lo exigen. Hoy no hay cuentas internas reales (003 D-3); si una base local tiene alguna
  sin código, la migración falla con un mensaje que lo dice (no inventa códigos). Las pruebas que insertan internas por SQL
  usan los ayudantes (`identity-rows.ts`, `accounts.ts`, `isolation-world.ts`, `storage-test-db.ts`), que ponen un código
  único en mayúsculas si el rol no es `CLIENT`; las que insertan sin ayudante se corrigen una por una (tarea propia).
- Catálogo: un plan **no tiene `UPDATE`** fuera de `desactivado_en` (RN-4). Los CHECK son segunda barrera de las reglas de
  `Plan`. La semilla de 006a cumple todos (Institucional = 2 GB exactos).
- Auditoría: solo los de catálogo y el alta inicial no tienen afectado (`ck_evento_destino`, sin hueco por `NULL`); ninguna
  política de lectura los alcanza, así que «Mi actividad» nunca muestra un actor `SYSTEM` y el contrato de 004 no cambia. La
  política de sistema solo admite ese evento, fuera de cualquier `withActor`: un `run` sin actor no inserta otros `SYSTEM`.
- Sin índices nuevos en `usuario`: lista por `creado_en DESC, id DESC` sobre miles de filas (RNF-14 holgado); k6 en 023.

## 4. Contratos
Prefijo `/api/v1`. Errores comunes de `/backoffice/*`: `401 SHARED_UNAUTHENTICATED`; `403 SHARED_FORBIDDEN` (rol fuera de
`@Roles`, CA-14, o actor interno ya no `activa`, RN-7). Los campos de bytes van como texto decimal (ADR-0016, PD-87).

| Método | Ruta | Rol | Request → Respuesta | Errores (`code`) |
|---|---|---|---|---|
| GET | `/backoffice/accounts?email&page` | ADMIN | prefijo de correo (Q-5), página desde 1 → `200 { items: AccountListItem[], page, pageSize: 10, total }`; `AccountListItem = { id, email, fullName, role, status, emailVerified, planName \| null, usedBytes \| null, createdAt, isSelf }` (internas: `null`) | `400 BACKOFFICE_INVALID_QUERY` |
| GET | `/backoffice/accounts/:id` | ADMIN | → `200 AccountListItem` | `404 IDENTITY_ACCOUNT_NOT_FOUND` |
| POST | `/backoffice/accounts/:id/suspension` | ADMIN | sin cuerpo → `200 AccountListItem` | `404 IDENTITY_ACCOUNT_NOT_FOUND` · `409 IDENTITY_CANNOT_CHANGE_OWN_STATUS` · `409 IDENTITY_LAST_ACTIVE_ADMIN` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT` |
| DELETE | `/backoffice/accounts/:id/suspension` | ADMIN | → `200 AccountListItem` (reactivada) | `404` · `409 IDENTITY_CANNOT_CHANGE_OWN_STATUS` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT` |
| POST | `/backoffice/accounts` | ADMIN | `{ fullName, email, employeeCode, role: ADMIN\|SUPPORT\|OPERATOR }` → `201 AccountListItem` | `422 IDENTITY_INVALID_INPUT` (`fields`; `role` CLIENT) · `409 IDENTITY_ENROLLMENT_CONFLICT` (`fields`: `email` `EMAIL_IN_USE`, `employeeCode` `EMPLOYEE_CODE_IN_USE`, ambos si aplica) |
| GET | `/backoffice/plans` | ADMIN | → `200 { items: PlanAdminView[] }` = `{ id, slug, name, description, priceCents, quotaBytes, maxFileBytes, maxEditors, agentQueriesPerMonth, retainedVersions, trashRetentionDays, deactivatedAt \| null, clientCount, isDefault }` | — |
| POST | `/backoffice/plans` | ADMIN | `{ name, description, priceCents, quotaBytes, maxFileBytes, maxEditors, agentQueriesPerMonth, retainedVersions, trashRetentionDays }` → `201 PlanAdminView` | `422 BILLING_PLAN_INVALID` (`fields`, incl. `name` `NAME_TAKEN`) |
| POST | `/backoffice/plans/:id/deactivation` | ADMIN | → `200 PlanAdminView` | `404 PLAN_NOT_FOUND` (006a CA-4) · `409 BILLING_PLAN_NOT_DEACTIVATABLE` · `409 BILLING_PLAN_ALREADY_DEACTIVATED` |
| GET | `/backoffice/metrics` | ADMIN, OPERATOR | → `200 { accounts: { total, clients, internal, byStatus: { active, suspended } }, usedBytesTotal, byPlan: { planId, name, deactivatedAt \| null, clientCount }[] }` (activos siempre; inactivos con cuentas) | — |
| GET | `/backoffice/client-files?email&page` | ADMIN, SUPPORT | correo exacto → `200 { client: { id, fullName, email }, items: { id, name, kind, sizeBytes, createdAt, updatedAt, trashedAt \| null }[], page, pageSize: 10, total }` | `404 BACKOFFICE_CLIENT_NOT_FOUND` (idéntico para inexistente e interna, sin auditoría) · `400 BACKOFFICE_INVALID_QUERY` |
| POST | `/auth/account-setup/check` | público | `{ token }` → `200 { status: 'valid' }` | `422 IDENTITY_SETUP_LINK_INVALID` · `422 IDENTITY_SETUP_LINK_EXPIRED` (como 002) |
| POST | `/auth/account-setup` | público | `{ token, password }` → `200 { status: 'password-set' }` | los dos anteriores · `422 IDENTITY_WEAK_PASSWORD` |

- `GET /audit/my-events` (004): sin cambio de contrato: el alta inicial no tiene afectado y el recurso `account` sale como
  `resourceType: null`; solo se suman los textos de las acciones nuevas.
- Página por número con `total` (los mockups muestran «Página N de M»): desvío de la convención de cursor, **DF-66**, solo en
  listados internos acotados. CA-7 **no** es HTTP: `pnpm --filter api admin:bootstrap --name … --email … --employee-code …`;
  sale con `0` (creado) o `1` (`IDENTITY_ADMIN_ALREADY_EXISTS` u otro error) y nunca imprime el token.
- Sin eventos de Socket.IO ni colas nuevas (el correo usa la cola `mail` existente).

## 5. Seguridad y operación
- **Actor**: todo método de fachada recibe `actor` primero (DF-01). Lecturas de `usuario` y `plan` sin RLS (sin datos de
  archivos); la única lectura de datos de cliente es `INodeMetadataReader`, dentro de `withActor` con la política
  `archivo_metadatos_internos` (005) y el filtro `propietario_id` **en el SQL**. Excepción a `accessibleNodes` documentada en
  `architecture.md` §6.5: un rol interno nunca tiene nodos accesibles; lee metadatos por política, sin contenido.
- **Actor interno vigente** (RN-7, B-2 b): `InternalActionService` comprueba `activa` en toda operación; en las de cuentas,
  después del candado del padrón, así una suspensión concurrente del actor se ve. `reactivate` rechaza `actor.id = id`
  aunque el actor esté activo (defensa en el dominio). Un Admin suspendido no puede reactivarse con su token de 15 min.
- **Sin contenido** por construcción: el lector no toca `version_archivo` (RLS sin política interna) ni `carga`; respuestas
  `strict` y mapeadores de lista blanca. Operador: `@Roles` lo limita a métricas y RLS le da 0 filas de `archivo`.
- **Auditoría**: `InternalActionService` (§2). Atributos sin nombres ni correos (solo `role` del alta). La consulta de metadatos
  se audita aunque la página venga vacía; el 404 no. El cliente ve solo el rol del actor (004 D-2, CA-16). El actor de sistema
  vive solo en `audit` (`withActor` y `RolesGuard` nunca lo aceptan) y solo inserta el evento que admite su política.
- **Bitácoras** (Pino, ids): `backoffice.account.suspended|reactivated|enrolled`, `backoffice.plan.created|deactivated`,
  `backoffice.client_files.viewed`, `backoffice.actor.inactive`, `identity.session.revoked` (`reason: account_suspended`),
  `identity.invitation.mail_failed`, `admin.bootstrap.completed|refused`. Nunca correo, nombre de archivo, token ni enlace (el
  correo de búsqueda va en la cadena de consulta, que `http.request` ya descarta).
- `/auth/account-setup*` reutilizan el modelo de 002: token de 256 bits, solo hash, consumo atómico; sin límite de tasa propio,
  como `reset-password` (adivinar 256 bits no es viable; Fátima, 2026-10-08). La saturación por IP queda en PD-88.

## 6. Estrategia de pruebas (por riesgo)
| CA | Nivel | Archivo |
|---|---|---|
| CA-9, CA-10, CA-11 (reglas de `Plan`, `slug`, Personal, ya desactivado) | unit | `billing/domain/plan.entity.spec.ts`, `plan-slug.spec.ts` |
| CA-2 a CA-6 (a sí mismo al suspender y reactivar, último Admin, estado; dominio y fachadas con dobles en memoria) | unit | `identity/application/account-administration.spec.ts`, `internal-account-enrollment.spec.ts`, `account-setup.service.spec.ts`, `domain/employee-code.vo.spec.ts` |
| Acción + evento en una transacción; evento fallido revierte; 404 sin evento; actor inactivo → `403` antes de la acción y de la lectura; candado antes de la comprobación | unit | `backoffice/application/internal-action.service.spec.ts`, `support.service.spec.ts` |
| T1: `run` dentro de `run` se une a la misma transacción (y revierte junta); `withActor` dentro de `run` sigue lanzando | unit + int | `shared/.../typeorm-transaction-runner.spec.ts`, `test/int/shared/transaction-runner.int-spec.ts` |
| CA-1 a CA-6 por HTTP (lista, búsqueda, ficha, suspender revoca sesiones y el login da `IDENTITY_ACCOUNT_SUSPENDED`, reactivar, alta + correo en Mailpit + fijar contraseña + login; Admin suspendido con token vigente → `403`) | int | `test/int/backoffice/accounts.int-spec.ts`, `test/int/identity/account-setup.int-spec.ts` |
| **RN-7**: dos suspensiones cruzadas simultáneas entre los dos únicos Admin → exactamente una gana y la otra recibe `403`; CA-7 doble en paralelo → un solo Admin | int | `test/int/backoffice/admin-roster-concurrency.int-spec.ts` |
| CA-7 (script: crea, niega si ya hay Admin; cuenta y evento de sistema en la misma transacción; el evento no tiene afectado; un evento `SYSTEM` distinto lo rechaza la política) | int | `test/int/backoffice/bootstrap-admin.int-spec.ts` |
| CA-8 a CA-11 por HTTP (CAS de desactivar, nombre repetido, escritura y evento en la misma transacción) | int | `test/int/backoffice/plans.int-spec.ts` |
| CA-12, CA-13 (conteos y suma; metadatos con papelera; 404 uniforme) | int | `test/int/backoffice/metrics.int-spec.ts`, `client-files.int-spec.ts` |
| CA-14 (matriz rol × ruta, tabla) | int | `test/int/backoffice/roles-matrix.int-spec.ts` |
| CA-16 (el cliente ve fecha y rol, nunca el nombre; no ve los de otra cuenta ni los del catálogo) | int | `test/int/audit/internal-events.int-spec.ts` |
| Migraciones `up → down → up` con dueño sin `SUPERUSER`; CHECK de código normalizado | int | `test/int/backoffice/migrations.int-spec.ts` |
| **CA-15 (bloqueante)**: cada rol interno por cada ruta: sin contenido, texto, URL, `clave_objeto` ni filas de versiones (nombres sembrados casi idénticos entre A y B); Operador y Soporte por SQL como `nimbo_app` (0 filas de `version_archivo`; Operador 0 de `archivo`); Soporte no lee la auditoría del cliente; un cliente no ve eventos internos de otro | iso | `test/isolation/backoffice.iso-spec.ts` (+ `withInternalAccounts` en `setup/isolation-world.ts`) |
| CA-17 (estados de cada pantalla, foco, formulario conserva lo escrito, «sin permiso», 360 px y axe; «Seguridad» y «Mi actividad» en el marco interno; enlace de actividad por rol) | web | `features/backoffice/**/*.spec.tsx`, `features/backoffice/a11y.spec.tsx`, `features/access/home-path.spec.ts`, `internal-area-layout.spec.tsx`, `identity/.../security-view.spec.tsx`, `session-account-menu.spec.tsx`, `(interno)/interno/actividad/page.spec.tsx` |
| Recorrido de punta a punta | humano | tarea de demo (sin E2E: Playwright sigue de marcador, PD-41) |

Cada CA vive en una capa principal: reglas en unit, contrato y concurrencia en int, fugas solo en iso, estados en web.

## 7. Riesgos y coherencia con el diseño
- **R-1 Coherencia con 004** (D-2, Q-1 = B): el cliente ve solo el rol; el contrato de 004 no cambia, solo los textos de las acciones nuevas.
- **R-2 Carrera de RN-7 y de CA-7**: candado único del padrón **antes** de la comprobación del actor y de la fila; prueba int.
- **R-3 Atomicidad**: un repositorio fuera de `TransactionContext` escapa del evento; CA-7 depende de T1. Mitigación: repos
  sobre `TransactionContext`, T1 con prueba y reversión probada en `plans`, `accounts` y `bootstrap-admin`.
- **R-4 Correo del alta**: se encola después del commit; si falla, la cuenta queda creada y auditada, se anota
  `identity.invitation.mail_failed` y la persona usa «¿Olvidaste tu contraseña?» (nace verificada, Q-3).
- **R-5 `billing` y la 008** (coordinación con Juan Marcos enviada, H-1/H-2/H-13): `billing` es de Juan Marcos y la 008
  (`Lista`, rama `feat/008-catalogo-y-comparador`) crea `PlanCatalogService` e `IPlanRepository`; la parte de `billing`
  de la 011 la escribe **él** sobre la 008 integrada (Q-7) y las tareas de catálogo de `backoffice` esperan su PR. Se acuerda:
  la **spec 008 cambia** para listar solo `desactivado_en IS NULL` (PD-76); **un** esquema de plan en
  `packages/contracts/src/billing/` (en inglés), **una** entidad `Plan`/`PlanLimitsSet` y **un** `PlanCard` en
  `components/nimbo` (PD-83); prefijo de errores acordado con Juan Marcos (2026-10-08): `BILLING_PLAN_*` en la 011;
  `PLAN_NOT_FOUND` no cambia. Bytes en JSON: texto decimal (ADR-0016; Adrián, 2026-10-08); la 005 se alinea después (PD-87).
- **R-6 Antes de la 009** todo cliente cuenta como Personal en CA-1, CA-12 y el catálogo (regla vigente, PD-80).
- **R-7 Mockups**: `Aprobado` (Adrián, 2026-10-08; `ui-guidelines.md` §7).
- **R-8 Permisos**: Adrián autorizó `identity`, `storage` y `audit` (2026-10-07), y `shared` (T1) y la web de `access`
  (`features/access`, marco interno) el 2026-10-08, **solo** en los archivos que nombra este plan.
- **Desviaciones** (`Aceptado`, Adrián, 2026-10-08): DF-66 (paginación); DF-04, DF-36, la parte de 011 de DF-15, DF-27
  (`INodeMetadataReader`) y DF-33 (`codigo_empleado`, también con CHECK); **DF-65** con el resto (M8, M1, M4, T1, T2, E-R). **Pendientes**: PD-80, PD-81, PD-82, PD-83; PD-31 resuelto aquí.
- **ADR requeridos**: ninguno (sin tecnología nueva; el contexto Nest del script ya está en la pila).
- **Fuera**: 011b, 022b, RN-6 en 012/013 (PD-78), comparador 008 (PD-76), reenviar el enlace de alta, sesiones ajenas.

### Preguntas
- [RESUELTAS] (2026-10-07, Fátima y Adrián) **Q-1** el cliente ve solo el rol (B, 004 D-2) · **Q-2** patrón de
  `restablecer-contrasena` con Cielo Sereno (P-15) · **Q-3** internas nacen verificadas; vencido → «¿Olvidaste tu contraseña?» ·
  **Q-4** código de 1–20 caracteres en mayúsculas, enlace de 24 h, sin restringir el dominio · **Q-5** búsqueda por inicio
  del correo, 10 por página · **Q-6** conteo por plan en CA-8.
- [RESUELTAS] (2026-10-07, Fátima) **Q-4b** el correo del alta se valida con `emailReasons` de `contracts/src/identity/schemas.ts`
  (como el registro: `@` y dominio, máx. 254, `INVALID_EMAIL`) · **Q-7** la parte de `billing` la escribe **Juan Marcos** (R-5) ·
  **B-1 (a)** «Seguridad» y «Mi actividad» en el marco interno, sin mockups nuevos · **B-2 (b)** actor activo en toda operación.

## 8. Aprobación
- `architect` (ciclo 2): **Aprobado** (2026-10-07). Cambios 1–4 y 6–8 del ciclo 1 aplicados en §1–§7; el 5 queda sin efecto
  (Q-1 = B: sin `IAuditActorDirectory` ni `identity → audit`). DAG intacto; RLS, `ck_evento_destino`, política de sistema, T1 y
  `down` revisados; `architecture.md` §5–§6 ya reflejan T1, el actor de sistema y CA-7. En `/tasks`: el `run` de CA-7 es
  `ITransactionRunner.run`, no `InternalActionService.run` (§2); T1 tiene el permiso de `shared` (R-8). DF de §7 → `Aceptado` con Adrián.
- Adrián: **Aprobado** (2026-10-08, comentarios del PR): spec, plan y mockups; permiso de `shared` y `access` solo en los
  archivos nombrados (R-8); DF-66 aceptado; bytes como texto decimal (ADR-0016, PD-87); la 004 no se reabre; PD-85 y los dos
  PD-51 los corrige él en otro PR. `/auth/account-setup*` sin límite propio (A, §5); unificarlo con 002 queda en PD-88.
