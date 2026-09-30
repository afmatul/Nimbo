# Tareas 002 — Autenticación, sesiones y dispositivos

> Spec: `./spec.md` (Aclarada, 2026-09-26) · Plan: `./plan.md` (Aprobado, §11, cambios aplicados; la línea «Cambios
> aplicados» manda sobre §11.2–§11.4: **no hay 003-PR-E**, `JwtTokenService` implementa el puerto con `useExisting`,
> `JwtStrategy.validate` devuelve `[false, { reason }]`, `SessionResponse.user = { id, fullName, email, role }`)
> Leyenda: `[P]` paralelizable con otras `[P]` del mismo bloque (no comparten archivos) · `[P×PR]` puede empezar
> antes de que se integre el PR del que depende su bloque (ver «Paralelismo entre PR») · `(humana)` la hace una
> persona · Cada tarea ≤ 1 h y un commit.
> Dueño: Adrián. Commits con Conventional Commits y sufijo `[002 T-xx]`.
>
> - **Seis PR parciales** (plan §6.11), cada uno con su bloque completo y con `pnpm lint`, `pnpm typecheck`,
>   `pnpm test`, `pnpm test:int` y `pnpm test:isolation` en verde en local. Ramas: `feat/002-sesiones-contratos`
>   (PR-1) → `feat/002-sesiones-backend` (PR-2) → `feat/002-recuperacion` (PR-3) y `feat/002-seguridad-backend`
>   (PR-4) en paralelo; `feat/002-web-sesion` (PR-5a) → `feat/002-web-seguridad` (PR-5b).
> - **Dependencias externas** (números de tarea de `specs/001-registro-y-verificacion/tasks.md` y PR del plan 003):
>   PR-1 ⇐ **001-PR-1**; PR-2 ⇐ **001-PR-3** (y por él 001-PR-1 y 001-PR-2) + **003-PR-A**; PR-3 y PR-4 ⇐ 002-PR-2;
>   PR-5a ⇐ **001-PR-4** + 002-PR-1; PR-5b ⇐ PR-5a. Orden con 003: **003-PR-A → 002-PR-2 → 002-PR-4**.
> - **Pruebas primero**: toda tarea de código escribe su prueba antes (rojo → verde → refactor) en la misma tarea.
>   Nombres de prueba `'CA-n: …'` (Art. II). Las tareas sin lógica (tipos de puertos) se prueban a través de la tarea
>   que las usa, y lo dicen.
> - **Sin E2E con Playwright** (PD-41, Fase 2): CA-27 y CA-28 se cubren con pruebas de componentes con jest-axe, la
>   revisión del `ui-designer` a 360 y 1440 px y la comprobación manual en `verification.md`.
> - **Sin dependencias nuevas**: `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/jwt` y
>   `@types/passport-jwt` las instala 003-PR-A (ADR-0017). Nada de librerías de agente de usuario ni de cookies (DT-9).
> - **Recortables a Fase 2 si no llegan el 30/09: PR-4 y PR-5b** (plan §9 y §11.4; **decisión de Adrián pendiente**).
>   Orden de recorte: primero PR-5b, después PR-4. Si se recortan, se dice en la entrega y la spec no pasa a `Hecha`;
>   no se recorta ningún CA en silencio. Mínimo defendible: PR-1, PR-2, PR-3 y PR-5a.
> - `verification.md`, `security.md`, `ui-review.md` y `review.md` se producen una sola vez, con el último PR que se
>   integre (PR-5b, o PR-5a si se recortan PR-4 y PR-5b).

## Paralelismo entre PR

```
001-PR-1 ──► PR-1  T-01…T-09 ─ T-10 cierre ──────────────────────────────────────────► merge PR-1
hoy       ─► PR-2  T-11…T-17 [P×PR] (dominio puro y puertos)
001-PR-3 + 003-PR-A + PR-1 ─► PR-2 T-18…T-56 ─ T-57 cierre ──► merge PR-2 ⇒ desbloquea 003 (tokens reales) y 015
                   PR-3  T-58…T-62 [P×PR] (plantillas y servicio con dobles) ─ T-63…T-68 ─ T-69 ──► merge PR-3
                   PR-4  T-70…T-72 [P×PR] (servicios con dobles) ─ T-73…T-79 ─ T-80 ──► merge PR-4   (recortable)
001-PR-4 + PR-1 ─► PR-5a T-81…T-93 ─ T-94 (humana, necesita PR-2 y PR-3) ─ T-95 ──► merge PR-5a
                   PR-5b T-96…T-103 ─ T-104 (humana, necesita PR-4) ─ T-105 cierre de la spec     (recortable; Q-3, Q-4)
```

### Qué se puede empezar hoy (sin esperar a 001-PR-3 ni a 003-PR-A)

| Tarea | Requiere | Por qué |
|---|---|---|
| PR-2: **T-12, T-13** (`Session`), **T-14** (`Device`), **T-15** (`UserAgentSummary`) | nada | Dominio puro: no importa `contracts` ni infraestructura (ADR-0008 regla 3); las duraciones llegan como argumentos |
| PR-2: **T-17** (puertos, incluido `IAttemptLockout`) | T-12, T-14 | Solo tipos |
| PR-2: **T-11** (`RefreshToken`) | 001 T-28 (`OpaqueToken`, dominio de 001 que también empieza hoy) | Usa `OpaqueToken.generate/hashOf/isWellFormed`. Se apila sobre la rama de 001 con T-28 hecho |
| PR-2: **T-16** (errores) | 001 T-07 (001-PR-1: `TooManyRequestsError`) | Las demás bases (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `InvalidInputError`) ya están en `shared` |
| PR-1: **T-01…T-09** (contratos, migraciones, `shared`) | 001-PR-1 (rama o `main`) | Amplían archivos que crea 001-PR-1 (`parameters.ts`, `error-codes.ts`, `schemas.ts`, `legal.ts`, migraciones de `usuario`, `configureHttpApp`, `REDACTED_FIELDS`, `apiEnvSchema`) |
| PR-5a: **T-83** (`refresh-coordinator`) | T-02 | Función con `fetch` inyectado; solo usa los códigos de error |

- **Después, sin esperar el merge de 001-PR-3** (apilado sobre su rama, en cuanto exista la tarea de 001 indicada):
  T-27…T-29 y T-58, T-59 (plantillas, tras 001 T-33); T-30…T-35, T-60…T-62 y T-70…T-72 (servicios con dobles, tras
  001 T-14, T-20, T-32, T-34 y T-41). Todo lo que toca `@nestjs/jwt`, Passport, el puerto o los decoradores de 003
  (T-24…T-26, T-39 en adelante, T-53…T-55, T-73, T-74) espera a **003-PR-A**.
- Con dos personas: una sigue la ruta crítica (PR-1 → infraestructura y presentación de PR-2 → PR-3); la otra hace el
  dominio y los servicios con dobles y, en cuanto existan T-01…T-04 y 001-PR-4, la web de PR-5a.
- **Lo que desbloquea a 003**: T-55 (tokens reales en su arnés de aislamiento), T-53 y T-54 (su suite de contrato con
  el verificador real), T-81/T-86/T-87 (grupo `(app)`, sesión con `role` y `fullName`, `homePathFor`) para 003-PR-F.
- **Lo que desbloquea a 015**: T-39 (`I_ACCESS_TOKEN_VERIFIER` exportado por `IdentityModule`).

## Bloque 1 — PR-1 «contratos, migraciones y shared» (plan §4, §5, §6.7, §6.10) · depende de 001-PR-1

- [x] **T-01** [P] Parámetros de §6 de la spec — CA: CA-1, CA-5, CA-6, CA-8, CA-9, CA-23 — Depende: 001 T-02 (001-PR-1) — ~0,5 h
  Prueba primero: ampliar `packages/contracts/src/identity/constants.spec.ts` con `ACCESS_TOKEN_TTL_SECONDS = 900`,
  `SESSION_IDLE_TIMEOUT_DAYS = 7`, `SESSION_MAX_LIFETIME_DAYS = 30`, `REFRESH_ROTATION_GRACE_SECONDS = 10`,
  `LOGIN_MAX_FAILURES = 5`, `LOGIN_FAILURE_WINDOW_MINUTES = 15`, `LOGIN_LOCK_MINUTES = 15`, `LOGIN_ATTEMPTS_PER_IP = 20`,
  `LOGIN_IP_WINDOW_MINUTES = 15`, `RESET_LINK_TTL_MINUTES = 60`, `PASSWORD_CHANGE_MAX_FAILURES = 5`,
  `PASSWORD_CHANGE_WINDOW_MINUTES = 15`, `PASSWORD_CHANGE_LOCK_MINUTES = 15`, `DEVICE_COOKIE_MAX_AGE_DAYS = 365`; la
  recuperación **no** define límites propios (reutiliza `EMAIL_REQUEST_COOLDOWN_SECONDS` y `EMAIL_REQUESTS_PER_HOUR`).
  Luego `parameters.ts`.
  Archivos: `packages/contracts/src/identity/parameters.ts`, `packages/contracts/src/identity/constants.spec.ts`.

- [x] **T-02** [P] Códigos de error, `reason` `WRONG_PASSWORD` y `SUPPORT_CONTACT_EMAIL` — CA: CA-2…CA-6, CA-8…CA-10, CA-12, CA-20, CA-23 — Depende: 001 T-02 (001-PR-1) — ~0,5 h
  Prueba primero `packages/contracts/src/identity/error-codes.spec.ts`: `IDENTITY_ERROR_CODES` contiene los de 001 más
  `IDENTITY_INVALID_CREDENTIALS`, `IDENTITY_EMAIL_NOT_VERIFIED`, `IDENTITY_ACCOUNT_SUSPENDED`, `IDENTITY_LOGIN_LOCKED`,
  `IDENTITY_REFRESH_INVALID`, `IDENTITY_SESSION_EXPIRED`, `IDENTITY_SESSION_REVOKED`, `IDENTITY_SESSION_NOT_FOUND`,
  `IDENTITY_RESET_LINK_EXPIRED`, `IDENTITY_RESET_LINK_INVALID`, `IDENTITY_WRONG_PASSWORD`,
  `IDENTITY_PASSWORD_CHANGE_LOCKED`; `FIELD_ISSUE_REASONS` incluye `WRONG_PASSWORD`; y en `constants.spec.ts` que
  `SUPPORT_CONTACT_EMAIL` existe una sola vez en `legal.ts` (si 001 ya la exportó, solo se prueba). Luego los archivos.
  Archivos: `packages/contracts/src/identity/{error-codes,legal}.ts`, `packages/contracts/src/identity/error-codes.spec.ts`.

- [x] **T-03** Esquemas de petición — CA: CA-1, CA-18, CA-20, CA-21, CA-22 — Depende: T-01, 001 T-05 (001-PR-1) — ~1 h
  Prueba primero `packages/contracts/src/identity/schemas.spec.ts` (ampliado): `loginRequestSchema` y
  `forgotPasswordRequestSchema` estrictos (clave extra → `UNKNOWN_FIELD`; correo mal formado → `422` de 001);
  `resetTokenRequestSchema` `{ token }`; `resetPasswordRequestSchema` `{ token, password }` con la política D-6 de 001
  **sin** la regla del correo; `changePasswordRequestSchema` `{ currentPassword, newPassword }` estricto, sin campo de
  confirmación (D-7). Luego `schemas.ts`.
  Archivos: `packages/contracts/src/identity/schemas.ts`, `packages/contracts/src/identity/schemas.spec.ts`.

- [x] **T-04** Esquemas de respuesta — CA: CA-1, CA-11, CA-13, CA-15 — Depende: T-03 (mismo archivo) — ~1 h
  Prueba primero (mismo `schemas.spec.ts`): `sessionResponseSchema` `{ accessToken, accessTokenExpiresAt (ISO-8601 UTC),
  user: { id, fullName, email, role } }`; `sessionSummarySchema` `{ id, browser, os, deviceKind: 'desktop'|'mobile'|'tablet',
  startedAt, lastActiveAt, current }` estricto (rechaza `ip`, `userAgent`, `deviceId`); `sessionListResponseSchema`
  `{ items }` con máximo 50; `revokeOthersResponseSchema` `{ revokedCount }`; `verifyEmailResponseSchema` acepta
  `{ status: 'verified', session? }` y `{ status: 'already-verified' }` sin `session` (aditivo: los casos de 001 siguen
  en verde). Luego `schemas.ts`.
  Archivos: `packages/contracts/src/identity/schemas.ts`, `packages/contracts/src/identity/schemas.spec.ts`.

