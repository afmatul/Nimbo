# `shared` — módulo transversal T1

- **Dueño**: Adrián (`specs/README.md`).
- **Diagrama de origen**: bloque T1 de `docs/sdd/design-model.md` §3 (salud movida desde M8, DF-49; `RolesGuard`
  movido desde M8, DF-50).
- **Specs que lo construyen**: 000 (fundaciones) y 003 (guards globales). Después de 000 solo entra lo que usan
  ≥ 3 módulos o lo que el proceso necesita antes de que exista un módulo (plan 000 R-11).

## Contenido (al cerrar la spec 000)

`Actor`, `Role`, `IClock` (`SystemClock`, `FixedClock`), `DomainError` y subclases, `DomainExceptionFilter`,
logger Pino con `REDACTED_FIELDS`/`redactDeep`, `CorrelationContext` + middlewares, `loadEnv` (zod),
`buildDataSourceOptions`, `HealthModule` (`HealthService`, `IHealthIndicator`, indicadores Postgres/Redis/MinIO),
cola `ping` (`enqueueWithCorrelation`, `PingProcessor`).

## Con la spec 001 (PD-30, plan 001 §6.7, DF-54)

| Pieza                                                               | Dónde                                                     | Para qué                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IRateLimiter` → `RedisRateLimiter` (`I_RATE_LIMITER`)              | `application/rate-limit/`, `infrastructure/rate-limit/`   | Ventana deslizante con un script Lua atómico; `now` sale de `IClock`. Si Redis falla, lanza (falla cerrado). Lo usan `identity` (límite por correo, 001 D-15) y, desde la 012, `sharing`; vive aquí porque `identity` no puede depender de `sharing` (ADR-0010)                                                                                             |
| `REDIS_CLIENT`                                                      | `infrastructure/redis/`                                   | Cliente ioredis compartido, con oyente de `error` (nunca imprime la URL); se cierra al apagar                                                                                                                                                                                                                                                               |
| `TooManyRequestsError`                                              | `domain/errors/`                                          | `429` con `retryAfterSeconds`; el filtro agrega `Retry-After`                                                                                                                                                                                                                                                                                               |
| `FieldIssue`, `DomainError.fields`                                  | `domain/errors/`                                          | Errores de entrada por campo, estructuralmente iguales a `ErrorResponse.fields` (el dominio no importa `contracts`)                                                                                                                                                                                                                                         |
| `DomainExceptionFilter`                                             | `presentation/`                                           | Sigue siendo el único traductor a HTTP: agrega `fields` y `Retry-After`                                                                                                                                                                                                                                                                                     |
| `ZodValidationPipe`                                                 | `presentation/`                                           | Ver la regla de abajo                                                                                                                                                                                                                                                                                                                                       |
| `ITransactionRunner` (`I_TRANSACTION_RUNNER`), `TransactionContext` | `application/persistence/`, `infrastructure/persistence/` | `run(work)` abre la transacción y publica el `EntityManager` en `AsyncLocalStorage`; los repositorios lo leen con `TransactionContext.manager()`                                                                                                                                                                                                            |
| `configureHttpApp(app, env)`                                        | `presentation/`                                           | La comparten `main.ts` y el arnés de integración: correlación, versión, `trust proxy = 1`, CORS (`CORS_ORIGIN`, `GET`/`POST`, expone `x-correlation-id` y `retry-after`), **solo** JSON de hasta 16 KB (la app se crea con `bodyParser: false`), prefijo `api/v1` y filtro. Los errores del analizador conservan su estado (`413`, `400 VALIDATION_FAILED`) |
| `I_CLOCK` → `SystemClock`                                           | `shared.module.ts`                                        | `SharedModule` es `@Global()`; las pruebas lo sustituyen con `FixedClock` (opción `overrides` del arnés)                                                                                                                                                                                                                                                    |
| `REDACTED_FIELDS`                                                   | `infrastructure/logging/`                                 | + `email`, `correo`, `fullName`, `to`, `html`, `text`                                                                                                                                                                                                                                                                                                       |
| `enqueueWithCorrelation(queue, name, data, opts?)`                  | `infrastructure/queue/`                                   | Acepta `JobsOptions` (p. ej. `jobId`)                                                                                                                                                                                                                                                                                                                       |

### Regla de `ZodValidationPipe` (ADR-0020)

`new ZodValidationPipe(schema, factory)`: valida el cuerpo con el esquema de `@nimbo/contracts`, convierte los
_issues_ con la `toFieldIssues` genérica de la raíz de `contracts` y lanza el error que devuelve la **fábrica del
módulo** (`(issues: FieldIssue[]) => DomainError`), para que el `code` lleve el prefijo del módulo
(`IDENTITY_INVALID_INPUT`). `shared` no importa nada de `contracts/identity` ni de ningún módulo: el esquema y la
fábrica llegan por parámetro. Un cuerpo `text/plain` o de formulario llega vacío y produce los `REQUIRED`.

### `TransactionContext`, base de `withActor` (003, ADR-0005)

`withActor()` de la 003 se construye **encima** de `TransactionContext` con `runWith(scope, work)`: misma
`AsyncLocalStorage` más `set_config` del actor dentro de la transacción. No se crea una segunda ALS ni otro
ejecutor de transacciones. Detalle en «Persistencia con actor», más abajo.

### Regla de bitácoras de correo

Nunca se registra `job.data` ni un `MailMessage` completo. Las bitácoras de correo solo llevan `tag`, `recipientId`,
`jobId`, `attemptsMade` y códigos de error; `to`, `html` y `text` están además en `REDACTED_FIELDS` como defensa en
profundidad (el destinatario es un correo y el cuerpo lleva el enlace de verificación).

## Con la spec 003 (DF-50, 003 D-2, ADR-0017 c.2)

Los guards globales viven aquí, no en `backoffice`, y `shared` sigue sin importar módulos.

- **Guards globales** (`AuthGuardsModule`, estático; lo importa `AppModule`, no el `worker`): primero
  `JwtAuthGuard` y luego `RolesGuard`.
  - `JwtAuthGuard` extiende `AuthGuard(ACCESS_TOKEN_STRATEGY)` de `@nestjs/passport`. `@Public()` pasa sin mirar la
    cabecera; si no, exige **una** cabecera `Authorization: Bearer <token>` bien formada y llama a Passport.
    `handleRequest` es el único punto que traduce el resultado: _claims_ → `Actor` (`createActor`); `expired_token` o
    `invalid_token` → 401 `SHARED_UNAUTHENTICATED`, nunca 500. Sin estrategia registrada, toda ruta no pública → 401.
  - `RolesGuard`: ruta sin `@Roles(...)` → 403 (`undeclared_route`, DT-2); rol no listado → 403 `SHARED_FORBIDDEN`.
  - Bitácoras `auth.unauthenticated` (`info`) y `auth.forbidden` (`warn`) con la ruta como **patrón**, el motivo y, en
    403, el actor; nunca el token ni la cabecera (CA-16).
- **Toda ruta se declara con `@Public()` o `@Roles(...)`** (en clase o método; el de método manda). Las rutas de
  «gestionar la propia sesión» usan `@Roles(...ALL_ROLES)`. La lista de rutas públicas es cerrada (003 CA-3).
- **Decoradores de parámetro**: `@CurrentActor()` y `@CurrentSessionId()` leen solo `RequestPrincipal` (un `WeakMap`
  que escribe `JwtAuthGuard`). Passport escribe `req.user`; **nadie lo lee** (D-11).
- **Puerto token → _claims_**: `IAccessTokenVerifier` + `I_ACCESS_TOKEN_VERIFIER` y el nombre de la estrategia
  `ACCESS_TOKEN_STRATEGY` (`application/auth/i-access-token-verifier.port.ts`). Lo implementa `identity` (002 D-14) y
  su `JwtStrategy` (`passport-jwt`, `ignoreExpiration: true`) delega en él; el vencimiento lo decide solo el puerto con
  `IClock`. La suite de contrato única está en `test/support/access-token-verifier.contract.ts` (tramos puerto y HTTP).
- **Una sola estrategia por app de prueba**: `passport.use` es un registro por proceso y la última estrategia con el
  mismo nombre gana. `createTestApp` monta siempre los guards y, con `accessTokenStrategy: 'test'` (por defecto), las
  sondas con `TestJwtStrategy`; lanza si el árbol trae otra `ACCESS_TOKEN_STRATEGY` (usa `'identity'` desde 002).
- Pendiente en 003 (PR-B): `withActor()` (ADR-0005).

### Persistencia con actor (003 PR-B; plan §4, §6.3, §6.4; ADR-0005)

| Pieza                                         | Dónde                                                                                  | Para qué                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ITransactionRunner.withActor(actor, work)`   | `application/persistence/`, `infrastructure/persistence/typeorm-transaction-runner.ts` | Abre una transacción y fija `app.actor_id` y `app.actor_role` **locales a ella** (`set_config(…, true)`, con parámetros enlazados), que leen las políticas RLS desde 005 con `nimbo_actor_id()` y `nimbo_actor_role()`. Antes de abrirla valida el actor (`id` UUID, `role` de `Role`; si no, `InvalidActorError`)                                |
| `TransactionContext.requireActorScope(actor)` | `infrastructure/persistence/transaction-context.ts`                                    | Devuelve el `EntityManager` solo si la transacción vigente es de ese actor. Sin actor lanza `ActorScopeMissingError`; con otro, `ActorScopeConflictError`. Los repositorios de datos de cliente (`findAccessible`, desde 005) y `SqlAccessLevelReader` obtienen su `EntityManager` **solo** de aquí: consultar sin actor da un error, nunca filas |
| `DatabaseRoleCheck`                           | `infrastructure/persistence/database-role.check.ts`                                    | En `onApplicationBootstrap` de `api` y `worker`: si la conexión es superusuario, tiene `BYPASSRLS` o es dueña de alguna tabla de `public` (también por pertenencia, `pg_has_role(…, 'USAGE')`), registra `db.role_rejected` (`fatal`, tres booleanos, sin URL) y el arranque falla                                                                |
| `migrationEnvSchema`                          | `infrastructure/config/env.schema.ts`                                                  | `DATABASE_MIGRATION_URL` (dueño de las tablas) solo para `data-source.cli.ts` y `migrate.ts`; no se une a `apiEnvSchema` ni a `workerEnvSchema`                                                                                                                                                                                                   |

