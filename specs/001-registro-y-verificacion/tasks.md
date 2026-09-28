# Tareas 001 — Registro de cuenta de cliente y verificación de correo

> Spec: `./spec.md` (Aclarada) · Plan: `./plan.md` (Aprobado, §11; ADR-0017 a 0020 `Aceptado`; P-1, P-2, P-5 y P-7 resueltos)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque (no comparten archivos) · `[P×PR]` puede empezar
> antes de que se integre el PR anterior (ver «Paralelismo entre PR») · Cada tarea ≈ 1–2 h y un commit.
> Dueño: Adrián. Commits con Conventional Commits y sufijo `[001 T-xx]`.
>
> - **Cuatro PR parciales** (plan §6.12, `workflow.md` §4.8), cada uno con su bloque completo y con `pnpm lint`,
>   `pnpm typecheck`, `pnpm test` y `pnpm test:int` en verde en local (el CI llega el 30/09, `workflow.md` §7.2).
>   Ramas apiladas: `feat/001-registro-shared` (PR-1) → `feat/001-registro-notifications` (PR-2) →
>   `feat/001-registro-backend` (PR-3) → `feat/001-registro-web` (PR-4).
> - **Pruebas primero**: toda tarea de código escribe su prueba antes (rojo → verde → refactor) en la misma tarea.
>   Nombres de prueba `'CA-n: …'` (Art. II).
> - **Sin E2E con Playwright** (P-5 → PD-41, Fase 2): CA-22 y CA-23 se cubren con pruebas de componentes con jest-axe y la
>   revisión del `ui-designer` a 360 y 1440 px.
> - **Dependencias nuevas** (todas con ADR `Aceptado`): `argon2`, `@nestjs/throttler` (ADR-0017), `nodemailer` +
>   `@types/nodemailer` (ADR-0018), `@nestjs/event-emitter` (ADR-0019); en `web`: `react-hook-form`,
>   `@hookform/resolvers`, `@testing-library/react`, `@testing-library/user-event` (plan §10.1). Versiones fijas.
> - **Fuera de estas tareas**: CA-16, CA-26 y la parte de sesión de CA-29 (se prueban en 002); la segunda parte de CA-8
>   (suscripción Personal, en 006a); CA-20 (manual al montar staging, Fase 2). `verification.md`, `security.md`,
>   `ui-review.md` y `review.md` se producen una sola vez, con el PR-4.

## Paralelismo entre PR (objetivo: 001, 002 y 003 hoy)

```
PR-1 contratos ─ T-01…T-05 ─┬─ T-06 migraciones ─┐
     shared    ─ T-07…T-18 ─┴────────────────────┴─ T-19 cierre ──► merge PR-1
PR-2           T-20 [P×PR] ─ T-21…T-26 (tras T-10, T-11) ─ T-27 cierre ──► merge PR-2
PR-3           T-28…T-31 [P×PR] (dominio puro, desde ya) ─ T-32…T-53 (tras PR-1/PR-2) ─ T-54 ──► merge PR-3 ⇒ desbloquea 002
PR-4           T-56, T-58 [P×PR] (desde ya) · T-57, T-59 (tras T-02) · T-61, T-62 (tras T-05) · T-60…T-66 ─ T-68
```

| Se puede empezar ya, sin esperar el merge del PR anterior | Requiere de otro PR | Por qué |
|---|---|---|
| PR-3: **T-28, T-29, T-30** (dominio de `identity`) | nada (solo `node:crypto`) | El dominio no importa `contracts` ni infraestructura (ADR-0008 regla 3) |
| PR-3: **T-31** (errores y evento) | T-07 | Hereda de `InvalidInputError` y de `TooManyRequestsError` |
| PR-2: **T-20** (puerto `IMailer` y opciones de la cola) | nada | Tipos y una función pura |
| PR-2: T-21 a T-26 | T-09, T-10, T-11 | Redacción de `to`/`html`/`text`, esquema SMTP y `jobId` en `enqueueWithCorrelation` |
| PR-4: **T-56** (primitivas de UI) y **T-58** (`PublicHeader`, marcador de inicio de sesión) | nada | No usan contratos nuevos |
| PR-4: **T-57** y **T-59** | T-01, T-02 | Catálogo de errores y `LEGAL_DOCUMENTS` |
| PR-4: **T-60** a **T-66** | T-04, T-05 (contratos) | El formulario usa el mismo esquema que el `api`. Solo la prueba manual T-67 necesita el PR-3 corriendo |

- Con dos personas: una sigue la ruta crítica PR-1 → PR-2 → PR-3 (backend); la otra hace el dominio de PR-3 (T-28 a
  T-31) y, en cuanto existan T-01 a T-05, la interfaz del PR-4.
- **Lo que desbloquea a 002** (en orden): T-04 (`evaluatePassword`), T-13 (`IRateLimiter`), T-14 (`ITransactionRunner`),
  T-39/T-40 (repositorios), T-41 (`IPasswordHasher`), T-34 (`VerificationLinkIssuer`, 002 D-15), T-44 (patrón de
  guard por IP), T-45 (`AuthController`), T-58 (`PublicHeader`, y 002 reemplaza el marcador de `iniciar-sesion`).
- **Lo que desbloquea a 003**: T-14 (`TransactionContext`, base de `withActor`), T-16 (`SharedModule` global) y T-45
  (las tres rutas que 003 marca `@Public()`).

## Bloque 1 — PR-1 «contratos, migraciones y shared» (plan §6.12; ADR-0020)

- [x] **T-01** [P] Contratos raíz: `fields` en `ErrorResponse` y `toFieldIssues` genérica — CA: CA-5, CA-6 (forma del error) — Depende: — — ~1,5 h
  Prueba primero: `packages/contracts/src/error.spec.ts` (un error sin `fields` sigue idéntico al de 000 CA-16; con
  `fields: [{ field, reason, message }]` es válido; `reason` exige `SCREAMING_SNAKE`; el objeto sigue `.strict()`) y
  `validation.spec.ts` (un `ZodError` con `params.reason` produce ese `reason`; sin él, `REQUIRED` para ausente e
  `INVALID` para el resto; `field` es la ruta unida con `.`; un *issue* `unrecognized_keys` produce un elemento por
  clave con `UNKNOWN_FIELD`). Luego `error.ts` y `validation.ts`; `index.ts` los exporta. Sin nada de `identity` en la raíz.
  Archivos: `packages/contracts/src/{error,validation,index}.ts`, `packages/contracts/src/{error,validation}.spec.ts`.

- [x] **T-02** [P] `contracts/identity`: parámetros, documentos legales y códigos de error — CA: CA-1 (versión), CA-15 (mensaje), CA-23 — Depende: — — ~1 h
  Prueba primero `packages/contracts/src/identity/constants.spec.ts`: los valores de §6 de la spec
  (`VERIFICATION_LINK_TTL_HOURS = 24`, `EMAIL_REQUEST_COOLDOWN_SECONDS = 60`, `EMAIL_REQUESTS_PER_HOUR = 5`,
  `REGISTRATIONS_PER_IP_PER_HOUR = 10`, `MAX_AVISOS_INTENTO_24H = 1`, `FULL_NAME_MAX_LENGTH = 100`,
  `PASSWORD_MIN_LENGTH = 12`, `PASSWORD_MAX_LENGTH = 128`); `LEGAL_DOCUMENTS` con versión `1.0` y vigencia
  `2026-09-30` para ambos; `IDENTITY_ERROR_CODES` con los cinco códigos de plan §5; `FIELD_ISSUE_REASONS` con los doce
  `reason`; `IDENTITY_FIELD_MESSAGES` con los textos exactos de spec §11 (correo inválido, casilla sin marcar,
  contraseña común, igual al correo, requisitos). Luego los archivos.
  Archivos: `packages/contracts/src/identity/{parameters,legal,error-codes}.ts`, `packages/contracts/src/identity/constants.spec.ts`.

- [x] **T-03** Lista local de contraseñas comunes — CA: CA-5 (regla «común») — Depende: T-02 — ~2 h
  Prueba primero `packages/contracts/src/identity/common-passwords.spec.ts`: el archivo pesa < 50 KB; toda entrada está
  en minúsculas, tiene de 12 a 128 puntos de código, un número y un símbolo; sin duplicados; contiene al menos una
  entrada conocida del top de SecLists que cumple el filtro (el developer la elige al generar y la fija en la prueba).
  Luego `packages/contracts/scripts/build-common-passwords.mjs` (descarga o lee el top 1 000 000 de SecLists, filtra según
  plan §6.2, escribe `common-passwords.ts` con encabezado de licencia MIT y atribución) y el archivo generado.
  Archivos: `packages/contracts/scripts/build-common-passwords.mjs`, `packages/contracts/src/identity/common-passwords.ts`, `packages/contracts/src/identity/common-passwords.spec.ts`, `packages/contracts/package.json` (script `build:common-passwords`).

- [x] **T-04** `evaluatePassword` (política D-6) — CA: CA-5, CA-22 (reglas en vivo) — Depende: T-02, T-03 — ~1,5 h
  Prueba primero `packages/contracts/src/identity/password-policy.spec.ts`: una prueba por regla (11 y 129 puntos de
  código, sin mayúscula, sin número, sin símbolo, común sin distinguir mayúsculas —«Password123!»-tipo—, igual al
  correo normalizado, igual a su parte local); `Nimbo-Seguro-2026` y `Ñandú-Azul-2026` pasan; un espacio como único
  carácter especial falla por símbolo; cuenta puntos de código (emoji = 1). Devuelve `PasswordRuleResult[]` con la
  regla, si cumple y su `reason`. Función pura, sin zod.
  Archivos: `packages/contracts/src/identity/password-policy.ts`, `packages/contracts/src/identity/password-policy.spec.ts`.

- [x] **T-05** Esquemas de `identity` — CA: CA-5, CA-6, CA-7, CA-11 (b), CA-22 — Depende: T-01, T-04 — ~2 h
  Prueba primero `packages/contracts/src/identity/schemas.spec.ts`: `registerRequestSchema` estricto (nombre vacío,
  solo espacios o de 101 → `REQUIRED`/`TOO_LONG`; correo mal formado → `INVALID_EMAIL`; `acceptTerms` falso o ausente
  → `TERMS_NOT_ACCEPTED` con el mensaje de spec §11; cada regla de contraseña como un *issue* propio con su `reason`;
  `rol`, `role`, `correoVerificado`, `estado`, `version`, `plan`, `planId` → `UNKNOWN_FIELD`; varios errores a la vez →
  todos); `toFieldIssues` sobre el resultado da los mensajes de `IDENTITY_FIELD_MESSAGES`;
  `resendVerificationRequestSchema` (`{ email }` estricto); `verifyEmailRequestSchema` (`{ token: string }` estricto,
  **sin** reglas de formato: vacío o mal formado lo rechaza el servicio con `LINK_INVALID`, CA-11 b);
  `acceptedResponseSchema` y `verifyEmailResponseSchema` (`verified` | `already-verified`). Luego `schemas.ts`,
  `identity/index.ts` y la reexportación en `src/index.ts`.
  Archivos: `packages/contracts/src/identity/{schemas,index}.ts`, `packages/contracts/src/identity/schemas.spec.ts`, `packages/contracts/src/index.ts`.