- [x] **T-05** [P] Migración `crear-dispositivo` — CA: CA-16, CA-17, CA-24 — Depende: 001 T-06 (001-PR-1) — ~1 h
  Prueba primero `apps/api/test/int/identity/device-session-migrations.int-spec.ts`: `huella_hash` rechaza lo que no
  sea hex de 64; `UNIQUE (usuario_id, huella_hash)` (misma huella en dos cuentas sí se permite); `agente_usuario`
  por defecto `''`; `ultima_ip` es `inet`; borrar el `usuario` borra sus dispositivos; `run → revert → run` limpio.
  Luego `20260929100000-crear-dispositivo.ts` con el SQL de plan §4 (sin `nombre` ni `creado_en`).
  Archivos: `apps/api/src/migrations/20260929100000-crear-dispositivo.ts`, `apps/api/test/int/identity/device-session-migrations.int-spec.ts`.

- [x] **T-06** Migración `crear-sesion` — CA: CA-1, CA-7, CA-8, CA-24 — Depende: T-05 (misma prueba) — ~1 h
  Prueba primero (mismo archivo): la FK compuesta rechaza una sesión cuyo `usuario_id` no es el dueño del dispositivo;
  `ck_sesion_rotacion` exige `refresh_anterior_hash` y `rotado_en` juntos; `ck_sesion_vigencia`; hashes hex de 64;
  existen `idx_sesion_usuario_id_ultimo_uso` (parcial) e `idx_sesion_dispositivo_id_usuario_id`; borrar el dispositivo
  borra sus sesiones; `nimbo_app` tiene `SELECT/INSERT/UPDATE/DELETE` en las dos tablas **si** los privilegios por
  defecto de 003 ya están (si no, el caso queda `it.todo` con nota); `revert` deshace en LIFO. Luego la migración.
  Archivos: `apps/api/src/migrations/20260929100100-crear-sesion.ts`, `apps/api/test/int/identity/device-session-migrations.int-spec.ts`.

- [x] **T-07** [P] CORS con credenciales en `configureHttpApp` — CA: CA-1, CA-7, CA-28 — Depende: 001 T-17 (001-PR-1) — ~0,5 h
  Prueba primero en la prueba existente de `configureHttpApp`: la respuesta *preflight* desde `CORS_ORIGIN` lleva
  `Access-Control-Allow-Credentials: true`, permite `authorization` y `DELETE`; un origen no listado no recibe
  cabeceras CORS; nunca `*` con credenciales. Luego `configure-http-app.ts`.
  Archivos: `apps/api/src/shared/presentation/configure-http-app.ts` y su prueba.

- [x] **T-08** [P] `REDACTED_FIELDS` + `currentPassword`, `newPassword` — CA: CA-25 — Depende: 001 T-09 (001-PR-1) — ~0,5 h
  Prueba primero `apps/api/src/shared/infrastructure/logging/redacted-fields.spec.ts`: un objeto con `currentPassword` y
  `newPassword` anidados sale `[REDACTED]`; `authorization`, `cookie`, `token`, `accessToken`, `refreshToken` siguen
  redactados. Luego `redacted-fields.ts`.
  Archivos: `apps/api/src/shared/infrastructure/logging/redacted-fields.ts`, `apps/api/src/shared/infrastructure/logging/redacted-fields.spec.ts`.

- [x] **T-09** [P] `JWT_ACCESS_SECRET` (esquema, secreto, `.env.example`, `env:check`) — CA: CA-26 (clave), CA-25 — Depende: 001 T-10 (001-PR-1) — ~1 h
  Prueba primero `apps/api/src/shared/infrastructure/config/env.schema.spec.ts`: sin la variable falla al arrancar;
  menos de 32 caracteres falla; con `APP_ENV=staging` exige ≥ 43 y distinta del valor de `.env.example`; está en
  `SECRET_KEYS` y **solo** en `apiEnvSchema` (no en el del `worker`); y `scripts/check-env-example.spec.ts` suma el caso
  `NEXT_PUBLIC_JWT_ACCESS_SECRET` (debe fallar). Luego el esquema, `secret-keys.ts` y `.env.example` (valor de
  desarrollo marcado como tal).
  Archivos: `apps/api/src/shared/infrastructure/config/{env.schema,secret-keys}.ts`, `apps/api/src/shared/infrastructure/config/env.schema.spec.ts`, `scripts/check-env-example.spec.ts`, `.env.example`.

- [x] **T-10** Documentación y cierre del PR-1 — CA: n/a — Depende: T-01…T-09 — ~0,5 h
  README de `shared` (CORS con credenciales y por qué nunca comodín; `JWT_ACCESS_SECRET` como secreto del `api`).
  `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm env:check` en verde. Descripción del PR con los
  archivos de 001 que amplía. `docs/operations/ambientes.md` (secreto en staging) queda **diferido** al montar staging.
  Archivos: `apps/api/src/shared/README.md`.

## Bloque 2 — PR-2 «inicio de sesión y sesiones (backend)» (plan §6.1–§6.8) · depende de 001-PR-3, 002-PR-1 y 003-PR-A

### 2a. Dominio y puertos (pruebas primero; empiezan hoy, [P×PR])

- [x] **T-11** [P] [P×PR] `RefreshToken` — CA: CA-7, CA-9, CA-24 — Depende: 001 T-28 (`OpaqueToken`, dominio de 001-PR-3, empezable hoy) — ~1 h
  Prueba primero `apps/api/src/modules/identity/domain/refresh-token.vo.spec.ts`: `issue(sessionId)` da
  `<uuid>.<43 base64url>` y expone `secretHash` = SHA-256 hex del secreto (nunca el valor en `toJSON`); dos emisiones
  distintas; `parse` acepta solo un uuid, **un** punto y un secreto bien formado (rechaza vacío, sin punto, dos puntos,
  uuid inválido, secreto de 42/44 caracteres o con `+/=`); `parse(v).sessionId` y `secretHash` coinciden con `issue`.
  Archivos: `apps/api/src/modules/identity/domain/refresh-token.vo.ts`, `apps/api/src/modules/identity/domain/refresh-token.vo.spec.ts`.

- [x] **T-12** [P] [P×PR] `Session`: `open` y `stateAt` — CA: CA-1, CA-8, CA-10 — Depende: — — ~1 h
  Prueba primero `apps/api/src/modules/identity/domain/session.entity.spec.ts`: `open({ id, userId, deviceId,
  secretHash, now, maxLifetime })` → `creadaEn = ultimoUso = now`, `expiraEn = now + maxLifetime`, sin anterior ni
  `rotadoEn`; `stateAt(now, idle)`: `revoked` si `revocadaEn`; `expired` en `expiraEn` exacto, en `ultimoUso + idle`
  exacto y 1 s después; `active` 1 s antes de cada límite. Inmutable (Art. VII.7).
  Archivos: `apps/api/src/modules/identity/domain/session.entity.ts`, `apps/api/src/modules/identity/domain/session.entity.spec.ts`.

- [x] **T-13** [P×PR] `Session`: `matchSecret`, `rotate`, `revoke`, `refreshCookieMaxAge` — CA: CA-7, CA-8, CA-9 — Depende: T-12 (mismo archivo) — ~1 h
  Prueba primero (mismo archivo): `matchSecret(hash, now, grace)` → `current`; `previousWithinGrace` a los 0 s y a los
  10 s de `rotadoEn`; `reuse` a los 10 s + 1 ms, con un hash anterior al anterior y con uno falsificado; compara con
  `timingSafeEqual` (espía). `rotate(newHash, now)` devuelve una instancia nueva con anterior = vigente,
  `rotadoEn = ultimoUso = now` y deja la original intacta; `revoke(now)` idempotente (conserva la primera fecha);
  `refreshCookieMaxAge(now, idle) = min(idle, expiraEn − now)` en el día 1 y en el día 29,5.
  Archivos: `apps/api/src/modules/identity/domain/session.entity.ts`, `apps/api/src/modules/identity/domain/session.entity.spec.ts`.

- [x] **T-14** [P] [P×PR] `Device` — CA: CA-16, CA-17 — Depende: — — ~0,5 h
  Prueba primero `apps/api/src/modules/identity/domain/device.entity.spec.ts`: `register` trunca `userAgent` a 512
  caracteres (y acepta vacío); guarda solo `secretHash`; `seen({ userAgent, ip, now })` devuelve una instancia nueva con
  `ultimoAcceso`, `agenteUsuario` y `ultimaIp` actualizados.
  Archivos: `apps/api/src/modules/identity/domain/device.entity.ts`, `apps/api/src/modules/identity/domain/device.entity.spec.ts`.

- [x] **T-15** [P] [P×PR] `UserAgentSummary.parse` — CA: CA-11, CA-16 — Depende: — — ~1 h
  Prueba primero `apps/api/src/modules/identity/domain/user-agent-summary.vo.spec.ts` con una muestra de cadenas reales
  (fijadas en la prueba): Edge/Windows, Chrome/macOS, Safari/iOS (móvil), Safari/iPadOS (tableta), Chrome/Android
  (móvil), Samsung Internet, Opera, Firefox/Linux, Chrome/ChromeOS; Edge **antes** que Chrome y Chrome antes que Safari;
  vacío o desconocido → «Navegador desconocido» / «Sistema desconocido» / `desktop`. Función pura (DT-9).
  Archivos: `apps/api/src/modules/identity/domain/user-agent-summary.vo.ts`, `apps/api/src/modules/identity/domain/user-agent-summary.vo.spec.ts`.

- [x] **T-16** [P×PR] Errores nuevos de `identity` — CA: CA-2…CA-5, CA-8…CA-10, CA-12, CA-20, CA-23 — Depende: 001 T-07 (001-PR-1), 001 T-31 (patrón y carpeta) — ~1 h
  Prueba primero `apps/api/src/modules/identity/domain/errors/session-errors.spec.ts`: cada una de las 12 clases de
  plan §6.1 con su `code`, su `status` por herencia (401, 403, 404, 422 o 429, DT-14) y el mensaje de plan §5;
  `LoginLockedError` y `PasswordChangeLockedError` llevan `retryAfterSeconds` y «N minutos» con `ceil(s/60)`;
  `WrongPasswordError` lleva `fields: [{ field: 'currentPassword', reason: 'WRONG_PASSWORD' }]`;
  `AccountSuspendedError` recibe el correo de contacto por constructor (el dominio no importa `contracts`); los
  `code` coinciden con `IDENTITY_ERROR_CODES` (la prueba sí importa `contracts`). Luego `domain/errors/*.ts`.
  Archivos: `apps/api/src/modules/identity/domain/errors/**`.

- [x] **T-17** [P×PR] Puertos de `identity` (incluido `IAttemptLockout`) y `ClientContext` — CA: n/a (contratos internos) — Depende: T-12, T-14 — ~0,5 h
  `i-session-repository.port.ts` (`insert`, `findByIdForUpdate`, `update`, `listActive(userId, now, idleCutoff, limit)`,
  `revokeIfActive(id, userId, now): Promise<boolean>`, `revokeAllExcept(userId, exceptId | null, now): Promise<number>`),
  `i-device-repository.port.ts` (`upsertSeen(device): Promise<{ deviceId; isNew }>`), `i-token-service.port.ts`
  (`issueAccessToken({ userId, role, sessionId }): Promise<{ token; expiresAt }>`), `i-attempt-lockout.port.ts`
  (`check`, `recordFailure(key, policy)`, `clear`; `LockState`, `LockoutPolicy`), `client-context.ts` y los
  símbolos de inyección. Sin lógica: se prueban con T-18, T-21…T-24 y T-30…T-35.
  Archivos: `apps/api/src/modules/identity/application/ports/{i-session-repository,i-device-repository,i-token-service,i-attempt-lockout}.port.ts`, `apps/api/src/modules/identity/application/client-context.ts`.

### 2b. Infraestructura

- [x] **T-18** `RedisAttemptLockout`: `recordFailure` y `check` (contrato de `IAttemptLockout`) — CA: CA-5, CA-23 — Depende: T-17, 001 T-12 (`REDIS_CLIENT`) — ~1 h
  Prueba primero `apps/api/test/int/identity/redis-attempt-lockout.int-spec.ts` (Redis real, `FixedClock`): 4 fallos
  → `locked: false`; el 5.º → `locked` con `retryAfterSeconds = 900`; fallos fuera de la ventana de 15 min no cuentan;
  `check` a los 14 min 59 s bloqueado (1 s restante redondeado hacia arriba) y a los 15 min libre; las claves en Redis
  no contienen el correo. Luego el adaptador con un script Lua por operación y `now` de `IClock`.
  Archivos: `apps/api/src/modules/identity/infrastructure/redis-attempt-lockout.ts`, `apps/api/test/int/identity/redis-attempt-lockout.int-spec.ts`.

