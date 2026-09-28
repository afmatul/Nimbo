# Plan 003 — Roles y acceso

> Spec: `./spec.md` (Aclarada, 2026-09-26) · Estado del plan: **Aprobado** (architect, 2026-09-27, cambios aplicados)
> Construye sobre el plan 001 (Aprobado): `ITransactionRunner` + `TransactionContext` (§6.7), el arnés de
> migraciones de su T-06 y la tabla de PR de su §6.12. Depende de ADR-0005, ADR-0008, ADR-0010 y ADR-0017 (`Aceptado`).

## 1. Resumen técnico

`shared` recibe la autenticación y la autorización por rol de toda la API. Dos guards globales (`JwtAuthGuard`,
`RolesGuard`) se registran con el módulo estático `AuthGuardsModule`, que `AppModule` importa desde PR-A, y **niegan
por defecto**: sin `@Public()` hace falta un `Authorization: Bearer` válido, y sin `@Roles(...)` la ruta responde 403.
Passport se conserva (ADR-0017 c.2): `JwtAuthGuard` extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` de `@nestjs/passport`,
y la estrategia `'jwt'` (`JwtStrategy`, la escribe `identity` en 002) delega en el puerto `IAccessTokenVerifier`, que
declara `shared` junto al nombre de la estrategia y que implementa `identity` (D-14 de 002). El puerto es el único que
decide validez y vencimiento; `shared` nunca importa `identity`. Sin estrategia registrada, toda ruta no pública
responde 401. El `Actor` se arma en un solo lugar (`createActor`, `canReadContent` solo para `CLIENT`) en
`handleRequest` del guard y se guarda en un `WeakMap` por petición; nadie lee `req.user`. Ningún cuerpo, cabecera ni
parámetro llega a él (D-11).
`@CurrentActor()` lo entrega al controlador. 401 y 403 salen como `SHARED_UNAUTHENTICATED` y `SHARED_FORBIDDEN` por
el `DomainExceptionFilter` de siempre, y cada rechazo deja una bitácora sin datos sensibles (CA-16).

Para la segunda barrera (ADR-0005), la base gana el rol `nimbo_app`: `LOGIN`, no dueño, sin `SUPERUSER` ni `BYPASSRLS`.
Lo crea un script de inicio de Postgres que también usan Testcontainers y el despliegue. Las migraciones pasan a
`DATABASE_MIGRATION_URL` con el rol dueño. Una migración concede los permisos a `nimbo_app` (PD-39: sin `DELETE` sobre
`usuario` ni `token_cuenta`) y otra crea las funciones `nimbo_actor_id()`/`nimbo_actor_role()`, que usarán las
políticas de 005, 012 y 019. `ITransactionRunner` gana `withActor(actor, trabajo)`: abre la transacción, fija
`app.actor_id` y `app.actor_role` con `set_config(…, true)` y publica el actor en `TransactionContext`. Una regla de
lint prohíbe `set_config` fuera de ese archivo (PD-26). Al arrancar, `api` y `worker` se niegan a correr con un rol que
sea superusuario, tenga `BYPASSRLS` o sea dueño de tablas.

Nace el módulo `access` (M3a, solo depende de `shared`) con:

- `AccessLevel`, `Action` y las políticas Strategy `OwnerPolicy`, `EditorPolicy` y `ViewerPolicy`;
- `PermissionResolver` (`levelFor`, `can`), que niega a los roles internos sin consultar;
- `accessibleNodes(actor)` como fragmento SQL tipado. Hoy devuelve el conjunto vacío, porque aún no hay tablas; 005 le
  agrega la propiedad y 012 las comparticiones (D-1).

La suite `pnpm test:isolation` monta un «mundo» con dos clientes casi idénticos y una cuenta por rol interno, y corre
con los dos roles reales de la base. La web agrega la redirección por rol, el área interna de marcador y los estados
«sin permiso» y «no encontrado» con componentes de 000b. El trabajo se corta en **cinco PR pequeños** (PR-A, B, C, D y
F; §6.12); PR-E desaparece y su contenido pasa al PR-2 de backend de 002.

## 2. Verificación contra la constitución

| Artículo | Cumple | Nota |
|---|---|---|
| I Spec manda | ☑ | Cada pieza cita su CA o D-n. Lo que la spec no decidió está en §10.2 (DT) o §10.3 (preguntas). CA-10, CA-11 (segunda parte) y CA-14 se cierran en 005, como fija D-1 (§6.11). |
| IV SOLID | ☑ | S: `JwtAuthGuard` autentica, `RolesGuard` compara roles, `PermissionResolver` decide sobre un recurso, `accessibleNodes` define el conjunto visible y `DatabaseRoleCheck` vigila la conexión. O: un nivel nuevo es una política nueva, sin tocar `if`. D: la estrategia de Passport depende de `IAccessTokenVerifier`, el guard solo del nombre de la estrategia y de `AccessTokenClaims`, y `PermissionResolver` de `IAccessLevelReader`; TypeORM queda en infraestructura. L: prueba de contrato de `IAccessTokenVerifier` que 002 reutiliza (§8). |
| V YAGNI — abstracciones nuevas | ☑ | `IAccessTokenVerifier`: regla (a) aísla JWT y (d) evita `shared → identity` (lo pide D-2). `IAccessLevelReader`: regla (b), repositorio que deja `PermissionResolver` libre de SQL. `IAccessPolicy`: regla (e), tres implementaciones reales y ya está en el diagrama. **No** se crean `inheritedGrants` ni `IGrantRepository` (012), ni un registro genérico de «fuentes» de `accessibleNodes`, ni `@Authenticated()` (basta `@Roles(...ALL_ROLES)`). Las funciones SQL de actor tienen tres consumidores seguros (005, 012 y 019; DT-6). |
| VI DRY | ☑ | Única matriz de roles: `RolesGuard` + `@Roles` (Art. VI.3). Única regla «qué puede ver»: `accessibleNodes` (DF-32). Único constructor del `Actor` (`createActor`). Única escritura de `app.actor_*`: `withActor` (lint). Único script de rol de BD para compose, Testcontainers y staging. `withActor` reutiliza la ALS de `TransactionContext` (001), no crea otra. Los roles y códigos de error, en `packages/contracts`, sirven a `api` y `web`. |
| VIII Fronteras | ☑ sin aristas nuevas | `access → shared` (ADR-0010). `shared` no importa `identity`: solo conoce el puerto y el nombre de la estrategia, que declara él mismo; la estrategia está disponible porque `AppModule` carga `IdentityModule`. Nadie consume `access` todavía (lo harán `storage` en 005 y `sharing` en 012, aristas ya aceptadas). |
| IX Seguridad — `actor`/`accessibleNodes` | ☑ | Negación por defecto; `Actor` solo desde el token; roles internos sin contenido (CA-9); `withActor` + RLS preparado; la API no puede conectarse como dueña ni como superusuario (CA-13, `DatabaseRoleCheck`). |
| X Operabilidad | ☑ | `auth.unauthenticated` y `auth.forbidden` con `correlationId`, ruta como patrón, actor y motivo (CA-16); `db.role_rejected` al arrancar. Métricas: 022 (§7). |
| XI Integridad | ☑ | `withActor` es transaccional y reentrante solo con el mismo actor; migraciones reversibles; el script de rol es idempotente. |
| XII Degradación | ☑ (n/a con razón) | Verificar el token es local (sin red ni BD): los guards no agregan dependencias que puedan caer. |

## 3. Coherencia con los diagramas

| Diagrama | Clases / tablas usadas | ¿Se aparta del diagrama? | Acción |
|---|---|---|---|
| Clases T1 `shared` | `Actor`, `Role`, `DomainError`, `JwtAuthGuard`, `RolesGuard` (movido desde M8) | Sí: el puerto `IAccessTokenVerifier` recibe nombre; entran `AuthGuardsModule`, los decoradores `@Public`/`@Roles`/`@CurrentActor`/`@CurrentSessionId`, `createActor`, `UnauthenticatedError`, `InsufficientRoleError`, `ITransactionRunner.withActor` y `DatabaseRoleCheck` | **DF-50** (ya registrado, D-2) y **DF-55** nuevo (provisional, §11.4; §10.2); redibujo en PD-02/PD-05 |
| Clases M3a `access` | `PermissionResolver` (`levelFor`, `can`), `IAccessPolicy` → `OwnerPolicy`/`EditorPolicy`/`ViewerPolicy`, `AccessLevel`, `Action`, `accessibleNodes(actor)` | Sí: puerto nuevo `IAccessLevelReader` → `SqlAccessLevelReader`, y tipo `AccessibleNodesFragment`. `inheritedGrants` e `IGrantRepository` **no** se implementan hasta 012 | **DF-55** (provisional, §11.4); redibujo en PD-08 |
| Clases M8 `backoffice` | — | `RolesGuard` sale de M8 | DF-50 → PD-02 |
| Firmas M2, M3, M5, M8 | `actor: Actor` como primer parámetro | Regla aceptada (DF-01, D-9) | PD-08 |
| E-R | `usuario`, `token_cuenta` (solo permisos) | No: sin tablas ni columnas nuevas. Hay objetos de base fuera del E-R: el rol `nimbo_app` y las funciones `nimbo_actor_id()`/`nimbo_actor_role()` | Documentar en `architecture.md` §6 (architect) |
| Arquitectura §3/§6 | guards en `shared`, roles de BD, `withActor` | No: el plan implementa lo que ya dice §6 (ADR-0005). Precisa que `withActor` es un método de `ITransactionRunner` y que su implementación vive en `shared/infrastructure/persistence` | `architecture.md` §6: una línea (architect) |

Hallazgos `DF-xx` que esta spec resuelve o de los que depende:

- **DF-01** (`actor` primer parámetro): aceptado como regla (D-9). Este plan lo aplica a `PermissionResolver`.
- **DF-02**: resuelto por ADR-0010. `access` no importa `storage` ni `sharing`: lee tablas por SQL, desde 005.
- **DF-32**: decidido por D-1. 003 entrega la firma y el conjunto vacío; la consulta llega con 005 y 012.
- **DF-50**: `RolesGuard` en `shared`. Este plan lo implementa.
- **DF-52** (trabajos del `worker` sin actor): no bloquea 003. `withActor` sirve a los trabajos con dueño; los de
  mantenimiento se deciden en el plan de 005 (PD-19).
- **DF-55 (nuevo, número provisional; se renumera al integrar en orden 001 → 002 → 003, §11.4)**: piezas de 003 que
  el diagrama no prevé (T1 y M3a, filas de arriba; incluye `ACCESS_TOKEN_STRATEGY` y `JwtAuthGuard` sobre
  `AuthGuard` de Passport). Severidad Baja. Aceptado con la aprobación de este plan.

## 3b. Módulos afectados

| Módulo | Cambio | Capa(s) |
|---|---|---|
| `shared` | `createActor` y `ALL_ROLES`; `UnauthenticatedError` (401) e `InsufficientRoleError` (403); puerto `IAccessTokenVerifier` + `AccessTokenClaims` + `AccessTokenVerification` + `ACCESS_TOKEN_STRATEGY`; `JwtAuthGuard` (extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)`), `RolesGuard`, `AuthGuardsModule` (estático), decoradores, `RequestPrincipal`; `@Public()` en `HealthController`; `ITransactionRunner.withActor` + ámbito de actor en `TransactionContext`; `DatabaseRoleCheck`; `migrationEnvSchema`; `DATABASE_MIGRATION_URL` en la lista de redacción | domain, application, infrastructure, presentation |
| `access` (nuevo, M3a) | `AccessLevel`, `Action`, `IAccessPolicy` + tres políticas, `PermissionResolver`, `IAccessLevelReader` → `SqlAccessLevelReader`, `accessibleNodes` + `AccessibleNodesFragment`, `AccessModule`, `index.ts`, README | domain, application, infrastructure |
| `identity` | Solo `@Public()` en `register`, `verify-email` y `resend-verification` (001) y en las rutas públicas de 002. Lo agrega quien escriba la ruta si PR-A ya está integrado, o este plan si no (§6.12). `JwtStrategy` y el verificador real los escribe 002, no 003 | presentation |
| `packages/contracts` | `shared/roles.ts` (`ROLES`, `roleSchema`, `RoleName`) y `shared/error-codes.ts` (`SHARED_UNAUTHENTICATED`, `SHARED_FORBIDDEN`) | contratos |
| `packages/config/eslint` | `rls.js`: prohíbe `set_config` y `SET app.` fuera de `withActor` (PD-26), incluido desde `nest.js` | lint |
| composición | `AppModule` importa `AuthGuardsModule` (estático, sin `forRoot`) desde PR-A y `AccessModule` desde PR-C; `IdentityModule` ya lo importa desde 001. `data-source.cli.ts` usa `DATABASE_MIGRATION_URL` | composición |
| pruebas | `containers.ts` provisiona `nimbo_app`; `global-setup.ts` migra con el rol dueño; `createTestApp` registra los guards siempre; `test/support/` (controladores sonda, `TestAccessTokens`, `TestAccessTokenVerifier`, `TestJwtStrategy`, suite de contrato, recorredor de rutas); `test/isolation/setup/isolation-world.ts` | pruebas |
| operación | `infra/postgres/init/10-nimbo-app.sh`, montaje en `compose.yml`, `NIMBO_APP_DB_PASSWORD`, `.env.example`, script raíz `db:app-role`, `docs/operations/ambientes.md` | operación |
| `apps/web` | `features/access/` (`homePathFor`, `RequireRole`, `ForbiddenState`, `NotFoundState`, `InternalAreaPlaceholder`, etiquetas de rol); `app/not-found.tsx`; `app/(app)/(cliente)/layout.tsx` y `app/(app)/(interno)/…` anidados en el grupo `(app)` de 002; códigos `SHARED_*` en `lib/error-catalog.ts`; `SUPPORT_CONTACT_EMAIL` de `contracts` | presentación |

