# `backoffice` — M8 · Administración, Soporte y Operación

- **Dueño**: Fátima (desde el 30/09, `specs/README.md`).
- **Diagrama de origen**: M8 en `docs/sdd/design-model.md` §3 y `docs/design/diagramas/`.
- **Responsabilidad**: Administración, soporte, métricas y colas. La salud (DF-49) y `RolesGuard` con los guards globales (DF-50, spec 003 D-2) pasaron a `shared`.
- **Puede depender de**: shared, audit, identity, billing, storage (fachadas, DF-04) (`docs/sdd/architecture.md` §3; el lint de fronteras lo hace cumplir).
- **Specs que lo construyen**: 011, 022.

## Capas (`docs/sdd/architecture.md` §4)

```
modules/backoffice/
├─ domain/          # entidades, objetos de valor, errores; sin Nest, TypeORM ni zod
├─ application/     # servicios («service» de los diagramas) y puertos (`ports/`)
├─ infrastructure/  # persistencia (*.orm-entity.ts), adaptadores, procesadores
├─ presentation/    # controladores, DTOs, gateways
├─ backoffice.module.ts # `forRoot(identity, storage)`: recibe los mismos módulos de `identity` y `storage` que la raíz (Nest los distingue por referencia) e importa `BillingModule` (estático, sin rutas) por `SubscriptionAdministration`
└─ index.ts         # única API pública
```

## Regla

Otros módulos importan **solo** desde `modules/backoffice/index.ts` (fachadas, puertos que este módulo implementa,
eventos y tipos públicos). Nada de `infrastructure/**` cruza la frontera. Nombres de clases y puertos: los de
`docs/sdd/design-model.md`.

## `InternalActionService` (011 plan §1, §2)

Única dueña de «transacción + actor activo + evento». Todo servicio del backoffice pasa por ella, lecturas incluidas:

- `read(actor, work)`: abre `withActor(actor)`, comprueba que el actor interno sigue `activa`
  (`AccountAdministration.assertActorActive`) y lee. Sin evento.
- `run(actor, action)`: lo mismo y, si `action.locksAdminRoster` (acciones sobre cuentas, RN-7), toma el candado del
  padrón de Administradores **antes** de la comprobación; después `action.work()` y
  `IAuditLogger.recordInTransaction(action.event(resultado))` en la misma transacción: si el evento falla, la acción
  se revierte.

Un actor que ya no está `activa` recibe `403 SHARED_FORBIDDEN` antes de la acción o de la lectura, aunque su token siga
vigente (RN-7, CA-14), y deja la bitácora `backoffice.actor.inactive` con `actorId` y `actorRole`. No autoriza por rol
(`@Roles` + `RolesGuard`) ni valida: eso lo hacen el controlador y el módulo dueño.

## Cuentas (CA-1 a CA-6)

`AccountsController` (`@Roles(ADMIN)`; los servicios de cuentas no autorizan por sí mismos) valida con los contratos y
delega en `AdminService`. Toda respuesta de cuenta es un `AccountListItem` por lista blanca (`accounts-response.ts`):
id, correo, nombre, rol, estado (`active` o `suspended`), verificada, `planName`, `usedBytes` (texto decimal), fecha de
alta e `isSelf`; sin datos de archivos. `planName` sale de `SubscriptionAdministration.planNamesFor` (`billing`), solo
para clientes; es `null` («—») en internas y en clientes sin suscripción, y `usedBytes` es `null` en internas.

| Ruta                                                | Respuesta                                                                                     | Errores (`code`)                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/backoffice/accounts?email&page`        | `200`, 10 por página, de la más nueva a la más vieja; `email` filtra por el inicio del correo | `400 BACKOFFICE_INVALID_QUERY` (`fields`)                                                                                                                           |
| `GET /api/v1/backoffice/accounts/:id`               | `200` con la ficha                                                                            | `404 IDENTITY_ACCOUNT_NOT_FOUND` (también si `:id` no es UUID)                                                                                                      |
| `POST /api/v1/backoffice/accounts/:id/suspension`   | `200`, ya suspendida                                                                          | `404` · `409 IDENTITY_CANNOT_CHANGE_OWN_STATUS` · `409 IDENTITY_LAST_ACTIVE_ADMIN` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT`                                          |
| `DELETE /api/v1/backoffice/accounts/:id/suspension` | `200`, ya activa                                                                              | `404` · `409 IDENTITY_CANNOT_CHANGE_OWN_STATUS` · `409 IDENTITY_ACCOUNT_STATE_CONFLICT`                                                                             |
| `POST /api/v1/backoffice/accounts`                  | `201` con la cuenta creada                                                                    | `422 IDENTITY_INVALID_INPUT` (`fields`; rol Cliente) · `409 IDENTITY_ENROLLMENT_CONFLICT` (`fields`: `email` `EMAIL_IN_USE`, `employeeCode` `EMPLOYEE_CODE_IN_USE`) |