- [x] **T-19** `RedisAttemptLockout`: `clear`, concurrencia y Redis caído — CA: CA-5, CA-19, CA-23 — Depende: T-18 — ~0,5 h
  Prueba primero (mismo archivo): `clear` quita bloqueo y fallos; 10 `recordFailure` simultáneos con `maxFailures = 5`
  dejan un bloqueo y ninguna excepción; con el cliente desconectado `check` **lanza** (falla cerrado, plan §9).
  Archivos: `apps/api/src/modules/identity/infrastructure/redis-attempt-lockout.ts`, `apps/api/test/int/identity/redis-attempt-lockout.int-spec.ts`.

- [x] **T-20** Entidades ORM y mappers de `sesion` y `dispositivo` — CA: CA-17, CA-24 — Depende: T-05, T-06, T-12…T-14, 001 T-39 (patrón) — ~1 h
  Prueba primero `infrastructure/persistence/{session,device}.mapper.spec.ts`: ida y vuelta dominio ↔ ORM conserva todos
  los campos (fechas `timestamptz`, `inet` como texto); el dominio nunca recibe `huella_hash` en claro (solo hash).
  Luego `sesion.orm-entity.ts`, `dispositivo.orm-entity.ts` y los dos mappers.
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/{sesion.orm-entity,dispositivo.orm-entity,session.mapper,device.mapper}.ts` y los `*.spec.ts` de los mappers.

- [x] **T-21** [P] `TypeOrmDeviceRepository.upsertSeen` — CA: CA-16, CA-17 — Depende: T-20, 001 T-14 (`TransactionContext`) — ~1 h
  Prueba primero `apps/api/test/int/identity/typeorm-device.repository.int-spec.ts`: primera vez `isNew = true`;
  segunda con la misma huella `isNew = false` y actualiza `ultimo_acceso`, `agente_usuario`, `ultima_ip`; misma huella
  en otra cuenta → otra fila; dos `upsertSeen` simultáneos con la misma huella → una fila y un solo `isNew = true`
  (DT-19). Luego el repositorio (`INSERT … ON CONFLICT … RETURNING id, (xmax = 0)`).
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/typeorm-device.repository.ts`, `apps/api/test/int/identity/typeorm-device.repository.int-spec.ts`.