Dependencias nuevas entre módulos: **ninguna**. `access → shared` ya está en ADR-0010. `identity → shared`
(implementa `IAccessTokenVerifier` y registra `JwtStrategy`) ya está permitida. Dependencias npm: **PR-A instala**,
con versión exacta, `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` y `@types/passport-jwt` (dev), ya
aceptadas en ADR-0017 c.2; 002 no instala ninguna de ellas. `WeakMap`, `AsyncLocalStorage`,
`DiscoveryService`/`Reflector` de Nest y `pg` ya existen. Posible conflicto en `pnpm-lock.yaml` con 001-PR-1 (§9).

## 4. Modelo de datos

Sin tablas ni columnas nuevas. Hay tres piezas de base de datos.

**(a) Rol de aplicación**. Es un objeto del *cluster*, no del esquema: lo crea un script de aprovisionamiento, no una
migración, porque su contraseña es un secreto y la migración quedaría en el repo (DT-3).
`infra/postgres/init/10-nimbo-app.sh` se monta en `/docker-entrypoint-initdb.d/` en compose y en Testcontainers, y se
ejecuta en el despliegue (`pnpm db:app-role` en local). Es idempotente:

```sh
# infra/postgres/init/10-nimbo-app.sh — lo ejecuta el entrypoint de Postgres (volumen nuevo) o `pnpm db:app-role`.
# Sin `set -e`: el entrypoint puede cargarlo con `source`. Falla si falta la contraseña.
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v app_password="${NIMBO_APP_DB_PASSWORD:?falta NIMBO_APP_DB_PASSWORD}" <<'SQL'
SELECT 'CREATE ROLE nimbo_app' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nimbo_app') \gexec
ALTER ROLE nimbo_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT
  PASSWORD :'app_password';
SQL
```

`:'app_password'` lo cita `psql`: no se concatena la contraseña en el SQL.

**(b) Permisos de `nimbo_app`** (PD-39; ADR-0005). La migración es posterior a las de 001 (`20260928100000` y
`…100100`):

```sql
-- 20260928110000-conceder-permisos-nimbo-app.ts  (up)
DO $$
DECLARE r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'nimbo_app';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta el rol nimbo_app: ejecuta pnpm db:app-role (infra/postgres/init/10-nimbo-app.sh)';
  END IF;
  IF r.rolsuper OR r.rolbypassrls THEN
    RAISE EXCEPTION 'nimbo_app no puede ser superusuario ni tener BYPASSRLS (ADR-0005)';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO nimbo_app;
-- Tablas ya existentes (las de 001 y, según el orden de integración, las de 002)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nimbo_app;
REVOKE ALL ON TABLE migracion FROM nimbo_app;                                   -- historial de TypeORM: solo el dueño
REVOKE DELETE ON TABLE usuario, token_cuenta FROM nimbo_app;                    -- PD-39: sin DELETE
-- Tablas futuras creadas por el rol que migra (ADR-0005)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nimbo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nimbo_app;
-- down
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM nimbo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM nimbo_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nimbo_app;
REVOKE USAGE ON SCHEMA public FROM nimbo_app;
```

- **Regla para las migraciones siguientes**: una tabla nueva recibe `SELECT/INSERT/UPDATE/DELETE` por los privilegios
  por defecto. Si no debe admitir `DELETE` (o menos), su migración lo revoca explícitamente. CA-13 y
  `database-roles.iso-spec.ts` prueban la matriz de permisos real (§8).
- El rol no se borra en `down`: es del *cluster* y lo gobierna el script.
- `nimbo_app` no tiene `CREATE` en `public` (predeterminado desde PostgreSQL 15), y la prueba lo afirma.

**(c) Lectura del actor en SQL** (DT-6). Es la única definición de «actor sin fijar = sin filas» del lado de la base,
para las políticas de 005 (`archivo`, `version_archivo`), 012 y 019 (`fragmento`):

```sql
-- 20260928110100-crear-funciones-de-actor.ts  (up)
CREATE FUNCTION nimbo_actor_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY INVOKER
  AS $$ SELECT nullif(current_setting('app.actor_id', true), '')::uuid $$;
CREATE FUNCTION nimbo_actor_role() RETURNS text
  LANGUAGE sql STABLE SECURITY INVOKER
  AS $$ SELECT nullif(current_setting('app.actor_role', true), '') $$;
-- down
DROP FUNCTION nimbo_actor_role();
DROP FUNCTION nimbo_actor_id();
```

- `withActor` valida que `actor.id` sea un UUID antes de fijarlo, así el `::uuid` no falla dentro de una política.
- **Índices**: ninguno en 003. Los de las políticas y de `accessibleNodes` (dueño en `archivo`,
  `version_archivo(archivo_id)`, `comparticion`, `carpeta.ruta`) los declaran 005 y 012 (ADR-0005, consecuencias).
- **RLS**: ninguna política en 003 (D-1, D-7). Las escribe el dueño de `access` en las migraciones de 005, con
  `ENABLE` + `FORCE ROW LEVEL SECURITY` y `USING (… = nimbo_actor_id())` (§6.11).
- **Reversibilidad**: los dos `down` deshacen exactamente su `up`. Se prueba `run → revert → run` en local
  (`workflow.md` §7.2) y en el job `migrations` del CI cuando exista.
- `synchronize: false` no cambia.

## 5. Contratos

### HTTP

003 **no agrega rutas de producto**. Fija el contrato de autenticación y de rol que usan todas las rutas:

| Aspecto | Contrato |
|---|---|
| Credencial | `Authorization: Bearer <token de acceso>` (002 D-1). Otro esquema, cabecera vacía o varias credenciales → 401 |
| Ruta sin `@Public()` y sin token válido | `401 { code: 'SHARED_UNAUTHENTICATED', message, correlationId }`; el controlador no se ejecuta (CA-1, CA-2) |
| Ruta con `@Roles(...)` y rol no listado | `403 { code: 'SHARED_FORBIDDEN', message, correlationId }` (CA-5, CA-6) |
| Ruta sin `@Public()` ni `@Roles(...)` | `403 SHARED_FORBIDDEN` con token válido (se cierra por defecto, DT-2) y la prueba de CA-7 falla |
| Recurso ajeno o inexistente | `404` con el `code` del módulo, idéntico en los dos casos salvo `correlationId` (D-6, CA-11) |

Mensajes (español, con acción correctiva):

- `SHARED_UNAUTHENTICATED`: «Tu sesión no es válida o expiró. Inicia sesión de nuevo.»
- `SHARED_FORBIDDEN`: «Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos.»

La web no muestra el `message`: usa su catálogo (§6.9).

**Rutas públicas esperadas** (CA-3). `route-declarations.int-spec.ts` las fija en una lista explícita: si alguien
marca otra ruta como `@Public()`, la prueba falla hasta que la agregue a la lista.

- `GET /api/v1/health/live` y `GET /api/v1/health/ready` (000);
- `POST /api/v1/auth/register`, `POST /api/v1/auth/verify-email` y `POST /api/v1/auth/resend-verification` (001);
- inicio de sesión, renovación, pedir recuperación y aplicar recuperación (002, rutas según su plan);
- lectura pública del catálogo (006a, PD-40).

La lista crece con cada PR que integra una de esas rutas.

**Rutas de prueba** (solo en `apps/api/test/support/probe.controller.ts`, nunca en `src/`):

| Método | Ruta | Declaración | Devuelve |
|---|---|---|---|
| GET | `/__probe/public` | `@Public()` | `{ ok: true }` |
| GET | `/__probe/actor`, `/__probe/actor/:id` y `POST /__probe/actor` | `@Roles(...ALL_ROLES)` | el `Actor` recibido por `@CurrentActor()` (CA-4) |
| GET | `/__probe/client` | `@Roles(Role.CLIENT)` | `{ ok: true }` |
| GET | `/__probe/admin`, `/__probe/support`, `/__probe/operator` | `@Roles(ADMIN)`, `@Roles(SUPPORT)`, `@Roles(OPERATOR)` | `{ ok: true }` |
| GET | `/__probe/admin-or-support` | `@Roles(ADMIN, SUPPORT)` | `{ ok: true }` |
| GET | `/__probe/undeclared` | ninguna | nunca debe responder 200 (CA-1, DT-2) |
| GET | `/__probe/resources/:id` | `@Roles(CLIENT)` | recurso del actor; ajeno o inexistente → `404 PROBE_RESOURCE_NOT_FOUND` (CA-11) |

### Eventos

Ninguno.

### Tiempo real

Ninguno en 003. El *handshake* de Socket.IO (015) usará el mismo `IAccessTokenVerifier` (ADR-0010).

### Contratos TypeScript que otros consumen

```ts
// shared/application/auth/i-access-token-verifier.port.ts — lo implementa identity (002 D-14), lo usan JwtStrategy (identity) y realtime (015)
export const ACCESS_TOKEN_STRATEGY = 'jwt'; // nombre de la estrategia de Passport; JwtAuthGuard extiende AuthGuard(ACCESS_TOKEN_STRATEGY)
export const I_ACCESS_TOKEN_VERIFIER = Symbol('I_ACCESS_TOKEN_VERIFIER');
export interface AccessTokenClaims { readonly userId: string; readonly role: Role; readonly sessionId: string }
export type AccessTokenVerification =
  | { readonly valid: true; readonly claims: AccessTokenClaims }
  | { readonly valid: false; readonly reason: 'expired' | 'invalid' };
export interface IAccessTokenVerifier {
  /** Nunca lanza por un token malo: devuelve `valid: false`. Único que decide el vencimiento (con IClock). */
  verify(token: string): Promise<AccessTokenVerification>;
}

// shared/domain/actor.ts
export const createActor = (id: string, role: Role): Actor; // canReadContent = role === Role.CLIENT (D-9)
export const ALL_ROLES: readonly Role[];

// shared/presentation/auth/*
export const Public: () => CustomDecorator;
export const Roles: (...roles: readonly [Role, ...Role[]]) => CustomDecorator; // al menos un rol
export const CurrentActor: () => ParameterDecorator;      // Actor; si falta, UnauthenticatedError
export const CurrentSessionId: () => ParameterDecorator;  // `sid` del token (lo usa 002 para «esta sesión»)

// shared/application/persistence/i-transaction-runner.port.ts (001) — método nuevo
withActor<T>(actor: Actor, work: () => Promise<T>): Promise<T>;

// modules/access/index.ts
export { AccessModule, PermissionResolver, accessibleNodes, AccessLevel, Action };
export type { AccessibleNodesFragment };
// AccessibleNodesFragment = { sql: string; parameters: Record<string, unknown> }
// El fragmento es un SELECT con columnas (nodo_id uuid, tipo_nodo text, nivel text). Parámetros con nombre
// prefijados `access_` para usarlo en un QueryBuilder:
//   qb.andWhere(`archivo.id IN (SELECT nodo_id FROM (${f.sql}) accesibles)`, f.parameters)
```

## 6. Diseño de componentes

### 6.1 `shared`: `Actor`, roles y errores