- La lista y la ficha corren en `InternalActionService.read`; suspender, reactivar y el alta, en `run` con
  `locksAdminRoster: true`: el candado del padrón va antes de comprobar al actor, así dos suspensiones cruzadas entre
  los dos últimos Administradores no dejan cero activos (la segunda recibe `403`, RN-7).
- Suspender revoca todas las sesiones de la cuenta (002 D-10) e invalida su invitación pendiente; reactivar no devuelve
  ninguna de las dos. Cada acción se audita sobre la cuenta afectada: `account.suspended`, `account.reactivated` y
  `account.internal_created` (este, solo con `role`).
- El alta la hace `InternalAccountEnrollment` (`identity`) y el correo con el enlace «Crear tu contraseña» sale
  **después** del commit: si la transacción se revierte, no hay enlace en camino.
- Bitácoras, solo con ids y el rol: `backoffice.account.suspended` y `backoffice.account.reactivated` (`actorId`,
  `accountId`), `backoffice.account.enrolled` (`actorId`, `accountId`, `role`) e `identity.session.revoked`
  (`userId`, `reason: account_suspended`, `count`), esta solo si revocó alguna sesión. Nunca correo, nombre ni código
  de empleado.

## Metadatos de un cliente (011 CA-13)

`GET /api/v1/backoffice/client-files?email&page` (`ClientFilesController`, `@Roles(ADMIN, SUPPORT)`) valida con
`clientFilesQuerySchema` (`400 BACKOFFICE_INVALID_QUERY` con `fields`) y delega en `SupportService.listClientFiles`, que
corre en `InternalActionService.run`:

- El correo exacto se resuelve con `AccountDirectory.findClientByEmail` (`identity`). Un correo inexistente o de una
  cuenta interna da el mismo `404 BACKOFFICE_CLIENT_NOT_FOUND` (`ClientNotFoundError`), que revierte sin evento.
- Los metadatos los lee `INodeMetadataReader` (`storage`, PD-31): solo columnas de `archivo` del dueño, papelera
  incluida, de la más reciente a la más vieja, 10 por página; nunca `version_archivo`, `clave_objeto` ni `carga`.
- La consulta se audita (`client.files_viewed`, sobre la cuenta del cliente) aunque la página venga vacía; la bitácora
  `backoffice.client_files.viewed` lleva solo `actorId` y `clientId`, nunca el correo ni nombres de archivo.
- Un `404` no se audita, pero deja la bitácora `backoffice.client_files.not_found` con `actorId` y `actorRole` (nunca el
  correo buscado): un sondeo de correos en masa queda a la vista.
- La respuesta sale por lista blanca (`client-files-response.ts`): id, nombre, tipo, tamaño (texto decimal), fechas y
  `trashedAt`.

## Alta inicial por comando (011 CA-7)

```bash
pnpm -s --filter api admin:bootstrap --name "Nombre Apellido" --email persona@empresa.com --employee-code ADM-001
```

Compila `api` con `tsc -p tsconfig.build.json` a `dist-scripts/` y corre `dist-scripts/scripts/bootstrap-admin.js`:
con `tsx` la inyección por tipo de Nest falla (sin `design:paramtypes`), y un directorio propio no pisa el `dist/` de
`nest build` ni de `pnpm dev` (como `dist-int/` en las pruebas), así que corre con `pnpm dev` levantado. Abre un
contexto Nest sin HTTP (`src/scripts/bootstrap-admin.module.ts`) y `InitialAdminBootstrapper` crea la cuenta, su enlace
de «Crear tu contraseña» y el evento `account.bootstrap_admin` del actor de sistema en **un solo** `ITransactionRunner.run` sin
actor; el correo sale después del commit. No pasa por `InternalActionService`: no hay actor que comprobar.

- Sale con `0` y la bitácora `admin.bootstrap.completed` (`userId`) si crea el Administrador.
- Sale con `1` y `admin.bootstrap.refused` si ya hay un Administrador activo (`IDENTITY_ADMIN_ALREADY_EXISTS`), si un
  argumento no es válido (`reason: invalid_arguments` con las opciones, nunca sus valores) o ante otro error (solo su
  nombre y, si lo trae, su código de sistema, p. ej. `ECONNREFUSED`).
- Sale con `1` y `reason: unknown_option` ante una opción desconocida o un valor suelto, sin repetir lo escrito.
- Nunca imprime el correo, el nombre ni el token: el enlace llega solo por correo. Sin `-s`, `pnpm` repite la línea de
  comando con lo que escribiste antes de correrla; por eso el comando de arriba lleva `pnpm -s`.
- El correo y el nombre sí quedan en el historial del shell y, mientras corre, en la lista de procesos: córrelo en una
  sesión que no guarde historial (p. ej. con un espacio delante si `HISTCONTROL=ignorespace`) o limpia el historial
  después.