- [x] **T-22** [P] `TypeOrmSessionRepository`: `insert`, `findByIdForUpdate`, `update` — CA: CA-7, CA-9 — Depende: T-20, 001 T-14 — ~1 h
  Prueba primero `apps/api/test/int/identity/typeorm-session.repository.int-spec.ts`: ida y vuelta; `findByIdForUpdate`
  dentro de una transacción bloquea a una segunda transacción hasta el commit (serializa dos renovaciones); id
  inexistente → `null`. Luego el repositorio.
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/typeorm-session.repository.ts`, `apps/api/test/int/identity/typeorm-session.repository.int-spec.ts`.

- [x] **T-23** `TypeOrmSessionRepository`: `listActive`, `revokeIfActive`, `revokeAllExcept` — CA: CA-11, CA-12, CA-13, CA-19, CA-22 — Depende: T-22 (mismos archivos) — ~1 h
  Prueba primero (mismo archivo): `listActive` excluye revocadas, vencidas por 30 d y por 7 d sin uso y las de otra
  cuenta, respeta el límite y trae `agente_usuario` por `JOIN` sin `huella_hash`, `ultima_ip` ni hashes;
  `revokeIfActive` con `userId` ajeno o ya revocada → `false` sin cambios; `revokeAllExcept(u, actual)` y
  `revokeAllExcept(u, null)` devuelven el número y no tocan otras cuentas. Todo `userId` va en el `WHERE` (Art. IX.2).
  Archivos: `apps/api/src/modules/identity/infrastructure/persistence/typeorm-session.repository.ts`, `apps/api/test/int/identity/typeorm-session.repository.int-spec.ts`.

- [x] **T-24** `ACCESS_TOKEN_OPTIONS` y `JwtTokenService.issueAccessToken` — CA: CA-1, CA-26 — Depende: T-09, T-17, **003-PR-A** (`@nestjs/jwt` instalado) — ~1 h
  Prueba primero `apps/api/src/modules/identity/infrastructure/jwt/jwt-token.service.spec.ts`: con `FixedClock`, el JWT
  decodificado tiene **exactamente** `sub`, `rol`, `sid`, `iat`, `exp` (sin `iss`, `aud`, correo ni nombre), cabecera
  `alg: HS256`, `exp − iat = 900` y `expiresAt` ISO igual a `exp`. Luego `access-token-options.ts` (proveedor único:
  `secret`, `algorithms: ['HS256']`, `ttlSeconds`) y `issueAccessToken` (`iat`/`exp` calculados con `IClock`).
  Archivos: `apps/api/src/modules/identity/infrastructure/jwt/{access-token-options,jwt-token.service}.ts`, `apps/api/src/modules/identity/infrastructure/jwt/jwt-token.service.spec.ts`.

- [x] **T-25** `JwtTokenService.verify` (implementa `IAccessTokenVerifier`) — CA: CA-26, CA-12 — Depende: T-24, **003-PR-A** (puerto y tipos en `shared/application/auth/`) — ~1 h
  Prueba primero (mismo `jwt-token.service.spec.ts`): válido → `{ valid: true, claims: { userId, role, sessionId } }`;
  a los 900 s según `FixedClock` → `{ valid: false, reason: 'expired' }`; alterado, otra clave, `alg: none`, `HS512`,
  `sub`/`sid` no uuid, `rol` fuera de `Role`, *claim* de más o de menos → `{ valid: false, reason: 'invalid' }`;
  **nunca lanza**. Luego `verify` con `verifyAsync(token, { secret, algorithms, clockTimestamp })` y
  `parseAccessTokenClaims` **privada**.
  Archivos: `apps/api/src/modules/identity/infrastructure/jwt/jwt-token.service.ts`, `apps/api/src/modules/identity/infrastructure/jwt/jwt-token.service.spec.ts`.

- [x] **T-26** `JwtStrategy` que delega en el puerto — CA: CA-26 — Depende: T-25, **003-PR-A** (`ACCESS_TOKEN_STRATEGY`) — ~1 h
  Prueba primero `apps/api/src/modules/identity/infrastructure/jwt/jwt.strategy.spec.ts` (puerto falso): nombre
  `ACCESS_TOKEN_STRATEGY`; opciones `secretOrKey`/`algorithms` tomadas de `ACCESS_TOKEN_OPTIONS`,
  `ignoreExpiration: true`, `passReqToCallback: true`, extractor Bearer; `validate(req)` → `valid` devuelve `claims`
  tal cual; `{ valid: false, reason }` devuelve `[false, { reason }]` **sin lanzar**; no interpreta *claims* ni crea
  `Actor`. Luego `jwt.strategy.ts`.
  Archivos: `apps/api/src/modules/identity/infrastructure/jwt/jwt.strategy.ts`, `apps/api/src/modules/identity/infrastructure/jwt/jwt.strategy.spec.ts`.

### 2c. Aplicación

- [x] **T-27** [P×PR] Extraer `guatemala-date.format.ts` — CA: CA-16 — Depende: 001 T-33 (plantilla de aviso de intento) — ~0,5 h
  Prueba primero `application/mail/guatemala-date.format.spec.ts`: `2026-09-27T02:30:00Z` → fecha y hora de Guatemala
  (20:30 del 26/09) con `es-GT`; las pruebas de `registration-attempt-mail.template.spec.ts` de 001 siguen en verde
  tras usar el formateador (refactor sin cambio de salida).
  Archivos: `apps/api/src/modules/identity/application/mail/{guatemala-date.format,guatemala-date.format.spec,registration-attempt-mail.template}.ts`.

- [x] **T-28** [P] [P×PR] Plantilla «Nuevo inicio de sesión en Nimbo» — CA: CA-16 — Depende: T-27 — ~0,5 h
  Prueba primero `application/mail/new-device-mail.template.spec.ts`: asunto exacto; texto y HTML con navegador ·
  sistema, fecha y hora de Guatemala y enlace `{webPublicUrl}/cuenta/seguridad`; sin IP ni agente completo; HTML
  escapado con estilos en línea (base `correos--registro.html`). Luego la función pura.
  Archivos: `apps/api/src/modules/identity/application/mail/new-device-mail.template.ts` y su `*.spec.ts`.

- [x] **T-29** [P] [P×PR] Plantilla «Cerramos una sesión por seguridad» — CA: CA-9 — Depende: T-27 — ~0,5 h
  Prueba primero `application/mail/session-revoked-mail.template.spec.ts`: asunto exacto; navegador · sistema del
  dispositivo, fecha de Guatemala, enlace a Seguridad y a recuperar contraseña; sin IP. Luego la función.
  Archivos: `apps/api/src/modules/identity/application/mail/session-revoked-mail.template.ts` y su `*.spec.ts`.

- [x] **T-30** [P×PR] `SessionService.open` — CA: CA-1, CA-15, CA-16, CA-17 — Depende: T-11…T-17, T-28, 001 T-14, T-20, T-32 — ~1 h
  Prueba primero `application/session.service.spec.ts` (repositorios en memoria, `FixedClock`, `IMailer` y
  `ITokenService` falsos): sin cookie de dispositivo o mal formada → genera una y la devuelve en `deviceCookie`; con una
  válida no la cambia; guarda solo hashes; `origin = 'login'` + `isNew` → un correo con `idempotencyKey =
  identity.new-device.<sessionId>` **después** del commit y `identity.device.new`; dispositivo conocido o `origin =
  'verification'` → sin correo; devuelve `{ access, refreshToken, refreshMaxAge, deviceCookie?, user: { id, fullName,
  email, role } }`; el token de acceso se emite fuera de la transacción.
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [x] **T-31** [P×PR] `SessionService.refresh`: rechazos sin escritura — CA: CA-8, CA-9 (gracia), CA-10 (revocada) — Depende: T-30 — ~1 h
  Prueba primero (mismo archivo): mal formado → `RefreshInvalidError` sin tocar el repositorio; `sid` desconocido →
  `RefreshInvalidError`; revocada → `SessionRevokedError`; vencida por inactividad y por 30 d → `SessionExpiredError`;
  anterior dentro de la gracia → `RefreshInvalidError` **sin** revocar; bitácora `identity.session.refresh_rejected`
  con `reason`. Luego la parte del método (resultado discriminado de la transacción).
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [x] **T-32** [P×PR] `SessionService.refresh`: rotación, reúso y cuenta suspendida — CA: CA-7, CA-9, CA-10 — Depende: T-31, T-29 — ~1 h
  Prueba primero (mismo archivo): `current` + cuenta activa → `rotate` + `update`, nuevo token y nueva cookie,
  `identity.session.refreshed`; `reuse` → la revocación se **confirma antes** de lanzar `SessionRevokedError` (un
  `ITransactionRunner` que registra el commit), correo con clave `identity.session-revoked.<sid>`,
  `identity.session.reuse_detected` (`warn`); `current` + cuenta suspendida → revoca, confirma y lanza
  `SessionRevokedError` (`reason: 'suspended'`).
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [x] **T-33** [P×PR] `SessionService.logout` — CA: CA-14 — Depende: T-31 — ~0,5 h
  Prueba primero (mismo archivo): `current` o `previousWithinGrace` de una sesión no revocada → revoca
  (`identity.session.revoked`, `reason: 'logout'`); mal formado, desconocido, `reuse` o ya revocada → no hace nada ni
  envía correo; nunca lanza.
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [x] **T-34** [P×PR] `AuthService.login`: bloqueo y credenciales inválidas — CA: CA-2, CA-5 — Depende: T-16, T-17, 001 T-28, T-32, T-41 — ~1 h
  Prueba primero `application/auth.service.spec.ts`: bloqueado → `LoginLockedError` **sin** llamar a `findByEmail`
  (`identity.login.locked`); correo inexistente → `verify(DUMMY_HASH, …)` llamado, `recordFailure` y
  `InvalidCredentialsError`; contraseña incorrecta → `recordFailure(key, LOGIN_POLICY)` y el mismo error; el 5.º
  fallo sigue siendo `InvalidCredentialsError` y registra `identity.lockout.engaged`; la clave es
  `identity:lockout:login:<sha256(correo normalizado)>`. `DUMMY_HASH` se calcula una vez al iniciar el módulo.
  Archivos: `apps/api/src/modules/identity/application/auth.service.ts`, `apps/api/src/modules/identity/application/auth.service.spec.ts`.

- [x] **T-35** [P×PR] `AuthService.login`: estados de la cuenta y éxito — CA: CA-1, CA-3, CA-4, CA-25 — Depende: T-34, T-30 — ~1 h
  Prueba primero (mismo archivo): contraseña correcta + suspendida → `AccountSuspendedError` con
  `SUPPORT_CONTACT_EMAIL`; + no verificada → `EmailNotVerifiedError`; ninguno llama a `recordFailure`; correcta y
  activa → `lockout.clear(key)` y `SessionService.open(user, client, 'login')`; bitácoras `identity.login.succeeded`
  (`userId`, `sessionId`, `newDevice`) y `identity.login.failed` con su `reason` y sin correo.
  Archivos: `apps/api/src/modules/identity/application/auth.service.ts`, `apps/api/src/modules/identity/application/auth.service.spec.ts`.

### 2d. Presentación y composición

- [x] **T-36** [P] `session-cookies.ts` y `readCookie` — CA: CA-1, CA-8, CA-14, CA-17 — Depende: T-01 — ~1 h
  Prueba primero `presentation/session-cookies.spec.ts`: `nimbo_rt` con `HttpOnly`, `SameSite=Strict`,
  `Path=/api/v1/auth/session` y el `Max-Age` recibido; `nimbo_did` con `Path=/api/v1/auth` y 365 d; `Secure` con
  `cookieSecure = true` y sin él en `local`; `clearRefresh` emite el borrado con la misma ruta; `readCookie` lee un
  valor base64url de una cabecera `Cookie` con varias cookies y devuelve `undefined` si falta o viene repetida.
  Archivos: `apps/api/src/modules/identity/presentation/session-cookies.ts`, `apps/api/src/modules/identity/presentation/session-cookies.spec.ts`.

- [x] **T-37** [P] `readClientContext` — CA: CA-16 — Depende: T-17, T-36 — ~0,5 h
  Prueba primero `presentation/client-context.factory.spec.ts`: toma `nimbo_did`, `User-Agent` (vacío si falta) y
  `req.ip` (con `trust proxy` de 001); nada más de la petición.
  Archivos: `apps/api/src/modules/identity/presentation/client-context.factory.ts` y su `*.spec.ts`.

- [x] **T-38** [P] `login-ip` en `IdentityIpThrottlerGuard` y en `ThrottlerModule` — CA: CA-6 — Depende: T-01, 001 T-44, 001 T-45 (001-PR-3) — ~1 h
  Prueba primero en `presentation/identity-ip-throttler.guard.spec.ts`: al superar `login-ip` lanza
  `IdentityTooManyRequestsError` con el ámbito de inicio de sesión (DT-20) y `Retry-After`; `register-ip` sigue igual;
  sin `X-RateLimit-*`; bitácora `identity.rate_limited` con `scope: 'ip_login'`. Luego la tabla del guard y
  `{ name: 'login-ip', ttl: 15 min, limit: LOGIN_ATTEMPTS_PER_IP }` en `ThrottlerModule.forRoot` de `AppModule`. Si
  001-PR-3 se integró con otro nombre de guard, el renombrado va aquí (DT-8).
  Archivos: `apps/api/src/modules/identity/presentation/identity-ip-throttler.guard.ts` y su `*.spec.ts`, `apps/api/src/app.module.ts`.

- [x] **T-39** Composición de `IdentityModule` (exporta `I_ACCESS_TOKEN_VERIFIER`) — CA: CA-26 — Depende: T-18…T-26, T-30…T-35, **003-PR-A** — ~1 h
  Prueba primero `apps/api/test/int/identity/identity-module.int-spec.ts`: `app.get(I_ACCESS_TOKEN_VERIFIER)` es la
  **misma** instancia que `app.get(JwtTokenService)` (`useExisting`); `ITokenService` resuelve a la misma clase; hay
  una sola estrategia registrada con el nombre `ACCESS_TOKEN_STRATEGY`; `IDENTITY_CONFIG.cookieSecure` es `true` con
  `APP_ENV=staging`. Luego `identity.module.ts` (`JwtModule.register({})`, `PassportModule`, proveedores y
  exportación). `shared` y `realtime` no importan `identity` (lint de fronteras en verde).
  Archivos: `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/modules/identity/application/identity-config.ts`, `apps/api/test/int/identity/identity-module.int-spec.ts`.

- [x] **T-40** `POST /auth/login` y `@SkipThrottle` cruzados — CA: CA-1, CA-6 — Depende: T-36…T-39 — ~1 h
  Prueba primero `apps/api/test/int/identity/login.int-spec.ts` con el camino feliz de CA-1 (`200` `SessionResponse`
  válido contra `sessionResponseSchema`, `Cache-Control: no-store`, `Set-Cookie` de `nimbo_rt` y `nimbo_did`). Luego
  en `auth.controller.ts`: `login` con `@Public()`, `@UseGuards(IdentityIpThrottlerGuard)`,
  `@SkipThrottle({ 'register-ip': true })`, pipe con `loginRequestSchema` y escritura de cookies; `register` gana
  `@SkipThrottle({ 'login-ip': true })`.
  Archivos: `apps/api/src/modules/identity/presentation/auth.controller.ts`, `apps/api/test/int/identity/login.int-spec.ts`.

- [x] **T-41** `POST /auth/session/refresh` y `POST /auth/session/logout` — CA: CA-7, CA-14 — Depende: T-40 — ~1 h
  Prueba primero `apps/api/test/int/identity/refresh.int-spec.ts` (camino feliz: cookie nueva, token nuevo) y
  `logout.int-spec.ts` (camino feliz `204`). Luego las dos rutas con `@Public()`, sin cuerpo, leyendo `nimbo_rt`;
  el controlador borra `nimbo_rt` ante `SESSION_EXPIRED`/`SESSION_REVOKED` y en `logout`, **nunca** ante
  `REFRESH_INVALID`.
  Archivos: `apps/api/src/modules/identity/presentation/auth.controller.ts`, `apps/api/test/int/identity/{refresh,logout}.int-spec.ts`.

- [x] **T-42** `verifyEmail` abre sesión — CA: CA-15 — Depende: T-40, 001 T-38, 001 T-45 — ~1 h
  Prueba primero `apps/api/test/int/identity/verify-email-session.int-spec.ts` (camino feliz): `200 { status:
  'verified', session }` con cookies; `already-verified` sin `session` ni cookies; con `SessionService.open` que falla
  (proveedor sustituido) → `verified` sin `session` y `identity.verification.session_failed`. Luego el cambio en
  `verifyEmail` (`origin: 'verification'`, `try/catch`).
  Archivos: `apps/api/src/modules/identity/presentation/auth.controller.ts`, `apps/api/test/int/identity/verify-email-session.int-spec.ts`.

### 2e. Integración por criterio

- [x] **T-43** [P] CA-1 completo, CA-2, CA-3 y CA-4 — CA: CA-1…CA-4 — Depende: T-40 — ~1 h
  En `login.int-spec.ts`: `exp − iat = 900`; atributos de `nimbo_rt`; `nimbo_did` solo si no venía; fila de `sesion`
  ligada al dispositivo; correo inexistente vs. contraseña incorrecta → mismo `status`, cuerpo y cabeceras (salvo
  `x-correlation-id`), sin `Set-Cookie`; no verificada y suspendida con la correcta → `403` con su código y sin
  cookies; con la incorrecta → CA-2.
  Archivos: `apps/api/test/int/identity/login.int-spec.ts`.

- [x] **T-44** [P] CA-5 (bloqueo por correo) — CA: CA-5 — Depende: T-40 — ~1 h
  `apps/api/test/int/identity/login-lockout.int-spec.ts`: 5 fallos → el 6.º, incluso correcto, `429
  IDENTITY_LOGIN_LOCKED` con `Retry-After` y minutos; idéntico con correo inexistente; `FixedClock` + 15 min →
  permitido; un inicio correcto borra los fallos previos (DT-4). La parte «restablecer quita el bloqueo» va en T-65.
  Archivos: `apps/api/test/int/identity/login-lockout.int-spec.ts`.

- [x] **T-45** [P] CA-6 (límite por IP) y `@SkipThrottle` cruzados — CA: CA-6 — Depende: T-40 — ~1 h
  `apps/api/test/int/identity/login-rate-limit.int-spec.ts`: 21.º intento desde una IP (`X-Forwarded-For`) → `429
  IDENTITY_TOO_MANY_REQUESTS` sin llamar a `IAttemptLockout` (espía) ni al hasher; los inicios de sesión no consumen
  `register-ip` y los registros no consumen `login-ip`; sin `X-RateLimit-*`.
  Archivos: `apps/api/test/int/identity/login-rate-limit.int-spec.ts`.

- [x] **T-46** [P] CA-7, CA-8 y CA-10 — CA: CA-7, CA-8, CA-10 — Depende: T-41 — ~1 h
  En `refresh.int-spec.ts`: el anterior fuera de la gracia ya no sirve; `ultimo_uso` actualizado; 7 d + 1 s sin uso y
  30 d + 1 s renovando a diario → `IDENTITY_SESSION_EXPIRED` y cookie borrada; `Max-Age` nunca pasa del límite;
  sesión revocada → `SESSION_REVOKED`; cuenta suspendida por SQL tras iniciar sesión → `SESSION_REVOKED` y
  `revocada_en` escrito.
  Archivos: `apps/api/test/int/identity/refresh.int-spec.ts`.

- [x] **T-47** [P] CA-9 (reúso y gracia) — CA: CA-9 — Depende: T-41 — ~1 h
  `apps/api/test/int/identity/refresh-reuse.int-spec.ts`: anterior a los 11 s → `SESSION_REVOKED`, ningún token de la
  sesión sirve, correo en Mailpit; anterior a los 5 s → `REFRESH_INVALID` sin revocar ni borrar la cookie; dos
  renovaciones simultáneas con el mismo token → una rota y la otra cae en la gracia.
  Archivos: `apps/api/test/int/identity/refresh-reuse.int-spec.ts`.

- [x] **T-48** [P] CA-14 (cerrar sesión, backend) — CA: CA-14 — Depende: T-41 — ~0,5 h
  En `logout.int-spec.ts`: sesión revocada, `nimbo_rt` borrada, `nimbo_did` intacta; cookie ausente, alterada o de
  sesión ya revocada → `204`. El caso `DELETE /sessions/:id` de la actual va en T-76.
  Archivos: `apps/api/test/int/identity/logout.int-spec.ts`.

- [ ] **T-49** [P] CA-15 y ampliación de la concurrencia de 001 — CA: CA-15; cierra 001 CA-26 y CA-29 — Depende: T-42, 001 T-48 — ~1 h
  En `verify-email-session.int-spec.ts`: credenciales de CA-1, dispositivo conocido y sin correo de dispositivo nuevo
  en un inicio posterior desde ese navegador. En `verify-email-concurrency.int-spec.ts` de 001: casos (a)–(d) sin
  sesión salvo la apertura ganadora de (d). (La aparición en la lista y el cierre se comprueban en T-75.)
  Archivos: `apps/api/test/int/identity/{verify-email-session,verify-email-concurrency}.int-spec.ts`.

- [ ] **T-50** [P] CA-16 (dispositivo nuevo) — CA: CA-16 — Depende: T-40, T-42 — ~1 h
  `apps/api/test/int/identity/new-device.int-spec.ts`: navegador nuevo → correo en Mailpit con navegador, sistema,
  fecha y hora de Guatemala y enlace a Seguridad; mismo navegador → nada; el de la verificación → nada; dos inicios
  simultáneos desde un navegador nuevo → un correo.
  Archivos: `apps/api/test/int/identity/new-device.int-spec.ts`.

- [ ] **T-51** [P] CA-17 y CA-24 (sesión y dispositivo) — CA: CA-17, CA-24 — Depende: T-41 — ~1 h
  `apps/api/test/int/identity/credential-secrecy.int-spec.ts`: los valores de `nimbo_rt` (antes y después de rotar) y
  `nimbo_did` se buscan en todas las columnas de texto de `usuario`, `token_cuenta`, `dispositivo` y `sesion` y en el
  `LogSink`: solo aparecen sus SHA-256; `hash_clave` empieza por `$argon2id$`. El token de recuperación se suma en T-68.
  Archivos: `apps/api/test/int/identity/credential-secrecy.int-spec.ts`.

- [ ] **T-52** [P] CA-25 (bitácoras de PR-2) — CA: CA-25 — Depende: T-41, T-42 — ~1 h
  `apps/api/test/int/identity/auth-logs.int-spec.ts`: inicio correcto y cada fallo, bloqueo, límite por IP, renovación,
  rechazo, reúso, cierre, dispositivo nuevo y sesión al verificar → eventos de plan §7 con `correlationId` y `userId`;
  ninguna línea contiene correo, contraseña, token, valor de cookie, `huella_hash`, IP ni agente completo.
  Archivos: `apps/api/test/int/identity/auth-logs.int-spec.ts`.

### 2f. Frontera con 003 (tokens reales y contrato)

- [x] **T-53** Suite de contrato de 003 con el verificador real: tramo del puerto — CA: CA-26 — Depende: T-39, **003-PR-A** (`apps/api/test/support/access-token-verifier.contract.ts`) — ~1 h
  Prueba: `apps/api/test/int/identity/access-token-verifier.jwt.int-spec.ts` **solo invoca** la suite de 003 con
  `JwtTokenService` real y una fábrica de tokens reales (`JwtService` + `FixedClock`: válido, vencido, alterado, otra
  clave, `alg: none`, `HS512`, *claims* de más o de menos). Sin casos propios (los unitarios están en T-25). Si la
  fábrica de 003 (`TestAccessTokens`) ya produce HS256 con la clave de pruebas, se reutiliza.
  Archivos: `apps/api/test/int/identity/access-token-verifier.jwt.int-spec.ts`, `apps/api/test/support/jwt-test-tokens.ts` (solo si hace falta).

- [x] **T-54** Suite de contrato de 003: tramo HTTP con la `JwtStrategy` real — CA: CA-26 (y 003 CA-2 con la estrategia real) — Depende: T-53 — ~1 h
  Prueba (mismo archivo): el tramo HTTP de la suite contra la ruta sonda `GET /__probe/actor` en una app que compone
  `AppModule` (guards globales de 003-PR-A + `JwtStrategy` real): los mismos tokens dan `200` con el mismo actor o `401
  SHARED_UNAUTHENTICATED` con el mismo motivo (`expired`/`invalid`) que `verify`. Además, la prueba HTTP de CA-2 de 003
  pasa con la estrategia real. Ajustar `createTestApp`: las apps que componen `AppModule` usan **solo** la estrategia
  real con la clave de pruebas; `TestJwtStrategy` queda para módulos de sonda sin `IdentityModule` (regla de 003 §11).
  Archivos: `apps/api/test/int/identity/access-token-verifier.jwt.int-spec.ts`, `apps/api/test/support/create-test-app.ts`.

- [ ] **T-55** Tokens reales en el arnés de aislamiento de 003 — CA: CA-26; 003 CA-15 — Depende: T-54, **003-PR-D** (`isolation-world.ts`; ver notas) — ~1 h
  Prueba: `pnpm test:isolation` completo en verde tras cambiar `tokenFor(cuenta)` en
  `apps/api/test/isolation/setup/isolation-world.ts` para emitir con `JwtTokenService.issueAccessToken` (rol real de
  la cuenta, `sid` uuid) en lugar de `TestAccessTokens`; el marcador `ISOLATION_FORCE_FAIL` sigue haciendo fallar la
  suite; un token de `TestAccessTokens` ya **no** autentica en `appAs`.
  Archivos: `apps/api/test/isolation/setup/isolation-world.ts`.

- [ ] **T-56** Aislamiento: anti-enumeración del inicio de sesión — CA: CA-2, CA-5 — Depende: T-43, T-44 — ~1 h
  `apps/api/test/isolation/login-enumeration.iso-spec.ts`: sobre el mundo de 003, correo inexistente, cliente con
  contraseña incorrecta, cuenta interna con contraseña incorrecta y correo bloqueado con y sin cuenta → respuestas
  idénticas por pares (status, cuerpo, cabeceras salvo `x-correlation-id`); ningún `Set-Cookie`.
  Archivos: `apps/api/test/isolation/login-enumeration.iso-spec.ts`.

- [ ] **T-57** README de `identity`, hallazgos y cierre del PR-2 — CA: n/a — Depende: T-11…T-56 — ~0,5 h
  README de `identity`: sesiones, cookies (`nimbo_rt`, `nimbo_did`), puerto implementado, bloqueo y regla «revocar y
  después lanzar». Pedir al `architect` registrar **DF-56**, **DF-57** y **PD-45** (provisionales, plan §10.4) y el
  estado de DF-11/DF-15. Suites en verde, incluida `pnpm test:isolation`. Avisar a 003 (T-55) y a 015 (T-39).
  Archivos: `apps/api/src/modules/identity/README.md`.

## Bloque 3 — PR-3 «recuperación de contraseña» (plan §6.3, §6.5) · depende de 002-PR-2

- [x] **T-58** [P] [P×PR] Plantilla «Restablece tu contraseña de Nimbo» — CA: CA-18 — Depende: T-27 — ~0,5 h
  Prueba primero `application/mail/password-reset-mail.template.spec.ts`: asunto (propuesto, Q-2); enlace
  `{webPublicUrl}/restablecer-contrasena#token=<valor>`; «1 hora», «solo funciona una vez»; qué hacer si no lo pediste;
  sin IP. Luego la función.
  Archivos: `apps/api/src/modules/identity/application/mail/password-reset-mail.template.ts` y su `*.spec.ts`.