| Pieza | Ubicación | Detalle |
|---|---|---|
| `createActor(id, role)` | `domain/actor.ts` | Único lugar que calcula `canReadContent` (`true` solo para `CLIENT`, D-9). Devuelve un objeto congelado |
| `ALL_ROLES` | `domain/role.enum.ts` | `Object.values(Role)`, para rutas de «gestionar su propia sesión» (matriz §2: los cuatro roles) |
| `UnauthenticatedError` | `domain/errors/unauthenticated.error.ts` | `extends UnauthorizedError`; `code = 'SHARED_UNAUTHENTICATED'` |
| `InsufficientRoleError` | `domain/errors/insufficient-role.error.ts` | `extends ForbiddenError`; `code = 'SHARED_FORBIDDEN'` |
| Roles y códigos compartidos | `packages/contracts/src/shared/{roles,error-codes}.ts` | Una prueba unitaria de `api` afirma que `Role` y `ROLES` coinciden y que los `code` de las dos clases son los de `contracts`. El dominio no importa `contracts` (ADR-0008) |

### 6.2 `shared`: guards y decoradores (D-2, D-10, D-11)

- **`IAccessTokenVerifier` y `ACCESS_TOKEN_STRATEGY`** (§5, mismo archivo). Nacen en PR-A con el verificador de
  prueba. Hay **una sola** suite de contrato, `apps/api/test/support/access-token-verifier.contract.ts`: una función que
  recibe el verificador, una fábrica de tokens (válido, vencido según `IClock`/`FixedClock`, alterado, otra clave,
  `alg: none`, `HS512`, *claims* de más o de menos) y la app de prueba. Tiene dos tramos: **por el puerto** (`verify`
  da el resultado esperado y nunca lanza) y **por HTTP** (los mismos tokens contra la ruta sonda `GET /__probe/actor`
  de `test/support`, protegida por los guards globales, dan el mismo resultado que `verify`: 200 con el mismo actor o
  401 con el mismo motivo). En 003 la corren `TestAccessTokenVerifier` + `TestJwtStrategy`; 002 la corre con su
  verificador y su `JwtStrategy` reales (Liskov, 002 CA-26). No existe otra suite ni otro controlador con
  `AuthGuard('jwt')`.
- **`RequestPrincipal`** (`presentation/auth/request-principal.ts`): `WeakMap<Request, { actor; sessionId }>` privado
  del módulo, con `set` y `get`. No usa `req.user` ni ninguna propiedad de la petición: ningún *parser*, cabecera ni
  middleware de terceros puede escribirlo (D-11, CA-4). Passport escribe `req.user`; **nadie lo lee**.
- **`JwtAuthGuard`** (`presentation/auth/jwt-auth.guard.ts`) `extends AuthGuard(ACCESS_TOKEN_STRATEGY)` de
  `@nestjs/passport`. `shared` importa el paquete `@nestjs/passport`, nunca `identity`:
  1. `canActivate`: `Reflector.getAllAndOverride(IS_PUBLIC, [handler, class])`; si es pública, devuelve `true` sin
     mirar la cabecera y **antes** de `super` (un token inválido en una ruta pública se ignora).
  2. Análisis estricto de la cabecera: **una sola** `authorization` con el formato `^Bearer ([A-Za-z0-9._~+/-]+=*)$`.
     Si falta, motivo `missing_token`; si el formato es otro (otro esquema, vacía, varias), `malformed_authorization`.
     Ambos se rechazan sin llamar a Passport (bitácora + `UnauthenticatedError`).
  3. `super.canActivate(ctx)`. Si Passport rechaza **fuera** del *callback* (p. ej. «Unknown authentication strategy
     "jwt"» porque no hay estrategia registrada), `canActivate` entrega ese error a `handleRequest(err, false,
     undefined, ctx)`, de modo que la traducción sigue en un solo lugar.
  4. `handleRequest(err, user, info, ctx)` es el **único** punto que traduce el resultado de Passport a motivo:
     - `user` es un `AccessTokenClaims` → `createActor(claims.userId, claims.role)` y
       `RequestPrincipal.set(req, { actor, sessionId: claims.sessionId })`; devuelve `user` (Passport lo copia a
       `req.user`, que nadie lee);
     - `info?.name === 'TokenExpiredError'` o `info?.reason === 'expired'` → `expired_token`;
     - cualquier otro caso (`user` falso, `info` de otro tipo, `err` no nulo, estrategia desconocida) →
       `invalid_token`;
     - en los rechazos registra `auth.unauthenticated` (§7) y lanza `UnauthenticatedError` (401).
  - **Sin estrategia `'jwt'` registrada, toda ruta no pública responde 401** (`invalid_token`): niega por defecto. Es
    el caso de 001 (sin rutas no públicas) y de cualquier app que no cargue `IdentityModule` ni una estrategia de
    prueba. PR-A lo prueba (`auth-guards.no-strategy.int-spec.ts`, archivo propio porque el registro de Passport es
    por proceso).
  - No consulta la base: la suspensión se refleja en 15 min como máximo (002 D-10, riesgo aceptado en la spec §13).
- **`JwtStrategy`** (`identity`, la escribe 002; aquí solo su forma, la misma que `TestJwtStrategy`):
  `PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY)` de `passport-jwt` con la constante única de opciones de
  verificación (clave, `algorithms: ['HS256']`), `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()`,
  `passReqToCallback: true` e `ignoreExpiration: true`. `validate(req)` vuelve a extraer el token y **delega en el
  puerto**: `valid` → devuelve `claims`; si no → devuelve `[false, { reason }]` (Passport `fail(info)`), sin lanzar. El
  vencimiento lo decide **solo** el puerto con `IClock`; por eso Passport ignora `exp` (con dos relojes, un token
  firmado con `FixedClock` sería válido por un camino y vencido por el otro).
- **`RolesGuard`** (`presentation/auth/roles.guard.ts`): si la ruta es pública, pasa. Si no, lee `ROLES_KEY`. Sin
  metadatos, el motivo es `undeclared_route` y responde 403 (DT-2). Si el rol del `Actor` no está en la lista, el
  motivo es `role_not_allowed`. En ambos casos registra `auth.forbidden` y lanza `InsufficientRoleError`. Si no hay
  `Actor` (no debería pasar, porque `JwtAuthGuard` corre antes), lanza `UnauthenticatedError`.
- **Decoradores** (`presentation/auth/{public,roles,current-actor,current-session-id}.decorator.ts`): `@Public()` y
  `@Roles()` son `SetMetadata`, válidos en clase o método (el método manda). `@Roles()` exige al menos un rol por
  tipo. `@CurrentActor()` y `@CurrentSessionId()` leen **solo** `RequestPrincipal` (nunca `req.user`). 002 usa
  `@CurrentSessionId()` para «esta sesión».
- **`AuthGuardsModule`** (`presentation/auth/auth-guards.module.ts`): módulo **estático**, sin `forRoot`, sin
  `imports` ni `verifier`. Solo registra `APP_GUARD` → `JwtAuthGuard` y luego `APP_GUARD` → `RolesGuard` (ese orden).
  `AppModule` lo importa desde PR-A. El guard no necesita el puerto inyectado: lo que le llega en `user` lo produjo el
  puerto dentro de la estrategia. Así «el `AuthGuard('jwt')` se enlaza en la raíz de composición» (ADR-0017) y
  `shared` nunca importa `identity` (D-14 de 002, ADR-0010).
- **`HealthController`**: `@Public()` a nivel de clase (CA-3). El `worker` no registra guards: su HTTP es salud interna
  sin puerto publicado (000 CA-23).
- **Recorredor de rutas** (`apps/api/test/support/route-declarations.ts`): con `DiscoveryService`, `MetadataScanner`
  y `Reflector` lista, por controlador y método, `{ method, path, public, roles }` con el prefijo global. Devuelve las
  rutas sin declaración y las que declaran **ambas** cosas (DT-2). Lo usan CA-3 y CA-7.

### 6.3 `shared`: `withActor` y el ámbito de actor (D-7, R-7, CA-12)

Se construye sobre `ITransactionRunner` y `TransactionContext` de 001 (T-14), sin otra ALS:

- `TransactionContext` (001) guarda `{ manager }`. 003 lo amplía a `{ manager; actor?: Actor }` y agrega
  `requireActorScope(actor: Actor): EntityManager`. Si no hay actor en el contexto, lanza `ActorScopeMissingError`;
  si hay otro `id` o rol, `ActorScopeConflictError`. Los dos son `Error` simples (salen como 500 genérico): son errores
  de programación, no de negocio. Los repositorios de datos de cliente (`findAccessible`, desde 005) y
  `SqlAccessLevelReader` obtienen su `EntityManager` **solo** de ahí. Así, consultar sin actor da un error y nunca
  filas (ADR-0005).
- `TypeormTransactionRunner.withActor(actor, work)`:
  1. Valida `actor.id` como UUID y `actor.role ∈ Role`.
  2. Si ya hay contexto: con el mismo actor, ejecuta `work()` en la misma transacción (reentrante). Con otro actor, o
     dentro de un `run` sin actor, lanza `ActorScopeConflictError`. Nunca mezcla actores ni fija el actor a mitad de
     una transacción ajena.
  3. Si no hay contexto: `dataSource.transaction(async (manager) => { await manager.query('SELECT
     set_config($1, $2, true), set_config($3, $4, true)', ['app.actor_id', actor.id, 'app.actor_role', actor.role]);
     return als.run({ manager, actor }, work); })`. Nombre y valor van como parámetros enlazados, y `true` hace el
     valor local a la transacción (ADR-0005).
  - `run(work)` dentro de `withActor` se une a la transacción y conserva el actor. `run` fuera de `withActor` sigue
    igual que en 001, para tablas sin datos de cliente (`usuario`, `token_cuenta`).
- La transacción abarca el caso de uso, no la petición. No hay interceptor por petición (ADR-0005 lo descarta).

### 6.4 `shared`: `DatabaseRoleCheck` (CA-13; DT-4)

`infrastructure/persistence/database-role.check.ts`, en `SharedModule` (lo cargan `api` y `worker`). En
`onApplicationBootstrap` ejecuta:

```sql
SELECT r.rolsuper, r.rolbypassrls,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND pg_has_role(r.oid, c.relowner, 'USAGE')) AS owns_tables
FROM pg_roles r WHERE r.rolname = current_user;
```

`pg_has_role(r.oid, c.relowner, 'USAGE')` es verdadero si el rol es el dueño **o** hereda la propiedad por pertenencia
(p. ej. si alguien hace `GRANT nimbo TO nimbo_app`); `c.relowner = r.oid` solo veía el primer caso.

Si algo es verdadero, registra `db.role_rejected` (`superuser`, `bypassRls`, `ownsTables` como booleanos, sin URL) y
lanza, y el proceso termina con código ≠ 0 antes de abrir el puerto. Aplica en todos los ambientes, incluidas las
pruebas: el arnés también debe conectarse como `nimbo_app` (ADR-0005: «si una prueba se conecta como superusuario,
pasa aunque haya fugas»). El mensaje indica la acción: «La API debe conectarse como nimbo_app; revisa DATABASE_URL y
ejecuta pnpm db:app-role».

### 6.5 Módulo `access` (M3a; D-1)

```
apps/api/src/modules/access/
├─ index.ts                       # AccessModule, PermissionResolver, accessibleNodes, AccessLevel, Action, AccessibleNodesFragment
├─ access.module.ts               # provee PermissionResolver e I_ACCESS_LEVEL_READER → SqlAccessLevelReader; exporta PermissionResolver
├─ README.md
├─ domain/
│  ├─ access-level.enum.ts        # OWNER | EDITOR | VIEWER
│  ├─ action.enum.ts
│  └─ policies/
│     ├─ i-access-policy.ts       # IAccessPolicy { level; allows(action): boolean }
│     ├─ owner.policy.ts · editor.policy.ts · viewer.policy.ts
│     └─ access-policies.ts       # policyFor(level): IAccessPolicy (mapa inmutable, exhaustivo por tipo)
├─ application/
│  ├─ permission-resolver.ts
│  └─ i-access-level-reader.port.ts
└─ infrastructure/sql/
   ├─ accessible-nodes.ts          # accessibleNodes(actor): AccessibleNodesFragment
   └─ sql-access-level-reader.ts
```

**`Action` y políticas** (CA-8; tabla de niveles de `product-context.md` §2, leída como lista de lo permitido):

| `Action` | Significado | Owner | Editor | Viewer |
|---|---|:-:|:-:|:-:|
| `VIEW` | ver el recurso y su contenido | ✔ | ✔ | ✔ |
| `PREVIEW` | vista previa | ✔ | ✔ | ✔ |
| `DOWNLOAD` | descargar | ✔ | ✔ | ✔ |
| `QUERY_AGENT` | consultar al agente sobre el recurso | ✔ | ✔ | ✔ |
| `EDIT` | editar (`.docx` en línea) | ✔ | ✔ | ✘ |
| `CREATE_VERSION` | generar versiones | ✔ | ✔ | ✘ |
| `SHARE` | compartir | ✔ | ✘ | ✘ |
| `CREATE_PUBLIC_LINK` | crear enlaces públicos | ✔ | ✘ | ✘ |
| `VIEW_ACCESS_LIST` | ver quién más tiene acceso | ✔ | ✘ | ✘ |
| `MOVE` | mover | ✔ | ✘ | ✘ |
| `DELETE` | eliminar el original | ✔ | ✘ | ✘ |