- [x] **T-06** [P] Migraciones `usuario` y `token_cuenta` + migraciones en el arnés — CA: CA-1, CA-3, CA-17, RN-4 — Depende: — — ~2 h
  Hoy el arnés de integración **no** ejecuta migraciones: agregar primero `apps/api/test/int/setup/migrate.ts`
  (ejecuta las migraciones sobre el Postgres de Testcontainers en `global-setup.ts`, que usan también `int` e
  `isolation`). Prueba primero `apps/api/test/int/identity/schema.int-spec.ts`: rechaza un `rol` fuera de los cuatro,
  un `estado` inválido, un correo sin normalizar, un nombre vacío, un `CLIENT` sin aceptación, un `token_hash` que no es
  hex de 64, `expira_en <= creado_en`, `usado_en` e `invalidado_en` a la vez, un segundo token vigente del mismo
  `(usuario_id, tipo)`, un segundo `usuario` con el mismo correo; la cascada borra los tokens. Luego
  `20260928100000-crear-usuario.ts` y `20260928100100-crear-token-cuenta.ts` con el SQL de plan §4 y `down` con
  `DROP TABLE`. Verificar a mano `pnpm --filter api migration:run`, `migration:revert` (dos veces) y `run` contra el
  compose local (evidencia en «Notas del developer»).
  Archivos: `apps/api/src/migrations/20260928100000-crear-usuario.ts`, `apps/api/src/migrations/20260928100100-crear-token-cuenta.ts`, `apps/api/test/int/setup/{migrate,global-setup}.ts`, `apps/api/test/int/identity/schema.int-spec.ts`.

- [x] **T-07** [P] `shared/domain`: `FieldIssue`, `DomainError.fields`, `TooManyRequestsError` — CA: CA-5, CA-6, CA-15 — Depende: — — ~1 h
  Prueba primero en `apps/api/src/shared/domain/errors/domain-error.spec.ts`: `fields` es opcional y de solo lectura;
  `TooManyRequestsError` expone `status = 429`, `retryAfterSeconds` y es `instanceof DomainError`. Luego
  `field-issue.ts`, `too-many-requests.error.ts`, cambio en `domain-error.ts` y `errors/index.ts`.
  Archivos: `apps/api/src/shared/domain/errors/{field-issue,too-many-requests.error,domain-error,index}.ts`, `apps/api/src/shared/domain/errors/domain-error.spec.ts`.

- [x] **T-08** `DomainExceptionFilter` con `fields` y `Retry-After` — CA: CA-5, CA-6, CA-15 — Depende: T-07 — ~1,5 h
  Prueba primero: ampliar `apps/api/test/int/shared/domain-exception-filter.int-spec.ts` (un `InvalidInputError` con
  `fields` → `422` con `fields` en el cuerpo; sin `fields` → cuerpo idéntico al de 000; `TooManyRequestsError(90)` →
  `429` con `Retry-After: 90`; el cuerpo sigue validando con `errorResponseSchema`). Luego el filtro (sigue siendo el
  único traductor).
  Archivos: `apps/api/src/shared/presentation/domain-exception.filter.ts`, `apps/api/test/int/shared/domain-exception-filter.int-spec.ts`.

- [x] **T-09** [P] `REDACTED_FIELDS` con los campos de 001 — CA: CA-18 — Depende: — — ~1 h
  Prueba primero `apps/api/src/shared/infrastructure/logging/redacted-fields.spec.ts` (nuevo): `email`, `correo`,
  `fullName`, `to`, `html` y `text` salen `[REDACTED]` en cualquier nivel y sin distinguir mayúsculas; `nombre` sigue;
  `SMTP_PASSWORD` sale redactada vía `SECRET_KEYS` (se activa con T-10). Luego `redacted-fields.ts`. Documentar en el
  archivo la regla «nunca se registra `job.data` ni un `MailMessage` completo».
  Archivos: `apps/api/src/shared/infrastructure/logging/redacted-fields.ts`, `apps/api/src/shared/infrastructure/logging/redacted-fields.spec.ts`.

- [x] **T-10** Variables de entorno de 001 y secretos por proceso — CA: CA-20 (esquema), CA-18 — Depende: T-09 — ~2 h
  Prueba primero: nuevo `apps/api/src/shared/infrastructure/config/env.schema.spec.ts` (cada clave de `SECRET_KEYS`
  está en `apiEnvSchema` **o** en `workerEnvSchema`, y falla si se agrega un secreto a ninguno; `SMTP_PASSWORD` solo en
  `workerEnvSchema`) y casos nuevos en `load-env.spec.ts` (`WEB_PUBLIC_URL` y `CORS_ORIGIN` en `api`; `WEB_PUBLIC_URL`
  `http://` con `APP_ENV=staging` falla; `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`
  en `worker`; `SMTP_TLS=none` en staging falla; `SMTP_PASSWORD` sin `SMTP_USER` falla; la aserción actual
  `SECRET_KEYS = ['MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY']` se actualiza) y `scripts/check-env-example.spec.ts` (caso
  `NEXT_PUBLIC_SMTP_PASSWORD`). Luego `secret-keys.ts` (+ `SMTP_PASSWORD`), `env.schema.ts` (quita el `satisfies
  Record<SecretKey, …>` del `api` y agrega la comprobación sobre la unión de claves) y **`.env.example`** con las
  variables de `api` y `worker` de plan §6.10 (valores de Mailpit y comentario en español), para que `pnpm env:check`
  siga en verde en este PR.
  Archivos: `apps/api/src/shared/infrastructure/config/{secret-keys,env.schema}.ts`, `apps/api/src/shared/infrastructure/config/{env.schema,load-env}.spec.ts`, `scripts/check-env-example.spec.ts`, `.env.example`.

- [x] **T-11** [P] `enqueueWithCorrelation` acepta `JobsOptions` — CA: CA-21 (idempotencia por `jobId`) — Depende: — — ~0,5 h
  Prueba primero en `enqueue-with-correlation.spec.ts`: pasa `opts` (p. ej. `jobId`) a `queue.add` sin tocar `data`;
  sin `opts` se comporta como antes (`PingQueue` no cambia).
  Archivos: `apps/api/src/shared/infrastructure/queue/enqueue-with-correlation.ts`, `apps/api/src/shared/infrastructure/queue/enqueue-with-correlation.spec.ts`.

- [x] **T-12** [P] `REDIS_CLIENT` y puerto `IRateLimiter` — CA: CA-15 — Depende: — — ~1 h
  Prueba primero `apps/api/src/shared/infrastructure/redis/redis-client.provider.spec.ts`: registra un oyente de
  `error` que no escribe la URL (mismo cuidado que `RedisHealthIndicator`) y cierra la conexión en
  `onApplicationShutdown`. Luego `redis-client.provider.ts` y `application/rate-limit/i-rate-limiter.port.ts`
  (`IRateLimiter`, `RateLimitRule`, `RateLimitDecision`, `I_RATE_LIMITER`).
  Archivos: `apps/api/src/shared/infrastructure/redis/redis-client.provider.ts`, `apps/api/src/shared/infrastructure/redis/redis-client.provider.spec.ts`, `apps/api/src/shared/application/rate-limit/i-rate-limiter.port.ts`.

- [x] **T-13** `RedisRateLimiter` (Lua atómico, ventana deslizante) + prueba de contrato — CA: CA-15 — Depende: T-12 — ~2 h
  Prueba primero `apps/api/test/int/shared/redis-rate-limiter.int-spec.ts` (Redis real, `FixedClock`): regla 1/60 s →
  el segundo `consume` se rechaza con `retryAfterSeconds = 60` y al avanzar 60 s se permite; 5/3600 s → la sexta se
  rechaza con el `retryAfter` de la más vieja; varias reglas: si una rechaza, **ninguna** cuenta la solicitud; las
  rechazadas no cuentan; 20 `consume` concurrentes con límite 5 → exactamente 5 permitidas; las claves expiran
  (`PTTL` ≤ ventana); Redis caído → lanza. Luego `infrastructure/rate-limit/redis-rate-limiter.ts` y su script Lua.
  Archivos: `apps/api/src/shared/infrastructure/rate-limit/{redis-rate-limiter.ts,sliding-window.lua.ts}`, `apps/api/test/int/shared/redis-rate-limiter.int-spec.ts`.

- [x] **T-14** [P] `ITransactionRunner` y `TransactionContext` — CA: CA-3, CA-29 (base) — Depende: — — ~1,5 h
  Prueba primero `apps/api/test/int/shared/transaction-runner.int-spec.ts` (Postgres real): `run` confirma; si el
  trabajo lanza, revierte y relanza; dentro de `run`, `TransactionContext.manager()` devuelve el `EntityManager` de la
  transacción (también tras un `await`); fuera, el del `DataSource`; dos `run` concurrentes no comparten contexto.
  Luego `application/persistence/i-transaction-runner.port.ts` (`ITransactionRunner`, `I_TRANSACTION_RUNNER`) e
  `infrastructure/persistence/{transaction-context,typeorm-transaction-runner}.ts` (ALS; 003 construye `withActor`
  encima).
  Archivos: `apps/api/src/shared/application/persistence/i-transaction-runner.port.ts`, `apps/api/src/shared/infrastructure/persistence/{transaction-context,typeorm-transaction-runner}.ts`, `apps/api/test/int/shared/transaction-runner.int-spec.ts`.

- [x] **T-15** `ZodValidationPipe` (ADR-0020) — CA: CA-6, CA-7 — Depende: T-01, T-07 — ~1 h
  Prueba primero `apps/api/src/shared/presentation/zod-validation.pipe.spec.ts` (esquema y fábrica de prueba): cuerpo
  válido → valor parseado; inválido → lanza lo que devuelve la fábrica con los `FieldIssue[]` de `toFieldIssues`;
  cuerpo `undefined` o `{}` (llega así con `text/plain`) → la fábrica recibe los `REQUIRED`. `shared` no importa nada de
  `contracts/identity` (se comprueba con el lint).
  Archivos: `apps/api/src/shared/presentation/zod-validation.pipe.ts`, `apps/api/src/shared/presentation/zod-validation.pipe.spec.ts`.

- [x] **T-16** `SharedModule` global y exportaciones de `shared` — CA: CA-1 (reloj), CA-15 — Depende: T-12, T-13, T-14, T-15 — ~1 h
  Prueba primero: `apps/api/src/shared/index.spec.ts` (000 CA-17) con la lista nueva de exportaciones
  (`FieldIssue`, `TooManyRequestsError`, `IRateLimiter`, `I_RATE_LIMITER`, `ITransactionRunner`,
  `I_TRANSACTION_RUNNER`, `TransactionContext`, `ZodValidationPipe`, `configureHttpApp` —activada en T-17—,
  `REDIS_CLIENT`) y una prueba de módulo que resuelve `I_CLOCK` → `SystemClock`, `I_RATE_LIMITER`,
  `I_TRANSACTION_RUNNER` y `REDIS_CLIENT` desde un módulo que no importa `SharedModule`. Luego `@Global()` y los
  proveedores en `shared.module.ts`.
  Archivos: `apps/api/src/shared/shared.module.ts`, `apps/api/src/shared/index.ts`, `apps/api/src/shared/index.spec.ts`, `apps/api/src/shared/shared.module.spec.ts`.

- [x] **T-17** `configureHttpApp` y `main.ts` — CA: CA-6 (solo JSON), CA-15 (IP real, `Retry-After` expuesta) — Depende: T-08, T-10, T-16 — ~2 h
  Prueba primero `apps/api/test/int/shared/configure-http-app.int-spec.ts` (controlador de prueba que devuelve el
  cuerpo recibido y `req.ip`): `text/plain` y `application/x-www-form-urlencoded` → cuerpo vacío; JSON de más de 16 KB →
  `413`; JSON mal formado → `400 VALIDATION_FAILED` (P-1); `X-Forwarded-For: 203.0.113.7` → `req.ip` = esa IP; CORS
  con `CORS_ORIGIN` permitido → cabeceras correctas y `Access-Control-Expose-Headers` con `x-correlation-id` y
  `retry-after`; origen no permitido → sin `Access-Control-Allow-Origin`; sin `credentials`. Luego
  `presentation/configure-http-app.ts` (correlación, versión, prefijo, filtro, `trust proxy = 1`, JSON 16 KB, CORS) y
  `main.ts` con `NestFactory.create(..., { bodyParser: false })`.
  Archivos: `apps/api/src/shared/presentation/configure-http-app.ts`, `apps/api/src/main.ts`, `apps/api/src/shared/index.ts`, `apps/api/test/int/shared/configure-http-app.int-spec.ts`.