- [x] **T-59** [P] [P×PR] Plantilla «Tu contraseña de Nimbo cambió» — CA: CA-19, CA-22 — Depende: T-27 — ~0,5 h
  Prueba primero `application/mail/password-changed-mail.template.spec.ts`: asunto (propuesto, Q-2); fecha de
  Guatemala; enlace a `{webPublicUrl}/recuperar-contrasena` («si no fuiste tú»); sin IP. Luego la función.
  Archivos: `apps/api/src/modules/identity/application/mail/password-changed-mail.template.ts` y su `*.spec.ts`.

- [x] **T-60** [P×PR] `PasswordService.requestReset` — CA: CA-18 — Depende: T-16, T-17, T-58, 001 T-13, T-32, T-34 — ~1 h
  Prueba primero `application/password.service.spec.ts` (dobles): el límite `identity:password-reset-request:<sha256>`
  (60 s y `EMAIL_REQUESTS_PER_HOUR`) se consume **antes** de buscar; rechazado → `IdentityTooManyRequestsError` con
  ámbito de recuperación; inexistente → nada (`kind: 'ignored'`); verificada, interna o suspendida →
  `invalidateActive` + enlace de 60 min + correo tras el commit; cliente no verificado → llama a `VerificationLinkIssuer`
  (`kind: 'verification_link'`) sin consultar ni gastar el límite de 001 (DT-7, SEC-1).
  Archivos: `apps/api/src/modules/identity/application/password.service.ts`, `apps/api/src/modules/identity/application/password.service.spec.ts`.

- [x] **T-61** [P×PR] `PasswordService.checkResetLink` — CA: CA-20 — Depende: T-60 — ~0,5 h
  Prueba primero (mismo archivo): mal formado o desconocido → `ResetLinkInvalidError`; de tipo `verificacion` →
  inválido; vencido → `ResetLinkExpiredError`; usado o invalidado → inválido; válido → `ok` **sin** consumir.
  Archivos: `apps/api/src/modules/identity/application/password.service.ts`, `apps/api/src/modules/identity/application/password.service.spec.ts`.

- [x] **T-62** [P×PR] `PasswordService.resetPassword` — CA: CA-19, CA-20, CA-21 — Depende: T-61, T-59 — ~1 h
  Prueba primero (mismo archivo): débil o igual al correo de la cuenta → `IdentityWeakPasswordError` con `fields` y el
  enlace sigue vigente; el hash se calcula **fuera** de la transacción; `consume` → `false` → `ResetLinkInvalidError`
  sin cambiar la contraseña; éxito → `update`, `revokeAllExcept(userId, null, now)`, y tras el commit `clear` de los
  dos bloqueos, correo «Tu contraseña cambió» e `identity.password_reset.completed` con `revokedCount`; no crea sesión.
  Archivos: `apps/api/src/modules/identity/application/password.service.ts`, `apps/api/src/modules/identity/application/password.service.spec.ts`.

- [x] **T-63** `PasswordController`: tres rutas públicas — CA: CA-18, CA-19, CA-20 — Depende: T-62, T-41 (002-PR-2 integrado) — ~1 h
  Prueba primero `apps/api/test/int/identity/password-reset.int-spec.ts` (caminos felices: `202` de
  `forgot-password`, `200 { status: 'valid' }` de `check`, `200 { status: 'password-reset' }` que borra `nimbo_rt`).
  Luego `password.controller.ts` (`@Controller('auth')`, `@Public()` en las tres, pipes con los esquemas de T-03) y su
  registro en `IdentityModule`.
  Archivos: `apps/api/src/modules/identity/presentation/password.controller.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/test/int/identity/password-reset.int-spec.ts`.

- [x] **T-64** [P] CA-18 (pedir el enlace) — CA: CA-18 — Depende: T-63 — ~1 h
  En `password-reset.int-spec.ts`: cuatro cuentas (verificada, no verificada, interna, inexistente) → `202`
  idénticos; Mailpit: enlace de 1 h para verificada e interna, enlace de verificación de 001 para la no verificada,
  nada para la inexistente; 60 s y 5/h con y sin cuenta → `IDENTITY_TOO_MANY_REQUESTS` con `Retry-After`.
  Archivos: `apps/api/test/int/identity/password-reset.int-spec.ts`.

- [x] **T-65** [P] CA-19, CA-21 y la segunda parte de CA-5 — CA: CA-19, CA-21, CA-5 — Depende: T-63, T-44 — ~1 h
  En `password-reset.int-spec.ts`: dos navegadores con sesión → ambas revocadas (su refresco falla); bloqueo de CA-5
  quitado al momento; correo «Tu contraseña cambió»; ninguna fila nueva en `sesion`; `nimbo_rt` borrada; débil y
  «igual al correo» → `IDENTITY_WEAK_PASSWORD` con `fields` y el mismo enlace sirve después.
  Archivos: `apps/api/test/int/identity/password-reset.int-spec.ts`.

- [x] **T-66** [P] CA-20 y concurrencia — CA: CA-20 — Depende: T-63 — ~1 h
  En `password-reset.int-spec.ts`: vencido (`FixedClock` + 1 h + 1 s) → `EXPIRED`; usado, reemplazado, alterado, mal
  formado y de tipo `verificacion` → `INVALID`, en `check` y en `reset`; la contraseña no cambia. Y
  `apps/api/test/int/identity/password-reset-concurrency.int-spec.ts`: dos `reset` simultáneos → uno `200`, otro
  `INVALID`.
  Archivos: `apps/api/test/int/identity/{password-reset,password-reset-concurrency}.int-spec.ts`.

- [x] **T-67** [P] Aislamiento: anti-enumeración de la recuperación — CA: CA-18 — Depende: T-63 — ~0,5 h
  `apps/api/test/isolation/password-reset-enumeration.iso-spec.ts`: las cuatro clases de cuenta del mundo de 003 dan
  respuestas idénticas (status, cuerpo, cabeceras salvo `x-correlation-id`), también cuando el límite se agota.
  Archivos: `apps/api/test/isolation/password-reset-enumeration.iso-spec.ts`.

- [x] **T-68** CA-24 y CA-25 de la recuperación — CA: CA-24, CA-25 — Depende: T-63, T-51, T-52 — ~1 h
  Ampliar `credential-secrecy.int-spec.ts` (el token de recuperación sacado de Mailpit solo aparece como SHA-256 en
  `token_cuenta` y nunca en el `LogSink`) y `auth-logs.int-spec.ts` (`identity.password_reset.requested` con cada
  `kind`, `rejected` con cada `reason`, `completed`, `session.revoked` con `reason: 'password_reset'`; sin correo).
  Archivos: `apps/api/test/int/identity/{credential-secrecy,auth-logs}.int-spec.ts`.

- [x] **T-69** Cierre del PR-3 — CA: n/a — Depende: T-58…T-68 — ~0,5 h
  README de `identity` (recuperación, D-15 acotada solo por el límite de recuperación, DT-5/DT-6). Suites en verde. Pedir al
  `ui-designer` que valide las plantillas de T-58 y T-59 (y las de T-28, T-29 si no lo hizo).
  Hecho (2026-09-29): el `ui-designer` aprobó T-28, T-29, T-58 y T-59 sin bloqueantes; sus dos sugerencias quedan en
  PD-53. Los pendientes de la auditoría T-67 que no entran en este PR quedan en PD-50, PD-51 y PD-52.
  Archivos: `apps/api/src/modules/identity/README.md`.