- Ver el historial de versiones, restaurar una versión y renombrar no entran en 003: sus specs (014, 005/006) agregan
  el valor a `Action` y su fila a las políticas. P-2 anota la duda sobre el historial para el editor.
- `OwnerPolicy.allows` devuelve `true` para todo valor de `Action`. `EditorPolicy` y `ViewerPolicy` usan un
  `ReadonlySet` de lo permitido. Un valor nuevo de `Action` queda **negado** para Editor y Viewer hasta que alguien
  lo agregue (cerrado por defecto).

**`PermissionResolver`** (`application/permission-resolver.ts`; D-9, R-6):

```ts
levelFor(actor: Actor, nodeId: string): Promise<AccessLevel | null>
  // !actor.canReadContent → null sin consultar; nodeId que no es UUID → null sin consultar
  // si no, reader.levelFor(actor, nodeId)
can(actor: Actor, nodeId: string, action: Action): Promise<boolean>
  // !actor.canReadContent → false sin consultar (CA-9); si no, level !== null && policyFor(level).allows(action)
```

- Debe llamarse dentro de `withActor(actor, …)`: el lector lo exige.
- `inheritedGrants` llega con 012.

**`accessibleNodes(actor)`** (`infrastructure/sql/accessible-nodes.ts`): función pura, sin DI, que devuelve
`{ sql, parameters }`.

- Para roles internos devuelve siempre el **conjunto vacío tipado**:
  `SELECT NULL::uuid AS nodo_id, NULL::text AS tipo_nodo, NULL::text AS nivel WHERE false`. Los roles internos ven
  metadatos por `INodeMetadataReader` (005/011), nunca por aquí.
- En 003 también es el conjunto vacío para `CLIENT`: sin tablas, nadie ve nada.
- 005 reemplaza el caso `CLIENT` por la parte de propiedad; 012 agrega `UNION ALL` con las comparticiones y la herencia
  por `carpeta.ruta` (§6.11).
- Cuando el conjunto tenga filas, el nivel de un nodo es el mayor que aparezca (`OWNER > EDITOR > VIEWER`).

**`SqlAccessLevelReader`**: toma el `EntityManager` de `TransactionContext.requireActorScope(actor)` y consulta
`SELECT nivel FROM (<fragmento>) accesibles WHERE nodo_id = :access_node_id` con el orden de precedencia y `LIMIT 1`.
En 003 siempre devuelve `null`, pero la consulta se ejecuta de verdad contra Postgres, así que el contrato queda
probado (§8).

### 6.6 Composición

- `AppModule.forRoot(env)`:
  - importa `AuthGuardsModule` (estático) **desde PR-A**: los guards globales quedan activos desde ese PR. Hasta que
    002 registre `JwtStrategy` (vía `IdentityModule`, que `AppModule` ya importa desde 001), toda ruta no pública
    responde 401 (§6.2); en 001 no hay rutas no públicas;
  - agrega `AccessModule` (PR-C).
- `createTestApp` (arnés):
  - registra siempre `AuthGuardsModule` (no hay opción para apagar los guards: las suites de 001 y 002 fallan si
    olvidan `@Public()`; la salud ya es `@Public()`);
  - `test/support/`: `TestAccessTokens` (firma HS256 con una clave de prueba y `exp` según `FixedClock`),
    `TestAccessTokenVerifier implements IAccessTokenVerifier` (verifica esos tokens con el reloj de la prueba) y
    `TestJwtStrategy` (misma forma que `JwtStrategy` de 002: `passport-jwt`, `passReqToCallback: true`,
    `ignoreExpiration: true`, `validate` delega en el verificador). Así CA-2 (vencido, alterado, otra clave) se prueba
    ya en PR-A contra el comportamiento real de `passport-jwt`;
  - **registro único de la estrategia**: `passport.use` es un registro por proceso y la última estrategia con el mismo
    nombre gana. Regla: una app de prueba registra **una sola** estrategia `ACCESS_TOKEN_STRATEGY`. La opción
    `accessTokenStrategy: 'test'` (por defecto en 003) monta `TestJwtStrategy` + `TestAccessTokenVerifier` en un módulo
    de sonda; `'identity'` usa la real de `IdentityModule` con la clave del entorno de pruebas. `createTestApp`
    **lanza** si se pide `'test'` y el árbol de módulos incluye `IdentityModule` una vez que este registra
    `JwtStrategy` (desde 002): nunca mezcla las dos. La regla se documenta en el JSDoc de `createTestApp`.
- `SharedModule` agrega `DatabaseRoleCheck`.

### 6.7 Arnés de aislamiento (CA-15; D-3)

`apps/api/test/isolation/setup/isolation-world.ts`, sobre `globalSetup` compartido:

- **Cuentas**: dos clientes casi idénticos (mismo nombre visible, correos que difieren en un carácter, mismo estado y
  mismas fechas) y una cuenta por rol interno. Se insertan con el rol dueño, porque son *fixtures* y no la aplicación
  (D-3). Los *builders* siguen `conventions.md` (`aClient().named('Ana López').build()`); 005 agrega
  `.withFiles(...)`.
- **`tokenFor(cuenta)`**: con `TestAccessTokens` en 003; el paso a tokens reales (emisor y estrategia de 002) lo hace
  el PR-2 de backend de 002 (ya no hay PR-E).
- **`appAs`**: una app de Nest con `DATABASE_URL` de `nimbo_app` (nunca el dueño; `DatabaseRoleCheck` lo impide).
- **Marcador**: se conserva `ISOLATION_FORCE_FAIL` (000 CA-25).
- **Qué corre en 003**: CA-4, CA-5, CA-6 y CA-9 (lo que pide CA-15), CA-12 y CA-13 (ADR-0005), y la
  `identity-enumeration.iso-spec.ts` de 001, que pasa a correr como `nimbo_app` sin cambios.

### 6.8 Operación y entorno (PD-25)

- `compose.yml`:
  - servicio `postgres`: `NIMBO_APP_DB_PASSWORD: ${NIMBO_APP_DB_PASSWORD}` y el volumen
    `./infra/postgres/init/10-nimbo-app.sh:/docker-entrypoint-initdb.d/10-nimbo-app.sh:ro`;
  - el mismo archivo sirve en local y staging (000 CA-3).
- Script raíz `db:app-role`: `docker compose exec -T postgres sh /docker-entrypoint-initdb.d/10-nimbo-app.sh`. Es
  para volúmenes ya inicializados (hoy, los de todo el equipo) y cambios de contraseña.
- `apps/api/test/int/setup/containers.ts`:
  - `PostgreSqlContainer(...).withCopyFilesToContainer([10-nimbo-app.sh → /docker-entrypoint-initdb.d/])` y
    `.withEnvironment({ NIMBO_APP_DB_PASSWORD })`: el mismo script que compose (DRY);
  - `env()` devuelve `DATABASE_URL` (rol `nimbo_app`) y `DATABASE_MIGRATION_URL` (`getConnectionUri()`, dueño).
- `global-setup.ts` (001 T-06 agrega la migración en el arnés): migra con `DATABASE_MIGRATION_URL`.
- `data-source.cli.ts`: `loadEnv(migrationEnvSchema)` y `buildDataSourceOptions({ DATABASE_URL:
  env.DATABASE_MIGRATION_URL })`. **No** cae a `DATABASE_URL` si falta: falla con `config.invalid`.
- **Staging** (se monta desde el 30/09): los secretos van en GitHub Environments. El paso de despliegue ejecuta el
  script de rol y luego las migraciones con `DATABASE_MIGRATION_URL`, que vive en un archivo de entorno propio del
  paso de migración, no en el `.env` que leen `api` y `worker` (**PD-43**, provisional, §11.4; §10.4).

### 6.9 Frontend (`apps/web`; CA-17, D-5, D-8)

Sin mockups nuevos (D-8): los estados se arman con `StateView` y `Button` de 000b.

| Pieza | Ubicación | Detalle |
|---|---|---|
| `homePathFor(role)` | `features/access/home-path.ts` | `CLIENT` → `/archivos` (Mis archivos); `ADMIN`, `SUPPORT` y `OPERATOR` → `/interno`. Lo usa el inicio de sesión de 002 después de autenticar (D-5) |
| `ROLE_LABELS` | `features/access/role-labels.ts` | «Cliente», «Administrador», «Soporte», «Operador» (tipado con `RoleName` de `contracts`) |
| `RequireRole` | `features/access/components/require-role.tsx` | Client Component. Con sesión (002) y rol permitido, muestra los hijos. Con otro rol, `router.replace(homePathFor(rol))`. Sin sesión, el flujo de 002 (renovar y luego `/iniciar-sesion`). Es solo experiencia: la barrera es el servidor (CA-5) |
| Grupos de rutas | `app/(app)/…` | `(app)` (de 002: `SessionProvider` + `SessionGate`) es el grupo **exterior**; `(cliente)` e `(interno)` van anidados dentro. `(app)/cuenta/seguridad` (002) queda en `(app)`, fuera de los dos, para los cuatro roles |
| Layout de cliente | `app/(app)/(cliente)/layout.tsx` | `RequireRole allowed={['CLIENT']}` |
| `/archivos` | `app/(app)/(cliente)/archivos/page.tsx` | Es de 005. Si 005 no está integrada cuando se integre PR-F, PR-F deja un marcador con `StateView` vacío («Tus archivos aparecerán aquí») que 005 reemplaza |
| Área interna | `app/(app)/(interno)/layout.tsx` + `app/(app)/(interno)/interno/page.tsx` | `RequireRole allowed={['ADMIN','SUPPORT','OPERATOR']}`; `InternalAreaPlaceholder`: «Hola, {nombre}. (`{nombre}` = `SessionResponse.user.fullName` de 002) Tu área de {rol} estará disponible pronto.» y el botón «Cerrar sesión» (acción de 002). `{rol}` en minúsculas desde `ROLE_LABELS` |
| `ForbiddenState` | `features/access/components/forbidden-state.tsx` | `StateView` con ícono de candado, título «Sin permiso» y el texto de §11: «No tienes permiso para ver esta página. Si crees que es un error, escríbenos a {correo}.». Acción «Ir a mi inicio» (`homePathFor`) |
| `NotFoundState` | `features/access/components/not-found-state.tsx` | «No encontramos lo que buscas. Puede que no exista o que no tengas acceso.» Acción «Ir a mi inicio» (o «Ir al inicio» sin sesión) |
| 404 de rutas | `app/not-found.tsx` | `NotFoundState` |
| Catálogo de errores | `lib/error-catalog.ts` (001) | `SHARED_UNAUTHENTICATED` (lo maneja el cliente HTTP de 002: renueva y, si falla, va a iniciar sesión) y `SHARED_FORBIDDEN`. Las pantallas que reciben 403 o 404 de la API muestran `ForbiddenState` o `NotFoundState` |
| Correo de contacto | `packages/contracts` (`legal.ts`) | Una sola constante, `SUPPORT_CONTACT_EMAIL`: el correo de los textos legales de 001 (§6.13), que también usa el mensaje de cuenta suspendida de 002. 003 la importa; no crea `lib/contact.ts` ni `CONTACT_EMAIL`. Si al integrar PR-F aún no existe, PR-F la agrega en `legal.ts` con ese nombre |

Tokens nuevos: ninguno. Objetivos táctiles de 44 px. Foco al título del estado al montar. Textos en español con tuteo.

**Pedido a 002** (PD-42, provisional, §11.4): la sesión en memoria de la web expone `SessionResponse.user` (`id`,
`fullName`, `email`, `role`); 003 usa `fullName` como nombre visible. El destino tras iniciar sesión es
`homePathFor(role)` (si 002-PR-5a llega antes que PR-F, lo crea tal como lo define esta tabla y 003 lo reutiliza), y 002
ofrece la acción «Cerrar sesión» que reutiliza el área interna. `sessionId` para «esta sesión» sale de
`@CurrentSessionId()` de 003.

### 6.10 Variables de entorno