Los errores del ámbito de actor (`actor-scope.errors.ts`) son `Error` simples, no `DomainError`: son errores de
programación y el filtro los responde como 500 genérico. Sus mensajes no incluyen el `id` ni el rol.

**Regla de reentrada**:

- `withActor` sin transacción vigente abre una y fija el actor.
- `withActor` dentro de otro `withActor` con el **mismo** actor se une a la transacción (sin otra transacción ni otro
  `set_config`). Con **otro** actor, o dentro de un `run` sin actor, lanza `ActorScopeConflictError`: nunca mezcla
  actores ni fija el actor a mitad de una transacción ajena.
- `run` dentro de `withActor` se une a esa transacción y conserva el actor.
- `run` fuera de `withActor` no cambia respecto de 001: abre su propia transacción sin actor, para tablas sin datos de
  cliente (`usuario`, `token_cuenta`).
- La transacción abarca el caso de uso, no la petición: no hay interceptor por petición.

**Lint `rls.js` (PD-26)**: `set_config(`, `SET LOCAL app.actor_id` y `SET app.` en literales o plantillas son error
fuera de `typeorm-transaction-runner.ts`, con un mensaje que remite a `withActor`. Las únicas excepciones, con
`eslint-disable-next-line` y su motivo, son dos pruebas que nombran ese SQL (`typeorm-transaction-runner.spec.ts` y
`migrations-nimbo-app.int-spec.ts`).