## Bloque 4 — PR-4 «Seguridad (backend)» (plan §6.3, §6.5) · depende de 002-PR-2 (y por él 003-PR-A) · **recortable a Fase 2 si no llega el 30/09 (decisión de Adrián pendiente)**

- [ ] **T-70** [P×PR] `SessionService.list` — CA: CA-11 — Depende: T-30, T-15 — ~1 h
  Prueba primero (en `session.service.spec.ts`): `listActive(actor.id, now, now − 7 d, 50)`; la actual primero y marcada
  `current`, las demás por `lastActiveAt` descendente; navegador, sistema y `deviceKind` de `UserAgentSummary`; la
  salida no tiene IP, agente completo, hashes ni `deviceId` (valida contra `sessionSummarySchema`).
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [ ] **T-71** [P×PR] `SessionService.revoke` y `revokeOthers` — CA: CA-12, CA-13, CA-14 — Depende: T-70 — ~1 h
  Prueba primero (mismo archivo): `revoke` ajena, inexistente o ya revocada → `SessionNotFoundError` (mismo error);
  propia → `{ wasCurrent }`; `revokeOthers` → `revokedCount` sin tocar la actual; bitácora `identity.session.revoked`
  con `reason: 'user' | 'others'` y `count`.
  Archivos: `apps/api/src/modules/identity/application/session.service.ts`, `apps/api/src/modules/identity/application/session.service.spec.ts`.

- [ ] **T-72** [P×PR] `PasswordService.changePassword` — CA: CA-22, CA-23 — Depende: T-62, T-59, T-18 (puerto) — ~1 h
  Prueba primero (en `password.service.spec.ts`): bloqueado → `PasswordChangeLockedError` aunque la actual sea correcta;
  incorrecta → `recordFailure(identity:lockout:password-change:<userId>)` y `WrongPasswordError`, la sesión no se toca;
  débil → `IdentityWeakPasswordError`; éxito → hash fuera de la transacción, `update` +
  `revokeAllExcept(actor.id, currentSessionId)`, tras el commit `clear`, correo e `identity.password.changed` con
  `revokedCount`; rechazos con `identity.password_change.rejected`.
  Archivos: `apps/api/src/modules/identity/application/password.service.ts`, `apps/api/src/modules/identity/application/password.service.spec.ts`.

- [ ] **T-73** `SessionsController` — CA: CA-11, CA-12, CA-13, CA-14 — Depende: T-71, **003-PR-A** (`@Roles`, `@CurrentActor()`, `@CurrentSessionId()`) — ~1 h
  Prueba primero `apps/api/test/int/identity/sessions.int-spec.ts` (caminos felices de `GET`, `DELETE :id` y
  `POST revoke-others`; sin token → `401 SHARED_UNAUTHENTICATED`). Luego `sessions.controller.ts` con
  `@Roles(CLIENT, ADMIN, SUPPORT, OPERATOR)`; `:id` validado con `z.string().uuid()` (mal formado →
  `SessionNotFoundError`); `DELETE` de la actual borra `nimbo_rt`; nadie lee `req.user`. Registro en `IdentityModule`.
  Archivos: `apps/api/src/modules/identity/presentation/sessions.controller.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/test/int/identity/sessions.int-spec.ts`.

- [ ] **T-74** `POST /auth/change-password` — CA: CA-22, CA-23 — Depende: T-72, T-63, **003-PR-A** — ~0,5 h
  Prueba primero `apps/api/test/int/identity/change-password.int-spec.ts` (camino feliz `204`; sin token → `401`).
  Luego la ruta en `password.controller.ts` con `@Roles(...)` de los cuatro roles, `@CurrentActor()` y
  `@CurrentSessionId()`.
  Archivos: `apps/api/src/modules/identity/presentation/password.controller.ts`, `apps/api/test/int/identity/change-password.int-spec.ts`.

- [ ] **T-75** [P] CA-11, CA-13 y la parte de lista de CA-15 — CA: CA-11, CA-13, CA-15 — Depende: T-73 — ~1 h
  En `sessions.int-spec.ts`: tres navegadores + otra cuenta; sin revocadas ni vencidas; orden; forma exacta del JSON
  sin IP, hashes ni ids de dispositivo; cuatro sesiones → `revokedCount = 3` y la actual sigue renovando; la sesión
  abierta al verificar aparece y se puede cerrar.
  Archivos: `apps/api/test/int/identity/sessions.int-spec.ts`.

- [ ] **T-76** [P] CA-12 y CA-14 (desde la lista) — CA: CA-12, CA-14 — Depende: T-73 — ~1 h
  En `sessions.int-spec.ts`: el refresco de la sesión cerrada falla al instante; su token de acceso verifica con el
  puerto hasta `FixedClock` + 15 min y después no; `DELETE` de la actual → `204` y `nimbo_rt` borrada; `id` mal formado
  → `404` idéntico a inexistente.
  Archivos: `apps/api/test/int/identity/sessions.int-spec.ts`.

- [ ] **T-77** [P] CA-22 y CA-23 — CA: CA-22, CA-23 — Depende: T-74 — ~1 h
  En `change-password.int-spec.ts`: tres sesiones → dos revocadas y la actual renueva; correo en Mailpit;
  `WRONG_PASSWORD` con `fields` y sin cambios; 5 fallos → el 6.º, incluso correcto, `PASSWORD_CHANGE_LOCKED` con
  `Retry-After`; `FixedClock` + 15 min → permitido; la sesión sigue viva en todo momento; un rol interno cambia la suya.
  Archivos: `apps/api/test/int/identity/change-password.int-spec.ts`.

- [ ] **T-78** Aislamiento de sesiones — CA: CA-11, CA-12; RNF-05 — Depende: T-73, T-55 — ~1 h
  `apps/api/test/isolation/sessions-isolation.iso-spec.ts` (mundo de 003, tokens reales): cada cliente ve solo sus
  sesiones; cerrar una sesión del otro cliente → `404` idéntico a inexistente y la BD sin cambios; `revoke-others` no
  toca la otra cuenta; cada rol interno solo ve y cierra las suyas.
  Archivos: `apps/api/test/isolation/sessions-isolation.iso-spec.ts`.

- [ ] **T-79** CA-24 y CA-25 de Seguridad — CA: CA-24, CA-25 — Depende: T-75…T-77 — ~0,5 h
  Ampliar `auth-logs.int-spec.ts` (`session.revoked` con `user`, `others`, `password_change`; `password.changed`;
  `password_change.rejected` con cada `reason`; sin `currentPassword`/`newPassword`) y `credential-secrecy.int-spec.ts`
  (tras cambiar la contraseña, `hash_clave` sigue siendo Argon2id).
  Archivos: `apps/api/test/int/identity/{auth-logs,credential-secrecy}.int-spec.ts`.

- [ ] **T-80** Cierre del PR-4 — CA: n/a — Depende: T-70…T-79 — ~0,5 h
  README de `identity` (lista y revocación, cambio de contraseña). Suites en verde, incluida `pnpm test:isolation`.
  Archivos: `apps/api/src/modules/identity/README.md`.

## Bloque 5 — PR-5a «web: sesión» (plan §6.9) · depende de 001-PR-4 y 002-PR-1 (la prueba manual, de PR-2 y PR-3)

- [x] **T-81** [P] Catálogo de errores de 002 — CA: CA-2…CA-6, CA-8, CA-18, CA-20, CA-21, CA-23 — Depende: T-02, 001 T-57 — ~0,5 h
  Prueba primero `apps/web/lib/error-catalog.spec.ts` (ampliado): cada código nuevo de T-02 con el texto de spec §11;
  los que llevan minutos los calculan de `retryAfterSeconds`; `IDENTITY_TOO_MANY_REQUESTS` devuelve el texto por
  pantalla (DT-20: inicio de sesión o recuperación); suspendida con `SUPPORT_CONTACT_EMAIL`. Luego `error-catalog.ts`.
  Archivos: `apps/web/lib/error-catalog.ts`, `apps/web/lib/error-catalog.spec.ts`.

- [x] **T-82** [P] `api.ts`: sesión y recuperación — CA: CA-1, CA-7, CA-14, CA-18…CA-20 — Depende: T-03, T-04, 001 T-60 — ~1 h
  Prueba primero `features/identity/api.spec.ts` (`fetch` simulado): `login`, `refresh`, `logout`, `forgotPassword`,
  `checkResetLink`, `resetPassword` usan la ruta y el método de plan §5, validan la respuesta con `contracts`; las de
  `session/*` y `login` mandan `credentials: 'include'`; errores tipados por `code`. Luego las funciones.
  Archivos: `apps/web/features/identity/api.ts`, `apps/web/features/identity/api.spec.ts`.

- [ ] **T-83** [P] [P×PR] `refresh-coordinator.ts` — CA: CA-7, CA-8, CA-9 — Depende: T-02 — ~1 h
  Prueba primero `features/identity/session/refresh-coordinator.spec.ts` (`refresh` inyectado, `navigator.locks`
  simulado): dos llamadas simultáneas en la pestaña → una sola petición; entre pestañas se serializa con el candado
  `nimbo-refresh`; `IDENTITY_REFRESH_INVALID` → un solo reintento; `SESSION_EXPIRED`/`SESSION_REVOKED` → limpia y
  navega a `/iniciar-sesion?sesion=terminada`; sin `navigator.locks` sigue funcionando (DT-16).
  Archivos: `apps/web/features/identity/session/refresh-coordinator.ts` y su `*.spec.ts`.

- [ ] **T-84** `SessionProvider` (token solo en memoria) — CA: CA-28, CA-7 — Depende: T-82, T-83 — ~1 h
  Prueba primero `features/identity/session/session-provider.spec.tsx`: espías en `Storage.prototype.setItem` y
  `document.cookie`: ningún token escrito; expone `{ status, user, accessToken }`; programa la renovación un minuto antes
  de `accessTokenExpiresAt` (temporizadores falsos); recarga simulada (montaje sin token) → renueva y recupera `user`.
  Archivos: `apps/web/features/identity/session/session-provider.tsx` y su `*.spec.tsx`.

- [ ] **T-85** `auth-fetch.ts` — CA: CA-28, CA-7 — Depende: T-84, 001 T-57 — ~1 h
  Prueba primero `features/identity/session/auth-fetch.spec.ts`: agrega `Authorization: Bearer`; ante `401
  SHARED_UNAUTHENTICATED` renueva una vez y repite; ante un `401 IDENTITY_*` **no** renueva (plan §5); si la renovación
  falla, propaga el cierre de sesión.
  Archivos: `apps/web/features/identity/session/auth-fetch.ts` y su `*.spec.ts`.

- [ ] **T-86** `SessionGate` y grupo exterior `(app)` — CA: CA-28, CA-8 — Depende: T-84 — ~1 h
  Prueba primero `features/identity/session/session-gate.spec.tsx`: sin token → `StateView` de carga mientras renueva;
  éxito → hijos; fallo → `router.replace('/iniciar-sesion')`. Luego `app/(app)/layout.tsx` con `SessionProvider` +
  `SessionGate`; si 003-PR-F ya creó `(cliente)`/`(interno)`, quedan anidados dentro sin cambiar sus rutas.
  Archivos: `apps/web/features/identity/session/session-gate.tsx` y su `*.spec.tsx`, `apps/web/app/(app)/layout.tsx`.

- [ ] **T-87** [P] `homePathFor` y marcador de `/archivos` (solo si faltan) — CA: CA-1 — Depende: — (003-PR-F si ya existe) — ~0,5 h
  Si 003-PR-F no lo integró: prueba primero `features/access/home-path.spec.ts` (`CLIENT` → `/archivos`; `ADMIN`,
  `SUPPORT`, `OPERATOR` → `/interno`) y luego `home-path.ts` **tal como lo define 003** §6.9. Si no existe
  `app/(app)/(cliente)/archivos/page.tsx` (005/006), marcador con `StateView` «Tus archivos aparecerán aquí». Si ambos
  existen, la tarea se cierra sin cambios.
  Archivos: `apps/web/features/access/home-path.ts` y su `*.spec.ts`, `apps/web/app/(app)/(cliente)/archivos/page.tsx`.

