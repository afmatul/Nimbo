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
├─ backoffice.module.ts # `forRoot(identity)`: recibe el mismo módulo de `identity` que la raíz (Nest los distingue por referencia)
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
vigente (RN-7, CA-14). No autoriza por rol (`@Roles` + `RolesGuard`) ni valida: eso lo hacen el controlador y el módulo
dueño.

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