**Permisos en las migraciones siguientes** (plan §4 (b)): las migraciones corren como el dueño, así que toda tabla
nueva de `public` recibe `SELECT/INSERT/UPDATE/DELETE` para `nimbo_app` por privilegios por defecto. Si una tabla no
debe admitir `DELETE` (o menos), **su propia migración** lo revoca (`REVOKE DELETE ON TABLE … FROM nimbo_app`), y
`database-roles.iso-spec.ts` agrega la fila a la matriz de permisos. Las tablas con datos de cliente activan RLS en su
migración (`ENABLE` + `FORCE ROW LEVEL SECURITY`, `USING (… = nimbo_actor_id())`, desde 005).

## Capas

```
shared/
├─ domain/          # sin Nest, TypeORM ni zod
├─ application/     # HealthService, puertos (IHealthIndicator, IRateLimiter, ITransactionRunner, IAccessTokenVerifier)
├─ infrastructure/  # config, logging, correlation, persistence, queue, health, clock, redis, rate-limit
├─ presentation/    # HealthController, DomainExceptionFilter, VersionHeaderMiddleware, ZodValidationPipe, configureHttpApp, auth/ (guards y decoradores)
├─ shared.module.ts  health.module.ts
└─ index.ts         # única API pública
```

## Regla

Otros módulos y `apps/worker` importan **solo** desde `shared/index.ts` (Art. VIII.3; lint de fronteras, CA-5).
`shared` no importa de ningún módulo.