- [ ] **T-88** `LoginForm`: envío y éxito — CA: CA-1, CA-2, CA-27 — Depende: T-81, T-82, T-84, T-87 — ~1 h
  Prueba primero `features/identity/components/login-form.spec.tsx`: estados default, enviando (botón deshabilitado y
  con texto de carga), error de credenciales (alerta con acción «restablece tu contraseña»); éxito → guarda la sesión
  en el proveedor y `router.replace(homePathFor(role))`; `react-hook-form` + `zodResolver(loginRequestSchema)`;
  jest-axe sin `serious`/`critical`.
  Archivos: `apps/web/features/identity/components/login-form.tsx`, `apps/web/features/identity/components/login-form.spec.tsx`.

- [ ] **T-89** `LoginForm`: estados de rechazo — CA: CA-3…CA-6, CA-8, CA-27 — Depende: T-88 — ~1 h
  Prueba primero (mismo archivo): bloqueado (minutos de `Retry-After`), límite por IP, no verificado (alerta con «Pedir
  un enlace nuevo» → `/registro/pedir-enlace` con el correo en `sessionStorage` como acordó 001), suspendida (correo de
  contacto) y `?sesion=terminada` («Tu sesión terminó. Inicia sesión de nuevo.»); textos exactos de spec §11.
  Archivos: `apps/web/features/identity/components/login-form.tsx`, `apps/web/features/identity/components/login-form.spec.tsx`.

- [ ] **T-90** Página `/iniciar-sesion` — CA: CA-1, CA-27 — Depende: T-89, 001 T-58 — ~0,5 h
  Prueba primero `app/(public)/iniciar-sesion/page.spec.tsx`: reemplaza el marcador de 001; esquema de dos columnas del
  mockup (p. 07) dentro del `PublicHeader`; enlaces a registro y a recuperar; jest-axe. Luego la página.
  Archivos: `apps/web/app/(public)/iniciar-sesion/page.tsx` y su `*.spec.tsx`.

- [x] **T-91** `RequestResetForm` y `/recuperar-contrasena` — CA: CA-18, CA-27 — Depende: T-81, T-82, 001 T-63 — ~1 h
  Prueba primero `features/identity/components/request-reset-form.spec.tsx`: default, enviando, error, límite (texto de
  recuperación), revisa-tu-correo con `CheckEmailPanel` en la variante sin «Cambiar correo»; la misma pantalla para
  cualquier correo; jest-axe. Luego el componente y la página (esquema de `registro--pedir-enlace`).
  Archivos: `apps/web/features/identity/components/request-reset-form.tsx` y su `*.spec.tsx`, `apps/web/app/(public)/recuperar-contrasena/page.tsx`.

- [x] **T-92** `ResetPasswordView`: lectura y comprobación del enlace — CA: CA-20, CA-27 — Depende: T-81, T-82 — ~1 h
  Prueba primero `features/identity/components/reset-password-view.spec.tsx`: lee `#token`, lo borra con
  `history.replaceState` y llama a `check` **una vez** (también en `StrictMode`); estados verificando, enlace-expirado
  y enlace-invalido con la acción «Pedir un enlace nuevo»; sin token → inválido.
  Archivos: `apps/web/features/identity/components/reset-password-view.tsx` y su `*.spec.tsx`.

- [x] **T-93** `ResetPasswordView`: formulario y `/restablecer-contrasena` — CA: CA-19, CA-21, CA-27 — Depende: T-92, 001 T-61 — ~1 h
  Prueba primero (mismo archivo): default con `PasswordRequirements` y confirmación (`refine` del cliente: no envía si
  no coincide), error-campos (`fields` de `IDENTITY_WEAK_PASSWORD`), enviando, éxito («Listo. Cambiamos tu
  contraseña…» + «Iniciar sesión»); jest-axe. Luego la página.
  Archivos: `apps/web/features/identity/components/reset-password-view.tsx` y su `*.spec.tsx`, `apps/web/app/(public)/restablecer-contrasena/page.tsx`.

- [ ] **T-94** **(humana)** Recorrido local de sesión y recuperación — CA: CA-1, CA-8, CA-18…CA-21, CA-27, CA-28 — Depende: T-57, T-69, T-90…T-93 — ~1 h
  Con `docker compose up -d` + `pnpm dev`: iniciar sesión (cookies en DevTools: `HttpOnly`, `SameSite`, `Path`),
  **recargar** y seguir con sesión, inspeccionar `localStorage`, `sessionStorage` y `document.cookie` (ningún token),
  recuperar y restablecer con Mailpit, enlace vencido; capturas a 360 y 1440 px para el `ui-designer`. Evidencia para
  `verification.md`.
  Archivos: ninguno (evidencia).

- [ ] **T-95** Cierre del PR-5a — CA: n/a — Depende: T-81…T-94 — ~0,5 h
  README de `features/identity` (sesión en memoria, renovación, `auth-fetch`). Suites en verde. Avisar a 003-PR-F
  (grupo `(app)`, sesión con `role` y `fullName`, `homePathFor`). Si PR-4 y PR-5b se recortan, T-105 se ejecuta aquí
  con lo que exista.
  Archivos: `apps/web/features/identity/README.md`.

## Bloque 6 — PR-5b «web: Seguridad» (plan §6.9) · depende de 002-PR-5a; Q-3 y Q-4 · **recortable a Fase 2 si no llega el 30/09 (decisión de Adrián pendiente)**

- [ ] **T-96** [P] `api.ts`: sesiones y cambio de contraseña — CA: CA-11…CA-13, CA-22 — Depende: T-82, T-85 — ~0,5 h
  Prueba primero (en `api.spec.ts`): `listSessions`, `revokeSession`, `revokeOtherSessions`, `changePassword` por
  `auth-fetch` con la ruta y el método de plan §5 y respuesta validada. Luego las funciones.
  Archivos: `apps/web/features/identity/api.ts`, `apps/web/features/identity/api.spec.ts`.

- [ ] **T-97** [P] `lib/format-date.ts` — CA: CA-11 — Depende: — — ~0,5 h
  Prueba primero `apps/web/lib/format-date.spec.ts`: «Activa ahora», «Última actividad: hace 2 horas»
  (`Intl.RelativeTimeFormat('es')`) e «Iniciada el 24 sep 2026» en `America/Guatemala` (D-16), con reloj fijo.
  Archivos: `apps/web/lib/format-date.ts`, `apps/web/lib/format-date.spec.ts`.

- [ ] **T-98** [P] `ConfirmDestructiveDialog` — CA: CA-14, CA-27 — Depende: **Q-4** (token del velo, PD-27) — ~1 h
  Prueba primero `components/nimbo/confirm-destructive-dialog.spec.tsx`: `<dialog>` con `showModal()`,
  `role="alertdialog"`, foco inicial en «Cancelar», Escape cancela, confirmar con variante `destructive`, botones
  apilados a 360 px con el destructivo arriba; solo tokens; jest-axe.
  Archivos: `apps/web/components/nimbo/confirm-destructive-dialog.tsx` y su `*.spec.tsx`.

- [ ] **T-99** `SessionRow` y `SessionsCard`: lista — CA: CA-11, CA-27 — Depende: T-96, T-97 — ~1 h
  Prueba primero `features/identity/components/sessions-card.spec.tsx`: cargando, vacío-salvo-actual, error; la actual
  primero con «Este dispositivo»; navegador · sistema, inicio y última actividad; ícono por `deviceKind` decorativo;
  nombres accesibles completos («Cerrar sesión en Safari · iOS»); jest-axe.
  Archivos: `apps/web/features/identity/components/{sessions-card,session-row}.tsx`, `apps/web/features/identity/components/sessions-card.spec.tsx`.

- [ ] **T-100** `SessionsCard`: acciones — CA: CA-12, CA-13, CA-14, CA-27 — Depende: T-99, T-98 — ~1 h
  Prueba primero (mismo archivo): cerrar una pide confirmación y la quita de la lista con `role="status"`; «Cerrar las
  demás sesiones» confirma el número (singular y plural); cerrar la actual lleva a `/iniciar-sesion`;
  `IDENTITY_SESSION_NOT_FOUND` muestra su mensaje y recarga la lista.
  Archivos: `apps/web/features/identity/components/sessions-card.tsx`, `apps/web/features/identity/components/sessions-card.spec.tsx`.

- [ ] **T-101** `ChangePasswordForm` — CA: CA-22, CA-23, CA-27 — Depende: T-96, 001 T-61 — ~1 h
  Prueba primero `features/identity/components/change-password-form.spec.tsx`: contrasena-no-coincide no envía;
  enviando; éxito con `role="status"`; `WRONG_PASSWORD` vacía el campo actual y le da el foco conservando los otros;
  bloqueada con minutos (`IDENTITY_PASSWORD_CHANGE_LOCKED`); débil con `fields`; jest-axe.
  Archivos: `apps/web/features/identity/components/change-password-form.tsx` y su `*.spec.tsx`.

- [ ] **T-102** Página `(app)/cuenta/seguridad` — CA: CA-11…CA-14, CA-22, CA-23, CA-27 — Depende: T-100, T-101, T-86 — ~1 h
  Prueba primero `app/(app)/cuenta/seguridad/page.spec.tsx`: dos tarjetas; los 15 estados del mockup de Seguridad
  presentes en las pruebas de T-99…T-101 (tabla en la prueba que los enumera); accesible para los cuatro roles;
  jest-axe. Luego la página.
  Archivos: `apps/web/app/(app)/cuenta/seguridad/page.tsx` y su `*.spec.tsx`.

- [ ] **T-103** `AccountMenu` en el `AppLayout` actual — CA: CA-14, CA-27 — Depende: T-98, T-84, **Q-3** (PD-28), **Q-4** — ~1 h
  Prueba primero `components/nimbo/account-menu.spec.tsx`: patrón *menu button* de WAI-ARIA (flechas, Escape, foco
  devuelto); nombre y correo fuera del `role="menu"`; «Seguridad», «Plan y facturación» solo si existe su ruta, «Cerrar
  sesión» (con `ConfirmDestructiveDialog` si Q-3 dice que sí; directo si no) → `logout` y `/iniciar-sesion`; jest-axe.
  Luego el componente y su inserción en la cabecera del `AppLayout` actual (sin rediseñarlo: PD-33).
  Archivos: `apps/web/components/nimbo/account-menu.tsx` y su `*.spec.tsx`, el archivo del `AppLayout` actual.

- [ ] **T-104** **(humana)** Recorrido de Seguridad y revisión visual — CA: CA-11…CA-14, CA-22, CA-23, CA-27 — Depende: T-80, T-102, T-103 — ~1 h
  Dos navegadores: lista, cerrar una, cerrar las demás, cerrar la actual, cambiar la contraseña (correcta, incorrecta
  y bloqueo); capturas a 360 y 1440 px; pedir al `ui-designer` `ui-review.md` y la corrección del README de Seguridad
  (`IDENTITY_PASSWORD_CHANGE_LOCKED`).
  Archivos: ninguno (evidencia).

- [ ] **T-105** Cierre del PR-5b y de la spec — CA: todos (trazabilidad) — Depende: T-95, T-104 — ~1 h
  Matriz CA → pruebas revisada; `specs/README.md` → 002 `En verificación`; pedir `/verify 002` (`tester`:
  `verification.md` con CA-27/CA-28 manuales y 001 CA-16, CA-26, CA-29 cerrados), `security-auditor` (`security.md`:
  diferencias de tiempo de CA-2, `deviceId` en bitácoras, CSRF de la cookie) y `/review 002`. Si PR-4 o PR-5b se
  recortaron, se hace sobre lo integrado y se marcan sus CA como «Fase 2» sin darlos por cumplidos.
  Archivos: `specs/README.md`, `specs/002-autenticacion-sesiones-y-dispositivos/tasks.md`.

## Diferidas (no forman parte de estos PR)

- **Métricas** (`nimbo_identity_logins_total`, `…_refresh_reuse_total`, `…_lockouts_total`) y alerta de reúso: 022.
- **E2E** con Playwright + axe a 360/1440 px (inicio de sesión, recuperación, Seguridad): PD-41, Fase 2.
- `docs/operations/ambientes.md` (secreto JWT de staging): al montar staging (`workflow.md` §7.2).
- «Revocar al suspender» (D-10 desde 011) y la purga de sesiones (PD-45): fuera de esta spec.
- Manual de Usuario («Iniciar sesión», «Recuperar tu contraseña», «Seguridad»): Fase 4.

## Matriz CA → tareas