- [x] **T-18** Arnés de integración: `configureHttpApp`, sustitución de proveedores y entorno `api + worker` — CA: CA-1, CA-9 (reloj), CA-18, CA-21 (precondición) — Depende: T-17 — ~1,5 h
  `createTestApp` usa `configureHttpApp` (con `bodyParser: false`) en lugar de repetir middlewares; nueva opción
  `overrides` (`[{ provide, useValue }]`, p. ej. `I_CLOCK → FixedClock`); opción `withWorkerEnv` que valida
  `apiEnvSchema.merge(workerEnvSchema)` para componer módulos del `worker` en la misma app y capturar sus bitácoras en
  el mismo `LogSink`. Las suites existentes de `test/int/shared` y `test/int/worker` siguen en verde (son su prueba).
  Archivos: `apps/api/test/int/setup/test-app.ts`.

- [x] **T-19** README de `shared` y cierre del PR-1 — CA: n/a — Depende: T-01…T-18 — ~1 h
  `apps/api/src/shared/README.md`: piezas nuevas (tabla de plan §6.7), regla de `ZodValidationPipe` con fábrica por
  módulo, `TransactionContext` como base de `withActor` (003) y la regla de bitácoras de correo. `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm env:check` en verde; `migration:run → revert → run` en local.
  Resumen en el PR (marcado «PR parcial»).
  Archivos: `apps/api/src/shared/README.md`, `specs/001-registro-y-verificacion/tasks.md` (casillas).

## Bloque 2 — PR-2 «notifications y worker» (plan §6.6, §6.8; ADR-0018)

- [x] **T-20** [P] [P×PR] Puerto `IMailer`, `MailMessage` y opciones de la cola `mail` — CA: CA-21 — Depende: — — ~1 h
  Prueba primero `apps/api/src/modules/notifications/application/ports/idempotency-key.spec.ts` (acepta
  `identity.verification.<uuid>` e `identity.attempt-notice.<uuid>`; rechaza `:`, espacios, vacío y caracteres fuera de
  `[A-Za-z0-9._-]`) y `infrastructure/mail-queue.spec.ts` (`attempts: 6`, `backoff` exponencial de 5000 ms,
  `removeOnComplete: true`, `removeOnFail: { age: 86400 }`). Luego `i-mailer.port.ts` (`IMailer.send`, `MailMessage`
  con el formato de `idempotencyKey` documentado, `I_MAILER`, `assertIdempotencyKey`) y `mail-queue.ts`
  (`MAIL_QUEUE = 'mail'`, `MAIL_JOB_OPTIONS`, `MailJobData`).
  Archivos: `apps/api/src/modules/notifications/application/ports/{i-mailer.port,idempotency-key.spec}.ts`, `apps/api/src/modules/notifications/infrastructure/{mail-queue,mail-queue.spec}.ts`.

- [x] **T-21** `SmtpMailer` y `NotificationsModule` — CA: CA-18, CA-21 — Depende: T-11, T-20, T-09 — ~1,5 h
  Prueba primero `apps/api/test/int/notifications/smtp-mailer.int-spec.ts` (Redis real): `send` con una clave real
  `identity.verification.<uuid>` crea un trabajo `send` con ese `jobId`, `data.correlationId` de la petición y las
  opciones de `MAIL_JOB_OPTIONS`; enviar dos veces la misma clave deja un solo trabajo; una clave con `:` lanza sin
  encolar; la bitácora `mail.enqueued` lleva `tag`, `recipientId` y `jobId` y **no** contiene el correo, el asunto ni el
  cuerpo. Luego `smtp-mailer.ts`, `notifications.module.ts` (`BullModule.registerQueue('mail')`, `I_MAILER →
  SmtpMailer`) e `index.ts` (solo lo público de plan §6.6).
  Archivos: `apps/api/src/modules/notifications/infrastructure/smtp-mailer.ts`, `apps/api/src/modules/notifications/notifications.module.ts`, `apps/api/src/modules/notifications/index.ts`, `apps/api/test/int/notifications/smtp-mailer.int-spec.ts`.

- [x] **T-22** `SmtpTransport` y Mailpit en el arnés — CA: CA-1 (correo en Mailpit), CA-21 — Depende: T-10 — ~2 h
  Agregar `nodemailer` y `@types/nodemailer` a `apps/api`. Mailpit en `containers.ts` (`axllent/mailpit` con versión
  fijada; exporta `SMTP_HOST`/`SMTP_PORT` y la URL de la API) y ayudante `test/int/setup/mailpit.ts` (`listMessages`,
  `getMessage`, `deleteAll`, `waitForMessages(n)`). Prueba primero `apps/api/test/int/notifications/smtp-transport.int-spec.ts`:
  envía a Mailpit con `MAIL_FROM`, texto y HTML; `Message-ID = <jobId@nimbo.me>`; con `SMTP_TLS=none` no intenta TLS; un
  puerto cerrado rechaza con un error que conserva `code`. Luego `smtp-transport.ts` (lee `SMTP_*` del entorno del
  `worker`; modos `none`/`starttls`/`implicit`).
  Archivos: `apps/api/package.json`, `apps/api/src/modules/notifications/infrastructure/smtp-transport.ts`, `apps/api/test/int/setup/{containers,mailpit}.ts`, `apps/api/test/int/notifications/smtp-transport.int-spec.ts`.

- [x] **T-23** `MailProcessor` (idempotencia y bitácoras) — CA: CA-18, CA-21 — Depende: T-20, T-22 — ~2 h
  Prueba primero `apps/api/src/modules/notifications/infrastructure/mail.processor.spec.ts` (transporte y Redis falsos):
  corre dentro de `CorrelationContext.run` con el `correlationId` del trabajo y `jobId`; sin marca `mail:sent:<jobId>`
  envía y escribe la marca con `SET NX EX 604800`; con marca no envía y registra `mail.duplicate_skipped`; si el
  transporte falla, relanza y registra `mail.retry_scheduled` con `errorCode`/`responseCode`; `@OnWorkerEvent('failed')`
  con los intentos agotados registra `mail.failed` en `error` con `tag`, `recipientId`, `attemptsMade`, `errorCode` y el
  mismo `correlationId`; ninguna línea contiene `err.message`, `job.data`, `to`, asunto, cuerpo ni enlace.
  Luego `mail.processor.ts`.
  Archivos: `apps/api/src/modules/notifications/infrastructure/mail.processor.ts`, `apps/api/src/modules/notifications/infrastructure/mail.processor.spec.ts`.

- [x] **T-24** `NotificationsWorkerModule` y `WorkerModule` con la cola `mail` — CA: CA-21 — Depende: T-23 — ~1 h
  Prueba primero: ampliar `apps/api/test/int/worker/bootstrap.int-spec.ts` (`worker.started` lista `['ping', 'mail']`;
  sin `SMTP_HOST` o con `SMTP_TLS=none` y `APP_ENV=staging` → `config.invalid` y salida ≠ 0) y
  `worker-health.int-spec.ts` (la salud sigue solo con Redis: un SMTP caído no la afecta). Luego
  `notifications-worker.module.ts` (`MailProcessor`, `SmtpTransport`, `registerQueue('mail')`),
  `worker.module.ts` (`WORKER_QUEUES = [PING_QUEUE, MAIL_QUEUE]`, importa `NotificationsWorkerModule` desde
  `modules/notifications/index.ts`) y `worker.main.ts` si hace falta.
  Archivos: `apps/api/src/modules/notifications/notifications-worker.module.ts`, `apps/api/src/modules/notifications/index.ts`, `apps/api/src/worker.module.ts`, `apps/api/src/worker.main.ts`, `apps/api/test/int/worker/{bootstrap,worker-health}.int-spec.ts`.

- [x] **T-25** Contrato de `IMailer` de punta a punta y degradación del SMTP — CA: CA-21, CA-18 — Depende: T-18, T-21, T-24 — ~2 h
  Pruebas (arnés con `withWorkerEnv`, `NotificationsModule` + `NotificationsWorkerModule` en la misma app, `delay`
  corto inyectado en `MAIL_JOB_OPTIONS`):
  - `apps/api/test/int/notifications/mailer-contract.int-spec.ts` (Liskov): `IMailer.send` → un correo en Mailpit con
    destinatario, asunto, texto y HTML; el `correlationId` de las líneas del `worker` es el de la petición.
  - `apps/api/test/int/notifications/mail-degradation.int-spec.ts`: `SMTP_PORT` apunta a un puerto fijo sin servidor;
    se levanta Mailpit en ese puerto antes de agotar los intentos → **un** correo; con los intentos agotados →
    `mail.failed` con `correlationId` y `recipientId`. (T-51 agrega la variante con el registro).
  Archivos: `apps/api/test/int/notifications/{mailer-contract,mail-degradation}.int-spec.ts`, `apps/api/src/modules/notifications/infrastructure/mail-queue.ts` (si hace falta el `delay` inyectable).

- [x] **T-26** [P] Operación y documentación de `notifications` — CA: CA-1 (Mailpit en local) — Depende: T-10 — ~1 h
  `compose.override.yml`: el `worker` del perfil `apps` recibe `SMTP_HOST: mailpit` y `SMTP_PORT: '1025'`.
  `docs/operations/ambientes.md`: Mailpit en local (`:8025`), variables `SMTP_*`/`MAIL_FROM`/`WEB_PUBLIC_URL`/
  `CORS_ORIGIN` por proceso, secretos por proceso (`SMTP_PASSWORD` solo en el `worker`), Resend como paso al montar
  staging (D-12). `apps/api/src/modules/notifications/README.md`: puerto, formato de `idempotencyKey`, reintentos,
  idempotencia en tres capas, regla de bitácoras. Verificar `docker compose --profile apps config`.
  Archivos: `compose.override.yml`, `docs/operations/ambientes.md`, `apps/api/src/modules/notifications/README.md`.