| Variable | Proceso | Esquema | `.env.example` (local) | Staging | Secreto |
|---|---|---|---|---|---|
| `DATABASE_URL` | api, worker | URL (sin cambio de esquema); **ahora de `nimbo_app`** | `postgres://nimbo_app:nimbo_app@localhost:5432/nimbo` | GitHub Environments | sí (lleva contraseña) |
| `DATABASE_MIGRATION_URL` | solo migraciones (`migrationEnvSchema`, que leen `data-source.cli.ts` y `migrate.ts`) | URL | `postgres://nimbo:nimbo@localhost:5432/nimbo` | solo el paso de migración (PD-43) | sí |
| `NIMBO_APP_DB_PASSWORD` | compose (servicio `postgres`, script de rol) | — (no la lee ninguna app) | `nimbo_app` | GitHub Environments | sí |

- `migrationEnvSchema` vive en `shared/infrastructure/config/env.schema.ts` y **no** se une a `apiEnvSchema` ni a
  `workerEnvSchema`.
- `scripts/check-env-example.ts` agrega `migrations: Object.keys(migrationEnvSchema.shape)` a `collectSchemaKeys`.
  `pnpm env:check` la cubre, y su prueba unitaria agrega el caso.
- `redacted-fields.ts`: `DATABASE_MIGRATION_URL` entra en `CONNECTION_URL_FIELDS`.
- `.env.example`: el comentario de `POSTGRES_USER` cambia a «dueño de las tablas; debe coincidir con
  `DATABASE_MIGRATION_URL`», y se agrega `NIMBO_APP_DB_PASSWORD` («debe coincidir con `DATABASE_URL`»).
- `docs/operations/ambientes.md`: filas nuevas y el paso «volumen existente → `pnpm db:app-role`».

### 6.11 Qué se completa con 005 y 012 (D-1)

| Pieza | 003 (hoy) | 005 (dueño de `access` en el PR de 005) | 012 |
|---|---|---|---|
| `accessibleNodes(CLIENT)` | conjunto vacío tipado | propiedad: `archivo` y `carpeta` del actor (`propietario_id = :access_actor_id`), `nivel = 'OWNER'` | `UNION ALL` con comparticiones directas y heredadas por `carpeta.ruta`. Si la regla se repite en la política, se extrae una función SQL `STABLE` versionada (ADR-0005) |
| `accessibleNodes(interno)` | conjunto vacío | igual | igual |
| RLS | funciones `nimbo_actor_id()`/`nimbo_actor_role()` y permisos | `ENABLE` + `FORCE` en `archivo` y `version_archivo`. `CLIENT`: sus filas. `ADMIN`/`SUPPORT`: metadatos de `archivo` y **ninguna** fila de `version_archivo`. `OPERATOR`: ninguna | las políticas suman las comparticiones |
| Pruebas | CA-12, CA-13, conjunto vacío | CA-10 (dos clientes, listado, búsqueda y descarga; filtro en el SQL con `EXPLAIN`), CA-11 con archivos reales, CA-14 (sin actor → 0 filas; se quita el `JOIN` en una prueba y la base sigue negando) | comparticiones en la suite de aislamiento |
| Índices | — | dueño en `archivo`, `version_archivo(archivo_id)` | `comparticion`, `carpeta.ruta` |

Pedido al plan de 005 (Abel con Adrián, **PD-44**, provisional, §11.4): incluir las filas de 005 de esta tabla y el *builder*
`.withFiles(...)` del mundo de aislamiento.

### 6.12 Corte en PR y dependencias con 001 y 002

El alcance supera los 400 líneas por PR (`conventions.md`). Se integra en **cinco PR parciales** (`workflow.md` §4.8),
cada uno con `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` y `pnpm test:isolation` en verde en local
(`workflow.md` §7.2):

| PR | Contenido | Depende de | ¿Empieza hoy? |
|---|---|---|---|
| **PR-A «autorización en shared»** | instala con versión exacta `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` y `@types/passport-jwt`; `contracts/shared/{roles,error-codes}`; `createActor`, `ALL_ROLES`, `UnauthenticatedError`, `InsufficientRoleError`; `IAccessTokenVerifier` + `ACCESS_TOKEN_STRATEGY` + suite de contrato (tramos puerto y HTTP); `RequestPrincipal`, decoradores, `JwtAuthGuard extends AuthGuard(ACCESS_TOKEN_STRATEGY)`, `RolesGuard`, `AuthGuardsModule` estático **importado en `AppModule`**; `@Public()` en `HealthController`; `TestAccessTokens`, `TestAccessTokenVerifier`, `TestJwtStrategy` y guards siempre activos en `createTestApp`; pruebas de CA-1, CA-2 (unit + int con `passport-jwt` real), CA-4 a CA-6 (int con sondas), CA-16, «sin estrategia → 401» | main (000) | **Sí**, en paralelo con 001 PR-1. Es lo primero: desbloquea `@Public()` para 001 PR-3 y el puerto, el nombre de la estrategia y los decoradores para 002-PR-2 |
| **PR-B «roles de BD y withActor»** | script de rol, compose, `.env.example`, `db:app-role`, `migrationEnvSchema`, `data-source.cli.ts`, `containers.ts`/`global-setup.ts` con dos roles, las dos migraciones, `withActor` + `requireActorScope`, `DatabaseRoleCheck`, lint `rls.js` (PD-26), redacción, `env:check`, `ambientes.md`; CA-12 y CA-13 | **001 PR-1** (T-06: tablas y migración en el arnés; T-14: `TransactionContext`) | Sí, en rama apilada sobre 001 PR-1. El script, el lint y la parte de compose no tocan archivos de 001 y pueden hacerse ya |
| **PR-C «access»** | módulo `access` completo, `AccessModule` en `AppModule`; CA-8, CA-9 y el contrato de `levelFor` | PR-A (`createActor`) y PR-B (`requireActorScope`) | El dominio (`AccessLevel`, `Action`, políticas; CA-8) **sí**: no importa nada nuevo |
| **PR-D «arnés de aislamiento y rutas»** | `isolation-world.ts`, sondas en la suite iso (CA-4, CA-5, CA-6, CA-9), `route-declarations.ts`, CA-3, CA-7 y CA-11 | PR-A, PR-B y PR-C; **001 PR-3** para que CA-7 recorra rutas reales. Si 001 PR-3 ya se integró sin `@Public()`, PR-D los agrega | Tras PR-A/B/C |
| **PR-F «web»** | `features/access/*`, grupos `(cliente)` e `(interno)` anidados en `(app)`, `not-found.tsx`, catálogo `SHARED_*`, uso de `SUPPORT_CONTACT_EMAIL`; CA-17 (componentes + jest-axe) | **001 PR-4** (`api-client`, `error-catalog`) y **002-PR-5a** (grupo `(app)`, sesión en memoria, PD-42) | `homePathFor`, `ROLE_LABELS` y los componentes de estado **sí**, con una sesión falsa en las pruebas |

**PR-E desaparece.** Su contenido pasa al **PR-2 de backend de 002**: registrar `JwtStrategy` e
`I_ACCESS_TOKEN_VERIFIER` en `IdentityModule`, cambiar el mundo de aislamiento a tokens reales (`tokenFor`) y correr la
suite de contrato de 003 (tramos puerto y HTTP) con el verificador y la estrategia reales. No hace falta ningún enlace
en `AppModule`: `AuthGuardsModule` ya está desde PR-A e `IdentityModule` desde 001.

```
001 PR-1 ──► 003 PR-B ──┐
003 PR-A ───────────────┴──► 003 PR-C ──► 003 PR-D (+ 001 PR-3)
003 PR-A ───────────────────► 002 PR-2 (JwtStrategy, verificador real, tokens reales en aislamiento, contrato real)
001 PR-4 + 002 PR-5a ───────► 003 PR-F
```

- **Orden recomendado hoy**: PR-A primero (≈ 1 día). Mientras tanto, el script de rol, el lint y el dominio de
  `access` en paralelo. PR-B en cuanto se integre 001 PR-1.
- **Acuerdo con 001 y 002**: toda ruta nueva lleva `@Public()` o `@Roles(...)` desde que PR-A esté en `main`. Hasta
  entonces, la ruta se escribe sin decorador y PR-D la anota; CA-7 lo detecta.
- **Migraciones de 002**: si su marca de tiempo es anterior a `20260928110000`, `GRANT … ON ALL TABLES` las cubre; si
  es posterior, los privilegios por defecto. Si 002 no quiere `DELETE` en alguna tabla, la migración de esa tabla lo
  revoca.
- `verification.md`, `security.md`, `ui-review.md` y `review.md` se producen una vez, con el último PR (PR-F o PR-D).

## 7. Observabilidad

**Bitácoras**. Todas llevan `correlationId` por el `mixin` de 000. Ninguna lleva token, cabecera `authorization`,
correo, nombre ni URL con consulta (CA-16):

| Evento | Nivel | Campos | Cuándo |
|---|---|---|---|
| `auth.unauthenticated` | info | `route` (`GET /api/v1/…/:id`, el **patrón**, no la URL), `reason: 'missing_token' \| 'malformed_authorization' \| 'invalid_token' \| 'expired_token'` | 401 |
| `auth.forbidden` | warn | `route`, `actorId`, `role`, `reason: 'role_not_allowed' \| 'undeclared_route'`, `requiredRoles` | 403 |
| `auth.unexpected_error` | warn | `route`, `errorClass` y, si es un `Error`, `errorMessage` (recortado a 200 caracteres); nunca token ni cabeceras | 401 `invalid_token` por un `err` de Passport que no es `UnauthenticatedError` ni `TokenExpiredError`/`JsonWebTokenError`/`NotBeforeError` (review 003 I-2): separa un bug de la estrategia de un token inválido; `auth.unauthenticated` se registra igual |
| `db.role_rejected` | fatal | `superuser`, `bypassRls`, `ownsTables` | arranque con un rol inválido |

- `info` para 401 porque los tokens vencidos son rutina (cada 15 min). `warn` para 403 porque indica un rol probando
  lo que no le toca, o una ruta sin declarar.
- `http.domain_error` (000) sigue registrando `code` y `status`: no se duplica el motivo ahí.
- **Métricas**: ninguna nueva (RNF-18 llega con 022). Candidata para 022: `nimbo_shared_auth_denied_total{status,reason}`.
- **Alertas**: ninguna. Candidata para 022: una racha de `auth.forbidden` con `undeclared_route`, que en producción es
  un error de código.

## 7b. Seguridad y privacidad (Art. IX)

- **Negación por defecto en dos capas**: sin `@Public()` → 401; sin `@Roles()` → 403; y la prueba de CA-7 nombra la
  ruta en CI.
- **Negación sin estrategia**: si no hay estrategia `'jwt'` registrada, toda ruta no pública responde 401 (§6.2).
- **Sin suplantación (R-3, D-11)**: el `Actor` sale solo de los `claims` que produce el puerto (vía la estrategia) y
  vive en un `WeakMap`, no en `req`. Passport escribe `req.user`, pero nadie lo lee. `@CurrentActor()` es la única
  forma de leerlo. CA-4 prueba cuerpo, consulta, ruta, cabeceras (`x-user-id`, `x-actor-role`, `x-forwarded-user`) y
  un middleware que escribe `req.user`.
- **Roles internos**: `can` y `levelFor` los niegan sin consultar (CA-9); `accessibleNodes` les da el conjunto vacío.
- **RLS preparado**: un solo lugar escribe `app.actor_*`, con parámetros y `true` (lint + CA-12). Fuera de `withActor`,
  los repositorios de datos de cliente fallan. `api` y `worker` no arrancan como dueño, superusuario ni `BYPASSRLS`.
- **Enumeración por 404**: el 404 de lo ajeno es idéntico al de lo inexistente (CA-11). Quedan diferencias de tiempo
  de milisegundos entre ambos caminos: el filtro está en la misma consulta, así que la diferencia es mínima. La
  revisa el `security-auditor`.
- **Secretos**: tres credenciales de BD en variables de entorno. La contraseña de `nimbo_app` pasa por una variable
  de `psql`, no por concatenación. `DATABASE_MIGRATION_URL` fuera del proceso de `api` en staging (PD-43).
- **Token en ruta pública**: se ignora, no se valida. Así una ruta pública no se vuelve oráculo de validez de tokens.
- **Superficie residual aceptada**: un rol suspendido conserva hasta 15 min su token (002 D-10).

## 8. Estrategia de pruebas

Unitarias junto al código. Integración en `apps/api/test/int/<modulo>/`. Aislamiento en `apps/api/test/isolation/`,
siempre con los dos roles reales. Nombres `'CA-n: …'`. Sin E2E con Playwright: pasa a la Fase 2 (PD-41).