| CA | Tareas | CA | Tareas |
|---|---|---|---|
| CA-1 | T-01, T-04, T-06, T-07, T-11, T-12, T-24, T-30, T-35, T-36, T-40, T-43, T-82, T-87, T-88, T-90, T-94 | CA-15 | T-04, T-30, T-42, T-49, T-75 |
| CA-2 | T-16, T-34, T-43, T-56, T-81, T-88 (+ `security.md`, T-105) | CA-16 | T-14, T-15, T-21, T-27, T-28, T-30, T-37, T-50 |
| CA-3 | T-16, T-35, T-43, T-81, T-89 | CA-17 | T-05, T-14, T-20, T-21, T-30, T-36, T-51 |
| CA-4 | T-02, T-16, T-35, T-43, T-81, T-89 | CA-18 | T-58, T-60, T-63, T-64, T-67, T-68, T-81, T-82, T-91, T-94 |
| CA-5 | T-01, T-16, T-18, T-19, T-34, T-44, T-56, T-65, T-81, T-89 | CA-19 | T-19, T-59, T-62, T-63, T-65, T-93, T-94 |
| CA-6 | T-01, T-38, T-40, T-45, T-81, T-89 | CA-20 | T-03, T-61, T-62, T-63, T-66, T-81, T-92, T-94 |
| CA-7 | T-06, T-11, T-13, T-22, T-32, T-41, T-46, T-83, T-84, T-85 | CA-21 | T-03, T-62, T-65, T-81, T-93, T-94 |
| CA-8 | T-01, T-12, T-13, T-31, T-36, T-46, T-83, T-86, T-89, T-94 | CA-22 | T-23, T-59, T-72, T-74, T-77, T-96, T-101, T-102, T-104 |
| CA-9 | T-11, T-13, T-29, T-31, T-32, T-47, T-83 | CA-23 | T-01, T-16, T-18, T-72, T-74, T-77, T-81, T-101, T-102, T-104 |
| CA-10 | T-12, T-16, T-31, T-32, T-46 | CA-24 | T-05, T-06, T-11, T-20, T-51, T-68, T-79 |
| CA-11 | T-04, T-15, T-23, T-70, T-73, T-75, T-78, T-97, T-99, T-102, T-104 | CA-25 | T-08, T-09, T-35, T-52, T-68, T-79 |
| CA-12 | T-16, T-23, T-25, T-71, T-73, T-76, T-78, T-100, T-104 | CA-26 | T-09, T-24, T-25, T-26, T-39, T-53, T-54, T-55 |
| CA-13 | T-04, T-23, T-71, T-73, T-75, T-100, T-104 | CA-27 | T-88…T-93, T-98…T-104 (componentes + jest-axe; `ui-review.md`) |
| CA-14 | T-33, T-36, T-41, T-48, T-71, T-76, T-98, T-100, T-103, T-104 | CA-28 | T-07, T-84, T-85, T-86, T-94 (manual en `verification.md`) |
| 001 CA-16 | T-43 (vía CA-3), T-89 | 001 CA-26, CA-29 | T-42, T-49 (vía CA-15) |

Sin Playwright (PD-41): CA-27 y CA-28 quedan con pruebas de componentes, revisión del `ui-designer` y evidencia manual.
Si PR-4 se recorta, quedan sin cubrir en el 30 % CA-11, CA-12, CA-13, CA-22, CA-23 y la parte «desde la lista» de CA-14
y CA-15; si se recorta PR-5b, la parte web de esos mismos CA.

Tareas por PR: PR-1 = 10 (T-01…T-10) · PR-2 = 47 (T-11…T-57) · PR-3 = 12 (T-58…T-69) · PR-4 = 11 (T-70…T-80) ·
PR-5a = 15 (T-81…T-95) · PR-5b = 10 (T-96…T-105). Total 105.

## Notas del developer

- **T-12 a T-15 y T-17**: pruebas del dominio en verde. El espía de `timingSafeEqual` usa `jest.mock` porque la exportación de Node no admite `spyOn`. (T-11 y T-16 se integraron después en `feat/002-sesiones-backend`.)

- **Desviaciones de T-29 a T-35 (aplicación, 2026-09-29)**:
  1. El correo «Cerramos una sesión por seguridad» nombra el navegador y el sistema de **quien presentó el token
     reusado**, no los del dispositivo dueño de la sesión: `ISessionRepository` no expone el agente de usuario del
     dispositivo. Corregirlo exige ampliar el puerto (propuesta para el `architect`).
  2. `SessionService.refresh` lee la cuenta con `IUserRepository.findByIdForUpdate` dentro de la transacción (no hay
     `findById` sin bloqueo); serializa además con cambios de estado de la cuenta.
  3. `TypeOrmSessionRepository.listActive` lee también los hashes de refresco, porque el puerto devuelve `Session`
     completas; nunca salen de `application`.
  4. `revokeAllExcept` revoca también sesiones vencidas aún no revocadas (sin efecto visible: ya no renuevan).
- **T-36**: `readCookie` acepta base64url **y el punto**: el valor de `nimbo_rt` es `<sid>.<secreto>` (DT-1). La
  forma exacta la validan `RefreshToken.parse` y `OpaqueToken.isWellFormed`.
- **T-36/T-43, `nimbo_did`**: se emite solo si el navegador no traía una válida (T-43, `OpenedSession.deviceCookie`);
  el plan §6.5 dice «reemitida en cada inicio de sesión y verificación». Se siguió la tarea; si se quiere renovar los
  365 d en cada inicio, basta con escribirla siempre desde el controlador (propuesta).
- **T-38**: `IdentityRateLimitScope` gana `'ip_login'` y `IdentityTooManyRequestsError` elige el texto por ámbito
  (DT-20). El registro sigue con `'ip'` (sin tocar 001).
- **T-39**: `IdentityModule.forRoot(env)` pide `WEB_PUBLIC_URL`, `APP_ENV` y `JWT_ACCESS_SECRET`
  (`IdentityEnv`). Las suites que componen `IdentityModule` (`createIdentityTestApp`, `mail-degradation`) pasan a
  `accessTokenStrategy: 'identity'`; `createIdentityTestApp` acepta `identityEnv` y `modules`.
- **T-42**: `VerifyEmailResult` `VERIFIED` trae `user` (la `ClientUser` ya verificada) para abrir la sesión sin
  releer la cuenta; tres pruebas de 001 pasan de `toEqual({ status: 'verified' })` a `toMatchObject` porque la
  respuesta ahora puede traer `session`.
- **T-53/T-54**: los dobles de 003 (`TestAccessTokens`, `TestAccessTokenVerifier`) pasan al *claim* `rol` (commit
  `fix(shared) … [003]`), así la misma fábrica sirve para el verificador real con la clave de pruebas. El tramo HTTP
  corre con la `JwtStrategy` real y la ruta sonda (sin `TestJwtStrategy`). Queda pendiente la parte de T-54 sobre
  apps que componen `AppModule`: hoy ninguna suite lo hace.
- **PR-2 sobre `main` con 003-PR-A/B/C** (2026-09-29): historia lineal sobre PR-1 sin los commits de la copia de
  003-PR-A (ya en `main`). `RefreshToken` queda como clase (`issue`/`parse`, `value`, `secretHash`); el commit que lo
  traía como objeto con `ParsedRefreshToken` quedó vacío y no se conserva. Con 003-PR-B: `ITransactionRunner` gana
  `withActor`, y `RecordingTransactionRunner` lo implementa rechazando (las sesiones usan `run`: `sesion` y
  `dispositivo` no tienen RLS y sus repositorios filtran siempre por `usuario_id` en el `WHERE`). Los repositorios de
  sesión y dispositivo pasan sus pruebas de integración conectados como `nimbo_app`.
- **Pendientes de PR-2**: T-49…T-52, T-55 (depende de 003-PR-D), T-56 y T-57 (README ya actualizado con sesiones y
  cookies; faltan DF-56, DF-57 y PD-45 con el `architect`).
- **T-55 depende de 003-PR-D**, no solo de 003-PR-A: `isolation-world.ts` nace en 003-PR-D (plan 003 §6.7 y §6.12),
  mientras que el plan 002 pone «tokens reales en el arnés de aislamiento» en 002-PR-2, que solo espera a 003-PR-A. Si
  002-PR-2 se integra antes que 003-PR-D, T-55 pasa a 003-PR-D (quien integre segundo hace el cambio) y T-78 espera a
  ambos. Confirmar con el dueño de 003.
- **Fábrica de tokens para la suite de contrato (T-53)**: la suite de 003 recibe una fábrica de tokens; el plan 002 no
  dice si reutiliza `TestAccessTokens` de 003 o si 002 aporta una propia con `JwtService`. «Sin archivo de contrato
  propio» se interpreta como: 002 no escribe casos, solo un archivo que **invoca** la suite de 003.
- **`AccountSuspendedError` y `SUPPORT_CONTACT_EMAIL` (T-16)**: el dominio no importa `contracts`, así que el correo
  llega por constructor desde `AuthService`. Alternativa equivalente: armar el mensaje en la aplicación.
- **Ámbitos del *throttler* (T-38)**: 001 usa `scope: 'ip'` para `register-ip`; el plan 002 §7 nombra `'ip_login'` para
  `login-ip`. Se conserva `'ip'` para el registro para no tocar 001.
- **Marcador `/archivos` (T-87)**: el plan 002 dice «solo si 006 no la creó» y el plan 003 dice que la página es de
  005; T-87 solo crea el marcador si la ruta no existe, sea de quien sea.
- **T-06 y los privilegios de `nimbo_app`** (2026-09-29, rebase sobre `main` con 003-PR-A/B/C): la migración de roles
  de 003 (`20260928110000`) ya está en `main` y sus privilegios por defecto dan `SELECT/INSERT/UPDATE/DELETE` a
  `nimbo_app` en `dispositivo` y `sesion` (002 no revoca nada: la app borra sesiones y dispositivos). El caso de T-06
  dejó de ser `it.todo`, y `shapeOf` compara también esos permisos antes y después de `down`/`up`. Las pruebas de
  esquema de 002 se conectan como el dueño (`DATABASE_MIGRATION_URL`), igual que `schema.int-spec.ts` de 003-PR-B:
  borran un `usuario` para la cascada y revierten migraciones, y `nimbo_app` no tiene `DELETE` en `usuario` ni `CREATE`.
- **PR-1 (T-01…T-10), desviaciones menores** (2026-09-29):
  - T-02: las pruebas de `IDENTITY_ERROR_CODES` y `FIELD_ISSUE_REASONS` pasan de `constants.spec.ts` a
    `error-codes.spec.ts`. La prueba de `api` `identity-validation.spec.ts` compara ahora un subconjunto
    (`toMatchObject`): las clases de los códigos nuevos llegan con T-16. `SUPPORT_CONTACT_EMAIL` =
    `amatultab@gmail.com` (001 plan §6.13); `terms-v1.tsx` y `privacy-v1.tsx` siguen con el correo escrito: pasarlos a
    la constante queda para la web (PR-5a).
  - T-03: `password` de `loginRequestSchema` y `currentPassword` de `changePasswordRequestSchema` vacíos dan
    `REQUIRED`. `newPassword` no aplica la política en el esquema: la aplica el servicio con el correo (así el error es
    `IDENTITY_WEAK_PASSWORD`, no `IDENTITY_INVALID_INPUT`).
  - T-04: `role` se valida con `roleSchema` de `packages/contracts/src/shared` (003-PR-A, ya en `main`: `ROLES`,
    `roleSchema`, `RoleName`). La copia idéntica que traía PR-1 se quedó en una sola al rebasar sobre `main`. Se
    agregan `SESSION_LIST_MAX_ITEMS = 50` (DT-13) en `parameters.ts` y `DEVICE_KINDS`.
  - T-05/T-06: las filas de prueba de `usuario` salen a `test/int/identity/identity-rows.ts` (las usa también
    `schema.int-spec.ts`). `run → revert → run` se prueba con `up`/`down` de las clases dentro de una transacción y
    además se comprobó con el CLI (`migrate.ts run → revert → revert → run`) sobre un Postgres desechable.
  - T-07: la prueba vive en `test/int/shared/configure-http-app.int-spec.ts`, donde ya estaban las de CORS de 001
    (se actualizan «sin credenciales» y `GET,POST`). CORS se configura con un *delegate*: un origen no listado no
    recibe **ninguna** cabecera CORS (con la lista estática, el paquete `cors` escribía igualmente
    `Access-Control-Allow-Credentials`).
  - T-09: el valor de desarrollo es `LOCAL_JWT_ACCESS_SECRET` en `env.schema.ts` y una prueba exige que coincida con
    `.env.example`. Se agregó la variable a los entornos de prueba (`load-env.spec.ts`, `minio-config.module.spec.ts`,
    `global-setup.ts`, `bootstrap.int-spec.ts`).