- [x] **T-27** Cierre del PR-2 — CA: n/a — Depende: T-20…T-26 — ~0,5 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm env:check` en verde; `pnpm dev` con el `worker`
  consumiendo `mail` y `worker.started` con `queues: ['ping', 'mail']`. Resumen en el PR («PR parcial»).
  Archivos: `specs/001-registro-y-verificacion/tasks.md` (casillas).

## Bloque 3 — PR-3 «backend de identity» (plan §6.1–§6.5; ADR-0017, ADR-0019)

### 3a. Dominio (pruebas primero; puede empezar ya, [P×PR])

- [x] **T-28** [P] [P×PR] `EmailAddress` y `OpaqueToken` — CA: CA-3, CA-11 (b), CA-17 — Depende: — — ~1,5 h
  Prueba primero `domain/email-address.vo.spec.ts` (`  Ana@Ejemplo.COM ` → `ana@ejemplo.com`; `ana.b@…` y
  `ana+nimbo@…` distintos; `localPart()`) y `domain/opaque-token.vo.spec.ts` (`generate()` da 43 caracteres base64url
  sin relleno; 1 000 valores distintos; `hashOf` = SHA-256 hex de 64; `isWellFormed` rechaza vacío, 42 y 44
  caracteres, `+`, `/`, `=` y espacios; `matchesHash` compara con `timingSafeEqual`). Luego los dos objetos de valor.
  Archivos: `apps/api/src/modules/identity/domain/{email-address.vo,opaque-token.vo}.ts` y sus `*.spec.ts`.

- [x] **T-29** [P] [P×PR] `User`, `ClientUser`, `InternalUser` y objetos de valor de cuenta — CA: CA-1, CA-4, CA-7 — Depende: — — ~2 h
  Prueba primero `domain/client-user.entity.spec.ts`: `register` nace con `role = CLIENT`, `emailVerified = false`,
  `status = ACTIVE` y la `LegalAcceptance` recibida (no hay forma de pasar rol, estado ni verificación);
  `replacePendingRegistration` devuelve una instancia **nueva** con nombre, hash y aceptación reemplazados y deja la
  original intacta; sobre una cuenta verificada lanza; `verifyEmail` devuelve otra instancia con `emailVerified = true`;
  `password-hash.vo.spec.ts` (`toJSON()` y `toString()` → `[REDACTED]`); `internal-user.entity.spec.ts` (solo lectura,
  rol interno). Luego `user.entity.ts`, `client-user.entity.ts`, `internal-user.entity.ts`, `password-hash.vo.ts`,
  `legal-acceptance.vo.ts`, `account-status.enum.ts`.
  Archivos: `apps/api/src/modules/identity/domain/{user.entity,client-user.entity,internal-user.entity,password-hash.vo,legal-acceptance.vo,account-status.enum}.ts` y sus `*.spec.ts`.

- [x] **T-30** [P] [P×PR] `VerificationToken` — CA: CA-8, CA-9, CA-10, CA-11 (a) — Depende: — — ~1,5 h
  Prueba primero `domain/verification-token.entity.spec.ts`: `issue` exige `expiresAt > createdAt` (recibe el
  vencimiento ya calculado, no importa `contracts`); `stateAt(now)` → `invalidated` si hay `invalidatedAt`, `used` si
  hay `usedAt`, `expired` si `now >= expiresAt` (justo en el límite y 1 s antes), `valid` en otro caso; `isValid`;
  `consume` e `invalidate` devuelven instancias nuevas y fallan si el token no es válido.
  Archivos: `apps/api/src/modules/identity/domain/verification-token.entity.ts`, `apps/api/src/modules/identity/domain/verification-token.entity.spec.ts`.

- [x] **T-31** Errores de `identity`, contrato del evento e `index.ts` — CA: CA-5, CA-6, CA-8, CA-9, CA-11, CA-15 — Depende: T-07 — ~1 h
  Prueba primero `domain/errors/identity-errors.spec.ts` (cada clase con su `code`, su `status` por herencia —422 o
  429— y el mensaje de plan §5; `IdentityTooManyRequestsError` lleva `retryAfterSeconds` y el mensaje con «N minutos»
  redondeado hacia arriba) y `apps/api/src/modules/identity/index.spec.ts` (exporta exactamente `IdentityModule` —activado
  en T-45—, `CLIENT_ACCOUNT_VERIFIED = 'identity.client-account-verified'` y el tipo `ClientAccountVerifiedEvent`).
  Luego `domain/errors/*.ts`, `domain/client-account-verified.event.ts` e `index.ts`.
  Archivos: `apps/api/src/modules/identity/domain/errors/**`, `apps/api/src/modules/identity/domain/client-account-verified.event.ts`, `apps/api/src/modules/identity/index.ts`, `apps/api/src/modules/identity/index.spec.ts`.

### 3b. Aplicación

- [x] **T-32** [P] Puertos de `identity` e `IDENTITY_CONFIG` — CA: n/a (contratos internos) — Depende: T-29, T-30 — ~0,5 h
  `application/ports/i-user-repository.port.ts` (`findByEmail`, `findByEmailForUpdate`, `findByIdForUpdate`,
  `insertIfAbsent(user): Promise<boolean>`, `update`), `i-verification-token-repository.port.ts` (`findByHash(hash,
  type)`, `invalidateActive`, `insert`, `consume(id, now): Promise<boolean>`), `i-password-hasher.port.ts`,
  `i-account-events-publisher.port.ts`, `identity-config.ts` (`IDENTITY_CONFIG { webPublicUrl }`). Sin lógica: se
  prueban a través de T-34 a T-40.
  Archivos: `apps/api/src/modules/identity/application/ports/*.ts`, `apps/api/src/modules/identity/application/identity-config.ts`.

- [x] **T-33** [P] Plantillas de correo — CA: CA-1, CA-2 — Depende: — — ~1,5 h
  Prueba primero `application/mail/verification-mail.template.spec.ts` (asunto «Verifica tu correo para entrar a
  Nimbo»; texto y HTML con el enlace `http://localhost/verificar-correo#token=…`, «24 horas», «solo funciona una vez»,
  «No reenvíes este correo: quien abra el enlace entrará a tu cuenta», qué hacer si no pediste el registro; no contiene
  la contraseña; HTML con estilos en línea y el enlace escapado) y `registration-attempt-mail.template.spec.ts` (asunto
  «Alguien intentó crear una cuenta con tu correo»; fecha del intento en hora de Guatemala; sin IP, nombre ni correo
  del solicitante; enlaces a iniciar sesión y a recuperar la contraseña). Luego las dos funciones puras. Referencia
  visual: `docs/design/mockups/identity/correos/correos--registro.html` (la valida el `ui-designer`).
  Archivos: `apps/api/src/modules/identity/application/mail/*.ts`.

- [x] **T-34** `VerificationLinkIssuer` — CA: CA-1, CA-4, CA-13, CA-17 — Depende: T-28, T-30, T-32, T-33, T-20 — ~1,5 h
  Prueba primero `application/verification-link-issuer.spec.ts` (repositorio en memoria, `FixedClock`): invalida los
  vigentes antes de insertar; `expiresAt = now + 24 h` con `VERIFICATION_LINK_TTL_HOURS`; guarda solo el hash; el
  `MailMessage` devuelto tiene `to` = correo de la cuenta, el enlace `{webPublicUrl}/verificar-correo#token=<valor>`,
  `idempotencyKey = identity.verification.<id del token>` (pasa `assertIdempotencyKey`), `tag =
  identity.verification` y `recipientId`; dos emisiones → valores distintos.
  Archivos: `apps/api/src/modules/identity/application/verification-link-issuer.ts`, `apps/api/src/modules/identity/application/verification-link-issuer.spec.ts`.

- [x] **T-35** [P] `RegistrationAttemptNotifier` — CA: CA-2 — Depende: T-32, T-33, T-12 — ~1 h
  Prueba primero `application/registration-attempt-notifier.spec.ts` (`IRateLimiter` falso): permitido → devuelve el
  aviso con `idempotencyKey = identity.attempt-notice.<uuid>` y registra `identity.registration.attempt_notice_sent`
  (`userId`); rechazado → no devuelve mensaje y registra `…_suppressed`; la clave es
  `identity:attempt-notice:<userId>` con la regla `{ limit: MAX_AVISOS_INTENTO_24H, windowSeconds: 86400 }`.
  Archivos: `apps/api/src/modules/identity/application/registration-attempt-notifier.ts`, `apps/api/src/modules/identity/application/registration-attempt-notifier.spec.ts`.

- [ ] **T-36** `RegistrationService.register` — CA: CA-1, CA-2, CA-3, CA-4, CA-7, CA-15, CA-18 — Depende: T-34, T-35, T-14 — ~2 h
  Prueba primero `application/registration.service.spec.ts` (dobles de todos los puertos, `FixedClock`,
  `ITransactionRunner` falso): el límite por correo (`identity:email-request:<sha256>`, reglas 60 s y 5/h) se consulta
  **antes** que el repositorio y, si rechaza, lanza `IdentityTooManyRequestsError` y registra `identity.rate_limited`
  (`scope: 'email'`) sin tocar nada más; `hash` se calcula **siempre**, también con correo existente; rama nueva (con
  la `LegalAcceptance` de `LEGAL_DOCUMENTS` y `now`) → `insertIfAbsent` → emite enlace → bitácora `accepted kind=new`;
  `insertIfAbsent = false` → relee con `findByEmailForUpdate` en la misma transacción y sigue la rama; si tampoco
  aparece, reintenta la transacción una vez; pendiente → `replacePendingRegistration` + `update` + enlace (`kind =
  pending_replaced`); verificada o interna → sin cambios y `maybeNotify` (`existing_account`); el correo se envía solo
  **después** del commit y nunca si la transacción falla. Cada rama en un método privado (≤ 30 líneas).
  Archivos: `apps/api/src/modules/identity/application/registration.service.ts`, `apps/api/src/modules/identity/application/registration.service.spec.ts`.

- [ ] **T-37** `RegistrationService.resendVerification` — CA: CA-13, CA-14, CA-15 — Depende: T-36 — ~1 h
  Prueba primero (mismo archivo, `describe` propio): usa **la misma** clave de límite que el registro; cliente no
  verificado → emite enlace y registra `identity.verification.resend_requested`; correo inexistente, verificado o
  interno → no emite nada y registra `resend_ignored` sin `userId`; correo después del commit.
  Archivos: `apps/api/src/modules/identity/application/registration.service.ts`, `apps/api/src/modules/identity/application/registration.service.spec.ts`.

- [ ] **T-38** `RegistrationService.verifyEmail` — CA: CA-8, CA-9, CA-10, CA-11, CA-12, CA-29 (d) — Depende: T-36 — ~2 h
  Prueba primero (mismo archivo): token mal formado → `VerificationLinkInvalidError` sin consultar; hash inexistente o
  de tipo `recuperacion` → inválido; cuenta ya verificada → `ALREADY_VERIFIED` (incluido un enlace viejo); estado
  `invalidated`/`used` → inválido; `expired` → `VerificationLinkExpiredError`; `valid` y `consume = true` →
  `verifyEmail` + `update` + `invalidateActive` → `{ outcome: 'VERIFIED', userId }`; `consume = false` →
  `ALREADY_VERIFIED`; el evento se publica **una vez**, después del commit y solo con `VERIFIED`; bitácoras
  `identity.verification.succeeded` / `rejected` con `reason` y `userId` solo si el token existía.
  Archivos: `apps/api/src/modules/identity/application/registration.service.ts`, `apps/api/src/modules/identity/application/registration.service.spec.ts`.

### 3c. Infraestructura

- [ ] **T-39** Entidades ORM, mappers y `TypeormUserRepository` — CA: CA-3, CA-19 (sin hash en respuestas) — Depende: T-06, T-14, T-29, T-32 — ~2 h
  Prueba primero `apps/api/test/int/identity/user-repository.int-spec.ts`: el mapper devuelve `ClientUser` o
  `InternalUser` según `rol`; `findByEmailForUpdate` bloquea (una segunda transacción espera); **dos `insertIfAbsent`
  concurrentes** en transacciones distintas → una fila, uno devuelve `false` y su `findByEmailForUpdate` en la misma
  transacción encuentra la fila, sin transacción abortada; `update` escribe nombre, hash, aceptación y
  `correo_verificado`; usa el `EntityManager` de `TransactionContext`. Luego `usuario.orm-entity.ts`, `user.mapper.ts`,
  `typeorm-user.repository.ts` (`INSERT … ON CONFLICT (correo) DO NOTHING RETURNING id`).
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/{usuario.orm-entity,user.mapper,typeorm-user.repository}.ts`, `apps/api/test/int/identity/user-repository.int-spec.ts`.

- [ ] **T-40** [P] `TypeormVerificationTokenRepository` — CA: CA-10, CA-11, CA-12 (parcial), CA-29 (d) — Depende: T-06, T-14, T-30, T-32 — ~1,5 h
  Prueba primero `apps/api/test/int/identity/verification-token-repository.int-spec.ts`: `findByHash(hash,
  'verificacion')` no encuentra un token `recuperacion` con el mismo hash (CA-12); `invalidateActive` marca
  `invalidado_en` solo en los vigentes de ese tipo; `consume` concurrente sobre el mismo id → exactamente un `true`;
  `consume` de un token vencido o invalidado → `false`. Luego `token-cuenta.orm-entity.ts`,
  `verification-token.mapper.ts`, `typeorm-verification-token.repository.ts`.
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/{token-cuenta.orm-entity,verification-token.mapper,typeorm-verification-token.repository}.ts`, `apps/api/test/int/identity/verification-token-repository.int-spec.ts`.

- [ ] **T-41** [P] [P×PR] `Argon2idHasher` (ADR-0017) — CA: CA-19 — Depende: T-29, T-32 — ~1,5 h
  Agregar `argon2` a `apps/api` (y a `onlyBuiltDependencies` si pnpm 10 bloquea su script). Prueba primero
  `infrastructure/argon2id.hasher.spec.ts` (contrato de `IPasswordHasher`): PHC `$argon2id$v=19$m=19456,t=2,p=1$…`;
  misma contraseña → hashes distintos; `verify` correcto `true`, incorrecto `false`; parámetros como constantes con
  nombre. Verificar a mano que el binario precompilado carga en `node:22-alpine` (`docker run --rm -v … node:22-alpine
  node -e "require('argon2')"`) y anotarlo en «Notas del developer» (riesgo de plan §9).
  Archivos: `apps/api/package.json`, `pnpm-workspace.yaml` o `package.json` raíz (si hace falta), `apps/api/src/modules/identity/infrastructure/argon2id.hasher.ts`, `apps/api/src/modules/identity/infrastructure/argon2id.hasher.spec.ts`.

- [ ] **T-42** [P] `EventEmitterAccountEventsPublisher` (ADR-0019) — CA: CA-8 — Depende: T-31, T-32 — ~1 h
  Agregar `@nestjs/event-emitter`. Prueba primero `infrastructure/event-emitter-account-events.publisher.spec.ts`:
  emite `CLIENT_ACCOUNT_VERIFIED` con `{ userId }` y registra `identity.account_verified.published`; un oyente que lanza
  de forma síncrona → sin excepción y `identity.account_verified.publish_failed` en `warn` solo con `userId`.
  Archivos: `apps/api/package.json`, `apps/api/src/modules/identity/infrastructure/event-emitter-account-events.publisher.ts` y su `*.spec.ts`.

### 3d. Presentación y composición

- [ ] **T-43** [P] Fábrica de errores de validación de `identity` — CA: CA-5, CA-6, CA-7 — Depende: T-05, T-15, T-31 — ~1 h
  Prueba primero `presentation/identity-validation.spec.ts`: si todos los *issues* son de `password` →
  `IdentityWeakPasswordError` con todas las reglas; si hay más de un campo → `IdentityInvalidInputError` con todos,
  incluidas las reglas de contraseña; `UNKNOWN_FIELD` → `IdentityInvalidInputError`; y los `code` de las clases de
  `domain/errors` coinciden con `IDENTITY_ERROR_CODES` de `contracts` (una sola fuente, Art. VI).
  Archivos: `apps/api/src/modules/identity/presentation/identity-validation.ts`, `apps/api/src/modules/identity/presentation/identity-validation.spec.ts`.

- [ ] **T-44** [P] `IdentityIpThrottlerGuard` (ADR-0017, DT-8 del plan 002) — CA: CA-15 — Depende: T-31 — ~1,5 h
  Agregar `@nestjs/throttler`. Prueba primero `presentation/identity-ip-throttler.guard.spec.ts`: al superar el límite
  de `register-ip` lanza `IdentityTooManyRequestsError` con el ámbito que da la tabla *throttler* → ámbito
  (`{ 'register-ip': 'ip' }`) y el `Retry-After` del detalle del *throttler*, y registra `identity.rate_limited`
  (`scope: 'ip'`, sin IP); nunca agrega cabeceras `X-RateLimit-*` (ni en respuestas permitidas). Luego el guard
  (`setHeaders: false` o sobrescribiendo `handleRequest` según la versión fijada), con la tabla como constante del
  archivo. Nota: 002-PR-2 agrega `login-ip` a la tabla y los `@SkipThrottle` cruzados; no se renombra nada.
  Archivos: `apps/api/package.json`, `apps/api/src/modules/identity/presentation/identity-ip-throttler.guard.ts` y su `*.spec.ts`.

- [ ] **T-45** `AuthController`, `IdentityModule` y `AppModule` — CA: CA-1 (camino feliz), CA-8 (camino feliz) — Depende: T-21, T-36…T-44 — ~2 h
  Prueba primero `apps/api/test/int/identity/register.int-spec.ts` con solo el camino feliz de CA-1 (`202 { status:
  'accepted' }`, `Cache-Control: no-store`, sin `Set-Cookie`, fila de `usuario`, token vigente, correo en Mailpit) y
  `verify-email.int-spec.ts` con el de CA-8 (`200 { status: 'verified' }`). Luego `presentation/auth.controller.ts`
  (tres rutas, `ZodValidationPipe` con la fábrica de T-43, guard solo en `register`, mapea el resultado al contrato),
  `identity.module.ts` (`forRoot(env)` publica `IDENTITY_CONFIG`; proveedores de puertos), `app.module.ts`
  (`EventEmitterModule.forRoot()`, `ThrottlerModule.forRoot` con `register-ip` en memoria y
  `REGISTRATIONS_PER_IP_PER_HOUR`, `NotificationsModule`, `IdentityModule.forRoot(env)`), y activar la exportación de
  `IdentityModule` en `identity/index.spec.ts`.
  Archivos: `apps/api/src/modules/identity/presentation/auth.controller.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/modules/identity/index.ts`, `apps/api/src/modules/identity/index.spec.ts`, `apps/api/src/app.module.ts`, `apps/api/test/int/identity/{register,verify-email}.int-spec.ts`.

### 3e. Pruebas de integración por criterio

- [ ] **T-46** Registro: CA-1 completo, CA-2, CA-3 y CA-4 — CA: CA-1, CA-2, CA-3, CA-4 — Depende: T-45 — ~2 h
  En `register.int-spec.ts`: CA-1 (rol, correo normalizado, `correo_verificado = false`, `estado = activa`, versión y
  fecha de aceptación de `LEGAL_DOCUMENTS` con `FixedClock`, `expira_en = +24 h`, un solo correo con el enlace
  `http://localhost/verificar-correo#token=`, sin contraseña); CA-2 (cuenta verificada y cuenta interna insertadas a
  mano: sin cambios, sin enlace, un aviso y ninguno más en 24 h); CA-3 (`  Ana@Ejemplo.COM ` es la misma cuenta; dos
  registros simultáneos del mismo correo → una fila; variantes con punto y `+etiqueta` son cuentas distintas); CA-4
  (nombre y hash reemplazados, X ya no verifica, el enlace anterior da `IDENTITY_VERIFICATION_LINK_INVALID`, llega un
  enlace nuevo; antes de 60 s → `429` y la cuenta no cambia).
  Archivos: `apps/api/test/int/identity/register.int-spec.ts`.

- [ ] **T-47** [P] Validación del registro — CA: CA-5, CA-6, CA-7 — Depende: T-45 — ~1,5 h
  `apps/api/test/int/identity/register-validation.int-spec.ts`: CA-5 (una petición por regla →
  `IDENTITY_WEAK_PASSWORD` con cada regla en `fields`; con correo existente la respuesta es idéntica, salvo
  `x-correlation-id`); CA-6 (cada campo inválido, casilla sin marcar con su mensaje, campo ausente, varios a la vez →
  `IDENTITY_INVALID_INPUT` con todos; `text/plain` → `IDENTITY_INVALID_INPUT`; JSON mal formado → `400
  VALIDATION_FAILED`; ninguna fila, token ni correo); CA-7 (cada campo extra → `UNKNOWN_FIELD`; con `Authorization:
  Bearer …` igual; ninguna fila con otro rol, verificada o con otra versión).
  Archivos: `apps/api/test/int/identity/register-validation.int-spec.ts`.

- [ ] **T-48** [P] Verificación: CA-8 a CA-11 y concurrencia — CA: CA-8, CA-9, CA-10, CA-11, CA-29 (a–d, parte del token) — Depende: T-45 — ~2 h
  `verify-email.int-spec.ts`: CA-8 (`correo_verificado`, `usado_en`, los demás tokens invalidados, **un** evento
  `{ userId }` capturado por un oyente de prueba, sin correo ni nombre); CA-9 (`FixedClock` + 24 h + 1 s →
  `LINK_EXPIRED`, sin evento); CA-10 (repetir N veces → `already-verified`, sin evento nuevo; enlace viejo de una cuenta
  ya verificada con otro); CA-11 (reemplazado, inexistente, alterado en un carácter, vacío, formato incorrecto →
  `LINK_INVALID`, el cuerpo no trae datos de la cuenta). `verify-email-concurrency.int-spec.ts`: (d) dos `POST`
  simultáneos → un `verified`, un `already-verified` y un solo evento; (a)–(c) sin efectos repetidos.
  Archivos: `apps/api/test/int/identity/{verify-email,verify-email-concurrency}.int-spec.ts`.

- [ ] **T-49** [P] Reenvío y límites — CA: CA-13, CA-14, CA-15 — Depende: T-45 — ~2 h
  `resend-verification.int-spec.ts`: CA-13 (enlace nuevo con 24 h desde ahora; los anteriores dan `LINK_INVALID`);
  CA-14 (inexistente, verificada, interna → `202` idéntico y ningún correo de verificación).
  `rate-limits.int-spec.ts`: 60 s entre solicitudes (registro y reenvío cuentan juntos), 5 por hora avanzando
  `FixedClock`, 10 registros por hora por IP con `X-Forwarded-For` distintos por correo, `Retry-After` en segundos, el
  mensaje de CA-15 con N minutos, sin correo ni cambios en `429`, las rechazadas no cuentan, y al cumplirse el tiempo
  la siguiente funciona como CA-13.
  Archivos: `apps/api/test/int/identity/{resend-verification,rate-limits}.int-spec.ts`.

- [ ] **T-50** [P] Secretos y bitácoras — CA: CA-17, CA-18, CA-19 — Depende: T-45, T-25 — ~2 h
  `token-secrecy.int-spec.ts` (CA-17: token sacado de Mailpit; no aparece en ninguna columna de texto de `usuario` ni
  `token_cuenta` ni en el `LogSink`; `token_hash ≠ token`; dos registros → tokens distintos). `password-hash.int-spec.ts`
  (CA-19: PHC con `m=19456,t=2,p=1`, sales distintas, `verify` correcto, ninguna respuesta con hash).
  `identity-logs.int-spec.ts` (CA-18: los flujos de CA-1, 2, 4, 5, 8, 9, 10, 11, 13 y 15 con `api` y `worker` en la
  misma app; ninguna línea con contraseña, hash, token, su hash, URL del enlace, nombre ni correo; todas con
  `correlationId`; el del trabajo de correo es el de la petición; eventos de plan §7 presentes con solo `userId`).
  Archivos: `apps/api/test/int/identity/{token-secrecy,password-hash,identity-logs}.int-spec.ts`.

- [ ] **T-51** [P] Degradación del correo en el registro — CA: CA-21 — Depende: T-45, T-25 — ~1 h
  Ampliar `mail-degradation.int-spec.ts` con la variante de registro: con el SMTP caído la respuesta es la de CA-1 y la
  cuenta queda creada; al volver Mailpit llega **un** correo; con los intentos agotados `mail.failed` lleva el
  `correlationId` de la petición y `recipientId` = id de la cuenta; después se puede pedir otro enlace (CA-13).
  Archivos: `apps/api/test/int/notifications/mail-degradation.int-spec.ts`.

- [ ] **T-52** Aislamiento: anti-enumeración — CA: CA-14, CA-15, CA-5, CA-6 — Depende: T-45 — ~2 h
  `apps/api/test/isolation/identity-enumeration.iso-spec.ts` (corre en `pnpm test:isolation`): para los cuatro tipos de
  correo (inexistente, no verificado, verificado, interno) la misma secuencia de peticiones de registro y de reenvío
  produce la misma secuencia de `status` (`202`/`429`), cuerpos idénticos y **las mismas cabeceras** salvo
  `x-correlation-id` (sin `Set-Cookie` ni `X-RateLimit-*`); un 422 de contraseña débil es idéntico con correo existente
  y nuevo; roles internos: ninguna ruta de 001 devuelve datos de su cuenta. Cuando 003 cree `nimbo_app`, correrá con
  ese rol (ADR-0005).
  Archivos: `apps/api/test/isolation/identity-enumeration.iso-spec.ts`.

- [ ] **T-53** [P] README de `identity` — CA: n/a — Depende: T-45 — ~0,5 h
  `apps/api/src/modules/identity/README.md`: capas y clases (plan §6.1), puertos y su regla de Art. V, evento
  `CLIENT_ACCOUNT_VERIFIED` (única importación permitida a `billing`, ADR-0019), piezas que reutilizan 002 y 003 (plan
  §6.11), pendiente de `@Public()` con 003 y de `@SkipThrottle` cuando 002 agregue `login-ip`.
  Archivos: `apps/api/src/modules/identity/README.md`.

- [ ] **T-54** Cierre del PR-3 — CA: n/a — Depende: T-28…T-53 — ~1 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test` (cobertura ≥ 60 % en `domain/` y `application/` de `identity` y
  `notifications` y en las piezas nuevas de `shared`, RNF-11), `pnpm test:int`, `pnpm test:isolation`, `pnpm env:check`.
  Prueba de humo con `pnpm dev`: `curl` de registro → correo en Mailpit (`:8025`) → `curl` de `verify-email` con el
  token del fragmento → `verified`. Resumen en el PR («PR parcial»; 002 puede partir de aquí).
  Archivos: `specs/001-registro-y-verificacion/tasks.md` (casillas).

## Bloque 4 — PR-4 «web» (plan §6.9, §6.13; sin E2E, PD-41)

> Todas las pantallas según `docs/design/mockups/identity/<pantalla>/` (estados de spec §11), solo tokens de
> `ui-guidelines.md`, objetivos de 44 px (ADR-0014), textos exactos de spec §11. Cada prueba de componente incluye
> jest-axe sin violaciones `serious` ni `critical` y recorrido con teclado.

- [ ] **T-55** Entorno y dependencias de `web` — CA: CA-20 (esquema), CA-22 — Depende: — — ~1 h
  Prueba primero en `apps/web/src/env.spec.ts`: `API_PUBLIC_URL` obligatoria; `http://` con `APP_ENV=staging` falla.
  Luego `env.ts`, `.env.example` (`API_PUBLIC_URL=http://localhost/api/v1`) y dependencias `react-hook-form`,
  `@hookform/resolvers`, `@testing-library/react`, `@testing-library/user-event` (versiones fijas). `pnpm env:check`.
  Archivos: `apps/web/src/env.ts`, `apps/web/src/env.spec.ts`, `apps/web/package.json`, `.env.example`.

- [ ] **T-56** [P] [P×PR] Primitivas `label`, `checkbox`, `radio-group` y `alert` (controles nativos, DT-8) — CA: CA-22 — Depende: — — ~2 h
  Prueba primero `*.spec.tsx` de cada una (asociación `label`/control, `aria-invalid`, `aria-describedby`, foco
  visible, teclado —flechas en el grupo de radios nativo—, `alert` con `role="alert"` o `status` según variante,
  jest-axe). Luego los componentes al estilo shadcn sin Radix ni tokens nuevos.
  Archivos: `apps/web/src/components/ui/{label,checkbox,radio-group,alert}.tsx` y sus `*.spec.tsx`.

- [ ] **T-57** [P] Cliente HTTP y catálogo de errores — CA: CA-15, CA-22 — Depende: T-01, T-02, T-55 — ~1,5 h
  Prueba primero `lib/api-client.spec.ts` (`fetch` simulado: envía `x-correlation-id`; `2xx` → cuerpo; error → valida
  `ErrorResponse`, expone `code`, `fields`, `correlationId` y `retryAfterSeconds` de `Retry-After`; red caída o cuerpo
  no válido → error genérico con `correlationId` si existe) y `lib/error-catalog.spec.ts` (mensaje por `code` y por
  `reason`, reexporta `IDENTITY_FIELD_MESSAGES`, código desconocido → genérico de 000 §10).
  Archivos: `apps/web/src/lib/{api-client,error-catalog}.ts` y sus `*.spec.ts`.

- [ ] **T-58** [P] [P×PR] `PublicHeader`, grupo `(public)` y marcador de inicio de sesión — CA: CA-8, CA-10, CA-22 (cabecera sin sesión) — Depende: — — ~1 h
  Prueba primero `components/nimbo/public-header.spec.tsx` (logo, «Iniciar sesión» → `/iniciar-sesion`, sin datos de
  sesión, jest-axe) y `app/(public)/iniciar-sesion/page.spec.tsx` («Inicio de sesión disponible pronto»). Luego
  `public-header.tsx`, `app/(public)/layout.tsx` y el marcador. **Coordinar con 002**, que reemplaza este marcador.
  Archivos: `apps/web/src/components/nimbo/public-header.tsx`, `apps/web/src/app/(public)/layout.tsx`, `apps/web/src/app/(public)/iniciar-sesion/page.tsx` y sus `*.spec.tsx`.

- [ ] **T-59** [P] Términos y Política de privacidad — CA: CA-23 — Depende: T-02, T-58 — ~2 h
  Prueba primero `app/(public)/terminos/page.spec.tsx` y `privacidad/page.spec.tsx`: versión y fecha iguales a
  `LEGAL_DOCUMENTS`; texto en español con los puntos de plan §6.13 (proyecto académico, 18 años, pagos simulados,
  borrado a fines de noviembre de 2026, contacto); ningún `src`/`href` a otro origen salvo `mailto:`; jest-axe. Luego
  `LegalDocument`, `terms-v1.tsx`, `privacy-v1.tsx` (textos finales de plan §6.13, sin los «..» dobles de los puntos 7 y
  8 de la Política) y las dos páginas estáticas.
  Archivos: `apps/web/src/features/identity/components/{legal-document,terms-v1,privacy-v1}.tsx`, `apps/web/src/app/(public)/{terminos,privacidad}/page.tsx` y sus `*.spec.tsx`.

- [ ] **T-60** [P] `api.ts`, `chosen-plan-storage` y `use-countdown` — CA: CA-13, CA-15, CA-28 — Depende: T-05, T-57 — ~1,5 h
  Prueba primero `features/identity/chosen-plan-storage.spec.ts` (guarda `{ planId, planName, savedAt }` en
  `nimbo.registro.plan`, sin correo ni nombre; se lee solo si `savedAt` < 24 h; se borra al leer; sin `localStorage` →
  `null`), `hooks/use-countdown.spec.ts` (60 s por defecto; con un `429` usa `Retry-After`; temporizadores falsos) y
  `api.spec.ts` (`register`, `resendVerification`, `verifyEmail` validan la respuesta con los esquemas de contratos).
  Archivos: `apps/web/src/features/identity/{api,chosen-plan-storage}.ts`, `apps/web/src/features/identity/hooks/use-countdown.ts` y sus `*.spec.ts`.

- [ ] **T-61** [P] `PasswordRequirements` y `PlanPicker` — CA: CA-22, CA-5 (en vivo) — Depende: T-04, T-56 — ~2 h
  Prueba primero `password-requirements.spec.tsx` (cada regla con ícono **y** texto «Cumple»/«Falta», `aria-live=
  "polite"`, usa `evaluatePassword`) y `plan-picker.spec.tsx` (nombres y precios del catálogo recibido por *props*, sin
  valores en el código; preselecciona el plan marcado como gratuito; `unavailable` → «No pudimos cargar los planes; tu
  cuenta empezará en Personal.»; teclado; jest-axe).
  Archivos: `apps/web/src/features/identity/components/{password-requirements,plan-picker}.tsx` y sus `*.spec.tsx`.

- [ ] **T-62** `RegisterForm` — CA: CA-22, CA-6, CA-7 — Depende: T-05, T-57, T-60, T-61 — ~2 h
  Prueba primero `register-form.spec.tsx` (Testing Library + user-event): valida con `zodResolver(registerRequestSchema)`;
  errores por campo con `aria-invalid` y foco al primero; errores de la API por `fields[].field` y resumen con foco para
  los generales; estados **enviando** (botón deshabilitado con indicador, sin doble envío) y **error-servidor** (con
  `correlationId`); el plan elegido **no** se envía; casilla con dos enlaces separados; jest-axe.
  Archivos: `apps/web/src/features/identity/components/register-form.tsx`, `apps/web/src/features/identity/components/register-form.spec.tsx`.

- [ ] **T-63** [P] `CheckEmailPanel` y `ResendLinkButton` — CA: CA-13, CA-15, CA-22, CA-27 — Depende: T-60 — ~1,5 h
  Prueba primero `check-email-panel.spec.tsx` (correo escrito, «24 horas», «Cambiar correo», sin casillas de código,
  cabecera sin sesión) y `resend-link-button.spec.tsx` (deshabilitado 60 s con cuenta regresiva anunciada; al pulsar
  reinicia; `429` → estado **limite-reenvio** con el mensaje y la cuenta de `Retry-After`).
  Archivos: `apps/web/src/features/identity/components/{check-email-panel,resend-link-button}.tsx` y sus `*.spec.tsx`.

- [ ] **T-64** Página `/registro` con catálogo — CA: CA-22, CA-27, CA-28 — Depende: T-58, T-62, T-63 — ~2 h
  Prueba primero `app/(public)/registro/page.spec.tsx` (`fetch` simulado: catálogo → planes; `404`, error o más de 2 s
  → **catalogo-no-disponible** y el formulario sigue; pasa `API_PUBLIC_URL` como *prop*) y
  `features/identity/components/register-flow.spec.tsx` (éxito → «Revisa tu correo»; con plan de pago guarda
  `chosen-plan-storage`; «Cambiar correo» vuelve con nombre y plan conservados, contraseña vacía y casilla desmarcada).
  Luego `page.tsx` (Server Component, `API_INTERNAL_URL`, `revalidate: 60`), `plan-catalog.ts` (lectura del catálogo de
  006a detrás de una función, ver «Notas») y `RegisterFlow`.
  Archivos: `apps/web/src/app/(public)/registro/page.tsx`, `apps/web/src/features/identity/{plan-catalog.ts,components/register-flow.tsx}` y sus `*.spec.ts(x)`.

- [ ] **T-65** [P] Pedir enlace — CA: CA-13, CA-14, CA-15 — Depende: T-57, T-60, T-63 — ~1,5 h
  Prueba primero `request-link-form.spec.tsx` (valida con `resendVerificationRequestSchema`; éxito → mismo panel neutro
  para cualquier correo; `429` → **limite-reenvio**; prellenado desde `sessionStorage` si existe, nunca desde la URL) y
  `app/(public)/registro/pedir-enlace/page.spec.tsx`. Luego `RequestLinkForm` y la página.
  Archivos: `apps/web/src/features/identity/components/request-link-form.tsx`, `apps/web/src/app/(public)/registro/pedir-enlace/page.tsx` y sus `*.spec.tsx`.

- [ ] **T-66** Página de verificación — CA: CA-8, CA-9, CA-10, CA-11, CA-23, CA-28 — Depende: T-57, T-58, T-60 — ~2 h
  Prueba primero `verify-email-view.spec.tsx` y `hooks/use-verify-email.spec.ts`: lee `#token`, lo borra con
  `history.replaceState` antes del `POST`; **un solo** `POST` dentro de `<StrictMode>`; estados **verificando**,
  **exito** («¡Listo! Tu correo está verificado.» e «Iniciar sesión» mientras no exista 002), **plan-de-pago-elegido**
  (mensaje de CA-28 solo con `chosen-plan-storage` vigente), **ya-verificado** (sin error rojo), **enlace-expirado** y
  **enlace-invalido** con «Pedir un enlace nuevo» → `/registro/pedir-enlace`; sin fragmento o al recargar →
  **enlace-invalido**; ninguna petición a otro origen que `API_PUBLIC_URL`; jest-axe. Luego `VerifyEmailView`,
  `use-verify-email.ts` y `app/(public)/verificar-correo/page.tsx` (Client Component).
  Archivos: `apps/web/src/features/identity/components/verify-email-view.tsx`, `apps/web/src/features/identity/hooks/use-verify-email.ts`, `apps/web/src/app/(public)/verificar-correo/page.tsx` y sus `*.spec.ts(x)`.

- [ ] **T-67** **(humana)** Recorrido local completo y revisión visual — CA: CA-22, CA-23 — Depende: T-54, T-59…T-66 — ~1 h
  Con `docker compose up -d` y `pnpm dev`, por `http://localhost`: registro (con y sin catálogo) → Mailpit → enlace →
  **exito**; repetir el enlace → **ya-verificado**; enlace alterado → **enlace-invalido**; reenvío con cuenta
  regresiva; Términos y Privacidad. Anotar en la pestaña de red que el token no aparece en ninguna URL pedida al
  servidor. Pedir al `ui-designer` la revisión a 360 y 1440 px contra los mockups (produce `ui-review.md`).
  Archivos: ninguno (evidencia la recoge el `tester` en `verification.md`).

- [ ] **T-68** Cierre del PR-4 y de la spec — CA: todos (trazabilidad) — Depende: T-55…T-67 — ~1 h
  `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:isolation`, `pnpm env:check` en verde.
  `specs/README.md` → 001 `En verificación`; pedir `/verify 001` (`tester`: `verification.md`, con CA-16, CA-26 y la
  sesión de CA-29 enlazados a 002, CA-20 como pendiente de staging y la segunda parte de CA-8 a 006a),
  `security-auditor` (`security.md`: diferencias de tiempo, reenvío sin límite por IP, token en Redis) y `/review 001`.
  Marcar en «Notas del developer» cualquier desviación.
  Archivos: `specs/README.md`, `specs/001-registro-y-verificacion/tasks.md`.

## Diferidas (no forman parte de estos PR)

- **CA-20** (manual): al montar staging al inicio de la Fase 2 (redirección `http→https`, enlace `https://staging.nimbo.me/…`,
  SPF/DKIM con Resend); medir ahí la latencia p95 del registro con 25 concurrentes (RN-3, RNF-02).
- **E2E** `e2e/registro.e2e.ts` y `e2e/verificar-correo.e2e.ts` con Playwright + axe a 360/1440 px: PD-41, Fase 2.
- **CA-16, CA-26, CA-29 (sesión)**: en 002. **CA-8 (suscripción Personal)**: en 006a (PD-40).

## Matriz CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-02, T-06, T-22, T-29, T-33, T-34, T-36, T-45, T-46 | CA-15 | T-02, T-07, T-08, T-12, T-13, T-17, T-36, T-44, T-49, T-52, T-57, T-63 |
| CA-2 | T-33, T-35, T-36, T-46 | CA-16 | 002 |
| CA-3 | T-06, T-14, T-28, T-36, T-39, T-46 | CA-17 | T-06, T-28, T-34, T-50 |
| CA-4 | T-29, T-34, T-36, T-46 | CA-18 | T-09, T-10, T-21, T-23, T-25, T-36, T-50 |
| CA-5 | T-01, T-03, T-04, T-05, T-43, T-47, T-52, T-61 | CA-19 | T-39, T-41, T-50 |
| CA-6 | T-01, T-05, T-15, T-17, T-43, T-47, T-52, T-62 | CA-20 | T-10, T-55 (esquema); manual en Fase 2 |
| CA-7 | T-05, T-15, T-29, T-43, T-47, T-62 | CA-21 | T-11, T-20…T-25, T-51 |
| CA-8 | T-30, T-38, T-42, T-45, T-48, T-66 (+ 006a) | CA-22 | T-04, T-05, T-56…T-64, T-67 |
| CA-9 | T-30, T-38, T-48, T-66 | CA-23 | T-02, T-59, T-66, T-67 |
| CA-10 | T-30, T-38, T-40, T-48, T-66 | CA-26 | 002 |
| CA-11 | T-05, T-28, T-30, T-38, T-40, T-48, T-66 | CA-27 | T-63, T-64 |
| CA-12 | T-38, T-40 (parcial; se completa en 002 y 003) | CA-28 | T-60, T-64, T-66 |
| CA-13 | T-34, T-37, T-49, T-60, T-63, T-65 | CA-29 | T-14, T-38, T-40, T-48 (token); sesión en 002 |
| CA-14 | T-37, T-49, T-52, T-65 | | |

Tareas por PR: PR-1 = 19 (T-01…T-19) · PR-2 = 8 (T-20…T-27) · PR-3 = 27 (T-28…T-54) · PR-4 = 14 (T-55…T-68).

## Notas del developer

- **T-28, T-29 y T-30**: 30 pruebas del dominio en verde. `OpaqueToken.toString()` devuelve el valor; `PasswordHash` sigue redactado. Los errores de transición viven en el archivo de la entidad. Jest se corrió directo con Node 24 porque `pnpm` exige Node 22.
  **Revisión (2026-09-28, commit de Cursor `0a6e379`)**: coinciden con plan §6.1–§6.2 (nombres, inmutabilidad,
  `issue` con vencimiento ya calculado, dominio sin `contracts`). Diferencias sin impacto: `OpaqueToken.matchesHash`
  es estático (`matchesHash(valor, hashGuardado)`) y además hay `hash()` de instancia; `ClientUser.rehydrate` e
  `InternalUser.rehydrate` (este rechaza `CLIENT`) para los mappers de T-39; `VerifiedAccountReplacementError` e
  `InvalidTokenTransitionError` son `Error` internos, no `DomainError` (nunca llegan al cliente). Se corrigió el
  formato de Prettier de dos pruebas (fallaba `pnpm lint`) y se antepuso `CA-n:` a los nombres de prueba (Art. II).

- **Catálogo de 006a (T-64)**: el plan fija qué necesita 001 (lectura pública de planes activos con `id`, nombre, precio
  en centavos y marca de gratuito, PD-40) pero no la ruta ni el esquema, que son de 006a. `plan-catalog.ts` aísla esa
  lectura; si el contrato de 006a no está en `packages/contracts` al llegar a T-64, se implementa con la ruta que
  proponga el plan de 006a y cualquier fallo cae en **catalogo-no-disponible** (CA-22).
- **Marcador `iniciar-sesion` (T-58)**: 002 se implementa el mismo día; si su página llega antes, T-58 solo agrega
  `PublicHeader` y enlaza a la ruta real.
- **T-03, tamaño de la lista común (hallazgo, sin desviación)**: con el filtro de plan §6.2 (12 a 128 puntos de
  código, número y símbolo), el top 100 000 de SecLists (`xato-net-10-million-passwords-100000.txt`, revisión
  `c205c36`) deja **solo 5 entradas**; el top 1 000 000 deja 1602 (~34 KB, dentro de la meta de 50 KB). Se implementó
  lo que dice el plan (top 100 000). La prueba fija la entrada conocida `g00dpa$$w0rd`. **Resuelto (review I-1)**:
  la fuente pasó al top 1 000 000 (`xato-net-10-million-passwords-1000000.txt`, misma revisión); la lista quedó en
  1602 entradas y 34 208 bytes, con una prueba que exige al menos 1000 entradas y casos de CA-5 con contraseñas
  comunes reales (`Password@123`, `Abcd!efg!123`, `Gaga_123_Gaga`); plan §6.2 actualizado (commit `0bacf81`).
- **T-10, forma y reglas del entorno (desviación menor)**: las reglas entre variables (`https` en `WEB_PUBLIC_URL`,
  `SMTP_TLS≠none` en staging/producción, `SMTP_USER` si hay `SMTP_PASSWORD`) exigen `superRefine`, que convierte el
  esquema en `ZodEffects` sin `.shape`, `.pick` ni `.merge`. Por eso `env.schema.ts` exporta además la **forma**
  (`apiEnvObjectSchema`, `workerEnvObjectSchema`, `ZodObject`) y `apiEnvSchema`/`workerEnvSchema` son la forma más
  sus reglas. `data-source.cli.ts` (`pick`), `check-env-example.ts` y `data-source.spec.ts` (`shape`) usan la forma;
  T-18 compone `apiEnvObjectSchema.merge(workerEnvObjectSchema)` con ambas reglas en lugar de
  `apiEnvSchema.merge(workerEnvSchema)`. La comprobación de secretos por proceso es `SECRET_KEYS satisfies
  readonly (claves de api | claves de worker)[]` en `env.schema.ts`. `CORS_ORIGIN` se entrega ya separado en
  `string[]`. Fuera de la lista de archivos se ajustaron los entornos explícitos de
  `test/int/{shared,worker}/bootstrap.int-spec.ts`, `test/int/setup/global-setup.ts` y
  `minio-config.module.spec.ts` para las variables nuevas obligatorias.
- **T-15, «`shared` no importa `contracts/identity`» (sin regla de lint)**: el lint de fronteras
  (`boundaries.js`, anunciado en `packages/config/eslint/nest.js`) aún no existe, y `contracts` solo expone su raíz,
  que desde T-05 reexporta `identity`. Hoy se cumple por construcción: `zod-validation.pipe.ts` importa únicamente
  `toFieldIssues` y recibe el esquema y la fábrica por parámetro. La regla queda para cuando llegue el lint de
  fronteras (candidata: `no-restricted-imports` con `importNames` de `identity` en `apps/api/src/shared/**`).
  **Resuelto (review I-2)**: `packages/config/eslint/shared-boundaries.js` (cableado en `eslint.config.mjs`) aplica
  `no-restricted-imports` a `apps/api/src/shared/**`: de la raíz de `@nimbo/contracts` solo admite la lista cerrada
  de nombres genéricos (salud, errores, validación) y prohíbe `@nimbo/contracts/*` y rutas a `packages/contracts`.
  Prueba: `scripts/shared-contracts-boundary.spec.ts` (ESLint real por `--stdin`). Commit `chore(config): regla de lint que impide a shared importar contratos de módulos [001]`.
- **Docker no disponible durante PR-1 (aviso de Adrián, 2026-09-28)**: no se ejecutó `pnpm test:int` ni
  `migration:run → revert → run`. Las pruebas de integración se escribieron y pasan `lint` y `typecheck`, pero su
  rojo y su verde **quedan sin comprobar**; hay que correrlas antes de fusionar el PR-1. Pendientes por tarea:
  T-06 (`test/int/identity/schema.int-spec.ts`, migraciones en el arnés y la evidencia manual `run → revert ×2 → run`),
  T-08, T-13, T-14 y T-18 (ver cada una), y las suites existentes afectadas por T-10
  (`test/int/{shared,worker}/bootstrap.int-spec.ts`).
- **T-06, migraciones en el arnés**: `test/int/setup/migrate.ts` no inicializa un `DataSource` dentro de Jest: lanza
  `tsx src/scripts/migrate.ts run` (el mismo camino que `pnpm --filter api migration:run`), porque TypeORM carga las
  migraciones `.ts` por glob y el transformador de Jest no está activo durante `globalSetup` asíncrono. Las
  migraciones se escribieron a mano con el SQL de plan §4 (no hay entidades aún para `migration:generate`).
- **T-08, prueba unitaria adicional**: sin Docker, además de ampliar `domain-exception-filter.int-spec.ts` se agregó
  `src/shared/presentation/domain-exception.filter.spec.ts` (respuesta falsa) para comprobar de verdad el rojo y el
  verde de `fields` y `Retry-After`. La suite de integración importa `TooManyRequestsError` desde `src/shared` (exportado en T-16).
- **T-13, prueba unitaria adicional**: `redis-rate-limiter.spec.ts` (Redis falso) comprueba las claves, los
  argumentos del script, el redondeo hacia arriba y la propagación de errores; la semántica del Lua (atomicidad,
  ventanas, `PTTL`) solo la cubre `redis-rate-limiter.int-spec.ts`, **sin ejecutar** por falta de Docker.
- **T-14, prueba unitaria adicional**: `transaction-context.spec.ts` (`DataSource` falso) cubre la ALS (fuera/dentro
  de `run`, tras `await`, concurrencia, resultado y error); confirmar y revertir contra Postgres solo lo cubre
  `transaction-runner.int-spec.ts`, **sin ejecutar**. `TransactionContext` es un proveedor con `manager()` y
  `runWith(manager, work)`; la ALS es privada del archivo y 003 la reutiliza vía `runWith`.
- **T-17, ejecutada sin Docker**: `configure-http-app.int-spec.ts` no importa `SharedModule` (solo `EnvModule`, el
  logger y el controlador de eco), así que no necesita contenedores. Se comprobó el rojo y el verde con
  `jest -c jest.int.config.cjs --globalSetup <archivo vacío> test/int/shared/configure-http-app`. Hallazgo: los errores
  de `body-parser` (cuerpo > 16 KB, codificación no admitida) no son `HttpException` y `DomainExceptionFilter` los
  respondía como `500`; `configureHttpApp` instala tras el analizador un traductor que los convierte en
  `HttpException` con su estado (`413` → `HTTP_413`; `400` → `VALIDATION_FAILED`, P-1).
- **T-18, entorno `api + worker` (desviación menor)**: en lugar de `apiEnvObjectSchema.merge(workerEnvObjectSchema)`
  con las reglas copiadas, `buildTestEnv(overrides, { withWorkerEnv: true })` valida la misma fuente con
  `apiEnvSchema` y con `workerEnvSchema` y une ambos resultados (`ApiWorkerEnv`). Así cada proceso conserva sus
  reglas `superRefine` sin exportar `refineApiEnv`/`refineWorkerEnv` desde `env.schema.ts` y sin tocar código de
  producción. El arnés fija `APP_VERSION = TEST_VERSION` antes de los `overrides` (la cabecera `x-nimbo-version` sale
  ahora de `configureHttpApp`) y conserva la opción `prefix` sobrescribiendo el prefijo tras `configureHttpApp`
  (la usa `worker-health.int-spec.ts` con `''`). **Sin ejecutar** por falta de Docker: todas las suites del arnés
  (`test/int/{shared,worker,identity}`, salvo `configure-http-app`) son la prueba de esta tarea.
- **T-19, cierre del PR-1 sin Docker**: en verde `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm env:check`.
  **Pendiente antes de fusionar**: `pnpm test:int` completo y `migration:run → revert → run` (ver la nota «Docker no
  disponible»). Hallazgo: `redact-deep.spec.ts` («no degrada el logger», un umbral de microsegundos) falló una vez con
  las tres suites de `pnpm test` en paralelo y pasó al repetirla; es anterior a 001 y sensible a la carga de la
  máquina (candidata a revisar en 000, sin cambios aquí).
- **T-21/T-24, API pública de `notifications` (desviación menor)**: además de lo que lista plan §6.6, `index.ts`
  exporta `assertIdempotencyKey` (T-34 la usa para comprobar la clave desde `identity`) y `MAIL_QUEUE` (lo necesita
  `WORKER_QUEUES` en `worker.module.ts`). `index.spec.ts` fija la lista exacta.
- **T-22, dependencias**: `nodemailer` `10.0.11` y `@types/nodemailer` `8.0.2` (nodemailer no trae tipos; los de
  DefinitelyTyped cubren la API usada), con versión exacta. Mailpit fijado en `axllent/mailpit:v1.31.3` en
  Testcontainers y en `compose.override.yml` (antes sin versión). La URL de la API de Mailpit viaja en
  `TEST_MAILPIT_API_URL`, variable solo de pruebas (no es de ningún esquema). `SmtpTransport` fija tiempos de espera
  (conexión y saludo 10 s, socket 20 s): con los de nodemailer (hasta 10 min), evita que un SMTP colgado bloquee
  indefinidamente el intento actual (review-pr2 I-3). Prueba unitaria
  adicional `smtp-transport.spec.ts` con un servidor SMTP falso (`node:net`) que anuncia STARTTLS: cubre `MAIL_FROM`,
  `Message-ID`, los modos `none`/`starttls` y el puerto cerrado con `code`, **ejecutada**.
- **T-23, decisiones del procesador**: `mail.retry_scheduled` solo se registra si quedan intentos (el último fallo
  solo produce `mail.failed`, desde `@OnWorkerEvent('failed')` cuando `attemptsMade ≥ attempts`); `mail.failed` lleva
  también `responseCode`. Si Redis falla al escribir la marca después de un envío aceptado, el error se propaga y el
  reintento puede duplicar el correo (lo atenúa el `Message-ID`); es el mismo riesgo que ADR-0018 acepta para una
  caída entre envío y marca.
- **T-24**: `WorkerModule.forRoot` recibe el entorno de `workerEnvSchema` (antes `SharedEnvBase`), porque
  `SmtpTransport` lee `SMTP_*` del `ENV`. `worker-health.int-spec.ts` usa `withWorkerEnv` (T-18) y detiene el Mailpit
  de la suite para comprobar que la salud no depende del SMTP. Los tres casos de configuración de
  `worker/bootstrap.int-spec.ts` (`REDIS_URL`, sin `SMTP_HOST`, `SMTP_TLS=none` en staging) no necesitan contenedores
  y se **ejecutaron** con `--globalSetup` vacío (pasan desde el principio: las reglas son del esquema de T-10; aquí
  son regresión del arranque). El caso `worker.started` con `['ping', 'mail']` se cubrió además con
  `src/worker.module.spec.ts` (rojo y verde comprobados). Se comprobó también, con una prueba desechable, que
  `NotificationsModule` + `NotificationsWorkerModule` resuelven sus dependencias en Nest.
- **T-25, retroceso inyectable**: `NotificationsModule` provee `MAIL_JOB_OPTIONS` bajo `MAIL_JOB_OPTIONS_TOKEN` y
  `SmtpMailer` lo inyecta; las pruebas lo sustituyen con la opción `overrides` del arnés (retroceso exponencial de
  2 s; era de 500 ms y dejaba una ventana ajustada al Mailpit tardío, review-pr2 I-1). Ayudante nuevo `test/int/setup/wait-for-log.ts`. La prueba de contrato agrega el caso «dos `send` con la
  misma clave entregan un solo correo» (capa 2 de idempotencia de punta a punta).
- **T-26**: `docker compose --profile apps config` **no se ejecutó** (Docker no disponible); `compose.override.yml`
  se validó parseándolo con `yaml` (el `worker` recibe `SMTP_HOST: mailpit` y `SMTP_PORT: '1025'`).
- **PR-2 sin Docker (pendiente antes de fusionar)**: en verde `pnpm lint`, `pnpm typecheck`, `pnpm test` y
  `pnpm env:check`. **Sin ejecutar**: `test/int/notifications/{smtp-mailer,smtp-transport,mailer-contract,
  mail-degradation}.int-spec.ts`, el caso `worker.started` de `test/int/worker/bootstrap.int-spec.ts`,
  `test/int/worker/worker-health.int-spec.ts` y `pnpm dev` con el `worker` consumiendo `mail` (T-27). Todas compilan
  y pasan `lint`. El `redact-deep.spec.ts` inestable (nota de T-19) volvió a fallar una vez en T-22 y pasó al repetir.
- **T-31, errores de `identity`**: los `code` son literales en `domain/errors` (el dominio no importa `contracts`,
  ADR-0008 regla 3); su igualdad con `IDENTITY_ERROR_CODES` la prueba T-43. Decisiones: (a) `IdentityTooManyRequestsError`
  recibe además `scope: 'email' | 'ip'` (plan §6.5, lo usan T-36 y el guard de T-44); (b) «N minutos» usa singular
  con 1 («en 1 minuto») y como mínimo 1, porque la espera típica es de 60 s; (c) `IdentityWeakPasswordError` une los
  mensajes de los requisitos con «; » y quita su punto final. El dominio importa de `shared/domain/errors` y no de
  `shared/index.ts` (que arrastra Nest). `index.spec.ts` fija `['CLIENT_ACCOUNT_VERIFIED']`; T-45 agrega `IdentityModule`.
- **T-33, plantillas contra el mockup (para el `ui-designer`)**: se siguió la spec y la tarea donde el mockup
  difiere: asunto «Verifica tu correo para entrar a Nimbo» (el mockup dice «Confirma tu correo en Nimbo»; se conserva
  «Confirma tu correo» como título); enlace con `#token=` (el mockup usa `?token=`, contrario a RN-8); el aviso de
  intento **no** repite el correo (la tarea pide no incluir el correo del solicitante, que es el mismo). Sin saludo por
  nombre en ninguno de los dos: en el de verificación el nombre lo escribe quien pide el registro, que puede no ser el
  dueño del buzón (texto controlado por un tercero). El botón usa `#4A6FA5` (azul profundo) y no `#6B8DD6`, porque el
  blanco sobre el azul pizarra no llega a AA. Piezas comunes en `application/mail/{mail-layout,escape-html}.ts`.
  Las plantillas reciben las URL ya armadas; la ruta de recuperación (`/recuperar-contrasena`) la fija T-35 y **debe
  confirmarla 002** (su plan aún no existe).
- **T-34, archivos adicionales**: `application/web-links.ts` (rutas de `web` que usan los correos y `webUrl`, que
  quita la barra final de `WEB_PUBLIC_URL`) y dobles de prueba reutilizables en `application/testing/`
  (`InMemoryVerificationTokenRepository`, `aClientUser()`), que T-35 a T-38 reutilizan. El id del token lo genera la
  aplicación con `randomUUID()` (lo necesita la `idempotencyKey` antes del `INSERT`).
- **T-35, archivo adicional**: `application/identity-logger.ts` (interfaz mínima `info`/`warn` que los servicios de
  `identity` reciben con `@Inject(PinoLogger)`, igual que `HealthLogger` en `shared`), para usar un doble en las
  pruebas. `WEB_PATHS.passwordRecovery = '/recuperar-contrasena'` (ya en `web-links.ts`) sigue pendiente de confirmar en 002.
- <Hallazgos y desviaciones, con enlace al registro de cambios de la spec.>