| Criterio | Nivel | Archivo propuesto |
|---|---|---|
| CA-1 | unit + int | `shared/presentation/auth/jwt-auth.guard.spec.ts` (sin cabecera, `Basic`, dos credenciales, formato roto; ruta `@Public()` devuelve `true` sin llamar a `super`); `apps/api/test/int/shared/auth-guards.int-spec.ts` (`/__probe/undeclared` y `/__probe/client` sin token → 401 con `{ code, message, correlationId }` validado con `errorResponseSchema`; espía del controlador sin llamadas); `apps/api/test/int/shared/auth-guards.no-strategy.int-spec.ts` (app sin estrategia `'jwt'` registrada: ruta no pública con cualquier token → 401 `invalid_token`, pública → 200) |
| CA-2 | unit + int | `jwt-auth.guard.spec.ts`, mapeo de `handleRequest`: `info` `TokenExpiredError` → `expired_token`; `info.reason === 'expired'` → `expired_token`; otro `info` → `invalid_token`; `validate` que devuelve `false` → `invalid_token`; `err` no nulo o estrategia desconocida → `invalid_token`; con `claims` → `RequestPrincipal` escrito. Suite única `apps/api/test/support/access-token-verifier.contract.ts` (tramo puerto y tramo HTTP contra `/__probe/actor`; vencido con `FixedClock`, alterado en un carácter, otra clave, `alg: none`, `HS512`, *claims* de más o de menos). En PR-A la corren `TestAccessTokenVerifier` + `TestJwtStrategy` con `passport-jwt` real; 002-PR-2 la corre con su verificador y su estrategia reales |
| CA-3 | int | `apps/api/test/int/shared/route-declarations.int-spec.ts`: las rutas `@Public()` de `AppModule` son exactamente la lista de §5, y `GET /health/live` responde 200 sin token. La llamada a cada ruta pública de 001 y 002 la cubren sus propias suites, que corren con los guards activos |
| CA-4 | int + iso | `auth-guards.int-spec.ts` (el `Actor` de cada rol; `canReadContent` solo en `CLIENT`); `apps/api/test/isolation/roles-and-actor.iso-spec.ts` (se envían `id`, `userId`, `role` y `actor` en la ruta, el cuerpo, la consulta y las cabeceras, y el `Actor` no cambia); `auth-guards.int-spec.ts` (un middleware de prueba que escribe `req.user` con otro `id` y otro rol antes y después del guard no cambia el `Actor` que recibe `@CurrentActor()` ni el `sessionId` de `@CurrentSessionId()`); `shared/domain/actor.spec.ts` (`createActor`) |
| CA-5 | iso | `roles-and-actor.iso-spec.ts` (matriz: `/__probe/client` con los cuatro roles) |
| CA-6 | iso + unit | `roles-and-actor.iso-spec.ts` (matriz: cuatro rutas × cuatro roles); `roles.guard.spec.ts` (sin metadatos → `undeclared_route`; método que sobrescribe a la clase) |
| CA-7 | int + unit | `route-declarations.int-spec.ts` (`AppModule` completo: ninguna ruta sin declarar ni con las dos); `apps/api/test/support/route-declarations.spec.ts` (con un módulo de prueba que tiene una ruta sin declarar, la lista la nombra con método y ruta) |
| CA-8 | unit | `modules/access/domain/policies/access-policies.spec.ts` (tabla de §6.5 completa, tres niveles × todos los `Action`, y un `Action` desconocido negado para Editor y Viewer) |
| CA-9 | unit + iso | `modules/access/application/permission-resolver.spec.ts` (tres roles internos × acciones de contenido → `false`; el lector falso **no** se llama); `apps/api/test/isolation/access-internal-roles.iso-spec.ts` (`PermissionResolver` real dentro de `withActor` como cada rol interno → `false`, y `accessibleNodes` da 0 filas); `infrastructure/sql/accessible-nodes.spec.ts` (fragmento vacío para roles internos y, en 003, para `CLIENT`; parámetros con prefijo `access_`) |
| CA-10 | **con 005** | En 003, solo la forma del fragmento (`accessible-nodes.spec.ts`) y `apps/api/test/int/access/sql-access-level-reader.int-spec.ts` (la consulta corre en Postgres dentro de `withActor`, devuelve `null` y falla fuera de `withActor`) |
| CA-11 | int (+ **con 005**) | `apps/api/test/int/shared/not-found-uniformity.int-spec.ts` (`/__probe/resources/:id` con un recurso de otra cuenta y un UUID inexistente: mismo `status`, mismas cabeceras salvo `x-correlation-id` y mismo cuerpo salvo `correlationId`) |
| CA-12 | iso | `apps/api/test/isolation/rls-context.iso-spec.ts`: `DataSource` de `nimbo_app` con `extra.max = 1`; dos `withActor` seguidos con actores distintos ven cada uno su `current_setting('app.actor_id')` y el mismo `pg_backend_pid()`; después, `current_setting('app.actor_id', true)` y `nimbo_actor_id()` están vacíos o son `NULL`; 20 `withActor` concurrentes con el *pool* normal ven su actor; reentrada con el mismo actor sí, con otro lanza `ActorScopeConflictError`; `requireActorScope` fuera de `withActor` lanza |
| CA-13 | iso + unit | `apps/api/test/isolation/database-roles.iso-spec.ts`: la conexión de la app no es superusuario ni tiene `BYPASSRLS`, no es dueña de ninguna tabla de `public` y no tiene `CREATE`; todas las tablas son del rol que migra; matriz de permisos (`usuario` y `token_cuenta` sin `DELETE`; `migracion` sin permisos); una app con `DATABASE_URL` del dueño no arranca (`db.role_rejected`); un rol de prueba al que se le hace `GRANT nimbo TO <rol>` (propiedad heredada por pertenencia) también es rechazado con `ownsTables: true`. `shared/infrastructure/persistence/database-role.check.spec.ts`. Revisión manual con compose en `verification.md` (`\du`, `\dp`) |
| CA-14 | **con 005** | 005 (§6.11) |
| CA-15 | iso | la suite completa (`pnpm test:isolation`) con `isolation-world.ts`; se conserva el marcador `ISOLATION_FORCE_FAIL` para probar que la suite puede fallar |
| CA-16 | int | `apps/api/test/int/shared/auth-logs.int-spec.ts` (LogSink): 401 y 403 con `correlationId`, `route` como patrón, `actorId` y `role` en 403, y `reason`. Ninguna línea contiene el token enviado, `Bearer`, el correo del *fixture* ni el valor de las cabeceras falsas |
| CA-17 | web | `features/access/home-path.spec.ts`; `components/require-role.spec.tsx` (cliente → hijos; interno en ruta de cliente → `replace('/interno')`; cliente en `/interno` → `replace('/archivos')`); `internal-area-placeholder.spec.tsx`; `forbidden-state.spec.tsx`; `not-found-state.spec.tsx`; `app/not-found.spec.tsx`. Todas con jest-axe. Revisión del `ui-designer` a 360 y 1440 px en `ui-review.md`. E2E en la Fase 2 (PD-41) |

- **Lint (PD-26)**: `packages/config/eslint/rls.spec.ts` (junto a `boundaries.spec.ts` de PD-24 si ya existe) lintéa
  un *fixture* con `query('SELECT set_config(...)')` y otro con `` `SET LOCAL app.actor_id = …` `` fuera de
  `typeorm-transaction-runner.ts` (fallan), y el archivo permitido (pasa).
- **Contratos**: `roles-contract.spec.ts` (`Role` de `api` = `ROLES` de `contracts`; códigos `SHARED_*` iguales).
- **Migraciones**: `run → revert → run` en local; `apps/api/test/int/shared/migrations-nimbo-app.int-spec.ts` (el `up`
  falla con un mensaje claro si el rol no existe o tiene `BYPASSRLS`).
- **Cobertura**: `domain/` y `application/` de `access` y las piezas nuevas de `shared` ≥ 60 % (RNF-11). Los guards y
  las políticas se cubren por completo con tablas.

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Plazo del Avance 1 (30/09)**: 003 depende de 001 PR-1 y del backend de 002, que se implementan en paralelo | Alta | 003 sin terminar, o guards sin activar en la demo | PR-A no depende de nadie y va primero, con los guards ya activos en `AppModule`. PR-B, PR-C y PR-D avanzan con `TestJwtStrategy`. Ya no hay PR-E: el paso a tokens reales va en 002-PR-2. La demo de roles puede hacerse con la suite (spec §13) |
| **Volúmenes de Postgres ya inicializados** (todo el equipo): el script de inicio no corre y la API no arranca con `nimbo_app` | Segura | Todos quedan bloqueados en local al integrar PR-B | `pnpm db:app-role` idempotente; mensajes de la migración y de `DatabaseRoleCheck` que nombran el comando; aviso en el PR y en `ambientes.md` |
| Una prueba o un proceso se conecta como dueño o superusuario y RLS no frena nada | Media | Fugas invisibles en CI | `DatabaseRoleCheck` en todo ambiente; `containers.ts` separa las dos URL; CA-13 |
| Un `SET` sin `LOCAL` o un `set_config(…, false)` contamina una conexión del *pool* | Baja | Fuga entre peticiones | Lint `rls.js` (PD-26) y CA-12 con la misma conexión |
| Las migraciones de 001 o 002 corren en otro orden respecto de la de permisos | Media | `nimbo_app` sin permisos (falla ruidosa) o con `DELETE` de más en `usuario` | Marca de tiempo posterior a las de 001; PR-B apilado sobre 001 PR-1; `GRANT … ON ALL TABLES` + privilegios por defecto; matriz de permisos probada en CA-13 |
| Passport y el puerto dan resultados distintos para el mismo token (dos verificaciones HS256, vencimiento en dos lugares) | Baja | Un token válido por un camino y rechazado por el otro | Forma única de §6.2 (P-1 resuelta): `ignoreExpiration: true`, el vencimiento solo en el puerto con `IClock`; `validate` delega en el puerto; suite de contrato con tramo HTTP, que 002 corre con su implementación real |
| Registro global de Passport: dos estrategias `'jwt'` en la misma app de prueba (la última gana) | Media | Pruebas que pasan con la estrategia equivocada | `createTestApp` lanza si se mezcla `TestJwtStrategy` con `IdentityModule` (§6.6) |
| Conflicto de `pnpm-lock.yaml` entre 003-PR-A (instala `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt`, `@types/passport-jwt`) y 001-PR-1 | Alta | Rebase con conflicto en el lockfile | Lo resuelve quien integre segundo: se toma el `package.json` combinado y se regenera con `pnpm install`, nunca a mano; aviso en la descripción de los dos PR |
| `withActor` choca con `run` de 001 en casos anidados | Media | Errores de programación en 005 | Reglas explícitas de reentrada (§6.3) con pruebas (CA-12). Los casos de 005 se revisan en su plan |
| La redirección por rol depende de que la sesión web exponga `role` y `fullName` (002) | Media | PR-F bloqueado | PD-42 (provisional); los componentes se prueban con una sesión falsa |
| Rendimiento de RLS en el servidor de 8 GB (política por fila) | Baja en 003 | p95 de listados (RNF-01) | No aplica hasta 005: índices y `EXPLAIN` en su plan (ADR-0005) |
| Mover `RolesGuard` y nombrar piezas nuevas contradice los diagramas | Segura | Art. VIII.6 | DF-50 y DF-55 (provisional); redibujo en PD-02, PD-05 y PD-08 al cierre de la Fase 1 |

## 10. Decisiones

### 10.1 ADR de los que depende este plan

| ADR | Qué decide para 003 | Dónde lo usa el plan |
|---|---|---|
| **ADR-0005** — autorización en la consulta + RLS | `nimbo_app` sin `BYPASSRLS` ni propiedad; `DATABASE_MIGRATION_URL`; `withActor` con `set_config(…, true)` y ALS; `nullif(current_setting(…, true), '')`; lint; arnés con roles reales | §4, §6.3, §6.4, §6.8, §8 |
| **ADR-0008** — fronteras por lint | capas y `index.ts` de `access` | §6.5 |
| **ADR-0010** — `access` M3a de solo lectura, depende solo de `shared` | módulo `access`; exporta `PermissionResolver`, `accessibleNodes`, `AccessLevel` y `Action` | §3b, §6.5 |
| **ADR-0017** — JWT con Passport (c.2) | una sola constante de verificación en `identity`; `JwtAuthGuard` de `shared` extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` y no importa `identity`; `JwtStrategy` (`identity`) delega en el puerto; dependencias `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` (las instala PR-A) | §3b, §6.2, §6.6, P-1 |

No hace falta un ADR nuevo: las dependencias que instala PR-A ya las acepta ADR-0017 c.2 (solo cambia qué PR las
agrega). Las piezas nuevas son aplicación directa de ADR-0005, ADR-0010 y ADR-0017.

### 10.2 Decisiones técnicas del plan (no las tomó la spec)

- **DT-1 Passport en el camino HTTP, verificación en el puerto** (forma única de P-1, §11.2). `JwtAuthGuard` extiende
  `AuthGuard(ACCESS_TOKEN_STRATEGY)`; `JwtStrategy` (`identity`, `ignoreExpiration: true`) delega en
  `IAccessTokenVerifier`, que es el único que produce `AccessTokenClaims` y decide el vencimiento con `IClock`. Así se
  cumplen D-2 («verifica el token con un puerto que define `shared`») y ADR-0017 c.2 (Passport, `AuthGuard('jwt')` en
  la raíz), y HTTP y Socket.IO comparten el puerto. El puerto devuelve un resultado (`valid`/`reason`) en lugar de
  lanzar: el guard registra el motivo (CA-16) y el *handshake* de 015 decide su propia respuesta. `handleRequest` es el
  único que traduce el resultado de Passport a motivo. La segunda verificación HS256 cuesta microsegundos.
- **DT-2 Ruta sin `@Roles()` → 403** (con token válido), además de la prueba de CA-7. Se cierra por defecto aunque la
  prueba no corra. Declarar `@Public()` y `@Roles()` a la vez es un error que la prueba nombra.
- **DT-3 Rol de BD por script de aprovisionamiento, permisos por migración.** El rol y su contraseña son del *cluster*
  y secretos; los permisos son esquema versionado y reversible. El mismo script sirve a compose, Testcontainers y
  staging.
- **DT-4 `DatabaseRoleCheck` al arrancar `api` y `worker`.** Convierte el «riesgo de configuración» de la spec (§10)
  en un fallo inmediato en cualquier ambiente, y hace que el arnés no pueda probar como superusuario (ADR-0005).
- **DT-5 El `Actor` en un `WeakMap` por petición**, no en `req.user`: nada que venga de la red puede escribirlo (D-11),
  y no choca con Passport, que usa `req.user` (nadie lo lee).
- **DT-6 Funciones `nimbo_actor_id()` y `nimbo_actor_role()`** (entran en 003, PR-B; P-3 resuelta, §11.3). Hay una
  sola definición en SQL de «actor sin fijar = `NULL` = sin filas», y la leen las políticas de tres specs (005, 012,
  019); CA-12 ya las ejerce. Evita repetir el `nullif(…)::uuid` en cada política. Si PR-B se atrasa, se mueven tal
  cual a la primera migración de 005.
- **DT-7 `withActor` es un método de `ITransactionRunner`**, no un puerto nuevo: los servicios de aplicación ya reciben
  ese puerto (001) y la ALS es la misma.
- **DT-8 `accessibleNodes` es una función pura exportada**, no un servicio con DI: construye SQL, no lo ejecuta. La
  ejecución vive en los repositorios (005) y en `SqlAccessLevelReader`.
- **DT-9 `IAccessLevelReader`** (regla V.2 b): `PermissionResolver` vive en `application` y no puede usar TypeORM.
- **DT-10 `Action` cerrado por defecto**: Editor y Viewer usan una lista de lo permitido; un valor nuevo queda negado
  hasta que su spec lo agregue.
- **DT-11 Privilegios por defecto con `DELETE`** (lo que dice ADR-0005) y revocación explícita donde no aplica
  (`usuario`, `token_cuenta` por PD-39; `migracion` sin permisos).
- **DT-12 Rutas web**: `/archivos` para Mis archivos y `/interno` para el área interna, en los grupos `(cliente)` e
  `(interno)`, anidados en el grupo exterior `(app)` de 002 (`cuenta/seguridad` queda en `(app)` para los cuatro
  roles). `homePathFor` es la única fuente, también para el destino tras iniciar sesión.
- **DT-13 La 401 no agrega `WWW-Authenticate`**: el contrato de error de 000 basta para la web (YAGNI).

### 10.3 Preguntas

Ninguna abierta bloquea.

- **P-1 — Resuelta (Adrián y `architect`, 2026-09-27; §11.2).** Passport se conserva (ADR-0017 c.2); la opción (a)
  queda descartada. Forma única, reconciliada con la revisión del plan 002: `JwtAuthGuard` de `shared` extiende
  `AuthGuard(ACCESS_TOKEN_STRATEGY)` y traduce en `handleRequest`; `JwtStrategy` de `identity` (`passReqToCallback:
  true`, `ignoreExpiration: true`) delega en `IAccessTokenVerifier`, único que decide el vencimiento; `AuthGuardsModule`
  estático activo desde PR-A; sin `I_REQUEST_AUTHENTICATOR`. Aplicada en §1, §3b, §5, §6.2, §6.6, §6.12, DT-1, §9 y
  §10.1.
- **P-2 (para Adrián, no bloquea; se decide en 014)** — ¿El Editor puede **ver** el historial de versiones? La tabla de
  §2 solo dice «generar versiones» para el Editor y «historial de versiones y accesos» para el Propietario. 003 no
  crea la acción; 014 la agrega a `Action` con la respuesta.
- **P-3 — Resuelta (`architect`, 2026-09-27; §11.3).** Las funciones `nimbo_actor_id()`/`nimbo_actor_role()` entran en
  003 (PR-B). Si PR-B se atrasa, se mueven tal cual a la primera migración de 005.

### 10.4 Documentos y pendientes que se actualizan con este plan (los hace quien corresponde)

- **`architect`** (**al integrar**, sobre la versión de estos documentos que trae la rama de 001; no se editan en esta
  rama):
  - `design-findings.md`: DF-55 (provisional, §11.4; §3) y DF-50 a `Aceptado` si aún no lo está;
  - `design-model.md` T1 y M3a (§3);
  - `architecture.md` §6: `withActor` como método de `ITransactionRunner`, funciones `nimbo_actor_*`,
    `DatabaseRoleCheck`, script de rol, y el punto 1 de §6 sobre el guard de Passport (`JwtAuthGuard extends
    AuthGuard(ACCESS_TOKEN_STRATEGY)`, estrategia en `identity` que delega en el puerto);
  - `pendientes.md`: cerrar PD-25, PD-26 y PD-39 al integrar PR-B; abrir PD-42, PD-43 y PD-44 (números
    **provisionales**, se renumeran al integrar en orden 001 → 002 → 003, §11.4):
    - **PD-42** — pedidos a 002: sesión web con `SessionResponse.user` (003 usa `fullName`); redirección con
      `homePathFor`; grupo `(app)` exterior con `(cliente)` e `(interno)` dentro; «Cerrar sesión» reutilizable;
      `JwtStrategy` e `I_ACCESS_TOKEN_VERIFIER` en `IdentityModule` según §6.2; `@Public()` en sus rutas públicas;
      `@CurrentSessionId()` para «esta sesión»; suite de contrato de 003 con su implementación, tokens reales en el
      mundo de aislamiento (lo que era PR-E) en su PR-2.
    - **PD-43** — staging: `DATABASE_MIGRATION_URL` fuera del `.env` de `api` y `worker`; el paso de despliegue ejecuta
      el script de rol antes de migrar. Resolver al montar staging.
    - **PD-44** — pedido al plan de 005: filas de 005 de §6.11 y *builder* `.withFiles(...)` del mundo de aislamiento.
  - **ADR-0017**: la aclaración de la redacción de c.2 (§11.2, sin nueva decisión; sigue `Aceptado`) se aplica en la
    rama de la 001, donde vive el archivo. Esta rama no crea ni edita ADR-0017.
- **developer**:
  - `.env.example`, `compose.yml`, `package.json` raíz (`db:app-role`);
  - `docs/operations/ambientes.md` (§6.10);
  - README de `shared` (guards, decoradores, `withActor`, regla «toda ruta se declara») y de `access`.
- **`ui-designer`**: `ui-review.md` de CA-17 a 360 y 1440 px.

## 11. Aprobación de arquitectura

> Sección escrita por el subagente `architect`.

- **Veredicto: Aprobado con cambios** (`architect`, 2026-09-27). El plan pasa a `Aprobado` cuando el autor aplique
  los cambios 1 a 9; ninguno reabre la spec ni pide un ADR nuevo. PR-C (dominio de `access`) y la parte de PR-B que no
  toca archivos de 001 (script de rol, lint `rls.js`, compose) pueden empezar ya; PR-A empieza con el cambio 1 aplicado.

### 11.1 Evaluación

| # | Punto | Resultado | Evidencia |
|---|---|---|---|
| 1 | Fronteras | ☑ | Guards, decoradores, `Actor`, `withActor` y `DatabaseRoleCheck` en `shared` (tabla §3 de `architecture.md`, DF-50); `PermissionResolver`, políticas y `accessibleNodes` en `access` (M3a, ADR-0010). `access` no importa `storage` ni `sharing`: lee por SQL desde 005. Nadie importa internos ajenos: `access` expone solo `index.ts` (§5) |
| 2 | DAG | ☑ | Sin aristas nuevas: `access → shared` e `identity → shared` ya permitidas. Con la forma de P-1 de §11.2, `shared` sigue sin conocer `identity` (solo el nombre de la estrategia, que declara `shared`) |
| 3 | Capas | ☑ | Dominio de `access` sin Nest ni TypeORM; `PermissionResolver` detrás de `IAccessLevelReader` (DT-9); `@nestjs/passport` solo en `shared/presentation`. No hay controladores de producto |
| 4 | YAGNI | ☑ con cambio 7 | Puertos justificados (§2, fila V). Sobra la opción `guards: false` de `createTestApp`: la salud ya es `@Public()` y ninguna prueba de 000 la necesita |
| 5 | DRY | ☑ | Una matriz de roles, un `createActor`, un escritor de `app.actor_*`, un script de rol para compose/Testcontainers/staging, `withActor` sobre la ALS de 001, roles y códigos en `contracts` |
| 6 | SOLID | ☑ | Guards de una responsabilidad; políticas Strategy cerradas por defecto (DT-10); `IAccessTokenVerifier` con un método |
| 7 | Seguridad estructural | ☑ con cambios 1 y 4 | Negación por defecto en dos capas, `Actor` solo del token (WeakMap), roles internos negados sin consultar, `requireActorScope` hace fallar la consulta sin actor. Hueco: `DatabaseRoleCheck` no ve la propiedad heredada por pertenencia a un rol (cambio 4) |
| 8 | Integridad | ☑ | `withActor` transaccional y reentrante solo con el mismo actor; `set_config(…, true)` con parámetros; migraciones con `down` exacto; script idempotente; PD-39 cumplido (`REVOKE DELETE` en `usuario` y `token_cuenta`) |
| 9 | Degradación | ☑ | La verificación del token es local (HS256), sin red ni BD |
| 10 | Recursos | ☑ | Sin procesos ni colas nuevas. La doble verificación HS256 de §11.2 cuesta microsegundos por petición |
| 11 | Datos | ☑ | Sin tablas ni columnas; índices de las políticas en 005/012 (ADR-0005); `nimbo_actor_id()` devuelve `uuid` |
| 12 | Diagramas y DF | ☑ | DF-01, DF-02, DF-32 y DF-50 resueltos o aceptados; DF-52 no bloquea 003 (se decide en el plan de 005). DF-55 se acepta con esta aprobación (ver §11.4 sobre su número). Redibujo en PD-02, PD-05, PD-08 |

Coherencia con el plan 001 (Aprobado): `withActor` extiende `ITransactionRunner`/`TransactionContext` de 001 T-14 sin
otra ALS (§6.3); `DATABASE_MIGRATION_URL` entra en `CONNECTION_URL_FIELDS` de `redacted-fields.ts`, que es la lista
correcta porque no pertenece a `SECRET_KEYS` ni a ningún esquema de `api`/`worker`; el apilado sobre 001 PR-1 (T-06 y
T-14) y la dependencia de 001 PR-3 (`@Public()`) y PR-4 (`api-client`, `error-catalog`) cuadran con la tabla §6.12 de
001; las marcas de tiempo `20260928110000/110100` son posteriores a las de 001 (`20260928100000/100100`).

### 11.2 Decisión sobre P-1 (forma concreta de ADR-0017 c.2)

Passport se conserva (ADR-0017 c.2, Adrián, 2026-09-27); la opción (a) de P-1 queda descartada. El guard HTTP global
**es** el de Passport, y la estrategia delega en el puerto:

1. **`shared`** declara `ACCESS_TOKEN_STRATEGY = 'jwt'` (`application/auth/access-token-strategy.ts`) junto a
   `IAccessTokenVerifier` (§5, sin cambios). `JwtAuthGuard` (`presentation/auth/jwt-auth.guard.ts`)
   **extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` de `@nestjs/passport`**:
   - `canActivate`: `@Public()` → `true` sin mirar la cabecera. Si no, el análisis estricto de la cabecera de §6.2
     (motivos `missing_token` y `malformed_authorization`) y luego `super.canActivate(ctx)`.
   - `handleRequest(err, user, info, ctx)`: si `user` es un `AccessTokenClaims` → `createActor` y
     `RequestPrincipal.set` (WeakMap, D-11, DT-5). Si no → motivo `expired_token` cuando `info?.name ===
     'TokenExpiredError'` y `invalid_token` en otro caso; bitácora `auth.unauthenticated` y `UnauthenticatedError`.
     `err` distinto de nulo (fallo propio) se relanza como 500.
   - Passport escribe `req.user`; nadie lo lee. `@CurrentActor()` y `@CurrentSessionId()` leen solo el WeakMap.
   - `shared` importa `@nestjs/passport` (un paquete, no un módulo de Nimbo) y **nunca** `identity`: su único
     acoplamiento con la estrategia es el nombre, que declara él mismo.
2. **`identity`** (plan de 002):
   - una constante única de opciones de verificación (clave, `algorithms: ['HS256']`, `issuer`, `audience`,
     vencimiento obligatorio), p. ej. `accessTokenVerifyOptions(env)`;
   - `JwtAccessTokenVerifier implements IAccessTokenVerifier` con `JwtService.verifyAsync(token, opciones)`; valida
     los *claims* (`sub` UUID, `role` ∈ `roleSchema`, `sid`) y devuelve `valid: false` en lugar de lanzar;
   - `JwtStrategy extends PassportStrategy(Strategy, ACCESS_TOKEN_STRATEGY)` (`passport-jwt`) con las **mismas**
     opciones, `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()` y `passReqToCallback: true`. `validate(req)`
     vuelve a extraer el token y **delega en el puerto**: devuelve `claims` si `valid`, y `false` si no. El puerto es
     el único que produce `AccessTokenClaims`; la segunda verificación HS256 es el precio aceptado de conservar
     Passport (microsegundos);
   - `IdentityModule` provee y exporta `{ provide: I_ACCESS_TOKEN_VERIFIER, useClass: JwtAccessTokenVerifier }` y
     provee `JwtStrategy`. La estrategia se registra en Passport al construirse el módulo.
3. **Composición**: `AppModule` importa `IdentityModule` (ya lo hace desde 001) y `AuthGuardsModule`, que pasa a ser un
   módulo estático sin `forRoot`, sin `imports` ni `verifier`: solo registra `APP_GUARD` → `JwtAuthGuard` y
   `APP_GUARD` → `RolesGuard`. Así «el `AuthGuard('jwt')` se enlaza en la raíz de composición» (ADR-0017) y «el guard
   verifica con el puerto de `shared`» (003 D-2, 002 D-14): lo que llega al guard lo produjo el puerto.
4. **Consecuencias para este plan**: los guards se activan en `AppModule` **desde PR-A** (hasta 002, una ruta no
   pública responde 500 «estrategia desconocida», que sigue siendo cerrado; en 001 no hay rutas no públicas). PR-E
   desaparece como PR: cambiar el mundo de aislamiento a tokens reales y correr la prueba de contrato con la
   implementación real entran en el PR de backend de 002.
5. **Pruebas en PR-A**: PR-A instala las cuatro dependencias que ADR-0017 c.2 ya acepta (`@nestjs/passport`,
   `passport`, `passport-jwt`, `@nestjs/jwt`, más `@types/passport-jwt`), con versión exacta; 002 no las reinstala.
   `test/support/` tiene `TestAccessTokens` (firma HS256 con una clave de prueba), `TestAccessTokenVerifier` (el
   verificador de prueba) y `TestJwtStrategy` (misma forma que la de 002). Así CA-2 (vencido, alterado, otra clave)
   se prueba ya en PR-A contra el comportamiento real de `passport-jwt`, y la prueba de contrato de ADR-0017 («mismo
   token, mismo resultado por HTTP y por el puerto») existe desde PR-A.
6. **Registro global de Passport**: `passport.use` es un registro por proceso y la última estrategia con el mismo
   nombre gana. Regla: una app de prueba registra **una sola** estrategia `ACCESS_TOKEN_STRATEGY`. `TestJwtStrategy`
   solo en módulos de sonda que no importan `IdentityModule`; desde 002, las apps que componen `AppModule` usan la
   real con la clave del entorno de pruebas.

**Qué debe hacer el plan de 002 para encajar** (reemplaza la parte de PD-42 sobre el «token de su verificador»):
(a) los puntos de 2 anteriores, importando `ACCESS_TOKEN_STRATEGY`, `I_ACCESS_TOKEN_VERIFIER`, `AccessTokenClaims` y
`AccessTokenVerification` de `shared`; (b) correr `access-token-verifier.contract.ts` con su verificador y la prueba
HTTP de CA-2 con su estrategia; (c) `@Public()` en inicio de sesión, renovación y recuperación, y `@Roles(...ALL_ROLES)`
en las rutas de sesión propia, usando `@CurrentSessionId()` para «esta sesión»; (d) ninguna operación `DELETE` sobre
`usuario` ni `token_cuenta` (PD-39: `nimbo_app` no tiene ese permiso); si su tabla de sesiones no debe admitir
`DELETE`, su migración lo revoca; (e) la sesión web expone `{ id, name, role }`, redirige con `homePathFor` y ofrece
«Cerrar sesión» reutilizable (PD-42); (f) sus variables `JWT_*` como secretos en `SECRET_KEYS` según la regla por
proceso de 001 §6.10.

**Aclaración de la redacción de ADR-0017 c.2** (misma decisión, sigue `Aceptado`). El archivo aún no existe en esta
rama (vive sin integrar en la de 001); al integrar, el `architect` reemplaza en «Decisión → c)» el segundo punto por:

> La estrategia no arma el `Actor` por su cuenta. `JwtStrategy` (`identity`, con el nombre `ACCESS_TOKEN_STRATEGY`
> que declara `shared`) verifica con `passport-jwt` usando la constante, y su `validate` delega en el puerto
> token→`Actor` (`IAccessTokenVerifier`), que también usa el handshake de `realtime` (015). El guard HTTP global es
> `JwtAuthGuard` de `shared`, que extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` de `@nestjs/passport`: `shared` conoce
> el nombre de la estrategia y el tipo que devuelve el puerto, nunca importa `identity`, y la estrategia está
> disponible porque la raíz de composición (`AppModule`) carga `IdentityModule`.

y «Se instala con la 002» por «Se instala con el primer PR que la usa (003 PR-A)».

### 11.3 Decisión sobre P-3

**Las funciones `nimbo_actor_id()`/`nimbo_actor_role()` entran en 003 (PR-B).** Son la otra mitad del contrato de
`withActor`: `shared` escribe `app.actor_*` y la base define una sola vez cómo se leen («sin fijar = `NULL` = sin
filas»). CA-12 ya las ejerce (después de `withActor`, `nimbo_actor_id()` es `NULL`), así que tienen consumidor en esta
spec, y dejarlas para 005 obligaría a su dueño a reabrir un contrato ajeno. Si PR-B se atrasa, son lo primero que se
mueve tal cual a la primera migración de 005.

### 11.4 Numeración provisional

DF-55, PD-42, PD-43 y PD-44 son **provisionales**: el plan de 002 se escribe en paralelo y puede usar los mismos
números. El `architect` los renumera al integrar, en orden de integración (001 → 002 → 003), y actualiza las
referencias de este plan en el mismo cambio. No se editan `design-findings.md` ni `pendientes.md` en esta rama.

### 11.5 Cambios requeridos

1. **P-1**: reescribir §1, §3b (fila de composición), §5 (contratos TypeScript: agregar `ACCESS_TOKEN_STRATEGY`),
   §6.2 (`JwtAuthGuard` y `AuthGuardsModule`), §6.6, §6.12, DT-1, la fila de riesgo de ADR-0017 en §9, §10.1 y P-1
   (resuelta) según §11.2. `AuthGuardsModule` sin `forRoot`; guards activos en `AppModule` desde PR-A.
2. **Corte en PR**: eliminar PR-E como PR propio (su contenido pasa al backend de 002, §11.2 punto 4) y actualizar el
   diagrama de dependencias de §6.12 y PD-42.
3. **Dependencias**: §3b debe decir que PR-A instala `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` y
   `@types/passport-jwt` (aceptados en ADR-0017 c.2), no 002. Avisar a 001 PR-1 del posible conflicto en
   `pnpm-lock.yaml` (lo resuelve quien integre segundo, con `pnpm install`).
4. **`DatabaseRoleCheck` (§6.4)**: `owns_tables` debe usar `pg_has_role(r.oid, c.relowner, 'USAGE')` en lugar de
   `c.relowner = r.oid`, para rechazar también a un rol que hereda la propiedad por pertenencia (p. ej. si alguien
   hace `GRANT nimbo TO nimbo_app`). CA-13 agrega ese caso a `database-roles.iso-spec.ts`.
5. **Prueba de Passport y D-11 (§8, CA-4)**: agregar a `roles-and-actor.iso-spec.ts` o a `auth-guards.int-spec.ts` que
   un middleware de prueba que escribe `req.user` con otro `id`/rol no cambia el `Actor` recibido por
   `@CurrentActor()`, y a `jwt-auth.guard.spec.ts` el mapeo de `info` (`TokenExpiredError` → `expired_token`; otro →
   `invalid_token`; `validate` que devuelve `false` → `invalid_token`).
6. **Registro único de la estrategia** (§6.6): documentar la regla de §11.2 punto 6 en `createTestApp` y hacer que
   falle si se le pide la estrategia de prueba junto con `IdentityModule` desde 002.
7. **YAGNI**: quitar la opción `guards: false` de `createTestApp` (§6.6); si una prueba concreta la necesita, que la
   nombre.
8. **Numeración**: marcar DF-55, PD-42, PD-43 y PD-44 como «provisional» en §3, §6.8, §6.9, §6.11 y §10.4, con
   remisión a §11.4.
9. **§10.4**: quitar «Si se elige P-1 (a), enmendar ADR-0017» y poner la aclaración de §11.2; indicar que las
   actualizaciones del `architect` (DF-55 y la T1/M3a de `design-model.md`, `architecture.md` §6 con `withActor` como
   método de `ITransactionRunner`, `nimbo_actor_*`, `DatabaseRoleCheck`, el script de rol, y el punto 1 de §6
   sobre el guard de Passport) se hacen **al integrar**, sobre la versión de estos documentos que trae la rama de 001.

### 11.6 Viabilidad del reparto (hoy 27/09, entrega 30/09)

Viable con cinco PR y este orden; el camino crítico no es 003 sino 001 PR-1 y el backend de 002:

| Día | 003 | Condición |
|---|---|---|
| 27/09 | PR-A (guards con Passport, sondas, CA-1, CA-2, CA-4 a CA-6, CA-16). En paralelo: script de rol, `rls.js`, compose y dominio de `access` (CA-8) | Ninguna |
| 28/09 | PR-B (en cuanto 001 PR-1 esté en `main`) y PR-C | 001 PR-1 |
| 29/09 | PR-D (mundo de aislamiento, CA-3, CA-7, CA-11) | 001 PR-3 para recorrer rutas reales |
| 29–30/09 | PR-F | 001 PR-4 y la web de 002 |

Si el 30/09 falta la web de 002, PR-F entrega `homePathFor`, `ForbiddenState`, `NotFoundState`, `not-found.tsx` y el
área interna con una sesión falsa en las pruebas, y la redirección real se conecta en el PR web de 002. El volumen de
Postgres ya inicializado de cada integrante es el riesgo operativo más seguro: el PR-B debe anunciar `pnpm db:app-role`
en su descripción.

**Cambios aplicados (2026-09-27)** (`planner`): 1 a 9 de §11.5, con la forma única del puerto y del guard que
reconcilia esta revisión con la del plan 002 (§11.2 de 002). Precisiones de esa forma sobre el texto de §11.2:
`ACCESS_TOKEN_STRATEGY` vive en el mismo archivo del puerto (`i-access-token-verifier.port.ts`); `JwtStrategy` usa
`ignoreExpiration: true` y el vencimiento lo decide solo el puerto con `IClock`; `validate` devuelve `[false, { reason
}]` en lugar de `false`, y `handleRequest` mapea `TokenExpiredError` o `reason: 'expired'` → `expired_token` y todo lo
demás (incluidos `err` y la estrategia no registrada) → `invalid_token`, de modo que sin estrategia `'jwt'` una ruta no
pública responde **401** (no 500). Secciones tocadas: encabezado, §1, §2, §3, §3b, §5, §6.2, §6.4, §6.6, §6.7, §6.8,
§6.9, §6.11, §6.12, §7b, §8, §9, §10.1, DT-1, DT-5, DT-6, DT-12, §10.3 (P-1 y P-3 resueltas) y §10.4.
